import { create } from 'zustand';
import type { Process, ProcessStatus } from '@/shared/types';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface ProcessManagerState {
  processes: Process[];

  launchApp: (appId: string, windowId: string) => string;
  terminateProcess: (id: string) => void;
  terminateByWindowId: (windowId: string) => void;
  setProcessStatus: (id: string, status: ProcessStatus) => void;
  getProcessByWindowId: (windowId: string) => Process | undefined;
  getProcessesByAppId: (appId: string) => Process[];
  getRunningProcesses: () => Process[];
}

export const useProcessManager = create<ProcessManagerState>((set, get) => ({
  processes: [],

  launchApp: (appId, windowId) => {
    const id = `proc-${uid()}`;
    const process: Process = {
      id,
      appId,
      windowId,
      status: 'running',
      memoryUsage: 0,
      lastActive: Date.now(),
    };
    set((state) => ({ processes: [...state.processes, process] }));
    return id;
  },

  terminateProcess: (id) => {
    set((state) => ({
      processes: state.processes.filter((p) => p.id !== id),
    }));
  },

  terminateByWindowId: (windowId) => {
    set((state) => ({
      processes: state.processes.filter((p) => p.windowId !== windowId),
    }));
  },

  setProcessStatus: (id, status) => {
    set((state) => ({
      processes: state.processes.map((p) =>
        p.id === id ? { ...p, status, lastActive: Date.now() } : p
      ),
    }));
  },

  getProcessByWindowId: (windowId) =>
    get().processes.find((p) => p.windowId === windowId),

  getProcessesByAppId: (appId) =>
    get().processes.filter((p) => p.appId === appId),

  getRunningProcesses: () =>
    get().processes.filter((p) => p.status === 'running' || p.status === 'background'),
}));
