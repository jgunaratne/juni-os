import { useState, useEffect, useRef, useCallback } from 'react';
import { useWindowManager } from '@/kernel/windowManager';
import { useProcessManager } from '@/kernel/processManager';
import { useWorkspaceManager } from '@/kernel/workspaceManager';
import { appRegistry } from '@/shared/appRegistry';
import type { AppManifest } from '@/shared/types';
import './Spotlight.css';

interface SpotlightProps {
  onClose: () => void;
}

export function Spotlight({ onClose }: SpotlightProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const openWindow = useWindowManager((s) => s.openWindow);
  const launchApp = useProcessManager((s) => s.launchApp);
  const { addWindowToWorkspace, getActiveWorkspace } = useWorkspaceManager();

  const results: AppManifest[] = query.trim()
    ? appRegistry.filter((app) =>
      app.title.toLowerCase().includes(query.toLowerCase()) ||
      app.id.toLowerCase().includes(query.toLowerCase())
    )
    : appRegistry;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const launch = useCallback(
    (app: AppManifest) => {
      const ws = getActiveWorkspace();
      const windowId = openWindow(app.id, app.title, ws.id, app.defaultSize);
      launchApp(app.id, windowId);
      addWindowToWorkspace(ws.id, windowId);
      onClose();
    },
    [openWindow, launchApp, addWindowToWorkspace, getActiveWorkspace, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        if (results[activeIndex]) {
          launch(results[activeIndex]);
        }
      }
    },
    [onClose, results, activeIndex, launch],
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).classList.contains('spotlight-overlay')) {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div className="spotlight-overlay" onClick={handleOverlayClick}>
      <div className="spotlight-box">
        <div className="spotlight-box__input-wrapper">
          <span className="spotlight-box__search-icon">🔍</span>
          <input
            ref={inputRef}
            className="spotlight-box__input"
            type="text"
            placeholder="Search apps..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="spotlight-box__results">
          {results.length === 0 ? (
            <div className="spotlight-box__empty">No results found</div>
          ) : (
            results.map((app, i) => (
              <div
                key={app.id}
                className={`spotlight-result ${i === activeIndex ? 'spotlight-result--active' : ''}`}
                onClick={() => launch(app)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span className="spotlight-result__icon">{app.icon}</span>
                <div className="spotlight-result__info">
                  <div className="spotlight-result__name">{app.title}</div>
                  <div className="spotlight-result__type">Application</div>
                </div>
                {i === 0 && query && (
                  <span className="spotlight-result__shortcut">↵</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
