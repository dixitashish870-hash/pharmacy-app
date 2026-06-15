import { Play, X } from 'lucide-react';

const fmt = (n) => parseFloat(n || 0).toFixed(2);

/**
 * RecallBillModal
 * Lists all held (on-hold) bills and lets the user restore one.
 */
export default function RecallBillModal({ show, onClose, heldCarts, onRecall }) {
  if (!show) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)',
    }}>
      <div className="card" style={{ width: 500, maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ background: '#E0E7FF', color: '#4338CA', padding: 8, borderRadius: 8 }}>
              <Play size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16 }}>Recall Held Bills</h3>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{heldCarts.length} bill(s) currently on hold</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {heldCarts.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>No held bills found.</div>
          ) : (
            heldCarts.map((h, i) => (
              <div
                key={i}
                style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2)' }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
                    {h.patient?.name || (h.selectedCustomer ? h.selectedCustomer.name : 'Walk-in Customer')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                    <span>⏱️ {h.time || 'Unknown time'}</span>
                    <span>📦 {h.cart.reduce((sum, item) => sum + item.quantity, 0)} items</span>
                    <span style={{ fontWeight: 600, color: 'var(--success)' }}>
                      ₹{fmt(Math.max(0, h.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0) - (h.billDiscountAmt || 0)))}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                    {h.cart.slice(0, 3).map(c => `${c.name} (x${c.quantity})`).join(', ')}
                    {h.cart.length > 3 && ` + ${h.cart.length - 3} more`}
                  </div>
                </div>
                <button className="btn-primary" onClick={() => onRecall(i)}>
                  Recall
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
