import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useFileSystem } from '@/kernel/fileSystem';
import { useWindowManager } from '@/kernel/windowManager';
import { useProcessManager } from '@/kernel/processManager';
import { useWorkspaceManager } from '@/kernel/workspaceManager';
import { getApp } from '@/shared/appRegistry';
import { ContextMenu } from '@/shell/ContextMenu/ContextMenu';
import type { MenuItem } from '@/shell/ContextMenu/ContextMenu';
import './DesktopIcons.css';

const DESKTOP_DIR = '/home/Desktop';

const EXT_ICONS: Record<string, string> = {
  txt: '📄', md: '📝', json: '📋', js: '📜', ts: '📜',
  html: '🌐', css: '🎨', png: '🖼️', jpg: '🖼️', jpeg: '🖼️',
  gif: '🖼️', svg: '🖼️', pdf: '📕', zip: '📦', mp3: '🎵',
  mp4: '🎬', default: '📄',
};

function getIconForEntry(name: string, isDir: boolean): string {
  if (isDir) return '📁';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_ICONS[ext] ?? EXT_ICONS.default;
}

function getAppForFile(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];
  const textExts = ['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'css', 'html', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'log', 'csv'];
  if (imageExts.includes(ext)) return 'image-viewer';
  if (textExts.includes(ext)) return 'notes';
  return 'terminal'; // fallback: open in terminal
}

interface DesktopEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export function DesktopIcons() {
  const fs = useFileSystem((s) => s.provider);
  const openWindow = useWindowManager((s) => s.openWindow);
  const launchApp = useProcessManager((s) => s.launchApp);
  const { addWindowToWorkspace, getActiveWorkspace } = useWorkspaceManager();

  const [entries, setEntries] = useState<DesktopEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [trashHover, setTrashHover] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');

  const loadEntries = useCallback(async () => {
    try {
      const exists = await fs.exists(DESKTOP_DIR);
      if (!exists) return;
      const items = await fs.list(DESKTOP_DIR);
      setEntries(
        items.map((e) => ({
          name: e.name,
          path: e.path,
          isDirectory: e.isDirectory,
        }))
      );
    } catch {
      // silent
    }
  }, [fs]);

  useEffect(() => {
    loadEntries();
    const interval = setInterval(loadEntries, 5000);
    const handleFsChange = () => loadEntries();
    window.addEventListener('junios:fs-change', handleFsChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener('junios:fs-change', handleFsChange);
    };
  }, [loadEntries]);

  const handleDoubleClick = useCallback(
    (entry: DesktopEntry) => {
      const appId = entry.isDirectory ? 'file-manager' : getAppForFile(entry.name);
      if (!appId) return;
      const app = getApp(appId);
      if (!app) return;
      const ws = getActiveWorkspace();
      const metadata = entry.isDirectory ? { initialPath: entry.path } : { filePath: entry.path };
      const windowId = openWindow(appId, entry.isDirectory ? entry.name : entry.name, ws.id, app.defaultSize, metadata);
      launchApp(appId, windowId);
      addWindowToWorkspace(ws.id, windowId);
    },
    [openWindow, launchApp, addWindowToWorkspace, getActiveWorkspace],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      setSelected(path);
    },
    [],
  );

  const handleDesktopClick = useCallback(() => {
    setSelected(null);
  }, []);

  /* ── context menu for icons ───────────────────────── */

  const handleIconContextMenu = useCallback((e: React.MouseEvent, entry: DesktopEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(entry.path);
    const items: MenuItem[] = [
      { label: 'Open', icon: '📂', onClick: () => handleDoubleClick(entry) },
      {
        label: 'Rename',
        icon: '✏️',
        onClick: () => {
          setRenamingPath(entry.path);
          setRenamingValue(entry.name);
        },
      },
      { label: '', divider: true },
      {
        label: 'Delete',
        icon: '🗑️',
        onClick: async () => {
          await fs.delete(entry.path);
          window.dispatchEvent(new Event('junios:fs-change'));
        },
      },
    ];
    setCtxMenu({ x: e.clientX, y: e.clientY, items });
  }, [fs, handleDoubleClick]);

  /* ── drag-and-drop ──────────────────────────────────────── */

  const handleDragStart = (e: React.DragEvent, entry: DesktopEntry) => {
    e.dataTransfer.setData('text/plain', entry.path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, entry: DesktopEntry) => {
    if (!entry.isDirectory) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(entry.path);
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = async (e: React.DragEvent, targetFolder: DesktopEntry) => {
    e.preventDefault();
    setDropTarget(null);
    if (!targetFolder.isDirectory) return;
    const sourcePath = e.dataTransfer.getData('text/plain');
    if (!sourcePath || sourcePath === targetFolder.path) return;
    const fileName = sourcePath.split('/').pop();
    if (!fileName) return;
    const destPath = `${targetFolder.path}/${fileName}`;
    try {
      await fs.move(sourcePath, destPath);
      loadEntries();
      window.dispatchEvent(new Event('junios:fs-change'));
    } catch {
      // Move failed
    }
  };

  /* ── trash drop ───────────────────────────────────────── */

  const handleTrashDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setTrashHover(true);
  };

  const handleTrashDragLeave = () => {
    setTrashHover(false);
  };

  const handleTrashDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setTrashHover(false);
    const sourcePath = e.dataTransfer.getData('text/plain');
    if (!sourcePath) return;
    try {
      await fs.delete(sourcePath);
      window.dispatchEvent(new Event('junios:fs-change'));
    } catch {
      // Delete failed
    }
  };

  return (
    <div className="desktop-icons" onClick={handleDesktopClick}>
      {entries.map((entry) => (
        <div
          key={entry.path}
          className={`desktop-icon ${selected === entry.path ? 'desktop-icon--selected' : ''} ${dropTarget === entry.path ? 'desktop-icon--drop-target' : ''}`}
          onClick={(e) => handleClick(e, entry.path)}
          onDoubleClick={() => handleDoubleClick(entry)}
          onContextMenu={(e) => handleIconContextMenu(e, entry)}
          draggable
          onDragStart={(e) => handleDragStart(e, entry)}
          onDragOver={(e) => handleDragOver(e, entry)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, entry)}
        >
          <span className="desktop-icon__emoji">
            {getIconForEntry(entry.name, entry.isDirectory)}
          </span>
          {renamingPath === entry.path ? (
            <input
              className="desktop-icon__rename-input"
              value={renamingValue}
              onChange={(e) => setRenamingValue(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  const newName = renamingValue.trim();
                  if (newName && newName !== entry.name) {
                    const parentDir = entry.path.substring(0, entry.path.lastIndexOf('/'));
                    await fs.move(entry.path, `${parentDir}/${newName}`);
                    window.dispatchEvent(new Event('junios:fs-change'));
                  }
                  setRenamingPath(null);
                } else if (e.key === 'Escape') {
                  setRenamingPath(null);
                }
              }}
              onBlur={() => setRenamingPath(null)}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <span className="desktop-icon__name">{entry.name}</span>
          )}
        </div>
      ))}

      {/* Trash icon */}
      <div
        className={`desktop-icon desktop-icon--trash ${trashHover ? 'desktop-icon--trash-hover' : ''}`}
        onDragOver={handleTrashDragOver}
        onDragLeave={handleTrashDragLeave}
        onDrop={handleTrashDrop}
      >
        <span className="desktop-icon__emoji">🗑️</span>
        <span className="desktop-icon__name">Trash</span>
      </div>

      {ctxMenu && createPortal(
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />,
        document.body
      )}
    </div>
  );
}
