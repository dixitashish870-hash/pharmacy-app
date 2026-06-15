import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { API_BASE } from '../api';
import {
  Package, ShoppingCart, Receipt,
  LogOut, Users, Bell, BarChart2, Sun, Moon, Palette,
  Truck, RefreshCw, Download, Loader, Settings2,
  AlertCircle, CheckCircle, X, AlertTriangle, Clock,
  ChevronLeft, ChevronRight
} from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const { themeId, setThemeId, themes } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [time, setTime] = useState(new Date());
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [activeRipple, setActiveRipple] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [alerts, setAlerts] = useState({ expiring: [], expired: [] });
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(() => localStorage.getItem('sidebar-expanded') === 'true');

  const [updateState, setUpdateState] = useState('idle');
  const [showToast, setShowToast]     = useState(false);
  const [toastMsg, setToastMsg]       = useState(null);
  const [version, setVersion]         = useState('');
  const isElectron = typeof window !== 'undefined' && !!window.api;

  useEffect(() => {
    if (isElectron && window.api?.getAppVersion) {
      window.api.getAppVersion().then(setVersion).catch(console.error);
    }
  }, [isElectron]);

  // Fetch expiry alerts on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/products/expiring`)
      .then(r => r.json())
      .then(data => setAlerts({ expiring: data.expiring || [], expired: data.expired || [] }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!isElectron) return;
    window.api.onUpdateAvailable((info) => {
      setUpdateState('available');

      setToastMsg({ type: 'available', ...info }); setShowToast(true);
    });
    window.api.onUpdateDownloaded((info) => {
      if (info.upToDate) {
        setUpdateState('upToDate');
        setToastMsg({ type: 'upToDate', current: info.current });
        setShowToast(true);
        setTimeout(() => setShowToast(false), 4000);
      } else {
        setUpdateState('downloaded');
        setToastMsg({ type: 'downloaded', latest: info.latest, current: info.current, notes: info.notes });
        setShowToast(true);
      }
    });
    window.api.onUpdateError((err) => {
      setUpdateState('error');
      
      // Sanitize the raw error message to make it human-readable
      let cleanMsg = 'An error occurred while checking for updates.';
      if (err) {
        const errStr = typeof err === 'string' ? err : (err.message || err.toString());
        if (errStr.includes('404')) {
          cleanMsg = 'No update release found on GitHub (404). Please ensure a release is published on your repository.';
        } else if (errStr.includes('ENOTFOUND') || errStr.includes('EAI_AGAIN') || errStr.includes('offline')) {
          cleanMsg = 'Network connection error. Please check your internet connection.';
        } else if (errStr.includes('Update repository owner is not configured')) {
          cleanMsg = 'Update repository owner is not configured in package.json.';
        } else {
          // Extract first line of error and truncate if too long
          const firstLine = errStr.split('\n')[0].trim();
          cleanMsg = firstLine.length > 120 ? firstLine.substring(0, 120) + '...' : firstLine;
        }
      }

      setToastMsg({ type: 'error', message: cleanMsg });
      setShowToast(true);
      setTimeout(() => setShowToast(false), 8000); // Give the user more time to read the error
    });
    return () => window.api.removeUpdateListeners?.();
  }, [isElectron]);

  const handleCheckUpdate = () => {
    if (!isElectron) return;
    setUpdateState('checking');
    window.api.checkForUpdates();
    setTimeout(() => setUpdateState(s => s === 'checking' ? 'idle' : s), 10000);
  };

  const handleInstall = () => { if (isElectron) window.api.installUpdate(); };

  const navigation = [
    { name: 'POS',       href: '/billing',       icon: ShoppingCart, color: '#6366F1' },
    { name: 'Inventory', href: '/inventory',      icon: Package,      color: '#0EA5E9' },
    { name: 'Purchase',  href: '/purchase-entry', icon: Truck,        color: '#10B981' },
    { name: 'Customers', href: '/customers',      icon: Users,        color: '#F59E0B' },
    { name: 'Sales',     href: '/sales',          icon: Receipt,      color: '#EC4899' },
    { name: 'Reports',   href: '/reports',        icon: BarChart2,    color: '#8B5CF6' },
    ...(user?.role === 'admin' ? [{ name: 'Settings', href: '/settings', icon: Settings2, color: '#64748B' }] : []),
  ];

  const isActive = (href) => location.pathname.startsWith(href);
  const fmtTime = time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const fmtSec  = time.toLocaleTimeString('en-IN', { second: '2-digit' }).replace(/.*:/, '');
  const fmtDate = time.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

  const activeNav   = navigation.find(n => isActive(n.href));
  const activeColor = activeNav?.color || '#6366F1';

  const handleNavClick = (href, idx) => {
    setActiveRipple(idx);
    setTimeout(() => setActiveRipple(null), 500);
    navigate(href);
  };

  const SIDEBAR_W = isSidebarExpanded ? 180 : 64;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>

      {/* ── TOP BAR ── */}
      <header className="top-bar-v2" style={{ background: 'var(--bg-topbar)' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Custom Pharmiq 'P' Logo Mark */}
          <div style={{
            position: 'relative', width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ filter: 'drop-shadow(0px 4px 8px rgba(0, 198, 255, 0.25))' }}>
              <defs>
                <linearGradient id="pGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00E1D9" />
                  <stop offset="100%" stopColor="#0A194F" />
                </linearGradient>
                <linearGradient id="pGrad3" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#00A3FF" />
                  <stop offset="100%" stopColor="#00E1D9" />
                </linearGradient>
              </defs>
              {/* Main Arc */}
              <path d="M 30 15 L 60 15 A 35 35 0 0 1 60 85 L 40 85 L 40 40 L 25 40 L 25 20 A 5 5 0 0 1 30 15 Z" fill="url(#pGrad1)" />
              {/* Left Block */}
              <path d="M 12 40 L 25 40 L 25 55 L 12 55 A 4 4 0 0 1 8 51 L 8 44 A 4 4 0 0 1 12 40 Z" fill="#0A194F" />
              {/* Bottom Stem */}
              <path d="M 25 55 L 40 55 L 40 75 A 10 10 0 0 1 30 85 L 25 85 Z" fill="url(#pGrad3)" />
            </svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.5px', lineHeight: 1 }}>
              <span style={{ color: 'var(--text)' }}>Pharm</span><span style={{ color: '#00A3FF' }}>iq</span>
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.8px', marginTop: 2 }}>
              SMART PHARMACY. <span style={{ color: '#00A3FF' }}>SIMPLIFIED.</span>
            </div>
          </div>
        </div>

        {/* Active page pill */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', borderRadius: 99,
            background: `${activeColor}18`, border: `1px solid ${activeColor}30`,
          }}>
            {activeNav && <activeNav.icon size={13} style={{ color: activeColor }} />}
            <span style={{ fontSize: 12, fontWeight: 600, color: activeColor }}>
              {activeNav?.name || 'Home'}
            </span>
          </div>
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Clock */}
          <div className="top-clock">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{fmtTime}</span>
              <span style={{ fontSize: 11, color: 'var(--text-light)', fontVariantNumeric: 'tabular-nums' }}>{fmtSec}s</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right' }}>{fmtDate}</div>
          </div>

          {/* Theme Switcher */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowThemeMenu(v => !v)} title="Change Theme" className="icon-btn">
              <Palette size={15} />
            </button>
            {showThemeMenu && (
              <div className="user-dropdown" style={{ right: 0, width: 'auto', padding: 12, display: 'flex', gap: 10, animation: 'dropIn 0.2s cubic-bezier(0.34,1.56,0.64,1)' }}>
                {themes.map(t => (
                  <button
                    key={t.id}
                    title={t.name}
                    onClick={() => { setThemeId(t.id); setShowThemeMenu(false); }}
                    style={{
                      width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
                      background: t.colorPreview,
                      border: themeId === t.id ? '2px solid var(--brand-blue)' : '2px solid var(--border)',
                      boxShadow: themeId === t.id ? '0 0 0 2px rgba(26,111,255,0.2)' : 'none',
                      transition: 'all 0.2s'
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {isElectron && (
            <button id="update-check-btn" onClick={handleCheckUpdate} className="icon-btn"
              style={{ borderColor: updateState === 'available' ? '#10B981' : undefined, color: updateState === 'available' ? '#10B981' : undefined }}
            >
              {updateState === 'checking' ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                : updateState === 'available' ? <Download size={14} /> : <RefreshCw size={14} />}
              {updateState === 'available' && <span className="dot-badge" style={{ background: '#10B981' }} />}
            </button>
          )}

          {/* Notifications */}
          <div style={{ position: 'relative' }}>
            <button
              className="icon-btn"
              style={{ position: 'relative' }}
              onClick={() => setShowNotifications(v => !v)}
              title="Expiry Alerts"
            >
              <Bell size={15} />
              {(alerts.expiring.length + alerts.expired.length) > 0 && (
                <span className="dot-badge" style={{ background: alerts.expired.length > 0 ? '#EF4444' : '#F59E0B' }} />
              )}
            </button>
            {showNotifications && (
              <div className="notif-dropdown" onClick={e => e.stopPropagation()}>
                <div className="notif-header">
                  <Bell size={13} />
                  <span>Expiry Alerts</span>
                  <span className="notif-count">{alerts.expiring.length + alerts.expired.length}</span>
                  <button className="toast-close" style={{ marginLeft: 'auto' }} onClick={() => setShowNotifications(false)}>
                    <X size={13} />
                  </button>
                </div>
                <div className="notif-body">
                  {alerts.expired.length === 0 && alerts.expiring.length === 0 && (
                    <div className="notif-empty"><CheckCircle size={24} style={{ color: '#10B981', marginBottom: 6 }} /><div>All clear — no expiry issues!</div></div>
                  )}
                  {alerts.expired.length > 0 && (
                    <div className="notif-section-title" style={{ color: '#EF4444' }}>
                      <AlertCircle size={11} /> Expired ({alerts.expired.length})
                    </div>
                  )}
                  {alerts.expired.map(p => (
                    <div key={p.id} className="notif-item expired">
                      <div className="notif-name">{p.name}</div>
                      <div className="notif-meta">Batch: {p.batch || 'N/A'} · Exp: {p.expiry}</div>
                    </div>
                  ))}
                  {alerts.expiring.length > 0 && (
                    <div className="notif-section-title" style={{ color: '#F59E0B' }}>
                      <Clock size={11} /> Expiring Soon ({alerts.expiring.length})
                    </div>
                  )}
                  {alerts.expiring.map(p => (
                    <div key={p.id} className="notif-item expiring">
                      <div className="notif-name">{p.name}</div>
                      <div className="notif-meta">Batch: {p.batch || 'N/A'} · Exp: {p.expiry}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowUserMenu(v => !v)} className="user-avatar-btn">
              <div className="user-avatar">{user?.username?.[0]?.toUpperCase()}</div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2, color: 'var(--text)' }}>{user?.username}</div>
                <div style={{ fontSize: 10, color: 'var(--text-light)', textTransform: 'capitalize' }}>{user?.role}</div>
              </div>
            </button>
            {showUserMenu && (
              <div className="user-dropdown">
                <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{user?.username}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{user?.role} Account</div>
                </div>
                <button onClick={() => { logout(); setShowUserMenu(false); }} className="user-dropdown-item danger">
                  <LogOut size={14} /> Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT (right-padding for sidebar) ── */}
      <main style={{
        flex: 1,
        marginTop: 'var(--top-bar-h)',
        marginRight: SIDEBAR_W + 'px',
        overflowY: 'auto',
        background: 'var(--bg-main)',
        transition: 'margin-right 300ms cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{ padding: '20px 24px', minHeight: '100%' }}>
          <Outlet />
        </div>
      </main>

      <div
        className={`right-nav ${isSidebarExpanded ? 'expanded' : ''}`}
        style={{ width: SIDEBAR_W, background: 'var(--bg-sidebar)' }}
      >
        {/* Toggle button */}
        <button
          className="right-nav-toggle"
          onClick={() => {
            const next = !isSidebarExpanded;
            setIsSidebarExpanded(next);
            localStorage.setItem('sidebar-expanded', String(next));
          }}
          title={isSidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
        >
          {isSidebarExpanded ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {/* Nav items */}
        <div className="right-nav-items">
          {navigation.map(({ name, href, icon: Icon, color }, idx) => { // eslint-disable-line no-unused-vars
            const active = isActive(href);
            return (
              <button
                key={href}
                className={`rn-item ${active ? 'active' : ''}`}
                onClick={() => handleNavClick(href, idx)}
                title={name}
                style={{ '--item-color': color }}
              >
                {activeRipple === idx && <span className="rn-ripple" />}
                {active && <div className="rn-active-bar" style={{ background: color }} />}
                <div className="rn-icon-wrap">
                  {active && <div className="rn-glow" style={{ background: color }} />}
                  <Icon size={19} className="rn-icon" />
                </div>
                <span className="rn-label">{name}</span>
              </button>
            );
          })}
        </div>

        {/* Version Display */}
        <div style={{ marginTop: 'auto', padding: '16px 0', borderTop: '1px solid var(--border)', textAlign: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.5px' }}>
            v{version || '1.0.0'}
          </span>
        </div>
      </div>

      {/* ── UPDATE TOAST ── */}
      {showToast && toastMsg && (
        <div id="update-toast" className="update-toast" style={{
          borderColor: (toastMsg.type === 'available' || toastMsg.type === 'downloaded') ? '#10B981' : toastMsg.type === 'error' ? '#EF4444' : '#6366F1'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="toast-icon" style={{
              background: (toastMsg.type === 'available' || toastMsg.type === 'downloaded') ? 'rgba(16,185,129,0.12)' :
                          toastMsg.type === 'error'     ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.12)',
            }}>
              {(toastMsg.type === 'available' || toastMsg.type === 'downloaded') ? <Download size={16} color="#10B981" /> :
               toastMsg.type === 'error'     ? <AlertCircle size={16} color="#EF4444" /> :
                                               <CheckCircle size={16} color="#6366F1" />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                {toastMsg.type === 'available' ? `Update v${toastMsg.latest} Available` :
                 toastMsg.type === 'downloaded' ? `Update v${toastMsg.latest} Downloaded` :
                 toastMsg.type === 'error'     ? 'Update Check Failed' : 'App is Up to Date'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                {toastMsg.type === 'available' || toastMsg.type === 'downloaded' ? `Current: v${toastMsg.current}` :
                 toastMsg.type === 'error'     ? toastMsg.message : `v${toastMsg.current} — latest`}
              </div>
            </div>
            <button onClick={() => setShowToast(false)} className="toast-close"><X size={14} /></button>
          </div>
          {(toastMsg.type === 'available' || toastMsg.type === 'downloaded') && toastMsg.notes && (
            <div className="toast-notes">{toastMsg.notes}</div>
          )}
          {(toastMsg.type === 'available' || toastMsg.type === 'downloaded') && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={handleInstall} className="toast-install-btn">
                <Download size={13} /> {toastMsg.type === 'downloaded' ? 'Restart Now' : 'Install Update'}
              </button>
              <button onClick={() => setShowToast(false)} className="toast-later-btn">Later</button>
            </div>
          )}
        </div>
      )}

      <style>{`
        /* ── Top bar ── */
        .top-bar-v2 {
          position: fixed; top: 0; left: 0; right: 0;
          height: var(--top-bar-h);
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          box-shadow: 0 1px 20px rgba(0,0,0,0.06);
          display: flex; align-items: center;
          padding: 0 20px; gap: 16px; z-index: 200;
        }
        [data-theme="dark"] .top-bar-v2 {
          background: rgba(26,29,39,0.95);
          box-shadow: 0 1px 20px rgba(0,0,0,0.3);
        }

        .icon-btn {
          width: 34px; height: 34px; border-radius: 10px;
          border: 1px solid var(--border); background: var(--surface-2);
          display: flex; align-items: center; justify-content: center;
          color: var(--text-muted); cursor: pointer; position: relative;
          transition: all 180ms ease; flex-shrink: 0;
        }
        .icon-btn:hover {
          border-color: #6366F1; color: #6366F1;
          background: rgba(99,102,241,0.08);
          transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,0.15);
        }
        .dot-badge {
          position: absolute; top: 6px; right: 6px;
          width: 7px; height: 7px; background: var(--danger);
          border-radius: 50%; border: 1.5px solid var(--surface);
        }
        .top-clock {
          padding: 4px 12px; border-radius: 10px;
          background: var(--surface-2); border: 1px solid var(--border); text-align: right;
        }
        .user-avatar-btn {
          display: flex; align-items: center; gap: 8px;
          padding: 5px 10px 5px 5px; border-radius: 12px;
          border: 1px solid var(--border); background: var(--surface-2);
          cursor: pointer; transition: all 180ms ease;
        }
        .user-avatar-btn:hover { border-color: rgba(99,102,241,0.4); box-shadow: 0 0 0 3px rgba(99,102,241,0.08); }
        .user-avatar {
          width: 28px; height: 28px; border-radius: 50%;
          background: linear-gradient(135deg,#6366F1,#8B5CF6);
          display: flex; align-items: center; justify-content: center;
          color: white; font-size: 12px; font-weight: 800;
          box-shadow: 0 2px 8px rgba(99,102,241,0.35); flex-shrink: 0;
        }
        .user-dropdown {
          position: absolute; top: calc(100% + 8px); right: 0; width: 180px;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,0.15);
          z-index: 300; overflow: hidden;
          animation: dropIn 0.2s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes dropIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .user-dropdown-item {
          width: 100%; padding: 10px 16px;
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; font-weight: 600;
          background: none; border: none; cursor: pointer; color: var(--text);
          transition: background 150ms;
        }
        .user-dropdown-item:hover { background: var(--surface-2); }
        .user-dropdown-item.danger { color: var(--danger); }
        .user-dropdown-item.danger:hover { background: rgba(239,68,68,0.06); }

        /* ════════════════════════════════════
           RIGHT SIDE COLLAPSIBLE NAV
        ════════════════════════════════════ */
        .right-nav {
          position: fixed;
          top: var(--top-bar-h); right: 0; bottom: 0;
          background: var(--surface);
          border-left: 1px solid var(--border);
          box-shadow: -4px 0 32px rgba(0,0,0,0.08);
          display: flex; flex-direction: column;
          z-index: 150;
          transition: width 300ms cubic-bezier(0.4,0,0.2,1);
          overflow-x: hidden;
          overflow-y: auto;
        }
        [data-theme="dark"] .right-nav {
          background: rgba(26,29,39,0.98);
          box-shadow: -4px 0 24px rgba(0,0,0,0.3);
        }

        .right-nav-toggle {
          display: flex; align-items: center; justify-content: center;
          width: 100%; height: 36px; flex-shrink: 0;
          background: none; border: none; border-bottom: 1px solid var(--border);
          color: var(--text-muted); cursor: pointer;
          transition: all 180ms;
        }
        .right-nav-toggle:hover { background: var(--surface-2); color: #6366F1; }

        .right-nav-items {
          flex-shrink: 0; overflow-x: hidden;
          display: flex; flex-direction: column;
          padding: 8px 0; gap: 2px;
        }

        .rn-item {
          position: relative; display: flex; align-items: center; gap: 12px;
          padding: 10px 0 10px 20px;
          background: none; border: none; cursor: pointer;
          border-radius: 0;
          overflow: hidden;
          transition: background 180ms ease;
          white-space: nowrap;
          --item-color: #6366F1;
        }
        .rn-item:hover { background: rgba(128,128,128,0.07); }
        .rn-item.active { background: color-mix(in srgb, var(--item-color) 10%, transparent); }

        /* Colored left accent bar */
        .rn-active-bar {
          position: absolute; left: 0; top: 50%;
          transform: translateY(-50%);
          width: 3px; height: 60%; border-radius: 0 3px 3px 0;
          animation: barPop 0.25s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes barPop {
          from { height: 0; opacity: 0; }
          to   { height: 60%; opacity: 1; }
        }

        .rn-icon-wrap {
          position: relative; width: 24px; height: 24px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .rn-glow {
          position: absolute; inset: -6px; border-radius: 50%;
          opacity: 0.2; filter: blur(10px);
          animation: glowPulse 2.5s ease-in-out infinite;
        }
        @keyframes glowPulse {
          0%,100% { opacity: 0.15; transform: scale(0.8); }
          50%      { opacity: 0.3;  transform: scale(1.2); }
        }
        .rn-icon {
          position: relative; z-index: 1;
          color: var(--text-light);
          transition: all 220ms cubic-bezier(0.34,1.56,0.64,1);
        }
        .rn-item.active .rn-icon {
          color: var(--item-color);
          filter: drop-shadow(0 2px 6px color-mix(in srgb, var(--item-color) 60%, transparent));
          transform: scale(1.1);
        }
        .rn-item:not(.active):hover .rn-icon {
          color: var(--text); transform: scale(1.05);
        }

        .rn-label {
          font-size: 13px; font-weight: 600;
          color: var(--text-muted);
          transition: opacity 250ms ease, max-width 300ms ease, color 180ms;
          overflow: hidden;
          opacity: 0;
          max-width: 0;
        }
        .right-nav.expanded .rn-label {
          opacity: 1;
          max-width: 120px;
        }
        .rn-item.active .rn-label { color: var(--item-color); font-weight: 700; }
        .rn-item:not(.active):hover .rn-label { color: var(--text); }

        /* Ripple */
        .rn-ripple {
          position: absolute; inset: 0;
          background: radial-gradient(circle at left, rgba(128,128,255,0.18) 0%, transparent 70%);
          animation: rippleOut 0.5s ease-out forwards; pointer-events: none;
        }
        @keyframes rippleOut {
          from { opacity: 1; transform: scale(0.8); }
          to   { opacity: 0; transform: scale(2); }
        }

        /* ── Update Toast ── */
        .update-toast {
          position: fixed; bottom: 24px; right: 80px; z-index: 9999;
          background: var(--surface); border: 1.5px solid;
          border-radius: 18px; box-shadow: 0 12px 40px rgba(0,0,0,0.18);
          padding: 14px 16px; min-width: 300px; max-width: 380px;
          animation: slideUpIn 0.35s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes slideUpIn {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .toast-icon {
          width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .toast-notes {
          background: rgba(16,185,129,0.06); border-radius: 8px; padding: 8px 10px;
          font-size: 12px; color: var(--text); line-height: 1.5;
          border-left: 3px solid #10B981; margin-top: 10px;
        }
        .toast-close {
          background: none; border: none; cursor: pointer;
          color: var(--text-muted); padding: 4px; border-radius: 6px;
        }
        .toast-close:hover { background: var(--surface-2); }
        .toast-install-btn {
          flex: 1; padding: 8px 0; border-radius: 10px;
          background: linear-gradient(135deg,#10B981,#059669);
          color: white; font-weight: 700; font-size: 12px; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          box-shadow: 0 4px 12px rgba(16,185,129,0.3); transition: all 180ms;
        }
        .toast-install-btn:hover { filter: brightness(1.08); transform: translateY(-1px); }
        .toast-later-btn {
          padding: 8px 14px; border-radius: 10px;
          background: var(--surface-2); color: var(--text-muted);
          font-weight: 600; font-size: 12px; border: 1px solid var(--border); cursor: pointer;
        }

        /* ── Notification Dropdown ── */
        .notif-dropdown {
          position: absolute; top: calc(100% + 8px); right: 0; width: 300px;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 16px; box-shadow: 0 12px 40px rgba(0,0,0,0.15);
          z-index: 300; overflow: hidden;
          animation: dropIn 0.2s cubic-bezier(0.34,1.56,0.64,1);
        }
        .notif-header {
          display: flex; align-items: center; gap: 7px;
          padding: 11px 14px; border-bottom: 1px solid var(--border);
          font-size: 12px; font-weight: 700; color: var(--text);
        }
        .notif-count {
          font-size: 10px; font-weight: 800; background: var(--danger);
          color: #fff; border-radius: 99px; padding: 1px 6px;
        }
        .notif-body { max-height: 320px; overflow-y: auto; padding: 8px 0; }
        .notif-empty {
          display: flex; flex-direction: column; align-items: center;
          padding: 28px 16px; font-size: 12px; color: var(--text-muted); font-weight: 600;
        }
        .notif-section-title {
          display: flex; align-items: center; gap: 5px;
          padding: 6px 14px 3px; font-size: 10px; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .notif-item {
          padding: 8px 14px; border-bottom: 1px solid var(--border);
          transition: background 120ms;
        }
        .notif-item:last-child { border-bottom: none; }
        .notif-item:hover { background: var(--surface-2); }
        .notif-item.expired { border-left: 3px solid #EF4444; }
        .notif-item.expiring { border-left: 3px solid #F59E0B; }
        .notif-name { font-size: 12px; font-weight: 700; color: var(--text); }
        .notif-meta { font-size: 10px; color: var(--text-muted); margin-top: 2px; font-weight: 600; }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
