import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { CatalogCategory, CatalogConfig, CatalogItem } from '@wiwonanant/shared';
import { computeMagicTN } from '@wiwonanant/shared';
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
}

const EXCLUDE_STAT = new Set(['source', 'rarity', 'school']);
const MAGIC_EXCLUDE = new Set(['ql', 'knowledge', 'curiosity', 'cost']);

export function CatalogDetail({ item, cfg, category, isFeature, onEdit, onSubmitOfficial }: Props) {
  const { user, isDev } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const source = isFeature && cfg.feature ? cfg.feature : cfg;
  const isMagicSpell = category === 'magic' && !isFeature;
  const isMagicFeature = category === 'magic' && isFeature;

  const canEdit = isDev || (!!user && item.isHomebrew && item.ownerUserId === user.id);
  const [descOpen, setDescOpen] = useState(false);
  const [dur, setDur] = useState<boolean[]>([false, false, false]); // session durability ticks

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
      if ((isMagicSpell || isMagicFeature) && MAGIC_EXCLUDE.has(f.key)) return false;
      if (seen.has(f.key)) return false;
      seen.add(f.key);
      return true;
    })
    .map((f) => ({ label: f.label, value: f.key === 'components' ? abbrevComponents(fv(item, f.key)) : fv(item, f.key) }))
    .filter((s) => s.value !== '' && s.label !== 'Cost' && s.label !== 'Rarity' && s.label !== 'School');

  const keyStats = isMagicSpell
    ? [
        { label: 'Magic Slot', value: (fv(item, 'cost') || '—').replace(/A particle of Ehen/gi, 'P.E'), bg: '#fdece2', color: '#c1502a' },
        { label: 'Quality of Life', value: fv(item, 'ql') || '—', bg: '#ede7f6', color: '#5b3fa0' },
        { label: 'Knowledge', value: fv(item, 'knowledge') || '—', bg: '#e5edfb', color: '#2a6fdb' },
      ]
    : isMagicFeature
    ? [
        { label: 'Willpower', value: fv(item, 'cost') || '—', bg: '#fbeae6', color: '#c0432a' },
        { label: 'Quality of Life', value: fv(item, 'ql') || '—', bg: '#ede7f6', color: '#5b3fa0' },
        { label: 'Curiosity Point', value: fv(item, 'curiosity') || '—', bg: '#e5edfb', color: '#2a6fdb' },
      ]
    : [];

  // Spell casting TN — derived from Casting Level (base) + Knowledge Points (mod).
  const magicTN = isMagicSpell ? computeMagicTN(fv(item, 'castLevel'), fv(item, 'knowledge')) : null;

  const cost = fv(item, 'cost');
  const isWeapon = category === 'equipment' && /weapon|อาวุธ/i.test(fv(item, 'equipType') + ' ' + fv(item, 'tag'));
  const showDurability = category === 'equipment' && /weapon|armor|shield|อาวุธ|เกราะ|โล่/i.test(fv(item, 'equipType') + ' ' + fv(item, 'tag'));
  const dmgBase = Number(item.fields.dmgBonus ?? 0);
  const dmgPenalty = dur.filter(Boolean).length * 2;
  const dmgShown = Math.max(0, dmgBase - dmgPenalty);

  const descText = item.description;
  const descLong = descText.replace(/<[^>]+>/g, '').length > 160;

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
  const engraved: EngravedRef[] = Array.isArray(item.fields.engravedSpells) ? (item.fields.engravedSpells as EngravedRef[]) : [];
  const weaponArts: WeaponArtRef[] = Array.isArray(item.fields.weaponArts) ? (item.fields.weaponArts as WeaponArtRef[]) : [];
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

  const addEngraved = (it: CatalogItem) => {
    if (engraved.some((e) => e.id === it.id) || engraved.length >= engraveMax) return;
    patchFields.mutate({ engravedSpells: [...engraved, { id: it.id, name: it.name }] });
  };
  const removeEngraved = (id: string) => patchFields.mutate({ engravedSpells: engraved.filter((e) => e.id !== id) });
  const addArt = (it: CatalogItem) => {
    if (weaponArts.some((w) => w.id === it.id) || weaponArts.length >= weaponArtsMax) return;
    patchFields.mutate({ weaponArts: [...weaponArts, { id: it.id, name: it.name }] });
  };
  const removeArt = (id: string) => patchFields.mutate({ weaponArts: weaponArts.filter((w) => w.id !== id) });

  return (
    <div style={{ background: '#fff', border: '1px solid #e4e2dc', borderRadius: 14, padding: 20, position: 'sticky', top: 96 }}>
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
              <span title={`Target Number\nพื้นฐาน ${magicTN.base} (${fv(item, 'castLevel') || '—'}) + ${magicTN.mod} (Knowledge Points) = ${magicTN.tn}`} style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em', borderRadius: 5, padding: '2px 8px', background: '#15140f', color: '#f7dca0', cursor: 'help' }}>TN {magicTN.tn}</span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: '#8d8a82', marginTop: 3 }}>
            {fv(item, cfg.subtitleKey) || item.source}
          </div>
        </div>
        <StarButton catalogItemId={item.id} size={15} />
      </div>

      {canEdit && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={() => onEdit(item)} style={{ flex: 1, padding: 7, background: '#15140f', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            ✎ แก้ไขข้อมูล
          </button>
          <button onClick={() => del.mutate()} style={{ flex: 1, padding: 7, background: '#fff', color: '#b4513a', border: '1px solid #f0d3cb', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            ลบข้อมูล
          </button>
        </div>
      )}

      {keyStats.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 16 }}>
          {keyStats.map((k) => (
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

      {category === 'equipment' && (canEdit || hasCoins) && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>ราคา (เหรียญ)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {COIN_TIERS.map((t) => (
              <div key={t.key} style={{ border: '1px solid #ece9e3', borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 5 }}>
                  <span style={{ width: 13, height: 13, borderRadius: '50%', background: t.color, display: 'inline-block' }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#8d8a82' }}>{t.abbr}</span>
                </div>
                {canEdit ? (
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
          {canEdit && (
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
                <span style={{ fontSize: 11, color: '#8d8a82' }}>สลักไว้ {engraved.length} / {engraveMax} บท</span>
              </div>

              {canEdit && (
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  {Array.from({ length: slotCount }).map((_, i) => (
                    <div key={i} style={{ width: 26, height: 26, borderRadius: 6, border: '2px solid #d6c7f0', background: i < engraved.length ? '#7c5fc0' : '#fff' }} />
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#a8a59d', marginBottom: 8 }}>ยังไม่ได้กำหนดจำนวน Slot — แก้ไขจำนวนได้ด้านบน</div>
              )}

              {engraved.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {engraved.map((e) => (
                    <span key={e.id} style={{ fontSize: 11.5, background: '#f3eefb', border: '1px solid #d6c7f0', color: '#5b3fa0', borderRadius: 7, padding: '3px 6px 3px 10px', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <button onClick={() => setPopup(e.id)} title="ดูรายละเอียด" style={{ border: 'none', background: 'none', color: '#5b3fa0', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, padding: 0 }}>✦ {e.name}</button>
                      {canEdit && (
                        <button onClick={() => removeEngraved(e.id)} style={{ border: 'none', background: 'none', color: '#9b86c8', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {canEdit && (
                <button onClick={() => { setPickQ(''); setDrawer('engrave'); }} disabled={engraveMax === 0} style={{ width: '100%', padding: 9, background: engraveMax === 0 ? '#cbc8c0' : '#15140f', color: '#fff', border: 'none', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: engraveMax === 0 ? 'not-allowed' : 'pointer' }}>✦ สลักเวทมนตร์ (Magic Engraving)</button>
              )}

              {ehenCore && (
                <div style={{ marginTop: 8 }}>
                  {canEdit ? (
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

      {category === 'equipment' && isWeapon && (canEdit || weaponArts.length > 0) && (
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
                  {canEdit && (
                    <button onClick={() => removeArt(w.id)} style={{ border: 'none', background: 'none', color: '#c79a6a', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button>
                  )}
                </span>
              ))}
            </div>
          )}
          {canEdit &&
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
        style={{ fontSize: 12.5, lineHeight: 1.8, color: '#46443c', margin: 0, ...(descLong && !descOpen ? { maxHeight: 92, overflow: 'hidden', maskImage: 'linear-gradient(#000 60%,transparent)' } : {}) }}
        dangerouslySetInnerHTML={{ __html: descText ? renderBadges(descText) : '<span style="color:#a8a59d">— ไม่มีคำอธิบาย —</span>' }}
      />
      {descLong && (
        <button onClick={() => setDescOpen((o) => !o)} style={{ marginTop: 8, background: 'none', border: 'none', color: '#5b3fa0', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
          {descOpen ? 'ย่อกลับ ▲' : 'อ่านเพิ่มเติม ▼'}
        </button>
      )}

      {isMagicFeature && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>จำนวนการใช้งาน</div>
          {canEdit ? (
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

      {!user && (
        <button onClick={() => navigate('/login')} style={{ marginTop: 14, width: '100%', padding: 9, background: '#faf9f7', border: '1px solid #e0ded7', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          เข้าสู่ระบบเพื่อจัดการข้อมูล
        </button>
      )}

      {drawer === 'engrave' && (
        <Modal open onClose={() => setDrawer(null)} width={440} title="✦ สลักเวทมนตร์ — เลือกเวท">
          <input value={pickQ} onChange={(e) => setPickQ(e.target.value)} placeholder="ค้นหาเวท (ชื่อ / สำนัก / คีย์เวิร์ด)…" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 8, padding: '8px 11px', fontSize: 13, outline: 'none', marginBottom: 8 }} />
          <div style={{ fontSize: 11, color: '#8d8a82', marginBottom: 8 }}>สลักได้ {engraved.length} / {engraveMax} บท</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto' }}>
            {spellPick.isLoading && <div style={{ fontSize: 12, color: '#a8a59d' }}>กำลังโหลด…</div>}
            {(spellPick.data?.items ?? []).map((sp) => {
              const on = engraved.some((e) => e.id === sp.id);
              const full = engraved.length >= engraveMax && !on;
              return (
                <div key={sp.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', border: '1px solid #ece9e3', borderRadius: 9, opacity: full ? 0.5 : 1 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{sp.name}</div>
                    <div style={{ fontSize: 11, color: '#8d8a82' }}>{[String(sp.fields.school ?? ''), String(sp.fields.tag ?? '')].filter(Boolean).join(' · ')}</div>
                  </div>
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
        </Modal>
      )}

      {drawer === 'weaponArts' && (
        <Modal open onClose={() => setDrawer(null)} width={440} title="⚔ กระบวนท่าประจำอาวุธ — เลือก Feature">
          <input value={pickQ} onChange={(e) => setPickQ(e.target.value)} placeholder="ค้นหากระบวนท่า…" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 8, padding: '8px 11px', fontSize: 13, outline: 'none', marginBottom: 8 }} />
          <div style={{ fontSize: 11, color: '#8d8a82', marginBottom: 8 }}>แสดงเฉพาะ Feature ที่มีแท็ก “Weapon Arts” · เพิ่มได้ {weaponArts.length} / {weaponArtsMax}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto' }}>
            {artPick.isLoading && <div style={{ fontSize: 12, color: '#a8a59d' }}>กำลังโหลด…</div>}
            {(artPick.data?.items ?? []).map((ft) => {
              const on = weaponArts.some((w) => w.id === ft.id);
              const full = !on && weaponArts.length >= weaponArtsMax;
              return (
                <div key={ft.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', border: '1px solid #ece9e3', borderRadius: 9, opacity: full ? 0.5 : 1 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{ft.name}</div>
                    <div style={{ fontSize: 11, color: '#8d8a82' }}>{[String(ft.fields.class ?? ''), String(ft.fields.mode ?? '')].filter(Boolean).join(' · ')}</div>
                  </div>
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
        </Modal>
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
            </div>
          )}
        </Modal>
      )}
    </div>
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

