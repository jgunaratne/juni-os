import { useState, useEffect } from 'react';

const STORAGE_KEY = 'junios-gemini-api-key';
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
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '');
  const [model, setModel] = useState(() => localStorage.getItem(MODEL_KEY) ?? 'gemini-2.0-flash');
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (apiKey) localStorage.setItem(STORAGE_KEY, apiKey);
    else localStorage.removeItem(STORAGE_KEY);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem(MODEL_KEY, model);
  }, [model]);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    setApiKey('');
    localStorage.removeItem(STORAGE_KEY);
  };

  const maskedKey = apiKey
    ? apiKey.slice(0, 6) + '•'.repeat(Math.max(0, apiKey.length - 10)) + apiKey.slice(-4)
    : '';

  return (
    <div className="settings-tab">
      <h3 className="settings-tab__title">AI</h3>

      {/* Gemini API Key */}
      <div className="settings-section">
        <div className="settings-section__label">Gemini API Key</div>
        <div className="ai-key-field">
          <div className="url-input-row">
            <input
              className="settings-input"
              type={showKey ? 'text' : 'password'}
              placeholder="Enter your Gemini API key..."
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setSaved(false); }}
              spellCheck={false}
              style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: 12 }}
            />
            <button
              className="settings-btn"
              onClick={() => setShowKey(!showKey)}
              style={{ minWidth: 60 }}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          {apiKey && (
            <div className="ai-key-status">
              <span className="ai-key-dot ai-key-dot--active" />
              <span className="ai-key-text">
                Key configured: {maskedKey}
              </span>
              <button className="ai-key-clear" onClick={handleClear}>
                Clear
              </button>
            </div>
          )}
          {!apiKey && (
            <div className="ai-key-status">
              <span className="ai-key-dot" />
              <span className="ai-key-text" style={{ color: 'var(--os-text-secondary)' }}>
                No API key configured
              </span>
            </div>
          )}
          <div className="ai-key-hint">
            Get a key at <strong>aistudio.google.com</strong>
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
        <div className="settings-section__label">About</div>
        <div className="about-card">
          <div className="about-card__row">
            <span className="about-card__key">Provider</span>
            <span className="about-card__val">Google Gemini</span>
          </div>
          <div className="about-card__row">
            <span className="about-card__key">API Version</span>
            <span className="about-card__val">v1beta</span>
          </div>
          <div className="about-card__row">
            <span className="about-card__key">Status</span>
            <span className="about-card__val" style={{ color: apiKey ? '#51cf66' : '#ff6b6b' }}>
              {apiKey ? 'Connected' : 'Not configured'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
