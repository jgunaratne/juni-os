import { create } from 'zustand';
import type { OSTheme } from '@/shared/types';
import { midnight } from '@/themes/presets/midnight';
import { paper } from '@/themes/presets/paper';
import { retro } from '@/themes/presets/retro';
import { macos8 } from '@/themes/presets/macos8';

export const themePresets: OSTheme[] = [midnight, paper, retro, macos8];

interface ThemeManagerState {
  currentTheme: OSTheme;
  setTheme: (theme: OSTheme) => void;
  setThemeById: (id: string) => void;
  apply: (theme: OSTheme) => void;
  /** Mutate a single theme property and re-apply (for live sliders) */
  updateThemeProperty: <K extends keyof OSTheme>(key: K, value: OSTheme[K]) => void;
  /** Override accent + accentHover colors */
  updateAccentColor: (accent: string, accentHover: string) => void;
  /** Export theme as JSON string */
  exportTheme: () => string;
  /** Import theme from JSON string */
  importTheme: (json: string) => boolean;
}

function applyToCSSVariables(theme: OSTheme): void {
  const root = document.documentElement;
  const { colors } = theme;

  root.style.setProperty('--os-desktop', colors.desktop);
  root.style.setProperty('--os-taskbar', colors.taskbar);
  root.style.setProperty('--os-taskbar-text', colors.taskbarText);
  root.style.setProperty('--os-window-chrome', colors.windowChrome);
  root.style.setProperty('--os-window-chrome-active', colors.windowChromeActive);
  root.style.setProperty('--os-title-bar-text', colors.titleBarText);
  root.style.setProperty('--os-window-bg', colors.windowBackground);
  root.style.setProperty('--os-accent', colors.accent);
  root.style.setProperty('--os-accent-hover', colors.accentHover);
  root.style.setProperty('--os-text', colors.text);
  root.style.setProperty('--os-text-secondary', colors.textSecondary);
  root.style.setProperty('--os-border', colors.border);
  root.style.setProperty('--os-shadow', colors.shadow);
  root.style.setProperty('--os-chrome', colors.windowChrome);

  root.style.setProperty('--os-blur', `${theme.blur}px`);
  root.style.setProperty('--os-radius', `${theme.cornerRadius}px`);
  root.style.setProperty('--os-transparency', `${theme.transparency}`);
  root.style.setProperty('--os-font-family', theme.fontFamily);
  root.style.setProperty('--os-font-size', `${theme.fontSize}px`);
  root.style.setProperty('--os-animation-speed', `${theme.animationSpeed}`);
}

function applyWallpaper(theme: OSTheme): void {
  const root = document.documentElement;
  const { wallpaper } = theme;
  if (wallpaper.type === 'color') {
    root.style.setProperty('--os-wallpaper', wallpaper.value);
  } else if (wallpaper.type === 'image') {
    root.style.setProperty('--os-wallpaper', `url(${wallpaper.value})`);
  } else {
    root.style.setProperty('--os-wallpaper', wallpaper.value);
  }
}

function persistTheme(theme: OSTheme): void {
  try {
    localStorage.setItem('junios-theme', JSON.stringify(theme));
  } catch {
    // ignore
  }
}

function loadPersistedTheme(): OSTheme | null {
  try {
    const stored = localStorage.getItem('junios-theme');
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return null;
}

const initialTheme = loadPersistedTheme() ?? midnight;

export const useThemeManager = create<ThemeManagerState>((set, get) => ({
  currentTheme: initialTheme,

  setTheme: (theme) => {
    applyToCSSVariables(theme);
    applyWallpaper(theme);
    persistTheme(theme);
    set({ currentTheme: theme });
  },

  setThemeById: (id) => {
    const preset = themePresets.find((t) => t.id === id);
    if (preset) {
      applyToCSSVariables(preset);
      applyWallpaper(preset);
      persistTheme(preset);
      set({ currentTheme: preset });
    }
  },

  apply: (theme) => {
    applyToCSSVariables(theme);
    applyWallpaper(theme);
    set({ currentTheme: theme });
  },

  updateThemeProperty: (key, value) => {
    const next = { ...get().currentTheme, [key]: value };
    applyToCSSVariables(next);
    applyWallpaper(next);
    persistTheme(next);
    set({ currentTheme: next });
  },

  updateAccentColor: (accent, accentHover) => {
    const prev = get().currentTheme;
    const next: OSTheme = {
      ...prev,
      colors: { ...prev.colors, accent, accentHover },
    };
    applyToCSSVariables(next);
    persistTheme(next);
    set({ currentTheme: next });
  },

  exportTheme: () => {
    return JSON.stringify(get().currentTheme, null, 2);
  },

  importTheme: (json) => {
    try {
      const theme = JSON.parse(json) as OSTheme;
      if (!theme.id || !theme.name || !theme.colors) return false;
      applyToCSSVariables(theme);
      applyWallpaper(theme);
      persistTheme(theme);
      set({ currentTheme: theme });
      return true;
    } catch {
      return false;
    }
  },
}));
