import { useState } from 'react';
import { Save, Printer } from 'lucide-react';
import { API_BASE } from '../../api';

const inp = { width:'100%', padding:'9px 12px', border:'1px solid var(--border)', borderRadius:8, background:'var(--surface-2)', color:'var(--text)', fontSize:13, outline:'none' };
const label = { fontSize:12, fontWeight:600, color:'var(--text-muted)', marginBottom:4, display:'block' };

function Toggle({ value, onChange, label: lbl, desc }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize:13, fontWeight:600 }}>{lbl}</div>
        {desc && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{desc}</div>}
      </div>
      <div onClick={() => onChange(!value)} style={{ width:44, height:24, borderRadius:12, background: value ? 'var(--primary)' : 'var(--border)', cursor:'pointer', position:'relative', transition:'background 200ms', flexShrink:0, marginLeft:16 }}>
        <div style={{ position:'absolute', top:3, left: value ? 22 : 3, width:18, height:18, borderRadius:'50%', background:'white', transition:'left 200ms', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }} />
      </div>
    </div>
  );
}

export default function BillSettings({ settings, onSave }) {
  const [form, setForm] = useState({
    bill_paper_size: settings.bill_paper_size || 'a4',
    bill_show_batch: settings.bill_show_batch === '1',
    bill_show_expiry: settings.bill_show_expiry === '1',
    bill_show_gst: settings.bill_show_gst === '1',
    bill_show_mrp: settings.bill_show_mrp === '1',
    bill_auto_print: settings.bill_auto_print === '1',
    bill_header: settings.bill_header || '',
    bill_footer: settings.bill_footer || 'Thank you for your purchase!',
    bill_disclaimer: settings.bill_disclaimer || 'No return on loose medicines.',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      ...form,
      bill_show_batch: form.bill_show_batch ? '1' : '0',
      bill_show_expiry: form.bill_show_expiry ? '1' : '0',
      bill_show_gst: form.bill_show_gst ? '1' : '0',
      bill_show_mrp: form.bill_show_mrp ? '1' : '0',
      bill_auto_print: form.bill_auto_print ? '1' : '0',
    };
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
          <Printer size={18} color="var(--primary)" />
        </div>
        <div>
          <div style={{ fontWeight:700, fontSize:16 }}>Bill Print Settings</div>
          <div style={{ fontSize:12, color:'var(--text-muted)' }}>Paper size, visible columns and messages</div>
        </div>
      </div>

      {/* Paper size */}
      <div style={{ marginBottom:20 }}>
        <label style={label}>Paper Size</label>
        <div style={{ display:'flex', gap:10 }}>
          {[['thermal','Thermal (80mm)'],['a5','A5'],['a4','A4']].map(([val, lbl]) => (
            <button key={val} onClick={() => set('bill_paper_size', val)} style={{ flex:1, padding:'10px 0', borderRadius:8, border:`1.5px solid ${form.bill_paper_size===val ? 'var(--primary)' : 'var(--border)'}`, background: form.bill_paper_size===val ? 'rgba(26,106,164,0.1)' : 'var(--surface-2)', color: form.bill_paper_size===val ? 'var(--primary)' : 'var(--text)', fontWeight:600, fontSize:13, cursor:'pointer' }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div style={{ background:'var(--surface-2)', borderRadius:10, padding:'0 16px', border:'1px solid var(--border)', marginBottom:20 }}>
        <Toggle value={form.bill_show_batch}  onChange={v=>set('bill_show_batch',v)}  label="Show Batch Number"   desc="Display batch no. on each line item" />
        <Toggle value={form.bill_show_expiry} onChange={v=>set('bill_show_expiry',v)} label="Show Expiry Date"    desc="Display expiry date on each line item" />
        <Toggle value={form.bill_show_gst}    onChange={v=>set('bill_show_gst',v)}    label="Show GST Breakdown"  desc="CGST/SGST column on printout" />
        <Toggle value={form.bill_show_mrp}    onChange={v=>set('bill_show_mrp',v)}    label="Show MRP"            desc="Display MRP alongside selling price" />
        <Toggle value={form.bill_auto_print}  onChange={v=>set('bill_auto_print',v)}  label="Auto-Print After Billing" desc="Trigger print dialog automatically on bill save" />
      </div>

      {/* Messages */}
      <div style={{ marginBottom:14 }}>
        <label style={label}>Bill Header Message</label>
        <input style={inp} value={form.bill_header} onChange={e => set('bill_header', e.target.value)} placeholder="Optional tagline shown at the top of the bill" />
      </div>
      <div style={{ marginBottom:14 }}>
        <label style={label}>Bill Footer Message</label>
        <input style={inp} value={form.bill_footer} onChange={e => set('bill_footer', e.target.value)} placeholder="e.g. Thank you for your purchase!" />
      </div>
      <div style={{ marginBottom:24 }}>
        <label style={label}>Disclaimer</label>
        <input style={inp} value={form.bill_disclaimer} onChange={e => set('bill_disclaimer', e.target.value)} placeholder="e.g. No return on loose medicines." />
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={handleSave} disabled={saving} style={{ padding:'9px 22px', borderRadius:8, background:'var(--primary)', color:'white', border:'none', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:7, cursor:'pointer' }}>
          <Save size={14} /> {saving ? 'Saving…' : 'Save Changes'}
        </button>
        {msg && <span style={{ fontSize:13, color: msg.includes('Error') ? 'var(--danger)' : 'var(--success)', fontWeight:600 }}>{msg}</span>}
      </div>
    </div>
  );
}
