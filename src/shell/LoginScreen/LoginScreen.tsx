import { useState } from 'react';
import { useAuth } from '@/kernel/auth';
import './LoginScreen.css';

export function LoginScreen() {
  const login = useAuth((s) => s.login);
  const [name, setName] = useState('');
  const [animating, setAnimating] = useState(false);

  const handleLogin = () => {
    if (!name.trim()) return;
    setAnimating(true);
    setTimeout(() => login(name.trim()), 500);   // wait for fade-out
  };

  return (
    <div className={`login-screen ${animating ? 'login-screen--fade-out' : ''}`}>
      {/* Ambient gradient */}
      <div className="login-screen__bg" />

      <div className="login-screen__card">
        {/* Avatar */}
        <div className="login-screen__avatar">
          <span className="login-screen__avatar-icon">👤</span>
        </div>

        {/* Username */}
        <input
          className="login-screen__input"
          type="text"
          placeholder="Enter your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          autoFocus
        />

        {/* Sign in */}
        <button
          className="login-screen__button"
          onClick={handleLogin}
          disabled={!name.trim()}
        >
          Sign In
        </button>

        <div className="login-screen__subtitle">JuniOS v0.1</div>
      </div>
    </div>
  );
}
