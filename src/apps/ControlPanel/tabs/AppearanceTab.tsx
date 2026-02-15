import { useThemeManager, themePresets } from '@/kernel/themeManager';
import { ColorSwatch } from '../controls/ColorSwatch';

const accentColors = [
  { color: '#6c63ff', hover: '#7b73ff', name: 'Indigo' },
  { color: '#ff6b6b', hover: '#ff8080', name: 'Red' },
  { color: '#51cf66', hover: '#69db7c', name: 'Green' },
  { color: '#fcc419', hover: '#ffd43b', name: 'Gold' },
  { color: '#339af0', hover: '#4dabf7', name: 'Blue' },
  { color: '#e599f7', hover: '#f0abfc', name: 'Pink' },
  { color: '#ff922b', hover: '#ffa94d', name: 'Orange' },
  { color: '#20c997', hover: '#38d9a9', name: 'Teal' },
];

export function AppearanceTab() {
  const { currentTheme, setTheme, updateAccentColor } = useThemeManager();

  return (
    <div className="settings-tab">
      <h3 className="settings-tab__title">Appearance</h3>

      {/* Theme Presets */}
      <div className="settings-section">
        <div className="settings-section__label">Theme</div>
        <div className="theme-carousel">
          {themePresets.map((theme) => (
            <button
              key={theme.id}
              className={`theme-card ${currentTheme.id === theme.id ? 'theme-card--selected' : ''}`}
              onClick={() => setTheme(theme)}
            >
              <div
                className="theme-card__preview"
                style={{
                  background: theme.wallpaper.value,
                  borderColor: theme.colors.border,
                }}
              >
                <div
                  className="theme-card__chrome"
                  style={{ background: theme.colors.windowChrome }}
                >
                  <span
                    className="theme-card__dot"
                    style={{ background: '#ff5f57' }}
                  />
                  <span
                    className="theme-card__dot"
                    style={{ background: '#febc2e' }}
                  />
                  <span
                    className="theme-card__dot"
                    style={{ background: '#28c840' }}
                  />
                </div>
                <div
                  className="theme-card__body"
                  style={{ background: theme.colors.windowBackground }}
                />
              </div>
              <span className="theme-card__name">{theme.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Accent Color */}
      <div className="settings-section">
        <div className="settings-section__label">Accent Color</div>
        <div className="swatch-grid">
          {accentColors.map((ac) => (
            <ColorSwatch
              key={ac.color}
              color={ac.color}
              selected={currentTheme.colors.accent === ac.color}
              onClick={() => updateAccentColor(ac.color, ac.hover)}
              size={36}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
