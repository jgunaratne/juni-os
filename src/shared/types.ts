import React from 'react';

/* ─── Window ──────────────────────────────────────────────── */
export type WindowStatus = 'normal' | 'minimized' | 'maximized' | 'tiled-left' | 'tiled-right';

export interface WindowState {
  id: string;
  appId: string;
  workspaceId: string;
  title: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  /** Stored pre-maximize so we can restore */
  prevPosition?: { x: number; y: number };
  prevSize?: { width: number; height: number };
  zIndex: number;
  status: WindowStatus;
  isFocused: boolean;
  /** Arbitrary data passed to the app (e.g. file path to open) */
  metadata?: Record<string, unknown>;
}

/* ─── Process ─────────────────────────────────────────────── */
export type ProcessStatus = 'running' | 'background' | 'suspended' | 'terminated';

export interface Process {
  id: string;
  appId: string;
  windowId: string;
  status: ProcessStatus;
  memoryUsage: number;
  lastActive: number;
  serializedState?: string;
}

/* ─── Workspace ───────────────────────────────────────────── */
export interface Workspace {
  id: string;
  windows: string[];
  thumbnail?: string;
}

/* ─── App Manifest ────────────────────────────────────────── */
export interface AppManifest {
  id: string;
  title: string;
  icon: string;
  component: React.LazyExoticComponent<React.ComponentType<AppComponentProps>>;
  defaultSize: { width: number; height: number };
  capabilities: string[];
  allowMultipleInstances: boolean;
}

export interface AppComponentProps {
  windowId: string;
}

/* ─── Dock ────────────────────────────────────────────────── */
export type DockPosition = 'left' | 'bottom';

export interface DockConfig {
  position: DockPosition;
  autoHide: boolean;
  iconSize: number;
  magnification: boolean;
}

/* ─── Theme ───────────────────────────────────────────────── */
export type WindowStyle = 'flat' | 'glass' | 'neumorphic' | 'retro';
export type WallpaperType = 'color' | 'image' | 'shader';

export interface OSThemeColors {
  desktop: string;
  taskbar: string;
  taskbarText: string;
  windowChrome: string;
  windowChromeActive: string;
  titleBarText: string;
  windowBackground: string;
  accent: string;
  accentHover: string;
  text: string;
  textSecondary: string;
  border: string;
  shadow: string;
}

export interface OSTheme {
  id: string;
  name: string;
  colors: OSThemeColors;
  blur: number;
  cornerRadius: number;
  transparency: number;
  fontFamily: string;
  fontSize: number;
  wallpaper: { type: WallpaperType; value: string };
  animationSpeed: number;
  windowStyle: WindowStyle;
}

/* ─── File System ─────────────────────────────────────────── */
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;           // epoch ms
  mimeType?: string;
  content?: string | ArrayBuffer;
}

export interface FileSystemProvider {
  read(path: string): Promise<string | ArrayBuffer>;
  write(path: string, content: string | ArrayBuffer): Promise<void>;
  list(path: string): Promise<FileEntry[]>;
  mkdir(path: string): Promise<void>;
  delete(path: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

/* ─── User / Auth ─────────────────────────────────────────── */
export interface User {
  name: string;
  email?: string;
  avatar?: string;
}
