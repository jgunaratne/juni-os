import { useThemeManager } from '@/kernel/themeManager';
import { Slider } from '../controls/Slider';

export function DisplayTab() {
  const { currentTheme, updateThemeProperty } = useThemeManager();

  return (
    <div className="settings-tab">
      <h3 className="settings-tab__title">Display</h3>

      <div className="settings-section">
        <Slider
          label="Animation Speed"
          value={currentTheme.animationSpeed}
          min={0}
          max={2}
          step={0.1}
          unit="×"
          onChange={(v) => updateThemeProperty('animationSpeed', v)}
        />

        <Slider
          label="Blur Intensity"
          value={currentTheme.blur}
          min={0}
          max={24}
          step={1}
          unit="px"
          onChange={(v) => updateThemeProperty('blur', v)}
        />

        <Slider
          label="Transparency"
          value={currentTheme.transparency}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => updateThemeProperty('transparency', v)}
        />

        <Slider
          label="Corner Radius"
          value={currentTheme.cornerRadius}
          min={0}
          max={24}
          step={1}
          unit="px"
          onChange={(v) => updateThemeProperty('cornerRadius', v)}
        />
      </div>
    </div>
  );
}
