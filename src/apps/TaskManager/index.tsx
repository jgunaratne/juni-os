import { useEffect, useState, useCallback } from 'react';
import { useProcessManager } from '@/kernel/processManager';
import { useWindowManager } from '@/kernel/windowManager';
import { useWorkspaceManager } from '@/kernel/workspaceManager';
import { getApp } from '@/shared/appRegistry';
import type { AppComponentProps } from '@/shared/types';
import './TaskManager.css';

export default function TaskManager(_props: AppComponentProps) {
  const processes = useProcessManager((s) => s.processes);
  const terminateProcess = useProcessManager((s) => s.terminateProcess);
  const closeWindow = useWindowManager((s) => s.closeWindow);
  const removeWindowFromWorkspace = useWorkspaceManager((s) => s.removeWindowFromWorkspace);
  const [, forceUpdate] = useState(0);

  // Auto-refresh every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => forceUpdate((n) => n + 1), 2000);
    return () => clearInterval(interval);
  }, []);

  const activeProcesses = processes.filter((p) => p.status !== 'terminated');

  const handleEndProcess = useCallback(
    (processId: string, windowId: string) => {
      terminateProcess(processId);
      closeWindow(windowId);
      removeWindowFromWorkspace(windowId);
    },
    [terminateProcess, closeWindow, removeWindowFromWorkspace],
  );

  const formatMemory = (bytes: number): string => {
    if (bytes === 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="task-manager">
      <div className="task-manager__header">
        <h2>Task Manager</h2>
        <div className="task-manager__summary">
          <div className="task-manager__summary-item">
            <span className="task-manager__summary-dot" />
            {activeProcesses.length} process{activeProcesses.length !== 1 ? 'es' : ''}
          </div>
        </div>
      </div>

      {activeProcesses.length === 0 ? (
        <div className="task-manager__empty">No running processes</div>
      ) : (
        <div className="task-manager__table-container">
          <table className="task-manager__table">
            <thead>
              <tr>
                <th>Application</th>
                <th>PID</th>
                <th>Status</th>
                <th>Memory</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activeProcesses.map((proc) => {
                const app = getApp(proc.appId);
                return (
                  <tr key={proc.id}>
                    <td>
                      <div className="task-manager__app-cell">
                        <span className="task-manager__app-icon">{app?.icon ?? '📄'}</span>
                        {app?.title ?? proc.appId}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'monospace', opacity: 0.6 }}>{proc.id.slice(0, 8)}</td>
                    <td>
                      <span className={`task-manager__status task-manager__status--${proc.status}`}>
                        {proc.status}
                      </span>
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatMemory(proc.memoryUsage)}
                    </td>
                    <td>
                      <button
                        className="task-manager__end-btn"
                        onClick={() => handleEndProcess(proc.id, proc.windowId)}
                      >
                        End
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
