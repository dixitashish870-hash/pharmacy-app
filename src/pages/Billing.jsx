import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';
import Fuse from 'fuse.js';
import { useLocation } from 'react-router-dom';
import { buildCartItem, recomputeItem, computeBillTotals, fmt2 } from '../utils/gstEngine';
import { useAuth } from '../context/AuthContext';
import ReceiptPrinter from '../components/ReceiptPrinter';
import BottomBillSummaryPanel from '../components/BottomBillSummaryPanel';
import {
  Search, Mic, Plus, Minus, Trash2, ShoppingCart, Printer,
  User, Stethoscope, Zap, TrendingUp, RefreshCw, FileText,
  IndianRupee, CreditCard, Wifi, Banknote, Pause, Play, X, ChevronRight,
  AlertTriangle, Check, Package, History, Clock, ReceiptText, Users, Bell,
  ClipboardList, Save, CheckCircle2, AlertCircle, Sparkles, Command
} from 'lucide-react';

/* ── helpers ── */
const fmt = (n) => parseFloat(n || 0).toFixed(2);
const fmtIN = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortMonth = (ym) => { // "2025-06" → "Jun'25"
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1]}'${y.slice(2)}`;
};
const expiryStatus = (exp) => {
  if (!exp) return null;
  const diff = (new Date(exp + '-01') - new Date()) / 86400000;
  if (diff < 0) return 'expired';
  if (diff <= 90) return 'expiring';
  return 'ok';
};

/* ── AI suggestion seeds (static demo) ── */
const SUGGEST_TEMPLATES = [
  { label: 'Consider Pantoprazole', reason: 'Common co-prescription with antibiotics', type: 'cross-sell' },
  { label: 'Generic available', reason: 'Save up to 40% with generic equivalent', type: 'substitute' },
  { label: 'ORS + Zinc', reason: 'Frequently bought together', type: 'cross-sell' },
];



