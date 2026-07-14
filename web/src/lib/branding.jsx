import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { getSocket } from './socket.js';

const BrandingContext = createContext({});

export const useBranding = () => useContext(BrandingContext);

// Gera variações da cor da marca (hover mais escuro, fundo suave)
function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = ch(((n >> 16) & 255) * factor);
  const g = ch(((n >> 8) & 255) * factor);
  const b = ch((n & 255) * factor);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function applyBrandColor(color) {
  const c = /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#2563eb';
  const root = document.documentElement;
  root.style.setProperty('--brand', c);
  root.style.setProperty('--brand-dark', shade(c, 0.8));
  root.style.setProperty('--brand-soft', `color-mix(in srgb, ${c} 14%, white)`);
}

export function BrandingProvider({ children }) {
  const [settings, setSettings] = useState({
    company_name: 'Clínica',
    brand_color: '#2563eb',
    logo: '',
    totem_theme: 'dark',
    panel_theme: 'dark',
  });

  useEffect(() => {
    api('/settings', { auth: false }).then(setSettings).catch(() => {});
    const s = getSocket();
    const onUpdate = (next) => setSettings(next);
    s.on('settings:update', onUpdate);
    return () => s.off('settings:update', onUpdate);
  }, []);

  useEffect(() => {
    applyBrandColor(settings.brand_color);
  }, [settings.brand_color]);

  return (
    <BrandingContext.Provider value={{ settings, setSettings }}>
      {children}
    </BrandingContext.Provider>
  );
}

// Tema da área interna: preferência pessoal salva no navegador
export function useInternalTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('senha_theme') || 'light');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('senha_theme', theme);
  }, [theme]);

  return [theme, setTheme];
}

// Tema fixo definido nas configurações (totem e painel TV)
export function usePublicTheme(themeValue) {
  useEffect(() => {
    document.documentElement.classList.toggle('dark', themeValue !== 'light');
    return () => {
      const saved = localStorage.getItem('senha_theme') || 'light';
      document.documentElement.classList.toggle('dark', saved === 'dark');
    };
  }, [themeValue]);
  return themeValue !== 'light';
}
