import { useCallback, useEffect } from 'react';
import { useWorkspaceManager } from '@/kernel/workspaceManager';
import { useWindowManager } from '@/kernel/windowManager';
import './WorkspaceOverview.css';

/**
 * Full-screen overlay showing workspace thumbnails.
 * Triggered via Meta key or Activities button.
 */
export function WorkspaceOverview() {
  const workspaces = useWorkspaceManager((s) => s.workspaces);
  const activeIndex = useWorkspaceManager((s) => s.activeIndex);
  const switchWorkspace = useWorkspaceManager((s) => s.switchWorkspace);
  const setOverviewOpen = useWorkspaceManager((s) => s.setOverviewOpen);
  const windows = useWindowManager((s) => s.windows);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOverviewOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setOverviewOpen]);

  const handleSelectWorkspace = useCallback(
    (index: number) => {
      switchWorkspace(index);
      setOverviewOpen(false);
    },
    [switchWorkspace, setOverviewOpen],
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).classList.contains('workspace-overview')) {
        setOverviewOpen(false);
      }
    },
    [setOverviewOpen],
  );

  return (
    <div className="workspace-overview" onClick={handleBackdropClick}>
      {/* ── Workspace Strip ────────────────────────────── */}
      <div className="workspace-strip">
        {workspaces.map((ws, idx) => {
          const wsWindows = windows.filter((w) => ws.windows.includes(w.id));
          const isActive = idx === activeIndex;
          const isEmpty = wsWindows.length === 0;

          return (
            <div
              key={ws.id}
              className={[
                'workspace-thumb',
                isActive && 'workspace-thumb--active',
                isEmpty && 'workspace-thumb--empty',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => handleSelectWorkspace(idx)}
              title={`Workspace ${idx + 1}`}
            >
              {isEmpty ? (
                <span className="workspace-thumb__plus">+</span>
              ) : (
                <>
                  {wsWindows
                    .filter((w) => w.status !== 'minimized')
                    .map((w) => (
                      <MiniWindow key={w.id} win={w} focused={w.isFocused} />
                    ))}
                </>
              )}
              <span className="workspace-thumb__label">
                {idx + 1}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Hint bar ───────────────────────────────────── */}
      <div className="workspace-overview__hint">
        <kbd>Ctrl</kbd> + <kbd>←</kbd> <kbd>→</kbd> switch workspaces &nbsp;·&nbsp;
        <kbd>Esc</kbd> close
      </div>
    </div>
  );
}

/* ─── Mini Window (scaled representation inside thumb) ──── */

interface MiniWindowProps {
  win: { position: { x: number; y: number }; size: { width: number; height: number }; isFocused: boolean };
  focused: boolean;
}

/** Approximate desktop area for scaling. */
const DESKTOP_W = 1200;
const DESKTOP_H = 750;
const THUMB_W = 200;
const THUMB_H = 125;

function MiniWindow({ win, focused }: MiniWindowProps) {
  const scaleX = THUMB_W / DESKTOP_W;
  const scaleY = THUMB_H / DESKTOP_H;

  const left = Math.max(0, Math.min(win.position.x * scaleX, THUMB_W - 10));
  const top = Math.max(0, Math.min(win.position.y * scaleY, THUMB_H - 10));
  const width = Math.max(12, Math.min(win.size.width * scaleX, THUMB_W - left));
  const height = Math.max(10, Math.min(win.size.height * scaleY, THUMB_H - top));

  return (
    <div
      className={`workspace-thumb__mini-window${focused ? ' workspace-thumb__mini-window--focused' : ''}`}
      style={{ left, top, width, height }}
    >
      <div className="workspace-thumb__mini-titlebar" />
    </div>
  );
}
