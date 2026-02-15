import { create } from 'zustand';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body?: string;
  timestamp: number;
}

interface NotificationManagerState {
  notifications: Notification[];
  addNotification: (type: NotificationType, title: string, body?: string) => void;
  dismissNotification: (id: string) => void;
  clearAll: () => void;
}

let nextId = 1;

export const useNotificationManager = create<NotificationManagerState>((set) => ({
  notifications: [],

  addNotification: (type, title, body) => {
    const id = `notif-${nextId++}`;
    const notification: Notification = { id, type, title, body, timestamp: Date.now() };

    set((state) => ({
      notifications: [...state.notifications, notification],
    }));

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      }));
    }, 5000);
  },

  dismissNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clearAll: () => set({ notifications: [] }),
}));
