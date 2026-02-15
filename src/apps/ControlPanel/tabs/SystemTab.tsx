import { useProcessManager } from '@/kernel/processManager';
import { getApp } from '@/shared/appRegistry';

export function SystemTab() {
  const processes = useProcessManager((s) => s.processes);
  const activeProcesses = processes.filter((p) => p.status !== 'terminated');

  return (
    <div className="settings-tab">
      <h3 className="settings-tab__title">System</h3>

      {/* Running Processes */}
      <div className="settings-section">
        <div className="settings-section__label">
          Running Processes ({activeProcesses.length})
        </div>
        <div className="process-list">
          {activeProcesses.length === 0 ? (
            <div className="process-empty">No running processes</div>
          ) : (
            activeProcesses.map((proc) => {
              const app = getApp(proc.appId);
              return (
                <div key={proc.id} className="process-row">
                  <span className="process-row__icon">{app?.icon ?? '📦'}</span>
                  <span className="process-row__name">{app?.title ?? proc.appId}</span>
                  <span className={`process-row__status process-row__status--${proc.status}`}>
                    {proc.status}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* About */}
      <div className="settings-section">
        <div className="settings-section__label">About</div>
        <div className="about-card">
          <div className="about-card__row">
            <span className="about-card__key">OS</span>
            <span className="about-card__val">JuniOS</span>
          </div>
          <div className="about-card__row">
            <span className="about-card__key">Version</span>
            <span className="about-card__val">0.1.0</span>
          </div>
          <div className="about-card__row">
            <span className="about-card__key">Runtime</span>
            <span className="about-card__val">Browser (Vite + React)</span>
          </div>
          <div className="about-card__row">
            <span className="about-card__key">Platform</span>
            <span className="about-card__val">{navigator.platform}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
