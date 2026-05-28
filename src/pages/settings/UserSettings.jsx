import { useState, useEffect } from 'react';
import { Users, Plus, Edit2, Trash2, KeyRound, Eye, EyeOff, Clock, X, Check, Shield } from 'lucide-react';
import { API_BASE } from '../../api';
import { useAuth } from '../../context/AuthContext';

const inp = { width:'100%', padding:'9px 12px', border:'1px solid var(--border)', borderRadius:8, background:'var(--surface-2)', color:'var(--text)', fontSize:13, outline:'none' };
const label = { fontSize:12, fontWeight:600, color:'var(--text-muted)', marginBottom:4, display:'block' };

const ROLES = ['admin','billing','inventory'];
const ROLE_COLORS = { admin:'var(--primary)', billing:'var(--success)', inventory:'var(--warning)' };
const DEFAULT_PERMS = { can_give_discount:true, can_edit_bill:false, can_delete_bill:false, can_access_reports:false };

function Modal({ title, children, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'var(--surface)', borderRadius:16, padding:28, width:480, maxHeight:'90vh', overflowY:'auto', border:'1px solid var(--border)', boxShadow:'var(--shadow-lg)', animation:'scaleIn 0.2s ease-out' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div style={{ fontWeight:700, fontSize:16 }}>{title}</div>
          <button type="button" onClick={(e)=>{e.stopPropagation();onClose();}} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:4 }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function UserFormModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({ username: user?.username||'', role: user?.role||'billing', password:'', perms: user?.permissions ? (typeof user.permissions==='string' ? JSON.parse(user.permissions) : user.permissions) : DEFAULT_PERMS });
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const setPerm = (k,v) => setForm(f=>({...f, perms:{...f.perms,[k]:v}}));

  const handleSave = async () => {
    if (!form.username.trim()) return setErr('Username required');
    if (!user && !form.password) return setErr('Password required for new user');
    setSaving(true); setErr('');
    try {
      const payload = { username:form.username.trim(), role:form.role, permissions:form.perms, is_active:1 };
      let r;
      if (user) {
        r = await fetch(`${API_BASE}/api/users/${user.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        if (form.password) await fetch(`${API_BASE}/api/users/${user.id}/password`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:form.password}) });
      } else {
        r = await fetch(`${API_BASE}/api/users`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...payload, password:form.password}) });
      }
      const d = await r.json();
      if (!r.ok) return setErr(d.error || 'Error');
      onSaved(); onClose();
    } catch { setErr('Network error'); }
    setSaving(false);
  };

  return (
    <Modal title={user ? 'Edit User' : 'Add New User'} onClose={onClose}>
      <div style={{ marginBottom:12 }}>
        <label style={label}>Username</label>
        <input style={inp} value={form.username} onChange={e=>set('username',e.target.value)} placeholder="john_billing" />
      </div>
      <div style={{ marginBottom:12 }}>
        <label style={label}>{user ? 'New Password (leave blank to keep)' : 'Password *'}</label>
        <div style={{ position:'relative' }}>
          <input style={{ ...inp, paddingRight:38 }} type={showPw?'text':'password'} value={form.password} onChange={e=>set('password',e.target.value)} placeholder={user ? '••••••••' : 'Min 4 characters'} />
          <button type="button" onClick={()=>setShowPw(v=>!v)} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)' }}>{showPw?<EyeOff size={15}/>:<Eye size={15}/>}</button>
        </div>
      </div>
      <div style={{ marginBottom:16 }}>
        <label style={label}>Role</label>
        <div style={{ display:'flex', gap:8 }}>
          {ROLES.map(r => (
            <button type="button" key={r} onClick={()=>set('role',r)} style={{ flex:1, padding:'8px 0', borderRadius:7, border:`1.5px solid ${form.role===r ? ROLE_COLORS[r] : 'var(--border)'}`, background: form.role===r ? `rgba(26,106,164,0.08)` : 'var(--surface-2)', color: form.role===r ? ROLE_COLORS[r] : 'var(--text)', fontWeight:600, fontSize:12, cursor:'pointer', textTransform:'capitalize' }}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginBottom:18 }}>
        <label style={{ ...label, marginBottom:10 }}>Permissions</label>
        {[['can_give_discount','Can Give Discount'],['can_edit_bill','Can Edit Bill'],['can_delete_bill','Can Delete Bill'],['can_access_reports','Can Access Reports']].map(([k,lbl])=>(
          <label key={k} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, cursor:'pointer', fontSize:13 }}>
            <div onClick={()=>setPerm(k,!form.perms[k])} style={{ width:18, height:18, borderRadius:5, border:`2px solid ${form.perms[k]?'var(--primary)':'var(--border)'}`, background:form.perms[k]?'var(--primary)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, cursor:'pointer' }}>
              {form.perms[k] && <Check size={11} color="white" />}
            </div>
            {lbl}
          </label>
        ))}
      </div>
      {err && <div style={{ fontSize:12, color:'var(--danger)', marginBottom:10, fontWeight:600 }}>{err}</div>}
      <div style={{ display:'flex', gap:10 }}>
        <button onClick={handleSave} disabled={saving} style={{ flex:1, padding:'10px', borderRadius:8, background:'var(--primary)', color:'white', border:'none', fontWeight:700, fontSize:13, cursor:'pointer' }}>
          {saving ? 'Saving…' : user ? 'Update User' : 'Create User'}
        </button>
        <button type="button" onClick={(e)=>{e.stopPropagation();onClose();}} style={{ padding:'10px 18px', borderRadius:8, border:'1.5px solid var(--border)', background:'var(--surface-2)', color:'var(--text)', fontWeight:600, fontSize:13, cursor:'pointer' }}>Cancel</button>
      </div>
    </Modal>
  );
}

export default function UserSettings() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tab, setTab] = useState('users');
  const [modal, setModal] = useState(null); // null | 'add' | user-object

  const load = async () => {
    const [ur, lr] = await Promise.all([fetch(`${API_BASE}/api/users`), fetch(`${API_BASE}/api/users/login-log?limit=50`)]);
    setUsers(await ur.json());
    setLogs(await lr.json());
  };
  useEffect(() => { (async () => { await load(); })(); }, []);

  const handleDelete = async (u) => {
    if (!window.confirm(`Deactivate user "${u.username}"?`)) return;
    await fetch(`${API_BASE}/api/users/${u.id}`, { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({requesterId:me?.id}) });
    load();
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleString('en-IN', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
        <div style={{ width:38, height:38, borderRadius:10, background:'rgba(26,106,164,0.12)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Shield size={18} color="var(--primary)" />
        </div>
        <div>
          <div style={{ fontWeight:700, fontSize:16 }}>User & Role Management</div>
          <div style={{ fontSize:12, color:'var(--text-muted)' }}>Manage staff accounts, roles and permissions</div>
        </div>
        <button onClick={()=>setModal('add')} style={{ marginLeft:'auto', padding:'8px 16px', borderRadius:8, background:'var(--primary)', color:'white', border:'none', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
          <Plus size={14} /> Add User
        </button>
      </div>

      {/* Sub-tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:18 }}>
        {[['users','👥 Users'],['log','🕐 Login Log']].map(([k,lbl])=>(
          <button key={k} onClick={()=>setTab(k)} style={{ padding:'7px 16px', borderRadius:7, border:`1.5px solid ${tab===k?'var(--primary)':'var(--border)'}`, background: tab===k?'rgba(26,106,164,0.1)':'var(--surface-2)', color: tab===k?'var(--primary)':'var(--text)', fontWeight:600, fontSize:12, cursor:'pointer' }}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'var(--surface-2)' }}>
                {['User','Role','Status','Permissions','Actions'].map(h=>(
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:600, fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u=>{
                const perms = u.permissions ? (typeof u.permissions==='string'?JSON.parse(u.permissions):u.permissions) : DEFAULT_PERMS;
                return (
                  <tr key={u.id} style={{ borderBottom:'1px solid var(--border)', opacity: u.is_active===0?0.5:1 }}>
                    <td style={{ padding:'12px 14px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:30, height:30, borderRadius:'50%', background:`linear-gradient(135deg,${ROLE_COLORS[u.role]||'var(--primary)'},#2D68B8)`, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:12, fontWeight:700, flexShrink:0 }}>
                          {u.username?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight:600 }}>{u.username}</div>
                          {u.id===me?.id && <span style={{ fontSize:10, color:'var(--primary)', fontWeight:700 }}>YOU</span>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding:'12px 14px' }}>
                      <span style={{ padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700, background:`${ROLE_COLORS[u.role]}22`, color:ROLE_COLORS[u.role]||'var(--primary)', textTransform:'capitalize' }}>{u.role}</span>
                    </td>
                    <td style={{ padding:'12px 14px' }}>
                      <span style={{ padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700, background: u.is_active!==0?'#DCFCE7':'#FEE2E2', color: u.is_active!==0?'#15803D':'#B91C1C' }}>
                        {u.is_active!==0?'Active':'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding:'12px 14px' }}>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                        {Object.entries(perms).filter(([,v])=>v).map(([k])=>(
                          <span key={k} style={{ padding:'2px 7px', borderRadius:99, fontSize:10, fontWeight:600, background:'rgba(26,106,164,0.1)', color:'var(--primary)' }}>
                            {k.replace('can_','').replace(/_/g,' ')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding:'12px 14px' }}>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={()=>setModal(u)} title="Edit" style={{ width:30, height:30, borderRadius:7, border:'1.5px solid var(--border)', background:'var(--surface-2)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)' }}><Edit2 size={13}/></button>
                        {u.id!==me?.id && (
                          <button onClick={()=>handleDelete(u)} title="Deactivate" style={{ width:30, height:30, borderRadius:7, border:'1.5px solid var(--border)', background:'var(--surface-2)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--danger)' }}><Trash2 size={13}/></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'log' && (
        <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'var(--surface-2)' }}>
                {['User','Action','IP Address','Time'].map(h=>(
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:600, fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan={4} style={{ padding:'32px', textAlign:'center', color:'var(--text-muted)' }}>No login activity yet.</td></tr>
              )}
              {logs.map(l=>(
                <tr key={l.id} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={{ padding:'10px 14px', fontWeight:600 }}>{l.username}</td>
                  <td style={{ padding:'10px 14px' }}>
                    <span style={{ padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700, background:'#DCFCE7', color:'#15803D', textTransform:'capitalize' }}>{l.action}</span>
                  </td>
                  <td style={{ padding:'10px 14px', fontFamily:'monospace', color:'var(--text-muted)' }}>{l.ip}</td>
                  <td style={{ padding:'10px 14px', color:'var(--text-muted)' }}>{fmtDate(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(modal === 'add' || (modal !== null && typeof modal === 'object')) && (
        <UserFormModal user={modal==='add'?null:modal} onClose={()=>setModal(null)} onSaved={load} />
      )}
    </div>
  );
}
