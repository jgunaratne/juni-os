import { useNotificationManager } from '@/kernel/notificationManager';
import type { NotificationType } from '@/kernel/notificationManager';
import './NotificationCenter.css';

const TYPE_ICONS: Record<NotificationType, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌',
};

export function NotificationCenter() {
  const notifications = useNotificationManager((s) => s.notifications);
  const dismiss = useNotificationManager((s) => s.dismissNotification);

  if (notifications.length === 0) return null;

  return (
    <div className="notification-center">
      {notifications.map((n) => (
        <div key={n.id} className={`notification-toast notification-toast--${n.type}`}>
          <span className="notification-toast__icon">{TYPE_ICONS[n.type]}</span>
          <div className="notification-toast__content">
            <div className="notification-toast__title">{n.title}</div>
            {n.body && <div className="notification-toast__body">{n.body}</div>}
          </div>
          <button className="notification-toast__dismiss" onClick={() => dismiss(n.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
