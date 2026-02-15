import { useState, useRef, useCallback, useEffect } from 'react';
import type { AppComponentProps } from '@/shared/types';
import './ImageViewer.css';

type Tool = 'brush' | 'eraser' | 'line' | 'rect' | 'circle' | 'fill' | 'text';

interface HistoryEntry {
  data: ImageData;
}

const PALETTE = [
  '#000000', '#ffffff', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
  '#7c2d12', '#854d0e', '#166534', '#1e3a5f', '#581c87',
];

const DEFAULT_W = 800;
const DEFAULT_H = 600;

export default function PaintApp(_props: AppComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(4);
  const [canvasReady, setCanvasReady] = useState(false);
  const [showUrlDialog, setShowUrlDialog] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const [canvasSize, setCanvasSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Drawing state refs (no re-renders during strokes)
  const drawing = useRef(false);
  const lastPt = useRef({ x: 0, y: 0 });
  const shapeStart = useRef({ x: 0, y: 0 });

  // Undo / redo
  const history = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);

  /* ── Canvas helpers ────────────────────────────── */

  const getCtx = useCallback(() => canvasRef.current?.getContext('2d') ?? null, []);
  const getOverlayCtx = useCallback(() => overlayRef.current?.getContext('2d') ?? null, []);

  const pushHistory = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, canvasSize.w, canvasSize.h);
    history.current.push({ data });
    if (history.current.length > 50) history.current.shift();
    redoStack.current = [];
  }, [getCtx, canvasSize]);

  const undo = useCallback(() => {
    const ctx = getCtx();
    if (!ctx || history.current.length === 0) return;
    // Save current for redo
    const cur = ctx.getImageData(0, 0, canvasSize.w, canvasSize.h);
    redoStack.current.push({ data: cur });
    const prev = history.current.pop()!;
    ctx.putImageData(prev.data, 0, 0);
  }, [getCtx, canvasSize]);

  const redo = useCallback(() => {
    const ctx = getCtx();
    if (!ctx || redoStack.current.length === 0) return;
    const cur = ctx.getImageData(0, 0, canvasSize.w, canvasSize.h);
    history.current.push({ data: cur });
    const next = redoStack.current.pop()!;
    ctx.putImageData(next.data, 0, 0);
  }, [getCtx, canvasSize]);

  /* ── Initialize blank canvas ───────────────────── */

  const initCanvas = useCallback((w: number, h: number) => {
    setCanvasSize({ w, h });
    setCanvasReady(true);
    // Need a tick for the canvas elements to mount
    requestAnimationFrame(() => {
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#2a2a3a';
        ctx.fillRect(0, 0, w, h);
      }
      history.current = [];
      redoStack.current = [];
    });
  }, []);

  /* ── Load image onto canvas ────────────────────── */

  const loadImageOntoCanvas = useCallback((img: HTMLImageElement) => {
    const w = img.naturalWidth || DEFAULT_W;
    const h = img.naturalHeight || DEFAULT_H;
    setCanvasSize({ w, h });
    setCanvasReady(true);
    requestAnimationFrame(() => {
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0);
      }
      history.current = [];
      redoStack.current = [];
    });
  }, []);

  const loadFromUrl = useCallback((url: string) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => loadImageOntoCanvas(img);
    img.onerror = () => alert('Failed to load image from URL');
    img.src = url;
  }, [loadImageOntoCanvas]);

  const loadFromFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => loadImageOntoCanvas(img);
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }, [loadImageOntoCanvas]);

  /* ── Keyboard shortcuts ───────────────────────── */

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  /* ── Drawing functions ─────────────────────────── */

  const getCanvasPoint = (e: React.MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const drawLine = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  const floodFill = (startX: number, startY: number, fillColor: string) => {
    const ctx = getCtx();
    if (!ctx) return;
    const w = canvasSize.w;
    const h = canvasSize.h;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    // Parse fill color
    const temp = document.createElement('canvas');
    temp.width = 1;
    temp.height = 1;
    const tempCtx = temp.getContext('2d')!;
    tempCtx.fillStyle = fillColor;
    tempCtx.fillRect(0, 0, 1, 1);
    const fc = tempCtx.getImageData(0, 0, 1, 1).data;

    const sx = Math.floor(startX);
    const sy = Math.floor(startY);
    if (sx < 0 || sx >= w || sy < 0 || sy >= h) return;

    const startIdx = (sy * w + sx) * 4;
    const sr = data[startIdx], sg = data[startIdx + 1], sb = data[startIdx + 2], sa = data[startIdx + 3];

    if (sr === fc[0] && sg === fc[1] && sb === fc[2] && sa === fc[3]) return;

    const tolerance = 30;
    const match = (idx: number) => {
      return Math.abs(data[idx] - sr) <= tolerance &&
        Math.abs(data[idx + 1] - sg) <= tolerance &&
        Math.abs(data[idx + 2] - sb) <= tolerance &&
        Math.abs(data[idx + 3] - sa) <= tolerance;
    };

    const stack: [number, number][] = [[sx, sy]];
    const visited = new Uint8Array(w * h);

    while (stack.length > 0) {
      const [cx, cy] = stack.pop()!;
      const idx = (cy * w + cx) * 4;
      const vi = cy * w + cx;
      if (visited[vi]) continue;
      if (!match(idx)) continue;
      visited[vi] = 1;
      data[idx] = fc[0];
      data[idx + 1] = fc[1];
      data[idx + 2] = fc[2];
      data[idx + 3] = fc[3];
      if (cx > 0) stack.push([cx - 1, cy]);
      if (cx < w - 1) stack.push([cx + 1, cy]);
      if (cy > 0) stack.push([cx, cy - 1]);
      if (cy < h - 1) stack.push([cx, cy + 1]);
    }

    ctx.putImageData(imageData, 0, 0);
  };

  const setupStroke = (ctx: CanvasRenderingContext2D, isEraser: boolean) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pt = getCanvasPoint(e);
    drawing.current = true;
    lastPt.current = pt;
    shapeStart.current = pt;
    pushHistory();

    if (tool === 'fill') {
      floodFill(pt.x, pt.y, color);
      drawing.current = false;
      return;
    }

    if (tool === 'brush' || tool === 'eraser') {
      const ctx = getCtx();
      if (!ctx) return;
      setupStroke(ctx, tool === 'eraser');
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pt = getCanvasPoint(e);
    setMousePos({ x: Math.round(pt.x), y: Math.round(pt.y) });

    if (!drawing.current) return;

    if (tool === 'brush' || tool === 'eraser') {
      const ctx = getCtx();
      if (!ctx) return;
      setupStroke(ctx, tool === 'eraser');
      drawLine(ctx, lastPt.current.x, lastPt.current.y, pt.x, pt.y);
      lastPt.current = pt;
    } else if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      const oCtx = getOverlayCtx();
      if (!oCtx) return;
      oCtx.clearRect(0, 0, canvasSize.w, canvasSize.h);
      oCtx.strokeStyle = color;
      oCtx.lineWidth = brushSize;
      oCtx.lineCap = 'round';
      oCtx.lineJoin = 'round';

      const sx = shapeStart.current.x;
      const sy = shapeStart.current.y;

      if (tool === 'line') {
        drawLine(oCtx, sx, sy, pt.x, pt.y);
      } else if (tool === 'rect') {
        oCtx.strokeRect(sx, sy, pt.x - sx, pt.y - sy);
      } else {
        const rx = Math.abs(pt.x - sx) / 2;
        const ry = Math.abs(pt.y - sy) / 2;
        const cx = (sx + pt.x) / 2;
        const cy = (sy + pt.y) / 2;
        oCtx.beginPath();
        oCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        oCtx.stroke();
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!drawing.current) return;
    drawing.current = false;

    const ctx = getCtx();
    if (!ctx) return;

    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';

    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      const pt = getCanvasPoint(e);
      const sx = shapeStart.current.x;
      const sy = shapeStart.current.y;

      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (tool === 'line') {
        drawLine(ctx, sx, sy, pt.x, pt.y);
      } else if (tool === 'rect') {
        ctx.strokeRect(sx, sy, pt.x - sx, pt.y - sy);
      } else {
        const rx = Math.abs(pt.x - sx) / 2;
        const ry = Math.abs(pt.y - sy) / 2;
        const cx = (sx + pt.x) / 2;
        const cy = (sy + pt.y) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Clear overlay
      const oCtx = getOverlayCtx();
      oCtx?.clearRect(0, 0, canvasSize.w, canvasSize.h);
    }
  };

  /* ── Save/Export ────────────────────────────────── */

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'painting.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleClear = () => {
    const ctx = getCtx();
    if (!ctx) return;
    pushHistory();
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);
  };

  /* ── Tool config ───────────────────────────────── */

  const tools: { id: Tool; icon: string; label: string }[] = [
    { id: 'brush', icon: '✏️', label: 'Brush' },
    { id: 'eraser', icon: '🧹', label: 'Eraser' },
    { id: 'line', icon: '📏', label: 'Line' },
    { id: 'rect', icon: '⬜', label: 'Rect' },
    { id: 'circle', icon: '⭕', label: 'Circle' },
    { id: 'fill', icon: '🪣', label: 'Fill' },
  ];

  /* ── Empty state ───────────────────────────────── */

  if (!canvasReady) {
    return (
      <div className="paint-app">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) loadFromFile(f);
          }}
        />
        <div className="paint-app__empty">
          <span className="paint-app__empty-icon">🎨</span>
          <span className="paint-app__empty-text">JuniOS Paint</span>
          <div className="paint-app__empty-actions">
            <button
              className="paint-app__empty-btn"
              onClick={() => initCanvas(DEFAULT_W, DEFAULT_H)}
            >
              🖌️ New Canvas
            </button>
            <button
              className="paint-app__empty-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              📁 Open Image
            </button>
            <button
              className="paint-app__empty-btn"
              onClick={() => setShowUrlDialog(true)}
            >
              🌐 Load URL
            </button>
          </div>
        </div>

        {showUrlDialog && (
          <div className="paint-app__url-overlay" onClick={() => setShowUrlDialog(false)}>
            <div className="paint-app__url-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>Load Image from URL</h3>
              <input
                className="paint-app__url-input"
                placeholder="https://example.com/image.png"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && urlValue.trim()) {
                    loadFromUrl(urlValue.trim());
                    setShowUrlDialog(false);
                  }
                }}
                autoFocus
              />
              <div className="paint-app__url-actions">
                <button onClick={() => setShowUrlDialog(false)}>Cancel</button>
                <button onClick={() => {
                  if (urlValue.trim()) {
                    loadFromUrl(urlValue.trim());
                    setShowUrlDialog(false);
                  }
                }}>
                  Load
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Main paint UI ─────────────────────────────── */

  return (
    <div className="paint-app">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) loadFromFile(f);
        }}
      />

      {/* Toolbar */}
      <div className="paint-app__toolbar">
        {/* File actions */}
        <div className="paint-app__toolbar-group">
          <button className="paint-app__btn" onClick={() => initCanvas(DEFAULT_W, DEFAULT_H)} title="New Canvas">📄</button>
          <button className="paint-app__btn" onClick={() => fileInputRef.current?.click()} title="Open Image">📁</button>
          <button className="paint-app__btn" onClick={() => setShowUrlDialog(true)} title="Load URL">🌐</button>
          <button className="paint-app__btn" onClick={handleSave} title="Save as PNG">💾</button>
        </div>

        <div className="paint-app__toolbar-divider" />

        {/* Tools */}
        <div className="paint-app__toolbar-group">
          {tools.map((t) => (
            <button
              key={t.id}
              className={`paint-app__btn ${tool === t.id ? 'paint-app__btn--active' : ''}`}
              onClick={() => setTool(t.id)}
              title={t.label}
            >
              {t.icon}
            </button>
          ))}
        </div>

        <div className="paint-app__toolbar-divider" />

        {/* Color */}
        <div className="paint-app__toolbar-group">
          <input
            type="color"
            className="paint-app__color-input"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            title="Color"
          />
          <div className="paint-app__palette">
            {PALETTE.map((c) => (
              <div
                key={c}
                className="paint-app__palette-swatch"
                style={{ background: c }}
                onClick={() => setColor(c)}
                title={c}
              />
            ))}
          </div>
        </div>

        <div className="paint-app__toolbar-divider" />

        {/* Brush size */}
        <div className="paint-app__toolbar-group">
          <span className="paint-app__size-label">{brushSize}px</span>
          <input
            type="range"
            className="paint-app__size-slider"
            min="1"
            max="64"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
          />
        </div>

        <div className="paint-app__toolbar-divider" />

        {/* Undo / Redo / Clear */}
        <div className="paint-app__toolbar-group">
          <button className="paint-app__btn" onClick={undo} title="Undo (⌘Z)">↩️</button>
          <button className="paint-app__btn" onClick={redo} title="Redo (⌘⇧Z)">↪️</button>
          <button className="paint-app__btn" onClick={handleClear} title="Clear Canvas">🗑️</button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="paint-app__canvas-wrap">
        <div style={{ position: 'relative' }}>
          <canvas
            ref={canvasRef}
            width={canvasSize.w}
            height={canvasSize.h}
            className="paint-app__canvas"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { drawing.current = false; }}
          />
          <canvas
            ref={overlayRef}
            width={canvasSize.w}
            height={canvasSize.h}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>

      {/* Status bar */}
      <div className="paint-app__status">
        <span>{canvasSize.w} × {canvasSize.h}</span>
        <span>X: {mousePos.x}  Y: {mousePos.y}</span>
        <span style={{ flex: 1 }} />
        <span>{tool.charAt(0).toUpperCase() + tool.slice(1)}</span>
      </div>

      {/* URL dialog */}
      {showUrlDialog && (
        <div className="paint-app__url-overlay" onClick={() => setShowUrlDialog(false)}>
          <div className="paint-app__url-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Load Image from URL</h3>
            <input
              className="paint-app__url-input"
              placeholder="https://example.com/image.png"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && urlValue.trim()) {
                  loadFromUrl(urlValue.trim());
                  setShowUrlDialog(false);
                }
              }}
              autoFocus
            />
            <div className="paint-app__url-actions">
              <button onClick={() => setShowUrlDialog(false)}>Cancel</button>
              <button onClick={() => {
                if (urlValue.trim()) {
                  loadFromUrl(urlValue.trim());
                  setShowUrlDialog(false);
                }
              }}>
                Load
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
