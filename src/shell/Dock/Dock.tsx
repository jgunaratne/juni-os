import { useCallback, useRef, useState, useMemo } from 'react';
import { useWindowManager } from '@/kernel/windowManager';
import { useProcessManager } from '@/kernel/processManager';
import { useWorkspaceManager } from '@/kernel/workspaceManager';
import { useDockConfig } from '@/kernel/dockConfigManager';
import { getApp } from '@/shared/appRegistry';
import { AppLauncher } from '@/shell/AppLauncher/AppLauncher';
import { AnimatePresence } from 'framer-motion';
import './Dock.css';

export function Dock() {
  const windows = useWindowManager((s) => s.windows);
  const processes = useProcessManager((s) => s.processes);
  const { openWindow, focusWindow, minimizeWindow } = useWindowManager();
  const { launchApp } = useProcessManager();
  const { addWindowToWorkspace, getActiveWorkspace } = useWorkspaceManager();
  const { position, iconSize, magnification } = useDockConfig();

  const dockRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState<number | null>(null);
  const [showLauncher, setShowLauncher] = useState(false);

  // Only show apps that have at least one active process
  const activeApps = useMemo(() => {
    const activeAppIds = new Set(
      processes
        .filter((p) => p.status === 'running' || p.status === 'background')
        .map((p) => p.appId)
    );
    return [...activeAppIds]
      .map((id) => getApp(id))
      .filter(Boolean) as NonNullable<ReturnType<typeof getApp>>[];
  }, [processes]);

  const handleDockClick = useCallback(
    (appId: string) => {
      const runningWindows = windows.filter(
        (w) => w.appId === appId && w.status !== 'minimized'
      );
      const minimizedWindows = windows.filter(
        (w) => w.appId === appId && w.status === 'minimized'
      );
      const allWindows = windows.filter((w) => w.appId === appId);

      if (allWindows.length === 0) {
        const app = getApp(appId);
        if (!app) return;
        const ws = getActiveWorkspace();
        const windowId = openWindow(appId, app.title, ws.id, app.defaultSize);
        launchApp(appId, windowId);
        addWindowToWorkspace(ws.id, windowId);
      } else if (runningWindows.some((w) => w.isFocused)) {
        const focused = runningWindows.find((w) => w.isFocused);
        if (focused) minimizeWindow(focused.id);
      } else if (minimizedWindows.length > 0) {
        focusWindow(minimizedWindows[0].id);
      } else if (runningWindows.length > 0) {
        focusWindow(runningWindows[0].id);
      }
    },
    [windows, openWindow, focusWindow, minimizeWindow, launchApp, addWindowToWorkspace, getActiveWorkspace]
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dockRef.current) return;
    const rect = dockRef.current.getBoundingClientRect();
    if (position === 'bottom') {
      setMousePos(e.clientX - rect.left);
    } else {
      setMousePos(e.clientY - rect.top);
    }
  }, [position]);

  const handleMouseLeave = useCallback(() => {
    setMousePos(null);
  }, []);

  // Calculate magnification scale for each icon
  const getScale = (index: number): number => {
    if (!magnification || mousePos === null) return 1;
    const itemSize = iconSize + 4;
    const headerOffset = 8;
    const itemCenter = headerOffset + index * itemSize + itemSize / 2;
    const distance = Math.abs(mousePos - itemCenter);
    const maxDist = itemSize * 2.5;
    if (distance > maxDist) return 1;
    const scale = 1 + 0.5 * Math.cos((Math.PI * distance) / (maxDist * 2));
    return Math.min(scale, 1.5);
  };

  return (
    <>
      <div
        ref={dockRef}
        className={`dock ${position === 'bottom' ? 'dock--bottom' : ''}`}
        style={{ '--dock-icon-size': `${iconSize}px` } as React.CSSProperties}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className="dock__apps">
          {activeApps.map((app, index) => {
            const appProcesses = processes.filter(
              (p) => p.appId === app.id && p.status !== 'terminated'
            );
            const isRunning = appProcesses.length > 0;
            const focusedWin = windows.find(
              (w) => w.appId === app.id && w.isFocused
            );
            const scale = getScale(index);

            return (
              <button
                key={app.id}
                className={`dock__item ${focusedWin ? 'dock__item--focused' : ''}`}
                onClick={() => handleDockClick(app.id)}
                title={app.title}
                style={{
                  transform: `scale(${scale})`,
                  transition: mousePos !== null ? 'transform 0.08s ease-out' : 'transform 0.2s ease-out',
                }}
              >
                <span className="dock__icon">{app.icon}</span>
                {isRunning && (
                  <div className="dock__indicators">
                    {appProcesses.slice(0, 3).map((p) => (
                      <span key={p.id} className="dock__dot" />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="dock__separator" />

        <button
          className={`dock__item dock__item--grid ${showLauncher ? 'dock__item--grid-active' : ''}`}
          title="Show Applications"
          onClick={() => setShowLauncher((v) => !v)}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <rect x="1" y="1" width="5" height="5" rx="1" />
            <rect x="8" y="1" width="5" height="5" rx="1" />
            <rect x="15" y="1" width="5" height="5" rx="1" />
            <rect x="1" y="8" width="5" height="5" rx="1" />
            <rect x="8" y="8" width="5" height="5" rx="1" />
            <rect x="15" y="8" width="5" height="5" rx="1" />
            <rect x="1" y="15" width="5" height="5" rx="1" />
            <rect x="8" y="15" width="5" height="5" rx="1" />
            <rect x="15" y="15" width="5" height="5" rx="1" />
          </svg>
        </button>
      </div>

      <AnimatePresence>
        {showLauncher && (
          <AppLauncher onClose={() => setShowLauncher(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
