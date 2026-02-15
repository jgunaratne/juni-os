import { useState, useCallback, useRef, useEffect } from 'react';
import type { AppComponentProps } from '@/shared/types';
import './Gemini.css';

/* ── Types ──────────────────────────────────────────────── */

interface Message {
  role: 'user' | 'model';
  text: string;
  imageUrl?: string; // base64 data URL for generated images
}

interface GeminiError {
  isError: true;
  text: string;
}

type ChatEntry = Message | GeminiError;

function isError(entry: ChatEntry): entry is GeminiError {
  return 'isError' in entry;
}

/* ── Gemini API ─────────────────────────────────────────── */

async function callGemini(
  apiKey: string,
  model: string,
  messages: Message[],
): Promise<string> {
  const contents = messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ??
    'No response generated.';
  return text;
}

/* ── NanoBanana Image Generation (Gemini Image API) ─────── */

interface ImageGenResult {
  text: string;
  imageUrl: string | null;
}

async function callNanoBanana(
  apiKey: string,
  prompt: string,
): Promise<ImageGenResult> {
  const model = 'gemini-2.0-flash-exp-image-generation';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];

  let text = '';
  let imageUrl: string | null = null;

  for (const part of parts) {
    if (part.text) {
      text += part.text;
    }
    if (part.inlineData) {
      const { mimeType, data: b64 } = part.inlineData;
      imageUrl = `data:${mimeType};base64,${b64}`;
    }
  }

  if (!imageUrl && !text) {
    text = 'No image was generated. Try a different prompt.';
  }

  return { text, imageUrl };
}

/* ── Simple Markdown Renderer ───────────────────────────── */

