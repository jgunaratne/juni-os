import { useEffect, useRef } from 'react';
import { useAuth } from '@/kernel/auth';
import { useProcessManager } from '@/kernel/processManager';
import { appRegistry } from '@/shared/appRegistry';
import './AboutDialog.css';

interface AboutDialogProps {
  onClose: () => void;
}

export function AboutDialog({ onClose }: AboutDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const user = useAuth((s) => s.user);
  const processes = useProcessManager((s) => s.processes);

  const runningCount = processes.filter((p) => p.status === 'running').length;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === ref.current) onClose();
  };

  return (
    <div ref={ref} className="about-overlay" onClick={handleOverlayClick}>
      <div className="about-dialog">
        <div className="about-dialog__logo">💻</div>
        <div className="about-dialog__name">JuniOS</div>
        <div className="about-dialog__version">Version 0.1.0</div>

        <div className="about-dialog__info">
          <div className="about-dialog__row">
            <span className="about-dialog__label">Kernel</span>
            <span className="about-dialog__value">JuniOS Kernel 1.0</span>
          </div>
          <div className="about-dialog__row">
            <span className="about-dialog__label">User</span>
            <span className="about-dialog__value">{user?.name || 'Guest'}</span>
          </div>
          <div className="about-dialog__row">
            <span className="about-dialog__label">Apps Installed</span>
            <span className="about-dialog__value">{appRegistry.length}</span>
          </div>
          <div className="about-dialog__row">
            <span className="about-dialog__label">Processes Running</span>
            <span className="about-dialog__value">{runningCount}</span>
          </div>
          <div className="about-dialog__row">
            <span className="about-dialog__label">Display</span>
            <span className="about-dialog__value">{window.innerWidth}×{window.innerHeight}</span>
          </div>
        </div>

        <button className="about-dialog__close" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}
