import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';
import { withRetry } from '../utils/withRetry';
import {
  AlertTriangle, Clock, TrendingUp, Package, Calendar, Receipt,
  Truck, IndianRupee, PieChart, BarChart3, Activity, Layers, Eye, RefreshCw
} from 'lucide-react';

const fmtAmt = (val) => Number(val || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

export default function Reports() {
  const [activeTab, setActiveTab] = useState('inventory');
  const [lowStock, setLowStock] = useState([]);
  const [expiryAlerts, setExpiryAlerts] = useState({ expiring: [], expired: [] });
  const [purchases, setPurchases] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [stats, setStats] = useState(null);
  const [storeSettings, setStoreSettings] = useState({});
  const [loading, setLoading] = useState(true);

  // Filter States
  const [dateRange, setDateRange] = useState('this_month'); // today, yesterday, last7, this_month, last_month, this_fy, month_year, custom, all
  const [customDates, setCustomDates] = useState({ 
    from: new Date().toISOString().split('T')[0], 
    to: new Date().toISOString().split('T')[0] 
  });
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());



  const getDates = () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    switch (dateRange) {
      case 'today':
        return { from: todayStr, to: todayStr };
      case 'yesterday': {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return { from: yesterday.toISOString().split('T')[0], to: yesterday.toISOString().split('T')[0] };
      }
      case 'last7': {
        const last7 = new Date();
        last7.setDate(last7.getDate() - 7);
        return { from: last7.toISOString().split('T')[0], to: todayStr };
      }
      case 'this_month': {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        return { from: firstDay.toISOString().split('T')[0], to: todayStr };
      }
      case 'last_month': {
        const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
        return {
          from: firstDay.toISOString().split('T')[0],
          to: lastDay.toISOString().split('T')[0]
        };
      }
      case 'this_fy': {
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        const startYear = currentMonth >= 3 ? currentYear : currentYear - 1;
        return {
          from: `${startYear}-04-01`,
          to: todayStr
        };
      }
      case 'month_year': {
        const firstDay = new Date(selectedYear, selectedMonth, 1);
        const lastDay = new Date(selectedYear, Number(selectedMonth) + 1, 0);
        return {
          from: firstDay.toISOString().split('T')[0],
          to: lastDay.toISOString().split('T')[0]
        };
      }
      case 'custom':
        return { from: customDates.from, to: customDates.to };
      case 'all':
      default:
        return { from: '', to: '' };
    }
  };

  const fetchData = async () => {
    setLoading(true);
    const { from, to } = getDates();
    try {
      const salesParams = new URLSearchParams();
      salesParams.append('limit', '100000'); // fetch all matching sales for reports
      if (from) salesParams.append('date_from', from);
      if (to) salesParams.append('date_to', to);

      const purchasesParams = new URLSearchParams();
      if (from) purchasesParams.append('date_from', from);
      if (to) purchasesParams.append('date_to', to);

      const [productsRes, expiringRes, statsRes, purchasesRes, salesRes, settingsRes] = await Promise.all([
        withRetry(() => axios.get(`${API_BASE}/api/products`)),
        withRetry(() => axios.get(`${API_BASE}/api/products/expiring`)),
        withRetry(() => axios.get(`${API_BASE}/api/stats`)),
        withRetry(() => axios.get(`${API_BASE}/api/purchases?${purchasesParams.toString()}`)),
        withRetry(() => axios.get(`${API_BASE}/api/sales?${salesParams.toString()}`)),
        withRetry(() => axios.get(`${API_BASE}/api/settings`)),
      ]);

      setLowStock(productsRes.data.filter(p => p.stock <= 10));
      setExpiryAlerts(expiringRes.data);
      setStats(statsRes.data);
      setPurchases(purchasesRes.data || []);
      setRecentSales(salesRes.data || []);
      setStoreSettings(settingsRes.data || {});
    } catch (e) {
      console.error('Failed to load report data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, customDates.from, customDates.to, selectedMonth, selectedYear]);

  // Calculate profit margin helper
  const calculateSaleProfit = (sale) => {
    if (sale.is_returned === 1) return 0;
    try {
      const items = JSON.parse(sale.items_json || '[]');
      return items.reduce((sum, item) => {
        if (!item) return sum;
        const netQty = item.quantity - (item.returned_quantity || 0);
        if (netQty <= 0) return sum;
        const sellingVal = item.price * netQty * (1 - (item.discount || 0) / 100);
        const purchaseVal = (item.purchase_price || 0) * netQty;
        return sum + (sellingVal - purchaseVal);
      }, 0);
    } catch {
      return 0;
    }
  };

  // Client-side calculations based on active period
  const periodSales = recentSales.filter(s => s.is_returned === 0);
  const periodSalesCount = periodSales.length;
  const periodRevenue = periodSales.reduce((sum, s) => sum + (s.total_amount || 0) - (s.refunded_amount || 0), 0);
  
  const periodProfit = periodSales.reduce((sum, s) => sum + calculateSaleProfit(s), 0);
  const periodRefunds = recentSales.reduce((sum, s) => sum + (s.refunded_amount || 0), 0);
  const avgBillValue = periodSalesCount > 0 ? periodRevenue / periodSalesCount : 0;
  
  const periodPurchasesTotal = purchases.reduce((sum, p) => sum + (p.total_amount || 0), 0);
  const periodPurchasesCount = purchases.length;

  const exportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    const todayStr = new Date().toISOString().split('T')[0];
    let filename = `report_${activeTab}_${todayStr}.csv`;

    if (activeTab === 'inventory') {
      csvContent += "Type,Medicine,Brand Name,Batch,Expiry/Stock,Status\n";
      lowStock.forEach(p => {
        csvContent += `Low Stock,"${p.name}","${p.brand_name || ''}","${p.batch || ''}",${p.stock},Needs Replenishment\n`;
      });
      expiryAlerts.expired.forEach(p => {
        csvContent += `Expired,"${p.name}","${p.brand_name || ''}","${p.batch || ''}",${p.expiry},Expired\n`;
      });
      expiryAlerts.expiring.forEach(p => {
        csvContent += `Expiring,"${p.name}","${p.brand_name || ''}","${p.batch || ''}",${p.expiry},Expiring soon\n`;
      });
    } else if (activeTab === 'purchases') {
      csvContent += "Invoice No,Supplier Name,Purchase Date,Total Amount,GST Total,Net Amount,Payment Status\n";
      purchases.forEach(p => {
        csvContent += `"${p.invoice_no || ''}","${p.supplier_name || ''}","${new Date(p.purchase_date).toLocaleDateString()}",${p.total_amount},${p.gst_total},${p.net_amount},"${p.payment_status || ''}"\n`;
      });
    } else if (activeTab === 'sales') {
      csvContent += "Bill No,Customer Name,Date,Payment Status,Total Amount,Refunded Amount,Net Profit\n";
      recentSales.forEach(s => {
        const profit = calculateSaleProfit(s);
        csvContent += `"${s.id.toString().padStart(5, '0')}","${s.customer_name || 'Walk-in'}","${new Date(s.created_at).toLocaleString()}","${s.payment_status || ''}",${s.total_amount},${s.refunded_amount},${profit.toFixed(2)}\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const printReport = () => {
    window.print();
  };

  if (loading) return (
    <div className="h-[calc(100vh-120px)] flex flex-col items-center justify-center" style={{ color: 'var(--text-muted)' }}>
      <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
      <p className="font-bold">Generating Analytics Reports...</p>
    </div>
  );

  const { from: activeFrom, to: activeTo } = getDates();
  const dateRangeStr = activeFrom && activeTo 
    ? `${new Date(activeFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} to ${new Date(activeTo).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : 'All Time';

  const statCards = [
    { label: 'Total Inventory Value', value: fmtAmt(stats?.totalValuation).split('.')[0], sub: 'Current Stock Valuation', icon: IndianRupee, bg: 'rgba(99,102,241,0.10)', color: '#818CF8', BgIcon: PieChart },
    { label: 'Period Revenue', value: fmtAmt(periodRevenue).split('.')[0], sub: `${periodSalesCount} Sales Invoices in Period`, icon: TrendingUp, bg: 'rgba(16,185,129,0.10)', color: '#34D399', BgIcon: Activity },
    { label: 'Low Stock Batches', value: `${lowStock.length} Items`, sub: 'Needs Replenishment Soon', icon: Package, bg: 'rgba(249,115,22,0.10)', color: '#FB923C', BgIcon: Layers },
    { label: 'Expiry Alerts', value: `${expiryAlerts.expired.length + expiryAlerts.expiring.length} Warning`, sub: `${expiryAlerts.expired.length} Expired • ${expiryAlerts.expiring.length} Near`, icon: Clock, bg: 'rgba(239,68,68,0.10)', color: '#F87171', BgIcon: AlertTriangle },
  ];

  return (
    <>
      {/* Interactive Reports View */}
      <div className="h-[calc(100vh-80px)] overflow-hidden flex flex-col p-4 no-print" style={{ background: 'var(--bg)' }}>
        {/* Header */}
        <div className="flex justify-between items-end mb-4 flex-shrink-0">
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

        {/* Date Filter Control Bar */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between p-4 mb-4 rounded-2xl flex-shrink-0" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 flex-wrap flex-1">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <Calendar className="w-4 h-4 text-indigo-500 flex-shrink-0" />
              <select
                value={dateRange}
                onChange={e => setDateRange(e.target.value)}
                className="text-sm font-semibold bg-transparent outline-none cursor-pointer"
                style={{ color: 'var(--text)', border: 'none' }}>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="last7">Last 7 Days</option>
                <option value="this_month">This Month</option>
                <option value="last_month">Last Month</option>
                <option value="this_fy">This Financial Year</option>
                <option value="month_year">Specific Month/Year</option>
                <option value="custom">Custom Range</option>
                <option value="all">All Time</option>
              </select>
            </div>

            {/* Custom Range Selection */}
            {dateRange === 'custom' && (
              <div className="flex items-center gap-2 text-sm">
                <input type="date" value={customDates.from}
                  onChange={e => setCustomDates(p => ({ ...p, from: e.target.value }))}
                  className="px-2 py-1.5 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                <span className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>→</span>
                <input type="date" value={customDates.to}
                  onChange={e => setCustomDates(p => ({ ...p, to: e.target.value }))}
                  className="px-2 py-1.5 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
            )}

            {/* Specific Month/Year Picker */}
            {dateRange === 'month_year' && (
              <div className="flex items-center gap-2 text-sm">
                <select value={selectedMonth}
                  onChange={e => setSelectedMonth(Number(e.target.value))}
                  className="px-2 py-1.5 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, idx) => (
                    <option key={idx} value={idx}>{m}</option>
                  ))}
                </select>
                <select value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="px-2 py-1.5 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  {[2024, 2025, 2026, 2027, 2028].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            )}

            {/* active range subtitle */}
            <span className="text-xs font-bold px-3 py-1.5 rounded-xl border border-indigo-500/10 text-indigo-500 bg-indigo-500/5">
              Showing: {dateRangeStr}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button onClick={exportCSV} className="btn-outlined py-1.5 px-4 text-xs font-bold rounded-xl flex items-center gap-2" style={{ border: '1.5px solid var(--border)' }}>
              Export CSV
            </button>
            <button onClick={printReport} className="btn-primary py-1.5 px-4 text-xs font-bold rounded-xl flex items-center gap-2" style={{ border: 'none' }}>
              Print/Save PDF
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-4 gap-4 mb-4 flex-shrink-0">
          {statCards.map((card, i) => (
            <div key={i} className="p-4 rounded-2xl relative overflow-hidden group transition-all" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex justify-between items-start mb-2 relative z-10">
                <div className="p-2 rounded-xl" style={{ background: card.bg, color: card.color }}>
                  <card.icon size={18} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ color: card.color, background: card.bg }}>
                  {card.label}
                </span>
              </div>
              <div className="relative z-10">
                <div className="text-xl font-black" style={{ color: 'var(--text)' }}>{card.value}</div>
                <p className="text-[9px] font-bold mt-1 uppercase tracking-tight" style={{ color: 'var(--text-light)' }}>{card.sub}</p>
              </div>
              <card.BgIcon className="absolute -right-4 -bottom-4 w-20 h-20 opacity-5" />
            </div>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 rounded-3xl shadow-sm overflow-hidden flex flex-col min-h-0 animate-fade-in" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

          {/* Inventory Tab */}
          {activeTab === 'inventory' && (
            <div className="flex-1 flex overflow-hidden">
              {/* Low Stock */}
              <div className="flex-1 flex flex-col overflow-hidden" style={{ borderRight: '1px solid var(--border)' }}>
                <div className="px-6 py-4 flex justify-between items-center" style={{ background: 'rgba(249,115,22,0.04)', borderBottom: '1px solid var(--border)' }}>
                  <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-orange-500">
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
                <div className="px-6 py-4 flex justify-between items-center" style={{ background: 'rgba(239,68,68,0.04)', borderBottom: '1px solid var(--border)' }}>
                  <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-red-500">
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
              <div className="px-6 py-4 flex items-center justify-between" style={{ background: 'rgba(99,102,241,0.04)', borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-indigo-500">
                  <Truck size={14} /> Stock Purchase Log ({purchases.length} Records)
                </div>
                <div className="text-xs font-bold text-slate-500">Total Purchase: <span className="font-black text-indigo-600">{fmtAmt(periodPurchasesTotal)}</span></div>
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
              <div className="grid grid-cols-3 gap-6 p-6 flex-shrink-0" style={{ background: 'rgba(99,102,241,0.02)', borderBottom: '1px solid var(--border)' }}>
                <div className="flex flex-col items-center p-4 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="text-[10px] font-black uppercase text-[#818CF8] mb-1">Period Net Profit</div>
                  <div className="text-xl font-black" style={{ color: 'var(--text)' }}>{fmtAmt(periodProfit)}</div>
                </div>
                <div className="flex flex-col items-center p-4 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="text-[10px] font-black uppercase text-amber-500 mb-1">Period Refunds</div>
                  <div className="text-xl font-black" style={{ color: 'var(--text)' }}>{fmtAmt(periodRefunds)}</div>
                </div>
                <div className="flex flex-col items-center p-4 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="text-[10px] font-black uppercase text-emerald-500 mb-1">Avg. Bill Value</div>
                  <div className="text-xl font-black" style={{ color: 'var(--text)' }}>{fmtAmt(avgBillValue)}</div>
                </div>
              </div>

              {/* Sales Ledger */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-6 py-4 flex justify-between items-center" style={{ borderBottom: '1px solid var(--border)' }}>
                  <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                    <Activity size={14} className="text-emerald-500" /> Sales Ledger
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400">{recentSales.length} Transactions in Period</span>
                </div>
                <div className="overflow-y-auto flex-1 p-4">
                  <div className="grid grid-cols-1 gap-3">
                    {recentSales.map(sale => {
                      const profitAmt = calculateSaleProfit(sale);
                      return (
                        <div key={sale.id} className="rounded-2xl p-4 flex justify-between items-center transition-all hover:translate-x-1"
                          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                          <div className="flex items-center gap-4">
                            <div className="p-2.5 rounded-xl text-emerald-600" style={{ background: 'rgba(16,185,129,0.1)' }}>
                              <Receipt size={18} />
                            </div>
                            <div>
                              <div className="font-black text-sm" style={{ color: 'var(--text)' }}>#{sale.id.toString().padStart(5, '0')}</div>
                              <div className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
                                {sale.customer_name || 'Walk-in'} • {new Date(sale.created_at).toLocaleString()}
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
                                <div className="text-sm font-black text-amber-500">-{fmtAmt(sale.refunded_amount).replace('₹', '')}</div>
                              </div>
                            )}
                            <div className="text-right">
                              <div className="text-[9px] font-bold uppercase text-[#818CF8]">Net Profit</div>
                              <div className="text-sm font-black text-emerald-500">₹{profitAmt.toFixed(2)}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[9px] font-bold uppercase" style={{ color: 'var(--text-light)' }}>Payment</div>
                              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${sale.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                {sale.payment_status}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Print PDF Report Layout */}
      <div className="print-only" style={{ display: 'none', padding: '30px 40px', color: '#000', background: '#fff', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000', paddingBottom: 15, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>{storeSettings.pharmacy_name || 'MY PHARMACY STORE'}</h1>
            <p style={{ fontSize: 12, margin: '4px 0', color: '#333' }}>{storeSettings.pharmacy_address || ''}</p>
            {storeSettings.pharmacy_phone && <p style={{ fontSize: 12, margin: '2px 0' }}>Ph: {storeSettings.pharmacy_phone}</p>}
            {storeSettings.drug_license_no && <p style={{ fontSize: 11, margin: '2px 0' }}>D.L.No: {storeSettings.drug_license_no}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0, color: '#4F46E5' }}>GST FILING REPORT</h2>
            <p style={{ fontSize: 12, margin: '4px 0 0', fontWeight: 'bold' }}>Section: {activeTab === 'inventory' ? 'Inventory Valuation & Expiry' : activeTab === 'purchases' ? 'Purchase Ledger' : 'Sales & Profits Ledger'}</p>
            <p style={{ fontSize: 12, margin: '2px 0 0' }}><b>Period:</b> {dateRangeStr}</p>
            {storeSettings.gst_no && <p style={{ fontSize: 12, margin: '4px 0 0' }}><b>GSTIN:</b> {storeSettings.gst_no}</p>}
          </div>
        </div>

        {/* Summary metrics for print */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 15, marginBottom: 25, padding: 15, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Period Revenue</div>
            <div style={{ fontSize: 18, fontWeight: '900', marginTop: 4 }}>{fmtAmt(periodRevenue)}</div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{periodSalesCount} Invoices</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Period Profit</div>
            <div style={{ fontSize: 18, fontWeight: '900', marginTop: 4 }}>{fmtAmt(periodProfit)}</div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Margin: {periodRevenue > 0 ? ((periodProfit / periodRevenue) * 100).toFixed(1) : 0}%</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Total Refunds</div>
            <div style={{ fontSize: 18, fontWeight: '900', marginTop: 4 }}>{fmtAmt(periodRefunds)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Period Purchases</div>
            <div style={{ fontSize: 18, fontWeight: '900', marginTop: 4 }}>{fmtAmt(periodPurchasesTotal)}</div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{periodPurchasesCount} Purchase Bills</div>
          </div>
        </div>

        {/* Tables */}
        {activeTab === 'inventory' && (
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 900, borderBottom: '1.5px solid #000', paddingBottom: 6, marginBottom: 12 }}>LOW STOCK & EXPIRED ITEMS</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 'bold' }}>Type</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 'bold' }}>Medicine Name</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 'bold' }}>Brand</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold' }}>Batch</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold' }}>Expiry/Stock</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((p, idx) => (
                  <tr key={`ls-${idx}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '6px 8px', color: '#ea580c', fontWeight: 'bold' }}>Low Stock</td>
                    <td style={{ padding: '6px 8px' }}>{p.name}</td>
                    <td style={{ padding: '6px 8px' }}>{p.brand_name || '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{p.batch || '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold' }}>{p.stock} Units</td>
                  </tr>
                ))}
                {expiryAlerts.expired.map((p, idx) => (
                  <tr key={`ex-${idx}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '6px 8px', color: '#dc2626', fontWeight: 'bold' }}>Expired</td>
                    <td style={{ padding: '6px 8px' }}>{p.name}</td>
                    <td style={{ padding: '6px 8px' }}>{p.brand_name || '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{p.batch || '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', color: '#dc2626' }}>{p.expiry} ({p.stock} Units)</td>
                  </tr>
                ))}
                {expiryAlerts.expiring.map((p, idx) => (
                  <tr key={`exp-${idx}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '6px 8px', color: '#d97706', fontWeight: 'bold' }}>Expiring</td>
                    <td style={{ padding: '6px 8px' }}>{p.name}</td>
                    <td style={{ padding: '6px 8px' }}>{p.brand_name || '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{p.batch || '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', color: '#d97706' }}>{p.expiry} ({p.stock} Units)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'purchases' && (
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 900, borderBottom: '1.5px solid #000', paddingBottom: 6, marginBottom: 12 }}>STOCK PURCHASE LEDGER</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 'bold' }}>Invoice No</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 'bold' }}>Supplier Name</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold' }}>Purchase Date</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>Total Amount</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>GST Total</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p, idx) => (
                  <tr key={`pur-${idx}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>#{p.invoice_no}</td>
                    <td style={{ padding: '6px 8px' }}>{p.supplier_name}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{new Date(p.purchase_date).toLocaleDateString()}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtAmt(p.total_amount)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtAmt(p.gst_total)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{p.payment_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'sales' && (
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 900, borderBottom: '1.5px solid #000', paddingBottom: 6, marginBottom: 12 }}>SALES & PROFITS LEDGER</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 'bold' }}>Bill No</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 'bold' }}>Customer/Patient</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold' }}>Date & Time</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 'bold' }}>Payment Mode</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>Total Amount</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>Refunded</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>Net Profit</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map((s, idx) => {
                  const sProfit = calculateSaleProfit(s);
                  return (
                    <tr key={`sal-${idx}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>#{s.id.toString().padStart(5, '0')}</td>
                      <td style={{ padding: '6px 8px' }}>{s.customer_name || 'Walk-in'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>{new Date(s.created_at).toLocaleString()}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', textTransform: 'capitalize' }}>{s.payment_status}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtAmt(s.total_amount)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: s.refunded_amount > 0 ? '#dc2626' : 'inherit' }}>{s.refunded_amount > 0 ? fmtAmt(s.refunded_amount) : '—'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', color: sProfit >= 0 ? '#16a34a' : '#dc2626' }}>{fmtAmt(sProfit)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Signature Box */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 60, fontSize: 11 }}>
          <div>
            <p>Report Generated: {new Date().toLocaleString()}</p>
            <p style={{ fontStyle: 'italic', color: '#64748b' }}>Pharmiq Pharmacy Management Systems</p>
          </div>
          <div style={{ textAlign: 'right', minWidth: 160 }}>
            <div style={{ borderBottom: '1.5px solid #000', height: 40, marginBottom: 6 }}></div>
            <p style={{ fontWeight: 'bold', margin: 0 }}>Authorized Signatory</p>
          </div>
        </div>
      </div>
    </>
  );
}
