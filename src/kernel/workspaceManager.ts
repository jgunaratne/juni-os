import { create } from 'zustand';
import type { Workspace } from '@/shared/types';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface WorkspaceManagerState {
  workspaces: Workspace[];
  activeIndex: number;
  isOverviewOpen: boolean;

  switchWorkspace: (index: number) => void;
  addWindowToWorkspace: (workspaceId: string, windowId: string) => void;
  removeWindowFromWorkspace: (windowId: string) => void;
  moveWindowToWorkspace: (windowId: string, targetWorkspaceId: string) => void;
  toggleOverview: () => void;
  setOverviewOpen: (open: boolean) => void;
  getActiveWorkspace: () => Workspace;

  /** Internal: clean up empty workspaces (except the trailing one) and ensure a trailing empty exists */
  _normalizeWorkspaces: () => void;
}

export const useWorkspaceManager = create<WorkspaceManagerState>((set, get) => ({
  workspaces: [
    { id: `ws-${uid()}`, windows: [] },
  ],
  activeIndex: 0,
  isOverviewOpen: false,

  switchWorkspace: (index) => {
    const { workspaces } = get();
    if (index >= 0 && index < workspaces.length) {
      set({ activeIndex: index });
    }
  },

  addWindowToWorkspace: (workspaceId, windowId) => {
    set((state) => ({
      workspaces: state.workspaces.map((ws) =>
        ws.id === workspaceId
          ? { ...ws, windows: [...ws.windows, windowId] }
          : ws
      ),
    }));
    get()._normalizeWorkspaces();
  },

  removeWindowFromWorkspace: (windowId) => {
    set((state) => ({
      workspaces: state.workspaces.map((ws) => ({
        ...ws,
        windows: ws.windows.filter((id) => id !== windowId),
      })),
    }));
    get()._normalizeWorkspaces();
  },

  moveWindowToWorkspace: (windowId, targetWorkspaceId) => {
    set((state) => ({
      workspaces: state.workspaces.map((ws) => {
        const without = ws.windows.filter((id) => id !== windowId);
        if (ws.id === targetWorkspaceId) {
          return { ...ws, windows: [...without, windowId] };
        }
        return { ...ws, windows: without };
      }),
    }));
    get()._normalizeWorkspaces();
  },

  toggleOverview: () => {
    set((state) => ({ isOverviewOpen: !state.isOverviewOpen }));
  },

  setOverviewOpen: (open) => {
    set({ isOverviewOpen: open });
  },

  getActiveWorkspace: () => {
    const { workspaces, activeIndex } = get();
    return workspaces[activeIndex];
  },

  _normalizeWorkspaces: () => {
    set((state) => {
      let { workspaces, activeIndex } = state;

      // Remove empty workspaces except the last one
      const lastIndex = workspaces.length - 1;
      workspaces = workspaces.filter(
        (ws, i) => ws.windows.length > 0 || i === lastIndex
      );

      // Ensure the last workspace is empty; if not, add one
      const last = workspaces[workspaces.length - 1];
      if (last && last.windows.length > 0) {
        workspaces = [...workspaces, { id: `ws-${uid()}`, windows: [] }];
      }

      // Clamp activeIndex
      if (activeIndex >= workspaces.length) {
        activeIndex = workspaces.length - 1;
      }

      return { workspaces, activeIndex };
    });
  },
}));
