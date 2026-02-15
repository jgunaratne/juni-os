const KEY = 'junios-terminal-history';
const MAX = 500;

/**
 * Persistent command history backed by localStorage.
 */
export class CommandHistory {
  private entries: string[];
  private cursor = -1;
  private draft = '';              // the in‑progress line before user pressed ↑

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      this.entries = raw ? JSON.parse(raw) : [];
    } catch {
      this.entries = [];
    }
  }

  /* ── public API ──────────────────────────────────────────── */

  push(cmd: string): void {
    if (!cmd.trim()) return;
    // de‑dup last entry
    if (this.entries[this.entries.length - 1] === cmd) return;
    this.entries.push(cmd);
    if (this.entries.length > MAX) this.entries.shift();
    this.persist();
    this.resetCursor();
  }

  /** Start a history‑navigation session with the current line. */
  startNavigation(currentLine: string): void {
    this.draft = currentLine;
    this.cursor = this.entries.length;
  }

  /** Move up in history. Returns the line to display, or null if at top. */
  up(): string | null {
    if (this.cursor <= 0) return null;
    this.cursor--;
    return this.entries[this.cursor];
  }

  /** Move down in history. Returns the line to display, or null if past end. */
  down(): string | null {
    if (this.cursor >= this.entries.length) return null;
    this.cursor++;
    return this.cursor === this.entries.length ? this.draft : this.entries[this.cursor];
  }

  resetCursor(): void {
    this.cursor = this.entries.length;
    this.draft = '';
  }

  /** Return all entries for the `history` command. */
  getAll(): string[] {
    return [...this.entries];
  }

  /* ── internal ────────────────────────────────────────────── */

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.entries));
    } catch { /* quota exceeded — ignore */ }
  }
}
