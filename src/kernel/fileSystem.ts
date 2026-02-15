/**
 * File System — Zustand store
 *
 * Provides a unified API for file operations.
 * Delegates to the active provider (IndexedDB for now).
 */
import { create } from 'zustand';
import type { FileEntry, FileSystemProvider } from '@/shared/types';
import { createIndexedDBProvider } from './providers/indexedDB';

interface FileSystemState {
  /** Current provider */
  provider: FileSystemProvider;

  /** Read file contents */
  read: (path: string) => Promise<string | ArrayBuffer>;
  /** Write content to a file (creates if not exists) */
  write: (path: string, content: string | ArrayBuffer) => Promise<void>;
  /** List directory contents */
  list: (path: string) => Promise<FileEntry[]>;
  /** Create a directory */
  mkdir: (path: string) => Promise<void>;
  /** Delete a file or directory recursively */
  delete: (path: string) => Promise<void>;
  /** Move / rename */
  move: (from: string, to: string) => Promise<void>;
  /** Check existence */
  exists: (path: string) => Promise<boolean>;
}

const provider = createIndexedDBProvider();

export const useFileSystem = create<FileSystemState>(() => ({
  provider,
  read: (path) => provider.read(path),
  write: (path, content) => provider.write(path, content),
  list: (path) => provider.list(path),
  mkdir: (path) => provider.mkdir(path),
  delete: (path) => provider.delete(path),
  move: (from, to) => provider.move(from, to),
  exists: (path) => provider.exists(path),
}));
