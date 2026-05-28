import { useState, useEffect } from 'react';
import { Store, Receipt, Printer, Users, Settings2 } from 'lucide-react';
import { API_BASE } from '../api';
import StoreSettings    from './settings/StoreSettings';
import TaxSettings      from './settings/TaxSettings';
import BillSettings     from './settings/BillSettings';
import UserSettings     from './settings/UserSettings';
import AdvancedSettings from './settings/AdvancedSettings';

const TABS = [
  { key:'store',    label:'Store',      icon: Store,    desc:'Business info & logo' },
  { key:'tax',      label:'Tax / GST',  icon: Receipt,  desc:'GST slabs & type' },
  { key:'bill',     label:'Bill Print', icon: Printer,  desc:'Paper size & columns' },
  { key:'users',    label:'Users',      icon: Users,    desc:'Staff & permissions' },
  { key:'advanced', label:'Advanced',   icon: Settings2,desc:'Bill numbers & more' },
];

export default function Settings() {
  const [active, setActive] = useState('store');
  const [settings, setSettings] = useState(null);
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (window.api?.getAppVersion) {
      window.api.getAppVersion().then(setVersion).catch(console.error);
    }
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/settings`)
      .then(r => r.json())
      .then(setSettings)
      .catch(() => setSettings({}));
  }, []);

  const handleSave = (partial) => setSettings(prev => ({ ...prev, ...partial }));

  if (!settings) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--text-muted)', fontSize:14 }}>
        Loading settings…
      </div>
    );
  }

  const ActiveTab = TABS.find(t => t.key === active);

  return (
    <div style={{ maxWidth:1100, margin:'0 auto' }}>
      {/* Page header */}
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontWeight:800, fontSize:24, color:'var(--text)', margin:0, letterSpacing:'-0.5px' }}>Settings</h1>
        <p style={{ fontSize:13, color:'var(--text-muted)', margin:'4px 0 0' }}>Configure your pharmacy application</p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'220px 1fr', gap:20, alignItems:'start' }}>

        {/* ── Sidebar ── */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:8, boxShadow:'var(--shadow-sm)', position:'sticky', top:80 }}>
          {TABS.map(({ key, label, icon: TabIcon, desc }) => {
            const isActive = active === key;
            return (
              <button
                key={key}
                onClick={() => setActive(key)}
                style={{
                  width:'100%', display:'flex', alignItems:'center', gap:12, padding:'11px 14px',
                  borderRadius:10, border:'none', background: isActive ? 'rgba(26,106,164,0.1)' : 'transparent',
                  color: isActive ? 'var(--primary)' : 'var(--text)', cursor:'pointer',
                  marginBottom:2, textAlign:'left', transition:'all 150ms',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{
                  width:34, height:34, borderRadius:9, flexShrink:0,
                  background: isActive ? 'rgba(26,106,164,0.15)' : 'var(--surface-2)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  border: isActive ? '1.5px solid rgba(26,106,164,0.25)' : '1px solid var(--border)',
                }}>
                  <TabIcon size={16} color={isActive ? 'var(--primary)' : 'var(--text-muted)'} />
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight: isActive ? 700 : 600, lineHeight:1.2 }}>{label}</div>
                  <div style={{ fontSize:11, color:'var(--text-light)', marginTop:1 }}>{desc}</div>
                </div>
                {isActive && (
                  <div style={{ marginLeft:'auto', width:4, height:4, borderRadius:'50%', background:'var(--primary)', flexShrink:0 }} />
                )}
              </button>
            );
          })}
          
          {/* Version display */}
          <div style={{ borderTop: '1px solid var(--border)', margin: '16px 8px 4px', paddingTop: 16, textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-light)', fontWeight: 700, letterSpacing: '0.5px' }}>
              Version {version || '1.0.0'}
            </span>
          </div>
        </div>

        {/* ── Content panel ── */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:28, boxShadow:'var(--shadow-sm)', minHeight:500, animation:'scaleIn 0.15s ease-out' }}>
          {active === 'store'    && <StoreSettings    settings={settings} onSave={handleSave} />}
          {active === 'tax'      && <TaxSettings      settings={settings} onSave={handleSave} />}
          {active === 'bill'     && <BillSettings     settings={settings} onSave={handleSave} />}
          {active === 'users'    && <UserSettings />}
          {active === 'advanced' && <AdvancedSettings settings={settings} onSave={handleSave} />}
        </div>
      </div>
    </div>
  );
}
