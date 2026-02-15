/**
 * Minimal shell parser.
 *
 * Supports:
 *   - Whitespace‑delimited tokens with single/double‑quoted strings
 *   - Pipes `|`
 *   - Output redirect `>` and append `>>`
 *   - Chaining `&&` and `;`
 *   - $VAR environment variable expansion
 */

export interface ParsedCommand {
  argv: string[];               // [command, ...args]
  redirectFile?: string;        // `> file`
  redirectAppend?: boolean;     // `>>` vs `>`
}

export interface Pipeline {
  commands: ParsedCommand[];    // connected by `|`
}

export type ChainOp = '&&' | ';';

export interface ChainedPipeline {
  pipeline: Pipeline;
  chainOp?: ChainOp;           // operator *after* this pipeline
}

/* ── public API ─────────────────────────────────────────── */

export function parse(
  input: string,
  env: Record<string, string>,
): ChainedPipeline[] {
  const expanded = expandVars(input, env);
  return parseChains(expanded);
}

/* ── tokeniser ──────────────────────────────────────────── */

function tokenise(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < input.length) {
    // skip whitespace
    if (input[i] === ' ' || input[i] === '\t') { i++; continue; }

    // quoted string
    if (input[i] === '"' || input[i] === "'") {
      const quote = input[i];
      i++;
      let tok = '';
      while (i < input.length && input[i] !== quote) {
        tok += input[i];
        i++;
      }
      i++; // closing quote
      tokens.push(tok);
      continue;
    }

    // special two‑char operators
    if (input[i] === '>' && input[i + 1] === '>') { tokens.push('>>'); i += 2; continue; }
    if (input[i] === '&' && input[i + 1] === '&') { tokens.push('&&'); i += 2; continue; }

    // special single‑char operators
    if (input[i] === '|' || input[i] === '>' || input[i] === ';') {
      tokens.push(input[i]);
      i++;
      continue;
    }

    // regular word
    let tok = '';
    while (
      i < input.length &&
      input[i] !== ' ' &&
      input[i] !== '\t' &&
      input[i] !== '|' &&
      input[i] !== '>' &&
      input[i] !== ';' &&
      !(input[i] === '&' && input[i + 1] === '&')
    ) {
      tok += input[i];
      i++;
    }
    if (tok) tokens.push(tok);
  }
  return tokens;
}

/* ── chain / pipeline parsing ───────────────────────────── */

function parseChains(input: string): ChainedPipeline[] {
  const tokens = tokenise(input);
  const result: ChainedPipeline[] = [];
  let current: ParsedCommand = { argv: [] };
  let pipelineCommands: ParsedCommand[] = [];

  const flushCommand = () => {
    if (current.argv.length > 0) {
      pipelineCommands.push(current);
    }
    current = { argv: [] };
  };

  const flushPipeline = (op?: ChainOp) => {
    flushCommand();
    if (pipelineCommands.length > 0) {
      result.push({ pipeline: { commands: pipelineCommands }, chainOp: op });
    }
    pipelineCommands = [];
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (t === '|') {
      flushCommand();
    } else if (t === '>' || t === '>>') {
      current.redirectAppend = t === '>>';
      const next = tokens[i + 1];
      if (next) { current.redirectFile = next; i++; }
    } else if (t === '&&') {
      flushPipeline('&&');
    } else if (t === ';') {
      flushPipeline(';');
    } else {
      current.argv.push(t);
    }
  }

  flushPipeline();
  return result;
}

/* ── variable expansion ─────────────────────────────────── */

function expandVars(input: string, env: Record<string, string>): string {
  return input.replace(/\$([A-Za-z_]\w*)/g, (_, name) => env[name] ?? '');
}

/* ── glob expansion (call with directory listing) ────────── */

export function expandGlob(pattern: string, names: string[]): string[] {
  const re = new RegExp(
    '^' +
    pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.') +
    '$',
  );
  return names.filter((n) => re.test(n));
}
