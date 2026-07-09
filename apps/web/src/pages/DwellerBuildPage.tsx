import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CatalogItem, Character, WiwonCover } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';
import { Button } from '../components/ui';
import layout from '../components/layout.module.css';

const TOTAL_STEPS = 12;
const wiwonIdsOf = (c: Character) => (Array.isArray(c.data.wiwonIds) ? (c.data.wiwonIds as string[]) : []);

export function DwellerBuildPage({ mode }: { mode: 'build' | 'sheet' }) {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['character', id],
    queryFn: () => api.get<{ character: Character }>(`/characters/${id}`),
    enabled: !!user && !!id,
  });
  const { data: coversData } = useQuery({
    queryKey: ['wiwon-covers'],
    queryFn: () => api.get<{ covers: WiwonCover[] }>('/wiwon-covers'),
  });
  const character = data?.character;
  const covers = coversData?.covers ?? [];

  const patch = useMutation({
    mutationFn: (body: Partial<Pick<Character, 'name' | 'status' | 'step'>> & { data?: Record<string, unknown> }) =>
      api.patch(`/characters/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['character', id] }),
  });

  const back = (
    <Link to="/dweller" style={backLink}>
      ← Dweller Sheet
    </Link>
  );

  if (!user) {
    return (
      <Shell back={back}>
        <Card>
          <p style={{ color: '#8d8a82', fontSize: 14 }}>เข้าสู่ระบบก่อนเพื่อสร้างตัวละคร</p>
          <Link to="/login" style={{ ...primaryBtn, display: 'inline-block', marginTop: 12 }}>
            เข้าสู่ระบบ
          </Link>
        </Card>
      </Shell>
    );
  }
  if (isLoading || !character) {
    return (
      <Shell back={back}>
        <Card>
          <p style={{ color: '#a8a59d' }}>กำลังโหลด…</p>
        </Card>
      </Shell>
    );
  }

  if (mode === 'sheet') {
    return (
      <Shell back={back}>
        <Card>
          <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.5 }}>🧝</div>
          <h1 style={cardTitle}>Character Sheet</h1>
          <p style={{ color: '#8d8a82', fontSize: 14, margin: '10px 0 0' }}>ตัวละคร: {character.name || 'ตัวละครใหม่'}</p>
          <p style={{ color: '#bdbab2', fontSize: 13, margin: '18px 0 0' }}>หน้าชีตตัวละครกำลังพัฒนาในเฟสถัดไป</p>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell back={back}>
      {character.step === 0 ? (
        <WiwonSetup character={character} covers={covers} patch={patch} />
      ) : (
        <StepShell character={character} covers={covers} patch={patch} />
      )}
    </Shell>
  );
}

// ── Step 0: ตั้งค่า Wiwon (เลือกได้หลาย Wiwon) ──────────────────────────────
function WiwonSetup({
  character,
  covers,
  patch,
}: {
  character: Character;
  covers: WiwonCover[];
  patch: ReturnType<typeof useMutation<unknown, Error, { data?: Record<string, unknown>; step?: number }>>;
}) {
  const selected = wiwonIdsOf(character);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const toggle = (cid: string) => {
    const next = selected.includes(cid) ? selected.filter((x) => x !== cid) : [...selected, cid];
    patch.mutate({ data: { ...character.data, wiwonIds: next } });
  };

  const sets = covers.reduce<Record<string, WiwonCover[]>>((acc, c) => {
    const s = (c.setName && c.setName.trim()) || 'ทั่วไป';
    (acc[s] ??= []).push(c);
    return acc;
  }, {});

  return (
    <>
      <div style={{ marginBottom: 22 }}>
        <span style={{ fontSize: 11, letterSpacing: '.14em', color: '#e07a5f', fontWeight: 700 }}>สร้างตัวละคร</span>
        <h1 style={{ margin: '6px 0 0', fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 30 }}>ตั้งค่า Wiwon</h1>
        <p style={{ margin: '8px 0 0', color: '#8d8a82', fontSize: 14 }}>
          เลือก Wiwon ที่เกี่ยวข้อง (เลือกได้หลายอัน) — เนื้อหา Feature / Magic ในขั้นตอนถัดไปจะปรากฏเฉพาะที่อยู่ใน Wiwon ที่เลือกไว้
        </p>
      </div>

      <div style={cardPlain}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
          Wiwon ที่เกี่ยวข้อง <span style={{ color: '#a8a59d', fontWeight: 500 }}>({selected.length} เลือกไว้)</span>
        </div>
        {covers.length === 0 && <div style={{ color: '#a8a59d', fontSize: 13 }}>ยังไม่มี Wiwon บนชั้น</div>}
        {Object.entries(sets).map(([set, list]) => (
          <div key={set} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, letterSpacing: '.06em', color: '#a8916a', fontWeight: 700, marginBottom: 8 }}>{set}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {list.map((c) => {
                const on = selected.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggle(c.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '9px 14px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                      border: `1.5px solid ${on ? 'var(--coral)' : 'var(--border-soft)'}`,
                      background: on ? 'var(--coral-bg)' : '#fff',
                      color: on ? 'var(--coral-ink)' : 'var(--text-muted)',
                    }}
                  >
                    <span style={{ width: 18, height: 18, borderRadius: 5, flex: 'none', border: `2px solid ${on ? 'var(--coral)' : '#cbc8c0'}`, background: on ? 'var(--coral)' : '#fff', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                      {on ? '✓' : ''}
                    </span>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Where the dev-editable setup questions will live (next 3a increment). */}
      <div style={{ ...cardPlain, marginTop: 16, borderStyle: 'dashed', color: '#a8a59d' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#8d8a82' }}>แท็กคำถามตั้งค่า</div>
        <div style={{ fontSize: 12.5, marginTop: 6 }}>ส่วนคำถาม/คำตอบที่ผู้พัฒนาแก้ไขได้ กำลังจะเพิ่มในขั้นถัดไป</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
        <Button variant="coral" disabled={selected.length === 0} onClick={() => setConfirmOpen(true)}>
          ถัดไป →
        </Button>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="ยืนยันการตั้งค่า"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              ยังไม่ไป
            </Button>
            <Button
              variant="coral"
              disabled={patch.isPending}
              onClick={() => patch.mutate({ step: 1 }, { onSuccess: () => setConfirmOpen(false) })}
            >
              ไปต่อเลย
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0 }}>ฉันตั้งค่าแล้ว จะไปต่อแล้วนะ — เลือก Wiwon ไว้ {selected.length} อัน</p>
      </Modal>
    </>
  );
}

// ── Step 1–12 shell (gauge + nav). Step content comes in the next increments. ──
function StepShell({
  character,
  covers,
  patch,
}: {
  character: Character;
  covers: WiwonCover[];
  patch: ReturnType<typeof useMutation<unknown, Error, { data?: Record<string, unknown>; step?: number }>>;
}) {
  const step = character.step;
  const pct = Math.round((step / TOTAL_STEPS) * 100);
  const selectedNames = wiwonIdsOf(character)
    .map((wid) => covers.find((c) => c.id === wid)?.name)
    .filter(Boolean);

  const canNext = step === 1 ? !!character.data.race : true;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#8d8a82' }}>Step {step}/{TOTAL_STEPS}</span>
        <span style={{ fontSize: 12, color: '#a8a59d' }}>{pct}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 6, background: '#eae7e0', overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#e79b86,#e07a5f)', transition: 'width .3s' }} />
      </div>

      {step === 1 ? (
        <RaceStep character={character} patch={patch} />
      ) : (
        <div style={cardPlain}>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 26 }}>ขั้นตอนที่ {step}</h1>
          {selectedNames.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {selectedNames.map((n) => (
                <span key={n} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f6f2ea', color: '#5c4a2e', border: '1px solid #e8e0d0' }}>
                  {n}
                </span>
              ))}
            </div>
          )}
          <p style={{ color: '#bdbab2', fontSize: 13, margin: '18px 0 0' }}>เนื้อหาขั้นตอนนี้กำลังพัฒนา (เฟส 3d เป็นต้นไป)</p>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}>
        <Button variant="ghost" disabled={patch.isPending} onClick={() => patch.mutate({ step: step - 1 })}>
          ← ย้อนกลับ
        </Button>
        <Button variant="coral" disabled={patch.isPending || step >= TOTAL_STEPS || !canNext} onClick={() => patch.mutate({ step: step + 1 })}>
          ถัดไป →
        </Button>
      </div>
    </>
  );
}

// ── Step 1: เลือกเผ่าพันธุ์ — Features tagged "Race" within the chosen Wiwon ──
async function fetchRaceOptions(wiwonIds: string[]): Promise<CatalogItem[]> {
  const params = new URLSearchParams({ isFeature: 'true', tag: 'Race', scope: 'all' });
  if (wiwonIds.length) params.set('relatedWiwon', wiwonIds.join(','));
  const out: CatalogItem[] = [];
  for (let page = 1; page < 50; page++) {
    params.set('page', String(page));
    const d = await api.get<{ items: CatalogItem[]; total: number }>(`/catalog/magic?${params.toString()}`);
    out.push(...d.items);
    if (d.items.length === 0 || out.length >= d.total) break;
  }
  return out;
}

function RaceStep({
  character,
  patch,
}: {
  character: Character;
  patch: ReturnType<typeof useMutation<unknown, Error, { data?: Record<string, unknown>; step?: number }>>;
}) {
  const wiwonIds = wiwonIdsOf(character);
  const chosen = typeof character.data.race === 'string' ? (character.data.race as string) : '';
  const [info, setInfo] = useState<CatalogItem | null>(null);

  const { data: races, isLoading } = useQuery({
    queryKey: ['race-options', wiwonIds.join(',')],
    queryFn: () => fetchRaceOptions(wiwonIds),
  });

  const pick = (r: CatalogItem) =>
    patch.mutate({ data: { ...character.data, race: r.id, raceName: r.name } });

  const fv = (it: CatalogItem, k: string) => (it.fields[k] != null ? String(it.fields[k]) : '');

  return (
    <div style={cardPlain}>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 26 }}>เลือกเผ่าพันธุ์ของคุณ</h1>
      <p style={{ color: '#8d8a82', fontSize: 13.5, margin: '8px 0 18px' }}>
        เลือกเผ่าพันธุ์ 1 อย่าง (แสดงเฉพาะ Feature แท็ก “Race” ใน Wiwon ที่เลือกไว้)
      </p>

      {isLoading && <div style={{ color: '#a8a59d', fontSize: 13, padding: 20, textAlign: 'center' }}>กำลังโหลด…</div>}
      {!isLoading && (races?.length ?? 0) === 0 && (
        <div style={{ color: '#a8a59d', fontSize: 13.5, padding: '24px 16px', textAlign: 'center', background: '#faf9f7', borderRadius: 10 }}>
          ยังไม่มี Feature แท็ก “Race” ใน Wiwon ที่เลือก — ผู้พัฒนาเพิ่มได้ในหน้า Magic &amp; Feature (แท็ก Race + เลือก Wiwon ที่เกี่ยวข้อง)
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(races ?? []).map((r) => {
          const on = chosen === r.id;
          return (
            <div
              key={r.id}
              onClick={() => pick(r)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '13px 15px', borderRadius: 12, border: `1.5px solid ${on ? 'var(--coral)' : 'var(--border-soft)'}`, background: on ? 'var(--coral-bg)' : '#fff' }}
            >
              <span style={{ width: 20, height: 20, borderRadius: '50%', flex: 'none', border: `2px solid ${on ? 'var(--coral)' : '#cbc8c0'}`, background: on ? 'var(--coral)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 800 }}>
                {on ? '✓' : ''}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: '#2f2c25' }}>{r.name}</div>
                <div style={{ fontSize: 12, color: '#9a978e', marginTop: 2 }}>
                  {[r.subtitle, fv(r, 'rarity') && `Capacity: ${fv(r, 'rarity')}`].filter(Boolean).join(' · ') || 'เผ่าพันธุ์'}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setInfo(r); }}
                style={{ flex: 'none', border: '1px solid var(--border-soft)', background: '#fff', color: '#6b6860', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                ⓘ ดูข้อมูล
              </button>
            </div>
          );
        })}
      </div>

      <Modal open={!!info} onClose={() => setInfo(null)} title={info?.name ?? ''}>
        {info && (
          <div>
            {info.subtitle && <div style={{ fontSize: 12.5, color: '#8d8a82', marginBottom: 10 }}>{info.subtitle}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {info.tags.map((t) => (
                <span key={t} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#edeae4', color: '#6b6860' }}>#{t}</span>
              ))}
            </div>
            {info.description ? (
              <div style={{ fontSize: 13.5, lineHeight: 1.7, color: '#3c3a33' }} dangerouslySetInnerHTML={{ __html: info.description }} />
            ) : (
              <div style={{ fontSize: 13, color: '#a8a59d' }}>ยังไม่มีคำอธิบายเพิ่มเติม</div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── small layout helpers ──
function Shell({ back, children }: { back: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={layout.page} style={{ paddingTop: 40, maxWidth: 760 }}>
      {back}
      <div style={{ marginTop: 22 }}>{children}</div>
    </div>
  );
}
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ ...cardPlain, textAlign: 'center', padding: '48px 32px' }}>{children}</div>;
}

const backLink: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#5f5c54', textDecoration: 'none' };
const cardPlain: React.CSSProperties = { background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '22px 24px' };
const cardTitle: React.CSSProperties = { margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 24 };
const primaryBtn: React.CSSProperties = { background: '#e07a5f', color: '#fff', borderRadius: 11, padding: '11px 26px', fontSize: 14, fontWeight: 700, textDecoration: 'none' };
