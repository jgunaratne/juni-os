import { useEffect, useRef, useCallback } from 'react';
import './ContextMenu.css';

export interface MenuItem {
  label: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  divider?: boolean;
  onClick?: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Adjust position to keep menu inside viewport
  const adjustedPos = useCallback(() => {
    const el = ref.current;
    if (!el) return { left: x, top: y };
    const rect = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (x + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 4;
    if (y + rect.height > window.innerHeight) top = window.innerHeight - rect.height - 4;
    return { left: Math.max(0, left), top: Math.max(0, top) };
  }, [x, y]);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      const pos = adjustedPos();
      el.style.left = `${pos.left}px`;
      el.style.top = `${pos.top}px`;
    }
  }, [adjustedPos]);

  useEffect(() => {
    const handleClick = () => onClose();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Delay to prevent immediate close from the same click
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick);
      document.addEventListener('contextmenu', handleClick);
    }, 10);
    document.addEventListener('keydown', handleKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('contextmenu', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="context-menu" style={{ left: x, top: y }}>
      {items.map((item, i) => {
        if (item.divider) {
          return <div key={i} className="context-menu__divider" />;
        }
        return (
          <button
            key={i}
            className={`context-menu__item ${item.disabled ? 'context-menu__item--disabled' : ''}`}
            onClick={() => {
              item.onClick?.();
              onClose();
            }}
          >
            {item.icon && <span className="context-menu__item-icon">{item.icon}</span>}
            <span className="context-menu__item-label">{item.label}</span>
            {item.shortcut && <span className="context-menu__item-shortcut">{item.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}
