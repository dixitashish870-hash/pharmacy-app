import { useEffect, useRef, useState } from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useUI } from '../context/UIContext';

const CONFIG = {
  success: { icon: CheckCircle,   color: '#10B981', bg: 'rgba(16,185,129,0.1)',  border: '#10B981' },
  error:   { icon: AlertCircle,   color: '#EF4444', bg: 'rgba(239,68,68,0.1)',   border: '#EF4444' },
  warning: { icon: AlertTriangle, color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  border: '#F59E0B' },
  info:    { icon: Info,          color: '#6366F1', bg: 'rgba(99,102,241,0.1)',   border: '#6366F1' },
};

function ToastItem({ id, message, type, duration }) {
  const { dismissToast } = useUI();
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef(null);

  const dismiss = () => {
    setExiting(true);
    setTimeout(() => dismissToast(id), 300);
  };

  useEffect(() => {
    timerRef.current = setTimeout(dismiss, duration);
    return () => clearTimeout(timerRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cfg = CONFIG[type] || CONFIG.info;
  const Icon = cfg.icon;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        background: 'var(--surface)',
        border: `1.5px solid ${cfg.border}`,
        borderRadius: 14,
        padding: '12px 14px',
        minWidth: 280,
        maxWidth: 380,
        boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
        position: 'relative',
        overflow: 'hidden',
        animation: exiting ? 'toastOut 0.3s ease forwards' : 'toastIn 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards',
        cursor: 'default',
      }}
    >
      {/* Icon */}
      <div style={{
        width: 32, height: 32, borderRadius: 9,
        background: cfg.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={16} color={cfg.color} />
      </div>

      {/* Message */}
      <div style={{ flex: 1, paddingTop: 6, fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>
        {message}
      </div>

      {/* Close button */}
      <button
        onClick={dismiss}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, borderRadius: 5, flexShrink: 0, marginTop: 2 }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        <X size={13} />
      </button>

      {/* Progress bar */}
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0,
        height: 3,
        background: cfg.color,
        borderRadius: '0 0 0 14px',
        animation: `toastProgress ${duration}ms linear forwards`,
        opacity: 0.6,
      }} />

      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(24px) scale(0.95); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes toastOut {
          from { opacity: 1; transform: translateX(0) scale(1); max-height: 80px; margin-bottom: 0; }
          to   { opacity: 0; transform: translateX(24px) scale(0.95); max-height: 0; margin-bottom: -8px; }
        }
        @keyframes toastProgress {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  );
}

export default function Toast() {
  const { toasts } = useUI();

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 80,   /* stays above the right nav sidebar */
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      alignItems: 'flex-end',
      pointerEvents: 'none',
    }}>
      {toasts.slice(-4).map(t => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <ToastItem {...t} />
        </div>
      ))}
    </div>
  );
}
