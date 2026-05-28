/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export const THEMES = {
  white: {
    id: 'white',
    name: 'White (Default)',
    base: 'light',
    colorPreview: '#ffffff',
    vars: {
      '--bg-main': '#F0F4FF',
      '--bg-topbar': '#FFFFFF',
      '--bg-card': '#FFFFFF',
      '--bg-table-header': '#F4F7FF',
      '--bg-sidebar': '#FFFFFF',
    }
  },
  softBlue: {
    id: 'softBlue',
    name: 'Soft Blue',
    base: 'light',
    colorPreview: '#E0F2FE',
    vars: {
      '--bg-main': '#E0F2FE',
      '--bg-topbar': '#F0F9FF',
      '--bg-card': '#FFFFFF',
      '--bg-table-header': '#F0F9FF',
      '--bg-sidebar': '#F0F9FF',
    }
  },
  mintGreen: {
    id: 'mintGreen',
    name: 'Mint Green',
    base: 'light',
    colorPreview: '#D1FAE5',
    vars: {
      '--bg-main': '#D1FAE5',
      '--bg-topbar': '#ECFDF5',
      '--bg-card': '#FFFFFF',
      '--bg-table-header': '#ECFDF5',
      '--bg-sidebar': '#ECFDF5',
    }
  },
  warmCream: {
    id: 'warmCream',
    name: 'Warm Cream',
    base: 'light',
    colorPreview: '#FEF3C7',
    vars: {
      '--bg-main': '#FFFBEB',
      '--bg-topbar': '#FEF3C7',
      '--bg-card': '#FFFFFF',
      '--bg-table-header': '#FFFBEB',
      '--bg-sidebar': '#FEF3C7',
    }
  },
  dark: {
    id: 'dark',
    name: 'Dark Mode',
    base: 'dark',
    colorPreview: '#1E293B',
    vars: {
      '--bg-main': '#0A0E1A',
      '--bg-topbar': '#131825',
      '--bg-card': '#131825',
      '--bg-table-header': '#1A1F30',
      '--bg-sidebar': '#131825',
    }
  }
};

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(() => localStorage.getItem('app-theme') || 'white');

  useEffect(() => {
    const activeTheme = THEMES[themeId] || THEMES.white;
    
    // Set base theme (light/dark) for global text/border overrides in index.css
    document.documentElement.setAttribute('data-theme', activeTheme.base);
    
    // Inject dynamic CSS variables
    Object.entries(activeTheme.vars).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });

    localStorage.setItem('app-theme', themeId);
  }, [themeId]);

  return (
    <ThemeContext.Provider value={{ themeId, setThemeId, activeTheme: THEMES[themeId] || THEMES.white, themes: Object.values(THEMES) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
