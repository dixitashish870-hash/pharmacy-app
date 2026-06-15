import { AlertTriangle, X, Check } from 'lucide-react';

/**
 * ExpiryAlertsModal
 * Shows expired and expiring-soon medicines from inventory.
 * Pure display — no mutations.
 */
export default function ExpiryAlertsModal({ show, onClose, expiryAlerts, totalAlerts }) {
  if (!show) return null;

  const headerStyle = (color) => ({
    padding: '8px 16px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    color,
  });

  const cellStyle = { padding: '9px 16px' };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)',
    }}>
      <div className="card" style={{ width: 600, maxWidth: '94vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: 'linear-gradient(135deg,#EF4444,#DC2626)', color: 'white', padding: 9, borderRadius: 10, display: 'flex' }}>
              <AlertTriangle size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text)' }}>Inventory Alerts</h3>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{totalAlerts} medicine(s) need attention</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Expired */}
          {expiryAlerts.expired.length > 0 && (
            <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={14} color="#DC2626" />
                <span style={{ fontWeight: 700, fontSize: 13, color: '#DC2626' }}>Expired ({expiryAlerts.expired.length})</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
                    <th style={headerStyle('#DC2626')}>Medicine</th>
                    <th style={headerStyle('#DC2626')}>Batch</th>
                    <th style={headerStyle('#DC2626')}>Expiry</th>
                    <th style={headerStyle('#DC2626')}>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {expiryAlerts.expired.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(239,68,68,0.08)' }}>
                      <td style={{ ...cellStyle, fontWeight: 600, color: 'var(--text)' }}>{p.name}</td>
                      <td style={{ ...cellStyle, color: 'var(--text-muted)' }}>{p.batch || '—'}</td>
                      <td style={{ ...cellStyle, color: '#DC2626', fontWeight: 700 }}>{p.expiry}</td>
                      <td style={{ ...cellStyle, color: 'var(--text-muted)' }}>{p.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Expiring soon */}
          {expiryAlerts.expiring.length > 0 && (
            <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={14} color="#D97706" />
                <span style={{ fontWeight: 700, fontSize: 13, color: '#D97706' }}>Expiring in 90 Days ({expiryAlerts.expiring.length})</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
                    <th style={headerStyle('#D97706')}>Medicine</th>
                    <th style={headerStyle('#D97706')}>Batch</th>
                    <th style={headerStyle('#D97706')}>Expiry</th>
                    <th style={headerStyle('#D97706')}>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {expiryAlerts.expiring.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(245,158,11,0.08)' }}>
                      <td style={{ ...cellStyle, fontWeight: 600, color: 'var(--text)' }}>{p.name}</td>
                      <td style={{ ...cellStyle, color: 'var(--text-muted)' }}>{p.batch || '—'}</td>
                      <td style={{ ...cellStyle, color: '#D97706', fontWeight: 700 }}>{p.expiry}</td>
                      <td style={{ ...cellStyle, color: 'var(--text-muted)' }}>{p.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* All clear */}
          {totalAlerts === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              <Check size={36} style={{ opacity: 0.3, marginBottom: 10 }} />
              <div style={{ fontSize: 14 }}>All medicines are within expiry dates. ✓</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
