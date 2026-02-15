/**
 * SSH Session – Simulated SSH client for JuniOS Terminal
 *
 * Provides a simulated SSH connection to predefined remote hosts.
 * Features:
 *  - Connection animation with key exchange simulation
 *  - Remote shell with its own prompt, file system, and commands
 *  - exit/logout to disconnect
 *  - Ctrl+D to close connection
 */

/* ── ANSI helpers ────────────────────────────────────────── */
const ESC = '\x1b';
const CSI = ESC + '[';
const BOLD = CSI + '1m';
const RESET = CSI + '0m';
const YELLOW = CSI + '33m';
const CYAN = CSI + '36m';
const DIM = CSI + '2m';

/* ── Remote host definitions ─────────────────────────────── */

interface RemoteHost {
  hostname: string;
  motd: string;
  os: string;
  files: Record<string, string | Record<string, string>>;
}

const HOSTS: Record<string, RemoteHost> = {
  'dev.junios.io': {
    hostname: 'dev',
    motd: `Welcome to JuniOS Dev Server (Ubuntu 24.04 LTS)
Last login: ${new Date(Date.now() - 86400000).toUTCString()}
 * System load:  0.42           * Users logged in: 3
 * Memory usage: 34%            * Swap usage:      0%
 * Disk usage:   28% of 100GB`,
    os: 'Ubuntu 24.04 LTS',
    files: {
      '/home': {
        'README.md': '# Dev Server\nThis is the JuniOS development server.\nUse `make build` to compile the project.',
        'deploy.sh': '#!/bin/bash\necho "Deploying to production..."\nnpm run build\nrsync -avz ./dist/ prod:/var/www/',
        '.env': 'NODE_ENV=development\nPORT=3000\nDB_HOST=localhost',
      },
      '/var/log': {
        'syslog': '[INFO] System started\n[INFO] SSH service running on port 22\n[WARN] 3 failed login attempts from 10.0.0.55',
        'auth.log': `${new Date().toISOString()} sshd: Accepted publickey for user\n${new Date().toISOString()} systemd-logind: New session created`,
      },
    },
  },
  'db.junios.io': {
    hostname: 'db',
    motd: `Welcome to JuniOS Database Server (Debian 12)
PostgreSQL 16.1 running on port 5432
 * Active connections: 12
 * Database size:      2.4 GB
 * Replication:        streaming (sync)`,
    os: 'Debian 12',
    files: {
      '/home': {
        'backup.sh': '#!/bin/bash\npg_dump -U postgres main_db > /backups/$(date +%Y%m%d).sql\necho "Backup complete"',
        'queries.sql': 'SELECT count(*) FROM users;\nSELECT * FROM sessions WHERE active = true;\nVACUUM ANALYZE;',
      },
      '/etc': {
        'postgresql.conf': 'max_connections = 100\nshared_buffers = 256MB\nwal_level = replica',
        'hostname': 'db.junios.io',
      },
    },
  },
  'web.junios.io': {
    hostname: 'web',
    motd: `Welcome to JuniOS Web Server (Alpine 3.19)
nginx/1.25.3 running
 * Uptime:       42 days
 * Requests/sec: 1,247
 * Active conns: 89`,
    os: 'Alpine Linux 3.19',
    files: {
      '/home': {
        'nginx.conf': 'server {\n  listen 80;\n  server_name junios.io;\n  root /var/www/html;\n  index index.html;\n}',
        'ssl-renew.sh': '#!/bin/bash\ncertbot renew --quiet\nnginx -s reload',
      },
      '/var/www/html': {
        'index.html': '<!DOCTYPE html>\n<html><head><title>JuniOS</title></head>\n<body><h1>Welcome to JuniOS</h1></body></html>',
      },
    },
  },
  'localhost': {
    hostname: 'localhost',
    motd: `JuniOS Loopback Connection
You are connected to your own machine.`,
    os: 'JuniOS',
    files: {
      '/home': {
        'hello.txt': 'Hello from localhost!',
      },
    },
  },
};

/* ── Host aliases (IPs and short names) ──────────────────── */

