import { useState, useMemo, useRef, useEffect } from 'react';
import Fuse from 'fuse.js';
import axios from 'axios';
import { API_BASE } from '../../api';
import {
  ClipboardList, X, User, Stethoscope, IndianRupee, Plus, Minus,
  Trash2, Save, RefreshCw, CheckCircle2, AlertCircle, Clock,
  Banknote, Wifi, CreditCard, Phone, Building, FileText, ShoppingCart, Search
} from 'lucide-react';


const fmt = (n) => parseFloat(n || 0).toFixed(2);

/**
 * DraftBillModal
 * Redesigned full-screen premium glassmorphic modal for managing draft bills.
 */
export default function DraftBillModal({
  show,
  onClose,
  draftTab,
  setDraftTab,
  draftBills,
  draftBillsLoading,
  draftItems,
  setDraftItems,
  draftNotes,
  setDraftNotes,
  draftSaving,
  draftPatient,
  setDraftPatient,
  draftPrescriber,
  setDraftPrescriber,
  draftPaymentMode,
  setDraftPaymentMode,
  completingDraftId,
  draftCompleteError,
  onSaveDraft,
  onCompleteDraft,
  onDiscardDraft,
  onFetchDrafts,
  products = [],
  customers = [],
}) {
  const [draftSearchTerm, setDraftSearchTerm] = useState('');
  const [showDraftSearchDropdown, setShowDraftSearchDropdown] = useState(false);
  const draftSearchRef = useRef(null);

  const fuse = useMemo(() => new Fuse(products, {
    keys: ['name', 'brand_name', 'salt_composition', 'sku'],
    threshold: 0.35,
  }), [products]);

  const draftSearchResults = useMemo(() => {
    if (!draftSearchTerm.trim()) return [];
    const results = fuse.search(draftSearchTerm).map(r => r.item).slice(0, 8);
    return [...results].sort((a, b) => (b.stock > 0 ? 1 : 0) - (a.stock > 0 ? 1 : 0));
  }, [draftSearchTerm, fuse]);

  const [onlineSuggestions, setOnlineSuggestions] = useState([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);

  useEffect(() => {
    if (draftSearchTerm.length > 2) {
      setIsSearchingOnline(true);
      const delayDebounceFn = setTimeout(async () => {
        try {
          const res = await axios.get(`${API_BASE}/api/search-online?q=${encodeURIComponent(draftSearchTerm)}`);
          setOnlineSuggestions(res.data.slice(0, 5));
        } catch (e) {
          console.error('Online search failed', e);
        } finally {
          setIsSearchingOnline(false);
        }
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    } else {
      setOnlineSuggestions([]);
    }
  }, [draftSearchTerm]);


  const addMedicineToDraft = (product) => {
    setDraftItems(prev => {
      const existingIdx = prev.findIndex(item => item.name.toLowerCase() === product.name.toLowerCase());
      if (existingIdx !== -1) {
        return prev.map((item, idx) => idx === existingIdx ? { ...item, quantity: item.quantity + 1 } : item);
      }

      const isEmptyRow = prev.length === 1 && !prev[0].name.trim() && prev[0].mrp === 0;

      // Compute per-unit MRP: for online results pack_size > 1 gives per-tablet price
      const packSize = parseInt(product.pack_size) || 1;
      const fullMrp = parseFloat(product.mrp || product.price || 0);
      const perUnitMrp = packSize > 1 ? Math.round((fullMrp / packSize) * 100) / 100 : fullMrp;

      const newRow = {
        name: product.name,
        quantity: 1,
        mrp: perUnitMrp,   // always per-unit (per tablet/capsule/ml)
        pack_size: 1,       // already stored as per-unit — no further division needed
        gst: product.gst || 0,
        discount_pct: 0,
        batch: product.batch || '',
        expiry: product.expiry || ''
      };

      if (isEmptyRow) {
        return [newRow];
      } else {
        return [...prev, newRow];
      }
    });
    setDraftSearchTerm('');
    setShowDraftSearchDropdown(false);
    setTimeout(() => draftSearchRef.current?.focus(), 50);
  };

  if (!show) return null;

  const updateDraftItem = (idx, field, value) => {
    setDraftItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const estTotal = draftItems.reduce((s, i) => {
    const mrp = parseFloat(i.mrp) || 0;
    const packSize = parseInt(i.pack_size) || 1;
    const mrpPerUnit = mrp / packSize;
    const qty = parseInt(i.quantity) || 1;
    const disc = parseFloat(i.discount_pct) || 0;
    return s + mrpPerUnit * qty * (1 - disc / 100);
  }, 0);

  return (
    <div className="draft-modal-overlay">
      <style>{`
        /* Overlay and Dialog backdrops */
        .draft-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(16px) saturate(120%);
          -webkit-backdrop-filter: blur(16px) saturate(120%);
          padding: 20px;
          animation: draft-fade-in 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .draft-modal-window {
          width: 100%;
          max-width: 1240px;
          height: 90vh;
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-lg);
          box-shadow: var(--glass-shadow);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: draft-scale-in 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        /* Nav & Tabs */
        .draft-header {
          background: rgba(15, 23, 42, 0.9);
          backdrop-filter: blur(20px);
          padding: 12px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 64px;
          flex-shrink: 0;
          border-bottom: 1px solid var(--border);
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        }

        .draft-tab-pill-box {
          display: flex;
          gap: 4px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 3px;
          border-radius: var(--radius);
        }

        .draft-tab-btn {
          padding: 6px 16px;
          border-radius: var(--radius-sm);
          border: none;
          cursor: pointer;
          font-weight: 700;
          font-size: 12px;
          background: transparent;
          color: rgba(255,255,255,0.7);
          transition: all var(--transition);
        }

        .draft-tab-btn:hover {
          color: white;
          background: rgba(255,255,255,0.05);
        }

        .draft-tab-btn.active {
          background: white;
          color: var(--text);
          box-shadow: 0 2px 10px rgba(0,0,0,0.12);
        }

        .draft-close-btn {
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: var(--radius-sm);
          cursor: pointer;
          color: white;
          padding: 6px 14px;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          transition: all var(--transition);
        }

        .draft-close-btn:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: rgba(239, 68, 68, 0.4);
          color: #FCA5A5;
        }

        /* 2-Column workspace */
        .draft-workspace {
          display: grid;
          grid-template-columns: 360px 1fr;
          gap: 20px;
          padding: 20px;
          flex: 1;
          overflow: hidden;
          min-height: 0;
          background: var(--bg);
        }

        /* Grid inputs */
        .draft-field-label {
          font-size: 10px;
          font-weight: 800;
          color: var(--text-light);
          text-transform: uppercase;
          letter-spacing: 0.07em;
          margin-bottom: 5px;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .draft-input-container {
          position: relative;
          display: flex;
          align-items: center;
        }

        .draft-input-icon {
          position: absolute;
          left: 12px;
          color: var(--text-light);
          pointer-events: none;
        }

        .draft-input-field {
          width: 100%;
          padding: 8px 12px 8px 36px;
          font-size: 13px;
          font-weight: 600;
          background: var(--surface-2);
          border: 1.5px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text);
          outline: none;
          transition: all var(--transition);
        }

        .draft-input-field:focus {
          border-color: var(--brand-indigo) !important;
          background: var(--surface);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
        }

        .draft-input-field-noicon {
          width: 100%;
          padding: 8px 12px;
          font-size: 13px;
          font-weight: 600;
          background: var(--surface-2);
          border: 1.5px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text);
          outline: none;
          transition: all var(--transition);
        }

        .draft-input-field-noicon:focus {
          border-color: var(--brand-indigo) !important;
          background: var(--surface);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
        }

        /* Floating style cards */
        .draft-card-new {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 16px;
          box-shadow: var(--shadow-sm);
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: all var(--transition);
        }

        .draft-card-new:hover {
          box-shadow: var(--shadow);
          border-color: rgba(99, 102, 241, 0.12);
        }

        /* Payment selection grid */
        .draft-pay-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }

        .draft-payment-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 9px;
          border-radius: var(--radius-sm);
          border: 1.5px solid var(--border);
          background: var(--surface-2);
          color: var(--text-muted);
          font-weight: 700;
          font-size: 12px;
          cursor: pointer;
          transition: all var(--transition);
        }

        .draft-payment-btn:hover {
          border-color: var(--brand-indigo);
          color: var(--brand-indigo);
          background: rgba(99, 102, 241, 0.04);
        }

        .draft-payment-btn.active {
          border-color: var(--brand-indigo);
          background: rgba(99, 102, 241, 0.1);
          color: var(--brand-indigo);
          box-shadow: 0 4px 10px rgba(99, 102, 241, 0.12);
        }

        /* Scrollable items column */
        .draft-items-column {
          display: flex;
          flex-direction: column;
          gap: 16px;
          height: 100%;
          overflow: hidden;
          min-height: 0;
        }

        .draft-items-list-container {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding-right: 4px;
        }

        /* Dynamic items grid rows */
        .draft-item-row-new {
          display: grid;
          grid-template-columns: 1fr 70px 100px 75px 36px;
          gap: 8px;
          align-items: center;
          background: var(--surface-2);
          padding: 8px 12px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          transition: all var(--transition);
        }

        .draft-item-row-new:hover {
          border-color: rgba(99, 102, 241, 0.2);
          background: var(--surface);
          box-shadow: var(--shadow-sm);
        }

        /* Totals & Summary */
        .draft-summary-panel {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%);
          border: 1.5px solid rgba(99, 102, 241, 0.18);
          border-radius: var(--radius);
          padding: 16px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: var(--shadow-sm);
          flex-shrink: 0;
        }

        .draft-save-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 32px;
          border-radius: var(--radius-sm);
          border: none;
          background: var(--gradient-purple);
          color: white;
          font-weight: 800;
          font-size: 14px;
          cursor: pointer;
          box-shadow: 0 4px 14px var(--glow-purple);
          transition: all var(--spring);
        }

        .draft-save-btn:hover:not(:disabled) {
          box-shadow: 0 6px 20px rgba(139, 92, 246, 0.45);
          transform: translateY(-1.5px);
        }

        .draft-save-btn:active:not(:disabled) {
          transform: translateY(0) scale(0.97);
        }

        .draft-save-btn:disabled {
          background: var(--border);
          color: var(--text-light);
          box-shadow: none;
          cursor: not-allowed;
        }

        /* Pending grid */
        .draft-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
          gap: 20px;
          padding: 20px;
          overflow-y: auto;
          flex: 1;
        }

        .draft-pending-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 18px;
          box-shadow: var(--shadow-sm);
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: all var(--spring);
          animation: draft-scale-in 0.24s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .draft-pending-card:hover {
          transform: translateY(-3px);
          box-shadow: var(--shadow-lg);
          border-color: rgba(99, 102, 241, 0.2);
        }

        /* Keyframe animations */
        @keyframes draft-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes draft-scale-in {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .autocomplete-item-row {
          background: var(--surface);
          color: var(--text);
        }
        .autocomplete-item-row:hover {
          background: rgba(99, 102, 241, 0.08) !important;
        }
      `}</style>

      <div className="draft-modal-window">
        {/* ── HEADER & NAVIGATION BANNER ── */}
        <div className="draft-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: 8, display: 'flex', color: 'white' }}>
              <ClipboardList size={20} />
            </div>
            <div>
              <div style={{ color: 'white', fontWeight: 900, fontSize: 16, letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: 6 }}>
                Draft Bill Console
                <span className="badge badge-purple" style={{ fontSize: 10, background: 'rgba(139, 92, 246, 0.25)', border: '1px solid rgba(139, 92, 246, 0.35)', color: '#C4B5FD', padding: '1px 6px' }}>Beta</span>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 500 }}>Create and manage orders for out-of-stock medicines</div>
            </div>
            {/* Slide pill tabs */}
            <div className="draft-tab-pill-box" style={{ marginLeft: 16 }}>
              {[
                { id: 'create', label: '✏️ Create New' },
                { id: 'pending', label: `📋 Queue${draftBills.length > 0 ? ` (${draftBills.length})` : ''}` },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    setDraftTab(t.id);
                    if (t.id === 'pending') onFetchDrafts();
                  }}
                  className={`draft-tab-btn ${draftTab === t.id ? 'active' : ''}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="draft-close-btn">
            <X size={15} /> Close
          </button>
        </div>

        {/* ── WORKSPACE BODY ── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          {/* ═══ CREATE TAB ═══ */}
          {draftTab === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, flex: 1, overflow: 'hidden', minHeight: 0 }}>

              {/* ── 1. PATIENT + PRESCRIPTION UNIFIED CONTEXT STRIP ── */}
              <div className="pos-context-strip" style={{ display: 'flex', alignItems: 'center', height: '58px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius)', overflow: 'hidden', flexShrink: 0 }}>
                {/* Patient Profile Zone */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, padding: '0 16px', borderRight: '1px solid var(--border)' }}>
                  <div className="pos-ctx-avatar filled" style={{ background: 'rgba(99, 102, 241, 0.12)', color: 'var(--brand-indigo)', fontWeight: 800 }}>
                    {draftPatient.name?.[0]?.toUpperCase() || <User size={15} />}
                  </div>
                  {/* Phone */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Phone Number *</span>
                    <input
                      type="tel"
                      value={draftPatient.phone}
                      onChange={e => {
                        const val = e.target.value;
                        setDraftPatient(prev => {
                          const updated = { ...prev, phone: val };
                          const trimmed = val.trim();
                          if (trimmed) {
                            const clean = trimmed.replace(/[^0-9]/g, '');
                            if (clean) {
                              const match = customers.find(c => {
                                const cClean = (c.phone || '').replace(/[^0-9]/g, '');
                                return cClean === clean;
                              });
                              if (match) {
                                updated.name = match.name || '';
                                updated.gender = match.gender || 'Male';
                                updated.reference = match.reference_name || '';
                                updated.age = match.age || '';
                              }
                            }
                          }
                          return updated;
                        });
                      }}
                      placeholder="Customer phone"
                      style={{ background: 'transparent', border: 'none', fontWeight: 600, fontSize: 13, color: 'var(--text)', outline: 'none', width: 110, padding: 0 }}
                    />
                  </div>
                  {/* Name */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Patient Name *</span>
                    <input type="text" value={draftPatient.name} onChange={e => setDraftPatient(p => ({ ...p, name: e.target.value }))} placeholder="Patient name"
                      style={{ background: 'transparent', border: 'none', fontWeight: 700, fontSize: 13, color: 'var(--text)', outline: 'none', width: 140, padding: 0 }} />
                  </div>
                  {/* Gender */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Gender</span>
                    <select value={draftPatient.gender} onChange={e => setDraftPatient(p => ({ ...p, gender: e.target.value }))}
                      style={{ background: 'transparent', border: 'none', fontWeight: 600, fontSize: 12, color: 'var(--text)', outline: 'none', cursor: 'pointer', padding: 0 }}>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  {/* Reference */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Org Reference</span>
                    <input type="text" value={draftPatient.reference} onChange={e => setDraftPatient(p => ({ ...p, reference: e.target.value }))} placeholder="Optional Org"
                      style={{ background: 'transparent', border: 'none', fontWeight: 600, fontSize: 12, color: 'var(--text)', outline: 'none', width: 120, padding: 0 }} />
                  </div>
                </div>

                {/* Prescriber Doctor Zone */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Prescribed Doctor</span>
                    <input type="text" value={draftPrescriber.doctor} onChange={e => setDraftPrescriber(p => ({ ...p, doctor: e.target.value }))} placeholder="Dr. Name"
                      style={{ background: 'transparent', border: 'none', fontWeight: 600, fontSize: 13, color: 'var(--text)', outline: 'none', width: 130, padding: 0 }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Rx Date</span>
                    <input type="text" value={draftPrescriber.date} onChange={e => setDraftPrescriber(p => ({ ...p, date: e.target.value }))}
                      style={{ background: 'transparent', border: 'none', fontWeight: 600, fontSize: 12, color: 'var(--text)', outline: 'none', width: 90, padding: 0 }} />
                  </div>
                </div>
              </div>

              {/* ── 2. MEDICINE CHECKLIST (FULL-WIDTH SCROLLABLE TABLE CARD) ── */}
              <div className="draft-card-new" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--brand-purple)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ClipboardList size={14} /> Medicine Checklist
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-light)' }}>{draftItems.length} rows</span>
                </div>

                {/* Search Bar for Draft Checklist */}
                <div className="pos-search-wrap" style={{ position: 'relative', marginBottom: 12, flexShrink: 0 }}>
                  <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', pointerEvents: 'none' }} />
                  <input
                    ref={draftSearchRef}
                    type="text"
                    placeholder="Search medicine by name, brand, or salt to auto-add..."
                    value={draftSearchTerm}
                    onChange={e => { setDraftSearchTerm(e.target.value); setShowDraftSearchDropdown(true); }}
                    onFocus={() => { if (draftSearchTerm.trim()) setShowDraftSearchDropdown(true); }}
                    onBlur={() => setTimeout(() => setShowDraftSearchDropdown(false), 180)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && draftSearchResults.length > 0) {
                        e.preventDefault();
                        addMedicineToDraft(draftSearchResults[0]);
                      }
                      if (e.key === 'Escape') { setDraftSearchTerm(''); setShowDraftSearchDropdown(false); }
                    }}
                    autoComplete="off"
                    style={{
                      width: '100%',
                      border: '1.5px solid var(--border)',
                      borderRadius: '8px',
                      padding: '10px 14px 10px 42px',
                      fontSize: '14px',
                      fontWeight: '600',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      outline: 'none',
                      transition: 'all 0.2s',
                    }}
                  />
                  {(showDraftSearchDropdown && (draftSearchResults.length > 0 || onlineSuggestions.length > 0 || isSearchingOnline)) && (
                    <div className="autocomplete-dropdown" style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      right: 0,
                      background: 'var(--surface)',
                      border: '1.5px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      boxShadow: 'var(--shadow-xl)',
                      zIndex: 100,
                      maxHeight: 350,
                      overflowY: 'auto'
                    }}>
                      {draftSearchResults.length > 0 && (
                        <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', background: 'var(--surface-2)', textTransform: 'uppercase' }}>
                          Local Inventory
                        </div>
                      )}
                      {draftSearchResults.map(p => {
                        const outOfStock = p.stock <= 0;
                        return (
                          <div
                            key={p.id}
                            className="autocomplete-item"
                            onMouseDown={() => addMedicineToDraft(p)}
                            style={{
                              padding: '10px 16px',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              borderBottom: '1px solid var(--border)',
                              background: 'var(--surface)'
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <div style={{ fontWeight: 700, fontSize: 14, color: outOfStock ? 'var(--text-muted)' : 'var(--text)' }}>
                                {p.name}
                              </div>
                              {p.salt_composition && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.salt_composition}</div>}
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                              <div style={{ fontWeight: 700, color: 'var(--brand-indigo)', fontSize: 14 }}>₹{fmt(p.mrp || p.price)}</div>
                              <div style={{ fontSize: 11, marginTop: 2, fontWeight: 600, color: outOfStock ? '#DC2626' : p.stock > 10 ? 'var(--success)' : 'var(--warning)' }}>
                                {outOfStock ? 'Stock: 0' : `Stock: ${p.stock}`}
                              </div>
                            </div>
                          </div>
                        );
                      })}

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
                      {!isSearchingOnline && onlineSuggestions.map(p => {
                        const packSize = parseInt(p.pack_size) || 1;
                        const perUnitMrp = packSize > 1 ? Math.round((p.mrp / packSize) * 100) / 100 : p.mrp;
                        return (
                        <div
                          key={`online-${p.id}`}
                          className="autocomplete-item"
                          onMouseDown={() => addMedicineToDraft(p)}
                          style={{
                            padding: '10px 16px',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderBottom: '1px solid var(--border)',
                            background: 'var(--surface)'
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#059669' }}>
                              {p.name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>
                              {p.brand_name} {p.generic_name ? `• ${p.generic_name}` : ''}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                              {p.mrp > 0 && (
                                <>
                                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                                    ₹{fmt(perUnitMrp)}<span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>/unit</span>
                                  </div>
                                  {packSize > 1 && (
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                                      Pack ₹{fmt(p.mrp)} × {packSize}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                            <div style={{ background: '#059669', color: 'white', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                              Add
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Scrollable table container */}
                <div className="draft-items-list-container" style={{ flex: 1, overflowY: 'auto' }}>
                  <table className="pos-table" style={{ tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse' }}>
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
                        <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-table-header, var(--surface-2))' }}>#</th>
                        <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-table-header, var(--surface-2))' }}>Product</th>
                        <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-table-header, var(--surface-2))' }}>Batch</th>
                        <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-table-header, var(--surface-2))' }}>Exp</th>
                        <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-table-header, var(--surface-2))' }}>Qty</th>
                        <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-table-header, var(--surface-2))' }}>MRP</th>
                        <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-table-header, var(--surface-2))', color: '#64748b' }}>Taxable</th>
                        <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-table-header, var(--surface-2))', color: '#d97706', textAlign: 'center' }}>TAX%</th>
                        <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-table-header, var(--surface-2))', textAlign: 'center' }}>Disc%</th>
                        <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-table-header, var(--surface-2))', textAlign: 'right' }}>Amount</th>
                        <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-table-header, var(--surface-2))' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {draftItems.map((it, idx) => {
                        const qty = parseInt(it.quantity) || 0;
                        const mrp = parseFloat(it.mrp) || 0;
                        const packSize = parseInt(it.pack_size) || 1;
                        const mrpPerUnit = mrp / packSize;
                        const gst = parseFloat(it.gst) || 0;
                        const disc = parseFloat(it.discount_pct) || 0;

                        const grossMrp = mrpPerUnit * qty;
                        const discountAmt = grossMrp * (disc / 100);
                        const sellingPrice = grossMrp - discountAmt;
                        const divisor = 1 + gst / 100;
                        const taxableAmt = divisor > 0 ? (sellingPrice / divisor) : sellingPrice;
                        const finalAmt = sellingPrice;

                        return (
                          <tr key={idx}>
                            {/* # Index */}
                            <td style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 11 }}>{idx + 1}</td>

                            {/* Product Name (Plain Text) */}
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.2, padding: '5px 8px' }}>
                                {it.name || 'Unnamed Item'}
                              </div>
                            </td>

                            {/* Batch */}
                            <td>
                              <input
                                type="text"
                                placeholder="Batch"
                                value={it.batch || ''}
                                onChange={e => updateDraftItem(idx, 'batch', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '5px 6px',
                                  border: '1px solid var(--border)',
                                  borderRadius: 6,
                                  fontSize: 12,
                                  fontFamily: 'monospace',
                                  background: 'var(--surface)',
                                  color: 'var(--text)',
                                  outline: 'none'
                                }}
                              />
                            </td>

                            {/* Exp */}
                            <td>
                              <input
                                type="text"
                                placeholder="MM-YYYY"
                                value={it.expiry || ''}
                                onChange={e => updateDraftItem(idx, 'expiry', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '5px 6px',
                                  border: '1px solid var(--border)',
                                  borderRadius: 6,
                                  fontSize: 12,
                                  background: 'var(--surface)',
                                  color: 'var(--text)',
                                  outline: 'none',
                                  textAlign: 'center'
                                }}
                              />
                            </td>

                            {/* Qty Stepper */}
                            <td>
                              <div className="qty-stepper">
                                <button onClick={() => updateDraftItem(idx, 'quantity', Math.max(1, qty - 1))}><Minus size={11} /></button>
                                <input
                                  type="number"
                                  value={it.quantity}
                                  onChange={e => updateDraftItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                                  min={1}
                                  style={{ width: 34, padding: '3px 2px', fontSize: 12 }}
                                />
                                <button onClick={() => updateDraftItem(idx, 'quantity', qty + 1)}><Plus size={11} /></button>
                              </div>
                            </td>

                            {/* MRP */}
                            <td>
                              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <span style={{ position: 'absolute', left: 5, fontSize: 11, color: 'var(--text-light)', fontWeight: 600 }}>₹</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={it.mrp}
                                  onChange={e => updateDraftItem(idx, 'mrp', parseFloat(e.target.value) || 0)}
                                  style={{
                                    width: '100%',
                                    padding: '5px 4px 5px 12px',
                                    border: '1px solid var(--border)',
                                    borderRadius: 6,
                                    fontSize: 12,
                                    textAlign: 'right',
                                    background: 'var(--surface)',
                                    color: 'var(--text)',
                                    outline: 'none'
                                  }}
                                />
                              </div>
                            </td>

                            {/* Taxable */}
                            <td style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: 12, color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
                                ₹{fmt(taxableAmt)}
                              </span>
                            </td>

                            {/* TAX% */}
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
                                <input
                                  type="number"
                                  min={0}
                                  max={28}
                                  value={it.gst}
                                  onChange={e => updateDraftItem(idx, 'gst', parseFloat(e.target.value) || 0)}
                                  style={{
                                    width: 42,
                                    padding: '5px 2px',
                                    border: '1px solid var(--border)',
                                    borderRadius: 6,
                                    textAlign: 'center',
                                    fontSize: 12,
                                    background: 'var(--surface)',
                                    color: 'var(--text)',
                                    outline: 'none'
                                  }}
                                />
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>%</span>
                              </div>
                            </td>

                            {/* Disc% */}
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.5}
                                  value={it.discount_pct || 0}
                                  onChange={e => updateDraftItem(idx, 'discount_pct', parseFloat(e.target.value) || 0)}
                                  style={{
                                    width: 52,
                                    padding: '5px 2px',
                                    border: '1px solid var(--border)',
                                    borderRadius: 6,
                                    textAlign: 'center',
                                    fontSize: 12,
                                    background: 'var(--surface)',
                                    color: 'var(--text)',
                                    outline: 'none'
                                  }}
                                />
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>%</span>
                              </div>
                            </td>

                            {/* Amount */}
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 700, color: 'var(--success)', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                                ₹{fmt(finalAmt)}
                              </div>
                            </td>

                            {/* Trash Icon */}
                            <td style={{ textAlign: 'center' }}>
                              <button
                                onClick={() => setDraftItems(prev => prev.filter((_, i) => i !== idx))}
                                disabled={draftItems.length === 1}
                                style={{
                                  color: 'var(--text-muted)',
                                  background: 'none',
                                  border: 'none',
                                  padding: 4,
                                  borderRadius: 6,
                                  cursor: draftItems.length === 1 ? 'not-allowed' : 'pointer',
                                  opacity: draftItems.length === 1 ? 0.3 : 1
                                }}
                                onMouseEnter={e => { if (draftItems.length > 1) e.currentTarget.style.color = 'var(--danger)'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Add Row & Notes Compact Area */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10, flexShrink: 0 }}>


                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 12px' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}><FileText size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Notes:</span>
                    <input type="text" value={draftNotes} onChange={e => setDraftNotes(e.target.value)} placeholder="Awaiting restock from supplier, patient collects by evening..."
                      style={{ width: '100%', background: 'transparent', border: 'none', fontSize: 12, color: 'var(--text)', outline: 'none' }} />
                  </div>
                </div>
              </div>

              {/* ── 3. FLOATING BILL SUMMARY PANEL (BOTTOM BAR) ── */}
              <div style={{
                display: 'flex', alignItems: 'stretch', gap: 0,
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                border: '1px solid var(--glass-border)',
                borderRadius: 16,
                boxShadow: 'var(--glass-shadow)',
                overflow: 'hidden',
                flexShrink: 0,
                height: '80px'
              }}>
                {/* Slabs / Breakdown Column */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, padding: '10px 16px', borderRight: '1px solid var(--border)', minWidth: 180, flexShrink: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-light)', textTransform: 'uppercase', marginBottom: 2 }}>Draft Breakdown</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Gross MRP</span>
                    <span style={{ color: 'var(--text)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>₹{fmt(draftItems.reduce((s, i) => s + ((parseFloat(i.mrp) || 0) / (parseInt(i.pack_size) || 1)) * (parseInt(i.quantity) || 1), 0))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Item Disc</span>
                    <span style={{ color: '#e11d48', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>-₹{fmt(draftItems.reduce((s, i) => s + (((parseFloat(i.mrp) || 0) / (parseInt(i.pack_size) || 1)) * (parseInt(i.quantity) || 1) * ((parseFloat(i.discount_pct) || 0) / 100)), 0))}</span>
                  </div>
                </div>

                {/* Net Payable Center Hero */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 20px' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 2 }}>Estimated Total</div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', lineHeight: 1 }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color: '#10b981', marginTop: 4, marginRight: 2, opacity: 0.85 }}>₹</span>
                    <span style={{
                      fontSize: 32, fontWeight: 900, letterSpacing: '-1.5px', fontVariantNumeric: 'tabular-nums',
                      background: 'linear-gradient(135deg, #059669 0%, #0d9488 50%, #0284c7 100%)',
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                    }}>
                      {fmt(estTotal)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 99, padding: '2px 8px', fontSize: 10, fontWeight: 700, color: '#64748b' }}>
                    <ShoppingCart size={10} style={{ alignSelf: 'center' }} /> {draftItems.length} {draftItems.length === 1 ? 'Item' : 'Items'}
                  </div>
                </div>

                {/* Payment Mode Selector */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, padding: '10px 14px', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', flexShrink: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 1 }}>Payment Mode</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, width: 250 }}>
                    {[
                      { id: 'cash',   label: 'Cash',   icon: Banknote,    color: '#10b981' },
                      { id: 'upi',    label: 'UPI',    icon: Wifi,        color: '#6366f1' },
                      { id: 'card',   label: 'Card',   icon: CreditCard,  color: '#3b82f6' },
                      { id: 'credit', label: 'Udhaar', icon: IndianRupee, color: '#f59e0b' },
                    ].map((mode) => {
                      const active = draftPaymentMode === mode.id;
                      const ModeIcon = mode.icon;
                      return (
                        <button key={mode.id} onClick={() => setDraftPaymentMode(mode.id)}
                          className={`bbsp-pay-btn${active ? ' bbsp-pay-active' : ''}`}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                            padding: '6px 0', borderRadius: 10,
                            border: active ? '1.5px solid transparent' : '1.5px solid var(--border)',
                            background: active ? `linear-gradient(135deg, ${mode.color}ee, ${mode.color})` : 'var(--surface-2)',
                            color: active ? '#fff' : 'var(--text-muted)',
                            fontWeight: 700, fontSize: 11, cursor: 'pointer',
                            boxShadow: active ? `0 2px 8px ${mode.color}44` : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <ModeIcon size={12} strokeWidth={active ? 2.5 : 2} />
                          {mode.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Save Draft Action Trigger */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', flexShrink: 0 }}>
                  <button
                    onClick={onSaveDraft}
                    disabled={draftSaving}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '12px 24px', borderRadius: 12, border: 'none',
                      background: draftSaving ? 'var(--border)' : 'linear-gradient(135deg, var(--brand-indigo) 0%, #4f46e5 100%)',
                      color: 'white', fontWeight: 800, fontSize: 13, cursor: 'pointer',
                      boxShadow: !draftSaving ? '0 4px 12px rgba(99, 102, 241, 0.3)' : 'none',
                      transition: 'all 0.2s'
                    }}
                  >
                    {draftSaving ? (
                      <><RefreshCw size={14} className="animate-spin" /> Saving...</>
                    ) : (
                      <><Save size={14} /> Save Draft</>
                    )}
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* ═══ PENDING DRAFTS TAB (Queue) ═══ */}
          {draftTab === 'pending' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
              {draftBillsLoading ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite', opacity: 0.5 }} />
                  <div style={{ marginTop: 12, fontSize: 14, fontWeight: 600 }}>Loading pending draft queue...</div>
                </div>
              ) : draftBills.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)', padding: 40 }}>
                  <ClipboardList size={56} style={{ opacity: 0.15, marginBottom: 16 }} />
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-muted)' }}>Draft Queue is Empty</div>
                  <p style={{ fontSize: 13, margin: '6px 0 16px', maxWidth: 300, textAlign: 'center' }}>All orders have been completed or cleared. Create a new draft to get started.</p>
                  <button onClick={() => setDraftTab('create')} className="draft-save-btn" style={{ padding: '8px 20px', fontSize: 13 }}>
                    Create First Draft
                  </button>
                </div>
              ) : (
                <div className="draft-grid">
                  {draftBills.map(draft => {
                    const dItems = JSON.parse(draft.items_json || '[]');
                    const thisError = draftCompleteError?.id === draft.id ? draftCompleteError : null;
                    return (
                      <div key={draft.id} className="draft-pending-card" style={thisError ? { borderLeft: '4px solid var(--danger)' } : { borderLeft: '4px solid var(--brand-purple)' }}>

                        {/* Upper Details block */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-2)', border: '1.5px solid var(--border)', color: 'var(--brand-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>
                                {draft.patient_name?.[0]?.toUpperCase() || 'P'}
                              </div>
                              <div>
                                <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{draft.patient_name}</span>
                                {draft.patient_reference && <span className="badge badge-purple" style={{ marginLeft: 6, fontSize: 9, background: 'rgba(139, 92, 246, 0.12)', color: 'var(--brand-purple)' }}>{draft.patient_reference}</span>}
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><User size={13} color="var(--text-light)" /> {draft.patient_phone}</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={13} color="var(--text-light)" /> {new Date(draft.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            {draft.prescriber_name && (
                              <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 6, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Stethoscope size={12} /> {draft.prescriber_name}
                              </div>
                            )}
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--brand-purple)' }}>₹{fmt(draft.estimated_total)}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-light)', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>{dItems.length} {dItems.length === 1 ? 'item' : 'items'}</div>
                          </div>
                        </div>

                        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

                        {/* Medicine Tags inside cards */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {dItems.map((it, i) => (
                            <span key={i} className="badge badge-gray" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 11, color: 'var(--text)' }}>
                              <span style={{ fontWeight: 800, color: 'var(--brand-purple)' }}>{it.quantity}x</span>
                              <span>{it.name}</span>
                              {it.price > 0 && <span style={{ color: 'var(--text-light)', fontWeight: 500 }}>(₹{fmt(it.price)})</span>}
                            </span>
                          ))}
                        </div>

                        {/* Note area */}
                        {draft.notes && (
                          <div style={{ fontSize: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', borderLeft: '3px solid var(--brand-purple)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            {draft.notes}
                          </div>
                        )}

                        {/* Incomplete inventory notification */}
                        {thisError && (
                          <div style={{ background: 'rgba(239, 57, 89, 0.05)', border: '1.5px solid rgba(239, 57, 89, 0.22)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--danger)', fontWeight: 800, fontSize: 13 }}>
                              <AlertCircle size={15} /> Inventory Out of Stock
                            </div>
                            {thisError.missing.map((m, i) => (
                              <div key={i} style={{ fontSize: 12, color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <span style={{ fontWeight: 700 }}>• {m.name}</span>
                                <span style={{ paddingLeft: 8, color: 'var(--text-muted)', fontSize: 11 }}>{m.reason}</span>
                              </div>
                            ))}
                            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4, fontWeight: 500 }}>
                              Add stock via Purchase Hub and try again.
                            </div>
                          </div>
                        )}

                        {/* Action buttons footer */}
                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                          <button
                            onClick={() => onCompleteDraft(draft.id)}
                            disabled={completingDraftId === draft.id}
                            style={{
                              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                              padding: '10px 0', borderRadius: 'var(--radius-sm)', border: 'none',
                              background: completingDraftId === draft.id ? 'var(--border)' : 'linear-gradient(135deg, var(--brand-emerald) 0%, #059669 100%)',
                              color: completingDraftId === draft.id ? 'var(--text-muted)' : 'white',
                              fontWeight: 800, fontSize: 13,
                              cursor: completingDraftId === draft.id ? 'not-allowed' : 'pointer',
                              boxShadow: completingDraftId !== draft.id ? '0 4px 14px rgba(16,185,129,0.2)' : 'none',
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => { if (completingDraftId !== draft.id) e.currentTarget.style.boxShadow = '0 6px 20px rgba(16,185,129,0.35)'; }}
                            onMouseLeave={e => { if (completingDraftId !== draft.id) e.currentTarget.style.boxShadow = '0 4px 14px rgba(16,185,129,0.2)'; }}
                          >
                            {completingDraftId === draft.id ? (
                              <><RefreshCw size={14} className="animate-spin" /> Checking Inventory...</>
                            ) : (
                              <><CheckCircle2 size={14} /> Complete & Bill</>
                            )}
                          </button>

                          <button
                            onClick={() => onDiscardDraft(draft.id)}
                            style={{ width: 42, height: 38, borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', background: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 57, 89, 0.08)'; e.currentTarget.style.borderColor = 'var(--danger)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
