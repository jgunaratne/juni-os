import { useThemeManager } from '@/kernel/themeManager';
import { Slider } from '../controls/Slider';

const fontOptions = [
  { label: 'Inter', value: "'Inter', sans-serif" },
  { label: 'Roboto', value: "'Roboto', sans-serif" },
  { label: 'Fira Code', value: "'Fira Code', monospace" },
  { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
  { label: 'System UI', value: "system-ui, sans-serif" },
];

export function TypographyTab() {
  const { currentTheme, updateThemeProperty } = useThemeManager();

  return (
    <div className="settings-tab">
      <h3 className="settings-tab__title">Typography</h3>

      {/* Font Family */}
      <div className="settings-section">
        <div className="settings-section__label">Font Family</div>
        <div className="font-list">
          {fontOptions.map((font) => (
            <button
              key={font.value}
              className={`font-option ${currentTheme.fontFamily === font.value ? 'font-option--active' : ''}`}
              style={{ fontFamily: font.value }}
              onClick={() => updateThemeProperty('fontFamily', font.value)}
            >
              <span className="font-option__name">{font.label}</span>
              <span className="font-option__sample">The quick brown fox</span>
            </button>
          ))}
        </div>
      </div>

      {/* Font Size */}
      <div className="settings-section">
        <Slider
          label="Font Size"
          value={currentTheme.fontSize}
          min={12}
          max={18}
          step={1}
          unit="px"
          onChange={(v) => updateThemeProperty('fontSize', v)}
        />
      </div>
    </div>
  );
}
