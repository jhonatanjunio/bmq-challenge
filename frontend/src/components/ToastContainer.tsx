/* Renderização do sistema de notificações toast */

import { Icon } from './icons';
import type { Toast } from '../types';

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: number) => void;
}

/* Configurações visuais por tipo de toast */
const TOAST_CONFIGS = {
  success: {
    border: '#22c55e',
    icon: <Icon.Check />,
    iconColor: '#4ade80',
    textColor: '#d1fae5',
  },
  error: {
    border: '#ef4444',
    icon: <Icon.X />,
    iconColor: '#f87171',
    textColor: '#fee2e2',
  },
  warning: {
    border: '#eab308',
    icon: <Icon.AlertTriangle />,
    iconColor: '#facc15',
    textColor: '#fef3c7',
  },
  info: {
    border: '#3b82f6',
    icon: <Icon.Info />,
    iconColor: '#60a5fa',
    textColor: '#dbeafe',
  },
} as const;

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        alignItems: 'flex-end',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => {
        const c = TOAST_CONFIGS[toast.type] ?? TOAST_CONFIGS.info;
        return (
          <div
            key={toast.id}
            className={toast.leaving ? 'toast-leave' : 'toast-enter'}
            style={{
              pointerEvents: toast.leaving ? 'none' : 'auto',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              background: 'rgba(22,25,34,0.96)',
              backdropFilter: 'blur(8px)',
              border: '1px solid #1e2436',
              borderLeft: `4px solid ${c.border}`,
              borderRadius: 8,
              padding: '12px 14px',
              maxWidth: 360,
              minWidth: 260,
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            <span style={{ color: c.iconColor, flexShrink: 0, marginTop: 1 }}>
              {c.icon}
            </span>
            <span
              style={{
                fontSize: '0.82rem',
                color: c.textColor,
                flex: 1,
                lineHeight: 1.45,
              }}
            >
              {toast.msg}
            </span>
            <button
              onClick={() => onRemove(toast.id)}
              style={{
                color: '#4b5563',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Icon.X />
            </button>
          </div>
        );
      })}
    </div>
  );
}
