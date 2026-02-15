/**
 * Main editor class — nano-like TUI rendered via ANSI escape codes.
 *
 * The editor takes over the terminal: it draws a top bar, a line-numbered
 * content area, and a bottom shortcut bar.  All input is processed locally
 * until the user quits (Ctrl+Q).
 */

import { Document } from './document';
import { findAll, findNext, replaceOne, replaceAll } from './search';
import type { SearchMatch } from './search';
import { detectLanguage, highlightLine } from './highlight';
import type { FileSystemProvider } from '@/shared/types';

/* ── ANSI helpers ────────────────────────────────────────── */

const ESC = '\x1b';
const CSI = ESC + '[';
const RESET = CSI + '0m';
const DIM = CSI + '2m';
const HIDE_CURSOR = CSI + '?25l';
const SHOW_CURSOR = CSI + '?25h';

function moveTo(row: number, col: number): string {
  return `${CSI}${row};${col}H`;
}

function clearLine(): string {
  return CSI + 'K';
}

const BG_BAR = CSI + '44m';    // blue background for bars
const FG_BAR = CSI + '97m';    // bright white text on bars
const BG_GUTTER = CSI + '100m'; // dark gray gutter
const FG_GUTTER = CSI + '37m';  // light gray gutter text
const BG_MATCH = CSI + '43m';   // yellow background for search matches
const FG_MATCH = CSI + '30m';   // black text on matches
const BG_CURRENT = CSI + '41m'; // red background for current match

/* ── Editor modes ────────────────────────────────────────── */

type Mode = 'edit' | 'find' | 'replace' | 'goto' | 'quit-confirm';

/* ── Editor class ────────────────────────────────────────── */

export class Editor {
  private doc: Document;
  private write: (data: string) => void;
  private fs: FileSystemProvider;
  private onQuit: () => void;

  private rows = 24;    // total terminal rows
  private cols = 80;     // total terminal cols
  private lang: ReturnType<typeof detectLanguage>;

  // mode & UI state
  private mode: Mode = 'edit';
  private statusMsg = '';
  private statusTimeout: ReturnType<typeof setTimeout> | null = null;

  // find/replace state
  private findQuery = '';
  private replaceQuery = '';
  private findMatches: SearchMatch[] = [];
  private findCurrent = 0;
  private findInputTarget: 'find' | 'replace' = 'find';

  // goto state
  private gotoInput = '';

  constructor(
    content: string,
    filePath: string,
    write: (data: string) => void,
    fs: FileSystemProvider,
    onQuit: () => void,
    rows: number,
    cols: number,
  ) {
    this.doc = new Document(content, filePath);
    this.write = write;
    this.fs = fs;
    this.onQuit = onQuit;
    this.rows = rows;
    this.cols = cols;
    this.lang = detectLanguage(filePath);
  }

  /* ── viewport geometry ─────────────────────── */

  /** Number of lines available for content (total - top bar - bottom bar). */
  private get contentRows(): number { return Math.max(1, this.rows - 2); }

  /** Width of the line-number gutter. */
  private get gutterWidth(): number {
    return Math.max(4, String(this.doc.lineCount).length + 1);
  }

  /* ── resize ────────────────────────────────── */

  resize(rows: number, cols: number): void {
    this.rows = rows;
    this.cols = cols;
    this.render();
  }

  /* ── rendering ─────────────────────────────── */

  render(): void {
    this.write(HIDE_CURSOR);
    this.renderTopBar();
    this.doc.ensureVisible(this.contentRows);
    this.renderContent();
    this.renderBottomBar();
    this.placeCursor();
    this.write(SHOW_CURSOR);
  }

  private renderTopBar(): void {
    this.write(moveTo(1, 1));
    const modified = this.doc.modified ? ' *' : '';
    const title = `  Edit: ${this.doc.filePath}${modified}  `;
    const pos = `Ln ${this.doc.cursor.row + 1}, Col ${this.doc.cursor.col + 1}  `;
    const fill = Math.max(0, this.cols - title.length - pos.length);
    this.write(BG_BAR + FG_BAR + title + ' '.repeat(fill) + pos + RESET + clearLine());
  }

