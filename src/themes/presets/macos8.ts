import type { OSTheme } from '@/shared/types';

export const macos8: OSTheme = {
  id: 'macos8',
  name: 'Mac OS 8',
  colors: {
    desktop: '#3f6f8f',
    taskbar: 'rgba(204, 204, 204, 0.98)',
    taskbarText: '#000000',
    windowChrome: 'rgba(204, 204, 204, 0.98)',
    windowChromeActive: 'rgba(221, 221, 221, 1)',
    titleBarText: '#000000',
    windowBackground: '#ffffff',
    accent: '#0033cc',
    accentHover: '#0044dd',
    text: '#000000',
    textSecondary: '#555555',
    border: 'rgba(0, 0, 0, 0.35)',
    shadow: 'rgba(0, 0, 0, 0.3)',
  },
  blur: 0,
  cornerRadius: 1,
  transparency: 1,
  fontFamily: "'Chicago', 'Charcoal', 'Geneva', 'Lucida Grande', sans-serif",
  fontSize: 12,
  wallpaper: {
    type: 'color',
    value: 'linear-gradient(180deg, #336699 0%, #264d73 50%, #1a334d 100%)',
  },
  animationSpeed: 0.3,
  windowStyle: 'retro',
};
