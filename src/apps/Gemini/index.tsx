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

/* ── Backend API ────────────────────────────────────────── */

function getVertexConfig() {
  return {
    project: localStorage.getItem('junios-gcp-project') || undefined,
    location: localStorage.getItem('junios-gcp-location') || undefined,
  };
}

async function callGemini(
  model: string,
  messages: Message[],
): Promise<string> {
  const res = await fetch('/api/gemini/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, ...getVertexConfig() }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.reply ?? 'No response generated.';
}

/* ── Image Generation via Backend ───────────────────────── */

interface ImageGenResult {
  text: string;
  imageUrl: string | null;
}

async function callNanoBanana(
  prompt: string,
): Promise<ImageGenResult> {
  const res = await fetch('/api/gemini/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, ...getVertexConfig() }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return {
    text: data.text || '',
    imageUrl: data.imageUrl || null,
  };
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

/** Read the model set in Control Panel → AI tab (shared localStorage key). */
function getSelectedModel(): string {
  return localStorage.getItem('junios-gemini-model') || 'gemini-2.5-flash';
}

export default function GeminiChat(_props: AppComponentProps) {
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



  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: 'user', text };
    const nextMessages: ChatEntry[] = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setIsLoading(true);

    try {
      if (imageMode) {
        // NanoBanana image generation
        const result = await callNanoBanana(text);
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
        const reply = await callGemini(getSelectedModel(), history);
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
  }, [input, isLoading, messages, imageMode]);

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
        </div>
      </div>

      {/* Messages */}
      <div className="gemini-app__messages">
        {messages.length === 0 && !isLoading && (
          <div className="gemini-app__welcome">
            <div className="gemini-app__welcome-icon">✦</div>
            <div className="gemini-app__welcome-text">
              How can I help you today?
            </div>
            <div className="gemini-app__welcome-hint">
              {imageMode
                ? 'Describe an image to generate with NanoBanana'
                : 'Type a message below to start chatting with Gemini'}
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
              imageMode
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
            disabled={!input.trim() || isLoading}
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
