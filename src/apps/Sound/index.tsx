import { useState, useRef, useEffect } from 'react';
import { useWindowManager } from '@/kernel/windowManager';
import type { AppComponentProps } from '@/shared/types';
import './Sound.css';

export default function Sound({ windowId }: AppComponentProps) {
  const windows = useWindowManager((s) => s.windows);
  const win = windows.find((w) => w.id === windowId);
  const initialUrl = (win?.metadata?.audioUrl as string) || '';
  const initialName = (win?.metadata?.fileName as string) || 'Audio Player';

  const audioRef = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState(initialUrl);
  const [fileName, setFileName] = useState(initialName);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (initialUrl && audioRef.current) {
      audioRef.current.src = initialUrl;
    }
  }, [initialUrl]);

  const togglePlay = () => {
    if (!audioRef.current || !src) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const handleTimeUpdate = () => {
    if (!dragging && audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    setCurrentTime(t);
    if (audioRef.current) audioRef.current.currentTime = t;
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    setFileName(file.name);
    setCurrentTime(0);
    setPlaying(false);
  };

  const formatTime = (s: number) => {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="sound-app">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => { if (audioRef.current) setDuration(audioRef.current.duration); }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
      />

      <div className="sound-visualizer">
        <div className="sound-disc-container">
          <div className={`sound-disc ${playing ? 'spinning' : ''}`}>
            <div className="sound-disc-inner">🎵</div>
          </div>
        </div>
      </div>

      <div className="sound-info">
        <div className="sound-title">{fileName}</div>
      </div>

      <div className="sound-progress">
        <span className="sound-time">{formatTime(currentTime)}</span>
        <input
          type="range"
          className="sound-slider"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          onMouseDown={() => setDragging(true)}
          onMouseUp={() => setDragging(false)}
        />
        <span className="sound-time">{formatTime(duration)}</span>
      </div>

      <div className="sound-controls">
        <button className="sound-btn" onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, currentTime - 10); }} title="Back 10s">
          ⏪
        </button>
        <button className="sound-btn sound-btn--play" onClick={togglePlay} disabled={!src}>
          {playing ? '⏸️' : '▶️'}
        </button>
        <button className="sound-btn" onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.min(duration, currentTime + 10); }} title="Forward 10s">
          ⏩
        </button>
      </div>

      <div className="sound-volume">
        <span className="sound-volume-icon">{volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}</span>
        <input
          type="range"
          className="sound-slider sound-slider--volume"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={handleVolumeChange}
        />
      </div>

      <div className="sound-open">
        <label className="sound-open-btn">
          📂 Open File
          <input type="file" accept="audio/*" onChange={handleFileSelect} hidden />
        </label>
      </div>
    </div>
  );
}
