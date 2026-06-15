import { Plus, Minus, Trash2, AlertTriangle, Sparkles, TrendingUp, Command } from 'lucide-react';
import { fmt2 } from '../../utils/gstEngine';

/* ── helpers (local to cart) ── */
const fmtIN = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const shortMonth = (ym) => {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m - 1]}'${y.slice(2)}`;
};

const expiryStatus = (exp) => {
  if (!exp) return null;
  const diff = (new Date(exp + '-01') - new Date()) / 86400000;
  if (diff < 0) return 'expired';
  if (diff <= 90) return 'expiring';
  return 'ok';
};

const ExpiryBadge = ({ exp }) => {
  const s = expiryStatus(exp);
  if (!s || s === 'ok') return exp
    ? <span className="badge badge-green">{shortMonth(exp)}</span>
    : <span className="badge badge-gray">—</span>;
  if (s === 'expiring') return (
    <span className="badge badge-yellow" style={{ gap: 3, display: 'inline-flex' }}>
      <AlertTriangle size={10} />{shortMonth(exp)}
    </span>
  );
  return (
    <span className="badge badge-red" style={{ gap: 3, display: 'inline-flex' }}>
      <AlertTriangle size={10} />EXPIRED
    </span>
  );
};

/**
 * CartTable
 * Renders the scrollable cart rows or the empty-state placeholder.
 */
export default function CartTable({ cart, updateQty, setItemQty, updateItemDiscount, removeFromCart, onQuickAdd }) {
  if (cart.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '40px 20px 140px', background: 'var(--bg-main)', height: '100%', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 600, width: '100%' }}>
          <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: '50%', boxShadow: '0 8px 32px rgba(26,111,255,0.1)', marginBottom: 24, animation: 'float 4s ease-in-out infinite' }}>
            <Sparkles size={48} color="var(--brand-teal)" strokeWidth={1.5} />
          </div>

          <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: '0 0 8px', letterSpacing: '-0.5px' }}>Ready for next patient</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 32px', textAlign: 'center' }}>Search by salt, brand, or barcode. AI will suggest combinations.</p>

          {/* Smart Suggestions */}
          <div style={{ width: '100%', marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <TrendingUp size={14} /> Frequently Sold Today
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              {['Dolo 650', 'Pan 40', 'Augmentin 625', 'Calpol 500'].map(med => (
                <button key={med}
                  onClick={() => onQuickAdd?.(med)}
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 12px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--brand-blue)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(26,111,255,0.1)'; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)'; }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{med}</div>
                  <div style={{ fontSize: 11, color: 'var(--brand-blue)', fontWeight: 600 }}>+ Quick Add</div>
                </button>
              ))}
            </div>
          </div>

          {/* Shortcuts */}
          <div style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <Command size={14} /> Keyboard Shortcuts
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                ['Focus Search', 'F2'],
                ['Checkout / Pay', 'F12'],
                ['Focus Phone', 'Ctrl+D'],
                ['Hold Bill', 'Ctrl+S'],
              ].map(([label, key]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
                  <kbd style={{ padding: '3px 6px', background: 'var(--bg-table-header)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, fontFamily: 'monospace', fontWeight: 600 }}>{key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1, paddingBottom: 140 }}>
      <table className="pos-table" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '2.5%' }} />
          <col style={{ width: '22%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '11.5%' }} />
          <col style={{ width: '3%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            <th>Product</th>
            <th>Batch</th>
            <th>Exp</th>
            <th>Qty</th>
            <th>MRP</th>
            <th style={{ color: '#64748b' }}>Taxable</th>
            <th style={{ color: '#d97706' }}>TAX%</th>
            <th>Disc%</th>
            <th style={{ textAlign: 'right' }}>Amount</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item, idx) => {
            const es = expiryStatus(item.expiry);
            const isNegMargin = item.finalAmt < item.purchase_price * item.quantity;
            const catClass = { PHARMA: 'cat-pharma', GENERIC: 'cat-generic', FMCG: 'cat-fmcg', PL: 'cat-pl' }[item.item_type] || 'cat-pharma';
            return (
              <tr
                key={item.product_id}
                className={`${catClass} ${item.isNew ? 'row-new' : ''} ${es === 'expired' ? 'row-expired' : es === 'expiring' ? 'row-expiring' : ''}`}
              >
                <td style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 11 }}>{idx + 1}</td>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.2 }}>{item.name}</div>
                  {item.brand_name && <div style={{ fontSize: 11, color: 'var(--primary)' }}>{item.brand_name}</div>}
                  {item.salt_composition && <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.1, marginTop: 1 }}>{item.salt_composition}</div>}
                  {isNegMargin && (
                    <div style={{ fontSize: 9, fontWeight: 800, color: '#DC2626', background: '#FEE2E2', padding: '1px 5px', borderRadius: 4, display: 'inline-block', marginTop: 2 }}>
                      ⚠ Below Cost
                    </div>
                  )}
                </td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{item.batch || '—'}</td>
                <td><ExpiryBadge exp={item.expiry} /></td>
                <td>
                  <div className="qty-stepper">
                    <button onClick={() => updateQty(item.product_id, -1)}><Minus size={11} /></button>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={e => setItemQty(item.product_id, parseInt(e.target.value) || 1)}
                      min={1} max={item.stock}
                    />
                    <button onClick={() => updateQty(item.product_id, 1)}><Plus size={11} /></button>
                  </div>
                </td>
                <td style={{ fontWeight: 600, fontSize: 13 }}>₹{fmt2(item.original_strip_mrp)}</td>
                <td style={{ fontSize: 12, color: '#475569', fontVariantNumeric: 'tabular-nums' }}>₹{fmt2(item.taxableAmt)}</td>
                <td style={{ textAlign: 'center' }}>
                  {item.gst > 0
                    ? <span className="badge badge-blue">{item.gst}%</span>
                    : <span className="badge badge-gray">Nil</span>}
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <input
                      type="number" min={0} max={100} step={0.5}
                      value={item.discount_pct}
                      onChange={e => updateItemDiscount(item.product_id, e.target.value)}
                      style={{ width: 52, padding: '3px 2px', border: '1px solid var(--border)', borderRadius: 6, textAlign: 'center', fontSize: 12 }}
                    />
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>%</span>
                  </div>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: 'var(--success)', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>₹{fmtIN(item.finalAmt)}</div>
                </td>
                <td>
                  <button
                    onClick={() => removeFromCart(item.product_id)}
                    style={{ color: 'var(--text-muted)', background: 'none', border: 'none', padding: 4, borderRadius: 6 }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
