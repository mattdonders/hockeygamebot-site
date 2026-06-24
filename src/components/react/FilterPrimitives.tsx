import React, { useState, useEffect } from 'react';

export const MONO: React.CSSProperties = { fontFamily: 'var(--mono)' };

export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.dataset.theme === 'dark');
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

interface FilterChipProps {
  active: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export function FilterChip({ active, label, onClick, disabled = false }: FilterChipProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        ...MONO,
        fontSize: 10,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        padding: '5px 12px',
        border: '1px solid rgba(13,13,20,0.2)',
        borderRight: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: active ? '#0d0d14' : '#fff',
        color: active ? '#EFEEE8' : disabled ? 'rgba(13,13,20,0.2)' : 'rgba(13,13,20,0.48)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

export function FilterChipGroup({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid rgba(13,13,20,0.2)', borderLeft: 'none' }}>
      {children}
    </div>
  );
}

export function FilterLabel({ text }: { text: string }) {
  return (
    <div style={{ ...MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(13,13,20,0.48)', marginBottom: 5 }}>
      {text}
    </div>
  );
}
