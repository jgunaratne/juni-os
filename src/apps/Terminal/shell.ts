/**
 * JuniOS Shell Interpreter
 *
 * Manages input, line editing, command execution, history,
 * tab completion, and prompt rendering.  Operates on a
 * terminal‑like write() function — no direct xterm dependency.
 */

import { parse, expandGlob } from './parser';
import type { ParsedCommand } from './parser';
import { CommandHistory } from './history';
import { complete } from './completions';
import { fsCommands, type ShellContext } from './commands/fs';
import { textCommands } from './commands/text';
import { systemCommands, type SystemContext } from './commands/system';
import { appsCommands, type AppsContext } from './commands/apps';
import { Editor } from './editor/editor';
import { SshSession, parseSSHArgs, getRemoteHost, getAvailableHosts } from './ssh';
import type { FileSystemProvider, Process } from '@/shared/types';

/* ── types ───────────────────────────────────────────────── */

export interface ShellDeps {
  /** write raw string to the terminal */
  write: (data: string) => void;
  /** file system provider */
  fs: FileSystemProvider;
  /** get the current username */
  getUsername: () => string;
  /** get running processes */
  getProcesses: () => Process[];
  /** switch OS theme by name; returns true if found */
  setTheme: (name: string) => boolean;
}

/* ── ANSI helpers ────────────────────────────────────────── */
const ESC = '\x1b';
const CSI = ESC + '[';
const BOLD = CSI + '1m';
const RESET = CSI + '0m';
const GREEN = CSI + '32m';
const BLUE = CSI + '1;34m';
const CYAN = CSI + '36m';

/* ── Shell class ─────────────────────────────────────────── */

export class Shell {
  /* ── state ──────────────────────────────────── */
  private cwd = '/home';
  private env: Record<string, string> = {
    HOME: '/home',
    USER: 'user',
    SHELL: '/bin/junish',
    PATH: '/usr/bin',
    TERM: 'xterm-256color',
  };
  private aliases: Record<string, string> = {};
  private history: CommandHistory;
  private line = '';
  private cursorPos = 0;
  private navigatingHistory = false;

  /* editor */
  private editor: Editor | null = null;
  /* ssh */
  private sshSession: SshSession | null = null;
  /* ping */
  private pingCancel: (() => void) | null = null;
  private rows = 24;
  private cols = 80;

  /* deps */
  private write: ShellDeps['write'];
  private fs: ShellDeps['fs'];
  private deps: ShellDeps;

  constructor(deps: ShellDeps) {
    this.deps = deps;
    this.write = deps.write;
    this.fs = deps.fs;
    this.history = new CommandHistory();
    this.env.USER = deps.getUsername();
  }

  /* ── viewport ───────────────────────────────── */

  /** Called by the React component when xterm resizes. */
  setViewport(rows: number, cols: number): void {
    this.rows = rows;
    this.cols = cols;
    if (this.editor) this.editor.resize(rows, cols);
  }

  /* ── prompt ─────────────────────────────────── */

  printPrompt(): void {
    const user = this.deps.getUsername();
    const path = this.cwd === '/home' ? '~' : this.cwd.replace('/home', '~');
    this.write(`${BOLD}${GREEN}${user}@junios${RESET}:${BOLD}${BLUE}${path}${RESET}$ `);
  }

  /* ── input handling ─────────────────────────── */

  /** Called by xterm onData — handles individual keypresses & paste. */
  async handleInput(data: string): Promise<void> {
    // If SSH session is active, forward all input to it
    if (this.sshSession) {
      await this.sshSession.handleInput(data);
      return;
    }

    // If the editor is active, forward all input to it
    if (this.editor) {
      await this.editor.handleInput(data);
      return;
    }

    // Handle escape sequences (arrow keys, etc.)
    if (data === '\x1b[A') { this.handleArrowUp(); return; }     // ↑
    if (data === '\x1b[B') { this.handleArrowDown(); return; }   // ↓
    if (data === '\x1b[C') { this.handleArrowRight(); return; }  // →
    if (data === '\x1b[D') { this.handleArrowLeft(); return; }   // ←
    if (data === '\x1b[H' || data === '\x1b[1~') { this.handleHome(); return; }
    if (data === '\x1b[F' || data === '\x1b[4~') { this.handleEnd(); return; }
    if (data === '\x1b[3~') { this.handleDelete(); return; }     // Delete key

    // Ctrl shortcuts
    if (data === '\x03') { this.handleCtrlC(); return; }         // Ctrl+C
    if (data === '\x0c') { this.handleCtrlL(); return; }         // Ctrl+L
    if (data === '\x01') { this.handleHome(); return; }          // Ctrl+A
    if (data === '\x05') { this.handleEnd(); return; }           // Ctrl+E
    if (data === '\x15') { this.handleCtrlU(); return; }         // Ctrl+U
    if (data === '\x17') { this.handleCtrlW(); return; }         // Ctrl+W

    // Tab
    if (data === '\t') { await this.handleTab(); return; }

    // Enter
    if (data === '\r') { await this.handleEnter(); return; }

    // Backspace
    if (data === '\x7f' || data === '\b') { this.handleBackspace(); return; }

    // Regular printable characters (possibly a paste of multiple chars)
    for (const ch of data) {
      if (ch.charCodeAt(0) >= 32) {
        this.insertChar(ch);
      }
    }
  }

