import { useState } from 'react';
import { Save, Receipt } from 'lucide-react';
import { API_BASE } from '../../api';

const inp = { width:'100%', padding:'9px 12px', border:'1px solid var(--border)', borderRadius:8, background:'var(--surface-2)', color:'var(--text)', fontSize:13, outline:'none' };
const label = { fontSize:12, fontWeight:600, color:'var(--text-muted)', marginBottom:4, display:'block' };

function TaxCard({ children, style }) {
  return (
    <div style={{ background:'var(--surface-2)', borderRadius:10, padding:16, border:'1px solid var(--border)', ...style }}>{children}</div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width:44, height:24, borderRadius:12, background: value ? 'var(--primary)' : 'var(--border)', cursor:'pointer', position:'relative', transition:'background 200ms', flexShrink:0 }}>
      <div style={{ position:'absolute', top:3, left: value ? 22 : 3, width:18, height:18, borderRadius:'50%', background:'white', transition:'left 200ms', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }} />
    </div>
  );
}

const GST_SLABS = ['0%', '5%', '12%', '18%', '28%'];

export default function TaxSettings({ settings, onSave }) {
  const [form, setForm] = useState({
    gst_enabled: settings.gst_enabled === '1',
    gst_reg_type: settings.gst_reg_type || 'regular',
    gst_type: settings.gst_type || 'cgst_sgst',
    default_hsn: settings.default_hsn || '30049099',
    default_gst_slab: settings.default_gst_slab || '12%',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const payload = { ...form, gst_enabled: form.gst_enabled ? '1' : '0' };
    try {
      await fetch(`${API_BASE}/api/settings`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      onSave(payload);
      setMsg('Saved!'); setTimeout(() => setMsg(''), 2500);
    } catch { setMsg('Error saving.'); }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:24 }}>
        <div style={{ width:38, height:38, borderRadius:10, background:'rgba(26,106,164,0.12)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Receipt size={18} color="var(--primary)" />
        </div>
        <div>
          <div style={{ fontWeight:700, fontSize:16 }}>Tax / GST Settings</div>
          <div style={{ fontSize:12, color:'var(--text-muted)' }}>GST registration, slabs, and billing type</div>
        </div>
      </div>

      <TaxCard style={{ marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontWeight:600, fontSize:14 }}>Enable GST</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>Show GST breakdown on bills and calculations</div>
          </div>
          <Toggle value={form.gst_enabled} onChange={v => set('gst_enabled', v)} />
        </div>
      </TaxCard>

      {form.gst_enabled && (
        <>
          <TaxCard style={{ marginBottom:16 }}>
            <div style={{ fontWeight:600, fontSize:13, marginBottom:14 }}>Registration Type</div>
            <div style={{ display:'flex', gap:10 }}>
              {['regular', 'composition'].map(t => (
                <button key={t} onClick={() => set('gst_reg_type', t)} style={{ flex:1, padding:'9px 0', borderRadius:8, border:`1.5px solid ${form.gst_reg_type===t ? 'var(--primary)' : 'var(--border)'}`, background: form.gst_reg_type===t ? 'rgba(26,106,164,0.1)' : 'var(--surface)', color: form.gst_reg_type===t ? 'var(--primary)' : 'var(--text)', fontWeight:600, fontSize:13, cursor:'pointer' }}>
                  {t === 'regular' ? 'Regular (GSTIN)' : 'Composition'}
                </button>
              ))}
            </div>
          </TaxCard>

          <TaxCard style={{ marginBottom:16 }}>
            <div style={{ fontWeight:600, fontSize:13, marginBottom:14 }}>Tax Type (for billing)</div>
            <div style={{ display:'flex', gap:10 }}>
              {[['cgst_sgst','CGST + SGST (Local)'],['igst','IGST (Interstate)']].map(([val, lbl]) => (
                <button key={val} onClick={() => set('gst_type', val)} style={{ flex:1, padding:'9px 0', borderRadius:8, border:`1.5px solid ${form.gst_type===val ? 'var(--primary)' : 'var(--border)'}`, background: form.gst_type===val ? 'rgba(26,106,164,0.1)' : 'var(--surface)', color: form.gst_type===val ? 'var(--primary)' : 'var(--text)', fontWeight:600, fontSize:13, cursor:'pointer' }}>
                  {lbl}
                </button>
              ))}
            </div>
          </TaxCard>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
            <div>
              <label style={label}>Default GST Slab</label>
              <select style={{ ...inp }} value={form.default_gst_slab} onChange={e => set('default_gst_slab', e.target.value)}>
                {GST_SLABS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Default HSN Code</label>
              <input style={inp} value={form.default_hsn} onChange={e => set('default_hsn', e.target.value)} placeholder="30049099" maxLength={8} />
            </div>
          </div>
        </>
      )}

      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={handleSave} disabled={saving} style={{ padding:'9px 22px', borderRadius:8, background:'var(--primary)', color:'white', border:'none', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:7, cursor:'pointer' }}>
          <Save size={14} /> {saving ? 'Saving…' : 'Save Changes'}
        </button>
        {msg && <span style={{ fontSize:13, color: msg.includes('Error') ? 'var(--danger)' : 'var(--success)', fontWeight:600 }}>{msg}</span>}
      </div>
    </div>
  );
}
