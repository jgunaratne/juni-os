import type { FileSystemProvider } from '@/shared/types';

/**
 * Tab‑completion engine.
 * Complete command names and file/directory paths.
 */

const BUILTIN_COMMANDS = [
  'ls', 'cd', 'pwd', 'cat', 'touch', 'mkdir', 'rm', 'cp', 'mv', 'tree',
  'head', 'tail', 'wc', 'grep', 'find', 'echo',
  'clear', 'history', 'alias', 'unalias', 'export', 'env', 'whoami', 'date', 'help',
  'ps', 'theme',
];

export interface CompletionResult {
  /** fully replaced input line */
  line: string;
  /** new cursor position */
  cursor: number;
  /** all candidates (for display when multiple matches) */
  candidates: string[];
}

/**
 * Attempt to complete the current input.
 *
 * @param line   current input text
 * @param cursor current cursor column (always end‑of‑line for simplicity)
 * @param cwd    shell working directory
 * @param fs     file system provider
 */
export async function complete(
  line: string,
  cursor: number,
  cwd: string,
  fs: FileSystemProvider,
): Promise<CompletionResult | null> {
  const before = line.slice(0, cursor);
  const parts = before.split(/\s+/);

  // completing a command name (first token)
  if (parts.length <= 1) {
    return completeFromList(line, cursor, parts[0] || '', BUILTIN_COMMANDS);
  }

  // completing a path argument
  const partial = parts[parts.length - 1];
  return completePath(line, cursor, partial, cwd, fs);
}

/* ── helpers ─────────────────────────────────────────────── */

function completeFromList(
  line: string,
  cursor: number,
  prefix: string,
  list: string[],
): CompletionResult | null {
  const matches = list.filter((c) => c.startsWith(prefix));
  if (matches.length === 0) return null;
  if (matches.length === 1) {
    const completed = matches[0] + ' ';
    const newLine = line.slice(0, cursor - prefix.length) + completed + line.slice(cursor);
    return { line: newLine, cursor: cursor - prefix.length + completed.length, candidates: matches };
  }
  // common prefix
  const common = longestCommonPrefix(matches);
  if (common.length > prefix.length) {
    const newLine = line.slice(0, cursor - prefix.length) + common + line.slice(cursor);
    return { line: newLine, cursor: cursor - prefix.length + common.length, candidates: matches };
  }
  return { line, cursor, candidates: matches };
}

async function completePath(
  line: string,
  cursor: number,
  partial: string,
  cwd: string,
  fs: FileSystemProvider,
): Promise<CompletionResult | null> {
  let dir: string;
  let prefix: string;

  const lastSlash = partial.lastIndexOf('/');
  if (lastSlash === -1) {
    dir = cwd;
    prefix = partial;
  } else {
    const pathPart = partial.slice(0, lastSlash) || '/';
    dir = pathPart.startsWith('/') ? pathPart : `${cwd}/${pathPart}`;
    prefix = partial.slice(lastSlash + 1);
  }

  try {
    const entries = await fs.list(dir);
    const names = entries.map((e) => e.isDirectory ? e.name + '/' : e.name);
    return completeFromList(line, cursor, partial, names.map((n) => {
      const base = lastSlash === -1 ? '' : partial.slice(0, lastSlash + 1);
      return base + n;
    }));
  } catch {
    return null;
  }
}

function longestCommonPrefix(arr: string[]): string {
  if (arr.length === 0) return '';
  let prefix = arr[0];
  for (let i = 1; i < arr.length; i++) {
    while (!arr[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}
