import { useState, lazy, Suspense } from 'react';
import { Truck, Building2, Clock } from 'lucide-react';

const PurchaseEntry = lazy(() => import('./PurchaseEntry'));
const Suppliers     = lazy(() => import('./Suppliers'));
const PurchaseHistory = lazy(() => import('./PurchaseHistory'));

const PageLoader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh', color: 'var(--text-muted)', fontSize: 14 }}>
    Loading…
  </div>
);

const TABS = [
  { id: 'purchase', label: 'Purchase Entry', icon: Truck },
  { id: 'history',  label: 'Bill History',   icon: Clock },
  { id: 'suppliers', label: 'Suppliers',      icon: Building2 },
];

export default function PurchaseHub() {
  const [activeTab, setActiveTab] = useState('purchase');
  const [editingPurchase, setEditingPurchase] = useState(null);

  const handleEditPurchase = (purchase) => {
    setEditingPurchase(purchase);
    setActiveTab('purchase');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Tab bar ── */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20,
        borderBottom: '1px solid var(--border)', paddingBottom: 0,
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '9px 20px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', border: 'none', background: 'none',
                borderBottom: active ? '2px solid #4F46E5' : '2px solid transparent',
                color: active ? '#818CF8' : 'var(--text-muted)',
                marginBottom: -1,
                transition: 'color 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Suspense fallback={<PageLoader />}>
          {activeTab === 'purchase'   && <PurchaseEntry editingPurchase={editingPurchase} onClearEdit={() => setEditingPurchase(null)} />}
          {activeTab === 'history'    && <PurchaseHistory onEditPurchase={handleEditPurchase} />}
          {activeTab === 'suppliers'  && <Suppliers />}
        </Suspense>
      </div>
    </div>
  );
}
