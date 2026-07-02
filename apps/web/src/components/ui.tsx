import type { ButtonHTMLAttributes, CSSProperties } from 'react';

type Variant = 'primary' | 'ghost' | 'danger' | 'coral';

const base: CSSProperties = {
  padding: '9px 16px',
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  border: '1px solid transparent',
};

const variants: Record<Variant, CSSProperties> = {
  primary: { background: 'var(--ink)', color: '#fff' },
  ghost: { background: '#fff', color: 'var(--text-muted)', borderColor: 'var(--border-soft)' },
  danger: { background: '#fbeae6', color: 'var(--danger)', borderColor: '#f0cfc6' },
  coral: { background: 'var(--coral)', color: '#fff' },
};

export function Button({
  variant = 'primary',
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...rest} style={{ ...base, ...variants[variant], ...style }} />;
}

export const inputStyle: CSSProperties = {
  border: '1px solid var(--border-soft)',
  borderRadius: 9,
  padding: '10px 12px',
  fontSize: 13.5,
  outline: 'none',
  width: '100%',
  fontFamily: 'var(--font-body)',
};

export const labelStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: 5,
  display: 'block',
};
