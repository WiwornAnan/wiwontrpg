import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, width = 520, footer }: Props) {
  if (!open) return null;
  return (
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
          background: '#fff',
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
            borderBottom: '1px solid var(--border-faint)',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text-ghost)', cursor: 'pointer', lineHeight: 1 }}
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
    </div>
  );
}
