/**
 * Auth Store — Zustand
 *
 * Manages user session. Currently uses mock auth (any username).
 * Can be extended for PocketBase + Google OAuth later.
 */
import { create } from 'zustand';
import type { User } from '@/shared/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (name: string) => void;
  logout: () => void;
}

const STORAGE_KEY = 'junios-auth';

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const savedUser = loadUser();

export const useAuth = create<AuthState>((set) => ({
  user: savedUser,
  isAuthenticated: !!savedUser,

  login: (name: string) => {
    const user: User = { name, email: `${name.toLowerCase().replace(/\s+/g, '.')}@junios.local` };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    set({ user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ user: null, isAuthenticated: false });
  },
}));
