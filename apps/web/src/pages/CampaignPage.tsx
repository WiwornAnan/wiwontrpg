import { useState, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Modal } from '../components/Modal';
import { Button } from '../components/ui';
import layout from '../components/layout.module.css';
import { BUFF_EFFECTS, STATUS_EFFECTS } from '../data/statusEffects';
import type { CampaignDTO } from '../data/statusEffects';
import type { CatalogItem } from '@wiwonanant/shared';

const STEP10: Record<string, number> = { A: 10, B: 8, C: 6, D: 4, X: 2 };
async function fetchMonsters(): Promise<CatalogItem[]> {
  const out: CatalogItem[] = [];
  for (let page = 1; page < 50; page++) {
    const d = await api.get<{ items: CatalogItem[]; total: number }>(`/catalog/monster?scope=all&page=${page}`);
    out.push(...d.items);
    if (d.items.length === 0 || out.length >= d.total) break;
  }
  return out;
}

const DAYS = 30, MONTHS = 12;
const MONTH_NAMES = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
interface Clock { year: number; month: number; day: number; hour: number; minute: number }
const DEFAULT_CLOCK: Clock = { year: 1, month: 1, day: 1, hour: 8, minute: 0 };
const num = (v: unknown, def = 0) => (typeof v === 'number' && isFinite(v) ? v : def);
const navBtn: React.CSSProperties = { width: 26, height: 26, borderRadius: 7, border: '1px solid #e0ded7', background: '#faf9f7', color: '#5f5c54', fontSize: 12, cursor: 'pointer' };
const initStep: React.CSSProperties = { width: 22, height: 22, borderRadius: 6, border: '1px solid #e0ded7', background: '#fff', color: '#6b6860', fontSize: 13, fontWeight: 800, cursor: 'pointer', flex: 'none' };
const buffLabel = (k: string) => BUFF_EFFECTS.find((e) => e[0] === k)?.[1] ?? k;
const statusLabel = (k: string) => STATUS_EFFECTS.find((e) => e[0] === k)?.[1] ?? k;
const WOUND_NAMES = ['ปกติ', 'First Blood', 'Impaired', 'Suppressed', 'Desperate Edge', "Death's Door"];

interface Note { id: string; title: string; text: string }
interface RollData { ego: number; ambient: number; fortuity: number; total: number; egoFaces: number; egoMode?: string; ambientMode?: string; fortuityMode?: string; special?: string }
interface LogEntry { id: string; at: string; characterName: string; kind: string; text: string; roll?: RollData }
interface InitEntry { id: string; name: string; value: number; kind: string }
const rollD = (f: number) => (f > 0 ? 1 + Math.floor(Math.random() * f) : 0);
const rollSym = (m?: string) => (m === 'adv' ? ' ▲' : m === 'dis' ? ' ▼' : '');
const rollTotalColor = (r: { ego: number; ambient: number; fortuity: number }) => {
  const triple = r.ego === r.ambient && r.ambient === r.fortuity;
  if ((triple && r.ego === 1) || r.fortuity === 1) return '#c0432a';
  if ((triple && r.ego >= 2 && r.ego <= 8) || r.fortuity === 10) return '#b4842a';
  return '#3c3a33';
};

