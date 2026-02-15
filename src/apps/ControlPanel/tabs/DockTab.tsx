import { useDockConfig } from '@/kernel/dockConfigManager';
import { Slider } from '../controls/Slider';
import { Toggle } from '../controls/Toggle';
import type { DockPosition } from '@/shared/types';

export function DockTab() {
  const {
    position,
    autoHide,
    iconSize,
    magnification,
    setPosition,
    setIconSize,
    toggleAutoHide,
    toggleMagnification,
  } = useDockConfig();

  return (
    <div className="settings-tab">
      <h3 className="settings-tab__title">Dock</h3>

      {/* Position */}
      <div className="settings-section">
        <div className="settings-section__label">Position on Screen</div>
        <div className="radio-group">
          {(['left', 'bottom'] as DockPosition[]).map((pos) => (
            <button
              key={pos}
              className={`radio-btn ${position === pos ? 'radio-btn--active' : ''}`}
              onClick={() => setPosition(pos)}
            >
              <span className={`radio-btn__icon radio-btn__icon--${pos}`} />
              {pos.charAt(0).toUpperCase() + pos.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Icon Size */}
      <div className="settings-section">
        <Slider
          label="Icon Size"
          value={iconSize}
          min={32}
          max={64}
          step={2}
          unit="px"
          onChange={setIconSize}
        />
      </div>

      {/* Toggles */}
      <div className="settings-section">
        <Toggle
          label="Auto-hide Dock"
          checked={autoHide}
          onChange={toggleAutoHide}
        />
        <Toggle
          label="Magnification on Hover"
          checked={magnification}
          onChange={toggleMagnification}
        />
      </div>
    </div>
  );
}
