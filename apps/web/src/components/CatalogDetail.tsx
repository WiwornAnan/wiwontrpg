import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { CatalogCategory, CatalogConfig, CatalogItem, WiwonCover } from '@wiwonanant/shared';
import { computeFeatureTN, computeMagicTN, weaponDamageBonus } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import type { CatalogListResult } from '../lib/catalogHooks';
import { Modal } from './Modal';
import { StarButton } from './StarButton';

interface EngravedRef {
  id: string;
  name: string;
}
interface WeaponArtRef {
  id: string;
  name: string;
}

// Weapon-art capacity by the item's Professional Level.
const PRO_ARTS: Record<string, number> = { Amateur: 0, Journeyman: 1, Expert: 2, Master: 3 };

// Monster Core Attributes — displayed as a grid, not plain rows.
const CORE_ATTR_KEYS = ['coreSTR', 'coreDEX', 'coreEND', 'corePER', 'coreINT', 'coreAUT', 'coreCVN'];
const GRADE_COLOR: Record<string, string> = { A: '#b4842a', B: '#2f6b4f', C: '#2a6fdb', D: '#8d7a4a', X: '#b4513a' };

function fv(item: CatalogItem, key: string): string {
  if (key === 'source') return item.source;
  if (key === 'tag') return String(item.fields.tag ?? item.tags[0] ?? '');
  const v = item.fields[key];
  return v === undefined || v === null ? '' : String(v);
}

// Coin denominations for equipment cost (platinum / gold / silver / copper).
const COIN_TIERS: { key: string; label: string; abbr: string; color: string }[] = [
  { key: 'platinum', label: 'Platinum', abbr: 'pp', color: '#7fb3c4' },
  { key: 'gold', label: 'Gold', abbr: 'gp', color: '#cd9b3d' },
  { key: 'silver', label: 'Silver', abbr: 'sp', color: '#9aa0a6' },
  { key: 'copper', label: 'Copper', abbr: 'cp', color: '#c0744a' },
];

// "Verbal, Ehen Device, Condition" -> "V · E · C" for the detail stat row.
function abbrevComponents(value: string): string {
  return value
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase())
    .join(' · ');
}

// Turn [....] tokens in a description into bold dark badges (e.g. [3RR+4]).
function renderBadges(html: string): string {
  return html.replace(
    /\[([^[\]\n]{1,40})\]/g,
    (_m, inner: string) =>
      `<span style="display:inline-flex;align-items:center;gap:4px;background:#15140f;color:#fff;font-weight:700;border-radius:6px;padding:1px 8px;font-size:.92em;white-space:nowrap">🎲 ${inner}</span>`,
  );
}

interface Props {
  item: CatalogItem;
  cfg: CatalogConfig;
  category: CatalogCategory;
  isFeature: boolean;
  onEdit: (item: CatalogItem) => void;
  onSubmitOfficial?: (item: CatalogItem) => void;
  // When shown inside a floating window (which already supplies a frame + its
  // own scroll), drop the sticky sidebar positioning and the redundant card
  // chrome — otherwise `position:sticky;top:96` pushes the content down and
  // leaves a large blank gap at the top.
  embedded?: boolean;
  // Per-instance (in-campaign) editing of Weapon Arts + Magic Engraving. When
  // set, the arts/engraved selection reads from these props (a specific
  // inventory line) and writes via the callbacks instead of mutating the shared
  // master catalog item. Everything else still reads from the master (Ehen,
  // Mana Slot count, Professional Level caps) so it matches Equipment & Item.
  instanceMode?: boolean;
  instanceArts?: WeaponArtRef[];
  instanceEngraved?: EngravedRef[];
  onInstanceArts?: (next: WeaponArtRef[]) => void;
  onInstanceEngraved?: (next: EngravedRef[]) => void;
  // Broadcast a "use" of a weapon art / engraved spell to the campaign Log
  // (only provided when the item is opened inside a campaign).
  onLogUse?: (kind: string, text: string, ref?: { itemId?: string; isFeature?: boolean }) => void;
}

const EXCLUDE_STAT = new Set(['source', 'rarity', 'school']);
const MAGIC_EXCLUDE = new Set(['ql', 'knowledge', 'curiosity', 'cost']);