  private renderContent(): void {
    const gw = this.gutterWidth;
    const contentWidth = this.cols - gw;
    const viewport = this.doc.getViewport(this.contentRows);

    for (let i = 0; i < this.contentRows; i++) {
      this.write(moveTo(i + 2, 1));   // row i+2 (1-indexed, after top bar)
      const lineIdx = this.doc.scroll.topLine + i;

      if (i < viewport.length) {
        const lineNum = String(lineIdx + 1).padStart(gw - 1, ' ');
        this.write(BG_GUTTER + FG_GUTTER + lineNum + ' ' + RESET);

        // apply syntax highlighting
        let lineText = viewport[i];
        const displayLine = lineText.slice(0, contentWidth);

        // if there are search matches, overlay them
        if (this.findMatches.length > 0 && this.mode === 'find' || this.mode === 'replace') {
          this.writeLineWithMatches(displayLine, lineIdx, gw);
        } else {
          this.write(highlightLine(displayLine, this.lang));
        }
      } else {
        // empty line — show tilde
        const lineNum = ' '.repeat(gw - 1) + ' ';
        this.write(BG_GUTTER + FG_GUTTER + lineNum + RESET);
        this.write(DIM + '~' + RESET);
      }
      this.write(clearLine());
    }
  }

  private writeLineWithMatches(line: string, lineIdx: number, _gw: number): void {
    const relevant = this.findMatches.filter(m => m.row === lineIdx);
    if (relevant.length === 0) {
      this.write(highlightLine(line, this.lang));
      return;
    }

    let col = 0;
    for (const match of relevant) {
      const mStart = match.col;
      const mEnd = match.col + match.length;
      if (mStart > col) {
        this.write(highlightLine(line.slice(col, mStart), this.lang));
      }
      const isCurrent = this.findMatches.indexOf(match) === this.findCurrent;
      const bg = isCurrent ? BG_CURRENT : BG_MATCH;
      this.write(bg + FG_MATCH + line.slice(mStart, mEnd) + RESET);
      col = mEnd;
    }
    if (col < line.length) {
      this.write(highlightLine(line.slice(col), this.lang));
    }
  }

  private renderBottomBar(): void {
    this.write(moveTo(this.rows, 1));

    if (this.mode === 'find') {
      const label = `Find: ${this.findQuery}`;
      const info = this.findMatches.length > 0
        ? ` [${this.findCurrent + 1}/${this.findMatches.length}]  Enter=next  Shift+Enter=prev  Esc=close`
        : this.findQuery ? '  No matches' : '';
      this.write(BG_BAR + FG_BAR + label + info + RESET + clearLine());
      return;
    }

    if (this.mode === 'replace') {
      const label = this.findInputTarget === 'find'
        ? `Find: ${this.findQuery}_  →  Replace: ${this.replaceQuery}`
        : `Find: ${this.findQuery}  →  Replace: ${this.replaceQuery}_`;
      const info = ` [Tab=switch  Enter=replace  Ctrl+A=all  Esc=close]`;
      this.write(BG_BAR + FG_BAR + label + info + RESET + clearLine());
      return;
    }

    if (this.mode === 'goto') {
      this.write(BG_BAR + FG_BAR + `Go to line: ${this.gotoInput}` + RESET + clearLine());
      return;
    }

    if (this.mode === 'quit-confirm') {
      this.write(BG_BAR + FG_BAR + '  Save changes? (y)es / (n)o / (c)ancel  ' + RESET + clearLine());
      return;
    }

    // Normal edit mode — show shortcuts + status
    if (this.statusMsg) {
      const fill = Math.max(0, this.cols - this.statusMsg.length);
      this.write(BG_BAR + FG_BAR + this.statusMsg + ' '.repeat(fill) + RESET);
    } else {
      const shortcuts = '  ^S Save  ^Q Quit  ^G GoTo  ^F Find  ^H Replace  ^Z Undo  ^Y Redo';
      const fill = Math.max(0, this.cols - shortcuts.length);
      this.write(BG_BAR + FG_BAR + shortcuts + ' '.repeat(fill) + RESET);
    }
    this.write(clearLine());
  }

  private placeCursor(): void {
    const screenRow = this.doc.cursor.row - this.doc.scroll.topLine + 2; // +2 for 1-indexed + top bar
    const screenCol = this.gutterWidth + this.doc.cursor.col + 1;       // +1 for 1-indexed
    this.write(moveTo(screenRow, screenCol));
  }

  /* ── status message flash ──────────────────── */

