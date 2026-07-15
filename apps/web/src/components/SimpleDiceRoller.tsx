import { useState } from 'react';
import { createPortal } from 'react-dom';

// A plain dice roller — the player builds a pool of dice then rolls them all.
// Deliberately separate from the Ego "astrolabe" (no Ambient / Fortuity), docked
// LEFT. Click a die to add it; right-click to remove one; hold Shift while
// clicking for Advantage (roll 2, keep highest) or Ctrl for Disadvantage (keep
// lowest). Every roll is kept in a local history and — when the page is a
// campaign / Dweller Sheet / Librarian Sheet — broadcast to the campaign Log via
// a window event that those pages listen for.

const DICE = [2, 4, 6, 8, 10, 12, 20] as const;
const SIDES: Record<number, number> = { 2: 0, 4: 3, 6: 4, 8: 6, 10: 5, 12: 8, 20: 10 };
const rollDie = (faces: number) => 1 + Math.floor(Math.random() * faces);

type Mode = 'normal' | 'adv' | 'dis';
const MODE_COLOR: Record<Mode, string> = { normal: '#5c4a2e', adv: '#2f7d4f', dis: '#b4513a' };
const MODE_MARK: Record<Mode, string> = { normal: '', adv: '▲', dis: '▼' };

function DieIcon({ faces, size = 22 }: { faces: number; size?: number }) {
  const n = SIDES[faces] ?? 6;
  const r = size / 2 - 1;
  const cx = size / 2, cy = size / 2;
  if (n < 3) return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}><circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={1.6} /></svg>;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
  }).join(' ');
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}><polygon points={pts} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" /></svg>;
}

interface Die { id: number; faces: number; mode: Mode }
interface RolledDie { faces: number; mode: Mode; rolls: number[]; chosen: number }
interface RollResult { id: number; dice: RolledDie[]; mod: number; total: number; label: string }

// Group a pool into "3d6 · d20▲" for a compact label.
function poolLabel(dice: { faces: number; mode: Mode }[], mod = 0): string {
  const groups = new Map<string, number>();
  for (const d of dice) { const k = `${d.faces}|${d.mode}`; groups.set(k, (groups.get(k) ?? 0) + 1); }
  const parts = [...groups].map(([k, n]) => { const [f, m] = k.split('|'); return `${n > 1 ? n : ''}d${f}${MODE_MARK[m as Mode]}`; });
  if (mod) parts.push(mod > 0 ? `+${mod}` : `${mod}`);
  return parts.join(' · ');
}

