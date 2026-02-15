import { create } from 'zustand';
import type { DockConfig, DockPosition } from '@/shared/types';

interface DockConfigState extends DockConfig {
  setPosition: (position: DockPosition) => void;
  setIconSize: (size: number) => void;
  toggleAutoHide: () => void;
  toggleMagnification: () => void;
}

function persistDockConfig(config: DockConfig): void {
  try {
    localStorage.setItem('junios-dock-config', JSON.stringify(config));
  } catch { /* ignore */ }
}

function loadDockConfig(): Partial<DockConfig> {
  try {
    const stored = localStorage.getItem('junios-dock-config');
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return {};
}

function applyDockCSS(config: DockConfig): void {
  const root = document.documentElement;
  root.style.setProperty('--os-dock-width', config.position === 'left' ? '68px' : '0px');
  root.style.setProperty('--os-dock-height', config.position === 'bottom' ? '68px' : '0px');
  root.style.setProperty('--os-dock-icon-size', `${config.iconSize}px`);
}

const defaults: DockConfig = {
  position: 'left',
  autoHide: false,
  iconSize: 48,
  magnification: false,
};

const initial: DockConfig = { ...defaults, ...loadDockConfig() };

export const useDockConfig = create<DockConfigState>((set, get) => ({
  ...initial,

  setPosition: (position) => {
    const next = { ...get(), position };
    applyDockCSS(next);
    persistDockConfig(next);
    set({ position });
  },

  setIconSize: (iconSize) => {
    const clamped = Math.max(32, Math.min(64, iconSize));
    const next = { ...get(), iconSize: clamped };
    applyDockCSS(next);
    persistDockConfig(next);
    set({ iconSize: clamped });
  },

  toggleAutoHide: () => {
    const autoHide = !get().autoHide;
    const next = { ...get(), autoHide };
    persistDockConfig(next);
    set({ autoHide });
  },

  toggleMagnification: () => {
    const magnification = !get().magnification;
    const next = { ...get(), magnification };
    persistDockConfig(next);
    set({ magnification });
  },
}));
