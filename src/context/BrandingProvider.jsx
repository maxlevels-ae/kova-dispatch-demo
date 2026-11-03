'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_BRANDING } from '@/lib/branding';
const Context = createContext({ branding: DEFAULT_BRANDING, setBranding: () => {} });
export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  useEffect(() => {
    let active = true;
    const refresh = () => fetch('/api/branding', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(data => { if (active && data) setBranding(data); }).catch(() => {});
    refresh();
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, []);
  return <Context.Provider value={{ branding, setBranding }}>{children}</Context.Provider>;
}
export function useBranding() { return useContext(Context); }
