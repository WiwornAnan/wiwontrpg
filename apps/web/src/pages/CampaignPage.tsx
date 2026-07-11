import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Modal } from '../components/Modal';
import { Button } from '../components/ui';
import layout from '../components/layout.module.css';
import { BUFF_EFFECTS, STATUS_EFFECTS } from '../data/statusEffects';
import type { CampaignDTO } from '../data/statusEffects';

const DAYS = 30, MONTHS = 12, HRS = 24, MIN = 60;
const MONTH_NAMES = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
interface Clock { year: number; month: number; day: number; hour: number; minute: number }
const DEFAULT_CLOCK: Clock = { year: 1, month: 1, day: 1, hour: 8, minute: 0 };
const toMin = (c: Clock) => ((((c.year - 1) * MONTHS + (c.month - 1)) * DAYS + (c.day - 1)) * HRS + c.hour) * MIN + c.minute;
const fromMin = (t: number): Clock => {
  let m = Math.max(0, Math.round(t));
  const minute = m % MIN; m = Math.floor(m / MIN);
  const hour = m % HRS; m = Math.floor(m / HRS);
  const day = (m % DAYS) + 1; m = Math.floor(m / DAYS);
  const month = (m % MONTHS) + 1; m = Math.floor(m / MONTHS);
  return { year: m + 1, month, day, hour, minute };
};
const num = (v: unknown, def = 0) => (typeof v === 'number' && isFinite(v) ? v : def);
const buffLabel = (k: string) => BUFF_EFFECTS.find((e) => e[0] === k)?.[1] ?? k;
const statusLabel = (k: string) => STATUS_EFFECTS.find((e) => e[0] === k)?.[1] ?? k;
const WOUND_NAMES = ['ปกติ', 'First Blood', 'Impaired', 'Suppressed', 'Desperate Edge', "Death's Door"];

interface Note { id: string; title: string; text: string }

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

  if (!user) return <div className={layout.page} style={{ paddingTop: 40 }}><Link to="/login">เข้าสู่ระบบ</Link></div>;
  if (!c) return <div className={layout.page} style={{ paddingTop: 40, color: '#a8a59d' }}>กำลังโหลด…</div>;

  const cdata = c.data as { clock?: Clock; notes?: Note[] };
  const clock = { ...DEFAULT_CLOCK, ...(cdata.clock ?? {}) };
  const notes: Note[] = Array.isArray(cdata.notes) ? cdata.notes : [];
  const setData = (partial: Record<string, unknown>) => patchCamp.mutate({ data: { ...c.data, ...partial } });
  const advance = (deltaMin: number) => setData({ clock: fromMin(toMin(clock) + deltaMin) });
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
        </div>

        {/* RIGHT: clock/calendar + notes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={box}>
            <div style={secLabel}>นาฬิกา &amp; ปฏิทิน</div>
            <div style={{ textAlign: 'center', background: '#15140f', borderRadius: 12, padding: '16px 12px', color: '#fff', marginBottom: c.isLibrarian ? 12 : 0 }}>
              <div style={{ fontSize: 34, fontWeight: 800, color: '#f7dca0', letterSpacing: 1 }}>{String(clock.hour).padStart(2, '0')}:{String(clock.minute).padStart(2, '0')}</div>
              <div style={{ fontSize: 13, color: '#cbc8c0', marginTop: 4 }}>วันที่ {clock.day} {MONTH_NAMES[clock.month - 1]} · ปีที่ {clock.year}</div>
            </div>
            {c.isLibrarian && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                {([['−1วัน', -DAYS * HRS * MIN], ['−1ชม.', -HRS * MIN], ['+10น.', 10], ['+1ชม.', HRS * MIN]] as const).map(([lb, d]) => (
                  <button key={lb} onClick={() => advance(d)} style={{ border: '1px solid #e0ded7', background: '#faf9f7', borderRadius: 8, padding: '7px 4px', fontSize: 11.5, fontWeight: 700, color: '#5f5c54', cursor: 'pointer' }}>{lb}</button>
                ))}
                <button onClick={() => advance(DAYS * HRS * MIN)} style={{ gridColumn: 'span 2', border: '1px solid #e0ded7', background: '#faf9f7', borderRadius: 8, padding: '7px', fontSize: 11.5, fontWeight: 700, color: '#5f5c54', cursor: 'pointer' }}>+1 วัน</button>
                <button onClick={() => advance(DAYS * HRS * MIN * 30)} style={{ gridColumn: 'span 2', border: '1px solid #e0ded7', background: '#faf9f7', borderRadius: 8, padding: '7px', fontSize: 11.5, fontWeight: 700, color: '#5f5c54', cursor: 'pointer' }}>+1 เดือน</button>
              </div>
            )}
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

      <Modal open={delOpen} onClose={() => setDelOpen(false)} title="ยืนยันการลบแคมเปญ"
        footer={<><Button variant="ghost" onClick={() => setDelOpen(false)}>ยกเลิก</Button><Button variant="danger" disabled={delCamp.isPending} onClick={() => delCamp.mutate()}>ลบถาวร</Button></>}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>แน่ใจแล้วใช่ไหมว่าจะลบ <b>{c.name}</b>? ผู้เล่นทั้งหมดจะถูกนำออกจากแคมเปญ (ตัวละครไม่ถูกลบ)</p>
      </Modal>
    </div>
  );
}

const chip = (on: boolean, accent: string): React.CSSProperties => ({ border: `1px solid ${on ? accent : '#e0ded7'}`, background: on ? accent : '#fff', color: on ? '#fff' : '#8d8a82', borderRadius: 16, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' });
const pickRow = (on: boolean, accent: string): React.CSSProperties => ({ textAlign: 'left', border: `1px solid ${on ? accent : '#ece9e3'}`, background: on ? (accent === '#2f6b4f' ? '#eef6f0' : '#fbeae6') : '#fff', color: on ? accent : '#5f5c54', borderRadius: 8, padding: '6px 9px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' });
