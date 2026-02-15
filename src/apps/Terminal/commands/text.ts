/**
 * Text‑processing shell commands:
 *   head, tail, wc, grep, find, echo
 */

import type { ShellContext } from './fs';
import type { FileEntry } from '@/shared/types';

type CmdFn = (args: string[], ctx: ShellContext, stdin?: string) => Promise<string>;

/* ── path helper ─────────────────────────────────────────── */

function resolve(cwd: string, p: string): string {
  if (p.startsWith('/')) return normalise(p);
  if (p === '~' || p.startsWith('~/')) return normalise('/home' + p.slice(1));
  return normalise(cwd + '/' + p);
}

function normalise(p: string): string {
  const parts = p.split('/').filter(Boolean);
  const stack: string[] = [];
  for (const s of parts) {
    if (s === '..') stack.pop();
    else if (s !== '.') stack.push(s);
  }
  return '/' + stack.join('/');
}

/* ── commands ────────────────────────────────────────────── */

const head: CmdFn = async (args, ctx, stdin) => {
  let n = 10;
  let file: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-n' && args[i + 1]) { n = parseInt(args[i + 1]); i++; }
    else file = args[i];
  }
  let text: string;
  if (stdin) {
    text = stdin;
  } else if (file) {
    try { text = (await ctx.fs.read(resolve(ctx.cwd, file))) as string; }
    catch { return `head: ${file}: No such file or directory`; }
  } else {
    return 'head: missing operand';
  }
  return text.split('\n').slice(0, n).join('\n');
};

const tail: CmdFn = async (args, ctx, stdin) => {
  let n = 10;
  let file: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-n' && args[i + 1]) { n = parseInt(args[i + 1]); i++; }
    else file = args[i];
  }
  let text: string;
  if (stdin) {
    text = stdin;
  } else if (file) {
    try { text = (await ctx.fs.read(resolve(ctx.cwd, file))) as string; }
    catch { return `tail: ${file}: No such file or directory`; }
  } else {
    return 'tail: missing operand';
  }
  const lines = text.split('\n');
  return lines.slice(Math.max(0, lines.length - n)).join('\n');
};

const wc: CmdFn = async (args, ctx, stdin) => {
  let text: string;
  const file = args[0];
  if (stdin) {
    text = stdin;
  } else if (file) {
    try { text = (await ctx.fs.read(resolve(ctx.cwd, file))) as string; }
    catch { return `wc: ${file}: No such file or directory`; }
  } else {
    return 'wc: missing operand';
  }
  const lines = text.split('\n').length;
  const words = text.split(/\s+/).filter(Boolean).length;
  const chars = text.length;
  const label = file || '';
  return `  ${lines}  ${words}  ${chars} ${label}`.trimEnd();
};

const grep: CmdFn = async (args, ctx, stdin) => {
  if (args.length < 1) return 'grep: missing pattern';
  const pattern = args[0];
  let text: string;
  const file = args[1];
  if (stdin) {
    text = stdin;
  } else if (file) {
    try { text = (await ctx.fs.read(resolve(ctx.cwd, file))) as string; }
    catch { return `grep: ${file}: No such file or directory`; }
  } else {
    return 'grep: missing file operand';
  }
  const re = new RegExp(pattern, 'gi');
  return text
    .split('\n')
    .filter(l => re.test(l))
    .map(l => l.replace(re, (m) => `\x1b[1;31m${m}\x1b[0m`))
    .join('\n');
};

const find: CmdFn = async (args, ctx) => {
  let searchPath = ctx.cwd;
  let namePattern = '*';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-name' && args[i + 1]) { namePattern = args[i + 1]; i++; }
    else searchPath = resolve(ctx.cwd, args[i]);
  }
  const re = new RegExp(
    '^' + namePattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
  );
  const results: string[] = [];

  async function walk(dir: string) {
    let entries: FileEntry[];
    try { entries = await ctx.fs.list(dir); } catch { return; }
    for (const e of entries) {
      if (re.test(e.name)) results.push(e.path);
      if (e.isDirectory && results.length < 200) await walk(e.path);
    }
  }
  await walk(searchPath);
  return results.join('\n');
};

const echo: CmdFn = async (args) => {
  // $VAR expansion is already handled by the parser
  return args.join(' ');
};

/* ── registry ────────────────────────────────────────────── */

export const textCommands: Record<string, CmdFn> = {
  head, tail, wc, grep, find, echo,
};
