import axios from 'axios';
import { API_BASE } from '../../api';
import { useUI } from '../../context/UIContext';
import {
  Search, Plus, User, FileText, X,
  ChevronRight, CheckCircle2, AlertCircle,
} from 'lucide-react';

/**
 * PatientModal
 * Phone-based patient lookup + new-patient registration modal.
 * All state is owned by the parent (Billing.jsx) and passed as props.
 */
export default function PatientModal({
  show,
  onClose,
  customers,
  patientModalPhone,
  setPatientModalPhone,
  patientModalMode,
  setPatientModalMode,
  patientModalMatches,
  setPatientModalMatches,
  patientModalNew,
  setPatientModalNew,
  patientModalSaving,
  setPatientModalSaving,
  onSelectCustomer,
  onSkip,
}) {
  const { toast } = useUI();

  if (!show) return null;

  const handlePhoneChange = (val) => {
    setPatientModalPhone(val);
    if (val.length >= 3) {
      const matches = customers.filter(c => c.phone && c.phone.includes(val));
      setPatientModalMatches(matches);
      if (matches.length > 0) {
        setPatientModalMode('found');
      } else {
        setPatientModalMode('new');
        setPatientModalNew(prev => ({ ...prev, name: '' }));
      }
    } else {
      setPatientModalMatches([]);
      setPatientModalMode('search');
    }
  };

  const handleRegister = async () => {
    if (!patientModalNew.name.trim()) return;
    setPatientModalSaving(true);
    try {
      const res = await axios.post(`${API_BASE}/api/customers`, {
        name: patientModalNew.name.trim(),
        phone: patientModalPhone.trim(),
        gender: patientModalNew.gender,
        reference_name: patientModalNew.reference.trim(),
      });
      const newCust = {
        id: res.data.id,
        name: patientModalNew.name.trim(),
        phone: patientModalPhone.trim(),
        gender: patientModalNew.gender,
        reference_name: patientModalNew.reference.trim(),
      };
      onSelectCustomer(newCust, {
        phone: patientModalPhone.trim(),
        name: patientModalNew.name.trim(),
        age: patientModalNew.age,
        gender: patientModalNew.gender,
        reference: patientModalNew.reference.trim(),
      }, true /* isNew */);
    } catch (err) {
      toast('Failed to register: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setPatientModalSaving(false);
    }
  };

  return (
    <div
      className="patient-modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="patient-modal-card">

        {/* ── Header ── */}
        <div className="patient-modal-header">
          <div className="patient-modal-header-avatar">
            <User size={22} color="white" />
          </div>
          <div className="patient-modal-header-text">
            <h3>Patient Lookup</h3>
            <p>Search by phone or register a new patient</p>
          </div>
          <button className="patient-modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="patient-modal-body">

          {/* Phone Search */}
          <div className="pm-phone-group">
            <label>
              <Search size={12} />
              Phone Number
            </label>
            <div className="pm-phone-input-wrap">
              <span className="phone-prefix">+91</span>
              <input
                autoFocus
                className="pm-phone-input"
                type="tel"
                placeholder="Enter mobile number..."
                value={patientModalPhone}
                onChange={e => handlePhoneChange(e.target.value)}
              />
            </div>
          </div>

          {/* ── FOUND: matched customers ── */}
          {patientModalMode === 'found' && patientModalMatches.length > 0 && (
            <div>
              <div className="pm-found-header">
                <CheckCircle2 size={14} />
                {patientModalMatches.length} patient{patientModalMatches.length > 1 ? 's' : ''} found
              </div>
              <div className="pm-match-list">
                {patientModalMatches.map(c => (
                  <button
                    key={c.id}
                    className="pm-match-card"
                    onClick={() => {
                      onSelectCustomer(c, {
                        phone: c.phone || patientModalPhone,
                        name: c.name || '',
                        age: c.age || '',
                        gender: c.gender || 'Male',
                        reference: c.reference_name || '',
                      }, false /* not new */);
                    }}
                  >
                    <div className="pm-match-avatar">
                      {c.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="pm-match-info">
                      <div className="name">{c.name}</div>
                      <div className="detail">
                        {c.phone}
                        {c.gender && <><span className="dot" />{c.gender}</>}
                      </div>
                    </div>
                    <ChevronRight size={16} style={{ color: 'var(--text-light)', flexShrink: 0 }} />
                  </button>
                ))}
              </div>
              <button
                className="pm-register-alt"
                onClick={() => {
                  setPatientModalMode('new');
                  setPatientModalNew({ name: '', age: '', gender: 'Male', reference: '' });
                }}
              >
                <Plus size={14} />
                Register as new patient instead
              </button>
            </div>
          )}

          {/* ── NEW: registration form ── */}
          {patientModalMode === 'new' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="pm-new-notice">
                <AlertCircle size={15} />
                No patient found. Fill details below to register.
              </div>

              {/* Name */}
              <div className="pm-form-group">
                <label className="pm-form-label">
                  <User size={12} />
                  Full Name <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  className="pm-form-input"
                  type="text"
                  placeholder="Patient full name"
                  value={patientModalNew.name}
                  onChange={e => setPatientModalNew(p => ({ ...p, name: e.target.value }))}
                />
              </div>

              {/* Age + Gender */}
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="pm-form-group" style={{ flex: '0 0 90px' }}>
                  <label className="pm-form-label">Age</label>
                  <input
                    className="pm-form-input"
                    type="number"
                    min="0"
                    max="150"
                    placeholder="Age"
                    value={patientModalNew.age}
                    onChange={e => setPatientModalNew(p => ({ ...p, age: e.target.value }))}
                    style={{ textAlign: 'center' }}
                  />
                </div>
                <div className="pm-form-group" style={{ flex: 1 }}>
                  <label className="pm-form-label">Gender</label>
                  <div className="pm-gender-pills">
                    {[{ val: 'Male', icon: '♂' }, { val: 'Female', icon: '♀' }, { val: 'Other', icon: '⚧' }].map(g => (
                      <button
                        key={g.val}
                        className={`pm-gender-pill ${patientModalNew.gender === g.val ? 'active' : 'inactive'}`}
                        onClick={() => setPatientModalNew(p => ({ ...p, gender: g.val }))}
                      >
                        <span>{g.icon}</span>
                        {g.val}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tracking Ref */}
              <div className="pm-form-group">
                <label className="pm-form-label">
                  <FileText size={12} />
                  Tracking Ref.
                </label>
                <input
                  className="pm-form-input"
                  type="text"
                  placeholder="Tracking reference (optional)"
                  value={patientModalNew.reference}
                  onChange={e => setPatientModalNew(p => ({ ...p, reference: e.target.value }))}
                />
              </div>

              {/* Actions */}
              <div className="pm-actions">
                <button
                  className={`pm-btn-primary ${patientModalNew.name.trim() && !patientModalSaving ? 'enabled' : 'disabled'}`}
                  disabled={!patientModalNew.name.trim() || patientModalSaving}
                  onClick={handleRegister}
                >
                  <CheckCircle2 size={16} />
                  {patientModalSaving ? 'Saving…' : 'Register & Add'}
                </button>
                <button
                  className="pm-btn-secondary"
                  onClick={() => {
                    onSkip({
                      phone: patientModalPhone.trim(),
                      name: patientModalNew.name.trim(),
                      age: patientModalNew.age,
                      gender: patientModalNew.gender,
                      reference: patientModalNew.reference.trim(),
                    });
                  }}
                >
                  Skip
                </button>
              </div>
            </div>
          )}

          {/* ── IDLE: no phone typed yet ── */}
          {patientModalMode === 'search' && !patientModalPhone && (
            <div className="pm-idle-state">
              <div className="idle-icon-wrap">
                <Search size={24} style={{ opacity: 0.35 }} />
              </div>
              <p>Enter phone number to search patients</p>
              <small>Ctrl+D to quick-focus</small>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
