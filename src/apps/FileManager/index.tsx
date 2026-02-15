import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFileSystem } from '@/kernel/fileSystem';
import { useWindowManager } from '@/kernel/windowManager';
import { useProcessManager } from '@/kernel/processManager';
import { useWorkspaceManager } from '@/kernel/workspaceManager';
import { getApp } from '@/shared/appRegistry';
import { ContextMenu } from '@/shell/ContextMenu/ContextMenu';
import type { MenuItem } from '@/shell/ContextMenu/ContextMenu';
import type { FileEntry, AppComponentProps } from '@/shared/types';
import './FileManager.css';

/* ── Icon helpers ─────────────────────────────────────────── */

function fileIcon(entry: FileEntry): string {
  if (entry.isDirectory) return '📁';
  const ext = entry.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'txt': case 'md': return '📄';
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': return '🖼️';
    case 'mp3': case 'wav': case 'ogg': return '🎵';
    case 'mp4': case 'webm': return '🎬';
    case 'pdf': return '📕';
    case 'json': return '📋';
    case 'ts': case 'tsx': case 'js': case 'jsx': return '⚡';
    default: return '📄';
  }
}

/* ── Quick-access locations ───────────────────────────────── */

const LOCATIONS = [
  { name: 'Home', path: '/home', icon: '🏠' },
  { name: 'Documents', path: '/home/Documents', icon: '📂' },
  { name: 'Pictures', path: '/home/Pictures', icon: '🖼️' },
  { name: 'Desktop', path: '/home/Desktop', icon: '🖥️' },
  { name: 'Downloads', path: '/home/Downloads', icon: '⬇️' },
];

/* ── Component ────────────────────────────────────────────── */

