import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';
import { useUI } from '../context/UIContext';
import SupplierPriceCompareModal from '../components/SupplierPriceCompareModal';
import {
  ShoppingCart, Plus, Search, Trash2, Camera,
  RotateCcw, CheckCircle, X, ListPlus,
  UploadCloud, FileText, Barcode, AlertTriangle,
  TrendingUp, TrendingDown, Copy, ChevronRight,
  Package, Tag, Pill, Beaker, Edit3, Hash, Minus, Maximize2, Scale
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES = ['Ayurvedic', 'Baby Care', 'Baby Drops', 'Baby Food', 'Capsule', 'Chocolate', 'Contraceptive', 'Cream', 'Eye Drop', 'Feminine Care', 'Injection', 'IV Fluids', 'Medical Device', 'Ointment', 'OTC', 'Supplements', 'Supporter', 'Surgical', 'Surgical Items', 'Syrup', 'Tablet', 'Other'];
const SCHEDULES = ['OTC', 'H', 'H1', 'X', 'G', 'E'];
const GST_RATES = ['0', '5', '12', 'other'];
const QTY_UNITS = ['strip', 'tablet', 'capsule', 'box', 'bottle', 'vial', 'tube', 'sachet', 'piece'];
const ITEM_TYPES = [
  { id: 'PHARMA', label: 'Pharma', color: '#7C3AED', bg: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.35)' },
  { id: 'GENERIC', label: 'Generic', color: '#0891B2', bg: 'rgba(8,145,178,0.12)', border: 'rgba(8,145,178,0.35)' },
  { id: 'FMCG', label: 'FMCG', color: '#D97706', bg: 'rgba(217,119,6,0.12)', border: 'rgba(217,119,6,0.35)' },
  { id: 'PL', label: 'PL', color: '#059669', bg: 'rgba(5,150,105,0.12)', border: 'rgba(5,150,105,0.35)' },
];

const CATEGORY_ICONS = {
  Tablet: <Pill size={13} />, Capsule: <Pill size={13} />, Syrup: <Beaker size={13} />,
  Injection: <Beaker size={13} />, OTC: <Package size={13} />, Surgical: <Tag size={13} />,
  'Medical Device': <Package size={13} />, 'IV Fluids': <Beaker size={13} />,
  'Chocolate': <Package size={13} />, 'Supporter': <Tag size={13} />,
};

const STORAGE_CONDITIONS = ['Room Temperature', 'Refrigerated (2–8°C)', 'Deep Freeze (<0°C)'];
const UPPERCASE_FIELDS = new Set(['name', 'generic_name', 'brand_name', 'barcode']);
const RX_SCHEDULES = new Set(['H', 'H1', 'X']);

const DEFAULT_FORM = {
  // Section 1 – Basic Details
  name: '', generic_name: '', category: 'Tablet',
  schedule_category: 'OTC', brand_name: '',
  pieces_per_unit: '',
  item_type: 'PHARMA',
  // Section 2 – Purchase & Pricing
  hsn_code: '',
  purchase_price: '', mrp: '', selling_price: '',
  gst: '5', discount: '',
  gst_custom: '',
  // Section 3 – Stock Details
  batch: '', quantity: '', quantity_unit: 'strip',
  mfg_date: '', expiry: '',
  rack_location: '',
  reorder_level: '', reorder_unit: 'strip',
  storage_condition: 'Room Temperature',
  barcode: '',
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PurchaseEntry({ editingPurchase, onClearEdit }) {
  const { toast } = useUI();
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [compareProductId, setCompareProductId] = useState(null);
  const [compareProductName, setCompareProductName] = useState('');
  const [drawerBestPrice, setDrawerBestPrice] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentStatus, setPaymentStatus] = useState('paid');

  const [items, setItems] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiImage, setAiImage] = useState(null);
  const [aiFile, setAiFile] = useState(null);
  const [scannedItems, setScannedItems] = useState(null); // For AI review
  const [scannedHeader, setScannedHeader] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Product search bar (top of table)
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // Manual item modal
  const [manualOpen, setManualOpen] = useState(false);
  const [manualMinimized, setManualMinimized] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [formErrors, setFormErrors] = useState({});
  const [nameSuggestions, setNameSuggestions] = useState([]);
  const [onlineSuggestions, setOnlineSuggestions] = useState([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [showNameSug, setShowNameSug] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const nameInputRef = useRef(null);

  useEffect(() => { fetchInitialData(); }, []);

  useEffect(() => {
    const matched = products.find(p => p.name.toLowerCase() === form.name.trim().toLowerCase());
    if (matched) {
      axios.get(`${API_BASE}/api/products/${matched.id}/supplier-prices`)
        .then(res => {
          if (res.data && res.data.length > 0) {
            setDrawerBestPrice(res.data[0]);
          } else {
            setDrawerBestPrice(null);
          }
        })
        .catch(err => {
          console.error(err);
          setDrawerBestPrice(null);
        });
    } else {
      setDrawerBestPrice(null);
    }
  }, [form.name, products]);

  const autoFillFromExisting = useCallback((name) => {
    if (!name || editingIndex !== null) return;

    // 1. Current draft check
    const existingInDraft = [...items].reverse().find(it => it.name.toLowerCase() === name.trim().toLowerCase());
    if (existingInDraft) {
      setForm({
        name: existingInDraft.name || '',
        generic_name: existingInDraft.generic_name || '',
        category: existingInDraft.category || 'Tablet',
        schedule_category: existingInDraft.schedule_category || 'OTC',
        brand_name: existingInDraft.brand_name || '',
        pieces_per_unit: existingInDraft.pieces_per_unit || '',
        item_type: existingInDraft.item_type || 'PHARMA',
        hsn_code: existingInDraft.hsn_code || '',
        purchase_price: existingInDraft.purchase_price || '',
        mrp: existingInDraft.mrp || '',
        selling_price: existingInDraft.selling_price || '',
        gst: String(existingInDraft.gst || '5'),
        gst_custom: '',
        discount: existingInDraft.discount || '0',
        batch: existingInDraft.batch || '',
        quantity: existingInDraft.quantity || '',
        quantity_unit: existingInDraft.quantity_unit || 'strip',
        mfg_date: existingInDraft.mfg_date || '',
        expiry: existingInDraft.expiry || '',
        rack_location: existingInDraft.rack_location || '',
        reorder_level: existingInDraft.reorder_level || '',
        reorder_unit: existingInDraft.reorder_unit || 'strip',
        storage_condition: existingInDraft.storage_condition || 'Room Temperature',
        barcode: existingInDraft.barcode || '',
      });
      toast('Auto-filled details from current bill', 'success');
      return;
    }

    // 2. Database history check
    const matchedProduct = products.find(p => p.name.toLowerCase() === name.trim().toLowerCase());
    if (matchedProduct) {
      axios.get(`${API_BASE}/api/products/${matchedProduct.id}/latest-purchase-details`)
        .then(res => {
          const latest = res.data;
          setForm(prev => ({
            ...prev,
            name: matchedProduct.name,
            brand_name: matchedProduct.brand_name || prev.brand_name,
            generic_name: matchedProduct.salt_composition || prev.generic_name,
            mrp: latest?.mrp || matchedProduct.mrp || prev.mrp,
            purchase_price: latest?.purchase_price || matchedProduct.purchase_price || prev.purchase_price,
            selling_price: matchedProduct.price || prev.selling_price,
            category: matchedProduct.category || prev.category,
            gst: String(latest?.gst || matchedProduct.gst || prev.gst || '5'),
            pieces_per_unit: matchedProduct.pack_size || prev.pieces_per_unit,
            item_type: matchedProduct.item_type || prev.item_type || 'PHARMA',
            batch: latest?.batch || prev.batch || '',
            expiry: latest?.expiry || prev.expiry || '',
            rack_location: latest?.rack_location || prev.rack_location || '',
            storage_condition: latest?.storage_condition || prev.storage_condition || 'Room Temperature',
            barcode: latest?.barcode || matchedProduct.barcode || prev.barcode || '',
          }));
          toast('Auto-filled details from past purchase history', 'success');
        })
        .catch(err => {
          console.error(err);
        });
    }
  }, [items, products, editingIndex, toast]);

  useEffect(() => {
    if (editingPurchase) {
      setSelectedSupplier(editingPurchase.supplier_id || '');
      setInvoiceNo(editingPurchase.invoice_no || '');
      setPurchaseDate(editingPurchase.purchase_date || new Date().toISOString().split('T')[0]);
      setPaymentStatus(editingPurchase.payment_status || 'paid');
      setItems(editingPurchase.items ? editingPurchase.items.map(i => ({ ...i })) : []);
    }
  }, [editingPurchase]);

  const fetchInitialData = async () => {
    try {
      const [sRes, pRes] = await Promise.all([
        axios.get(`${API_BASE}/api/suppliers`),
        axios.get(`${API_BASE}/api/products`),
      ]);
      setSuppliers(sRes.data);
      setProducts(pRes.data);
    } catch (e) { console.error('fetchInitialData:', e); }
  };

  // ── Existing product-search addItem ────────────────────────────────────────
  const addItemFromSearch = (product) => {
    const newItem = {
      product_id: product.id,
      name: product.name,
      generic_name: product.salt_composition || '',
      brand_name: product.brand_name || '',
      category: product.category || 'Other',
      schedule_category: 'OTC',
      batch: '', expiry: '', quantity: 1,
      quantity_unit: 'strip',
      purchase_price: product.purchase_price || 0,
      pieces_per_unit: product.pack_size || 1,
      mrp: product.mrp || 0,
      selling_price: product.mrp || 0,
      gst: product.gst || 12, discount: 0, barcode: '', mfg_date: '',
    };
    setItems(prev => [...prev, newItem]);
    setProductSearch('');
    setShowProductDropdown(false);
  };

  const removeItem = (index) => setItems(items.filter((_, i) => i !== index));

  const updateItem = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  };

  // ── Totals ──────────────────────────────────────────────────────────────────
  const totals = useMemo(() => items.reduce((acc, item) => {
    const qty = parseFloat(item.quantity) || 0;
    const rate = parseFloat(item.purchase_price) || 0;
    const sub = qty * rate;
    const gst = sub * ((parseFloat(item.gst) || 0) / 100);
    return { subtotal: acc.subtotal + sub, gst: acc.gst + gst, total: acc.total + sub + gst };
  }, { subtotal: 0, gst: 0, total: 0 }), [items]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!selectedSupplier) { toast('Please select a supplier', 'warning'); return; }
    if (items.length === 0) { toast('Please add at least one item', 'warning'); return; }
    const invalid = items.find(i => !i.product_id || !i.batch || !i.expiry);
    if (invalid) { toast(`Item "${invalid.name || 'unknown'}" is missing Batch or Expiry.`, 'warning'); return; }
    setSubmitting(true);
    try {
      const payload = {
        supplier_id: selectedSupplier, invoice_no: invoiceNo,
        purchase_date: purchaseDate, total_amount: totals.subtotal,
        gst_total: totals.gst, net_amount: totals.total,
        payment_status: paymentStatus, items,
      };

      if (editingPurchase) {
        await axios.put(`${API_BASE}/api/purchases/${editingPurchase.id}`, payload);
        toast('Purchase edited successfully!', 'success');
        if (onClearEdit) onClearEdit();
      } else {
        await axios.post(`${API_BASE}/api/purchases`, payload);
        toast('Purchase recorded successfully!', 'success');
      }

      setItems([]); setInvoiceNo(''); setSelectedSupplier('');
      await fetchInitialData(); // refresh products list
    } catch (e) {
      console.error(e);
      toast('Failed to save purchase: ' + (e.response?.data?.error || e.message), 'error');
    } finally { setSubmitting(false); }
  };

  // ── AI Scan ─────────────────────────────────────────────────────────────────
  const handleAiScan = async () => {
    if (!aiFile) return;
    setScanning(true);
    const fd = new FormData();
    fd.append('billImage', aiFile);
    try {
      const res = await axios.post(`${API_BASE}/api/scan-bill`, fd);
      const scannedItemsData = res.data.items || [];

      const mapped = scannedItemsData.map((si, idx) => {
        const ex = products.find(p => p.name.toLowerCase() === si.name.toLowerCase());
        return {
          id: `scanned-${idx}`, // temporary ID for the review list
          selected: true, // selected by default
          product_id: ex ? ex.id : '',
          name: si.name, generic_name: '', brand_name: si.manufacturer || '',
          category: si.category || 'Other', schedule_category: 'OTC',
          batch: si.batch || '', expiry: si.expiry || '',
          pieces_per_unit: ex?.pack_size || 1,
          quantity: si.quantity || 1, quantity_unit: 'strip',
          purchase_price: si.purchase_price || 0,
          mrp: si.mrp || 0, selling_price: si.mrp || 0,
          gst: si.gst || 12, discount: 0, barcode: '', mfg_date: '',
        };
      });

      setScannedHeader({
        supplierName: res.data.supplierName || '',
        invoiceNo: res.data.invoiceNo || '',
        invoiceDate: res.data.invoiceDate || '',
      });
      setScannedItems(mapped);
      // We don't close the aiModal yet, we'll show the review UI inside it
    } catch (e) {
      console.error(e); toast('AI Scan failed: ' + e.message, 'error');
    } finally { setScanning(false); }
  };

  const handleImportScannedItems = () => {
    if (!scannedItems) return;

    // Auto-match supplier if we don't have one selected yet
    if (!selectedSupplier && scannedHeader?.supplierName) {
      // Find closest match or just ignore (could be advanced logic here)
      const matchedSupplier = suppliers.find(s =>
        s.name.toLowerCase().includes(scannedHeader.supplierName.toLowerCase()) ||
        scannedHeader.supplierName.toLowerCase().includes(s.name.toLowerCase())
      );
      if (matchedSupplier) setSelectedSupplier(matchedSupplier.id);
    }

    if (!invoiceNo && scannedHeader?.invoiceNo) setInvoiceNo(scannedHeader.invoiceNo);
    if (scannedHeader?.invoiceDate) setPurchaseDate(scannedHeader.invoiceDate);

    const selectedToImport = scannedItems.filter(i => i.selected).map(i => {
      const { id: _id, selected: _selected, ...rest } = i;
      return rest;
    });

    setItems(prev => [...prev, ...selectedToImport]);
    setScannedItems(null);
    setScannedHeader(null);
    setAiModalOpen(false);
    setAiImage(null);
    setAiFile(null);
  };

  const updateScannedItem = (id, field, value) => {
    setScannedItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  ).slice(0, 6);

  // ══════════════════════════════════════════════════════════════════════════
  // MANUAL ITEM MODAL logic
  // ══════════════════════════════════════════════════════════════════════════

  const openManualModal = (index = null) => {
    if (index !== null) {
      const item = items[index];
      setForm({
        name: item.name || '', generic_name: item.generic_name || '',
        category: item.category || 'Tablet', schedule_category: item.schedule_category || 'OTC',
        brand_name: item.brand_name || '',
        pieces_per_unit: item.pieces_per_unit || '',
        item_type: item.item_type || 'PHARMA',
        hsn_code: item.hsn_code || '',
        purchase_price: item.purchase_price || '', mrp: item.mrp || '',
        selling_price: item.selling_price || '', gst: String(item.gst || '5'),
        gst_custom: '', discount: item.discount || '',
        batch: item.batch || '', quantity: item.quantity || '',
        quantity_unit: item.quantity_unit || 'strip',
        mfg_date: item.mfg_date || '', expiry: item.expiry || '',
        rack_location: item.rack_location || '',
        reorder_level: item.reorder_level || '',
        reorder_unit: item.reorder_unit || 'strip',
        storage_condition: item.storage_condition || 'Room Temperature',
        barcode: item.barcode || '',
      });
      setEditingIndex(index);
    } else {
      setForm({ ...DEFAULT_FORM });
      setEditingIndex(null);
    }
    setFormErrors({});
    setDuplicateWarning(null);
    setManualOpen(true);
    setManualMinimized(false);
    setTimeout(() => nameInputRef.current?.focus(), 100);
  };

  const closeManualModal = () => {
    setManualOpen(false);
    setEditingIndex(null);
    setFormErrors({});
    setDuplicateWarning(null);
    setSaveSuccess(false);
    setManualMinimized(false);
  };


  const setField = useCallback((key, value) => {
    setForm(prev => {
      const coerced = UPPERCASE_FIELDS.has(key) && typeof value === 'string'
        ? value.toUpperCase()
        : value;
      const next = { ...prev, [key]: coerced };

      // Auto-calculate selling_price from mrp + discount
      if (key === 'mrp' || key === 'discount') {
        const mrp = parseFloat(key === 'mrp' ? coerced : next.mrp) || 0;
        const disc = parseFloat(key === 'discount' ? coerced : next.discount) || 0;
        next.selling_price = mrp > 0 ? (mrp * (1 - disc / 100)).toFixed(2) : '';
      }

      // Auto-fill category based on item name keywords
      if (key === 'name' && typeof coerced === 'string') {
        const upper = coerced;
        if (upper.includes(' TAB') || upper.includes('TAB ')) next.category = 'Tablet';
        else if (upper.includes(' CAP') || upper.includes('CAP ')) next.category = 'Capsule';
        else if (upper.includes(' SYP') || upper.includes('SYRUP')) next.category = 'Syrup';
        else if (upper.includes(' INJ') || upper.includes('VIAL')) next.category = 'Injection';
        else if (upper.includes(' OINT') || upper.includes('OINTMENT')) next.category = 'Ointment';
        else if (upper.includes(' CREAM')) next.category = 'Cream';
        else if (upper.includes(' DROP')) next.category = 'Eye Drop';
      }

      return next;
    });
    // Clear field error on change
    setFormErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
  }, []);

  // Name suggestions (local + online)
  useEffect(() => {
    if (form.name.length > 2) {
      // Local Database
      const localSugs = products.filter(p =>
        p.name.toLowerCase().includes(form.name.toLowerCase())
      ).slice(0, 6);
      setNameSuggestions(localSugs);
      setShowNameSug(true);

      // Online Search API
      setIsSearchingOnline(true);
      const delayDebounceFn = setTimeout(async () => {
        try {
          const res = await axios.get(`${API_BASE}/api/search-online?q=${encodeURIComponent(form.name)}`);
          setOnlineSuggestions(res.data.slice(0, 5));
        } catch (e) {
          console.error('Online search failed', e);
        } finally {
          setIsSearchingOnline(false);
        }
      }, 500);

      return () => clearTimeout(delayDebounceFn);
    } else {
      setShowNameSug(false);
      setOnlineSuggestions([]);
    }
  }, [form.name, products]);

  // Duplicate detection
  useEffect(() => {
    if (!form.name || !form.batch) { setDuplicateWarning(null); return; }
    const dupIdx = items.findIndex((it, i) =>
      i !== editingIndex &&
      it.name.toLowerCase() === form.name.toLowerCase() &&
      it.batch.toUpperCase() === form.batch.toUpperCase()
    );
    setDuplicateWarning(dupIdx >= 0 ? `Duplicate: "${form.name}" Batch ${form.batch} already in item #${dupIdx + 1}` : null);
  }, [form.name, form.batch, items, editingIndex]);

  // Smart values
  const effectiveGst = form.gst === 'other' ? (parseFloat(form.gst_custom) || 0) : (parseFloat(form.gst) || 0);
  const purchaseNum = parseFloat(form.purchase_price) || 0;
  const mrpNum = parseFloat(form.mrp) || 0;
  const discountNum = parseFloat(form.discount) || 0;
  const sellingNum = parseFloat(form.selling_price) || (mrpNum > 0 ? mrpNum * (1 - discountNum / 100) : 0);
  const marginPct = mrpNum > 0 ? ((mrpNum - purchaseNum) / mrpNum * 100) : null;
  const marginAfterDiscount = sellingNum > 0 && purchaseNum >= 0 ? ((sellingNum - purchaseNum) / sellingNum * 100) : null;
  const mrpError = mrpNum > 0 && purchaseNum > 0 && purchaseNum > mrpNum;

  // Validate
  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Item name is required';
    if (!form.purchase_price) errs.purchase_price = 'Purchase price is required';
    if (!form.mrp) errs.mrp = 'MRP is required';
    if (!form.pieces_per_unit) errs.pieces_per_unit = 'Pack size is required';
    if (!form.item_type) errs.item_type = 'Item type is required';
    if (form.discount === '' || form.discount === null || form.discount === undefined) errs.discount = 'Discount is required (enter 0 if none)';
    if (!form.batch.trim()) errs.batch = 'Batch number is required';
    if (!form.quantity) errs.quantity = 'Quantity is required';
    if (!form.expiry) errs.expiry = 'Expiry date is required';
    if (mrpError) errs.mrp = 'MRP cannot be less than purchase price';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const buildItemFromForm = async () => {
    // Resolve product_id
    let product_id = '';
    const match = products.find(p => p.name.toLowerCase() === form.name.trim().toLowerCase());
    if (match) {
      product_id = match.id;
    } else {
      // Quick-create the product
      try {
        const res = await axios.post(`${API_BASE}/api/products/quick`, {
          name: form.name.trim(),
          brand_name: form.brand_name.trim(),
          salt_composition: form.generic_name.trim(),
          category: form.category,
          mrp: parseFloat(form.mrp) || 0,
          purchase_price: parseFloat(form.purchase_price) || 0,
          gst: effectiveGst,
          pack_size: parseFloat(form.pieces_per_unit) || 1,
          item_type: form.item_type || 'PHARMA',
        });
        product_id = res.data.id;
        // Refresh product list so duplication detection works going forward
        const pRes = await axios.get(`${API_BASE}/api/products`);
        setProducts(pRes.data);
      } catch (e) {
        toast('Failed to auto-register new medicine: ' + (e.response?.data?.error || e.message), 'error');
        return null;
      }
    }

    return {
      product_id,
      name: form.name.trim(),
      generic_name: form.generic_name.trim(),
      brand_name: form.brand_name.trim(),
      hsn_code: form.hsn_code.trim(),
      category: form.category,
      schedule_category: form.schedule_category,
      item_type: form.item_type || 'PHARMA',
      pieces_per_unit: parseFloat(form.pieces_per_unit) || null,
      batch: form.batch.trim().toUpperCase(),
      expiry: form.expiry,
      mfg_date: form.mfg_date,
      quantity: parseFloat(form.quantity) || 1,
      quantity_unit: form.quantity_unit,
      rack_location: form.rack_location.trim(),
      reorder_level: parseFloat(form.reorder_level) || null,
      reorder_unit: form.reorder_unit,
      storage_condition: form.storage_condition,
      purchase_price: parseFloat(form.purchase_price) || 0,
      mrp: parseFloat(form.mrp) || 0,
      selling_price: parseFloat(form.selling_price) || 0,
      gst: effectiveGst,
      discount: parseFloat(form.discount) || 0,
      barcode: form.barcode.trim(),
    };
  };

  const handleSaveAndAddNew = async () => {
    if (!validate()) return;
    const item = await buildItemFromForm();
    if (!item) return;
    if (editingIndex !== null) {
      const updated = [...items]; updated[editingIndex] = item; setItems(updated);
    } else {
      setItems(prev => [...prev, item]);
    }
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 1800);
    setForm({ ...DEFAULT_FORM });
    setEditingIndex(null);
    setFormErrors({});
    setDuplicateWarning(null);
    nameInputRef.current?.focus();
  };

  const handleSaveAndExit = async () => {
    if (!validate()) return;
    const item = await buildItemFromForm();
    if (!item) return;
    if (editingIndex !== null) {
      const updated = [...items]; updated[editingIndex] = item; setItems(updated);
    } else {
      setItems(prev => [...prev, item]);
    }
    closeManualModal();
  };

  // ── Enter Key Navigation ──────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
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
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-115px)] flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }} onKeyDown={handleKeyDown}>

      {/* ── HEADER ── */}
      <div className="flex justify-between items-end mb-6 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
            {editingPurchase ? `Edit Purchase Bill #${editingPurchase.invoice_no || editingPurchase.id}` : 'Purchase Entry'}
          </h1>
          <p className="text-sm font-medium mt-1" style={{ color: 'var(--text-muted)' }}>
            {editingPurchase ? 'Modify an existing purchase and update stock.' : 'Record new stock purchases and update inventory details.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {editingPurchase && (
            <button
              onClick={() => {
                setItems([]); setInvoiceNo(''); setSelectedSupplier('');
                if (onClearEdit) onClearEdit();
              }}
              className="px-4 py-2 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-colors shadow-sm"
            >
              Cancel Edit
            </button>
          )}
          <button
            onClick={() => openManualModal(null)}
            className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-xl hover:bg-violet-100 transition-colors shadow-sm"
          >
            <Edit3 size={16} /> Add Item Manually
          </button>
          <button
            onClick={() => setAiModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors shadow-sm"
          >
            <Camera size={18} /> AI Scan Invoice
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-600/20 transition-all border border-emerald-500 disabled:opacity-60"
          >
            {submitting ? <RotateCcw size={16} className="animate-spin" /> : <CheckCircle size={18} />}
            Complete Purchase
          </button>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="flex-1 flex gap-6 overflow-hidden min-h-0">

        {/* LEFT: Invoice header + totals */}
        <div className="w-80 flex flex-col gap-4 flex-shrink-0 min-h-0 overflow-y-auto">
          <div className="rounded-2xl p-5 shadow-sm space-y-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
              <FileText size={14} className="text-indigo-500" /> Invoice Header
            </h3>

            <div>
              <label className="block text-[10px] font-bold uppercase mb-1.5 ml-1" style={{ color: 'var(--text-light)' }}>Supplier</label>
              <select
                value={selectedSupplier}
                onChange={e => setSelectedSupplier(e.target.value)}
                style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', fontSize: 14, color: 'var(--text)', outline: 'none', fontWeight: 500 }}
              >
                <option value="">Select Supplier...</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase mb-1.5 ml-1" style={{ color: 'var(--text-light)' }}>Invoice No</label>
                <input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)}
                  placeholder="INV/2026/01"
                  style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', fontFamily: 'monospace' }} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase mb-1.5 ml-1" style={{ color: 'var(--text-light)' }}>Date</label>
                <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)}
                  style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none' }} />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase mb-1.5 ml-1" style={{ color: 'var(--text-light)' }}>Payment Status</label>
              <div className="flex p-1 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                {['paid', 'pending'].map(s => (
                  <button key={s} onClick={() => setPaymentStatus(s)}
                    style={paymentStatus === s ? { background: 'var(--surface)', color: '#4F46E5', borderRadius: 8, padding: '6px', fontWeight: 700, fontSize: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' } : { background: 'none', color: 'var(--text-muted)', borderRadius: 8, padding: '6px', fontWeight: 700, fontSize: 12, border: 'none' }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="bg-indigo-900 border border-indigo-950 rounded-2xl p-5 shadow-lg shadow-indigo-900/20 text-white space-y-4">
            <h3 className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest text-center">Summary</h3>
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm"><span className="text-indigo-200">Subtotal</span><span className="font-bold">₹{totals.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-indigo-200">Total GST</span><span className="font-bold">₹{totals.gst.toFixed(2)}</span></div>
              <div className="h-px bg-indigo-800 my-2" />
              <div className="flex justify-between items-end">
                <span className="text-xs font-bold text-indigo-300 uppercase">Net Amount</span>
                <span className="text-2xl font-black">₹{totals.total.toFixed(2)}</span>
              </div>
            </div>
            <div className="pt-2 border-t border-indigo-800">
              <p className="text-[10px] text-indigo-400 text-center">{items.length} item{items.length !== 1 ? 's' : ''} in this purchase</p>
            </div>
          </div>
        </div>

        {/* RIGHT: Items table */}
        <div className="flex-1 rounded-2xl shadow-sm flex flex-col min-w-0" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {/* search bar */}
          <div className="p-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="relative flex-1 group">
              <Search size={16} className="absolute left-3 top-2.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              <input
                type="text"
                placeholder="Search existing products to add..."
                value={productSearch}
                onFocus={() => setShowProductDropdown(true)}
                onChange={e => setProductSearch(e.target.value)}
                onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && filteredProducts.length > 0) {
                    e.preventDefault();
                    addItemFromSearch(filteredProducts[0]);
                  }
                }}
                style={{ width: '100%', paddingLeft: 36, paddingRight: 16, paddingTop: 8, paddingBottom: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 13, color: 'var(--text)', outline: 'none', fontWeight: 500 }}
              />
              {showProductDropdown && productSearch && (
                <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl shadow-xl z-20 overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  {filteredProducts.map(p => (
                    <button key={p.id} onMouseDown={() => addItemFromSearch(p)}
                      className="w-full text-left px-4 py-3 flex justify-between items-center transition-colors hover:bg-indigo-500/10" style={{ borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div className="font-bold text-sm" style={{ color: 'var(--text)' }}>{p.name}</div>
                        <div className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-light)' }}>{p.brand_name} • {p.salt_composition}</div>
                      </div>
                      <div className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 flex-shrink-0 ml-2">Add</div>
                    </button>
                  ))}
                  {filteredProducts.length === 0 && (
                    <div className="px-4 py-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No products found. Use "Add Item Manually" to add a new medicine.</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                <tr>
                  {['#', 'Item Description', 'Batch', 'Expiry', 'Qty', 'Rate (₹)', 'MRP (₹)', 'GST %', 'Margin', 'Subtotal', ''].map((h, i) => (
                    <th key={i} className="py-2.5 px-3 text-[10px] font-black uppercase whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ borderTop: 'none' }}>
                {items.map((item, idx) => {
                  const pp = parseFloat(item.purchase_price) || 0;
                  const mp = parseFloat(item.mrp) || 0;
                  const margin = mp > 0 ? ((mp - pp) / mp * 100) : null;
                  const hasError = pp > 0 && mp > 0 && pp > mp;
                  return (
                    <tr key={idx} className="group transition-colors" style={{ borderBottom: '1px solid var(--border)', background: hasError ? 'rgba(239,68,68,0.08)' : 'transparent' }} onMouseEnter={e => e.currentTarget.style.background = hasError ? 'rgba(239,68,68,0.12)' : 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = hasError ? 'rgba(239,68,68,0.08)' : 'transparent'}>
                      <td className="py-3 px-3 text-xs font-bold" style={{ color: 'var(--text-light)' }}>{idx + 1}</td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-sm leading-tight" style={{ color: 'var(--text)' }}>{item.name || 'New Item'}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {item.brand_name && <span className="text-[9px] font-bold text-slate-400 uppercase">{item.brand_name}</span>}
                          {item.category && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">
                              {CATEGORY_ICONS[item.category]}{item.category}
                            </span>
                          )}
                          {item.schedule_category && item.schedule_category !== 'OTC' && (
                            <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">Sch-{item.schedule_category}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <input type="text" value={item.batch}
                          onChange={e => updateItem(idx, 'batch', e.target.value.toUpperCase())}
                          style={{ width: 96, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: 'var(--text)', outline: 'none' }}
                          placeholder="BATCH" />
                      </td>
                      <td className="py-3 px-3">
                        <input type="month" value={item.expiry}
                          onChange={e => updateItem(idx, 'expiry', e.target.value)}
                          style={{ width: 128, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', fontSize: 12, fontWeight: 700, color: 'var(--text)', outline: 'none' }} />
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1">
                          <input type="number" value={item.quantity}
                            onChange={e => updateItem(idx, 'quantity', e.target.value)}
                            style={{ width: 56, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', fontSize: 12, fontWeight: 700, color: 'var(--text)', outline: 'none' }}
                            min="1" />
                          <span className="text-[9px] font-medium" style={{ color: 'var(--text-light)' }}>{item.quantity_unit || ''}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <input type="number" value={item.purchase_price}
                          onChange={e => updateItem(idx, 'purchase_price', e.target.value)}
                          style={{ width: 80, border: `1px solid ${hasError ? '#F87171' : 'var(--border)'}`, borderRadius: 8, padding: '6px 8px', fontSize: 12, fontWeight: 700, background: hasError ? 'rgba(239,68,68,0.1)' : 'var(--surface-2)', color: hasError ? '#F87171' : '#22C55E', outline: 'none' }}
                          step="0.01" />
                      </td>
                      <td className="py-3 px-3">
                        <input type="number" value={item.mrp}
                          onChange={e => updateItem(idx, 'mrp', e.target.value)}
                          style={{ width: 80, border: `1px solid ${hasError ? '#F87171' : 'var(--border)'}`, borderRadius: 8, padding: '6px 8px', fontSize: 12, fontWeight: 700, background: hasError ? 'rgba(239,68,68,0.1)' : 'var(--surface-2)', color: hasError ? '#F87171' : 'var(--text)', outline: 'none' }}
                          step="0.01" />
                        {hasError && <div className="text-[9px] text-red-500 font-bold mt-0.5">MRP &lt; Rate!</div>}
                      </td>
                      <td className="py-3 px-3">
                        <select value={item.gst} onChange={e => updateItem(idx, 'gst', e.target.value)}
                          style={{ width: 64, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px', fontSize: 12, fontWeight: 700, color: 'var(--text)', outline: 'none' }}>
                          <option value="0">0%</option><option value="5">5%</option>
                          <option value="12">12%</option><option value="18">18%</option>
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        {margin !== null && (
                          <span className={`inline-flex items-center gap-0.5 text-xs font-black px-1.5 py-0.5 rounded ${margin >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                            {margin >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {Math.abs(margin).toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-sm whitespace-nowrap" style={{ color: 'var(--text)' }}>
                        ₹{((parseFloat(item.quantity) || 0) * (parseFloat(item.purchase_price) || 0)).toFixed(2)}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.product_id && (
                            <button onClick={() => { setCompareProductId(item.product_id); setCompareProductName(item.name); }}
                              className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-all" title="Compare Prices">
                              <Scale size={14} />
                            </button>
                          )}
                          <button onClick={() => openManualModal(idx)}
                            className="p-1.5 text-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Edit">
                            <Edit3 size={14} />
                          </button>
                          <button onClick={() => removeItem(idx)}
                            className="p-1.5 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Remove">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={11} className="py-28 text-center" style={{ color: 'var(--text-muted)' }}>
                      <ListPlus size={48} className="mx-auto mb-4 opacity-10" />
                      <p className="text-lg font-medium" style={{ color: 'var(--text-muted)' }}>No items added yet</p>
                      <p className="text-sm mt-1" style={{ color: 'var(--text-light)' }}>Search existing products above, use <strong>Add Item Manually</strong>, or <strong>AI Scan</strong>.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          MANUAL ITEM DRAWER / MODAL
      ════════════════════════════════════════════════════════════════════════ */}
      {manualOpen && !manualMinimized && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', background: 'var(--surface)', animation: 'slideInRight 0.2s ease' }}>

          {/* Full-Screen Header */}
          <div style={{ background: 'linear-gradient(135deg,#4C1D95 0%,#7C3AED 50%,#8B5CF6 100%)', padding: '0 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60, flexShrink: 0, boxShadow: '0 2px 16px rgba(124,58,237,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: 8, display: 'flex' }}>
                <Edit3 size={20} color="white" />
              </div>
              <div>
                <div style={{ color: 'white', fontWeight: 800, fontSize: 17, letterSpacing: '-0.3px' }}>
                  {editingIndex !== null ? `Edit Item #${editingIndex + 1}` : 'Add Item Manually'}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Fill in the medicine details below</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setManualMinimized(true)}
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, cursor: 'pointer', color: 'white', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                <Minus size={15} /> Minimize
              </button>
              <button onClick={closeManualModal}
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, cursor: 'pointer', color: 'white', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                <X size={15} /> Close
              </button>
            </div>
          </div>

          {/* Save success flash */}
          {saveSuccess && (
            <div className="mx-6 mt-3 flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-bold px-4 py-2.5 rounded-xl">
              <CheckCircle size={16} /> Item saved! Add another item below.
            </div>
          )}

          {/* Duplicate warning */}
          {duplicateWarning && (
            <div className="mx-6 mt-3 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold px-4 py-2.5 rounded-xl">
              <Copy size={14} /> {duplicateWarning}
            </div>
          )}

          {/* Scrollable form body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 40px', display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* ── 3-COLUMN FULL-SCREEN LAYOUT ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, alignItems: 'start' }}>

              {/* COL 1 – Basic Details */}
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderTop: '3px solid #7C3AED', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Pill size={13} /> Basic Details
                </div>

                <div style={{ position: 'relative' }}>
                  <FieldLabel required>Item Name</FieldLabel>
                  <input ref={nameInputRef} type="text" value={form.name}
                    onChange={e => setField('name', e.target.value)}
                    onBlur={() => {
                      setTimeout(() => {
                        setShowNameSug(false);
                        if (form.name.trim()) {
                          autoFillFromExisting(form.name.trim());
                        }
                      }, 200);
                    }}
                    onFocus={() => form.name.length > 1 && setShowNameSug(nameSuggestions.length > 0)}
                    placeholder="e.g. DOLO 650 TAB 1×15" className="field-input"
                    style={formErrors.name ? { borderColor: '#F87171', background: 'rgba(239,68,68,0.12)', textTransform: 'uppercase' } : { textTransform: 'uppercase' }} />
                  {formErrors.name && <InlineError>{formErrors.name}</InlineError>}
                  {showNameSug && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 30, overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      {nameSuggestions.length > 0 && (
                        <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', background: 'var(--surface-2)', textTransform: 'uppercase' }}>
                          Local Database
                        </div>
                      )}
                      {nameSuggestions.map(p => (
                        <button key={p.id} onMouseDown={() => {
                          setShowNameSug(false);
                          autoFillFromExisting(p.name);
                        }}
                          style={{ width: '100%', textAlign: 'left', padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text)' }}>
                          <span style={{ fontWeight: 700 }}>{p.name}</span>
                          <span style={{ fontSize: 11, marginLeft: 8, color: 'var(--text-muted)' }}>{p.brand_name}</span>
                        </button>
                      ))}

                      {isSearchingOnline && (
                        <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          Searching online...
                        </div>
                      )}

                      {!isSearchingOnline && onlineSuggestions.length > 0 && (
                        <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 800, color: '#059669', background: 'rgba(5,150,105,0.1)', textTransform: 'uppercase', borderTop: '1px solid var(--border)' }}>
                          Online Suggestions
                        </div>
                      )}
                      {!isSearchingOnline && onlineSuggestions.map(p => (
                        <button key={`online-${p.id}`} onMouseDown={() => {
                          setForm(prev => ({
                            ...prev,
                            name: p.name,
                            brand_name: p.brand_name || prev.brand_name,
                            generic_name: p.generic_name || prev.generic_name,
                            mrp: p.mrp || prev.mrp,
                            purchase_price: p.mrp ? (p.mrp * 0.7).toFixed(2) : prev.purchase_price,
                            selling_price: p.mrp ? p.mrp : prev.selling_price,
                            schedule_category: p.schedule_category || prev.schedule_category,
                          }));
                          setShowNameSug(false);
                        }}
                          style={{ width: '100%', textAlign: 'left', padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text)' }}>
                          <span style={{ fontWeight: 700, color: '#059669' }}>{p.name}</span>
                          <span style={{ fontSize: 11, marginLeft: 8, color: 'var(--text-muted)' }}>{p.brand_name}</span>
                          {p.mrp > 0 && <span style={{ fontSize: 11, marginLeft: 8, fontWeight: 700, float: 'right' }}>₹{p.mrp}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <FieldLabel>Generic / Salt Name</FieldLabel>
                  <input type="text" value={form.generic_name} onChange={e => setField('generic_name', e.target.value)} placeholder="e.g. PARACETAMOL" className="field-input" style={{ textTransform: 'uppercase' }} />
                </div>

                <div>
                  <FieldLabel>Brand / Company</FieldLabel>
                  <input type="text" value={form.brand_name} onChange={e => setField('brand_name', e.target.value)} placeholder="e.g. CIPLA" className="field-input" style={{ textTransform: 'uppercase' }} />
                </div>

                <div>
                  <FieldLabel>Category</FieldLabel>
                  <div style={{
                    maxHeight: 112,
                    overflowY: 'auto',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    padding: '8px 10px',
                    background: 'var(--surface)',
                    border: '1.5px solid var(--border)',
                    borderRadius: 10,
                  }}>
                    {CATEGORIES.map(c => {
                      const active = form.category === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setField('category', c)}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 20,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: active ? '1.5px solid #7C3AED' : '1.5px solid var(--border)',
                            background: active ? 'rgba(124,58,237,0.14)' : 'var(--surface-2)',
                            color: active ? '#7C3AED' : 'var(--text-muted)',
                            transition: 'all 0.15s',
                            whiteSpace: 'nowrap',
                            letterSpacing: '0.02em',
                          }}
                        >{c}</button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <FieldLabel>Schedule</FieldLabel>
                    <select value={form.schedule_category} onChange={e => setField('schedule_category', e.target.value)} className="field-input">
                      {SCHEDULES.map(s => <option key={s} value={s}>Sch-{s}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <FieldLabel required>Pack Size</FieldLabel>
                  <div style={{ position: 'relative' }}>
                    <input type="number" value={form.pieces_per_unit} onChange={e => setField('pieces_per_unit', e.target.value)}
                      placeholder="e.g. 10 tablets per strip" min="1" step="1" className="field-input"
                      style={formErrors.pieces_per_unit ? { borderColor: '#F87171', background: 'rgba(239,68,68,0.12)' } : {}} />
                    {form.pieces_per_unit && (
                      <span style={{ position: 'absolute', right: 10, top: 9, fontSize: 10, fontWeight: 700, color: '#7C3AED', background: 'rgba(124,58,237,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                        {form.pieces_per_unit} pcs
                      </span>
                    )}
                  </div>
                  {formErrors.pieces_per_unit && <InlineError>{formErrors.pieces_per_unit}</InlineError>}
                  <p style={{ fontSize: 10, marginTop: 4, color: 'var(--text-muted)' }}>
                    {form.pieces_per_unit && form.quantity ? `Total: ${parseFloat(form.quantity) * parseFloat(form.pieces_per_unit)} pcs` : `Pieces in 1 ${form.quantity_unit || 'unit'}`}
                  </p>
                </div>

                {/* ── Item Type Pill Toggle ── */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                    Item Type <span className="text-red-400 ml-0.5">*</span>
                  </div>
                  <div style={{
                    display: 'flex',
                    background: 'var(--surface)',
                    border: '1.5px solid var(--border)',
                    borderRadius: 999,
                    padding: 3,
                    gap: 2,
                  }}>
                    {ITEM_TYPES.map(t => {
                      const active = form.item_type === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setField('item_type', t.id)}
                          style={{
                            flex: 1,
                            padding: '5px 4px',
                            borderRadius: 999,
                            border: 'none',
                            background: active ? t.bg : 'transparent',
                            color: active ? t.color : 'var(--text-muted)',
                            fontWeight: active ? 800 : 600,
                            fontSize: 11,
                            cursor: 'pointer',
                            letterSpacing: '0.4px',
                            textTransform: 'uppercase',
                            transition: 'all 0.18s ease',
                            boxShadow: active ? `0 1px 6px ${t.border}` : 'none',
                            outline: 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* COL 2 – Stock Details + Additional */}
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderTop: '3px solid #2563EB', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Package size={13} /> Stock Details
                </div>

                <div>
                  <FieldLabel required>Batch Number</FieldLabel>
                  <input type="text" value={form.batch}
                    onChange={e => setField('batch', e.target.value.toUpperCase())}
                    placeholder="e.g. AB12345"
                    className="field-input font-mono tracking-wider"
                    style={formErrors.batch ? { borderColor: '#F87171', background: 'rgba(239,68,68,0.12)' } : {}} />
                  {formErrors.batch && <InlineError>{formErrors.batch}</InlineError>}
                </div>

                {/* Barcode moved up — right after Batch */}
                <div>
                  <FieldLabel>Barcode</FieldLabel>
                  <div style={{ position: 'relative' }}>
                    <input type="text" value={form.barcode} onChange={e => setField('barcode', e.target.value)}
                      placeholder="Scan or enter barcode" className="field-input" style={{ paddingRight: 36 }} />
                    <span style={{ position: 'absolute', right: 10, top: 9, color: 'var(--text-muted)' }}><Barcode size={16} /></span>
                  </div>
                </div>

                <div>
                  <FieldLabel required>Quantity</FieldLabel>
                  <div className="flex gap-2 items-center">
                    <input type="number" value={form.quantity} min="1"
                      onChange={e => setField('quantity', e.target.value)}
                      placeholder="0"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        background: formErrors.quantity ? 'rgba(239,68,68,0.12)' : 'var(--surface-2)',
                        border: `1.5px solid ${formErrors.quantity ? '#F87171' : 'var(--border)'}`,
                        borderRadius: 10,
                        padding: '8px 12px',
                        fontSize: 13,
                        fontFamily: 'inherit',
                        color: 'var(--text)',
                        outline: 'none',
                        transition: 'border-color 0.15s',
                      }} />
                    <select value={form.quantity_unit} onChange={e => setField('quantity_unit', e.target.value)}
                      style={{
                        width: 96,
                        flexShrink: 0,
                        background: 'var(--surface-2)',
                        border: '1.5px solid var(--border)',
                        borderRadius: 10,
                        padding: '8px 10px',
                        fontSize: 13,
                        fontFamily: 'inherit',
                        color: 'var(--text)',
                        outline: 'none',
                      }}>
                      {QTY_UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                  {formErrors.quantity && <InlineError>{formErrors.quantity}</InlineError>}
                </div>

                <div>
                  <FieldLabel required>Expiry Date</FieldLabel>
                  <input type="month" value={form.expiry}
                    onChange={e => setField('expiry', e.target.value)}
                    className="field-input"
                    style={formErrors.expiry ? { borderColor: '#F87171', background: 'rgba(239,68,68,0.12)' } : {}} />
                  {formErrors.expiry && <InlineError>{formErrors.expiry}</InlineError>}
                  {form.expiry && (() => {
                    const exp = new Date(form.expiry + '-01');
                    const now = new Date();
                    const diff = (exp - now) / (1000 * 60 * 60 * 24 * 30);
                    if (diff < 0) return <InlineError type="danger">This batch has already expired!</InlineError>;
                    if (diff < 3) return <InlineError type="warning">Expires in less than 3 months</InlineError>;
                    return null;
                  })()}
                </div>

                {/* ── Extra Stock Fields ── */}
                <div>
                  <FieldLabel>Rack / Location</FieldLabel>
                  <input type="text" value={form.rack_location}
                    onChange={e => setField('rack_location', e.target.value)}
                    placeholder="e.g. A3, Shelf 2"
                    className="field-input" />
                </div>

                <div>
                  <FieldLabel>Reorder Level</FieldLabel>
                  <div className="flex gap-2 items-center">
                    <input type="number" value={form.reorder_level} min="0"
                      onChange={e => setField('reorder_level', e.target.value)}
                      placeholder="Min stock before alert"
                      style={{
                        flex: 1, minWidth: 0,
                        background: 'var(--surface-2)',
                        border: '1.5px solid var(--border)',
                        borderRadius: 10, padding: '8px 12px',
                        fontSize: 13, fontFamily: 'inherit',
                        color: 'var(--text)', outline: 'none',
                      }} />
                    <select value={form.reorder_unit} onChange={e => setField('reorder_unit', e.target.value)}
                      style={{
                        width: 96, flexShrink: 0,
                        background: 'var(--surface-2)',
                        border: '1.5px solid var(--border)',
                        borderRadius: 10, padding: '8px 10px',
                        fontSize: 13, fontFamily: 'inherit',
                        color: 'var(--text)', outline: 'none',
                      }}>
                      {QTY_UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <FieldLabel>Storage Condition</FieldLabel>
                  <select value={form.storage_condition} onChange={e => setField('storage_condition', e.target.value)} className="field-input">
                    {STORAGE_CONDITIONS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>

              </div>

              {/* COL 3 – Purchase & Pricing */}
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderTop: '3px solid #059669', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Tag size={13} /> Purchase &amp; Pricing
                </div>
                <div>
                  <FieldLabel>HSN Code (optional)</FieldLabel>
                  <input type="text" value={form.hsn_code}
                    onChange={e => setField('hsn_code', e.target.value)}
                    placeholder="e.g. 30049099"
                    className="field-input font-mono"
                    style={formErrors.hsn_code ? { borderColor: '#F87171', background: 'rgba(239,68,68,0.12)' } : {}} />
                  {formErrors.hsn_code && <InlineError>{formErrors.hsn_code}</InlineError>}
                </div>

                <div>
                  <FieldLabel required>MRP (₹)</FieldLabel>
                  <input type="number" value={form.mrp} min="0" step="0.01"
                    onChange={e => setField('mrp', e.target.value)}
                    placeholder="0.00"
                    className="field-input font-mono"
                    style={mrpError ? { borderColor: '#F87171', background: 'rgba(239,68,68,0.12)', color: '#F87171' } : formErrors.mrp ? { borderColor: '#F87171', background: 'rgba(239,68,68,0.12)', color: 'var(--text)' } : { color: 'var(--text)' }} />
                  {mrpError && <InlineError type="warning">MRP is less than purchase price!</InlineError>}
                  {!mrpError && formErrors.mrp && <InlineError>{formErrors.mrp}</InlineError>}
                </div>

                <div>
                  <FieldLabel required>Purchase Price (₹)</FieldLabel>
                  <input type="number" value={form.purchase_price} min="0" step="0.01"
                    onChange={e => setField('purchase_price', e.target.value)}
                    placeholder="0.00"
                    className="field-input font-mono"
                    style={formErrors.purchase_price ? { borderColor: '#F87171', background: 'rgba(239,68,68,0.12)', color: 'var(--text)' } : { color: '#22C55E' }} />
                  {formErrors.purchase_price && <InlineError>{formErrors.purchase_price}</InlineError>}
                  {drawerBestPrice && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#16A34A', marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>Best price: ₹{drawerBestPrice.best_price.toFixed(2)} from {drawerBestPrice.supplier_name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const matched = products.find(p => p.name.toLowerCase() === form.name.trim().toLowerCase());
                          if (matched) {
                            setCompareProductId(matched.id);
                            setCompareProductName(matched.name);
                          }
                        }}
                        style={{ color: '#4F46E5', textDecoration: 'underline', border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontWeight: 800 }}
                      >
                        (Compare)
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <FieldLabel required>Discount %</FieldLabel>
                  <input type="number" value={form.discount} min="0" max="100" step="0.01"
                    onChange={e => setField('discount', e.target.value)}
                    placeholder="0" className="field-input"
                    style={formErrors.discount ? { borderColor: '#F87171', background: 'rgba(239,68,68,0.12)', color: 'var(--text)' } : {}} />
                  {formErrors.discount && <InlineError>{formErrors.discount}</InlineError>}
                </div>

                <div>
                  <FieldLabel>Selling Price (₹)</FieldLabel>
                  <input type="number" value={form.selling_price} min="0" step="0.01"
                    onChange={e => setField('selling_price', e.target.value)}
                    placeholder="Auto-calculated"
                    className="field-input font-mono"
                    style={{ color: '#818CF8' }} />
                  <p className="text-[10px] mt-1 ml-0.5" style={{ color: 'var(--text-light)' }}>Auto-filled from MRP − Discount</p>
                </div>

                <div>
                  <FieldLabel>GST %</FieldLabel>
                  <select value={form.gst} onChange={e => setField('gst', e.target.value)} className="field-input">
                    <option value="0">0%</option>
                    <option value="5">5%</option>
                    <option value="12">12%</option>
                    <option value="18">18%</option>
                    <option value="other">Other...</option>
                  </select>
                </div>

                {form.gst === 'other' && (
                  <div>
                    <FieldLabel>Custom GST %</FieldLabel>
                    <input type="number" value={form.gst_custom} min="0" step="0.01"
                      onChange={e => setField('gst_custom', e.target.value)}
                      placeholder="e.g. 28" className="field-input" />
                  </div>
                )}

                {/* Margin display */}
                {(marginPct !== null || marginAfterDiscount !== null) && (
                  <div className="col-span-2 space-y-2">
                    {/* Gross margin (MRP basis) */}
                    {marginPct !== null && (
                      <div className={`flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border font-bold text-sm ${mrpError
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : marginPct >= 15
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : marginPct >= 5
                            ? 'bg-amber-50 border-amber-200 text-amber-700'
                            : 'bg-red-50 border-red-200 text-red-700'
                        }`}>
                        <span className="flex items-center gap-2">
                          {mrpError
                            ? <><AlertTriangle size={15} /> MRP &lt; Purchase Price — please correct</>
                            : marginPct >= 15
                              ? <><TrendingUp size={15} /> Gross Margin (MRP basis)</>
                              : marginPct >= 5
                                ? <><TrendingUp size={15} /> Gross Margin (MRP basis)</>
                                : <><TrendingDown size={15} /> Gross Margin (MRP basis)</>}
                        </span>
                        {!mrpError && (
                          <span className="text-base font-black tabular-nums">{marginPct.toFixed(1)}%</span>
                        )}
                      </div>
                    )}

                    {/* Net margin after discount */}
                    {marginAfterDiscount !== null && discountNum > 0 && (
                      <div className={`flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border font-bold text-sm ${marginAfterDiscount >= 15
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : marginAfterDiscount >= 5
                          ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : 'bg-red-50 border-red-200 text-red-700'
                        }`}>
                        <span className="flex items-center gap-2">
                          {marginAfterDiscount >= 15
                            ? <><TrendingUp size={15} /> Net Margin (after {discountNum}% discount)</>
                            : marginAfterDiscount >= 5
                              ? <><TrendingUp size={15} /> Net Margin (after {discountNum}% discount)</>
                              : <><TrendingDown size={15} /> Net Margin (after {discountNum}% discount)</>}
                        </span>
                        <span className="text-base font-black tabular-nums">{marginAfterDiscount.toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div> {/* end 3-col grid */}
          </div>

          {/* ── Footer ── */}
          <div style={{ flexShrink: 0, padding: '16px 40px', display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <button onClick={handleSaveAndAddNew}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7C3AED,#6D28D9)', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 14px rgba(124,58,237,0.3)' }}>
              <Plus size={16} /> Save &amp; Add New
            </button>
            <button onClick={handleSaveAndExit}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#059669,#047857)', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 14px rgba(5,150,105,0.3)' }}>
              <CheckCircle size={16} /> Save &amp; Exit
            </button>
            <button onClick={closeManualModal}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer' }}>
              <X size={16} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Minimized Floating Bar */}
      {manualOpen && manualMinimized && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 200, display: 'flex', alignItems: 'center', gap: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '12px 20px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', animation: 'slideUp 0.3s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: 'linear-gradient(135deg,#7C3AED,#6D28D9)', color: 'white', padding: 8, borderRadius: 10 }}>
              <Edit3 size={18} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
                {editingIndex !== null ? `Editing Item #${editingIndex + 1}` : 'Adding Item'}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                {form.name ? form.name : 'Unsaved Draft...'}
              </div>
            </div>
          </div>
          <div style={{ width: 1, height: 30, background: 'var(--border)', margin: '0 4px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setManualMinimized(false)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(124,58,237,0.1)', color: '#7C3AED', border: 'none', padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: '0.2s' }}>
              <Maximize2 size={15} /> Expand
            </button>
            <button onClick={closeManualModal}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: 'none', padding: 8, borderRadius: 10, cursor: 'pointer', transition: '0.2s' }}>
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ── AI SCAN MODAL ── */}
      {aiModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`rounded-2xl shadow-2xl w-full ${scannedItems ? 'max-w-5xl' : 'max-w-lg'} flex flex-col overflow-hidden transition-all`} style={{ background: 'var(--surface)', maxHeight: '90vh' }}>
            <div className="px-6 py-4 flex justify-between items-center" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <div className="flex items-center gap-3">
                <div className="bg-indigo-100 p-2 rounded-xl text-indigo-700"><Camera size={20} /></div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                    {scannedItems ? 'Review Scanned Invoice' : 'Scan Bill with AI'}
                  </h2>
                  <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    {scannedItems ? 'Review and correct the extracted items before importing.' : 'Extract medicines automatically from your invoice photo.'}
                  </p>
                </div>
              </div>
              <button onClick={() => { setAiModalOpen(false); setAiImage(null); setAiFile(null); setScannedItems(null); setScannedHeader(null); }}
                style={{ color: 'var(--text-muted)', background: 'var(--surface-2)', padding: 6, borderRadius: '50%', border: '1px solid var(--border)', cursor: 'pointer' }} disabled={scanning}>
                <X size={20} />
              </button>
            </div>

            <div className={`p-6 ${scannedItems ? 'overflow-y-auto flex-1' : ''}`}>
              {!aiImage ? (
                <label className="rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-colors cursor-pointer block" style={{ border: '2px dashed var(--border)', background: 'var(--surface-2)' }}>
                  <UploadCloud size={40} className="text-indigo-400 mb-3" />
                  <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Click to upload bill image or PDF</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Supports JPG, PNG, PDF (Max 5MB)</p>
                  <input type="file" className="hidden" accept="image/*,application/pdf" onChange={e => {
                    if (e.target.files?.[0]) { setAiImage(URL.createObjectURL(e.target.files[0])); setAiFile(e.target.files[0]); }
                  }} />
                </label>
              ) : !scannedItems ? (
                <div className="flex flex-col items-center w-full">
                  <div className="relative w-full h-48 rounded-xl mb-3 overflow-hidden flex items-center justify-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    {aiFile && (aiFile.type === 'application/pdf' || aiFile.name.toLowerCase().endsWith('.pdf')) ? (
                      <div className="flex flex-col items-center gap-2 text-indigo-500">
                        <FileText size={48} />
                        <span className="text-sm font-bold text-slate-700 max-w-[80%] truncate">{aiFile.name}</span>
                      </div>
                    ) : (
                      <img src={aiImage} alt="Bill Preview" className="max-h-full object-contain" />
                    )}
                  </div>
                  <button onClick={() => { setAiImage(null); setAiFile(null); }} className="text-xs font-bold mb-4 underline" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }} disabled={scanning}>Upload a different file</button>
                  <button className="w-full flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm shadow-indigo-600/20 transition-all border border-indigo-500 disabled:opacity-75 disabled:cursor-not-allowed"
                    disabled={scanning} onClick={handleAiScan}>
                    {scanning ? <RotateCcw size={16} className="animate-spin" /> : <Camera size={16} />}
                    {scanning ? 'Analyzing Bill with AI...' : 'Begin AI Extraction'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col w-full h-full gap-4">
                  <div className="grid grid-cols-3 gap-4 mb-2">
                    <div className="p-3 rounded-xl border border-indigo-100 bg-indigo-50/50">
                      <div className="text-[10px] font-bold text-indigo-400 uppercase mb-1">Detected Supplier</div>
                      <input type="text" value={scannedHeader?.supplierName || ''} onChange={e => setScannedHeader(p => ({ ...p, supplierName: e.target.value }))} className="w-full bg-transparent font-bold text-sm text-indigo-900 border-b border-indigo-200 outline-none focus:border-indigo-500" />
                    </div>
                    <div className="p-3 rounded-xl border border-indigo-100 bg-indigo-50/50">
                      <div className="text-[10px] font-bold text-indigo-400 uppercase mb-1">Invoice No</div>
                      <input type="text" value={scannedHeader?.invoiceNo || ''} onChange={e => setScannedHeader(p => ({ ...p, invoiceNo: e.target.value }))} className="w-full bg-transparent font-bold text-sm text-indigo-900 border-b border-indigo-200 outline-none focus:border-indigo-500" />
                    </div>
                    <div className="p-3 rounded-xl border border-indigo-100 bg-indigo-50/50">
                      <div className="text-[10px] font-bold text-indigo-400 uppercase mb-1">Invoice Date</div>
                      <input type="date" value={scannedHeader?.invoiceDate || ''} onChange={e => setScannedHeader(p => ({ ...p, invoiceDate: e.target.value }))} className="w-full bg-transparent font-bold text-sm text-indigo-900 border-b border-indigo-200 outline-none focus:border-indigo-500" />
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">
                            <input type="checkbox" checked={scannedItems.every(i => i.selected)} onChange={e => setScannedItems(scannedItems.map(i => ({ ...i, selected: e.target.checked })))} />
                          </th>
                          <th className="py-2.5 px-3 text-[10px] font-black uppercase text-slate-500">Item Name</th>
                          <th className="py-2.5 px-3 text-[10px] font-black uppercase text-slate-500">Batch</th>
                          <th className="py-2.5 px-3 text-[10px] font-black uppercase text-slate-500">Expiry</th>
                          <th className="py-2.5 px-3 text-[10px] font-black uppercase text-slate-500">Qty</th>
                          <th className="py-2.5 px-3 text-[10px] font-black uppercase text-slate-500">Rate</th>
                          <th className="py-2.5 px-3 text-[10px] font-black uppercase text-slate-500">MRP</th>
                          <th className="py-2.5 px-3 text-[10px] font-black uppercase text-slate-500">GST%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scannedItems.map(item => (
                          <tr key={item.id} className={`border-b border-slate-100 ${!item.selected ? 'opacity-50 bg-slate-50' : 'hover:bg-slate-50'}`}>
                            <td className="py-2 px-3">
                              <input type="checkbox" checked={item.selected} onChange={e => updateScannedItem(item.id, 'selected', e.target.checked)} />
                            </td>
                            <td className="py-2 px-3">
                              <input type="text" value={item.name} onChange={e => updateScannedItem(item.id, 'name', e.target.value.toUpperCase())} className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none border-b border-transparent focus:border-indigo-300" />
                            </td>
                            <td className="py-2 px-3">
                              <input type="text" value={item.batch} onChange={e => updateScannedItem(item.id, 'batch', e.target.value.toUpperCase())} className="w-24 bg-transparent text-xs font-mono font-bold text-slate-700 outline-none border-b border-transparent focus:border-indigo-300" placeholder="BATCH" />
                            </td>
                            <td className="py-2 px-3">
                              <input type="month" value={item.expiry} onChange={e => updateScannedItem(item.id, 'expiry', e.target.value)} className="w-28 bg-transparent text-xs font-bold text-slate-700 outline-none border-b border-transparent focus:border-indigo-300" />
                            </td>
                            <td className="py-2 px-3">
                              <input type="number" value={item.quantity} onChange={e => updateScannedItem(item.id, 'quantity', e.target.value)} className="w-16 bg-transparent text-sm font-bold text-slate-700 outline-none border-b border-transparent focus:border-indigo-300" min="1" />
                            </td>
                            <td className="py-2 px-3">
                              <input type="number" value={item.purchase_price} onChange={e => updateScannedItem(item.id, 'purchase_price', e.target.value)} className="w-20 bg-transparent text-sm font-bold text-emerald-600 outline-none border-b border-transparent focus:border-indigo-300" step="0.01" />
                            </td>
                            <td className="py-2 px-3">
                              <input type="number" value={item.mrp} onChange={e => updateScannedItem(item.id, 'mrp', e.target.value)} className="w-20 bg-transparent text-sm font-bold text-slate-700 outline-none border-b border-transparent focus:border-indigo-300" step="0.01" />
                            </td>
                            <td className="py-2 px-3">
                              <select value={item.gst} onChange={e => updateScannedItem(item.id, 'gst', e.target.value)} className="w-16 bg-transparent text-xs font-bold text-slate-700 outline-none border-b border-transparent focus:border-indigo-300">
                                <option value="0">0%</option><option value="5">5%</option>
                                <option value="12">12%</option><option value="18">18%</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs font-bold text-slate-500">{scannedItems.filter(i => i.selected).length} items selected</span>
                    <button className="flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm shadow-indigo-600/20 transition-all border border-indigo-500"
                      onClick={handleImportScannedItems}>
                      <CheckCircle size={16} /> Import Selected Items
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {compareProductId && (
        <SupplierPriceCompareModal
          productId={compareProductId}
          productName={compareProductName}
          products={products}
          onClose={() => {
            setCompareProductId(null);
            setCompareProductName('');
          }}
        />
      )}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%) scale(0.9); opacity: 0; }
          to   { transform: translateY(0) scale(1); opacity: 1; }
        }
        .field-input {
          width: 100%;
          background: var(--surface-2);
          border: 1.5px solid var(--border);
          border-radius: 10px;
          padding: 8px 12px;
          font-size: 13px;
          font-family: inherit;
          color: var(--text);
          transition: border-color 0.15s, box-shadow 0.15s;
          outline: none;
        }
        .field-input:focus {
          border-color: #7C3AED;
          box-shadow: 0 0 0 3px rgba(124,58,237,0.12);
        }
        .field-input option {
          background: var(--surface);
          color: var(--text);
        }
      `}</style>
    </div>
  );
}

// ─── Small Reusable Sub-Components ───────────────────────────────────────────

function FormSection({ icon, label, color = 'violet', children }) {
  const colors = {
    violet: { color: '#7C3AED', background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.2)' },
    emerald: { color: '#059669', background: 'rgba(5,150,105,0.12)', border: '1px solid rgba(5,150,105,0.2)' },
    blue: { color: '#2563EB', background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.2)' },
    slate: { color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)' },
  };
  return (
    <div>
      <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest mb-3 px-3 py-1.5 rounded-lg w-fit" style={colors[color]}>
        {icon}{label}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ children, required }) {
  return (
    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5 ml-0.5" style={{ color: 'var(--text-light)' }}>
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function InlineError({ children, type = 'error' }) {
  const styles = {
    error: 'text-red-500',
    warning: 'text-amber-600',
    danger: 'text-red-600 font-bold',
  };
  return (
    <p className={`text-[10px] mt-1 ml-0.5 flex items-center gap-1 ${styles[type]}`}>
      <AlertTriangle size={10} />{children}
    </p>
  );
}
