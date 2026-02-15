import type { OSTheme } from '@/shared/types';

export const paper: OSTheme = {
  id: 'paper',
  name: 'Paper',
  colors: {
    desktop: '#f5f0e8',
    taskbar: 'rgba(235, 228, 215, 0.95)',
    taskbarText: '#3a3530',
    windowChrome: 'rgba(245, 240, 232, 0.98)',
    windowChromeActive: 'rgba(250, 245, 238, 1)',
    titleBarText: '#3a3530',
    windowBackground: '#faf8f4',
    accent: '#c97b3a',
    accentHover: '#d48a49',
    text: '#2c2825',
    textSecondary: '#8a8078',
    border: 'rgba(180, 170, 155, 0.4)',
    shadow: 'rgba(0, 0, 0, 0.08)',
  },
  blur: 0,
  cornerRadius: 10,
  transparency: 1,
  fontFamily: "'Inter', sans-serif",
  fontSize: 14,
  wallpaper: { type: 'color', value: 'linear-gradient(180deg, #f5f0e8 0%, #e8dfd0 100%)' },
  animationSpeed: 1,
  windowStyle: 'flat',
};
