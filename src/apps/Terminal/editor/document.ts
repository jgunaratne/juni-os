/**
 * Document model for the built-in text editor.
 *
 * Manages lines, cursor, scroll, selection, and undo/redo.
 */

/* ── types ───────────────────────────────────────────────── */

export interface Position {
  row: number;
  col: number;
}

export interface Selection {
  start: Position;
  end: Position;
}

type OpType = 'insert' | 'delete' | 'replace';

interface EditOperation {
  type: OpType;
  row: number;
  col: number;
  text: string;           // inserted/deleted text
  oldText?: string;       // for replace
}

/* ── Document class ──────────────────────────────────────── */

export class Document {
  lines: string[];
  cursor: Position = { row: 0, col: 0 };
  scroll = { topLine: 0 };
  selection: Selection | null = null;
  modified = false;
  filePath: string;

  private undoStack: EditOperation[] = [];
  private redoStack: EditOperation[] = [];

  constructor(content: string, filePath: string) {
    this.lines = content.split('\n');
    this.filePath = filePath;
  }

  /* ── content access ────────────────────────── */

  get lineCount(): number { return this.lines.length; }

  getContent(): string { return this.lines.join('\n'); }

  /** Return visible lines for the viewport. */
  getViewport(rows: number): string[] {
    // rows = content area rows (total rows - 2 for top/bottom bars)
    return this.lines.slice(this.scroll.topLine, this.scroll.topLine + rows);
  }

  /* ── cursor movement ───────────────────────── */

  moveCursor(row: number, col: number): void {
    this.cursor.row = Math.max(0, Math.min(row, this.lines.length - 1));
    const lineLen = this.lines[this.cursor.row]?.length ?? 0;
    this.cursor.col = Math.max(0, Math.min(col, lineLen));
  }

  moveUp(): void { this.moveCursor(this.cursor.row - 1, this.cursor.col); }
  moveDown(): void { this.moveCursor(this.cursor.row + 1, this.cursor.col); }
  moveLeft(): void {
    if (this.cursor.col > 0) {
      this.cursor.col--;
    } else if (this.cursor.row > 0) {
      this.cursor.row--;
      this.cursor.col = this.lines[this.cursor.row].length;
    }
  }
  moveRight(): void {
    const lineLen = this.lines[this.cursor.row].length;
    if (this.cursor.col < lineLen) {
      this.cursor.col++;
    } else if (this.cursor.row < this.lines.length - 1) {
      this.cursor.row++;
      this.cursor.col = 0;
    }
  }

  moveHome(): void { this.cursor.col = 0; }
  moveEnd(): void { this.cursor.col = this.lines[this.cursor.row].length; }

  moveWordLeft(): void {
    if (this.cursor.col === 0 && this.cursor.row > 0) {
      this.cursor.row--;
      this.cursor.col = this.lines[this.cursor.row].length;
      return;
    }
    const line = this.lines[this.cursor.row];
    let i = this.cursor.col - 1;
    while (i > 0 && line[i] === ' ') i--;
    while (i > 0 && line[i - 1] !== ' ') i--;
    this.cursor.col = Math.max(0, i);
  }

  moveWordRight(): void {
    const line = this.lines[this.cursor.row];
    if (this.cursor.col >= line.length && this.cursor.row < this.lines.length - 1) {
      this.cursor.row++;
      this.cursor.col = 0;
      return;
    }
    let i = this.cursor.col;
    while (i < line.length && line[i] !== ' ') i++;
    while (i < line.length && line[i] === ' ') i++;
    this.cursor.col = i;
  }

  pageUp(viewportRows: number): void {
    this.moveCursor(this.cursor.row - viewportRows, this.cursor.col);
  }

  pageDown(viewportRows: number): void {
    this.moveCursor(this.cursor.row + viewportRows, this.cursor.col);
  }

  /* ── scroll management ─────────────────────── */

  /** Ensure cursor is within the visible viewport and adjust scroll. */
  ensureVisible(viewportRows: number): void {
    if (this.cursor.row < this.scroll.topLine) {
      this.scroll.topLine = this.cursor.row;
    } else if (this.cursor.row >= this.scroll.topLine + viewportRows) {
      this.scroll.topLine = this.cursor.row - viewportRows + 1;
    }
  }

  /* ── editing operations ────────────────────── */

  insertChar(ch: string): void {
    const line = this.lines[this.cursor.row];
    this.lines[this.cursor.row] = line.slice(0, this.cursor.col) + ch + line.slice(this.cursor.col);
    this.pushUndo({ type: 'insert', row: this.cursor.row, col: this.cursor.col, text: ch });
    this.cursor.col++;
    this.modified = true;
  }