  private flash(msg: string, ms = 2000): void {
    this.statusMsg = '  ' + msg;
    if (this.statusTimeout) clearTimeout(this.statusTimeout);
    this.statusTimeout = setTimeout(() => {
      this.statusMsg = '';
      this.renderBottomBar();
      this.placeCursor();
    }, ms);
    this.renderBottomBar();
    this.placeCursor();
  }

  /* ── input handling ────────────────────────── */

  async handleInput(data: string): Promise<void> {
    if (this.mode === 'quit-confirm') {
      await this.handleQuitConfirm(data);
      return;
    }
    if (this.mode === 'goto') {
      this.handleGotoInput(data);
      return;
    }
    if (this.mode === 'find') {
      this.handleFindInput(data);
      return;
    }
    if (this.mode === 'replace') {
      this.handleReplaceInput(data);
      return;
    }

    // Edit mode
    // Escape sequences
    if (data === '\x1b[A') { this.doc.moveUp(); }
    else if (data === '\x1b[B') { this.doc.moveDown(); }
    else if (data === '\x1b[C') { this.doc.moveRight(); }
    else if (data === '\x1b[D') { this.doc.moveLeft(); }
    else if (data === '\x1b[H' || data === '\x1b[1~') { this.doc.moveHome(); }
    else if (data === '\x1b[F' || data === '\x1b[4~') { this.doc.moveEnd(); }
    else if (data === '\x1b[3~') { this.doc.deleteCharForward(); }
    else if (data === '\x1b[5~') { this.doc.pageUp(this.contentRows); }
    else if (data === '\x1b[6~') { this.doc.pageDown(this.contentRows); }
    // Ctrl+Left / Ctrl+Right (word jump)
    else if (data === '\x1b[1;5D' || data === '\x1bb') { this.doc.moveWordLeft(); }
    else if (data === '\x1b[1;5C' || data === '\x1bf') { this.doc.moveWordRight(); }
    // Ctrl shortcuts
    else if (data === '\x13') { await this.save(); }       // Ctrl+S
    else if (data === '\x11') { this.handleQuit(); }       // Ctrl+Q
    else if (data === '\x06') { this.enterFindMode(); }    // Ctrl+F
    else if (data === '\x08') { this.enterReplaceMode(); } // Ctrl+H
    else if (data === '\x07') { this.enterGotoMode(); }    // Ctrl+G
    else if (data === '\x1a') { this.doc.undo(); }         // Ctrl+Z
    else if (data === '\x19') { this.doc.redo(); }         // Ctrl+Y
    // Enter
    else if (data === '\r') { this.doc.insertNewline(); }
    // Backspace
    else if (data === '\x7f' || data === '\b') { this.doc.deleteCharBack(); }
    // Printable characters
    else {
      for (const ch of data) {
        if (ch.charCodeAt(0) >= 32) {
          this.doc.insertChar(ch);
        }
      }
    }

    this.render();
  }

  /* ── save ───────────────────────────────────── */

  private async save(): Promise<void> {
    try {
      await this.fs.write(this.doc.filePath, this.doc.getContent());
      this.doc.modified = false;
      this.flash('Saved ✓');
    } catch (e) {
      this.flash(`Save failed: ${e}`);
    }
  }

  /* ── quit ───────────────────────────────────── */

  private handleQuit(): void {
    if (this.doc.modified) {
      this.mode = 'quit-confirm';
      this.renderBottomBar();
      this.placeCursor();
    } else {
      this.quit();
    }
  }

  private async handleQuitConfirm(data: string): Promise<void> {
    const ch = data.toLowerCase();
    if (ch === 'y') {
      await this.save();
      this.quit();
    } else if (ch === 'n') {
      this.quit();
    } else if (ch === 'c' || data === '\x1b') {
      this.mode = 'edit';
      this.render();
    }
  }

  private quit(): void {
    // Clear screen and restore terminal
    this.write(CSI + '2J' + CSI + 'H' + SHOW_CURSOR);
    if (this.statusTimeout) clearTimeout(this.statusTimeout);
    this.onQuit();
  }

  /* ── find ───────────────────────────────────── */

  private enterFindMode(): void {
    this.mode = 'find';
    this.findQuery = '';
    this.findMatches = [];
    this.findCurrent = 0;
    this.render();
  }

