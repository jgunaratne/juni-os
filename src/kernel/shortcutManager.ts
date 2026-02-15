import { useWindowManager } from './windowManager';
import { useWorkspaceManager } from './workspaceManager';

type ShortcutHandler = (e: KeyboardEvent) => void;

interface ShortcutEntry {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  handler: ShortcutHandler;
  description: string;
}

const shortcuts: ShortcutEntry[] = [];
let isInitialized = false;

function matchesShortcut(e: KeyboardEvent, entry: ShortcutEntry): boolean {
  if (e.key.toLowerCase() !== entry.key.toLowerCase()) return false;
  if (!!entry.ctrl !== e.ctrlKey) return false;
  if (!!entry.alt !== e.altKey) return false;
  if (!!entry.shift !== e.shiftKey) return false;
  if (!!entry.meta !== e.metaKey) return false;
  return true;
}

function handleKeyDown(e: KeyboardEvent): void {
  for (const entry of shortcuts) {
    if (matchesShortcut(e, entry)) {
      e.preventDefault();
      e.stopPropagation();
      entry.handler(e);
      return;
    }
  }
}

export function registerShortcut(entry: ShortcutEntry): void {
  shortcuts.push(entry);
}

export function initShortcuts(): void {
  if (isInitialized) return;
  isInitialized = true;

  // Alt + F4: Close focused window
  registerShortcut({
    key: 'F4',
    alt: true,
    description: 'Close window',
    handler: () => {
      const focused = useWindowManager.getState().getFocusedWindow();
      if (focused) {
        useWindowManager.getState().closeWindow(focused.id);
      }
    },
  });

  // Super (Meta): Toggle Overview
  registerShortcut({
    key: 'Meta',
    description: 'Toggle Activities Overview',
    handler: () => {
      useWorkspaceManager.getState().toggleOverview();
    },
  });

  document.addEventListener('keydown', handleKeyDown);
}

export function destroyShortcuts(): void {
  document.removeEventListener('keydown', handleKeyDown);
  shortcuts.length = 0;
  isInitialized = false;
}
