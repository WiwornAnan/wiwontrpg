import { useState } from 'react';

// Bank transfer donation (Kasikornbank / กสิกรไทย).
const BANK_LABEL = 'ธ.กสิกรไทย (KBank)';
const ACCOUNT_NO = '173-8-15647-8';

// A quiet site footer — it sits at the very bottom of every page so it never
// competes with the content — but the little "support" card is given a soft
// coral warmth and a one-tap copy button so it still feels inviting to give.
export function SiteFooter() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ACCOUNT_NO.replace(/-/g, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 1900);
    } catch {
      /* clipboard blocked — the number is on screen anyway */
    }
  };

  return (
    <footer style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-alt)', marginTop: 56 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '26px 24px', display: 'flex', flexWrap: 'wrap', gap: 22, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.75 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>WiwonAnant</div>
          สารานุกรมและชุมชน TRPG ภาษาไทย · © {new Date().getFullYear()}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 14px', border: '1px solid #efd7cc', background: '#fdf5f1', borderRadius: 13 }}>
          <div style={{ fontSize: 22, lineHeight: 1 }}>☕</div>
          <div style={{ lineHeight: 1.5 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#b4513a' }}>ร่วมสนับสนุนการพัฒนา</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>เลี้ยงกาแฟผู้พัฒนาสักแก้ว เพื่อให้ WiwonAnant เดินหน้าต่อ 💛</div>
          </div>
          <button
            onClick={copy}
            title={`คัดลอกเลขบัญชี ${BANK_LABEL}`}
            style={{
              border: 'none',
              cursor: 'pointer',
              borderRadius: 9,
              padding: '9px 14px',
              fontSize: 12.5,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              color: '#fff',
              background: copied ? '#3f7a52' : 'linear-gradient(135deg,#e07a5f,#c85f43)',
              boxShadow: '0 3px 10px rgba(200,95,67,.28)',
              transition: 'background .2s',
            }}
          >
            {copied ? '✓ คัดลอกเลขบัญชีแล้ว' : `${BANK_LABEL} · ${ACCOUNT_NO}`}
          </button>
        </div>
      </div>
    </footer>
  );
}
