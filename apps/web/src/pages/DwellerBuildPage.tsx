import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CatalogItem, Character, ClassLevelTemplate, WiwonCover, WizardLevel, WizardLevelOption } from '@wiwonanant/shared';
import { CATALOG_CONFIGS } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';
import { Button } from '../components/ui';
import { DiceRoller } from '../components/DiceRoller';
import layout from '../components/layout.module.css';
import { DWELLER_SKILLS, SKILL_ATTR_COLOR } from '../data/dwellerSkills';

const TOTAL_STEPS = 11;
// Only these เผ่าพันธุ์ (by Feature name) unlock the Ancestry sub-layer in Step 1.
const RACES_WITH_ANCESTRY = ['Animalea', 'Sprite'];
const raceHasAncestry = (name: string) => RACES_WITH_ANCESTRY.some((r) => r.toLowerCase() === name.trim().toLowerCase());
// Dragonkin Lineage additionally picks an element.
const DRAGONKIN_ELEMENTS = ['ธาตุไฟ', 'ธาตุสมุทร', 'ธาตุวายุ', 'ธาตุปฐพี'];
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
        <CharacterSheet character={character} covers={covers} patch={patch} />
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

// ── Character Sheet: read-only summary of everything built across the wizard ──
function sheetSkillDie(byAbbr: Record<string, string>, attr: string, hasTalent: boolean): string {
  const idx = Math.min(DIE_LADDER.length - 1, (GRADE_LADDER_IDX[byAbbr[attr] ?? ''] ?? 0) + (hasTalent ? 1 : 0));
  const faces = DIE_LADDER[idx];
  return faces === 0 ? '0' : `d${faces}`;
}

const WOUND_LEVELS = [
  { label: 'Have no impact', color: '#5aa06a' },
  { label: 'First Blood', color: '#e6a3a8' },
  { label: 'Impaired', color: '#dd8f96' },
  { label: 'Suppressed', color: '#c0555f' },
  { label: 'Desperate Edge', color: '#8f2f38' },
  { label: "Death's Door", color: '#3a1418' },
];
const SHEET_TABS = ['ช่องเก็บของ', 'Dweller Skill', 'Magic', 'Feature', 'ภูมิหลัง', 'จัดการสินทรัพย์', 'พิเศษ', 'บันทึกประจำวัน'];

