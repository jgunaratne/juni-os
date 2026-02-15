import type { OSTheme } from '@/shared/types';

export const retro: OSTheme = {
  id: 'retro',
  name: 'Retro',
  colors: {
    desktop: '#0a0a0a',
    taskbar: 'rgba(20, 20, 20, 0.95)',
    taskbarText: '#00ff88',
    windowChrome: 'rgba(18, 18, 18, 0.98)',
    windowChromeActive: 'rgba(25, 25, 25, 1)',
    titleBarText: '#00ff88',
    windowBackground: '#111111',
    accent: '#00ff88',
    accentHover: '#33ffaa',
    text: '#00ff88',
    textSecondary: '#009955',
    border: 'rgba(0, 255, 136, 0.25)',
    shadow: 'rgba(0, 255, 136, 0.1)',
  },
  blur: 0,
  cornerRadius: 2,
  transparency: 1,
  fontFamily: "'Courier New', monospace",
  fontSize: 14,
  wallpaper: { type: 'color', value: '#0a0a0a' },
  animationSpeed: 0.5,
  windowStyle: 'retro',
};