export function CatalogDetail({ item, cfg, category, isFeature, onEdit, onSubmitOfficial, embedded, instanceMode, instanceArts, instanceEngraved, onInstanceArts, onInstanceEngraved, onLogUse }: Props) {
  const { user, isDev } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: coversData } = useQuery({
    queryKey: ['wiwon-covers'],
    queryFn: () => api.get<{ covers: WiwonCover[] }>('/wiwon-covers'),
  });
  const relatedWiwon = coversData?.covers.find((c) => c.id === item.relatedWiwonId) ?? null;
  const source = isFeature && cfg.feature ? cfg.feature : cfg;
  const isMagicSpell = category === 'magic' && !isFeature;
  const isMagicFeature = category === 'magic' && isFeature;

  const canEdit = isDev || (!!user && item.isHomebrew && item.ownerUserId === user.id);
  const [descOpen, setDescOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [dur, setDur] = useState<boolean[]>([false, false, false]); // session durability ticks
  const [manaUsed, setManaUsed] = useState(0); // Mana Slots spent (manual tracker, independent of engraving)

  const del = useMutation({
    mutationFn: () => api.delete(`/catalog/${category}/item/${item.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog', category] }),
  });

  // Equipment coin cost (pp/gp/sp/cp), stored under fields.costCoins.
  const [coins, setCoins] = useState<Record<string, number>>(() => {
    const c = item.fields.costCoins;
    return c && typeof c === 'object' ? { ...(c as Record<string, number>) } : {};
  });
  const saveCoins = useMutation({
    mutationFn: (next: Record<string, number>) => api.patch(`/catalog/${category}/item/${item.id}`, { fields: { ...item.fields, costCoins: next } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog', category] }),
  });
  const hasCoins = COIN_TIERS.some((t) => (coins[t.key] ?? 0) > 0);

  // 2-column stat list derived from filterFields (matches the reference).
  const seen = new Set<string>();
  const stats = source.filterFields
    .filter((f) => {
      if (EXCLUDE_STAT.has(f.key)) return false;
      if (CORE_ATTR_KEYS.includes(f.key)) return false; // shown in the Core Attribute grid instead
      if ((isMagicSpell || isMagicFeature) && MAGIC_EXCLUDE.has(f.key)) return false;
      if (seen.has(f.key)) return false;
      seen.add(f.key);
      return true;
    })
    .map((f) => ({ label: f.label, value: f.key === 'components' ? abbrevComponents(fv(item, f.key)) : fv(item, f.key) }))
    .filter((s) => s.value !== '' && s.label !== 'Cost' && s.label !== 'Rarity' && s.label !== 'School' && s.label !== 'Requirements (Core Attribute)');
  // #14 Requirements as a Core Attribute grade (the #13 "+ Damage" feeds the
  // existing damage badge below, not a separate stat row).
  if (category === 'equipment') {
    const tag = fv(item, 'tag');
    // + Natural Defense (Armor / Shields) — worn armor adds this to Natural Defense.
    const natDef = fv(item, 'natDefBonus');
    if ((tag === 'Armor' || tag === 'Shields') && natDef) stats.push({ label: '+ Natural Defense', value: `+${natDef}` });
    // Specialization required (Tool).
    const toolSpec = fv(item, 'toolSpec');
    if (tag === 'Tool' && toolSpec) stats.push({ label: 'Specialization', value: toolSpec });
    const reqAttr = fv(item, 'reqAttr');
    if (reqAttr && reqAttr !== 'None') stats.push({ label: 'Requirements', value: `${reqAttr} ≥ ${fv(item, 'reqGrade') || '?'}` });
  }
  // Monster Core Attributes → their own grid (STR/DEX/END/PER/INT/AUT/CVN).
  const coreAttrs = CORE_ATTR_KEYS.map((k) => ({ abbr: k.replace('core', ''), grade: fv(item, k) })).filter((c) => c.grade);

  const keyStats = isMagicSpell
    ? [
        { label: 'Magic Slot', value: fv(item, 'cost').replace(/A particle of Ehen/gi, 'P.E'), bg: '#fdece2', color: '#c1502a' },
        { label: 'Quality of Life', value: fv(item, 'ql'), bg: '#ede7f6', color: '#5b3fa0' },
        { label: 'Knowledge', value: fv(item, 'knowledge'), bg: '#e5edfb', color: '#2a6fdb' },
      ]
    : isMagicFeature
    ? [
        { label: 'Willpower', value: fv(item, 'cost'), bg: '#fbeae6', color: '#c0432a' },
        { label: 'Quality of Life', value: fv(item, 'ql'), bg: '#ede7f6', color: '#5b3fa0' },
        { label: 'Curiosity Point', value: fv(item, 'curiosity'), bg: '#e5edfb', color: '#2a6fdb' },
      ]
    : [];
  // Only show the stat boxes that actually have a value; the row fits to them.
  const shownStats = keyStats.filter((k) => k.value && k.value.trim());

  // Casting TN — spells: Casting Level + Knowledge Points; features: Capacity +
  // Curiosity Point (checked on d8+d8+d10).
  const magicTN = isMagicSpell
    ? computeMagicTN(fv(item, 'castLevel'), fv(item, 'knowledge'))
    : isMagicFeature
    ? computeFeatureTN(fv(item, 'rarity'), fv(item, 'curiosity'))
    : null;
  const tnBaseLabel = isMagicFeature ? fv(item, 'rarity') : fv(item, 'castLevel');
  const tnModLabel = isMagicFeature ? 'Curiosity Point' : 'Knowledge Points';

  const cost = fv(item, 'cost');
  const isWeapon = category === 'equipment' && /weapon|อาวุธ/i.test(fv(item, 'equipType') + ' ' + fv(item, 'tag'));
  const showDurability = category === 'equipment' && /weapon|armor|shield|อาวุธ|เกราะ|โล่/i.test(fv(item, 'equipType') + ' ' + fv(item, 'tag'));
  // #13 — derived weapon damage bonus (falls back to a stored dmgBonus for legacy items).
  const computedDmg = weaponDamageBonus(item.fields);
  const dmgBase = computedDmg !== null ? computedDmg : Number(item.fields.dmgBonus ?? 0);
  const dmgPenalty = dur.filter(Boolean).length * 2;
  const dmgShown = Math.max(0, dmgBase - dmgPenalty);

  const descText = item.description;
  // Show ~14 lines before collapsing behind "อ่านเพิ่มเติม" (was too short before).
  const descLong = descText.replace(/<[^>]+>/g, '').length > 620;

  const boxStyle: React.CSSProperties = {
    width: 120,
    height: 120,
    borderRadius: 10,
    flex: 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    ...(item.iconUrl ? { backgroundImage: `url(${item.iconUrl})` } : { background: isMagicSpell ? '#ede7f6' : '#e7e5df' }),
  };

  // ----- Ehen Organ / Core: Mana Slots, spell engraving, weapon arts -----
  const patchFields = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.patch(`/catalog/${category}/item/${item.id}`, { fields: { ...item.fields, ...patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog', category] }),
  });
  const ehenOrgan = fv(item, 'ehenOrgan') === '1';
  const ehenCore = fv(item, 'ehenCore') === '1';
  const hasEhen = ehenOrgan || ehenCore;
  const showEhen = category === 'equipment' || category === 'monster';
  const slotCount = Math.max(0, parseInt(fv(item, 'manaSlot'), 10) || 0);
  // In instance mode the selection lives on the inventory line (scoped to this
  // character/campaign); otherwise it's the shared master item's fields.
  const masterEngraved: EngravedRef[] = Array.isArray(item.fields.engravedSpells) ? (item.fields.engravedSpells as EngravedRef[]) : [];
  const masterArts: WeaponArtRef[] = Array.isArray(item.fields.weaponArts) ? (item.fields.weaponArts as WeaponArtRef[]) : [];
  const engraved: EngravedRef[] = instanceMode ? instanceEngraved ?? [] : masterEngraved;
  const weaponArts: WeaponArtRef[] = instanceMode ? instanceArts ?? [] : masterArts;
  // Arts/engraving selection is editable per-instance by anyone in the campaign;
  // master-config editing (Ehen toggles, slot count, professional level) stays dev/owner-only.
  // Master item mutations are allowed ONLY on the admin catalog page (not
  // embedded). Inside the Dweller Sheet / Campaign (embedded) the database is
  // read-only; play edits go to the per-instance line instead.
  const masterEdit = canEdit && !embedded;
  const canEditRefs = instanceMode || masterEdit;
  const ehenParen = ehenOrgan && ehenCore ? '(Organ + Core)' : ehenCore ? '(Core)' : '(Organ)';
  // Engraving capacity: odd slots grant +1 (1→1, 3→2, 5→3); dev may override.
  const engraveMaxSet = parseInt(fv(item, 'engraveMax'), 10);
  const engraveMax = engraveMaxSet > 0 ? engraveMaxSet : Math.ceil(slotCount / 2);
  const weaponArtsMax = PRO_ARTS[fv(item, 'professionalLevel')] ?? 0;
  const [drawer, setDrawer] = useState<null | 'engrave' | 'weaponArts'>(null);
  const [pickQ, setPickQ] = useState('');
  const [popup, setPopup] = useState<string | null>(null);

  // Monster Scratch Points play-tracker (session only; base comes from the stat).
  const scratchBase = Math.max(0, parseInt(fv(item, 'scratch'), 10) || 0);
  const [scratchVal, setScratchVal] = useState(scratchBase);
  const [scratchDelta, setScratchDelta] = useState('');
  const applyScratch = (dir: 1 | -1) => {
    const d = parseInt(scratchDelta, 10) || 0;
    setScratchVal((v) => Math.max(0, Math.min(scratchBase, v + dir * d)));
    setScratchDelta('');
  };

  // Drawer data: magic spells to engrave, or features tagged "Weapon Arts".
  const spellPick = useQuery({
    queryKey: ['catalog', 'magic', 'pick-spell', pickQ],
    queryFn: () => api.get<CatalogListResult>(`/catalog/magic?scope=all&isFeature=false&page=1${pickQ ? `&q=${encodeURIComponent(pickQ)}` : ''}`),
    enabled: drawer === 'engrave',
  });
  const artPick = useQuery({
    queryKey: ['catalog', 'magic-feature', 'pick-art', pickQ],
    queryFn: () => api.get<CatalogListResult>(`/catalog/magic?scope=all&isFeature=true&tag=${encodeURIComponent('Weapon Arts')}&page=1${pickQ ? `&q=${encodeURIComponent(pickQ)}` : ''}`),
    enabled: drawer === 'weaponArts',
  });
  // Floating detail for a clicked engraved spell / weapon art.
  const popupDetail = useQuery({
    queryKey: ['catalog', 'magic', 'item', popup],
    queryFn: () => api.get<{ item: CatalogItem }>(`/catalog/magic/item/${popup}`),
    enabled: !!popup,
  });

  const commitEngraved = (next: EngravedRef[]) => (instanceMode ? onInstanceEngraved?.(next) : patchFields.mutate({ engravedSpells: next }));
  const commitArts = (next: WeaponArtRef[]) => (instanceMode ? onInstanceArts?.(next) : patchFields.mutate({ weaponArts: next }));
  const addEngraved = (it: CatalogItem) => {
    if (engraved.some((e) => e.id === it.id) || engraved.length >= engraveMax) return;
    commitEngraved([...engraved, { id: it.id, name: it.name }]);
  };
  const removeEngraved = (id: string) => commitEngraved(engraved.filter((e) => e.id !== id));
  const addArt = (it: CatalogItem) => {
    if (weaponArts.some((w) => w.id === it.id) || weaponArts.length >= weaponArtsMax) return;
    commitArts([...weaponArts, { id: it.id, name: it.name }]);
  };
  const removeArt = (id: string) => commitArts(weaponArts.filter((w) => w.id !== id));

  return (
    <div style={embedded
      ? { background: '#fff', position: 'relative' }
      : { background: '#fff', border: '1px solid #e4e2dc', borderRadius: 14, padding: 20, position: 'sticky', top: 96 }}>
      {item.approvedFromHomebrew && (
        <>
          <div title="Official — อนุมัติโดยผู้พัฒนา" style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 5, borderRadius: '14px 0 0 14px', background: 'linear-gradient(#7c5fc0,#5b3fa0)' }} />
          <div title="Official" style={{ position: 'absolute', top: 16, left: -13, width: 26, height: 26, borderRadius: '50%', background: '#5b3fa0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, boxShadow: '0 2px 8px rgba(91,63,160,.4)' }}>
            🌙
          </div>
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{item.name}</h3>
            {item.isHomebrew && (
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', color: '#e07a5f', border: '1px solid #f0cabd', borderRadius: 5, padding: '2px 7px' }}>HOMEBREW</span>
            )}
            {(() => {
              const r = fv(item, 'rarity');
              if (!r) return null;
              const map: Record<string, [string, string]> = {
                Poor: ['#eeeeee', '#7a7a72'],
                Common: ['#eef2ee', '#5f7a5f'],
                Uncommon: ['#e6f4ea', '#2f7d4f'],
                Rare: ['#e5edfb', '#2a5fbd'],
                Legendary: ['#f3ecfb', '#7a3fb0'],
              };
              const [bg, color] = map[r] ?? ['#efece6', '#8d8a82'];
              return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', borderRadius: 5, padding: '2px 8px', background: bg, color }}>{r}</span>;
            })()}
            {magicTN && (
              <span title={`Target Number\nพื้นฐาน ${magicTN.base} (${tnBaseLabel || '—'}) + ${magicTN.mod} (${tnModLabel}) = ${magicTN.tn}`} style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em', borderRadius: 5, padding: '2px 8px', background: '#15140f', color: '#f7dca0', cursor: 'help' }}>TN {magicTN.tn}</span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: '#8d8a82', marginTop: 3 }}>
            {fv(item, cfg.subtitleKey) || item.source}
          </div>
        </div>
        <StarButton catalogItemId={item.id} size={15} />
      </div>

      {masterEdit && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={() => onEdit(item)} style={{ flex: 1, padding: 7, background: '#15140f', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            ✎ แก้ไขข้อมูล
          </button>
          <button onClick={() => setConfirmDel(true)} style={{ flex: 1, padding: 7, background: '#fff', color: '#b4513a', border: '1px solid #f0d3cb', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            ลบข้อมูล
          </button>
        </div>
      )}

      <Modal
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="ยืนยันการลบข้อมูล"
        footer={
          <>
            <button onClick={() => setConfirmDel(false)} style={{ padding: '9px 18px', background: '#fff', border: '1px solid #d9d7d0', borderRadius: 9, fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>
              ยกเลิก
            </button>
            <button onClick={() => { del.mutate(); setConfirmDel(false); }} disabled={del.isPending} style={{ padding: '9px 20px', background: '#b4513a', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
              ตกลง ลบเลย
            </button>
          </>
        }
      >
        <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-muted)', margin: 0 }}>
          แน่ใจแล้วใช่ไหมว่าต้องการลบ “<b>{item.name}</b>”?
          <br />
          การลบนี้ถาวรและกู้คืนเองไม่ได้
        </p>
      </Modal>

      {shownStats.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${shownStats.length}, 1fr)`, gap: 8, marginTop: 16 }}>
          {shownStats.map((k) => (
            <div key={k.label} style={{ background: k.bg, borderRadius: 11, padding: '11px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.1, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: k.color, opacity: 0.85, marginTop: 3, letterSpacing: '.02em' }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, marginTop: 14 }}>
        <div style={boxStyle} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {stats.map((st) => (
            <Row key={st.label} label={st.label} value={st.value} />
          ))}
          {cost && !isMagicSpell && <Row label="Cost" value={cost} />}
        </div>
      </div>

      {coreAttrs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 9 }}>Core Attribute</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 7 }}>
            {coreAttrs.map((c) => {
              const col = GRADE_COLOR[c.grade] ?? '#5f5c54';
              return (
                <div key={c.abbr} style={{ background: '#faf9f7', border: '1px solid #ece9e3', borderRadius: 10, padding: '9px 4px', textAlign: 'center' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: '#a8a59d', letterSpacing: '.04em' }}>{c.abbr}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: col, lineHeight: 1.15, marginTop: 2 }}>{c.grade}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {category === 'equipment' && (masterEdit || hasCoins) && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>ราคา (เหรียญ)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {COIN_TIERS.map((t) => (
              <div key={t.key} style={{ border: '1px solid #ece9e3', borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 5 }}>
                  <span style={{ width: 13, height: 13, borderRadius: '50%', background: t.color, display: 'inline-block' }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#8d8a82' }}>{t.abbr}</span>
                </div>
                {masterEdit ? (
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={coins[t.key] ?? 0}
                    onChange={(e) => setCoins((c) => ({ ...c, [t.key]: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                    onBlur={() => saveCoins.mutate(coins)}
                    style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 7, padding: '5px 4px', textAlign: 'center', fontSize: 14, fontWeight: 700, outline: 'none' }}
                  />
                ) : (
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{coins[t.key] ?? 0}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {category === 'monster' && scratchBase > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Scratch Points</span>
            <span style={{ fontSize: 20, fontWeight: 800 }}>{scratchVal}</span>
            <span style={{ fontSize: 11, color: '#a8a59d' }}>/ ฐาน {scratchBase}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input value={scratchDelta} onChange={(e) => setScratchDelta(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="ใส่จำนวน" style={{ flex: 1, border: '1px solid #e0ded7', borderRadius: 8, padding: '8px 11px', fontSize: 13, outline: 'none' }} />
            <button onClick={() => applyScratch(-1)} style={{ border: '1px solid #f0d3cb', background: '#fff', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#b4513a' }}>− ลด</button>
            <button onClick={() => applyScratch(1)} style={{ border: '1px solid #cbe0d2', background: '#fff', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#3f6b4f' }}>+ เพิ่ม</button>
          </div>
          <div style={{ fontSize: 10.5, color: '#a8a59d', marginTop: 5 }}>พิมพ์จำนวนแล้วกด − ลด / + เพิ่ม (ไม่เกินฐาน {scratchBase})</div>
        </div>
      )}

      {showEhen && (canEdit || hasEhen) && (
        <div style={{ marginTop: 16 }}>
          {masterEdit && (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>มีส่วนที่เป็น Ehen Organ / Ehen Core</div>
              <div style={{ fontSize: 10.5, color: '#a8a59d', marginBottom: 8 }}>เลือกได้ถึงสองอย่าง</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: hasEhen ? 14 : 0 }}>
                {([
                  ['ehenOrgan', 'Ehen Organ', ehenOrgan],
                  ['ehenCore', 'Ehen Core', ehenCore],
                ] as const).map(([key, label, on]) => (
                  <div key={key} onClick={() => patchFields.mutate({ [key]: on ? '' : '1' })} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 500 }}>
                    <span style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${on ? '#5b3fa0' : '#cbc8c0'}`, background: on ? '#5b3fa0' : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 800 }}>{on ? '✓' : ''}</span>
                    {label}
                  </div>
                ))}
              </div>
            </>
          )}

          {hasEhen && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 8px' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                  Mana Slot <span style={{ color: '#5b3fa0' }}>{ehenParen}</span>
                </span>
                <span style={{ fontSize: 11, color: '#8d8a82' }}>ใช้ไป {Math.min(manaUsed, slotCount)} / {slotCount}</span>
              </div>

              {masterEdit && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#8d8a82' }}>
                    จำนวน Slot:
                    <input type="number" min={0} defaultValue={slotCount} onBlur={(e) => patchFields.mutate({ manaSlot: String(Math.max(0, parseInt(e.target.value, 10) || 0)) })} style={{ width: 56, border: '1px solid #e0ded7', borderRadius: 7, padding: '4px 8px', fontSize: 13, textAlign: 'center', outline: 'none' }} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#8d8a82' }}>
                    จำนวนบท:
                    <input type="number" min={0} defaultValue={engraveMaxSet > 0 ? engraveMaxSet : ''} placeholder={`สูตร ${Math.ceil(slotCount / 2)}`} onBlur={(e) => patchFields.mutate({ engraveMax: e.target.value.trim() })} style={{ width: 72, border: '1px solid #e0ded7', borderRadius: 7, padding: '4px 8px', fontSize: 13, textAlign: 'center', outline: 'none' }} />
                  </label>
                </div>
              )}

              {slotCount > 0 ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    {Array.from({ length: slotCount }).map((_, i) => {
                      const used = i < Math.min(manaUsed, slotCount);
                      return (
                        <div
                          key={i}
                          onClick={() => setManaUsed((u) => (i + 1 === u ? i : i + 1))}
                          title="กดเพื่อใช้ / คืน Mana Slot"
                          style={{ width: 26, height: 26, borderRadius: 6, cursor: 'pointer', border: '2px solid #d6c7f0', background: used ? '#7c5fc0' : '#fff' }}
                        />
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#a8a59d', marginBottom: 8 }}>กดช่องเพื่อใช้/คืน Mana เอง (แยกจากการสลักเวทมนตร์)</div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: '#a8a59d', marginBottom: 8 }}>ยังไม่ได้กำหนดจำนวน Slot — แก้ไขจำนวนได้ด้านบน</div>
              )}

              {engraved.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {engraved.map((e) => (
                    <span key={e.id} style={{ fontSize: 11.5, background: '#f3eefb', border: '1px solid #d6c7f0', color: '#5b3fa0', borderRadius: 7, padding: '3px 6px 3px 10px', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <button onClick={() => setPopup(e.id)} title="ดูรายละเอียด" style={{ border: 'none', background: 'none', color: '#5b3fa0', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, padding: 0 }}>✦ {e.name}</button>
                      {onLogUse && (
                        <button onClick={() => onLogUse('magic', `✨ ร่ายเวทสลัก: ${e.name} — ${item.name}`, { itemId: e.id, isFeature: false })} title="ใช้ (ส่งเข้า Log แคมเปญ)" style={{ border: '1px solid #cbb8ec', background: '#fff', color: '#5b3fa0', cursor: 'pointer', fontSize: 10.5, fontWeight: 700, borderRadius: 5, padding: '1px 7px', lineHeight: 1.5 }}>ใช้</button>
                      )}
                      {canEditRefs && (
                        <button onClick={() => removeEngraved(e.id)} style={{ border: 'none', background: 'none', color: '#9b86c8', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {canEditRefs && (
                <button onClick={() => { setPickQ(''); setDrawer('engrave'); }} disabled={engraveMax === 0} style={{ width: '100%', padding: 9, background: engraveMax === 0 ? '#cbc8c0' : '#15140f', color: '#fff', border: 'none', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: engraveMax === 0 ? 'not-allowed' : 'pointer' }}>✦ สลักเวทมนตร์ (Magic Engraving)</button>
              )}

              {ehenCore && (
                <div style={{ marginTop: 8 }}>
                  {masterEdit ? (
                    <input defaultValue={fv(item, 'coreRecover')} onBlur={(e) => patchFields.mutate({ coreRecover: e.target.value })} placeholder="เช่น ฟื้นฟู 1 Slot ใน 2 นาที" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 7, padding: '6px 10px', fontSize: 11.5, color: '#5b3fa0', outline: 'none' }} />
                  ) : (
                    fv(item, 'coreRecover') && <div style={{ fontSize: 11.5, color: '#5b3fa0' }}>({fv(item, 'coreRecover')})</div>
                  )}
                  <div style={{ fontSize: 10.5, color: '#a8a59d', marginTop: 3 }}>Ehen Core ฟื้นฟู Slot อัตโนมัติ (แก้ไขข้อความในวงเล็บได้)</div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {category === 'equipment' && isWeapon && (canEditRefs || weaponArts.length > 0) && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>กระบวนท่าประจำอาวุธ (Weapon Arts)</span>
            <span style={{ fontSize: 11, color: '#8d8a82' }}>{weaponArts.length} / {weaponArtsMax}</span>
          </div>
          {weaponArts.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {weaponArts.map((w) => (
                <span key={w.id} style={{ fontSize: 11.5, background: '#fbf1e8', border: '1px solid #ecd6bf', color: '#b4602a', borderRadius: 7, padding: '3px 6px 3px 10px', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <button onClick={() => setPopup(w.id)} title="ดูรายละเอียด" style={{ border: 'none', background: 'none', color: '#b4602a', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, padding: 0 }}>⚔ {w.name}</button>
                  {onLogUse && (
                    <button onClick={() => onLogUse('feature', `⚔️ ใช้กระบวนท่า: ${w.name} — ${item.name}`, { itemId: w.id, isFeature: true })} title="ใช้ (ส่งเข้า Log แคมเปญ)" style={{ border: '1px solid #e3c39c', background: '#fff', color: '#b4602a', cursor: 'pointer', fontSize: 10.5, fontWeight: 700, borderRadius: 5, padding: '1px 7px', lineHeight: 1.5 }}>ใช้</button>
                  )}
                  {canEditRefs && (
                    <button onClick={() => removeArt(w.id)} style={{ border: 'none', background: 'none', color: '#c79a6a', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button>
                  )}
                </span>
              ))}
            </div>
          )}
          {canEditRefs &&
            (weaponArtsMax === 0 ? (
              <div style={{ fontSize: 11, color: '#a8a59d' }}>ตั้ง Professional Level (Journeyman ขึ้นไป) เพื่อเพิ่มกระบวนท่า</div>
            ) : (
              <button onClick={() => { setPickQ(''); setDrawer('weaponArts'); }} disabled={weaponArts.length >= weaponArtsMax} style={{ width: '100%', padding: 9, background: weaponArts.length >= weaponArtsMax ? '#cbc8c0' : '#b4602a', color: '#fff', border: 'none', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: weaponArts.length >= weaponArtsMax ? 'not-allowed' : 'pointer' }}>⚔ เพิ่มกระบวนท่าประจำอาวุธ</button>
            ))}
        </div>
      )}

      {item.isHomebrew && (
        <>
          <div style={{ marginTop: 14, fontSize: 11.5, color: '#8d8a82' }}>
            เพิ่มโดย <span style={{ color: '#e07a5f', fontWeight: 600 }}>{item.ownerName ?? 'ผู้เล่น'}</span> · Homebrew Content
          </div>
          {onSubmitOfficial && user && item.ownerUserId === user.id && !item.approvedFromHomebrew && (
            <button onClick={() => onSubmitOfficial(item)} style={{ marginTop: 9, width: '100%', padding: 9, background: '#15140f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              ⬆ ส่งเรื่องถึงผู้พัฒนา เพื่อลงสู่ Official
            </button>
          )}
        </>
      )}

      <div style={{ fontSize: 12.5, fontWeight: 600, margin: '16px 0 9px' }}>Tags</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {item.tags.map((t) => (
          <span key={t} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: cfg.tagBg ?? '#edeae4', color: cfg.tagColor ?? '#5f5c54' }}>
            {t}
          </span>
        ))}
      </div>

      <div style={{ fontSize: 12.5, fontWeight: 600, margin: '16px 0 7px' }}>Description</div>
      <div
        className="rt-html"
        style={{ fontSize: 12.5, lineHeight: 1.8, color: '#46443c', margin: 0, ...(descLong && !descOpen ? { maxHeight: 315, overflow: 'hidden', maskImage: 'linear-gradient(#000 88%,transparent)' } : {}) }}
        dangerouslySetInnerHTML={{ __html: descText ? renderBadges(descText) : '<span style="color:#a8a59d">— ไม่มีคำอธิบาย —</span>' }}
      />
      {descLong && (
        <button onClick={() => setDescOpen((o) => !o)} style={{ marginTop: 8, background: 'none', border: 'none', color: '#5b3fa0', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
          {descOpen ? 'ย่อกลับ ▲' : 'อ่านเพิ่มเติม ▼'}
        </button>
      )}

      {isMagicFeature && fv(item, 'mode') === 'Active' && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>จำนวนการใช้งาน</div>
          {masterEdit ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f5f1fb', border: '1px solid #e3d9f2', borderRadius: 11, padding: '12px 14px' }}>
              <input type="number" min={0} defaultValue={fv(item, 'uses')} onBlur={(e) => patchFields.mutate({ uses: e.target.value.trim() })} placeholder="0" style={{ width: 60, border: '1px solid #d6c7f0', borderRadius: 8, padding: '7px 8px', fontSize: 18, fontWeight: 800, textAlign: 'center', color: '#5b3fa0', outline: 'none' }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#5b3fa0', flex: 'none' }}>ครั้ง /</span>
              <select defaultValue={fv(item, 'usesPer') || 'วัน'} onChange={(e) => patchFields.mutate({ usesPer: e.target.value })} style={{ flex: 1, border: '1px solid #d6c7f0', borderRadius: 8, padding: '9px 10px', fontSize: 14, fontWeight: 600, color: '#5b3fa0', background: '#fff', outline: 'none' }}>
                {['วัน', 'ฉาก', 'เทิร์น', 'รอบ', 'การต่อสู้', 'ชั่วโมง', 'ถาวร'].map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, background: '#f5f1fb', border: '1px solid #e3d9f2', borderRadius: 11, padding: '12px 18px' }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: '#5b3fa0', lineHeight: 1 }}>{fv(item, 'uses') || '—'}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#5b3fa0' }}>ครั้ง / {fv(item, 'usesPer') || 'วัน'}</span>
            </div>
          )}
        </div>
      )}

      {isWeapon && (
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#15140f', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 13px', fontSize: 14, fontWeight: 700 }}>
            +{dmgShown}
          </span>
          <span style={{ fontSize: 12.5, color: '#8d8a82' }}>(ดาเมจ)</span>
          {dmgPenalty > 0 && <span style={{ fontSize: 11, color: '#c0432a' }}>ลดจากฐาน +{dmgBase} เพราะ Durability ชำรุด</span>}
        </div>
      )}

      {showDurability && (
        <>
          <div style={{ fontSize: 12.5, fontWeight: 600, margin: '16px 0 8px' }}>Durability (DUR)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {dur.map((on, i) => (
              <div
                key={i}
                onClick={() => setDur((d) => d.map((x, j) => (j === i ? !x : x)))}
                style={{ width: 26, height: 26, borderRadius: 6, cursor: 'pointer', border: `2px solid ${i === 0 ? '#e0a99a' : '#cbc8c0'}`, background: on ? (i === 0 ? '#c0432a' : '#15140f') : '#fff' }}
              />
            ))}
            <span style={{ fontSize: 11, color: '#a8a59d', marginLeft: 6 }}>ติ๊กเพื่อนับความทนทาน</span>
          </div>
          <div style={{ fontSize: 11, color: '#c0432a', marginTop: 6 }}>ช่องซ้ายสุดสีแดง = ชำรุด</div>
        </>
      )}

      {relatedWiwon && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 3, background: '#f6f2ea', border: '1px solid #e8e0d0', borderRadius: 10, padding: '10px 14px' }}>
          <span style={{ fontSize: 9.5, letterSpacing: '.08em', color: '#a8916a', fontWeight: 700 }}>WIWON ที่เกี่ยวข้อง</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#5c4a2e', lineHeight: 1.3 }}>{relatedWiwon.name}</span>
        </div>
      )}

      {!user && (
        <button onClick={() => navigate('/login')} style={{ marginTop: 14, width: '100%', padding: 9, background: '#faf9f7', border: '1px solid #e0ded7', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          เข้าสู่ระบบเพื่อจัดการข้อมูล
        </button>
      )}

      {drawer === 'engrave' && (
        <SidePanel title="✦ สลักเวทมนตร์ — เลือกเวท" onClose={() => setDrawer(null)}>
          <input value={pickQ} onChange={(e) => setPickQ(e.target.value)} placeholder="ค้นหาเวท (ชื่อ / สำนัก / คีย์เวิร์ด)…" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 8, padding: '8px 11px', fontSize: 13, outline: 'none', marginBottom: 8 }} />
          <div style={{ fontSize: 11, color: '#8d8a82', marginBottom: 8 }}>สลักได้ {engraved.length} / {engraveMax} บท</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '58vh', overflowY: 'auto' }}>
            {spellPick.isLoading && <div style={{ fontSize: 12, color: '#a8a59d' }}>กำลังโหลด…</div>}
            {(spellPick.data?.items ?? []).map((sp) => {
              const on = engraved.some((e) => e.id === sp.id);
              const full = engraved.length >= engraveMax && !on;
              return (
                <div key={sp.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px', border: '1px solid #ece9e3', borderRadius: 9, opacity: full ? 0.5 : 1 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{sp.name}</div>
                    <div style={{ fontSize: 11, color: '#8d8a82' }}>{[String(sp.fields.school ?? ''), String(sp.fields.tag ?? '')].filter(Boolean).join(' · ')}</div>
                  </div>
                  <button onClick={() => setPopup(sp.id)} title="ดูข้อมูล" style={{ flex: 'none', border: '1px solid #e0ded7', background: '#fff', color: '#6b6860', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>ⓘ</button>
                  {on ? (
                    <button onClick={() => removeEngraved(sp.id)} style={{ padding: '5px 12px', background: '#f3eefb', color: '#5b3fa0', border: '1px solid #d6c7f0', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', flex: 'none' }}>เอาออก</button>
                  ) : (
                    <button disabled={full} onClick={() => addEngraved(sp)} style={{ padding: '5px 12px', background: full ? '#eee' : '#5b3fa0', color: full ? '#aaa' : '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: full ? 'not-allowed' : 'pointer', flex: 'none' }}>สลัก</button>
                  )}
                </div>
              );
            })}
            {spellPick.data && spellPick.data.items.length === 0 && <div style={{ fontSize: 12, color: '#a8a59d' }}>ไม่พบเวทที่ค้นหา</div>}
          </div>
        </SidePanel>
      )}

      {drawer === 'weaponArts' && (
        <SidePanel title="⚔ กระบวนท่าประจำอาวุธ — เลือก Feature" onClose={() => setDrawer(null)}>
          <input value={pickQ} onChange={(e) => setPickQ(e.target.value)} placeholder="ค้นหากระบวนท่า…" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 8, padding: '8px 11px', fontSize: 13, outline: 'none', marginBottom: 8 }} />
          <div style={{ fontSize: 11, color: '#8d8a82', marginBottom: 8 }}>แสดงเฉพาะ Feature ที่มีแท็ก “Weapon Arts” · เพิ่มได้ {weaponArts.length} / {weaponArtsMax}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '58vh', overflowY: 'auto' }}>
            {artPick.isLoading && <div style={{ fontSize: 12, color: '#a8a59d' }}>กำลังโหลด…</div>}
            {(artPick.data?.items ?? []).map((ft) => {
              const on = weaponArts.some((w) => w.id === ft.id);
              const full = !on && weaponArts.length >= weaponArtsMax;
              return (
                <div key={ft.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px', border: '1px solid #ece9e3', borderRadius: 9, opacity: full ? 0.5 : 1 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{ft.name}</div>
                    <div style={{ fontSize: 11, color: '#8d8a82' }}>{[String(ft.fields.class ?? ''), String(ft.fields.mode ?? '')].filter(Boolean).join(' · ')}</div>
                  </div>
                  <button onClick={() => setPopup(ft.id)} title="ดูข้อมูล" style={{ flex: 'none', border: '1px solid #e0ded7', background: '#fff', color: '#6b6860', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>ⓘ</button>
                  {on ? (
                    <button onClick={() => removeArt(ft.id)} style={{ padding: '5px 12px', background: '#fbf1e8', color: '#b4602a', border: '1px solid #ecd6bf', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', flex: 'none' }}>เอาออก</button>
                  ) : (
                    <button disabled={full} onClick={() => addArt(ft)} style={{ padding: '5px 12px', background: full ? '#eee' : '#b4602a', color: full ? '#aaa' : '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: full ? 'not-allowed' : 'pointer', flex: 'none' }}>เพิ่ม</button>
                  )}
                </div>
              );
            })}
            {artPick.data && artPick.data.items.length === 0 && <div style={{ fontSize: 12, color: '#a8a59d' }}>ยังไม่มี Feature ที่แท็ก “Weapon Arts”</div>}
          </div>
        </SidePanel>
      )}

      {popup && (
        <Modal open onClose={() => setPopup(null)} width={420} title="รายละเอียด">
          {popupDetail.isLoading && <div style={{ fontSize: 12, color: '#a8a59d' }}>กำลังโหลด…</div>}
          {popupDetail.data?.item && (
            <div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{popupDetail.data.item.name}</div>
              {(() => {
                const it = popupDetail.data.item;
                const meta = [String(it.fields.school ?? it.fields.class ?? ''), String(it.fields.tag ?? '')].filter(Boolean).join(' · ');
                return meta ? <div style={{ fontSize: 12, color: '#8d8a82', marginTop: 2 }}>{meta}</div> : null;
              })()}
              {popupDetail.data.item.fields.uses ? (
                <div style={{ fontSize: 12.5, marginTop: 8 }}>จำนวนการใช้งาน: <b>{String(popupDetail.data.item.fields.uses)} ครั้ง / {String(popupDetail.data.item.fields.usesPer ?? 'วัน')}</b></div>
              ) : null}
              <div className="rt-html" style={{ fontSize: 12.5, lineHeight: 1.8, color: '#46443c', marginTop: 10 }} dangerouslySetInnerHTML={{ __html: popupDetail.data.item.description ? renderBadges(popupDetail.data.item.description) : '<span style="color:#a8a59d">— ไม่มีคำอธิบาย —</span>' }} />
              {onLogUse && (() => {
                const it = popupDetail.data.item;
                const feat = it.tags.includes('Weapon Arts');
                return (
                  <button
                    onClick={() => { onLogUse(feat ? 'feature' : 'magic', `${feat ? '⚔️ ใช้กระบวนท่า' : '✨ ร่ายเวทสลัก'}: ${it.name} — ${item.name}`, { itemId: it.id, isFeature: feat }); setPopup(null); }}
                    style={{ marginTop: 14, width: '100%', padding: 11, background: '#15140f', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                  >▶ ใช้ (ส่งเข้า Log แคมเปญ)</button>
                );
              })()}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// Right-docked floating panel (used for the engrave / weapon-arts pickers) so
// they open beside the item window instead of as a centered modal over it.
function SidePanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const width = 370;
  const [pos, setPos] = useState(() => ({
    x: Math.max(16, (typeof window !== 'undefined' ? window.innerWidth : 1200) - width - 24),
    y: 96,
  }));
  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return; // controls stay clickable
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, ox = pos.x, oy = pos.y;
    const move = (ev: PointerEvent) => setPos({ x: ox + ev.clientX - sx, y: oy + ev.clientY - sy });
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  return createPortal(
    <div
      style={{ position: 'fixed', left: pos.x, top: pos.y, width, maxWidth: '92vw', maxHeight: '80vh', zIndex: 6000, background: '#fff', border: '1px solid #d8d5cd', borderRadius: 14, boxShadow: '0 18px 50px rgba(0,0,0,.28)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <div data-drag-handle onPointerDown={startDrag} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 14px', borderBottom: '1px solid #efece6', background: '#faf9f7', cursor: 'grab', userSelect: 'none', touchAction: 'none' }}>
        <span style={{ fontSize: 13, color: '#c9c5bd' }}>⠿</span>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 14.5, fontFamily: 'var(--font-serif)', color: '#2f2c25' }}>{title}</span>
        <button onClick={onClose} title="ปิด" style={{ flex: 'none', border: 'none', background: 'none', color: '#a8a59d', cursor: 'pointer', fontSize: 17, lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ padding: '14px 16px', overflowY: 'auto' }}>{children}</div>
    </div>,
    document.body,
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, borderBottom: '1px solid #f0eee9', paddingBottom: 5 }}>
      <span style={{ color: '#8d8a82' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

