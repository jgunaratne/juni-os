import { useState } from 'react';
import { useAuth } from '@/kernel/auth';
import './LoginScreen.css';

export function LoginScreen() {
  const login = useAuth((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [animating, setAnimating] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setAnimating(true);
        setTimeout(() => login(data.username), 500);
      } else {
        setError(data.error || 'Authentication failed');
      }
    } catch {
      setError('Connection error');
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <div className={`login-screen ${animating ? 'login-screen--fade-out' : ''}`}>
      <div className="login-screen__bg" />

      <div className="login-screen__card">
        <div className="login-screen__avatar">
          <span className="login-screen__avatar-icon">👤</span>
        </div>

        <input
          className="login-screen__input"
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          autoComplete="username"
        />

        <input
          className="login-screen__input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="current-password"
        />

        {error && <div className="login-screen__error">{error}</div>}

        <button
          className="login-screen__button"
          onClick={handleLogin}
          disabled={!username.trim() || !password || loading}
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>

        <div className="login-screen__subtitle">JuniOS v0.1</div>
      </div>
    </div>
  );
}