const HOST_ALIASES: Record<string, string> = {
  // IPs
  '10.0.1.10': 'dev.junios.io',
  '192.168.1.10': 'dev.junios.io',
  '192.168.1.100': 'dev.junios.io',
  '10.0.1.20': 'db.junios.io',
  '192.168.1.20': 'db.junios.io',
  '10.0.1.30': 'web.junios.io',
  '192.168.1.30': 'web.junios.io',
  '127.0.0.1': 'localhost',
  '::1': 'localhost',
  // Short names
  'dev': 'dev.junios.io',
  'db': 'db.junios.io',
  'web': 'web.junios.io',
};

/* ── SSH Session class ───────────────────────────────────── */

export class SshSession {
  private write: (data: string) => void;
  private onExit: () => void;
  private host: RemoteHost;
  private user: string;
  private remoteHost: string;
  private cwd = '/home';
  private line = '';
  private cursorPos = 0;
  private connected = false;
  private commandHistory: string[] = [];
  private historyIdx = -1;

  constructor(
    write: (data: string) => void,
    onExit: () => void,
    host: RemoteHost,
    user: string,
    remoteHost: string,
  ) {
    this.write = write;
    this.onExit = onExit;
    this.host = host;
    this.user = user;
    this.remoteHost = remoteHost;
  }

  /** Start the SSH connection animation, then show the remote prompt. */
  async connect(): Promise<void> {
    // Connection animation
    this.write(`${DIM}OpenSSH_9.6p1, OpenSSL 3.2.0${RESET}\r\n`);
    await this.delay(200);
    this.write(`${DIM}Connecting to ${this.remoteHost}:22...${RESET}\r\n`);
    await this.delay(400);
    this.write(`${DIM}Performing key exchange: curve25519-sha256${RESET}\r\n`);
    await this.delay(300);
    this.write(`${DIM}Host key fingerprint: SHA256:${this.randomFingerprint()}${RESET}\r\n`);
    await this.delay(200);
    this.write(`${DIM}Authentication successful (publickey).${RESET}\r\n`);
    await this.delay(150);
    this.write('\r\n');

    // MOTD
    this.write(`${this.host.motd}\r\n`);
    this.write('\r\n');

    this.connected = true;
    this.printPrompt();
  }

  /** Handle raw terminal input data. */
  async handleInput(data: string): Promise<void> {
    if (!this.connected) return;

    // Escape sequences
    if (data === '\x1b[A') { this.handleArrowUp(); return; }
    if (data === '\x1b[B') { this.handleArrowDown(); return; }
    if (data === '\x1b[C') { this.handleArrowRight(); return; }
    if (data === '\x1b[D') { this.handleArrowLeft(); return; }

    // Ctrl+D — disconnect
    if (data === '\x04') {
      this.disconnect();
      return;
    }

    // Ctrl+C — cancel line
    if (data === '\x03') {
      this.write('^C\r\n');
      this.line = '';
      this.cursorPos = 0;
      this.printPrompt();
      return;
    }

    // Enter
    if (data === '\r') {
      this.write('\r\n');
      const input = this.line.trim();
      this.line = '';
      this.cursorPos = 0;
      if (input) {
        this.commandHistory.push(input);
        this.historyIdx = this.commandHistory.length;
        await this.executeRemote(input);
      }
      if (this.connected) this.printPrompt();
      return;
    }

    // Backspace
    if (data === '\x7f' || data === '\b') {
      if (this.cursorPos > 0) {
        this.line = this.line.slice(0, this.cursorPos - 1) + this.line.slice(this.cursorPos);
        this.cursorPos--;
        this.redrawLine();
      }
      return;
    }

    // Printable characters
    for (const ch of data) {
      if (ch.charCodeAt(0) >= 32) {
        this.line = this.line.slice(0, this.cursorPos) + ch + this.line.slice(this.cursorPos);
        this.cursorPos++;
        this.redrawLine();
      }
    }
  }

  private handleArrowUp(): void {
    if (this.commandHistory.length === 0) return;
    if (this.historyIdx > 0) this.historyIdx--;
    this.line = this.commandHistory[this.historyIdx] ?? '';
    this.cursorPos = this.line.length;
    this.redrawLine();
  }

