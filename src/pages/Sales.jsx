import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';
import { useNavigate } from 'react-router-dom';
import { 
  Receipt, Search, ChevronDown, ChevronRight, Printer, 
  RotateCcw, Calendar, CreditCard, Banknote, History,
  Filter, Wallet, ArrowUpRight, CheckCircle2, User, Phone, Zap, RefreshCw,
  X, PackageCheck, AlertTriangle, IndianRupee
} from 'lucide-react';
import ReceiptPrinter from '../components/ReceiptPrinter';

const fmt = (n) => parseFloat(n || 0).toFixed(2);

/* ── Granular Return Modal ── */
function ReturnModal({ sale, onClose, onDone }) {
  // Parse and sanitise items — filter out null entries from LEFT JOIN artifacts
  const items = React.useMemo(() => {
    try {
      const parsed = JSON.parse(sale.items_json || '[]');
      return parsed.filter(it => it !== null && it.id !== null && it.id !== undefined);
    } catch { return []; }
  }, [sale]);

  // Key by index (not product id) so duplicate products each get their own counter
  const [returnQtys, setReturnQtys] = useState(() =>
    Object.fromEntries(items.map((_, idx) => [idx, 0]))
  );
  const [loading, setLoading] = useState(false);

  // remainingQty = sold qty minus already-returned qty
  const remaining = (it) => it.quantity - (it.returned_quantity || 0);

  const refundTotal = items.reduce((sum, it, idx) => {
    const qty = returnQtys[idx] || 0;
    if (qty <= 0) return sum;
    const line = it.price * qty * (1 - (it.discount || 0) / 100);
    const gst  = line * ((it.gst || 0) / 100);
    return sum + line + gst;
  }, 0);

  const hasAnyQty = items.some((_, idx) => (returnQtys[idx] || 0) > 0);

  const handlePartialReturn = async () => {
    if (!hasAnyQty) return;
    if (!window.confirm(`Process refund of ₹${fmt(refundTotal)} for selected items?`)) return;
    setLoading(true);
    try {
      const payload = items
        .map((it, idx) => ({ ...it, returnQty: returnQtys[idx] || 0 }))
        .filter(it => it.returnQty > 0)
        .map(it => ({
          sale_item_id: it.sale_item_id,   // ← precise row key
          product_id: it.id,               // ← for restocking
          quantity: it.returnQty,
          price: it.price,
          gst: it.gst || 0,
          discount: it.discount || 0,
        }));
      await axios.post(`${API_BASE}/api/sales/${sale.id}/partial-return`, { items: payload });
      alert(`✅ Return processed! Refund: ₹${fmt(refundTotal)}`);
      onDone();
      onClose();
    } catch (err) {
      alert(err.response?.data?.error || 'Return failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFullReturn = async () => {
    if (!window.confirm('Return the ENTIRE bill? All remaining items will be restocked.')) return;
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/api/sales/${sale.id}/return`);
      alert('✅ Full bill returned!');
      onDone();
      onClose();
    } catch (err) {
      alert(err.response?.data?.error || 'Return failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)', borderRadius: 16, width: '96%', maxWidth: 640,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0,0,0,0.35)', border: '1px solid var(--border)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#EF4444,#DC2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <RotateCcw size={16} color="white" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>
              Return Items — Bill #{sale.id.toString().padStart(5, '0')}
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              Set return quantity per item. Greyed items are fully returned.
            </p>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
              <AlertTriangle size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
              <p style={{ fontWeight: 600 }}>No item data found for this bill.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', borderRadius: '6px 0 0 6px' }}>Medicine</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sold</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ret'd</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Return Qty</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', borderRadius: '0 6px 6px 0' }}>Refund</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const retQty = returnQtys[idx] || 0;
                  const maxQty = remaining(it);
                  const fullyReturned = maxQty <= 0;
                  const line = it.price * retQty * (1 - (it.discount || 0) / 100);
                  const gst  = line * ((it.gst || 0) / 100);
                  const lineRefund = line + gst;
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)', opacity: fullyReturned ? 0.45 : 1 }}>
                      <td style={{ padding: '10px 10px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{it.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>₹{fmt(it.price)} × {it.quantity}{it.discount > 0 ? ` (${it.discount}% off)` : ''}</div>
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 700, color: 'var(--text)' }}>{it.quantity}</td>
                      <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 700, color: (it.returned_quantity || 0) > 0 ? '#F59E0B' : 'var(--text-muted)' }}>
                        {it.returned_quantity || 0}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                        {fullyReturned ? (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#16A34A', background: 'rgba(22,163,74,0.1)', padding: '2px 8px', borderRadius: 6 }}>Done</span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <button
                              onClick={() => setReturnQtys(p => ({ ...p, [idx]: Math.max(0, (p[idx] || 0) - 1) }))}
                              style={{ width: 26, height: 26, borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontWeight: 700, fontSize: 15, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >−</button>
                            <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 700, fontSize: 15, color: retQty > 0 ? '#EF4444' : 'var(--text-muted)' }}>{retQty}</span>
                            <button
                              onClick={() => setReturnQtys(p => ({ ...p, [idx]: Math.min(maxQty, (p[idx] || 0) + 1) }))}
                              style={{ width: 26, height: 26, borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontWeight: 700, fontSize: 15, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >+</button>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, color: lineRefund > 0 ? '#EF4444' : 'var(--text-muted)' }}>
                        {lineRefund > 0 ? `₹${fmt(lineRefund)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Refund Preview */}
          <div style={{ flex: 1, background: hasAnyQty ? 'rgba(239,68,68,0.07)' : 'var(--surface-2)', borderRadius: 10, padding: '8px 14px', border: `1px solid ${hasAnyQty ? 'rgba(239,68,68,0.25)' : 'var(--border)'}`, transition: 'all 200ms' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Refund Total</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: hasAnyQty ? '#EF4444' : 'var(--text-muted)' }}>
              ₹{fmt(refundTotal)}
            </div>
          </div>

          {/* Full return fallback */}
          <button
            onClick={handleFullReturn}
            disabled={loading || sale.is_returned}
            style={{
              padding: '9px 14px', borderRadius: 9, border: '1.5px solid #FCA5A5',
              background: '#FEF2F2', color: '#DC2626', fontWeight: 700, fontSize: 12,
              cursor: 'pointer', whiteSpace: 'nowrap', opacity: sale.is_returned ? 0.4 : 1,
            }}
          >
            Return Full Bill
          </button>

          <button
            onClick={handlePartialReturn}
            disabled={!hasAnyQty || loading}
            style={{
              padding: '9px 20px', borderRadius: 9, border: 'none',
              background: hasAnyQty ? 'linear-gradient(135deg,#EF4444,#DC2626)' : 'var(--border)',
              color: hasAnyQty ? 'white' : 'var(--text-muted)', fontWeight: 800, fontSize: 13,
              cursor: hasAnyQty ? 'pointer' : 'not-allowed',
              boxShadow: hasAnyQty ? '0 4px 12px rgba(239,68,68,0.35)' : 'none',
              transition: 'all 200ms', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <PackageCheck size={15} />
            {loading ? 'Processing…' : 'Confirm Return'}
          </button>
        </div>
      </div>
    </div>
  );
}


// Date Helpers
const getTodayStr = () => new Date().toISOString().split('T')[0];
const getYesterdayStr = () => {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};
const getLast7DaysStr = () => {
  const d = new Date(); d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
};

export default function SalesHistory() {
  const navigate = useNavigate();

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateRange, setDateRange] = useState('today'); // today, yesterday, last7, all, custom
  const [customDates, setCustomDates] = useState({ from: getTodayStr(), to: getTodayStr() });
  const [quickFilter, setQuickFilter] = useState('all'); // all, cash, upi, credit, returns, high_value

  // Data State
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState({ total_sales: 0, total_bills: 0, payment_split: { cash: 0, upi: 0, credit: 0 }, returns: { count: 0, amount: 0 } });
  const [loading, setLoading] = useState(true);

  // Interaction State
  const [expandedSale, setExpandedSale] = useState(null);
  const [selectedBill, setSelectedBill] = useState(null); // Triggers Right Panel
  const [activePrintSale, setActivePrintSale] = useState(null);
  const [returnModalSale, setReturnModalSale] = useState(null); // Triggers Return Modal
  
  // Right Panel State (Customer context)
  const [customerHistory, setCustomerHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Debounce search term
  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedSearch(searchTerm); }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Fetch data when filters change
  useEffect(() => {
    fetchData();
    // Reset selected bill and expansion when filters change heavily
    setSelectedBill(null);
    setExpandedSale(null);
  }, [debouncedSearch, dateRange, quickFilter, customDates.from, customDates.to]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      
      if (debouncedSearch) params.append('search', debouncedSearch);

      // Date Range Logic
      if (dateRange === 'today') {
        params.append('date_from', getTodayStr());
        params.append('date_to', getTodayStr());
      } else if (dateRange === 'yesterday') {
        params.append('date_from', getYesterdayStr());
        params.append('date_to', getYesterdayStr());
      } else if (dateRange === 'last7') {
        params.append('date_from', getLast7DaysStr());
        params.append('date_to', getTodayStr());
      } else if (dateRange === 'custom') {
        if (customDates.from) params.append('date_from', customDates.from);
        if (customDates.to) params.append('date_to', customDates.to);
      }

      // Quick Filters Logic
      if (['cash', 'upi', 'credit'].includes(quickFilter)) {
        params.append('payment_mode', quickFilter);
      } else if (quickFilter === 'returns') {
        params.append('is_returned', '1');
      } else if (quickFilter === 'high_value') {
         params.append('high_value', '1');
      }

      const [salesRes, summaryRes] = await Promise.all([
        axios.get(`${API_BASE}/api/sales?${params.toString()}`),
        axios.get(`${API_BASE}/api/sales/summary?${params.toString()}`)
      ]);

      setSales(salesRes.data || []);
      setSummary(summaryRes.data || { total_sales: 0, total_bills: 0, payment_split: {}, returns: {} });

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openReturnModal = (sale, e) => {
    e.stopPropagation();
    setReturnModalSale(sale);
  };

  const parseItems = (itemsJsonStr) => {
    try { return JSON.parse(itemsJsonStr || '[]'); } catch { return []; }
  };

  const handlePrint = (sale, e) => {
    e.stopPropagation();
    const items = parseItems(sale.items_json);
    setActivePrintSale({ ...sale, items });
    setTimeout(() => window.print(), 100);
  };

  const handleRepeatSale = (sale, e) => {
    e.stopPropagation();
    // Hydrate cart to billing
    const items = parseItems(sale.items_json).map(i => ({
      product_id: i.id || 0,
      name: i.name,
      quantity: i.quantity,
      price: i.price,
      discount_pct: i.discount || 0,
      mrp: i.mrp || i.price,
      gst: i.gst || 0,
      stock: 999 // fallback
    }));
    navigate('/billing', { state: { loadBillItems: items, customer_id: sale.customer_id } });
  };

  const selectBill = async (sale) => {
    if (selectedBill?.id === sale.id) {
      // Toggle off
      setSelectedBill(null);
      setExpandedSale(null);
      return;
    }
    setSelectedBill(sale);
    setExpandedSale(sale.id); // Also expand inline

    // Fetch customer history if it has a customer
    if (sale.customer_id) {
      setHistoryLoading(true);
      try {
        const res = await axios.get(`${API_BASE}/api/customers/${sale.customer_id}/sales`);
        setCustomerHistory(res.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setHistoryLoading(false);
      }
    } else {
      setCustomerHistory([]); // Walk-in customer
    }
  };

  // Rendering Helpers
  const renderPaymentBadge = (mode) => {
    const m = mode?.toLowerCase();
    if (m === 'cash') return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700 uppercase">Cash</span>;
    if (m === 'upi') return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 uppercase">UPI</span>;
    if (m === 'credit') return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-yellow-100 text-yellow-700 uppercase">Credit</span>;
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-700 uppercase">{mode}</span>;
  };

  // Summary logic
  const totSales = summary?.total_sales || 0;
  const cshAmt = summary?.payment_split?.cash || 0;
  const upiAmt = summary?.payment_split?.upi || 0;
  const crdAmt = summary?.payment_split?.credit || 0;

  return (
    <>
      <div className="space-y-4 no-print h-full flex flex-col min-h-0">
        
        {/* ── 1. Top Control Bar ── */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between" style={{ background: 'var(--surface)', padding: '16px 20px', borderRadius: 16, border: '1px solid var(--border)' }}>
          
          {/* Left: Search + Date Picker (inline) */}
          <div className="flex items-center gap-2 flex-1">
            {/* Global Search */}
            <div className="relative" style={{ minWidth: 260 }}>
               <Search className="absolute left-3 top-2.5 h-4 w-4" style={{ color: 'var(--text-light)' }} />
               <input type="text" placeholder="Search bill / patient / mobile / medicine"
                  style={{
                    width: '100%', paddingLeft: 36, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
                    background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10,
                    fontSize: 13, outline: 'none', color: 'var(--text)'
                  }}
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>

            {/* Date Range Selector — inline next to search */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
               <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
               <select
                 value={dateRange} onChange={e => setDateRange(e.target.value)}
                 className="text-sm font-semibold bg-transparent outline-none cursor-pointer"
                 style={{ color: 'var(--text)', border: 'none' }}>
                 <option value="today">Today</option>
                 <option value="yesterday">Yesterday</option>
                 <option value="last7">Last 7 Days</option>
                 <option value="all">All Time</option>
                 <option value="custom">Custom Range</option>
               </select>
            </div>

            {/* Custom From / To inputs — shown only when custom is selected */}
            {dateRange === 'custom' && (
               <div className="flex items-center gap-2 text-sm">
                  <input type="date" value={customDates.from}
                    onChange={e => setCustomDates(p => ({...p, from: e.target.value}))}
                    className="px-2 py-1.5 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  <span className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>→</span>
                  <input type="date" value={customDates.to}
                    onChange={e => setCustomDates(p => ({...p, to: e.target.value}))}
                    className="px-2 py-1.5 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
               </div>
            )}
          </div>

          {/* Right: Quick Filters */}
          <div className="flex gap-4 items-center flex-shrink-0">
             <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                {['all', 'cash', 'upi', 'credit', 'returns', 'high_value'].map(f => (
                  <button key={f}
                    onClick={() => setQuickFilter(f)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors capitalize ${quickFilter === f ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                    style={quickFilter === f ? { color: 'var(--primary)', border: '1px solid var(--border)' } : { color: 'var(--text-muted)' }}>
                    {f.replace('_', ' ')}
                  </button>
                ))}
             </div>
          </div>
        </div>

        {/* ── 2. Sales Summary Cards ── */}
        <div className="grid grid-cols-4 gap-4 flex-shrink-0">
           {/* Total Sales */}
           <div className="p-4 rounded-2xl flex flex-col justify-between" style={{ background: 'linear-gradient(135deg, #4F46E5, #3730A3)', color: '#fff', boxShadow: '0 4px 14px rgba(79,70,229,0.3)' }}>
              <div className="flex justify-between items-start opacity-80">
                 <span className="text-xs font-bold uppercase tracking-wider">Total Sales</span>
                 <Wallet className="w-4 h-4" />
              </div>
              <div className="mt-3">
                 <h2 className="text-2xl font-black">₹{fmt(totSales)}</h2>
                 <p className="text-xs mt-1 opacity-80">{summary?.total_bills || 0} Bills Generated</p>
              </div>
           </div>

           {/* Cash Split */}
           <div className="p-4 rounded-xl flex items-center gap-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-green-100 text-green-600 shrink-0">
                 <Banknote className="w-5 h-5" />
              </div>
              <div>
                 <p className="text-xs font-bold text-gray-500 uppercase">Cash Revenue</p>
                 <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>₹{fmt(cshAmt)}</p>
              </div>
           </div>

           {/* Digital Split (UPI/Credit handled differently but keeping UI simple) */}
           <div className="p-4 rounded-xl flex items-center gap-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex flex-col gap-2 w-full">
                <div className="flex justify-between items-center w-full">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-blue-500" />
                    <span className="text-xs font-bold text-gray-500 uppercase">UPI / Online</span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>₹{fmt(upiAmt)}</span>
                </div>
                <div className="flex justify-between items-center w-full">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-yellow-500" />
                    <span className="text-xs font-bold text-gray-500 uppercase">Credit (Udhaar)</span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>₹{fmt(crdAmt)}</span>
                </div>
              </div>
           </div>

           {/* Returns */}
           <div className="p-4 rounded-xl flex items-center gap-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-red-100 text-red-600 shrink-0">
                 <RotateCcw className="w-5 h-5" />
              </div>
              <div className="w-full relative">
                 <p className="text-xs font-bold text-gray-500 uppercase">Returns</p>
                 <p className="text-lg font-bold text-red-500">₹{fmt(summary?.returns?.amount || 0)}</p>
                 <span className="absolute right-0 top-0 text-xs font-semibold bg-red-50 text-red-500 px-2 py-0.5 rounded-md">
                    {summary?.returns?.count || 0} bills
                 </span>
              </div>
           </div>
        </div>

        {/* ── 3. Split Layout (Table + Right Panel) ── */}
        <div className="flex flex-1 gap-4 min-h-0">
          
          {/* Main Table Area */}
          <div className="flex-1 rounded-xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
             {loading ? (
                <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
                  <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading Bills...
                </div>
             ) : (
                <div className="flex-1 overflow-auto">
                   <table className="w-full text-left border-collapse" style={{ fontSize: 13 }}>
                      <thead className="sticky top-0 z-10" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                         <tr>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Bill No</th>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Date & Time</th>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Patient Name</th>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-right" style={{ color: 'var(--text-muted)' }}>Amount</th>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-center" style={{ color: 'var(--text-muted)' }}>Payment</th>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-right" style={{ color: 'var(--text-muted)' }}>Actions</th>
                         </tr>
                      </thead>
                      <tbody>
                         {sales.map(sale => {
                            const isSelected = selectedBill?.id === sale.id;
                            const isReturned = sale.is_returned === 1;
                            const isPartiallyReturned = (sale.refunded_amount || 0) > 0 && !isReturned;
                            
                            return (
                               <React.Fragment key={sale.id}>
                                  <tr 
                                    onClick={() => selectBill(sale)}
                                    className="transition-colors border-b last:border-b-0 cursor-pointer"
                                    style={{ 
                                      background: isSelected ? 'var(--surface-2)' : 'transparent',
                                      borderColor: 'var(--border)',
                                      opacity: isReturned ? 0.7 : 1
                                    }}
                                  >
                                     <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                           {expandedSale === sale.id ? <ChevronDown className="w-4 h-4 text-indigo-500" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                                           <span className="font-bold" style={{ color: isSelected ? 'var(--primary)' : 'var(--text)' }}>
                                             #{sale.id.toString().padStart(5, '0')}
                                           </span>
                                           {isReturned && <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-bold ml-1">Returned</span>}
                                           {isPartiallyReturned && <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 font-bold ml-1">Partially Returned</span>}
                                        </div>
                                     </td>
                                     <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                                        {new Date(sale.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'})}
                                     </td>
                                     <td className="px-4 py-3 font-medium truncate max-w-[150px]" style={{ color: 'var(--text)' }}>
                                        {sale.customer_name || 'Walk-in Customer'}
                                        {sale.customer_phone && <span className="block text-[11px] font-normal" style={{ color: 'var(--text-light)' }}>{sale.customer_phone}</span>}
                                     </td>
                                     <td className="px-4 py-3 text-right font-black" style={{ color: 'var(--text)' }}>
                                        ₹{fmt(sale.total_amount)}
                                     </td>
                                     <td className="px-4 py-3 text-center">
                                        {renderPaymentBadge(sale.payment_status)}
                                     </td>
                                     <td className="px-4 py-3 text-right">
                                        {/* Hover Actions */}
                                        <div className="flex items-center justify-end gap-2 opacity-100 group-hover:opacity-100 transition-opacity">
                                           {!isReturned && (
                                              <button onClick={(e) => openReturnModal(sale, e)} className="p-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100" title="Return Bill / Items">
                                                 <RotateCcw className="w-4 h-4" />
                                              </button>
                                           )}
                                           <button onClick={(e) => handleRepeatSale(sale, e)} className="p-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100" title="Repeat Sale (Load to Cart)">
                                              <History className="w-4 h-4" />
                                           </button>
                                           <button onClick={(e) => handlePrint(sale, e)} className="p-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300" title="Reprint Receipt">
                                              <Printer className="w-4 h-4" />
                                           </button>
                                        </div>
                                     </td>
                                  </tr>

                                  {/* Accordion Expansion */}
                                  {expandedSale === sale.id && (
                                     <tr style={{ background: 'var(--surface-2)', borderBottom: '2px solid var(--border)' }}>
                                        <td colSpan={6} className="p-0">
                                           <div className="p-4 pl-12 animate-in slide-in-from-top-2 duration-200">
                                              <div className="rounded-xl overflow-hidden shadow-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                                                 <table className="w-full text-sm">
                                                    <thead style={{ background: 'rgba(0,0,0,0.02)' }}>
                                                       <tr>
                                                          <th className="px-4 py-2 text-left font-medium" style={{ color: 'var(--text-muted)' }}>Medicine</th>
                                                          <th className="px-4 py-2 text-right font-medium" style={{ color: 'var(--text-muted)' }}>Price</th>
                                                          <th className="px-4 py-2 text-center font-medium" style={{ color: 'var(--text-muted)' }}>Qty</th>
                                                          <th className="px-4 py-2 text-right font-medium" style={{ color: 'var(--text-muted)' }}>Total</th>
                                                       </tr>
                                                    </thead>
                                                    <tbody>
                                                       {parseItems(sale.items_json).map((item, idx) => (
                                                          <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                                                             <td className="px-4 py-2" style={{ color: 'var(--text)' }}>
                                                                {item.name}
                                                                {item.discount > 0 && <span className="ml-2 text-[10px] bg-red-100 text-red-600 px-1 rounded">-{item.discount}%</span>}
                                                             </td>
                                                             <td className="px-4 py-2 text-right" style={{ color: 'var(--text-muted)' }}>₹{fmt(item.price)}</td>
                                                             <td className="px-4 py-2 text-center" style={{ color: 'var(--text-muted)' }}>{item.quantity}</td>
                                                             <td className="px-4 py-2 text-right font-medium" style={{ color: 'var(--text)' }}>₹{fmt((item.price * item.quantity)*(1-item.discount/100))}</td>
                                                          </tr>
                                                       ))}
                                                       <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
                                                          <td colSpan={3} className="px-4 py-3 text-right text-xs uppercase font-bold" style={{ color: 'var(--text-muted)' }}>Bill Total (Inc. GST)</td>
                                                          <td className="px-4 py-3 text-right text-lg font-black text-indigo-600">₹{fmt(sale.total_amount)}</td>
                                                       </tr>
                                                        {(sale.refunded_amount || 0) > 0 && (
                                                           <tr style={{ borderTop: "1px solid var(--border)", background: "rgba(245,158,11,0.05)" }}>
                                                              <td colSpan={3} className="px-4 py-2 text-right text-[10px] font-black uppercase tracking-widest text-amber-600">Amount Refunded</td>
                                                              <td className="px-4 py-2 text-right text-sm font-black text-amber-500">- ₹{(sale.refunded_amount || 0).toFixed(2)}</td>
                                                           </tr>
                                                        )}
                                                        {(sale.refunded_amount || 0) > 0 && (
                                                           <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface-2)" }}>
                                                              <td colSpan={3} className="px-4 py-3 text-right text-xs uppercase font-bold" style={{ color: "var(--text-muted)" }}>Net Effective Total</td>
                                                              <td className="px-4 py-3 text-right text-lg font-black text-emerald-600">₹{((sale.total_amount || 0) - (sale.refunded_amount || 0)).toFixed(2)}</td>
                                                           </tr>
                                                        )}
                                                    </tbody>
                                                 </table>
                                                 {sale.prescriber_name && (
                                                    <div className="px-4 py-2 text-xs flex justify-end gap-2" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
                                                       <span style={{ color: 'var(--text-muted)' }}>Doctor:</span>
                                                       <span className="font-semibold text-green-600">{sale.prescriber_name}</span>
                                                    </div>
                                                 )}
                                              </div>
                                           </div>
                                        </td>
                                     </tr>
                                  )}
                               </React.Fragment>
                            );
                         })}
                         {sales.length === 0 && (
                            <tr>
                               <td colSpan={6} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                                  <div className="flex flex-col items-center opacity-60">
                                     <Receipt className="w-12 h-12 mb-3" />
                                     <p className="text-lg font-medium">No sales found for these filters</p>
                                  </div>
                               </td>
                            </tr>
                         )}
                      </tbody>
                   </table>
                </div>
             )}
          </div>

          {/* Right Panel (Customer Context) */}
          {selectedBill && (
            <div className="w-80 rounded-xl flex flex-col shrink-0 sticky top-0 overflow-hidden animate-in slide-in-from-right-4 duration-300 border shadow-lg" 
                 style={{ background: 'var(--surface)', borderColor: 'var(--border)', height: '100%' }}>
               <div className="p-4" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                     <User className="w-4 h-4 text-indigo-500" /> Patient Profile
                  </h3>
               </div>
               
               <div className="p-5 flex-1 overflow-y-auto">
                  {selectedBill.customer_name ? (
                     <>
                        <div className="mb-6">
                           <h2 className="text-xl font-black mb-1" style={{ color: 'var(--text)' }}>{selectedBill.customer_name}</h2>
                           {selectedBill.customer_phone && (
                              <p className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                                 <Phone className="w-3.5 h-3.5" /> {selectedBill.customer_phone}
                              </p>
                           )}
                        </div>

                        {/* Computed Lifetime stats */}
                        {customerHistory.length > 0 && (
                           <div className="grid grid-cols-2 gap-3 mb-6">
                              <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800">
                                 <p className="text-[10px] uppercase font-bold text-indigo-500 mb-1">Lifetime Value</p>
                                 <p className="text-lg font-black text-indigo-700 dark:text-indigo-400">
                                    ₹{fmt(customerHistory.reduce((s, b) => s + (b.is_returned ? 0 : b.total_amount), 0))}
                                 </p>
                              </div>
                              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800">
                                 <p className="text-[10px] uppercase font-bold text-emerald-500 mb-1">Total Visits</p>
                                 <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">
                                    {customerHistory.filter(b => !b.is_returned).length} 
                                 </p>
                              </div>
                           </div>
                        )}

                        <div>
                           <h4 className="text-xs uppercase font-bold mb-3 tracking-wider flex items-center justify-between" style={{ color: 'var(--text-muted)' }}>
                              Recent Purchases
                              {historyLoading && <RefreshCw className="w-3 h-3 animate-spin" />}
                           </h4>
                           <div className="space-y-3">
                              {customerHistory.slice(0, 5).map(histBill => (
                                 <div key={histBill.id} 
                                      className={`p-3 rounded-lg border text-sm transition-colors ${histBill.id === selectedBill.id ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10' : 'border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800'}`}>
                                    <div className="flex justify-between items-center mb-1.5">
                                       <span className="font-bold text-gray-700 dark:text-gray-300">#{histBill.id.toString().padStart(5, '0')}</span>
                                       <span className="font-bold">₹{fmt(histBill.total_amount)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs text-gray-500">
                                       <span>{new Date(histBill.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                                       <span className="flex items-center gap-1">
                                          {renderPaymentBadge(histBill.payment_status)}
                                       </span>
                                    </div>
                                    {histBill.is_returned === 1 && (
                                       <p className="text-[10px] font-bold text-red-500 mt-2 bg-red-50 inline-block px-1.5 py-0.5 rounded">Returned</p>
                                    )}
                                 </div>
                              ))}
                           </div>
                        </div>
                     </>
                  ) : (
                     <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
                        <User className="w-16 h-16 mb-4 text-gray-300" />
                        <h4 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Walk-in Customer</h4>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>No historical data tracked for anonymous sales.</p>
                     </div>
                  )}
               </div>
            </div>
          )}

        </div>
      </div>
      {activePrintSale && <ReceiptPrinter sale={activePrintSale} />}
      {returnModalSale && (
        <ReturnModal 
          sale={returnModalSale} 
          onClose={() => setReturnModalSale(null)} 
          onDone={fetchData} 
        />
      )}
    </>
  );
}
