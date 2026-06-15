import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';
import Fuse from 'fuse.js';
import { useLocation } from 'react-router-dom';
import { buildCartItem, recomputeItem, computeBillTotals } from '../utils/gstEngine';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { printReceipt } from '../utils/printReceipt';
import BottomBillSummaryPanel from '../components/BottomBillSummaryPanel';
import CartTable from '../components/billing/CartTable';
import PatientModal from '../components/billing/PatientModal';
import ExpiryAlertsModal from '../components/billing/ExpiryAlertsModal';
import RecallBillModal from '../components/billing/RecallBillModal';
import DraftBillModal from '../components/billing/DraftBillModal';
import {
  Search, Mic, Trash2, ShoppingCart, Printer,
  User, Stethoscope, TrendingUp, RefreshCw, FileText,
  IndianRupee, CreditCard, Wifi, Banknote, Pause, Play, X,
  AlertTriangle, Package, History, Clock, ReceiptText,
  ClipboardList, CheckCircle2, Sparkles,
} from 'lucide-react';

/* ── helpers ── */
const fmt = (n) => parseFloat(n || 0).toFixed(2);

export default function Billing() {
  const { user } = useAuth();
  const { toast, confirm } = useUI();
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
  const [draftItems, setDraftItems] = useState([]);
  const [draftNotes, setDraftNotes] = useState('');
  const [draftSaving, setDraftSaving] = useState(false);
  const [completingDraftId, setCompletingDraftId] = useState(null);
  const [draftCompleteError, setDraftCompleteError] = useState(null); // { id, missing[] }
  const [draftPatient, setDraftPatient] = useState({ phone: '', name: '', age: '', gender: 'Male', reference: '' });
  const [draftPrescriber, setDraftPrescriber] = useState({ doctor: '', date: '' });
  const [draftPaymentMode, setDraftPaymentMode] = useState('cash');

  const [settings, setSettings] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);

  const getCurrentDate = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

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
    Promise.all([
      axios.get(`${API_BASE}/api/pos-init`),
      axios.get(`${API_BASE}/api/products/expiring`),
    ]).then(([posRes, expiryRes]) => {
      const data = posRes.data;
      const inventory = data.products;
      setProducts(inventory && inventory.length > 0 ? inventory : []);
      setCustomers(data.customers || []);
      setStats(data.stats || { todayRevenue: 0, todaySales: 0, todayProfit: 0, totalProducts: 0, lowStock: 0, totalCustomers: 0 });
      setExpiryAlerts(expiryRes.data || { expiring: [], expired: [] });
      if (data.settings?.gst_type) setGstType(data.settings.gst_type);
      setSettings(data.settings || null);
    }).catch((e) => {
      console.error(e);
      setProducts([]);
    }).finally(() => setLoading(false));

    setTimeout(() => searchRef.current?.focus(), 300);

    const onKey = (e) => {
      if (e.ctrlKey && e.key === 'd') { e.preventDefault(); phoneRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);


  const fetchProducts = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/api/products`);
      setProducts(data && data.length > 0 ? data : []);
    } catch (e) {
      console.error(e);
      setProducts([]);
    }
  };

  // Fetch AI/Smart suggestions when cart changes
  useEffect(() => {
    if (cart.length === 0) {
      setAiSuggestions([]);
      return;
    }

    setAiLoading(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const { data } = await axios.post(`${API_BASE}/api/ai/suggest`, { cart });
        setAiSuggestions(data || []);
      } catch (err) {
        console.error('Failed to load AI suggestions:', err);
      } finally {
        setAiLoading(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [cart]);

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
    if (product.stock <= 0) { toast('Out of stock', 'warning'); return; }
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
  }, [toast]);

  const handleQuickAdd = useCallback((medName) => {
    let match = products.find(p => p.name.toLowerCase() === medName.toLowerCase());
    if (!match) {
      match = products.find(p => p.name.toLowerCase().startsWith(medName.toLowerCase()));
    }
    if (!match) {
      match = products.find(p => p.name.toLowerCase().includes(medName.toLowerCase()));
    }

    if (match) {
      addToCart(match);
    } else {
      toast(`"${medName}" not found in inventory`, 'warning');
    }
  }, [products, addToCart, toast]);

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
    cgstTotal: _cgstTotal,
    sgstTotal: _sgstTotal,
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
    if (checkoutLoading) return;
    if (cart.length === 0) return;
    if (!patient.name?.trim() || !patient.phone?.trim()) {
      toast('Please fill patient name and phone before completing the bill.', 'error');
      return;
    }
    if (warnings.scheduleH && !prescriberName?.trim()) {
      toast('Prescription (Dr. Name) is required for Schedule H/Rx medicines.', 'error');
      return;
    }

    const hasCreditSplit = payments.some(p => p.method === 'credit');
    if (hasCreditSplit && !selectedCustomer) { toast('Select a customer for credit/udhaar', 'warning'); return; }

    if (splitMode && payments.length > 1) {
      const splitSum = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const diff = Math.abs(splitSum - totalAmount);
      if (diff > 0.01) {
        toast(`Split amounts (₹${splitSum.toFixed(2)}) don't match total (₹${totalAmount.toFixed(2)}). Diff: ₹${diff.toFixed(2)}`, 'error');
        return;
      }
    }

    if (profit < 0) {
      const ok = await confirm(`Selling below purchase cost! Estimated loss: ₹${fmt(Math.abs(profit))}. Proceed anyway?`, { danger: true, title: 'Below Cost Warning', confirmLabel: 'Proceed' });
      if (!ok) return;
    }

    await completeCheckout(payments);
  };

  const handleCheckoutRef = useRef(handleCheckout);
  handleCheckoutRef.current = handleCheckout;

  useEffect(() => {
    const handleGlobalF12 = (e) => {
      if (e.key === 'F12') {
        e.preventDefault();
        handleCheckoutRef.current();
      }
    };
    window.addEventListener('keydown', handleGlobalF12);
    return () => window.removeEventListener('keydown', handleGlobalF12);
  }, []);

  const completeCheckout = async (finalPayments) => {
    setCheckoutLoading(true);
    try {
      const paymentDetails = finalPayments.map(p => ({
        method: p.method,
        amount: splitMode && finalPayments.length > 1 ? Number(p.amount) || 0 : totalAmount,
      }));
      const primaryMethod = finalPayments[0]?.method || 'cash';

      const saleData = {
        user_id: user.id,
        customer_id: selectedCustomer?.id || null,
        prescriber_name: prescriberName || null,
        payment_status: primaryMethod === 'credit' ? 'credit' : 'paid',
        payment_details: paymentDetails,
        subtotal: taxableAmount,
        gst_total: gstTotal,
        discount_total: discountAmount,
        total_amount: totalAmount,
        items: cart.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
          price: i.mrp_per_unit,
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
    } catch (e) { toast('Checkout failed: ' + e.message, 'error'); }
    setCheckoutLoading(false);
  };

  const resetBill = () => {
    setCart([]); setBillDiscountAmt(0); setPayments([{ method: 'cash', amount: 0 }]); setSplitMode(false);
    setPrescriberName(''); setSelectedCustomer(null); setIsHold(false);
    setPatient({ phone: '', name: '', age: '', gender: 'Male', reference: '' });
    setPrescription({ doctor: '', date: getCurrentDate() });
    setCustomerSearch('');
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

  const recallSpecificBill = async (index) => {
    if (cart.length > 0) {
      const ok = await confirm('Current bill has items. Recalling a held bill will overwrite it.', { title: 'Overwrite current bill?', confirmLabel: 'Recall', danger: true });
      if (!ok) return;
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
    if (!SR) { toast('Voice search not supported in this browser', 'warning'); return; }
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
    setDraftPatient({ phone: patient.phone || '', name: patient.name || '', gender: patient.gender || 'Male', reference: patient.reference || '' });
    setDraftPrescriber({ doctor: prescriberName || prescription.doctor || '', date: prescription.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) });
    setDraftPaymentMode(payments[0]?.method || 'cash');
    if (tab === 'pending') fetchDraftBills();
    setShowDraftModal(true);
  };

  const saveDraft = async () => {
    const validItems = draftItems.filter(i => i.name.trim());
    if (!draftPatient.name?.trim() || !draftPatient.phone?.trim()) {
      toast('Please fill patient name and phone number.', 'error'); return;
    }
    if (validItems.length === 0) { toast('Add at least one medicine to the draft.', 'warning'); return; }
    setDraftSaving(true);
    try {
      // estimated_total: sum of (mrpPerUnit * qty * (1 - disc%/100)) — GST-inclusive selling price
      const estimated_total = validItems.reduce((s, i) => {
        const mrp = parseFloat(i.mrp) || 0;
        const packSize = parseInt(i.pack_size) || 1;
        const mrpPerUnit = mrp / packSize;
        const qty = parseInt(i.quantity) || 1;
        const disc = parseFloat(i.discount_pct) || 0;
        return s + mrpPerUnit * qty * (1 - disc / 100);
      }, 0);
      await axios.post(`${API_BASE}/api/draft-bills`, {
        patient_name: draftPatient.name, patient_phone: draftPatient.phone,
        patient_gender: draftPatient.gender, patient_reference: draftPatient.reference,
        prescriber_name: draftPrescriber.doctor, payment_mode: draftPaymentMode,
        customer_id: selectedCustomer?.id || null,
        notes: draftNotes, items: validItems, estimated_total,
      });
      setDraftItems([{ name: '', quantity: 1, mrp: 0, pack_size: 1, gst: 0, discount_pct: 0, batch: '', expiry: '' }]);
      setDraftNotes('');
      setDraftTab('pending');
      fetchDraftBills();
    } catch (e) { toast('Failed to save draft: ' + (e.response?.data?.error || e.message), 'error'); }
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
      toast(`✅ Draft completed! Sale #${data.saleId} — ₹${parseFloat(data.totalAmount).toFixed(2)}`, 'success', 5000);
      
      // Auto-generate & print/show invoice
      try {
        const saleRes = await axios.get(`${API_BASE}/api/sales/${data.saleId}`);
        const saleData = saleRes.data;
        const items = (typeof saleData.items_json === 'string' ? JSON.parse(saleData.items_json) : saleData.items_json) || saleData.items || [];
        const customer = saleData.customer || (saleData.customer_name ? { name: saleData.customer_name, phone: saleData.customer_phone } : null);
        
        printReceipt({
          ...saleData,
          items,
          customer,
        }, { storeInfo: settings });
      } catch (err) {
        console.error('Failed to generate/print invoice for completed draft:', err);
      }

      setShowDraftModal(false);
    } catch (e) {
      if (e.response?.status === 409) {
        setDraftCompleteError({ id: draftId, missing: e.response.data.missing });
      } else {
        toast('Failed to complete draft: ' + (e.response?.data?.error || e.message), 'error');
      }
    } finally { setCompletingDraftId(null); }
  };

  const discardDraft = async (draftId) => {
    if (!(await confirm('Discard this draft bill? This cannot be undone.', { danger: true, title: 'Discard Draft', confirmLabel: 'Discard' }))) return;
    try {
      await axios.delete(`${API_BASE}/api/draft-bills/${draftId}`);
      setDraftBills(prev => prev.filter(d => d.id !== draftId));
      if (draftCompleteError?.id === draftId) setDraftCompleteError(null);
    } catch (e) { toast('Failed to discard: ' + e.message, 'error'); }
  };

  // ── Enter Key Navigation ──
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

  /* ── PatientModal callbacks ── */
  const handlePatientSelect = (customer, patientData, isNew) => {
    if (isNew) {
      setCustomers(prev => [...prev, customer]);
    }
    setSelectedCustomer(customer);
    setPatient(patientData);
    setShowPatientModal(false);
  };

  const handlePatientSkip = (patientData) => {
    setSelectedCustomer(null);
    setPatient(patientData);
    setShowPatientModal(false);
  };

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
                              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.5px', background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 4, padding: '1px 5px' }}>OUT OF STOCK</span>
                            )}
                          </div>
                          {p.salt_composition && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.salt_composition}</div>}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                          <div style={{ fontWeight: 700, color: outOfStock ? 'var(--text-muted)' : 'var(--primary)', fontSize: 14 }}>₹{fmt(p.price)}</div>
                          <div style={{ fontSize: 11, marginTop: 2, fontWeight: 600, color: outOfStock ? '#DC2626' : p.stock > 10 ? 'var(--success)' : 'var(--warning)' }}>
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
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: cart.length > 0 ? '#FEF2F2' : 'var(--surface)', color: cart.length > 0 ? '#DC2626' : 'var(--text-muted)', cursor: cart.length > 0 ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap', transition: 'all 150ms', opacity: cart.length > 0 ? 1 : 0.45, minWidth: 52, height: 44 }}
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
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: cart.length > 0 ? '#FEF3C7' : 'var(--surface)', color: cart.length > 0 ? '#D97706' : 'var(--text-muted)', cursor: cart.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap', transition: 'all 150ms', opacity: cart.length === 0 ? 0.45 : 1, minWidth: 52, height: 44 }}
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
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: heldCarts.length > 0 ? '#E0E7FF' : 'var(--surface)', color: heldCarts.length > 0 ? '#4338CA' : 'var(--text-muted)', cursor: heldCarts.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap', transition: 'all 150ms', opacity: heldCarts.length === 0 ? 0.45 : 1, minWidth: 52, height: 44, position: 'relative' }}
                onMouseEnter={e => { if (heldCarts.length > 0) { e.currentTarget.style.background = '#C7D2FE'; e.currentTarget.style.borderColor = '#4338CA'; } }}
                onMouseLeave={e => { e.currentTarget.style.background = heldCarts.length > 0 ? '#E0E7FF' : 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <Play size={16} />
                <span>Recall</span>
                {heldCarts.length > 0 && (
                  <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 99, background: '#4338CA', color: 'white', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', boxShadow: '0 1px 4px rgba(0,0,0,0.18)' }}>
                    {heldCarts.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* ── CART TABLE (extracted component) ── */}
          <div className="card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <CartTable
              cart={cart}
              updateQty={updateQty}
              setItemQty={setItemQty}
              updateItemDiscount={updateItemDiscount}
              removeFromCart={removeFromCart}
              onQuickAdd={handleQuickAdd}
            />
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
            </div>

            {/* ── Section B: AI Billing Copilot ── */}
            <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  background: 'var(--gradient-purple)',
                  color: 'white',
                  borderRadius: 6,
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 10px var(--glow-purple)',
                }}>
                  <Sparkles size={13} className={aiLoading ? 'animate-spin' : ''} />
                </div>
                <span>AI Billing Copilot</span>
                {aiLoading && <span style={{ fontSize: 9, color: 'var(--brand-purple)', marginLeft: 'auto', fontWeight: 600 }}>Analyzing...</span>}
              </div>

              {cart.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '24px 10px', textAlign: 'center', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border)' }}>
                  <Sparkles size={24} style={{ color: 'var(--text-light)', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                    Add medicines to cart to see smart co-prescriptions & generic recommendations.
                  </p>
                </div>
              ) : aiLoading && aiSuggestions.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Skeletal Loading */}
                  <div className="skeleton" style={{ height: 60, width: '100%' }} />
                  <div className="skeleton" style={{ height: 60, width: '100%' }} />
                </div>
              ) : aiSuggestions.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '16px 10px', textAlign: 'center', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)' }}>
                  <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                    No additional suggestions for current items.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {aiSuggestions.map(sug => {
                    const isSub = sug.type === 'substitute';
                    return (
                      <div
                        key={sug.product.id}
                        style={{
                          background: isSub ? 'rgba(16,185,129,0.03)' : 'rgba(139,92,246,0.03)',
                          border: `1.5px solid ${isSub ? 'rgba(16,185,129,0.12)' : 'rgba(139,92,246,0.12)'}`,
                          borderRadius: 'var(--radius-sm)',
                          padding: '10px 12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          transition: 'all 200ms ease',
                          cursor: 'default',
                        }}
                        className="ai-suggestion-card"
                        onMouseEnter={e => {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.borderColor = isSub ? 'var(--success)' : 'var(--brand-purple)';
                          e.currentTarget.style.boxShadow = isSub ? '0 4px 12px rgba(16,185,129,0.08)' : '0 4px 12px rgba(139,92,246,0.08)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.borderColor = isSub ? 'rgba(16,185,129,0.12)' : 'rgba(139,92,246,0.12)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <span className={`badge ${isSub ? 'badge-green' : 'badge-purple'}`} style={{ fontSize: 9, padding: '1px 5px' }}>
                                {sug.label}
                              </span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: sug.product.stock > 10 ? 'var(--success)' : 'var(--warning)' }}>
                                Stock: {sug.product.stock}
                              </span>
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {sug.product.name}
                            </div>
                            {sug.product.brand_name && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                                {sug.product.brand_name}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                            <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: 13 }}>
                              ₹{fmt(sug.product.price)}
                            </div>
                            <button
                              onClick={() => addToCart(sug.product)}
                              style={{
                                marginTop: 4,
                                padding: '3px 8px',
                                borderRadius: 6,
                                border: 'none',
                                background: isSub ? 'var(--success)' : 'var(--brand-purple)',
                                color: 'white',
                                fontSize: 10,
                                fontWeight: 700,
                                cursor: 'pointer',
                                boxShadow: isSub ? '0 2px 8px rgba(16,185,129,0.25)' : '0 2px 8px rgba(139,92,246,0.25)',
                              }}
                            >
                              + Add
                            </button>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: '1.4', borderTop: '1px solid rgba(0,0,0,0.04)', paddingTop: 4, fontWeight: 500 }}>
                          {sug.reason}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Section D: Quick Actions ── */}
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 12 }}>
                Quick Actions
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {/* New Bill */}
                <button onClick={resetBill} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 8px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', transition: 'all 200ms' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(59,130,246,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}>
                  <div style={{ background: 'rgba(59,130,246,0.1)', color: '#3B82F6', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileText size={18} /></div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>New Bill</span>
                </button>

                {/* Recall Bill */}
                <button onClick={() => setShowRecallModal(true)} disabled={heldCarts.length === 0}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 8px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', cursor: heldCarts.length === 0 ? 'not-allowed' : 'pointer', transition: 'all 200ms', opacity: heldCarts.length === 0 ? 0.5 : 1, position: 'relative' }}
                  onMouseEnter={e => { if (heldCarts.length > 0) { e.currentTarget.style.borderColor = '#10B981'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(16,185,129,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}>
                  <div style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><RefreshCw size={18} /></div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>Recall Bill</span>
                  {heldCarts.length > 0 && (
                    <span style={{ position: 'absolute', top: -6, right: -6, background: '#10B981', color: 'white', borderRadius: '99px', padding: '2px 6px', fontSize: 10, fontWeight: 800, boxShadow: '0 2px 4px rgba(16,185,129,0.3)' }}>
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
                    } catch { setBillHistory([]); }
                    finally { setBillHistoryLoading(false); }
                  }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 8px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', transition: 'all 200ms' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(124,58,237,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}>
                  <div style={{ background: 'rgba(124,58,237,0.1)', color: '#7C3AED', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><History size={18} /></div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>Bill History</span>
                </button>

                {/* Draft Bill */}
                <button onClick={() => openDraftModal('create')}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 8px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', transition: 'all 200ms' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#D97706'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(217,119,6,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}>
                  <div style={{ background: 'rgba(217,119,6,0.1)', color: '#D97706', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ClipboardList size={18} /></div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>Draft Bills</span>
                </button>
              </div>

              {/* Print Last Invoice */}
              {lastSale && (
                <button
                  onClick={() => printReceipt(lastSale, { storeInfo: settings })}
                  style={{ marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--primary)', background: 'rgba(26,106,164,0.05)', color: 'var(--primary)', cursor: 'pointer', fontWeight: 700, fontSize: 12, transition: 'all 200ms' }}
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

      {/* ═══ CHECKOUT BAR ═══ */}
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
        patient={patient}
        onPrint={() => lastSale && printReceipt(lastSale, { storeInfo: settings })}
      />



      {/* ── MODALS (extracted sub-components) ── */}

      <RecallBillModal
        show={showRecallModal}
        onClose={() => setShowRecallModal(false)}
        heldCarts={heldCarts}
        onRecall={recallSpecificBill}
      />

      <ExpiryAlertsModal
        show={showAlertsModal}
        onClose={() => setShowAlertsModal(false)}
        expiryAlerts={expiryAlerts}
        totalAlerts={totalAlerts}
      />

      <PatientModal
        show={showPatientModal}
        onClose={() => setShowPatientModal(false)}
        customers={customers}
        patientModalPhone={patientModalPhone}
        setPatientModalPhone={setPatientModalPhone}
        patientModalMode={patientModalMode}
        setPatientModalMode={setPatientModalMode}
        patientModalMatches={patientModalMatches}
        setPatientModalMatches={setPatientModalMatches}
        patientModalNew={patientModalNew}
        setPatientModalNew={setPatientModalNew}
        patientModalSaving={patientModalSaving}
        setPatientModalSaving={setPatientModalSaving}
        onSelectCustomer={handlePatientSelect}
        onSkip={handlePatientSkip}
      />

      <DraftBillModal
        show={showDraftModal}
        onClose={() => { setShowDraftModal(false); setDraftCompleteError(null); }}
        draftTab={draftTab}
        setDraftTab={setDraftTab}
        draftBills={draftBills}
        draftBillsLoading={draftBillsLoading}
        draftItems={draftItems}
        setDraftItems={setDraftItems}
        draftNotes={draftNotes}
        setDraftNotes={setDraftNotes}
        draftSaving={draftSaving}
        draftPatient={draftPatient}
        setDraftPatient={setDraftPatient}
        draftPrescriber={draftPrescriber}
        setDraftPrescriber={setDraftPrescriber}
        draftPaymentMode={draftPaymentMode}
        setDraftPaymentMode={setDraftPaymentMode}
        completingDraftId={completingDraftId}
        draftCompleteError={draftCompleteError}
        onSaveDraft={saveDraft}
        onCompleteDraft={completeDraft}
        onDiscardDraft={discardDraft}
        onFetchDrafts={fetchDraftBills}
        products={products}
        customers={customers}
      />

      {/* ── BILL HISTORY MODAL (inline — read-only) ── */}
      {showBillHistory && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div className="card" style={{ width: 640, maxWidth: '94vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: 'linear-gradient(135deg,#7C3AED,#6D28D9)', color: 'white', padding: 9, borderRadius: 10, display: 'flex' }}><History size={18} /></div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text)' }}>Bill History</h3>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Recent completed sales</div>
                </div>
              </div>
              <button onClick={() => setShowBillHistory(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={20} /></button>
            </div>
            <div style={{ padding: '12px 16px 0', display: 'flex' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: 10 }} />
                <input type="text" placeholder="Search history by name, phone, or medicines..." value={billSearch}
                  onChange={e => setBillSearch(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: 13, color: 'var(--text)', outline: 'none' }} />
              </div>
            </div>
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
                  <div key={bill.id || i} style={{ padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>#{bill.id}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: bill.payment_status === 'paid' ? '#D1FAE5' : bill.payment_status === 'credit' ? '#FEF3C7' : '#DBEAFE', color: bill.payment_status === 'paid' ? '#065F46' : bill.payment_status === 'credit' ? '#92400E' : '#1D4ED8' }}>
                            {bill.payment_status === 'credit' ? 'Udhaar' : bill.payment_status === 'paid' ? 'Paid' : bill.payment_status}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {bill.customer_name || bill.prescriber_name || 'Walk-in Customer'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={10} /> {new Date(bill.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                          <span>{new Date(bill.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                          {bill.item_count && <span>📦 {bill.item_count} items</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--success)' }}>₹{fmt(bill.total_amount)}</div>
                        {bill.discount_total > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Disc: ₹{fmt(bill.discount_total)}</div>}
                      </div>
                    </div>
                    {bill.items_json && (
                      <div style={{ marginTop: 2, paddingTop: 10, borderTop: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Bill Items</div>
                        {JSON.parse(bill.items_json).map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, alignItems: 'center' }}>
                            <span style={{ color: 'var(--text)', fontWeight: 500 }}>{item.quantity} × {item.name}</span>
                            <span style={{ color: 'var(--text-muted)' }}>₹{fmt((item.price * item.quantity) * (1 - (item.discount || 0) / 100))}</span>
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
    </>
  );
}