export function SimpleDiceRoller({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pool, setPool] = useState<Die[]>([]);
  const [mod, setMod] = useState(0);
  const [history, setHistory] = useState<RollResult[]>([]);
  const [flash, setFlash] = useState(false);

  if (!open) return null;

  const addDie = (faces: number, mode: Mode) => setPool((p) => [...p, { id: Date.now() + Math.random(), faces, mode }]);
  const removeLast = (faces: number) => setPool((p) => { const i = [...p].reverse().findIndex((d) => d.faces === faces); if (i < 0) return p; const idx = p.length - 1 - i; return p.filter((_, j) => j !== idx); });
  const onDieClick = (e: React.MouseEvent, faces: number) => addDie(faces, e.shiftKey ? 'adv' : e.ctrlKey || e.metaKey ? 'dis' : 'normal');

  const doRoll = () => {
    if (pool.length === 0) return;
    const dice: RolledDie[] = pool.map((d) => {
      if (d.mode === 'normal') { const v = rollDie(d.faces); return { faces: d.faces, mode: d.mode, rolls: [v], chosen: v }; }
      const a = rollDie(d.faces), b = rollDie(d.faces);
      return { faces: d.faces, mode: d.mode, rolls: [a, b], chosen: d.mode === 'adv' ? Math.max(a, b) : Math.min(a, b) };
    });
    const total = dice.reduce((s, r) => s + r.chosen, 0) + mod;
    const label = poolLabel(pool, mod);
    const res: RollResult = { id: Date.now(), dice, mod, total, label };
    setHistory((h) => [res, ...h].slice(0, 14));
    setFlash(true);
    window.setTimeout(() => setFlash(false), 450);
    // Broadcast to the campaign Log (a mounted campaign / sheet page listens).
    const parts = dice.map((r) => ({ label: `d${r.faces}${MODE_MARK[r.mode]}`, value: r.chosen, faces: r.faces, mode: r.mode, color: MODE_COLOR[r.mode] }));
    if (mod) parts.push({ label: 'ปรับ', value: mod, faces: 0, mode: 'normal', color: '#8d8a82' });
    window.dispatchEvent(new CustomEvent('wiwon-simple-roll', { detail: { text: `🎲 ${label} = ${total}`, roll: { total, parts } } }));
  };

  const latest = history[0];
  // Group pool for the chip display.
  const groups = (() => { const m = new Map<string, { faces: number; mode: Mode; n: number }>(); for (const d of pool) { const k = `${d.faces}|${d.mode}`; const g = m.get(k); if (g) g.n++; else m.set(k, { faces: d.faces, mode: d.mode, n: 1 }); } return [...m.values()]; })();

  return createPortal(
    <div style={{ position: 'fixed', left: 20, bottom: 88, zIndex: 150, width: 300, maxWidth: 'calc(100vw - 40px)', background: '#fff', border: '1px solid #e4e2dc', borderRadius: 16, boxShadow: '0 18px 46px rgba(0,0,0,.20)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', background: 'linear-gradient(135deg,#2a2620,#463f34)', color: '#f7dca0' }}>
        <span style={{ fontSize: 16 }}>🎲</span>
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 800 }}>ทอยลูกเต๋า</span>
        <button onClick={onClose} aria-label="ปิด" style={{ border: 'none', background: 'rgba(255,255,255,.12)', color: '#f7dca0', width: 24, height: 24, borderRadius: 7, cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>×</button>
      </div>

      <div style={{ padding: 14 }}>
        {/* dice grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, marginBottom: 9 }}>
          {DICE.map((faces) => (
            <button
              key={faces}
              onClick={(e) => onDieClick(e, faces)}
              onContextMenu={(e) => { e.preventDefault(); removeLast(faces); }}
              title={`คลิก = เพิ่ม d${faces} · คลิกขวา = ลบ · Shift = Advantage · Ctrl = Disadvantage`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '9px 0 7px', border: '1.5px solid #e2ddd2', background: '#faf8f4', color: '#5c4a2e', borderRadius: 11, cursor: 'pointer', fontWeight: 800 }}
            >
              <DieIcon faces={faces} />
              <span style={{ fontSize: 12 }}>d{faces}</span>
            </button>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
            <button onClick={() => setMod((m) => m - 1)} style={stepBtn}>−</button>
            <span title="ปรับค่า (modifier)" style={{ minWidth: 22, textAlign: 'center', fontSize: 12.5, fontWeight: 800, color: mod === 0 ? '#c4c0b7' : '#5c4a2e' }}>{mod > 0 ? `+${mod}` : mod}</span>
            <button onClick={() => setMod((m) => m + 1)} style={stepBtn}>＋</button>
          </div>
        </div>
        <div style={{ fontSize: 10, color: '#a8a59d', lineHeight: 1.5, marginBottom: 10 }}>
          คลิก = เพิ่ม · คลิกขวา = เอาออก · <b style={{ color: '#2f7d4f' }}>Shift</b> = Advantage (เลือกสูง) · <b style={{ color: '#b4513a' }}>Ctrl</b> = Disadvantage (เลือกต่ำ)
        </div>

        {/* current pool */}
        <div style={{ minHeight: 34, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', padding: '7px 9px', borderRadius: 10, background: '#faf9f7', border: '1px dashed #e4e1d9', marginBottom: 10 }}>
          {groups.length === 0
            ? <span style={{ fontSize: 11, color: '#bdbab2' }}>กดลูกเต๋าด้านบนเพื่อเพิ่มลงกอง…</span>
            : groups.map((g) => (
                <button key={`${g.faces}|${g.mode}`} onClick={() => removeLast(g.faces)} title="กดเพื่อเอาออกหนึ่งลูก" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: `1px solid ${g.mode === 'normal' ? '#e2ddd2' : g.mode === 'adv' ? '#bfe0c9' : '#f0d3cb'}`, background: g.mode === 'normal' ? '#fff' : g.mode === 'adv' ? '#eef7f0' : '#fbeae6', color: MODE_COLOR[g.mode], borderRadius: 20, padding: '3px 10px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
                  {g.n > 1 ? `${g.n}×` : ''}d{g.faces}{MODE_MARK[g.mode]}
                </button>
              ))}
        </div>

        {/* roll + clear */}
        <div style={{ display: 'flex', gap: 8, marginBottom: history.length ? 12 : 0 }}>
          <button onClick={doRoll} disabled={pool.length === 0} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 10, fontSize: 13.5, fontWeight: 800, cursor: pool.length ? 'pointer' : 'not-allowed', background: pool.length ? '#463f34' : '#e6e3dc', color: pool.length ? '#f7dca0' : '#b0ada4' }}>🎲 ทอย</button>
          {pool.length > 0 && <button onClick={() => setPool([])} title="ล้างกอง" style={{ flex: 'none', border: '1px solid #e0ded7', background: '#fff', color: '#8d8a82', borderRadius: 10, padding: '0 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>ล้าง</button>}
        </div>

        {/* latest result */}
        {latest && (
          <div style={{ textAlign: 'center', padding: '12px 10px', borderRadius: 12, background: flash ? '#fbf3dd' : '#f6f4ef', border: '1px solid #e8e2d4', transition: 'background .3s' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#a08a5a' }}>{latest.label} <span style={{ fontWeight: 500, color: '#c4c0b7' }}>· {new Date(latest.id).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span></div>
            <div style={{ fontSize: 34, fontWeight: 800, color: '#3c3a33', lineHeight: 1.05 }}>{latest.total}</div>
            <div style={{ fontSize: 11, color: '#9a978e', marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
              {latest.dice.map((r, i) => (
                <span key={i} style={{ color: MODE_COLOR[r.mode], fontWeight: 700 }}>
                  d{r.faces}{MODE_MARK[r.mode]} {r.mode === 'normal' ? r.chosen : <>[{r.rolls.join('/')}]→<b>{r.chosen}</b></>}
                </span>
              ))}
              {latest.mod !== 0 && <span style={{ color: '#8d8a82' }}>ปรับ {latest.mod > 0 ? `+${latest.mod}` : latest.mod}</span>}
            </div>
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
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                  <span style={{ flex: 'none', color: '#bdbab2', fontVariantNumeric: 'tabular-nums' }}>{new Date(r.id).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ flex: 1, minWidth: 0, color: '#a08a5a', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
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

const stepBtn: React.CSSProperties = { width: 22, height: 22, flex: 'none', border: '1px solid #e0ded7', background: '#fff', color: '#6b6860', borderRadius: 6, fontSize: 12, fontWeight: 800, cursor: 'pointer', lineHeight: 1 };
