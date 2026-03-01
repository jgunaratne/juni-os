import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useWindowManager } from '@/kernel/windowManager';
import { useProcessManager } from '@/kernel/processManager';
import { useWorkspaceManager } from '@/kernel/workspaceManager';
import { getApp } from '@/shared/appRegistry';
import { ContextMenu } from '@/shell/ContextMenu/ContextMenu';
import type { MenuItem } from '@/shell/ContextMenu/ContextMenu';
import '../FileManager/FileManager.css';

/* ── Types ────────────────────────────────────────────── */

interface FsEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}

/* ── Icon helpers ─────────────────────────────────────── */

function fileIcon(entry: FsEntry): string {
  if (entry.isDirectory) return '📁';
  const ext = entry.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'txt': case 'md': return '📄';
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': return '🖼️';
    case 'mp3': case 'wav': case 'ogg': case 'flac': return '🎵';
    case 'mp4': case 'webm': case 'mkv': return '🎬';
    case 'pdf': return '📕';
    case 'json': return '📋';
    case 'ts': case 'tsx': case 'js': case 'jsx': return '⚡';
    case 'py': return '🐍';
    case 'sh': case 'bash': return '📜';
    case 'zip': case 'tar': case 'gz': case '7z': return '📦';
    case 'html': case 'css': return '🌐';
    default: return '📄';
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/* ── API helpers ──────────────────────────────────────── */

function getHome(): string {
  try {
    const raw = localStorage.getItem('junios-auth');
    if (raw) {
      const user = JSON.parse(raw);
      if (user?.name) return `/home/${user.name}`;
    }
  } catch { /* ignore */ }
  return '/home';
}

async function apiList(dirPath: string): Promise<{ path: string; entries: FsEntry[] }> {
  const res = await fetch(`/api/fs/list?path=${encodeURIComponent(dirPath)}`);
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}

async function apiMkdir(dirPath: string): Promise<void> {
  const res = await fetch('/api/fs/mkdir', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: dirPath }),
  });
  if (!res.ok) throw new Error((await res.json()).error);
}

async function apiMove(src: string, dest: string): Promise<void> {
  const res = await fetch('/api/fs/move', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ src, dest }),
  });
  if (!res.ok) throw new Error((await res.json()).error);
}

async function apiDelete(target: string): Promise<void> {
  const res = await fetch('/api/fs/delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: target }),
  });
  if (!res.ok) throw new Error((await res.json()).error);
}