  insertNewline(): void {
    const line = this.lines[this.cursor.row];
    const before = line.slice(0, this.cursor.col);
    const after = line.slice(this.cursor.col);
    this.lines[this.cursor.row] = before;
    this.lines.splice(this.cursor.row + 1, 0, after);
    this.pushUndo({ type: 'insert', row: this.cursor.row, col: this.cursor.col, text: '\n' });
    this.cursor.row++;
    this.cursor.col = 0;
    this.modified = true;
  }

  deleteCharBack(): void {
    if (this.cursor.col > 0) {
      const line = this.lines[this.cursor.row];
      const deleted = line[this.cursor.col - 1];
      this.lines[this.cursor.row] = line.slice(0, this.cursor.col - 1) + line.slice(this.cursor.col);
      this.cursor.col--;
      this.pushUndo({ type: 'delete', row: this.cursor.row, col: this.cursor.col, text: deleted });
      this.modified = true;
    } else if (this.cursor.row > 0) {
      // merge with previous line
      const prevLen = this.lines[this.cursor.row - 1].length;
      this.lines[this.cursor.row - 1] += this.lines[this.cursor.row];
      this.lines.splice(this.cursor.row, 1);
      this.cursor.row--;
      this.cursor.col = prevLen;
      this.pushUndo({ type: 'delete', row: this.cursor.row, col: this.cursor.col, text: '\n' });
      this.modified = true;
    }
  }

  deleteCharForward(): void {
    const line = this.lines[this.cursor.row];
    if (this.cursor.col < line.length) {
      const deleted = line[this.cursor.col];
      this.lines[this.cursor.row] = line.slice(0, this.cursor.col) + line.slice(this.cursor.col + 1);
      this.pushUndo({ type: 'delete', row: this.cursor.row, col: this.cursor.col, text: deleted });
      this.modified = true;
    } else if (this.cursor.row < this.lines.length - 1) {
      // merge with next line
      this.lines[this.cursor.row] += this.lines[this.cursor.row + 1];
      this.lines.splice(this.cursor.row + 1, 1);
      this.pushUndo({ type: 'delete', row: this.cursor.row, col: this.cursor.col, text: '\n' });
      this.modified = true;
    }
  }

  /* ── undo / redo ───────────────────────────── */

  private pushUndo(op: EditOperation): void {
    this.undoStack.push(op);
    this.redoStack.length = 0;   // clear redo on new edit
  }

  undo(): void {
    const op = this.undoStack.pop();
    if (!op) return;

    if (op.type === 'insert') {
      // reverse an insert: delete the text
      if (op.text === '\n') {
        // un-insert newline: merge lines
        this.lines[op.row] += this.lines[op.row + 1] ?? '';
        this.lines.splice(op.row + 1, 1);
      } else {
        const line = this.lines[op.row];
        this.lines[op.row] = line.slice(0, op.col) + line.slice(op.col + op.text.length);
      }
      this.cursor.row = op.row;
      this.cursor.col = op.col;
    } else if (op.type === 'delete') {
      // reverse a delete: re-insert the text
      if (op.text === '\n') {
        const line = this.lines[op.row];
        const before = line.slice(0, op.col);
        const after = line.slice(op.col);
        this.lines[op.row] = before;
        this.lines.splice(op.row + 1, 0, after);
      } else {
        const line = this.lines[op.row];
        this.lines[op.row] = line.slice(0, op.col) + op.text + line.slice(op.col);
      }
      this.cursor.row = op.row;
      this.cursor.col = op.col + (op.text === '\n' ? 0 : op.text.length);
    }

    this.redoStack.push(op);
    this.modified = this.undoStack.length > 0;
  }

  redo(): void {
    const op = this.redoStack.pop();
    if (!op) return;

    if (op.type === 'insert') {
      if (op.text === '\n') {
        const line = this.lines[op.row];
        this.lines[op.row] = line.slice(0, op.col);
        this.lines.splice(op.row + 1, 0, line.slice(op.col));
        this.cursor.row = op.row + 1;
        this.cursor.col = 0;
      } else {
        const line = this.lines[op.row];
        this.lines[op.row] = line.slice(0, op.col) + op.text + line.slice(op.col);
        this.cursor.row = op.row;
        this.cursor.col = op.col + op.text.length;
      }
    } else if (op.type === 'delete') {
      if (op.text === '\n') {
        this.lines[op.row] += this.lines[op.row + 1] ?? '';
        this.lines.splice(op.row + 1, 1);
      } else {
        const line = this.lines[op.row];
        this.lines[op.row] = line.slice(0, op.col) + line.slice(op.col + op.text.length);
      }
      this.cursor.row = op.row;
      this.cursor.col = op.col;
    }

    this.undoStack.push(op);
    this.modified = true;
  }
}