export function CampaignPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [delOpen, setDelOpen] = useState(false);
  const [pickBuffs, setPickBuffs] = useState<Record<string, boolean>>({});
  const [pickStatus, setPickStatus] = useState<Record<string, boolean>>({});
  const [targets, setTargets] = useState<string[] | null>(null); // null = all

  const { data } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api.get<{ campaign: CampaignDTO }>(`/campaigns/${id}`),
    enabled: !!id && !!user,
    refetchInterval: 4000, // near real-time member updates
  });
  const c = data?.campaign;

  const patchCamp = useMutation({
    mutationFn: (body: { name?: string; data?: Record<string, unknown> }) => api.patch<{ campaign: CampaignDTO }>(`/campaigns/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', id] }),
  });
  const applyStatus = useMutation({
    mutationFn: (body: { buffsOn?: Record<string, boolean>; statusOn?: Record<string, boolean>; targetCharacterIds?: string[] }) => api.post(`/campaigns/${id}/apply-status`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaign', id] }); setPickBuffs({}); setPickStatus({}); },
  });
  const removeMember = useMutation({
    mutationFn: (characterId: string) => api.delete(`/campaigns/${id}/members/${characterId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', id] }),
  });
  const delCamp = useMutation({
    mutationFn: () => api.delete(`/campaigns/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); navigate('/dweller'); },
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['campaign', id] });
  const addMonster = useMutation({ mutationFn: (b: { name: string; value: number }) => api.post(`/campaigns/${id}/initiative/monster`, b), onSuccess: invalidate });
  const setInitValue = useMutation({ mutationFn: (b: { entryId: string; value: number }) => api.post(`/campaigns/${id}/initiative/set-value`, b), onSuccess: invalidate });
  const delInit = useMutation({ mutationFn: (entryId: string) => api.delete(`/campaigns/${id}/initiative/${entryId}`), onSuccess: invalidate });
  const clearInit = useMutation({ mutationFn: () => api.post(`/campaigns/${id}/initiative/clear`, {}), onSuccess: invalidate });
  const clearLog = useMutation({ mutationFn: () => api.post(`/campaigns/${id}/log/clear`, {}), onSuccess: invalidate });
  const [monName, setMonName] = useState('');
  const [monPicker, setMonPicker] = useState(false);
  const [monQuery, setMonQuery] = useState('');
  const { data: monsters } = useQuery({ queryKey: ['campaign-monsters'], queryFn: fetchMonsters, enabled: !!user });

  if (!user) return <div className={layout.page} style={{ paddingTop: 40 }}><Link to="/login">เข้าสู่ระบบ</Link></div>;
  if (!c) return <div className={layout.page} style={{ paddingTop: 40, color: '#a8a59d' }}>กำลังโหลด…</div>;

  const cdata = c.data as { clock?: Clock; clockPrev?: Clock; notes?: Note[]; log?: LogEntry[]; initiative?: InitEntry[] };
  const log: LogEntry[] = Array.isArray(cdata.log) ? cdata.log : [];
  const initiative: InitEntry[] = (Array.isArray(cdata.initiative) ? cdata.initiative : []).slice().sort((a, b) => b.value - a.value);
  const clock = { ...DEFAULT_CLOCK, ...(cdata.clock ?? {}) };
  const notes: Note[] = Array.isArray(cdata.notes) ? cdata.notes : [];
  const setData = (partial: Record<string, unknown>) => patchCamp.mutate({ data: { ...c.data, ...partial } });
  const commitClock = (next: Clock) => setData({ clock: next, clockPrev: clock });
  const prevClock = (cdata.clockPrev && typeof cdata.clockPrev === 'object' ? cdata.clockPrev : undefined) as Clock | undefined;
  const saveNotes = (n: Note[]) => setData({ notes: n });

  const applyTargets = targets ?? c.members.map((m) => m.character.id);
  const anyPicked = Object.values(pickBuffs).some(Boolean) || Object.values(pickStatus).some(Boolean);
  const doApply = (on: boolean) => {
    const buffsOn: Record<string, boolean> = {}; Object.keys(pickBuffs).forEach((k) => { if (pickBuffs[k]) buffsOn[k] = on; });
    const statusOn: Record<string, boolean> = {}; Object.keys(pickStatus).forEach((k) => { if (pickStatus[k]) statusOn[k] = on; });
    applyStatus.mutate({ buffsOn, statusOn, targetCharacterIds: applyTargets });
  };

  const box: React.CSSProperties = { background: '#fff', border: '1px solid #e4e2dc', borderRadius: 14, padding: 16 };
  const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: '#a8a59d', marginBottom: 10 };

  return (
    <div className={layout.page} style={{ paddingTop: 28, maxWidth: 1200 }}>
      <Link to="/dweller" style={{ fontSize: 12.5, color: '#8d8a82', textDecoration: 'none' }}>← กลับ</Link>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', margin: '10px 0 20px' }}>
        <div style={{ width: 52, height: 52, borderRadius: 12, background: 'linear-gradient(160deg,#2a2620,#4a463d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>📖</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          {c.isLibrarian ? (
            <input defaultValue={c.name} key={c.name} onBlur={(e) => { if (e.target.value !== c.name) patchCamp.mutate({ name: e.target.value }); }} style={{ fontSize: 26, fontFamily: 'var(--font-serif)', fontWeight: 500, border: 'none', borderBottom: '1px dashed #d8d5ce', outline: 'none', background: 'transparent', width: '100%' }} />
          ) : <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 26 }}>{c.name}</h1>}
          <div style={{ fontSize: 12.5, color: '#9a978e', marginTop: 4 }}>{c.isLibrarian ? 'บรรณารักษ์ (Librarian)' : 'ผู้เล่น'} · {c.members.length} ตัวละคร · รหัสเข้าร่วม <b style={{ color: '#5c4a2e', letterSpacing: 1 }}>{c.joinCode}</b></div>
        </div>
        {c.isLibrarian && <button onClick={() => setDelOpen(true)} style={{ border: '1px solid #f0d3cb', background: '#fff', color: '#b4513a', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>ลบแคมเปญ</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(260px,1fr)', gap: 16, alignItems: 'start' }}>
        {/* LEFT: members + broadcast */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={box}>
            <div style={secLabel}>ตัวละครในแคมเปญ <span style={{ color: '#cbc8c0', fontWeight: 400 }}>· อัปเดตเรียลไทม์</span></div>
            {c.members.length === 0 ? <div style={{ fontSize: 13, color: '#bdbab2', padding: '8px 0' }}>ยังไม่มีผู้เล่นเข้าร่วม — แชร์รหัส {c.joinCode}</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {c.members.map(({ character: ch }) => {
                  const sheet = ((ch.data as Record<string, unknown>).sheet ?? {}) as Record<string, unknown>;
                  const buffs = Object.keys((sheet.buffsOn ?? {}) as Record<string, boolean>);
                  const status = Object.keys((sheet.statusOn ?? {}) as Record<string, boolean>);
                  const wl = num(sheet.woundLevel);
                  return (
                    <div key={ch.id} style={{ border: '1px solid #ece9e3', borderRadius: 11, padding: '11px 13px', background: '#faf9f7' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: '#2f2c25' }}>{ch.name || 'ตัวละคร'}</span>
                        {c.isLibrarian && <Link to={`/dweller/sheet/${ch.id}`} style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', background: '#5b3fa0', borderRadius: 7, padding: '5px 11px', textDecoration: 'none' }}>เปิด Dweller Sheet</Link>}
                        {c.isLibrarian && <button onClick={() => removeMember.mutate(ch.id)} title="เอาออกจากแคมเปญ" style={{ border: 'none', background: 'none', color: '#cb5a44', cursor: 'pointer', fontSize: 15 }}>×</button>}
                      </div>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#5f5c54' }}>
                        <span>SAN <b>{sheet.sanCur !== undefined ? String(sheet.sanCur) : '—'}</b></span>
                        <span>Scratch <b>{sheet.scratchCur !== undefined ? String(sheet.scratchCur) : '—'}</b></span>
                        <span>WP <b>{sheet.wpCur !== undefined ? String(sheet.wpCur) : '—'}</b></span>
                        <span>Wounds <b style={{ color: wl >= 4 ? '#b4513a' : '#5f5c54' }}>{WOUND_NAMES[wl] ?? wl}</b></span>
                      </div>
                      {(buffs.length > 0 || status.length > 0) && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                          {buffs.map((k) => <span key={k} style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 7, background: '#eef6f0', color: '#2f6b4f', border: '1px solid #cfe6d6' }}>{buffLabel(k)}</span>)}
                          {status.map((k) => <span key={k} style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 7, background: '#fbeae6', color: '#b4513a', border: '1px solid #f0d3cb' }}>{statusLabel(k)}</span>)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* initiative tracker — shared across the campaign */}
          <div style={box}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={secLabel}>⚔️ INITIATIVE <span style={{ color: '#cbc8c0', fontWeight: 400 }}>· ลำดับการเล่น</span></span>
              {c.isLibrarian && initiative.length > 0 && <button onClick={() => clearInit.mutate()} style={{ border: '1px solid #e0ded7', background: '#fff', color: '#8d8a82', borderRadius: 7, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>ล้าง</button>}
            </div>
            {initiative.length === 0 ? <div style={{ fontSize: 12.5, color: '#bdbab2', marginBottom: c.isLibrarian ? 10 : 0 }}>ยังไม่มีใครทอย Initiative</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: c.isLibrarian ? 12 : 0 }}>
                {initiative.map((e, i) => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 9, background: '#faf9f7', border: `1px solid ${e.kind === 'monster' ? '#f0d3cb' : '#ece9e3'}` }}>
                    <span style={{ flex: 'none', width: 22, height: 22, borderRadius: '50%', background: i === 0 ? '#f7dca0' : '#ece9e3', color: '#5c4a2e', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: e.kind === 'monster' ? '#b4513a' : '#2f2c25' }}>{e.name}{e.kind === 'monster' && ' 👹'}</span>
                    {c.isLibrarian ? (
                      <>
                        <button onClick={() => setInitValue.mutate({ entryId: e.id, value: e.value - 1 })} style={initStep}>−</button>
                        <span style={{ minWidth: 26, textAlign: 'center', fontSize: 15, fontWeight: 800, color: '#5c4a2e' }}>{e.value}</span>
                        <button onClick={() => setInitValue.mutate({ entryId: e.id, value: e.value + 1 })} style={initStep}>+</button>
                        <button onClick={() => delInit.mutate(e.id)} title="ลบ" style={{ border: 'none', background: 'none', color: '#cb5a44', cursor: 'pointer', fontSize: 14 }}>×</button>
                      </>
                    ) : <span style={{ fontSize: 15, fontWeight: 800, color: '#5c4a2e' }}>{e.value}</span>}
                  </div>
                ))}
              </div>
            )}
            {c.isLibrarian && (
              <>
                <button onClick={() => { setMonQuery(''); setMonPicker(true); }} style={{ width: '100%', border: '1px solid #f0d3cb', background: '#fbeae6', color: '#b4513a', borderRadius: 8, padding: '8px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', marginBottom: 6 }}>👹 เพิ่มจากคลัง Monster (ทอย 10 + DEX + PER)</button>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <input value={monName} onChange={(ev) => setMonName(ev.target.value)} placeholder="ชื่อ NPC เอง" style={{ flex: 1, minWidth: 120, border: '1px solid #e0ded7', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }} />
                  <button onClick={() => { if (monName.trim()) { addMonster.mutate({ name: monName.trim(), value: 10 + rollD(6) + rollD(6) }); setMonName(''); } }} disabled={!monName.trim()} title="เพิ่ม NPC + ทอย (10 + d6 + d6)" style={{ border: 'none', background: monName.trim() ? '#59544c' : '#cfccc4', color: '#fff', borderRadius: 8, padding: '7px 13px', fontSize: 12, fontWeight: 700, cursor: monName.trim() ? 'pointer' : 'not-allowed' }}>+ NPC</button>
                </div>
              </>
            )}
          </div>

          {/* broadcast buff/debuff — librarian only */}
          {c.isLibrarian && c.members.length > 0 && (
            <div style={box}>
              <div style={secLabel}>มอบสถานะให้ผู้เล่น (Buff / Debuff)</div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#a8a59d', marginBottom: 6 }}>เป้าหมาย</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                <button onClick={() => setTargets(null)} style={chip(targets === null, '#5b3fa0')}>ทุกคน</button>
                {c.members.map(({ character: ch }) => { const on = targets?.includes(ch.id) ?? false; return <button key={ch.id} onClick={() => setTargets((t) => { const base = t ?? []; return base.includes(ch.id) ? base.filter((x) => x !== ch.id) : [...base, ch.id]; })} style={chip(on, '#5b3fa0')}>{ch.name || 'ตัวละคร'}</button>; })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#2f6b4f', marginBottom: 6 }}>Buff</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                    {BUFF_EFFECTS.map((b) => <button key={b[0]} onClick={() => setPickBuffs((p) => ({ ...p, [b[0]]: !p[b[0]] }))} style={pickRow(!!pickBuffs[b[0]], '#2f6b4f')}>{pickBuffs[b[0]] ? '✓ ' : ''}{b[1]}</button>)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#b4513a', marginBottom: 6 }}>Debuff</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                    {STATUS_EFFECTS.map((s) => <button key={s[0]} onClick={() => setPickStatus((p) => ({ ...p, [s[0]]: !p[s[0]] }))} style={pickRow(!!pickStatus[s[0]], '#b4513a')}>{pickStatus[s[0]] ? '✓ ' : ''}{s[1]}</button>)}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => doApply(true)} disabled={!anyPicked || applyStatus.isPending} style={{ flex: 1, padding: 10, background: anyPicked ? '#15140f' : '#cfccc4', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 800, cursor: anyPicked ? 'pointer' : 'not-allowed' }}>มอบให้ {targets === null ? 'ทุกคน' : `${applyTargets.length} คน`}</button>
                <button onClick={() => doApply(false)} disabled={!anyPicked || applyStatus.isPending} style={{ flex: 'none', padding: '10px 16px', background: '#fff', border: '1px solid #e0ded7', color: '#8d8a82', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: anyPicked ? 'pointer' : 'not-allowed' }}>ปลดออก</button>
              </div>
            </div>
          )}

          {/* shared roll/action log */}
          <div style={box}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={secLabel}>📜 LOG แคมเปญ <span style={{ color: '#cbc8c0', fontWeight: 400 }}>· เรียลไทม์</span></div>
              {log.length > 0 && <button onClick={() => { if (window.confirm('ล้างประวัติ Log ของทั้งแคมเปญ?')) clearLog.mutate(); }} style={{ flex: 'none', border: '1px solid #e0ded7', background: '#fff', color: '#8d8a82', borderRadius: 7, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>ล้าง LOG</button>}
            </div>
            {log.length === 0 ? <div style={{ fontSize: 12.5, color: '#bdbab2' }}>ยังไม่มีบันทึก — เมื่อผู้เล่นทอยเต๋าหรือใช้ Magic/Feature จะปรากฏที่นี่</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                {log.slice().reverse().map((l) => {
                  const r = l.roll;
                  return (
                    <div key={l.id} style={{ fontSize: 12.5, color: '#3c3a33', lineHeight: 1.5, borderBottom: '1px solid #f4f1ec', paddingBottom: 6 }}>
                      <span style={{ fontWeight: 800, color: '#5c4a2e' }}>{l.characterName}</span> <span style={{ color: '#a8a59d', fontSize: 11 }}>· {new Date(l.at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span><br />{l.text}
                      {r && (
                        <div style={{ marginTop: 5, display: 'flex', gap: 12, alignItems: 'center' }}>
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, alignItems: 'center' }}>
                            <span style={{ color: '#c0432a', fontWeight: 700 }}>Ego {r.ego}<span style={{ color: '#a8a59d', fontWeight: 400 }}> d{r.egoFaces}{rollSym(r.egoMode)}</span></span>
                            <span style={{ color: '#2f7d6a', fontWeight: 700 }}>Amb {r.ambient}<span style={{ color: '#a8a59d', fontWeight: 400 }}>{rollSym(r.ambientMode)}</span></span>
                            <span style={{ color: '#b4842a', fontWeight: 700 }}>For {r.fortuity}<span style={{ color: '#a8a59d', fontWeight: 400 }}>{rollSym(r.fortuityMode)}</span></span>
                          </div>
                          <div style={{ flex: 'none', textAlign: 'center', background: '#faf8f2', border: `1px solid ${rollTotalColor(r)}55`, borderRadius: 12, padding: '5px 13px', minWidth: 60 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#a8a59d', letterSpacing: '.08em' }}>รวม</div>
                            <div style={{ fontSize: 27, fontWeight: 800, color: rollTotalColor(r), lineHeight: 1 }}>{r.total}</div>
                          </div>
                        </div>
                      )}
                      {r?.special && <div style={{ marginTop: 3, fontSize: 11.5, color: '#b4842a' }}>✦ {r.special}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: clock/calendar + notes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={box}>
            <div style={secLabel}>นาฬิกา</div>
            <AnalogClock hour={clock.hour} minute={clock.minute} editable={c.isLibrarian} onCommit={(hh, mm) => commitClock({ ...clock, hour: hh, minute: mm })} />
            <div style={{ textAlign: 'center', fontSize: 12.5, color: '#9a978e', marginTop: 6 }}>
              {c.isLibrarian ? 'ลากเข็มเพื่อตั้งเวลา · ' : ''}เวลา <b style={{ color: '#5c4a2e' }}>{pad(clock.hour)}:{pad(clock.minute)}</b>
              {c.isLibrarian && <button onClick={() => commitClock({ ...clock, hour: (clock.hour + 12) % 24 })} title="สลับกลางวัน/กลางคืน" style={{ marginLeft: 8, border: '1px solid #e0ded7', background: '#faf9f7', borderRadius: 7, padding: '2px 9px', fontSize: 11, cursor: 'pointer' }}>{clock.hour < 12 ? '☀ กลางวัน' : '☾ กลางคืน'}</button>}
            </div>
          </div>

          <div style={box}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={secLabel}>ปฏิทิน</span>
              {c.isLibrarian && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button onClick={() => commitClock({ ...clock, month: ((clock.month - 2 + MONTHS) % MONTHS) + 1 })} style={navBtn}>◀</button>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#46443c', minWidth: 78, textAlign: 'center' }}>{MONTH_NAMES[clock.month - 1]}</span>
                  <button onClick={() => commitClock({ ...clock, month: (clock.month % MONTHS) + 1 })} style={navBtn}>▶</button>
                  <span style={{ fontSize: 11, color: '#a8a59d', marginLeft: 6 }}>ปีที่</span>
                  <input type="number" defaultValue={clock.year} key={clock.year} onBlur={(e) => { const y = Math.max(1, Math.round(Number(e.target.value) || 1)); if (y !== clock.year) commitClock({ ...clock, year: y }); }} style={{ width: 54, border: '1px solid #e0ded7', borderRadius: 7, padding: '4px 6px', fontSize: 12.5, textAlign: 'center' }} />
                </span>
              )}
            </div>
            {!c.isLibrarian && <div style={{ fontSize: 13, fontWeight: 700, color: '#46443c', marginBottom: 8 }}>{MONTH_NAMES[clock.month - 1]} · ปีที่ {clock.year}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5 }}>
              {Array.from({ length: DAYS }).map((_, i) => {
                const day = i + 1;
                const on = clock.day === day;
                return (
                  <button key={day} disabled={!c.isLibrarian} onClick={() => c.isLibrarian && commitClock({ ...clock, day })}
                    style={{ aspectRatio: '1', border: `1px solid ${on ? '#e07a5f' : '#eee'}`, background: on ? '#e07a5f' : '#fff', color: on ? '#fff' : '#5f5c54', borderRadius: 8, fontSize: 13, fontWeight: on ? 800 : 600, cursor: c.isLibrarian ? 'pointer' : 'default' }}>{day}</button>
                );
              })}
            </div>
            <div style={{ fontSize: 12, color: '#5f5c54', marginTop: 10, fontWeight: 700, textAlign: 'center' }}>ปัจจุบัน: วันที่ {clock.day} {MONTH_NAMES[clock.month - 1]} ปีที่ {clock.year}</div>
            {prevClock && <div style={{ fontSize: 11, color: '#a8a59d', marginTop: 4, textAlign: 'center' }}>ก่อนหน้า: {fmtClock(prevClock)}</div>}
          </div>

          {c.isLibrarian && (
            <div style={box}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={secLabel}>บันทึกของบรรณารักษ์</span>
                <button onClick={() => saveNotes([...notes, { id: `n${Date.now()}`, title: 'หัวข้อใหม่', text: '' }])} style={{ border: 'none', background: '#e07a5f', color: '#fff', borderRadius: 7, padding: '4px 11px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>＋ เพิ่ม</button>
              </div>
              {notes.length === 0 ? <div style={{ fontSize: 12, color: '#bdbab2' }}>ยังไม่มีบันทึก</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {notes.map((nt) => (
                    <div key={nt.id} style={{ border: '1px solid #ece9e3', borderRadius: 10, padding: '9px 11px', background: '#faf9f7' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <input key={nt.title} defaultValue={nt.title} onBlur={(e) => { if (e.target.value !== nt.title) saveNotes(notes.map((x) => (x.id === nt.id ? { ...x, title: e.target.value } : x))); }} style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontWeight: 800, color: '#46443c', borderBottom: '1px dashed #d8d5ce' }} />
                        <button onClick={() => saveNotes(notes.filter((x) => x.id !== nt.id))} style={{ border: 'none', background: 'none', color: '#cb5a44', cursor: 'pointer', fontSize: 14 }}>×</button>
                      </div>
                      <textarea key={nt.text + nt.id} defaultValue={nt.text} onBlur={(e) => { if (e.target.value !== nt.text) saveNotes(notes.map((x) => (x.id === nt.id ? { ...x, text: e.target.value } : x))); }} placeholder="รายละเอียด…" rows={3} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, lineHeight: 1.6, fontFamily: 'inherit', resize: 'vertical', background: '#fff' }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!c.isLibrarian && (
            <div style={box}>
              <div style={secLabel}>ตัวละครของฉันในแคมเปญนี้</div>
              {c.members.filter((m) => m.character.ownerUserId === user.id).map(({ character: ch }) => (
                <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{ch.name || 'ตัวละคร'}</span>
                  <button onClick={() => removeMember.mutate(ch.id)} style={{ border: '1px solid #f0d3cb', background: '#fff', color: '#b4513a', borderRadius: 8, padding: '5px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>ออกจากแคมเปญ</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={monPicker} onClose={() => setMonPicker(false)} title="เพิ่มมอนสเตอร์เข้า Initiative" dark>
        <p style={{ fontSize: 12.5, color: '#8d8a82', margin: '0 0 10px' }}>กด “เพิ่ม + ทอย” เพื่อทอย Initiative = 10 + DEX + PER จากค่าจริงของมอนสเตอร์</p>
        <input value={monQuery} onChange={(e) => setMonQuery(e.target.value)} placeholder="🔍 ค้นหามอนสเตอร์…" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #3a3730', borderRadius: 10, padding: '9px 12px', fontSize: 13, background: '#221f1a', color: '#f3ede1', outline: 'none', marginBottom: 10 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 400, overflowY: 'auto' }}>
          {(monsters ?? []).filter((m) => !monQuery.trim() || m.name.toLowerCase().includes(monQuery.toLowerCase())).map((m) => {
            const dexG = String(m.fields.coreDEX ?? '—'), perG = String(m.fields.corePER ?? '—');
            const dexF = STEP10[dexG] ?? 0, perF = STEP10[perG] ?? 0;
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 10, border: '1px solid #35322b', background: '#26231e' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f3ede1' }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: '#9a978e' }}>DEX {dexG} (d{dexF || '?'}) · PER {perG} (d{perF || '?'})</div>
                </div>
                <button onClick={() => { const val = 10 + rollD(dexF) + rollD(perF); addMonster.mutate({ name: m.name, value: val }); }} style={{ flex: 'none', border: 'none', borderRadius: 8, padding: '6px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: '#b4513a', color: '#fff' }}>เพิ่ม + ทอย</button>
              </div>
            );
          })}
          {(monsters ?? []).length === 0 && <div style={{ fontSize: 12.5, color: '#8d8a82', textAlign: 'center', padding: '14px 0' }}>ยังไม่มีมอนสเตอร์ในคลัง</div>}
        </div>
      </Modal>

      <Modal open={delOpen} onClose={() => setDelOpen(false)} title="ยืนยันการลบแคมเปญ"
        footer={<><Button variant="ghost" onClick={() => setDelOpen(false)}>ยกเลิก</Button><Button variant="danger" disabled={delCamp.isPending} onClick={() => delCamp.mutate()}>ลบถาวร</Button></>}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>แน่ใจแล้วใช่ไหมว่าจะลบ <b>{c.name}</b>? ผู้เล่นทั้งหมดจะถูกนำออกจากแคมเปญ (ตัวละครไม่ถูกลบ)</p>
      </Modal>
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const fmtClock = (c: Clock) => `${pad(c.hour)}:${pad(c.minute)} · วันที่ ${c.day} ${MONTH_NAMES[c.month - 1]} ปีที่ ${c.year}`;

// Decorative, draggable analog clock (does not tick; drag a hand to set the time).
// The time is tracked as a continuous 0–1439 minute total and driven by *signed
// angular deltas*, so a hand moves smoothly and rolls through XII into the next
// 12-hour half (12→13…) instead of snapping back to the same hour.
function AnalogClock({ hour, minute, editable, onCommit }: { hour: number; minute: number; editable: boolean; onCommit: (h: number, m: number) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ hand: 'hour' | 'minute'; total: number; lastA: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pv, setPv] = useState<{ h: number; m: number } | null>(null);
  const h = pv?.h ?? hour;
  const m = pv?.m ?? minute;
  const mAng = (m % 60) * 6;
  const hAng = ((h % 12) * 60 + m) * 0.5; // 0.5° per minute → 360° over 12h, includes minute offset
  const C = 110, RN = 84;
  const NUM = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  const dist = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
  const angleAt = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    return (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
  };
  const down = (e: React.PointerEvent) => {
    if (!editable) return;
    const a = angleAt(e);
    const hand: 'hour' | 'minute' = dist(a, hAng) < dist(a, mAng) ? 'hour' : 'minute';
    drag.current = { hand, total: (((hour % 24) + 24) % 24) * 60 + minute, lastA: a };
    setDragging(true);
    setPv({ h: hour, m: minute });
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const a = angleAt(e);
    const delta = ((a - d.lastA + 540) % 360) - 180; // shortest signed step
    d.lastA = a;
    // minute hand: 6°/min · hour hand: 0.5°/min → 2 min per degree
    d.total = (d.total + (d.hand === 'minute' ? delta / 6 : delta * 2) + 1440) % 1440;
    const rt = Math.round(d.total) % 1440;
    setPv({ h: Math.floor(rt / 60), m: rt % 60 });
  };
  const finish = () => { if (drag.current && pv) onCommit(pv.h, pv.m); drag.current = null; setDragging(false); setPv(null); };
  const tip = (ang: number, len: number) => ({ x: C + Math.sin(ang * Math.PI / 180) * len, y: C - Math.cos(ang * Math.PI / 180) * len });
  const mt = tip(mAng, 90), ht = tip(hAng, 58);
  return (
    <svg
      ref={svgRef} viewBox="0 0 220 220" width="100%" style={{ maxWidth: 230, display: 'block', margin: '0 auto', touchAction: 'none', cursor: editable ? (dragging ? 'grabbing' : 'grab') : 'default' }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerLeave={finish}
    >
      <circle cx={C} cy={C} r={106} fill="#fff" stroke="#15140f" strokeWidth={3} />
      <circle cx={C} cy={C} r={98} fill="none" stroke="#15140f" strokeWidth={1} />
      {Array.from({ length: 60 }).map((_, i) => { const a = i * 6 * Math.PI / 180; const r1 = i % 5 === 0 ? 88 : 93; return <line key={i} x1={C + Math.sin(a) * r1} y1={C - Math.cos(a) * r1} x2={C + Math.sin(a) * 97} y2={C - Math.cos(a) * 97} stroke="#15140f" strokeWidth={i % 5 === 0 ? 2 : 0.7} />; })}
      {NUM.map((n, i) => { const a = i * 30 * Math.PI / 180; return <text key={n} x={C + Math.sin(a) * RN} y={C - Math.cos(a) * RN + 5} textAnchor="middle" fontFamily="var(--font-serif), serif" fontSize={15} fontWeight={600} fill="#15140f">{n}</text>; })}
      <line x1={C} y1={C} x2={ht.x} y2={ht.y} stroke="#15140f" strokeWidth={5} strokeLinecap="round" />
      <line x1={C} y1={C} x2={mt.x} y2={mt.y} stroke="#5c4a2e" strokeWidth={3} strokeLinecap="round" />
      {editable && <circle cx={mt.x} cy={mt.y} r={7} fill="#e07a5f" stroke="#fff" strokeWidth={2} />}
      {editable && <circle cx={ht.x} cy={ht.y} r={7} fill="#15140f" stroke="#fff" strokeWidth={2} />}
      <circle cx={C} cy={C} r={6} fill="#15140f" />
    </svg>
  );
}

const chip = (on: boolean, accent: string): React.CSSProperties => ({ border: `1px solid ${on ? accent : '#e0ded7'}`, background: on ? accent : '#fff', color: on ? '#fff' : '#8d8a82', borderRadius: 16, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' });
const pickRow = (on: boolean, accent: string): React.CSSProperties => ({ textAlign: 'left', border: `1px solid ${on ? accent : '#ece9e3'}`, background: on ? (accent === '#2f6b4f' ? '#eef6f0' : '#fbeae6') : '#fff', color: on ? accent : '#5f5c54', borderRadius: 8, padding: '6px 9px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' });
