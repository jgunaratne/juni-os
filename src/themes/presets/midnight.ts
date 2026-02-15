import type { OSTheme } from '@/shared/types';

export const midnight: OSTheme = {
  id: 'midnight',
  name: 'Midnight',
  colors: {
    desktop: '#0d0d1a',
    taskbar: 'rgba(15, 15, 35, 0.85)',
    taskbarText: '#e0e0f0',
    windowChrome: 'rgba(25, 25, 50, 0.90)',
    windowChromeActive: 'rgba(30, 30, 60, 0.95)',
    titleBarText: '#e0e0f0',
    windowBackground: '#1a1a2e',
    accent: '#6c63ff',
    accentHover: '#7b73ff',
    text: '#e8e8f0',
    textSecondary: '#9090b0',
    border: 'rgba(100, 100, 150, 0.3)',
    shadow: 'rgba(0, 0, 0, 0.5)',
  },
  blur: 12,
  cornerRadius: 12,
  transparency: 0.9,
  fontFamily: "'Inter', sans-serif",
  fontSize: 14,
  wallpaper: { type: 'color', value: 'linear-gradient(135deg, #0d0d2b 0%, #1a0a3e 50%, #0d0d1a 100%)' },
  animationSpeed: 1,
  windowStyle: 'glass',
};
