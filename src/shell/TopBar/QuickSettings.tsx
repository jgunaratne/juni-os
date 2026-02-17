import { useState, useEffect, useRef } from 'react';
import { useThemeManager, themePresets } from '@/kernel/themeManager';
import './QuickSettings.css';

interface QuickSettingsProps {
  onClose: () => void;
  onLock: () => void;
  onLogout: () => void;
}

export function QuickSettings({ onClose, onLock, onLogout }: QuickSettingsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(75);
  const currentTheme = useThemeManager((s) => s.currentTheme);
  const setThemeById = useThemeManager((s) => s.setThemeById);

  const isDark = currentTheme.id === 'midnight' || currentTheme.id === 'retro';

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', handleClick), 10);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const toggleDarkMode = () => {
    if (isDark) {
      const light = themePresets.find((t) => t.id === 'paper');
      if (light) setThemeById(light.id);
    } else {
      const dark = themePresets.find((t) => t.id === 'midnight');
      if (dark) setThemeById(dark.id);
    }
  };

  const handleLock = () => {
    onClose();
    onLock();
  };

  const handleLogout = () => {
    onClose();
    onLogout();
  };

  return (
    <div ref={ref} className="quick-settings">
      <div className="quick-settings__toggles">
        <button
          className={`quick-settings__toggle ${isDark ? 'quick-settings__toggle--active' : ''}`}
          onClick={toggleDarkMode}
        >
          <span className="quick-settings__toggle-icon">{isDark ? '🌙' : '☀️'}</span>
          {isDark ? 'Dark' : 'Light'}
        </button>
      </div>

      <div className="quick-settings__divider" />

      <div className="quick-settings__slider-row">
        <span className="quick-settings__slider-icon">🔊</span>
        <input
          type="range"
          className="quick-settings__slider"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
        <span className="quick-settings__slider-value">{volume}%</span>
      </div>

      <div className="quick-settings__divider" />

      <div className="quick-settings__actions">
        <button className="quick-settings__action-btn" onClick={handleLock}>
          🔒 Lock
        </button>
        <button className="quick-settings__action-btn quick-settings__action-btn--danger" onClick={handleLogout}>
          🚪 Log Out
        </button>
      </div>
    </div>
  );
}