export default function Billing() {
  const { user } = useAuth();
  const location = useLocation();

  /* ── state ── */
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [cart, setCart] = useState(() => {
    try { const saved = sessionStorage.getItem('pos_cart'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Customer / prescriber
  const [selectedCustomer, setSelectedCustomer] = useState(() => {
    try { const saved = sessionStorage.getItem('pos_customer'); return saved ? JSON.parse(saved) : null; } catch { return null; }
  });
  const [customerSearch, setCustomerSearch] = useState('');
  const [prescriberName, setPrescriberName] = useState(() => sessionStorage.getItem('pos_prescriber') || '');

  // Patient Modal
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [patientModalPhone, setPatientModalPhone] = useState('');
  const [patientModalMode, setPatientModalMode] = useState('search'); // 'search' | 'found' | 'new'
  const [patientModalMatches, setPatientModalMatches] = useState([]);
  const [patientModalNew, setPatientModalNew] = useState({ name: '', age: '', gender: 'Male', reference: '' });
  const [patientModalSaving, setPatientModalSaving] = useState(false);

  // Billing
  const [billDiscountAmt, setBillDiscountAmt] = useState(() => Number(sessionStorage.getItem('pos_discount') || 0));
  const [payments, setPayments] = useState(() => {
    try { const saved = sessionStorage.getItem('pos_payment'); return saved ? JSON.parse(saved) : [{ method: 'cash', amount: 0 }]; } catch { return [{ method: 'cash', amount: 0 }]; }
  });
  const [splitMode, setSplitMode] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [isHold, setIsHold] = useState(false);
  const [heldCarts, setHeldCarts] = useState([]);
  const [showRecallModal, setShowRecallModal] = useState(false);
  const [lastSale, setLastSale] = useState(null);

  // Insights
  const [stats, setStats] = useState({ todayRevenue: 0, todaySales: 0, todayProft: 0, totalProducts: 0, lowStock: 0, totalCustomers: 0 });
  const [gstType, setGstType] = useState('cgst_sgst'); // 'cgst_sgst' | 'igst'
  const [expiryAlerts, setExpiryAlerts] = useState({ expiring: [], expired: [] });
  const totalAlerts = (expiryAlerts.expiring?.length || 0) + (expiryAlerts.expired?.length || 0);
  const [showAlertsModal, setShowAlertsModal] = useState(false);
  const [billSearch, setBillSearch] = useState('');
  const [showBillHistory, setShowBillHistory] = useState(false);
  const [billHistory, setBillHistory] = useState([]);
  const [billHistoryLoading, setBillHistoryLoading] = useState(false);

  // Draft Bill state
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draftTab, setDraftTab] = useState('create'); // 'create' | 'pending'
  const [draftBills, setDraftBills] = useState([]);
  const [draftBillsLoading, setDraftBillsLoading] = useState(false);
  const [draftItems, setDraftItems] = useState([{ name: '', quantity: 1, price: 0, gst: 0, mrp: 0 }]);
  const [draftNotes, setDraftNotes] = useState('');
  const [draftSaving, setDraftSaving] = useState(false);
  const [completingDraftId, setCompletingDraftId] = useState(null);
  const [draftCompleteError, setDraftCompleteError] = useState(null); // { id, missing[] }
  const [draftPatient, setDraftPatient] = useState({ phone: '', name: '', age: '', gender: 'Male', reference: '' });
  const [draftPrescriber, setDraftPrescriber] = useState({ doctor: '', date: '' });
  const [draftPaymentMode, setDraftPaymentMode] = useState('cash');

  const getCurrentDate = () => {
    return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const [patient, setPatient] = useState(() => {
    try { const saved = sessionStorage.getItem('pos_patient'); return saved ? JSON.parse(saved) : { phone: '', name: '', age: '', gender: 'Male', reference: '' }; } catch { return { phone: '', name: '', age: '', gender: 'Male', reference: '' }; }
  });
  const [prescription, setPrescription] = useState(() => {
    try { const saved = sessionStorage.getItem('pos_prescription'); return saved ? JSON.parse(saved) : { doctor: '', date: getCurrentDate() }; } catch { return { doctor: '', date: getCurrentDate() }; }
  });

  // Persist POS state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('pos_cart', JSON.stringify(cart));
    sessionStorage.setItem('pos_customer', JSON.stringify(selectedCustomer));
    sessionStorage.setItem('pos_prescriber', prescriberName);
    sessionStorage.setItem('pos_discount', billDiscountAmt);
    sessionStorage.setItem('pos_payment', JSON.stringify(payments));
    sessionStorage.setItem('pos_patient', JSON.stringify(patient));
    sessionStorage.setItem('pos_prescription', JSON.stringify(prescription));
  }, [cart, selectedCustomer, prescriberName, billDiscountAmt, payments, patient, prescription]);

  const searchRef = useRef(null);
  const phoneRef = useRef(null);

  /* ── fetch ── */
  useEffect(() => {
    // Single combined endpoint — gets products + customers + stats in 1 round trip
    Promise.all([
      axios.get(`${API_BASE}/api/pos-init`),
      axios.get(`${API_BASE}/api/products/expiring`),
    ]).then(([posRes, expiryRes]) => {
      const data = posRes.data;
      const inventory = data.products;
      if (inventory && inventory.length > 0) {
        setProducts(inventory);
      } else {
        setProducts([]);
      }
      setCustomers(data.customers || []);
      setStats(data.stats || { todayRevenue: 0, todaySales: 0, todayProfit: 0, totalProducts: 0, lowStock: 0, totalCustomers: 0 });
      setExpiryAlerts(expiryRes.data || { expiring: [], expired: [] });
      if (data.settings?.gst_type) setGstType(data.settings.gst_type);
    }).catch((e) => {
      console.error(e);
      setProducts([]);
    }).finally(() => setLoading(false));

    // auto-focus search
    setTimeout(() => searchRef.current?.focus(), 300);

    // Global keyboard shortcuts
    const onKey = (e) => {
      if (e.ctrlKey && e.key === 'd') { e.preventDefault(); phoneRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fetchProducts = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/api/products`);
      if (data && data.length > 0) {
        setProducts(data);
      } else {
        setProducts([]);
      }
    } catch (e) {
      console.error(e);
      setProducts([]);
    }
  };

  useEffect(() => {
    if (location.state?.loadBillItems && products.length > 0) {
      const { loadBillItems, customer_id } = location.state;
      const newCart = loadBillItems.map(item => {
        const prod = products.find(p => p.id === item.product_id);
        const stock = prod ? prod.stock : 999;
        const gst_amount = item.price * (item.gst / 100);
        return { ...item, stock, gst_amount, isNew: true };
      });
      setCart(newCart);

      if (customer_id && customers.length > 0) {
        const match = customers.find(c => c.id === customer_id);
        if (match) {
          setSelectedCustomer(match);
          setPatient(prev => ({ ...prev, phone: match.phone || '', name: match.name || '' }));
        }
      }

      // Clear state to prevent loop
      window.history.replaceState({}, document.title);
    }
  }, [location.state, products, customers]);

  /* ── fuzzy search ── */
  const fuse = useMemo(() => new Fuse(products, {
    keys: ['name', 'brand_name', 'salt_composition', 'sku'],
    threshold: 0.35,
  }), [products]);

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const results = fuse.search(searchTerm).map(r => r.item).slice(0, 12);
    // Sort: in-stock first, out-of-stock at bottom
    return [...results].sort((a, b) => (b.stock > 0 ? 1 : 0) - (a.stock > 0 ? 1 : 0));
  }, [searchTerm, fuse]);

  const customerFuse = useMemo(() => new Fuse(customers, { keys: ['name', 'phone'], threshold: 0.3 }), [customers]);
  // eslint-disable-next-line no-unused-vars
  const filteredCustomers = customerSearch ? customerFuse.search(customerSearch).map(r => r.item) : customers;

  const filteredBillHistory = useMemo(() => {
    if (!billSearch.trim()) return billHistory;
    const q = billSearch.toLowerCase();
    return billHistory.filter(b =>
      (b.customer_name || '').toLowerCase().includes(q) ||
      (b.customer_phone || '').toLowerCase().includes(q) ||
      (b.prescriber_name || '').toLowerCase().includes(q) ||
      (b.item_names || '').toLowerCase().includes(q) ||
      (b.id || '').toString().includes(q)
    );
  }, [billHistory, billSearch]);

  /* ── cart ops ── */
  const addToCart = useCallback((product) => {
    if (product.stock <= 0) return alert('Out of stock');
    setCart(prev => {
      const ex = prev.find(i => i.product_id === product.id);
      if (ex) {
        if (ex.quantity >= product.stock) return prev;
        return prev.map(i =>
          i.product_id === product.id
            ? recomputeItem({ ...i, quantity: i.quantity + 1, isNew: false })
            : i
        );
      }
      return [...prev, buildCartItem(product)];
    });
    setSearchTerm('');
    setShowDropdown(false);
    setTimeout(() => searchRef.current?.focus(), 50);
  }, []);

  const removeFromCart = (pid) => setCart(prev => prev.filter(i => i.product_id !== pid));

  const updateQty = (pid, delta) => setCart(prev => prev.map(i =>
    i.product_id === pid
      ? recomputeItem({ ...i, quantity: Math.max(1, Math.min(i.stock, i.quantity + delta)), isNew: false })
      : i
  ));

  const updateItemDiscount = (pid, val) => setCart(prev => prev.map(i =>
    i.product_id === pid
      ? recomputeItem({ ...i, discount_pct: Math.min(100, Math.max(0, Number(val))) })
      : i
  ));

  // Allow editing qty directly in table input
  const setItemQty = (pid, qty) => setCart(prev => prev.map(i =>
    i.product_id === pid
      ? recomputeItem({ ...i, quantity: Math.max(1, Math.min(i.stock, qty)), isNew: false })
      : i
  ));

  /* ── computed totals via GST engine ── */
  const billTotals = useMemo(
    () => computeBillTotals(cart, Number(billDiscountAmt) || 0),
    [cart, billDiscountAmt]
  );

  const {
    grossMrp: mrpTotal,
    totalDiscount: discountAmount,
    itemDiscountTotal,
    taxableTotal: taxableAmount,
    cgstTotal,
    sgstTotal,
    gstTotal,
    roundOff: roundedAmt,
    netPayable: totalAmount,
    profit,
    gstSlabs,
  } = billTotals;

  const savingsPct = mrpTotal > 0 ? ((mrpTotal - totalAmount) / mrpTotal * 100).toFixed(1) : 0;

  const typeTotals = cart.reduce((acc, i) => {
    const t = i.item_type || 'PHARMA';
    acc[t] = (acc[t] || 0) + i.finalAmt;
    return acc;
  }, { DONATION: 0, PHARMA: 0, FMCG: 0, PL: 0, GENERIC: 0 });

  const warnings = {
    lowStock: cart.filter(i => i.stock <= i.quantity).length,
    expiring: cart.filter(i => {
      if (!i.expiry) return false;
      const parts = i.expiry.split('/');
      if (parts.length !== 2) return false;
      const [mm, yy] = parts;
      const expDate = new Date(`20${yy}-${mm}-01`);
      const diff = expDate - new Date();
      return diff > 0 && diff < 90 * 24 * 60 * 60 * 1000;
    }).length,
    scheduleH: cart.some(i => i.schedule_category === 'H' || (i.name && i.name.toUpperCase().includes('RX')) || (i.category && i.category.toUpperCase().includes('SCHEDULE')))
  };

  /* ── checkout ── */
  const handleCheckout = async () => {
    if (!patient.name?.trim() || !patient.phone?.trim()) {
      alert('Please fill patient name and phone before completing the bill.');
      return;
    }
    if (cart.length === 0) return;

    // Determine primary method for backwards-compat checks
    const hasCreditSplit = payments.some(p => p.method === 'credit');
    if (hasCreditSplit && !selectedCustomer) return alert('Select a customer for credit/udhaar');

    // In split mode, validate amounts balance
    if (splitMode && payments.length > 1) {
      const splitSum = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const diff = Math.abs(splitSum - totalAmount);
      if (diff > 0.01) {
        alert(`Split amounts (₹${splitSum.toFixed(2)}) don't match bill total (₹${totalAmount.toFixed(2)}). Difference: ₹${diff.toFixed(2)}`);
        return;
      }
    }

    // Negative margin warning (non-blocking)
    if (profit < 0) {
      const ok = window.confirm(`⚠️ Selling below purchase cost! Estimated loss: ₹${fmt(Math.abs(profit))}. Proceed?`);
      if (!ok) return;
    }

    setCheckoutLoading(true);
    try {
      // Build payment_details — auto-fill amount for single payment
      const paymentDetails = payments.map(p => ({
        method: p.method,
        amount: splitMode && payments.length > 1 ? Number(p.amount) || 0 : totalAmount,
      }));
      const primaryMethod = payments[0]?.method || 'cash';

      const saleData = {
        user_id: user.id,
        customer_id: selectedCustomer?.id || null,
        prescriber_name: prescriberName || null,
        payment_status: primaryMethod === 'credit' ? 'credit' : 'paid',
        payment_details: paymentDetails,
        // Corrected GST-inclusive values:
        subtotal: taxableAmount,          // taxable (pre-GST) amount
        gst_total: gstTotal,               // total GST extracted
        discount_total: discountAmount,
        total_amount: totalAmount,            // MRP-based net payable
        items: cart.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
          price: i.mrp_per_unit,        // store MRP per unit as price
          mrp: i.mrp_per_unit,
          gst: i.gst,
          discount: i.discount_pct,
          purchase_price: i.purchase_price,
        }))
      };
      const res = await axios.post(`${API_BASE}/api/sales`, saleData);
      setLastSale({
        ...saleData,
        id: res.data.saleId,
        date: new Date().toLocaleString(),
        items: cart,
        customer: selectedCustomer,
        gstType,
        billTotals,
      });
      resetBill();
      fetchProducts();
      axios.get(`${API_BASE}/api/stats`).then(r => setStats(r.data)).catch(() => { });
    } catch (e) { alert('Checkout failed: ' + e.message); }
    setCheckoutLoading(false);
  };

  const resetBill = () => {
    setCart([]); setBillDiscountAmt(0); setPayments([{ method: 'cash', amount: 0 }]); setSplitMode(false);
    setPrescriberName(''); setSelectedCustomer(null); setIsHold(false);
    setPatient({ phone: '', name: '', age: '', gender: 'Male', reference: '' });
    setPrescription({ doctor: '', date: getCurrentDate() });
    setCustomerSearch('');
    // Clear persisted POS session so next bill starts fresh
    ['pos_cart', 'pos_customer', 'pos_prescriber', 'pos_discount', 'pos_payment', 'pos_patient', 'pos_prescription']
      .forEach(k => sessionStorage.removeItem(k));
  };

  const holdBill = () => {
    if (cart.length === 0) return;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setHeldCarts(prev => [...prev, {
      cart,
      billDiscountAmt,
      selectedCustomer,
      prescriberName,
      patient: { ...patient },
      prescription: { ...prescription },
      payments: [...payments],
      splitMode,
      time
    }]);
    resetBill();
    setIsHold(false);
  };

  const recallSpecificBill = (index) => {
    if (cart.length > 0) {
      if (!window.confirm("Current bill has items. Recalling a held bill will overwrite it. Proceed?")) return;
    }
    const target = heldCarts[index];
    setCart(target.cart);
    setBillDiscountAmt(target.billDiscountAmt);
    setSelectedCustomer(target.selectedCustomer);
    setPrescriberName(target.prescriberName);
    if (target.patient) setPatient(target.patient);
    if (target.prescription) setPrescription(target.prescription);
    if (target.payments) { setPayments(target.payments); setSplitMode(target.splitMode || false); }
    setHeldCarts(prev => prev.filter((_, i) => i !== index));
    setShowRecallModal(false);
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert('Voice search not supported in this browser');
    const r = new SR(); r.lang = 'en-IN';
    r.onresult = e => { setSearchTerm(e.results[0][0].transcript); setShowDropdown(true); };
    r.start();
  };

  /* ── Draft Bill helpers ── */
  const fetchDraftBills = async () => {
    setDraftBillsLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/api/draft-bills`);
      setDraftBills(data || []);
    } catch { setDraftBills([]); }
    finally { setDraftBillsLoading(false); }
  };

  const openDraftModal = (tab = 'create') => {
    setDraftTab(tab);
    setDraftCompleteError(null);
    // Pre-fill from current POS form state
    setDraftPatient({ phone: patient.phone || '', name: patient.name || '', gender: patient.gender || 'Male', reference: patient.reference || '' });
    setDraftPrescriber({ doctor: prescriberName || prescription.doctor || '', date: prescription.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) });
    setDraftPaymentMode(payments[0]?.method || 'cash');
    if (tab === 'pending') fetchDraftBills();
    setShowDraftModal(true);
  };

  const saveDraft = async () => {
    const validItems = draftItems.filter(i => i.name.trim());
    if (!draftPatient.name?.trim() || !draftPatient.phone?.trim()) {
      return alert('Please fill patient name and phone number.');
    }
    if (validItems.length === 0) return alert('Add at least one medicine to the draft.');
    setDraftSaving(true);
    try {
      const estimated_total = validItems.reduce((s, i) => s + (parseFloat(i.price) || 0) * (parseInt(i.quantity) || 1), 0);
      await axios.post(`${API_BASE}/api/draft-bills`, {
        patient_name: draftPatient.name, patient_phone: draftPatient.phone,
        patient_gender: draftPatient.gender, patient_reference: draftPatient.reference,
        prescriber_name: draftPrescriber.doctor, payment_mode: draftPaymentMode,
        customer_id: selectedCustomer?.id || null,
        notes: draftNotes, items: validItems, estimated_total,
      });
      setDraftItems([{ name: '', quantity: 1, price: 0, gst: 0, mrp: 0 }]);
      setDraftNotes('');
      setDraftTab('pending');
      fetchDraftBills();
    } catch (e) { alert('Failed to save draft: ' + (e.response?.data?.error || e.message)); }
    finally { setDraftSaving(false); }
  };

  const completeDraft = async (draftId) => {
    setCompletingDraftId(draftId);
    setDraftCompleteError(null);
    try {
      const { data } = await axios.post(`${API_BASE}/api/draft-bills/${draftId}/complete`, { user_id: user.id });
      setDraftBills(prev => prev.filter(d => d.id !== draftId));
      fetchProducts();
      axios.get(`${API_BASE}/api/stats`).then(r => setStats(r.data)).catch(() => { });
      alert(`✅ Draft completed! Sale #${data.saleId} — ₹${parseFloat(data.totalAmount).toFixed(2)}`);
    } catch (e) {
      if (e.response?.status === 409) {
        setDraftCompleteError({ id: draftId, missing: e.response.data.missing });
      } else {
        alert('Failed to complete draft: ' + (e.response?.data?.error || e.message));
      }
    } finally { setCompletingDraftId(null); }
  };

  const discardDraft = async (draftId) => {
    if (!window.confirm('Discard this draft bill? This cannot be undone.')) return;
    try {
      await axios.delete(`${API_BASE}/api/draft-bills/${draftId}`);
      setDraftBills(prev => prev.filter(d => d.id !== draftId));
      if (draftCompleteError?.id === draftId) setDraftCompleteError(null);
    } catch (e) { alert('Failed to discard: ' + e.message); }
  };

  const updateDraftItem = (idx, field, value) => {
    setDraftItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  /* ── render helpers ── */
  const ExpiryBadge = ({ exp }) => {
    const s = expiryStatus(exp);
    if (!s || s === 'ok') return exp ? <span className="badge badge-green">{shortMonth(exp)}</span> : <span className="badge badge-gray">—</span>;
    if (s === 'expiring') return <span className="badge badge-yellow" style={{ gap: 3, display: 'inline-flex' }}><AlertTriangle size={10} />{shortMonth(exp)}</span>;
    return <span className="badge badge-red" style={{ gap: 3, display: 'inline-flex' }}><AlertTriangle size={10} />EXPIRED</span>;
  };

  // ── Enter Key Navigation ──────────────────────────────────────────────────
  useEffect(() => {
    const handleGlobalEnter = (e) => {
      if (e.key === 'Enter') {
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
        if (e.defaultPrevented) return;

        e.preventDefault();
        const focusable = Array.from(document.querySelectorAll('input:not([disabled]), select:not([disabled]), button:not([disabled])'))
          .filter(el => el.tabIndex !== -1 && el.offsetParent !== null);
        const index = focusable.indexOf(e.target);
        if (index > -1 && index < focusable.length - 1) {
          focusable[index + 1].focus();
        }
      }
    };
    document.addEventListener('keydown', handleGlobalEnter);
    return () => document.removeEventListener('keydown', handleGlobalEnter);
  }, []);

  if (loading) return (
    <div style={{ textAlign: 'center' }}>
      <Package size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
      <p>Loading medicines...</p>
    </div>
  );



  return (
    <>
      {/* ── 3-PANEL LAYOUT ── */}
      <div style={{
        display: 'flex', gap: 16,
        height: 'calc(100vh - var(--top-bar-h) - var(--bottom-bar-h) - 96px)',
        minHeight: 0,
      }} className="no-print">

        {/* ═══ LEFT PANEL (70%) — BILLING ZONE ═══ */}
        <div style={{ flex: '0 0 70%', display: 'flex', flexDirection: 'column', minHeight: 0, gap: 10 }}>

          {/* ── PATIENT + PRESCRIPTION — UNIFIED CONTEXT STRIP ── */}
          <div className="pos-context-strip">

            {/* ═══ PATIENT ZONE — clickable ═══ */}
            <div
              className="pos-ctx-patient"
              role="button"
              tabIndex={0}
              onClick={() => {
                setPatientModalPhone(patient.phone || '');
                setPatientModalNew({ name: patient.name || '', age: patient.age || '', gender: patient.gender || 'Male', reference: patient.reference || '' });
                setPatientModalMode(selectedCustomer ? 'found' : patient.phone ? 'search' : 'search');
                setPatientModalMatches([]);
                setShowPatientModal(true);
              }}
              onKeyDown={e => e.key === 'Enter' && setShowPatientModal(true)}
            >
              {/* Avatar */}
              <div className={`pos-ctx-avatar ${selectedCustomer ? 'filled' : patient.name ? 'walkin' : 'empty'}`}>
                {patient.name || selectedCustomer?.name
                  ? (patient.name || selectedCustomer?.name)?.[0]?.toUpperCase()
                  : <User size={16} />
                }
                {(selectedCustomer || patient.name) && (
                  <span className={`status-dot ${selectedCustomer ? 'registered' : 'walkin'}`} />
                )}
              </div>

              {/* Info block */}
              <div className="pos-ctx-info">
                {patient.name || selectedCustomer?.name ? (
                  <div className="pos-ctx-name">{patient.name || selectedCustomer?.name}</div>
                ) : (
                  <div className="pos-ctx-placeholder">
                    <span className="add-icon">+</span>
                    Add patient
                  </div>
                )}
                {(patient.phone || patient.name) && (
                  <div className="pos-ctx-meta">
                    {patient.phone && <span className="pos-ctx-chip">{patient.phone}</span>}
                    {patient.gender && <span className="pos-ctx-chip">{patient.gender}</span>}
                    {patient.age && <span className="pos-ctx-chip">{patient.age}y</span>}
                    {selectedCustomer && <span className="pos-ctx-chip registered">Registered</span>}
                    {patient.reference && <span className="pos-ctx-chip">{patient.reference}</span>}
                  </div>
                )}
              </div>
            </div>

            {/* ═══ PRESCRIPTION ZONE — inline inputs ═══ */}
            <div className="pos-ctx-rx">
              <div className={`pos-ctx-rx-icon ${prescription.doctor ? 'active' : 'inactive'}`}>
                <Stethoscope size={16} />
              </div>
              <div className="pos-ctx-rx-fields">
                <input
                  className="pos-ctx-rx-input"
                  type="text"
                  placeholder="Dr. Name"
                  value={prescription.doctor}
                  onChange={e => {
                    setPrescription({ ...prescription, doctor: e.target.value });
                    setPrescriberName(e.target.value);
                  }}
                />
                <input
                  className="pos-ctx-rx-date"
                  type="text"
                  value={prescription.date}
                  onChange={e => setPrescription({ ...prescription, date: e.target.value })}
                />
              </div>
              <span className={`pos-ctx-rx-badge ${prescription.doctor ? 'active' : 'inactive'}`}>
                {prescription.doctor ? '✓ Rx' : 'No Rx'}
              </span>
            </div>

          </div>

          {/* Search Bar + Quick Action Buttons */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div className="pos-search-wrap" style={{ position: 'relative', flex: 1 }}>
              <Search size={20} className="pos-search-icon" />
              <input
                ref={searchRef}
                type="text"
                className="pos-search-input"
                placeholder="Scan barcode or type medicine name, brand, or salt..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setShowDropdown(true); }}
                onFocus={() => { if (searchTerm.trim()) setShowDropdown(true); }}
                onBlur={() => setTimeout(() => setShowDropdown(false), 180)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && searchResults.length > 0) {
                    e.preventDefault();
                    addToCart(searchResults[0]);
                  }
                  if (e.key === 'Escape') { setSearchTerm(''); setShowDropdown(false); }
                }}
                autoComplete="off"
              />
              <button className="pos-search-mic" onClick={startVoice} title="Voice Search"><Mic size={18} /></button>

              {/* Autocomplete */}
              {showDropdown && searchResults.length > 0 && (
                <div className="autocomplete-dropdown">
                  {searchResults.map(p => {
                    const outOfStock = p.stock <= 0;
                    return (
                      <div
                        key={p.id}
                        className="autocomplete-item"
                        onMouseDown={() => !outOfStock && addToCart(p)}
                        style={outOfStock ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none', background: 'var(--surface-2)' } : {}}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {p.name}
                            {p.brand_name && <span style={{ color: 'var(--primary)', fontSize: 12 }}>({p.brand_name})</span>}
                            {outOfStock && (
                              <span style={{
                                fontSize: 10, fontWeight: 800, letterSpacing: '0.5px',
                                background: '#FEE2E2', color: '#DC2626',
                                border: '1px solid #FECACA', borderRadius: 4,
                                padding: '1px 5px',
                              }}>OUT OF STOCK</span>
                            )}
                          </div>
                          {p.salt_composition && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.salt_composition}</div>}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                          <div style={{ fontWeight: 700, color: outOfStock ? 'var(--text-muted)' : 'var(--primary)', fontSize: 14 }}>₹{fmt(p.price)}</div>
                          <ExpiryBadge exp={p.expiry} />
                          <div style={{
                            fontSize: 11, marginTop: 2, fontWeight: 600,
                            color: outOfStock ? '#DC2626' : p.stock > 10 ? 'var(--success)' : 'var(--warning)',
                          }}>
                            {outOfStock ? 'Stock: 0' : `Stock: ${p.stock}`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Clear Bill + Hold/Unhold quick buttons ── */}
            <div style={{ display: 'flex', gap: 6 }}>
              {/* Clear Bill */}
              <button
                onClick={resetBill}
                disabled={cart.length === 0}
                title="Clear Bill"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 2, padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border)',
                  background: cart.length > 0 ? '#FEF2F2' : 'var(--surface)',
                  color: cart.length > 0 ? '#DC2626' : 'var(--text-muted)',
                  cursor: cart.length > 0 ? 'pointer' : 'not-allowed',
                  fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap',
                  transition: 'all 150ms', opacity: cart.length > 0 ? 1 : 0.45,
                  minWidth: 52, height: 44,
                }}
                onMouseEnter={e => { if (cart.length > 0) { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.borderColor = '#DC2626'; } }}
                onMouseLeave={e => { e.currentTarget.style.background = cart.length > 0 ? '#FEF2F2' : 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <Trash2 size={16} />
                <span>Clear</span>
              </button>

              {/* Hold Bill */}
              <button
                onClick={holdBill}
                disabled={cart.length === 0}
                title="Hold Bill"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 2, padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border)',
                  background: cart.length > 0 ? '#FEF3C7' : 'var(--surface)',
                  color: cart.length > 0 ? '#D97706' : 'var(--text-muted)',
                  cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                  fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap',
                  transition: 'all 150ms', opacity: cart.length === 0 ? 0.45 : 1,
                  minWidth: 52, height: 44,
                }}
                onMouseEnter={e => { if (cart.length > 0) { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.borderColor = '#D97706'; } }}
                onMouseLeave={e => { e.currentTarget.style.background = cart.length > 0 ? '#FEF3C7' : 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <Pause size={16} />
                <span>Hold</span>
              </button>

              {/* Recall Bill */}
              <button
                onClick={() => setShowRecallModal(true)}
                disabled={heldCarts.length === 0}
                title="Recall Held Bill"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 2, padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border)',
                  background: heldCarts.length > 0 ? '#E0E7FF' : 'var(--surface)',
                  color: heldCarts.length > 0 ? '#4338CA' : 'var(--text-muted)',
                  cursor: heldCarts.length === 0 ? 'not-allowed' : 'pointer',
                  fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap',
                  transition: 'all 150ms', opacity: heldCarts.length === 0 ? 0.45 : 1,
                  minWidth: 52, height: 44, position: 'relative',
                }}
                onMouseEnter={e => { if (heldCarts.length > 0) { e.currentTarget.style.background = '#C7D2FE'; e.currentTarget.style.borderColor = '#4338CA'; } }}
                onMouseLeave={e => { e.currentTarget.style.background = heldCarts.length > 0 ? '#E0E7FF' : 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <Play size={16} />
                <span>Recall</span>
                {heldCarts.length > 0 && (
                  <span style={{
                    position: 'absolute', top: -6, right: -6,
                    minWidth: 18, height: 18, borderRadius: 99,
                    background: '#4338CA', color: 'white',
                    fontSize: 11, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 4px', boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                  }}>
                    {heldCarts.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Cart Table */}
          <div className="card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {cart.length === 0 ? (
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
                        <button key={med} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 12px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }} onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--brand-blue)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(26,111,255,0.1)'; }} onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)'; }}>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Focus Search</span><kbd style={{ padding: '3px 6px', background: 'var(--bg-table-header)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, fontFamily: 'monospace', fontWeight: 600 }}>F2</kbd></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Checkout / Pay</span><kbd style={{ padding: '3px 6px', background: 'var(--bg-table-header)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, fontFamily: 'monospace', fontWeight: 600 }}>F12</kbd></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Focus Phone</span><kbd style={{ padding: '3px 6px', background: 'var(--bg-table-header)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, fontFamily: 'monospace', fontWeight: 600 }}>Ctrl+D</kbd></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Hold Bill</span><kbd style={{ padding: '3px 6px', background: 'var(--bg-table-header)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, fontFamily: 'monospace', fontWeight: 600 }}>Ctrl+S</kbd></div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
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
                            <button onClick={() => removeFromCart(item.product_id)} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', padding: 4, borderRadius: 6 }}
                              onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                            ><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT PANEL (30%) — SMART PANEL ═══ */}
        <div style={{ flex: '0 0 calc(30% - 16px)', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden', minHeight: 0 }}>
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, flex: 1, paddingRight: 2 }}>
            {/* ── Section A: Live Insights ── */}
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span><TrendingUp size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Live Insights</span>
                <button onClick={() => axios.get(`${API_BASE}/api/stats`).then(r => setStats(r.data)).catch(() => { })}
                  style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', padding: 2 }}>
                  <RefreshCw size={12} />
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="insight-stat">
                  <div style={{ fontSize: 10, opacity: 0.8, fontWeight: 600 }}>TODAY'S SALES</div>
                  <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>₹{fmt(stats.todayRevenue)}</div>
                  <div style={{ fontSize: 11, opacity: 0.75 }}>{stats.todaySales} bills</div>
                </div>
              </div>
              {/* Daily target progress */}
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Daily Target</span>
                  <span style={{ color: 'var(--text)' }}>₹{fmt(stats.todayRevenue)} / ₹50,000</span>
                </div>
                <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 99, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, (stats.todayRevenue / 50000) * 100).toFixed(1)}%`,
                    background: 'linear-gradient(90deg, var(--primary), #2D68B8)',
                    borderRadius: 99,
                    transition: 'width 0.8s ease'
                  }} />
                </div>
              </div>
            </div>


            {/* ── Section D: Quick Actions ── */}
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 12 }}>
                Quick Actions
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {/* New Bill */}
                <button
                  onClick={resetBill}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    padding: '12px 8px', borderRadius: 12, border: '1px solid var(--border)',
                    background: 'var(--surface)', cursor: 'pointer', transition: 'all 200ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(59,130,246,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
                >
                  <div style={{ background: 'rgba(59,130,246,0.1)', color: '#3B82F6', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileText size={18} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>New Bill</span>
                </button>

                {/* Recall Bill */}
                <button
                  onClick={() => setShowRecallModal(true)} disabled={heldCarts.length === 0}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    padding: '12px 8px', borderRadius: 12, border: '1px solid var(--border)',
                    background: 'var(--surface)', cursor: heldCarts.length === 0 ? 'not-allowed' : 'pointer',
                    transition: 'all 200ms', opacity: heldCarts.length === 0 ? 0.5 : 1, position: 'relative'
                  }}
                  onMouseEnter={e => { if (heldCarts.length > 0) { e.currentTarget.style.borderColor = '#10B981'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(16,185,129,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
                >
                  <div style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <RefreshCw size={18} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>Recall Bill</span>
                  {heldCarts.length > 0 && (
                    <span style={{
                      position: 'absolute', top: -6, right: -6,
                      background: '#10B981', color: 'white', borderRadius: '99px',
                      padding: '2px 6px', fontSize: 10, fontWeight: 800,
                      boxShadow: '0 2px 4px rgba(16,185,129,0.3)'
                    }}>
                      {heldCarts.length}
                    </span>
                  )}
                </button>

                {/* Bill History */}
                <button
                  onClick={async () => {
                    setShowBillHistory(true);
                    setBillHistoryLoading(true);
                    try {
                      const { data } = await axios.get(`${API_BASE}/api/sales?limit=30`);
                      setBillHistory(data || []);
                    } catch {
                      setBillHistory([]);
                    } finally {
                      setBillHistoryLoading(false);
                    }
                  }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    padding: '12px 8px', borderRadius: 12, border: '1px solid var(--border)',
                    background: 'var(--surface)', cursor: 'pointer', transition: 'all 200ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(124,58,237,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
                >
                  <div style={{ background: 'rgba(124,58,237,0.1)', color: '#7C3AED', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <History size={18} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>Bill History</span>
                </button>

                {/* Draft Bill */}
                <button
                  onClick={() => openDraftModal('create')}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    padding: '12px 8px', borderRadius: 12, border: '1px solid var(--border)',
                    background: 'var(--surface)', cursor: 'pointer', transition: 'all 200ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#D97706'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(217,119,6,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
                >
                  <div style={{ background: 'rgba(217,119,6,0.1)', color: '#D97706', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ClipboardList size={18} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>Draft Bills</span>
                </button>
              </div>

              {/* Print Last Invoice (Conditional) */}
              {lastSale && (
                <button
                  onClick={() => window.print()}
                  style={{
                    marginTop: 10, width: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '10px 12px', borderRadius: 12, border: '1px solid var(--primary)',
                    background: 'rgba(26,106,164,0.05)', color: 'var(--primary)', cursor: 'pointer',
                    fontWeight: 700, fontSize: 12, transition: 'all 200ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = 'white' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(26,106,164,0.05)'; e.currentTarget.style.color = 'var(--primary)' }}
                >
                  <Printer size={15} /> Print Last Invoice
                </button>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ═══ MODERN FLOATING CHECKOUT BAR ═══ */}
      <BottomBillSummaryPanel
        cart={cart}
        typeTotals={typeTotals}
        mrpTotal={mrpTotal}
        gstSlabs={gstSlabs}
        totalAmount={totalAmount}
        discountAmount={discountAmount}
        itemDiscountTotal={itemDiscountTotal}
        billDiscountAmt={billDiscountAmt}
        setBillDiscountAmt={setBillDiscountAmt}
        roundedAmt={roundedAmt}
        savingsPct={savingsPct}
        profit={profit}
        payments={payments}
        setPayments={setPayments}
        splitMode={splitMode}
        setSplitMode={setSplitMode}
        handleCheckout={handleCheckout}
        checkoutLoading={checkoutLoading}
        selectedCustomer={selectedCustomer}
        prescriberName={prescriberName}
        warnings={warnings}
      />

      {/* Recall Bills Modal */}
      {showRecallModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
        }}>
          <div className="card" style={{ width: 500, maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ background: '#E0E7FF', color: '#4338CA', padding: 8, borderRadius: 8 }}><Play size={18} /></div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Recall Held Bills</h3>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{heldCarts.length} bill(s) currently on hold</div>
                </div>
              </div>
              <button onClick={() => setShowRecallModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>

            <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {heldCarts.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>No held bills found.</div>
              ) : (
                heldCarts.map((h, i) => {
                  return (
                    <div key={i} style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
                          {h.patient?.name || (h.selectedCustomer ? h.selectedCustomer.name : 'Walk-in Customer')}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                          <span>⏱️ {h.time || 'Unknown time'}</span>
                          <span>📦 {h.cart.reduce((sum, item) => sum + item.quantity, 0)} items</span>
                          <span style={{ fontWeight: 600, color: 'var(--success)' }}>₹{fmt(Math.max(0, h.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0) - (h.billDiscountAmt || 0)))}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                          {h.cart.slice(0, 3).map(c => `${c.name} (x${c.quantity})`).join(', ')}
                          {h.cart.length > 3 && ` + ${h.cart.length - 3} more`}
                        </div>
                      </div>
                      <button className="btn-primary" onClick={() => recallSpecificBill(i)}>
                        Recall
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ EXPIRY ALERTS MODAL ══ */}
      {showAlertsModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.55)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
        }}>
          <div className="card" style={{ width: 600, maxWidth: '94vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
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
              <button onClick={() => setShowAlertsModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {expiryAlerts.expired.length > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={14} color="#DC2626" />
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#DC2626' }}>Expired ({expiryAlerts.expired.length})</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
                      <th style={{ padding: '8px 16px', textAlign: 'left', color: '#DC2626', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Medicine</th>
                      <th style={{ padding: '8px 16px', textAlign: 'left', color: '#DC2626', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Batch</th>
                      <th style={{ padding: '8px 16px', textAlign: 'left', color: '#DC2626', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Expiry</th>
                      <th style={{ padding: '8px 16px', textAlign: 'left', color: '#DC2626', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Stock</th>
                    </tr></thead>
                    <tbody>
                      {expiryAlerts.expired.map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(239,68,68,0.08)' }}>
                          <td style={{ padding: '9px 16px', fontWeight: 600, color: 'var(--text)' }}>{p.name}</td>
                          <td style={{ padding: '9px 16px', color: 'var(--text-muted)' }}>{p.batch || '—'}</td>
                          <td style={{ padding: '9px 16px', color: '#DC2626', fontWeight: 700 }}>{p.expiry}</td>
                          <td style={{ padding: '9px 16px', color: 'var(--text-muted)' }}>{p.stock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {expiryAlerts.expiring.length > 0 && (
                <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={14} color="#D97706" />
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#D97706' }}>Expiring in 90 Days ({expiryAlerts.expiring.length})</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
                      <th style={{ padding: '8px 16px', textAlign: 'left', color: '#D97706', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Medicine</th>
                      <th style={{ padding: '8px 16px', textAlign: 'left', color: '#D97706', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Batch</th>
                      <th style={{ padding: '8px 16px', textAlign: 'left', color: '#D97706', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Expiry</th>
                      <th style={{ padding: '8px 16px', textAlign: 'left', color: '#D97706', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Stock</th>
                    </tr></thead>
                    <tbody>
                      {expiryAlerts.expiring.map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(245,158,11,0.08)' }}>
                          <td style={{ padding: '9px 16px', fontWeight: 600, color: 'var(--text)' }}>{p.name}</td>
                          <td style={{ padding: '9px 16px', color: 'var(--text-muted)' }}>{p.batch || '—'}</td>
                          <td style={{ padding: '9px 16px', color: '#D97706', fontWeight: 700 }}>{p.expiry}</td>
                          <td style={{ padding: '9px 16px', color: 'var(--text-muted)' }}>{p.stock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {totalAlerts === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  <Check size={36} style={{ opacity: 0.3, marginBottom: 10 }} />
                  <div style={{ fontSize: 14 }}>All medicines are within expiry dates. ✓</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ BILL HISTORY MODAL ══ */}
      {showBillHistory && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.55)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
        }}>
          <div className="card" style={{ width: 640, maxWidth: '94vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: 'linear-gradient(135deg,#7C3AED,#6D28D9)', color: 'white', padding: 9, borderRadius: 10, display: 'flex' }}>
                  <History size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text)' }}>Bill History</h3>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Recent completed sales</div>
                </div>
              </div>
              <button onClick={() => setShowBillHistory(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                <X size={20} />
              </button>
            </div>

            {/* Search Bar */}
            <div style={{ padding: '12px 16px 0', display: 'flex' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: 10 }} />
                <input
                  type="text"
                  placeholder="Search history by name, phone, or medicines..."
                  value={billSearch}
                  onChange={e => setBillSearch(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px 8px 36px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--surface-2)',
                    fontSize: 13, color: 'var(--text)', outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* Body */}
            <div style={{ overflowY: 'auto', flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {billHistoryLoading ? (
                <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
                  <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', opacity: 0.5 }} />
                  <div style={{ marginTop: 10, fontSize: 13 }}>Loading bills...</div>
                </div>
              ) : filteredBillHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
                  <ReceiptText size={40} style={{ opacity: 0.25, marginBottom: 10 }} />
                  <div style={{ fontSize: 14 }}>No bills found matching "{billSearch}"</div>
                </div>
              ) : (
                filteredBillHistory.map((bill, i) => (
                  <div key={bill.id || i} style={{
                    padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)',
                    background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                            #{bill.id}
                          </span>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                            background: bill.payment_status === 'paid' ? '#D1FAE5' : bill.payment_status === 'credit' ? '#FEF3C7' : '#DBEAFE',
                            color: bill.payment_status === 'paid' ? '#065F46' : bill.payment_status === 'credit' ? '#92400E' : '#1D4ED8',
                          }}>
                            {bill.payment_status === 'credit' ? 'Udhaar' : bill.payment_status === 'paid' ? 'Paid' : bill.payment_status}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {bill.customer_name || bill.prescriber_name || 'Walk-in Customer'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Clock size={10} /> {new Date(bill.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span>{new Date(bill.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                          {bill.item_count && <span>📦 {bill.item_count} items</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--success)' }}>₹{fmt(bill.total_amount)}</div>
                        {bill.discount_total > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Disc: ₹{fmt(bill.discount_total)}</div>
                        )}
                      </div>
                    </div>

                    {/* ITEMS LIST */}
                    {bill.items_json && (
                      <div style={{ marginTop: 2, paddingTop: 10, borderTop: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Bill Items</div>
                        {JSON.parse(bill.items_json).map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, alignItems: 'center' }}>
                            <span style={{ color: 'var(--text)', fontWeight: 500 }}>
                              {item.quantity} × {item.name}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>
                              ₹{fmt((item.price * item.quantity) * (1 - (item.discount || 0) / 100))}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ PATIENT INFO MODAL — NEXT GEN ══ */}
      {showPatientModal && (
        <div
          className="patient-modal-overlay"
          onClick={e => e.target === e.currentTarget && setShowPatientModal(false)}
        >
          <div className="patient-modal-card">

            {/* ── Modal Header ── */}
            <div className="patient-modal-header">
              <div className="patient-modal-header-avatar">
                <User size={22} color="white" />
              </div>
              <div className="patient-modal-header-text">
                <h3>Patient Lookup</h3>
                <p>Search by phone or register a new patient</p>
              </div>
              <button
                className="patient-modal-close"
                onClick={() => setShowPatientModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Modal Body ── */}
            <div className="patient-modal-body">

              {/* Phone Search */}
              <div className="pm-phone-group">
                <label>
                  <Search size={12} />
                  Phone Number
                </label>
                <div className="pm-phone-input-wrap">
                  <span className="phone-prefix">+91</span>
                  <input
                    autoFocus
                    className="pm-phone-input"
                    type="tel"
                    placeholder="Enter mobile number..."
                    value={patientModalPhone}
                    onChange={e => {
                      const val = e.target.value;
                      setPatientModalPhone(val);
                      if (val.length >= 3) {
                        const matches = customers.filter(c => c.phone && c.phone.includes(val));
                        setPatientModalMatches(matches);
                        if (matches.length > 0) {
                          setPatientModalMode('found');
                        } else {
                          setPatientModalMode('new');
                          setPatientModalNew(prev => ({ ...prev, name: '' }));
                        }
                      } else {
                        setPatientModalMatches([]);
                        setPatientModalMode('search');
                      }
                    }}
                  />
                </div>
              </div>

              {/* ── FOUND: matched customers ── */}
              {patientModalMode === 'found' && patientModalMatches.length > 0 && (
                <div>
                  <div className="pm-found-header">
                    <CheckCircle2 size={14} />
                    {patientModalMatches.length} patient{patientModalMatches.length > 1 ? 's' : ''} found
                  </div>
                  <div className="pm-match-list">
                    {patientModalMatches.map(c => (
                      <button
                        key={c.id}
                        className="pm-match-card"
                        onClick={() => {
                          setSelectedCustomer(c);
                          setPatient({ phone: c.phone || patientModalPhone, name: c.name || '', age: c.age || '', gender: c.gender || 'Male', reference: c.reference_name || '' });
                          setShowPatientModal(false);
                        }}
                      >
                        <div className="pm-match-avatar">
                          {c.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="pm-match-info">
                          <div className="name">{c.name}</div>
                          <div className="detail">
                            {c.phone}
                            {c.gender && <><span className="dot" />{c.gender}</>}
                          </div>
                        </div>
                        <ChevronRight size={16} style={{ color: 'var(--text-light)', flexShrink: 0 }} />
                      </button>
                    ))}
                  </div>
                  <button
                    className="pm-register-alt"
                    onClick={() => { setPatientModalMode('new'); setPatientModalNew({ name: '', age: '', gender: 'Male', reference: '' }); }}
                  >
                    <Plus size={14} />
                    Register as new patient instead
                  </button>
                </div>
              )}

              {/* ── NEW: registration form ── */}
              {patientModalMode === 'new' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="pm-new-notice">
                    <AlertCircle size={15} />
                    No patient found. Fill details below to register.
                  </div>

                  {/* Name */}
                  <div className="pm-form-group">
                    <label className="pm-form-label">
                      <User size={12} />
                      Full Name <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <input
                      className="pm-form-input"
                      type="text"
                      placeholder="Patient full name"
                      value={patientModalNew.name}
                      onChange={e => setPatientModalNew(p => ({ ...p, name: e.target.value }))}
                    />
                  </div>

                  {/* Age + Gender row */}
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div className="pm-form-group" style={{ flex: '0 0 90px' }}>
                      <label className="pm-form-label">Age</label>
                      <input
                        className="pm-form-input"
                        type="number"
                        min="0"
                        max="150"
                        placeholder="Age"
                        value={patientModalNew.age}
                        onChange={e => setPatientModalNew(p => ({ ...p, age: e.target.value }))}
                        style={{ textAlign: 'center' }}
                      />
                    </div>
                    <div className="pm-form-group" style={{ flex: 1 }}>
                      <label className="pm-form-label">Gender</label>
                      <div className="pm-gender-pills">
                        {[
                          { val: 'Male', icon: '♂' },
                          { val: 'Female', icon: '♀' },
                          { val: 'Other', icon: '⚧' }
                        ].map(g => (
                          <button
                            key={g.val}
                            className={`pm-gender-pill ${patientModalNew.gender === g.val ? 'active' : 'inactive'}`}
                            onClick={() => setPatientModalNew(p => ({ ...p, gender: g.val }))}
                          >
                            <span>{g.icon}</span>
                            {g.val}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Tracking Ref */}
                  <div className="pm-form-group">
                    <label className="pm-form-label">
                      <FileText size={12} />
                      Tracking Ref.
                    </label>
                    <input
                      className="pm-form-input"
                      type="text"
                      placeholder="Tracking reference (optional)"
                      value={patientModalNew.reference}
                      onChange={e => setPatientModalNew(p => ({ ...p, reference: e.target.value }))}
                    />
                  </div>

                  {/* Actions */}
                  <div className="pm-actions">
                    <button
                      className={`pm-btn-primary ${patientModalNew.name.trim() && !patientModalSaving ? 'enabled' : 'disabled'}`}
                      disabled={!patientModalNew.name.trim() || patientModalSaving}
                      onClick={async () => {
                        if (!patientModalNew.name.trim()) return;
                        setPatientModalSaving(true);
                        try {
                          const res = await axios.post(`${API_BASE}/api/customers`, {
                            name: patientModalNew.name.trim(),
                            phone: patientModalPhone.trim(),
                            gender: patientModalNew.gender,
                            reference_name: patientModalNew.reference.trim(),
                          });
                          const newCust = { id: res.data.id, name: patientModalNew.name.trim(), phone: patientModalPhone.trim(), gender: patientModalNew.gender, reference_name: patientModalNew.reference.trim() };
                          setCustomers(prev => [...prev, newCust]);
                          setSelectedCustomer(newCust);
                          setPatient({ phone: patientModalPhone.trim(), name: patientModalNew.name.trim(), age: patientModalNew.age, gender: patientModalNew.gender, reference: patientModalNew.reference.trim() });
                          setShowPatientModal(false);
                        } catch (err) {
                          alert('Failed to register: ' + (err.response?.data?.error || err.message));
                        } finally { setPatientModalSaving(false); }
                      }}
                    >
                      <CheckCircle2 size={16} />
                      {patientModalSaving ? 'Saving…' : 'Register & Add'}
                    </button>
                    <button
                      className="pm-btn-secondary"
                      onClick={() => {
                        setSelectedCustomer(null);
                        setPatient({ phone: patientModalPhone.trim(), name: patientModalNew.name.trim(), age: patientModalNew.age, gender: patientModalNew.gender, reference: patientModalNew.reference.trim() });
                        setShowPatientModal(false);
                      }}
                    >
                      Skip
                    </button>
                  </div>
                </div>
              )}

              {/* ── IDLE: no phone typed yet ── */}
              {patientModalMode === 'search' && !patientModalPhone && (
                <div className="pm-idle-state">
                  <div className="idle-icon-wrap">
                    <Search size={24} style={{ opacity: 0.35 }} />
                  </div>
                  <p>Enter phone number to search patients</p>
                  <small>Ctrl+D to quick-focus</small>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ══ DRAFT BILL MODAL ══ */}
      {showDraftModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1100, display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>

          {/* ── TOP BAR ── */}
          <div style={{ background: 'linear-gradient(135deg, #78350F 0%, #D97706 50%, #F59E0B 100%)', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56, flexShrink: 0, boxShadow: '0 2px 16px rgba(217,119,6,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: 8, display: 'flex' }}>
                <ClipboardList size={20} color="white" />
              </div>
              <div>
                <div style={{ color: 'white', fontWeight: 800, fontSize: 17, letterSpacing: '-0.3px' }}>Draft Bill</div>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11 }}>Bills for medicines pending in inventory</div>
              </div>
              <div style={{ marginLeft: 8, display: 'flex', gap: 2, background: 'rgba(0,0,0,0.15)', borderRadius: 10, padding: 4 }}>
                {[{ id: 'create', label: '✏️ Create Draft' }, { id: 'pending', label: `📋 Pending${draftBills.length > 0 ? ` (${draftBills.length})` : ''}` }].map(t => (
                  <button key={t.id} onClick={() => { setDraftTab(t.id); if (t.id === 'pending') fetchDraftBills(); setDraftCompleteError(null); }}
                    style={{ padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, background: draftTab === t.id ? 'white' : 'transparent', color: draftTab === t.id ? '#D97706' : 'rgba(255,255,255,0.85)', transition: 'all 150ms' }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => { setShowDraftModal(false); setDraftCompleteError(null); }}
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, cursor: 'pointer', color: 'white', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
              <X size={15} /> Close
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>

            {/* ─── CREATE TAB ─── */}
            {draftTab === 'create' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* ── PATIENT INFO CARD ── */}
                <div style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)', borderLeft: '4px solid #3B82F6', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#3B82F6,#1D4ED8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <User size={12} color="white" />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text)', letterSpacing: '0.7px', textTransform: 'uppercase' }}>Patient Info</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 0.7fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: '#3B82F6', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 3, display: 'block' }}>📞 Phone *</label>
                      <input type="tel" placeholder="Mobile number" value={draftPatient.phone}
                        onChange={e => setDraftPatient(p => ({ ...p, phone: e.target.value }))}
                        style={{ width: '100%', border: '1.5px solid rgba(59,130,246,0.25)', borderRadius: 7, padding: '6px 10px', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: '#3B82F6', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 3, display: 'block' }}>👤 Name *</label>
                      <input type="text" placeholder="Patient name" value={draftPatient.name}
                        onChange={e => setDraftPatient(p => ({ ...p, name: e.target.value }))}
                        style={{ width: '100%', border: '1.5px solid rgba(59,130,246,0.25)', borderRadius: 7, padding: '6px 10px', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: '#3B82F6', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 3, display: 'block' }}>⚧ Gender</label>
                      <select value={draftPatient.gender} onChange={e => setDraftPatient(p => ({ ...p, gender: e.target.value }))}
                        style={{ width: '100%', border: '1.5px solid rgba(59,130,246,0.25)', borderRadius: 7, padding: '6px 6px', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: '#3B82F6', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 3, display: 'block' }}>🏢 Reference / Company</label>
                    <input type="text" placeholder="Company or reference name" value={draftPatient.reference}
                      onChange={e => setDraftPatient(p => ({ ...p, reference: e.target.value }))}
                      style={{ width: '100%', border: '1.5px solid rgba(59,130,246,0.25)', borderRadius: 7, padding: '6px 10px', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                {/* ── PRESCRIPTION + PAYMENT CARD ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {/* Doctor info */}
                  <div style={{ background: 'rgba(22,163,74,0.05)', border: '1px solid rgba(22,163,74,0.2)', borderLeft: '4px solid #16A34A', borderRadius: 10, padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#16A34A,#15803D)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Stethoscope size={12} color="white" />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text)', letterSpacing: '0.7px', textTransform: 'uppercase' }}>Prescription</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: '#16A34A', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 3, display: 'block' }}>🩺 Doctor Name</label>
                        <input type="text" placeholder="Dr. Name" value={draftPrescriber.doctor}
                          onChange={e => setDraftPrescriber(p => ({ ...p, doctor: e.target.value }))}
                          style={{ width: '100%', border: '1.5px solid rgba(22,163,74,0.25)', borderRadius: 7, padding: '6px 10px', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: '#16A34A', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 3, display: 'block' }}>📅 Date</label>
                        <input type="text" placeholder="e.g. 04 May 2026" value={draftPrescriber.date}
                          onChange={e => setDraftPrescriber(p => ({ ...p, date: e.target.value }))}
                          style={{ width: '100%', border: '1.5px solid rgba(22,163,74,0.25)', borderRadius: 7, padding: '6px 10px', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }} />
                      </div>
                    </div>
                  </div>

                  {/* Payment Mode */}
                  <div style={{ background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.2)', borderLeft: '4px solid #7C3AED', borderRadius: 10, padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#7C3AED,#6D28D9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <IndianRupee size={12} color="white" />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text)', letterSpacing: '0.7px', textTransform: 'uppercase' }}>Payment Mode</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {[{ id: 'cash', icon: Banknote, label: 'Cash' }, { id: 'upi', icon: Wifi, label: 'UPI' }, { id: 'card', icon: CreditCard, label: 'Card' }, { id: 'credit', icon: IndianRupee, label: 'Udhaar' }].map(({ id, icon: Icon, label }) => ( // eslint-disable-line no-unused-vars
                        <button key={id} onClick={() => setDraftPaymentMode(id)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 6px', borderRadius: 7, border: `1.5px solid ${draftPaymentMode === id ? '#7C3AED' : 'var(--border)'}`, background: draftPaymentMode === id ? 'rgba(124,58,237,0.12)' : 'var(--surface-2)', color: draftPaymentMode === id ? '#7C3AED' : 'var(--text-muted)', fontWeight: draftPaymentMode === id ? 700 : 500, fontSize: 12, cursor: 'pointer', transition: 'all 150ms' }}>
                          <Icon size={12} /> {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Item rows */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Medicine Items</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Medicine Name', 'Qty', 'Price (₹)', 'GST%', ''].map(h => (
                          <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {draftItems.map((it, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 4px' }}>
                            <input type="text" placeholder="e.g. Augmentin 625" value={it.name}
                              onChange={e => updateDraftItem(idx, 'name', e.target.value)}
                              style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', outline: 'none' }} />
                          </td>
                          <td style={{ padding: '6px 4px', width: 60 }}>
                            <input type="number" min={1} value={it.quantity}
                              onChange={e => updateDraftItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                              style={{ width: '100%', padding: '5px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, textAlign: 'center', background: 'var(--surface-2)', color: 'var(--text)', outline: 'none' }} />
                          </td>
                          <td style={{ padding: '6px 4px', width: 90 }}>
                            <input type="number" min={0} step={0.01} value={it.price}
                              onChange={e => updateDraftItem(idx, 'price', parseFloat(e.target.value) || 0)}
                              style={{ width: '100%', padding: '5px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, textAlign: 'right', background: 'var(--surface-2)', color: 'var(--text)', outline: 'none' }} />
                          </td>
                          <td style={{ padding: '6px 4px', width: 65 }}>
                            <input type="number" min={0} max={28} value={it.gst}
                              onChange={e => updateDraftItem(idx, 'gst', parseFloat(e.target.value) || 0)}
                              style={{ width: '100%', padding: '5px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, textAlign: 'center', background: 'var(--surface-2)', color: 'var(--text)', outline: 'none' }} />
                          </td>
                          <td style={{ padding: '6px 4px', width: 36 }}>
                            <button onClick={() => setDraftItems(prev => prev.filter((_, i) => i !== idx))}
                              disabled={draftItems.length === 1}
                              style={{ background: 'none', border: 'none', cursor: draftItems.length === 1 ? 'not-allowed' : 'pointer', color: 'var(--text-light)', padding: 4, borderRadius: 4, opacity: draftItems.length === 1 ? 0.3 : 1 }}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                    <button onClick={() => setDraftItems(prev => [...prev, { name: '', quantity: 1, price: 0, gst: 0, mrp: 0 }])}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1.5px dashed var(--border)', borderRadius: 7, background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>
                      <Plus size={14} /> Add Row
                    </button>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                      Est. Total: <span style={{ color: '#D97706' }}>₹{fmt(draftItems.reduce((s, i) => s + (parseFloat(i.price) || 0) * (parseInt(i.quantity) || 1), 0))}</span>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, display: 'block' }}>Notes (optional)</label>
                  <textarea value={draftNotes} onChange={e => setDraftNotes(e.target.value)} rows={2}
                    placeholder="e.g. Collect by evening, waiting for supplier..."
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
                </div>

                {/* Save button */}
                <button onClick={saveDraft} disabled={draftSaving}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 0', borderRadius: 9, border: 'none', background: draftSaving ? 'var(--border)' : 'linear-gradient(135deg,#F59E0B,#D97706)', color: draftSaving ? 'var(--text-muted)' : 'white', fontWeight: 700, fontSize: 15, cursor: draftSaving ? 'not-allowed' : 'pointer', boxShadow: '0 4px 14px rgba(217,119,6,0.3)' }}>
                  {draftSaving ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</> : <><Save size={16} /> Save Draft Bill</>}
                </button>
              </div>
            )}

            {/* ─── PENDING DRAFTS TAB ─── */}
            {draftTab === 'pending' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {draftBillsLoading ? (
                  <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
                    <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', opacity: 0.5 }} />
                    <div style={{ marginTop: 10, fontSize: 13 }}>Loading drafts...</div>
                  </div>
                ) : draftBills.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
                    <ClipboardList size={40} style={{ opacity: 0.2, marginBottom: 10 }} />
                    <div style={{ fontSize: 14 }}>No pending draft bills</div>
                    <button onClick={() => setDraftTab('create')} style={{ marginTop: 12, padding: '8px 20px', border: '1.5px solid #D97706', borderRadius: 8, background: 'none', color: '#D97706', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Create First Draft</button>
                  </div>
                ) : (
                  draftBills.map(draft => {
                    const dItems = JSON.parse(draft.items_json || '[]');
                    const thisError = draftCompleteError?.id === draft.id ? draftCompleteError : null;
                    return (
                      <div key={draft.id} style={{ border: `1.5px solid ${thisError ? '#FCA5A5' : 'var(--border)'}`, borderRadius: 12, padding: 16, background: thisError ? 'rgba(239,68,68,0.04)' : 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {/* Top row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{draft.patient_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 10, marginTop: 3 }}>
                              <span>📞 {draft.patient_phone}</span>
                              <span><Clock size={11} style={{ verticalAlign: 'middle' }} /> {new Date(draft.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            {draft.prescriber_name && <div style={{ fontSize: 11, color: '#16A34A', marginTop: 2 }}>🩺 {draft.prescriber_name}</div>}
                            {draft.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>📝 {draft.notes}</div>}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#D97706' }}>₹{fmt(draft.estimated_total)}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{dItems.length} item{dItems.length !== 1 ? 's' : ''} · est.</div>
                          </div>
                        </div>

                        {/* Items list */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {dItems.map((it, i) => (
                            <span key={i} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 500 }}>
                              {it.quantity}× {it.name} {it.price > 0 ? `@ ₹${fmt(it.price)}` : ''}
                            </span>
                          ))}
                        </div>

                        {/* Missing items error */}
                        {thisError && (
                          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#DC2626', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                              <AlertCircle size={14} /> Inventory not ready yet
                            </div>
                            {thisError.missing.map((m, i) => (
                              <div key={i} style={{ fontSize: 12, color: '#B91C1C', display: 'flex', gap: 8, marginBottom: 3 }}>
                                <span style={{ fontWeight: 600 }}>• {m.name}:</span> {m.reason}
                              </div>
                            ))}
                            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 6 }}>Add stock via Purchase Hub, then try completing again.</div>
                          </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                          <button onClick={() => completeDraft(draft.id)} disabled={completingDraftId === draft.id}
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 8, border: 'none', background: completingDraftId === draft.id ? 'var(--border)' : 'linear-gradient(135deg,#16A34A,#15803D)', color: completingDraftId === draft.id ? 'var(--text-muted)' : 'white', fontWeight: 700, fontSize: 13, cursor: completingDraftId === draft.id ? 'not-allowed' : 'pointer', boxShadow: completingDraftId !== draft.id ? '0 2px 8px rgba(22,163,74,0.25)' : 'none' }}>
                            {completingDraftId === draft.id ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Checking...</> : <><CheckCircle2 size={14} /> Complete Bill</>}
                          </button>
                          <button onClick={() => discardDraft(draft.id)}
                            style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid #FECACA', background: 'none', color: '#DC2626', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>);
}
