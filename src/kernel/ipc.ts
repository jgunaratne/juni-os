type Listener = (...args: unknown[]) => void;

interface IPCBus {
  emit: (event: string, ...args: unknown[]) => void;
  on: (event: string, listener: Listener) => void;
  off: (event: string, listener: Listener) => void;
  /** Remove all listeners registered by a given process */
  removeAllForProcess: (processId: string) => void;
  /** Register a listener tied to a process for auto-cleanup */
  onForProcess: (processId: string, event: string, listener: Listener) => void;
}

const listeners = new Map<string, Set<Listener>>();
const processListeners = new Map<string, Array<{ event: string; listener: Listener }>>();

export const ipc: IPCBus = {
  emit(event, ...args) {
    const set = listeners.get(event);
    if (set) {
      set.forEach((fn) => fn(...args));
    }
  },

  on(event, listener) {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event)!.add(listener);
  },

  off(event, listener) {
    listeners.get(event)?.delete(listener);
  },

  onForProcess(processId, event, listener) {
    this.on(event, listener);
    if (!processListeners.has(processId)) {
      processListeners.set(processId, []);
    }
    processListeners.get(processId)!.push({ event, listener });
  },

  removeAllForProcess(processId) {
    const entries = processListeners.get(processId);
    if (entries) {
      entries.forEach(({ event, listener }) => {
        this.off(event, listener);
      });
      processListeners.delete(processId);
    }
  },
};