  private handleFindInput(data: string): void {
    if (data === '\x1b') { // Esc — close find
      this.mode = 'edit';
      this.findMatches = [];
      this.render();
      return;
    }
    if (data === '\r') { // Enter — next match
      if (this.findMatches.length > 0) {
        this.findCurrent = (this.findCurrent + 1) % this.findMatches.length;
        const m = this.findMatches[this.findCurrent];
        this.doc.moveCursor(m.row, m.col);
      }
      this.render();
      return;
    }
    if (data === '\x7f' || data === '\b') { // Backspace
      this.findQuery = this.findQuery.slice(0, -1);
    } else {
      for (const ch of data) {
        if (ch.charCodeAt(0) >= 32) this.findQuery += ch;
      }
    }

    // Update matches
    this.findMatches = findAll(this.doc.lines, this.findQuery);
    this.findCurrent = 0;
    if (this.findMatches.length > 0) {
      const next = findNext(this.findMatches, this.doc.cursor);
      if (next) {
        this.findCurrent = this.findMatches.indexOf(next);
        this.doc.moveCursor(next.row, next.col);
      }
    }
    this.render();
  }

  /* ── replace ───────────────────────────────── */

  private enterReplaceMode(): void {
    this.mode = 'replace';
    this.findQuery = '';
    this.replaceQuery = '';
    this.findMatches = [];
    this.findCurrent = 0;
    this.findInputTarget = 'find';
    this.render();
  }

  private handleReplaceInput(data: string): void {
    if (data === '\x1b') { // Esc
      this.mode = 'edit';
      this.findMatches = [];
      this.render();
      return;
    }
    if (data === '\t') { // Tab — switch between find/replace fields
      this.findInputTarget = this.findInputTarget === 'find' ? 'replace' : 'find';
      this.render();
      return;
    }
    if (data === '\x01') { // Ctrl+A — replace all
      if (this.findQuery && this.findMatches.length > 0) {
        const count = replaceAll(this.doc.lines, this.findQuery, this.replaceQuery);
        this.doc.modified = true;
        this.findMatches = findAll(this.doc.lines, this.findQuery);
        this.findCurrent = 0;
        this.mode = 'edit';
        this.flash(`Replaced ${count} occurrence${count !== 1 ? 's' : ''}`);
      }
      this.render();
      return;
    }
    if (data === '\r') { // Enter — replace current + go to next
      if (this.findMatches.length > 0) {
        const match = this.findMatches[this.findCurrent];
        replaceOne(this.doc.lines, match, this.replaceQuery);
        this.doc.modified = true;
        // recalc matches
        this.findMatches = findAll(this.doc.lines, this.findQuery);
        if (this.findMatches.length > 0) {
          this.findCurrent = this.findCurrent % this.findMatches.length;
          const m = this.findMatches[this.findCurrent];
          this.doc.moveCursor(m.row, m.col);
        }
      }
      this.render();
      return;
    }

    // text input
    const target = this.findInputTarget === 'find' ? 'findQuery' : 'replaceQuery';
    if (data === '\x7f' || data === '\b') {
      this[target] = this[target].slice(0, -1);
    } else {
      for (const ch of data) {
        if (ch.charCodeAt(0) >= 32) this[target] += ch;
      }
    }

    // Update matches when find query changes
    if (this.findInputTarget === 'find') {
      this.findMatches = findAll(this.doc.lines, this.findQuery);
      this.findCurrent = 0;
      if (this.findMatches.length > 0) {
        const next = findNext(this.findMatches, this.doc.cursor);
        if (next) {
          this.findCurrent = this.findMatches.indexOf(next);
          this.doc.moveCursor(next.row, next.col);
        }
      }
    }
    this.render();
  }

  /* ── go to line ────────────────────────────── */

  private enterGotoMode(): void {
    this.mode = 'goto';
    this.gotoInput = '';
    this.render();
  }

  private handleGotoInput(data: string): void {
    if (data === '\x1b') { // Esc
      this.mode = 'edit';
      this.render();
      return;
    }
    if (data === '\r') { // Enter
      const lineNum = parseInt(this.gotoInput, 10);
      if (!isNaN(lineNum) && lineNum > 0) {
        this.doc.moveCursor(lineNum - 1, 0);
      }
      this.mode = 'edit';
      this.render();
      return;
    }
    if (data === '\x7f' || data === '\b') {
      this.gotoInput = this.gotoInput.slice(0, -1);
    } else if (/\d/.test(data)) {
      this.gotoInput += data;
    }
    this.render();
  }
}
