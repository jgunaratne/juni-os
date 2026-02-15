import { create } from 'zustand';
import type { WindowState, WindowStatus } from '@/shared/types';

let nextZIndex = 1;

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface WindowManagerState {
  windows: WindowState[];

  openWindow: (appId: string, title: string, workspaceId: string, defaultSize: { width: number; height: number }, metadata?: Record<string, unknown>) => string;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string, desktopBounds: { width: number; height: number; x: number; y: number }) => void;
  restoreWindow: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  resizeWindow: (id: string, width: number, height: number) => void;
  setWindowTitle: (id: string, title: string) => void;
  setWindowStatus: (id: string, status: WindowStatus) => void;
  snapWindow: (id: string, zone: 'left' | 'right' | 'top') => void;
  getWindow: (id: string) => WindowState | undefined;
  getFocusedWindow: () => WindowState | undefined;
  getWindowsByWorkspace: (workspaceId: string) => WindowState[];
}

export const useWindowManager = create<WindowManagerState>((set, get) => ({
  windows: [],

  openWindow: (appId, title, workspaceId, defaultSize, metadata) => {
    const id = `win-${uid()}`;
    const offset = (get().windows.length % 8) * 30;
    const newWindow: WindowState = {
      id,
      appId,
      workspaceId,
      title,
      position: { x: 100 + offset, y: 60 + offset },
      size: { ...defaultSize },
      zIndex: nextZIndex++,
      status: 'normal',
      isFocused: true,
      metadata,
    };

    set((state) => ({
      windows: [
        ...state.windows.map((w) => ({ ...w, isFocused: false })),
        newWindow,
      ],
    }));
    return id;
  },

  closeWindow: (id) => {
    set((state) => {
      const remaining = state.windows.filter((w) => w.id !== id);
      // Focus the topmost remaining window
      if (remaining.length > 0) {
        const topWindow = remaining.reduce((a, b) => (a.zIndex > b.zIndex ? a : b));
        return {
          windows: remaining.map((w) => ({
            ...w,
            isFocused: w.id === topWindow.id,
          })),
        };
      }
      return { windows: remaining };
    });
  },

  focusWindow: (id) => {
    set((state) => ({
      windows: state.windows.map((w) => ({
        ...w,
        isFocused: w.id === id,
        zIndex: w.id === id ? nextZIndex++ : w.zIndex,
        status: w.id === id && w.status === 'minimized' ? 'normal' : w.status,
      })),
    }));
  },

  minimizeWindow: (id) => {
    set((state) => {
      const updated = state.windows.map((w) =>
        w.id === id ? { ...w, status: 'minimized' as const, isFocused: false } : w
      );
      // Focus the topmost non-minimized window
      const visible = updated.filter((w) => w.status !== 'minimized');
      if (visible.length > 0) {
        const topWindow = visible.reduce((a, b) => (a.zIndex > b.zIndex ? a : b));
        return {
          windows: updated.map((w) => ({
            ...w,
            isFocused: w.id === topWindow.id,
          })),
        };
      }
      return { windows: updated };
    });
  },

  maximizeWindow: (id, desktopBounds) => {
    set((state) => ({
      windows: state.windows.map((w) => {
        if (w.id !== id) return { ...w, isFocused: false };
        return {
          ...w,
          isFocused: true,
          status: 'maximized' as const,
          prevPosition: { ...w.position },
          prevSize: { ...w.size },
          position: { x: desktopBounds.x, y: desktopBounds.y },
          size: { width: desktopBounds.width, height: desktopBounds.height },
          zIndex: nextZIndex++,
        };
      }),
    }));
  },

  restoreWindow: (id) => {
    set((state) => ({
      windows: state.windows.map((w) => {
        if (w.id !== id) return w;
        return {
          ...w,
          status: 'normal' as const,
          position: w.prevPosition ?? w.position,
          size: w.prevSize ?? w.size,
          prevPosition: undefined,
          prevSize: undefined,
        };
      }),
    }));
  },

  moveWindow: (id, x, y) => {
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, position: { x, y } } : w
      ),
    }));
  },

  resizeWindow: (id, width, height) => {
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, size: { width, height } } : w
      ),
    }));
  },

  setWindowTitle: (id, title) => {
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, title } : w
      ),
    }));
  },

  setWindowStatus: (id, status) => {
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, status } : w
      ),
    }));
  },

  snapWindow: (id, zone) => {
    const DOCK_W = 68;
    const TB_H = 32;
    const desktopW = window.innerWidth - DOCK_W;
    const desktopH = window.innerHeight - TB_H;

    set((state) => ({
      windows: state.windows.map((w) => {
        if (w.id !== id) return { ...w, isFocused: false };
        const pos = zone === 'right'
          ? { x: DOCK_W + desktopW / 2, y: TB_H }
          : { x: DOCK_W, y: TB_H };
        const size = zone === 'top'
          ? { width: desktopW, height: desktopH }
          : { width: desktopW / 2, height: desktopH };
        return {
          ...w,
          isFocused: true,
          status: 'normal' as const,
          prevPosition: w.prevPosition ?? { ...w.position },
          prevSize: w.prevSize ?? { ...w.size },
          position: pos,
          size,
          zIndex: nextZIndex++,
        };
      }),
    }));
  },

  getWindow: (id) => get().windows.find((w) => w.id === id),

  getFocusedWindow: () => get().windows.find((w) => w.isFocused),

  getWindowsByWorkspace: (workspaceId) =>
    get().windows.filter((w) => w.workspaceId === workspaceId),
}));