  /* ── line editing ───────────────────────────── */

  private insertChar(ch: string): void {
    this.line = this.line.slice(0, this.cursorPos) + ch + this.line.slice(this.cursorPos);
    this.cursorPos++;
    this.redrawLine();
  }

  private handleBackspace(): void {
    if (this.cursorPos === 0) return;
    this.line = this.line.slice(0, this.cursorPos - 1) + this.line.slice(this.cursorPos);
    this.cursorPos--;
    this.redrawLine();
  }

  private handleDelete(): void {
    if (this.cursorPos >= this.line.length) return;
    this.line = this.line.slice(0, this.cursorPos) + this.line.slice(this.cursorPos + 1);
    this.redrawLine();
  }

  private handleArrowLeft(): void {
    if (this.cursorPos > 0) {
      this.cursorPos--;
      this.write(CSI + 'D');
    }
  }

  private handleArrowRight(): void {
    if (this.cursorPos < this.line.length) {
      this.cursorPos++;
      this.write(CSI + 'C');
    }
  }

  private handleHome(): void {
    while (this.cursorPos > 0) {
      this.cursorPos--;
      this.write(CSI + 'D');
    }
  }

  private handleEnd(): void {
    while (this.cursorPos < this.line.length) {
      this.cursorPos++;
      this.write(CSI + 'C');
    }
  }

  private handleCtrlC(): void {
    if (this.pingCancel) {
      this.pingCancel();
      return;
    }
    this.write('^C\r\n');
    this.line = '';
    this.cursorPos = 0;
    this.printPrompt();
  }

  private handleCtrlL(): void {
    this.write(CSI + '2J' + CSI + 'H');       // clear screen, cursor to top
    this.printPrompt();
    this.write(this.line);
    // reposition cursor
    const back = this.line.length - this.cursorPos;
    if (back > 0) this.write(CSI + back + 'D');
  }

  private handleCtrlU(): void {
    this.line = this.line.slice(this.cursorPos);
    this.cursorPos = 0;
    this.redrawLine();
  }

  private handleCtrlW(): void {
    // delete word back
    let i = this.cursorPos - 1;
    while (i >= 0 && this.line[i] === ' ') i--;
    while (i >= 0 && this.line[i] !== ' ') i--;
    i++;
    this.line = this.line.slice(0, i) + this.line.slice(this.cursorPos);
    this.cursorPos = i;
    this.redrawLine();
  }

  /* Redraw the current line from the prompt position. */
  private redrawLine(): void {
    // Hide cursor during redraw to prevent flicker
    this.write(CSI + '?25l');                 // hide cursor
    this.write('\r' + CSI + 'K');              // carriage return, erase line
    this.printPrompt();
    this.write(this.line);
    const back = this.line.length - this.cursorPos;
    if (back > 0) this.write(CSI + back + 'D');
    this.write(CSI + '?25h');                 // show cursor
  }

  /* ── history navigation ─────────────────────── */

  private handleArrowUp(): void {
    if (!this.navigatingHistory) {
      this.history.startNavigation(this.line);
      this.navigatingHistory = true;
    }
    const prev = this.history.up();
    if (prev !== null) {
      this.line = prev;
      this.cursorPos = this.line.length;
      this.redrawLine();
    }
  }

  private handleArrowDown(): void {
    if (!this.navigatingHistory) return;
    const next = this.history.down();
    if (next !== null) {
      this.line = next;
      this.cursorPos = this.line.length;
      this.redrawLine();
    }
  }

  /* ── tab completion ─────────────────────────── */

  private async handleTab(): Promise<void> {
    const result = await complete(this.line, this.cursorPos, this.cwd, this.fs);
    if (!result) return;

    if (result.candidates.length > 1) {
      // show candidates
      this.write('\r\n' + result.candidates.join('  ') + '\r\n');
    }
    this.line = result.line;
    this.cursorPos = result.cursor;

    if (result.candidates.length > 1) {
      this.printPrompt();
      this.write(this.line);
      const back = this.line.length - this.cursorPos;
      if (back > 0) this.write(CSI + back + 'D');
    } else {
      this.redrawLine();
    }
  }

