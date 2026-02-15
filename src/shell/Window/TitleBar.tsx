import './TitleBar.css';

interface TitleBarProps {
  title: string;
  isActive: boolean;
  isMaximized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onDoubleClick: () => void;
}

export function TitleBar({ title, isActive, isMaximized, onClose, onMinimize, onMaximize, onDoubleClick }: TitleBarProps) {
  return (
    <div
      className={`title-bar ${isActive ? 'title-bar--active' : ''}`}
      onDoubleClick={onDoubleClick}
    >
      <div className="title-bar__buttons">
        <button
          className="title-bar__btn title-bar__btn--close"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          title="Close"
        >
          <svg viewBox="0 0 12 12" width="10" height="10">
            <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <button
          className="title-bar__btn title-bar__btn--minimize"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onMinimize(); }}
          title="Minimize"
        >
          <svg viewBox="0 0 12 12" width="10" height="10">
            <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <button
          className="title-bar__btn title-bar__btn--maximize"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onMaximize(); }}
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <svg viewBox="0 0 12 12" width="10" height="10">
              <rect x="3" y="3" width="6" height="6" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12" width="10" height="10">
              <rect x="2" y="2" width="8" height="8" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          )}
        </button>
      </div>
      <div className="title-bar__title">{title}</div>
      <div className="title-bar__spacer" />
    </div>
  );
}
