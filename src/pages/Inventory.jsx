import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';
import { useUI } from '../context/UIContext';
import {
  Package, Plus, Filter, AlertTriangle, CheckCircle,
  Edit2, Trash2, TrendingUp, Box, X, RotateCcw, Camera,
  Truck, Search, ListPlus, Upload, UploadCloud, FileText,
  CheckCircle2, Phone, Mail, MapPin, ShoppingCart, Clock,
  ChevronDown, ChevronRight, Receipt, Image as ImageIcon, Pill, Beaker, Tag
} from 'lucide-react';

/* â”€â”€â”€ HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const calculateExpiryState = (expiryDateStr) => {
  if (!expiryDateStr) return 'safe';
  try {
    const parts = expiryDateStr.split('-');
    const expDate = new Date(parseInt(parts[0]), (parseInt(parts[1]) || 1) - 1, 1);
    const today = new Date();
    const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'expired';
    if (diffDays <= 90) return 'warning';
  } catch { /* invalid date string — treat as safe */ }
  return 'safe';
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   TAB 1 â€” STOCK VIEW
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function StockTab() {
  const { toast, confirm } = useUI();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [stockFilter, setStockFilter] = useState('All');
  const [itemTypeFilter, setItemTypeFilter] = useState('All');

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editMed, setEditMed] = useState({});

  useEffect(() => { fetchProducts(); }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/products`);
      setProducts(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => products.filter(p => {
    const s = searchTerm.toLowerCase();
    const match = p.name.toLowerCase().includes(s) ||
      (p.salt_composition && p.salt_composition.toLowerCase().includes(s)) ||
      (p.batch && p.batch.toLowerCase().includes(s));
    if (!match) return false;
    if (categoryFilter !== 'All' && p.category !== categoryFilter) return false;
    if (stockFilter === 'In Stock' && p.stock <= 0) return false;
    if (stockFilter === 'Low Stock' && (p.stock > 10 || p.stock === 0)) return false;
    if (stockFilter === 'Out of Stock' && p.stock > 0) return false;
    if (itemTypeFilter !== 'All' && (p.item_type || 'PHARMA') !== itemTypeFilter) return false;
    return true;
  }), [products, searchTerm, categoryFilter, stockFilter, itemTypeFilter]);


  const handleEdit = (p) => { setEditMed({ ...p }); setEditModalOpen(true); };
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API_BASE}/api/products/${editMed.id}`, editMed);
      setEditModalOpen(false);
      fetchProducts();
    } catch (err) { toast('Failed to update: ' + err.message, 'error'); }
  };
  const handleDelete = async (id) => {
    const ok = await confirm('Delete this medicine? This cannot be undone.', { danger: true, title: 'Delete Medicine', confirmLabel: 'Delete' });
    if (ok) {
      await axios.delete(`${API_BASE}/api/products/${id}`);
      fetchProducts();
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* ── FILTER BAR (horizontal, above table) ── */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl mb-2 flex-shrink-0 shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-2)]/50">
          <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-1.5"><Filter size={11} />Filters</span>
          <button onClick={() => { setCategoryFilter('All'); setStockFilter('All'); setSearchTerm(''); setItemTypeFilter('All'); }} className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 flex items-center gap-1 uppercase"><RotateCcw size={9} /> Reset</button>
        </div>
        <div className="px-4 py-3 flex items-end gap-4 flex-wrap">
          {/* Search */}
          <div className="flex flex-col gap-1 w-[180px]">
            <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Search</label>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1.5 text-[var(--text-muted)]" />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Name, salt, batch..."
                className="w-full pl-7 pr-2 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-xs outline-none focus:border-indigo-400 transition-all"
              />
            </div>
          </div>
          {/* Category */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Category</label>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="py-1.5 px-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-xs text-[var(--text)] outline-none focus:border-indigo-400 cursor-pointer"
            >
              <option value="All">All Categories</option>
              {['Ayurvedic','Baby Care','Baby Drops','Baby Food','Capsule','Contraceptive','Cream','Eye Drop','Feminine Care','Injection','Ointment','OTC','Supplements','Surgical','Surgical Items','Syrup','Tablet','Other'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          {/* Stock Level — same style as Category */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Stock Level</label>
            <select
              value={stockFilter}
              onChange={e => setStockFilter(e.target.value)}
              className="py-1.5 px-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-xs text-[var(--text)] outline-none focus:border-indigo-400 cursor-pointer"
            >
              {['All','In Stock','Low Stock','Out of Stock'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {/* Item Type */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Item Type</label>
            <select
              value={itemTypeFilter}
              onChange={e => setItemTypeFilter(e.target.value)}
              className="py-1.5 px-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-xs text-[var(--text)] outline-none focus:border-indigo-400 cursor-pointer"
            >
              <option value="All">All Types</option>
              <option value="PHARMA">Pharma</option>
              <option value="GENERIC">Generic</option>
              <option value="FMCG">FMCG</option>
              <option value="PL">PL</option>
            </select>
          </div>
          {/* Count */}
          <div className="ml-auto text-[10px] font-bold text-[var(--text-muted)] self-end pb-1">
            {filtered.length} of {products.length} products
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl flex flex-col shadow-sm overflow-hidden min-w-0">

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
            <RotateCcw size={32} className="animate-spin opacity-20" />
            <span className="font-bold text-sm text-[var(--text-muted)]">Loading inventory...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <Box size={56} className="mb-4 opacity-10 text-[var(--text-light)]" />
            <p className="text-lg font-black text-[var(--text)]">No medicines found</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">Adjust your filters or record a new purchase</p>
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[var(--surface-2)] border-b border-[var(--border)] sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-5 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Medicine</th>
                  <th className="py-3 px-4 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Batch / Expiry</th>
                  <th className="py-3 px-4 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Item Type</th>
                  <th className="py-3 px-4 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest text-center">Stock</th>
                  <th className="py-3 px-4 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest text-right">MRP & Selling Price</th>
                  <th className="py-3 px-5 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map(p => {
                  const expStatus = calculateExpiryState(p.expiry);
                  const isLow = p.stock > 0 && p.stock <= 10;
                  const isOut = p.stock === 0;
                  return (
                    <tr key={p.id} className="hover:bg-[var(--surface-2)]/80 transition-colors group">
                      <td className="py-3.5 px-5">
                        <div className="font-extrabold text-[var(--text)] flex items-center gap-2">
                          {p.name}
                          {p.schedule !== 'Normal' && <span className="px-1.5 py-0.5 bg-[var(--danger)]/10 text-[var(--danger)]  text-[8px] font-black border  border-[var(--danger)]/30 rounded uppercase">Sch {p.schedule}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">{p.brand_name || 'Generic'}</span>
                          {p.category && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 uppercase">
                              {(p.category.toLowerCase().includes('syrup') || p.category.toLowerCase().includes('injection') || p.category.toLowerCase().includes('drop')) ? <Beaker size={10} /> :
                                (p.category.toLowerCase().includes('tablet') || p.category.toLowerCase().includes('capsule')) ? <Pill size={10} /> :
                                  (p.category.toLowerCase().includes('surgical') || p.category.toLowerCase().includes('ointment') || p.category.toLowerCase().includes('cream')) ? <Tag size={10} /> :
                                    <Package size={10} />}
                              {p.category}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mt-0.5 truncate max-w-xs">{p.salt_composition}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-xs font-mono font-bold text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] px-2 py-1 rounded-lg shadow-sm">{p.batch || 'N/A'}</span>
                        <div className={`text-[10px] font-black uppercase mt-1.5 flex items-center gap-1 ${expStatus === 'expired' ? 'text-red-600' : expStatus === 'warning' ? 'text-orange-500' : 'text-[var(--text-muted)]'}`}>
                          {expStatus !== 'safe' && <AlertTriangle size={10} />} EXP: {p.expiry || 'N/A'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {(() => {
                          const type = p.item_type || 'PHARMA';
                          const TYPE_STYLES = {
                            PHARMA:  { label: 'Pharma',  color: '#7C3AED', bg: 'rgba(124,58,237,0.10)',  border: 'rgba(124,58,237,0.30)' },
                            GENERIC: { label: 'Generic', color: '#0891B2', bg: 'rgba(8,145,178,0.10)',   border: 'rgba(8,145,178,0.30)'  },
                            FMCG:    { label: 'FMCG',   color: '#D97706', bg: 'rgba(217,119,6,0.10)',   border: 'rgba(217,119,6,0.30)'  },
                            PL:      { label: 'PL',     color: '#059669', bg: 'rgba(5,150,105,0.10)',   border: 'rgba(5,150,105,0.30)'  },
                          };
                          const s = TYPE_STYLES[type] || TYPE_STYLES.PHARMA;
                          return (
                            <span style={{
                              display: 'inline-block',
                              background: s.bg,
                              color: s.color,
                              border: `1px solid ${s.border}`,
                              borderRadius: 6,
                              padding: '2px 9px',
                              fontSize: 10,
                              fontWeight: 800,
                              letterSpacing: '0.05em',
                              textTransform: 'uppercase',
                            }}>{s.label}</span>
                          );
                        })()}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`text-xl font-black ${isOut ? 'text-red-500' : isLow ? 'text-orange-600' : 'text-[var(--text)]'}`}>{p.stock}</span>
                        <div className={`text-[9px] font-bold uppercase ${isOut ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>{isOut ? 'Out of Stock' : 'packs'}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-black text-[var(--text)] text-sm">₹{Number(p.price || 0).toFixed(2)}</div>
                        <div className="text-[10px] text-[var(--text-muted)] font-bold">MRP ₹{Number(p.mrp || 0).toFixed(2)}</div>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => handleEdit(p)} className="p-1.5 text-indigo-500 hover:bg-[var(--primary)]/10 rounded-xl transition-all border border-transparent hover:border-[var(--primary)]/30"><Edit2 size={16} /></button>
                          <button onClick={() => handleDelete(p.id)} className="p-1.5 text-red-400 hover:bg-[var(--danger)]/10 rounded-xl transition-all border border-transparent hover:border-[var(--danger)]/30"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-5 py-2.5 bg-[var(--surface-2)] border-t border-[var(--border)] text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-tight flex justify-between items-center">
          <span>Live Pharmacy Stock Registry</span>
          <span>{products.length} Total SKUs</span>
        </div>
      </div>

      {/* QUICK EDIT MODAL */}
      {editModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--surface)] rounded-3xl shadow-2xl w-full max-w-xl border border-[var(--border)] overflow-hidden">
            <div className="px-7 py-5 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface-2)]/50">
              <div>
                <h2 className="text-lg font-black text-[var(--text)]">Quick Edit</h2>
                <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-widest">{editMed.name}</p>
              </div>
              <button onClick={() => setEditModalOpen(false)} className="p-2 text-[var(--text-muted)] hover:text-[var(--text-light)] bg-[var(--surface-2)] rounded-full transition-all"><X size={20} /></button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-7 space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 block">Medicine Name</label>
                  <input value={editMed.name || ''} onChange={e => setEditMed({ ...editMed, name: e.target.value })} className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl px-4 py-2.5 text-sm font-bold text-[var(--text)] outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 block">Batch</label>
                  <input value={editMed.batch || ''} onChange={e => setEditMed({ ...editMed, batch: e.target.value.toUpperCase() })} className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl px-4 py-2.5 text-sm font-mono font-black text-[var(--text)] outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-400 uppercase" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 block">Stock Count</label>
                  <input type="number" value={editMed.stock || 0} onChange={e => setEditMed({ ...editMed, stock: Number(e.target.value) })} className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl px-4 py-2.5 text-sm font-black text-[var(--text)] outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 block">Expiry (YYYY-MM)</label>
                  <input type="month" value={editMed.expiry || ''} onChange={e => setEditMed({ ...editMed, expiry: e.target.value })} className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl px-4 py-2.5 text-sm font-bold text-[var(--text)] outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 block">Sale Price (â‚¹)</label>
                  <input type="number" step="0.01" value={editMed.price || 0} onChange={e => setEditMed({ ...editMed, price: Number(e.target.value) })} className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl px-4 py-2.5 text-sm font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 block">MRP (â‚¹)</label>
                  <input type="number" step="0.01" value={editMed.mrp || 0} onChange={e => setEditMed({ ...editMed, mrp: Number(e.target.value) })} className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl px-4 py-2.5 text-sm font-black text-[var(--text)] outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 block">Pack Size (Tab/Strip)</label>
                  <input type="number" value={editMed.pack_size || 1} min="1" onChange={e => setEditMed({ ...editMed, pack_size: Number(e.target.value) })} className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl px-4 py-2.5 text-sm font-black text-[var(--text)] outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-400" />
                </div>
                <div>
                   <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 block">Item Type</label>
                   <select
                     value={editMed.item_type || 'PHARMA'}
                     onChange={e => setEditMed({ ...editMed, item_type: e.target.value })}
                     className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl px-4 py-2.5 text-sm font-bold text-[var(--text)] outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-400"
                   >
                     <option value="PHARMA">Pharma</option>
                     <option value="GENERIC">Generic</option>
                     <option value="FMCG">FMCG</option>
                     <option value="PL">PL</option>
                   </select>
                 </div>
                <div>
                  <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 block">GST Rate (%)</label>
                  <select
                    value={editMed.gst ?? 12}
                    onChange={e => setEditMed({ ...editMed, gst: Number(e.target.value) })}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl px-4 py-2.5 text-sm font-bold text-[var(--text)] outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-400"
                  >
                    <option value={0}>0% — Exempt</option>
                    <option value={5}>5%</option>
                    <option value={12}>12%</option>
                    <option value={18}>18%</option>
                    <option value={28}>28%</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditModalOpen(false)} className="flex-1 py-3 text-xs font-black text-[var(--text-muted)] uppercase tracking-widest bg-[var(--surface-2)] hover:bg-[var(--surface-2)] rounded-2xl transition-all">Cancel</button>
                <button type="submit" className="flex-[2] py-3 text-xs font-black text-white uppercase tracking-widest bg-indigo-600 hover:bg-indigo-700 rounded-2xl shadow-xl shadow-indigo-600/30 transition-all">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ROOT â€” INVENTORY PAGE (with tabs)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export default function Inventory() {
  const [tab, setTab] = useState('stock');

  const tabs = [
    { id: 'stock', label: 'Stock', icon: Package },
  ];

  return (
    <div className="h-[calc(100vh-80px)] overflow-hidden flex flex-col bg-[var(--surface-2)] p-4">
      {/* PAGE HEADER */}
      <div className="flex justify-between items-start mb-5 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--text)] tracking-tight">Inventory</h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">Stock management, purchasing, and supplier registry in one place.</p>
        </div>

        {/* TAB SWITCHER */}
        <div className="flex bg-[var(--surface)] p-1 rounded-2xl border border-[var(--border)] shadow-sm gap-0.5">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-black transition-all ${tab === t.id ? 'bg-slate-900 text-white shadow-lg' : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'}`}
            >
              <t.icon size={15} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'stock' && <StockTab />}
    </div>
  );
}
