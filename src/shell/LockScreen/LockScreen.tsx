import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/kernel/auth';
import './LockScreen.css';

interface LockScreenProps {
  onUnlock: () => void;
}

function formatTime(): string {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDate(): string {
  const now = new Date();
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const user = useAuth((s) => s.user);
  const [time, setTime] = useState(formatTime());
  const [date, setDate] = useState(formatDate());
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(formatTime());
      setDate(formatDate());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleUnlock = useCallback(() => {
    if (unlocking) return;
    setUnlocking(true);
    setTimeout(onUnlock, 400); // wait for slide-up animation
  }, [unlocking, onUnlock]);

  useEffect(() => {
    const handleKey = () => handleUnlock();
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleUnlock]);

  return (
    <div
      className={`lock-screen ${unlocking ? 'lock-screen--unlocking' : ''}`}
      onClick={handleUnlock}
    >
      <div className="lock-screen__time">{time}</div>
      <div className="lock-screen__date">{date}</div>
      <div className="lock-screen__avatar">👤</div>
      <div className="lock-screen__username">{user?.name || 'User'}</div>
      <div className="lock-screen__hint">Click or press any key to unlock</div>
    </div>
  );
}
