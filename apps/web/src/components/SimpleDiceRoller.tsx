import { useState } from 'react';
import { createPortal } from 'react-dom';

// A plain dice roller — the player rolls d2…d20 themselves, with an optional
// count and flat modifier. Deliberately separate from the Ego "astrolabe"
// (no Ambient / Fortuity), and docked to the LEFT so the two never overlap.

const DICE = [2, 4, 6, 8, 10, 12, 20] as const;
// A little polygon per die so each face count has its own icon.
const SIDES: Record<number, number> = { 2: 0, 4: 3, 6: 4, 8: 6, 10: 5, 12: 8, 20: 10 };
const rollDie = (faces: number) => 1 + Math.floor(Math.random() * faces);

function DieIcon({ faces, size = 22 }: { faces: number; size?: number }) {
  const n = SIDES[faces] ?? 6;
  const r = size / 2 - 1;
  const cx = size / 2, cy = size / 2;
  if (n < 3) {
    // d2 → a coin
    return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}><circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={1.6} /></svg>;
  }
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
  }).join(' ');
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}><polygon points={pts} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" /></svg>;
}

interface RollResult { id: number; faces: number; count: number; mod: number; values: number[]; total: number }

export function SimpleDiceRoller({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [count, setCount] = useState(1);
  const [mod, setMod] = useState(0);
  const [history, setHistory] = useState<RollResult[]>([]);
  const [flash, setFlash] = useState<number | null>(null);

  if (!open) return null;

  const doRoll = (faces: number) => {
    const n = Math.min(20, Math.max(1, count));
    const values = Array.from({ length: n }, () => rollDie(faces));
    const total = values.reduce((s, v) => s + v, 0) + mod;
    const res: RollResult = { id: Date.now(), faces, count: n, mod, values, total };
    setHistory((h) => [res, ...h].slice(0, 12));
    setFlash(res.id);
    window.setTimeout(() => setFlash((f) => (f === res.id ? null : f)), 450);
  };

  const latest = history[0];
  const modStr = (m: number) => (m > 0 ? ` + ${m}` : m < 0 ? ` − ${Math.abs(m)}` : '');

  return createPortal(
    <div style={{ position: 'fixed', left: 20, bottom: 88, zIndex: 150, width: 296, maxWidth: 'calc(100vw - 40px)', background: '#fff', border: '1px solid #e4e2dc', borderRadius: 16, boxShadow: '0 18px 46px rgba(0,0,0,.20)', overflow: 'hidden' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', background: 'linear-gradient(135deg,#2a2620,#463f34)', color: '#f7dca0' }}>
        <span style={{ fontSize: 16 }}>🎲</span>
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 800 }}>ทอยลูกเต๋า <span style={{ fontSize: 10.5, fontWeight: 500, color: '#d7c9a8' }}>· ทอยเอง (ไม่มี Ambient/Fortuity)</span></span>
        <button onClick={onClose} aria-label="ปิด" style={{ border: 'none', background: 'rgba(255,255,255,.12)', color: '#f7dca0', width: 24, height: 24, borderRadius: 7, cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>×</button>
      </div>

      <div style={{ padding: 14 }}>
        {/* count + modifier */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#8d8a82' }}>จำนวนลูก</span>
            <button onClick={() => setCount((c) => Math.max(1, c - 1))} style={stepBtn}>−</button>
            <input value={count} onChange={(e) => setCount(Math.min(20, Math.max(1, parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 1)))} style={{ width: 34, textAlign: 'center', border: '1px solid #e0ded7', borderRadius: 7, padding: '4px 0', fontSize: 13, fontWeight: 800, color: '#3c3a33', outline: 'none' }} />
            <button onClick={() => setCount((c) => Math.min(20, c + 1))} style={stepBtn}>＋</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#8d8a82' }}>ปรับค่า</span>
            <button onClick={() => setMod((m) => m - 1)} style={stepBtn}>−</button>
            <span style={{ minWidth: 30, textAlign: 'center', fontSize: 13, fontWeight: 800, color: mod === 0 ? '#b0ada4' : '#3c3a33' }}>{mod > 0 ? `+${mod}` : mod}</span>
            <button onClick={() => setMod((m) => m + 1)} style={stepBtn}>＋</button>
          </div>
        </div>

        {/* dice grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, marginBottom: 12 }}>
          {DICE.map((faces) => (
            <button
              key={faces}
              onClick={() => doRoll(faces)}
              title={`ทอย ${count > 1 ? count : ''}d${faces}${modStr(mod)}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '9px 0 7px', border: '1.5px solid #e2ddd2', background: '#faf8f4', color: '#5c4a2e', borderRadius: 11, cursor: 'pointer', fontWeight: 800 }}
            >
              <DieIcon faces={faces} />
              <span style={{ fontSize: 12 }}>d{faces}</span>
            </button>
          ))}
          {/* filler cell keeps the 7 dice tidy in a 4-col grid */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#c9c5bc', border: '1.5px dashed #eae5da', borderRadius: 11 }}>กดเพื่อทอย</div>
        </div>

        {/* latest result */}
        {latest && (
          <div style={{ textAlign: 'center', padding: '12px 10px', borderRadius: 12, background: flash === latest.id ? '#fbf3dd' : '#f6f4ef', border: '1px solid #e8e2d4', transition: 'background .3s' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#a08a5a' }}>{latest.count > 1 ? `${latest.count}d${latest.faces}` : `d${latest.faces}`}{modStr(latest.mod)}</div>
            <div style={{ fontSize: 34, fontWeight: 800, color: '#3c3a33', lineHeight: 1.05 }}>{latest.total}</div>
            {(latest.count > 1 || latest.mod !== 0) && (
              <div style={{ fontSize: 11, color: '#9a978e', marginTop: 2 }}>
                {latest.values.join(' + ')}{modStr(latest.mod)}
              </div>
            )}
          </div>
        )}

        {/* history */}
        {history.length > 1 && (
          <div style={{ marginTop: 10, borderTop: '1px dashed #eae5da', paddingTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', color: '#a8a59d' }}>ประวัติ</span>
              <button onClick={() => setHistory([])} style={{ border: 'none', background: 'none', color: '#b0ada4', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>ล้าง</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 120, overflowY: 'auto' }}>
              {history.slice(1).map((r) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: '#6b6860' }}>
                  <span style={{ flex: 'none', color: '#a08a5a', fontWeight: 700, minWidth: 52 }}>{r.count > 1 ? `${r.count}d${r.faces}` : `d${r.faces}`}{modStr(r.mod)}</span>
                  <span style={{ flex: 1, minWidth: 0, color: '#b0ada4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.values.join(', ')}</span>
                  <span style={{ flex: 'none', fontWeight: 800, color: '#3c3a33' }}>{r.total}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

const stepBtn: React.CSSProperties = { width: 24, height: 24, flex: 'none', border: '1px solid #e0ded7', background: '#fff', color: '#6b6860', borderRadius: 7, fontSize: 13, fontWeight: 800, cursor: 'pointer', lineHeight: 1 };
