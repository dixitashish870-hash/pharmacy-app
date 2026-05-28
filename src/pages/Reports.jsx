import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';
import {
  AlertTriangle, Clock, TrendingUp, Package, Calendar, Receipt,
  Truck, IndianRupee, PieChart, BarChart3, Activity, Layers, ChevronRight, Eye
} from 'lucide-react';

const fmtAmt = (val) => Number(val || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

export default function Reports() {
  const [activeTab, setActiveTab] = useState('inventory');
  const [lowStock, setLowStock] = useState([]);
  const [expiryAlerts, setExpiryAlerts] = useState({ expiring: [], expired: [] });
  const [purchases, setPurchases] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [productsRes, expiringRes, statsRes, purchasesRes, salesRes] = await Promise.all([
        axios.get(`${API_BASE}/api/products`),
        axios.get(`${API_BASE}/api/products/expiring`),
        axios.get(`${API_BASE}/api/stats`),
        axios.get(`${API_BASE}/api/purchases`),
        axios.get(`${API_BASE}/api/sales?limit=20`),
      ]);
      setLowStock(productsRes.data.filter(p => p.stock <= 10));
      setExpiryAlerts(expiringRes.data);
      setStats(statsRes.data);
      setPurchases(purchasesRes.data);
      setRecentSales(salesRes.data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  if (loading) return (
    <div className="h-[calc(100vh-120px)] flex flex-col items-center justify-center" style={{ color: 'var(--text-muted)' }}>
      <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
      <p className="font-bold" style={{ color: 'var(--text-muted)' }}>Generating Analytics Reports...</p>
    </div>
  );

  const statCards = [
    { label: 'Total Inventory Value', value: fmtAmt(stats?.totalValuation).split('.')[0], sub: 'Current Stock Valuation', icon: IndianRupee, bg: 'rgba(99,102,241,0.10)', color: '#818CF8', BgIcon: PieChart },
    { label: "Today's Revenue", value: fmtAmt(stats?.todayRevenue).split('.')[0], sub: `${stats?.todaySales} Sales Invoices Today`, icon: TrendingUp, bg: 'rgba(16,185,129,0.10)', color: '#34D399', BgIcon: Activity },
    { label: 'Low Stock Batches', value: `${lowStock.length} Items`, sub: 'Needs Replenishment Soon', icon: Package, bg: 'rgba(249,115,22,0.10)', color: '#FB923C', BgIcon: Layers },
    { label: 'Expiry Alerts', value: `${expiryAlerts.expired.length + expiryAlerts.expiring.length} Warning`, sub: `${expiryAlerts.expired.length} Expired • ${expiryAlerts.expiring.length} Near`, icon: Clock, bg: 'rgba(239,68,68,0.10)', color: '#F87171', BgIcon: AlertTriangle },
  ];

  return (
    <div className="h-[calc(100vh-80px)] overflow-hidden flex flex-col p-4" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex justify-between items-end mb-6 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-3" style={{ color: 'var(--text)' }}>
            <BarChart3 className="text-indigo-500" /> Reports &amp; Analytics
          </h1>
          <p className="text-sm font-medium mt-1" style={{ color: 'var(--text-muted)' }}>Holistic view of your pharmacy's financial and stock performance.</p>
        </div>
        {/* Tab switcher */}
        <div className="flex p-1 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {[
            { id: 'inventory', label: 'Stock & Expiry', icon: Package },
            { id: 'purchases', label: 'Purchases', icon: Truck },
            { id: 'sales', label: 'Sales & Profits', icon: TrendingUp },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all"
              style={activeTab === tab.id
                ? { background: '#4F46E5', color: 'white', boxShadow: '0 4px 14px rgba(79,70,229,0.3)' }
                : { color: 'var(--text-muted)', background: 'transparent' }}>
              <tab.icon size={15} /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6 flex-shrink-0">
        {statCards.map((card, i) => (
          <div key={i} className="p-5 rounded-2xl relative overflow-hidden group transition-all" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex justify-between items-start mb-2 relative z-10">
              <div className="p-2 rounded-xl" style={{ background: card.bg, color: card.color }}>
                <card.icon size={20} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ color: card.color, background: card.bg }}>
                {card.label}
              </span>
            </div>
            <div className="relative z-10">
              <div className="text-2xl font-black" style={{ color: 'var(--text)' }}>{card.value}</div>
              <p className="text-[10px] font-bold mt-1 uppercase tracking-tight" style={{ color: 'var(--text-light)' }}>{card.sub}</p>
            </div>
            <card.BgIcon className="absolute -right-4 -bottom-4 w-24 h-24 opacity-5" />
          </div>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 rounded-3xl shadow-sm overflow-hidden flex flex-col min-h-0" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

        {/* Inventory Tab */}
        {activeTab === 'inventory' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Low Stock */}
            <div className="flex-1 flex flex-col overflow-hidden" style={{ borderRight: '1px solid var(--border)' }}>
              <div className="px-6 py-4 flex justify-between items-center" style={{ background: 'rgba(249,115,22,0.06)', borderBottom: '1px solid var(--border)' }}>
                <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-orange-500">
                  <AlertTriangle size={14} /> Low Stock Register
                </h3>
              </div>
              <div className="overflow-y-auto flex-1">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--surface-2)', position: 'sticky', top: 0 }}>
                    <tr>
                      {['Medicine', 'Batch', 'Stock'].map((h, i) => (
                        <th key={i} className={`px-6 py-3 text-[10px] font-black uppercase tracking-widest ${i === 2 ? 'text-right' : 'text-left'}`}
                          style={{ color: 'var(--text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lowStock.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td className="px-6 py-4">
                          <div className="font-bold text-sm" style={{ color: 'var(--text)' }}>{p.name}</div>
                          <div className="text-[10px] font-bold uppercase tracking-tight" style={{ color: 'var(--text-light)' }}>{p.brand_name}</div>
                        </td>
                        <td className="px-4 py-4 font-mono text-xs font-bold" style={{ color: 'var(--text-muted)' }}>{p.batch || '—'}</td>
                        <td className="px-6 py-4 text-right">
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-black ${p.stock === 0 ? 'text-red-500 bg-red-500/10' : 'text-orange-500 bg-orange-500/10'}`}>
                            {p.stock} Units
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Expiry Watchlist */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-6 py-4 flex justify-between items-center" style={{ background: 'rgba(239,68,68,0.06)', borderBottom: '1px solid var(--border)' }}>
                <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-red-500">
                  <Clock size={14} /> Expiry Watchlist
                </h3>
              </div>
              <div className="overflow-y-auto flex-1 p-4 space-y-4">
                {expiryAlerts.expired.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-black text-red-500 uppercase ml-2 mb-2 tracking-[0.2em]">Expired Items</div>
                    {expiryAlerts.expired.map(p => (
                      <div key={p.id} className="rounded-2xl p-4 flex justify-between items-center" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                        <div>
                          <div className="font-black text-sm uppercase text-red-500">{p.name}</div>
                          <div className="text-[10px] font-bold uppercase tracking-tight" style={{ color: 'var(--text-muted)' }}>Batch: {p.batch} • Expired on {p.expiry}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-red-500">{p.stock} Units</div>
                          <div className="text-[9px] font-bold uppercase" style={{ color: 'var(--text-light)' }}>Wasted Stock</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-2">
                  <div className="text-[10px] font-black text-orange-500 uppercase ml-2 mb-2 tracking-[0.2em]">Critical Expiry (Next 90 Days)</div>
                  {expiryAlerts.expiring.map(p => (
                    <div key={p.id} className="rounded-2xl p-4 flex justify-between items-center transition-all" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <div>
                        <div className="font-black text-sm uppercase" style={{ color: 'var(--text)' }}>{p.name}</div>
                        <div className="text-[10px] font-bold uppercase tracking-tight text-orange-500">Expiring {p.expiry}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black" style={{ color: 'var(--text)' }}>{p.stock} Units</div>
                        <button className="text-[9px] font-black text-indigo-500 uppercase mt-1 hover:underline" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>Mark for liquidation</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Purchases Tab */}
        {activeTab === 'purchases' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 py-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-indigo-500"
              style={{ background: 'rgba(99,102,241,0.06)', borderBottom: '1px solid var(--border)' }}>
              <Truck size={14} /> Stock Purchase Log
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              <div className="grid grid-cols-1 gap-4">
                {purchases.map(p => (
                  <div key={p.id} className="rounded-3xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all group"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                    <div className="flex items-center gap-5">
                      <div className="p-4 rounded-2xl transition-all" style={{ background: 'rgba(99,102,241,0.10)', color: '#818CF8' }}>
                        <Receipt size={24} />
                      </div>
                      <div>
                        <div className="text-lg font-black" style={{ color: 'var(--text)' }}>#{p.invoice_no}</div>
                        <div className="text-[11px] font-bold uppercase tracking-tight flex items-center gap-2 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          <Truck size={12} className="text-indigo-400" /> {p.supplier_name}
                          <span className="w-1 h-1 rounded-full" style={{ background: 'var(--border)' }}></span>
                          <Calendar size={12} className="text-indigo-400" /> {new Date(p.purchase_date).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-12 w-full md:w-auto">
                      <div className="text-center md:text-right flex-1 md:flex-none">
                        <div className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-light)' }}>Net Amount</div>
                        <div className="text-xl font-black" style={{ color: 'var(--text)' }}>{fmtAmt(p.total_amount)}</div>
                      </div>
                      <div className="text-center md:text-right flex-1 md:flex-none">
                        <div className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-light)' }}>Status</div>
                        <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-tighter border ${p.payment_status === 'Paid' ? 'text-emerald-500 border-emerald-500/20 bg-emerald-500/10' : 'text-orange-500 border-orange-500/20 bg-orange-500/10'}`}>
                          {p.payment_status}
                        </span>
                      </div>
                      <button className="p-3 rounded-2xl transition-all" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <Eye size={20} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Sales Tab */}
        {activeTab === 'sales' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Sales Summary Row */}
            <div className="grid grid-cols-3 gap-6 p-6 flex-shrink-0" style={{ background: 'rgba(99,102,241,0.03)', borderBottom: '1px solid var(--border)' }}>
               <div className="flex flex-col items-center p-4 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                 <div className="text-[10px] font-black uppercase text-[#818CF8] mb-1">Today's Net Profit</div>
                 <div className="text-xl font-black" style={{ color: 'var(--text)' }}>{fmtAmt(stats?.todayProfit)}</div>
               </div>
               <div className="flex flex-col items-center p-4 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                 <div className="text-[10px] font-black uppercase text-amber-500 mb-1">Total Refunds (Today)</div>
                 <div className="text-xl font-black" style={{ color: 'var(--text)' }}>
                   {stats?.todaySalesSummary?.returns_amount ? fmtAmt(stats.todaySalesSummary.returns_amount) : '₹0.00'}
                 </div>
               </div>
               <div className="flex flex-col items-center p-4 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                 <div className="text-[10px] font-black uppercase text-emerald-500 mb-1">Avg. Bill Value</div>
                 <div className="text-xl font-black" style={{ color: 'var(--text)' }}>
                   {stats?.todaySales > 0 ? fmtAmt(stats?.todayRevenue / stats?.todaySales) : '₹0.00'}
                 </div>
               </div>
            </div>

            {/* Sales Ledger */}
            <div className="flex-1 flex flex-col overflow-hidden">
               <div className="px-6 py-4 flex justify-between items-center" style={{ borderBottom: '1px solid var(--border)' }}>
                 <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                   <Activity size={14} className="text-emerald-500" /> Recent Sales Ledger
                 </h3>
                 <span className="text-[10px] font-bold text-slate-400">Last 20 transactions</span>
               </div>
               <div className="overflow-y-auto flex-1 p-4">
                 <div className="grid grid-cols-1 gap-3">
                   {recentSales.map(sale => (
                     <div key={sale.id} className="rounded-2xl p-4 flex justify-between items-center transition-all hover:translate-x-1"
                       style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                       <div className="flex items-center gap-4">
                         <div className="p-2.5 rounded-xl text-emerald-600" style={{ background: 'rgba(16,185,129,0.1)' }}>
                           <Receipt size={18} />
                         </div>
                         <div>
                           <div className="font-black text-sm" style={{ color: 'var(--text)' }}>#{sale.id.toString().padStart(5, '0')}</div>
                           <div className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
                             {sale.customer_name || 'Walk-in'} • {new Date(sale.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                           </div>
                         </div>
                       </div>
                       
                       <div className="flex items-center gap-8">
                         <div className="text-right">
                           <div className="text-[9px] font-bold uppercase" style={{ color: 'var(--text-light)' }}>Total</div>
                           <div className="text-sm font-black" style={{ color: 'var(--text)' }}>{fmtAmt(sale.total_amount)}</div>
                         </div>
                         {sale.refunded_amount > 0 && (
                            <div className="text-right">
                              <div className="text-[9px] font-bold uppercase text-amber-500">Refunded</div>
                              <div className="text-sm font-black text-amber-500">-{fmtAmt(sale.refunded_amount).replace('₹','')}</div>
                            </div>
                         )}
                         <div className="text-right">
                           <div className="text-[9px] font-bold uppercase" style={{ color: 'var(--text-light)' }}>Payment</div>
                           <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${sale.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                             {sale.payment_status}
                           </span>
                         </div>
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
