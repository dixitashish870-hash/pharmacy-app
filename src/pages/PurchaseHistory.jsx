import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';
import { useUI } from '../context/UIContext';
import { Search, RotateCcw, Receipt, Image as ImageIcon, ChevronRight, X } from 'lucide-react';

const fmtAmt = (val) => Number(val || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

export default function PurchaseHistory({ onEditPurchase }) {
  const { toast } = useUI();
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);  // full purchase detail
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [search, setSearch] = useState('');
  const [returnModalBill, setReturnModalBill] = useState(null);
  const [returnQuantities, setReturnQuantities] = useState({});
  const [returning, setReturning] = useState(false);

  useEffect(() => { fetchPurchases(); }, []);

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/purchases`);
      setPurchases(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const openReturnModal = (bill) => {
    setReturnModalBill(bill);
    const initialQty = {};
    bill.items.forEach(i => initialQty[i.product_id] = 0);
    setReturnQuantities(initialQty);
  };

  const submitReturn = async () => {
    const itemsToReturn = returnModalBill.items.map(item => ({
      ...item,
      return_quantity: returnQuantities[item.product_id] || 0
    })).filter(i => i.return_quantity > 0);

    if (itemsToReturn.length === 0) { toast('No quantities to return', 'warning'); return; }

    setReturning(true);
    try {
      await axios.post(`${API_BASE}/api/purchases/${returnModalBill.id}/return`, { items: itemsToReturn });
      setReturnModalBill(null);
      fetchPurchases();
      setSelected(null); // Close the detail view to reflect new state
    } catch (e) {
      console.error(e);
      toast(e.response?.data?.error || 'Failed to process return', 'error');
    } finally {
      setReturning(false);
    }
  };

  const openDetail = async (p) => {
    if (selected?.id === p.id) { setSelected(null); return; }
    setLoadingDetail(true);
    try {
      const res = await axios.get(`${API_BASE}/api/purchases/${p.id}`);
      setSelected(res.data);
    } catch (e) { console.error(e); }
    finally { setLoadingDetail(false); }
  };

  const filtered = purchases.filter(p =>
    !search ||
    (p.supplier_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.invoice_no || '').toLowerCase().includes(search.toLowerCase())
  );

  const billUrl = (img) => `${API_BASE}/api/bills/${img}`;

  return (
    <div className="flex-1 flex gap-4 overflow-hidden min-h-0">

      {/* LEFT: PURCHASE LIST */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-3 flex-shrink-0">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-2.5 text-[var(--text-muted)]" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by supplier or invoice no…"
              className="w-full pl-9 pr-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm font-medium outline-none focus:border-indigo-400 shadow-sm"
            />
          </div>
          <button onClick={fetchPurchases} className="p-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-[var(--text-muted)] hover:text-indigo-600 hover:border-indigo-300 shadow-sm transition-all" title="Refresh">
            <RotateCcw size={15} />
          </button>
          <div className="text-xs font-bold text-[var(--text-muted)]">{filtered.length} records</div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {loading && (
            <div className="flex items-center justify-center py-32 text-[var(--text-muted)]">
              <RotateCcw size={28} className="animate-spin" />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-32 text-[var(--text-muted)]">
              <Receipt size={48} className="mb-3 opacity-30" />
              <p className="text-base font-black text-[var(--text-muted)]">No purchase records yet</p>
              <p className="text-sm mt-1">Save a purchase to see it here</p>
            </div>
          )}
          {filtered.map(p => {
            const isOpen = selected?.id === p.id;
            const date = p.purchase_date || p.created_at?.split('T')[0];
            const isReturn = p.net_amount < 0 || (p.invoice_no && p.invoice_no.startsWith('RET-'));
            return (
              <div key={p.id} className={`bg-[var(--surface)] border rounded-2xl shadow-sm overflow-hidden transition-all ${
                isOpen ? 'border-indigo-300 shadow-indigo-100' : 'border-[var(--border)] hover:border-slate-300'
              } ${isReturn ? 'border-rose-300 bg-rose-50/30' : ''}`}>
                {/* Row header */}
                <button
                  onClick={() => openDetail(p)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left"
                >
                  {/* Bill image thumbnail */}
                  <div className={`w-12 h-12 rounded-xl flex-shrink-0 overflow-hidden border-2 flex items-center justify-center ${
                    p.image_path ? 'border-indigo-200 bg-indigo-50' : 'border-dashed border-[var(--border)] bg-[var(--surface-2)]'
                  }`}>
                    {p.image_path
                      ? <img src={billUrl(p.image_path)} alt="bill" className="w-full h-full object-cover" />
                      : <ImageIcon size={18} className="text-[var(--text-muted)]" />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-[var(--text)] text-sm truncate">{p.supplier_name || 'Unknown Supplier'}</span>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                        p.payment_status === 'paid'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>{p.payment_status}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {p.invoice_no && <span className="text-[11px] font-mono text-[var(--text-muted)]">#{p.invoice_no}</span>}
                      <span className="text-[11px] text-[var(--text-muted)]">{date}</span>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className="font-black text-[var(--text)] text-base">{fmtAmt(p.net_amount)}</div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">GST: {fmtAmt(p.gst_total)}</div>
                  </div>

                  <div className={`ml-2 text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                    <ChevronRight size={16} />
                  </div>
                </button>

                {/* Expanded items */}
                {isOpen && (
                  <div className="border-t border-[var(--border)] px-5 pb-4 pt-3 bg-[var(--surface-2)]/60">
                    {loadingDetail
                      ? <div className="py-6 text-center"><RotateCcw size={18} className="animate-spin mx-auto text-[var(--text-muted)]" /></div>
                      : (
                        <>
                          <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">
                              <th className="pb-2 text-left">Item</th>
                              <th className="pb-2 text-left">Batch</th>
                              <th className="pb-2 text-left">Expiry</th>
                              <th className="pb-2 text-center">Qty</th>
                              <th className="pb-2 text-right">Rate</th>
                              <th className="pb-2 text-right">MRP</th>
                              <th className="pb-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]">
                            {(selected?.items || []).map((item, i) => (
                              <tr key={i} className="hover:bg-[var(--surface)] transition-colors">
                                <td className="py-1.5 pr-3 font-bold text-[var(--text)]">{item.name}</td>
                                <td className="py-1.5 pr-3 font-mono text-[var(--text-muted)]">{item.batch}</td>
                                <td className="py-1.5 pr-3 text-[var(--text-muted)]">{item.expiry}</td>
                                <td className="py-1.5 text-center font-black text-[var(--text)]">{item.quantity}</td>
                                <td className="py-1.5 text-right text-emerald-700 font-bold">{fmtAmt(item.purchase_price)}</td>
                                <td className="py-1.5 text-right text-[var(--text-muted)]">{fmtAmt(item.mrp)}</td>
                                <td className="py-1.5 text-right font-black text-[var(--text)]">{fmtAmt(item.quantity * item.purchase_price)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-[var(--border)]">
                              <td colSpan={6} className="pt-2 text-right text-[10px] font-black text-[var(--text-muted)] uppercase">Net Total</td>
                              <td className="pt-2 text-right font-black text-[var(--text)] text-sm">{fmtAmt(selected?.net_amount)}</td>
                            </tr>
                          </tfoot>
                        </table>
                        {!isReturn && (
                          <div className="flex justify-end mt-4 gap-2">
                            <button
                              onClick={() => {
                                if (onEditPurchase) onEditPurchase(selected);
                              }}
                              className="px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-xs font-bold transition-colors shadow-sm"
                            >
                              Edit Bill
                            </button>
                            <button 
                              onClick={() => openReturnModal(selected)}
                              className="px-4 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl text-xs font-bold transition-colors shadow-sm"
                            >
                              Return Items from Bill
                            </button>
                          </div>
                        )}
                        </>
                      )
                    }
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT: BILL IMAGE PREVIEW */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-3">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden flex flex-col flex-1">
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2 flex-shrink-0">
            <Receipt size={15} className="text-indigo-500" />
            <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Bill Image</span>
          </div>
          <div className="flex-1 flex items-center justify-center bg-[var(--surface-2)]">
            {selected?.image_path ? (
              <img
                src={billUrl(selected.image_path)}
                alt="Invoice"
                className="w-full h-full object-contain"
                style={{ maxHeight: 540 }}
              />
            ) : (
              <div className="flex flex-col items-center py-16 text-[var(--text-muted)]">
                <ImageIcon size={48} className="mb-3 opacity-30" />
                <p className="text-sm font-black text-[var(--text-muted)] text-center px-6">
                  {selected ? 'No bill image for this purchase' : 'Select a purchase to preview its bill'}
                </p>
              </div>
            )}
          </div>
          {selected?.image_path && (
            <a
              href={billUrl(selected.image_path)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 py-3 px-4 border-t border-[var(--border)] text-xs font-black text-indigo-600 hover:bg-[var(--primary)]/10 transition-colors"
            >
              <ImageIcon size={13} /> Open full size
            </a>
          )}
        </div>
      </div>

      {/* RETURN MODAL */}
      {returnModalBill && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-[var(--text)] text-lg">Process Return</h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Invoice: {returnModalBill.invoice_no || 'Unknown'}</p>
              </div>
              <button onClick={() => setReturnModalBill(null)} className="p-2 text-[var(--text-muted)] hover:bg-[var(--surface-2)] rounded-xl">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-5 flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest border-b border-[var(--border)]">
                    <th className="pb-2 text-left">Item</th>
                    <th className="pb-2 text-center">Purchased</th>
                    <th className="pb-2 text-center">Return Qty</th>
                    <th className="pb-2 text-right">Refund Amt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {returnModalBill.items.map(item => {
                    const rQty = returnQuantities[item.product_id] || 0;
                    return (
                      <tr key={item.product_id} className="hover:bg-[var(--surface-2)] transition-colors">
                        <td className="py-3 pr-3 font-bold text-[var(--text)]">
                          {item.name} 
                          {item.batch && <div className="text-[10px] text-[var(--text-muted)] font-normal">{item.batch}</div>}
                        </td>
                        <td className="py-3 text-center text-emerald-700 font-bold">{item.quantity}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-between gap-1 max-w-[100px] mx-auto bg-[var(--surface-2)] p-1 rounded-lg border border-[var(--border)]">
                            <button 
                              onClick={() => setReturnQuantities(prev => ({...prev, [item.product_id]: Math.max(0, rQty - 1)}))}
                              className="w-7 h-7 rounded min-w-0 bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors shadow-sm font-bold disabled:opacity-30"
                              disabled={rQty <= 0}
                            >-</button>
                            <span className="flex-1 text-center font-black tabular-nums text-[var(--text)]">{rQty}</span>
                            <button 
                              onClick={() => setReturnQuantities(prev => ({...prev, [item.product_id]: Math.min(item.quantity, rQty + 1)}))}
                              className="w-7 h-7 rounded min-w-0 bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-colors shadow-sm font-bold disabled:opacity-30"
                              disabled={rQty >= item.quantity}
                            >+</button>
                          </div>
                        </td>
                        <td className="py-3 text-right font-black text-rose-600">
                          {fmtAmt(rQty * item.purchase_price)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-4 border-t border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-between rounded-b-2xl">
              <div className="flex items-center gap-3">
                <div className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Total Refund</div>
                <div className="text-xl font-black text-rose-600">
                  {fmtAmt(returnModalBill.items.reduce((sum, item) => sum + ((returnQuantities[item.product_id] || 0) * item.purchase_price * (1 + (item.gst || 0)/100) ), 0))}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setReturnModalBill(null)} className="px-5 py-2 rounded-xl text-xs font-bold text-[var(--text-muted)] hover:bg-[var(--surface)] border border-[var(--border)] shadow-sm transition-colors">Cancel</button>
                <button 
                  onClick={submitReturn} 
                  disabled={returning || returnModalBill.items.reduce((sum, item) => sum + (returnQuantities[item.product_id] || 0), 0) === 0} 
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm disabled:opacity-50 flex items-center gap-2 transition-colors duration-200"
                >
                  {returning && <RotateCcw size={14} className="animate-spin" />}
                  Confirm Return
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