  private handleArrowDown(): void {
    if (this.historyIdx < this.commandHistory.length - 1) {
      this.historyIdx++;
      this.line = this.commandHistory[this.historyIdx] ?? '';
    } else {
      this.historyIdx = this.commandHistory.length;
      this.line = '';
    }
    this.cursorPos = this.line.length;
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

  private redrawLine(): void {
    this.write('\r' + CSI + 'K');
    this.printPromptText();
    this.write(this.line);
    // Move cursor to correct position
    const offset = this.line.length - this.cursorPos;
    if (offset > 0) {
      this.write(CSI + offset + 'D');
    }
  }

  private printPrompt(): void {
    this.printPromptText();
  }

  private printPromptText(): void {
    const path = this.cwd === '/home' ? '~' : this.cwd;
    this.write(`${BOLD}${CYAN}${this.user}@${this.host.hostname}${RESET}:${BOLD}${YELLOW}${path}${RESET}$ `);
  }

  /** Execute a command on the "remote" host. */
  private async executeRemote(input: string): Promise<void> {
    const parts = input.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    switch (cmd) {
      case 'exit':
      case 'logout':
        this.disconnect();
        return;

      case 'pwd':
        this.writeOut(this.cwd);
        return;

      case 'whoami':
        this.writeOut(this.user);
        return;

      case 'hostname':
        this.writeOut(this.remoteHost);
        return;

      case 'uname':
        if (args.includes('-a')) {
          this.writeOut(`Linux ${this.host.hostname} 6.1.0 #1 SMP ${this.host.os} x86_64`);
        } else {
          this.writeOut('Linux');
        }
        return;

      case 'uptime':
        this.writeOut(` ${new Date().toTimeString().split(' ')[0]} up 42 days, 3:14, 1 user, load average: 0.42, 0.38, 0.35`);
        return;

      case 'date':
        this.writeOut(new Date().toString());
        return;

      case 'echo':
        this.writeOut(args.join(' '));
        return;

      case 'id':
        this.writeOut(`uid=1000(${this.user}) gid=1000(${this.user}) groups=1000(${this.user}),27(sudo)`);
        return;

      case 'clear':
        this.write(CSI + '2J' + CSI + 'H');
        return;

      case 'ls': {
        const target = this.resolvePath(args[0] || '.');
        const dir = this.host.files[target];
        if (dir && typeof dir === 'object') {
          const entries = Object.keys(dir);
          if (args.includes('-l')) {
            for (const name of entries) {
              const content = dir[name];
              const size = typeof content === 'string' ? content.length : 0;
              this.writeOut(`-rw-r--r--  1 ${this.user} ${this.user}  ${String(size).padStart(5)} Feb 14 12:00 ${name}`);
            }
          } else {
            this.writeOut(entries.join('  '));
          }
        } else {
          this.writeOut(`ls: cannot access '${args[0] || '.'}': No such file or directory`);
        }
        return;
      }

      case 'cat': {
        if (!args[0]) { this.writeOut('cat: missing operand'); return; }
        const filePath = this.resolvePath(args[0]);
        const dir2 = this.host.files[this.getDir(filePath)];
        const fileName = this.getBasename(filePath);
        if (dir2 && typeof dir2 === 'object' && typeof dir2[fileName] === 'string') {
          this.writeOut(dir2[fileName]);
        } else {
          this.writeOut(`cat: ${args[0]}: No such file or directory`);
        }
        return;
      }

      case 'cd': {
        const target = args[0] || '/home';
        const resolved = this.resolvePath(target);
        if (this.host.files[resolved]) {
          this.cwd = resolved;
        } else if (target === '..') {
          const parent = this.cwd.split('/').slice(0, -1).join('/') || '/';
          this.cwd = parent;
        } else if (target === '~') {
          this.cwd = '/home';
        } else {
          this.writeOut(`cd: ${target}: No such directory`);
        }
        return;
      }

      case 'ps':
        this.writeOut(
          'PID TTY          TIME CMD\n' +
          '  1 ?        00:00:03 systemd\n' +
          ' 42 ?        00:00:01 sshd\n' +
          `${Math.floor(Math.random() * 900 + 100)} pts/0    00:00:00 bash\n` +
          `${Math.floor(Math.random() * 900 + 100)} pts/0    00:00:00 ps`
        );
        return;

      case 'df':
        this.writeOut(
          'Filesystem     1K-blocks     Used Available Use% Mounted on\n' +
          '/dev/sda1      104857600 29360128  75497472  28% /\n' +
          'tmpfs            1024000    12288   1011712   2% /tmp'
        );
        return;

      case 'free':
        this.writeOut(
          '              total        used        free      shared  buff/cache   available\n' +
          'Mem:        8192000     2785280     3145728      131072     2260992     5079040\n' +
          'Swap:       2097152           0     2097152'
        );
        return;

      case 'w':
        this.writeOut(
          ` ${new Date().toTimeString().split(' ')[0]} up 42 days, 1 user, load average: 0.42, 0.38, 0.35\n` +
          'USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT\n' +
          `${this.user.padEnd(9)}pts/0    ${this.remoteHost.padEnd(17)}${new Date().toTimeString().split(' ')[0]}    0.00s  0.01s  0.00s bash`
        );
        return;

      case 'help':
        this.writeOut(
          `${BOLD}Remote Shell Commands${RESET}\n` +
          'ls [path]        List files\n' +
          'cat <file>       Show file contents\n' +
          'cd <dir>         Change directory\n' +
          'pwd              Print working directory\n' +
          'whoami           Show current user\n' +
          'hostname         Show hostname\n' +
          'uname [-a]       System information\n' +
          'ps               Process list\n' +
          'df               Disk usage\n' +
          'free             Memory usage\n' +
          'uptime           System uptime\n' +
          'w                Who is logged in\n' +
          'id               User/group info\n' +
          'date             Current date/time\n' +
          'echo <text>      Print text\n' +
          'clear            Clear screen\n' +
          'exit / logout    Disconnect'
        );
        return;

      default:
        this.writeOut(`${cmd}: command not found`);
        return;
    }
  }

  private disconnect(): void {
    this.connected = false;
    this.write(`\r\n${DIM}Connection to ${this.remoteHost} closed.${RESET}\r\n`);
    this.onExit();
  }

  /* ── Helpers ───────────────────────────────────────────── */

  private writeOut(text: string): void {
    this.write(text.replace(/\n/g, '\r\n') + '\r\n');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private randomFingerprint(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let fp = '';
    for (let i = 0; i < 43; i++) fp += chars[Math.floor(Math.random() * chars.length)];
    return fp;
  }

  private resolvePath(p: string): string {
    if (p === '.') return this.cwd;
    if (p === '~') return '/home';
    if (p.startsWith('~/')) return '/home' + p.slice(1);
    if (p.startsWith('/')) return p;
    return this.cwd === '/' ? '/' + p : this.cwd + '/' + p;
  }

  private getDir(path: string): string {
    const i = path.lastIndexOf('/');
    return i <= 0 ? '/' : path.slice(0, i);
  }

  private getBasename(path: string): string {
    return path.split('/').pop() ?? path;
  }
}

/* ── Public: parse ssh command and attempt connection ───── */

export function parseSSHArgs(args: string[]): { user: string; host: string; port: number } | string {
  let user = 'user';
  let host = '';
  let port = 22;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-p' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '-l' && args[i + 1]) {
      user = args[i + 1];
      i++;
    } else if (arg.includes('@')) {
      const parts = arg.split('@');
      user = parts[0];
      host = parts[1];
    } else if (!arg.startsWith('-')) {
      host = arg;
    }
  }

  if (!host) {
    return 'usage: ssh [-p port] [user@]hostname';
  }

  return { user, host, port };
}

export function getRemoteHost(hostname: string): RemoteHost | null {
  const resolved = HOST_ALIASES[hostname] ?? hostname;
  return HOSTS[resolved] ?? null;
}

export function getAvailableHosts(): string[] {
  return Object.keys(HOSTS);
}
