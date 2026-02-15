/**
 * Basic syntax highlighting via ANSI color codes.
 *
 * Detects file type from extension and applies simple keyword/string/comment
 * highlighting. This is a stretch feature — correctness matters less than
 * a pleasant reading experience.
 */

/* ── ANSI color helpers ──────────────────────────────────── */

const ESC = '\x1b';
const CSI = ESC + '[';
const RESET = CSI + '0m';
const KEYWORD = CSI + '1;35m';   // bold magenta
const STRING = CSI + '33m';      // yellow
const COMMENT = CSI + '2;32m';   // dim green
const NUMBER = CSI + '36m';      // cyan
const TYPE = CSI + '34m';        // blue
const FUNC = CSI + '1;33m';      // bold yellow
const PROPERTY = CSI + '36m';    // cyan for JSON keys

type Language = 'js' | 'ts' | 'json' | 'md' | 'css' | 'html' | 'plain';

const EXT_MAP: Record<string, Language> = {
  js: 'js', jsx: 'js', mjs: 'js',
  ts: 'ts', tsx: 'ts', mts: 'ts',
  json: 'json',
  md: 'md', markdown: 'md',
  css: 'css', scss: 'css',
  html: 'html', htm: 'html', xml: 'html', svg: 'html',
};

export function detectLanguage(filePath: string): Language {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MAP[ext] ?? 'plain';
}

/** Highlight a single line. Returns ANSI-colored string. */
export function highlightLine(line: string, lang: Language): string {
  if (lang === 'plain') return line;
  if (lang === 'json') return highlightJSON(line);
  if (lang === 'md') return highlightMarkdown(line);
  if (lang === 'css') return highlightCSS(line);
  if (lang === 'html') return highlightHTML(line);
  return highlightJS(line);
}

/* ── JS/TS highlighting ──────────────────────────────────── */

const JS_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'break', 'continue', 'new', 'delete', 'typeof',
  'instanceof', 'class', 'extends', 'import', 'export', 'from', 'default',
  'async', 'await', 'try', 'catch', 'finally', 'throw', 'yield', 'of', 'in',
  'true', 'false', 'null', 'undefined', 'void', 'this', 'super',
  'interface', 'type', 'enum', 'implements', 'abstract', 'readonly',
  'public', 'private', 'protected', 'static', 'as', 'is', 'keyof',
]);

const JS_TYPES = new Set([
  'string', 'number', 'boolean', 'any', 'never', 'unknown', 'object',
  'void', 'null', 'undefined', 'Array', 'Promise', 'Record', 'Map', 'Set',
]);

function highlightJS(line: string): string {
  // single-line comment
  const commentIdx = findCommentStart(line);
  let main = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
  const commentPart = commentIdx >= 0 ? COMMENT + line.slice(commentIdx) + RESET : '';

  // Strings
  main = main.replace(/(["'`])(?:(?!\1|\\).|\\.)*?\1/g, (m) => STRING + m + RESET);

  // Numbers
  main = main.replace(/\b(\d+\.?\d*)\b/g, NUMBER + '$1' + RESET);

  // Keywords & types
  main = main.replace(/\b([a-zA-Z_$]\w*)\b/g, (_m, word: string) => {
    if (JS_KEYWORDS.has(word)) return KEYWORD + word + RESET;
    if (JS_TYPES.has(word)) return TYPE + word + RESET;
    return word;
  });

  // Function calls: word(
  main = main.replace(/\b([a-zA-Z_$]\w*)\s*(?=\()/g, FUNC + '$1' + RESET);

  return main + commentPart;
}

function findCommentStart(line: string): number {
  let inStr: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
    } else {
      if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; }
      else if (ch === '/' && line[i + 1] === '/') return i;
    }
  }
  return -1;
}

/* ── JSON highlighting ───────────────────────────────────── */

function highlightJSON(line: string): string {
  // Keys
  let result = line.replace(/"([^"\\]|\\.)*"\s*:/g, (m) => PROPERTY + m + RESET);
  // String values
  result = result.replace(/:\s*("([^"\\]|\\.)*")/g, (full, strVal: string) =>
    full.replace(strVal, STRING + strVal + RESET)
  );
  // Numbers
  result = result.replace(/:\s*(-?\d+\.?\d*)/g, (full, num: string) =>
    full.replace(num, NUMBER + num + RESET)
  );
  // booleans, null
  result = result.replace(/\b(true|false|null)\b/g, KEYWORD + '$1' + RESET);
  return result;
}

/* ── Markdown highlighting ───────────────────────────────── */

function highlightMarkdown(line: string): string {
  // Headings
  if (/^#{1,6}\s/.test(line)) return KEYWORD + line + RESET;
  // Bold
  let result = line.replace(/\*\*(.+?)\*\*/g, CSI + '1m' + '**$1**' + RESET);
  // Italic
  result = result.replace(/\*(.+?)\*/g, CSI + '3m' + '*$1*' + RESET);
  // Code
  result = result.replace(/`([^`]+)`/g, FUNC + '`$1`' + RESET);
  // Links
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    TYPE + '[$1]' + RESET + '(' + STRING + '$2' + RESET + ')');
  return result;
}

/* ── CSS highlighting ────────────────────────────────────── */

function highlightCSS(line: string): string {
  // Comments
  if (line.trimStart().startsWith('/*') || line.trimStart().startsWith('*'))
    return COMMENT + line + RESET;
  // Properties
  let result = line.replace(/([a-z-]+)\s*:/g, PROPERTY + '$1' + RESET + ':');
  // Values with units
  result = result.replace(/:\s*([^;]+)/g, (full, val: string) =>
    full.replace(val, STRING + val + RESET)
  );
  // Selectors
  if (/^[.#@a-zA-Z]/.test(line.trim()) && !line.includes(':'))
    return KEYWORD + line + RESET;
  return result;
}

/* ── HTML highlighting ───────────────────────────────────── */

function highlightHTML(line: string): string {
  // Tags
  let result = line.replace(/<\/?([a-zA-Z][\w-]*)/g, (m, tag: string) =>
    m.replace(tag, KEYWORD + tag + RESET)
  );
  // Attributes
  result = result.replace(/\s([a-zA-Z-]+)=/g, ' ' + TYPE + '$1' + RESET + '=');
  // Strings in attributes
  result = result.replace(/="([^"]*)"/g, '=' + STRING + '"$1"' + RESET);
  // Comments
  result = result.replace(/(<!--[\s\S]*?-->)/g, COMMENT + '$1' + RESET);
  return result;
}
