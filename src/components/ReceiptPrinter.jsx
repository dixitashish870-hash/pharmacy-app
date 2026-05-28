import React from 'react';

const fmt = (n) => parseFloat(n || 0).toFixed(2);
const fmtIN = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const now = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * ReceiptPrinter
 * Renders a GST-compliant pharmacy invoice for printing.
 *
 * Props:
 *   sale       — sale object (from handleCheckout's lastSale)
 *   printMode  — 'thermal' (default, 80mm) | 'a5'
 *   storeInfo  — { name, address, gstin, phone, email, dl_no } (from settings)
 */
export default function ReceiptPrinter({ sale, printMode = 'thermal', storeInfo = {} }) {
  if (!sale) return null;

  const store = {
    name:    storeInfo.name    || 'PHARMA AI MEDICAL STORE',
    address: storeInfo.address || '123, Health Street, Medicity',
    gstin:   storeInfo.gstin   || '',
    phone:   storeInfo.phone   || '+91 98765 43210',
    dl_no:   storeInfo.dl_no   || '',
  };

  const isReturn   = sale.is_returned === 1;
  const billNo     = String(sale.id || '').padStart(6, '0');
  const billDate   = sale.date || now();
  const items      = sale.items || [];
  const customer   = sale.customer;
  const gstType    = sale.gstType || 'cgst_sgst';
  const totals     = sale.billTotals || {};

  // Fallback: compute from sale directly if billTotals not present
  const mrpTotal     = totals.grossMrp       ?? parseFloat(sale.subtotal || 0) + parseFloat(sale.gst_total || 0) + parseFloat(sale.discount_total || 0);
  const discountAmt  = totals.totalDiscount  ?? parseFloat(sale.discount_total || 0);
  const taxableAmt   = totals.taxableTotal   ?? parseFloat(sale.subtotal || 0);
  const cgstAmt      = totals.cgstTotal      ?? parseFloat(sale.gst_total || 0) / 2;
  const sgstAmt      = totals.sgstTotal      ?? parseFloat(sale.gst_total || 0) / 2;
  const igstAmt      = parseFloat(sale.gst_total || 0);
  const roundOff     = totals.roundOff       ?? 0;
  const netPayable   = totals.netPayable     ?? parseFloat(sale.total_amount || 0);
  const gstSlabs     = totals.gstSlabs       || {};
  const slabEntries  = Object.entries(gstSlabs).filter(([, v]) => v.taxable > 0).sort(([a], [b]) => Number(a) - Number(b));
  const paymentMode  = sale.payment_status === 'credit' ? 'Credit / Udhaar' : (sale.payment_status || 'Cash');

  /* ─────────────────────────────────────────────
   *  THERMAL RECEIPT (80mm width)
   * ───────────────────────────────────────────── */
  if (printMode === 'thermal') {
    return (
      <div className="print-only" style={{
        display: 'none', padding: '14px 12px', color: '#000', background: '#fff',
        width: '100%', maxWidth: 302, margin: '0 auto', fontFamily: "'Courier New', monospace",
        fontSize: 12,
      }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          {isReturn && (
            <div style={{ border: '2px dashed #000', padding: '3px 0', fontWeight: 'bold', fontSize: 14, marginBottom: 6 }}>
              *** CREDIT NOTE / RETURN ***
            </div>
          )}
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 1 }}>{store.name}</div>
          <div style={{ fontSize: 11, marginTop: 2 }}>{store.address}</div>
          {store.phone && <div style={{ fontSize: 11 }}>Ph: {store.phone}</div>}
          {store.gstin && <div style={{ fontSize: 11, fontWeight: 700 }}>GSTIN: {store.gstin}</div>}
          {store.dl_no && <div style={{ fontSize: 10 }}>D.L.No: {store.dl_no}</div>}
          <div style={{ borderTop: '1px dashed #000', marginTop: 6, paddingTop: 6, fontWeight: 700, fontSize: 13 }}>
            TAX INVOICE
          </div>
        </div>

        {/* Bill info */}
        <div style={{ fontSize: 11, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span><b>Invoice #:</b> {billNo}</span>
            <span>{billDate}</span>
          </div>
          {customer && (
            <div style={{ marginTop: 3 }}>
              <b>Patient:</b> {customer.name} {customer.phone ? `(${customer.phone})` : ''}
            </div>
          )}
          {sale.prescriber_name && <div><b>Dr:</b> {sale.prescriber_name}</div>}
          <div><b>Payment:</b> {paymentMode}</div>
        </div>

        <div style={{ borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: '4px 0', marginBottom: 6 }}>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 28px 56px 56px 60px', gap: 0, fontWeight: 700, fontSize: 10, borderBottom: '1px dashed #000', paddingBottom: 3, marginBottom: 3 }}>
            <span>Item</span>
            <span style={{ textAlign: 'center' }}>Qty</span>
            <span style={{ textAlign: 'right' }}>MRP</span>
            <span style={{ textAlign: 'right' }}>Disc</span>
            <span style={{ textAlign: 'right' }}>Amount</span>
          </div>

          {items.map((item, idx) => {
            const mrp    = item.mrp_per_unit || item.mrp || 0;
            const qty    = item.quantity || 0;
            const disc   = item.discount_pct || 0;
            const amount = item.finalAmt ?? (mrp * qty * (1 - disc / 100));
            return (
              <div key={idx} style={{ marginBottom: 4 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 28px 56px 56px 60px', gap: 0, fontSize: 11 }}>
                  <span style={{ fontWeight: 600 }}>{item.name}</span>
                  <span style={{ textAlign: 'center' }}>{qty}</span>
                  <span style={{ textAlign: 'right' }}>{fmt(mrp)}</span>
                  <span style={{ textAlign: 'right' }}>{disc > 0 ? `${disc}%` : '—'}</span>
                  <span style={{ textAlign: 'right', fontWeight: 700 }}>₹{fmt(amount)}</span>
                </div>
                {item.batch && <div style={{ fontSize: 9, color: '#555', paddingLeft: 2 }}>Batch: {item.batch} {item.expiry ? `| Exp: ${item.expiry}` : ''}</div>}
                {item.gst > 0 && (
                  <div style={{ fontSize: 9, color: '#555', paddingLeft: 2 }}>
                    Tax: {item.gst}% | Taxable: ₹{fmt(item.taxableAmt)} | CGST: ₹{fmt(item.cgst)} | SGST: ₹{fmt(item.sgst)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Totals */}
        <div style={{ fontSize: 11 }}>
          <Row label="Gross MRP"     value={`₹${fmtIN(mrpTotal)}`}/>
          {discountAmt > 0 && <Row label="Discount"    value={`-₹${fmtIN(discountAmt)}`}/>}
          <Row label="Taxable Amt"   value={`₹${fmtIN(taxableAmt)}`}/>
          {gstType === 'igst'
            ? <Row label="IGST"     value={`₹${fmtIN(igstAmt)}`}/>
            : <>
                <Row label="CGST"    value={`₹${fmtIN(cgstAmt)}`}/>
                <Row label="SGST"    value={`₹${fmtIN(sgstAmt)}`}/>
              </>
          }
          {roundOff !== 0 && <Row label="Round Off"   value={`${roundOff > 0 ? '+' : ''}₹${fmtIN(Math.abs(roundOff))}`}/>}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: 15, borderTop: '1px solid #000', marginTop: 4, paddingTop: 4 }}>
            <span>TOTAL</span>
            <span>₹{fmtIN(netPayable)}</span>
          </div>
        </div>

        {/* GST Slab Summary */}
        {slabEntries.length > 0 && (
          <div style={{ marginTop: 8, borderTop: '1px dashed #000', paddingTop: 6 }}>
            <div style={{ fontWeight: 700, fontSize: 10, marginBottom: 3 }}>GST SUMMARY</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', fontSize: 10, fontWeight: 700, borderBottom: '1px dashed #555', paddingBottom: 2, marginBottom: 2 }}>
              <span>Rate</span><span style={{ textAlign: 'right' }}>Taxable</span><span style={{ textAlign: 'right' }}>CGST</span><span style={{ textAlign: 'right' }}>SGST</span>
            </div>
            {slabEntries.map(([slab, v]) => (
              <div key={slab} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', fontSize: 10 }}>
                <span>{slab}%</span>
                <span style={{ textAlign: 'right' }}>₹{fmtIN(v.taxable)}</span>
                <span style={{ textAlign: 'right' }}>₹{fmtIN(v.cgst)}</span>
                <span style={{ textAlign: 'right' }}>₹{fmtIN(v.sgst)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 10, borderTop: '1px dashed #000', paddingTop: 8 }}>
          <div>Thank you for visiting!</div>
          <div style={{ marginTop: 2, fontStyle: 'italic' }}>Goods once sold will not be taken back.</div>
          <div style={{ marginTop: 4, fontWeight: 700 }}>Get well soon!</div>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────
   *  A5 INVOICE
   * ───────────────────────────────────────────── */
  return (
    <div className="print-only" style={{
      display: 'none', padding: '20px 24px', color: '#000', background: '#fff',
      width: '148mm', maxWidth: '100%', margin: '0 auto', fontFamily: 'Arial, sans-serif',
      fontSize: 12,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, borderBottom: '2px solid #000', paddingBottom: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.5 }}>{store.name}</div>
          <div style={{ fontSize: 11, marginTop: 2, color: '#333' }}>{store.address}</div>
          {store.phone && <div style={{ fontSize: 11 }}>Ph: {store.phone}</div>}
          {store.dl_no && <div style={{ fontSize: 10 }}>D.L.No: {store.dl_no}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#1a1a1a' }}>{isReturn ? 'CREDIT NOTE' : 'TAX INVOICE'}</div>
          {store.gstin && <div style={{ fontSize: 11, marginTop: 4 }}><b>GSTIN:</b> {store.gstin}</div>}
          <div style={{ fontSize: 12, marginTop: 3 }}><b>Invoice #:</b> {billNo}</div>
          <div style={{ fontSize: 11 }}><b>Date:</b> {billDate}</div>
        </div>
      </div>

      {/* Bill-to */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 11 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>Bill To</div>
          {customer
            ? <><div>{customer.name}</div><div>Ph: {customer.phone}</div></>
            : <div>Walk-in Patient</div>
          }
          {sale.prescriber_name && <div style={{ marginTop: 2 }}>Dr: {sale.prescriber_name}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>Payment</div>
          <div>{paymentMode}</div>
        </div>
      </div>

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10, fontSize: 11 }}>
        <thead>
          <tr style={{ background: '#f0f0f0', borderBottom: '1.5px solid #000' }}>
            <th style={th()}>#</th>
            <th style={{ ...th(), textAlign: 'left' }}>Product</th>
            <th style={th()}>Batch</th>
            <th style={th()}>Exp</th>
            <th style={th()}>Qty</th>
            <th style={th()}>MRP</th>
            <th style={th()}>GST%</th>
            <th style={th()}>Disc%</th>
            <th style={th()}>Taxable</th>
            <th style={th()}>CGST</th>
            <th style={th()}>SGST</th>
            <th style={{ ...th(), textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const mrp    = item.mrp_per_unit || item.mrp || 0;
            const qty    = item.quantity || 0;
            const disc   = item.discount_pct || 0;
            const amount = item.finalAmt    ?? (mrp * qty * (1 - disc / 100));
            const taxable = item.taxableAmt ?? (amount / (1 + (item.gst || 0) / 100));
            const cgst   = item.cgst        ?? ((amount - taxable) / 2);
            const sgst   = item.sgst        ?? cgst;
            return (
              <tr key={idx} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={td()}>{idx + 1}</td>
                <td style={{ ...td(), textAlign: 'left' }}>
                  <div style={{ fontWeight: 600 }}>{item.name}</div>
                  {item.salt_composition && <div style={{ fontSize: 9, color: '#555' }}>{item.salt_composition}</div>}
                </td>
                <td style={td()}>{item.batch || '—'}</td>
                <td style={td()}>{item.expiry || '—'}</td>
                <td style={td()}>{qty}</td>
                <td style={td()}>₹{fmt(mrp)}</td>
                <td style={td()}>{item.gst > 0 ? `${item.gst}%` : 'Nil'}</td>
                <td style={td()}>{disc > 0 ? `${disc}%` : '—'}</td>
                <td style={td()}>₹{fmt(taxable)}</td>
                <td style={td()}>₹{fmt(cgst)}</td>
                <td style={td()}>₹{fmt(sgst)}</td>
                <td style={{ ...td(), textAlign: 'right', fontWeight: 700 }}>₹{fmt(amount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals + GST slab side-by-side */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 6 }}>

        {/* GST slab table */}
        {slabEntries.length > 0 && (
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4, borderBottom: '1px solid #ccc', paddingBottom: 2 }}>GST Summary</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ background: '#f5f5f5' }}>
                  <th style={th()}>Rate</th>
                  <th style={th()}>Taxable</th>
                  <th style={th()}>CGST</th>
                  <th style={th()}>SGST</th>
                  <th style={th()}>Total Tax</th>
                </tr>
              </thead>
              <tbody>
                {slabEntries.map(([slab, v]) => (
                  <tr key={slab} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={td()}>{slab}%</td>
                    <td style={td()}>₹{fmtIN(v.taxable)}</td>
                    <td style={td()}>₹{fmtIN(v.cgst)}</td>
                    <td style={td()}>₹{fmtIN(v.sgst)}</td>
                    <td style={td()}>₹{fmtIN(v.cgst + v.sgst)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Bill totals */}
        <div style={{ minWidth: 200 }}>
          <TotRow label="Gross MRP"   value={`₹${fmtIN(mrpTotal)}`}/>
          {discountAmt > 0 && <TotRow label="(-) Discount" value={`₹${fmtIN(discountAmt)}`} color="#dc2626"/>}
          <TotRow label="Taxable Amt" value={`₹${fmtIN(taxableAmt)}`}/>
          {gstType === 'igst'
            ? <TotRow label="IGST"    value={`₹${fmtIN(igstAmt)}`}   color="#d97706"/>
            : <>
                <TotRow label="CGST"  value={`₹${fmtIN(cgstAmt)}`}   color="#d97706"/>
                <TotRow label="SGST"  value={`₹${fmtIN(sgstAmt)}`}   color="#d97706"/>
              </>
          }
          {roundOff !== 0 && <TotRow label="Round Off" value={`${roundOff > 0 ? '+' : ''}₹${fmtIN(Math.abs(roundOff))}`}/>}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: 14, borderTop: '2px solid #000', marginTop: 4, paddingTop: 4 }}>
            <span>NET PAYABLE</span>
            <span>₹{fmtIN(netPayable)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', fontSize: 10, borderTop: '1px dashed #999', paddingTop: 10 }}>
        <div>
          <div style={{ fontWeight: 700 }}>Terms & Conditions</div>
          <div>1. Goods once sold will not be taken back.</div>
          <div>2. Subject to local jurisdiction.</div>
          <div style={{ marginTop: 4 }}>This is a computer generated invoice.</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ marginBottom: 24 }}>Authorised Signatory</div>
          <div style={{ borderTop: '1px solid #000', paddingTop: 4, width: 120, textAlign: 'center' }}>Signature</div>
        </div>
      </div>
    </div>
  );
}

/* ── Small helpers ── */
const th = () => ({ padding: '4px 6px', fontWeight: 700, textAlign: 'center', fontSize: 10, whiteSpace: 'nowrap' });
const td = () => ({ padding: '4px 6px', textAlign: 'center', verticalAlign: 'top' });

const Row = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
    <span>{label}</span><span>{value}</span>
  </div>
);

const TotRow = ({ label, value, color = '#1a1a1a' }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0', borderBottom: '1px solid #eee' }}>
    <span style={{ color: '#555' }}>{label}</span>
    <span style={{ fontWeight: 700, color }}>{value}</span>
  </div>
);
