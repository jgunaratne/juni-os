import { useState } from 'react';
import { AppearanceTab } from './tabs/AppearanceTab';
import { WallpaperTab } from './tabs/WallpaperTab';
import { DockTab } from './tabs/DockTab';
import { DisplayTab } from './tabs/DisplayTab';
import { TypographyTab } from './tabs/TypographyTab';
import { SystemTab } from './tabs/SystemTab';
import { AITab } from './tabs/AITab';
import './ControlPanel.css';

type TabId = 'appearance' | 'wallpaper' | 'dock' | 'display' | 'typography' | 'ai' | 'system';

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: 'appearance', label: 'Appearance', icon: '🎨' },
  { id: 'wallpaper', label: 'Wallpaper', icon: '🖼️' },
  { id: 'dock', label: 'Dock', icon: '⬜' },
  { id: 'display', label: 'Display', icon: '🖥️' },
  { id: 'typography', label: 'Typography', icon: '🔤' },
  { id: 'ai', label: 'AI', icon: '✦' },
  { id: 'system', label: 'System', icon: '⚙️' },
];

const tabComponents: Record<TabId, React.FC> = {
  appearance: AppearanceTab,
  wallpaper: WallpaperTab,
  dock: DockTab,
  display: DisplayTab,
  typography: TypographyTab,
  ai: AITab,
  system: SystemTab,
};

export default function ControlPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('appearance');
  const ActiveComponent = tabComponents[activeTab];

  return (
    <div className="cp">
      {/* Sidebar */}
      <nav className="cp__sidebar">
        <div className="cp__sidebar-title">Settings</div>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`cp__nav-item ${activeTab === tab.id ? 'cp__nav-item--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="cp__nav-icon">{tab.icon}</span>
            <span className="cp__nav-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="cp__content">
        <ActiveComponent />
      </main>
    </div>
  );
}
