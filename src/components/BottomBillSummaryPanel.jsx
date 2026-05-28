import React, { useState } from 'react';
import { Banknote, Wifi, CreditCard, IndianRupee, Printer, Check, RefreshCw, Clock, ShieldAlert, ShoppingCart, Tag, Percent, ChevronDown, ChevronUp, Scissors, Plus, X } from 'lucide-react';

const fmtIN = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PAYMENT_MODES = [
  { id: 'cash',   icon: Banknote,     label: 'Cash',   color: '#10b981' },
  { id: 'upi',    icon: Wifi,         label: 'UPI',    color: '#6366f1' },
  { id: 'card',   icon: CreditCard,   label: 'Card',   color: '#3b82f6' },
  { id: 'credit', icon: IndianRupee,  label: 'Udhaar', color: '#f59e0b' },
];

export default function BottomBillSummaryPanel({
  cart,
  typeTotals,
  mrpTotal,
  gstSlabs,
  totalAmount: totalAmountProp,
  discountAmount,
  itemDiscountTotal,
  billDiscountAmt,
  setBillDiscountAmt,
  roundedAmt,
  savingsPct,
  profit,
  payments,
  setPayments,
  splitMode,
  setSplitMode,
  handleCheckout,
  checkoutLoading,
  selectedCustomer,
  prescriberName,
  warnings,
  totalAmount: billTotal,
}) {
  const [showSlabs, setShowSlabs] = useState(false);
  const itemCount   = cart.length;
  const totalAmount = billTotal || totalAmountProp || 0;
  const hasCreditSplit = payments.some(p => p.method === 'credit');
  const splitSum = splitMode ? payments.reduce((s, p) => s + (Number(p.amount) || 0), 0) : 0;
  const isSplitUnbalanced = splitMode && Math.abs(splitSum - totalAmount) > 0.01;
  const isDisabled  = cart.length === 0 || checkoutLoading || isSplitUnbalanced || !selectedCustomer || !prescriberName?.trim();
  const splitRemaining = splitMode && payments.length > 1 ? totalAmount - splitSum : 0;
  const hasWarning  = warnings.expiring > 0 || warnings.scheduleH;
  const isProfit    = profit >= 0;
  const slabEntries = Object.entries(gstSlabs || {}).filter(([, v]) => v.taxable > 0).sort(([a], [b]) => Number(a) - Number(b));


  return (
    <>
      <style>{`
        @keyframes bbsp-glow-pulse {
          0%, 100% { box-shadow: 0 0 20px 4px rgba(16,185,129,0.25); }
          50%       { box-shadow: 0 0 32px 8px rgba(16,185,129,0.45); }
        }
        @keyframes bbsp-spin { to { transform: rotate(360deg); } }
        .bbsp-pay-active { transform: translateY(-2px) scale(1.04); }
        .bbsp-pay-btn { transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1); }
        .bbsp-pay-btn:not(.bbsp-pay-active):hover { transform: translateY(-1px); }
        .bbsp-checkout-btn { transition: all 0.25s cubic-bezier(0.34,1.56,0.64,1); }
        .bbsp-checkout-btn:not(:disabled):hover { transform: translateY(-2px) scale(1.02); }
        .bbsp-checkout-btn:not(:disabled):active { transform: scale(0.97); }
        .bbsp-checkout-btn.glowing { animation: bbsp-glow-pulse 2s infinite; }
        .bbsp-cat-chip { transition: transform 0.18s ease, box-shadow 0.18s ease; }
        .bbsp-cat-chip:hover { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(0,0,0,0.08); }
        .bbsp-disc-input:focus { outline: none; border-color: #f43f5e; box-shadow: 0 0 0 3px rgba(244,63,94,0.15); }
        .bbsp-slab-row { font-size: 11px; display: flex; justify-content: space-between; padding: 2px 0; }
      `}</style>

      {/* ── FLOATING ISLAND CONTAINER ── */}
      <div
        className="no-print"
        style={{
          position: 'fixed', bottom: 14, left: 12,
          right: 'calc(64px + 12px)',
          zIndex: 100,
          display: 'flex', alignItems: 'stretch', gap: 0,
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid var(--glass-border)',
          borderRadius: 20,
          boxShadow: 'var(--glass-shadow)',
          overflow: 'visible',
        }}
      >

        {/* ══ SECTION 1: CATEGORY CHIPS ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5, padding: '10px 14px 10px 16px', borderRight: '1px solid var(--border)', minWidth: 160, flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Item Type</div>
          {[
            { id: 'PHARMA',  label: 'Pharma',  bg: '#f0fdfa', color: '#0d9488', border: '#99f6e4' },
            { id: 'GENERIC', label: 'Generic', bg: '#f0f9ff', color: '#0284c7', border: '#bae6fd' },
            { id: 'FMCG',    label: 'FMCG',   bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe' },
            { id: 'PL',      label: 'PL',      bg: '#fff1f2', color: '#e11d48', border: '#fecdd3' },
          ].map(cat => (
            <div key={cat.id} className="bbsp-cat-chip"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: cat.bg, border: `1px solid ${cat.border}`, borderRadius: 10, padding: '4px 10px' }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: cat.color }}>{cat.label}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: cat.color, fontVariantNumeric: 'tabular-nums' }}>₹{fmtIN(typeTotals[cat.id] || 0)}</span>
            </div>
          ))}
        </div>

        {/* ══ SECTION 2: FINANCIAL BREAKDOWN ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, padding: '10px 16px', borderRight: '1px solid var(--border)', minWidth: 200, flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-light)', textTransform: 'uppercase', marginBottom: 3 }}>Bill Breakdown</div>

          {/* Gross MRP */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Gross MRP</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>₹{fmtIN(mrpTotal)}</span>
          </div>

          {/* Item Discount */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}><Tag size={10}/>Item Disc</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#e11d48', fontVariantNumeric: 'tabular-nums' }}>-₹{fmtIN(itemDiscountTotal || discountAmount)}</span>
          </div>



          {/* Round off */}
          {roundedAmt !== 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Round Off</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{roundedAmt > 0 ? '+' : ''}₹{fmtIN(Math.abs(roundedAmt))}</span>
            </div>
          )}

          <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />

          {/* Savings */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#16a34a' }}><Percent size={10}/>Savings</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 6, padding: '1px 7px', fontVariantNumeric: 'tabular-nums' }}>{savingsPct}%</span>
          </div>

          {/* GST Slab toggle */}
          {slabEntries.length > 0 && (
            <button
              onClick={() => setShowSlabs(v => !v)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: '#6366f1', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', marginTop: 2 }}
            >
              <span>GST Slab Detail</span>
              {showSlabs ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
            </button>
          )}

          {/* Slab table popup */}
          {showSlabs && slabEntries.length > 0 && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 'calc(168px + 16px)', marginBottom: 8,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              boxShadow: 'var(--shadow-xl)', padding: '10px 14px', minWidth: 240, zIndex: 200,
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', marginBottom: 6 }}>GST Slab Breakup</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 2, fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
                <span>Rate</span><span style={{ textAlign: 'right' }}>Taxable</span><span style={{ textAlign: 'right' }}>CGST</span><span style={{ textAlign: 'right' }}>SGST</span>
              </div>
              {slabEntries.map(([slab, v]) => (
                <div key={slab} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 2, fontSize: 11, borderTop: '1px solid var(--border)', paddingTop: 3, marginTop: 3 }}>
                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>{slab}%</span>
                  <span style={{ textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>₹{fmtIN(v.taxable)}</span>
                  <span style={{ textAlign: 'right', color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>₹{fmtIN(v.cgst)}</span>
                  <span style={{ textAlign: 'right', color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>₹{fmtIN(v.sgst)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ══ SECTION 3: GRAND TOTAL (CENTER HERO) ══ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 20px', position: 'relative' }}>

          {/* Warnings */}
          {hasWarning && (
            <div style={{ display: 'flex', gap: 6, position: 'absolute', top: 6, justifyContent: 'center' }}>

              {warnings.expiring > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#9a3412', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 99, padding: '2px 8px' }}>
                  <Clock size={9}/> {warnings.expiring} Near Expiry
                </div>
              )}
              {warnings.scheduleH && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#991b1b', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 99, padding: '2px 8px' }}>
                  <ShieldAlert size={9}/> Rx Required
                </div>
              )}
            </div>
          )}

          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 2 }}>Net Payable</div>

          {/* Hero Total */}
          <div style={{ display: 'flex', alignItems: 'flex-start', lineHeight: 1 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#10b981', marginTop: 6, marginRight: 2, opacity: 0.85 }}>₹</span>
            <span style={{
              fontSize: 46, fontWeight: 900, letterSpacing: '-2px', fontVariantNumeric: 'tabular-nums',
              background: 'linear-gradient(135deg, #059669 0%, #0d9488 50%, #0284c7 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              {fmtIN(totalAmount)}
            </span>
          </div>

          {/* Item count + profit pill */}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 99, padding: '3px 10px' }}>
              <ShoppingCart size={11} color="#64748b"/>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{itemCount} {itemCount === 1 ? 'Item' : 'Items'}</span>
            </div>
            {itemCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: isProfit ? '#dcfce7' : '#fee2e2', border: `1px solid ${isProfit ? '#86efac' : '#fca5a5'}`, borderRadius: 99, padding: '3px 10px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: isProfit ? '#15803d' : '#dc2626' }}>
                  {isProfit ? '▲' : '▼'} ₹{fmtIN(Math.abs(profit))}
                </span>
              </div>
            )}
          </div>


        </div>

        {/* ══ SECTION 4: PAYMENT MODES ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5, padding: '10px 14px', borderLeft: '1px solid rgba(0,0,0,0.07)', borderRight: '1px solid rgba(0,0,0,0.07)', flexShrink: 0, minWidth: splitMode ? 280 : 216 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 1 }}>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: '#94a3b8', textTransform: 'uppercase' }}>Payment Mode</span>
            <button
              onClick={() => {
                if (!splitMode) {
                  setSplitMode(true);
                  if (payments.length < 2) setPayments([{ method: 'cash', amount: 0 }, { method: 'upi', amount: totalAmount }]);
                } else {
                  setSplitMode(false);
                  setPayments([{ method: payments[0]?.method || 'cash', amount: 0 }]);
                }
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 800, color: splitMode ? '#e11d48' : '#6366f1', background: splitMode ? 'rgba(225,29,72,0.08)' : 'rgba(99,102,241,0.08)', border: `1px solid ${splitMode ? 'rgba(225,29,72,0.2)' : 'rgba(99,102,241,0.2)'}`, borderRadius: 6, padding: '2px 7px', cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase' }}
            >
              <Scissors size={9} />
              {splitMode ? 'Cancel Split' : 'Split'}
            </button>
          </div>

          {!splitMode ? (
            /* Single payment mode */
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, width: 216 }}>
              {PAYMENT_MODES.map((mode) => {
                const active = payments[0]?.method === mode.id;
                const IconComponent = mode.icon;
                return (
                  <button key={mode.id} onClick={() => setPayments([{ method: mode.id, amount: 0 }])}
                    className={`bbsp-pay-btn${active ? ' bbsp-pay-active' : ''}`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '7px 0', borderRadius: 11,
                      border: active ? '1.5px solid transparent' : '1.5px solid var(--border)',
                      background: active ? `linear-gradient(135deg, ${mode.color}ee, ${mode.color})` : 'var(--surface-2)',
                      color: active ? '#fff' : 'var(--text-muted)',
                      fontWeight: 700, fontSize: 12, cursor: 'pointer',
                      boxShadow: active ? `0 4px 14px ${mode.color}55` : 'none',
                    }}
                  >
                    <IconComponent size={14} strokeWidth={active ? 2.5 : 2}/>
                    {mode.label}
                  </button>
                );
              })}
            </div>
          ) : (
            /* Split payment mode */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {payments.map((pay, idx) => {
                const mode = PAYMENT_MODES.find(m => m.id === pay.method) || PAYMENT_MODES[0];
                const ModeIcon = mode.icon;
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 5, background: `${mode.color}0a`, border: `1px solid ${mode.color}30`, borderRadius: 9, padding: '4px 8px' }}>
                    <ModeIcon size={13} style={{ color: mode.color }} />
                    <select
                      value={pay.method}
                      onChange={e => {
                        const next = [...payments];
                        next[idx] = { ...next[idx], method: e.target.value };
                        setPayments(next);
                      }}
                      style={{ border: 'none', background: 'transparent', fontWeight: 700, fontSize: 11, color: mode.color, cursor: 'pointer', outline: 'none', width: 72 }}
                    >
                      {PAYMENT_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                    <span style={{ fontSize: 12, fontWeight: 800, color: mode.color }}>₹</span>
                    <input
                      type="number" min={0} step={1}
                      value={pay.amount || ''}
                      placeholder="0"
                      onChange={e => {
                        const val = parseFloat(e.target.value) || 0;
                        const next = [...payments];
                        next[idx] = { ...next[idx], amount: val };
                        // Auto-fill remaining into the last OTHER method
                        if (next.length > 1) {
                          const otherIdx = idx === next.length - 1 ? next.length - 2 : next.length - 1;
                          const sumOthers = next.reduce((s, p, i) => i === otherIdx ? s : s + (Number(p.amount) || 0), 0);
                          const remainder = Math.max(0, Math.round((totalAmount - sumOthers) * 100) / 100);
                          next[otherIdx] = { ...next[otherIdx], amount: remainder };
                        }
                        setPayments(next);
                      }}
                      style={{ width: 70, border: 'none', background: 'transparent', fontWeight: 800, fontSize: 13, color: 'var(--text)', textAlign: 'right', outline: 'none' }}
                    />
                    {payments.length > 1 && (
                      <button onClick={() => {
                        const remaining = payments.filter((_, i) => i !== idx);
                        // Auto-fill last method with the remaining balance
                        const sumOthers = remaining.slice(0, -1).reduce((s, p) => s + (Number(p.amount) || 0), 0);
                        const lastIdx = remaining.length - 1;
                        remaining[lastIdx] = { ...remaining[lastIdx], amount: Math.max(0, Math.round((totalAmount - sumOthers) * 100) / 100) };
                        setPayments(remaining);
                      }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#94a3b8', display: 'flex' }}>
                        <X size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
              {payments.length < 4 && (
                <button
                  onClick={() => {
                    const used = payments.map(p => p.method);
                    const next = PAYMENT_MODES.find(m => !used.includes(m.id));
                    const currentSum = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
                    const remaining = Math.max(0, Math.round((totalAmount - currentSum) * 100) / 100);
                    if (next) setPayments([...payments, { method: next.id, amount: remaining }]);
                  }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#6366f1', background: 'rgba(99,102,241,0.06)', border: '1px dashed rgba(99,102,241,0.3)', borderRadius: 8, padding: '4px 0', cursor: 'pointer' }}
                >
                  <Plus size={11} /> Add Method
                </button>
              )}
              {/* Balance indicator */}
              {payments.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 800, color: Math.abs(splitRemaining) < 0.5 ? '#16a34a' : '#dc2626', background: Math.abs(splitRemaining) < 0.5 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${Math.abs(splitRemaining) < 0.5 ? '#86efac' : '#fca5a5'}`, borderRadius: 7, padding: '3px 8px' }}>
                  <span>{Math.abs(splitRemaining) < 0.5 ? '✓ Balanced' : 'Remaining'}</span>
                  <span>₹{fmtIN(Math.abs(splitRemaining))}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══ SECTION 5: ACTIONS ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, padding: '10px 14px 10px 12px', flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: '#94a3b8', textTransform: 'uppercase' }}>Checkout</div>



          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => window.print()} title="Print Invoice"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 13, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s' }}
              onMouseOver={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#6366f1'; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#64748b'; }}
            >
              <Printer size={18} strokeWidth={2}/>
            </button>

            {/* Checkout Button */}
            <button onClick={handleCheckout} disabled={isDisabled}
              className={`bbsp-checkout-btn${!isDisabled ? ' glowing' : ''}`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                height: 46, borderRadius: 13, border: 'none',
                background: isDisabled
                  ? 'linear-gradient(135deg, #cbd5e1, #94a3b8)'
                  : 'linear-gradient(135deg, #10b981 0%, #059669 50%, #0d9488 100%)',
                color: '#fff', fontWeight: 900, fontSize: 15,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled ? 0.65 : 1,
                letterSpacing: '0.02em', minWidth: 148, flex: 1,
              }}
            >
              {checkoutLoading
                ? <RefreshCw size={17} style={{ animation: 'bbsp-spin 1s linear infinite' }}/>
                : <Check size={19} strokeWidth={3}/>
              }
              {checkoutLoading ? 'Processing…' : <><span>PAY</span><span style={{ fontSize: 11, opacity: 0.75, fontWeight: 700 }}>(F12)</span></>}
            </button>
          </div>
        </div>
      </div>

    </>
  );
}
