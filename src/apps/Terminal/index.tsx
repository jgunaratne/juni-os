import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import './Terminal.css';

import { Shell } from './shell';
import { getXtermTheme } from './theme';
import { useThemeManager, themePresets } from '@/kernel/themeManager';
import { useFileSystem } from '@/kernel/fileSystem';
import { useAuth } from '@/kernel/auth';
import { useProcessManager } from '@/kernel/processManager';

export default function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const shellRef = useRef<Shell | null>(null);

  const theme = useThemeManager((s) => s.currentTheme);
  const setThemeById = useThemeManager((s) => s.setThemeById);

  /* Stable refs that never change across renders */
  const fsRef = useRef(useFileSystem.getState().provider);
  const getUsernameRef = useRef(() => useAuth.getState().user?.name ?? 'user');
  const getProcessesRef = useRef(() => useProcessManager.getState().getRunningProcesses());

  useEffect(() => {
    if (!containerRef.current) return;

    const xterm = new XTerm({
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
      fontSize: 14,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'block',
      theme: getXtermTheme(useThemeManager.getState().currentTheme),
      allowTransparency: true,
      scrollback: 5000,
    });

    const fit = new FitAddon();
    xterm.loadAddon(fit);
    xterm.loadAddon(new WebLinksAddon());

    xterm.open(containerRef.current);

    /* Need a small delay to ensure accurate sizing */
    requestAnimationFrame(() => fit.fit());

    xtermRef.current = xterm;

    /* ── Shell ─────────────────────────────────── */
    const shell = new Shell({
      write: (data) => xterm.write(data),
      fs: fsRef.current,
      getUsername: () => getUsernameRef.current(),
      getProcesses: () => getProcessesRef.current(),
      setTheme: (name: string) => {
        const found = themePresets.find(
          (t) => t.id === name || t.name.toLowerCase() === name.toLowerCase()
        );
        if (found) { setThemeById(found.id); return true; }
        return false;
      },
    });

    shell.printBanner();
    shell.printPrompt();

    shellRef.current = shell;

    xterm.onData((data) => shell.handleInput(data));

    /* Forward initial viewport + resize events */
    requestAnimationFrame(() => {
      shell.setViewport(xterm.rows, xterm.cols);
    });
    xterm.onResize(({ rows: r, cols: c }) => shell.setViewport(r, c));

    /* ── resize observer ──────────────────────── */
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => fit.fit());
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      xterm.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Live theme updates */
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = getXtermTheme(theme);
    }
  }, [theme]);

  return <div ref={containerRef} className="terminal-container" />;
}
