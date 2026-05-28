import { useState, useRef } from 'react';
import { Save, Upload, Store, X } from 'lucide-react';
import { API_BASE } from '../../api';

const inp = {
  width:'100%', padding:'9px 12px', border:'1px solid var(--border)',
  borderRadius:8, background:'var(--surface-2)', color:'var(--text)',
  fontSize:13, outline:'none'
};
const label = { fontSize:12, fontWeight:600, color:'var(--text-muted)', marginBottom:4, display:'block' };
const row = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 };

export default function StoreSettings({ settings, onSave }) {
  const [form, setForm] = useState({
    pharmacy_name: settings.pharmacy_name || '',
    pharmacy_address: settings.pharmacy_address || '',
    drug_license_no: settings.drug_license_no || '',
    gst_no: settings.gst_no || '',
    pharmacy_phone: settings.pharmacy_phone || '',
    pharmacy_email: settings.pharmacy_email || '',
    pharmacy_logo: settings.pharmacy_logo || '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      onSave(form);
      setMsg('Saved successfully!');
      setTimeout(() => setMsg(''), 2500);
    } catch { setMsg('Error saving.'); }
    setSaving(false);
  };

  const handleLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('logo', file);
    try {
      const r = await fetch(`${API_BASE}/api/settings/logo`, { method: 'POST', body: fd });
      const d = await r.json();
      if (d.logo) { set('pharmacy_logo', d.logo); onSave({ pharmacy_logo: d.logo }); }
    } catch { /* ignore upload errors */ }
    setUploading(false);
  };

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:24 }}>
        <div style={{ width:38, height:38, borderRadius:10, background:'rgba(26,106,164,0.12)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Store size={18} color="var(--primary)" />
        </div>
        <div>
          <div style={{ fontWeight:700, fontSize:16 }}>Store / Business Settings</div>
          <div style={{ fontSize:12, color:'var(--text-muted)' }}>Pharmacy identity & legal information</div>
        </div>
      </div>

      {/* Logo */}
      <div style={{ marginBottom:20, padding:16, border:'1.5px dashed var(--border)', borderRadius:12, display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ width:72, height:72, borderRadius:12, background:'var(--surface-2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0 }}>
          {form.pharmacy_logo
            ? <img src={`${API_BASE}${form.pharmacy_logo}`} alt="logo" style={{ width:'100%', height:'100%', objectFit:'contain' }} onError={e => e.target.style.display='none'} />
            : <Store size={28} color="var(--text-light)" />}
        </div>
        <div>
          <div style={{ fontWeight:600, fontSize:13, marginBottom:6 }}>Pharmacy Logo</div>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:10 }}>Used on bill printouts. PNG/JPG, max 2 MB.</div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleLogo} />
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ padding:'6px 14px', borderRadius:7, border:'1.5px solid var(--border)', background:'var(--surface-2)', fontSize:12, fontWeight:600, color:'var(--text)', display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
              <Upload size={13} /> {uploading ? 'Uploading…' : 'Upload Logo'}
            </button>
            {form.pharmacy_logo && (
              <button onClick={() => set('pharmacy_logo', '')} style={{ padding:'6px 10px', borderRadius:7, border:'1.5px solid var(--border)', background:'var(--surface-2)', fontSize:12, color:'var(--danger)', cursor:'pointer' }}>
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={row}>
        <div><label style={label}>Pharmacy Name *</label><input style={inp} value={form.pharmacy_name} onChange={e => set('pharmacy_name', e.target.value)} placeholder="e.g. City Medical Store" /></div>
        <div><label style={label}>Phone</label><input style={inp} value={form.pharmacy_phone} onChange={e => set('pharmacy_phone', e.target.value)} placeholder="+91 98765 43210" /></div>
      </div>
      <div style={{ marginBottom:16 }}>
        <label style={label}>Address</label>
        <textarea style={{ ...inp, minHeight:70, resize:'vertical' }} value={form.pharmacy_address} onChange={e => set('pharmacy_address', e.target.value)} placeholder="Full address for bill header" />
      </div>
      <div style={row}>
        <div><label style={label}>Email</label><input style={inp} type="email" value={form.pharmacy_email} onChange={e => set('pharmacy_email', e.target.value)} placeholder="contact@pharmacy.com" /></div>
        <div><label style={label}>Drug License No.</label><input style={inp} value={form.drug_license_no} onChange={e => set('drug_license_no', e.target.value)} placeholder="DL-MH-123456" /></div>
      </div>
      <div style={{ marginBottom:24 }}>
        <label style={label}>GST Number</label>
        <input style={{ ...inp, width:'50%' }} value={form.gst_no} onChange={e => set('gst_no', e.target.value.toUpperCase())} placeholder="27AABCP1234F1ZV" maxLength={15} />
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={handleSave} disabled={saving} style={{ padding:'9px 22px', borderRadius:8, background:'var(--primary)', color:'white', border:'none', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:7, cursor:'pointer', opacity: saving ? 0.7 : 1 }}>
          <Save size={14} /> {saving ? 'Saving…' : 'Save Changes'}
        </button>
        {msg && <span style={{ fontSize:13, color: msg.includes('Error') ? 'var(--danger)' : 'var(--success)', fontWeight:600 }}>{msg}</span>}
      </div>
    </div>
  );
}