function renderMarkdown(text: string): string {
  return text
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.+)$/gm, '<strong>$1</strong>')
    .replace(/^## (.+)$/gm, '<strong>$1</strong>')
    .replace(/^# (.+)$/gm, '<strong>$1</strong>')
    // Lists
    .replace(/^[•\-\*] (.+)$/gm, '• $1');
}

/* ── Component ──────────────────────────────────────────── */

const STORAGE_KEY = 'junios-gemini-api-key';
const MODEL_KEY = 'junios-gemini-model';

export default function GeminiChat(_props: AppComponentProps) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '');
  const [model, setModel] = useState(() => localStorage.getItem(MODEL_KEY) ?? 'gemini-2.0-flash');
  const [showSettings, setShowSettings] = useState(!apiKey);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [imageMode, setImageMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Persist API key
  useEffect(() => {
    if (apiKey) localStorage.setItem(STORAGE_KEY, apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem(MODEL_KEY, model);
  }, [model]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    if (!apiKey) {
      setShowSettings(true);
      return;
    }

    const userMsg: Message = { role: 'user', text };
    const nextMessages: ChatEntry[] = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setIsLoading(true);

    try {
      if (imageMode) {
        // NanoBanana image generation
        const result = await callNanoBanana(apiKey, text);
        const assistantMsg: Message = {
          role: 'model',
          text: result.text || 'Here is your generated image:',
          imageUrl: result.imageUrl ?? undefined,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        // Standard Gemini chat
        const history: Message[] = nextMessages.filter(
          (m): m is Message => !isError(m),
        );
        const reply = await callGemini(apiKey, model, history);
        const assistantMsg: Message = { role: 'model', text: reply };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err) {
      const errorMsg: GeminiError = {
        isError: true,
        text: err instanceof Error ? err.message : 'Unknown error',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [input, isLoading, apiKey, model, messages, imageMode]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleClear = useCallback(() => {
    setMessages([]);
  }, []);

  const hasKey = apiKey.length > 0;

  return (
    <div className="gemini-app">
      {/* Header */}
      <div className="gemini-app__header">
        <div className="gemini-app__title">
          <span className="gemini-app__title-icon">✦</span>
          Gemini
        </div>
        <div className="gemini-app__header-actions">
          <button className="gemini-app__header-btn" onClick={handleClear}>
            Clear
          </button>
          <button
            className={`gemini-app__header-btn ${showSettings ? 'gemini-app__header-btn--active' : ''}`}
            onClick={() => setShowSettings(!showSettings)}
          >
            ⚙ Settings
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="gemini-app__settings">
          <div className="gemini-app__settings-title">API Configuration</div>
          <div className="gemini-app__settings-row">
            <span className="gemini-app__settings-label">API Key</span>
            <input
              className="gemini-app__settings-input"
              type="password"
              placeholder="Enter your Gemini API key..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="gemini-app__settings-row">
            <span className="gemini-app__settings-label">Model</span>
            <select
              className="gemini-app__settings-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
              <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite</option>
              <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
              <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
            </select>
          </div>
          <div className="gemini-app__settings-hint">
            Get a key at{' '}
            <span style={{ color: '#8ab4f8' }}>aistudio.google.com</span>
          </div>
          <div className="gemini-app__settings-status">
            <span
              className={`gemini-app__settings-dot ${hasKey ? 'gemini-app__settings-dot--connected' : ''}`}
            />
            <span style={{ color: hasKey ? '#34a853' : '#888' }}>
              {hasKey ? 'API key configured' : 'No API key set'}
            </span>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="gemini-app__messages">
        {messages.length === 0 && !isLoading && (
          <div className="gemini-app__welcome">
            <div className="gemini-app__welcome-icon">✦</div>
            <div className="gemini-app__welcome-text">
              How can I help you today?
            </div>
            <div className="gemini-app__welcome-hint">
              {hasKey
                ? imageMode
                  ? 'Describe an image to generate with NanoBanana'
                  : 'Type a message below to start chatting with Gemini'
                : 'Open Settings to enter your API key first'}
            </div>
          </div>
        )}

        {messages.map((entry, i) =>
          isError(entry) ? (
            <div key={i} className="gemini-app__message gemini-app__message--error gemini-app__message--assistant">
              <div className="gemini-app__message-avatar">⚠</div>
              <div className="gemini-app__message-content">{entry.text}</div>
            </div>
          ) : (
            <div
              key={i}
              className={`gemini-app__message gemini-app__message--${entry.role === 'user' ? 'user' : 'assistant'}`}
            >
              <div className="gemini-app__message-avatar">
                {entry.role === 'user' ? '👤' : entry.imageUrl ? '🍌' : '✦'}
              </div>
              <div className="gemini-app__message-content">
                {entry.role === 'model' && entry.imageUrl && (
                  <img
                    src={entry.imageUrl}
                    alt="Generated image"
                    className="gemini-app__generated-image"
                  />
                )}
                {entry.text && (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: entry.role === 'model' ? renderMarkdown(entry.text) : entry.text,
                    }}
                  />
                )}
              </div>
            </div>
          ),
        )}

        {isLoading && (
          <div className="gemini-app__thinking">
            <div className="gemini-app__message-avatar" style={{
              background: imageMode
                ? 'linear-gradient(135deg, #ffe082, #ffb300, #ff8f00)'
                : 'linear-gradient(135deg, #ea4335, #fbbc04, #34a853)',
              width: 28, height: 28, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
            }}>{imageMode ? '🍌' : '✦'}</div>
            <div className="gemini-app__thinking-dots">
              <span className="gemini-app__thinking-dot" />
              <span className="gemini-app__thinking-dot" />
              <span className="gemini-app__thinking-dot" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="gemini-app__input-area">
        <div className="gemini-app__input-wrapper">
          <button
            className={`gemini-app__mode-toggle ${imageMode ? 'gemini-app__mode-toggle--active' : ''}`}
            onClick={() => setImageMode(!imageMode)}
            title={imageMode ? 'Switch to Chat mode' : 'Switch to Image Generation (NanoBanana)'}
          >
            {imageMode ? '🍌' : '💬'}
          </button>
          <textarea
            ref={inputRef}
            className="gemini-app__input"
            placeholder={
              !hasKey
                ? 'Set API key in Settings first...'
                : imageMode
                  ? 'Describe an image to generate...'
                  : 'Message Gemini...'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isLoading}
          />
          <button
            className="gemini-app__send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isLoading || !hasKey}
          >
            ↑
          </button>
        </div>
        {imageMode && (
          <div className="gemini-app__mode-label">NanoBanana Image Generation</div>
        )}
      </div>
    </div>
  );
}
