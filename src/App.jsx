import { lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { ThemeProvider } from './context/ThemeContext';
import { UIProvider } from './context/UIContext';
import Login from './components/Login';
import Layout from './components/Layout';
import Toast from './components/Toast';
import ConfirmModal from './components/ConfirmModal';

const Inventory      = lazy(() => import('./pages/Inventory'));
const Billing        = lazy(() => import('./pages/Billing'));
const SalesHistory   = lazy(() => import('./pages/Sales'));
const Customers      = lazy(() => import('./pages/Customers'));
const Reports        = lazy(() => import('./pages/Reports'));
const PurchaseHub    = lazy(() => import('./pages/PurchaseHub'));
const Settings       = lazy(() => import('./pages/Settings'));

const PageLoader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)', fontSize: 14 }}>
    Loading…
  </div>
);

// Protected Route Wrapper
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return children;
};

function App() {
  return (
    <Router>
      <ThemeProvider>
        <UIProvider>
          <SettingsProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<Login />} />

                <Route path="/" element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }>
                  <Route index element={<Navigate to="billing" replace />} />
                  <Route path="inventory" element={<Inventory />} />
                  <Route path="billing" element={<Billing />} />
                  <Route path="sales" element={<SalesHistory />} />
                  <Route path="customers" element={<Customers />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="purchase-entry" element={<PurchaseHub />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
              </Routes>
            </Suspense>
            <Toast />
            <ConfirmModal />
          </SettingsProvider>
        </UIProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;
