import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useWindowManager } from '@/kernel/windowManager';
import { useAuth } from '@/kernel/auth';
import { Clock } from './Clock';
import { CalendarDropdown } from './CalendarDropdown';
import { QuickSettings } from './QuickSettings';
import { AboutDialog } from '@/shell/AboutDialog/AboutDialog';
import './TopBar.css';

export function TopBar() {
  const focusedWindow = useWindowManager((s) => s.windows.find((w) => w.isFocused));
  const logout = useAuth((s) => s.logout);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showQuickSettings, setShowQuickSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showActivitiesMenu, setShowActivitiesMenu] = useState(false);

  const handleLock = useCallback(() => {
    // Dispatch a custom event that Desktop listens to
    window.dispatchEvent(new CustomEvent('junios:lock'));
  }, []);

  const handleActivities = useCallback(() => {
    setShowActivitiesMenu((v) => !v);
  }, []);

  return (
    <div className="top-bar">
      <div className="top-bar__left">
        <button className="top-bar__activities" onClick={handleActivities}>
          Activities
        </button>
        {showActivitiesMenu && (
          <ActivitiesMenu
            onClose={() => setShowActivitiesMenu(false)}
            onAbout={() => { setShowActivitiesMenu(false); setShowAbout(true); }}
          />
        )}
        {focusedWindow && (
          <span className="top-bar__app-name">{focusedWindow.title}</span>
        )}
      </div>
      <div className="top-bar__center">
        <button
          className="top-bar__clock-btn"
          onClick={() => { setShowCalendar(!showCalendar); setShowQuickSettings(false); }}
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            font: 'inherit',
            padding: 0,
          }}
        >
          <Clock />
        </button>
        {showCalendar && <CalendarDropdown onClose={() => setShowCalendar(false)} />}
      </div>
      <div className="top-bar__right">
        <div
          className="top-bar__indicators"
          onClick={() => { setShowQuickSettings(!showQuickSettings); setShowCalendar(false); }}
          style={{ cursor: 'pointer' }}
        >
          <SystemIndicators />
        </div>
        {showQuickSettings && (
          <QuickSettings
            onClose={() => setShowQuickSettings(false)}
            onLock={handleLock}
            onLogout={logout}
          />
        )}
      </div>
      {showAbout && createPortal(<AboutDialog onClose={() => setShowAbout(false)} />, document.body)}
    </div>
  );
}

function ActivitiesMenu({ onClose, onAbout }: { onClose: () => void; onAbout: () => void }) {
  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 100000 }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 4,
          zIndex: 100001,
          minWidth: 180,
          padding: '6px 0',
          borderRadius: 10,
          background: 'var(--os-chrome)',
          border: '1px solid var(--os-border)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '8px 16px',
            border: 'none',
            background: 'transparent',
            color: 'var(--os-text)',
            fontSize: 13,
            cursor: 'pointer',
            textAlign: 'left',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(128,128,128,0.12)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          onClick={onAbout}
        >
          💻 About JuniOS
        </button>
      </div>
    </>
  );
}

function SystemIndicators() {
  return (
    <>
      <span className="top-bar__indicator" title="Volume">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      </span>

    </>
  );
}