function CharacterSheet({
  character,
  covers,
  patch,
}: {
  character: Character;
  covers: WiwonCover[];
  patch: ReturnType<typeof useMutation<unknown, Error, { data?: Record<string, unknown>; step?: number; status?: 'draft' | 'complete' }>>;
}) {
  const byAbbr = useEffectiveGrades(character);
  const wiwonIds = wiwonIdsOf(character);
  const d = character.data;
  const [tab, setTab] = useState('ช่องเก็บของ');

  const { data: features } = useQuery({ queryKey: ['sheet-features', wiwonIds.join(',')], queryFn: () => fetchFeaturesByTag('', wiwonIds) });
  const { data: magic } = useQuery({ queryKey: ['sheet-magic', wiwonIds.join(',')], queryFn: () => fetchMagicSpells(wiwonIds) });
  const featById = new Map((features ?? []).map((f) => [f.id, f]));
  const magicById = new Map((magic ?? []).map((m) => [m.id, m]));

  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const wiwonNames = wiwonIds.map((wid) => covers.find((c) => c.id === wid)?.name).filter(Boolean) as string[];
  const raceName = str('raceName');
  const ancestryName = str('ancestryName');
  const isAncestry = raceHasAncestry(raceName);
  const level = numData(d.level) || 1;

  // Sheet-only trackers persist under data.sheet.
  const sheet = d.sheet && typeof d.sheet === 'object' ? (d.sheet as Record<string, unknown>) : {};
  const sv = (k: string, def = 0) => (sheet[k] !== undefined ? numData(sheet[k]) : def);
  const svs = (k: string, def = '') => (typeof sheet[k] === 'string' ? (sheet[k] as string) : def);
  const setSheet = (partial: Record<string, unknown>) => patch.mutate({ data: { ...d, sheet: { ...sheet, ...partial } } });

  // Derived stats (mirror Step 10).
  const s10 = d.step10 && typeof d.step10 === 'object' ? (d.step10 as Record<string, number>) : {};
  const adj = d.step10adj && typeof d.step10adj === 'object' ? (d.step10adj as Record<string, number>) : {};
  const n = (k: string) => numData(s10[k]);
  const a = (k: string) => (isAncestry ? numData(adj[k]) : 0);
  const faces = (abbr: string) => facesOf(byAbbr, abbr);
  const scratchMax = n('baseScratch') + n('scratchRollEND') + a('scratch');
  const sanityMax = n('sanityBase') + faces('CVN') + n('sanityRollINT') + a('sanity');
  const natureDef = n('natureBase') + faces('DEX') + faces('PER') + a('natureDef');
  const movement = n('movement') + a('movement');
  const initiative = 10 + n('initRollDEX') + n('initRollCVN') + a('initiative');
  const willpowerMax = n('willpower') + a('willpower');

  // Ehen
  const ehenType = str('ehenType');
  const ehenSize = str('ehenSize');
  const ehenColor = str('ehenColor');
  const ehenLabel = ehenType === 'organ' ? 'Ehen Organ' : ehenType === 'core' ? 'Ehen Core' : ehenType === 'none' ? 'ไม่มีในร่างกาย' : '—';
  const sizeLabel = ehenSize === 'small' ? 'เล็ก' : ehenSize === 'medium' ? 'กลาง' : ehenSize === 'large' ? 'ใหญ่' : '';
  const ehenDie = ehenType === 'core' ? CORE_PRODUCTION_DIE[ehenSize] : ehenType === 'organ' ? (ORGAN_PRODUCTION_DIE[ehenSize] ? `${ORGAN_PRODUCTION_DIE[ehenSize]} / Long Rest` : '') : '';

  // Selections
  const magicIds = d.step8Magic && typeof d.step8Magic === 'object' ? Object.keys(d.step8Magic as Record<string, number>) : [];
  const featIds = d.step7Purchases && typeof d.step7Purchases === 'object' ? Object.keys(d.step7Purchases as Record<string, number>) : [];
  const s11 = d.step11 && typeof d.step11 === 'object' ? (d.step11 as { virtues?: string[]; flaws?: string[] }) : {};
  const virtues = (s11.virtues ?? []).map((id) => featById.get(id)?.name ?? '(?)');
  const flaws = (s11.flaws ?? []).map((id) => featById.get(id)?.name ?? '(?)');
  const prof: string[] = Array.isArray(d.skillProf) ? (d.skillProf as string[]) : [];
  const talent: string[] = Array.isArray(d.skillTalent) ? (d.skillTalent as string[]) : [];
  const skillNameByKey = new Map<string, string>();
  DWELLER_SKILLS.forEach((cat) => cat.skills.forEach((s) => skillNameByKey.set(skillKey(cat.en, s.en), s.name)));
  const profNames = prof.map((k) => skillNameByKey.get(k) ?? k);
  const languages = featIds.map((id) => featById.get(id)).filter((f): f is CatalogItem => !!f && f.tags.includes('Language')).map((f) => f.name);

  // Wallet
  const walletIC = numData(d.walletIC);
  const rb: RoyalBond[] = Array.isArray(d.walletRB) ? (d.walletRB as RoyalBond[]) : [];
  const rbTotalGC = rb.reduce((s, b) => s + numData(b.price), 0);
  const bag: BagLine[] = Array.isArray(d.bag) ? (d.bag as BagLine[]) : [];

  // Styles
  const box: React.CSSProperties = { border: '1px solid #eae7e0', borderRadius: 12, padding: 14, background: '#fff' };
  const secTitle: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.03em', color: '#6b6860' };
  const bluePill: React.CSSProperties = { background: '#dfeaf5', border: '1px solid #cbd9ea', borderRadius: 8, padding: '6px 10px', fontSize: 15, fontWeight: 800, color: '#2a5fbd', textAlign: 'center', minWidth: 44 };
  const plus = <span style={{ fontSize: 16, color: '#c9c5bd', fontWeight: 700 }}>+</span>;

  const woundLevel = sv('woundLevel', 0);
  const lastBreath = sv('lastBreath', 0);
  const LB_MAX = 10;

  const pooRow = (label: string, cur: number, max: number, temp: number, curKey: string, tempKey: string, recoverLabel: string, damageLabel: string) => (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={secTitle}>TEMP</div>
          <div style={{ ...bluePill, marginTop: 4 }}>
            <NumField value={temp} onCommit={(v) => setSheet({ [tempKey]: v })} width={44} />
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'baseline', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 11, color: '#9a978e' }}>ปัจจุบัน</span>
            <span style={{ fontSize: 26, fontWeight: 800, color: '#2f2c25' }}><NumField value={cur} onCommit={(v) => setSheet({ [curKey]: v })} width={54} /></span>
            <span style={{ fontSize: 20, color: '#cfccc4', fontWeight: 700 }}>/</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#8d8a82' }}>{max}</span>
            <span style={{ fontSize: 11, color: '#9a978e' }}>สูงสุด</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: '#9a978e' }}>
        <span>{label}</span>
        <span style={{ marginLeft: 'auto' }}>{recoverLabel}</span>
        <span>{damageLabel}</span>
      </div>
    </div>
  );

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <div style={{ minWidth: 1020, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ── Header (dark) ── */}
        <div style={{ background: '#15140f', borderRadius: 18, padding: '18px 22px', color: '#fff', display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 84, height: 84, borderRadius: 12, background: '#fff', flex: 'none' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 30, color: '#fff' }}>{character.name || 'ตัวละครใหม่'}</h1>
            <div style={{ fontSize: 12.5, color: '#c9c5bd', marginTop: 6 }}>เผ่าพันธุ์: {raceName || '—'}{ancestryName ? ` | ${ancestryName}` : ''}</div>
            <div style={{ fontSize: 12.5, color: '#c9c5bd', marginTop: 3 }}>Class Feature: {str('className') || '—'} | LV. {level}</div>
          </div>
          <div style={{ flex: 'none', textAlign: 'right', minWidth: 230 }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 600, color: '#fff' }}>CAMPAIGN: {svs('campaign', 'ชื่อแคมเปญ')}</div>
            <div style={{ fontSize: 12.5, color: '#c9c5bd', marginTop: 4 }}>Wiwon: {wiwonNames.join(', ') || '—'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <span style={{ fontSize: 11, color: '#c9c5bd', fontWeight: 700 }}>XP</span>
              <div style={{ width: 120, height: 8, borderRadius: 6, background: '#3a382f', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, (sv('xp', 0) / (level * 10000)) * 100)}%`, height: '100%', background: 'linear-gradient(90deg,#e79b86,#e07a5f)' }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#f7dca0', border: '1px solid #6a5a2a', borderRadius: 6, padding: '2px 7px' }}>LV UP</span>
            </div>
            <div style={{ fontSize: 11, color: '#a8a49a', marginTop: 4 }}>{sv('xp', 1000).toLocaleString()} / {(level * 10000).toLocaleString()} XP</div>
          </div>
        </div>

        {/* ── Attributes row + Blessings ── */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
            {CORE_ATTR_OPTIONS.map((attr) => {
              const abbr = attr.match(/\(([^)]+)\)/)?.[1] ?? attr;
              const name = attr.replace(/\s*\(.*\)/, '');
              const g = byAbbr[abbr] ?? '—';
              return (
                <div key={attr} style={{ position: 'relative', border: '1px solid #eae7e0', borderRadius: 12, padding: '10px 8px 12px', textAlign: 'center', background: '#fff' }}>
                  <span style={{ position: 'absolute', top: -10, left: 8, background: '#e07a5f', color: '#fff', fontSize: 12, fontWeight: 800, borderRadius: 7, padding: '3px 8px' }}>d{STEP10_FACES[g] ?? '?'}</span>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#8d8a82', textAlign: 'right' }}>{abbr}</div>
                  <div style={{ fontSize: 40, fontWeight: 800, color: '#3c3a33', lineHeight: 1.1, margin: '2px 0 6px' }}>{g}</div>
                  <div style={{ fontSize: 11, color: '#9a978e' }}>{name}</div>
                </div>
              );
            })}
          </div>
          <div style={{ flex: 'none', width: 210 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#8d8a82', textAlign: 'center', marginBottom: 6 }}>— ได้รับการอวยพร —</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ height: 34, borderRadius: 10, background: '#f6ecae', border: '1px solid #e6d485', display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 12.5, fontWeight: 700, color: '#7a6a2a' }}>{virtues[i] ?? ''}</div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Body: 3 columns ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '245px minmax(240px, 1fr) minmax(360px, 1.55fr)', gap: 12, alignItems: 'start' }}>
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pooRow('SANITY', sv('sanCur', sanityMax), sanityMax, sv('sanTemp', 0), 'sanCur', 'sanTemp', 'ฟื้นฟูสภาพจิต', 'เสียหายต่อจิตใจ')}
            <div style={{ ...box, padding: '10px 14px', fontSize: 12, color: '#9a978e' }}>สถานะค่าสติปัจจุบัน: <b style={{ color: '#3c3a33' }}>{svs('sanStatus', '—')}</b></div>
            {pooRow('SCRATCH POINT', sv('scratchCur', scratchMax), scratchMax, sv('scratchTemp', 0), 'scratchCur', 'scratchTemp', 'ฟื้นฟู', 'บาดเจ็บ')}
            <div style={box}>
              <div style={secTitle}>WOUNDS POINT</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                {WOUND_LEVELS.map((w, i) => (
                  <button key={w.label} onClick={() => setSheet({ woundLevel: i })} style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: woundLevel === i ? '#faf6ef' : 'transparent', borderRadius: 7, padding: '3px 6px', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: w.color, flex: 'none' }} />
                    <span style={{ fontSize: 12, fontWeight: woundLevel === i ? 800 : 500, color: woundLevel === i ? '#2f2c25' : '#8d8a82' }}>{w.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={box}>
              <div style={secTitle}>THE LAST BREATH</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5, margin: '8px 0 6px' }}>
                {Array.from({ length: LB_MAX }).map((_, i) => (
                  <button key={i} onClick={() => setSheet({ lastBreath: lastBreath === i + 1 ? i : i + 1 })} style={{ height: 20, borderRadius: 5, border: '1px solid #eecfcb', background: i < lastBreath ? '#e7a7a0' : '#fbeeec', cursor: 'pointer' }} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#a8a59d' }}><span>ฟื้นกลับมา</span><span>สิ้นใจ</span></div>
            </div>
          </div>

          {/* Middle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={box}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={secTitle}>สถานะเสริม (Buff)</span>{plus}</div>
              <div style={{ marginTop: 8 }}><GrowingAnswer value={svs('buff')} onCommit={(v) => setSheet({ buff: v })} /></div>
            </div>
            <div style={box}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={secTitle}>สถานะผิดปกติ (Debuff)</span>{plus}</div>
              <div style={{ marginTop: 8 }}><GrowingAnswer value={svs('debuff')} onCommit={(v) => setSheet({ debuff: v })} /></div>
            </div>
            <div style={box}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={secTitle}>ความชำนาญ / Proficiency</span>{plus}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {profNames.length === 0 ? <span style={{ fontSize: 12, color: '#bdbab2' }}>—</span> : profNames.map((nm, i) => <span key={i} style={{ fontSize: 11.5, padding: '3px 10px', borderRadius: 8, background: '#eef6f0', color: '#2f7d4f', border: '1px solid #cfe6d6' }}>{nm}</span>)}
              </div>
            </div>
            <div style={box}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={secTitle}>ภาษา / Language</span>{plus}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {languages.length === 0 ? <span style={{ fontSize: 12, color: '#bdbab2' }}>—</span> : languages.map((nm, i) => <span key={i} style={{ fontSize: 11.5, padding: '3px 10px', borderRadius: 8, background: '#f6f2ea', color: '#5c4a2e', border: '1px solid #e8e0d0' }}>{nm}</span>)}
              </div>
            </div>
          </div>

          {/* Right */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
              <div style={{ ...box, flex: '0 0 180px' }}>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 600, color: '#2f2c25', marginBottom: 8 }}>INITIATIVE ROLL</div>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div><div style={{ fontSize: 28, fontWeight: 800, color: '#2f2c25' }}>{natureDef}</div><div style={{ fontSize: 10.5, color: '#9a978e' }}>Natural Defense</div></div>
                  <div><div style={{ fontSize: 28, fontWeight: 800, color: '#2f2c25' }}>{movement}</div><div style={{ fontSize: 10.5, color: '#9a978e' }}>M. Movement</div></div>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: '#9a978e' }}>Initiative <b style={{ color: '#e07a5f', fontSize: 15 }}>{initiative}</b></div>
              </div>
              <div style={{ ...box, flex: 1 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {['Action', 'On Hand', 'Ehen', 'Short Rest', 'Long Rest'].map((t, i) => (
                    <span key={t} style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 16, background: i === 0 ? '#fdeee9' : '#f5f3ef', color: i === 0 ? '#c15a3f' : '#9a978e', border: `1px solid ${i === 0 ? '#f2cdbc' : '#eae7e0'}` }}>{t}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div>
                    <div style={secTitle}>WILL-POWER</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      {Array.from({ length: Math.max(1, willpowerMax) }).map((_, i) => (
                        <span key={i} style={{ width: 14, height: 22, borderRadius: 3, background: i < sv('wpCur', willpowerMax) ? '#7aa7c4' : '#dfeaf0' }} />
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: '#9a978e', marginTop: 4 }}>{sv('wpCur', willpowerMax)} / {willpowerMax}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#9a978e' }}>Cal. สะสม</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#c79a2e' }}>{sv('calStored', 0)}</div>
                    <div style={{ fontSize: 11, color: '#9a978e', marginTop: 4 }}>ดับหิว <b style={{ color: '#3c3a33' }}>{sv('calGoal', 0)}</b> Cal.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabbed area */}
            <div style={box}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, borderBottom: '1px solid #efece6', paddingBottom: 10 }}>
                {SHEET_TABS.map((t) => (
                  <button key={t} onClick={() => setTab(t)} style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 11px', borderRadius: 16, cursor: 'pointer', border: `1px solid ${tab === t ? '#e07a5f' : '#eae7e0'}`, background: tab === t ? '#fdeee9' : '#fff', color: tab === t ? '#c15a3f' : '#8d8a82' }}>{t}</button>
                ))}
              </div>

              {tab === 'ช่องเก็บของ' && (
                <div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: '#2f2c25', marginBottom: 6 }}>Ready Slot</div>
                      <div style={{ minHeight: 70, border: '1px dashed #e0ded7', borderRadius: 10, background: '#faf9f7' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: '#2f2c25', marginBottom: 6 }}>Party Slot</div>
                      <div style={{ minHeight: 70, border: '1px dashed #e0ded7', borderRadius: 10, background: '#faf9f7' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '14px 0 6px' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: '#2f2c25' }}>กระเป๋า</span>
                    <span style={{ fontSize: 11, color: '#9a978e' }}>ของทั้งหมด {bag.length} ชิ้น</span>
                  </div>
                  {bag.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: '#bdbab2', padding: '10px 0' }}>ยังไม่มีของในกระเป๋า</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {bag.map((l) => <span key={l.lineId} style={{ fontSize: 12, padding: '5px 11px', borderRadius: 9, background: '#f6f2ea', color: '#5c4a2e', border: '1px solid #e8e0d0' }}>{l.name}</span>)}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#c79a2e', background: '#faf6ef', border: '1px solid #eaddc7', borderRadius: 8, padding: '5px 11px' }}>💰 {coinStr(walletIC)}</span>
                    {rbTotalGC > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#5a6b86', background: '#eef2f8', border: '1px solid #d5deea', borderRadius: 8, padding: '5px 11px' }}>RB {rbTotalGC} GC</span>}
                  </div>
                </div>
              )}

              {tab === 'Dweller Skill' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '2px 18px' }}>
                  {DWELLER_SKILLS.flatMap((cat) => cat.skills.map((s) => {
                    const key = skillKey(cat.en, s.en);
                    const die = sheetSkillDie(byAbbr, s.attr, talent.includes(key));
                    return (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderBottom: '1px solid #f4f1ec' }}>
                        <span style={{ width: 22, height: 18, borderRadius: 5, background: SKILL_ATTR_COLOR[s.attr], color: '#fff', fontSize: 9.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{s.attr}</span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: '#3c3a33', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                        {prof.includes(key) && <span title="เชี่ยวชาญ" style={{ fontSize: 10, color: '#2f7d4f', fontWeight: 800 }}>▲</span>}
                        {talent.includes(key) && <span title="พรสวรรค์" style={{ fontSize: 10, color: '#5b3fa0', fontWeight: 800 }}>✦</span>}
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#6b6860', minWidth: 28, textAlign: 'right' }}>{die}</span>
                      </div>
                    );
                  }))}
                </div>
              )}

              {tab === 'Magic' && (
                <div>
                  {ehenType && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      <span style={{ fontSize: 12, padding: '4px 11px', borderRadius: 20, background: '#f6f2ea', color: '#5c4a2e', border: '1px solid #e8e0d0' }}>{ehenLabel}</span>
                      {sizeLabel && <span style={{ fontSize: 12, padding: '4px 11px', borderRadius: 20, background: '#f6f2ea', color: '#5c4a2e', border: '1px solid #e8e0d0' }}>ขนาด {sizeLabel}</span>}
                      {ehenColor && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 11px', borderRadius: 20, background: '#f6f2ea', color: '#5c4a2e', border: '1px solid #e8e0d0' }}><span style={{ width: 11, height: 11, borderRadius: '50%', background: EHEN_COLOR_HEX[ehenColor], border: '1px solid rgba(0,0,0,.15)' }} />{ehenColor}</span>}
                      {ehenDie && <span style={{ fontSize: 12, padding: '4px 11px', borderRadius: 20, background: '#fdece2', color: '#c1502a', border: '1px solid #f2cdbc' }}>ผลิต {ehenDie}</span>}
                    </div>
                  )}
                  {magicIds.length === 0 ? <div style={{ fontSize: 12.5, color: '#bdbab2' }}>ยังไม่รู้จักเวทมนตร์</div> : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{magicIds.map((id) => <span key={id} style={{ fontSize: 12, padding: '5px 11px', borderRadius: 9, background: '#f3eefb', color: '#5b3fa0', border: '1px solid #e2d7f4' }}>{magicById.get(id)?.name ?? '(เวทมนตร์)'}</span>)}</div>
                  )}
                </div>
              )}

              {tab === 'Feature' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#a8a59d', marginBottom: 6 }}>Feature ที่ได้รับ</div>
                    {featIds.length === 0 ? <span style={{ fontSize: 12.5, color: '#bdbab2' }}>—</span> : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{featIds.map((id) => <span key={id} style={{ fontSize: 12, padding: '5px 11px', borderRadius: 9, background: '#f6f2ea', color: '#5c4a2e', border: '1px solid #e8e0d0' }}>{featById.get(id)?.name ?? '(Feature)'}</span>)}</div>}
                  </div>
                  {virtues.length > 0 && <div><div style={{ fontSize: 11.5, fontWeight: 700, color: '#2f7d4f', marginBottom: 6 }}>Virtues</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{virtues.map((nm, i) => <span key={i} style={{ fontSize: 12, padding: '5px 11px', borderRadius: 9, background: '#eef6f0', color: '#2f7d4f', border: '1px solid #cfe6d6' }}>{nm}</span>)}</div></div>}
                  {flaws.length > 0 && <div><div style={{ fontSize: 11.5, fontWeight: 700, color: '#b0552f', marginBottom: 6 }}>Flaws</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{flaws.map((nm, i) => <span key={i} style={{ fontSize: 12, padding: '5px 11px', borderRadius: 9, background: '#f9eeea', color: '#b0552f', border: '1px solid #f0d8ce' }}>{nm}</span>)}</div></div>}
                </div>
              )}

              {tab === 'ภูมิหลัง' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13, lineHeight: 1.7, color: '#3c3a33' }}>
                  {(() => {
                    const a5 = d.step5Answers && typeof d.step5Answers === 'object' ? Object.values(d.step5Answers as Record<string, string>) : [];
                    const a6 = d.step6Answers && typeof d.step6Answers === 'object' ? Object.values(d.step6Answers as Record<string, string>) : [];
                    const all = [...a5, ...a6].filter(Boolean);
                    return all.length === 0 ? <span style={{ color: '#bdbab2' }}>ยังไม่มีเรื่องราวภูมิหลัง</span> : all.map((t, i) => <p key={i} style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{t}</p>);
                  })()}
                </div>
              )}

              {['จัดการสินทรัพย์', 'พิเศษ', 'บันทึกประจำวัน'].includes(tab) && (
                <div style={{ fontSize: 12.5, color: '#bdbab2', padding: '18px 0', textAlign: 'center' }}>ส่วน “{tab}” กำลังพัฒนา</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
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
  patch: ReturnType<typeof useMutation<unknown, Error, { data?: Record<string, unknown>; step?: number; status?: 'draft' | 'complete' }>>;
}) {
  const navigate = useNavigate();
  const step = character.step;
  const pct = Math.round((step / TOTAL_STEPS) * 100);
  const selectedNames = wiwonIdsOf(character)
    .map((wid) => covers.find((c) => c.id === wid)?.name)
    .filter(Boolean);

  const canNext = step === 1 ? !!character.data.race : step === 2 ? !!character.data.class : true;
  const isLast = step >= TOTAL_STEPS;
  const finish = () => patch.mutate({ status: 'complete' }, { onSuccess: () => navigate(`/dweller/sheet/${character.id}`) });

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#8d8a82' }}>Step {step}/{TOTAL_STEPS}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link to={`/dweller/sheet/${character.id}`} style={{ fontSize: 12, fontWeight: 700, color: '#e07a5f', textDecoration: 'none' }}>ดูชีต (พรีวิว) ↗</Link>
          <span style={{ fontSize: 12, color: '#a8a59d' }}>{pct}%</span>
        </div>
      </div>
      <div style={{ height: 8, borderRadius: 6, background: '#eae7e0', overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#e79b86,#e07a5f)', transition: 'width .3s' }} />
      </div>

      {step === 1 ? (
        <RaceStep character={character} patch={patch} />
      ) : step === 2 ? (
        <ClassStep character={character} patch={patch} />
      ) : step === 3 ? (
        <Step3Core character={character} patch={patch} />
      ) : step === 4 ? (
        <Step4Questions character={character} patch={patch} />
      ) : step === 5 ? (
        <WrittenStep character={character} patch={patch} kind="step5-questions" respKey="step5" answersKey="step5Answers" title="คำถามปลายเปิด" />
      ) : step === 6 ? (
        <WrittenStep character={character} patch={patch} kind="step6-questions" respKey="step6" answersKey="step6Answers" title="คำถามปลายเปิด (ชุดที่ 2)" />
      ) : step === 7 ? (
        <Step7Purchase character={character} patch={patch} />
      ) : step === 8 ? (
        <Step8Magic character={character} patch={patch} />
      ) : step === 9 ? (
        <Step9Money character={character} patch={patch} />
      ) : step === 10 ? (
        <Step10Details character={character} patch={patch} />
      ) : step === 11 ? (
        <Step11Traits character={character} patch={patch} />
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
        {isLast ? (
          <Button variant="coral" disabled={patch.isPending} onClick={finish}>
            เสร็จสิ้น · ดูชีต ✓
          </Button>
        ) : (
          <Button variant="coral" disabled={patch.isPending || !canNext} onClick={() => patch.mutate({ step: step + 1 })}>
            ถัดไป →
          </Button>
        )}
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
  const chosenRaceName = typeof character.data.raceName === 'string' ? (character.data.raceName as string) : '';
  const ancestryChosen = typeof character.data.ancestry === 'string' ? (character.data.ancestry as string) : '';
  const ancestryName = typeof character.data.ancestryName === 'string' ? (character.data.ancestryName as string) : '';
  const isDragonkin = !!ancestryChosen && ancestryName.trim().toLowerCase() === 'dragonkin lineage';
  const dragonElement = typeof character.data.dragonkinElement === 'string' ? (character.data.dragonkinElement as string) : '';
  // Ancestry layer only unlocks for certain races (Animalea / Sprite).
  const showAncestry = !!chosen && raceHasAncestry(chosenRaceName);
  const [info, setInfo] = useState<CatalogItem | null>(null);

  const { data: races, isLoading } = useQuery({
    queryKey: ['race-options', wiwonIds.join(',')],
    queryFn: () => fetchFeaturesByTag('Race', wiwonIds),
  });
  const { data: ancestries, isLoading: ancLoading } = useQuery({
    enabled: showAncestry,
    queryKey: ['ancestry-options', wiwonIds.join(',')],
    queryFn: () => fetchFeaturesByTag('Ancestry', wiwonIds),
  });
  // A race's Ancestry options are limited to the lineages the dev listed in its
  // "Feature เสริม (จากเผ่าพันธุ์)" — not every Ancestry-tagged Feature.
  const { data: raceGrant } = useQuery({
    enabled: showAncestry && !!chosen,
    queryKey: ['feature-grant', chosen],
    queryFn: () => api.get<{ grant: { features: { featureId: string }[] } }>(`/wizard/race-grant/${chosen}`),
  });
  const allowedAncestryIds = new Set((raceGrant?.grant.features ?? []).map((f) => f.featureId));
  const raceAncestries = (ancestries ?? []).filter((a) => allowedAncestryIds.has(a.id));

  const pickRace = (r: CatalogItem) => {
    const next: Record<string, unknown> = { ...character.data };
    if (chosen === r.id) {
      // Click the ticked race again to un-tick it.
      delete next.race;
      delete next.raceName;
      delete next.ancestry;
      delete next.ancestryName;
    } else {
      next.race = r.id;
      next.raceName = r.name;
      // Switching to a race without ancestry clears any stale ancestry pick.
      if (!raceHasAncestry(r.name)) {
        delete next.ancestry;
        delete next.ancestryName;
      }
    }
    patch.mutate({ data: next });
  };
  const pickAncestry = (a: CatalogItem) => {
    const next: Record<string, unknown> = { ...character.data };
    if (ancestryChosen === a.id) {
      delete next.ancestry;
      delete next.ancestryName;
    } else {
      next.ancestry = a.id;
      next.ancestryName = a.name;
    }
    patch.mutate({ data: next });
  };

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

      {/* Every race gets its own Feature เสริม (Merits/Demerits) + Core Attribute. */}
      {chosen && (
        <FeatureGrants
          refId={chosen}
          wiwonIds={wiwonIds}
          poolTags={showAncestry ? ['Merits', 'Demerits', 'Ancestry'] : ['Merits', 'Demerits']}
          title="Feature เสริม (จากเผ่าพันธุ์)"
        />
      )}

      {/* Races with an Ancestry take their Core Attribute from the Ancestry instead. */}
      {chosen && !showAncestry && (
        <div style={{ ...cardPlain, marginTop: 16 }}>
          <CoreAttributes path="race-core" refId={chosen} title="Core Attribute (จากเผ่าพันธุ์)" />
        </div>
      )}

      {showAncestry && (
        <div style={{ marginTop: 16 }}>
          <FeaturePicker
            title="เลือก Ancestry (สายเลือด)"
            hint={`เลือกสายเลือดของเผ่า ${chosenRaceName} 1 อย่าง (มาจาก Feature เสริมของเผ่า)`}
            items={raceAncestries}
            isLoading={ancLoading}
            emptyText="เผ่านี้ยังไม่ได้กำหนดสายเลือด — ผู้พัฒนาเพิ่มสายเลือด (Feature Ancestry) ในช่อง “Feature เสริม (จากเผ่าพันธุ์)” ด้านบน"
            chosenId={ancestryChosen}
            onPick={pickAncestry}
            onInfo={setInfo}
          />
        </div>
      )}

      {showAncestry && isDragonkin && (
        <div style={{ ...cardPlain, marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>เลือกธาตุของ Dragonkin</div>
          <div style={{ fontSize: 12, color: '#a8a59d', marginBottom: 10 }}>เลือกธาตุ 1 อย่าง</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {DRAGONKIN_ELEMENTS.map((el) => {
              const on = dragonElement === el;
              return (
                <button
                  key={el}
                  onClick={() => patch.mutate({ data: { ...character.data, dragonkinElement: on ? '' : el } })}
                  title={on ? 'กดอีกครั้งเพื่อเอาออก' : undefined}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: `1.5px solid ${on ? 'var(--coral)' : 'var(--border-soft)'}`, background: on ? 'var(--coral-bg)' : '#fff', color: on ? 'var(--coral-ink)' : 'var(--text-muted)' }}
                >
                  <span style={{ width: 18, height: 18, borderRadius: '50%', flex: 'none', border: `2px solid ${on ? 'var(--coral)' : '#cbc8c0'}`, background: on ? 'var(--coral)' : '#fff', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                    {on ? '✓' : ''}
                  </span>
                  {el}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showAncestry && ancestryChosen && (
        <FeatureGrants refId={ancestryChosen} wiwonIds={wiwonIds} poolTags={['Flaws']} title="Feature เสริม (จาก Ancestry)" />
      )}

      {showAncestry && ancestryChosen && (
        <div style={{ ...cardPlain, marginTop: 16 }}>
          <CoreAttributes path="ancestry-core" refId={ancestryChosen} title="Core Attribute (จาก Ancestry)" />
        </div>
      )}

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
              title={on ? 'กดอีกครั้งเพื่อเอาติ๊กออก' : undefined}
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
function FeatureGrants({ refId, wiwonIds, poolTags, title }: { refId: string; wiwonIds: string[]; poolTags: string[]; title: string }) {
  const { isDev } = useAuth();
  const qc = useQueryClient();
  const [addId, setAddId] = useState('');

  const { data } = useQuery({
    queryKey: ['feature-grant', refId],
    queryFn: () => api.get<{ grant: { features: RaceGrant[] } }>(`/wizard/race-grant/${refId}`),
  });
  const features = data?.grant.features ?? [];

  // Only Features carrying one of the allowed tags may be granted here.
  const { data: allFeatures } = useQuery({
    enabled: isDev,
    queryKey: ['feature-pool', wiwonIds.join(',')],
    queryFn: () => fetchFeaturesByTag('', wiwonIds),
  });
  const pool = (allFeatures ?? []).filter((f) => f.tags.some((t) => poolTags.includes(t)));

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
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: '#a8a59d', marginBottom: 10 }}>
        {isDev ? 'ผู้พัฒนากำหนดได้ — ผู้เล่นจะได้รับทั้งหมดนี้อัตโนมัติ' : 'คุณจะได้รับ Feature เหล่านี้อัตโนมัติ'}
      </div>

      {features.length === 0 && (
        <div style={{ fontSize: 12.5, color: '#bdbab2', padding: '10px 0' }}>{isDev ? 'ยังไม่มี — เพิ่มด้านล่าง' : 'ยังไม่มี Feature เสริม'}</div>
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
            <option value="">— เลือก Feature (แท็ก {poolTags.join(' / ')}) เพื่อเพิ่ม —</option>
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
const LIFESTYLE_TAGS = ['Specialization', 'Social', 'Local Knowledge', 'Life lesson'];
const GRANT_HEADING: Record<string, string> = {
  weapon: 'เลือกอาวุธที่เชี่ยวชาญเพิ่ม (ที่ยังไม่เคยเลือก)',
  language: 'เลือกภาษาที่เรียนรู้เพิ่ม (ที่ยังไม่เคยเลือก)',
  lifestyle: 'เลือกวิถีชีวิตเพิ่ม (ที่ยังไม่เคยเลือก)',
};
const GRANT_BADGE: Record<string, string> = { weapon: '⚔ +อาวุธ', language: '🗣 +ภาษา', lifestyle: '🌿 +วิถีชีวิต' };
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
// Grade scale, low → high. Index is the numeric value (X=0 … A=4).
const GRADE_ORDER = ['X', 'D', 'C', 'B', 'A'] as const;
type Grade = (typeof GRADE_ORDER)[number];
const gval = (g: string): number => GRADE_ORDER.indexOf(g as Grade);
const gname = (v: number): Grade => GRADE_ORDER[Math.max(0, Math.min(4, v))];
const isGrade = (g: string | undefined): g is Grade => !!g && g in GRADE_COLOR;
// Combine the primary grade (เผ่าพันธุ์ = race, or its Ancestry) with Class (the decider):
//   • primary is X → always X            • Class lower → keep primary
//   • Class higher → use Class           • Class equal → bump primary up 1 (cap A)
//   • primary undefined → the value becomes D (all leftovers are D)
function combineGrade(base: string | undefined, cls: string | undefined): Grade {
  if (!isGrade(base)) return 'D';
  if (base === 'X') return 'X';
  if (!isGrade(cls)) return base;
  const vb = gval(base);
  const vc = gval(cls);
  if (vc < vb) return base;
  if (vc > vb) return cls;
  return gname(vb + 1);
}
const CORE_ATTR_OPTIONS = [
  'Strength (STR)',
  'Dexterity (DEX)',
  'Endurance (END)',
  'Perception (PER)',
  'Intelligence (INT)',
  'Authority (AUT)',
  'Conviction (CVN)',
];
function CoreAttributes({ path, refId, title }: { path: string; refId: string; title: string }) {
  const { isDev } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: [path, refId],
    queryFn: () => api.get<{ core: { attributes: CoreAttr[] } }>(`/wizard/${path}/${encodeURIComponent(refId)}`),
  });
  const attrs = data?.core.attributes ?? [];
  const save = useMutation({
    mutationFn: (next: CoreAttr[]) => api.put(`/wizard/${path}/${encodeURIComponent(refId)}`, { attributes: next }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [path, refId] }),
  });
  const update = (id: string, p: Partial<CoreAttr>) => save.mutate(attrs.map((a) => (a.id === id ? { ...a, ...p } : a)));
  const add = () => save.mutate([...attrs, { id: crypto.randomUUID(), name: '', grade: 'C' }]);
  const remove = (id: string) => save.mutate(attrs.filter((a) => a.id !== id));

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: '#a8a59d', marginBottom: 10 }}>
        {isDev ? 'ผู้พัฒนากำหนดชื่อ + เกรด A/B/C/D/X — ผู้เล่นรับมาเลย (แก้ไม่ได้)' : 'ค่าหลักที่คุณได้รับ'}
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

// ── Step 3: the character's actual Core Attributes — every STR…CVN, showing the
//    grade contributed by Step 1 (Ancestry) and Step 2 (Class). ────────────────
function GradeBadge({ grade }: { grade: string }) {
  const known = grade in GRADE_COLOR;
  return (
    <span style={{ width: 26, height: 26, borderRadius: 7, flex: 'none', background: known ? GRADE_COLOR[grade] : '#ece9e3', color: known ? '#fff' : '#bdbab2', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{grade}</span>
  );
}
const RIGHTS_TOTAL = 3;
const coreAdjustOf = (c: Character): Record<string, number> =>
  c.data.coreAdjust && typeof c.data.coreAdjust === 'object' ? (c.data.coreAdjust as Record<string, number>) : {};
const coreBoostOf = (c: Character): string[] =>
  Array.isArray(c.data.coreBoostA) ? (c.data.coreBoostA as string[]) : [];

// Final Core Attribute grade per abbreviation (STR/DEX/…), applying the Step 3
// combine formula plus the player's manual ±1 adjustments and A-boosts. Shared
// by Step 3 (skills dice) and Step 10 (derived stats).
function useEffectiveGrades(character: Character): Record<string, string> {
  const raceId = typeof character.data.race === 'string' ? (character.data.race as string) : '';
  const raceName = typeof character.data.raceName === 'string' ? (character.data.raceName as string) : '';
  const ancestryId = typeof character.data.ancestry === 'string' ? (character.data.ancestry as string) : '';
  const classValue = typeof character.data.class === 'string' ? (character.data.class as string) : '';
  const isAncestryRace = !!raceId && raceHasAncestry(raceName);

  const { data: aData } = useQuery({
    enabled: !!raceId && !isAncestryRace,
    queryKey: ['race-core', raceId],
    queryFn: () => api.get<{ core: { attributes: CoreAttr[] } }>(`/wizard/race-core/${encodeURIComponent(raceId)}`),
  });
  const { data: bData } = useQuery({
    enabled: !!ancestryId,
    queryKey: ['ancestry-core', ancestryId],
    queryFn: () => api.get<{ core: { attributes: CoreAttr[] } }>(`/wizard/ancestry-core/${encodeURIComponent(ancestryId)}`),
  });
  const { data: cData } = useQuery({
    enabled: !!classValue,
    queryKey: ['class-core', classValue],
    queryFn: () => api.get<{ core: { attributes: CoreAttr[] } }>(`/wizard/class-core/${encodeURIComponent(classValue)}`),
  });

  const gradeOf = (attrs: CoreAttr[] | undefined, name: string) => attrs?.find((a) => a.name === name)?.grade ?? '—';
  const baseAttrs = isAncestryRace ? bData?.core.attributes : aData?.core.attributes;
  const adjust = coreAdjustOf(character);
  const boosts = coreBoostOf(character);
  const byAbbr: Record<string, string> = {};
  CORE_ATTR_OPTIONS.forEach((attr) => {
    const abbr = attr.match(/\(([^)]+)\)/)?.[1] ?? attr;
    const combined = combineGrade(gradeOf(baseAttrs, attr), gradeOf(cData?.core.attributes, attr));
    byAbbr[abbr] = boosts.includes(attr) ? 'A' : gname(Math.max(0, Math.min(4, gval(combined) + (adjust[attr] ?? 0))));
  });
  return byAbbr;
}

function Step3Core({
  character,
  patch,
}: {
  character: Character;
  patch: ReturnType<typeof useMutation<unknown, Error, { data?: Record<string, unknown>; step?: number }>>;
}) {
  const raceId = typeof character.data.race === 'string' ? (character.data.race as string) : '';
  const raceName = typeof character.data.raceName === 'string' ? (character.data.raceName as string) : '';
  const ancestryId = typeof character.data.ancestry === 'string' ? (character.data.ancestry as string) : '';
  const classValue = typeof character.data.class === 'string' ? (character.data.class as string) : '';
  // Ancestry races take core from the Ancestry, so skip their race-core column.
  const isAncestryRace = !!raceId && raceHasAncestry(raceName);
  const useRaceCore = !!raceId && !isAncestryRace;

  const { data: aData } = useQuery({
    enabled: useRaceCore,
    queryKey: ['race-core', raceId],
    queryFn: () => api.get<{ core: { attributes: CoreAttr[] } }>(`/wizard/race-core/${encodeURIComponent(raceId)}`),
  });
  const { data: bData } = useQuery({
    enabled: !!ancestryId,
    queryKey: ['ancestry-core', ancestryId],
    queryFn: () => api.get<{ core: { attributes: CoreAttr[] } }>(`/wizard/ancestry-core/${encodeURIComponent(ancestryId)}`),
  });
  const { data: cData } = useQuery({
    enabled: !!classValue,
    queryKey: ['class-core', classValue],
    queryFn: () => api.get<{ core: { attributes: CoreAttr[] } }>(`/wizard/class-core/${encodeURIComponent(classValue)}`),
  });
  const gradeOf = (attrs: CoreAttr[] | undefined, name: string) => attrs?.find((a) => a.name === name)?.grade ?? '—';

  // The primary ("ค่าหลัก") comes from the Ancestry for Ancestry races, otherwise the Race.
  const baseAttrs = isAncestryRace ? bData?.core.attributes : aData?.core.attributes;
  const baseGrade = (attr: string) => gradeOf(baseAttrs, attr);
  const classGrade = (attr: string) => gradeOf(cData?.core.attributes, attr);
  const combinedOf = (attr: string) => combineGrade(gradeOf(baseAttrs, attr), classGrade(attr));

  const adjust = coreAdjustOf(character);
  const boosts = coreBoostOf(character);

  // Resolve one attribute under a given (adjust, boosts) state. `step` is the
  // real level movement vs. the computed grade (clamped; 0 when X-locked/boosted),
  // which is what the rights economy charges/refunds — never the raw stored delta.
  const resolve = (attr: string, adj: Record<string, number>, bst: string[]) => {
    const combined = combinedOf(attr);
    const lockedX = combined === 'X';
    const boosted = bst.includes(attr);
    const cv = gval(combined);
    const effVal = lockedX ? 0 : boosted ? 4 : Math.max(0, Math.min(4, cv + (adj[attr] ?? 0)));
    const step = lockedX || boosted ? 0 : effVal - cv;
    return { combined, lockedX, boosted, effVal, eff: gname(effVal), step };
  };
  // "Sacrifices": attributes the player pushed all the way down to X. Each one
  // unlocks a free "set another attribute to A".
  const sacrificeCount = (adj: Record<string, number>, bst: string[]) =>
    CORE_ATTR_OPTIONS.reduce((n, attr) => {
      const r = resolve(attr, adj, bst);
      return !r.lockedX && !r.boosted && r.effVal === 0 ? n + 1 : n;
    }, 0);
  // Drop boosts that are no longer paid for by a sacrifice.
  const trimBoosts = (adj: Record<string, number>, bst: string[]) => bst.slice(0, sacrificeCount(adj, bst));

  const steps = CORE_ATTR_OPTIONS.map((attr) => resolve(attr, adjust, boosts).step);
  const totalUp = steps.reduce((s, d) => s + Math.max(0, d), 0);
  const totalDown = steps.reduce((s, d) => s + Math.max(0, -d), 0);
  const rights = RIGHTS_TOTAL - totalUp + totalDown;
  const boostsAvailable = sacrificeCount(adjust, boosts) - boosts.length;
  const touched = Object.keys(adjust).length > 0 || boosts.length > 0;

  // Final grade per attribute abbreviation (STR/DEX/…) — feeds the skill dice.
  const effByAbbr: Record<string, string> = {};
  CORE_ATTR_OPTIONS.forEach((attr) => {
    const abbr = attr.match(/\(([^)]+)\)/)?.[1] ?? attr;
    effByAbbr[abbr] = resolve(attr, adjust, boosts).eff;
  });

  const commit = (nextAdjust: Record<string, number>, nextBoost: string[]) =>
    patch.mutate({ data: { ...character.data, coreAdjust: nextAdjust, coreBoostA: nextBoost } });
  const bump = (attr: string, dir: 1 | -1) => {
    const nextAdjust = { ...adjust, [attr]: (adjust[attr] ?? 0) + dir };
    if (nextAdjust[attr] === 0) delete nextAdjust[attr];
    commit(nextAdjust, trimBoosts(nextAdjust, boosts));
  };
  const toggleBoost = (attr: string) => {
    if (boosts.includes(attr)) {
      commit(adjust, boosts.filter((a) => a !== attr));
      return;
    }
    // Boosting to A supersedes any manual delta on that attribute; clear it.
    const nextAdjust = { ...adjust };
    delete nextAdjust[attr];
    commit(nextAdjust, [...boosts, attr]);
  };
  const reset = () => commit({}, []);

  const headStyle: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: '#a8a59d', textAlign: 'center', paddingBottom: 6 };
  const cellStyle: React.CSSProperties = { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '8px 0', borderTop: '1px solid #efece6' };
  const stepBtn = (enabled: boolean): React.CSSProperties => ({
    width: 26, height: 26, borderRadius: 7, border: '1px solid #e0ded7', background: enabled ? '#fff' : '#f5f3ef',
    color: enabled ? '#6b6860' : '#cfccc4', fontSize: 16, fontWeight: 800, lineHeight: 1,
    cursor: enabled ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
  });

  return (
    <>
    <div style={cardPlain}>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 26 }}>Core Attribute ของตัวละคร</h1>
      <p style={{ color: '#8d8a82', fontSize: 13.5, margin: '8px 0 16px' }}>
        รวมเกรดจากเผ่าพันธุ์ (ค่าหลัก) กับ Class (ตัวตัดสิน) — จากนั้นปรับได้เองด้วยสิทธิ์ที่มี
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <span style={{
          fontSize: 12.5, fontWeight: 800, padding: '7px 14px', borderRadius: 20,
          background: rights > 0 ? '#eef6f0' : '#f9eeea', color: rights > 0 ? '#2f7d4f' : '#b0552f',
          border: `1px solid ${rights > 0 ? '#cfe6d6' : '#f0d8ce'}`,
        }}>
          สิทธิ์ปรับค่าคงเหลือ: {rights}
        </span>
        {boostsAvailable > 0 && (
          <span style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 20, background: '#f3eefb', color: '#5b3fa0', border: '1px solid #e2d7f4' }}>
            ★ ตั้งค่าเป็น A ได้อีก {boostsAvailable}
          </span>
        )}
        {touched && (
          <button onClick={reset} disabled={patch.isPending} style={{ marginLeft: 'auto', border: '1px solid #e0ded7', background: '#fff', color: '#8d6a4a', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            ↺ รีเซ็ตการปรับค่า
          </button>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,1fr) auto auto auto minmax(132px,auto)', gap: '0 16px', alignItems: 'center', minWidth: 500 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#a8a59d', paddingBottom: 6 }}>ATTRIBUTE</div>
          <div style={headStyle}>เผ่าพันธุ์</div>
          <div style={headStyle}>Class</div>
          <div style={headStyle}>ผลรวม</div>
          <div style={{ ...headStyle, textAlign: 'right' }}>สุดท้าย</div>
          {CORE_ATTR_OPTIONS.map((attr) => {
            const { lockedX, boosted, effVal, eff, step: delta } = resolve(attr, adjust, boosts);
            const isSacrifice = !lockedX && !boosted && effVal === 0;
            const canUp = !lockedX && !boosted && effVal < 4 && rights >= 1;
            const canDown = !lockedX && !boosted && effVal > 0;
            const canBoost = boostsAvailable > 0 && !lockedX && !boosted && !isSacrifice && effVal < 4;
            return (
              <div key={attr} style={{ display: 'contents' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#3c3a33', padding: '10px 0', borderTop: '1px solid #efece6' }}>{attr}</div>
                <div style={cellStyle}><GradeBadge grade={baseGrade(attr)} /></div>
                <div style={cellStyle}><GradeBadge grade={classGrade(attr)} /></div>
                <div style={cellStyle}><span style={{ color: '#cfccc4', fontSize: 14 }}>→</span></div>
                <div style={{ ...cellStyle, justifyContent: 'flex-end', gap: 6 }}>
                  {boosted ? (
                    <>
                      <GradeBadge grade={eff} />
                      <button onClick={() => toggleBoost(attr)} title="ยกเลิกการตั้งเป็น A" style={{ ...stepBtn(true), width: 'auto', padding: '0 8px', fontSize: 11, fontWeight: 700 }}>✕A</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => bump(attr, -1)} disabled={!canDown} style={stepBtn(canDown)} title="ลดลง 1 ขั้น (ได้สิทธิ์คืน +1)">−</button>
                      <div title={lockedX ? 'ค่านี้เป็น X — เปลี่ยนไม่ได้' : delta !== 0 ? `ปรับ ${delta > 0 ? '+' : ''}${delta}` : undefined}>
                        <GradeBadge grade={eff} />
                      </div>
                      <button onClick={() => bump(attr, 1)} disabled={!canUp} style={stepBtn(canUp)} title="เพิ่ม 1 ขั้น (ใช้สิทธิ์ 1)">+</button>
                      {canBoost && (
                        <button onClick={() => toggleBoost(attr)} title="ตั้งเป็น A (จากการปรับค่าลงถึง X)" style={{ ...stepBtn(true), width: 'auto', padding: '0 8px', fontSize: 11, fontWeight: 800, color: '#5b3fa0', borderColor: '#e2d7f4' }}>★A</button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ul style={{ fontSize: 12, color: '#a8a59d', lineHeight: 1.9, margin: '16px 0 0', paddingLeft: 18 }}>
        <li>มีสิทธิ์ปรับค่า {RIGHTS_TOTAL} ครั้ง — เพิ่ม 1 ขั้นใช้ 1 สิทธิ์ (ลง A ไม่ได้), ลด 1 ขั้นได้สิทธิ์คืน +1</li>
        <li>ค่าที่เป็น X จากการคำนวณ เปลี่ยนไม่ได้ — แต่ถ้าปรับค่าใดลงจนถึง X เอง จะตั้งค่าอื่นให้เป็น A ได้ 1 ค่า</li>
        <li>“—” = เผ่า/สายเลือด/คลาสไม่ได้กำหนดค่านี้ (ค่าที่เหลือหลังคำนวณจะกลายเป็น D)</li>
      </ul>
    </div>

    <div style={{ ...cardPlain, marginTop: 16 }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 22 }}>Dweller Skill</h2>
      <p style={{ color: '#8d8a82', fontSize: 13.5, margin: '8px 0 16px' }}>
        ลูกเต๋าประจำสกิลอ้างอิงเกรดสุดท้ายของ Core Attribute ที่สกิลนั้นใช้ — <b>กดที่ลูกเต๋า</b> เพื่อเปิดหน้าทอย · ชี้ที่ชื่อสกิลเพื่อดูคำอธิบาย
      </p>
      <SkillsTable effByAbbr={effByAbbr} character={character} patch={patch} />
    </div>
    </>
  );
}

// Skill reference table (inside Step 3): rows grouped by category, each showing
// its governing Core Attribute and the die it rolls (from the character's final
// grade for that attribute). Hover a skill name to reveal its description.
// Die ladder (faces). 0 = the X "die" (rolls d2 but counts as 0). พรสวรรค์
// (talent) bumps a skill one rung up this ladder.
const DIE_LADDER = [0, 2, 4, 6, 8, 10, 12, 20];
const GRADE_LADDER_IDX: Record<string, number> = { X: 0, D: 1, C: 2, B: 3, A: 4 };
const PROF_MAX = 6; // เชี่ยวชาญ → Advantage on the roll
const TALENT_MAX = 2; // พรสวรรค์ → upgrade the die one step
const skillKey = (catEn: string, en: string) => `${catEn}:${en}`;

function SkillsTable({
  effByAbbr,
  character,
  patch,
}: {
  effByAbbr: Record<string, string>;
  character: Character;
  patch: ReturnType<typeof useMutation<unknown, Error, { data?: Record<string, unknown>; step?: number }>>;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [roll, setRoll] = useState<{ faces: number; adv: boolean } | null>(null);

  const prof = Array.isArray(character.data.skillProf) ? (character.data.skillProf as string[]) : [];
  const talent = Array.isArray(character.data.skillTalent) ? (character.data.skillTalent as string[]) : [];
  const commit = (nextProf: string[], nextTalent: string[]) =>
    patch.mutate({ data: { ...character.data, skillProf: nextProf, skillTalent: nextTalent } });
  const toggleProf = (key: string) => {
    if (prof.includes(key)) commit(prof.filter((k) => k !== key), talent);
    else if (prof.length < PROF_MAX) commit([...prof, key], talent);
  };
  const toggleTalent = (key: string) => {
    if (talent.includes(key)) commit(prof, talent.filter((k) => k !== key));
    else if (talent.length < TALENT_MAX) commit(prof, [...talent, key]);
  };
  const reset = () => commit([], []);

  const rowCell: React.CSSProperties = { padding: '9px 0', borderTop: '1px solid #efece6', display: 'flex', alignItems: 'center' };
  const tag = (active: boolean, activeBg: string): React.CSSProperties => ({
    width: 26, height: 24, borderRadius: 7, flex: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: `1px solid ${active ? activeBg : '#e0ded7'}`, background: active ? activeBg : '#fff', color: active ? '#fff' : '#b0ada4',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, padding: '7px 13px', borderRadius: 20, background: '#eef6f0', color: '#2f7d4f', border: '1px solid #cfe6d6' }}>
          ▲ เชี่ยวชาญ: {PROF_MAX - prof.length}/{PROF_MAX}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 800, padding: '7px 13px', borderRadius: 20, background: '#f3eefb', color: '#5b3fa0', border: '1px solid #e2d7f4' }}>
          ✦ พรสวรรค์: {TALENT_MAX - talent.length}/{TALENT_MAX}
        </span>
        {(prof.length > 0 || talent.length > 0) && (
          <button onClick={reset} disabled={patch.isPending} style={{ marginLeft: 'auto', border: '1px solid #e0ded7', background: '#fff', color: '#8d6a4a', borderRadius: 8, padding: '7px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            ↺ รีเซ็ตสกิล
          </button>
        )}
      </div>
      <p style={{ fontSize: 12, color: '#a8a59d', margin: '-8px 0 0', lineHeight: 1.7 }}>
        <b style={{ color: '#2f7d4f' }}>▲ เชี่ยวชาญ</b> = ทอยแบบ Advantage · <b style={{ color: '#5b3fa0' }}>✦ พรสวรรค์</b> = อัพเกรดลูกเต๋า +1 ขั้น · ใส่ทั้งสองในสกิลเดียวกันได้
      </p>

      {DWELLER_SKILLS.map((cat) => (
        <section key={cat.en}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: '#2f2c25' }}>{cat.name}</h3>
            <span style={{ fontSize: 12, color: '#a8a59d', fontStyle: 'italic' }}>{cat.en}</span>
          </div>
          <p style={{ fontSize: 12, color: '#9a978e', lineHeight: 1.6, margin: '4px 0 0' }}>{cat.desc}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', columnGap: 12, marginTop: 8 }}>
            {cat.skills.map((s) => {
              const id = skillKey(cat.en, s.en);
              const on = hover === id;
              const grade = effByAbbr[s.attr] ?? '—';
              const hasProf = prof.includes(id);
              const hasTalent = talent.includes(id);
              const baseIdx = GRADE_LADDER_IDX[grade] ?? 0;
              const idx = Math.min(DIE_LADDER.length - 1, baseIdx + (hasTalent ? 1 : 0));
              const faces = DIE_LADDER[idx];
              const die = faces === 0 ? '0' : `d${faces}`;
              const rollFaces = faces === 0 ? 2 : faces;
              const dieColor = grade in GRADE_COLOR ? GRADE_COLOR[grade] : '#ece9e3';
              return (
                <div key={id} style={{ display: 'contents' }}>
                  <div style={{ ...rowCell, justifyContent: 'center' }}>
                    <span style={{ width: 26, height: 22, borderRadius: 6, background: SKILL_ATTR_COLOR[s.attr], color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.attr}</span>
                  </div>
                  <div
                    style={{ ...rowCell, position: 'relative', cursor: 'help', gap: 8, minWidth: 0 }}
                    onMouseEnter={() => setHover(id)}
                    onMouseLeave={() => setHover((h) => (h === id ? null : h))}
                    onClick={() => setHover((h) => (h === id ? null : id))}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: on ? '#e07a5f' : '#2f2c25', whiteSpace: 'nowrap' }}>{s.name}</span>
                    <span style={{ fontSize: 11.5, color: '#b0ada4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.en}</span>
                    {on && (
                      <div style={{
                        position: 'absolute', top: 'calc(100% - 2px)', left: 0, zIndex: 30,
                        width: 320, maxWidth: '82vw', background: '#2f2c25', color: '#f3f1ec',
                        padding: '10px 13px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.65,
                        boxShadow: '0 10px 26px rgba(0,0,0,.22)', pointerEvents: 'none',
                      }}>
                        <span style={{ fontWeight: 800 }}>{s.name} </span>
                        <span style={{ color: '#b8b4ac', fontSize: 11.5 }}>({s.en})</span>
                        <div style={{ marginTop: 5 }}>{s.desc}</div>
                      </div>
                    )}
                  </div>
                  <div style={{ ...rowCell, justifyContent: 'flex-end', gap: 6 }}>
                    <button onClick={() => toggleProf(id)} disabled={!hasProf && prof.length >= PROF_MAX} title="เชี่ยวชาญ — ทอยแบบ Advantage" style={{ ...tag(hasProf, '#2f7d4f'), opacity: !hasProf && prof.length >= PROF_MAX ? 0.4 : 1 }}>▲</button>
                    <button onClick={() => toggleTalent(id)} disabled={!hasTalent && talent.length >= TALENT_MAX} title="พรสวรรค์ — อัพเกรดลูกเต๋า +1 ขั้น" style={{ ...tag(hasTalent, '#5b3fa0'), opacity: !hasTalent && talent.length >= TALENT_MAX ? 0.4 : 1 }}>✦</button>
                    <button
                      onClick={() => setRoll({ faces: rollFaces, adv: hasProf })}
                      title={`ทอย Dweller Skill (${die}${hasProf ? ' · Advantage' : ''}${faces === 0 ? ' · ผลอ้างอิง 0' : ''})`}
                      style={{
                        minWidth: 44, textAlign: 'center', padding: '4px 9px', borderRadius: 7, position: 'relative',
                        background: dieColor, color: '#fff', fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer',
                      }}
                    >
                      {die}
                      {hasProf && <span style={{ position: 'absolute', top: -6, right: -5, fontSize: 10, color: '#2f7d4f', background: '#fff', borderRadius: '50%', width: 14, height: 14, lineHeight: '14px', border: '1px solid #cfe6d6' }}>▲</span>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <DiceRoller open={roll !== null} egoFaces={roll?.faces ?? 20} egoAdvantage={roll?.adv ?? false} onClose={() => setRoll(null)} />
    </div>
  );
}

// ── Step 4: dev-authored questionnaire. Players tick one option per question;
//    each option grants a Quality-of-Life (QL) value the dev sets. ─────────────
interface Step4Option { id: string; text: string; ql: number }
interface Step4Question { id: string; section: string; title: string; options: Step4Option[] }
const STEP4_SECTIONS = ['ฐานะทางสังคม', 'วิถีชีวิต', 'ความพยายามในการศึกษา'];
const step4AnswersOf = (c: Character): Record<string, string> =>
  c.data.step4Answers && typeof c.data.step4Answers === 'object' ? (c.data.step4Answers as Record<string, string>) : {};

function Step4Questions({
  character,
  patch,
}: {
  character: Character;
  patch: ReturnType<typeof useMutation<unknown, Error, { data?: Record<string, unknown>; step?: number }>>;
}) {
  const { isDev } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Step4Question[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['step4-questions', 'global'],
    queryFn: () => api.get<{ step4: { questions: Step4Question[] } }>('/wizard/step4-questions/global'),
  });
  const questions = data?.step4.questions ?? [];
  const answers = step4AnswersOf(character);

  const save = useMutation({
    mutationFn: () => api.put('/wizard/step4-questions/global', { questions: draft }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['step4-questions', 'global'] });
      setEditing(false);
    },
  });

  const totalQL = questions.reduce((sum, q) => {
    const opt = q.options.find((o) => o.id === answers[q.id]);
    return sum + (opt?.ql ?? 0);
  }, 0);

  const pick = (qId: string, optId: string) => {
    const next = { ...answers };
    if (next[qId] === optId) delete next[qId];
    else next[qId] = optId;
    patch.mutate({ data: { ...character.data, step4Answers: next } });
  };

  // ── Dev editing ──
  const startEdit = () => {
    setDraft(questions.map((q) => ({ ...q, options: q.options.map((o) => ({ ...o })) })));
    setEditing(true);
  };
  const setQuestion = (qId: string, fn: (q: Step4Question) => Step4Question) =>
    setDraft((d) => d.map((q) => (q.id === qId ? fn(q) : q)));
  const addQuestion = (section: string) => setDraft((d) => [...d, { id: crypto.randomUUID(), section, title: '', options: [] }]);
  const removeQuestion = (qId: string) => setDraft((d) => d.filter((q) => q.id !== qId));
  const addOption = (qId: string) => setQuestion(qId, (q) => ({ ...q, options: [...q.options, { id: crypto.randomUUID(), text: '', ql: 0 }] }));
  const removeOption = (qId: string, oId: string) => setQuestion(qId, (q) => ({ ...q, options: q.options.filter((o) => o.id !== oId) }));
  const setOption = (qId: string, oId: string, p: Partial<Step4Option>) =>
    setQuestion(qId, (q) => ({ ...q, options: q.options.map((o) => (o.id === oId ? { ...o, ...p } : o)) }));

  const input: React.CSSProperties = { border: '1px solid #e0ded7', borderRadius: 8, padding: '8px 10px', fontSize: 13.5, background: '#fff', width: '100%', boxSizing: 'border-box' };

  return (
    <div style={cardPlain}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 26 }}>คำถามคุณภาพชีวิต</h1>
          <p style={{ color: '#8d8a82', fontSize: 13.5, margin: '8px 0 0' }}>เลือกคำตอบในแต่ละข้อ — แต่ละตัวเลือกให้ค่า Quality of Life (QL)</p>
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, padding: '9px 16px', borderRadius: 20, background: '#eef4fb', color: '#2a5fbd', border: '1px solid #d3e2f5', whiteSpace: 'nowrap' }}>
          รวม {totalQL} QL
        </span>
      </div>

      {isDev && !editing && (
        <button onClick={startEdit} style={{ marginTop: 14, border: '1px solid #c3a184', background: 'rgba(255,255,255,.5)', color: '#a06a44', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          ✎ แก้ไขคำถาม (ผู้พัฒนา)
        </button>
      )}

      {isLoading && <div style={{ color: '#a8a59d', fontSize: 13, padding: 20, textAlign: 'center' }}>กำลังโหลด…</div>}

      {/* ── Dev editor ── */}
      {editing ? (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {STEP4_SECTIONS.map((sec) => (
            <div key={sec}>
              <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800, color: '#2f2c25' }}>{sec}</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {draft.filter((q) => q.section === sec).map((q, qi) => (
                  <div key={q.id} style={{ border: '1px solid #eae7e0', borderRadius: 12, padding: 14, background: '#faf9f7' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#a8a59d', flex: 'none' }}>ข้อ {qi + 1}</span>
                      <input value={q.title} onChange={(e) => setQuestion(q.id, (x) => ({ ...x, title: e.target.value }))} placeholder="หัวข้อคำถาม" style={input} />
                      <button onClick={() => removeQuestion(q.id)} style={{ flex: 'none', border: '1px solid #e6cfcf', background: '#fff', color: '#a04a4a', borderRadius: 8, padding: '8px 10px', fontSize: 12, cursor: 'pointer' }}>ลบข้อ</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {q.options.map((o) => (
                        <div key={o.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input value={o.text} onChange={(e) => setOption(q.id, o.id, { text: e.target.value })} placeholder="ข้อความตัวเลือก" style={input} />
                          <label style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8d8a82', whiteSpace: 'nowrap' }}>
                            QL
                            <input type="number" value={o.ql} onChange={(e) => setOption(q.id, o.id, { ql: Math.round(Number(e.target.value) || 0) })} style={{ ...input, width: 70 }} />
                          </label>
                          <button onClick={() => removeOption(q.id, o.id)} style={{ flex: 'none', border: '1px solid #e0ded7', background: '#fff', color: '#a04a4a', borderRadius: 8, padding: '8px 11px', fontSize: 13, cursor: 'pointer' }}>✕</button>
                        </div>
                      ))}
                      <button onClick={() => addOption(q.id)} style={{ alignSelf: 'flex-start', border: '1px dashed #c3a184', background: 'rgba(255,255,255,.5)', color: '#a06a44', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ เพิ่มตัวเลือก</button>
                    </div>
                  </div>
                ))}
                <button onClick={() => addQuestion(sec)} style={{ alignSelf: 'flex-start', border: '1px dashed #c3a184', background: 'rgba(255,255,255,.5)', color: '#a06a44', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ เพิ่มคำถามใน “{sec}”</button>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="coral" disabled={save.isPending} onClick={() => save.mutate()}>บันทึก</Button>
            <Button variant="ghost" disabled={save.isPending} onClick={() => setEditing(false)}>ยกเลิก</Button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 26 }}>
          {!isLoading && questions.length === 0 && (
            <div style={{ color: '#a8a59d', fontSize: 13.5, padding: '24px 16px', textAlign: 'center', background: '#faf9f7', borderRadius: 10 }}>
              ยังไม่มีคำถาม{isDev ? ' — กด “แก้ไขคำถาม” เพื่อเพิ่ม' : ''}
            </div>
          )}
          {STEP4_SECTIONS.map((sec) => {
            const secQuestions = questions.filter((q) => q.section === sec);
            if (secQuestions.length === 0) return null;
            const secQL = secQuestions.reduce((sum, q) => sum + (q.options.find((o) => o.id === answers[q.id])?.ql ?? 0), 0);
            return (
              <div key={sec}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottom: '2px solid #efece6', paddingBottom: 8, marginBottom: 14 }}>
                  <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 20, color: '#2f2c25' }}>{sec}</h2>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#2a5fbd', whiteSpace: 'nowrap' }}>{secQL} QL</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {secQuestions.map((q, qi) => (
                    <div key={q.id}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#2f2c25', marginBottom: 10 }}>
                        <span style={{ color: '#b0ada4' }}>{qi + 1}. </span>{q.title || '(ยังไม่มีหัวข้อ)'}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {q.options.map((o) => {
                          const on = answers[q.id] === o.id;
                          return (
                            <div
                              key={o.id}
                              onClick={() => pick(q.id, o.id)}
                              title={on ? 'กดอีกครั้งเพื่อเอาติ๊กออก' : undefined}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '12px 14px', borderRadius: 12,
                                border: `1.5px solid ${on ? '#e07a5f' : 'var(--border-soft)'}`, background: on ? '#fdf4f1' : '#fff',
                              }}
                            >
                              <span style={{ width: 20, height: 20, borderRadius: '50%', flex: 'none', border: `2px solid ${on ? '#e07a5f' : '#cfccc4'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {on && <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#e07a5f' }} />}
                              </span>
                              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: '#2f2c25' }}>{o.text || '(ตัวเลือกว่าง)'}</span>
                              <span style={{ flex: 'none', fontSize: 12, fontWeight: 700, color: '#2a5fbd', background: '#eef4fb', border: '1px solid #d3e2f5', borderRadius: 8, padding: '4px 10px', whiteSpace: 'nowrap' }}>
                                Quality of Life = {o.ql} QL
                              </span>
                            </div>
                          );
                        })}
                        {q.options.length === 0 && <div style={{ fontSize: 12.5, color: '#bdbab2' }}>ยังไม่มีตัวเลือก</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Step 5: dev-authored open-ended prompts; players write free-form answers ──
interface Step5Question { id: string; prompt: string }

// A textarea that grows with its content and commits its value on blur.
function GrowingAnswer({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setText(value); }, [value]);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
  }, [text]);
  return (
    <textarea
      ref={ref}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (text !== value) onCommit(text); }}
      placeholder="เขียนคำตอบของคุณ…"
      rows={3}
      style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 10, padding: '11px 13px', fontSize: 13.5, lineHeight: 1.7, fontFamily: 'inherit', color: '#2f2c25', background: '#fff', resize: 'none', overflow: 'hidden', minHeight: 72 }}
    />
  );
}

