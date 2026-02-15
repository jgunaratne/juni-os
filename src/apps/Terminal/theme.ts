import type { ITheme } from '@xterm/xterm';
import type { OSTheme } from '@/shared/types';

/**
 * Convert an OS theme to an xterm.js ITheme.
 * Maps semantic colours → terminal chrome and derives
 * an ANSI‑16 palette from the accent.
 */
export function getXtermTheme(os: OSTheme): ITheme {
  const { colors } = os;

  /* Derive a subtle selection bg from the accent at ~30 % opacity */
  const selectionBg = hexToRgba(colors.accent, 0.3);

  return {
    background: '#000000',
    foreground: colors.text,
    cursor: colors.accent,
    cursorAccent: colors.windowBackground,
    selectionBackground: selectionBg,
    selectionForeground: undefined,

    /* ANSI normal (0‑7) */
    black: '#2e3436',
    red: '#cc0000',
    green: '#4e9a06',
    yellow: '#c4a000',
    blue: '#3465a4',
    magenta: '#75507b',
    cyan: '#06989a',
    white: '#d3d7cf',

    /* ANSI bright (8‑15) */
    brightBlack: '#555753',
    brightRed: '#ef2929',
    brightGreen: '#8ae234',
    brightYellow: '#fce94f',
    brightBlue: '#729fcf',
    brightMagenta: '#ad7fa8',
    brightCyan: '#34e2e2',
    brightWhite: '#eeeeec',
  };
}

/* ── helpers ─────────────────────────────────────────────── */

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
