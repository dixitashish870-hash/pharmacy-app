/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem('pharmacy_user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed.expires_at && Date.now() > parsed.expires_at) {
          localStorage.removeItem('pharmacy_user');
          return null;
        }
        return parsed;
      } catch {
        console.error('Failed to parse user session');
        return null;
      }
    }
    return null;
  });
  const [loading] = useState(false);

  const login = (userData) => {
    const session = { ...userData, expires_at: Date.now() + 8 * 60 * 60 * 1000 }; // 8hr expiry
    setUser(session);
    localStorage.setItem('pharmacy_user', JSON.stringify(session));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('pharmacy_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
