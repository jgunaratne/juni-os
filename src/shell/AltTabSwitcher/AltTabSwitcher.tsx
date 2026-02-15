import { useEffect, useState, useCallback } from 'react';
import { useWindowManager } from '@/kernel/windowManager';
import { getApp } from '@/shared/appRegistry';
import type { WindowState } from '@/shared/types';
import './AltTabSwitcher.css';

export function AltTabSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const windows = useWindowManager((s) => s.windows);
  const focusWindow = useWindowManager((s) => s.focusWindow);

  // Get all windows sorted by z-index descending
  const allWindows = windows.sort((a, b) => b.zIndex - a.zIndex);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Tab' && e.altKey) {
        e.preventDefault();
        e.stopPropagation();

        if (!isOpen) {
          setIsOpen(true);
          setSelectedIndex(allWindows.length > 1 ? 1 : 0);
        } else {
          setSelectedIndex((prev) => {
            const dir = e.shiftKey ? -1 : 1;
            const next = prev + dir;
            if (next < 0) return allWindows.length - 1;
            if (next >= allWindows.length) return 0;
            return next;
          });
        }
      }
    },
    [isOpen, allWindows.length],
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Alt' && isOpen) {
        e.preventDefault();
        const target = allWindows[selectedIndex];
        if (target) {
          focusWindow(target.id);
        }
        setIsOpen(false);
        setSelectedIndex(0);
      }
    },
    [isOpen, selectedIndex, allWindows, focusWindow],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [handleKeyDown, handleKeyUp]);

  if (!isOpen || allWindows.length === 0) return null;

  return (
    <div className="alt-tab-overlay">
      <div className="alt-tab-panel">
        {allWindows.map((win: WindowState, i: number) => {
          const app = getApp(win.appId);
          return (
            <div
              key={win.id}
              className={`alt-tab-item ${i === selectedIndex ? 'alt-tab-item--active' : ''}`}
              onClick={() => {
                focusWindow(win.id);
                setIsOpen(false);
              }}
            >
              <span className="alt-tab-item__icon">{app?.icon ?? '📄'}</span>
              <span className="alt-tab-item__title">{win.title}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
