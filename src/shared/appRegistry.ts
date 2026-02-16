import React from 'react';
import type { AppManifest } from '@/shared/types';

const Terminal = React.lazy(() => import('@/apps/Terminal'));
const FileManager = React.lazy(() => import('@/apps/FileManager'));
const ControlPanel = React.lazy(() => import('@/apps/ControlPanel'));
const Paint = React.lazy(() => import('@/apps/Paint'));
const TaskManager = React.lazy(() => import('@/apps/TaskManager'));
const Calculator = React.lazy(() => import('@/apps/Calculator'));
const Notes = React.lazy(() => import('@/apps/Notes'));
const Chess = React.lazy(() => import('@/apps/Chess'));
const Gemini = React.lazy(() => import('@/apps/Gemini'));
const News = React.lazy(() => import('@/apps/News'));
const Stocks = React.lazy(() => import('@/apps/Stocks'));
const Podcast = React.lazy(() => import('@/apps/Podcast'));
const TicTacToe = React.lazy(() => import('@/apps/TicTacToe'));
const Shader = React.lazy(() => import('@/apps/Shader'));
const MapApp = React.lazy(() => import('@/apps/Map'));

export const appRegistry: AppManifest[] = [
  {
    id: 'terminal',
    title: 'Terminal',
    icon: '🖥️',
    component: Terminal,
    defaultSize: { width: 720, height: 480 },
    capabilities: ['fs.read', 'fs.write'],
    allowMultipleInstances: true,
  },
  {
    id: 'file-manager',
    title: 'Files',
    icon: '📁',
    component: FileManager,
    defaultSize: { width: 800, height: 550 },
    capabilities: ['fs.read', 'fs.write'],
    allowMultipleInstances: true,
  },
  {
    id: 'control-panel',
    title: 'Settings',
    icon: '⚙️',
    component: ControlPanel,
    defaultSize: { width: 720, height: 540 },
    capabilities: [],
    allowMultipleInstances: false,
  },
  {
    id: 'image-viewer',
    title: 'Paint',
    icon: '🎨',
    component: Paint,
    defaultSize: { width: 900, height: 650 },
    capabilities: ['fs.read'],
    allowMultipleInstances: true,
  },
  {
    id: 'task-manager',
    title: 'Task Manager',
    icon: '📊',
    component: TaskManager,
    defaultSize: { width: 640, height: 400 },
    capabilities: [],
    allowMultipleInstances: false,
  },
  {
    id: 'calculator',
    title: 'Calculator',
    icon: '🧮',
    component: Calculator,
    defaultSize: { width: 400, height: 560 },
    capabilities: [],
    allowMultipleInstances: false,
  },
  {
    id: 'notes',
    title: 'Notes',
    icon: '📝',
    component: Notes,
    defaultSize: { width: 720, height: 500 },
    capabilities: ['fs.read', 'fs.write'],
    allowMultipleInstances: false,
  },
  {
    id: 'chess',
    title: 'Chess',
    icon: '♟️',
    component: Chess,
    defaultSize: { width: 700, height: 580 },
    capabilities: [],
    allowMultipleInstances: false,
  },
  {
    id: 'gemini',
    title: 'Gemini',
    icon: '✦',
    component: Gemini,
    defaultSize: { width: 500, height: 650 },
    capabilities: [],
    allowMultipleInstances: false,
  },
  {
    id: 'news',
    title: 'News',
    icon: '📰',
    component: News,
    defaultSize: { width: 700, height: 600 },
    capabilities: [],
    allowMultipleInstances: false,
  },
  {
    id: 'stocks',
    title: 'Stocks',
    icon: '📈',
    component: Stocks,
    defaultSize: { width: 520, height: 700 },
    capabilities: [],
    allowMultipleInstances: false,
  },
  {
    id: 'podcast',
    title: 'Podcasts',
    icon: '🎙️',
    component: Podcast,
    defaultSize: { width: 600, height: 700 },
    capabilities: [],
    allowMultipleInstances: false,
  },
  {
    id: 'tictactoe',
    title: 'Tic-Tac-Toe',
    icon: '#️⃣',
    component: TicTacToe,
    defaultSize: { width: 360, height: 520 },
    capabilities: [],
    allowMultipleInstances: false,
  },
  {
    id: 'shader',
    title: 'Shader',
    icon: '🔮',
    component: Shader,
    defaultSize: { width: 900, height: 600 },
    capabilities: [],
    allowMultipleInstances: false,
  },
  {
    id: 'map',
    title: 'Maps',
    icon: '🗺️',
    component: MapApp,
    defaultSize: { width: 800, height: 600 },
    capabilities: [],
    allowMultipleInstances: false,
  },
];

export function getApp(id: string): AppManifest | undefined {
  return appRegistry.find((app) => app.id === id);
}

export function getAllApps(): AppManifest[] {
  return appRegistry;
}

