import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppComponentProps } from '@/shared/types';
import { useWindowManager } from '@/kernel/windowManager';
import { useProcessManager } from '@/kernel/processManager';
import { useWorkspaceManager } from '@/kernel/workspaceManager';
import { getApp } from '@/shared/appRegistry';
import './GoogleDrive.css';

/* ── GIS types (minimal) ─────────────────────────────────── */

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }): { requestAccessToken(): void };
        };
      };
    };
  }
}

/* ── Drive API helpers ───────────────────────────────────── */

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  iconLink?: string;
  parents?: string[];
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

function driveIcon(mime: string): string {
  if (mime === FOLDER_MIME) return '📁';
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime.includes('spreadsheet')) return '📊';
  if (mime.includes('presentation')) return '📽️';
  if (mime.includes('document') || mime.includes('word')) return '📝';
  if (mime.includes('pdf')) return '📕';
  if (mime.includes('zip') || mime.includes('archive') || mime.includes('compressed')) return '📦';
  if (mime.includes('text') || mime.includes('json') || mime.includes('xml')) return '📄';
  return '📄';
}

async function listDriveFiles(
  token: string,
  folderId: string,
): Promise<DriveFile[]> {
  const q = `'${folderId}' in parents and trashed = false`;
  const fields = 'files(id,name,mimeType,modifiedTime,size,webViewLink,parents)';
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&orderBy=folder,name&pageSize=200`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('AUTH_EXPIRED');
    throw new Error(`Drive API error: ${res.status}`);
  }
  const data = await res.json();
  return data.files || [];
}

async function getDriveQuota(token: string): Promise<{ used: number; total: number } | null> {
  try {
    const res = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=storageQuota',
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const sq = data.storageQuota;
    return { used: parseInt(sq.usage || '0'), total: parseInt(sq.limit || '0') };
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/* ── Sidebar locations ───────────────────────────────────── */

interface NavLocation {
  name: string;
  icon: string;
  folderId: string;
}

const LOCATIONS: NavLocation[] = [
  { name: 'My Drive', icon: '💾', folderId: 'root' },
];

/* ── Component ───────────────────────────────────────────── */

export default function GoogleDrive(_props: AppComponentProps) {
  /* Kernel hooks */
  const openWindow = useWindowManager((s) => s.openWindow);
  const launchApp = useProcessManager((s) => s.launchApp);
  const { addWindowToWorkspace, getActiveWorkspace } = useWorkspaceManager();

  /* Auth state */
  const [token, setToken] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientIdLoading, setClientIdLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  /* Fetch client ID from server .env on mount */
  useEffect(() => {
    fetch('/api/config/google-drive')
      .then((r) => r.json())
      .then((data) => setClientId(data.clientId || ''))
      .catch(() => setAuthError('Could not reach server to load OAuth config.'))
      .finally(() => setClientIdLoading(false));
  }, []);

  /* File browser state */
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [quota, setQuota] = useState<{ used: number; total: number } | null>(null);

  /* Navigation */
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([
    { id: 'root', name: 'My Drive' },
  ]);
  const currentFolderId = folderStack[folderStack.length - 1].id;

  const tokenRef = useRef(token);
  tokenRef.current = token;

  /* ── Load files ──────────────────────────────────────────── */

  const loadFiles = useCallback(
    async (folderId: string) => {
      const t = tokenRef.current;
      if (!t) return;
      setLoading(true);
      setSelected(null);
      try {
        const result = await listDriveFiles(t, folderId);
        setFiles(result);
      } catch (err) {
        if (err instanceof Error && err.message === 'AUTH_EXPIRED') {
          setToken(null);
          setAuthError('Session expired — please sign in again.');
        }
        setFiles([]);
      }
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    if (token) {
      loadFiles(currentFolderId);
      getDriveQuota(token).then(setQuota);
    }
  }, [token, currentFolderId, loadFiles]);

  /* ── Auth ─────────────────────────────────────────────────── */

  const handleSignIn = useCallback(() => {
    const id = clientId.trim();
    if (!id) {
      setAuthError('OAuth Client ID not configured. Set GOOGLE_DRIVE_CLIENT_ID in server/.env.');
      return;
    }

    if (!window.google?.accounts?.oauth2) {
      setAuthError('Google Identity Services not loaded yet. Please wait and try again.');
      return;
    }

    setAuthLoading(true);
    setAuthError('');

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: id,
      scope: SCOPES,
      callback: (resp) => {
        setAuthLoading(false);
        if (resp.error) {
          setAuthError(`Sign-in failed: ${resp.error}`);
          return;
        }
        if (resp.access_token) {
          setToken(resp.access_token);
        }
      },
    });
    client.requestAccessToken();
  }, [clientId]);

  const handleSignOut = useCallback(() => {
    setToken(null);
    setFiles([]);
    setFolderStack([{ id: 'root', name: 'My Drive' }]);
    setQuota(null);
  }, []);

  /* ── Navigation ──────────────────────────────────────────── */

  const navigateInto = useCallback(
    (file: DriveFile) => {
      if (file.mimeType !== FOLDER_MIME) return;
      setFolderStack((prev) => [...prev, { id: file.id, name: file.name }]);
    },
    [],
  );

  const navigateTo = useCallback(
    (index: number) => {
      setFolderStack((prev) => prev.slice(0, index + 1));
    },
    [],
  );

  const navigateUp = useCallback(() => {
    if (folderStack.length <= 1) return;
    setFolderStack((prev) => prev.slice(0, -1));
  }, [folderStack.length]);

  /* ── Open file ───────────────────────────────────────────── */

  const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff'];

  const handleOpen = useCallback(
    async (file: DriveFile) => {
      if (file.mimeType === FOLDER_MIME) {
        navigateInto(file);
        return;
      }

      /* Image → download & open in Paint */
      if (IMAGE_MIMES.includes(file.mimeType) && tokenRef.current) {
        try {
          const res = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
            { headers: { Authorization: `Bearer ${tokenRef.current}` } },
          );
          if (!res.ok) throw new Error('Download failed');
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);

          const app = getApp('image-viewer'); // Paint's registry id
          if (app) {
            const ws = getActiveWorkspace();
            const wId = openWindow('image-viewer', file.name, ws.id, app.defaultSize, { imageUrl: blobUrl });
            launchApp('image-viewer', wId);
            addWindowToWorkspace(ws.id, wId);
          }
        } catch {
          // Fallback to browser tab
          if (file.webViewLink) window.open(file.webViewLink, '_blank');
        }
        return;
      }

      /* Everything else → open in browser */
      if (file.webViewLink) {
        window.open(file.webViewLink, '_blank');
      }
    },
    [navigateInto, openWindow, launchApp, addWindowToWorkspace, getActiveWorkspace],
  );

  const handleSidebarNav = useCallback(
    (loc: NavLocation) => {
      setFolderStack([{ id: loc.folderId, name: loc.name }]);
    },
    [],
  );

  /* ── Sort files: folders first, then alphabetical ──────── */

  const sortedFiles = [...files].sort((a, b) => {
    const aFolder = a.mimeType === FOLDER_MIME ? 0 : 1;
    const bFolder = b.mimeType === FOLDER_MIME ? 0 : 1;
    if (aFolder !== bFolder) return aFolder - bFolder;
    return a.name.localeCompare(b.name);
  });

  /* ══════════ Login screen ══════════ */

  if (!token) {
    return (
      <div className="gd">
        <div className="gd__login">
          <span className="gd__login-icon">🖥️</span>
          <span className="gd__login-title">Google Drive</span>
          <span className="gd__login-desc">
            Sign in with your Google account to browse files and folders from Google Drive.
          </span>

          {clientIdLoading ? (
            <span className="gd__login-desc">Loading configuration…</span>
          ) : !clientId ? (
            <div className="gd__login-error">
              OAuth Client ID not configured. Set <code>GOOGLE_DRIVE_CLIENT_ID</code> in <code>server/.env</code>.
            </div>
            ) : (
              <button
                className="gd__login-btn"
                onClick={handleSignIn}
                disabled={authLoading}
              >
                {authLoading ? '⏳ Signing in…' : '🔐 Sign in with Google'}
              </button>
          )}

          {authError && <div className="gd__login-error">{authError}</div>}
        </div>
      </div>
    );
  }

  /* ══════════ File browser ══════════ */

  return (
    <div className="gd">
      {/* Sidebar */}
      <aside className="gd__sidebar">
        <div className="gd__sidebar-title">Google Drive</div>
        {LOCATIONS.map((loc) => (
          <button
            key={loc.folderId}
            className={`gd__loc ${folderStack.length === 1 && currentFolderId === loc.folderId ? 'gd__loc--active' : ''}`}
            onClick={() => handleSidebarNav(loc)}
          >
            <span className="gd__loc-icon">{loc.icon}</span>
            <span>{loc.name}</span>
          </button>
        ))}
        <div className="gd__sidebar-spacer" />
        {quota && quota.total > 0 && (
          <div className="gd__quota">
            <span>{formatBytes(quota.used)} of {formatBytes(quota.total)}</span>
            <div className="gd__quota-bar">
              <div className="gd__quota-fill" style={{ width: `${Math.min(100, (quota.used / quota.total) * 100)}%` }} />
            </div>
          </div>
        )}
        <button className="gd__signout-btn" onClick={handleSignOut}>
          🚪 Sign Out
        </button>
      </aside>

      {/* Main area */}
      <div className="gd__main">
        {/* Toolbar */}
        <div className="gd__toolbar">
          <button className="gd__tool-btn" onClick={navigateUp} disabled={folderStack.length <= 1} title="Go up">
            ⬆️
          </button>
          <button className="gd__tool-btn" onClick={() => loadFiles(currentFolderId)} title="Refresh">
            🔄
          </button>

          <div className="gd__breadcrumbs">
            {folderStack.map((bc, i) => (
              <span key={bc.id + i}>
                {i > 0 && <span className="gd__bc-sep">/</span>}
                <button className="gd__bc-btn" onClick={() => navigateTo(i)}>
                  {bc.name}
                </button>
              </span>
            ))}
          </div>

          <div className="gd__toolbar-right">
            <button
              className="gd__tool-btn"
              onClick={() => setView(view === 'grid' ? 'list' : 'grid')}
              title="Toggle view"
            >
              {view === 'grid' ? '☰' : '⊞'}
            </button>
          </div>
        </div>

        {/* File grid / list */}
        {loading ? (
          <div className="gd__empty">
            <div className="gd__spinner" />
            <span>Loading…</span>
          </div>
        ) : sortedFiles.length === 0 ? (
          <div className="gd__empty">This folder is empty</div>
        ) : (
          <div className={`gd__files gd__files--${view}`}>
            {sortedFiles.map((file) => (
              <button
                key={file.id}
                className={`gd__file ${selected === file.id ? 'gd__file--selected' : ''}`}
                onClick={() => setSelected(file.id)}
                onDoubleClick={() => handleOpen(file)}
              >
                <span className="gd__file-icon">{driveIcon(file.mimeType)}</span>
                <span className="gd__file-name">{file.name}</span>
                {view === 'list' && (
                  <span className="gd__file-meta">
                    {file.modifiedTime
                      ? new Date(file.modifiedTime).toLocaleDateString()
                      : ''}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