export default function FileManager({ windowId }: AppComponentProps) {
  const fs = useFileSystem();
  const windows = useWindowManager((s) => s.windows);
  const openWindow = useWindowManager((s) => s.openWindow);
  const launchApp = useProcessManager((s) => s.launchApp);
  const { addWindowToWorkspace, getActiveWorkspace } = useWorkspaceManager();

  const win = windows.find((w) => w.id === windowId);
  const initialPath = (win?.metadata?.initialPath as string) || '/home';

  const [cwd, setCwd] = useState(initialPath);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [loading, setLoading] = useState(true);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  /* ── new-folder dialog state */
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');

  /* ── load directory ──────────────────────────────────────── */

  const loadDir = useCallback(async (path: string) => {
    setLoading(true);
    setSelected(null);
    try {
      const list = await fs.list(path);
      setEntries(list);
      setCwd(path);
    } catch {
      setEntries([]);
    }
    setLoading(false);
  }, [fs]);

  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;

  useEffect(() => {
    loadDir(cwdRef.current);
    const handleFsChange = () => loadDir(cwdRef.current);
    window.addEventListener('junios:fs-change', handleFsChange);
    return () => window.removeEventListener('junios:fs-change', handleFsChange);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  /* ── navigation ──────────────────────────────────────────── */

  const navigateTo = (path: string) => loadDir(path);

  const navigateUp = () => {
    if (cwd === '/') return;
    const parent = cwd.slice(0, cwd.lastIndexOf('/')) || '/';
    loadDir(parent);
  };

  const handleOpen = (entry: FileEntry) => {
    if (entry.isDirectory) {
      navigateTo(entry.path);
      return;
    }
    const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];
    const textExts = ['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'css', 'html', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'log', 'csv'];
    let appId: string | null = null;
    if (imageExts.includes(ext)) appId = 'image-viewer';
    else if (textExts.includes(ext)) appId = 'notes';
    if (!appId) return;
    const app = getApp(appId);
    if (!app) return;
    const ws = getActiveWorkspace();
    const windowId = openWindow(appId, entry.name, ws.id, app.defaultSize, { filePath: entry.path });
    launchApp(appId, windowId);
    addWindowToWorkspace(ws.id, windowId);
  };

  /* ── actions ─────────────────────────────────────────────── */

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    await fs.mkdir(`${cwd}/${name}`);
    setShowNewFolder(false);
    setNewFolderName('');
    loadDir(cwd);
    window.dispatchEvent(new Event('junios:fs-change'));
  };

  /* ── drag-and-drop ──────────────────────────────────────── */

  const handleDragStart = (e: React.DragEvent, entry: FileEntry) => {
    e.dataTransfer.setData('text/plain', entry.path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, entry: FileEntry) => {
    if (!entry.isDirectory) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(entry.path);
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = async (e: React.DragEvent, targetFolder: FileEntry) => {
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
      loadDir(cwd);
      window.dispatchEvent(new Event('junios:fs-change'));
    } catch {
      // Move failed (e.g. name collision)
    }
  };

  const deleteSelected = async () => {
    if (!selected) return;
    await fs.delete(selected);
    loadDir(cwd);
    window.dispatchEvent(new Event('junios:fs-change'));
  };

  /* ── context menu ─────────────────────────────────────── */

  const handleItemContextMenu = (e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(entry.path);
    const items: MenuItem[] = [
      { label: 'Open', icon: '📂', onClick: () => handleOpen(entry) },
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
          loadDir(cwd);
          window.dispatchEvent(new Event('junios:fs-change'));
        },
      },
    ];
    setCtxMenu({ x: e.clientX, y: e.clientY, items });
  };

  const handleBackgroundContextMenu = (e: React.MouseEvent) => {
    // only if clicking empty space in the files area
    const target = e.target as HTMLElement;
    if (target.closest('.fm__file')) return;
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'New Folder',
          icon: '📁',
          onClick: () => setShowNewFolder(true),
        },
      ],
    });
  };
  /* ── background drop (cross-window / from desktop) ─────── */

  const handleBackgroundDragOver = (e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.fm__file')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleBackgroundDrop = async (e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.fm__file')) return;
    e.preventDefault();
    const sourcePath = e.dataTransfer.getData('text/plain');
    if (!sourcePath) return;
    // Don't move if already in this directory
    const parentDir = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
    if (parentDir === cwd) return;
    const fileName = sourcePath.split('/').pop();
    if (!fileName) return;
    try {
      await fs.move(sourcePath, `${cwd}/${fileName}`);
      loadDir(cwd);
      window.dispatchEvent(new Event('junios:fs-change'));
    } catch {
      // Move failed
    }
  };

  /* ── breadcrumbs ─────────────────────────────────────────── */

  const breadcrumbs = cwd === '/'
    ? [{ label: '/', path: '/' }]
    : cwd.split('/').filter(Boolean).reduce<{ label: string; path: string }[]>((acc, seg) => {
      const prev = acc.length ? acc[acc.length - 1].path : '';
      acc.push({ label: seg, path: `${prev}/${seg}` });
      return acc;
    }, []);

  /* ── render ──────────────────────────────────────────────── */

  return (
    <div className="fm">
      {/* Sidebar */}
      <aside className="fm__sidebar">
        <div className="fm__sidebar-title">Places</div>
        {LOCATIONS.map((loc) => (
          <button
            key={loc.path}
            className={`fm__loc ${cwd === loc.path ? 'fm__loc--active' : ''}`}
            onClick={() => navigateTo(loc.path)}
          >
            <span className="fm__loc-icon">{loc.icon}</span>
            <span>{loc.name}</span>
          </button>
        ))}
      </aside>

      {/* Main area */}
      <div className="fm__main">
        {/* Toolbar */}
        <div className="fm__toolbar">
          <button className="fm__tool-btn" onClick={navigateUp} title="Go up">
            ⬆️
          </button>

          <div className="fm__breadcrumbs">
            {breadcrumbs.map((bc, i) => (
              <span key={bc.path}>
                {i > 0 && <span className="fm__bc-sep">/</span>}
                <button className="fm__bc-btn" onClick={() => navigateTo(bc.path)}>
                  {bc.label}
                </button>
              </span>
            ))}
          </div>

          <div className="fm__toolbar-right">
            <button
              className="fm__tool-btn"
              onClick={() => setShowNewFolder(true)}
              title="New Folder"
            >
              ➕
            </button>
            {selected && (
              <button
                className="fm__tool-btn fm__tool-btn--danger"
                onClick={deleteSelected}
                title="Delete"
              >
                🗑️
              </button>
            )}
            <button
              className="fm__tool-btn"
              onClick={() => setView(view === 'grid' ? 'list' : 'grid')}
              title="Toggle view"
            >
              {view === 'grid' ? '☰' : '⊞'}
            </button>
          </div>
        </div>

        {/* New folder dialog */}
        {showNewFolder && (
          <div className="fm__new-folder">
            <input
              className="fm__new-folder-input"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createFolder()}
              autoFocus
            />
            <button className="fm__new-folder-ok" onClick={createFolder}>Create</button>
            <button className="fm__new-folder-cancel" onClick={() => setShowNewFolder(false)}>Cancel</button>
          </div>
        )}

        {/* File grid / list */}
        {loading ? (
          <div className="fm__empty">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="fm__empty" onDragOver={handleBackgroundDragOver} onDrop={handleBackgroundDrop}>Empty folder</div>
        ) : (
          <div className={`fm__files fm__files--${view}`} onContextMenu={handleBackgroundContextMenu} onDragOver={handleBackgroundDragOver} onDrop={handleBackgroundDrop}>
            {entries.map((entry) => (
              <button
                key={entry.path}
                className={`fm__file ${selected === entry.path ? 'fm__file--selected' : ''} ${dropTarget === entry.path ? 'fm__file--drop-target' : ''}`}
                onClick={() => setSelected(entry.path)}
                onDoubleClick={() => handleOpen(entry)}
                onContextMenu={(e) => handleItemContextMenu(e, entry)}
                draggable
                onDragStart={(e) => handleDragStart(e, entry)}
                onDragOver={(e) => handleDragOver(e, entry)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, entry)}
              >
                <span className="fm__file-icon">{fileIcon(entry)}</span>
                {renamingPath === entry.path ? (
                  <input
                    className="fm__file-rename-input"
                    value={renamingValue}
                    onChange={(e) => setRenamingValue(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        const newName = renamingValue.trim();
                        if (newName && newName !== entry.name) {
                          const parentDir = entry.path.substring(0, entry.path.lastIndexOf('/'));
                          await fs.move(entry.path, `${parentDir}/${newName}`);
                          loadDir(cwd);
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
                  <span className="fm__file-name">{entry.name}</span>
                )}
                {view === 'list' && (
                  <>
                    <span className="fm__file-size">
                      {entry.isDirectory ? '—' : `${entry.size} B`}
                    </span>
                    <span className="fm__file-date">
                      {new Date(entry.modifiedAt).toLocaleDateString()}
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
        )}
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
