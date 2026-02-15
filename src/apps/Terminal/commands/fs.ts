/**
 * File‑system shell commands:
 *   ls, cd, pwd, cat, touch, mkdir, rm, cp, mv, tree
 */

import type { FileSystemProvider, FileEntry } from '@/shared/types';
import { expandGlob } from '../parser';

export interface ShellContext {
  cwd: string;
  setCwd: (p: string) => void;
  fs: FileSystemProvider;
  env: Record<string, string>;
}

type CmdFn = (args: string[], ctx: ShellContext, stdin?: string) => Promise<string>;

/* ── path helpers ────────────────────────────────────────── */

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const mon = d.toLocaleString('en', { month: 'short' });
  const day = String(d.getDate()).padStart(2, ' ');
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${mon} ${day} ${time}`;
}

/* ── commands ────────────────────────────────────────────── */

const ls: CmdFn = async (args, ctx) => {
  let longFormat = false;
  let showHidden = false;
  const paths: string[] = [];

  for (const a of args) {
    if (a === '-l') longFormat = true;
    else if (a === '-a') showHidden = true;
    else if (a === '-la' || a === '-al') { longFormat = true; showHidden = true; }
    else paths.push(a);
  }

  const target = paths.length ? resolve(ctx.cwd, paths[0]) : ctx.cwd;
  let entries: FileEntry[];
  try {
    entries = await ctx.fs.list(target);
  } catch {
    return `ls: cannot access '${paths[0] || '.'}': No such file or directory`;
  }

  // glob expansion for patterns like *.txt
  if (paths.length && paths[0].includes('*')) {
    const dirEntries = await ctx.fs.list(ctx.cwd);
    const names = dirEntries.map(e => e.name);
    const matched = expandGlob(paths[0], names);
    entries = dirEntries.filter(e => matched.includes(e.name));
  }

  if (!showHidden) entries = entries.filter(e => !e.name.startsWith('.'));
  entries.sort((a, b) => a.name.localeCompare(b.name));

  if (longFormat) {
    const lines = entries.map(e => {
      const type = e.isDirectory ? 'd' : '-';
      const size = formatSize(e.size).padStart(6);
      const date = formatDate(e.modifiedAt);
      const name = e.isDirectory ? `\x1b[1;34m${e.name}\x1b[0m` : e.name;
      return `${type}rwxr-xr-x  ${size}  ${date}  ${name}`;
    });
    return lines.join('\n');
  }

  return entries
    .map(e => e.isDirectory ? `\x1b[1;34m${e.name}\x1b[0m` : e.name)
    .join('  ');
};

const cd: CmdFn = async (args, ctx) => {
  const target = args[0] ? resolve(ctx.cwd, args[0]) : '/home';
  const exists = await ctx.fs.exists(target);
  if (!exists) return `cd: ${args[0]}: No such file or directory`;
  ctx.setCwd(target);
  return '';
};

const pwd: CmdFn = async (_args, ctx) => ctx.cwd;

const cat: CmdFn = async (args, ctx) => {
  if (!args[0]) return 'cat: missing operand';
  const path = resolve(ctx.cwd, args[0]);
  try {
    const content = await ctx.fs.read(path);
    return typeof content === 'string' ? content : '[binary data]';
  } catch {
    return `cat: ${args[0]}: No such file or directory`;
  }
};

const touch: CmdFn = async (args, ctx) => {
  if (!args[0]) return 'touch: missing operand';
  const path = resolve(ctx.cwd, args[0]);
  try {
    const exists = await ctx.fs.exists(path);
    if (!exists) await ctx.fs.write(path, '');
  } catch { /* ignore */ }
  return '';
};

const mkdir: CmdFn = async (args, ctx) => {
  let parents = false;
  const dirs: string[] = [];
  for (const a of args) {
    if (a === '-p') parents = true;
    else dirs.push(a);
  }
  if (!dirs.length) return 'mkdir: missing operand';

  for (const d of dirs) {
    const path = resolve(ctx.cwd, d);
    if (parents) {
      // create each segment
      const segs = path.split('/').filter(Boolean);
      let cur = '';
      for (const s of segs) {
        cur += '/' + s;
        const exists = await ctx.fs.exists(cur);
        if (!exists) await ctx.fs.mkdir(cur);
      }
    } else {
      try { await ctx.fs.mkdir(path); }
      catch { return `mkdir: cannot create directory '${d}'`; }
    }
  }
  return '';
};

const rm: CmdFn = async (args, ctx) => {
  let recursive = false;
  const paths: string[] = [];
  for (const a of args) {
    if (a === '-r' || a === '-rf' || a === '-fr') recursive = true;
    else paths.push(a);
  }
  if (!paths.length) return 'rm: missing operand';
  for (const p of paths) {
    const path = resolve(ctx.cwd, p);
    try {
      const entries = await ctx.fs.list(path).catch(() => null);
      if (entries && !recursive) return `rm: cannot remove '${p}': Is a directory`;
      await ctx.fs.delete(path);
    } catch {
      return `rm: cannot remove '${p}': No such file or directory`;
    }
  }
  return '';
};

const cp: CmdFn = async (args, ctx) => {
  if (args.length < 2) return 'cp: missing destination';
  const src = resolve(ctx.cwd, args[0]);
  const dest = resolve(ctx.cwd, args[1]);
  try {
    const content = await ctx.fs.read(src);
    await ctx.fs.write(dest, content);
  } catch {
    return `cp: cannot copy '${args[0]}' to '${args[1]}'`;
  }
  return '';
};

const mv: CmdFn = async (args, ctx) => {
  if (args.length < 2) return 'mv: missing destination';
  const src = resolve(ctx.cwd, args[0]);
  const dest = resolve(ctx.cwd, args[1]);
  try {
    await ctx.fs.move(src, dest);
  } catch {
    return `mv: cannot move '${args[0]}' to '${args[1]}'`;
  }
  return '';
};

const tree: CmdFn = async (args, ctx) => {
  const target = args[0] ? resolve(ctx.cwd, args[0]) : ctx.cwd;
  const lines: string[] = [];

  async function walk(dir: string, prefix: string, depth: number) {
    if (depth > 3) return;
    let entries: FileEntry[];
    try { entries = await ctx.fs.list(dir); }
    catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const isLast = i === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const name = e.isDirectory ? `\x1b[1;34m${e.name}\x1b[0m` : e.name;
      lines.push(prefix + connector + name);
      if (e.isDirectory) {
        await walk(e.path, prefix + (isLast ? '    ' : '│   '), depth + 1);
      }
    }
  }

  lines.push(`\x1b[1;34m${target.split('/').pop() || '/'}\x1b[0m`);
  await walk(target, '', 0);
  return lines.join('\n');
};

/* ── registry ────────────────────────────────────────────── */

export const fsCommands: Record<string, CmdFn> = {
  ls, cd, pwd, cat, touch, mkdir, rm, cp, mv, tree,
};
