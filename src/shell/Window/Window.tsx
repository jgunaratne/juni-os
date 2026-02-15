import React, { Suspense, useCallback, useState, useRef, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { motion } from 'framer-motion';
import { TitleBar } from './TitleBar';
import { SnapPreview } from './SnapPreview';
import type { SnapZone } from './SnapPreview';
import { useWindowManager } from '@/kernel/windowManager';
import { useProcessManager } from '@/kernel/processManager';
import { useWorkspaceManager } from '@/kernel/workspaceManager';
import { getApp } from '@/shared/appRegistry';
import type { WindowState } from '@/shared/types';
import './Window.css';

interface WindowProps {
  window: WindowState;
}

const DOCK_WIDTH = 68;
const TOPBAR_HEIGHT = 32;
const SNAP_THRESHOLD = 16;

function detectSnapZone(x: number, y: number): SnapZone {
  const absX = x + DOCK_WIDTH;
  const absY = y + TOPBAR_HEIGHT;
  if (absX <= SNAP_THRESHOLD + DOCK_WIDTH) return 'left';
  if (absX + 100 >= window.innerWidth - SNAP_THRESHOLD) return 'right';
  if (absY <= SNAP_THRESHOLD + TOPBAR_HEIGHT) return 'top';
  return null;
}

export const Window = React.memo(function Window({ window: win }: WindowProps) {
  const closeWindow = useWindowManager((s) => s.closeWindow);
  const focusWindow = useWindowManager((s) => s.focusWindow);
  const minimizeWindow = useWindowManager((s) => s.minimizeWindow);
  const maximizeWindow = useWindowManager((s) => s.maximizeWindow);
  const restoreWindow = useWindowManager((s) => s.restoreWindow);
  const moveWindow = useWindowManager((s) => s.moveWindow);
  const resizeWindow = useWindowManager((s) => s.resizeWindow);
  const snapWindow = useWindowManager((s) => s.snapWindow);

  const { terminateByWindowId } = useProcessManager();
  const { removeWindowFromWorkspace } = useWorkspaceManager();

  const [snapZone, setSnapZone] = useState<SnapZone>(null);
  const rndRef = useRef<Rnd | null>(null);

  /*
   * Track the last position/size we know Rnd is at, so we can detect
   * when the *store* changes them (snap, maximize, programmatic move)
   * vs. changes from user drag/resize (which Rnd handles internally).
   */
  const lastPos = useRef({ x: win.position.x, y: win.position.y });
  const lastSize = useRef({ w: win.size.width, h: win.size.height });

  useEffect(() => {
    const posChanged =
      win.position.x !== lastPos.current.x || win.position.y !== lastPos.current.y;
    const sizeChanged =
      win.size.width !== lastSize.current.w || win.size.height !== lastSize.current.h;
    if ((posChanged || sizeChanged) && rndRef.current) {
      lastPos.current = { x: win.position.x, y: win.position.y };
      lastSize.current = { w: win.size.width, h: win.size.height };
      rndRef.current.updatePosition({ x: win.position.x, y: win.position.y });
      rndRef.current.updateSize({ width: win.size.width, height: win.size.height });
    }
  }, [win.position.x, win.position.y, win.size.width, win.size.height]);

  const app = getApp(win.appId);
  const AppComponent = app?.component;

  const handleClose = useCallback(() => {
    closeWindow(win.id);
    terminateByWindowId(win.id);
    removeWindowFromWorkspace(win.id);
  }, [win.id, closeWindow, terminateByWindowId, removeWindowFromWorkspace]);

  const handleMinimize = useCallback(() => {
    minimizeWindow(win.id);
  }, [win.id, minimizeWindow]);

  const handleMaximize = useCallback(() => {
    if (win.status === 'maximized') {
      restoreWindow(win.id);
    } else {
      maximizeWindow(win.id, {
        x: DOCK_WIDTH,
        y: TOPBAR_HEIGHT,
        width: globalThis.innerWidth - DOCK_WIDTH,
        height: globalThis.innerHeight - TOPBAR_HEIGHT,
      });
    }
  }, [win.id, win.status, maximizeWindow, restoreWindow]);

  const handleFocus = useCallback(() => {
    if (!win.isFocused) {
      focusWindow(win.id);
    }
  }, [win.id, win.isFocused, focusWindow]);

  if (win.status === 'minimized') {
    return null;
  }

  const isMaximized = win.status === 'maximized';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1, ease: 'easeOut' }}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <SnapPreview zone={snapZone} />
      <Rnd
        ref={rndRef}
        default={{
          x: win.position.x,
          y: win.position.y,
          width: win.size.width,
          height: win.size.height,
        }}
        minWidth={300}
        minHeight={200}
        style={{ zIndex: win.zIndex, pointerEvents: 'auto' }}
        dragHandleClassName="title-bar"
        disableDragging={isMaximized}
        enableResizing={!isMaximized}
        onDrag={(_e, d) => {
          setSnapZone(detectSnapZone(d.x, d.y));
        }}
        onDragStop={(_e, d) => {
          const zone = detectSnapZone(d.x, d.y);
          setSnapZone(null);
          lastPos.current = { x: d.x, y: d.y };
          if (zone) {
            snapWindow(win.id, zone);
          } else {
            moveWindow(win.id, d.x, d.y);
          }
        }}
        onResizeStop={(_e, _dir, ref, _delta, position) => {
          lastPos.current = { x: position.x, y: position.y };
          lastSize.current = { w: ref.offsetWidth, h: ref.offsetHeight };
          resizeWindow(win.id, ref.offsetWidth, ref.offsetHeight);
          moveWindow(win.id, position.x, position.y);
        }}
        onMouseDown={handleFocus}
        bounds="parent"
      >
        <div
          className={`os-window ${win.isFocused ? 'os-window--focused' : ''} ${isMaximized ? 'os-window--maximized' : ''}`}
        >
          <TitleBar
            title={win.title}
            isActive={win.isFocused}
            isMaximized={isMaximized}
            onClose={handleClose}
            onMinimize={handleMinimize}
            onMaximize={handleMaximize}
            onDoubleClick={handleMaximize}
          />
          <div className="os-window__content">
            <Suspense fallback={
              <div className="os-window__loading">
                <div className="os-window__spinner" />
              </div>
            }>
              {AppComponent && <AppComponent windowId={win.id} />}
            </Suspense>
          </div>
        </div>
      </Rnd>
    </motion.div>
  );
}, (prev, next) => {
  const a = prev.window;
  const b = next.window;
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.appId === b.appId &&
    a.status === b.status &&
    a.isFocused === b.isFocused &&
    a.zIndex === b.zIndex &&
    a.position.x === b.position.x &&
    a.position.y === b.position.y &&
    a.size.width === b.size.width &&
    a.size.height === b.size.height
  );
});
