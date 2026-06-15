import { useEffect, useRef } from 'react';
import { AlertTriangle, HelpCircle, X } from 'lucide-react';
import { useUI } from '../context/UIContext';

export default function ConfirmModal() {
  const { confirmState, handleConfirmResult } = useUI();
  const cancelRef = useRef(null);

  // Focus cancel button on open; trap tab inside modal; Escape = cancel
  useEffect(() => {
    if (!confirmState) return;
    cancelRef.current?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') handleConfirmResult(false);
      if (e.key === 'Tab') {
        const focusable = modalRef.current?.querySelectorAll('button') || [];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmState, handleConfirmResult]);

  const modalRef = useRef(null);

  if (!confirmState) return null;

  const {
    message,
    options: {
      title = 'Are you sure?',
      danger = false,
      confirmLabel = 'Confirm',
      cancelLabel = 'Cancel',
    } = {},
  } = confirmState;

  const confirmColor = danger ? '#EF4444' : '#6366F1';
  const confirmBg    = danger
    ? 'linear-gradient(135deg,#EF4444,#DC2626)'
    : 'linear-gradient(135deg,#6366F1,#4F46E5)';
  const confirmShadow = danger
    ? '0 4px 14px rgba(239,68,68,0.35)'
    : '0 4px 14px rgba(99,102,241,0.35)';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={() => handleConfirmResult(false)}
    >
      <div
        ref={modalRef}
        style={{
          background: 'var(--surface)',
          border: `1.5px solid ${danger ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
          borderRadius: 18,
          padding: '28px 28px 22px',
          width: 380,
          maxWidth: '90vw',
          boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
          animation: 'confirmIn 0.3s cubic-bezier(0.34,1.56,0.64,1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            background: danger ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {danger
              ? <AlertTriangle size={20} color="#EF4444" />
              : <HelpCircle size={20} color="#6366F1" />
            }
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 4, letterSpacing: '-0.3px' }}>
              {title}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {message}
            </div>
          </div>
          <button
            onClick={() => handleConfirmResult(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6, flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            ref={cancelRef}
            onClick={() => handleConfirmResult(false)}
            style={{
              padding: '9px 18px', borderRadius: 10,
              border: '1.5px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text)',
              fontWeight: 700, fontSize: 13,
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = confirmColor}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => handleConfirmResult(true)}
            style={{
              padding: '9px 22px', borderRadius: 10,
              border: 'none',
              background: confirmBg,
              color: 'white',
              fontWeight: 700, fontSize: 13,
              cursor: 'pointer',
              boxShadow: confirmShadow,
              transition: 'all 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.filter = 'none'; e.currentTarget.style.transform = 'none'; }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes confirmIn {
          from { opacity: 0; transform: scale(0.92) translateY(-12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