/* ── Component ────────────────────────────────────────── */

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'];
const AUDIO_EXTS = ['wav', 'mp3', 'ogg', 'flac', 'aac', 'm4a', 'webm'];
const TEXT_EXTS = ['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'css', 'html', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'log', 'csv', 'py', 'sh'];

export default function LocalFiles() {
  const HOME = getHome();
  const LOCATIONS = [
    { name: 'Home', path: HOME, icon: '🏠' },
    { name: 'Documents', path: `${HOME}/Documents`, icon: '📂' },
    { name: 'Downloads', path: `${HOME}/Downloads`, icon: '⬇️' },
    { name: 'Workspace', path: `${HOME}/.openclaw/workspace`, icon: '🤖' },
    { name: 'Media', path: `${HOME}/.openclaw/media`, icon: '🖼️' },
  ];
  const openWindow = useWindowManager((s) => s.openWindow);
  const launchApp = useProcessManager((s) => s.launchApp);
  const { addWindowToWorkspace, getActiveWorkspace } = useWorkspaceManager();
  const [cwd, setCwd] = useState(HOME);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('list');
  const [loading, setLoading] = useState(true);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const [showHidden, setShowHidden] = useState(false);

  /* ── load directory ──────────────────────────────────── */

  const loadDir = useCallback(async (dirPath: string) => {
    setLoading(true);
    setSelected(null);
    try {
      const result = await apiList(dirPath);
      setEntries(result.entries);
      setCwd(result.path);
    } catch {
      setEntries([]);
    }
    setLoading(false);
  }, []);

  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;

  useEffect(() => { loadDir(HOME); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  /* ── navigation ──────────────────────────────────────── */

  const navigateTo = (p: string) => loadDir(p);

  const navigateUp = () => {
    if (cwd === HOME) return;
    const parent = cwd.slice(0, cwd.lastIndexOf('/')) || '/';
    if (!parent.startsWith(HOME.slice(0, HOME.lastIndexOf('/')))) return;
    loadDir(parent);
  };

  const handleOpen = (entry: FsEntry) => {
    if (entry.isDirectory) {
      navigateTo(entry.path);
      return;
    }
    const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
    const fileUrl = `/api/fs/download?path=${encodeURIComponent(entry.path)}`;

    if (IMAGE_EXTS.includes(ext)) {
      const app = getApp('image-viewer'); // Paint app
      if (app) {
        const ws = getActiveWorkspace();
        const wid = openWindow('image-viewer', entry.name, ws.id, app.defaultSize, { imageUrl: fileUrl });
        launchApp('image-viewer', wid);
        addWindowToWorkspace(ws.id, wid);
        return;
      }
    }

    if (AUDIO_EXTS.includes(ext)) {
      const app = getApp('sound');
      if (app) {
        const ws = getActiveWorkspace();
        const wid = openWindow('sound', entry.name, ws.id, app.defaultSize, { audioUrl: fileUrl, fileName: entry.name });
        launchApp('sound', wid);
        addWindowToWorkspace(ws.id, wid);
        return;
      }
    }

    if (TEXT_EXTS.includes(ext)) {
      const app = getApp('notes');
      if (app) {
        const ws = getActiveWorkspace();
        const wid = openWindow('notes', entry.name, ws.id, app.defaultSize, { filePath: entry.path });
        launchApp('notes', wid);
        addWindowToWorkspace(ws.id, wid);
        return;
      }
    }

    // Fallback: download
    window.open(fileUrl, '_blank');
  };

  /* ── actions ─────────────────────────────────────────── */

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    await apiMkdir(`${cwd}/${name}`);
    setShowNewFolder(false);
    setNewFolderName('');
    loadDir(cwd);
  };

  const deleteSelected = async () => {
    if (!selected) return;
    if (!confirm(`Delete ${selected.split('/').pop()}?`)) return;
    await apiDelete(selected);
    loadDir(cwd);
  };

  /* ── drag-and-drop ──────────────────────────────────── */

  const handleDragStart = (e: React.DragEvent, entry: FsEntry) => {
    e.dataTransfer.setData('text/plain', entry.path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, entry: FsEntry) => {
    if (!entry.isDirectory) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(entry.path);
  };

  const handleDragLeave = () => setDropTarget(null);

  const handleDrop = async (e: React.DragEvent, targetFolder: FsEntry) => {
    e.preventDefault();
    setDropTarget(null);
    if (!targetFolder.isDirectory) return;
    const sourcePath = e.dataTransfer.getData('text/plain');
    if (!sourcePath || sourcePath === targetFolder.path) return;
    const fileName = sourcePath.split('/').pop();
    if (!fileName) return;
    try {
      await apiMove(sourcePath, `${targetFolder.path}/${fileName}`);
      loadDir(cwd);
    } catch { /* ignore */ }
  };

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
    const parentDir = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
    if (parentDir === cwd) return;
    const fileName = sourcePath.split('/').pop();
    if (!fileName) return;
    try {
      await apiMove(sourcePath, `${cwd}/${fileName}`);
      loadDir(cwd);
    } catch { /* ignore */ }
  };

  /* ── context menu ───────────────────────────────────── */

  const handleItemContextMenu = (e: React.MouseEvent, entry: FsEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(entry.path);
    const items: MenuItem[] = [
      { label: 'Open', icon: '📂', onClick: () => handleOpen(entry) },
      {
        label: 'Rename', icon: '✏️',
        onClick: () => { setRenamingPath(entry.path); setRenamingValue(entry.name); },
      },
      ...(entry.isDirectory ? [] : [
        { label: 'Download', icon: '⬇️', onClick: () => window.open(`/api/fs/download?path=${encodeURIComponent(entry.path)}`, '_blank') },
      ]),
      { label: '', divider: true },
      {
        label: 'Delete', icon: '🗑️',
        onClick: async () => {
          if (!confirm(`Delete ${entry.name}?`)) return;
          await apiDelete(entry.path);
          loadDir(cwd);
        },
      },
    ];
    setCtxMenu({ x: e.clientX, y: e.clientY, items });
  };

  const handleBackgroundContextMenu = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.fm__file')) return;
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'New Folder', icon: '📁', onClick: () => setShowNewFolder(true) },
        { label: showHidden ? 'Hide Hidden Files' : 'Show Hidden Files', icon: '👁️', onClick: () => setShowHidden(!showHidden) },
        { label: '', divider: true },
        { label: 'Refresh', icon: '🔄', onClick: () => loadDir(cwd) },
      ],
    });
  };

  /* ── filtered entries ───────────────────────────────── */

  const visibleEntries = showHidden ? entries : entries.filter(e => !e.name.startsWith('.'));

  /* ── breadcrumbs ─────────────────────────────────────── */

  const relativePath = cwd.startsWith(HOME) ? cwd.slice(HOME.length) : cwd;
  const breadcrumbs = relativePath === '' || relativePath === '/'
    ? [{ label: '~', path: HOME }]
    : [
        { label: '~', path: HOME },
        ...relativePath.split('/').filter(Boolean).map((seg, i, arr) => ({
          label: seg,
          path: HOME + '/' + arr.slice(0, i + 1).join('/'),
        })),
      ];

  /* ── render ──────────────────────────────────────────── */

  return (
    <div className="fm">
      <aside className="fm__sidebar">
        <div className="fm__sidebar-title">Local</div>
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

      <div className="fm__main">
        <div className="fm__toolbar">
          <button className="fm__tool-btn" onClick={navigateUp} title="Go up">⬆️</button>
          <div className="fm__breadcrumbs">
            {breadcrumbs.map((bc, i) => (
              <span key={bc.path}>
                {i > 0 && <span className="fm__bc-sep">/</span>}
                <button className="fm__bc-btn" onClick={() => navigateTo(bc.path)}>{bc.label}</button>
              </span>
            ))}
          </div>
          <div className="fm__toolbar-right">
            <button className="fm__tool-btn" onClick={() => loadDir(cwd)} title="Refresh">🔄</button>
            <button className="fm__tool-btn" onClick={() => setShowNewFolder(true)} title="New Folder">➕</button>
            {selected && (
              <button className="fm__tool-btn fm__tool-btn--danger" onClick={deleteSelected} title="Delete">🗑️</button>
            )}
            <button className="fm__tool-btn" onClick={() => setView(view === 'grid' ? 'list' : 'grid')} title="Toggle view">
              {view === 'grid' ? '☰' : '⊞'}
            </button>
          </div>
        </div>

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

        {loading ? (
          <div className="fm__empty">Loading…</div>
        ) : visibleEntries.length === 0 ? (
          <div className="fm__empty" onDragOver={handleBackgroundDragOver} onDrop={handleBackgroundDrop}>
            Empty folder
          </div>
        ) : (
          <div className={`fm__files fm__files--${view}`} onContextMenu={handleBackgroundContextMenu} onDragOver={handleBackgroundDragOver} onDrop={handleBackgroundDrop}>
            {visibleEntries.map((entry) => (
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
                          await apiMove(entry.path, `${parentDir}/${newName}`);
                          loadDir(cwd);
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
                    <span className="fm__file-size">{entry.isDirectory ? '—' : formatSize(entry.size)}</span>
                    <span className="fm__file-date">{new Date(entry.modifiedAt).toLocaleDateString()}</span>
                  </>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      {ctxMenu && createPortal(
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />,
        document.body
      )}
    </div>
  );
}
