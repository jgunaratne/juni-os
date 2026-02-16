import { useState, useEffect, useCallback } from 'react';

const PROJECT_KEY = 'junios-gcp-project';
const LOCATION_KEY = 'junios-gcp-location';
const MODEL_KEY = 'junios-gemini-model';

const MODELS = [
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
];

export function AITab() {
  const [project, setProject] = useState(() => localStorage.getItem(PROJECT_KEY) ?? '');
  const [location, setLocation] = useState(() => localStorage.getItem(LOCATION_KEY) ?? 'us-central1');
  const [model, setModel] = useState(() => localStorage.getItem(MODEL_KEY) ?? 'gemini-2.5-flash');
  const [saved, setSaved] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [backendInfo, setBackendInfo] = useState<{ project?: string; location?: string }>({});

  // Persist settings
  useEffect(() => {
    if (project) localStorage.setItem(PROJECT_KEY, project);
    else localStorage.removeItem(PROJECT_KEY);
  }, [project]);

  useEffect(() => {
    localStorage.setItem(LOCATION_KEY, location);
  }, [location]);

  useEffect(() => {
    localStorage.setItem(MODEL_KEY, model);
  }, [model]);

  // Health check
  const checkBackend = useCallback(async () => {
    setBackendStatus('checking');
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setBackendInfo({ project: data.project, location: data.location });
        setBackendStatus('connected');
      } else {
        setBackendStatus('error');
      }
    } catch {
      setBackendStatus('error');
    }
  }, []);

  useEffect(() => {
    checkBackend();
  }, [checkBackend]);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const statusColor =
    backendStatus === 'connected' ? '#51cf66' :
      backendStatus === 'error' ? '#ff6b6b' : 'var(--os-text-secondary)';

  const statusText =
    backendStatus === 'connected' ? 'Connected' :
      backendStatus === 'error' ? 'Disconnected' : 'Checking…';

  return (
    <div className="settings-tab">
      <h3 className="settings-tab__title">AI</h3>

      {/* Vertex AI Configuration */}
      <div className="settings-section">
        <div className="settings-section__label">Vertex AI Configuration</div>
        <div className="ai-key-field">
          <div className="url-input-row" style={{ marginBottom: 8 }}>
            <span style={{ minWidth: 90, fontSize: 12, color: 'var(--os-text-secondary)' }}>Project ID</span>
            <input
              className="settings-input"
              type="text"
              placeholder="my-gcp-project"
              value={project}
              onChange={(e) => { setProject(e.target.value); setSaved(false); }}
              spellCheck={false}
              style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: 12 }}
            />
          </div>
          <div className="url-input-row">
            <span style={{ minWidth: 90, fontSize: 12, color: 'var(--os-text-secondary)' }}>Location</span>
            <input
              className="settings-input"
              type="text"
              placeholder="us-central1"
              value={location}
              onChange={(e) => { setLocation(e.target.value); setSaved(false); }}
              spellCheck={false}
              style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: 12 }}
            />
          </div>
          <div className="ai-key-hint">
            These override the backend defaults. Leave <strong>Project ID</strong> empty to use the server's <code>.env</code> value.
          </div>
        </div>
      </div>

      {/* Default Model */}
      <div className="settings-section">
        <div className="settings-section__label">Default Model</div>
        <div className="model-list">
          {MODELS.map((m) => (
            <button
              key={m.value}
              className={`font-option ${model === m.value ? 'font-option--active' : ''}`}
              onClick={() => { setModel(m.value); handleSave(); }}
            >
              <span className="font-option__name">{m.label}</span>
              <span className="font-option__sample" style={{ fontFamily: 'monospace', fontSize: 11 }}>
                {m.value}
              </span>
            </button>
          ))}
        </div>
        {saved && (
          <div className="ai-saved-toast">✓ Saved</div>
        )}
      </div>

      {/* About */}
      <div className="settings-section">
        <div className="settings-section__label">Backend Status</div>
        <div className="about-card">
          <div className="about-card__row">
            <span className="about-card__key">Provider</span>
            <span className="about-card__val">Google Vertex AI</span>
          </div>
          <div className="about-card__row">
            <span className="about-card__key">Server Project</span>
            <span className="about-card__val" style={{ fontFamily: 'monospace', fontSize: 11 }}>
              {backendInfo.project || '—'}
            </span>
          </div>
          <div className="about-card__row">
            <span className="about-card__key">Server Location</span>
            <span className="about-card__val" style={{ fontFamily: 'monospace', fontSize: 11 }}>
              {backendInfo.location || '—'}
            </span>
          </div>
          <div className="about-card__row">
            <span className="about-card__key">Status</span>
            <span className="about-card__val" style={{ color: statusColor }}>
              {statusText}
            </span>
          </div>
        </div>
        <button
          className="settings-btn"
          onClick={checkBackend}
          style={{ marginTop: 8, fontSize: 12 }}
        >
          Refresh Status
        </button>
      </div>
    </div>
  );
}