// Generic open-ended written-answer step (used by Step 5 and Step 6). Each is
// backed by its own global question template + its own answer bag on the
// character, so the two steps stay independent.
function WrittenStep({
  character,
  patch,
  kind,
  respKey,
  answersKey,
  title,
}: {
  character: Character;
  patch: ReturnType<typeof useMutation<unknown, Error, { data?: Record<string, unknown>; step?: number }>>;
  kind: string; // e.g. 'step5-questions'
  respKey: string; // e.g. 'step5'
  answersKey: string; // e.g. 'step5Answers'
  title: string;
}) {
  const { isDev } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Step5Question[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: [kind, 'global'],
    queryFn: () => api.get<Record<string, { questions: Step5Question[] }>>(`/wizard/${kind}/global`),
  });
  const questions = data?.[respKey]?.questions ?? [];
  const answers = character.data[answersKey] && typeof character.data[answersKey] === 'object'
    ? (character.data[answersKey] as Record<string, string>)
    : {};

  const save = useMutation({
    mutationFn: () => api.put(`/wizard/${kind}/global`, { questions: draft }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [kind, 'global'] });
      setEditing(false);
    },
  });

  const commitAnswer = (qId: string, text: string) => {
    const next = { ...answers };
    if (text.trim()) next[qId] = text;
    else delete next[qId];
    patch.mutate({ data: { ...character.data, [answersKey]: next } });
  };

  const startEdit = () => {
    setDraft(questions.map((q) => ({ ...q })));
    setEditing(true);
  };
  const addQuestion = () => setDraft((d) => [...d, { id: crypto.randomUUID(), prompt: '' }]);
  const removeQuestion = (qId: string) => setDraft((d) => d.filter((q) => q.id !== qId));
  const setPrompt = (qId: string, prompt: string) => setDraft((d) => d.map((q) => (q.id === qId ? { ...q, prompt } : q)));

  return (
    <div style={cardPlain}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 26 }}>{title}</h1>
          <p style={{ color: '#8d8a82', fontSize: 13.5, margin: '8px 0 0' }}>เขียนคำตอบได้อย่างอิสระ ยาวเท่าที่ต้องการ — ระบบบันทึกเมื่อคลิกออกจากช่อง</p>
        </div>
        {isDev && !editing && (
          <button onClick={startEdit} style={{ flex: 'none', border: '1px solid #c3a184', background: 'rgba(255,255,255,.5)', color: '#a06a44', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            ✎ แก้ไขคำถาม (ผู้พัฒนา)
          </button>
        )}
      </div>

      {isLoading && <div style={{ color: '#a8a59d', fontSize: 13, padding: 20, textAlign: 'center' }}>กำลังโหลด…</div>}

      {editing ? (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {draft.map((q, qi) => (
            <div key={q.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', border: '1px solid #eae7e0', borderRadius: 12, padding: 12, background: '#faf9f7' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#a8a59d', flex: 'none', paddingTop: 10 }}>ข้อ {qi + 1}</span>
              <textarea
                value={q.prompt}
                onChange={(e) => setPrompt(q.id, e.target.value)}
                placeholder="ข้อความคำถาม"
                rows={2}
                style={{ flex: 1, boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 8, padding: '9px 11px', fontSize: 13.5, lineHeight: 1.6, fontFamily: 'inherit', background: '#fff', resize: 'vertical' }}
              />
              <button onClick={() => removeQuestion(q.id)} style={{ flex: 'none', border: '1px solid #e6cfcf', background: '#fff', color: '#a04a4a', borderRadius: 8, padding: '9px 11px', fontSize: 12, cursor: 'pointer' }}>ลบ</button>
            </div>
          ))}
          <button onClick={addQuestion} style={{ alignSelf: 'flex-start', border: '1px dashed #c3a184', background: 'rgba(255,255,255,.5)', color: '#a06a44', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ เพิ่มคำถาม</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="coral" disabled={save.isPending} onClick={() => save.mutate()}>บันทึก</Button>
            <Button variant="ghost" disabled={save.isPending} onClick={() => setEditing(false)}>ยกเลิก</Button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {!isLoading && questions.length === 0 && (
            <div style={{ color: '#a8a59d', fontSize: 13.5, padding: '24px 16px', textAlign: 'center', background: '#faf9f7', borderRadius: 10 }}>
              ยังไม่มีคำถาม{isDev ? ' — กด “แก้ไขคำถาม” เพื่อเพิ่ม' : ''}
            </div>
          )}
          {questions.map((q, qi) => (
            <div key={q.id}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#2f2c25', marginBottom: 10 }}>
                <span style={{ color: '#b0ada4' }}>{qi + 1}. </span>{q.prompt || '(ยังไม่มีคำถาม)'}
              </div>
              <GrowingAnswer value={answers[q.id] ?? ''} onCommit={(v) => commitAnswer(q.id, v)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step 7: spend Quality-of-Life (QL) on Features + a coin wallet ──
// Coin ladder, all expressed in the base unit (IC): 10 IC = 1 CC, 10 CC = 1 SC,
// 10 SC = 1 GC, 10 GC = 1 PC. Royal Bonds (RB) carry a player-set value.
const COIN_DEFS = [
  { key: 'PC', label: 'Platinum', ic: 10000, color: '#5a6b86' },
  { key: 'GC', label: 'Gold', ic: 1000, color: '#c79a2e' },
  { key: 'SC', label: 'Silver', ic: 100, color: '#9aa0a6' },
  { key: 'CC', label: 'Copper', ic: 10, color: '#b06a2a' },
  { key: 'IC', label: 'Iron', ic: 1, color: '#7a7a72' },
] as const;
const QL_TO_IC = 500; // 1 QL = 5 SC = 500 IC
const PURCHASE_TAGS = ['Life lesson', 'Local Knowledge', 'Social', 'Specialization', 'Language', 'Weapon Proficiency'];
const qlCostOf = (f: CatalogItem) => parseInt(String(f.fields.ql ?? '').replace(/[^0-9]/g, ''), 10) || 0;
const decomposeIC = (total: number) => {
  let rest = Math.max(0, Math.round(total));
  const out: Record<string, number> = {};
  for (const c of COIN_DEFS) { out[c.key] = Math.floor(rest / c.ic); rest -= out[c.key] * c.ic; }
  return out;
};
const numData = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0);

interface RoyalBond { id: string; price: number } // price in GC

function Step7Purchase({
  character,
  patch,
}: {
  character: Character;
  patch: ReturnType<typeof useMutation<unknown, Error, { data?: Record<string, unknown>; step?: number }>>;
}) {
  const wiwonIds = wiwonIdsOf(character);

  // Total QL comes from the Step 4 answers.
  const { data: step4 } = useQuery({
    queryKey: ['step4-questions', 'global'],
    queryFn: () => api.get<{ step4: { questions: Step4Question[] } }>('/wizard/step4-questions/global'),
  });
  const answers4 = character.data.step4Answers && typeof character.data.step4Answers === 'object' ? (character.data.step4Answers as Record<string, string>) : {};
  const totalQL = (step4?.step4.questions ?? []).reduce((s, q) => s + (q.options.find((o) => o.id === answers4[q.id])?.ql ?? 0), 0);

  const purchases = character.data.step7Purchases && typeof character.data.step7Purchases === 'object' ? (character.data.step7Purchases as Record<string, number>) : {};
  const qlConverted = numData(character.data.qlConverted);
  const spentFeatures = Object.values(purchases).reduce((s, n) => s + n, 0);
  const spentMagic = character.data.step8Magic && typeof character.data.step8Magic === 'object'
    ? Object.values(character.data.step8Magic as Record<string, number>).reduce((s, n) => s + n, 0) : 0;
  const availableQL = totalQL - spentFeatures - qlConverted - spentMagic;

  const toggleBuy = (feat: CatalogItem, cost: number) => {
    const next = { ...purchases };
    if (feat.id in next) delete next[feat.id];
    else { if (availableQL < cost) return; next[feat.id] = cost; }
    patch.mutate({ data: { ...character.data, step7Purchases: next } });
  };

  const pill = (bg: string, color: string, brd: string): React.CSSProperties => ({ fontSize: 12.5, fontWeight: 800, padding: '7px 14px', borderRadius: 20, background: bg, color, border: `1px solid ${brd}` });

  return (
    <div style={cardPlain}>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 26 }}>ใช้ Quality of Life แลก Feature</h1>
      <p style={{ color: '#8d8a82', fontSize: 13.5, margin: '8px 0 16px' }}>ใช้ QL ที่สะสมจาก Step 4 แลก Feature — ค้นหาหรือกรองด้วยแท็ก ราคาคือค่า Quality of Life ที่ระบุใน Feature (Life lesson, Local Knowledge, Social, Specialization, Language, Weapon Proficiency)</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span style={pill('#eef4fb', '#2a5fbd', '#d3e2f5')}>QL ทั้งหมด: {totalQL}</span>
        <span style={pill(availableQL > 0 ? '#eef6f0' : '#f9eeea', availableQL > 0 ? '#2f7d4f' : '#b0552f', availableQL > 0 ? '#cfe6d6' : '#f0d8ce')}>คงเหลือ: {availableQL} QL</span>
        {spentFeatures > 0 && <span style={pill('#faf6ef', '#8d6a4a', '#eaddc7')}>ใช้แลก Feature: {spentFeatures} QL</span>}
        {spentMagic > 0 && <span style={pill('#faf6ef', '#8d6a4a', '#eaddc7')}>ใช้แลกเวทมนตร์: {spentMagic} QL</span>}
        {qlConverted > 0 && <span style={pill('#faf6ef', '#8d6a4a', '#eaddc7')}>แลกเป็นเงิน: {qlConverted} QL</span>}
      </div>

      <FeatureBuySearch wiwonIds={wiwonIds} purchases={purchases} availableQL={availableQL} onToggle={toggleBuy} />
    </div>
  );
}

// Coin wallet card (moved to Step 9): coin table with +/-, QL→money, Royal
// Bonds, and a grand total. `availableQL` caps the QL→money conversion.
function WalletCard({
  character,
  patch,
  availableQL,
}: {
  character: Character;
  patch: ReturnType<typeof useMutation<unknown, Error, { data?: Record<string, unknown>; step?: number }>>;
  availableQL: number;
}) {
  const [qlInput, setQlInput] = useState(1);
  const walletIC = numData(character.data.walletIC);
  const qlConverted = numData(character.data.qlConverted);
  const rb: RoyalBond[] = Array.isArray(character.data.walletRB) ? (character.data.walletRB as RoyalBond[]) : [];
  const coins = decomposeIC(walletIC);
  const rbTotalGC = rb.reduce((s, b) => s + numData(b.price), 0);
  const grandGC = walletIC / 1000 + rbTotalGC;

  const setData = (partial: Record<string, unknown>) => patch.mutate({ data: { ...character.data, ...partial } });
  const adjustCoin = (deltaIC: number) => setData({ walletIC: Math.max(0, walletIC + deltaIC) });
  const convertQL = () => {
    const amt = Math.max(0, Math.min(Math.floor(qlInput || 0), availableQL));
    if (amt <= 0) return;
    setData({ walletIC: walletIC + amt * QL_TO_IC, qlConverted: qlConverted + amt });
  };
  const addBond = () => setData({ walletRB: [...rb, { id: crypto.randomUUID(), price: 0 }] });
  const setBond = (id: string, price: number) => setData({ walletRB: rb.map((b) => (b.id === id ? { ...b, price } : b)) });
  const removeBond = (id: string) => setData({ walletRB: rb.filter((b) => b.id !== id) });

  return (
    <div style={{ ...cardPlain, marginTop: 16 }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 22 }}>กระเป๋าเงิน</h2>
      <p style={{ color: '#8d8a82', fontSize: 13.5, margin: '8px 0 16px' }}>
        10 IC = 1 CC · 10 CC = 1 SC · 10 SC = 1 GC · 10 GC = 1 PC — ระบบรวบยอดเหรียญให้อัตโนมัติ
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 460, borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#a8a59d', fontSize: 11, fontWeight: 700 }}>
              <th style={{ padding: '0 0 8px' }}>เหรียญ</th>
              <th style={{ padding: '0 0 8px', textAlign: 'center' }}>ค่า (IC)</th>
              <th style={{ padding: '0 0 8px', textAlign: 'center' }}>จำนวน</th>
              <th style={{ padding: '0 0 8px', textAlign: 'right' }}>ปรับ</th>
            </tr>
          </thead>
          <tbody>
            {COIN_DEFS.map((c) => (
              <tr key={c.key} style={{ borderTop: '1px solid #efece6' }}>
                <td style={{ padding: '9px 0' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: c.color, flex: 'none' }} />
                    <span style={{ fontWeight: 700, color: '#2f2c25' }}>{c.label}</span>
                    <span style={{ fontSize: 11.5, color: '#b0ada4', fontWeight: 700 }}>{c.key}</span>
                  </span>
                </td>
                <td style={{ padding: '9px 0', textAlign: 'center', color: '#9a978e' }}>{c.ic.toLocaleString()}</td>
                <td style={{ padding: '9px 0', textAlign: 'center', fontSize: 17, fontWeight: 800, color: coins[c.key] > 0 ? '#2f2c25' : '#cfccc4' }}>{coins[c.key]}</td>
                <td style={{ padding: '9px 0' }}>
                  <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                    <button onClick={() => adjustCoin(-c.ic)} disabled={walletIC < c.ic} style={{ width: 26, height: 24, borderRadius: 6, border: '1px solid #e0ded7', background: walletIC < c.ic ? '#f5f3ef' : '#fff', color: walletIC < c.ic ? '#cfccc4' : '#6b6860', fontSize: 15, fontWeight: 800, cursor: walletIC < c.ic ? 'not-allowed' : 'pointer' }}>−</button>
                    <button onClick={() => adjustCoin(c.ic)} style={{ width: 26, height: 24, borderRadius: 6, border: '1px solid #e0ded7', background: '#fff', color: '#6b6860', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>+</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #e4e1d9' }}>
              <td style={{ padding: '10px 0', fontWeight: 800, color: '#2f2c25' }}>รวมเป็นเหรียญ</td>
              <td />
              <td colSpan={2} style={{ padding: '10px 0', textAlign: 'right', fontWeight: 800, color: '#c79a2e', fontSize: 15 }}>
                {(walletIC / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })} GC <span style={{ color: '#b0ada4', fontWeight: 600, fontSize: 12 }}>({walletIC.toLocaleString()} IC)</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* QL → money */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 16, padding: '12px 14px', background: '#faf9f7', borderRadius: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#3c3a33' }}>แลก QL เป็นเงิน</span>
        <span style={{ fontSize: 12, color: '#9a978e' }}>(1 QL = 5 SC)</span>
        <input type="number" min={1} value={qlInput} onChange={(e) => setQlInput(Math.max(0, Math.round(Number(e.target.value) || 0)))} style={{ width: 76, border: '1px solid #e0ded7', borderRadius: 8, padding: '7px 9px', fontSize: 13.5 }} />
        <span style={{ fontSize: 12.5, color: '#8d8a82' }}>QL → {(qlInput || 0) * 5} SC · เหลือ {availableQL} QL</span>
        <button onClick={convertQL} disabled={availableQL < 1 || qlInput < 1} style={{ border: 'none', background: availableQL >= 1 && qlInput >= 1 ? '#e07a5f' : '#e5cfc7', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: availableQL >= 1 && qlInput >= 1 ? 'pointer' : 'not-allowed' }}>แลก</button>
      </div>

      {/* Royal Bonds */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: '#3c3a33' }}>Royal Bond (RB) — ใบรับรองกำหนดราคาเองได้</span>
          <button onClick={addBond} style={{ border: '1px dashed #c3a184', background: 'rgba(255,255,255,.5)', color: '#a06a44', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ เพิ่มใบ</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {rb.length === 0 && <div style={{ fontSize: 12.5, color: '#bdbab2' }}>ยังไม่มีใบรับรอง</div>}
          {rb.map((b, i) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#5a6b86', flex: 'none' }}>RB #{i + 1}</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#8d8a82' }}>
                มูลค่า
                <input type="number" min={0} value={b.price} onChange={(e) => setBond(b.id, Math.max(0, Number(e.target.value) || 0))} style={{ width: 92, border: '1px solid #e0ded7', borderRadius: 8, padding: '7px 9px', fontSize: 13.5 }} />
                GC
              </label>
              <button onClick={() => removeBond(b.id)} style={{ flex: 'none', border: '1px solid #e0ded7', background: '#fff', color: '#a04a4a', borderRadius: 8, padding: '7px 10px', fontSize: 12, cursor: 'pointer' }}>✕</button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #efece6', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#a8a59d' }}>มูลค่ารวมโดยประมาณ</span>
        <span style={{ fontSize: 20, fontWeight: 800, color: '#c79a2e' }}>{Number.isInteger(grandGC) ? grandGC : grandGC.toFixed(2)} GC</span>
        {rbTotalGC > 0 && <span style={{ fontSize: 12, color: '#9a978e' }}>(เหรียญ {(walletIC / 1000).toFixed(2)} GC + RB {rbTotalGC} GC)</span>}
      </div>
    </div>
  );
}

// Full read-only detail for a catalog item (all stat rows + description + tags),
// shared by the Feature and Magic exchange popups.
function ItemDetailView({ item, isFeature }: { item: CatalogItem; isFeature: boolean }) {
  const cfg = CATALOG_CONFIGS.magic;
  const src = isFeature && cfg.feature ? cfg.feature : cfg;
  const fv = (key: string) =>
    key === 'source' ? item.source : key === 'tag' ? String(item.fields.tag ?? item.tags[0] ?? '') : item.fields[key] != null ? String(item.fields[key]) : '';
  const rows = src.detailKeys.map(([label, key]) => ({ label, value: fv(key) })).filter((r) => r.value !== '');
  return (
    <div>
      {item.subtitle && <div style={{ fontSize: 12.5, color: '#8d8a82', marginBottom: 10 }}>{item.subtitle}</div>}
      {rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '7px 16px', margin: '4px 0 14px', fontSize: 13 }}>
          {rows.map((r) => (
            <div key={r.label} style={{ display: 'contents' }}>
              <div style={{ color: '#a8a59d', fontWeight: 600 }}>{r.label}</div>
              <div style={{ color: '#2f2c25', fontWeight: 600 }}>{r.value}</div>
            </div>
          ))}
        </div>
      )}
      {item.description
        ? <div style={{ fontSize: 13.5, lineHeight: 1.7, color: '#3c3a33' }} dangerouslySetInnerHTML={{ __html: item.description }} />
        : <div style={{ fontSize: 13, color: '#a8a59d' }}>ยังไม่มีคำอธิบายเพิ่มเติม</div>}
      {item.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 14 }}>
          {item.tags.map((t) => <span key={t} style={{ fontSize: 11, color: '#8d8a82', background: '#f2efe9', borderRadius: 6, padding: '2px 9px' }}>{t}</span>)}
        </div>
      )}
    </div>
  );
}

// Unified, search-driven Feature buyer: one box for all purchasable tags.
// Owned Features always show; the rest appear when you type or pick a tag chip.
function FeatureBuySearch({
  wiwonIds,
  purchases,
  availableQL,
  onToggle,
}: {
  wiwonIds: string[];
  purchases: Record<string, number>;
  availableQL: number;
  onToggle: (f: CatalogItem, cost: number) => void;
}) {
  const [info, setInfo] = useState<CatalogItem | null>(null);
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  // One request for every Feature in the Wiwon; filter to the purchasable tags.
  const { data: all, isLoading } = useQuery({
    queryKey: ['step7-feats', wiwonIds.join(',')],
    queryFn: () => fetchFeaturesByTag('', wiwonIds),
  });
  const purchasable = (all ?? []).filter((f) => f.tags.some((t) => PURCHASE_TAGS.includes(t)));

  const q = query.trim().toLowerCase();
  const owned = purchasable.filter((f) => f.id in purchases);
  const matches = purchasable.filter((f) => {
    if (f.id in purchases) return false; // shown in the owned block already
    if (tagFilter && !f.tags.includes(tagFilter)) return false;
    if (q && !(f.name.toLowerCase().includes(q) || (f.subtitle ?? '').toLowerCase().includes(q))) return false;
    return true;
  });
  const searching = q.length > 0 || tagFilter !== null;

  const row = (f: CatalogItem) => {
    const cost = qlCostOf(f);
    const isOwned = f.id in purchases;
    const canAfford = isOwned || availableQL >= cost;
    const ptags = f.tags.filter((t) => PURCHASE_TAGS.includes(t));
    return (
      <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${isOwned ? '#2f7d4f' : 'var(--border-soft)'}`, background: isOwned ? '#f2f8f4' : '#fff' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2f2c25' }}>{f.name}</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
            {ptags.map((t) => <span key={t} style={{ fontSize: 10.5, color: '#8d8a82', background: '#f2efe9', borderRadius: 6, padding: '1px 7px' }}>{t}</span>)}
          </div>
        </div>
        <span style={{ flex: 'none', fontSize: 12, fontWeight: 700, color: '#2a5fbd', background: '#eef4fb', border: '1px solid #d3e2f5', borderRadius: 8, padding: '4px 10px' }}>{cost} QL</span>
        <button onClick={() => setInfo(f)} style={{ flex: 'none', border: '1px solid var(--border-soft)', background: '#fff', color: '#6b6860', borderRadius: 8, padding: '6px 10px', fontSize: 11.5, cursor: 'pointer' }}>ⓘ</button>
        <button
          onClick={() => onToggle(f, cost)}
          disabled={!canAfford}
          style={{ flex: 'none', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: canAfford ? 'pointer' : 'not-allowed', background: isOwned ? '#e6efe9' : canAfford ? '#e07a5f' : '#eee', color: isOwned ? '#2f7d4f' : canAfford ? '#fff' : '#b0ada4' }}
        >
          {isOwned ? 'แลกแล้ว ✓' : 'แลก'}
        </button>
      </div>
    );
  };

  return (
    <div style={{ marginTop: 18 }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="🔍 ค้นหา Feature ที่จะซื้อ…"
        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 10, padding: '10px 13px', fontSize: 13.5, background: '#fff' }}
      />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {PURCHASE_TAGS.map((t) => {
          const on = tagFilter === t;
          return (
            <button key={t} onClick={() => setTagFilter(on ? null : t)} style={{ border: `1px solid ${on ? '#e07a5f' : '#e0ded7'}`, background: on ? '#fdf4f1' : '#fff', color: on ? '#c15a3f' : '#8d8a82', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{t}</button>
          );
        })}
      </div>

      {isLoading && <div style={{ color: '#a8a59d', fontSize: 12.5, padding: '14px 0', textAlign: 'center' }}>กำลังโหลด…</div>}

      {owned.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#a8a59d', marginBottom: 8 }}>แลกแล้ว ({owned.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{owned.map(row)}</div>
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!isLoading && matches.length > 0 && (
          <div style={{ fontSize: 11, fontWeight: 700, color: '#a8a59d' }}>Feature ที่ปรากฎ ({matches.length})</div>
        )}
        {searching && matches.length === 0 && !isLoading && (
          <div style={{ color: '#bdbab2', fontSize: 12.5, textAlign: 'center', padding: '10px 0' }}>ไม่พบ Feature ที่ตรงกับที่ค้นหา</div>
        )}
        {matches.map(row)}
      </div>

      <Modal open={!!info} onClose={() => setInfo(null)} title={info?.name ?? ''}>
        {info && <ItemDetailView item={info} isFeature />}
      </Modal>
    </div>
  );
}

// ── Step 8: เวทมนตร์ — Ehen organ/core + exchange Magic with QL ──
const EHEN_TYPES = [
  { key: 'organ', label: 'มี Ehen Organ' },
  { key: 'core', label: 'มี Ehen Core' },
  { key: 'none', label: 'ไม่มีอยู่ในร่างกาย' },
];
const EHEN_SIZES = [
  { key: 'small', label: 'เล็ก' },
  { key: 'medium', label: 'กลาง' },
  { key: 'large', label: 'ใหญ่' },
];
const CORE_PRODUCTION_DIE: Record<string, string> = { small: 'd6', medium: 'd8', large: 'd12' };
const ORGAN_PRODUCTION_DIE: Record<string, string> = { small: 'd8', medium: 'd8', large: 'd10' };
const MAGIC_RARITIES = ['Common', 'Uncommon'];
// Color of Ehen — mirrors the Magic "Color of Ehen" (tag) options.
const EHEN_COLORS = ['Pink', 'Silver', 'Blue', 'Purple', 'Yellow', 'Red', 'White', 'Black', 'Cyan'];
const EHEN_COLOR_HEX: Record<string, string> = { Pink: '#e48fb0', Silver: '#b8b8b8', Blue: '#4a7fd0', Purple: '#7a52c0', Yellow: '#d9b93a', Red: '#c0453a', White: '#eeeee8', Black: '#333333', Cyan: '#3ab0c0' };

// Fetch every actual Magic (non-Feature) in the Wiwon, paging the catalog.
async function fetchMagicSpells(wiwonIds: string[]): Promise<CatalogItem[]> {
  const params = new URLSearchParams({ isFeature: 'false', scope: 'all' });
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

function Step8Magic({
  character,
  patch,
}: {
  character: Character;
  patch: ReturnType<typeof useMutation<unknown, Error, { data?: Record<string, unknown>; step?: number }>>;
}) {
  const wiwonIds = wiwonIdsOf(character);

  const { data: step4 } = useQuery({
    queryKey: ['step4-questions', 'global'],
    queryFn: () => api.get<{ step4: { questions: Step4Question[] } }>('/wizard/step4-questions/global'),
  });
  const answers4 = character.data.step4Answers && typeof character.data.step4Answers === 'object' ? (character.data.step4Answers as Record<string, string>) : {};
  const totalQL = (step4?.step4.questions ?? []).reduce((s, q) => s + (q.options.find((o) => o.id === answers4[q.id])?.ql ?? 0), 0);
  const sink = (k: string) => (character.data[k] && typeof character.data[k] === 'object' ? Object.values(character.data[k] as Record<string, number>).reduce((s, n) => s + n, 0) : 0);
  const magicBought = character.data.step8Magic && typeof character.data.step8Magic === 'object' ? (character.data.step8Magic as Record<string, number>) : {};
  const spentMagic = Object.values(magicBought).reduce((s, n) => s + n, 0);
  const availableQL = totalQL - sink('step7Purchases') - numData(character.data.qlConverted) - spentMagic;

  const ehenType = typeof character.data.ehenType === 'string' ? (character.data.ehenType as string) : '';
  const ehenSize = typeof character.data.ehenSize === 'string' ? (character.data.ehenSize as string) : '';
  const ehenColor = typeof character.data.ehenColor === 'string' ? (character.data.ehenColor as string) : '';
  // Production die per size — Core makes P.E. on demand, Organ once per Long Rest.
  const prod = (size: string) => (ehenType === 'core' ? CORE_PRODUCTION_DIE[size] : `${ORGAN_PRODUCTION_DIE[size]} / Long Rest`);

  const setData = (partial: Record<string, unknown>) => patch.mutate({ data: { ...character.data, ...partial } });
  const pickType = (key: string) => setData(key === 'none' ? { ehenType: key, ehenSize: '', ehenColor: '' } : { ehenType: key });
  const toggleMagic = (m: CatalogItem, cost: number) => {
    const next = { ...magicBought };
    if (m.id in next) delete next[m.id];
    else { if (availableQL < cost) return; next[m.id] = cost; }
    setData({ step8Magic: next });
  };

  const pill = (bg: string, color: string, brd: string): React.CSSProperties => ({ fontSize: 12.5, fontWeight: 800, padding: '7px 14px', borderRadius: 20, background: bg, color, border: `1px solid ${brd}` });
  const chip = (on: boolean): React.CSSProperties => ({ border: `1.5px solid ${on ? '#e07a5f' : 'var(--border-soft)'}`, background: on ? '#fdf4f1' : '#fff', color: on ? '#c15a3f' : '#3c3a33', borderRadius: 10, padding: '10px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' });

  return (
    <>
      <div style={cardPlain}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 26 }}>เวทมนตร์</h1>
        <p style={{ color: '#8d8a82', fontSize: 13.5, margin: '8px 0 16px' }}>อวัยวะที่เกี่ยวข้องกับเอเฮนในร่างกายของคุณ</p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {EHEN_TYPES.map((t) => (
            <button key={t.key} onClick={() => pickType(t.key)} style={chip(ehenType === t.key)}>{t.label}</button>
          ))}
        </div>

        {(ehenType === 'organ' || ehenType === 'core') && (
          <>
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#3c3a33', marginBottom: 10 }}>
                {ehenType === 'organ' ? 'Organ Size' : 'Core Size'}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {EHEN_SIZES.map((s) => (
                  <button key={s.key} onClick={() => setData({ ehenSize: s.key })} style={chip(ehenSize === s.key)}>
                    {s.label}
                    <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 800, color: ehenSize === s.key ? '#c15a3f' : '#9a978e' }}>{prod(s.key)}</span>
                  </button>
                ))}
              </div>
              {ehenSize && (
                <div style={{ marginTop: 12, fontSize: 13, color: '#3c3a33', background: '#faf9f7', borderRadius: 10, padding: '10px 14px' }}>
                  ความสามารถในการผลิต <b>A particle of Ehen</b>: <b style={{ color: '#c15a3f' }}>{prod(ehenSize)}</b>
                </div>
              )}
            </div>

            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#3c3a33', marginBottom: 10 }}>Color of Ehen</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {EHEN_COLORS.map((c) => {
                  const on = ehenColor === c;
                  return (
                    <button key={c} onClick={() => setData({ ehenColor: on ? '' : c })} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: `1.5px solid ${on ? '#e07a5f' : 'var(--border-soft)'}`, background: on ? '#fdf4f1' : '#fff', color: on ? '#c15a3f' : '#3c3a33', borderRadius: 20, padding: '7px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                      <span style={{ width: 12, height: 12, borderRadius: '50%', background: EHEN_COLOR_HEX[c], border: '1px solid rgba(0,0,0,.15)', flex: 'none' }} />
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Magic you know ── */}
      <div style={{ ...cardPlain, marginTop: 16 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 22 }}>เวทมนตร์ที่คุณรู้จัก</h2>
        <p style={{ color: '#8d8a82', fontSize: 13.5, margin: '8px 0 14px' }}>ใช้ QL ที่เหลือแลกเวทมนตร์ (เฉพาะ Common และ Uncommon) — ราคาคือค่า Quality of Life ที่ระบุใน Magic</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={pill('#eef4fb', '#2a5fbd', '#d3e2f5')}>QL ทั้งหมด: {totalQL}</span>
          <span style={pill(availableQL > 0 ? '#eef6f0' : '#f9eeea', availableQL > 0 ? '#2f7d4f' : '#b0552f', availableQL > 0 ? '#cfe6d6' : '#f0d8ce')}>คงเหลือ: {availableQL} QL</span>
          {spentMagic > 0 && <span style={pill('#faf6ef', '#8d6a4a', '#eaddc7')}>ใช้แลกเวทมนตร์: {spentMagic} QL</span>}
        </div>
        <MagicBuySearch wiwonIds={wiwonIds} purchases={magicBought} availableQL={availableQL} onToggle={toggleMagic} />
      </div>
    </>
  );
}

function MagicBuySearch({
  wiwonIds,
  purchases,
  availableQL,
  onToggle,
}: {
  wiwonIds: string[];
  purchases: Record<string, number>;
  availableQL: number;
  onToggle: (m: CatalogItem, cost: number) => void;
}) {
  const [info, setInfo] = useState<CatalogItem | null>(null);
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const { data: all, isLoading } = useQuery({
    queryKey: ['step8-magic', wiwonIds.join(',')],
    queryFn: () => fetchMagicSpells(wiwonIds),
  });
  const pool = (all ?? []).filter((m) => MAGIC_RARITIES.includes(String(m.fields.rarity ?? '')));
  // All tags present in the pool (colour, school, etc.) → filter chips.
  const allTags = Array.from(new Set(pool.flatMap((m) => m.tags))).sort();

  const q = query.trim().toLowerCase();
  // Searchable haystack: name + subtitle + tags + plain-text description.
  const haystack = (m: CatalogItem) =>
    `${m.name} ${m.subtitle ?? ''} ${m.tags.join(' ')} ${m.description.replace(/<[^>]+>/g, ' ')}`.toLowerCase();
  const owned = pool.filter((m) => m.id in purchases);
  const matches = pool.filter((m) => {
    if (m.id in purchases) return false;
    if (tagFilter && !m.tags.includes(tagFilter)) return false;
    if (q && !haystack(m).includes(q)) return false;
    return true;
  });

  const row = (m: CatalogItem) => {
    const cost = qlCostOf(m);
    const isOwned = m.id in purchases;
    const canAfford = isOwned || availableQL >= cost;
    const rarity = String(m.fields.rarity ?? '');
    return (
      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${isOwned ? '#2f7d4f' : 'var(--border-soft)'}`, background: isOwned ? '#f2f8f4' : '#fff' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2f2c25' }}>{m.name}</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
            {rarity && <span style={{ fontSize: 10.5, color: '#8d8a82', background: '#f2efe9', borderRadius: 6, padding: '1px 7px' }}>{rarity}</span>}
            {m.subtitle && <span style={{ fontSize: 11.5, color: '#9a978e' }}>{m.subtitle}</span>}
          </div>
        </div>
        <span style={{ flex: 'none', fontSize: 12, fontWeight: 700, color: '#2a5fbd', background: '#eef4fb', border: '1px solid #d3e2f5', borderRadius: 8, padding: '4px 10px' }}>{cost} QL</span>
        <button onClick={() => setInfo(m)} style={{ flex: 'none', border: '1px solid var(--border-soft)', background: '#fff', color: '#6b6860', borderRadius: 8, padding: '6px 10px', fontSize: 11.5, cursor: 'pointer' }}>ⓘ</button>
        <button
          onClick={() => onToggle(m, cost)}
          disabled={!canAfford}
          style={{ flex: 'none', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: canAfford ? 'pointer' : 'not-allowed', background: isOwned ? '#e6efe9' : canAfford ? '#e07a5f' : '#eee', color: isOwned ? '#2f7d4f' : canAfford ? '#fff' : '#b0ada4' }}
        >
          {isOwned ? 'แลกแล้ว ✓' : 'แลก'}
        </button>
      </div>
    );
  };

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="🔍 ค้นหาเวทมนตร์ (ชื่อ, คำอธิบาย หรือแท็ก)…"
        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 10, padding: '10px 13px', fontSize: 13.5, background: '#fff', marginTop: 6 }}
      />
      {allTags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {allTags.map((t) => {
            const on = tagFilter === t;
            return (
              <button key={t} onClick={() => setTagFilter(on ? null : t)} style={{ border: `1px solid ${on ? '#e07a5f' : '#e0ded7'}`, background: on ? '#fdf4f1' : '#fff', color: on ? '#c15a3f' : '#8d8a82', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{t}</button>
            );
          })}
        </div>
      )}
      {isLoading && <div style={{ color: '#a8a59d', fontSize: 12.5, padding: '14px 0', textAlign: 'center' }}>กำลังโหลด…</div>}
      {!isLoading && pool.length === 0 && <div style={{ color: '#bdbab2', fontSize: 12.5, textAlign: 'center', padding: '14px 0' }}>ยังไม่มีเวทมนตร์ Common/Uncommon ใน Wiwon ที่เลือก</div>}

      {owned.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#a8a59d', marginBottom: 8 }}>แลกแล้ว ({owned.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{owned.map(row)}</div>
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!isLoading && matches.length > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: '#a8a59d' }}>เวทมนตร์ที่ปรากฎ ({matches.length})</div>}
        {(q || tagFilter) && matches.length === 0 && !isLoading && <div style={{ color: '#bdbab2', fontSize: 12.5, textAlign: 'center', padding: '10px 0' }}>ไม่พบเวทมนตร์ที่ตรงกับที่ค้นหา</div>}
        {matches.map(row)}
      </div>

      <Modal open={!!info} onClose={() => setInfo(null)} title={info?.name ?? ''}>
        {info && <ItemDetailView item={info} isFeature={false} />}
      </Modal>
    </div>
  );
}

// ── Step 9: starting money + wallet + Equipment shop/bag ──
const CR_TO_IC = 100; // equipment price: 1 Cr = 1 SC = 100 IC
const START_GOLD_IC = 10000; // เงินเริ่มต้น 10 Gold
const SELL_RATE = 0.4; // ราคาขาย = 40% ของเต็ม (ลดลง 60%)
const coinStr = (ic: number) => {
  const d = decomposeIC(ic);
  const parts = COIN_DEFS.filter((c) => d[c.key] > 0).map((c) => `${d[c.key]} ${c.key}`);
  return parts.length ? parts.join(' ') : '0';
};
const priceOf = (m: CatalogItem) => (parseInt(String(m.fields.costNum ?? '').replace(/[^0-9]/g, ''), 10) || 0) * CR_TO_IC;

interface BagLine { lineId: string; itemId: string; name: string; priceIC: number }

async function fetchEquipment(): Promise<CatalogItem[]> {
  const params = new URLSearchParams({ isFeature: 'false', scope: 'all' });
  const out: CatalogItem[] = [];
  for (let page = 1; page < 50; page++) {
    params.set('page', String(page));
    const d = await api.get<{ items: CatalogItem[]; total: number }>(`/catalog/equipment?${params.toString()}`);
    out.push(...d.items);
    if (d.items.length === 0 || out.length >= d.total) break;
  }
  return out;
}

function Step9Money({
  character,
  patch,
}: {
  character: Character;
  patch: ReturnType<typeof useMutation<unknown, Error, { data?: Record<string, unknown>; step?: number }>>;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [sellTarget, setSellTarget] = useState<BagLine | null>(null);
  const [info, setInfo] = useState<CatalogItem | null>(null);

  // Available QL (shared pool) → caps QL→money conversion in the wallet.
  const { data: step4 } = useQuery({
    queryKey: ['step4-questions', 'global'],
    queryFn: () => api.get<{ step4: { questions: Step4Question[] } }>('/wizard/step4-questions/global'),
  });
  const answers4 = character.data.step4Answers && typeof character.data.step4Answers === 'object' ? (character.data.step4Answers as Record<string, string>) : {};
  const totalQL = (step4?.step4.questions ?? []).reduce((s, q) => s + (q.options.find((o) => o.id === answers4[q.id])?.ql ?? 0), 0);
  const sink = (k: string) => (character.data[k] && typeof character.data[k] === 'object' ? Object.values(character.data[k] as Record<string, number>).reduce((s, n) => s + n, 0) : 0);
  const availableQL = totalQL - sink('step7Purchases') - numData(character.data.qlConverted) - sink('step8Magic');

  const started = character.data.walletStart === true;
  const walletIC = numData(character.data.walletIC);
  const tradeIC = numData(character.data.walletTradeIC);
  const bag: BagLine[] = Array.isArray(character.data.bag) ? (character.data.bag as BagLine[]) : [];
  const hasTrades = bag.length > 0 || tradeIC !== 0;

  const setData = (partial: Record<string, unknown>) => patch.mutate({ data: { ...character.data, ...partial } });
  const claim = () => setData({ walletStart: true, walletIC: walletIC + START_GOLD_IC });
  const cancelStart = () => {
    if (hasTrades) { setConfirmReset(true); return; }
    setData({ walletStart: false, walletIC: Math.max(0, walletIC - START_GOLD_IC) });
  };
  const doReset = () => {
    // Undo every trade, drop the bag, then pull the 10 Gold back out.
    setData({ walletStart: false, walletIC: Math.max(0, walletIC - tradeIC - START_GOLD_IC), walletTradeIC: 0, bag: [] });
    setConfirmReset(false);
  };
  const buy = (m: CatalogItem) => {
    const p = priceOf(m);
    if (walletIC < p) return;
    setData({ walletIC: walletIC - p, walletTradeIC: tradeIC - p, bag: [...bag, { lineId: crypto.randomUUID(), itemId: m.id, name: m.name, priceIC: p }] });
  };
  const sell = (line: BagLine) => {
    const refund = Math.floor(line.priceIC * SELL_RATE);
    setData({ walletIC: walletIC + refund, walletTradeIC: tradeIC + refund, bag: bag.filter((l) => l.lineId !== line.lineId) });
    setSellTarget(null);
  };

  return (
    <>
      <div style={cardPlain}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 26 }}>เงินและร้านค้า</h1>
        <p style={{ color: '#8d8a82', fontSize: 13.5, margin: '8px 0 14px' }}>รับเงินเริ่มต้น จัดการกระเป๋าเงิน และซื้อ/ขายอุปกรณ์จาก Equipment &amp; Items</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, padding: '7px 14px', borderRadius: 20, background: '#eef4fb', color: '#2a5fbd', border: '1px solid #d3e2f5' }}>QL ทั้งหมด: {totalQL}</span>
          <span style={{ fontSize: 12.5, fontWeight: 800, padding: '7px 14px', borderRadius: 20, background: availableQL > 0 ? '#eef6f0' : '#f9eeea', color: availableQL > 0 ? '#2f7d4f' : '#b0552f', border: `1px solid ${availableQL > 0 ? '#cfe6d6' : '#f0d8ce'}` }}>QL คงเหลือ: {availableQL}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px 16px', background: '#faf9f7', borderRadius: 12 }}>
          <span style={{ fontSize: 22 }}>🪙</span>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#2f2c25' }}>เงินเริ่มต้น — 10 Gold</div>
            <div style={{ fontSize: 12, color: '#9a978e' }}>{started ? 'รับแล้ว' : 'กดรับเพื่อเพิ่มเข้ากระเป๋าเงิน'}</div>
          </div>
          {started ? (
            <button onClick={cancelStart} style={{ border: '1px solid #e6cfcf', background: '#fff', color: '#a04a4a', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>ยกเลิก</button>
          ) : (
            <button onClick={claim} style={{ border: 'none', background: '#2f7d4f', color: '#fff', borderRadius: 8, padding: '9px 18px', fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}>กดรับ</button>
          )}
        </div>
      </div>

      <WalletCard character={character} patch={patch} availableQL={availableQL} />

      {/* Shop + Bag side by side */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ ...cardPlain, flex: '1 1 320px', minWidth: 280 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 20 }}>ร้านค้า</h2>
          <p style={{ color: '#8d8a82', fontSize: 12.5, margin: '6px 0 12px' }}>จาก Equipment &amp; Items — กด “ซื้อ” เพื่อหักเงินและเก็บเข้ากระเป๋า</p>
          <ShopList walletIC={walletIC} onBuy={buy} onInfo={setInfo} />
        </div>

        <div style={{ ...cardPlain, flex: '1 1 260px', minWidth: 240 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 20 }}>กระเป๋าของตัวละคร</h2>
          <p style={{ color: '#b0552f', fontSize: 12, margin: '6px 0 12px' }}>⚠️ ราคาขายจะลดลง 60% จากราคาเต็ม</p>
          {bag.length === 0 ? (
            <div style={{ color: '#bdbab2', fontSize: 12.5, padding: '10px 0' }}>ยังไม่มีของในกระเป๋า</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bag.map((l) => (
                <div key={l.lineId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border-soft)', background: '#fff' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#2f2c25' }}>{l.name}</div>
                    <div style={{ fontSize: 11, color: '#9a978e' }}>จ่ายไป {coinStr(l.priceIC)}</div>
                  </div>
                  <button onClick={() => setSellTarget(l)} style={{ flex: 'none', border: '1px solid #e0ded7', background: '#fff', color: '#8d6a4a', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>ขาย</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cancel-start reset confirm */}
      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="ยกเลิกเงินเริ่มต้น">
        <p style={{ fontSize: 13.5, color: '#3c3a33', lineHeight: 1.7, margin: 0 }}>
          คุณใช้เงินไปแล้ว การยกเลิกเงินเริ่มต้นจะ <b>รีเซ็ตการซื้อขายทั้งหมด</b> (คืนของในกระเป๋าและยกเลิกการซื้อ/ขายทุกครั้ง) แล้วดึง 10 Gold ออก — ยืนยันหรือไม่?
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setConfirmReset(false)}>ยกเลิก</Button>
          <Button variant="coral" onClick={doReset}>รีเซ็ตทั้งหมด</Button>
        </div>
      </Modal>

      {/* Sell confirm */}
      <Modal open={!!sellTarget} onClose={() => setSellTarget(null)} title="ขายของ">
        {sellTarget && (
          <>
            <p style={{ fontSize: 13.5, color: '#3c3a33', lineHeight: 1.7, margin: 0 }}>
              ขาย <b>{sellTarget.name}</b> — ⚠️ ราคาขายจะลดลง 60% จากราคาเต็ม<br />
              จ่ายไป {coinStr(sellTarget.priceIC)} · ได้คืน <b style={{ color: '#2f7d4f' }}>{coinStr(Math.floor(sellTarget.priceIC * SELL_RATE))}</b>
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setSellTarget(null)}>ยกเลิก</Button>
              <Button variant="coral" onClick={() => sell(sellTarget)}>ยืนยันการขาย</Button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!info} onClose={() => setInfo(null)} title={info?.name ?? ''}>
        {info && <ItemDetailView item={info} isFeature={false} />}
      </Modal>
    </>
  );
}

function ShopList({ walletIC, onBuy, onInfo }: { walletIC: number; onBuy: (m: CatalogItem) => void; onInfo: (m: CatalogItem) => void }) {
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const { data: all, isLoading } = useQuery({ queryKey: ['step9-equipment'], queryFn: fetchEquipment });
  const pool = all ?? [];
  const allTags = Array.from(new Set(pool.flatMap((m) => m.tags))).sort();
  const q = query.trim().toLowerCase();
  const hay = (m: CatalogItem) => `${m.name} ${m.subtitle ?? ''} ${m.tags.join(' ')} ${m.description.replace(/<[^>]+>/g, ' ')}`.toLowerCase();
  const matches = pool.filter((m) => (!tagFilter || m.tags.includes(tagFilter)) && (!q || hay(m).includes(q)));

  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔍 ค้นหาอุปกรณ์…" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 10, padding: '9px 12px', fontSize: 13, background: '#fff' }} />
      {allTags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {allTags.slice(0, 12).map((t) => {
            const on = tagFilter === t;
            return <button key={t} onClick={() => setTagFilter(on ? null : t)} style={{ border: `1px solid ${on ? '#e07a5f' : '#e0ded7'}`, background: on ? '#fdf4f1' : '#fff', color: on ? '#c15a3f' : '#8d8a82', borderRadius: 20, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>{t}</button>;
          })}
        </div>
      )}
      {isLoading && <div style={{ color: '#a8a59d', fontSize: 12.5, padding: '14px 0', textAlign: 'center' }}>กำลังโหลด…</div>}
      {!isLoading && pool.length === 0 && <div style={{ color: '#bdbab2', fontSize: 12.5, textAlign: 'center', padding: '14px 0' }}>ยังไม่มีอุปกรณ์ในคลัง</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {matches.map((m) => {
          const p = priceOf(m);
          const afford = walletIC >= p;
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border-soft)', background: '#fff' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#2f2c25' }}>{m.name}</div>
                <div style={{ fontSize: 11, color: '#9a978e' }}>{coinStr(p)}</div>
              </div>
              <button onClick={() => onInfo(m)} style={{ flex: 'none', border: '1px solid var(--border-soft)', background: '#fff', color: '#6b6860', borderRadius: 8, padding: '5px 9px', fontSize: 11, cursor: 'pointer' }}>ⓘ</button>
              <button onClick={() => onBuy(m)} disabled={!afford} title={afford ? undefined : 'เงินไม่พอ'} style={{ flex: 'none', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12.5, fontWeight: 700, cursor: afford ? 'pointer' : 'not-allowed', background: afford ? '#e07a5f' : '#eee', color: afford ? '#fff' : '#b0ada4' }}>ซื้อ</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 10: name + derived stats (dice from Core Attributes) ──
// Step 10 uses its own grade→die scale: A d10 · B d8 · C d6 · D d4 · X d2.
const STEP10_FACES: Record<string, number> = { A: 10, B: 8, C: 6, D: 4, X: 2 };
const facesOf = (byAbbr: Record<string, string>, abbr: string) => STEP10_FACES[byAbbr[abbr] ?? ''] ?? 0;
const rollDie = (faces: number) => (faces > 0 ? 1 + Math.floor(Math.random() * faces) : 0);

// A number field that keeps local focus while typing and commits on blur.
function NumField({ value, onCommit, width = 76 }: { value: number; onCommit: (v: number) => void; width?: number }) {
  const [t, setT] = useState(String(value));
  useEffect(() => { setT(String(value)); }, [value]);
  return (
    <input
      type="number"
      value={t}
      onChange={(e) => setT(e.target.value)}
      onBlur={() => { const v = Math.round(Number(t) || 0); setT(String(v)); if (v !== value) onCommit(v); }}
      style={{ width, border: '1px solid #e0ded7', borderRadius: 8, padding: '8px 10px', fontSize: 14, textAlign: 'center', background: '#fff' }}
    />
  );
}

// A derived-stat card: label + total, its parts, and (for Ancestry) a ± field.
function StatCard({ title, total, isAncestry, adjVal, onAdj, children }: { title: string; total: number; isAncestry: boolean; adjVal: number; onAdj: (v: number) => void; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid #eae7e0', borderRadius: 12, padding: 14, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 14.5, fontWeight: 800, color: '#2f2c25' }}>{title}</span>
        <span style={{ fontSize: 22, fontWeight: 800, color: '#e07a5f' }}>{total}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>{children}</div>
      {isAncestry && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #eae7e0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#8d6a4a', fontWeight: 700 }}>ปรับ (Ancestry)</span>
          <button onClick={() => onAdj(adjVal - 1)} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #e0ded7', background: '#fff', color: '#6b6860', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>−</button>
          <span style={{ minWidth: 30, textAlign: 'center', fontSize: 14, fontWeight: 800, color: adjVal === 0 ? '#b0ada4' : '#2f2c25' }}>{adjVal > 0 ? '+' : ''}{adjVal}</span>
          <button onClick={() => onAdj(adjVal + 1)} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #e0ded7', background: '#fff', color: '#6b6860', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>+</button>
        </div>
      )}
    </div>
  );
}

function Step10Details({
  character,
  patch,
}: {
  character: Character;
  patch: ReturnType<typeof useMutation<unknown, Error, { data?: Record<string, unknown>; step?: number; name?: string }>>;
}) {
  const byAbbr = useEffectiveGrades(character);
  const raceName = typeof character.data.raceName === 'string' ? (character.data.raceName as string) : '';
  const isAncestry = raceHasAncestry(raceName);

  const s10 = character.data.step10 && typeof character.data.step10 === 'object' ? (character.data.step10 as Record<string, number>) : {};
  const adj = character.data.step10adj && typeof character.data.step10adj === 'object' ? (character.data.step10adj as Record<string, number>) : {};
  const [name, setName] = useState(character.name ?? '');

  const setS10 = (partial: Record<string, number>) => patch.mutate({ data: { ...character.data, step10: { ...s10, ...partial } } });
  const setAdj = (key: string, v: number) => patch.mutate({ data: { ...character.data, step10adj: { ...adj, [key]: v } } });
  const commitName = () => { if (name !== character.name) patch.mutate({ name }); };

  const n = (k: string) => numData(s10[k]);
  const a = (k: string) => (isAncestry ? numData(adj[k]) : 0);
  // die-face bonuses
  const faceDEX = facesOf(byAbbr, 'DEX');
  const facePER = facesOf(byAbbr, 'PER');
  const faceCVN = facesOf(byAbbr, 'CVN');

  // totals
  const scratchTotal = n('baseScratch') + n('scratchRollEND') + a('scratch');
  const woundTotal = n('wound') + a('wound');
  const natureTotal = n('natureBase') + faceDEX + facePER + a('natureDef');
  const sanityTotal = n('sanityBase') + faceCVN + n('sanityRollINT') + a('sanity');
  const moveTotal = n('movement') + a('movement');
  const initTotal = 10 + n('initRollDEX') + n('initRollCVN') + a('initiative');
  const wpTotal = n('willpower') + a('willpower');

  const rollBtn = (faces: number): React.CSSProperties => ({ border: '1px solid #d9c3a8', background: '#fff8ef', color: '#a06a44', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 700, cursor: faces > 0 ? 'pointer' : 'not-allowed', opacity: faces > 0 ? 1 : 0.5, whiteSpace: 'nowrap' });
  const dieOf = (abbr: string) => `d${facesOf(byAbbr, abbr)}`;
  const lbl = (t: string) => <span style={{ fontSize: 12, color: '#9a978e' }}>{t}</span>;
  const rollPart = (key: string, abbr: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {lbl(`ทอย ${abbr} (${dieOf(abbr)})`)}
      <span style={{ minWidth: 26, textAlign: 'center', fontSize: 15, fontWeight: 800, color: '#2f2c25' }}>{n(key)}</span>
      <button onClick={() => setS10({ [key]: rollDie(facesOf(byAbbr, abbr)) })} style={rollBtn(facesOf(byAbbr, abbr))}>🎲 ทอย</button>
    </span>
  );

  return (
    <div style={cardPlain}>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 26 }}>ตั้งชื่อ &amp; รายละเอียด</h1>
      <p style={{ color: '#8d8a82', fontSize: 13.5, margin: '8px 0 16px' }}>
        ตั้งชื่อตัวละครและกำหนดค่าสำคัญ — ลูกเต๋าอ้างอิงเกรดสุดท้าย (A d10 · B d8 · C d6 · D d4 · X d2){isAncestry ? ' · เผ่า Ancestry ปรับ ± ได้เพิ่ม' : ''}
      </p>

      <div style={{ marginBottom: 18 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#8d8a82' }}>ชื่อตัวละคร</label>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} placeholder="ตั้งชื่อตัวละคร…" style={{ display: 'block', marginTop: 6, width: '100%', maxWidth: 380, boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 10, padding: '10px 13px', fontSize: 14.5, background: '#fff' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        <StatCard title="Scratch Point" total={scratchTotal} isAncestry={isAncestry} adjVal={a('scratch')} onAdj={(v) => setAdj('scratch', v)}>
          {lbl('Base')}
          <NumField value={n('baseScratch')} onCommit={(v) => setS10({ baseScratch: v })} />
          {rollPart('scratchRollEND', 'END')}
        </StatCard>

        <StatCard title="Wound Point" total={woundTotal} isAncestry={isAncestry} adjVal={a('wound')} onAdj={(v) => setAdj('wound', v)}>
          {lbl('ระบุเอง')}
          <NumField value={n('wound')} onCommit={(v) => setS10({ wound: v })} />
        </StatCard>

        <StatCard title="Nature Defense" total={natureTotal} isAncestry={isAncestry} adjVal={a('natureDef')} onAdj={(v) => setAdj('natureDef', v)}>
          {lbl('ระบุเอง')}
          <NumField value={n('natureBase')} onCommit={(v) => setS10({ natureBase: v })} />
          {lbl(`+ หน้า DEX (${dieOf('DEX')} = ${faceDEX})`)}
          {lbl(`+ หน้า PER (${dieOf('PER')} = ${facePER})`)}
        </StatCard>

        <StatCard title="Sanity Point" total={sanityTotal} isAncestry={isAncestry} adjVal={a('sanity')} onAdj={(v) => setAdj('sanity', v)}>
          {lbl('ค่าพื้นฐาน')}
          <NumField value={n('sanityBase')} onCommit={(v) => setS10({ sanityBase: v })} />
          {lbl(`+ หน้า CVN (${dieOf('CVN')} = ${faceCVN})`)}
          {rollPart('sanityRollINT', 'INT')}
        </StatCard>

        <StatCard title="Movement" total={moveTotal} isAncestry={isAncestry} adjVal={a('movement')} onAdj={(v) => setAdj('movement', v)}>
          {lbl('ระบุเอง')}
          <NumField value={n('movement')} onCommit={(v) => setS10({ movement: v })} />
        </StatCard>

        <StatCard title="Initiative" total={initTotal} isAncestry={isAncestry} adjVal={a('initiative')} onAdj={(v) => setAdj('initiative', v)}>
          {lbl('ฐาน 10')}
          {rollPart('initRollDEX', 'DEX')}
          {rollPart('initRollCVN', 'CVN')}
        </StatCard>

        <StatCard title="Willpower Point" total={wpTotal} isAncestry={isAncestry} adjVal={a('willpower')} onAdj={(v) => setAdj('willpower', v)}>
          {lbl('ระบุเอง')}
          <NumField value={n('willpower')} onCommit={(v) => setS10({ willpower: v })} />
        </StatCard>
      </div>
    </div>
  );
}

// ── Step 11: choose Virtues (max 3) and Flaws — each Virtue needs a Flaw ──
const MAX_VIRTUES = 3;

function Step11Traits({
  character,
  patch,
}: {
  character: Character;
  patch: ReturnType<typeof useMutation<unknown, Error, { data?: Record<string, unknown>; step?: number }>>;
}) {
  const wiwonIds = wiwonIdsOf(character);
  const [info, setInfo] = useState<CatalogItem | null>(null);

  const s11 = character.data.step11 && typeof character.data.step11 === 'object' ? (character.data.step11 as { virtues?: string[]; flaws?: string[] }) : {};
  const virtues = Array.isArray(s11.virtues) ? s11.virtues : [];
  const flaws = Array.isArray(s11.flaws) ? s11.flaws : [];

  const { data: virtueItems, isLoading: vLoading } = useQuery({
    queryKey: ['step11-feats', 'Virtues', wiwonIds.join(',')],
    queryFn: () => fetchFeaturesByTag('Virtues', wiwonIds),
  });
  const { data: flawItems, isLoading: fLoading } = useQuery({
    queryKey: ['step11-feats', 'Flaws', wiwonIds.join(',')],
    queryFn: () => fetchFeaturesByTag('Flaws', wiwonIds),
  });

  const commit = (nextVirtues: string[], nextFlaws: string[]) => patch.mutate({ data: { ...character.data, step11: { virtues: nextVirtues, flaws: nextFlaws } } });
  const toggleVirtue = (id: string) => {
    if (virtues.includes(id)) commit(virtues.filter((v) => v !== id), flaws);
    else if (virtues.length < MAX_VIRTUES) commit([...virtues, id], flaws);
  };
  const toggleFlaw = (id: string) => {
    if (flaws.includes(id)) commit(virtues, flaws.filter((f) => f !== id));
    else commit(virtues, [...flaws, id]);
  };

  const needMoreFlaws = virtues.length > flaws.length;

  const frame = (title: string, hint: string, items: CatalogItem[] | undefined, isLoading: boolean, chosen: string[], onToggle: (id: string) => void, atMax: boolean, accent: string) => (
    <div style={{ ...cardPlain, flex: '1 1 300px', minWidth: 280 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 21 }}>{title}</h2>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: accent }}>{hint}</span>
      </div>
      {isLoading && <div style={{ color: '#a8a59d', fontSize: 12.5, padding: '14px 0', textAlign: 'center' }}>กำลังโหลด…</div>}
      {!isLoading && (items?.length ?? 0) === 0 && <div style={{ color: '#bdbab2', fontSize: 12.5, padding: '14px 0', textAlign: 'center' }}>ยังไม่มี Feature แท็กนี้ใน Wiwon ที่เลือก</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {(items ?? []).map((f) => {
          const on = chosen.includes(f.id);
          const disabled = !on && atMax;
          return (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${on ? accent : 'var(--border-soft)'}`, background: on ? '#faf9f7' : '#fff', opacity: disabled ? 0.5 : 1 }}>
              <button onClick={() => onToggle(f.id)} disabled={disabled} title={on ? 'กดเพื่อเอาออก' : disabled ? 'เลือกครบแล้ว' : undefined} style={{ flex: 'none', width: 22, height: 22, borderRadius: 6, border: `2px solid ${on ? accent : '#cfccc4'}`, background: on ? accent : '#fff', color: '#fff', fontSize: 13, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on ? '✓' : ''}</button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2f2c25' }}>{f.name}</div>
                {f.subtitle && <div style={{ fontSize: 11.5, color: '#9a978e' }}>{f.subtitle}</div>}
              </div>
              <button onClick={() => setInfo(f)} style={{ flex: 'none', border: '1px solid var(--border-soft)', background: '#fff', color: '#6b6860', borderRadius: 8, padding: '6px 10px', fontSize: 11.5, cursor: 'pointer' }}>ⓘ</button>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <div style={cardPlain}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 26 }}>Virtues &amp; Flaws</h1>
        <p style={{ color: '#8d8a82', fontSize: 13.5, margin: '8px 0 12px' }}>
          เลือกคุณธรรม (Virtues) และข้อด้อย (Flaws) ได้เอง — ไม่บังคับ แต่ทุก Virtue ต้องมี Flaw คู่กัน และเลือก Virtues ได้สูงสุด {MAX_VIRTUES}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, padding: '7px 14px', borderRadius: 20, background: '#eef6f0', color: '#2f7d4f', border: '1px solid #cfe6d6' }}>Virtues: {virtues.length}/{MAX_VIRTUES}</span>
          <span style={{ fontSize: 12.5, fontWeight: 800, padding: '7px 14px', borderRadius: 20, background: '#f9eeea', color: '#b0552f', border: '1px solid #f0d8ce' }}>Flaws: {flaws.length}</span>
          {needMoreFlaws && <span style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 20, background: '#fbe7e2', color: '#c0432a', border: '1px solid #f2c9bd' }}>⚠️ ต้องเลือก Flaws ให้ครบอีก {virtues.length - flaws.length}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {frame('Virtues', `เลือกได้อีก ${Math.max(0, MAX_VIRTUES - virtues.length)}`, virtueItems, vLoading, virtues, toggleVirtue, virtues.length >= MAX_VIRTUES, '#2f7d4f')}
        {frame('Flaws', 'เลือกกี่ข้อก็ได้', flawItems, fLoading, flaws, toggleFlaw, false, '#b0552f')}
      </div>

      <Modal open={!!info} onClose={() => setInfo(null)} title={info?.name ?? ''}>
        {info && <ItemDetailView item={info} isFeature />}
      </Modal>
    </>
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

  // All Features in the chosen Wiwon — feeds the dev editor and the per-grant
  // pickers (language / lifestyle pools are derived from here).
  const { data: pool } = useQuery({
    queryKey: ['feature-pool', wiwonIds.join(',')],
    queryFn: () => fetchFeaturesByTag('', wiwonIds),
  });
  const languagePool = (pool ?? []).filter((f) => f.tags.includes('Language'));
  const lifestylePool = (pool ?? []).filter(
    (f) => f.tags.some((t) => LIFESTYLE_TAGS.includes(t)) && ['Common', 'Uncommon'].includes(String(f.fields.rarity ?? '')),
  );

  // The class's weapon-proficiency options (for grantType = weapon).
  const { data: weaponsData } = useQuery({
    queryKey: ['class-weapons', classValue],
    queryFn: () => api.get<{ weapons: { options: WeaponOption[] } }>(`/wizard/class-weapons/${encodeURIComponent(classValue)}`),
  });
  const classWeapons = weaponsData?.weapons.options ?? [];
  const chosenWeapons = Array.isArray(character.data.weaponProficiencies) ? (character.data.weaponProficiencies as string[]) : [];

  // Extra picks made from grant-type level options: { levelOptionId → pickedId }.
  const grantPicks = character.data.levelGrantPicks && typeof character.data.levelGrantPicks === 'object' ? (character.data.levelGrantPicks as Record<string, string>) : {};
  const setGrantPick = (optId: string, value: string) => {
    const next = { ...grantPicks };
    if (value) next[optId] = value;
    else delete next[optId];
    patch.mutate({ data: { ...character.data, levelGrantPicks: next } });
  };

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
    const claimedOptId = claims[String(cancelTarget)];
    const next = { ...claims };
    delete next[String(cancelTarget)];
    const nextPicks = { ...grantPicks };
    if (claimedOptId) delete nextPicks[claimedOptId];
    patch.mutate({ data: { ...character.data, levelClaims: next, levelGrantPicks: nextPicks } }, { onSuccess: () => setCancelTarget(null) });
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
    patch.mutate({ data: { ...character.data, level: pendingLevel, levelClaims: {}, levelGrantPicks: {} } }, { onSuccess: () => setPendingLevel(null) });
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

      <div style={{ marginTop: 18, borderTop: '1px solid #efece6', paddingTop: 16 }}>
        <CoreAttributes path="class-core" refId={classValue} title="Core Attribute (ของคลาส)" />
      </div>

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
                          <select value={o.grantType ?? 'none'} onChange={(e) => setOption(level.lv, o.id, { grantType: e.target.value as WizardLevelOption['grantType'] })} title="เมื่อรับ ให้ผู้เล่นเลือกเพิ่มจาก…" style={{ flex: 'none', border: '1px solid #d8d4cc', background: '#fff', color: (o.grantType && o.grantType !== 'none') ? 'var(--coral-ink)' : '#8d8a82', borderRadius: 7, height: 30, padding: '0 6px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                            <option value="none">— ไม่ให้เลือกเพิ่ม —</option>
                            <option value="weapon">+ อาวุธ</option>
                            <option value="language">+ ภาษา</option>
                            <option value="lifestyle">+ วิถีชีวิต</option>
                          </select>
                          <button onClick={() => removeOption(level.lv, o.id)} title="ลบตัวเลือก" style={{ flex: 'none', border: '1px solid #e6c4bc', background: '#fbf3f1', color: '#b4513a', borderRadius: 7, width: 30, height: 30, cursor: 'pointer' }}>×</button>
                        </div>
                      );
                    }
                    const gt = o.grantType && o.grantType !== 'none' ? o.grantType : null;
                    const otherPicks = Object.entries(grantPicks).filter(([k]) => k !== o.id).map(([, v]) => v);
                    let grantItems: { value: string; label: string; group?: string }[] = [];
                    if (gt === 'weapon') {
                      const used = new Set<string>([...chosenWeapons, ...otherPicks]);
                      grantItems = classWeapons.filter((w) => !used.has(w.id)).map((w) => ({ value: w.id, label: w.featureName ?? w.text ?? 'อาวุธ' }));
                    } else if (gt === 'language') {
                      const used = new Set(otherPicks);
                      grantItems = languagePool.filter((f) => !used.has(f.id)).map((f) => ({ value: f.id, label: f.name }));
                    } else if (gt === 'lifestyle') {
                      const used = new Set(otherPicks);
                      grantItems = lifestylePool.filter((f) => !used.has(f.id)).map((f) => ({ value: f.id, label: f.name, group: LIFESTYLE_TAGS.find((t) => f.tags.includes(t)) ?? 'อื่น ๆ' }));
                    }
                    const currentGrant = grantPicks[o.id] ?? '';
                    const lifestyleGroups = gt === 'lifestyle'
                      ? grantItems.reduce<Record<string, typeof grantItems>>((acc, it) => { (acc[it.group ?? 'อื่น ๆ'] ??= []).push(it); return acc; }, {})
                      : {};
                    return (
                      <div key={o.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, border: `1.5px solid ${claimedThis ? 'var(--coral)' : '#e8e5df'}`, background: claimedThis ? 'var(--coral-bg)' : '#fff', opacity: lockedOut ? 0.5 : 1 }}>
                          <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                            {o.featureName && <span style={{ fontWeight: 700, color: '#2f2c25' }}>{o.featureName}</span>}
                            {o.featureName && o.text && <span style={{ color: '#c9c6bf' }}> · </span>}
                            {o.text && <span style={{ color: '#5f5c54' }}>{o.text}</span>}
                            {!o.featureName && !o.text && <span style={{ color: '#bdbab2' }}>(ตัวเลือกว่าง)</span>}
                            {gt && <span style={{ marginLeft: 6, fontSize: 10.5, color: '#b4513a', fontWeight: 700 }}>{GRANT_BADGE[gt]}</span>}
                          </div>
                          {claimedThis ? (
                            <button onClick={() => setCancelTarget(level.lv)} style={{ flex: 'none', border: 'none', background: 'var(--coral)', color: '#fff', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>รับแล้ว ✓</button>
                          ) : lockedOut ? (
                            <button disabled style={{ flex: 'none', border: '1px solid #e8e5df', background: '#f4f2ee', color: '#b6b3aa', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'not-allowed' }}>ไม่ได้เลือก</button>
                          ) : (
                            <button onClick={() => claim(level.lv, o.id)} style={{ flex: 'none', border: '1px solid #d8d4cc', background: '#fff', color: '#46443c', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>กดรับ</button>
                          )}
                        </div>
                        {claimedThis && gt && (
                          <div style={{ marginLeft: 12, padding: '8px 12px', background: '#fff7f4', border: '1px dashed #e6c4bc', borderRadius: 9 }}>
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#b4513a', marginBottom: 6 }}>{GRANT_HEADING[gt]}</div>
                            {grantItems.length === 0 && !currentGrant ? (
                              <div style={{ fontSize: 12, color: '#a8a59d' }}>ไม่มีตัวเลือกที่ยังไม่ถูกเลือก (หรือยังไม่ได้กำหนดในหน้า Magic &amp; Feature)</div>
                            ) : (
                              <select value={currentGrant} onChange={(e) => setGrantPick(o.id, e.target.value)} style={{ width: '100%', border: '1px solid #e0ded7', borderRadius: 7, padding: '7px 9px', fontSize: 12.5, background: '#fff' }}>
                                <option value="">— เลือก —</option>
                                {gt === 'lifestyle'
                                  ? Object.entries(lifestyleGroups).map(([g, its]) => (
                                      <optgroup key={g} label={g}>
                                        {its.map((it) => <option key={it.value} value={it.value}>{it.label}</option>)}
                                      </optgroup>
                                    ))
                                  : grantItems.map((it) => <option key={it.value} value={it.value}>{it.label}</option>)}
                              </select>
                            )}
                          </div>
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
const primaryBtn: React.CSSProperties = { background: '#e07a5f', color: '#fff', borderRadius: 11, padding: '11px 26px', fontSize: 14, fontWeight: 700, textDecoration: 'none' };
