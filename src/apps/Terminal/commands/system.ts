/**
 * System shell commands:
 *   clear, history, alias, unalias, export, env, whoami, date, help
 */

import type { ShellContext } from './fs';
import type { CommandHistory } from '../history';

export interface SystemContext {
  shellCtx: ShellContext;
  history: CommandHistory;
  aliases: Record<string, string>;
  clearScreen: () => void;
  username: string;
}

type CmdFn = (args: string[], sys: SystemContext, stdin?: string) => Promise<string>;

/* ── commands ────────────────────────────────────────────── */

const clear: CmdFn = async (_args, sys) => {
  sys.clearScreen();
  return '';
};

const history: CmdFn = async (_args, sys) => {
  return sys.history
    .getAll()
    .map((cmd, i) => `  ${String(i + 1).padStart(4)}  ${cmd}`)
    .join('\n');
};

const alias: CmdFn = async (args, sys) => {
  if (!args.length) {
    return Object.entries(sys.aliases)
      .map(([k, v]) => `alias ${k}='${v}'`)
      .join('\n');
  }
  for (const a of args) {
    const eq = a.indexOf('=');
    if (eq === -1) {
      const val = sys.aliases[a];
      if (val) return `alias ${a}='${val}'`;
      return `alias: ${a}: not found`;
    }
    const key = a.slice(0, eq);
    const val = a.slice(eq + 1).replace(/^['"]|['"]$/g, '');
    sys.aliases[key] = val;
  }
  return '';
};

const unalias: CmdFn = async (args, sys) => {
  for (const a of args) delete sys.aliases[a];
  return '';
};

const exportCmd: CmdFn = async (args, sys) => {
  for (const a of args) {
    const eq = a.indexOf('=');
    if (eq === -1) continue;
    sys.shellCtx.env[a.slice(0, eq)] = a.slice(eq + 1);
  }
  return '';
};

const env: CmdFn = async (_args, sys) => {
  return Object.entries(sys.shellCtx.env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
};

const whoami: CmdFn = async (_args, sys) => sys.username;

const date: CmdFn = async () => new Date().toString();

/* ── help ─────────────────────────────────────────────────── */

const HELP_TEXT: Record<string, string> = {
  ls: 'ls [-l] [-a] [path]          List directory contents',
  cd: 'cd [path]                    Change directory',
  pwd: 'pwd                          Print working directory',
  cat: 'cat <file>                   Print file contents',
  touch: 'touch <file>                 Create empty file',
  mkdir: 'mkdir [-p] <dir>             Create directory',
  rm: 'rm [-r] <path>               Remove file or directory',
  cp: 'cp <src> <dest>              Copy file',
  mv: 'mv <src> <dest>              Move / rename',
  tree: 'tree [path]                  Show directory tree',
  head: 'head [-n N] <file>           Show first N lines',
  tail: 'tail [-n N] <file>           Show last N lines',
  wc: 'wc <file>                    Word / line / char count',
  grep: 'grep <pattern> <file>        Search file contents',
  find: 'find [path] -name <pattern>  Search by filename',
  echo: 'echo <text>                  Print text',
  clear: 'clear                        Clear terminal',
  history: 'history                      Show command history',
  alias: 'alias [name=value]           Create command alias',
  unalias: 'unalias <name>               Remove alias',
  export: 'export KEY=VALUE             Set environment variable',
  env: 'env                          List environment variables',
  whoami: 'whoami                       Print current username',
  date: 'date                         Print current date/time',
  help: 'help [command]               Show help',
  ps: 'ps                           List running processes',
  theme: 'theme <name>                 Switch OS theme',
  edit: 'edit <file>                  Open file in text editor',
  nano: 'nano <file>                  Open file in text editor (alias)',
  ssh: 'ssh [user@]host              Connect to remote host',
  ping: 'ping [-c N] <host>           Send ICMP echo requests',
};

const help: CmdFn = async (args) => {
  if (args[0] && HELP_TEXT[args[0]]) {
    return HELP_TEXT[args[0]];
  }
  if (args[0]) return `help: no help for '${args[0]}'`;
  const header = '\x1b[1mJuniOS Shell — Built-in Commands\x1b[0m\n';
  return header + Object.values(HELP_TEXT).join('\n');
};

/* ── registry ────────────────────────────────────────────── */

export const systemCommands: Record<string, CmdFn> = {
  clear, history, alias, unalias, export: exportCmd, env, whoami, date, help,
};
