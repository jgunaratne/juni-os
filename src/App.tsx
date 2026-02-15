import { useEffect } from 'react';
import { TopBar } from '@/shell/TopBar/TopBar';
import { Dock } from '@/shell/Dock/Dock';
import { Desktop } from '@/shell/Desktop/Desktop';
import { LoginScreen } from '@/shell/LoginScreen/LoginScreen';
import { useThemeManager } from '@/kernel/themeManager';
import { useAuth } from '@/kernel/auth';
import { initShortcuts } from '@/kernel/shortcutManager';

export default function App() {
  const { currentTheme, apply } = useThemeManager();
  const isAuthenticated = useAuth((s) => s.isAuthenticated);

  // Apply theme CSS variables on mount
  useEffect(() => {
    apply(currentTheme);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize keyboard shortcuts
  useEffect(() => {
    initShortcuts();
  }, []);

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="junios-shell">
      <TopBar />
      <Dock />
      <Desktop />
    </div>
  );
}
