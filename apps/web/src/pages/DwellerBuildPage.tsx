import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CatalogItem, Character, ClassLevelTemplate, WiwonCover, WizardLevel, WizardLevelOption } from '@wiwonanant/shared';
import { CATALOG_CONFIGS } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';
import { CatalogDetail } from '../components/CatalogDetail';
import { Button } from '../components/ui';
import { DiceRoller } from '../components/DiceRoller';
import layout from '../components/layout.module.css';
import { DWELLER_SKILLS, SKILL_ATTR_COLOR } from '../data/dwellerSkills';
import type { SkillAttr } from '../data/dwellerSkills';

const TOTAL_STEPS = 11;
// Shared roll-log presentation (mirrors the Dice Astrolabe's own LOG panel).
const rollSym = (m?: string) => (m === 'adv' ? '▲' : m === 'dis' ? '▼' : '');
interface RollPart { label: string; value: number; faces?: number; mode?: string; color?: string }
interface RollLike { total: number; parts?: RollPart[]; ego?: number; ambient?: number; fortuity?: number; egoFaces?: number; egoMode?: string; ambientMode?: string; fortuityMode?: string; special?: string }
// Normalise any roll (new generic `parts`, or legacy Ego/Ambient/Fortuity) into a part list.
const rollParts = (r: RollLike): RollPart[] => {
  if (r.parts && r.parts.length) return r.parts;
  if (r.ego !== undefined) return [
    { label: 'Ego', value: r.ego, faces: r.egoFaces, mode: r.egoMode, color: '#e05a5a' },
    { label: 'Amb', value: r.ambient ?? 0, faces: 8, mode: r.ambientMode, color: '#4fb99f' },
    { label: 'For', value: r.fortuity ?? 0, faces: 10, mode: r.fortuityMode, color: '#f0c76a' },
  ];
  return [];
};
const rollTotalColor = (r: RollLike) => {
  if (r.ego === undefined || r.ambient === undefined || r.fortuity === undefined) return '#f0c76a';
  const triple = r.ego === r.ambient && r.ambient === r.fortuity;
  if ((triple && r.ego === 1) || r.fortuity === 1) return '#f0554a';
  if ((triple && r.ego >= 2 && r.ego <= 8) || r.fortuity === 10) return '#f0c76a';
  return '#e8e6dc';
};
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
    // In sheet mode, poll so Librarian broadcasts / edits reach the player live.
    refetchInterval: mode === 'sheet' ? 5000 : false,
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
    const isOwner = character.ownerUserId === user.id;
    return (
      <div className={layout.page} style={{ paddingTop: 40, maxWidth: 1340 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          {back}
          {isOwner && (
            <Link to={`/dweller/build/${character.id}`} style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', background: '#5b3fa0', borderRadius: 9, padding: '8px 16px', textDecoration: 'none' }} title="กลับไปหน้าสร้างตัวละครเพื่อแก้ไข">
              ✎ แก้ไขตัวละคร
            </Link>
          )}
        </div>
        <div style={{ marginTop: 16 }}>
          <CharacterSheet character={character} covers={covers} patch={patch} />
        </div>
      </div>
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
const WOUND_LEVELS = [
  { label: 'Have no impact', color: '#5aa06a' },
  { label: 'First Blood', color: '#e6a3a8' },
  { label: 'Impaired', color: '#dd8f96' },
  { label: 'Suppressed', color: '#c0555f' },
  { label: 'Desperate Edge', color: '#8f2f38' },
  { label: "Death's Door", color: '#3a1418' },
];
const SHEET_TABS = ['ช่องเก็บของ', 'Dweller Skill', 'Magic', 'Feature', 'ภูมิหลัง', 'จัดการสินทรัพย์', 'พิเศษ', 'บันทึกประจำวัน'];

// Buff / Debuff catalogues (ported from the old design) — [key, label, desc]
const BUFF_EFFECTS: [string, string, string][] = [
  ['Blessed', 'ได้รับพร (Blessed)', 'ทอยได้สถานการณ์เป็นใจในครั้งถัดไป'],
  ['Inspired', 'ฮึกเหิม (Inspired)', 'ได้โบนัสลูกเต๋าเสริมในการกระทำ'],
  ['Hasted', 'เร่งความเร็ว (Hasted)', 'ระยะก้าวเพิ่มขึ้น · ได้ AP เพิ่ม'],
  ['Shielded', 'ปกป้อง (Shielded)', 'NA เพิ่มขึ้นชั่วคราว'],
  ['Regenerating', 'ฟื้นฟู (Regenerating)', 'ฟื้น Scratch ทุกเทิร์น'],
  ['Empowered', 'เสริมพลัง (Empowered)', 'ความเสียหายเพิ่มขึ้น'],
  ['Focused', 'จดจ่อ (Focused)', 'ทักษะที่เลือกได้เปรียบ'],
  ['Warded', 'ป้องกันเวท (Warded)', 'ต้านทานเวทมนตร์'],
  ['Hidden', 'พรางตัว (Hidden)', 'ตรวจจับได้ยาก'],
  ['Fortified', 'แข็งแกร่ง (Fortified)', 'ต้านทานสถานะผิดปกติ'],
];
const STATUS_EFFECTS: [string, string, string][] = [
  ['มานาเฮือดแห้ง', 'มานาเฮือดแห้ง (Mana Drained)', 'มานาติดลบ — ฟื้นฟูช้า ใช้เวทที่ต้องมานาไม่ได้จนกว่าจะกลับมาเป็นบวก'],
  ['Injured', 'บาดเจ็บ', 'เคลื่อนไหวช้าลงครึ่งหนึ่ง · STR ได้สถานการณ์ไม่เป็นใจ'],
  ['Bleeding', 'เลือดออก', 'Scratch −2 ทุกครั้งที่ติ๊ก Action Point'],
  ['Fractured', 'กระดูกร้าว', 'ช้าลงครึ่งหนึ่ง · Ego Dice เหลือ D4'],
  ['Broken', 'กระดูกหัก', 'ไม่สามารถใช้อวัยวะนั้นได้'],
  ['Maimed', 'อวัยวะเสียหาย', 'แขนขาด นิ้วขาด ตาบอด (ระบุตำแหน่ง)'],
  ['Internal Injury', 'ช้ำใน', 'STR ได้สถานการณ์ไม่เป็นใจ'],
  ['Infected', 'ติดเชื้อ', 'ลดผลฟื้นฟู Scratch ลงครึ่งหนึ่ง'],
  ['Slowed', 'ชะงัก', 'ความเร็วลดลง'],
  ['Entangled', 'ติดพัน', 'ขยับได้ยาก'],
  ['Immobilized', 'ถูกตรึง', 'เคลื่อนไหวไม่ได้ แต่ยังสู้ได้'],
  ['Prone', 'ล้ม', 'หลบระยะไกลง่าย · สู้ประชิดเสียเปรียบ'],
  ['Knocked Down', 'หงายหลัง', 'ล้มพร้อมเสียจังหวะ'],
  ['Grappled', 'ถูกจับล็อก', 'ต้องทอย 3RR ชนะการจับกุม'],
  ['Overburdened', 'แบกภาระเกิน', 'น้ำหนักมากไป · ระยะก้าวครึ่งเดียว'],
  ['Blind', 'ตาบอด', 'การกระทำที่ใช้การมองเห็นทำไม่ได้'],
  ['Deaf', 'หูหนวก', 'การกระทำที่ใช้การได้ยินทำไม่ได้'],
  ['Dazed', 'มึนงง', 'ทุกการกระทำได้สถานการณ์ไม่เป็นใจ'],
  ['Confused', 'สับสน', 'แยกมิตร/ศัตรูยาก'],
  ['Stunned', 'ช็อก', 'เสียการกระทำ 1 เทิร์น'],
  ['Paralyzed', 'อัมพาต', 'ขยับไม่ได้'],
  ['Unconscious', 'สลบ', 'หมดสติ'],
  ['Burning', 'ถูกเผาไหม้', 'Scratch d6/d8/d10 ทุกเทิร์น'],
  ['Frozen', 'แช่แข็ง', 'เคลื่อนที่ลำบาก'],
  ['Wet', 'เปียก', 'มีผลกับไฟฟ้าและความหนาว'],
  ['Poisoned', 'สารพิษสะสม', 'ทานอาหาร/น้ำไม่ได้จนพิษออก'],
  ['Suffocating', 'ขาดอากาศ', 'นับถอยหลัง 10 + END เทิร์น'],
  ['Fear', 'หวาดกลัว', 'ไม่กล้าเข้าใกล้เป้าหมาย'],
  ['Panic', 'ตื่นตระหนก', 'ทำอะไรไม่ได้จนได้สติ'],
  ['Despair', 'สิ้นหวัง', 'Willpower ไม่คืนกลับ'],
  ['Madness', 'คลุ้มคลั่ง', 'ใช้ทักษะ AUT/CVN ไม่ได้'],
  ['Hallucinating', 'ประสาทหลอน', 'เห็นสิ่งที่ไม่มีอยู่จริง'],
  ['Possessed', 'ถูกครอบงำ', 'มีบางสิ่งควบคุมร่างคุณ'],
  ['Hungry', 'หิว', 'ไม่กิน 1 อาทิตย์ → ลด Wounds'],
  ['Thirsty', 'กระหาย', 'ไม่ดื่ม 3 วัน → ลด Wounds'],
  ['Sleep-Deprived', 'อดนอน', 'เสียค่าสติวันละ d6 SAN'],
];
const LANG_TIER_DEFS = [
  { key: 'master', label: 'ภาษาที่ชำนาญ (Fluent)' },
  { key: 'read', label: 'ภาษาที่อ่านออก (Literate)' },
  { key: 'speak', label: 'ภาษาที่พูดและฟังได้ (Conversational)' },
];

function CharacterSheet({
  character,
  covers,
  patch,
}: {
  character: Character;
  covers: WiwonCover[];
  patch: ReturnType<typeof useMutation<unknown, Error, { data?: Record<string, unknown>; step?: number; status?: 'draft' | 'complete'; name?: string }>>;
}) {
  const navigate = useNavigate();
  const byAbbr = useEffectiveGrades(character);
  const wiwonIds = wiwonIdsOf(character);
  const d = character.data;
  const [tab, setTab] = useState('ช่องเก็บของ');
  const [editName, setEditName] = useState(false);
  const [editCamp, setEditCamp] = useState(false);
  const [editXp, setEditXp] = useState(false);
  const [roll, setRoll] = useState<{ faces: number; adv: boolean; dis?: boolean } | null>(null);
  const [sanAmt, setSanAmt] = useState(0);
  const [scrAmt, setScrAmt] = useState(0);
  const [endAmt, setEndAmt] = useState(0);
  const [profPicker, setProfPicker] = useState(false);
  const [challengeSkill, setChallengeSkill] = useState<string | null>(null);
  const [skillTip, setSkillTip] = useState<{ name: string; desc: string; x: number; y: number } | null>(null);
  const [coinAdj, setCoinAdj] = useState<Record<string, string>>({});
  const [bgTopic, setBgTopic] = useState<string | null>(null);
  const [invPicker, setInvPicker] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [bagWarn, setBagWarn] = useState(''); // over-capacity feedback for bags
  // Stack of open floating detail windows — several can be open at once.
  const [detailWins, setDetailWins] = useState<Array<{ key: string; item: CatalogItem; isFeature: boolean }>>([]);
  const [langPick, setLangPick] = useState<string | null>(null); // which tier's picker is open
  const [handInfo, setHandInfo] = useState<BagLine | null>(null); // On-Hand fallback detail
  const [handSlot, setHandSlot] = useState<string | null>(null); // On-Hand: which slot the Use-picker fills
  const [handWarn, setHandWarn] = useState(''); // "มือไม่ว่างพอ" for Two-Handed weapons
  const [restMsg, setRestMsg] = useState(''); // Short/Long Rest result message
  const [lr, setLr] = useState({ safe: true, goodFood: false, goodDream: false, badFood: false, badDream: false, noSleep: false });
  const [magicPicker, setMagicPicker] = useState(false);
  const [featPicker, setFeatPicker] = useState(false);
  const [magicTab, setMagicTab] = useState('known');
  const [logNote, setLogNote] = useState(''); // free-form entry to broadcast to the campaign Log
  const [buffModal, setBuffModal] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [effQuery, setEffQuery] = useState('');
  const [initOpen, setInitOpen] = useState(false);

  const qc = useQueryClient();
  const { data: features } = useQuery({ queryKey: ['sheet-features', wiwonIds.join(',')], queryFn: () => fetchFeaturesByTag('', wiwonIds) });
  const { data: magic } = useQuery({ queryKey: ['sheet-magic', wiwonIds.join(',')], queryFn: () => fetchMagicSpells(wiwonIds) });
  // Shared campaign roll/action log (real-time, if this character is in a campaign)
  interface RollData { total: number; parts?: Array<{ label: string; value: number; faces?: number; mode?: string; color?: string }>; ego?: number; ambient?: number; fortuity?: number; egoFaces?: number; egoMode?: string; ambientMode?: string; fortuityMode?: string; special?: string }
  interface LogEntry { id: string; at: string; characterName: string; kind: string; text: string; itemId?: string; isFeature?: boolean; roll?: RollData }
  interface InitEntry { id: string; name: string; value: number; kind: string }
  interface LootItem { id: string; name: string; kg?: number; desc?: string; itemId?: string }
  const { data: campForChar } = useQuery({
    queryKey: ['sheet-campaign', character.id],
    queryFn: () => api.get<{ campaign: { id: string; name: string; isLibrarian: boolean; log: LogEntry[]; initiative: InitEntry[]; loot: LootItem[] } | null }>(`/campaigns/for-character/${character.id}`),
    refetchInterval: 4000,
  });
  const campaignId = campForChar?.campaign?.id;
  const isLibrarian = campForChar?.campaign?.isLibrarian ?? false;
  const campaignLog = campForChar?.campaign?.log ?? [];
  const logClear = useMutation({ mutationFn: () => api.post('/campaigns/log/clear', { characterId: character.id }), onSuccess: () => qc.invalidateQueries({ queryKey: ['sheet-campaign', character.id] }) });
  const sharedLoot = campForChar?.campaign?.loot ?? [];
  const lootAdd = useMutation({ mutationFn: (item: Partial<LootItem>) => api.post('/campaigns/loot/add', { characterId: character.id, item }), onSuccess: () => qc.invalidateQueries({ queryKey: ['sheet-campaign', character.id] }) });
  const lootRemove = useMutation({ mutationFn: (lootId: string) => api.post('/campaigns/loot/remove', { characterId: character.id, lootId }), onSuccess: () => qc.invalidateQueries({ queryKey: ['sheet-campaign', character.id] }) });
  const lootRename = useMutation({ mutationFn: (b: { lootId: string; name: string }) => api.post('/campaigns/loot/rename', { characterId: character.id, ...b }), onSuccess: () => qc.invalidateQueries({ queryKey: ['sheet-campaign', character.id] }) });
  const campaignInit = (campForChar?.campaign?.initiative ?? []).slice().sort((a, b) => b.value - a.value);
  const postLog = useMutation({
    mutationFn: (body: { kind: string; text: string; itemId?: string; isFeature?: boolean; roll?: RollData }) => api.post('/campaigns/log', { characterId: character.id, ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sheet-campaign', character.id] }),
  });
  const postInit = useMutation({
    mutationFn: (value: number) => api.post('/campaigns/initiative/set', { characterId: character.id, value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sheet-campaign', character.id] }),
  });
  const rollLabelRef = useRef('');
  const logRef = useRef<(kind: string, text: string, ref?: { itemId?: string; isFeature?: boolean; roll?: RollData }) => void>(() => {});
  logRef.current = (kind, text, ref) => { if (campaignId) postLog.mutate({ kind, text, itemId: ref?.itemId, isFeature: ref?.isFeature, roll: ref?.roll }); };
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as { ego: number; ambient: number; fortuity: number; total?: number; egoFaces: number; egoMode?: string; ambientMode?: string; fortuityMode?: string; special?: string };
      const label = rollLabelRef.current || 'ทอยลูกเต๋า';
      const total = d.total ?? d.ego + d.ambient + d.fortuity;
      logRef.current('roll', `🎲 ${label}`, { roll: { ego: d.ego, ambient: d.ambient, fortuity: d.fortuity, total, egoFaces: d.egoFaces, egoMode: d.egoMode, ambientMode: d.ambientMode, fortuityMode: d.fortuityMode, special: d.special } });
      rollLabelRef.current = '';
    };
    window.addEventListener('wiwon-dice', handler);
    return () => window.removeEventListener('wiwon-dice', handler);
  }, []);
  // Full catalog (all Wiwon, all levels) for the Magic/Feature pickers + detail resolution
  const { data: allMagic } = useQuery({ queryKey: ['sheet-all-magic'], queryFn: () => fetchMagicSpells([]) });
  const { data: allFeatures } = useQuery({ queryKey: ['sheet-all-features'], queryFn: () => fetchFeaturesByTag('', []) });
  const { data: q4data } = useQuery({ queryKey: ['step4-questions', 'global'], queryFn: () => api.get<{ step4: { questions: Step4Question[] } }>('/wizard/step4-questions/global') });
  const { data: q5data } = useQuery({ queryKey: ['step5-questions', 'global'], queryFn: () => api.get<Record<string, { questions: Step5Question[] }>>('/wizard/step5-questions/global') });
  const { data: q6data } = useQuery({ queryKey: ['step6-questions', 'global'], queryFn: () => api.get<Record<string, { questions: Step5Question[] }>>('/wizard/step6-questions/global') });
  const { data: equipment } = useQuery({ queryKey: ['sheet-equipment'], queryFn: fetchEquipment });
  const equipById = new Map((equipment ?? []).map((e) => [e.id, e]));
  // Language options — every Feature the catalog tags "Language" (matches tags[] or
  // fields.tag on the server), across all Wiwon, so Official languages always show.
  const { data: langFeatures } = useQuery({ queryKey: ['sheet-lang-features'], queryFn: () => fetchFeaturesByTag('Language', []) });
  const featById = new Map((features ?? []).map((f) => [f.id, f]));

  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  // Wiwon shown as the book SET (setName), de-duplicated.
  const wiwonSets = Array.from(new Set(wiwonIds.map((wid) => { const c = covers.find((x) => x.id === wid); return c?.setName || c?.name; }).filter(Boolean))) as string[];
  const raceName = str('raceName');
  const ancestryName = str('ancestryName');
  const isAncestry = raceHasAncestry(raceName);
  const level = numData(d.level) || 1;

  // Sheet-only trackers persist under data.sheet.
  const sheet = d.sheet && typeof d.sheet === 'object' ? (d.sheet as Record<string, unknown>) : {};
  const sv = (k: string, def = 0) => (sheet[k] !== undefined ? numData(sheet[k]) : def);
  const svs = (k: string, def = '') => (typeof sheet[k] === 'string' ? (sheet[k] as string) : def);
  const setSheet = (partial: Record<string, unknown>) => patch.mutate({ data: { ...d, sheet: { ...sheet, ...partial } } });
  const xp = sv('xp', 0);
  const xpMax = level * 10000;
  const xpPct = Math.round(Math.min(100, xpMax > 0 ? (xp / xpMax) * 100 : 0));
  const canLevelUp = xp >= xpMax && xpMax > 0;
  const levelUp = () => patch.mutate({ step: 2 }, { onSuccess: () => navigate(`/dweller/build/${character.id}`) });
  const blessings: boolean[] = Array.isArray(sheet.blessings) ? (sheet.blessings as boolean[]) : [false, false, false];

  // Derived stats (mirror Step 10).
  const s10 = d.step10 && typeof d.step10 === 'object' ? (d.step10 as Record<string, number>) : {};
  const adj = d.step10adj && typeof d.step10adj === 'object' ? (d.step10adj as Record<string, number>) : {};
  const n = (k: string) => numData(s10[k]);
  const a = (k: string) => (isAncestry ? numData(adj[k]) : 0);
  const faces = (abbr: string) => facesOf(byAbbr, abbr);
  const scratchMax = n('baseScratch') + n('scratchRollEND') + a('scratch') + sumLvScratch(character);
  const sanityMax = n('sanityBase') + faces('CVN') + n('sanityRollINT') + a('sanity');
  const natureDef = n('natureBase') + faces('DEX') + faces('PER') + a('natureDef');
  const movement = n('movement') + a('movement');

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
  const virtues = (s11.virtues ?? []).map((id) => ({ id, name: featById.get(id)?.name ?? '(?)', item: featById.get(id) ?? null }));
  const flaws = (s11.flaws ?? []).map((id) => ({ id, name: featById.get(id)?.name ?? '(?)', item: featById.get(id) ?? null }));
  const prof: string[] = Array.isArray(d.skillProf) ? (d.skillProf as string[]) : [];
  const talent: string[] = Array.isArray(d.skillTalent) ? (d.skillTalent as string[]) : [];
  const languages = (langFeatures ?? []).map((f) => f.name);
  // Proficiency = Features tagged "Specialization" the player picks via the + button.
  const specPool = (features ?? []).filter((f) => f.tags.includes('Specialization'));
  const proficiencies: string[] = Array.isArray(sheet.proficiencies) ? (sheet.proficiencies as string[]) : [];
  const addProf = (id: string) => setSheet({ proficiencies: [...proficiencies, id] });
  const removeProf = (id: string) => setSheet({ proficiencies: proficiencies.filter((x) => x !== id) });

  // Wallet — coins held as discrete denominations (no auto-rollup); IC is the derived total.
  const coins = coinsOf(d);
  const walletIC = coinsToIC(coins);
  const bag: BagLine[] = Array.isArray(d.bag) ? (d.bag as BagLine[]) : [];
  const setBag = (next: BagLine[]) => patch.mutate({ data: { ...d, bag: next } });

  // Language (old-design model): free list of { id, name, tier } across 3 tiers
  interface LangItem { id: string; name: string; tier: string }
  const langs: LangItem[] = Array.isArray(sheet.langs) ? (sheet.langs as LangItem[]) : [];
  const addLang = (tier: string, name: string) => setSheet({ langs: [...langs, { id: `l${Date.now()}`, name, tier }] });
  const setLang = (id: string, name: string) => setSheet({ langs: langs.map((l) => (l.id === id ? { ...l, name } : l)) });
  const delLang = (id: string) => setSheet({ langs: langs.filter((l) => l.id !== id) });

  // Buff / Debuff (old-design model): toggle sets on sheet.buffsOn / sheet.statusOn
  const buffsOn = sheet.buffsOn && typeof sheet.buffsOn === 'object' ? (sheet.buffsOn as Record<string, boolean>) : {};
  const statusOn = sheet.statusOn && typeof sheet.statusOn === 'object' ? (sheet.statusOn as Record<string, boolean>) : {};
  const toggleBuff = (k: string) => { const n = { ...buffsOn }; if (n[k]) delete n[k]; else n[k] = true; setSheet({ buffsOn: n }); };
  const toggleStatus = (k: string) => {
    const n = { ...statusOn };
    const turningOn = !n[k];
    if (n[k]) delete n[k]; else n[k] = true;
    const p: Record<string, unknown> = { statusOn: n };
    // มานาเฮือดแห้ง → ติ๊ก Wounds ไปที่ Desperate Edge (ระดับ 4) ทันที
    if (turningOn && k === 'มานาเฮือดแห้ง') p.woundLevel = Math.max(woundLevel, 4);
    // สิ้นหวัง → Willpower ที่มีหายไปทั้งหมด
    if (turningOn && k === 'Despair') p.wpCur = 0;
    setSheet(p);
  };

  // Inventory zones (ported from the old design): LOOT / READY / สะพาย(กระเป๋า)
  // The "สะพาย" zone only unlocks once the character owns a bag-type item.
  const BAG_RE = /bag|backpack|sack|pouch|pack|กระเป๋า|เป้|ย่าม|ถุง/i;
  const isBagItem = (l: BagLine) => l.isBag ?? BAG_RE.test(l.name);
  const invZone = (l: BagLine) => l.zone ?? 'loot';
  const bagItems = bag.filter(isBagItem);
  const wornBags = bagItems.filter((b) => b.worn);
  const hasBag = bagItems.length > 0;
  const contentsOf = (id: string) => bag.filter((l) => l.inBag === id);
  const bagUsedKg = (id: string) => Math.round(contentsOf(id).reduce((s, l) => s + numData(l.kg), 0) * 10) / 10;
  // A free-zone line is one not stored inside a bag and not a worn bag (worn bags render as containers).
  const inFreeZone = (l: BagLine) => !l.inBag && !(isBagItem(l) && l.worn);
  const loot = bag.filter((l) => invZone(l) === 'loot' && inFreeZone(l));
  const ready = bag.filter((l) => invZone(l) === 'ready' && inFreeZone(l));
  // Weight counts: non-bag Ready items always; a bag (and its contents) only when worn. Loot never counts.
  const readyKg = ready.filter((l) => !isBagItem(l)).reduce((s, l) => s + numData(l.kg), 0);
  const wornKg = wornBags.reduce((s, b) => s + numData(b.kg) + bagUsedKg(b.lineId), 0);
  const carryKg = Math.round((readyKg + wornKg) * 10) / 10;
  const bodyKg = sv('bodyKg', 0);
  const carryMax = Math.round(bodyKg * 0.2 * 10) / 10; // cannot exceed 20% of body weight
  const overloaded = carryMax > 0 && carryKg > carryMax;
  // Daily Calories needed scale off real body weight (~30 kcal/kg maintenance).
  const calGoalAuto = Math.round(bodyKg * 30);
  // BMI from weight + height (cm); height need not be realistic — only for the warning.
  const heightCm = sv('heightCm', 0);
  const bmi = heightCm > 0 && bodyKg > 0 ? bodyKg / Math.pow(heightCm / 100, 2) : 0;
  const bmiWarn = bmi <= 0 ? '' : bmi < 18.5 ? 'ผอมเกินไป' : bmi < 23 ? '' : bmi < 25 ? 'ท้วม' : bmi < 30 ? 'น้ำหนักเกิน' : 'อ้วน';
  const setInv = (lineId: string, p: Partial<BagLine>) => setBag(bag.map((l) => (l.lineId === lineId ? { ...l, ...p } : l)));
  const delInv = (lineId: string) => setBag(bag.filter((l) => l.lineId !== lineId && l.inBag !== lineId));
  // Move a free item into a specific worn bag — reject if it would exceed the bag's dev-set capacity.
  const moveToBag = (lineId: string, bagId: string) => {
    if (lineId === bagId) return;
    const item = bag.find((l) => l.lineId === lineId);
    const bl = bag.find((l) => l.lineId === bagId);
    if (!item || !bl) return;
    const cap = numData(bl.cap);
    if (cap > 0 && bagUsedKg(bagId) + numData(item.kg) > cap) {
      setBagWarn(`“${bl.name}” เก็บได้สูงสุด ${cap} kg — ใส่ “${item.name}” (${numData(item.kg)} kg) ไม่ได้`);
      window.setTimeout(() => setBagWarn(''), 3500);
      return;
    }
    setInv(lineId, { zone: 'bag', inBag: bagId });
  };
  const takeFromBag = (lineId: string) => setInv(lineId, { zone: 'ready', inBag: undefined });
  const receiveItem = (m: CatalogItem) => setBag([...bag, { lineId: `x${Date.now()}`, itemId: m.id, name: m.name, priceIC: 0, zone: 'loot', kg: numData(m.fields.weightNum), isBag: BAG_RE.test(m.name) || m.tags.some((t) => /bag|กระเป๋า|เป้|ย่าม|ถุง/i.test(t)), cap: numData(m.fields.bagCapacity) }]);
  const receiveCustom = (name: string, desc: string) => setBag([...bag, { lineId: `x${Date.now()}`, itemId: '', name, priceIC: 0, zone: 'loot', kg: 0, desc }]);
  // Shared-loot (in a campaign) vs personal-loot (solo) helpers
  const takeLoot = (it: LootItem) => { setBag([...bag, { lineId: `x${Date.now()}`, itemId: it.itemId ?? '', name: it.name, priceIC: 0, zone: 'ready', kg: numData(it.kg), desc: it.desc }]); lootRemove.mutate(it.id); };
  const dropToLoot = (l: BagLine) => { if (campaignId) { lootAdd.mutate({ name: l.name, kg: numData(l.kg), desc: l.desc, itemId: l.itemId }); delInv(l.lineId); } else { setInv(l.lineId, { zone: 'loot', inBag: undefined, worn: false }); } };
  const pickToInv = (m: CatalogItem) => { if (campaignId) lootAdd.mutate({ name: m.name, kg: numData(m.fields.weightNum), itemId: m.id }); else receiveItem(m); };
  const addCustomInv = (name: string, desc: string) => { if (campaignId) lootAdd.mutate({ name, desc }); else receiveCustom(name, desc); };
  const zoneBd: Record<string, string> = { loot: '#ece9e3', ready: '#cbe0d2', bag: '#d6c7f0' };
  const zoneBg: Record<string, string> = { loot: '#fff', ready: '#f7fbf8', bag: '#faf8fd' };
  const moveStyle = (c: string, bd: string): React.CSSProperties => ({ padding: '3px 9px', border: `1px solid ${bd}`, background: '#fff', color: c, borderRadius: 6, fontSize: 10.5, fontWeight: 600, cursor: 'pointer' });
  const invRow = (l: BagLine) => {
    const z = invZone(l);
    const catItem = l.itemId ? equipById.get(l.itemId) : undefined; // resolved master item (if from catalog)
    return (
      <div key={l.lineId} style={{ border: `1px solid ${zoneBd[z]}`, borderRadius: 8, padding: '8px 10px', background: zoneBg[z], opacity: dragId === l.lineId ? 0.45 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            draggable
            onDragStart={(e) => { setDragId(l.lineId); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', l.lineId); }}
            onDragEnd={() => setDragId(null)}
            title="กดค้างเพื่อลากย้ายโซน"
            style={{ flex: 'none', cursor: 'grab', color: '#c9c5bd', fontSize: 14, lineHeight: 1, userSelect: 'none' }}
          >⠿</span>
          <input key={l.name} defaultValue={l.name} onBlur={(e) => { if (e.target.value !== l.name) setInv(l.lineId, { name: e.target.value }); }} style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontSize: 12.5, fontWeight: 600, color: '#3c3a33' }} />
          {isBagItem(l) && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#ede7f6', color: '#5b3fa0', flex: 'none' }}>กระเป๋า{numData(l.cap) > 0 ? ` ${numData(l.cap)}kg` : ''}</span>}
          {catItem && <button onClick={() => openInfo(catItem, false)} title="ดูข้อมูลจากต้นฉบับ" style={{ flex: 'none', border: '1px solid #e0ded7', background: '#fff', color: '#6b6860', borderRadius: 6, padding: '2px 7px', fontSize: 10.5, cursor: 'pointer' }}>ⓘ</button>}
          <button onClick={() => delInv(l.lineId)} title="ลบ" style={{ background: 'none', border: 'none', color: '#cb5a44', cursor: 'pointer', fontSize: 14, flex: 'none' }}>×</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {catItem
            ? <span style={{ fontSize: 11, color: '#8d8a82', marginRight: 'auto' }} title="น้ำหนักจากข้อมูลไอเทม">⚖️ {numData(l.kg)} kg</span>
            : <><NumField value={numData(l.kg)} onCommit={(v) => setInv(l.lineId, { kg: v })} width={52} style={{ fontSize: 11, padding: '2px 6px', textAlign: 'left' }} /><span style={{ fontSize: 10, color: '#a8a59d', marginRight: 'auto' }}>kg</span></>}
          {z !== 'ready' && <button onClick={() => setInv(l.lineId, { zone: 'ready' })} style={moveStyle('#2f6b4f', '#cbe0d2')}>→ Ready</button>}
          {z !== 'loot' && <button onClick={() => dropToLoot(l)} style={moveStyle('#8d8a82', '#e0ded7')} title={campaignId ? 'วางลง Loot รวมของแคมเปญ' : undefined}>→ Loot</button>}
          {isBagItem(l) && z !== 'loot' && <button onClick={() => setInv(l.lineId, { worn: true, zone: 'ready' })} style={moveStyle('#5b3fa0', '#d6c7f0')} title="สวมใส่กระเป๋าเพื่อใช้เก็บของ (นับน้ำหนัก)">🎒 สวมใส่</button>}
          {!isBagItem(l) && wornBags.map((b) => <button key={b.lineId} onClick={() => moveToBag(l.lineId, b.lineId)} style={moveStyle('#5b3fa0', '#d6c7f0')} title={`เก็บลง ${b.name}`}>→ {b.name}</button>)}
        </div>
        {CLOTHING_RE.test(l.name) && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: '#a8a59d', marginBottom: 3 }}>👕 ลักษณะเสื้อผ้า</div>
            <input key={l.desc} defaultValue={l.desc ?? ''} onBlur={(e) => { if (e.target.value !== (l.desc ?? '')) setInv(l.lineId, { desc: e.target.value }); }} placeholder="อธิบายลักษณะ สี ทรง เนื้อผ้า…" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 6, padding: '5px 8px', fontSize: 11.5, background: '#fff', outline: 'none' }} />
          </div>
        )}
        {WEAPON_RE.test(l.name) && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: '#a8a59d' }}>🛡 ความทนทาน</span>
              <NumField value={numData(l.dur)} onCommit={(v) => setInv(l.lineId, { dur: v })} width={44} style={{ fontSize: 11, padding: '2px 5px' }} />
              <span style={{ fontSize: 11, color: '#a8a59d' }}>/</span>
              <NumField value={numData(l.durMax)} onCommit={(v) => setInv(l.lineId, { durMax: v })} width={44} style={{ fontSize: 11, padding: '2px 5px' }} />
            </div>
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: '#a8a59d', marginBottom: 3 }}>🌀 กระบวนท่า (เพิ่มเองได้)</div>
              <textarea key={`a${l.arts}`} defaultValue={l.arts ?? ''} onBlur={(e) => { if (e.target.value !== (l.arts ?? '')) setInv(l.lineId, { arts: e.target.value }); }} placeholder="กระบวนท่าของอาวุธนี้ (บรรทัดละท่า)…" rows={2} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 6, padding: '5px 8px', fontSize: 11.5, background: '#fff', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
            </div>
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: '#5b3fa0', marginBottom: 3 }}>✨ สลักเวทมนตร์</div>
              <textarea key={`e${l.engrave}`} defaultValue={l.engrave ?? ''} onBlur={(e) => { if (e.target.value !== (l.engrave ?? '')) setInv(l.lineId, { engrave: e.target.value }); }} placeholder="เวทมนตร์ที่สลักไว้ในอาวุธนี้…" rows={2} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d6c7f0', borderRadius: 6, padding: '5px 8px', fontSize: 11.5, background: '#faf8fd', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
            </div>
          </div>
        )}
      </div>
    );
  };
  // Drop-zone wrapper: drag a row's handle onto it to move the item there
  const dropZone = (zone: 'loot' | 'ready' | 'bag', children: React.ReactNode) => (
    <div
      onDragOver={(e) => { if (dragId) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); if (dragId) { setInv(dragId, { zone, inBag: undefined }); setDragId(null); } }}
      style={{ display: 'flex', flexDirection: 'column', gap: 5, minHeight: 34, borderRadius: 8, outline: dragId ? '2px dashed #e0c4ba' : 'none', outlineOffset: 2, transition: 'outline .1s' }}
    >
      {children}
    </div>
  );

  // ── Finance / จัดการสินทรัพย์ (ported from the old design) ──
  interface Pouch { id: string; name: string; coins: Record<string, number> }
  const pouches: Pouch[] = Array.isArray(d.pouches) ? (d.pouches as Pouch[]) : [];
  const writeCoins = (next: Record<string, number>, extra: Record<string, unknown> = {}) => patch.mutate({ data: { ...d, walletCoins: next, walletIC: coinsToIC(next), ...extra } });
  const setCoinCount = (key: string, count: number) => writeCoins({ ...coins, [key]: Math.max(0, Math.round(count)) });
  const adjMain = (key: string, sign: 1 | -1) => { const amt = Math.max(0, Math.round(Number(coinAdj[key] || 0))); if (amt) writeCoins(addCoins(coins, { [key]: sign * amt })); };
  const clearAdj = () => setCoinAdj({});
  const addPouch = () => patch.mutate({ data: { ...d, pouches: [...pouches, { id: `p${Date.now()}`, name: 'กองเงินใหม่', coins: {} }] } });
  const renamePouch = (id: string, name: string) => patch.mutate({ data: { ...d, pouches: pouches.map((p) => (p.id === id ? { ...p, name } : p)) } });
  const removePouch = (id: string) => { const p = pouches.find((x) => x.id === id); if (!p) return; writeCoins(addCoins(coins, p.coins), { pouches: pouches.filter((x) => x.id !== id) }); };
  const moveCoin = (pid: string, key: string, dir: 'in' | 'out') => {
    const p = pouches.find((x) => x.id === pid); if (!p) return;
    const amt = Math.max(0, Math.round(Number(coinAdj[`${pid}:${key}`] || 1))) || 1;
    const cur = p.coins[key] ?? 0;
    if (dir === 'in') { const move = Math.min(amt, coins[key]); if (move <= 0) return; writeCoins(addCoins(coins, { [key]: -move }), { pouches: pouches.map((x) => (x.id === pid ? { ...x, coins: { ...x.coins, [key]: cur + move } } : x)) }); }
    else { const move = Math.min(amt, cur); if (move <= 0) return; writeCoins(addCoins(coins, { [key]: move }), { pouches: pouches.map((x) => (x.id === pid ? { ...x, coins: { ...x.coins, [key]: cur - move } } : x)) }); }
  };

  // ── ภูมิหลัง (Background) ──
  const step4Ans = d.step4Answers && typeof d.step4Answers === 'object' ? (d.step4Answers as Record<string, string>) : {};
  const step5Ans = d.step5Answers && typeof d.step5Answers === 'object' ? (d.step5Answers as Record<string, string>) : {};
  const step6Ans = d.step6Answers && typeof d.step6Answers === 'object' ? (d.step6Answers as Record<string, string>) : {};
  // Step 4: read-only summary of the ticked choices, grouped by section
  const step4Summary = STEP4_SECTIONS.map((sec) => ({
    sec,
    picks: (q4data?.step4?.questions ?? [])
      .filter((q) => q.section === sec)
      .flatMap((q) => { const o = q.options.find((op) => op.id === step4Ans[q.id]); return o ? [{ q: q.title, choice: o.text }] : []; }),
  })).filter((s) => s.picks.length > 0);
  // Step 5/6: writable topics, selected via chips
  const bgTopics = [
    ...(q5data?.step5?.questions ?? []).map((q) => ({ id: q.id, prompt: q.prompt, store: 'step5Answers' as const, answered: !!step5Ans[q.id]?.trim() })),
    ...(q6data?.step6?.questions ?? []).map((q) => ({ id: q.id, prompt: q.prompt, store: 'step6Answers' as const, answered: !!step6Ans[q.id]?.trim() })),
  ];
  const commitBgAnswer = (store: 'step5Answers' | 'step6Answers', id: string, text: string) => {
    const cur = store === 'step5Answers' ? step5Ans : step6Ans;
    const next = { ...cur };
    if (text.trim()) next[id] = text; else delete next[id];
    patch.mutate({ data: { ...d, [store]: next } });
  };

  // ── Feature & Magic rows (old-design style): granted items + custom blanks,
  //    with per-row use-counter / max / Curiosity Point trackers ──
  // Open a floating detail window (dedupe by item — clicking again focuses the existing one).
  const openInfo = (item: CatalogItem | null, isFeat: boolean) => {
    if (!item) return;
    setDetailWins((prev) => (prev.some((w) => w.key === item.id) ? prev : [...prev, { key: item.id, item, isFeature: isFeat }]));
  };
  const closeInfo = (key: string) => setDetailWins((prev) => prev.filter((w) => w.key !== key));
  interface Extra { id: string; name: string; itemId?: string }
  // Resolve details across scoped + full catalog
  const featItemById = new Map([...(features ?? []), ...(allFeatures ?? [])].map((f) => [f.id, f]));
  const magicItemById = new Map([...(magic ?? []), ...(allMagic ?? [])].map((m) => [m.id, m]));
  // Features chosen during character creation (Step 7 QL purchases) surfaced under
  // the section matching their tag — Proficiency-type and Language.
  const creationFeats = featIds.map((id) => featItemById.get(id)).filter((f): f is CatalogItem => !!f);
  const PROF_MATCH_TAGS = ['Weapon Proficiency', 'Specialization', 'Life lesson', 'Local Knowledge', 'Social'];
  const profCreation = creationFeats.filter((f) => f.tags.some((t) => PROF_MATCH_TAGS.includes(t)));
  const langCreation = creationFeats.filter((f) => f.tags.includes('Language'));
  const featTrack = sheet.featTrack && typeof sheet.featTrack === 'object' ? (sheet.featTrack as Record<string, { used?: number; max?: number | null; cp?: number }>) : {};
  const featExtra: Extra[] = Array.isArray(sheet.featExtra) ? (sheet.featExtra as Extra[]) : [];
  const featRows = [
    ...featIds.map((id) => ({ key: id, name: featItemById.get(id)?.name ?? '(Feature)', item: featItemById.get(id) ?? null, custom: false })),
    ...featExtra.map((x) => ({ key: x.id, name: x.name, item: x.itemId ? (featItemById.get(x.itemId) ?? null) : null, custom: true })),
  ];
  const setFeatTrack = (key: string, p: Partial<{ used: number; max: number | null; cp: number }>) => setSheet({ featTrack: { ...featTrack, [key]: { ...(featTrack[key] || {}), ...p } } });
  // A Feature is "Active" (usable, shows the ใช้ button) unless its master data marks it Passive.
  const featIsActive = (r: { item: CatalogItem | null; custom: boolean }) => {
    const mode = String(r.item?.fields?.mode ?? '').toLowerCase();
    const tags = (r.item?.tags ?? []).map((t) => t.toLowerCase());
    if (mode === 'passive' || (tags.includes('passive') && !tags.includes('active'))) return false;
    return true; // default (incl. custom) = Active
  };
  const featUsesMax = (r: { item: CatalogItem | null }) => { const v = numData(r.item?.fields?.uses); return v > 0 ? v : null; };
  const addFeatItem = (m: CatalogItem) => setSheet({ featExtra: [...featExtra, { id: `f${Date.now()}`, name: m.name, itemId: m.id }] });
  const renameFeat = (id: string, name: string) => setSheet({ featExtra: featExtra.map((x) => (x.id === id ? { ...x, name } : x)) });
  const removeFeat = (id: string) => setSheet({ featExtra: featExtra.filter((x) => x.id !== id) });

  // Magic proficiency tiers (known / understand / master) — switchable like storage
  const MAGIC_TIERS = [{ key: 'known', label: 'รู้จัก' }, { key: 'understand', label: 'เข้าใจ' }, { key: 'master', label: 'เชี่ยวชาญ' }];
  const magicTier = sheet.magicTier && typeof sheet.magicTier === 'object' ? (sheet.magicTier as Record<string, string>) : {};
  const magTierOf = (key: string) => magicTier[key] ?? 'known';
  const setMagTier = (key: string, tier: string) => setSheet({ magicTier: { ...magicTier, [key]: tier } });
  const magicExtra: Extra[] = Array.isArray(sheet.magicExtra) ? (sheet.magicExtra as Extra[]) : [];
  const magicRows = [
    ...magicIds.map((id) => ({ key: id, name: magicItemById.get(id)?.name ?? '(เวทมนตร์)', item: magicItemById.get(id) ?? null, custom: false })),
    ...magicExtra.map((x) => ({ key: x.id, name: x.name, item: x.itemId ? (magicItemById.get(x.itemId) ?? null) : null, custom: true })),
  ];
  const addMagicItem = (m: CatalogItem, tier: string) => { const id = `m${Date.now()}`; setSheet({ magicExtra: [...magicExtra, { id, name: m.name, itemId: m.id }], magicTier: { ...magicTier, [id]: tier } }); };
  const renameMagic = (id: string, name: string) => setSheet({ magicExtra: magicExtra.map((x) => (x.id === id ? { ...x, name } : x)) });
  const removeMagic = (id: string) => setSheet({ magicExtra: magicExtra.filter((x) => x.id !== id) });

  // Styles
  const box: React.CSSProperties = { border: '1px solid #eae7e0', borderRadius: 12, padding: 14, background: '#fff' };
  const secTitle: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.03em', color: '#6b6860' };

  // ── Sanity / Scratch pools (max defaults to Step 10 but is editable) ──
  const sanMax = sv('sanMax', sanityMax);
  const scrMax = sv('scrMax', scratchMax);
  const sanTemp = sv('sanTemp', 0);
  const sanCur = sv('sanCur', sanMax);
  const scrTemp = sv('scratchTemp', 0);
  const scrCur = sv('scratchCur', scrMax);
  const sanRatio = sanMax > 0 ? sanCur / sanMax : 1;
  const sanStatuses = [
    ...(sanRatio < 0.5 ? ['เครียด'] : []),
    ...(sanRatio < 0.3 ? ['บาดแผลทางจิตใจ'] : []),
    ...(sanRatio < 0.1 ? ['จิตผิดปกติ'] : []),
  ];
  const healPool = (curKey: string, cur: number, max: number, amt: number) => setSheet({ [curKey]: Math.min(max, cur + amt) });
  const damagePool = (curKey: string, tempKey: string, cur: number, temp: number, amt: number) => {
    let a = amt; let t = temp; const d = Math.min(t, a); t -= d; a -= d;
    setSheet({ [tempKey]: t, [curKey]: Math.max(0, cur - a) });
  };

  // ── Wounds: red levels cumulative-tick 1→5; green "Have no impact" is a buffer
  //    whose slot count is added/removed with +/- (starts at 0, hidden). ──
  const woundLevel = sv('woundLevel', 0); // 0..5
  const woundGreen = sv('woundGreen', 1); // 1..4 "Have no impact" slots
  const greenTicked = sv('woundGreenTicked', 0);
  const WOUND_DEBUFFS = ['อ่อนแอต่อพิษ', 'อ่อนกำลัง', 'อ่อนล้า', 'หมดแรง'];
  const activeWoundDebuffs = WOUND_DEBUFFS.slice(0, Math.min(woundLevel, 4));
  const deathDoor = woundLevel >= 5;
  const tickWound = (lv: number) => {
    const next = woundLevel === lv ? lv - 1 : lv;
    const patch: Record<string, unknown> = { woundLevel: next };
    // Leaving Death's Door → clear the revived (green) Last Breath cells.
    if (deathDoor && next < 5) patch.lbGreen = [false, false, false, false, false];
    setSheet(patch);
  };
  const tickGreen = (i: number) => setSheet({ woundGreenTicked: greenTicked === i + 1 ? i : i + 1 });
  const addGreen = () => setSheet({ woundGreen: Math.min(4, woundGreen + 1) });
  const subGreen = () => { const ng = Math.max(0, woundGreen - 1); setSheet({ woundGreen: ng, woundGreenTicked: Math.min(greenTicked, ng) }); };

  // ── Active statuses → Ego-Dice Disadvantage (per skill: attr / category / name) ──
  const activeStatusSet = (() => {
    const s = new Set<string>();
    Object.keys(statusOn).forEach((k) => s.add(k));
    sanStatuses.forEach((x) => s.add(x));
    activeWoundDebuffs.forEach((x) => s.add(x));
    if (s.has('บาดแผลทางจิตใจ')) { s.add('นอนไม่หลับ'); s.add('หูแว่วและภาพหลอน'); }
    if (overloaded) s.add('Overburdened'); // แบกของหนักเกินพิกัด → แบกภาระเกิน
    return s;
  })();
  const insomnia = activeStatusSet.has('นอนไม่หลับ'); // blocks Long Rest
  const disReasons = (attr: string, name: string, catEn: string): string[] => {
    const R: Array<[boolean, boolean, string]> = [
      [activeStatusSet.has('Injured'), attr === 'STR', 'บาดเจ็บ'],
      [activeStatusSet.has('Fractured'), catEn === 'Athletics' && name !== 'ซ่อนตัว', 'กระดูกร้าว'],
      [activeStatusSet.has('Internal Injury'), name === 'ฟื้นกำลัง', 'ช้ำใน'],
      [activeStatusSet.has('Overburdened'), ['Athletics', 'Social Arts', 'Survival'].includes(catEn), 'แบกภาระเกิน'],
      [activeStatusSet.has('Blind'), name === 'กวาดสายตา' || name === 'มองหาจุดสังเกต', 'ตาบอด'],
      [activeStatusSet.has('Deaf'), name === 'การฟัง', 'หูหนวก'],
      [activeStatusSet.has('Madness'), attr === 'AUT' || attr === 'CVN', 'คลุ้มคลั่ง'],
      [activeStatusSet.has('เครียด'), attr === 'INT' || attr === 'AUT', 'เครียด'],
      [activeStatusSet.has('หูแว่วและภาพหลอน'), attr === 'PER', 'หูแว่วและภาพหลอน'],
      [activeStatusSet.has('จิตผิดปกติ'), attr === 'CVN', 'จิตผิดปกติ'],
      [activeStatusSet.has('อ่อนกำลัง'), attr === 'STR', 'อ่อนกำลัง'],
      [activeStatusSet.has('อ่อนล้า'), attr === 'PER', 'อ่อนล้า'],
      [activeStatusSet.has('หมดแรง'), attr === 'DEX' || attr === 'END', 'หมดแรง'],
    ];
    return R.filter(([a, m]) => a && m).map(([, , label]) => label);
  };
  // Non-dice status effects
  const infected = activeStatusSet.has('Infected'); // halves all Scratch healing
  const despair = activeStatusSet.has('Despair'); // Willpower gone, cannot regain
  const poisoned = activeStatusSet.has('Poisoned'); // cannot eat / Cal. not counted
  const bleeding = activeStatusSet.has('Bleeding'); // Next Round: Scratch −2
  const burning = activeStatusSet.has('Burning'); // Next Round: Scratch −d6
  const movementHalf = activeStatusSet.has('Injured') || activeStatusSet.has('อ่อนล้า');
  const effMovement = movementHalf ? Math.floor(movement / 2) : movement;
  const scratchHeal = (amt: number) => (infected ? Math.floor(amt / 2) : amt);

  // ── The Last Breath: 5 green (revive) + 5 red (death) ──
  const lbGreen: boolean[] = Array.isArray(sheet.lbGreen) ? (sheet.lbGreen as boolean[]) : [false, false, false, false, false];
  const lbRed: boolean[] = Array.isArray(sheet.lbRed) ? (sheet.lbRed as boolean[]) : [false, false, false, false, false];
  const reviveActive = lbGreen.filter(Boolean).length >= 5;
  const showDeathOverlay = deathDoor && !reviveActive;
  const toggleLB = (which: 'lbGreen' | 'lbRed', arr: boolean[], i: number) => { const nx = [...arr]; nx[i] = !nx[i]; setSheet({ [which]: nx }); };

  // ── Dweller Skill: Endeavor Points + per-skill "ท้าทาย" (10 cells + die level) ──
  const endeavor = sv('endeavor', 0);
  type Challenge = { cells: number[]; level: number };
  const challenges: Record<string, Challenge> = sheet.challenge && typeof sheet.challenge === 'object' ? (sheet.challenge as Record<string, Challenge>) : {};
  const getCh = (key: string): Challenge => challenges[key] ?? { cells: Array(10).fill(0), level: 0 };
  const setCh = (key: string, ch: Challenge) => setSheet({ challenge: { ...challenges, [key]: ch } });
  const skillInfo = (attr: string, hasTalent: boolean, level: number) => {
    const base = GRADE_LADDER_IDX[byAbbr[attr] ?? ''] ?? 0;
    const idx = Math.max(0, Math.min(DIE_LADDER.length - 1, base + (hasTalent ? 1 : 0) + level));
    const faces = DIE_LADDER[idx];
    return { label: faces === 0 ? '0' : `d${faces}`, roll: faces === 0 ? 2 : faces };
  };

  // ── On-Hand slots (right / left / tail) — only Weapon / Shield / Artifact ──
  interface HandItem { name: string; itemId?: string; kg?: number; na?: number; twoHand?: boolean; linkedTo?: string; secondary?: boolean }
  interface HandSlot { key: string; label: string; extra?: boolean }
  // Only the player's own slots: two hands by default. Extra slots (หาง / เกราะ /
  // etc.) are added by the player. A legacy "tail" slot is kept only if it holds an item.
  const handsNow = sheet.hands && typeof sheet.hands === 'object' ? (sheet.hands as Record<string, unknown>) : {};
  const BASE_HAND_SLOTS: HandSlot[] = [{ key: 'right', label: 'มือขวา' }, { key: 'left', label: 'มือซ้าย' }, ...(handsNow.tail ? [{ key: 'tail', label: 'หาง' }] : [])];
  const handExtra: HandSlot[] = Array.isArray(sheet.handSlotsExtra) ? (sheet.handSlotsExtra as HandSlot[]).map((s) => ({ ...s, extra: true })) : [];
  const HAND_SLOTS: HandSlot[] = [...BASE_HAND_SLOTS, ...handExtra];
  const addHandSlot = () => setSheet({ handSlotsExtra: [...handExtra.map(({ key, label }) => ({ key, label })), { key: `hs${Date.now()}`, label: 'ช่องใหม่' }] });
  const renameHandSlot = (key: string, label: string) => setSheet({ handSlotsExtra: handExtra.map(({ key: k, label: l }) => (k === key ? { key: k, label } : { key: k, label: l })) });
  const removeHandSlot = (key: string) => { const n = { ...hands }; delete n[key]; setSheet({ handSlotsExtra: handExtra.filter((s) => s.key !== key).map(({ key: k, label }) => ({ key: k, label })), hands: n }); };
  const HAND_RE = /weapon|อาวุธ|shield|โล่|armor|เกราะ|artifact|อาร์ติแฟกต์|วัตถุโบราณ/i;
  const DEFENSIVE_RE = /shield|โล่|armor|เกราะ/i; // adds Natural Defense when equipped
  const isHandItem = (m: CatalogItem) => HAND_RE.test(`${m.fields.type ?? ''} ${m.fields.tag ?? ''} ${m.tags.join(' ')} ${m.name}`);
  const isDefensive = (name: string) => DEFENSIVE_RE.test(name);
  const hands = sheet.hands && typeof sheet.hands === 'object' ? (sheet.hands as Record<string, HandItem>) : {};
  const naFromGear = Object.values(hands).reduce((s, it) => s + (it && isDefensive(it.name) ? numData(it.na) : 0), 0);
  const handOn = (slot: string) => (sheet.handsOn && typeof sheet.handsOn === 'object' ? (sheet.handsOn as Record<string, boolean>)[slot] : undefined) ?? (slot !== 'tail');
  const setHand = (slot: string, item: HandItem) => setSheet({ hands: { ...hands, [slot]: item } });
  const clearHand = (slot: string) => { const it = hands[slot]; const n = { ...hands }; delete n[slot]; if (it?.linkedTo) delete n[it.linkedTo]; setSheet({ hands: n }); };
  // Titan's Grip Feature lets a Two-Handed weapon be wielded one-handed.
  const hasTitansGrip = featRows.some((r) => /titan.?s?\s*grip/i.test(r.name));
  // Use an item into a hand slot. Two-Handed weapons occupy a second free hand
  // (unless Titan's Grip); if none is free, warn "มือไม่ว่างพอ" and place nothing.
  const useHandItem = (slot: string, m: CatalogItem): boolean => {
    const twoH = /two|สองมือ/i.test(String(m.fields.wielding ?? ''));
    const base: HandItem = { name: m.name, itemId: m.id, kg: numData(m.fields.weightNum), na: isDefensive(m.name) ? 1 : 0 };
    if (twoH && !hasTitansGrip) {
      const second = HAND_SLOTS.find((s) => s.key !== slot && handOn(s.key) && !hands[s.key]);
      if (!second) {
        setHandWarn(`มือไม่ว่างพอ — “${m.name}” เป็นอาวุธสองมือ (Two-Handed) ต้องมีมือว่าง 2 ช่อง`);
        window.setTimeout(() => setHandWarn(''), 4000);
        return false;
      }
      setSheet({ hands: { ...hands, [slot]: { ...base, twoHand: true, linkedTo: second.key }, [second.key]: { name: m.name, itemId: m.id, kg: 0, twoHand: true, linkedTo: slot, secondary: true } } });
      return true;
    }
    setSheet({ hands: { ...hands, [slot]: { ...base, ...(twoH ? { twoHand: true } : {}) } } });
    return true;
  };
  // Persist derived totals (Natural Defense, Scratch/SAN max) into the sheet so the
  // Librarian roster can display them without re-deriving grades. Guarded to write once per value set.
  const summaryRef = useRef('');
  const gradesSig = JSON.stringify(byAbbr);
  useEffect(() => {
    const natDef = natureDef + naFromGear;
    const key = `${natDef}|${scrMax}|${sanMax}|${gradesSig}`;
    if (summaryRef.current === key) return;
    summaryRef.current = key;
    const cur = (sheet.summary && typeof sheet.summary === 'object' ? sheet.summary : {}) as Record<string, unknown>;
    if (cur.natDef !== natDef || cur.scrMax !== scrMax || cur.sanMax !== sanMax || JSON.stringify(cur.grades) !== gradesSig) {
      setSheet({ summary: { natDef, scrMax, sanMax, grades: byAbbr } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natureDef, naFromGear, scrMax, sanMax, gradesSig]);
  const toggleHandSlot = (slot: string) => setSheet({ handsOn: { ...(sheet.handsOn as Record<string, boolean> || {}), [slot]: !handOn(slot) } });
  // Dweller Skill round tick toggle
  const skillChecked = sheet.skillChecked && typeof sheet.skillChecked === 'object' ? (sheet.skillChecked as Record<string, boolean>) : {};
  const toggleSkillCheck = (key: string) => { const n = { ...skillChecked }; if (n[key]) delete n[key]; else n[key] = true; setSheet({ skillChecked: n }); };

  // ── Short / Long Rest mechanics ──
  const WP_MAX = 3;
  const rollDie = (f: number) => (f > 0 ? 1 + Math.floor(Math.random() * f) : 0);
  const endFaces = skillInfo('END', false, 0).roll; // Core Attribute END die
  const recKey = skillKey('Medicine', 'Rehabilitation'); // Dweller Skill "ฟื้นกำลัง"
  const recInfo = skillInfo('END', talent.includes(recKey), getCh(recKey).level);
  const doShortRest = () => {
    const gain = scratchHeal(rollDie(endFaces));
    setSheet({ scratchCur: Math.min(scrMax, scrCur + gain), wpCur: despair ? 0 : Math.min(WP_MAX, sv('wpCur', WP_MAX) + 1) });
    setRestMsg(`พักสั้น (Short Rest): +${gain} Scratch (END d${endFaces})${infected ? ' (ติดเชื้อ ×½)' : ''} · ${despair ? 'สิ้นหวัง — ไม่ได้ Willpower' : 'Willpower +1'}`);
  };
  const doLongRest = () => {
    let woundDelta = -1, sanGain = 0, wpGain = despair ? 0 : 1;
    let scratchGain = scratchHeal(rollDie(recInfo.roll));
    const notes: string[] = [`WOUNDS −1 · Scratch +${scratchGain} (ฟื้นกำลัง ${recInfo.label})${infected ? ' ·ติดเชื้อ×½' : ''}`];
    if (lr.goodFood) { const s = rollDie(6); sanGain += s; notes.push(`อาหารอร่อย +${s} Sanity`); }
    if (lr.goodDream) { const s = rollDie(6); sanGain += s; notes.push(`ฝันดี +${s} Sanity`); }
    if (lr.badFood || lr.badDream) { sanGain = 0; wpGain = 0; notes.push('อาหารไม่อร่อย/ฝันร้าย — ไม่ฟื้นค่าสติ และไม่ได้ Willpower'); }
    if (!lr.safe) { scratchGain = Math.floor(scratchGain / 2); sanGain = Math.floor(sanGain / 2); wpGain = Math.floor(wpGain / 2); if (woundDelta < 0) woundDelta = Math.ceil(woundDelta / 2); notes.push('สถานที่ไม่ปลอดภัย — ผลฟื้นฟูเหลือครึ่ง (ปัดลง)'); }
    if (lr.noSleep) { scratchGain = 0; notes.push('นอนไม่หลับ — ไม่ฟื้น Scratch'); }
    // Long Rest clears all Active-Feature use counts back to 0.
    const featReset = Object.fromEntries(Object.entries(featTrack).map(([k, v]) => [k, { ...v, used: 0 }]));
    const usedFeatCount = Object.values(featTrack).filter((v) => (v.used ?? 0) > 0).length;
    if (usedFeatCount > 0) notes.push(`คืนการใช้ Active Feature ${usedFeatCount} รายการ`);
    setSheet({
      scratchCur: Math.min(scrMax, scrCur + scratchGain),
      sanCur: Math.min(sanMax, sanCur + sanGain),
      wpCur: Math.min(WP_MAX, sv('wpCur', WP_MAX) + wpGain),
      woundLevel: Math.max(0, Math.min(5, woundLevel + woundDelta)),
      featTrack: featReset,
    });
    setRestMsg(`พักยาว (Long Rest): ${notes.join(' · ')}`);
  };
  // Initiative = 10 + roll(DEX core die) + roll(PER core die)
  const resetInitiative = () => { setSheet({ initiativeRolled: 0 }); if (campaignId) postInit.mutate(0); };
  const rollInitiative = () => {
    const dexF = STEP10_FACES[byAbbr['DEX'] ?? ''] ?? 0;
    const perF = STEP10_FACES[byAbbr['PER'] ?? ''] ?? 0;
    const dex = rollDie(dexF), per = rollDie(perF);
    const val = 10 + dex + per;
    setSheet({ initiativeRolled: val });
    logRef.current('roll', `⚔️ Initiative`, { roll: { total: val, parts: [
      { label: 'ฐาน', value: 10 },
      { label: 'DEX', value: dex, faces: dexF, color: '#2a6fdb' },
      { label: 'PER', value: per, faces: perF, color: '#c15a3f' },
    ] } });
    if (campaignId) postInit.mutate(val);
  };
  const EHEN_DENSITY = [
    { key: 'thin', label: 'เบาบาง', faces: 4 },
    { key: 'normal', label: 'ปกติ', faces: 6 },
    { key: 'dense', label: 'หนาแน่น', faces: 10 },
    { key: 'veil', label: 'ม่านเอเฮน', faces: 20 },
  ];
  const cbx = (label: string, val: boolean, onToggle: () => void) => (
    <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', border: `1px solid ${val ? '#cbe0d2' : '#e0ded7'}`, background: val ? '#eef6f0' : '#fff', borderRadius: 9, padding: '8px 11px', cursor: 'pointer', fontSize: 12.5, color: '#3c3a33', width: '100%' }}>
      <span style={{ flex: 'none', width: 16, height: 16, borderRadius: 4, border: `1px solid ${val ? '#2f7d4f' : '#cfccc4'}`, background: val ? '#2f7d4f' : '#fff', color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{val ? '✓' : ''}</span>
      {label}
    </button>
  );

  const amtInput: React.CSSProperties = { width: 46, textAlign: 'center', border: '1px solid #e0ded7', borderRadius: 8, padding: '5px 4px', fontSize: 13, background: '#fff' };
  const actBtn = (bg: string, color: string, brd: string): React.CSSProperties => ({ fontSize: 11.5, fontWeight: 800, color, background: bg, border: `1px solid ${brd}`, borderRadius: 8, padding: '5px 11px', cursor: 'pointer', whiteSpace: 'nowrap' });

  const bigNum: React.CSSProperties = { fontSize: 36, fontWeight: 800, lineHeight: 1, border: 'none', background: 'transparent', padding: 0, width: 58 };
  const poolBox = (title: string, accent: string, tempLabel: string, temp: number, tempKey: string, cur: number, max: number, maxKey: string, healLabel: string, dmgLabel: string, amt: number, setAmt: (v: number) => void, onHeal: () => void, onDamage: () => void) => (
    <div style={{ ...box, padding: '16px 18px', borderRadius: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ textAlign: 'center', flex: 'none' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#8d8a82', letterSpacing: '.03em' }}>{tempLabel}</div>
          <div style={{ marginTop: 5, background: '#dbe9f7', border: '1px solid #c3d6ec', borderRadius: 11, padding: '5px 8px', minWidth: 86, display: 'flex', justifyContent: 'center' }}>
            <NumField value={temp} onCommit={(v) => setSheet({ [tempKey]: v })} width={70} style={{ fontSize: 22, fontWeight: 800, color: '#2a5fbd', border: 'none', background: 'transparent', padding: 0 }} />
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: accent, marginTop: 8 }}>{title}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingTop: 2 }}>
          <div style={{ textAlign: 'center' }}><div style={secTitle}>ปัจจุบัน</div><div style={{ ...bigNum, color: accent, width: 'auto', minWidth: 40 }}>{cur}</div></div>
          <span style={{ fontSize: 30, color: '#d8d4cc', fontWeight: 700, marginTop: 16 }}>/</span>
          <div style={{ textAlign: 'center' }}><div style={secTitle}>สูงสุด</div><NumField value={max} onCommit={(v) => setSheet({ [maxKey]: v })} style={{ ...bigNum, color: '#8d8a82' }} /></div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, justifyContent: 'center' }}>
        <button onClick={onHeal} style={actBtn('#eef6f0', '#2f7d4f', '#cfe6d6')}>{healLabel}</button>
        <input type="number" value={amt} onChange={(e) => setAmt(Math.max(0, Math.round(Number(e.target.value) || 0)))} style={amtInput} />
        <button onClick={onDamage} style={actBtn('#f9eeea', '#c0432a', '#f0d0c4')}>{dmgLabel}</button>
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
            {editName ? (
              <input
                autoFocus
                defaultValue={character.name}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== character.name) patch.mutate({ name: v }); setEditName(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditName(false); }}
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 28, color: '#15140f', border: 'none', borderRadius: 8, padding: '2px 8px', width: '90%', maxWidth: 460 }}
              />
            ) : (
              <h1 onDoubleClick={() => setEditName(true)} title="ดับเบิลคลิกเพื่อเปลี่ยนชื่อ" style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 30, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'text' }}>{character.name || 'ตัวละครใหม่'}</h1>
            )}
            {(() => {
              const raceItem = featItemById.get(str('race'));
              const ancestryItem = featItemById.get(str('ancestry'));
              const classItem = featItemById.get(str('classFeatureId'));
              const link: React.CSSProperties = { color: '#f7dca0', fontWeight: 800, background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 };
              const nameNode = (label: string, item?: CatalogItem) => item
                ? <button onClick={() => openInfo(item, true)} title={`ดูข้อมูล: ${label}`} style={link}>{label} ⓘ</button>
                : <b style={{ color: '#eae7df', fontWeight: 800 }}>{label}</b>;
              return (
                <>
                  <div style={{ fontSize: 12.5, color: '#c9c5bd', marginTop: 6 }}>เผ่าพันธุ์: {raceName ? nameNode(raceName, raceItem) : <b style={{ color: '#eae7df' }}>—</b>}{ancestryName ? <> | {nameNode(ancestryName, ancestryItem)}</> : ''}</div>
                  <div style={{ fontSize: 12.5, color: '#c9c5bd', marginTop: 3 }}>Class Feature: {str('className') ? nameNode(str('className'), classItem) : '—'} | LV. {level}</div>
                </>
              );
            })()}
          </div>
          <div style={{ flex: 'none', width: 260, textAlign: 'right', overflow: 'hidden' }}>
            {editCamp ? (
              <input
                autoFocus
                defaultValue={svs('campaign', '')}
                placeholder="ชื่อแคมเปญ"
                onBlur={(e) => { setSheet({ campaign: e.target.value }); setEditCamp(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditCamp(false); }}
                style={{ fontSize: 15, color: '#15140f', border: 'none', borderRadius: 8, padding: '4px 8px', width: '100%', textAlign: 'right' }}
              />
            ) : (
              <div onDoubleClick={() => setEditCamp(true)} title="ดับเบิลคลิกเพื่อแก้ชื่อแคมเปญ" style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'text' }}>CAMPAIGN: {svs('campaign', 'ชื่อแคมเปญ')}</div>
            )}
            <div title={wiwonSets.join(', ')} style={{ fontSize: 12.5, color: '#c9c5bd', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Wiwon: {wiwonSets.join(', ') || '—'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <span style={{ fontSize: 11, color: '#c9c5bd', fontWeight: 700 }}>XP</span>
              <div title={`${xpPct}%`} style={{ position: 'relative', width: 180, height: 12, borderRadius: 7, background: '#3a382f', overflow: 'hidden' }}>
                <div style={{ width: `${xpPct}%`, height: '100%', background: 'linear-gradient(90deg,#e79b86,#e07a5f)', transition: 'width .3s' }} />
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: xpPct > 55 ? '#fff' : '#d8d4c8' }}>{xpPct}%</span>
              </div>
              <button onClick={canLevelUp ? levelUp : undefined} disabled={!canLevelUp} title={canLevelUp ? 'เลเวลอัพ — ไปเลือกรางวัลใน Step 2' : 'ยังไม่ถึงเกณฑ์เลเวลอัพ'} style={{ fontSize: 10, fontWeight: 800, color: canLevelUp ? '#15140f' : '#8a7a4a', background: canLevelUp ? '#f7dca0' : 'transparent', border: '1px solid #6a5a2a', borderRadius: 6, padding: '2px 7px', cursor: canLevelUp ? 'pointer' : 'default' }}>LV UP</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', marginTop: 6, fontSize: 11, color: '#a8a49a' }}>
              <span>{xp.toLocaleString()} / {xpMax.toLocaleString()} XP</span>
              {editXp ? (
                <input
                  autoFocus type="number" placeholder="+EXP"
                  onBlur={(e) => { const add = Math.round(Number(e.target.value) || 0); if (add) setSheet({ xp: Math.max(0, xp + add) }); setEditXp(false); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditXp(false); }}
                  style={{ width: 76, fontSize: 11.5, border: 'none', borderRadius: 6, padding: '3px 7px', textAlign: 'right' }}
                />
              ) : (
                <button onClick={() => setEditXp(true)} title="เพิ่ม EXP" style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', background: '#e07a5f', border: 'none', borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}>＋ EXP</button>
              )}
            </div>
          </div>
        </div>

        {/* ── Attributes row + Blessings ── */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 9 }}>
            {CORE_ATTR_OPTIONS.map((attr) => {
              const abbr = attr.match(/\(([^)]+)\)/)?.[1] ?? attr;
              const name = attr.replace(/\s*\(.*\)/, '');
              const g = byAbbr[abbr] ?? '—';
              const dFaces = STEP10_FACES[g] ?? 0;
              const aReasons = disReasons(abbr, '', '');
              const aDis = aReasons.length > 0;
              return (
                <div key={attr} style={{ position: 'relative', background: '#fbfaf8', border: '1px solid #e8e5df', borderRadius: 14, padding: '18px 8px 12px', minHeight: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <button
                    onClick={() => { if (dFaces > 0) { rollLabelRef.current = `${name} (${abbr})`; setRoll({ faces: dFaces, adv: false, dis: aDis }); } }}
                    title={`ทอย ${abbr} (d${dFaces})${aDis ? ` · Disadvantage: ${aReasons.join(', ')}` : ''}`}
                    style={{ position: 'absolute', top: -13, left: 10, background: aDis ? '#b4513a' : '#e07a5f', color: '#fff', fontSize: 14, fontWeight: 800, borderRadius: 9, padding: '5px 11px', border: '2px solid #fff', boxShadow: '0 3px 8px rgba(224,122,95,.45)', cursor: dFaces > 0 ? 'pointer' : 'default', lineHeight: 1 }}
                  >d{dFaces || '?'}{aDis && ' ▼'}</button>
                  <div style={{ position: 'absolute', top: 9, right: 11, fontSize: 13, fontWeight: 800, color: '#8d8a82' }}>{abbr}</div>
                  <div style={{ fontSize: 56, fontWeight: 800, color: '#35322b', lineHeight: 1 }}>{g}</div>
                  <div style={{ fontSize: 12.5, color: '#9a978e', marginTop: 8 }}>{name}</div>
                </div>
              );
            })}
          </div>
          <div style={{ flex: 'none', width: 240, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#8d8a82', fontWeight: 700, justifyContent: 'center', marginBottom: 8 }}>
              <span style={{ flex: 1, height: 1, background: '#e0ded7' }} />ได้รับการอวยพร<span style={{ flex: 1, height: 1, background: '#e0ded7' }} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9, justifyContent: 'space-between' }}>
              {[0, 1, 2].map((i) => {
                const on = !!blessings[i];
                return (
                  <button
                    key={i}
                    onClick={() => { const nb = [...blessings]; nb[i] = !on; setSheet({ blessings: nb }); }}
                    title={on ? 'กดเพื่อเอาพรออก' : 'กดเพื่อรับพร'}
                    style={{
                      flex: 1, minHeight: 34, borderRadius: 12, cursor: 'pointer',
                      background: on ? 'linear-gradient(90deg,#f7e27a,#f3d24e)' : '#f8f3d6',
                      border: `1.5px solid ${on ? '#d9b53a' : '#e6d99a'}`,
                      boxShadow: on ? '0 0 0 3px rgba(243,210,78,.28), 0 3px 10px rgba(200,160,40,.3)' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: on ? '#6a4e08' : '#c4b775', fontSize: 13, fontWeight: 800,
                      transition: 'all .15s',
                    }}
                  >
                    {on ? <><span style={{ fontSize: 17 }}>✦</span><span>{virtues[i]?.name || 'ได้รับพร'}</span><span style={{ fontSize: 17 }}>✦</span></> : <span style={{ fontSize: 15, opacity: .6 }}>＋</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Body: 3 columns ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '290px 300px 1fr', gap: 12, alignItems: 'start' }}>
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {poolBox('SANITY', '#2a5fbd', 'SAN TEMP', sanTemp, 'sanTemp', sanCur, sanMax, 'sanMax', 'ฟื้นฟูสภาพจิต', 'เสียหายต่อจิตใจ', sanAmt, setSanAmt, () => healPool('sanCur', sanCur, sanMax, sanAmt), () => damagePool('sanCur', 'sanTemp', sanCur, sanTemp, sanAmt))}
            <div style={{ ...box, padding: '10px 14px', fontSize: 12, color: '#9a978e', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              สถานะค่าสติปัจจุบัน:
              {sanStatuses.length === 0 ? <b style={{ color: '#3c3a33' }}>ปกติ</b> : sanStatuses.map((s) => <span key={s} style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 7, background: '#f9eeea', color: '#b0432a', border: '1px solid #f0d0c4' }}>{s}</span>)}
            </div>
            {poolBox('SCRATCH POINT', '#c15a3f', 'TEMP', scrTemp, 'scratchTemp', scrCur, scrMax, 'scrMax', infected ? 'ฟื้นฟู ×½' : 'ฟื้นฟู', 'บาดเจ็บ', scrAmt, setScrAmt, () => healPool('scratchCur', scrCur, scrMax, scratchHeal(scrAmt)), () => damagePool('scratchCur', 'scratchTemp', scrCur, scrTemp, scrAmt))}
            <div style={{ ...box, position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={secTitle}>WOUNDS POINT</span>
                <span style={{ display: 'flex', gap: 5 }}>
                  <button onClick={subGreen} disabled={woundGreen <= 0} title="ลดช่อง Have no impact" style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #e0ded7', background: woundGreen <= 0 ? '#f5f3ef' : '#fff', color: woundGreen <= 0 ? '#cfccc4' : '#6b6860', fontSize: 14, fontWeight: 800, cursor: woundGreen <= 0 ? 'not-allowed' : 'pointer' }}>−</button>
                  <button onClick={addGreen} disabled={woundGreen >= 4} title="เพิ่มช่อง Have no impact" style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #e0ded7', background: woundGreen >= 4 ? '#f5f3ef' : '#fff', color: woundGreen >= 4 ? '#cfccc4' : '#6b6860', fontSize: 14, fontWeight: 800, cursor: woundGreen >= 4 ? 'not-allowed' : 'pointer' }}>+</button>
                </span>
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
                {woundGreen > 0 && (
                  <div style={{ flex: 'none' }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#2f7d4f', marginBottom: 6 }}>Have no impact</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {Array.from({ length: woundGreen }).map((_, i) => (
                        <button key={i} onClick={() => tickGreen(i)} title="Have no impact" style={{ width: 20, height: 20, borderRadius: 5, border: '1px solid #bfe0c6', background: i < greenTicked ? '#7bc48a' : '#eaf5ec', cursor: 'pointer' }} />
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((lv) => {
                    const on = woundLevel >= lv;
                    const w = WOUND_LEVELS[lv];
                    return (
                      <button key={w.label} onClick={() => tickWound(lv)} title={`ติ๊กถึง ${w.label}`} style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                        <span style={{ width: 16, height: 16, borderRadius: 5, border: `1.5px solid ${w.color}`, background: on ? w.color : 'transparent', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 800 }}>{on ? '✓' : ''}</span>
                        <span style={{ fontSize: 12, fontWeight: on ? 800 : 500, color: on ? '#2f2c25' : '#8d8a82' }}>{lv}. {w.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {showDeathOverlay && (
                <div style={{ position: 'absolute', inset: 0, borderRadius: 12, background: 'rgba(26,20,24,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#f0c8c8', fontWeight: 800, fontSize: 15 }}>
                  <span>☠</span> ลมหายใจเฮือกสุดท้าย
                </div>
              )}
            </div>
            <div style={box}>
              <div style={secTitle}>THE LAST BREATH</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, flex: 1 }}>
                    {lbGreen.map((on, i) => (
                      <button key={i} onClick={() => toggleLB('lbGreen', lbGreen, i)} title="มีชีวิต" style={{ height: 30, borderRadius: 9, border: `1.5px solid ${on ? '#5aa06a' : '#cfe6d3'}`, background: on ? '#7bc48a' : '#eef7f0', color: on ? '#fff' : '#bcd7c1', fontSize: 15, fontWeight: 800, cursor: 'pointer', transition: 'all .12s' }}>{on ? '✚' : ''}</button>
                    ))}
                  </div>
                  <span style={{ width: 54, flex: 'none', fontSize: 11, color: '#2f7d4f', fontWeight: 800, textAlign: 'left' }}>ฟื้นกลับมา</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, flex: 1 }}>
                    {lbRed.map((on, i) => (
                      <button key={i} onClick={() => toggleLB('lbRed', lbRed, i)} title="ความตาย" style={{ height: 30, borderRadius: 9, border: `1.5px solid ${on ? '#c0432a' : '#f0d0c9'}`, background: on ? '#d9736b' : '#fbeeec', color: on ? '#fff' : '#e3b7b1', fontSize: 15, fontWeight: 800, cursor: 'pointer', transition: 'all .12s' }}>{on ? '☠' : ''}</button>
                    ))}
                  </div>
                  <span style={{ width: 54, flex: 'none', fontSize: 11, color: '#c0432a', fontWeight: 800, textAlign: 'left' }}>สิ้นใจ</span>
                </div>
              </div>
            </div>
          </div>

          {/* Middle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: '#1b1813', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: '#8d8a82' }}>📜 LOG แคมเปญ <span style={{ color: '#5f5c54', fontWeight: 400 }}>· เรียลไทม์ · ทุกคนเห็นเหมือนกัน</span></div>
                {campaignId && isLibrarian && campaignLog.length > 0 && (
                  <button onClick={() => { if (window.confirm('ล้างประวัติ Log ของทั้งแคมเปญ?')) logClear.mutate(); }} title="Librarian: ล้าง Log ทั้งหมด" style={{ flex: 'none', border: '1px solid #3a3730', background: '#221f1a', color: '#a8a59d', borderRadius: 7, padding: '3px 10px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>ล้าง LOG</button>
                )}
              </div>
              {!campaignId ? (
                <div style={{ fontSize: 12, color: '#6b6860', lineHeight: 1.6 }}>ตัวละครนี้ยังไม่อยู่ในแคมเปญ — เข้าร่วมแคมเปญ (หน้า Dweller → “เข้าร่วมด้วยรหัส”) เพื่อใช้ Log ประวัติการทอยร่วมกัน</div>
              ) : (
                <>
                  {campaignLog.length === 0 ? <div style={{ fontSize: 12, color: '#6b6860', marginBottom: 8 }}>ยังไม่มีบันทึก — ทอยเต๋า ใช้ Magic/Feature หรือพิมพ์ข้อความด้านล่างเพื่อบันทึก</div> : (
                    <div style={{ height: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7, paddingRight: 4, marginBottom: 8 }}>
                      {campaignLog.slice().reverse().map((l) => {
                        const refItem = l.itemId ? (l.isFeature ? featItemById.get(l.itemId) : magicItemById.get(l.itemId)) : null;
                        const r = l.roll;
                        return (
                          <div key={l.id} style={{ fontSize: 12, color: '#e8e4db', lineHeight: 1.5, borderBottom: '1px solid #2a2620', paddingBottom: 7 }}>
                            <span style={{ color: '#f7dca0', fontWeight: 700 }}>{l.characterName}</span> <span style={{ color: '#8d8a82', fontSize: 10.5 }}>· {new Date(l.at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span><br />{l.text}
                            {r && (
                              <div style={{ marginTop: 5, display: 'flex', gap: 12, alignItems: 'center' }}>
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, alignItems: 'center' }}>
                                  {rollParts(r).map((p, pi) => (
                                    <span key={pi} style={{ color: p.color ?? '#cbc3b4', fontWeight: 700 }}>{p.label} {p.value}<span style={{ color: '#7a7a72', fontWeight: 400 }}>{p.faces ? ` d${p.faces}` : ''}</span>{p.mode && p.mode !== 'normal' && <span style={{ marginLeft: 3, fontWeight: 800, color: p.mode === 'adv' ? '#2fd18b' : '#ff6a6a' }}>{rollSym(p.mode)}{p.mode === 'adv' ? 'Adv' : 'Dis'}</span>}</span>
                                  ))}
                                </div>
                                <div style={{ flex: 'none', textAlign: 'center', background: '#1c1e12', border: `1px solid ${rollTotalColor(r)}55`, borderRadius: 12, padding: '5px 13px', minWidth: 60 }}>
                                  <div style={{ fontSize: 9, fontWeight: 700, color: '#a8a8a0', letterSpacing: '.08em' }}>รวม</div>
                                  <div style={{ fontSize: 27, fontWeight: 800, color: rollTotalColor(r), lineHeight: 1 }}>{r.total}</div>
                                </div>
                              </div>
                            )}
                            {r?.special && <div style={{ marginTop: 3, fontSize: 11.5, color: '#f7dca0' }}>✦ {r.special}</div>}
                            {refItem && <button onClick={() => openInfo(refItem, !!l.isFeature)} title="ดูข้อมูลจากต้นฉบับ" style={{ marginTop: 3, display: 'inline-block', border: '1px solid #3a3730', background: '#221f1a', color: '#cbb8f0', borderRadius: 6, padding: '2px 9px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>ⓘ ดูข้อมูล{l.isFeature ? ' Feature' : 'เวท'}</button>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Free-form broadcast → everyone in the campaign sees it in the shared Log */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={logNote}
                      onChange={(e) => setLogNote(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && logNote.trim()) { logRef.current('note', `📝 ${logNote.trim()}`); setLogNote(''); } }}
                      placeholder="ส่งรายละเอียด/แอ็คชันเข้า Log ให้ทุกคนเห็น…"
                      style={{ flex: 1, minWidth: 0, border: '1px solid #3a3730', background: '#221f1a', color: '#f3ede1', borderRadius: 8, padding: '7px 10px', fontSize: 12, outline: 'none' }}
                    />
                    <button onClick={() => { if (logNote.trim()) { logRef.current('note', `📝 ${logNote.trim()}`); setLogNote(''); } }} disabled={!logNote.trim()} style={{ flex: 'none', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: logNote.trim() ? 'pointer' : 'not-allowed', background: logNote.trim() ? '#e07a5f' : '#3a3730', color: '#fff' }}>ส่ง</button>
                  </div>
                </>
              )}
            </div>
            <div style={box}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ ...secTitle, color: '#2f6b4f' }}>สถานะเสริม (Buff)</span>
                <button onClick={() => { setEffQuery(''); setBuffModal(true); }} style={{ padding: '3px 11px', background: '#15140f', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>＋ เลือก</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.keys(buffsOn).length === 0 ? <span style={{ fontSize: 11.5, color: '#bdbab2' }}>— ยังไม่มีบัฟ —</span> : Object.keys(buffsOn).map((k) => {
                  const b = BUFF_EFFECTS.find((e) => e[0] === k);
                  return <span key={k} title={b?.[2]} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, padding: '3px 6px 3px 10px', borderRadius: 8, background: '#f3f9f5', color: '#2f6b4f', border: '1px solid #cbe0d2', cursor: 'help' }}>{b?.[1] ?? k}<button onClick={() => toggleBuff(k)} style={{ border: 'none', background: 'none', color: '#5fa07a', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button></span>;
                })}
              </div>
            </div>
            <div style={box}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ ...secTitle, color: '#c0432a' }}>สถานะผิดปกติ (Debuff)</span>
                <button onClick={() => { setEffQuery(''); setStatusModal(true); }} style={{ padding: '3px 11px', background: '#15140f', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>＋ เลือก</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {activeWoundDebuffs.map((db) => <span key={db} title="ผลจากระดับบาดเจ็บ" style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: '#f9eeea', color: '#b0432a', border: '1px solid #f0d0c4' }}>{db}</span>)}
                {deathDoor && <span style={{ fontSize: 11.5, fontWeight: 800, padding: '3px 10px', borderRadius: 8, background: '#2f2c25', color: '#f0c8c8' }}>☠ ลมหายใจเฮือกสุดท้าย</span>}
                {Object.keys(statusOn).map((k) => {
                  const st = STATUS_EFFECTS.find((e) => e[0] === k);
                  return <span key={k} title={st?.[2]} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, padding: '4px 6px 4px 11px', borderRadius: 8, background: '#fbeae6', color: '#b4513a', border: '1px solid #f0d3cb', cursor: 'help' }}>{st?.[1] ?? k}<button onClick={() => toggleStatus(k)} style={{ border: 'none', background: 'none', color: '#cb5a44', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button></span>;
                })}
                {['นอนไม่หลับ', 'หูแว่วและภาพหลอน'].filter((k) => activeStatusSet.has(k) && !statusOn[k]).map((k) => (
                  <span key={k} title="เกิดจากบาดแผลทางจิตใจ (อัตโนมัติ)" style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: '#f9eeea', color: '#b0432a', border: '1px solid #f0d0c4' }}>{k}</span>
                ))}
                {overloaded && !statusOn['Overburdened'] && <span title={`แบกอยู่ ${carryKg} / ${carryMax} kg — เกินพิกัด 20% ของน้ำหนักตัว (อัตโนมัติ)`} style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: '#f9eeea', color: '#b0432a', border: '1px solid #f0d0c4', cursor: 'help' }}>🪨 แบกของหนัก · แบกภาระเกิน</span>}
                {activeWoundDebuffs.length === 0 && !deathDoor && Object.keys(statusOn).length === 0 && !activeStatusSet.has('นอนไม่หลับ') && !overloaded && <span style={{ fontSize: 11.5, color: '#bdbab2' }}>ยังไม่มีสถานะผิดปกติ — กด “เลือก”</span>}
              </div>
            </div>
            <div style={{ ...box, position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={secTitle}>ความชำนาญ / Proficiency</span>
                <button onClick={() => setProfPicker((o) => !o)} title="เพิ่ม Specialization" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: profPicker ? '#e07a5f' : '#c9c5bd', fontWeight: 700, lineHeight: 1 }}>+</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {/* From character creation — matched by tag (read-only, with ⓘ) */}
                {profCreation.map((f) => (
                  <span key={f.id} title={`จากการสร้างตัวละคร · ${f.tags.filter((t) => PROF_MATCH_TAGS.includes(t)).join(', ')}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, padding: '3px 6px 3px 10px', borderRadius: 8, background: '#f2f8f4', color: '#2f7d4f', border: '1px solid #cfe6d6' }}>
                    {f.name}
                    <button onClick={() => openInfo(f, true)} title="ดูข้อมูล" style={{ border: 'none', background: 'none', color: '#5fa07a', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}>ⓘ</button>
                  </span>
                ))}
                {proficiencies.map((id) => (
                  <button key={id} onClick={() => removeProf(id)} title="กดเพื่อเอาออก" style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: '#eef6f0', color: '#2f7d4f', border: '1px solid #cfe6d6', cursor: 'pointer' }}>{featById.get(id)?.name ?? '(Specialization)'} ✕</button>
                ))}
                {profCreation.length === 0 && proficiencies.length === 0 && <span style={{ fontSize: 12, color: '#bdbab2' }}>—</span>}
              </div>
              {profPicker && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, background: '#fff', border: '1px solid #e4e1d9', borderRadius: 10, boxShadow: '0 10px 26px rgba(0,0,0,.14)', maxHeight: 220, overflowY: 'auto', padding: 6 }}>
                  {specPool.filter((f) => !proficiencies.includes(f.id)).length === 0 ? (
                    <div style={{ fontSize: 12, color: '#bdbab2', padding: '8px 10px', textAlign: 'center' }}>ไม่มี Feature แท็ก Specialization เพิ่มเติม</div>
                  ) : specPool.filter((f) => !proficiencies.includes(f.id)).map((f) => (
                    <button key={f.id} onClick={() => { addProf(f.id); }} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '7px 10px', fontSize: 12.5, color: '#3c3a33', cursor: 'pointer', borderRadius: 7 }}>{f.name}</button>
                  ))}
                </div>
              )}
            </div>
            <div style={box}>
              <div style={{ ...secTitle, marginBottom: 10 }}>ภาษา <span style={{ color: '#cbc8c0' }}>/ Language</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {langCreation.length > 0 && (
                  <div style={{ borderBottom: '1px solid #eef1f5', paddingBottom: 9 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#a8a59d', marginBottom: 5 }}>จากการสร้างตัวละคร (Feature: Language)</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {langCreation.map((f) => (
                        <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#eef2f6', borderRadius: 6, padding: '2px 6px 2px 9px', color: '#46587a', fontSize: 11, fontWeight: 600 }}>
                          {f.name}
                          <button onClick={() => openInfo(f, true)} title="ดูข้อมูล" style={{ border: 'none', background: 'none', color: '#8fa0bd', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}>ⓘ</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {LANG_TIER_DEFS.map((t) => {
                  const items = langs.filter((l) => l.tier === t.key);
                  const opts = languages.filter((nm) => !langs.some((l) => l.name === nm));
                  return (
                    <div key={t.key} style={{ position: 'relative' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#46587a' }}>{t.label}</span>
                        <button onClick={() => setLangPick(langPick === t.key ? null : t.key)} style={{ padding: '1px 9px', background: '#eef2f6', border: '1px solid #cdd8e6', color: '#46587a', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>＋</button>
                      </div>
                      {langPick === t.key && (
                        <div style={{ position: 'absolute', zIndex: 30, top: 24, right: 0, width: 200, background: '#fff', border: '1px solid #cdd8e6', borderRadius: 9, boxShadow: '0 12px 30px rgba(0,0,0,.14)', padding: 6, maxHeight: 220, overflow: 'auto' }}>
                          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color: '#a8a59d', padding: '3px 6px 5px' }}>เลือกจาก Feature: Language</div>
                          {opts.length === 0 ? <div style={{ fontSize: 10.5, color: '#cbc8c0', padding: '4px 6px' }}>ยังไม่มี Feature ที่แท็ก “Language”</div> : opts.map((nm) => (
                            <button key={nm} onClick={() => { addLang(t.key, nm); setLangPick(null); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 9px', border: 'none', background: 'none', borderRadius: 6, fontSize: 11.5, color: '#46443c', cursor: 'pointer' }}>{nm}</button>
                          ))}
                          <div style={{ borderTop: '1px solid #f0eee9', marginTop: 5, paddingTop: 5, display: 'flex', gap: 6 }}>
                            <button onClick={() => { addLang(t.key, 'ภาษาใหม่'); setLangPick(null); }} style={{ flex: 1, padding: 5, border: '1px dashed #cdd8e6', background: '#faf9f7', color: '#46587a', borderRadius: 6, fontSize: 10.5, fontWeight: 600, cursor: 'pointer' }}>＋ พิมพ์เอง</button>
                            <button onClick={() => setLangPick(null)} style={{ flex: 'none', padding: '5px 10px', border: '1px solid #e0ded7', background: '#fff', color: '#8d8a82', borderRadius: 6, fontSize: 10.5, cursor: 'pointer' }}>ปิด</button>
                          </div>
                        </div>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {items.length === 0 ? <span style={{ fontSize: 10.5, color: '#cbc8c0' }}>—</span> : items.map((l) => (
                          <span key={l.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#eef2f6', borderRadius: 6, padding: '2px 5px 2px 9px', color: '#46587a' }}>
                            <input key={l.name} defaultValue={l.name} onBlur={(e) => { if (e.target.value !== l.name) setLang(l.id, e.target.value); }} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 11, color: '#46587a', width: 66 }} />
                            <button onClick={() => delLang(l.id)} style={{ border: 'none', background: 'none', color: '#9aa7bd', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>×</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr 1fr', gap: 12, alignItems: 'stretch' }}>
              {/* INITIATIVE — clickable to roll, coral accent */}
              <div style={{ position: 'relative', borderRadius: 14, padding: '12px 14px', background: 'linear-gradient(160deg,#fdf3ee,#f7ede2)', border: '1px solid #eeddcb', boxShadow: '0 1px 0 #fff inset', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ flex: 'none', width: 26, height: 26, borderRadius: 8, background: '#e07a5f', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, boxShadow: '0 2px 6px rgba(224,122,95,.4)' }}>⚔️</span>
                  <span style={{ flex: 1, fontFamily: 'var(--font-serif)', fontSize: 13.5, fontWeight: 700, color: '#8a5a44', letterSpacing: '.02em' }}>INITIATIVE</span>
                  <button onClick={resetInitiative} title="รีเซ็ตเป็น 0" style={{ flex: 'none', border: '1px solid #ecd7cc', background: '#fff', color: '#b0725e', borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>↺ Reset</button>
                </div>
                <button onClick={rollInitiative} title="ทอย Initiative = 10 + DEX + PER" style={{ border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 34, fontWeight: 800, color: '#e07a5f', lineHeight: 1 }}>{sv('initiativeRolled', 0) || '—'}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#c58a72', background: '#fff', border: '1px solid #f0dbcf', borderRadius: 7, padding: '3px 9px' }}>🎲 ทอย</span>
                </button>
                <span style={{ fontSize: 9.5, color: '#bb9a86' }}>10 + DEX + PER · กดเลขเพื่อทอย</span>
              </div>
              {/* NATURAL DEFENSE — teal accent */}
              <div style={{ borderRadius: 14, padding: '12px 14px', background: 'linear-gradient(160deg,#eef7f1,#e6f1ea)', border: '1px solid #cfe6d6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }} title={naFromGear > 0 ? `ฐาน ${natureDef} + เกราะ/โล่ ${naFromGear}` : undefined}>
                <span style={{ fontSize: 16 }}>🛡️</span>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#2f6b4f', lineHeight: 1 }}>{natureDef + naFromGear}</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#5a8a72', letterSpacing: '.03em' }}>Natural Defense</div>
                {naFromGear > 0 && <div style={{ fontSize: 9.5, color: '#2f6b4f', fontWeight: 700, background: '#fff', border: '1px solid #cfe6d6', borderRadius: 6, padding: '1px 7px' }}>เกราะ/โล่ +{naFromGear}</div>}
              </div>
              {/* MOVEMENT — earthy accent */}
              <div style={{ borderRadius: 14, padding: '12px 14px', background: 'linear-gradient(160deg,#faf5ea,#f4ecdb)', border: '1px solid #e8dcc2', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }} title={movementHalf ? `เหลือครึ่ง (ปกติ ${movement} เมตร)` : undefined}>
                <span style={{ fontSize: 16 }}>👣</span>
                <div style={{ fontSize: 32, fontWeight: 800, color: movementHalf ? '#b4513a' : '#8a6a3a', lineHeight: 1 }}>{effMovement}<span style={{ fontSize: 14 }}> M.</span>{movementHalf && <span style={{ fontSize: 13 }}> ½</span>}</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#a08a5a', letterSpacing: '.03em' }}>Movement</div>
              </div>
            </div>
            {(() => {
              const apMax = sv('apMax', 3);
              const apCur = sv('apCur', apMax);
              const apRes = sv('apRes', 0); // reserve slot (0/1) — Next Round never fills it
              const roundNum = sv('roundNum', 1);
              const WP_MAX = 3;
              const wpCur = despair ? 0 : sv('wpCur', WP_MAX);
              const phase = svs('apPhase', 'Action');
              return (
                <div style={{ background: '#f0eee9', borderRadius: 20, padding: 16 }}>
                  {/* phase pills */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                    {['Action', 'On Hand', 'Ehen', 'Short Rest', 'Long Rest'].map((t) => {
                      const on = phase === t;
                      return <button key={t} onClick={() => setSheet({ apPhase: t })} style={{ fontSize: 13, fontWeight: 800, padding: '9px 20px', borderRadius: 22, cursor: 'pointer', border: `1px solid ${on ? '#f0b4aa' : '#eae7e0'}`, background: on ? '#f7cdc6' : '#fff', color: on ? '#b0503f' : '#6b5b45' }}>{t}</button>;
                    })}
                  </div>
                  {/* white card */}
                  <div style={{ background: '#fff', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {phase === 'On Hand' ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#6b5b45' }}>ของในมือ (On Hand) <span style={{ fontSize: 11, fontWeight: 400, color: '#a8a59d' }}>· Weapon / Shield / Artifact · กด Use เพื่อถือ</span></span>
                          <button onClick={addHandSlot} title="เพิ่มช่อง (หาง / เกราะ / อื่น ๆ)" style={{ flex: 'none', border: '1px solid #cbe0d2', background: '#eef6f0', color: '#2f6b4f', borderRadius: 8, padding: '5px 11px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>＋ เพิ่มช่อง</button>
                        </div>
                        {handWarn && <div style={{ fontSize: 11.5, color: '#c0432a', background: '#fdf1ee', border: '1px solid #f2cabf', borderRadius: 8, padding: '7px 11px', marginBottom: 10 }}>⚠️ {handWarn}</div>}
                        {hasTitansGrip && <div style={{ fontSize: 11, color: '#8a6a3a', background: '#fff8ef', border: '1px solid #efe0cd', borderRadius: 8, padding: '6px 11px', marginBottom: 10 }}>💪 มี Feature “Titan’s Grip” — ถืออาวุธสองมือด้วยมือเดียวได้</div>}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                          {HAND_SLOTS.map((s) => {
                            const on = handOn(s.key);
                            const item = hands[s.key];
                            return (
                              <div key={s.key} style={{ border: `1px solid ${on ? '#cbe0d2' : '#eae7e0'}`, borderRadius: 12, padding: 11, background: on ? '#f7fbf8' : '#f6f5f2', opacity: on ? 1 : 0.7 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 8 }}>
                                  {s.extra
                                    ? <input key={s.label} defaultValue={s.label} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== s.label) renameHandSlot(s.key, e.target.value.trim()); }} title="แก้ชื่อช่อง" style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontSize: 12.5, fontWeight: 800, color: on ? '#2f6b4f' : '#a8a59d' }} />
                                    : <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800, color: on ? '#2f6b4f' : '#a8a59d' }}>{s.label}</span>}
                                  <button onClick={() => toggleHandSlot(s.key)} title={on ? 'ปิดช่องนี้' : 'เปิดช่องนี้'} style={{ border: '1px solid #e0ded7', background: '#fff', color: on ? '#2f6b4f' : '#a8a59d', borderRadius: 7, padding: '2px 9px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>{on ? 'เปิด' : 'ปิด'}</button>
                                  {s.extra && <button onClick={() => removeHandSlot(s.key)} title="ลบช่องนี้" style={{ border: 'none', background: 'none', color: '#cb5a44', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>}
                                </div>
                                {!on ? (
                                  <div style={{ fontSize: 11, color: '#bdbab2', padding: '6px 0' }}>— ปิดช่องอยู่ —</div>
                                ) : item ? (
                                  <div>
                                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2f2c25' }}>{item.name}{item.twoHand && <span title="อาวุธสองมือ" style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 5, background: '#efe6f6', color: '#5b3fa0' }}>✋✋ สองมือ{item.secondary ? ' (มือรอง)' : ''}</span>}</div>
                                    <div style={{ fontSize: 10.5, color: '#9a978e', marginBottom: 8 }}>{numData(item.kg)} kg</div>
                                    {isDefensive(item.name) && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, background: '#eef6f0', border: '1px solid #cfe6d6', borderRadius: 8, padding: '4px 8px' }}>
                                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#2f6b4f' }}>Natural Defense +</span>
                                        <NumField value={numData(item.na)} onCommit={(v) => setHand(s.key, { ...item, na: v })} width={44} style={{ fontSize: 12, padding: '2px 5px' }} />
                                      </div>
                                    )}
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      <button onClick={() => { const it = item.itemId ? equipById.get(item.itemId) : undefined; if (it) openInfo(it, false); else setHandInfo({ lineId: s.key, itemId: item.itemId ?? '', name: item.name, priceIC: 0, kg: item.kg }); }} title="รายละเอียด" style={{ flex: 1, border: '1px solid #cbe0d2', background: '#fff', color: '#2f6b4f', borderRadius: 8, padding: '5px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>ⓘ รายละเอียด</button>
                                      <button onClick={() => clearHand(s.key)} title="เอาออกจากมือ" style={{ flex: 'none', border: '1px solid #f0d3cb', background: '#fbeae6', color: '#b4513a', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>เอาออก</button>
                                    </div>
                                  </div>
                                ) : (
                                  <button onClick={() => setHandSlot(s.key)} style={{ width: '100%', border: '1px dashed #cbe0d2', background: '#fff', color: '#2f6b4f', borderRadius: 9, padding: '10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>＋ Use ไอเทม</button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : phase === 'Ehen' ? (
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#6b5b45', marginBottom: 10 }}>Ehen <span style={{ fontSize: 11, fontWeight: 400, color: '#a8a59d' }}>· ความหนาแน่นของอีเฮนรอบตัว — เลือกแล้วกดทอย</span></div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {EHEN_DENSITY.map((e) => {
                            const sel = svs('ehenDensity') === e.key;
                            return (
                              <div key={e.key} style={{ flex: '1 1 120px', border: `1.5px solid ${sel ? '#7c5fc0' : '#e4e1d9'}`, background: sel ? '#faf8fd' : '#fff', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                                <button onClick={() => setSheet({ ehenDensity: e.key })} style={{ display: 'block', width: '100%', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 800, color: sel ? '#5b3fa0' : '#3c3a33', marginBottom: 8 }}>{e.label}</button>
                                <button onClick={() => { setSheet({ ehenDensity: e.key }); setRoll({ faces: e.faces, adv: false }); }} title={`ทอย d${e.faces}`} style={{ width: '100%', border: 'none', borderRadius: 9, padding: '8px', background: '#5b3fa0', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>d{e.faces} 🎲</button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : phase === 'Short Rest' ? (
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#6b5b45', marginBottom: 8 }}>พักสั้น (Short Rest)</div>
                        <div style={{ fontSize: 12, color: '#8d8a82', lineHeight: 1.6, marginBottom: 12 }}>เพิ่ม Scratch เท่ากับ END (<b>d{endFaces}</b>) ทอย 1 ครั้ง · ฟื้นฟู Willpower 1 ช่อง</div>
                        <button onClick={doShortRest} style={{ width: '100%', padding: 12, background: '#4a463d', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}>☾ ทำการพักสั้น</button>
                        {restMsg && <div style={{ marginTop: 12, fontSize: 12, fontWeight: 600, color: '#2f6b4f', background: '#eef6f0', border: '1px solid #cfe6d6', borderRadius: 9, padding: '9px 12px', lineHeight: 1.6, display: 'flex', gap: 8, alignItems: 'flex-start' }}><span style={{ flex: 1 }}>{restMsg}</span><button onClick={() => setRestMsg('')} style={{ flex: 'none', border: '1px solid #cfe6d6', background: '#fff', color: '#2f6b4f', borderRadius: 7, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>รับทราบ ✓</button></div>}
                      </div>
                    ) : phase === 'Long Rest' ? (
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#6b5b45', marginBottom: 4 }}>พักยาว (Long Rest)</div>
                        <div style={{ fontSize: 11.5, color: '#8d8a82', lineHeight: 1.55, marginBottom: 10 }}>Scratch += ฟื้นกำลัง (<b>{recInfo.label}</b>) · WOUNDS −1 · ไม่ฟื้นค่าสติจากการพัก</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 6, marginBottom: 10 }}>
                          {cbx('สถานที่นี้ปลอดภัย', lr.safe, () => setLr((v) => ({ ...v, safe: !v.safe })))}
                          {cbx('อาหารวันนี้อร่อย', lr.goodFood, () => setLr((v) => ({ ...v, goodFood: !v.goodFood })))}
                          {cbx('ฝันดี', lr.goodDream, () => setLr((v) => ({ ...v, goodDream: !v.goodDream })))}
                          {cbx('อาหารวันนี้ไม่อร่อย', lr.badFood, () => setLr((v) => ({ ...v, badFood: !v.badFood })))}
                          {cbx('ฝันร้าย', lr.badDream, () => setLr((v) => ({ ...v, badDream: !v.badDream })))}
                          {cbx('นอนไม่หลับ', lr.noSleep, () => setLr((v) => ({ ...v, noSleep: !v.noSleep })))}
                        </div>
                        {(() => {
                          const usedFeats = featRows.filter((r) => (featTrack[r.key]?.used ?? 0) > 0);
                          if (usedFeats.length === 0) return null;
                          return (
                            <div style={{ marginBottom: 10, border: '1px solid #e6e0cf', borderRadius: 9, background: '#faf8f2', padding: '8px 11px' }}>
                              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#a0894a', marginBottom: 6 }}>✦ Active Feature ที่ใช้ไป — พักยาวจะคืนทั้งหมด</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {usedFeats.map((r) => <span key={r.key} style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 7, background: '#fff', color: '#8a6a3a', border: '1px solid #eadfc7' }}>{r.name} · ใช้ {featTrack[r.key]?.used}{featUsesMax(r) != null ? `/${featUsesMax(r)}` : ''}</span>)}
                              </div>
                            </div>
                          );
                        })()}
                        {insomnia && <div style={{ fontSize: 11.5, fontWeight: 700, color: '#b4513a', background: '#fbeae6', border: '1px solid #f0d3cb', borderRadius: 9, padding: '8px 11px', marginBottom: 8 }}>🚫 ติดสถานะ “นอนไม่หลับ” — ไม่สามารถพักยาวได้</div>}
                        <button onClick={doLongRest} disabled={insomnia} style={{ width: '100%', padding: 12, background: insomnia ? '#cfccc4' : '#15140f', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13.5, fontWeight: 800, cursor: insomnia ? 'not-allowed' : 'pointer' }}>🌙 ทำการพักยาว</button>
                        {restMsg && <div style={{ marginTop: 12, fontSize: 12, fontWeight: 600, color: '#5f5030', background: '#f6f4ea', border: '1px solid #e6e0cf', borderRadius: 9, padding: '9px 12px', lineHeight: 1.6, display: 'flex', gap: 8, alignItems: 'flex-start' }}><span style={{ flex: 1 }}>{restMsg}</span><button onClick={() => setRestMsg('')} style={{ flex: 'none', border: '1px solid #e6e0cf', background: '#fff', color: '#8a6a3a', borderRadius: 7, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>รับทราบ ✓</button></div>}
                      </div>
                    ) : (<>
                    {/* ── row 1: AP · Next Round · Will-power ── */}
                    <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
                      {/* Action Point */}
                      <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#6b5b45' }}>Action Point (AP)</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {Array.from({ length: Math.max(1, apMax) }).map((_, i) => (
                            <button key={i} onClick={() => setSheet({ apCur: i + 1 === apCur ? i : i + 1 })} title="กดปรับ AP" style={{ width: 34, height: 34, borderRadius: 9, cursor: 'pointer', border: 'none', background: i < apCur ? '#4a463d' : '#d3cec5' }} />
                          ))}
                          <button onClick={() => setSheet({ apRes: apRes ? 0 : 1 })} title="ช่องสำรอง — กดเติม/เอาออก (Next Round ไม่เติมช่องนี้)" style={{ width: 34, height: 34, borderRadius: 9, cursor: 'pointer', border: '2px dashed #dcc6bd', background: apRes ? '#4a463d' : '#faf6f4' }} />
                        </div>
                        <button onClick={() => setSheet(apCur > 0 ? { apCur: apCur - 1 } : apRes ? { apRes: 0 } : {})} style={{ background: '#4a463d', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Action -1 AP</button>
                        <button onClick={() => setSheet(apCur > 0 ? { apCur: apCur - 1 } : apRes ? { apRes: 0 } : {})} style={{ background: '#4a463d', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Reaction</button>
                      </div>
                      {/* Next Round */}
                      <div style={{ position: 'relative', flex: '0 0 auto', background: '#59544c', borderRadius: 14, padding: '30px 18px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 116, cursor: 'pointer' }} onClick={() => {
                        const dmg = (bleeding ? 2 : 0) + (burning ? rollDie(6) : 0);
                        const p: Record<string, unknown> = { roundNum: roundNum + 1, apCur: Math.min(apMax, apCur + 2) };
                        if (dmg > 0) { let a = dmg, t = scrTemp; const d0 = Math.min(t, a); t -= d0; a -= d0; p.scratchTemp = t; p.scratchCur = Math.max(0, scrCur - a); }
                        setSheet(p);
                        if (dmg > 0) setRestMsg(`รอบใหม่: Scratch −${dmg}${bleeding ? ' (เลือดออก −2)' : ''}${burning ? ' (ถูกเผาไหม้ −d6)' : ''}`);
                      }} title={`ขึ้นรอบถัดไป (+2 AP)${bleeding ? ' · เลือดออก −2 Scratch' : ''}${burning ? ' · ถูกเผาไหม้ −d6 Scratch' : ''}`}>
                        <button onClick={(e) => { e.stopPropagation(); setSheet({ roundNum: 1, apCur: apMax }); }} style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', background: '#736e66', color: '#e8e5df', border: 'none', borderRadius: 8, padding: '2px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Reset</button>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.15, textAlign: 'center' }}>Next<br />Round</div>
                        <div style={{ fontSize: 34, fontWeight: 800, color: '#37d39e', lineHeight: 1 }}>{roundNum}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>+2 AP</div>
                      </div>
                      {/* Will-power — 3 segments, centered */}
                      <div style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: '#6b5b45' }}>WILL-POWER</span>
                          <span style={{ fontSize: 11, color: '#9a978e', fontWeight: 700 }}>{wpCur} / {WP_MAX}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, justifyContent: 'center' }}>
                          {Array.from({ length: WP_MAX }).map((_, i) => (
                            <button key={i} disabled={despair} onClick={() => { if (!despair) setSheet({ wpCur: i + 1 === wpCur ? i : i + 1 }); }} title={despair ? 'สิ้นหวัง — Willpower หายไป' : `${wpCur} / ${WP_MAX}`} style={{ height: 20, borderRadius: 6, cursor: despair ? 'not-allowed' : 'pointer', border: 'none', background: i < wpCur ? `rgba(105,145,175,${1 - (i / WP_MAX) * 0.4})` : '#e3edf2' }} />
                          ))}
                        </div>
                      </div>
                    </div>
                    {/* ── row 2: calories & thirst (equal-width tiles) ── */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
                      {(() => {
                        const eaten = sv('calEaten', 0); // amount typed in the green box
                        const stored = sv('calStored', 0);
                        const addStored = () => { if (eaten > 0) setSheet({ calStored: stored + eaten }); };
                        const subStored = () => { if (eaten > 0) setSheet({ calStored: Math.max(0, stored - eaten) }); };
                        const stepBtn: React.CSSProperties = { flex: 1, border: '1px solid #a9c07f', borderRadius: 7, padding: '5px 4px', fontSize: 10.5, fontWeight: 700, cursor: eaten > 0 ? 'pointer' : 'not-allowed', background: '#eaf1d8', color: '#5f6b33', opacity: eaten > 0 ? 1 : 0.5 };
                        return (
                          <>
                            {/* ทาน — type an amount; the buttons apply it to Cal สะสม */}
                            <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, height: 16 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: '#2f9d6a' }} /><span style={{ fontSize: 12.5, fontWeight: 800, color: '#6b5b45' }}>ทาน</span></div>
                              <div style={{ background: '#c4e4d2', borderRadius: 12, padding: '8px', textAlign: 'center' }}>
                                <NumField value={eaten} onCommit={(v) => setSheet({ calEaten: Math.max(0, v) })} width={70} style={{ fontSize: 22, fontWeight: 800, color: '#2f7d6a', textAlign: 'center', background: 'transparent', border: 'none', padding: 0 }} />
                              </div>
                              <div style={{ display: 'flex', gap: 4, marginTop: 5, alignItems: 'center' }}>
                                <button onClick={addStored} disabled={eaten <= 0} title="เพิ่มจำนวนนี้เข้า Cal สะสม" style={stepBtn}>→ สะสม</button>
                                <button onClick={subStored} disabled={eaten <= 0} title="ลดจำนวนนี้ออกจาก Cal สะสม" style={stepBtn}>− ลดที่กิน</button>
                              </div>
                            </div>
                            {/* Cal สะสม — read-only, changes only via the ทาน buttons */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, height: 16 }}><span style={{ fontSize: 12.5, fontWeight: 800, color: '#6b5b45' }}>Cal. สะสม</span><span title="แก้เองไม่ได้ — เปลี่ยนผ่านปุ่ม “→ สะสม / − ลดที่กิน” ของ ทาน" style={{ fontSize: 10, color: '#a8a59d' }}>🔒</span></div>
                              <div style={{ flex: 1, background: '#d4e1b7', borderRadius: 12, padding: '10px 8px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: poisoned ? 0.5 : 1 }} title={poisoned ? 'สารพิษสะสม — Cal. สะสม ไม่ถูกนับ' : 'แก้เองไม่ได้'}>
                                <span style={{ fontSize: 22, fontWeight: 800, color: '#5f5030' }}>{stored}</span>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                      <div style={{ flex: 1.4, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#6b5b45', marginBottom: 4, height: 16 }}>ดับหิว</div>
                        <div style={{ flex: 1, background: '#d4e1b7', borderRadius: 12, padding: '8px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} title="ฐานจากน้ำหนักตัว (~30 kcal/kg) + ปรับเองได้">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button onClick={() => setSheet({ calGoalAdj: sv('calGoalAdj', 0) - 100 })} title="ลด 100" style={{ flex: 'none', width: 24, height: 24, borderRadius: 7, border: '1px solid #b7c98f', background: '#eaf1d8', color: '#5f5030', fontSize: 15, fontWeight: 800, cursor: 'pointer', lineHeight: 1 }}>−</button>
                            <div style={{ fontSize: 28, fontWeight: 800, color: '#5f5030', lineHeight: 1, minWidth: 66 }}>{Math.max(0, calGoalAuto + sv('calGoalAdj', 0))}</div>
                            <button onClick={() => setSheet({ calGoalAdj: sv('calGoalAdj', 0) + 100 })} title="เพิ่ม 100" style={{ flex: 'none', width: 24, height: 24, borderRadius: 7, border: '1px solid #b7c98f', background: '#eaf1d8', color: '#5f5030', fontSize: 15, fontWeight: 800, cursor: 'pointer', lineHeight: 1 }}>＋</button>
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#8a7a52', marginTop: 2 }}>Calories ที่ต้องการ{bmiWarn && <span style={{ color: '#b4513a' }}> ({bmiWarn})</span>}</div>
                          {sv('calGoalAdj', 0) !== 0 && <div style={{ fontSize: 9, color: '#8a7a52' }}>ฐาน {calGoalAuto} · ปรับ {sv('calGoalAdj', 0) > 0 ? '+' : ''}{sv('calGoalAdj', 0)}<button onClick={() => setSheet({ calGoalAdj: 0 })} style={{ marginLeft: 5, border: 'none', background: 'none', color: '#a08a5a', cursor: 'pointer', fontSize: 9, textDecoration: 'underline' }}>รีเซ็ต</button></div>}
                          {bmiWarn && <div style={{ fontSize: 9.5, color: '#b4513a', fontWeight: 700, marginTop: 1 }}>⚠️ BMI {bmi.toFixed(1)}</div>}
                        </div>
                      </div>
                      {(() => {
                        const WATER_SLOTS = 2;
                        const drunk = Math.max(0, Math.min(WATER_SLOTS, sv('waterCur', 0)));
                        const thirsty = drunk === 0;
                        return (
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, height: 16 }}>
                              <span style={{ fontSize: 12.5, fontWeight: 800, color: '#6b5b45' }}>ดับกระหาย</span>
                              <span title={thirsty ? 'ยังไม่ได้ดื่มน้ำ — กระหาย' : `ดื่มแล้ว ${drunk} จอก`} style={{ fontSize: 12 }}>{thirsty ? '🫗' : '💧'}</span>
                            </div>
                            <div style={{ flex: 1, background: '#9fb6c6', borderRadius: 12, padding: '8px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
                              {Array.from({ length: WATER_SLOTS }).map((_, i) => {
                                const on = i < drunk;
                                return (
                                  <button
                                    key={i}
                                    onClick={() => setSheet({ waterCur: drunk === i + 1 ? i : i + 1 })}
                                    title={`ติ๊กเมื่อดื่มน้ำ (จอกที่ ${i + 1})`}
                                    style={{ width: 22, height: 22, borderRadius: 7, border: `1px solid ${on ? '#2c4a5c' : '#c2d0da'}`, background: on ? '#dff0fb' : '#f4f8fb', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0, opacity: on ? 1 : 0.7 }}
                                  >{on ? '💧' : ''}</button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    </>)}
                  </div>
                </div>
              );
            })()}

            {/* Tabbed area */}
            <div style={box}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, borderBottom: '1px solid #efece6', paddingBottom: 10 }}>
                {SHEET_TABS.map((t) => (
                  <button key={t} onClick={() => setTab(t)} style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 11px', borderRadius: 16, cursor: 'pointer', border: `1px solid ${tab === t ? '#e07a5f' : '#eae7e0'}`, background: tab === t ? '#fdeee9' : '#fff', color: tab === t ? '#c15a3f' : '#8d8a82' }}>{t}</button>
                ))}
              </div>

              {tab === 'ช่องเก็บของ' && (
                <div>
                  {/* body weight / height + carry capacity */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12, background: '#faf9f7', border: '1px solid #ece9e3', borderRadius: 10, padding: '10px 12px' }}>
                    <label style={{ fontSize: 10.5, color: '#8d8a82', fontWeight: 600 }}>น้ำหนักตัว (kg)<div style={{ marginTop: 3 }}><NumField value={bodyKg} onCommit={(v) => setSheet({ bodyKg: v })} width={80} style={{ fontSize: 13, padding: '6px 9px' }} /></div></label>
                    <label style={{ fontSize: 10.5, color: '#8d8a82', fontWeight: 600 }}>ส่วนสูง (cm)<div style={{ marginTop: 3 }}><NumField value={sv('heightCm', 0)} onCommit={(v) => setSheet({ heightCm: v })} width={80} style={{ fontSize: 13, padding: '6px 9px' }} /></div></label>
                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: '#a8a59d', fontWeight: 700, letterSpacing: '.04em' }}>แบกอยู่</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: overloaded ? '#c0432a' : '#2f6b4f' }}>{carryKg} / {carryMax} kg</div>
                      <div style={{ fontSize: 9.5, color: overloaded ? '#c0432a' : '#b0ada4' }}>{overloaded ? 'แบกเกินพิกัด! (>20%)' : 'สูงสุด 20% ของน้ำหนักตัว'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                    <button onClick={() => setInvPicker(true)} style={{ flex: 'none', padding: '7px 14px', background: '#e07a5f', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>＋ เพิ่มสิ่งของ (Equipment &amp; Items)</button>
                  </div>

                  {/* LOOT */}
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: '#b06a2a', marginBottom: 6 }}>▾ LOOT (วางบนพื้น · ไม่นับน้ำหนัก{campaignId ? ' · รวมของทั้งแคมเปญ' : ''})</div>
                  <div style={{ marginBottom: 14 }}>
                    {campaignId ? (
                      sharedLoot.length === 0 ? <div style={{ fontSize: 11, color: '#cbc8c0', padding: '6px 0' }}>— ว่าง — (Loot รวมของแคมเปญ)</div> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {sharedLoot.map((it) => (
                            <div key={it.id} style={{ border: '1px solid #ece9e3', borderRadius: 8, padding: '8px 10px', background: '#fff' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input key={it.name} defaultValue={it.name} onBlur={(e) => { if (e.target.value !== it.name) lootRename.mutate({ lootId: it.id, name: e.target.value }); }} style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontSize: 12.5, fontWeight: 600, color: '#3c3a33' }} />
                                <button onClick={() => lootRemove.mutate(it.id)} title="ลบออกจาก Loot" style={{ background: 'none', border: 'none', color: '#cb5a44', cursor: 'pointer', fontSize: 14 }}>×</button>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                                <span style={{ fontSize: 10.5, color: '#a8a59d', marginRight: 'auto' }}>{numData(it.kg)} kg{it.desc ? ` · ${it.desc}` : ''}</span>
                                <button onClick={() => takeLoot(it)} style={moveStyle('#2f6b4f', '#cbe0d2')}>หยิบ → Ready</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    ) : (
                      dropZone('loot', loot.length === 0 ? <div style={{ fontSize: 11, color: '#cbc8c0', padding: '6px 0' }}>— ว่าง — {dragId ? '(วางที่นี่)' : ''}</div> : loot.map(invRow))
                    )}
                  </div>

                  {/* READY */}
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: '#2f6b4f', marginBottom: 6 }}>▾ READY SLOTS (พกพร้อมใช้ · นับน้ำหนัก)</div>
                  <div style={{ marginBottom: 14 }}>
                    {dropZone('ready', ready.length === 0 ? <div style={{ fontSize: 11, color: '#cbc8c0', padding: '6px 0' }}>— ว่าง — {dragId ? '(วางที่นี่)' : ''}</div> : ready.map(invRow))}
                  </div>

                  {/* BAG — worn bags become containers; each has its own capacity + drop zone */}
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: '#5b3fa0', marginBottom: 6 }}>▾ สะพาย / กระเป๋า (นับน้ำหนักเมื่อสวมใส่)</div>
                  {bagWarn && <div style={{ fontSize: 11, color: '#c0432a', background: '#fdf1ee', border: '1px solid #f2cabf', borderRadius: 7, padding: '6px 10px', marginBottom: 8 }}>⚠️ {bagWarn}</div>}
                  {!hasBag && (
                    <div style={{ fontSize: 10.5, color: '#a8a59d', padding: '9px 12px', border: '1px dashed #e0ded7', borderRadius: 8, lineHeight: 1.5 }}>🎒 ยังไม่มีกระเป๋า — เพิ่มกระเป๋าจาก Equipment &amp; Items เพื่อปลดล็อกพื้นที่ “สะพาย”</div>
                  )}
                  {hasBag && wornBags.length === 0 && (
                    <div style={{ fontSize: 10.5, color: '#a8a59d', padding: '9px 12px', border: '1px dashed #d6c7f0', borderRadius: 8, lineHeight: 1.5 }}>🎒 มีกระเป๋าแล้ว — กด “🎒 สวมใส่” ที่กระเป๋าใน LOOT/READY เพื่อเปิดใช้เป็นที่เก็บของ</div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {wornBags.map((b) => {
                      const used = bagUsedKg(b.lineId);
                      const cap = numData(b.cap);
                      const full = cap > 0 && used >= cap;
                      const items = contentsOf(b.lineId);
                      return (
                        <div key={b.lineId}
                          onDragOver={(e) => { if (dragId) e.preventDefault(); }}
                          onDrop={(e) => { e.preventDefault(); if (dragId) { moveToBag(dragId, b.lineId); setDragId(null); } }}
                          style={{ border: `1px solid ${dragId ? '#c9a8f0' : '#e2d7f2'}`, borderRadius: 10, background: '#faf8fd', padding: '10px 11px', outline: dragId ? '2px dashed #d6c7f0' : 'none', outlineOffset: 2 }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <span style={{ flex: 'none', fontSize: 14 }}>🎒</span>
                            <input key={b.name} defaultValue={b.name} onBlur={(e) => { if (e.target.value !== b.name) setInv(b.lineId, { name: e.target.value }); }} style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontWeight: 800, color: '#4a3d6b' }} />
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: full ? '#c0432a' : '#7a6aa0' }}>{used}{cap > 0 ? ` / ${cap}` : ''} kg</span>
                            <button onClick={() => setInv(b.lineId, { worn: false })} title="ถอดกระเป๋า (ไม่นับน้ำหนัก)" style={moveStyle('#8d8a82', '#e0ded7')}>ถอด</button>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {items.length === 0 ? (
                              <div style={{ fontSize: 11, color: '#cbc8c0', padding: '4px 0' }}>— ว่าง — {dragId ? '(วางที่นี่)' : 'ลากของมาวาง หรือกดปุ่ม “→ ' + b.name + '” ที่ไอเทม'}</div>
                            ) : items.map((it) => (
                              <div key={it.lineId} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #e2d7f2', borderRadius: 7, padding: '6px 9px', background: '#fff' }}>
                                <span
                                  draggable
                                  onDragStart={(e) => { setDragId(it.lineId); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', it.lineId); }}
                                  onDragEnd={() => setDragId(null)}
                                  style={{ flex: 'none', cursor: 'grab', color: '#c9c5bd', fontSize: 13, lineHeight: 1, userSelect: 'none' }}
                                >⠿</span>
                                <input key={it.name} defaultValue={it.name} onBlur={(e) => { if (e.target.value !== it.name) setInv(it.lineId, { name: e.target.value }); }} style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontSize: 12, fontWeight: 600, color: '#3c3a33' }} />
                                <span style={{ fontSize: 10.5, color: '#a8a59d', flex: 'none' }}>{numData(it.kg)} kg</span>
                                <button onClick={() => takeFromBag(it.lineId)} style={moveStyle('#2f6b4f', '#cbe0d2')}>เอาออก</button>
                                <button onClick={() => delInv(it.lineId)} title="ลบ" style={{ background: 'none', border: 'none', color: '#cb5a44', cursor: 'pointer', fontSize: 14, flex: 'none' }}>×</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {tab === 'Dweller Skill' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#faf6ef', border: '1px solid #eaddc7', borderRadius: 10, padding: '9px 14px' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: '#8d6a4a' }}>Endeavor Points = <span style={{ color: '#c15a3f' }}>{endeavor}</span></span>
                    <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="number" value={endAmt} onChange={(e) => setEndAmt(Math.round(Number(e.target.value) || 0))} style={{ width: 64, textAlign: 'center', border: '1px solid #e0ded7', borderRadius: 7, padding: '5px', fontSize: 13 }} />
                      <button onClick={() => { if (endAmt) setSheet({ endeavor: Math.max(0, endeavor + endAmt) }); }} style={{ border: 'none', background: '#e07a5f', color: '#fff', borderRadius: 7, padding: '6px 12px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>＋ เพิ่ม</button>
                    </span>
                  </div>
                  {DWELLER_SKILLS.map((cat) => (
                    <div key={cat.en}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#2f2c25' }}>{cat.name}</span>
                        <span style={{ fontSize: 11.5, color: '#b0ada4', fontStyle: 'italic' }}>{cat.en}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '4px 20px' }}>
                        {cat.skills.map((s) => {
                          const key = skillKey(cat.en, s.en);
                          const ch = getCh(key);
                          const info = skillInfo(s.attr, talent.includes(key), ch.level);
                          const hasAdv = prof.includes(key);
                          const reasons = disReasons(s.attr, s.name, cat.en);
                          const hasDis = reasons.length > 0;
                          const advNet = hasAdv && !hasDis;
                          const disNet = hasDis && !hasAdv;
                          return (
                            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #f4f1ec' }}>
                              <button onClick={() => toggleSkillCheck(key)} title="ติ๊ก / ยกเลิก" style={{ width: 18, height: 18, borderRadius: '50%', flex: 'none', border: `2px solid ${skillChecked[key] ? '#2f7d4f' : '#cfccc4'}`, background: skillChecked[key] ? '#2f7d4f' : '#fff', color: '#fff', fontSize: 10, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{skillChecked[key] ? '✓' : ''}</button>
                              <span style={{ width: 26, height: 22, borderRadius: 6, background: SKILL_ATTR_COLOR[s.attr], color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{s.attr}</span>
                              <span
                                onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setSkillTip({ name: s.name, desc: s.desc, x: Math.min(r.left, window.innerWidth - 336), y: r.bottom }); }}
                                onMouseLeave={() => setSkillTip(null)}
                                style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: '#3c3a33', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'help' }}
                              >{s.name}</span>
                              {hasAdv && <span title="เชี่ยวชาญ · Advantage" style={{ fontSize: 11, color: '#2f7d4f', fontWeight: 800 }}>▲</span>}
                              {talent.includes(key) && <span title="พรสวรรค์" style={{ fontSize: 11, color: '#5b3fa0', fontWeight: 800 }}>✦</span>}
                              {hasDis && <span title={`Disadvantage: ${reasons.join(', ')}`} style={{ fontSize: 11, color: '#c0432a', fontWeight: 800 }}>▼</span>}
                              <button onClick={() => setChallengeSkill(key)} title="ท้าทาย" style={{ flex: 'none', border: '1px solid #e0ded7', background: '#fff', color: '#8d6a4a', borderRadius: 7, padding: '4px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>ท้าทาย</button>
                              <button onClick={() => { rollLabelRef.current = `${s.name}${advNet ? ' (Adv)' : ''}${disNet ? ' (Dis)' : ''}`; setRoll({ faces: info.roll, adv: advNet, dis: disNet }); }} title={`ทอย ${info.label}${advNet ? ' · Advantage' : ''}${disNet ? ' · Disadvantage' : ''}${hasAdv && hasDis ? ' · Adv+Dis หักล้าง' : ''}`} style={{ flex: 'none', minWidth: 34, textAlign: 'center', border: 'none', borderRadius: 7, padding: '4px 8px', background: disNet ? '#b4513a' : '#e07a5f', color: '#fff', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>{info.label}</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'Magic' && (
                <div>
                  {/* Ehen dice info — from the new dice system */}
                  {ehenType && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      <span style={{ fontSize: 12, padding: '4px 11px', borderRadius: 20, background: '#f6f2ea', color: '#5c4a2e', border: '1px solid #e8e0d0' }}>{ehenLabel}</span>
                      {sizeLabel && <span style={{ fontSize: 12, padding: '4px 11px', borderRadius: 20, background: '#f6f2ea', color: '#5c4a2e', border: '1px solid #e8e0d0' }}>ขนาด {sizeLabel}</span>}
                      {ehenColor && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 11px', borderRadius: 20, background: '#f6f2ea', color: '#5c4a2e', border: '1px solid #e8e0d0' }}><span style={{ width: 11, height: 11, borderRadius: '50%', background: EHEN_COLOR_HEX[ehenColor], border: '1px solid rgba(0,0,0,.15)' }} />{ehenColor}</span>}
                      {ehenDie && <button onClick={() => setRoll({ faces: parseInt(ehenDie.replace(/[^0-9]/g, ''), 10) || 6, adv: false })} title="ทอยลูกเต๋าผลิตอีเฮน" style={{ fontSize: 12, padding: '4px 11px', borderRadius: 20, background: '#fdece2', color: '#c1502a', border: '1px solid #f2cdbc', cursor: 'pointer', fontWeight: 700 }}>ผลิต {ehenDie} 🎲</button>}
                    </div>
                  )}
                  {/* dark 3-tier switcher (รู้จัก / เข้าใจ / เชี่ยวชาญ) */}
                  <div style={{ background: '#15140f', borderRadius: 12, padding: 6, display: 'flex', gap: 6, marginBottom: 12 }}>
                    {MAGIC_TIERS.map((t) => {
                      const on = magicTab === t.key;
                      const count = magicRows.filter((r) => magTierOf(r.key) === t.key).length;
                      return <button key={t.key} onClick={() => setMagicTab(t.key)} style={{ flex: 1, border: 'none', borderRadius: 9, padding: '9px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', background: on ? '#5b3fa0' : 'transparent', color: on ? '#fff' : '#cbc3b4' }}>{t.label} <span style={{ opacity: .7, fontSize: 11 }}>{count}</span></button>;
                    })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: '#5b3fa0' }}>เวทมนตร์ระดับ “{MAGIC_TIERS.find((t) => t.key === magicTab)?.label}”</span>
                    <button onClick={() => setMagicPicker(true)} style={{ padding: '5px 12px', background: '#5b3fa0', color: '#fff', border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>＋ เพิ่ม Magic</button>
                  </div>
                  {(() => {
                    const rows = magicRows.filter((r) => magTierOf(r.key) === magicTab);
                    if (rows.length === 0) return <div style={{ fontSize: 12.5, color: '#bdbab2', padding: '8px 0' }}>ยังไม่มีเวทมนตร์ในระดับนี้</div>;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {rows.map((r) => (
                          <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', border: '1px solid #e2d7f4', borderRadius: 9, background: '#faf8fd' }}>
                            {r.custom
                              ? <input key={r.name} defaultValue={r.name} onBlur={(e) => { if (e.target.value !== r.name) renameMagic(r.key, e.target.value); }} style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontSize: 12.5, fontWeight: 600, color: '#46443c' }} />
                              : <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: '#46443c' }}>{r.name}</span>}
                            <div style={{ display: 'flex', gap: 3, flex: 'none' }} title="ย้ายระดับ">
                              {MAGIC_TIERS.map((tt) => { const on = magTierOf(r.key) === tt.key; return <button key={tt.key} onClick={() => { setMagTier(r.key, tt.key); setMagicTab(tt.key); }} title={`ย้ายไประดับ “${tt.label}”`} style={{ border: `1px solid ${on ? '#5b3fa0' : '#e2d7f4'}`, background: on ? '#ede7f6' : '#fff', color: on ? '#5b3fa0' : '#a8a59d', borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>{tt.label}</button>; })}
                            </div>
                            <button onClick={() => logRef.current('magic', `✨ ร่ายเวท: ${r.name}`, r.item ? { itemId: r.item.id, isFeature: false } : undefined)} title="ร่ายเวท (ส่งเข้า Log)" style={{ flex: 'none', border: '1px solid #d6c7f0', background: '#f3eefb', color: '#5b3fa0', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>ใช้</button>
                            {r.item && <button onClick={() => openInfo(r.item, false)} title="รายละเอียด" style={{ flex: 'none', border: '1px solid #e0ded7', background: '#fff', color: '#6b6860', borderRadius: 7, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>ⓘ</button>}
                            {r.custom && <button onClick={() => removeMagic(r.key)} title="ลบ" style={{ flex: 'none', background: 'none', border: 'none', color: '#cb5a44', cursor: 'pointer', fontSize: 14 }}>×</button>}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {tab === 'Feature' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: '#a8a59d' }}>FEATURES &amp; TRAITS</span>
                    <button onClick={() => setFeatPicker(true)} style={{ padding: '5px 12px', background: '#15140f', color: '#fff', border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>＋ เพิ่ม Feature</button>
                  </div>
                  {featRows.length === 0 ? <div style={{ fontSize: 12.5, color: '#bdbab2', padding: '8px 0' }}>ยังไม่มี Feature</div> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {featRows.map((r) => {
                        const t = featTrack[r.key] || {};
                        const used = t.used ?? 0;
                        const active = featIsActive(r);
                        const catalogMax = featUsesMax(r); // dev-set max from master data
                        const max = catalogMax != null ? catalogMax : (t.max ?? null); // catalog wins; custom may set its own
                        const atMax = max != null && used >= max;
                        return (
                          <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px', border: '1px solid #ece9e3', borderRadius: 9, background: '#fff', flexWrap: 'wrap' }}>
                            {r.custom
                              ? <input key={r.name} defaultValue={r.name} onBlur={(e) => { if (e.target.value !== r.name) renameFeat(r.key, e.target.value); }} style={{ flex: 1, minWidth: 120, border: 'none', background: 'transparent', outline: 'none', fontSize: 12.5, fontWeight: 600, color: '#46443c' }} />
                              : <span style={{ flex: 1, minWidth: 120, fontSize: 12.5, fontWeight: 600, color: '#46443c' }}>{r.name}</span>}
                            <span style={{ flex: 'none', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: active ? '#fdeee9' : '#eef1f4', color: active ? '#c15a3f' : '#8d97a3' }}>{active ? 'ACTIVE' : 'PASSIVE'}</span>
                            {r.item && <button onClick={() => openInfo(r.item, true)} title="รายละเอียด" style={{ flex: 'none', border: '1px solid #e0ded7', background: '#fff', color: '#6b6860', borderRadius: 7, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>ⓘ</button>}
                            {active && (
                              <>
                                <button disabled={atMax} onClick={() => { setFeatTrack(r.key, { used: used + 1 }); logRef.current('feature', `✦ ใช้ Feature: ${r.name}${max != null ? ` (${used + 1}/${max})` : ''}`, r.item ? { itemId: r.item.id, isFeature: true } : undefined); }} title="ใช้ Feature นี้ (ลดแต้ม + ส่งเข้า Log)" style={{ flex: 'none', border: '1px solid #e0c4ba', background: atMax ? '#f2efe9' : '#faf6f4', color: atMax ? '#bdbab2' : '#b4513a', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: atMax ? 'not-allowed' : 'pointer' }}>ใช้ {used}{max != null ? `/${max}` : ''}</button>
                                <span style={{ flex: 'none', display: 'inline-flex', gap: 3 }} title="ปรับด้วยมือ">
                                  <button onClick={() => setFeatTrack(r.key, { used: Math.max(0, used - 1) })} style={{ border: '1px solid #e0c4ba', background: '#fff', color: '#b4513a', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>−</button>
                                  <button disabled={atMax} onClick={() => setFeatTrack(r.key, { used: used + 1 })} style={{ border: '1px solid #e0c4ba', background: '#fff', color: atMax ? '#bdbab2' : '#b4513a', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 700, cursor: atMax ? 'not-allowed' : 'pointer' }}>＋</button>
                                </span>
                                {catalogMax == null && (
                                  <label style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#a8a59d', fontWeight: 600 }}>สูงสุด<input defaultValue={t.max ?? ''} key={`mx${t.max}`} onBlur={(e) => { const v = e.target.value.trim(); setFeatTrack(r.key, { max: v === '' ? null : Math.max(0, Math.round(Number(v) || 0)) }); }} inputMode="numeric" placeholder="∞" style={{ width: 34, border: '1px solid #e0ded7', borderRadius: 6, textAlign: 'center', fontSize: 11, padding: '3px 2px', outline: 'none' }} /></label>
                                )}
                              </>
                            )}
                            <label style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#5b3fa0', fontWeight: 600 }}>CP<input defaultValue={t.cp ?? ''} key={`cp${t.cp}`} onBlur={(e) => setFeatTrack(r.key, { cp: Math.max(0, Math.round(Number(e.target.value) || 0)) })} inputMode="numeric" placeholder="0" style={{ width: 38, border: '1px solid #d6c7f0', borderRadius: 6, textAlign: 'center', fontSize: 11, padding: '3px 2px', outline: 'none', background: '#faf8fd' }} /></label>
                            {r.custom && <button onClick={() => removeFeat(r.key)} title="ลบออกจาก Dweller Sheet" style={{ flex: 'none', background: 'none', border: 'none', color: '#cb5a44', cursor: 'pointer', fontSize: 14 }}>×</button>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {virtues.length > 0 && <div style={{ marginTop: 12 }}><div style={{ fontSize: 11.5, fontWeight: 700, color: '#2f7d4f', marginBottom: 6 }}>Virtues</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{virtues.map((v) => <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 8px 5px 11px', borderRadius: 9, background: '#eef6f0', color: '#2f7d4f', border: '1px solid #cfe6d6' }}>{v.name}{v.item && <button onClick={() => openInfo(v.item, true)} title="ดูข้อมูล" style={{ border: 'none', background: 'none', color: '#5fa07a', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}>ⓘ</button>}</span>)}</div></div>}
                  {flaws.length > 0 && <div style={{ marginTop: 12 }}><div style={{ fontSize: 11.5, fontWeight: 700, color: '#b0552f', marginBottom: 6 }}>Flaws</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{flaws.map((v) => <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 8px 5px 11px', borderRadius: 9, background: '#f9eeea', color: '#b0552f', border: '1px solid #f0d8ce' }}>{v.name}{v.item && <button onClick={() => openInfo(v.item, true)} title="ดูข้อมูล" style={{ border: 'none', background: 'none', color: '#c78a6a', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}>ⓘ</button>}</span>)}</div></div>}
                </div>
              )}

              {tab === 'ภูมิหลัง' && (
                <div>
                  {/* Step 4 — read-only summary (edit only via character creation) */}
                  {step4Summary.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', color: '#a8a59d', marginBottom: 6 }}>ฐานะทางสังคม &amp; ภูมิหลัง <span style={{ color: '#cbc8c0', fontWeight: 400 }}>· แก้ไขได้ที่หน้าสร้างตัวละคร</span></div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {step4Summary.flatMap((s) => s.picks.map((p, i) => (
                          <span key={`${s.sec}-${i}`} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 7, background: '#f4f2ee', color: '#6b6860', border: '1px solid #eae7e0' }}>
                            <span style={{ color: '#a8a59d' }}>{p.q}:</span> <b style={{ color: '#5f5c54' }}>{p.choice}</b>
                          </span>
                        )))}
                      </div>
                    </div>
                  )}

                  {/* Step 5/6 — topic chips switch a single writing area */}
                  {bgTopics.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#cbc8c0', fontSize: 12.5, padding: '24px 16px', lineHeight: 1.7 }}>ยังไม่มีคำถามภูมิหลัง (Step 5/6)</div>
                  ) : (() => {
                    const activeId = bgTopic && bgTopics.some((t) => t.id === bgTopic) ? bgTopic : bgTopics[0].id;
                    const active = bgTopics.find((t) => t.id === activeId)!;
                    return (
                      <div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                          {bgTopics.map((t, i) => {
                            const on = t.id === activeId;
                            const label = t.prompt?.trim() ? (t.prompt.length > 26 ? `${t.prompt.slice(0, 26)}…` : t.prompt) : `หัวข้อ ${i + 1}`;
                            return (
                              <button key={t.id} onClick={() => setBgTopic(t.id)} title={t.prompt} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: on ? 700 : 600, padding: '5px 11px', borderRadius: 16, cursor: 'pointer', border: `1px solid ${on ? '#e07a5f' : '#eae7e0'}`, background: on ? '#fdeee9' : '#fff', color: on ? '#c15a3f' : '#8d8a82' }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', flex: 'none', background: t.answered ? '#5aa06a' : '#d5d2ca' }} />
                                {label}
                              </button>
                            );
                          })}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#2f2c25', marginBottom: 10, lineHeight: 1.5 }}>{active.prompt || '(ยังไม่มีคำถาม)'}</div>
                        <GrowingAnswer key={active.id} value={(active.store === 'step5Answers' ? step5Ans : step6Ans)[active.id] ?? ''} onCommit={(v) => commitBgAnswer(active.store, active.id, v)} minHeight={180} />
                      </div>
                    );
                  })()}
                </div>
              )}

              {tab === 'จัดการสินทรัพย์' && (
                <div>
                  {/* MY COIN header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#15140f', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                    <div><div style={{ fontSize: 9, letterSpacing: '.14em', color: '#9a978e', fontWeight: 700 }}>MY COIN</div><div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>กระเป๋าเหรียญ</div></div>
                    <div style={{ textAlign: 'right' }}><div style={{ fontSize: 9, color: '#9a978e' }}>มูลค่ารวม (ฐาน)</div><div style={{ fontSize: 19, fontWeight: 800, color: '#e0b94a' }}>{coinStr(walletIC)}</div></div>
                  </div>
                  {/* coin tier rows */}
                  <div style={{ border: '1px solid #e4e2dc', borderRadius: 11, overflow: 'hidden', marginBottom: 16 }}>
                    {COIN_DEFS.map((c) => (
                      <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: '1px solid #f3f1ec' }}>
                        <span style={{ width: 13, height: 13, borderRadius: '50%', flex: 'none', background: c.color }} />
                        <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700, color: '#46443c' }}>{c.label} <span style={{ fontSize: 11, color: '#a8a59d', fontWeight: 400 }}>({c.key})</span></div><div style={{ fontSize: 10, color: '#b09a6a' }}>1 {c.key} = {c.ic} IC</div></div>
                        <NumField value={coins[c.key]} onCommit={(v) => setCoinCount(c.key, v)} width={74} style={{ fontSize: 17, fontWeight: 800, textAlign: 'right' }} />
                      </div>
                    ))}
                  </div>
                  {/* ADJUST COIN */}
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#a8a59d', marginBottom: 9 }}>ADJUST COIN <span style={{ fontWeight: 400, color: '#cbc8c0' }}>· ใส่จำนวนแล้วกด เพิ่ม / หัก</span></div>
                  <div style={{ display: 'flex', gap: 7, marginBottom: 11 }}>
                    {COIN_DEFS.map((c) => (
                      <div key={c.key} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}><span style={{ width: 11, height: 11, borderRadius: '50%', background: c.color }} /><span style={{ fontSize: 10, fontWeight: 700, color: '#8d8a82' }}>{c.key}</span></div>
                        <input value={coinAdj[c.key] ?? ''} onChange={(e) => setCoinAdj({ ...coinAdj, [c.key]: e.target.value.replace(/[^0-9]/g, '') })} inputMode="numeric" placeholder="0" style={{ width: '100%', border: '1px solid #e0ded7', borderRadius: 7, padding: '7px 4px', fontSize: 14, fontWeight: 700, textAlign: 'center', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 7, marginBottom: 18 }}>
                    <button onClick={() => COIN_DEFS.forEach((c) => adjMain(c.key, 1))} style={{ flex: 1, padding: 9, background: '#eaf3ed', border: '1px solid #cbe0d2', color: '#2f6b4f', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>＋ เพิ่ม</button>
                    <button onClick={() => COIN_DEFS.forEach((c) => adjMain(c.key, -1))} style={{ flex: 1, padding: 9, background: '#fbeae6', border: '1px solid #f0d3cb', color: '#b4513a', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>− หัก</button>
                    <button onClick={clearAdj} style={{ flex: 'none', padding: '9px 16px', background: '#fff', border: '1px solid #e0ded7', color: '#8d8a82', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>ล้าง</button>
                  </div>
                  {/* SEPARATE POUCHES */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 8px' }}><span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#a8a59d' }}>กองเงินแยก <span style={{ fontWeight: 400, color: '#cbc8c0' }}>· ย้ายเหรียญจากกระเป๋าหลัก</span></span><button onClick={addPouch} style={{ padding: '4px 11px', background: '#faf6f4', border: '1px solid #e0c4ba', color: '#b4513a', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>＋ เพิ่มกอง</button></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {pouches.length === 0 ? (
                      <div style={{ fontSize: 11, color: '#cbc8c0', padding: '4px 0' }}>ยังไม่มีกองเงินแยก — กด “＋ เพิ่มกอง” เพื่อสร้าง (เช่น เงินเก็บ, กองกลางปาร์ตี้)</div>
                    ) : pouches.map((p) => (
                      <div key={p.id} style={{ border: '1px solid #e4e2dc', borderRadius: 10, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                          <input key={p.name} defaultValue={p.name} onBlur={(e) => { if (e.target.value !== p.name) renamePouch(p.id, e.target.value); }} style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontSize: 12.5, fontWeight: 700, color: '#46443c', borderBottom: '1px dashed #d8d5ce' }} />
                          <button onClick={() => removePouch(p.id)} title="ลบ (คืนเหรียญเข้ากระเป๋าหลัก)" style={{ background: 'none', border: 'none', color: '#cb5a44', cursor: 'pointer', fontSize: 15, flex: 'none' }}>×</button>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {COIN_DEFS.map((c) => (
                            <div key={c.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, background: '#faf9f7', border: '1px solid #ece9e3', borderRadius: 8, padding: '6px 5px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: '50%', flex: 'none', background: c.color }} /><span style={{ flex: 1, fontSize: 14, fontWeight: 800, textAlign: 'center' }}>{p.coins[c.key] ?? 0}</span></div>
                              <input value={coinAdj[`${p.id}:${c.key}`] ?? ''} onChange={(e) => setCoinAdj({ ...coinAdj, [`${p.id}:${c.key}`]: e.target.value.replace(/[^0-9]/g, '') })} inputMode="numeric" placeholder="1" style={{ width: '100%', border: '1px solid #e8e5de', borderRadius: 5, padding: '3px 2px', fontSize: 11, fontWeight: 700, textAlign: 'center', outline: 'none', boxSizing: 'border-box' }} />
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => moveCoin(p.id, c.key, 'out')} title="→ กระเป๋าหลัก" style={{ flex: 1, height: 22, border: '1px solid #f0d3cb', background: '#fff', borderRadius: 5, cursor: 'pointer', fontWeight: 700, color: '#b4513a', fontSize: 12 }}>−</button>
                                <button onClick={() => moveCoin(p.id, c.key, 'in')} title="หยิบจากกระเป๋าหลัก" style={{ flex: 1, height: 22, border: '1px solid #cbe0d2', background: '#fff', borderRadius: 5, cursor: 'pointer', fontWeight: 700, color: '#2f6b4f', fontSize: 12 }}>＋</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === 'บันทึกประจำวัน' && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: '#a8a59d', marginBottom: 8 }}>📝 บันทึกของผู้เล่น</div>
                  <GrowingAnswer value={svs('note')} onCommit={(v) => setSheet({ note: v })} />
                </div>
              )}

              {tab === 'พิเศษ' && (
                <div style={{ fontSize: 12.5, color: '#bdbab2', padding: '18px 0', textAlign: 'center' }}>ส่วน “พิเศษ” กำลังพัฒนา</div>
              )}
            </div>
          </div>
        </div>
      </div>
      <DiceRoller open={roll !== null} egoFaces={roll?.faces ?? 20} egoAdvantage={roll?.adv ?? false} egoDisadvantage={roll?.dis ?? false} onClose={() => setRoll(null)} />

      {/* ── Campaign LOG + Initiative: floating buttons + windows (only when in a campaign) ── */}
      {campaignId && (
        <>
          <button
            onClick={() => setInitOpen((o) => !o)}
            title="Initiative — ลำดับการเล่นของแคมเปญ"
            style={{ position: 'fixed', right: 22, bottom: 154, zIndex: 150, width: 56, height: 56, borderRadius: '50%', border: '1px solid #3d3a32', background: '#15140f', color: '#f7dca0', fontSize: 22, cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ⚔️{campaignInit.length > 0 && <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10, background: '#5b3fa0', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{campaignInit.length}</span>}
          </button>
          {initOpen && (
            <div style={{ position: 'fixed', right: 22, bottom: 218, zIndex: 151, width: 320, maxWidth: 'calc(100vw - 44px)', maxHeight: '60vh', background: '#1b1813', borderRadius: 14, boxShadow: '0 18px 50px rgba(0,0,0,.45)', border: '1px solid #35322b', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 15px', borderBottom: '1px solid #35322b' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#f3ede1' }}>⚔️ INITIATIVE <span style={{ fontSize: 10.5, fontWeight: 400, color: '#8d8a82' }}>· ลำดับการเล่น</span></span>
                <button onClick={() => setInitOpen(false)} style={{ background: 'none', border: 'none', color: '#9a978e', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {campaignInit.length === 0 ? <div style={{ fontSize: 12, color: '#6b6860', padding: '8px 0' }}>ยังไม่มีใครทอย Initiative — กด INITIATIVE ROLL</div> : (
                  campaignInit.map((e, i) => (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 9, background: e.id === `d:${character.id}` ? '#2f2a4a' : '#26231e', border: `1px solid ${e.kind === 'monster' ? '#5a3a3a' : '#35322b'}` }}>
                      <span style={{ flex: 'none', width: 22, height: 22, borderRadius: '50%', background: i === 0 ? '#f7dca0' : '#35322b', color: i === 0 ? '#15140f' : '#cbc3b4', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: e.kind === 'monster' ? '#e6a3a8' : '#e8e4db' }}>{e.name}{e.kind === 'monster' && ' 👹'}</span>
                      <span style={{ fontSize: 16, fontWeight: 800, color: '#f7dca0' }}>{e.value}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── hover description for Dweller Skill rows ── */}
      {skillTip && (
        <div style={{ position: 'fixed', left: skillTip.x, top: skillTip.y + 6, zIndex: 400, width: 320, background: '#221f1a', color: '#f3ede1', borderRadius: 10, padding: '10px 13px', boxShadow: '0 10px 28px rgba(0,0,0,.3)', pointerEvents: 'none' }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{skillTip.name}</div>
          <div style={{ fontSize: 12, lineHeight: 1.55, color: '#cbc3b4' }}>{skillTip.desc}</div>
        </div>
      )}

      {/* ── Feature / Magic / Item detail — multiple draggable floating windows (same view as the website) ── */}
      {detailWins.map((w, i) => (
        <FloatWindow key={w.key} title={w.item.name} onClose={() => closeInfo(w.key)} width={430} cascadeIndex={i}>
          <CatalogDetail item={w.item} cfg={CATALOG_CONFIGS[w.item.category]} category={w.item.category} isFeature={w.isFeature} onEdit={() => {}} />
        </FloatWindow>
      ))}

      {/* ── On-Hand fallback detail (custom item without catalog data) ── */}
      {handInfo && (
        <FloatWindow title={handInfo.name} onClose={() => setHandInfo(null)} width={340}>
          <div style={{ fontSize: 13, color: '#3c3a33', lineHeight: 1.7 }}>
            <div>น้ำหนัก: <b>{numData(handInfo.kg)} kg</b></div>
            <div style={{ color: '#9a978e', marginTop: 4 }}>สิ่งของนี้เพิ่มเอง — ไม่มีรายละเอียดจากคลัง Equipment</div>
          </div>
        </FloatWindow>
      )}

      {/* ── Buff picker ── */}
      <Modal open={buffModal} onClose={() => setBuffModal(false)} title="เลือก Buff">
        <input value={effQuery} onChange={(e) => setEffQuery(e.target.value)} placeholder="ค้นหา Buff…" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 9, padding: '9px 13px', fontSize: 13, outline: 'none', marginBottom: 10 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
          {BUFF_EFFECTS.filter((b) => !effQuery.trim() || b[1].toLowerCase().includes(effQuery.toLowerCase()) || b[0].toLowerCase().includes(effQuery.toLowerCase())).map((b) => {
            const on = !!buffsOn[b[0]];
            return (
              <button key={b[0]} onClick={() => toggleBuff(b[0])} style={{ display: 'block', textAlign: 'left', padding: '9px 11px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${on ? '#2f6b4f' : '#ece9e3'}`, background: on ? '#eaf3ed' : '#fff' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2f6b4f' }}>{on ? '✓ ' : ''}{b[1]}</div>
                <div style={{ fontSize: 11.5, color: '#8d8a82', marginTop: 2, lineHeight: 1.5 }}>{b[2]}</div>
              </button>
            );
          })}
        </div>
      </Modal>

      {/* ── Debuff / status picker ── */}
      <Modal open={statusModal} onClose={() => setStatusModal(false)} title="เลือกสถานะผิดปกติ">
        <input value={effQuery} onChange={(e) => setEffQuery(e.target.value)} placeholder="ค้นหาสถานะ…" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 9, padding: '9px 13px', fontSize: 13, outline: 'none', marginBottom: 10 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
          {STATUS_EFFECTS.filter((st) => !effQuery.trim() || st[1].includes(effQuery) || st[0].toLowerCase().includes(effQuery.toLowerCase())).map((st) => {
            const on = !!statusOn[st[0]];
            return (
              <button key={st[0]} onClick={() => toggleStatus(st[0])} style={{ display: 'block', textAlign: 'left', padding: '9px 11px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${on ? '#c0432a' : '#ece9e3'}`, background: on ? '#fbeae6' : '#fff' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#b4513a' }}>{on ? '✓ ' : ''}{st[1]}</div>
                <div style={{ fontSize: 11.5, color: '#8d8a82', marginTop: 2, lineHeight: 1.5 }}>{st[2]}</div>
              </button>
            );
          })}
        </div>
      </Modal>

      {/* ── Magic picker (full catalog, dark) ── */}
      <Modal open={magicPicker} onClose={() => setMagicPicker(false)} title={`เพิ่ม Magic → ระดับ “${MAGIC_TIERS.find((t) => t.key === magicTab)?.label}”`} dark>
        <CatPicker items={allMagic ?? []} accent="#5b3fa0" onPick={(m) => addMagicItem(m, magicTab)} />
      </Modal>

      {/* ── Feature picker (full catalog, dark) ── */}
      <Modal open={featPicker} onClose={() => setFeatPicker(false)} title="เพิ่ม Feature" dark>
        <CatPicker items={allFeatures ?? []} accent="#b4602a" onPick={addFeatItem} />
      </Modal>

      {/* ── On-Hand "Use" picker (Weapon / Shield / Artifact only) ── */}
      <Modal open={!!handSlot} onClose={() => setHandSlot(null)} title={`Use ไอเทมเข้า${HAND_SLOTS.find((s) => s.key === handSlot)?.label ?? 'มือ'}`}>
        <p style={{ fontSize: 12.5, color: '#8d8a82', margin: '0 0 12px' }}>เฉพาะ Weapon / Shield / Artifact — กด “Use” เพื่อถือเข้าช่องนี้ · อาวุธสองมือจะใช้สองช่อง{hasTitansGrip ? ' (ยกเว้น: มี Titan’s Grip)' : ''}</p>
        <EquipPicker match={isHandItem} actionLabel="Use" onPick={(m) => { if (handSlot && useHandItem(handSlot, m)) setHandSlot(null); }} />
      </Modal>

      {/* ── Equipment & Items picker → receive into LOOT ── */}
      <Modal open={invPicker} onClose={() => setInvPicker(false)} title="Equipment & Items">
        <p style={{ fontSize: 12.5, color: '#8d8a82', margin: '0 0 12px' }}>เลือกสิ่งของแล้วกด “รับ” เพื่อเก็บเข้ากอง LOOT — จากนั้นลากไปยัง Ready หรือกระเป๋าได้</p>
        <EquipPicker onPick={pickToInv} onAddCustom={addCustomInv} />
      </Modal>

      {/* ── "ท้าทาย" per-skill challenge popup ── */}
      <Modal open={!!challengeSkill} onClose={() => setChallengeSkill(null)} title="ท้าทาย">
        {challengeSkill && (() => {
          let sk: { attr: SkillAttr; name: string } | null = null;
          for (const cat of DWELLER_SKILLS) for (const s of cat.skills) if (skillKey(cat.en, s.en) === challengeSkill) sk = s;
          if (!sk) return null;
          const ch = getCh(challengeSkill);
          const info = skillInfo(sk.attr, talent.includes(challengeSkill), ch.level);
          const cycle = (i: number) => { const cells = [...ch.cells]; cells[i] = (cells[i] + 1) % 3; setCh(challengeSkill, { ...ch, cells }); };
          const cellColor = (c: number) => (c === 1 ? '#d9736b' : c === 2 ? '#7bc48a' : '#fff');
          const cellBorder = (c: number) => (c === 1 ? '#c0432a' : c === 2 ? '#5aa06a' : '#d8d4cc');
          return (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ width: 28, height: 24, borderRadius: 6, background: SKILL_ATTR_COLOR[sk.attr], color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{sk.attr}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#2f2c25' }}>{sk.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: 13, color: '#8d8a82' }}>ลูกเต๋า: <b style={{ color: '#e07a5f', fontSize: 15 }}>{info.label}</b> {ch.level !== 0 && <span style={{ color: '#9a978e' }}>(ระดับ {ch.level > 0 ? '+' : ''}{ch.level})</span>}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={() => setCh(challengeSkill!, { ...ch, level: ch.level - 1 })} style={{ flex: 'none', border: '1px solid #f0d0c4', background: '#f9eeea', color: '#c0432a', borderRadius: 9, padding: '9px 12px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>◄ ลดระดับ</button>
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 5 }}>
                  {ch.cells.map((c, i) => (
                    <button key={i} onClick={() => cycle(i)} title="กดเปลี่ยนสี ขาว/แดง/เขียว" style={{ height: 30, borderRadius: 7, background: cellColor(c), border: `1.5px solid ${cellBorder(c)}`, cursor: 'pointer' }} />
                  ))}
                </div>
                <button onClick={() => setCh(challengeSkill!, { ...ch, level: ch.level + 1 })} style={{ flex: 'none', border: '1px solid #cfe6d6', background: '#eef6f0', color: '#2f7d4f', borderRadius: 9, padding: '9px 12px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>เพิ่มระดับ ►</button>
              </div>
              <p style={{ fontSize: 11.5, color: '#a8a59d', margin: '12px 0 0' }}>เพิ่มระดับ → ลูกเต๋า +1 ขั้น · ลดระดับ → ลูกเต๋า −1 ขั้น · แต่ละช่องกดสลับ ขาว → แดง → เขียว</p>
            </div>
          );
        })()}
      </Modal>
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

  const needRace = !!raceId && !isAncestryRace;
  const needAncestry = !!ancestryId;
  const needClass = !!classValue;
  const { data: aData } = useQuery({
    enabled: needRace,
    queryKey: ['race-core', raceId],
    queryFn: () => api.get<{ core: { attributes: CoreAttr[] } }>(`/wizard/race-core/${encodeURIComponent(raceId)}`),
    staleTime: Infinity,
  });
  const { data: bData } = useQuery({
    enabled: needAncestry,
    queryKey: ['ancestry-core', ancestryId],
    queryFn: () => api.get<{ core: { attributes: CoreAttr[] } }>(`/wizard/ancestry-core/${encodeURIComponent(ancestryId)}`),
    staleTime: Infinity,
  });
  const { data: cData } = useQuery({
    enabled: needClass,
    queryKey: ['class-core', classValue],
    queryFn: () => api.get<{ core: { attributes: CoreAttr[] } }>(`/wizard/class-core/${encodeURIComponent(classValue)}`),
    staleTime: Infinity,
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
  // While the source grades are still loading, don't flash a wrong intermediate
  // value — reuse the last grades persisted on the sheet if we have them.
  const ready = (!needRace || !!aData) && (!needAncestry || !!bData) && (!needClass || !!cData);
  if (!ready) {
    const stored = (character.data.sheet as { summary?: { grades?: Record<string, string> } } | undefined)?.summary?.grades;
    if (stored && typeof stored === 'object' && Object.keys(stored).length > 0) return stored;
  }
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
function GrowingAnswer({ value, onCommit, minHeight = 72 }: { value: string; onCommit: (v: string) => void; minHeight?: number }) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setText(value); }, [value]);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`; }
  }, [text, minHeight]);
  return (
    <textarea
      ref={ref}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (text !== value) onCommit(text); }}
      placeholder="เขียนคำตอบของคุณ…"
      style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 10, padding: '11px 13px', fontSize: 13.5, lineHeight: 1.7, fontFamily: 'inherit', color: '#2f2c25', background: '#fff', resize: 'none', overflow: 'hidden', minHeight }}
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
// ── Per-coin wallet: coins are held as discrete denominations (no auto-rollup).
// walletCoins is the source of truth; walletIC is kept in sync as the derived total.
const ZERO_COINS: Record<string, number> = { PC: 0, GC: 0, SC: 0, CC: 0, IC: 0 };
const coinsOf = (d: Record<string, unknown>): Record<string, number> => {
  const w = d.walletCoins;
  if (w && typeof w === 'object') return { ...ZERO_COINS, ...(w as Record<string, number>) };
  return { ...ZERO_COINS, ...decomposeIC(numData(d.walletIC)) }; // migrate legacy IC-only wallets
};
const coinsToIC = (c: Record<string, number>) => COIN_DEFS.reduce((s, def) => s + numData(c[def.key]) * def.ic, 0);
const addCoins = (c: Record<string, number>, delta: Record<string, number>) => {
  const out = { ...ZERO_COINS, ...c };
  for (const def of COIN_DEFS) out[def.key] = Math.max(0, numData(out[def.key]) + numData(delta[def.key]));
  return out;
};
// Pay `amount` IC largest-coin-first, returning change in the fewest coins — so
// only the coins actually needed to pay are broken; the rest of the purse is untouched.
const spendCoins = (c: Record<string, number>, amount: number): Record<string, number> | null => {
  if (coinsToIC(c) < amount) return null;
  const out = { ...ZERO_COINS, ...c };
  let paid = 0;
  for (const def of COIN_DEFS) { while (out[def.key] > 0 && paid < amount) { out[def.key] -= 1; paid += def.ic; } }
  const change = decomposeIC(paid - amount);
  for (const def of COIN_DEFS) out[def.key] += numData(change[def.key]);
  return out;
};

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

  // Features the character already received elsewhere (Step 2 Weapon Proficiency
  // + level-table grant picks) — these show as "เคยรับมาแล้ว", not buyable.
  const classValue = typeof character.data.class === 'string' ? (character.data.class as string) : '';
  const { data: cwData } = useQuery({
    enabled: !!classValue,
    queryKey: ['class-weapons', classValue],
    queryFn: () => api.get<{ weapons: { options: WeaponOption[] } }>(`/wizard/class-weapons/${encodeURIComponent(classValue)}`),
  });
  const grantedIds = (() => {
    const s = new Set<string>();
    const chosenWP = Array.isArray(character.data.weaponProficiencies) ? (character.data.weaponProficiencies as string[]) : [];
    const opts = cwData?.weapons.options ?? [];
    chosenWP.forEach((optId) => { const o = opts.find((x) => x.id === optId); if (o?.featureId) s.add(o.featureId); });
    const gp = character.data.levelGrantPicks && typeof character.data.levelGrantPicks === 'object' ? (character.data.levelGrantPicks as Record<string, string>) : {};
    Object.values(gp).forEach((id) => id && s.add(id));
    return s;
  })();

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

      <FeatureBuySearch wiwonIds={wiwonIds} purchases={purchases} availableQL={availableQL} onToggle={toggleBuy} grantedIds={grantedIds} />
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
  const coins = coinsOf(character.data);
  const walletIC = coinsToIC(coins);
  const qlConverted = numData(character.data.qlConverted);
  const rb: RoyalBond[] = Array.isArray(character.data.walletRB) ? (character.data.walletRB as RoyalBond[]) : [];
  const rbTotalGC = rb.reduce((s, b) => s + numData(b.price), 0);
  const grandGC = walletIC / 1000 + rbTotalGC;

  const setData = (partial: Record<string, unknown>) => patch.mutate({ data: { ...character.data, ...partial } });
  const writeCoins = (next: Record<string, number>) => setData({ walletCoins: next, walletIC: coinsToIC(next) });
  // Adjust a single denomination by ±1 — no rollup into a higher coin.
  const adjustCoin = (key: string, sign: 1 | -1) => writeCoins(addCoins(coins, { [key]: sign }));
  const convertQL = () => {
    const amt = Math.max(0, Math.min(Math.floor(qlInput || 0), availableQL));
    if (amt <= 0) return;
    // Convert to coins as discrete denominations (adds new coins, doesn't merge existing).
    setData({ walletCoins: addCoins(coins, decomposeIC(amt * QL_TO_IC)), walletIC: walletIC + amt * QL_TO_IC, qlConverted: qlConverted + amt });
  };
  const addBond = () => setData({ walletRB: [...rb, { id: crypto.randomUUID(), price: 0 }] });
  const setBond = (id: string, price: number) => setData({ walletRB: rb.map((b) => (b.id === id ? { ...b, price } : b)) });
  const removeBond = (id: string) => setData({ walletRB: rb.filter((b) => b.id !== id) });

  return (
    <div style={{ ...cardPlain, marginTop: 16 }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 22 }}>กระเป๋าเงิน</h2>
      <p style={{ color: '#8d8a82', fontSize: 13.5, margin: '8px 0 16px' }}>
        10 IC = 1 CC · 10 CC = 1 SC · 10 SC = 1 GC · 10 GC = 1 PC — เก็บเหรียญแยกตามชนิด ไม่รวบยอดให้อัตโนมัติ
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
                    <button onClick={() => adjustCoin(c.key, -1)} disabled={coins[c.key] <= 0} style={{ width: 26, height: 24, borderRadius: 6, border: '1px solid #e0ded7', background: coins[c.key] <= 0 ? '#f5f3ef' : '#fff', color: coins[c.key] <= 0 ? '#cfccc4' : '#6b6860', fontSize: 15, fontWeight: 800, cursor: coins[c.key] <= 0 ? 'not-allowed' : 'pointer' }}>−</button>
                    <button onClick={() => adjustCoin(c.key, 1)} style={{ width: 26, height: 24, borderRadius: 6, border: '1px solid #e0ded7', background: '#fff', color: '#6b6860', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>+</button>
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
// A free-floating window you can drag anywhere by holding on it (interactive
// elements inside still work). Used for the Dweller Sheet's ⓘ detail popups so
// several can be positioned side-by-side while cross-referencing.
let floatZCounter = 400; // shared so the last-touched floating window sits on top
function FloatWindow({ title, onClose, children, width = 430, cascadeIndex = 0 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number; cascadeIndex?: number }) {
  const [pos, setPos] = useState(() => {
    const base = Math.max(16, (typeof window !== 'undefined' ? window.innerWidth : 1200) / 2 - width / 2);
    return { x: base + (cascadeIndex % 6) * 30, y: 90 + (cascadeIndex % 6) * 30 };
  });
  const [z, setZ] = useState(() => ++floatZCounter);
  const raise = () => setZ(++floatZCounter);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    raise(); // bring to front on any interaction
    if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return; // keep controls usable
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  return createPortal(
    <div
      onPointerDown={onDown}
      onPointerMove={(e) => { if (drag.current) setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }); }}
      onPointerUp={() => { drag.current = null; }}
      style={{ position: 'fixed', left: pos.x, top: pos.y, width, maxWidth: '92vw', maxHeight: '82vh', zIndex: z, background: '#fff', border: '1px solid #d8d5cd', borderRadius: 14, boxShadow: '0 18px 50px rgba(0,0,0,.28)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 14px', borderBottom: '1px solid #efece6', background: '#faf9f7', cursor: 'grab', userSelect: 'none' }}>
        <span style={{ fontSize: 13, color: '#c9c5bd' }}>⠿</span>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-serif)', color: '#2f2c25' }}>{title}</span>
        <button onClick={onClose} title="ปิด" style={{ flex: 'none', border: 'none', background: 'none', color: '#a8a59d', cursor: 'pointer', fontSize: 17, lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ padding: '14px 16px', overflowY: 'auto' }}>{children}</div>
    </div>,
    document.body,
  );
}

function ItemDetailView({ item, isFeature }: { item: CatalogItem; isFeature: boolean }) {
  const cfg = CATALOG_CONFIGS.magic;
  const src = isFeature && cfg.feature ? cfg.feature : cfg;
  const fv = (key: string) =>
    key === 'source' ? item.source : key === 'tag' ? String(item.fields.tag ?? item.tags[0] ?? '') : item.fields[key] != null ? String(item.fields[key]) : '';
  const rows = src.detailKeys.map(([label, key]) => ({ label, key, value: fv(key) })).filter((r) => r.value !== '');
  // Full copy of the master data: append any remaining non-empty fields the
  // config's detailKeys don't already cover, so nothing from the source is hidden.
  const shownKeys = new Set(src.detailKeys.map(([, k]) => k));
  const extra = Object.entries(item.fields)
    .filter(([k, v]) => !shownKeys.has(k) && v != null && v !== '' && typeof v !== 'object')
    .map(([k, v]) => ({ label: k, value: String(v) }));
  return (
    <div>
      {item.subtitle && <div style={{ fontSize: 12.5, color: '#8d8a82', marginBottom: 10 }}>{item.subtitle}</div>}
      {(rows.length > 0 || extra.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '7px 16px', margin: '4px 0 14px', fontSize: 13 }}>
          {[...rows, ...extra].map((r) => (
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
  grantedIds,
}: {
  wiwonIds: string[];
  purchases: Record<string, number>;
  availableQL: number;
  onToggle: (f: CatalogItem, cost: number) => void;
  grantedIds?: Set<string>;
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
    const granted = grantedIds?.has(f.id) ?? false; // already received in Step 2 / level grants
    const isOwned = f.id in purchases;
    const canAfford = isOwned || availableQL >= cost;
    const ptags = f.tags.filter((t) => PURCHASE_TAGS.includes(t));
    return (
      <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${granted ? '#c9c5bd' : isOwned ? '#2f7d4f' : 'var(--border-soft)'}`, background: granted ? '#f4f2ee' : isOwned ? '#f2f8f4' : '#fff', opacity: granted ? 0.9 : 1 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2f2c25' }}>{f.name}</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
            {ptags.map((t) => <span key={t} style={{ fontSize: 10.5, color: '#8d8a82', background: '#f2efe9', borderRadius: 6, padding: '1px 7px' }}>{t}</span>)}
          </div>
        </div>
        {!granted && <span style={{ flex: 'none', fontSize: 12, fontWeight: 700, color: '#2a5fbd', background: '#eef4fb', border: '1px solid #d3e2f5', borderRadius: 8, padding: '4px 10px' }}>{cost} QL</span>}
        <button onClick={() => setInfo(f)} style={{ flex: 'none', border: '1px solid var(--border-soft)', background: '#fff', color: '#6b6860', borderRadius: 8, padding: '6px 10px', fontSize: 11.5, cursor: 'pointer' }}>ⓘ</button>
        {granted ? (
          <span style={{ flex: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, background: '#ece9e3', color: '#8d8a82' }}>เคยรับมาแล้ว</span>
        ) : (
          <button
            onClick={() => onToggle(f, cost)}
            disabled={!canAfford}
            style={{ flex: 'none', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: canAfford ? 'pointer' : 'not-allowed', background: isOwned ? '#e6efe9' : canAfford ? '#e07a5f' : '#eee', color: isOwned ? '#2f7d4f' : canAfford ? '#fff' : '#b0ada4' }}
          >
            {isOwned ? 'แลกแล้ว ✓' : 'แลก'}
          </button>
        )}
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
const START_GOLD_IC = 10000; // เงินเริ่มต้น 10 Gold
const SELL_RATE = 0.4; // ราคาขาย = 40% ของเต็ม (ลดลง 60%)
const coinStr = (ic: number) => {
  const d = decomposeIC(ic);
  const parts = COIN_DEFS.filter((c) => d[c.key] > 0).map((c) => `${d[c.key]} ${c.key}`);
  return parts.length ? parts.join(' ') : '0';
};
// costNum is stored directly as the Iron-coin (IC) total of the item's coin cost.
const priceOf = (m: CatalogItem) => parseInt(String(m.fields.costNum ?? '').replace(/[^0-9]/g, ''), 10) || 0;

interface BagLine { lineId: string; itemId: string; name: string; priceIC: number; zone?: 'loot' | 'ready' | 'bag'; kg?: number; isBag?: boolean; desc?: string; dur?: number; durMax?: number; arts?: string; engrave?: string; worn?: boolean; cap?: number; inBag?: string }
const CLOTHING_RE = /clothing|เสื้อผ้า|apparel|garment|robe|เสื้อ|กางเกง|ชุด|เครื่องแต่งกาย|cloak|cape/i;
const WEAPON_RE = /weapon|อาวุธ|sword|blade|ดาบ|axe|ขวาน|bow|ธนู|spear|หอก|dagger|มีด|gun|ปืน|hammer|ค้อน|shield|โล่/i;

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

// Equipment & Items picker used on the sheet's inventory tab. Picking an item
// "receives" it (no payment) into LOOT with its real weight from item data.
function EquipPicker({ onPick, match, actionLabel = 'รับ', onAddCustom }: { onPick: (m: CatalogItem) => void; match?: (m: CatalogItem) => boolean; actionLabel?: string; onAddCustom?: (name: string, desc: string) => void }) {
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [cName, setCName] = useState('');
  const [cDesc, setCDesc] = useState('');
  const [added, setAdded] = useState<Record<string, number>>({});
  const { data: all, isLoading } = useQuery({ queryKey: ['sheet-equipment'], queryFn: fetchEquipment });
  const pool = (all ?? []).filter((m) => !match || match(m));
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
      {onAddCustom && (
        <div style={{ marginTop: 12, padding: '11px 12px', border: '1px dashed #d8d5cd', borderRadius: 12, background: '#faf9f6' }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: '#8d8a82', letterSpacing: .3, marginBottom: 8 }}>＋ เพิ่มไอเทมเอง</div>
          <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="ชื่อไอเทม" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 9, padding: '8px 11px', fontSize: 13, background: '#fff', marginBottom: 7 }} />
          <textarea value={cDesc} onChange={(e) => setCDesc(e.target.value)} placeholder="คำอธิบาย (ไม่บังคับ)" rows={2} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 9, padding: '8px 11px', fontSize: 12.5, background: '#fff', resize: 'vertical', fontFamily: 'inherit' }} />
          <button
            disabled={!cName.trim()}
            onClick={() => { onAddCustom(cName.trim(), cDesc.trim()); setCName(''); setCDesc(''); }}
            style={{ marginTop: 8, width: '100%', border: 'none', borderRadius: 9, padding: '8px 0', fontSize: 12.5, fontWeight: 700, cursor: cName.trim() ? 'pointer' : 'not-allowed', background: cName.trim() ? '#2f2c25' : '#d8d5cd', color: '#fff' }}
          >เพิ่มลง Loot</button>
        </div>
      )}
      {isLoading && <div style={{ color: '#a8a59d', fontSize: 12.5, padding: '14px 0', textAlign: 'center' }}>กำลังโหลด…</div>}
      {!isLoading && matches.length === 0 && <div style={{ color: '#bdbab2', fontSize: 12.5, textAlign: 'center', padding: '14px 0' }}>ไม่พบอุปกรณ์</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, maxHeight: 360, overflowY: 'auto' }}>
        {matches.map((m) => {
          const kg = numData(m.fields.weightNum);
          const n = added[m.id] ?? 0;
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border-soft)', background: '#fff' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#2f2c25' }}>{m.name}</div>
                <div style={{ fontSize: 11, color: '#9a978e' }}>{kg > 0 ? `${kg} kg` : 'ไม่ระบุน้ำหนัก'}{m.tags.length ? ` · ${m.tags.slice(0, 3).join(', ')}` : ''}</div>
              </div>
              {n > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#2f7d4f' }}>รับแล้ว ×{n}</span>}
              <button onClick={() => { onPick(m); setAdded((a) => ({ ...a, [m.id]: (a[m.id] ?? 0) + 1 })); }} style={{ flex: 'none', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: '#e07a5f', color: '#fff' }}>{actionLabel}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Generic Magic/Feature catalog picker with search + tag filter (dark theme).
function CatPicker({ items, onPick, accent = '#5b3fa0' }: { items: CatalogItem[]; onPick: (m: CatalogItem) => void; accent?: string }) {
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, number>>({});
  const tagOf = (m: CatalogItem) => [...m.tags, ...(m.fields.tag ? [String(m.fields.tag)] : [])];
  const allTags = Array.from(new Set(items.flatMap(tagOf))).filter(Boolean).sort();
  const q = query.trim().toLowerCase();
  const hay = (m: CatalogItem) => `${m.name} ${m.subtitle ?? ''} ${tagOf(m).join(' ')} ${m.description.replace(/<[^>]+>/g, ' ')}`.toLowerCase();
  const matches = items.filter((m) => (!tagFilter || tagOf(m).includes(tagFilter)) && (!q || hay(m).includes(q)));
  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔍 ค้นหา…" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #3a3730', borderRadius: 10, padding: '9px 12px', fontSize: 13, background: '#221f1a', color: '#f3ede1', outline: 'none' }} />
      {allTags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, maxHeight: 76, overflowY: 'auto' }}>
          {allTags.map((t) => { const on = tagFilter === t; return <button key={t} onClick={() => setTagFilter(on ? null : t)} style={{ border: `1px solid ${on ? accent : '#3a3730'}`, background: on ? accent : '#2a2620', color: on ? '#fff' : '#cbc3b4', borderRadius: 20, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>{t}</button>; })}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12, maxHeight: 360, overflowY: 'auto' }}>
        {matches.length === 0 && <div style={{ color: '#8d8a82', fontSize: 12.5, textAlign: 'center', padding: '14px 0' }}>ไม่พบรายการ</div>}
        {matches.map((m) => {
          const n = added[m.id] ?? 0;
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 10, border: '1px solid #35322b', background: '#26231e' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f3ede1' }}>{m.name}</div>
                <div style={{ fontSize: 11, color: '#9a978e' }}>{tagOf(m).slice(0, 4).join(' · ') || '—'}</div>
              </div>
              {n > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#7bc48a' }}>เพิ่มแล้ว ×{n}</span>}
              <button onClick={() => { onPick(m); setAdded((a) => ({ ...a, [m.id]: (a[m.id] ?? 0) + 1 })); }} style={{ flex: 'none', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: accent, color: '#fff' }}>เพิ่ม</button>
            </div>
          );
        })}
      </div>
    </div>
  );
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
  const [buyTarget, setBuyTarget] = useState<CatalogItem | null>(null); // confirm before buying
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
  const coins = coinsOf(character.data);
  const walletIC = coinsToIC(coins);
  const tradeIC = numData(character.data.walletTradeIC);
  const bag: BagLine[] = Array.isArray(character.data.bag) ? (character.data.bag as BagLine[]) : [];
  const hasTrades = bag.length > 0 || tradeIC !== 0;

  const setData = (partial: Record<string, unknown>) => patch.mutate({ data: { ...character.data, ...partial } });
  // Start money = 10 Gold coins (kept as GC, never consolidated into 1 Platinum).
  const claim = () => { const next = addCoins(coins, { GC: 10 }); setData({ walletStart: true, walletCoins: next, walletIC: coinsToIC(next) }); };
  const cancelStart = () => {
    if (hasTrades) { setConfirmReset(true); return; }
    const next = addCoins(coins, { GC: -10 });
    setData({ walletStart: false, walletCoins: next, walletIC: coinsToIC(next) });
  };
  const doReset = () => {
    // Undo every trade, drop the bag, then pull the 10 Gold back out.
    const restIC = Math.max(0, walletIC - tradeIC - START_GOLD_IC);
    setData({ walletStart: false, walletCoins: decomposeIC(restIC), walletIC: restIC, walletTradeIC: 0, bag: [] });
    setConfirmReset(false);
  };
  const buy = (m: CatalogItem) => {
    const p = priceOf(m);
    const next = spendCoins(coins, p); // pay largest-first, keep change; leaves the rest of the purse intact
    if (!next) return;
    setData({ walletCoins: next, walletIC: coinsToIC(next), walletTradeIC: tradeIC - p, bag: [...bag, { lineId: crypto.randomUUID(), itemId: m.id, name: m.name, priceIC: p }] });
    setBuyTarget(null);
  };
  const sell = (line: BagLine) => {
    const refund = Math.floor(line.priceIC * SELL_RATE);
    const next = addCoins(coins, decomposeIC(refund));
    setData({ walletCoins: next, walletIC: coinsToIC(next), walletTradeIC: tradeIC + refund, bag: bag.filter((l) => l.lineId !== line.lineId) });
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
          <ShopList walletIC={walletIC} onBuy={setBuyTarget} onInfo={setInfo} />
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

      <Modal open={!!buyTarget} onClose={() => setBuyTarget(null)} title="ยืนยันการซื้อ">
        {buyTarget && (() => {
          const p = priceOf(buyTarget);
          const afford = walletIC >= p;
          return (
            <>
              <p style={{ fontSize: 13.5, color: '#3c3a33', lineHeight: 1.7, margin: 0 }}>
                แน่ใจไหมว่าจะซื้อ <b>{buyTarget.name}</b>?<br />
                ราคา <b style={{ color: '#c15a3f' }}>{coinStr(p)}</b> · หลังซื้อเหลือ <b>{coinStr(Math.max(0, walletIC - p))}</b>
                {!afford && <span style={{ color: '#b4513a' }}><br />⚠️ เงินไม่พอ</span>}
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
                <Button variant="ghost" onClick={() => setBuyTarget(null)}>ยกเลิก</Button>
                <Button variant="coral" disabled={!afford} onClick={() => buy(buyTarget)}>ยืนยันการซื้อ</Button>
              </div>
            </>
          );
        })()}
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
// Blood (Scratch) rolled per level-up (level 2..15), keyed by level. Reverting a
// level drops the entries above the new level; re-leveling rolls fresh (same system).
const lvScratchMap = (character: Character): Record<string, number> =>
  character.data.lvScratch && typeof character.data.lvScratch === 'object' ? (character.data.lvScratch as Record<string, number>) : {};
const sumLvScratch = (character: Character) => Object.values(lvScratchMap(character)).reduce((s, v) => s + numData(v), 0);

// A number field that keeps local focus while typing and commits on blur.
function NumField({ value, onCommit, width = 76, style }: { value: number; onCommit: (v: number) => void; width?: number; style?: React.CSSProperties }) {
  const [t, setT] = useState(String(value));
  useEffect(() => { setT(String(value)); }, [value]);
  return (
    <input
      type="number"
      value={t}
      onChange={(e) => setT(e.target.value)}
      onBlur={() => { const v = Math.round(Number(t) || 0); setT(String(v)); if (v !== value) onCommit(v); }}
      style={{ width, border: '1px solid #e0ded7', borderRadius: 8, padding: '8px 10px', fontSize: 14, textAlign: 'center', background: '#fff', ...style }}
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
  const ancestryName = typeof character.data.ancestryName === 'string' ? (character.data.ancestryName as string) : '';
  const className = typeof character.data.className === 'string' ? (character.data.className as string) : '';
  const isAncestry = raceHasAncestry(raceName);
  // Race Feature chosen in Step 1 — surfaced here for reference.
  const raceId = typeof character.data.race === 'string' ? (character.data.race as string) : '';
  const { data: racePool } = useQuery({ enabled: !!raceId, queryKey: ['race-feat', wiwonIdsOf(character).join(',')], queryFn: () => fetchFeaturesByTag('Race', wiwonIdsOf(character)) });
  const raceFeat = (racePool ?? []).find((f) => f.id === raceId);

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
  const scratchTotal = n('baseScratch') + n('scratchRollEND') + a('scratch') + sumLvScratch(character);
  const woundTotal = n('wound') + a('wound');
  const natureTotal = n('natureBase') + faceDEX + facePER + a('natureDef');
  const sanityTotal = n('sanityBase') + faceCVN + n('sanityRollINT') + a('sanity');
  const moveTotal = n('movement') + a('movement');
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

      {(raceName || className) && (
        <div style={{ border: '1px solid #eae7e0', borderRadius: 12, background: '#faf9f7', padding: '12px 14px', marginBottom: 18 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: '#a8a59d', marginBottom: 8 }}>ข้อมูลจากการสร้างตัวละคร (Step 1)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {raceName && <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 11px', borderRadius: 8, background: '#f0ece4', color: '#6b5b45' }}>เผ่าพันธุ์: {raceName}</span>}
            {ancestryName && <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 11px', borderRadius: 8, background: '#e5edfb', color: '#2a5fbd' }}>สายเลือด: {ancestryName}</span>}
            {className && <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 11px', borderRadius: 8, background: '#ede7f6', color: '#5b3fa0' }}>คลาส: {className}</span>}
          </div>
          {raceFeat && (raceFeat.subtitle || raceFeat.description) && (
            <div style={{ marginTop: 9, fontSize: 12, color: '#6b6860', lineHeight: 1.6 }}>
              {raceFeat.subtitle && <div style={{ fontWeight: 600, color: '#46443c' }}>{raceFeat.subtitle}</div>}
              {raceFeat.description && <div style={{ marginTop: 3 }} dangerouslySetInnerHTML={{ __html: raceFeat.description }} />}
            </div>
          )}
        </div>
      )}

      <div style={{ marginBottom: 18 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#8d8a82' }}>ชื่อตัวละคร</label>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} placeholder="ตั้งชื่อตัวละคร…" style={{ display: 'block', marginTop: 6, width: '100%', maxWidth: 380, boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 10, padding: '10px 13px', fontSize: 14.5, background: '#fff' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        <StatCard title="Scratch Point" total={scratchTotal} isAncestry={isAncestry} adjVal={a('scratch')} onAdj={(v) => setAdj('scratch', v)}>
          {lbl('Base')}
          <NumField value={n('baseScratch')} onCommit={(v) => setS10({ baseScratch: v })} />
          {rollPart('scratchRollEND', 'END')}
          {sumLvScratch(character) > 0 && <span style={{ fontSize: 12, color: '#a06a44', fontWeight: 700 }}>+ โบนัสเลือดจากเลเวล (ทอย END ต่อเลเวล): {sumLvScratch(character)}</span>}
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
  const byAbbr = useEffectiveGrades(character);
  const endFaces = facesOf(byAbbr, 'END'); // blood (Scratch) rolled per level-up
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

  // Blood per level: keep existing rolls for retained levels (2..target), roll a
  // fresh END die for any newly-gained level, and drop levels above the target.
  const buildLvScratch = (target: number) => {
    const cur = lvScratchMap(character);
    const next: Record<string, number> = {};
    for (let lv = 2; lv <= target; lv++) next[lv] = cur[lv] != null ? cur[lv] : rollDie(endFaces);
    return next;
  };

  // Changing LV: if lowering below a level that's already claimed, confirm first
  // — accepting wipes every claim in the table. Blood (Scratch) is re-derived either way.
  const changeLevel = (n: number) => {
    const hasClaimAbove = Object.keys(claims).some((lv) => Number(lv) > n);
    if (hasClaimAbove) setPendingLevel(n);
    else patch.mutate({ data: { ...character.data, level: n, lvScratch: buildLvScratch(n) } });
  };
  const confirmLevelDown = () => {
    if (pendingLevel == null) return;
    patch.mutate({ data: { ...character.data, level: pendingLevel, levelClaims: {}, levelGrantPicks: {}, lvScratch: buildLvScratch(pendingLevel) } }, { onSuccess: () => setPendingLevel(null) });
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
      <div style={{ fontSize: 12, color: '#a06a44', background: '#fff8ef', border: '1px solid #efe0cd', borderRadius: 9, padding: '8px 12px', marginTop: 10, lineHeight: 1.6 }}>
        🩸 เลือด (Scratch) จากเลเวล — ทุกครั้งที่เลเวลอัพจะทอย END (d{endFaces}) เพิ่มเป็นลำดับขั้น · ย้อนเลเวลจะล้างของเลเวลที่สูงกว่าทิ้ง
        <br />
        รวมโบนัสตอนนี้: <b style={{ color: '#8a4a2a' }}>+{sumLvScratch(character)} Scratch</b>
        {charLevel > 1 && (
          <span style={{ color: '#b79a7a' }}> · {Array.from({ length: charLevel - 1 }, (_, i) => i + 2).map((lv) => `Lv${lv}:+${numData(lvScratchMap(character)[lv])}`).join('  ')}</span>
        )}
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
