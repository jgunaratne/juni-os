/**
 * Search & replace utilities for the text editor.
 */

import type { Position } from './document';

export interface SearchMatch {
  row: number;
  col: number;
  length: number;
}

/** Find all occurrences of `query` in the document lines. */
export function findAll(lines: string[], query: string, caseSensitive = false): SearchMatch[] {
  if (!query) return [];
  const matches: SearchMatch[] = [];
  const q = caseSensitive ? query : query.toLowerCase();

  for (let row = 0; row < lines.length; row++) {
    const line = caseSensitive ? lines[row] : lines[row].toLowerCase();
    let col = 0;
    while (col < line.length) {
      const idx = line.indexOf(q, col);
      if (idx === -1) break;
      matches.push({ row, col: idx, length: query.length });
      col = idx + 1;   // allow overlapping in edge cases
    }
  }
  return matches;
}

/** Find the next match at or after the given position. Wraps around. */
export function findNext(
  matches: SearchMatch[],
  cursor: Position,
): SearchMatch | null {
  if (matches.length === 0) return null;
  for (const m of matches) {
    if (m.row > cursor.row || (m.row === cursor.row && m.col >= cursor.col)) {
      return m;
    }
  }
  return matches[0];   // wrap
}

/** Find the previous match before the given position. Wraps around. */
export function findPrev(
  matches: SearchMatch[],
  cursor: Position,
): SearchMatch | null {
  if (matches.length === 0) return null;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    if (m.row < cursor.row || (m.row === cursor.row && m.col < cursor.col)) {
      return m;
    }
  }
  return matches[matches.length - 1];   // wrap
}

/** Replace a single match in-place, returning updated lines. */
export function replaceOne(
  lines: string[],
  match: SearchMatch,
  replacement: string,
): void {
  const line = lines[match.row];
  lines[match.row] =
    line.slice(0, match.col) + replacement + line.slice(match.col + match.length);
}

/** Replace all matches (processes from end to start to preserve indices). */
export function replaceAll(
  lines: string[],
  query: string,
  replacement: string,
  caseSensitive = false,
): number {
  const matches = findAll(lines, query, caseSensitive);
  // process from last to first so indices stay valid
  for (let i = matches.length - 1; i >= 0; i--) {
    replaceOne(lines, matches[i], replacement);
  }
  return matches.length;
}
