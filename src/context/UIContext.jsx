/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useRef } from 'react';

const UIContext = createContext(null);

let _toastId = 0;

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null); // { message, options, resolve }
  const resolveRef = useRef(null);

  /**
   * Show a toast notification.
   * @param {string} message
   * @param {'success'|'error'|'warning'|'info'} type
   * @param {number} duration   ms before auto-dismiss (default 3500)
   */
  const toast = useCallback((message, type = 'info', duration = 3500) => {
    const id = ++_toastId;
    setToasts(prev => [...prev, { id, message, type, duration }]);
    return id;
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  /**
   * Show a confirm dialog. Returns a Promise<boolean>.
   * @param {string} message
   * @param {{ title?: string, danger?: boolean, confirmLabel?: string, cancelLabel?: string }} options
   */
  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setConfirmState({ message, options });
    });
  }, []);

  const handleConfirmResult = useCallback((result) => {
    setConfirmState(null);
    resolveRef.current?.(result);
    resolveRef.current = null;
  }, []);

  return (
    <UIContext.Provider value={{ toast, confirm, dismissToast, toasts, confirmState, handleConfirmResult }}>
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside <UIProvider>');
  return ctx;
}
