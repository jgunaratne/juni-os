import { useState, useRef, useCallback, useEffect } from 'react';
import type { AppComponentProps } from '@/shared/types';
import './Paint.css';

/* ── Nano Banana API ─────────────────────────── */

function getVertexConfig() {
  return {
    project: localStorage.getItem('junios-gcp-project') || undefined,
    location: localStorage.getItem('junios-gcp-location') || undefined,
  };
}

function canvasToBase64(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Canvas toBlob failed'));
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('FileReader failed'));
        reader.readAsDataURL(blob);
      },
      'image/jpeg',
      0.85,
    );
  });
}

async function callNanoBanana(
  prompt: string,
  imageDataUrl: string,
): Promise<{ text: string; imageUrl: string | null }> {
  const payload = { prompt, imageData: imageDataUrl, ...getVertexConfig() };
  const res = await fetch('/api/gemini/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return { text: data.text || '', imageUrl: data.imageUrl || null };
}

/* ── Types ────────────────────────────────────── */

type Tool =
  | 'brush' | 'eraser' | 'spray'
  | 'eyedropper' | 'fill' | 'gradient'
  | 'line' | 'rect' | 'circle'
  | 'text' | 'blur' | 'select';

interface HistoryEntry { data: ImageData }

/* ── Constants ────────────────────────────────── */

const PALETTE = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7',
  '#ffffff', '#980000', '#ff0000', '#ff9900', '#ffff00',
  '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff',
  '#ff00ff', '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc',
  '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9',
  '#ead1dc', '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599',
];

const DEFAULT_W = 800;
const DEFAULT_H = 600;

const TOOLS: { id: Tool; icon: string; label: string; shortcut: string }[] = [
  { id: 'select', icon: '✥', label: 'Select + Move', shortcut: 'V' },
  { id: 'brush', icon: '🖌️', label: 'Brush', shortcut: 'B' },
  { id: 'eraser', icon: '🧹', label: 'Eraser', shortcut: 'E' },
  { id: 'spray', icon: '🌫️', label: 'Spray', shortcut: 'S' },
  { id: 'eyedropper', icon: '💉', label: 'Eyedropper', shortcut: 'I' },
  { id: 'fill', icon: '🪣', label: 'Fill', shortcut: 'G' },
  { id: 'gradient', icon: '🌈', label: 'Gradient', shortcut: 'D' },
  { id: 'line', icon: '📏', label: 'Line', shortcut: 'L' },
  { id: 'rect', icon: '⬜', label: 'Rectangle', shortcut: 'R' },
  { id: 'circle', icon: '⭕', label: 'Circle', shortcut: 'O' },
  { id: 'text', icon: 'T', label: 'Text', shortcut: 'T' },
  { id: 'blur', icon: '💧', label: 'Blur', shortcut: 'U' },
];

/* ── Component ────────────────────────────────── */

