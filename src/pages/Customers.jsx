import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';
import { useNavigate } from 'react-router-dom';
import { 
  Users, UserPlus, Search, Phone, History, CreditCard, Clock, 
  MapPin, CheckCircle, AlertTriangle, MessageCircle, FileText, 
  ChevronRight, X, Wallet, RefreshCw, Printer, RotateCcw,
  User, Activity
} from 'lucide-react';
import ReceiptPrinter from '../components/ReceiptPrinter';

const EMPTY_FORM = { name: '', phone: '', address: '', age: '', gender: '', reference_name: '' };
const fmt = (n) => parseFloat(n || 0).toFixed(2);

export default function Customers() {
  const navigate = useNavigate();

  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, credit, high_value, recent, inactive

  // Data State
  const [customers, setCustomers] = useState([]);
  const [summary, setSummary] = useState({ total_customers: 0, credit_customers: 0, total_outstanding: 0, active_customers_30d: 0 });
  const [loading, setLoading] = useState(true);

  // UI State
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSales, setCustomerSales] = useState([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  // Credit Settle Modal
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleAmount, setSettleAmount] = useState('');

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedSearch(searchTerm); }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Fetch data on filter change
  useEffect(() => {
    fetchData();
  }, [debouncedSearch, filterType]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (filterType !== 'all') params.append('filter_type', filterType);

      const [custRes, sumRes] = await Promise.all([
        axios.get(`${API_BASE}/api/customers?${params.toString()}`),
        axios.get(`${API_BASE}/api/customers/summary`)
      ]);

      setCustomers(custRes.data || []);
      setSummary(sumRes.data || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatus = (c) => {
    if (c.credit_balance > 0) return { label: 'Credit Due', color: 'red' };
    if (!c.last_visit_date) return { label: 'Inactive', color: 'gray' };
    const daysSince = (new Date() - new Date(c.last_visit_date)) / (1000 * 60 * 60 * 24);
    if (daysSince <= 30) return { label: 'Active', color: 'green' };
    return { label: 'Inactive', color: 'gray' };
  };

  const selectCustomer = async (c) => {
    setSelectedCustomer(c);
    setSalesLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/api/customers/${c.id}/sales`);
      setCustomerSales(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setSalesLoading(false);
    }
  };

  const openFormModal = (c = null) => {
    if (c) {
      setEditingCustomer(c);
      setFormData({ 
        name: c.name, phone: c.phone || '', address: c.address || '', 
        age: c.age || '', gender: c.gender || '', reference_name: c.reference_name || '' 
      });
    } else {
      setEditingCustomer(null);
      setFormData(EMPTY_FORM);
    }
    setShowFormModal(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCustomer) {
        await axios.put(`${API_BASE}/api/customers/${editingCustomer.id}`, formData);
      } else {
        await axios.post(`${API_BASE}/api/customers`, formData);
      }
      setShowFormModal(false);
      fetchData();
      if (selectedCustomer?.id === editingCustomer?.id) {
         setSelectedCustomer({ ...selectedCustomer, ...formData });
      }
    } catch (_err) {
      alert('Failed to save customer');
    }
  };

  const handleSettle = async () => {
    if (!settleAmount || isNaN(settleAmount) || settleAmount <= 0) return alert('Enter a valid amount');
    try {
      const { data } = await axios.post(`${API_BASE}/api/customers/${selectedCustomer.id}/settle`, { amount: parseFloat(settleAmount) });
      setSelectedCustomer({ ...selectedCustomer, credit_balance: data.credit_balance });
      fetchData(); // Refresh list to update credit
      setShowSettleModal(false);
      setSettleAmount('');
    } catch (_err) { alert('Failed to settle credit'); }
  };

  const handleRepeatLastSale = async () => {
    if (customerSales.length === 0) return alert('No previous sales found.');
    const lastSale = customerSales[0];
    try {
       // Need to fetch full sale with items manually if it wasn't pre-joined
       const { data } = await axios.get(`${API_BASE}/api/sales/${lastSale.id}`);
       const items = (typeof data.items_json === 'string' ? JSON.parse(data.items_json) : data.items_json) || data.items || [];
       const loadedItems = items.map(i => ({
          product_id: i.id || i.product_id || 0,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          discount_pct: i.discount || 0,
          mrp: i.mrp || i.price,
          gst: i.gst || 0,
          stock: 999 
       }));
       navigate('/billing', { state: { loadBillItems: loadedItems, customer_id: selectedCustomer.id } });
    } catch (e) {
       console.error(e);
       alert('Failed to load last bill items.');
    }
  };

  const handleNewSale = () => {
    navigate('/billing', { state: { customer_id: selectedCustomer.id } });
  };

  const sendWhatsAppReminder = () => {
    if (!selectedCustomer?.phone) return alert('No phone number available.');
    const msg = encodeURIComponent(`Hello ${selectedCustomer.name},\nThis is a gentle reminder regarding your pending outstanding balance of ₹${fmt(selectedCustomer.credit_balance)} at the pharmacy. Please clear it at your earliest convenience.\nThank you!`);
    window.open(`https://wa.me/91${selectedCustomer.phone}?text=${msg}`, '_blank');
  };

  return (
    <div className="h-full flex flex-col min-h-0 space-y-4 relative">
      
      {/* ── 1. Top Control Bar ── */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between" style={{ background: 'var(--surface)', padding: '16px 20px', borderRadius: 16, border: '1px solid var(--border)' }}>
        <div className="relative flex-1 max-w-sm">
           <Search className="absolute left-3 top-2.5 h-4 w-4" style={{ color: 'var(--text-light)' }} />
           <input type="text" placeholder="Search by Name / Mobile / ID" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%', paddingLeft: 36, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
                background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10,
                fontSize: 13, outline: 'none', color: 'var(--text)'
              }} />
        </div>

        <div className="flex gap-4 items-center">
           <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              {[
                { id: 'all', label: 'All Customers' },
                { id: 'credit', label: 'Credit Due' },
                { id: 'high_value', label: 'High Value (>₹10k)' },
                { id: 'recent', label: 'Recent (7d)' },
                { id: 'inactive', label: 'Inactive (30d)' }
              ].map(f => (
                <button key={f.id} onClick={() => setFilterType(f.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${filterType === f.id ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                  style={filterType === f.id ? { color: 'var(--primary)', border: '1px solid var(--border)' } : { color: 'var(--text-muted)' }}>
                  {f.label}
                </button>
              ))}
           </div>
           
           <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1"></div>

           <button onClick={() => openFormModal()}
             className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-md active:scale-95">
             <UserPlus className="h-4 w-4" /> Add Customer
           </button>
        </div>
      </div>

      {/* ── 2. Insight Cards ── */}
      <div className="grid grid-cols-4 gap-4 shrink-0">
         <div className="p-4 rounded-xl flex items-center gap-4 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-100 text-blue-600 shrink-0"><Users className="w-5 h-5" /></div>
            <div>
               <p className="text-xs font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Total Customers</p>
               <p className="text-xl font-black" style={{ color: 'var(--text)' }}>{summary.total_customers}</p>
            </div>
         </div>
         <div className="p-4 rounded-xl flex items-center gap-4 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-green-100 text-green-600 shrink-0"><Activity className="w-5 h-5" /></div>
            <div>
               <p className="text-xs font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Active (30 Days)</p>
               <p className="text-xl font-black" style={{ color: 'var(--text)' }}>{summary.active_customers_30d}</p>
            </div>
         </div>
         <div className="p-4 rounded-xl flex items-center gap-4 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-orange-100 text-orange-600 shrink-0"><Clock className="w-5 h-5" /></div>
            <div>
               <p className="text-xs font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Credit Customers</p>
               <p className="text-xl font-black" style={{ color: 'var(--text)' }}>{summary.credit_customers}</p>
            </div>
         </div>
         <div className="p-4 rounded-xl flex flex-col justify-center border shadow-sm relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #EF4444, #B91C1C)', borderColor: 'var(--border)' }}>
            <Wallet className="absolute right-3 top-3 w-16 h-16 opacity-10 text-white" />
            <p className="text-xs font-bold uppercase text-red-100 tracking-wider">Total Outstanding Credit</p>
            <p className="text-2xl font-black text-white mt-1">₹{fmt(summary.total_outstanding)}</p>
         </div>
      </div>

      {/* ── 3. Main Split View ── */}
      <div className="flex flex-1 gap-4 min-h-0">
         
         {/* Left Table Section */}
         <div className="flex-1 rounded-xl flex flex-col border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            {loading ? (
               <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}><RefreshCw className="w-6 h-6 animate-spin mr-2"/> Loading...</div>
            ) : (
               <div className="flex-1 overflow-auto">
                 <table className="w-full text-left border-collapse" style={{ fontSize: 13 }}>
                   <thead className="sticky top-0 z-10" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                     <tr>
                        <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider" style={{ color: 'var(--text-muted)' }}>Name</th>
                        <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider" style={{ color: 'var(--text-muted)' }}>Mobile</th>
                        <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider text-right" style={{ color: 'var(--text-muted)' }}>Total Purchase</th>
                        <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider" style={{ color: 'var(--text-muted)' }}>Last Visit</th>
                        <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider text-right" style={{ color: 'var(--text-muted)' }}>Credit Bal</th>
                        <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider" style={{ color: 'var(--text-muted)' }}>Status</th>
                     </tr>
                   </thead>
                   <tbody>
                      {customers.map(c => {
                         const status = getStatus(c);
                         const isSelected = selectedCustomer?.id === c.id;
                         return (
                           <tr key={c.id} onClick={() => selectCustomer(c)}
                               className="cursor-pointer transition-colors border-b last:border-b-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/50"
                               style={{ background: isSelected ? 'var(--surface-2)' : 'transparent', borderColor: 'var(--border)' }}>
                              <td className="px-4 py-3 font-bold flex items-center gap-2" style={{ color: isSelected ? 'var(--primary)' : 'var(--text)' }}>
                                {isSelected && <ChevronRight className="w-4 h-4" />}
                                {c.name}
                              </td>
                              <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-muted)' }}>{c.phone || '-'}</td>
                              <td className="px-4 py-3 text-right font-black" style={{ color: 'var(--text)' }}>₹{fmt(c.total_purchase)}</td>
                              <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                                {c.last_visit_date ? new Date(c.last_visit_date).toLocaleDateString() : 'Never'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {c.credit_balance > 0 ? (
                                   <span className="font-bold text-red-500">₹{fmt(c.credit_balance)}</span>
                                ) : <span style={{ color: 'var(--text-light)' }}>-</span>}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 text-[10px] uppercase font-bold rounded-full bg-${status.color}-100 text-${status.color}-700 border border-${status.color}-200`}>
                                   {status.label}
                                </span>
                              </td>
                           </tr>
                         )
                      })}
                      {customers.length === 0 && (
                         <tr><td colSpan="6" className="text-center py-12 text-gray-400 font-medium">No customers found</td></tr>
                      )}
                   </tbody>
                 </table>
               </div>
            )}
         </div>

         {/* Right Side Panel */}
         {selectedCustomer && (
            <div className="w-[500px] flex flex-col rounded-xl overflow-hidden border shrink-0 animate-in slide-in-from-right-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
               {/* Fixed Header */}
               <div className="p-4 flex justify-between items-center border-b bg-indigo-50/50 dark:bg-indigo-900/10" style={{ borderColor: 'var(--border)' }}>
                  <h2 className="text-lg font-black flex items-center gap-2" style={{ color: 'var(--text)' }}>
                     <User className="w-5 h-5 text-indigo-500" /> Customer Dashboard
                  </h2>
                  <div className="flex gap-2">
                     <button onClick={() => openFormModal(selectedCustomer)} className="text-xs bg-white dark:bg-gray-800 border px-3 py-1 font-bold rounded-lg shadow-sm text-indigo-600 hover:bg-gray-50 flex items-center gap-1">
                        Edit
                     </button>
                     <button onClick={() => setSelectedCustomer(null)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full text-gray-500"><X className="w-5 h-5"/></button>
                  </div>
               </div>

               <div className="flex-1 overflow-y-auto">
                 {/* Profile Details & Insights Split */}
                 <div className="grid grid-cols-2 gap-4 p-5 border-b" style={{ borderColor: 'var(--border)' }}>
                    {/* Left: Info */}
                    <div className="space-y-3">
                       <div>
                          <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Full Name</p>
                          <p className="font-bold text-base" style={{ color: 'var(--text)' }}>{selectedCustomer.name}</p>
                       </div>
                       <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-sm" style={{ color: 'var(--text)' }}>{selectedCustomer.phone || 'N/A'}</span>
                       </div>
                       <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-gray-400 mt-1 shrink-0" />
                          <span className="font-medium text-sm" style={{ color: 'var(--text)' }}>{selectedCustomer.address || 'N/A'}</span>
                       </div>
                       <div className="flex gap-4">
                          <div>
                            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">Age</p>
                            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{selectedCustomer.age || '-'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">Gender</p>
                            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{selectedCustomer.gender || '-'}</p>
                          </div>
                       </div>
                    </div>

                    {/* Right: Insights */}
                    <div className="space-y-2 rounded-xl p-3 border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                       <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-bold uppercase text-gray-500">Total Purchase</span>
                          <span className="text-indigo-600 font-black text-lg leading-none">₹{fmt(selectedCustomer.total_purchase)}</span>
                       </div>
                       <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold uppercase text-gray-500">Total Bills</span>
                          <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>{selectedCustomer.total_bills || 0}</span>
                       </div>
                       <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold uppercase text-gray-500">Avg Bill Val</span>
                          <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>₹{fmt(selectedCustomer.avg_bill)}</span>
                       </div>
                       <div className="flex justify-between items-center bg-gray-100 dark:bg-gray-800 p-1.5 rounded-lg mt-2">
                          <span className="text-[10px] font-bold uppercase text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3"/> Last Visit</span>
                          <span className="font-bold text-xs" style={{ color: 'var(--text-light)' }}>
                            {selectedCustomer.last_visit_date ? new Date(selectedCustomer.last_visit_date).toLocaleDateString() : 'Never'}
                          </span>
                       </div>
                    </div>
                 </div>

                 {/* Quick Actions Panel */}
                 <div className="p-4 grid grid-cols-4 gap-2 bg-indigo-50/30 dark:bg-indigo-900/5">
                    <button onClick={handleNewSale} className="flex flex-col items-center justify-center p-2 rounded-lg bg-white border shadow-sm hover:border-indigo-400 transition-colors group">
                       <FileText className="w-5 h-5 text-indigo-500 mb-1 group-hover:scale-110 transition-transform" />
                       <span className="text-[10px] font-bold text-gray-600">New Sale</span>
                    </button>
                    <button onClick={handleRepeatLastSale} className="flex flex-col items-center justify-center p-2 rounded-lg bg-white border shadow-sm hover:border-blue-400 transition-colors group">
                       <RotateCcw className="w-5 h-5 text-blue-500 mb-1 group-hover:scale-110 transition-transform" />
                       <span className="text-[10px] font-bold text-gray-600">Repeat Last</span>
                    </button>
                    <a href={`tel:${selectedCustomer.phone}`} className="flex flex-col items-center justify-center p-2 rounded-lg bg-white border shadow-sm hover:border-green-400 transition-colors group">
                       <Phone className="w-5 h-5 text-green-500 mb-1 group-hover:scale-110 transition-transform" />
                       <span className="text-[10px] font-bold text-gray-600">Call Cust</span>
                    </a>
                    <button onClick={sendWhatsAppReminder} className="flex flex-col items-center justify-center p-2 rounded-lg bg-white border shadow-sm hover:border-emerald-400 transition-colors group">
                       <MessageCircle className="w-5 h-5 text-emerald-500 mb-1 group-hover:scale-110 transition-transform" />
                       <span className="text-[10px] font-bold text-gray-600">WhatsApp</span>
                    </button>
                 </div>

                 {/* Credit Management Panel */}
                 <div className="p-5 border-y border-red-100 bg-red-50/50 dark:border-red-500/20 dark:bg-red-900/10 flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-black uppercase text-red-500 tracking-widest flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Credit Ledger</p>
                      <p className="text-sm font-bold mt-1 text-gray-700 dark:text-gray-300">Pending Amount:</p>
                      <p className="text-3xl font-black text-red-600 leading-tight">₹{fmt(selectedCustomer.credit_balance)}</p>
                    </div>
                    {selectedCustomer.credit_balance > 0 && (
                      <button onClick={() => setShowSettleModal(true)} className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-red-500/30 transition-transform active:scale-95">
                        Add Payment
                      </button>
                    )}
                 </div>

                 {/* Purchase History */}
                 <div className="p-5">
                    <h3 className="font-bold text-xs uppercase tracking-wider text-gray-500 mb-4 flex items-center justify-between">
                       Recent Bills {salesLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
                    </h3>
                    <div className="space-y-3">
                       {customerSales.length === 0 && !salesLoading && (
                          <div className="text-center p-6 border border-dashed rounded-xl opacity-60"><History className="w-8 h-8 mx-auto mb-2 text-gray-400"/> No purchase history.</div>
                       )}
                       {customerSales.slice(0, 15).map(sale => (
                          <div key={sale.id} className="p-3 border rounded-xl flex justify-between items-center hover:bg-gray-50 transition-colors" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                             <div>
                                <span className="font-bold text-gray-700 dark:text-gray-200 block mb-0.5">#{sale.id.toString().padStart(5, '0')}</span>
                                <span className="text-xs text-gray-500">{new Date(sale.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric'})}</span>
                             </div>
                             <div className="text-right">
                                <span className="font-black text-indigo-600 block">₹{fmt(sale.total_amount)}</span>
                                {sale.is_returned === 1 && <span className="text-[9px] bg-red-100 text-red-600 px-1 py-0.5 rounded uppercase font-bold mt-1 inline-block">Returned</span>}
                             </div>
                          </div>
                       ))}
                    </div>
                 </div>
               </div>
            </div>
         )}
      </div>

      {/* Form Modal */}
      {showFormModal && (
         <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md p-6 border dark:border-gray-800 shadow-2xl">
               <h2 className="text-xl font-black mb-6">{editingCustomer ? 'Edit Profile' : 'New Customer'}</h2>
               <form onSubmit={handleFormSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Full Name *</label>
                      <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Mobile Number</label>
                      <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Address</label>
                      <input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white" />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Age</label>
                      <input type="number" value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white" />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Gender</label>
                      <select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white">
                        <option value="">Select</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                  </div>
                  <div className="pt-4 flex justify-end gap-3 border-t dark:border-gray-800 mt-6">
                    <button type="button" onClick={() => setShowFormModal(false)} className="px-4 py-2 font-bold text-gray-500 hover:bg-gray-100 rounded-lg">Cancel</button>
                    <button type="submit" className="px-5 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-md">Save Customer</button>
                  </div>
               </form>
            </div>
         </div>
      )}

      {/* Settle Modal */}
      {showSettleModal && (
         <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border dark:border-gray-800">
               <div className="bg-red-500 p-6 text-white"><h2 className="text-xl font-black">Receive Payment</h2><p className="text-sm opacity-80 mt-1">{selectedCustomer.name}</p></div>
               <div className="p-6 space-y-4">
                  <div className="flex justify-between items-center p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100">
                     <span className="text-xs font-bold uppercase text-red-500">Outstanding Data</span>
                     <span className="text-lg font-black text-red-600">₹{fmt(selectedCustomer.credit_balance)}</span>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500 mb-2 block">Amount Received (₹)</label>
                    <input type="number" autoFocus value={settleAmount} onChange={e => setSettleAmount(e.target.value)} placeholder="0.00" className="w-full text-center text-3xl font-black border rounded-xl py-4 focus:ring-2 focus:ring-red-500 outline-none dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white" />
                  </div>
                  <div className="pt-4 flex justify-end gap-3 flex-col mt-4">
                    <button onClick={handleSettle} className="w-full py-4 text-center font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-500/20 rounded-xl">Confirm Settlement</button>
                    <button onClick={() => setShowSettleModal(false)} className="w-full py-3 font-bold text-gray-500 hover:bg-gray-100 rounded-xl">Cancel</button>
                  </div>
               </div>
            </div>
         </div>
      )}

    </div>
  );
}
