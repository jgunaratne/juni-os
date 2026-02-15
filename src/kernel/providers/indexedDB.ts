/**
 * IndexedDB File System Provider
 *
 * Browser-local file storage backed by IndexedDB.
 * Each file/directory is stored as a record keyed by its full path.
 */
import type { FileEntry, FileSystemProvider } from '@/shared/types';

const DB_NAME = 'junios-fs';
const DB_VERSION = 1;
const STORE = 'files';

/* ── helpers ──────────────────────────────────────────────── */

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'path' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Normalise paths: remove trailing slash, ensure leading slash */
function norm(p: string): string {
  let s = p.replace(/\/+$/, '');
  if (!s.startsWith('/')) s = '/' + s;
  return s || '/';
}

function parentOf(p: string): string {
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.slice(0, i);
}

/* ── seed data ────────────────────────────────────────────── */

const SEED_DIRS = [
  '/home',
  '/home/Documents',
  '/home/Pictures',
  '/home/Desktop',
  '/home/Downloads',
];

const SEED_FILES: FileEntry[] = [
  {
    name: 'welcome.txt',
    path: '/home/Documents/welcome.txt',
    isDirectory: false,
    size: 62,
    modifiedAt: Date.now(),
    mimeType: 'text/plain',
    content: 'Welcome to JuniOS!\nYour files are stored locally in IndexedDB.',
  },
  {
    name: 'readme.md',
    path: '/home/readme.md',
    isDirectory: false,
    size: 43,
    modifiedAt: Date.now(),
    mimeType: 'text/markdown',
    content: '# JuniOS\nA web-based operating system.',
  },
];

async function seed(db: IDBDatabase) {
  const store = tx(db, 'readonly');
  const existing = await req(store.get('/home'));
  if (existing) return;              // already seeded

  const ws = tx(db, 'readwrite');
  for (const dir of SEED_DIRS) {
    const name = dir.split('/').pop()!;
    ws.put({
      name,
      path: dir,
      isDirectory: true,
      size: 0,
      modifiedAt: Date.now(),
    } satisfies FileEntry);
  }
  for (const file of SEED_FILES) {
    ws.put(file);
  }
  await new Promise<void>((res, rej) => {
    ws.transaction.oncomplete = () => res();
    ws.transaction.onerror = () => rej(ws.transaction.error);
  });
}

/* ── provider ─────────────────────────────────────────────── */

export function createIndexedDBProvider(): FileSystemProvider {
  let dbPromise: Promise<IDBDatabase> | null = null;

  async function getDB() {
    if (!dbPromise) {
      dbPromise = openDB().then(async (db) => {
        await seed(db);
        return db;
      });
    }
    return dbPromise;
  }

  return {
    async read(path) {
      const db = await getDB();
      const entry: FileEntry | undefined = await req(tx(db, 'readonly').get(norm(path)));
      if (!entry) throw new Error(`ENOENT: ${path}`);
      return entry.content ?? '';
    },

    async write(path, content) {
      const p = norm(path);
      const db = await getDB();
      const name = p.split('/').pop()!;
      const size = typeof content === 'string' ? content.length : (content as ArrayBuffer).byteLength;
      const entry: FileEntry = {
        name,
        path: p,
        isDirectory: false,
        size,
        modifiedAt: Date.now(),
        mimeType: 'application/octet-stream',
        content,
      };
      await req(tx(db, 'readwrite').put(entry));
    },

    async list(path) {
      const p = norm(path);
      const db = await getDB();
      const all: FileEntry[] = await req(tx(db, 'readonly').getAll());
      // children are entries whose parent directory === p
      return all
        .filter((e) => parentOf(e.path) === p)
        .map(({ content: _c, ...rest }) => rest)   // strip content for listing
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    },

    async mkdir(path) {
      const p = norm(path);
      const db = await getDB();
      const existing = await req(tx(db, 'readonly').get(p));
      if (existing) return;  // idempotent
      const name = p.split('/').pop()!;
      const entry: FileEntry = {
        name,
        path: p,
        isDirectory: true,
        size: 0,
        modifiedAt: Date.now(),
      };
      await req(tx(db, 'readwrite').put(entry));
    },

    async delete(path) {
      const p = norm(path);
      const db = await getDB();
      // Also delete children recursively
      const all: FileEntry[] = await req(tx(db, 'readonly').getAll());
      const toDelete = all.filter((e) => e.path === p || e.path.startsWith(p + '/'));
      const ws = tx(db, 'readwrite');
      for (const e of toDelete) ws.delete(e.path);
      await new Promise<void>((res, rej) => {
        ws.transaction.oncomplete = () => res();
        ws.transaction.onerror = () => rej(ws.transaction.error);
      });
    },

    async move(from, to) {
      const f = norm(from);
      const t = norm(to);
      const db = await getDB();
      const all: FileEntry[] = await req(tx(db, 'readonly').getAll());
      const toMove = all.filter((e) => e.path === f || e.path.startsWith(f + '/'));
      const ws = tx(db, 'readwrite');
      for (const entry of toMove) {
        ws.delete(entry.path);
        const newPath = t + entry.path.slice(f.length);
        const newName = newPath.split('/').pop()!;
        ws.put({ ...entry, path: newPath, name: newName });
      }
      await new Promise<void>((res, rej) => {
        ws.transaction.oncomplete = () => res();
        ws.transaction.onerror = () => rej(ws.transaction.error);
      });
    },

    async exists(path) {
      const db = await getDB();
      const entry = await req(tx(db, 'readonly').get(norm(path)));
      return !!entry;
    },
  };
}
