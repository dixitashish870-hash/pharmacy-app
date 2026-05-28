import { useState } from 'react';
import { Save, Settings2, Barcode, Hash } from 'lucide-react';
import { API_BASE } from '../../api';

const inp = { width:'100%', padding:'9px 12px', border:'1px solid var(--border)', borderRadius:8, background:'var(--surface-2)', color:'var(--text)', fontSize:13, outline:'none' };
const label = { fontSize:12, fontWeight:600, color:'var(--text-muted)', marginBottom:4, display:'block' };

function Card({ icon: CardIcon, title, desc, children }) {
  return (
    <div style={{ background:'var(--surface-2)', borderRadius:12, padding:20, border:'1px solid var(--border)', marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
        <div style={{ width:32, height:32, borderRadius:8, background:'rgba(26,106,164,0.12)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <CardIcon size={15} color="var(--primary)" />
        </div>
        <div>
          <div style={{ fontWeight:700, fontSize:13 }}>{title}</div>
          {desc && <div style={{ fontSize:11, color:'var(--text-muted)' }}>{desc}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function AdvancedSettings({ settings, onSave }) {
  const year = new Date().getFullYear();
  const [form, setForm] = useState({
    barcode_mode: settings.barcode_mode || 'auto',
    session_timeout: settings.session_timeout || '60',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/settings`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) });
      onSave(form);
      setMsg('Saved!'); setTimeout(()=>setMsg(''), 2500);
    } catch { setMsg('Error saving.'); }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:24 }}>
        <div style={{ width:38, height:38, borderRadius:10, background:'rgba(26,106,164,0.12)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Settings2 size={18} color="var(--primary)" />
        </div>
        <div>
          <div style={{ fontWeight:700, fontSize:16 }}>Advanced Settings</div>
          <div style={{ fontSize:12, color:'var(--text-muted)' }}>Bill numbering, barcodes and system preferences</div>
        </div>
      </div>

      <Card icon={Hash} title="Bill Number Format" desc="Fixed prefix: PH — format: PH{YEAR}/{SEQ}">
        <div style={{ background:'var(--surface)', borderRadius:8, padding:16, border:'1px solid var(--border)', marginBottom:10 }}>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:6 }}>Preview</div>
          <div style={{ fontFamily:'monospace', fontSize:22, fontWeight:700, color:'var(--primary)', letterSpacing:1 }}>
            PH{year}/<span style={{ color:'var(--text)' }}>0001</span>
          </div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:6 }}>Sequential, resets every year. Format: PH&lt;YYYY&gt;/&lt;4-digit seq&gt;</div>
        </div>
        <div style={{ padding:'10px 14px', borderRadius:8, background:'rgba(26,106,164,0.07)', border:'1px solid rgba(26,106,164,0.15)', fontSize:12, color:'var(--primary)', fontWeight:600 }}>
          ℹ️ The <strong>PH</strong> prefix is fixed and cannot be changed. Sequence auto-increments per sale.
        </div>
      </Card>

      <Card icon={Barcode} title="Barcode Settings" desc="How SKU barcodes are generated for products">
        <div style={{ display:'flex', gap:10, marginBottom:12 }}>
          {[['auto','Auto-Generate SKU'],['manual','Manual Entry']].map(([val,lbl])=>(
            <button key={val} onClick={()=>set('barcode_mode',val)} style={{ flex:1, padding:'9px 0', borderRadius:8, border:`1.5px solid ${form.barcode_mode===val?'var(--primary)':'var(--border)'}`, background: form.barcode_mode===val?'rgba(26,106,164,0.1)':'var(--surface)', color: form.barcode_mode===val?'var(--primary)':'var(--text)', fontWeight:600, fontSize:13, cursor:'pointer' }}>
              {lbl}
            </button>
          ))}
        </div>
        {form.barcode_mode === 'auto' && (
          <div style={{ fontSize:12, color:'var(--text-muted)', background:'var(--surface)', padding:'10px 14px', borderRadius:8, border:'1px solid var(--border)' }}>
            SKU format: <span style={{ fontFamily:'monospace', fontWeight:600, color:'var(--text)' }}>QA-{'{timestamp}'}-{'{4hex}'}</span>. Generated automatically when adding products.
          </div>
        )}
        {form.barcode_mode === 'manual' && (
          <div style={{ fontSize:12, color:'var(--text-muted)', background:'var(--surface)', padding:'10px 14px', borderRadius:8, border:'1px solid var(--border)' }}>
            Staff must enter a unique SKU when adding each product to inventory.
          </div>
        )}
      </Card>

      <Card icon={Settings2} title="Session & Security" desc="User session preferences">
        <div>
          <label style={label}>Session Timeout (minutes)</label>
          <select style={{ ...inp, width:200 }} value={form.session_timeout} onChange={e=>set('session_timeout',e.target.value)}>
            {['15','30','60','120','240','never'].map(v=>(
              <option key={v} value={v}>{v === 'never' ? 'Never timeout' : `${v} minutes`}</option>
            ))}
          </select>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:6 }}>Auto-logout inactive users after this time.</div>
        </div>
      </Card>

      <Card icon={Settings2} title="Multi-Store Support" desc="Coming soon — manage multiple pharmacy branches">
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:8, background:'var(--surface)', border:'1px solid var(--border)' }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--warning)' }} />
          <div style={{ fontSize:13, color:'var(--text-muted)' }}>Multi-store management is planned for a future release. Stay tuned!</div>
        </div>
      </Card>

      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={handleSave} disabled={saving} style={{ padding:'9px 22px', borderRadius:8, background:'var(--primary)', color:'white', border:'none', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:7, cursor:'pointer' }}>
          <Save size={14} /> {saving ? 'Saving…' : 'Save Changes'}
        </button>
        {msg && <span style={{ fontSize:13, color: msg.includes('Error')?'var(--danger)':'var(--success)', fontWeight:600 }}>{msg}</span>}
      </div>
    </div>
  );
}
