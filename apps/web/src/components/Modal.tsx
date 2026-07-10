import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
  dark?: boolean;
}

export function Modal({ open, onClose, title, children, width = 520, footer, dark = false }: Props) {
  if (!open) return null;
  const panelBg = dark ? '#1b1813' : '#fff';
  const titleColor = dark ? '#f3ede1' : undefined;
  const borderCol = dark ? '#332f28' : 'var(--border-faint)';
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(21,20,15,.42)',
        backdropFilter: 'blur(2px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '60px 20px',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: panelBg,
          borderRadius: 16,
          width: '100%',
          maxWidth: width,
          boxShadow: '0 24px 60px rgba(0,0,0,.28)',
          animation: 'fadeUp .2s ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 22px',
            borderBottom: `1px solid ${borderCol}`,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: titleColor }}>{title}</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 22, color: dark ? '#9a978e' : 'var(--text-ghost)', cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: '20px 22px' }}>{children}</div>
        {footer && (
          <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border-faint)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
