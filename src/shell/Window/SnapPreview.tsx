import './SnapPreview.css';

export type SnapZone = 'left' | 'right' | 'top' | null;

const DOCK_WIDTH = 68;
const TOPBAR_HEIGHT = 32;

interface SnapPreviewProps {
  zone: SnapZone;
}

export function SnapPreview({ zone }: SnapPreviewProps) {
  if (!zone) return null;

  const style: React.CSSProperties = {};

  switch (zone) {
    case 'left':
      style.top = TOPBAR_HEIGHT;
      style.left = DOCK_WIDTH;
      style.width = (window.innerWidth - DOCK_WIDTH) / 2;
      style.height = window.innerHeight - TOPBAR_HEIGHT;
      break;
    case 'right':
      style.top = TOPBAR_HEIGHT;
      style.left = DOCK_WIDTH + (window.innerWidth - DOCK_WIDTH) / 2;
      style.width = (window.innerWidth - DOCK_WIDTH) / 2;
      style.height = window.innerHeight - TOPBAR_HEIGHT;
      break;
    case 'top':
      style.top = TOPBAR_HEIGHT;
      style.left = DOCK_WIDTH;
      style.width = window.innerWidth - DOCK_WIDTH;
      style.height = window.innerHeight - TOPBAR_HEIGHT;
      break;
  }

  return <div className="snap-preview" style={style} />;
}
