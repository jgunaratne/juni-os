import { useState } from 'react';
import './Morcheeba.css';

type Tab = 'dashboard' | 'queue' | 'logs';

export default function Morcheeba() {
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <div className="morcheeba-app">
      <div className="morcheeba-tabs">
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
          🖥️ Dashboard
        </button>
        <button className={tab === 'queue' ? 'active' : ''} onClick={() => setTab('queue')}>
          📊 Queue
        </button>
        <button className={tab === 'logs' ? 'active' : ''} onClick={() => setTab('logs')}>
          📋 Logs
        </button>
      </div>
      <div className="morcheeba-content">
        {tab === 'dashboard' && <DashboardView />}
        {tab === 'queue' && <iframe src="/morcheeba/queue.html" className="morcheeba-iframe" />}
        {tab === 'logs' && <LogsView />}
      </div>
    </div>
  );
}

function DashboardView() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch('/health');
      setHealth(await res.json());
    } catch (e) {
      setHealth({ error: String(e) });
    }
    setLoading(false);
  };

  return (
    <div className="morcheeba-dashboard">
      <h2>🖥️ morcheeba</h2>
      <p className="subtitle">Local AI services — RTX 3090</p>
      <div className="services">
        <div className="service">🎤 Transcription<span className="tag">POST /api/transcribe</span></div>
        <div className="service">🎨 Image Generation<span className="tag">POST /api/generate/image</span></div>
        <div className="service">🎵 Music Generation<span className="tag">POST /api/generate/music</span></div>
      </div>
      <button className="health-btn" onClick={fetchHealth} disabled={loading}>
        {loading ? '...' : '💚 Check Health'}
      </button>
      {health && <pre className="health-output">{JSON.stringify(health, null, 2)}</pre>}
    </div>
  );
}

function LogsView() {
  const [logs, setLogs] = useState<unknown[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filter === 'error') params.set('level', 'error');
      if (['transcribe', 'image', 'music'].includes(filter)) params.set('type', filter);
      const res = await fetch(`/api/logs?${params}`);
      setLogs(await res.json());
    } catch (e) {
      setLogs([{ error: String(e) }]);
    }
    setLoading(false);
  };

  return (
    <div className="morcheeba-logs">
      <div className="logs-toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="error">Errors Only</option>
          <option value="transcribe">Transcribe</option>
          <option value="image">Image</option>
          <option value="music">Music</option>
        </select>
        <button onClick={fetchLogs} disabled={loading}>{loading ? '...' : '🔄 Refresh'}</button>
      </div>
      <div className="logs-list">
        {logs.length === 0 && <p className="empty">No logs yet. Click refresh.</p>}
        {[...logs].reverse().map((log: any, i) => (
          <div key={i} className={`log-entry ${log.level === 'error' ? 'error' : ''}`}>
            <span className="log-time">{log.timestamp?.slice(11, 19) || '??'}</span>
            <span className={`log-level ${log.level}`}>{log.level?.toUpperCase()}</span>
            <span className="log-event">{log.event}</span>
            <span className="log-type">{log.type}</span>
            {log.file && <span className="log-file">{log.file}</span>}
            {log.error && <span className="log-error">{log.error}</span>}
            {log.elapsed != null && <span className="log-elapsed">{log.elapsed}s</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
