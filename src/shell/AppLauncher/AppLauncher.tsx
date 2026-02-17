import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { appRegistry, getApp } from '@/shared/appRegistry';
import { useWindowManager } from '@/kernel/windowManager';
import { useProcessManager } from '@/kernel/processManager';
import { useWorkspaceManager } from '@/kernel/workspaceManager';
import './AppLauncher.css';

interface AppLauncherProps {
  onClose: () => void;
}

export function AppLauncher({ onClose }: AppLauncherProps) {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const windows = useWindowManager((s) => s.windows);
  const { openWindow, focusWindow } = useWindowManager();
  const processes = useProcessManager((s) => s.processes);
  const { launchApp } = useProcessManager();
  const { addWindowToWorkspace, getActiveWorkspace } = useWorkspaceManager();

  // Focus search on open
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Escape to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [onClose]);

  const filtered = appRegistry.filter((app) =>
    app.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleLaunch = useCallback(
    (appId: string) => {
      // If app is already running, focus the existing window
      const existingWindows = windows.filter((w) => w.appId === appId);
      if (existingWindows.length > 0) {
        const target =
          existingWindows.find((w) => w.status !== 'minimized') ??
          existingWindows[0];
        focusWindow(target.id);
      } else {
        const app = getApp(appId);
        if (!app) return;
        const ws = getActiveWorkspace();
        const windowId = openWindow(appId, app.title, ws.id, app.defaultSize);
        launchApp(appId, windowId);
        addWindowToWorkspace(ws.id, windowId);
      }
      onClose();
    },
    [windows, openWindow, focusWindow, launchApp, addWindowToWorkspace, getActiveWorkspace, onClose],
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).classList.contains('app-launcher-overlay')) {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <motion.div
      className="app-launcher-overlay"
      onClick={handleOverlayClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className="app-launcher"
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.96 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      >
        <div className="app-launcher__header">
          <div className="app-launcher__title">All apps</div>
          <div className="app-launcher__search">
            <span className="app-launcher__search-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.868-3.834zm-5.242.656a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" />
              </svg>
            </span>
            <input
              ref={searchRef}
              className="app-launcher__search-input"
              type="text"
              placeholder="Type to search apps…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="app-launcher__grid">
          {filtered.length === 0 ? (
            <div className="app-launcher__empty">No apps found</div>
          ) : (
            filtered.map((app) => {
              const isRunning = processes.some(
                (p) => p.appId === app.id && p.status !== 'terminated',
              );
              return (
                <button
                  key={app.id}
                  className="app-launcher__tile"
                  onClick={() => handleLaunch(app.id)}
                  title={app.title}
                >
                  <span className="app-launcher__tile-icon">{app.icon}</span>
                  <span className="app-launcher__tile-name">{app.title}</span>
                  {isRunning && <span className="app-launcher__tile-running" />}
                </button>
              );
            })
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