export default function PaintApp(_props: AppComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fgColorRef = useRef<HTMLInputElement | null>(null);
  const bgColorRef = useRef<HTMLInputElement | null>(null);

  /* state */
  const [tool, setTool] = useState<Tool>('brush');
  const [fgColor, setFgColor] = useState('#ffffff');
  const [bgColor, setBgColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(4);
  const [opacity, setOpacity] = useState(100);
  const [fillShape, setFillShape] = useState(false);
  const [fontSize, setFontSize] = useState(24);
  const [zoom, setZoom] = useState(100);
  const [canvasSize, setCanvasSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  /* menus & dialogs */
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [showUrlDialog, setShowUrlDialog] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const [showSizeDialog, setShowSizeDialog] = useState(false);
  const [sizeW, setSizeW] = useState(String(DEFAULT_W));
  const [sizeH, setSizeH] = useState(String(DEFAULT_H));
  const [textOverlay, setTextOverlay] = useState<{ x: number; y: number; value: string } | null>(null);
  const fileMenuRef = useRef<HTMLDivElement | null>(null);

  /* Nano Banana */
  const [nbPrompt, setNbPrompt] = useState('');
  const [nbLoading, setNbLoading] = useState(false);
  const [nbError, setNbError] = useState('');
  const [nbOpen, setNbOpen] = useState(false);

  /* drawing refs */
  const drawing = useRef(false);
  const lastPt = useRef({ x: 0, y: 0 });
  const shapeStart = useRef({ x: 0, y: 0 });

  /* selection refs */
  const selRect = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const selData = useRef<ImageData | null>(null);
  const selDragging = useRef(false);

  /* undo/redo */
  const history = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);

  /* ── Canvas helpers ──────────────────────────── */

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

  /* ── Init / Load ─────────────────────────────── */

  const initCanvas = useCallback((w: number, h: number) => {
    setCanvasSize({ w, h });
    requestAnimationFrame(() => {
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
      }
      history.current = [];
      redoStack.current = [];
    });
  }, []);

  /* Auto-init canvas on mount */
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      initCanvas(DEFAULT_W, DEFAULT_H);
    }
  }, [initCanvas]);

  const loadImageOntoCanvas = useCallback((img: HTMLImageElement) => {
    const w = img.naturalWidth || DEFAULT_W;
    const h = img.naturalHeight || DEFAULT_H;
    setCanvasSize({ w, h });
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

  /* ── Close file menu on outside click ──────────── */

  useEffect(() => {
    if (!fileMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [fileMenuOpen]);

  /* ── Keyboard shortcuts ──────────────────────── */

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }

      if (e.metaKey || e.ctrlKey) return;

      const keyMap: Record<string, Tool> = {
        v: 'select', b: 'brush', e: 'eraser', s: 'spray',
        i: 'eyedropper', g: 'fill', d: 'gradient', l: 'line',
        r: 'rect', o: 'circle', t: 'text', u: 'blur',
      };
      const mapped = keyMap[e.key.toLowerCase()];
      if (mapped) setTool(mapped);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  /* ── Drawing helpers ─────────────────────────── */

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

  const setupStroke = (ctx: CanvasRenderingContext2D, isEraser: boolean) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    ctx.globalAlpha = isEraser ? 1 : opacity / 100;
    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = fgColor;
    }
  };

  /* ── Flood fill ──────────────────────────────── */

  const floodFill = (startX: number, startY: number, fillColor: string) => {
    const ctx = getCtx();
    if (!ctx) return;
    const w = canvasSize.w;
    const h = canvasSize.h;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    const temp = document.createElement('canvas');
    temp.width = 1; temp.height = 1;
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
    const match = (idx: number) =>
      Math.abs(data[idx] - sr) <= tolerance &&
      Math.abs(data[idx + 1] - sg) <= tolerance &&
      Math.abs(data[idx + 2] - sb) <= tolerance &&
      Math.abs(data[idx + 3] - sa) <= tolerance;

    const stack: [number, number][] = [[sx, sy]];
    const visited = new Uint8Array(w * h);

    while (stack.length > 0) {
      const [cx, cy] = stack.pop()!;
      const idx = (cy * w + cx) * 4;
      const vi = cy * w + cx;
      if (visited[vi]) continue;
      if (!match(idx)) continue;
      visited[vi] = 1;
      data[idx] = fc[0]; data[idx + 1] = fc[1]; data[idx + 2] = fc[2]; data[idx + 3] = fc[3];
      if (cx > 0) stack.push([cx - 1, cy]);
      if (cx < w - 1) stack.push([cx + 1, cy]);
      if (cy > 0) stack.push([cx, cy - 1]);
      if (cy < h - 1) stack.push([cx, cy + 1]);
    }
    ctx.putImageData(imageData, 0, 0);
  };

  /* ── Spray paint helper ──────────────────────── */

  const spray = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    const density = Math.floor(brushSize * 2);
    const radius = brushSize * 2;
    ctx.fillStyle = fgColor;
    ctx.globalAlpha = (opacity / 100) * 0.3;
    for (let i = 0; i < density; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      ctx.fillRect(x + Math.cos(angle) * r, y + Math.sin(angle) * r, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  };

  /* ── Blur helper ─────────────────────────────── */

  const blurAt = (ctx: CanvasRenderingContext2D, cx: number, cy: number) => {
    const r = Math.max(4, brushSize);
    const x = Math.max(0, Math.floor(cx - r));
    const y = Math.max(0, Math.floor(cy - r));
    const w = Math.min(canvasSize.w - x, r * 2);
    const h = Math.min(canvasSize.h - y, r * 2);
    if (w <= 0 || h <= 0) return;

    const imgData = ctx.getImageData(x, y, w, h);
    const d = imgData.data;
    const copy = new Uint8ClampedArray(d);

    // Simple 3x3 box blur
    for (let py = 1; py < h - 1; py++) {
      for (let px = 1; px < w - 1; px++) {
        for (let c = 0; c < 4; c++) {
          let sum = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              sum += copy[((py + dy) * w + (px + dx)) * 4 + c];
            }
          }
          d[(py * w + px) * 4 + c] = sum / 9;
        }
      }
    }
    ctx.putImageData(imgData, x, y);
  };

  /* ── Mouse handlers ──────────────────────────── */

  const handleMouseDown = (e: React.MouseEvent) => {
    const pt = getCanvasPoint(e);
    drawing.current = true;
    lastPt.current = pt;
    shapeStart.current = pt;

    const ctx = getCtx();
    if (!ctx) return;

    /* Eyedropper */
    if (tool === 'eyedropper') {
      const pixel = ctx.getImageData(Math.floor(pt.x), Math.floor(pt.y), 1, 1).data;
      const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(v => v.toString(16).padStart(2, '0')).join('');
      setFgColor(hex);
      drawing.current = false;
      return;
    }

    /* Text */
    if (tool === 'text') {
      setTextOverlay({ x: pt.x, y: pt.y, value: '' });
      drawing.current = false;
      return;
    }

    pushHistory();

    /* Fill */
    if (tool === 'fill') {
      floodFill(pt.x, pt.y, fgColor);
      drawing.current = false;
      return;
    }

    /* Select */
    if (tool === 'select') {
      if (selRect.current && selData.current) {
        // Check if click is inside selection → drag
        const s = selRect.current;
        if (pt.x >= s.x && pt.x <= s.x + s.w && pt.y >= s.y && pt.y <= s.y + s.h) {
          selDragging.current = true;
          return;
        }
        // Click outside → commit selection
        ctx.putImageData(selData.current, selRect.current.x, selRect.current.y);
        selRect.current = null;
        selData.current = null;
      }
      return;
    }

    /* Brush / Eraser dot */
    if (tool === 'brush' || tool === 'eraser') {
      setupStroke(ctx, tool === 'eraser');
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    /* Spray dot */
    if (tool === 'spray') {
      spray(ctx, pt.x, pt.y);
    }

    /* Blur dot */
    if (tool === 'blur') {
      blurAt(ctx, pt.x, pt.y);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pt = getCanvasPoint(e);
    setMousePos({ x: Math.round(pt.x), y: Math.round(pt.y) });

    if (!drawing.current) return;
    const ctx = getCtx();
    if (!ctx) return;

    if (tool === 'brush' || tool === 'eraser') {
      setupStroke(ctx, tool === 'eraser');
      drawLine(ctx, lastPt.current.x, lastPt.current.y, pt.x, pt.y);
      lastPt.current = pt;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    } else if (tool === 'spray') {
      spray(ctx, pt.x, pt.y);
      lastPt.current = pt;
    } else if (tool === 'blur') {
      blurAt(ctx, pt.x, pt.y);
      lastPt.current = pt;
    } else if (tool === 'select' && !selDragging.current) {
      // Draw selection rectangle on overlay
      const oCtx = getOverlayCtx();
      if (!oCtx) return;
      oCtx.clearRect(0, 0, canvasSize.w, canvasSize.h);
      oCtx.strokeStyle = '#fff';
      oCtx.lineWidth = 1;
      oCtx.setLineDash([5, 5]);
      const sx = shapeStart.current.x, sy = shapeStart.current.y;
      oCtx.strokeRect(sx, sy, pt.x - sx, pt.y - sy);
      oCtx.setLineDash([]);
    } else if (tool === 'select' && selDragging.current && selRect.current && selData.current) {
      // Move selection
      const dx = pt.x - lastPt.current.x;
      const dy = pt.y - lastPt.current.y;
      selRect.current = {
        ...selRect.current,
        x: selRect.current.x + dx,
        y: selRect.current.y + dy,
      };
      lastPt.current = pt;
      // Redraw: clear canvas area under old selection, draw selection at new pos
      const oCtx = getOverlayCtx();
      if (oCtx) {
        oCtx.clearRect(0, 0, canvasSize.w, canvasSize.h);
        oCtx.putImageData(selData.current, selRect.current.x, selRect.current.y);
        oCtx.strokeStyle = '#fff';
        oCtx.lineWidth = 1;
        oCtx.setLineDash([5, 5]);
        oCtx.strokeRect(selRect.current.x, selRect.current.y, selRect.current.w, selRect.current.h);
        oCtx.setLineDash([]);
      }
    } else if (tool === 'gradient' || tool === 'line' || tool === 'rect' || tool === 'circle') {
      const oCtx = getOverlayCtx();
      if (!oCtx) return;
      oCtx.clearRect(0, 0, canvasSize.w, canvasSize.h);
      oCtx.lineWidth = brushSize;
      oCtx.lineCap = 'round';
      oCtx.lineJoin = 'round';

      const sx = shapeStart.current.x, sy = shapeStart.current.y;

      if (tool === 'gradient') {
        const grad = oCtx.createLinearGradient(sx, sy, pt.x, pt.y);
        grad.addColorStop(0, fgColor);
        grad.addColorStop(1, bgColor);
        oCtx.fillStyle = grad;
        oCtx.fillRect(0, 0, canvasSize.w, canvasSize.h);
        // Show direction line
        oCtx.strokeStyle = 'rgba(255,255,255,0.5)';
        oCtx.lineWidth = 1;
        drawLine(oCtx, sx, sy, pt.x, pt.y);
      } else if (tool === 'line') {
        oCtx.strokeStyle = fgColor;
        drawLine(oCtx, sx, sy, pt.x, pt.y);
      } else if (tool === 'rect') {
        oCtx.strokeStyle = fgColor;
        if (fillShape) {
          oCtx.globalAlpha = opacity / 100;
          oCtx.fillStyle = fgColor;
          oCtx.fillRect(sx, sy, pt.x - sx, pt.y - sy);
          oCtx.globalAlpha = 1;
        }
        oCtx.strokeRect(sx, sy, pt.x - sx, pt.y - sy);
      } else {
        oCtx.strokeStyle = fgColor;
        const rx = Math.abs(pt.x - sx) / 2;
        const ry = Math.abs(pt.y - sy) / 2;
        const cx = (sx + pt.x) / 2;
        const cy = (sy + pt.y) / 2;
        oCtx.beginPath();
        oCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (fillShape) {
          oCtx.globalAlpha = opacity / 100;
          oCtx.fillStyle = fgColor;
          oCtx.fill();
          oCtx.globalAlpha = 1;
        }
        oCtx.stroke();
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!drawing.current) return;
    drawing.current = false;

    const ctx = getCtx();
    if (!ctx) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    const pt = getCanvasPoint(e);
    const sx = shapeStart.current.x, sy = shapeStart.current.y;

    if (tool === 'select') {
      if (selDragging.current) {
        selDragging.current = false;
        return;
      }
      // Create selection from drag
      const x = Math.min(sx, pt.x), y = Math.min(sy, pt.y);
      const w = Math.abs(pt.x - sx), h = Math.abs(pt.y - sy);
      if (w > 2 && h > 2) {
        selRect.current = { x, y, w, h };
        selData.current = ctx.getImageData(x, y, w, h);
        // Clear the area behind the selection
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, w, h);
      }
      const oCtx = getOverlayCtx();
      oCtx?.clearRect(0, 0, canvasSize.w, canvasSize.h);
      return;
    }

    if (tool === 'gradient') {
      const grad = ctx.createLinearGradient(sx, sy, pt.x, pt.y);
      grad.addColorStop(0, fgColor);
      grad.addColorStop(1, bgColor);
      ctx.globalAlpha = opacity / 100;
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);
      ctx.globalAlpha = 1;
      const oCtx = getOverlayCtx();
      oCtx?.clearRect(0, 0, canvasSize.w, canvasSize.h);
      return;
    }

    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      ctx.strokeStyle = fgColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = opacity / 100;

      if (tool === 'line') {
        drawLine(ctx, sx, sy, pt.x, pt.y);
      } else if (tool === 'rect') {
        if (fillShape) {
          ctx.fillStyle = fgColor;
          ctx.fillRect(sx, sy, pt.x - sx, pt.y - sy);
        }
        ctx.strokeRect(sx, sy, pt.x - sx, pt.y - sy);
      } else {
        const rx = Math.abs(pt.x - sx) / 2;
        const ry = Math.abs(pt.y - sy) / 2;
        const cx = (sx + pt.x) / 2;
        const cy = (sy + pt.y) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (fillShape) {
          ctx.fillStyle = fgColor;
          ctx.fill();
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const oCtx = getOverlayCtx();
      oCtx?.clearRect(0, 0, canvasSize.w, canvasSize.h);
    }
  };

  /* ── Text commit ─────────────────────────────── */

  const commitText = useCallback(() => {
    if (!textOverlay || !textOverlay.value.trim()) { setTextOverlay(null); return; }
    const ctx = getCtx();
    if (!ctx) return;
    pushHistory();
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = fgColor;
    ctx.globalAlpha = opacity / 100;
    ctx.fillText(textOverlay.value, textOverlay.x, textOverlay.y + fontSize);
    ctx.globalAlpha = 1;
    setTextOverlay(null);
  }, [textOverlay, fontSize, fgColor, opacity, getCtx, pushHistory]);

  /* ── Save / Clear ────────────────────────────── */

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
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);
  };

  /* ── Nano Banana ─────────────────────────────── */

  const handleNanoBanana = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !nbPrompt.trim()) return;
    setNbLoading(true);
    setNbError('');
    pushHistory();
    try {
      const imageDataUrl = await canvasToBase64(canvas);
      const result = await callNanoBanana(nbPrompt.trim(), imageDataUrl);
      if (result.imageUrl) {
        const img = new Image();
        img.onload = () => { loadImageOntoCanvas(img); setNbLoading(false); };
        img.onerror = () => { setNbError('Failed to load generated image'); setNbLoading(false); };
        img.src = result.imageUrl;
      } else {
        setNbError(result.text || 'No image was generated. Try a different prompt.');
        setNbLoading(false);
      }
    } catch (err) {
      setNbError(err instanceof Error ? err.message : 'Image generation failed');
      setNbLoading(false);
    }
  }, [nbPrompt, pushHistory, loadImageOntoCanvas]);

  /* ── Zoom helpers ────────────────────────────── */

  const zoomIn = () => setZoom(z => Math.min(400, z + 25));
  const zoomOut = () => setZoom(z => Math.max(25, z - 25));
  const zoomFit = () => setZoom(100);

  /* ── Cursor class ────────────────────────────── */

  const cursorClass = tool === 'eyedropper'
    ? 'paint-app__cursor--eyedropper'
    : tool === 'text'
      ? 'paint-app__cursor--text'
      : tool === 'select'
        ? (selDragging.current ? 'paint-app__cursor--move' : 'paint-app__cursor--grab')
        : '';

  /* ══════════ Main UI ══════════ */

  return (
    <div className="paint-app">
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFromFile(f); }} />

      {/* ── Menu Bar ─────────────────── */}
      <div className="paint-app__menubar">
        {/* File dropdown */}
        <div className="paint-app__filemenu" ref={fileMenuRef}>
          <button
            className={`paint-app__menu-btn ${fileMenuOpen ? 'paint-app__menu-btn--active' : ''}`}
            onClick={() => setFileMenuOpen(!fileMenuOpen)}
          >
            File
          </button>
          {fileMenuOpen && (
            <div className="paint-app__dropdown">
              <button className="paint-app__dropdown-item" onClick={() => { initCanvas(DEFAULT_W, DEFAULT_H); setFileMenuOpen(false); }}>📄 New Canvas</button>
              <button className="paint-app__dropdown-item" onClick={() => { fileInputRef.current?.click(); setFileMenuOpen(false); }}>📁 Open Image…</button>
              <button className="paint-app__dropdown-item" onClick={() => { setShowUrlDialog(true); setFileMenuOpen(false); }}>🌐 Load from URL…</button>
              <div className="paint-app__dropdown-divider" />
              <button className="paint-app__dropdown-item" onClick={() => { setSizeW(String(canvasSize.w)); setSizeH(String(canvasSize.h)); setShowSizeDialog(true); setFileMenuOpen(false); }}>📐 Canvas Size…</button>
              <div className="paint-app__dropdown-divider" />
              <button className="paint-app__dropdown-item" onClick={() => { handleSave(); setFileMenuOpen(false); }}>💾 Save as PNG</button>
              <div className="paint-app__dropdown-divider" />
              <button className="paint-app__dropdown-item" onClick={() => { handleClear(); setFileMenuOpen(false); }}>🗑️ Clear Canvas</button>
            </div>
          )}
        </div>

        <div className="paint-app__menubar-divider" />
        <div className="paint-app__menubar-group">
          <button className="paint-app__menu-btn" onClick={undo} title="Undo (⌘Z)">↩️</button>
          <button className="paint-app__menu-btn" onClick={redo} title="Redo (⌘⇧Z)">↪️</button>
        </div>
        <div className="paint-app__menubar-divider" />
        <div className="paint-app__menubar-group">
          <button
            className={`paint-app__menu-btn ${nbOpen ? 'paint-app__menu-btn--active' : ''}`}
            onClick={() => setNbOpen(!nbOpen)} title="Nano Banana AI"
          >🍌</button>
        </div>
      </div>

      {/* Nano Banana Panel */}
      {nbOpen && (
        <div className="paint-app__nano-panel">
          <div className="paint-app__nano-header">
            <span className="paint-app__nano-title">🍌 Nano Banana</span>
            <button className="paint-app__nano-close" onClick={() => setNbOpen(false)}>×</button>
          </div>
          <div className="paint-app__nano-body">
            <input className="paint-app__nano-input" type="text"
              placeholder="Describe how to transform the image…"
              value={nbPrompt}
              onChange={(e) => { setNbPrompt(e.target.value); setNbError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && nbPrompt.trim() && !nbLoading) handleNanoBanana(); }}
              disabled={nbLoading} />
            <button className="paint-app__nano-btn" onClick={handleNanoBanana}
              disabled={!nbPrompt.trim() || nbLoading}>
              {nbLoading ? 'Generating…' : '🍌 Generate'}
            </button>
          </div>
          {nbError && <div className="paint-app__nano-error">{nbError}</div>}
          {nbLoading && (
            <div className="paint-app__nano-loading">
              <div className="paint-app__spinner" />
              <span>Nano Banana is cooking…</span>
            </div>
          )}
        </div>
      )}

      {/* ── Body ─────────────────────── */}
      <div className="paint-app__body">

        {/* Left Tool Sidebar */}
        <div className="paint-app__sidebar">
          {TOOLS.map((t, i) => (
            <div key={t.id}>
              {(i === 4 || i === 7 || i === 10) && <div className="paint-app__sidebar-divider" />}
              <button
                className={`paint-app__tool-btn ${tool === t.id ? 'paint-app__tool-btn--active' : ''}`}
                onClick={() => setTool(t.id)}
                title={`${t.label} (${t.shortcut})`}
              >
                {t.icon}
              </button>
            </div>
          ))}
        </div>

        {/* Canvas Area */}
        <div className="paint-app__canvas-area">
          <div className="paint-app__canvas-container" style={{ transform: `scale(${zoom / 100})` }}>
            <canvas
              ref={canvasRef}
              width={canvasSize.w}
              height={canvasSize.h}
              className={`paint-app__canvas ${cursorClass}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => { drawing.current = false; }}
            />
            <canvas
              ref={overlayRef}
              width={canvasSize.w}
              height={canvasSize.h}
              style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            />
            {/* Text input overlay */}
            {textOverlay && (
              <div className="paint-app__text-overlay"
                style={{ left: textOverlay.x * (zoom / 100), top: textOverlay.y * (zoom / 100) }}>
                <input
                  className="paint-app__text-field"
                  value={textOverlay.value}
                  onChange={(e) => setTextOverlay({ ...textOverlay, value: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') setTextOverlay(null); }}
                  style={{ fontSize: `${fontSize * (zoom / 100)}px`, color: fgColor }}
                  autoFocus
                  placeholder="Type text..."
                />
                <button className="paint-app__text-confirm" onClick={commitText}>✓</button>
              </div>
            )}
          </div>
        </div>

        {/* Right Properties Panel */}
        <div className="paint-app__props">
          {/* Color */}
          <div className="paint-app__props-section">
            <span className="paint-app__props-title">Color</span>
            <div className="paint-app__color-swatches">
              <div className="paint-app__fg-swatch" style={{ background: fgColor }}
                onClick={() => fgColorRef.current?.click()} title="Foreground color" />
              <input ref={fgColorRef} type="color" className="paint-app__color-hidden"
                value={fgColor} onChange={(e) => setFgColor(e.target.value)}
                style={{ top: 0, left: 0 }} />

              <div className="paint-app__bg-swatch" style={{ background: bgColor }}
                onClick={() => bgColorRef.current?.click()} title="Background color" />
              <input ref={bgColorRef} type="color" className="paint-app__color-hidden"
                value={bgColor} onChange={(e) => setBgColor(e.target.value)}
                style={{ bottom: 0, right: 0 }} />

              <button className="paint-app__color-swap"
                onClick={() => { setFgColor(bgColor); setBgColor(fgColor); }}
                title="Swap colors (X)">⇄</button>
            </div>
            <div className="paint-app__palette-grid">
              {PALETTE.map((c) => (
                <div key={c} className="paint-app__palette-swatch"
                  style={{ background: c }} onClick={() => setFgColor(c)} title={c} />
              ))}
            </div>
          </div>

          {/* Brush */}
          <div className="paint-app__props-section">
            <span className="paint-app__props-title">Brush</span>
            <div className="paint-app__slider-row">
              <span className="paint-app__slider-label">Size</span>
              <input type="range" className="paint-app__slider" min="1" max="64"
                value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} />
              <span className="paint-app__slider-value">{brushSize}px</span>
            </div>
            <div className="paint-app__slider-row">
              <span className="paint-app__slider-label">Op.</span>
              <input type="range" className="paint-app__slider" min="1" max="100"
                value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
              <span className="paint-app__slider-value">{opacity}%</span>
            </div>
          </div>

          {/* Shape options */}
          {(tool === 'rect' || tool === 'circle') && (
            <div className="paint-app__props-section">
              <span className="paint-app__props-title">Shape</span>
              <div className="paint-app__toggle-row">
                <button className={`paint-app__toggle ${fillShape ? 'paint-app__toggle--on' : ''}`}
                  onClick={() => setFillShape(!fillShape)} />
                <span>Fill</span>
              </div>
            </div>
          )}

          {/* Text options */}
          {tool === 'text' && (
            <div className="paint-app__props-section">
              <span className="paint-app__props-title">Text</span>
              <div className="paint-app__slider-row">
                <span className="paint-app__slider-label">Size</span>
                <input type="range" className="paint-app__slider" min="8" max="120"
                  value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
                <span className="paint-app__slider-value">{fontSize}px</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Status Bar ───────────────── */}
      <div className="paint-app__status">
        <span>{canvasSize.w} × {canvasSize.h}</span>
        <span>X: {mousePos.x}  Y: {mousePos.y}</span>
        <span style={{ flex: 1 }} />
        <span>{TOOLS.find(t => t.id === tool)?.label}</span>
        <div className="paint-app__status-zoom">
          <button className="paint-app__zoom-btn" onClick={zoomOut} title="Zoom out">−</button>
          <span onClick={zoomFit} style={{ cursor: 'pointer' }} title="Reset zoom">{zoom}%</span>
          <button className="paint-app__zoom-btn" onClick={zoomIn} title="Zoom in">+</button>
        </div>
      </div>

      {/* URL dialog */}
      {showUrlDialog && (
        <div className="paint-app__overlay" onClick={() => setShowUrlDialog(false)}>
          <div className="paint-app__dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Load Image from URL</h3>
            <input className="paint-app__dialog-input" placeholder="https://example.com/image.png"
              value={urlValue} onChange={(e) => setUrlValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && urlValue.trim()) { loadFromUrl(urlValue.trim()); setShowUrlDialog(false); } }}
              autoFocus />
            <div className="paint-app__dialog-actions">
              <button onClick={() => setShowUrlDialog(false)}>Cancel</button>
              <button onClick={() => { if (urlValue.trim()) { loadFromUrl(urlValue.trim()); setShowUrlDialog(false); } }}>Load</button>
            </div>
          </div>
        </div>
      )}

      {/* Canvas Size dialog */}
      {showSizeDialog && (
        <div className="paint-app__overlay" onClick={() => setShowSizeDialog(false)}>
          <div className="paint-app__dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Canvas Size</h3>
            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
              <label style={{ flex: 1 }}>
                <span style={{ fontSize: 11, color: 'var(--os-text-secondary)' }}>Width</span>
                <input className="paint-app__dialog-input" type="number" min="1" max="4096"
                  value={sizeW} onChange={(e) => setSizeW(e.target.value)} autoFocus />
              </label>
              <label style={{ flex: 1 }}>
                <span style={{ fontSize: 11, color: 'var(--os-text-secondary)' }}>Height</span>
                <input className="paint-app__dialog-input" type="number" min="1" max="4096"
                  value={sizeH} onChange={(e) => setSizeH(e.target.value)} />
              </label>
            </div>
            <div className="paint-app__dialog-actions">
              <button onClick={() => setShowSizeDialog(false)}>Cancel</button>
              <button onClick={() => {
                const w = Math.max(1, Math.min(4096, parseInt(sizeW) || DEFAULT_W));
                const h = Math.max(1, Math.min(4096, parseInt(sizeH) || DEFAULT_H));
                // Preserve existing canvas content
                const ctx = getCtx();
                const existing = ctx ? ctx.getImageData(0, 0, canvasSize.w, canvasSize.h) : null;
                pushHistory();
                setCanvasSize({ w, h });
                requestAnimationFrame(() => {
                  const c = canvasRef.current?.getContext('2d');
                  if (c) {
                    c.fillStyle = '#ffffff';
                    c.fillRect(0, 0, w, h);
                    if (existing) c.putImageData(existing, 0, 0);
                  }
                });
                setShowSizeDialog(false);
              }}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
