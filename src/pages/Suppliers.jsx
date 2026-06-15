import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';
import { useUI } from '../context/UIContext';
import { Users, Plus, Search, Edit2, Trash2, Mail, Phone, MapPin, X } from 'lucide-react';

const inp = {
  width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 10, padding: '8px 14px', fontSize: 13, color: 'var(--text)',
  outline: 'none', fontFamily: 'inherit',
};
const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' };

export default function Suppliers() {
  const { toast, confirm } = useUI();
  const [suppliers, setSuppliers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentSupplier, setCurrentSupplier] = useState({ name: '', phone: '', email: '', address: '', gstin: '' });

  useEffect(() => { fetchSuppliers(); }, []);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/suppliers`);
      setSuppliers(res.data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isEditing) {
        await axios.put(`${API_BASE}/api/suppliers/${currentSupplier.id}`, currentSupplier);
      } else {
        await axios.post(`${API_BASE}/api/suppliers`, currentSupplier);
      }
      setModalOpen(false); setIsEditing(false);
      setCurrentSupplier({ name: '', phone: '', email: '', address: '', gstin: '' });
      fetchSuppliers();
    } catch (e) { console.error(e); toast('Failed to save supplier', 'error'); }
  };

  const handleEdit = (s) => { setCurrentSupplier(s); setIsEditing(true); setModalOpen(true); };

  const handleDelete = async (id) => {
    const ok = await confirm('Delete this supplier? This cannot be undone.', { danger: true, title: 'Delete Supplier', confirmLabel: 'Delete' });
    if (!ok) return;
    try { await axios.delete(`${API_BASE}/api/suppliers/${id}`); fetchSuppliers(); }
    catch (e) { console.error(e); }
  };

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.gstin && s.gstin.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="h-[calc(100vh-80px)] overflow-hidden flex flex-col p-4" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex justify-between items-end mb-6 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Supplier Management</h1>
          <p className="text-sm font-medium mt-1" style={{ color: 'var(--text-muted)' }}>Manage your pharmacy's medical distributors and vendors.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5" style={{ color: 'var(--text-light)' }} />
            <input type="text" placeholder="Search suppliers or GSTIN..."
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              style={{ ...inp, paddingLeft: 36, width: 256 }} />
          </div>
          <button onClick={() => { setIsEditing(false); setCurrentSupplier({ name: '', phone: '', email: '', address: '', gstin: '' }); setModalOpen(true); }}
            className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all border border-indigo-500">
            <Plus size={18} /> Add Supplier
          </button>
        </div>
      </div>

      {/* Table Card */}
      <div className="flex-1 rounded-2xl shadow-sm overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {loading ? (
          <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>Loading suppliers...</div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12" style={{ color: 'var(--text-muted)' }}>
            <Users size={48} className="mb-4 opacity-20" />
            <p className="text-lg font-medium" style={{ color: 'var(--text-muted)' }}>No suppliers found</p>
            <p className="text-sm mt-1">Add your first distributor to get started.</p>
          </div>
        ) : (
          <div className="overflow-auto flex-1">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  {['Supplier Details', 'Contact Info', 'GSTIN', 'Address', 'Actions'].map((h, i) => (
                    <th key={i} className={`py-3 px-6 text-xs font-bold uppercase tracking-wider ${i === 4 ? 'text-right' : 'text-left'}`}
                      style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} className="group transition-colors"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td className="py-4 px-6">
                      <div className="font-bold text-base" style={{ color: 'var(--text)' }}>{s.name}</div>
                      <div className="text-[10px] text-indigo-500 font-bold mt-0.5 uppercase tracking-wider">Verified Distributor</div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                          <Phone size={13} style={{ color: 'var(--text-light)' }} /> {s.phone || 'N/A'}
                        </div>
                        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                          <Mail size={13} style={{ color: 'var(--text-light)' }} /> {s.email || 'N/A'}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="text-sm font-mono font-medium px-2.5 py-1 rounded-lg" style={{ color: 'var(--text)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        {s.gstin || 'NOT PROVIDED'}
                      </span>
                    </td>
                    <td className="py-4 px-6 max-w-xs">
                      <div className="flex items-start gap-2 text-sm italic" style={{ color: 'var(--text-muted)' }}>
                        <MapPin size={13} style={{ color: 'var(--text-light)', marginTop: 2, flexShrink: 0 }} />
                        <span>{s.address || 'No address provided'}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEdit(s)}
                          className="p-2 text-indigo-500 hover:bg-indigo-500/10 rounded-xl transition-colors">
                          <Edit2 size={17} />
                        </button>
                        <button onClick={() => handleDelete(s.id)}
                          className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors">
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-6 py-3 text-xs font-medium" style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          Total Distributors: {suppliers.length}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" style={{ background: 'var(--surface)' }}>
            <div className="px-6 py-4 flex justify-between items-center" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <div className="flex items-center gap-3">
                <div className="bg-indigo-500/20 p-2 rounded-xl text-indigo-500"><Users size={20} /></div>
                <div>
                  <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>{isEditing ? 'Edit Supplier' : 'Add New Supplier'}</h2>
                  <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Enter distributor details below.</p>
                </div>
              </div>
              <button onClick={() => setModalOpen(false)} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label style={lbl}>Distributor Name *</label>
                <input type="text" required value={currentSupplier.name}
                  onChange={e => setCurrentSupplier({ ...currentSupplier, name: e.target.value })}
                  style={inp} placeholder="e.g. Acme Medical Supplies" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label style={lbl}>Phone Number</label>
                  <input type="text" value={currentSupplier.phone}
                    onChange={e => setCurrentSupplier({ ...currentSupplier, phone: e.target.value })}
                    style={inp} placeholder="9988776655" />
                </div>
                <div>
                  <label style={lbl}>GSTIN</label>
                  <input type="text" value={currentSupplier.gstin}
                    onChange={e => setCurrentSupplier({ ...currentSupplier, gstin: e.target.value.toUpperCase() })}
                    style={{ ...inp, fontFamily: 'monospace' }} placeholder="27AAAAA0000A1Z5" />
                </div>
              </div>
              <div>
                <label style={lbl}>Email Address</label>
                <input type="email" value={currentSupplier.email}
                  onChange={e => setCurrentSupplier({ ...currentSupplier, email: e.target.value })}
                  style={inp} placeholder="contact@example.com" />
              </div>
              <div>
                <label style={lbl}>Office Address</label>
                <textarea value={currentSupplier.address}
                  onChange={e => setCurrentSupplier({ ...currentSupplier, address: e.target.value })}
                  style={{ ...inp, resize: 'none' }} rows={3} placeholder="Full office or warehouse address..." />
              </div>
              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setModalOpen(false)}
                  style={{ flex: 1, padding: '10px', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit"
                  className="flex-1 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all border border-indigo-500">
                  {isEditing ? 'Update Supplier' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
