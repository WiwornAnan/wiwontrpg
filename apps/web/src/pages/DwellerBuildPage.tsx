import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CatalogItem, Character, ClassLevelTemplate, WiwonCover, WizardLevel, WizardLevelOption } from '@wiwonanant/shared';
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

  const sets = covers.reduce<Record<string, WiwonCover[]>>((acc, c) => {
    const s = (c.setName && c.setName.trim()) || 'ทั่วไป';
    (acc[s] ??= []).push(c);
    return acc;
  }, {});
  const setEntries = Object.entries(sets);
  // Selection is by ชุด: a set is on when all its books are included; toggling a
  // set adds/removes every book in it (downstream still filters by book ids).
  const isSetOn = (list: WiwonCover[]) => list.length > 0 && list.every((c) => selected.includes(c.id));
  const toggleSet = (list: WiwonCover[]) => {
    const ids = list.map((c) => c.id);
    const next = isSetOn(list) ? selected.filter((id) => !ids.includes(id)) : Array.from(new Set([...selected, ...ids]));
    patch.mutate({ data: { ...character.data, wiwonIds: next } });
  };
  const setsSelected = setEntries.filter(([, list]) => isSetOn(list)).length;

  return (
    <>
      <div style={{ marginBottom: 22 }}>
        <span style={{ fontSize: 11, letterSpacing: '.14em', color: '#e07a5f', fontWeight: 700 }}>สร้างตัวละคร</span>
        <h1 style={{ margin: '6px 0 0', fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 30 }}>ตั้งค่า Wiwon</h1>
        <p style={{ margin: '8px 0 0', color: '#8d8a82', fontSize: 14 }}>
          เลือกชุดหนังสือ (เลือกได้หลายชุด) — ทุกเล่มในชุดที่เลือกจะถูกนำมาใช้ เนื้อหา Feature / Magic ในขั้นตอนถัดไปจะปรากฏเฉพาะที่อยู่ในเล่มเหล่านั้น
        </p>
      </div>

      <div style={cardPlain}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
          ชุดหนังสือที่เกี่ยวข้อง <span style={{ color: '#a8a59d', fontWeight: 500 }}>({setsSelected} ชุดที่เลือก)</span>
        </div>
        {covers.length === 0 && <div style={{ color: '#a8a59d', fontSize: 13 }}>ยังไม่มี Wiwon บนชั้น</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {setEntries.map(([set, list]) => {
            const on = isSetOn(list);
            return (
              <div
                key={set}
                onClick={() => toggleSet(list)}
                style={{ cursor: 'pointer', padding: '13px 15px', borderRadius: 12, border: `1.5px solid ${on ? 'var(--coral)' : 'var(--border-soft)'}`, background: on ? 'var(--coral-bg)' : '#fff' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, flex: 'none', border: `2px solid ${on ? 'var(--coral)' : '#cbc8c0'}`, background: on ? 'var(--coral)' : '#fff', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                    {on ? '✓' : ''}
                  </span>
                  <span style={{ flex: 1, fontSize: 14.5, fontWeight: 700, color: on ? 'var(--coral-ink)' : '#2f2c25' }}>{set}</span>
                  <span style={{ flex: 'none', fontSize: 11.5, color: '#9a978e' }}>{list.length} เล่ม</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9, paddingLeft: 30 }}>
                  {list.map((c) => (
                    <span key={c.id} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: on ? 'rgba(224,122,95,.12)' : '#f1efe9', color: on ? 'var(--coral-ink)' : '#7a776f' }}>
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
        <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0 }}>ฉันตั้งค่าแล้ว จะไปต่อแล้วนะ — เลือก {setsSelected} ชุด ({selected.length} เล่ม)</p>
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

  const canNext = step === 1 ? !!character.data.race : step === 2 ? !!character.data.class : true;

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
      ) : step === 2 ? (
        <ClassStep character={character} patch={patch} />
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

// Fetch every Feature within the chosen Wiwon (optionally narrowed to a tag),
// paging through the catalog list.
async function fetchFeaturesByTag(tag: string, wiwonIds: string[]): Promise<CatalogItem[]> {
  const params = new URLSearchParams({ isFeature: 'true', scope: 'all' });
  if (tag) params.set('tag', tag);
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
  const ancestryChosen = typeof character.data.ancestry === 'string' ? (character.data.ancestry as string) : '';
  const [info, setInfo] = useState<CatalogItem | null>(null);

  const { data: races, isLoading } = useQuery({
    queryKey: ['race-options', wiwonIds.join(',')],
    queryFn: () => fetchFeaturesByTag('Race', wiwonIds),
  });
  // Ancestry is a second layer, shown once a race is picked (e.g. Wolf Lineage).
  const { data: ancestries, isLoading: ancLoading } = useQuery({
    enabled: !!chosen,
    queryKey: ['ancestry-options', wiwonIds.join(',')],
    queryFn: () => fetchFeaturesByTag('Ancestry', wiwonIds),
  });

  const pickRace = (r: CatalogItem) => patch.mutate({ data: { ...character.data, race: r.id, raceName: r.name } });
  const pickAncestry = (a: CatalogItem) => patch.mutate({ data: { ...character.data, ancestry: a.id, ancestryName: a.name } });

  return (
    <>
      <FeaturePicker
        title="เลือกเผ่าพันธุ์ของคุณ"
        hint="เลือกเผ่าพันธุ์ 1 อย่าง (แสดงเฉพาะ Feature แท็ก “Race” ใน Wiwon ที่เลือกไว้)"
        items={races ?? []}
        isLoading={isLoading}
        emptyText="ยังไม่มี Feature แท็ก “Race” ใน Wiwon ที่เลือก — ผู้พัฒนาเพิ่มได้ในหน้า Magic & Feature"
        chosenId={chosen}
        onPick={pickRace}
        onInfo={setInfo}
      />

      {chosen && (
        <div style={{ marginTop: 16 }}>
          <FeaturePicker
            title="เลือก Ancestry (สายเลือด)"
            hint="เลือก Ancestry 1 อย่าง (แสดงเฉพาะ Feature แท็ก “Ancestry”) — เลือกแล้วจะมี Feature เสริมของสายเลือดนั้น"
            items={ancestries ?? []}
            isLoading={ancLoading}
            emptyText="ยังไม่มี Feature แท็ก “Ancestry” ใน Wiwon ที่เลือก"
            chosenId={ancestryChosen}
            onPick={pickAncestry}
            onInfo={setInfo}
          />
        </div>
      )}

      {ancestryChosen && <FeatureGrants refId={ancestryChosen} wiwonIds={wiwonIds} />}

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
    </>
  );
}

// Single-select list of Features (used for both เผ่าพันธุ์ and Ancestry), each
// with a floating "ⓘ ดูข้อมูล" info popup.
function FeaturePicker({
  title,
  hint,
  items,
  isLoading,
  emptyText,
  chosenId,
  onPick,
  onInfo,
}: {
  title: string;
  hint: string;
  items: CatalogItem[];
  isLoading: boolean;
  emptyText: string;
  chosenId: string;
  onPick: (it: CatalogItem) => void;
  onInfo: (it: CatalogItem) => void;
}) {
  const fv = (it: CatalogItem, k: string) => (it.fields[k] != null ? String(it.fields[k]) : '');
  return (
    <div style={cardPlain}>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 26 }}>{title}</h1>
      <p style={{ color: '#8d8a82', fontSize: 13.5, margin: '8px 0 18px' }}>{hint}</p>

      {isLoading && <div style={{ color: '#a8a59d', fontSize: 13, padding: 20, textAlign: 'center' }}>กำลังโหลด…</div>}
      {!isLoading && items.length === 0 && (
        <div style={{ color: '#a8a59d', fontSize: 13.5, padding: '24px 16px', textAlign: 'center', background: '#faf9f7', borderRadius: 10 }}>{emptyText}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it) => {
          const on = chosenId === it.id;
          return (
            <div
              key={it.id}
              onClick={() => onPick(it)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '13px 15px', borderRadius: 12, border: `1.5px solid ${on ? 'var(--coral)' : 'var(--border-soft)'}`, background: on ? 'var(--coral-bg)' : '#fff' }}
            >
              <span style={{ width: 20, height: 20, borderRadius: '50%', flex: 'none', border: `2px solid ${on ? 'var(--coral)' : '#cbc8c0'}`, background: on ? 'var(--coral)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 800 }}>
                {on ? '✓' : ''}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: '#2f2c25' }}>{it.name}</div>
                <div style={{ fontSize: 12, color: '#9a978e', marginTop: 2 }}>
                  {[it.subtitle, fv(it, 'rarity') && `Capacity: ${fv(it, 'rarity')}`].filter(Boolean).join(' · ') || 'Feature'}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onInfo(it); }}
                style={{ flex: 'none', border: '1px solid var(--border-soft)', background: '#fff', color: '#6b6860', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                ⓘ ดูข้อมูล
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Supplementary Features an Ancestry grants. Dev curates; players receive. ──
interface RaceGrant {
  featureId: string;
  featureName: string | null;
}
function FeatureGrants({ refId, wiwonIds }: { refId: string; wiwonIds: string[] }) {
  const { isDev } = useAuth();
  const qc = useQueryClient();
  const [addId, setAddId] = useState('');

  const { data } = useQuery({
    queryKey: ['feature-grant', refId],
    queryFn: () => api.get<{ grant: { features: RaceGrant[] } }>(`/wizard/race-grant/${refId}`),
  });
  const features = data?.grant.features ?? [];

  // Ancestry supplementary Features come only from the "Flaws"-tagged pool.
  const { data: pool } = useQuery({
    enabled: isDev,
    queryKey: ['feature-pool', 'Flaws', wiwonIds.join(',')],
    queryFn: () => fetchFeaturesByTag('Flaws', wiwonIds),
  });

  const save = useMutation({
    mutationFn: (next: RaceGrant[]) => api.put(`/wizard/race-grant/${refId}`, { features: next }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feature-grant', refId] }),
  });
  const add = () => {
    const f = (pool ?? []).find((x) => x.id === addId);
    if (!f || features.some((x) => x.featureId === f.id)) return;
    save.mutate([...features, { featureId: f.id, featureName: f.name }]);
    setAddId('');
  };
  const remove = (fid: string) => save.mutate(features.filter((x) => x.featureId !== fid));

  return (
    <div style={{ ...cardPlain, marginTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Feature เสริม (จาก Ancestry)</div>
      <div style={{ fontSize: 12, color: '#a8a59d', marginBottom: 10 }}>
        {isDev ? 'ผู้พัฒนากำหนดได้ — ผู้เล่นจะได้รับทั้งหมดนี้อัตโนมัติ' : 'คุณจะได้รับ Feature เหล่านี้จากสายเลือดที่เลือก'}
      </div>

      {features.length === 0 && (
        <div style={{ fontSize: 12.5, color: '#bdbab2', padding: '10px 0' }}>{isDev ? 'ยังไม่มี — เพิ่มด้านล่าง' : 'สายเลือดนี้ยังไม่มี Feature เสริม'}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {features.map((f) => (
          <div key={f.featureId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, background: '#f6f2ea', border: '1px solid #e8e0d0' }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#5c4a2e' }}>✦ {f.featureName ?? '(Feature)'}</span>
            {isDev && (
              <button onClick={() => remove(f.featureId)} title="ลบ" style={{ flex: 'none', border: '1px solid #e6c4bc', background: '#fbf3f1', color: '#b4513a', borderRadius: 7, width: 28, height: 28, cursor: 'pointer' }}>×</button>
            )}
          </div>
        ))}
      </div>

      {isDev && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <select value={addId} onChange={(e) => setAddId(e.target.value)} style={{ flex: 1, border: '1px solid #e0ded7', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, background: '#fff' }}>
            <option value="">— เลือก Feature (แท็ก Flaws) เพื่อเพิ่ม —</option>
            {(pool ?? []).filter((f) => !features.some((x) => x.featureId === f.id)).map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <Button variant="coral" disabled={!addId || save.isPending} onClick={add}>+ เพิ่ม</Button>
        </div>
      )}
    </div>
  );
}

// ── Weapon proficiencies a class may take. Dev lists the options; the player
//    picks which to be proficient in. Each linked Feature has a floating popup. ──
interface WeaponOption {
  id: string;
  featureId: string | null;
  featureName: string | null;
  text: string;
}
function WeaponProficiency({
  classValue,
  wiwonIds,
  character,
  patch,
}: {
  classValue: string;
  wiwonIds: string[];
  character: Character;
  patch: ReturnType<typeof useMutation<unknown, Error, { data?: Record<string, unknown>; step?: number }>>;
}) {
  const { isDev } = useAuth();
  const qc = useQueryClient();
  const [addId, setAddId] = useState('');
  const [info, setInfo] = useState<CatalogItem | null>(null);

  const { data } = useQuery({
    queryKey: ['class-weapons', classValue],
    queryFn: () => api.get<{ weapons: { options: WeaponOption[] } }>(`/wizard/class-weapons/${encodeURIComponent(classValue)}`),
  });
  const options = data?.weapons.options ?? [];

  // Weapon options come only from the "Weapon Proficiency"-tagged pool.
  const { data: pool } = useQuery({
    queryKey: ['feature-pool', 'Weapon Proficiency', wiwonIds.join(',')],
    queryFn: () => fetchFeaturesByTag('Weapon Proficiency', wiwonIds),
  });

  const selected = Array.isArray(character.data.weaponProficiencies) ? (character.data.weaponProficiencies as string[]) : [];
  // Single choice: picking one replaces any previous; clicking it again clears.
  const toggle = (id: string) => {
    const next = selected.includes(id) ? [] : [id];
    patch.mutate({ data: { ...character.data, weaponProficiencies: next } });
  };

  const save = useMutation({
    mutationFn: (next: WeaponOption[]) => api.put(`/wizard/class-weapons/${encodeURIComponent(classValue)}`, { options: next }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class-weapons', classValue] }),
  });
  const addOpt = () => {
    const f = (pool ?? []).find((x) => x.id === addId);
    if (!f || options.some((o) => o.featureId === f.id)) return;
    save.mutate([...options, { id: crypto.randomUUID(), featureId: f.id, featureName: f.name, text: '' }]);
    setAddId('');
  };
  const removeOpt = (id: string) => {
    save.mutate(options.filter((o) => o.id !== id));
    if (selected.includes(id)) patch.mutate({ data: { ...character.data, weaponProficiencies: selected.filter((x) => x !== id) } });
  };
  const openInfo = (o: WeaponOption) => {
    const f = (pool ?? []).find((x) => x.id === o.featureId);
    if (f) setInfo(f);
  };

  return (
    <div style={{ marginTop: 18, borderTop: '1px solid #efece6', paddingTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>อาวุธที่เชี่ยวชาญ (Weapon Proficiency)</div>
      <div style={{ fontSize: 12, color: '#a8a59d', marginBottom: 10 }}>
        {isDev ? 'ผู้พัฒนากำหนดตัวเลือกของคลาสนี้ — ผู้เล่นเลือกได้เอง' : 'เลือกอาวุธที่คุณเชี่ยวชาญ (เลือกได้ 1 อย่าง)'}
      </div>

      {options.length === 0 && (
        <div style={{ fontSize: 12.5, color: '#bdbab2', padding: '10px 0' }}>{isDev ? 'ยังไม่มี — เพิ่มด้านล่าง' : 'คลาสนี้ยังไม่ได้กำหนดอาวุธที่เชี่ยวชาญ'}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, border: `1.5px solid ${on ? 'var(--coral)' : '#e8e5df'}`, background: on ? 'var(--coral-bg)' : '#fff' }}>
              <div onClick={() => toggle(o.id)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', flex: 'none', border: `2px solid ${on ? 'var(--coral)' : '#cbc8c0'}`, background: on ? 'var(--coral)' : '#fff', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                  {on ? '✓' : ''}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#2f2c25' }}>⚔ {o.featureName ?? o.text ?? 'อาวุธ'}</span>
              </div>
              {o.featureId && (
                <button onClick={() => openInfo(o)} style={{ flex: 'none', border: '1px solid var(--border-soft)', background: '#fff', color: '#6b6860', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>ⓘ ดูข้อมูล</button>
              )}
              {isDev && (
                <button onClick={() => removeOpt(o.id)} title="ลบ" style={{ flex: 'none', border: '1px solid #e6c4bc', background: '#fbf3f1', color: '#b4513a', borderRadius: 7, width: 28, height: 28, cursor: 'pointer' }}>×</button>
              )}
            </div>
          );
        })}
      </div>

      {isDev && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <select value={addId} onChange={(e) => setAddId(e.target.value)} style={{ flex: 1, border: '1px solid #e0ded7', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, background: '#fff' }}>
            <option value="">— เลือก Feature (แท็ก Weapon Proficiency) เพื่อเพิ่ม —</option>
            {(pool ?? []).filter((f) => !options.some((o) => o.featureId === f.id)).map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <Button variant="coral" disabled={!addId || save.isPending} onClick={addOpt}>+ เพิ่ม</Button>
        </div>
      )}

      <Modal open={!!info} onClose={() => setInfo(null)} title={info?.name ?? ''}>
        {info && (
          <div>
            {info.subtitle && <div style={{ fontSize: 12.5, color: '#8d8a82', marginBottom: 10 }}>{info.subtitle}</div>}
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

// ── Class Core Attributes — dev-graded (A/B/C/D/X); players just receive them. ──
interface CoreAttr {
  id: string;
  name: string;
  grade: 'A' | 'B' | 'C' | 'D' | 'X';
}
const GRADE_COLOR: Record<string, string> = { A: '#2f7d4f', B: '#2a5fbd', C: '#8d7a2a', D: '#b06a2a', X: '#a03a3a' };
const CORE_ATTR_OPTIONS = [
  'Strength (STR)',
  'Dexterity (DEX)',
  'Endurance (END)',
  'Perception (PER)',
  'Intelligence (INT)',
  'Authority (AUT)',
  'Conviction (CVN)',
];
function CoreAttributes({ classValue }: { classValue: string }) {
  const { isDev } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['class-core', classValue],
    queryFn: () => api.get<{ core: { attributes: CoreAttr[] } }>(`/wizard/class-core/${encodeURIComponent(classValue)}`),
  });
  const attrs = data?.core.attributes ?? [];
  const save = useMutation({
    mutationFn: (next: CoreAttr[]) => api.put(`/wizard/class-core/${encodeURIComponent(classValue)}`, { attributes: next }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class-core', classValue] }),
  });
  const update = (id: string, p: Partial<CoreAttr>) => save.mutate(attrs.map((a) => (a.id === id ? { ...a, ...p } : a)));
  const add = () => save.mutate([...attrs, { id: crypto.randomUUID(), name: '', grade: 'C' }]);
  const remove = (id: string) => save.mutate(attrs.filter((a) => a.id !== id));

  return (
    <div style={{ marginTop: 18, borderTop: '1px solid #efece6', paddingTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Core Attribute (ของคลาส)</div>
      <div style={{ fontSize: 12, color: '#a8a59d', marginBottom: 10 }}>
        {isDev ? 'ผู้พัฒนากำหนดชื่อ + เกรด A/B/C/D/X — ผู้เล่นรับมาเลย (แก้ไม่ได้)' : 'ค่าหลักของคลาสที่คุณได้รับ'}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {attrs.map((a) =>
          isDev ? (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e8e5df', borderRadius: 10, padding: '7px 9px', background: '#faf9f7' }}>
              <select value={a.name} onChange={(e) => update(a.id, { name: e.target.value })} style={{ width: 168, border: '1px solid #e0ded7', borderRadius: 7, padding: '6px 8px', fontSize: 12.5, background: '#fff' }}>
                <option value="">— เลือกค่า —</option>
                {CORE_ATTR_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select value={a.grade} onChange={(e) => update(a.id, { grade: e.target.value as CoreAttr['grade'] })} style={{ border: '1px solid #e0ded7', borderRadius: 7, padding: '6px 8px', fontSize: 13, fontWeight: 800, color: GRADE_COLOR[a.grade], background: '#fff' }}>
                {['A', 'B', 'C', 'D', 'X'].map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              <button onClick={() => remove(a.id)} title="ลบ" style={{ border: '1px solid #e6c4bc', background: '#fbf3f1', color: '#b4513a', borderRadius: 7, width: 28, height: 28, cursor: 'pointer' }}>×</button>
            </div>
          ) : (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #e8e5df', borderRadius: 10, padding: '8px 14px', background: '#faf9f7' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#3c3a33' }}>{a.name || '—'}</span>
              <span style={{ width: 26, height: 26, borderRadius: 7, background: GRADE_COLOR[a.grade], color: '#fff', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{a.grade}</span>
            </div>
          ),
        )}
      </div>

      {isDev && (
        <button onClick={add} style={{ marginTop: 10, border: '1px dashed #c3a184', background: 'rgba(255,255,255,.5)', color: '#a06a44', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ เพิ่มค่า</button>
      )}
    </div>
  );
}

// ── Step 2: เลือกคลาส (Features tagged "Class") → Lv 1–15 reward table ──
const claimsOf = (c: Character): Record<string, string> =>
  c.data.levelClaims && typeof c.data.levelClaims === 'object' ? (c.data.levelClaims as Record<string, string>) : {};

function ClassStep({
  character,
  patch,
}: {
  character: Character;
  patch: ReturnType<typeof useMutation<unknown, Error, { data?: Record<string, unknown>; step?: number }>>;
}) {
  const wiwonIds = wiwonIdsOf(character);
  const classValue = typeof character.data.class === 'string' ? (character.data.class as string) : '';
  const className = typeof character.data.className === 'string' ? (character.data.className as string) : classValue;
  const [info, setInfo] = useState<CatalogItem | null>(null);
  const fv = (it: CatalogItem, k: string) => (it.fields[k] != null ? String(it.fields[k]) : '');

  const { data: classes, isLoading } = useQuery({
    queryKey: ['class-options', wiwonIds.join(',')],
    queryFn: () => fetchFeaturesByTag('Class', wiwonIds),
    enabled: !classValue,
  });

  if (classValue) {
    return <LevelTable character={character} patch={patch} classValue={classValue} className={className} wiwonIds={wiwonIds} />;
  }

  const pick = (c: CatalogItem) => {
    const cv = fv(c, 'class') || c.name;
    patch.mutate({ data: { ...character.data, class: cv, classFeatureId: c.id, className: c.name } });
  };

  return (
    <div style={cardPlain}>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 26 }}>เลือกคลาสของคุณ</h1>
      <p style={{ color: '#8d8a82', fontSize: 13.5, margin: '8px 0 18px' }}>เลือกคลาส 1 อย่าง (แสดงเฉพาะ Feature แท็ก “Class” ใน Wiwon ที่เลือกไว้)</p>
      {isLoading && <div style={{ color: '#a8a59d', fontSize: 13, padding: 20, textAlign: 'center' }}>กำลังโหลด…</div>}
      {!isLoading && (classes?.length ?? 0) === 0 && (
        <div style={{ color: '#a8a59d', fontSize: 13.5, padding: '24px 16px', textAlign: 'center', background: '#faf9f7', borderRadius: 10 }}>
          ยังไม่มี Feature แท็ก “Class” ใน Wiwon ที่เลือก
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(classes ?? []).map((c) => (
          <div key={c.id} onClick={() => pick(c)} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '13px 15px', borderRadius: 12, border: '1.5px solid var(--border-soft)', background: '#fff' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: '#2f2c25' }}>{c.name}</div>
              <div style={{ fontSize: 12, color: '#9a978e', marginTop: 2 }}>{fv(c, 'class') ? `Class: ${fv(c, 'class')}` : 'คลาส'}</div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); setInfo(c); }} style={{ flex: 'none', border: '1px solid var(--border-soft)', background: '#fff', color: '#6b6860', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              ⓘ ดูข้อมูล
            </button>
          </div>
        ))}
      </div>
      <Modal open={!!info} onClose={() => setInfo(null)} title={info?.name ?? ''}>
        {info && (
          <div>
            {info.subtitle && <div style={{ fontSize: 12.5, color: '#8d8a82', marginBottom: 10 }}>{info.subtitle}</div>}
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

function LevelTable({
  character,
  patch,
  classValue,
  className,
  wiwonIds,
}: {
  character: Character;
  patch: ReturnType<typeof useMutation<unknown, Error, { data?: Record<string, unknown>; step?: number }>>;
  classValue: string;
  className: string;
  wiwonIds: string[];
}) {
  const { isDev } = useAuth();
  const qc = useQueryClient();
  const claims = claimsOf(character);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WizardLevel[]>([]);
  const [cancelTarget, setCancelTarget] = useState<number | null>(null);
  const [pendingLevel, setPendingLevel] = useState<number | null>(null);

  const { data: tplData } = useQuery({
    queryKey: ['class-levels', classValue],
    queryFn: () => api.get<{ template: ClassLevelTemplate }>(`/wizard/class-levels/${encodeURIComponent(classValue)}`),
  });
  const levels = tplData?.template.levels ?? [];

  const { data: pool } = useQuery({
    enabled: isDev,
    queryKey: ['feature-pool', wiwonIds.join(',')],
    queryFn: () => fetchFeaturesByTag('', wiwonIds),
  });

  const save = useMutation({
    mutationFn: () => api.put(`/wizard/class-levels/${encodeURIComponent(classValue)}`, { levels: draft }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['class-levels', classValue] });
      setEditing(false);
    },
  });

  const startEdit = () => {
    setDraft(levels.map((l) => ({ ...l, options: l.options.map((o) => ({ ...o })) })));
    setEditing(true);
  };
  const updateLevel = (lv: number, fn: (l: WizardLevel) => WizardLevel) =>
    setDraft((d) => d.map((l) => (l.lv === lv ? fn(l) : l)));
  const addOption = (lv: number) =>
    updateLevel(lv, (l) => ({ ...l, options: [...l.options, { id: crypto.randomUUID(), featureId: null, featureName: null, text: '' }] }));
  const removeOption = (lv: number, oid: string) => updateLevel(lv, (l) => ({ ...l, options: l.options.filter((o) => o.id !== oid) }));
  const setOption = (lv: number, oid: string, p: Partial<WizardLevelOption>) =>
    updateLevel(lv, (l) => ({ ...l, options: l.options.map((o) => (o.id === oid ? { ...o, ...p } : o)) }));

  const claim = (lv: number, optId: string) =>
    patch.mutate({ data: { ...character.data, levelClaims: { ...claims, [String(lv)]: optId } } });
  const doCancel = () => {
    if (cancelTarget == null) return;
    const next = { ...claims };
    delete next[String(cancelTarget)];
    patch.mutate({ data: { ...character.data, levelClaims: next } }, { onSuccess: () => setCancelTarget(null) });
  };

  // Changing LV: if lowering below a level that's already claimed, confirm first
  // — accepting wipes every claim in the table.
  const changeLevel = (n: number) => {
    const hasClaimAbove = Object.keys(claims).some((lv) => Number(lv) > n);
    if (hasClaimAbove) setPendingLevel(n);
    else patch.mutate({ data: { ...character.data, level: n } });
  };
  const confirmLevelDown = () => {
    if (pendingLevel == null) return;
    patch.mutate({ data: { ...character.data, level: pendingLevel, levelClaims: {} } }, { onSuccess: () => setPendingLevel(null) });
  };

  const view = editing ? draft : levels;
  const charLevel = Math.min(15, Math.max(1, Number(character.data.level) || 1));
  // Players only see levels up to their chosen character LV; dev edits all 15.
  const visibleLevels = editing ? view : view.filter((l) => l.lv <= charLevel);

  return (
    <div style={cardPlain}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 26 }}>คลาส: {className}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {isDev &&
            (editing ? (
              <>
                <Button variant="ghost" onClick={() => setEditing(false)}>ยกเลิก</Button>
                <Button variant="coral" disabled={save.isPending} onClick={() => save.mutate()}>บันทึกตาราง</Button>
              </>
            ) : (
              <Button variant="ghost" onClick={startEdit}>✎ แก้ไขตาราง</Button>
            ))}
          {!editing && (
            <Button variant="ghost" onClick={() => patch.mutate({ data: { ...character.data, class: '', classFeatureId: '', className: '' } })}>
              เปลี่ยนคลาส
            </Button>
          )}
        </div>
      </div>
      <p style={{ color: '#8d8a82', fontSize: 13, margin: '4px 0 18px' }}>
        ตารางเลเวล Lv 1–15 — {isDev && editing ? 'ผู้พัฒนากำหนดตัวเลือกที่ผู้เล่นจะได้รับต่อเลเวล' : 'กด “รับ” เพื่อเลือกของ 1 อย่างต่อเลเวล'}
      </p>

      <WeaponProficiency classValue={classValue} wiwonIds={wiwonIds} character={character} patch={patch} />

      <CoreAttributes classValue={classValue} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, paddingTop: 16, borderTop: '1px solid #efece6' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>เลเวลตัวละคร (LV)</span>
        <select
          value={charLevel}
          onChange={(e) => changeLevel(Number(e.target.value))}
          style={{ border: '1px solid #e0ded7', borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 700, background: '#fff' }}
        >
          {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>LV {n}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: '#a8a59d' }}>ตารางจะเปิดถึง Lv {charLevel}</span>
      </div>

      <div style={{ fontSize: 12.5, fontWeight: 700, margin: '16px 0 10px' }}>ตาราง Lv 1–{charLevel}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visibleLevels.map((level) => {
          const claimedOpt = claims[String(level.lv)];
          return (
            <div key={level.lv} style={{ display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 12, background: '#faf9f7', border: '1px solid #eae7e0' }}>
              <div style={{ flex: 'none', width: 44, height: 44, borderRadius: 10, background: '#15140f', color: '#f7dca0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                <span style={{ fontSize: 8, opacity: 0.7 }}>LV</span>
                {level.lv}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {editing ? (
                  <input value={level.note} onChange={(e) => updateLevel(level.lv, (l) => ({ ...l, note: e.target.value }))} placeholder="หมายเหตุของเลเวลนี้ (ไม่บังคับ)" style={{ width: '100%', border: '1px solid #e0ded7', borderRadius: 7, padding: '6px 9px', fontSize: 12.5, marginBottom: 8, background: '#fff' }} />
                ) : (
                  level.note && <div style={{ fontSize: 12.5, color: '#6b6860', marginBottom: 8 }}>{level.note}</div>
                )}

                {!editing && level.options.length === 0 && <div style={{ fontSize: 12.5, color: '#bdbab2' }}>—</div>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {level.options.map((o) => {
                    const claimedThis = claimedOpt === o.id;
                    const lockedOut = !!claimedOpt && !claimedThis; // another option already taken
                    if (editing) {
                      return (
                        <div key={o.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <select
                            value={o.featureId ?? ''}
                            onChange={(e) => {
                              const f = (pool ?? []).find((x) => x.id === e.target.value);
                              setOption(level.lv, o.id, { featureId: f ? f.id : null, featureName: f ? f.name : null });
                            }}
                            style={{ flex: '0 0 40%', border: '1px solid #e0ded7', borderRadius: 7, padding: '6px 8px', fontSize: 12, background: '#fff' }}
                          >
                            <option value="">— ไม่ลิงก์ Feature —</option>
                            {(pool ?? []).map((f) => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
                          <input value={o.text} onChange={(e) => setOption(level.lv, o.id, { text: e.target.value })} placeholder="ข้อความ เช่น +1 HP" style={{ flex: 1, border: '1px solid #e0ded7', borderRadius: 7, padding: '6px 9px', fontSize: 12, background: '#fff' }} />
                          <button onClick={() => removeOption(level.lv, o.id)} title="ลบตัวเลือก" style={{ flex: 'none', border: '1px solid #e6c4bc', background: '#fbf3f1', color: '#b4513a', borderRadius: 7, width: 30, height: 30, cursor: 'pointer' }}>×</button>
                        </div>
                      );
                    }
                    return (
                      <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, border: `1.5px solid ${claimedThis ? 'var(--coral)' : '#e8e5df'}`, background: claimedThis ? 'var(--coral-bg)' : '#fff', opacity: lockedOut ? 0.5 : 1 }}>
                        <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                          {o.featureName && <span style={{ fontWeight: 700, color: '#2f2c25' }}>{o.featureName}</span>}
                          {o.featureName && o.text && <span style={{ color: '#c9c6bf' }}> · </span>}
                          {o.text && <span style={{ color: '#5f5c54' }}>{o.text}</span>}
                          {!o.featureName && !o.text && <span style={{ color: '#bdbab2' }}>(ตัวเลือกว่าง)</span>}
                        </div>
                        {claimedThis ? (
                          <button onClick={() => setCancelTarget(level.lv)} style={{ flex: 'none', border: 'none', background: 'var(--coral)', color: '#fff', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>รับแล้ว ✓</button>
                        ) : lockedOut ? (
                          <button disabled style={{ flex: 'none', border: '1px solid #e8e5df', background: '#f4f2ee', color: '#b6b3aa', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'not-allowed' }}>ไม่ได้เลือก</button>
                        ) : (
                          <button onClick={() => claim(level.lv, o.id)} style={{ flex: 'none', border: '1px solid #d8d4cc', background: '#fff', color: '#46443c', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>กดรับ</button>
                        )}
                      </div>
                    );
                  })}
                  {editing && (
                    <button onClick={() => addOption(level.lv)} style={{ alignSelf: 'flex-start', border: '1px dashed #c3a184', background: 'rgba(255,255,255,.5)', color: '#a06a44', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ เพิ่มตัวเลือก</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={cancelTarget != null}
        onClose={() => setCancelTarget(null)}
        title="ยกเลิกการรับ"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>ไม่ยกเลิก</Button>
            <Button variant="danger" onClick={doCancel}>ตกลง ยกเลิก</Button>
          </>
        }
      >
        <p style={{ fontSize: 14, margin: 0 }}>คุณจะยกเลิกใช่ไหม — ของที่ได้จาก Lv {cancelTarget} จะหายไป</p>
      </Modal>

      <Modal
        open={pendingLevel != null}
        onClose={() => setPendingLevel(null)}
        title="ย้อนเลเวล"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingLevel(null)}>ไม่ย้อน</Button>
            <Button variant="danger" onClick={confirmLevelDown}>ตกลง ย้อนเลเวล</Button>
          </>
        }
      >
        <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0 }}>คุณแน่ใจแล้วใช่ไหมว่าจะ “ย้อนเลเวล” ของตนเอง — ทุกอย่างที่กดรับไว้ในตารางจะกลายเป็นไม่เคยรับมาก่อนทั้งหมด</p>
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
