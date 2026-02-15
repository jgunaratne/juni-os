import { useState } from 'react';
import { useThemeManager } from '@/kernel/themeManager';

const gradientPresets = [
  { name: 'Midnight', value: 'linear-gradient(135deg, #0d0d2b 0%, #1a1a4e 50%, #0d0d2b 100%)' },
  { name: 'Sunset', value: 'linear-gradient(135deg, #2d1b69 0%, #6b2fa0 40%, #d63384 100%)' },
  { name: 'Ocean', value: 'linear-gradient(135deg, #0a1628 0%, #0d3b66 50%, #1a759f 100%)' },
  { name: 'Forest', value: 'linear-gradient(135deg, #0b1a0b 0%, #1a4301 50%, #2d6a4f 100%)' },
  { name: 'Ember', value: 'linear-gradient(135deg, #1a0a0a 0%, #8b2500 50%, #d4380d 100%)' },
  { name: 'Arctic', value: 'linear-gradient(135deg, #1a1a2e 0%, #3d5a80 50%, #98c1d9 100%)' },
  { name: 'Rose', value: 'linear-gradient(135deg, #1a0a14 0%, #6b2150 50%, #c2185b 100%)' },
  { name: 'Slate', value: 'linear-gradient(135deg, #1e1e2e 0%, #2d2d44 50%, #45455c 100%)' },
];

const solidColors = [
  '#0d0d1a', '#1a1a2e', '#2d2d44', '#1a3a1a',
  '#3a1a1a', '#1a2a3a', '#3a2a1a', '#2a1a3a',
];

export function WallpaperTab() {
  const { currentTheme, updateThemeProperty } = useThemeManager();
  const [imageUrl, setImageUrl] = useState('');

  const setWallpaper = (type: 'color' | 'image', value: string) => {
    updateThemeProperty('wallpaper', { type, value });
  };

  const handleImageSubmit = () => {
    if (imageUrl.trim()) {
      // For CSS background we store the raw gradient / color
      setWallpaper('image', imageUrl.trim());
    }
  };

  const isCurrentWallpaper = (value: string) => {
    return currentTheme.wallpaper.value === value;
  };

  return (
    <div className="settings-tab">
      <h3 className="settings-tab__title">Wallpaper</h3>

      {/* Gradients */}
      <div className="settings-section">
        <div className="settings-section__label">Gradients</div>
        <div className="wallpaper-grid">
          {gradientPresets.map((wp) => (
            <button
              key={wp.name}
              className={`wallpaper-card ${isCurrentWallpaper(wp.value) ? 'wallpaper-card--selected' : ''}`}
              style={{ background: wp.value }}
              onClick={() => setWallpaper('color', wp.value)}
              title={wp.name}
            >
              <span className="wallpaper-card__label">{wp.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Solid Colors */}
      <div className="settings-section">
        <div className="settings-section__label">Solid Colors</div>
        <div className="swatch-grid">
          {solidColors.map((c) => (
            <button
              key={c}
              className={`wallpaper-color ${isCurrentWallpaper(c) ? 'wallpaper-color--selected' : ''}`}
              style={{ background: c }}
              onClick={() => setWallpaper('color', c)}
              title={c}
            />
          ))}
        </div>
      </div>

      {/* Image URL */}
      <div className="settings-section">
        <div className="settings-section__label">Image URL</div>
        <div className="url-input-row">
          <input
            type="text"
            className="settings-input"
            placeholder="https://example.com/wallpaper.jpg"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleImageSubmit()}
          />
          <button className="settings-btn" onClick={handleImageSubmit}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