  /* ── command execution ──────────────────────── */

  private async handleEnter(): Promise<void> {
    this.write('\r\n');
    const input = this.line.trim();
    this.line = '';
    this.cursorPos = 0;
    this.navigatingHistory = false;
    this.history.resetCursor();

    if (input) {
      this.history.push(input);
      await this.execute(input);
    }

    this.printPrompt();
  }

  private async execute(input: string): Promise<void> {
    const chains = parse(input, this.env);

    for (const chain of chains) {
      const ok = await this.executePipeline(chain.pipeline);
      if (chain.chainOp === '&&' && !ok) break;
    }
  }

  private async executePipeline(pipeline: { commands: ParsedCommand[] }): Promise<boolean> {
    let stdin: string | undefined;

    for (const cmd of pipeline.commands) {
      const result = await this.runCommand(cmd, stdin);
      if (result === null) return false;   // command not found / error
      stdin = result;
    }

    // write final output
    if (stdin) {
      // Handle redirect
      const last = pipeline.commands[pipeline.commands.length - 1];
      if (last.redirectFile) {
        const path = last.redirectFile.startsWith('/')
          ? last.redirectFile
          : `${this.cwd}/${last.redirectFile}`;
        try {
          if (last.redirectAppend) {
            const existing = await this.fs.read(path).catch(() => '') as string;
            await this.fs.write(path, existing + stdin);
          } else {
            await this.fs.write(path, stdin);
          }
        } catch {
          this.write(`shell: cannot write to '${last.redirectFile}'\r\n`);
          return false;
        }
      } else {
        this.writeOutput(stdin);
      }
    }
    return true;
  }

  private async runCommand(cmd: ParsedCommand, stdin?: string): Promise<string | null> {
    let argv = [...cmd.argv];
    if (argv.length === 0) return '';

    // resolve alias
    const aliased = this.aliases[argv[0]];
    if (aliased) {
      const aliasParts = aliased.split(/\s+/);
      argv = [...aliasParts, ...argv.slice(1)];
    }

    const command = argv[0];
    const args = argv.slice(1);

    // glob expansion for args
    const expandedArgs: string[] = [];
    for (const arg of args) {
      if (arg.includes('*') || arg.includes('?')) {
        try {
          const entries = await this.fs.list(this.cwd);
          const names = entries.map(e => e.name);
          const matched = expandGlob(arg, names);
          expandedArgs.push(...(matched.length > 0 ? matched : [arg]));
        } catch {
          expandedArgs.push(arg);
        }
      } else {
        expandedArgs.push(arg);
      }
    }

    // build contexts
    const shellCtx: ShellContext = {
      cwd: this.cwd,
      setCwd: (p) => { this.cwd = p; },
      fs: this.fs,
      env: this.env,
    };

    // FS commands
    if (fsCommands[command]) {
      return fsCommands[command](expandedArgs, shellCtx, stdin);
    }

    // text commands
    if (textCommands[command]) {
      return textCommands[command](expandedArgs, shellCtx, stdin);
    }

    // system commands
    if (systemCommands[command]) {
      const sysCtx: SystemContext = {
        shellCtx,
        history: this.history,
        aliases: this.aliases,
        clearScreen: () => this.write(CSI + '2J' + CSI + 'H'),
        username: this.deps.getUsername(),
      };
      return systemCommands[command](expandedArgs, sysCtx, stdin);
    }

    // app commands
    if (appsCommands[command]) {
      const appsCtx: AppsContext = {
        getProcesses: this.deps.getProcesses,
        setTheme: this.deps.setTheme,
      };
      return appsCommands[command](expandedArgs, appsCtx);
    }

    // Built-in editor
    if (command === 'edit' || command === 'nano') {
      await this.openEditor(expandedArgs);
      return '';
    }

    // SSH
    if (command === 'ssh') {
      await this.openSSH(expandedArgs);
      return '';
    }

    // Ping
    if (command === 'ping') {
      await this.runPing(expandedArgs);
      return '';
    }

    this.write(`${command}: command not found\r\n`);
    return null;
  }

  /* ── editor integration ─────────────────────── */

