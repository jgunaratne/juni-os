import { useState, useEffect, useCallback } from 'react';
import { useWindowManager } from '@/kernel/windowManager';
import { useWorkspaceManager } from '@/kernel/workspaceManager';
import { useProcessManager } from '@/kernel/processManager';
import { useFileSystem } from '@/kernel/fileSystem';
import { useThemeManager } from '@/kernel/themeManager';
import { useDockConfig } from '@/kernel/dockConfigManager';
import { useNotificationManager } from '@/kernel/notificationManager';
import { getApp } from '@/shared/appRegistry';
import { Window } from '@/shell/Window/Window';
import { AltTabSwitcher } from '@/shell/AltTabSwitcher/AltTabSwitcher';
import { ContextMenu } from '@/shell/ContextMenu/ContextMenu';
import { NotificationCenter } from '@/shell/NotificationCenter/NotificationCenter';
import { DesktopIcons } from '@/shell/Desktop/DesktopIcons';
import { Spotlight } from '@/shell/Spotlight/Spotlight';
import { LockScreen } from '@/shell/LockScreen/LockScreen';
import { WorkspaceOverview } from '@/shell/WorkspaceOverview/WorkspaceOverview';
import type { MenuItem } from '@/shell/ContextMenu/ContextMenu';
import { AnimatePresence } from 'framer-motion';
import './Desktop.css';

export function Desktop() {
  const windows = useWindowManager((s) => s.windows);
  const openWindow = useWindowManager((s) => s.openWindow);
  const workspaces = useWorkspaceManager((s) => s.workspaces);
  const activeIndex = useWorkspaceManager((s) => s.activeIndex);
  const getActiveWorkspace = useWorkspaceManager((s) => s.getActiveWorkspace);
  const addWindowToWorkspace = useWorkspaceManager((s) => s.addWindowToWorkspace);
  const isOverviewOpen = useWorkspaceManager((s) => s.isOverviewOpen);
  const launchApp = useProcessManager((s) => s.launchApp);
  const fs = useFileSystem((s) => s.provider);
  const theme = useThemeManager((s) => s.currentTheme);
  const dockPosition = useDockConfig((s) => s.position);
  const addNotification = useNotificationManager((s) => s.addNotification);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [showSpotlight, setShowSpotlight] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const activeWorkspace = workspaces[activeIndex];
  const visibleWindows = activeWorkspace
    ? windows.filter((w) => activeWorkspace.windows.includes(w.id))
    : [];

  const wallpaperStyle: React.CSSProperties = {
    background: theme.wallpaper.type === 'color'
      ? theme.wallpaper.value
      : theme.wallpaper.type === 'image'
        ? `url(${theme.wallpaper.value}) center/cover no-repeat`
        : theme.colors.desktop,
  };

  const launchAppById = useCallback((appId: string) => {
    const app = getApp(appId);
    if (!app) return;
    const ws = getActiveWorkspace();
    const windowId = openWindow(appId, app.title, ws.id, app.defaultSize);
    launchApp(appId, windowId);
    addWindowToWorkspace(ws.id, windowId);
  }, [openWindow, getActiveWorkspace, launchApp, addWindowToWorkspace]);

  // Cmd/Ctrl+Space → Spotlight
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.code === 'Space') {
        e.preventDefault();
        setShowSpotlight((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Listen for lock event from QuickSettings
  useEffect(() => {
    const handleLock = () => setIsLocked(true);
    window.addEventListener('junios:lock', handleLock);
    return () => window.removeEventListener('junios:lock', handleLock);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('desktop__window-container') && !target.classList.contains('desktop')) return;

    e.preventDefault();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'New Folder',
          icon: '📁',
          onClick: async () => {
            try {
              const name = `New Folder ${Date.now() % 10000}`;
              await fs.mkdir(`/home/Desktop/${name}`);
              addNotification('success', 'Folder Created', name);
            } catch {
              addNotification('error', 'Failed to create folder');
            }
          },
        },
        {
          label: 'New File',
          icon: '📄',
          onClick: async () => {
            try {
              const name = `untitled-${Date.now() % 10000}.txt`;
              await fs.write(`/home/Desktop/${name}`, '');
              addNotification('success', 'File Created', name);
            } catch {
              addNotification('error', 'Failed to create file');
            }
          },
        },
        { label: '', divider: true },
        {
          label: 'Open Terminal',
          icon: '🖥️',
          onClick: () => launchAppById('terminal'),
        },
        {
          label: 'Open Files',
          icon: '📁',
          onClick: () => launchAppById('file-manager'),
        },
        { label: '', divider: true },
        {
          label: 'Lock Screen',
          icon: '🔒',
          onClick: () => setIsLocked(true),
        },
        {
          label: 'Settings',
          icon: '⚙️',
          onClick: () => launchAppById('control-panel'),
        },
      ],
    });
  }, [fs, addNotification, launchAppById]);

  /* ── desktop as drop target ────────────────── */

  const handleDesktopDragOver = useCallback((e: React.DragEvent) => {
    // Only accept on the background areas
    const target = e.target as HTMLElement;
    if (target.closest('.desktop-icon') || target.closest('.os-window')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDesktopDrop = useCallback(async (e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.desktop-icon') || target.closest('.os-window')) return;
    e.preventDefault();
    const sourcePath = e.dataTransfer.getData('text/plain');
    if (!sourcePath) return;
    // Don't move if already on the desktop
    const desktopDir = '/home/Desktop';
    const parentDir = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
    if (parentDir === desktopDir) return;
    const fileName = sourcePath.split('/').pop();
    if (!fileName) return;
    try {
      await fs.move(sourcePath, `${desktopDir}/${fileName}`);
      window.dispatchEvent(new Event('junios:fs-change'));
    } catch {
      // Move failed
    }
  }, [fs]);

  return (
    <div
      className={`desktop ${dockPosition === 'bottom' ? 'desktop--dock-bottom' : ''}`}
      style={wallpaperStyle}
      onContextMenu={handleContextMenu}
      onDragOver={handleDesktopDragOver}
      onDrop={handleDesktopDrop}
    >
      <div className="desktop__window-container">
        <AnimatePresence>
          {visibleWindows.map((win) => (
            <Window key={win.id} window={win} />
          ))}
        </AnimatePresence>
      </div>
      <DesktopIcons />
      <AltTabSwitcher />
      <NotificationCenter />
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}
      {showSpotlight && <Spotlight onClose={() => setShowSpotlight(false)} />}
      {isLocked && <LockScreen onUnlock={() => setIsLocked(false)} />}
      {isOverviewOpen && <WorkspaceOverview />}
    </div>
  );
}