  private async openEditor(args: string[]): Promise<void> {
    if (args.length === 0) {
      this.write('Usage: edit <file>\r\n');
      return;
    }
    const filePath = args[0].startsWith('/')
      ? args[0]
      : `${this.cwd}/${args[0]}`;

    let content = '';
    try {
      const data = await this.fs.read(filePath);
      content = typeof data === 'string' ? data : '';
    } catch {
      // new file — start empty
      content = '';
    }

    this.editor = new Editor(
      content,
      filePath,
      this.write,
      this.fs,
      () => {
        this.editor = null;
        this.printPrompt();
      },
      this.rows,
      this.cols,
    );
    this.editor.render();
  }

  /** Open an SSH session to a simulated remote host. */
  private async openSSH(args: string[]): Promise<void> {
    const parsed = parseSSHArgs(args);
    if (typeof parsed === 'string') {
      this.write(parsed + '\r\n');
      const hosts = getAvailableHosts();
      this.write(`\r\nAvailable hosts: ${hosts.join(', ')}\r\n`);
      return;
    }

    const host = getRemoteHost(parsed.host);
    if (!host) {
      this.write(`ssh: Could not resolve hostname ${parsed.host}: Name or service not known\r\n`);
      const hosts = getAvailableHosts();
      this.write(`\r\nAvailable hosts: ${hosts.join(', ')}\r\n`);
      return;
    }

    this.sshSession = new SshSession(
      this.write,
      () => {
        this.sshSession = null;
        this.printPrompt();
      },
      host,
      parsed.user,
      parsed.host,
    );
    await this.sshSession.connect();
  }

  /** Run a simulated ping command. Stops on Ctrl+C or after -c count. */
  private runPing(args: string[]): Promise<void> {
    // Parse arguments
    let target = '';
    let count = -1; // -1 = infinite
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-c' && args[i + 1]) {
        count = parseInt(args[i + 1], 10);
        i++;
      } else if (!args[i].startsWith('-')) {
        target = args[i];
      }
    }

    if (!target) {
      this.write('ping: usage: ping [-c count] destination\r\n');
      return Promise.resolve();
    }

    // Resolve host to IP for display
    const knownIPs: Record<string, string> = {
      'dev.junios.io': '10.0.1.10',
      'db.junios.io': '10.0.1.20',
      'web.junios.io': '10.0.1.30',
      'localhost': '127.0.0.1',
      'dev': '10.0.1.10',
      'db': '10.0.1.20',
      'web': '10.0.1.30',
    };

    // Check if input is already an IP
    const isIP = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(target);
    const ip = isIP ? target : knownIPs[target];

    if (!ip) {
      this.write(`ping: ${target}: Name or service not known\r\n`);
      return Promise.resolve();
    }

    const displayHost = isIP ? target : `${target} (${ip})`;
    this.write(`PING ${displayHost}: 56 data bytes\r\n`);

    const times: number[] = [];
    let seq = 0;

    return new Promise<void>((resolve) => {
      const sendPing = () => {
        const time = (Math.random() * 15 + 5).toFixed(3); // 5–20ms
        times.push(parseFloat(time));
        seq++;
        this.write(`64 bytes from ${ip}: icmp_seq=${seq} ttl=64 time=${time} ms\r\n`);

        if (count > 0 && seq >= count) {
          printStats();
        }
      };

      const printStats = () => {
        clearInterval(interval);
        this.pingCancel = null;

        const sent = times.length;
        const min = Math.min(...times).toFixed(3);
        const max = Math.max(...times).toFixed(3);
        const avg = (times.reduce((a, b) => a + b, 0) / sent).toFixed(3);
        const stddev = Math.sqrt(
          times.reduce((sum, t) => sum + (t - parseFloat(avg)) ** 2, 0) / sent
        ).toFixed(3);

        this.write(`\r\n--- ${target} ping statistics ---\r\n`);
        this.write(`${sent} packets transmitted, ${sent} received, 0% packet loss\r\n`);
        this.write(`rtt min/avg/max/stddev = ${min}/${avg}/${max}/${stddev} ms\r\n`);
        resolve();
      };

      // Set up Ctrl+C handler
      this.pingCancel = () => {
        this.write('^C\r\n');
        printStats();
      };

      // Send first ping immediately
      sendPing();

      // Then every ~1 second
      const interval = setInterval(sendPing, 1000);
    });
  }

  /** Write output text, converting \n to \r\n for the terminal. */
  private writeOutput(text: string): void {
    if (!text) return;
    this.write(text.replace(/\n/g, '\r\n') + '\r\n');
  }

  /* ── boot message ──────────────────────────── */

  printBanner(): void {
    this.write(
      `${BOLD}${CYAN}JuniOS Terminal${RESET} v0.1.0\r\n` +
      `Type ${BOLD}help${RESET} for a list of commands.\r\n\r\n`
    );
  }
}
