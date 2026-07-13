import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CatalogItem } from '@wiwonanant/shared';
import { CATALOG_CONFIGS } from '@wiwonanant/shared';
import { api } from '../lib/api';
import type { CatalogListResult } from '../lib/catalogHooks';
import { Modal } from '../components/Modal';
import { CatalogDetail } from '../components/CatalogDetail';

// Shop quality ladder (low → high). Quest is handled as a separate mode.
const AVAIL_TIERS = ['Kiosk', 'Boutique', 'Expert shop', 'Mart', 'Trade center', 'Vault'] as const;
type Tier = (typeof AVAIL_TIERS)[number];
const TIER_TH: Record<string, string> = {
  Kiosk: 'ร้านเล็ก ๆ',
  Boutique: 'ร้านเฉพาะกลุ่ม',
  'Expert shop': 'ร้านผู้เชี่ยวชาญ',
  Mart: 'ตลาดทั่วไป',
  'Trade center': 'ศูนย์การค้า',
  Vault: 'ห้องลับ',
  Quest: 'ของจาก Quest',
};

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Legendary'] as const;
type Rarity = (typeof RARITIES)[number];
// Per-slot rarity odds by shop tier: [Common, Uncommon, Rare, Legendary].
const RARITY_ODDS: Record<Tier, number[]> = {
  Kiosk: [88, 12, 0, 0],
  Boutique: [72, 24, 4, 0],
  'Expert shop': [58, 30, 10, 2],
  Mart: [68, 26, 5, 1],
  'Trade center': [44, 36, 16, 4],
  Vault: [14, 31, 40, 15],
};
// How many rarity rolls a shop makes (bigger / rarer shops draw more stock).
const SHOP_ROLLS: Record<Tier, number> = { Kiosk: 8, Boutique: 8, 'Expert shop': 9, Mart: 13, 'Trade center': 13, Vault: 11 };

const RARITY_COLOR: Record<string, [string, string]> = {
  Poor: ['#eeeeee', '#7a7a72'],
  Common: ['#eef2ee', '#5f7a5f'],
  Uncommon: ['#e6f4ea', '#2f7d4f'],
  Rare: ['#e5edfb', '#2a5fbd'],
  Legendary: ['#f3ecfb', '#7a3fb0'],
};

const EQUIP_TAGS: string[] =
  (CATALOG_CONFIGS.equipment.filterFields.find((f) => f.key === 'tag')?.options as string[] | undefined) ?? [];

function rankOf(av: string): number {
  if (av === 'Quest') return 99; // quest-only, never in normal shops
  const r = AVAIL_TIERS.indexOf(av as Tier);
  return r === -1 ? 0 : r; // unset / legacy availability → treated as Kiosk level
}
function rollRarity(tier: Tier): Rarity {
  const odds = RARITY_ODDS[tier];
  let r = Math.random() * 100;
  for (let i = 0; i < RARITIES.length; i++) {
    if (r < odds[i]) return RARITIES[i];
    r -= odds[i];
  }
  return 'Common';
}
function sampleN<T>(arr: T[], n: number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(0, n));
}

// Format a total Iron-Coin value back into coin denominations for display.
const COIN_ABBR: [string, number][] = [['PC', 10000], ['GC', 1000], ['SC', 100], ['CC', 10], ['IC', 1]];
function coinStr(ic: number): string {
  const v = Math.max(0, Math.round(ic));
  if (v === 0) return '0';
  const parts: string[] = [];
  let r = v;
  for (const [ab, unit] of COIN_ABBR) { const n = Math.floor(r / unit); r -= n * unit; if (n > 0) parts.push(`${n} ${ab}`); }
  return parts.join(' · ');
}
const COST_PRICE_RATE = 0.65; // "ราคาต้นทุน" = 35% below the base price
const PRICE_STEPS = [-50, -30, -20, -10, -5, 5, 10, 20, 30, 50];
// Spell books have no coin cost of their own — price them by rarity (in IC).
// Knowledge is precious, so books run premium: even a Poor one outprices gear.
const BOOK_PRICE: Record<string, number> = { Poor: 2000, Common: 5000, Uncommon: 15000, Rare: 45000, Legendary: 150000 };
const isBook = (it: CatalogItem) => it.category === 'magic';
const baseCostOf = (it: CatalogItem) =>
  isBook(it) ? (BOOK_PRICE[String(it.fields.rarity ?? '')] ?? 500) : Math.max(0, Math.round(Number(it.fields.costNum ?? 0)) || 0);

// Compact list of the meaningful fields to show inline per row.
function metaOf(it: CatalogItem): string[] {
  const f = it.fields;
  const out: string[] = [];
  if (isBook(it)) {
    out.push('📖 หนังสือเวท');
    if (f.school) out.push(String(f.school));
    if (f.castLevel) out.push(`ระดับ ${f.castLevel}`);
    if (f.tag) out.push(String(f.tag));
    return out;
  }
  const tag = String(f.tag ?? it.tags[0] ?? '');
  if (tag) out.push(tag);
  if (f.equipType) out.push(String(f.equipType));
  if (f.material) out.push(String(f.material));
  if (f.damage && f.damage !== 'None') out.push(String(f.damage));
  if (f.wielding && f.wielding !== 'None') out.push(String(f.wielding));
  if (f.natDefBonus) out.push(`เกราะ +${f.natDefBonus}`);
  if (f.durability) out.push(`DUR ${f.durability}`);
  if (f.bagCapacity) out.push(`จุ ${f.bagCapacity} kg`);
  if (f.weightNum) out.push(`${f.weightNum} kg`);
  return out;
}

interface ShopResult { storefront: CatalogItem[]; back: CatalogItem[]; best: CatalogItem[] }

export function ShopPage() {
  const { data } = useQuery({
    queryKey: ['catalog', 'equipment', 'shop-all'],
    queryFn: () => api.get<CatalogListResult>('/catalog/equipment?scope=all&all=1'),
  });
  const items = useMemo(() => data?.items ?? [], [data]);

  const [showBooks, setShowBooks] = useState(false);
  const { data: magicData } = useQuery({
    queryKey: ['catalog', 'magic', 'shop-all'],
    queryFn: () => api.get<CatalogListResult>('/catalog/magic?scope=all&isFeature=false&all=1'),
    enabled: showBooks,
  });
  const books = useMemo(() => (showBooks ? magicData?.items ?? [] : []), [showBooks, magicData]);

  const [tier, setTier] = useState<Tier>('Kiosk');
  const [questMode, setQuestMode] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [shop, setShop] = useState<ShopResult | null>(null);
  const [detail, setDetail] = useState<CatalogItem | null>(null);
  const [priceMod, setPriceMod] = useState(0); // shop-wide markup/discount, %

  const toggleTag = (t: string) => setTags((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  const tagMatch = (it: CatalogItem) => {
    if (tags.length === 0) return true;
    const tg = String(it.fields.tag ?? it.tags[0] ?? '');
    return tags.includes(tg);
  };
  const rarOf = (it: CatalogItem) => String(it.fields.rarity ?? '');

  // Normal shop pool: cumulative availability (rank ≤ tier), tag-filtered, no Quest
  // items. Spell books (from Magic) join the pool when enabled — they have no
  // shop availability so they're always in stock, slotted by their rarity.
  const generate = () => {
    const pool = [
      ...items.filter((it) => tagMatch(it) && rankOf(String(it.fields.availability ?? '')) <= AVAIL_TIERS.indexOf(tier)),
      ...books,
    ];
    const counts: Record<Rarity, number> = { Common: 0, Uncommon: 0, Rare: 0, Legendary: 0 };
    for (let i = 0; i < SHOP_ROLLS[tier]; i++) counts[rollRarity(tier)]++;
    const byRar = (r: Rarity) => pool.filter((it) => rarOf(it) === r);
    setShop({
      storefront: sampleN(byRar('Common'), counts.Common),
      back: sampleN(byRar('Uncommon'), counts.Uncommon),
      best: sampleN([...byRar('Rare'), ...byRar('Legendary')], counts.Rare + counts.Legendary),
    });
  };

  // Quest mode: list every Quest item (tag-filtered) grouped by rarity — a
  // reference for the Librarian to hand out, not a random draw.
  const questShop: ShopResult | null = useMemo(() => {
    if (!questMode) return null;
    const pool = items.filter((it) => tagMatch(it) && String(it.fields.availability ?? '') === 'Quest');
    return {
      storefront: pool.filter((it) => rarOf(it) === 'Common'),
      back: pool.filter((it) => rarOf(it) === 'Uncommon'),
      best: pool.filter((it) => rarOf(it) === 'Rare' || rarOf(it) === 'Legendary'),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questMode, items, tags]);

  const shown = questMode ? questShop : shop;

  // One readable list row: name + rarity + inline field summary on the left,
  // and the three prices (ต้นทุน / กลาง / ขาย) on the right.
  const row = (it: CatalogItem) => {
    const rar = rarOf(it);
    const [bg, col] = RARITY_COLOR[rar] ?? ['#efece6', '#8d8a82'];
    const base = baseCostOf(it);
    const sell = Math.round(base * (1 + priceMod / 100));
    const costP = Math.round(base * COST_PRICE_RATE);
    return (
      <button
        key={it.id}
        onClick={() => setDetail(it)}
        style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, padding: '11px 14px', background: '#fff', border: 'none', borderBottom: '1px solid #f0eee9', cursor: 'pointer', width: '100%' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#2f2c25' }}>{it.name}</span>
            {rar && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.04em', borderRadius: 5, padding: '2px 7px', background: bg, color: col }}>{rar}</span>}
          </div>
          <div style={{ fontSize: 11, color: '#9a978e', marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {metaOf(it).map((m, i) => (
              <span key={i}>{i > 0 && <span style={{ color: '#d8d5cd', marginRight: 6 }}>·</span>}{m}</span>
            ))}
          </div>
        </div>
        <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: priceMod > 0 ? '#b4602a' : priceMod < 0 ? '#2f7d4f' : '#2f2c25' }}>{coinStr(sell)}</span>
          {priceMod !== 0 && <span style={{ fontSize: 10, color: '#bdbab2', textDecoration: 'line-through' }}>{coinStr(base)}</span>}
          <span style={{ fontSize: 10, color: '#a8a59d' }}>ต้นทุน {coinStr(costP)}</span>
        </div>
      </button>
    );
  };

  const section = (title: string, note: string, accent: string, list: CatalogItem[]) => (
    <div style={{ background: '#fff', border: '1px solid #e4e2dc', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid #efece6', borderLeft: `4px solid ${accent}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-serif)', color: '#2f2c25' }}>{title}</div>
          <div style={{ fontSize: 11.5, color: '#a8a59d', marginTop: 2 }}>{note}</div>
        </div>
        <span style={{ fontSize: 11.5, color: '#a8a59d', flex: 'none' }}>{list.length} รายการ</span>
      </div>
      {list.length === 0 ? (
        <div style={{ fontSize: 12.5, color: '#bdbab2', textAlign: 'center', padding: '18px 0' }}>— ไม่มีของในหมวดนี้ —</div>
      ) : (
        <div>{list.map(row)}</div>
      )}
    </div>
  );

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '7px 13px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${active ? '#15140f' : '#e0ded7'}`, background: active ? '#15140f' : '#fff', color: active ? '#fff' : '#5f5c54',
  });

  return (
    <section style={{ animation: 'fadeUp .4s ease', maxWidth: 1080, margin: '10px auto 40px' }}>
      {/* Hero */}
      <div style={{ background: '#15140f', borderRadius: 18, padding: '30px 34px', position: 'relative', overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ position: 'absolute', right: -40, bottom: -60, width: 260, height: 260, background: 'radial-gradient(circle,rgba(224,122,95,.35),transparent 65%)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 11, letterSpacing: '.14em', color: '#8d8a82', fontWeight: 700 }}>WIWORNANAN · GENERATOR</div>
          <h1 style={{ margin: '8px 0 0', fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 32, color: '#fff' }}>ร้านค้าในวิวรณ์</h1>
          <p style={{ color: '#b6b3aa', fontSize: 13.5, lineHeight: 1.7, margin: '10px 0 0', maxWidth: 620 }}>
            สุ่มสินค้า Equipment &amp; Item ตามระดับร้าน (Availability) และประเภทที่เลือก — หน้าร้านขายของ Common, หลังร้านเก็บ Uncommon ขึ้นไป, และของดีประจำร้านคือ Rare/Legendary
          </p>
        </div>
      </div>

      {/* Controls */}
      <div style={{ background: '#fff', border: '1px solid #e4e2dc', borderRadius: 16, padding: 18, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6b6860', marginBottom: 8 }}>ระดับร้าน (คุณภาพ / Availability)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {AVAIL_TIERS.map((t) => (
              <button key={t} onClick={() => { setTier(t); setQuestMode(false); }} style={chip(!questMode && tier === t)}>
                {t} <span style={{ opacity: 0.6, fontWeight: 400 }}>· {TIER_TH[t]}</span>
              </button>
            ))}
            <button onClick={() => setQuestMode((q) => !q)} style={{ ...chip(questMode), borderColor: questMode ? '#b4842a' : '#e0ded7', background: questMode ? '#b4842a' : '#fff' }}>
              🗺️ โหมด Quest
            </button>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6b6860', marginBottom: 8 }}>เลือกประเภทที่จะขาย (ติ๊กได้หลายอัน · ไม่ติ๊ก = ทุกประเภท)</div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {EQUIP_TAGS.map((t) => (
              <button key={t} onClick={() => toggleTag(t)} style={chip(tags.includes(t))}>{tags.includes(t) ? '✓ ' : ''}{t}</button>
            ))}
            {tags.length > 0 && <button onClick={() => setTags([])} style={{ ...chip(false), color: '#b4513a', borderColor: '#f0d3cb' }}>ล้าง</button>}
            <button onClick={() => setShowBooks((b) => !b)} title="รวมหนังสือเวท (Magic) เข้าไปในร้าน" style={{ ...chip(showBooks), borderColor: showBooks ? '#5b3fa0' : '#e0ded7', background: showBooks ? '#5b3fa0' : '#fff', color: showBooks ? '#fff' : '#5b3fa0' }}>{showBooks ? '✓ ' : ''}📖 หนังสือเวท</button>
          </div>
        </div>

        {!questMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={generate} style={{ padding: '11px 22px', background: '#e07a5f', color: '#fff', border: 'none', borderRadius: 11, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              🎲 {shop ? 'สุ่มร้านใหม่' : 'สุ่มร้าน'}
            </button>
            <span style={{ fontSize: 11.5, color: '#a8a59d' }}>
              เรต {tier}: {RARITY_ODDS[tier].map((n, i) => `${RARITIES[i][0]}${n}`).join(' / ')} · จับจาก {items.length} ไอเทม
            </span>
          </div>
        )}
        {questMode && <div style={{ fontSize: 11.5, color: '#8a6a2a', background: '#fff8ef', border: '1px solid #efe0cd', borderRadius: 9, padding: '8px 12px' }}>โหมด Quest — แสดงของ Availability = Quest ทั้งหมด (ตามประเภทที่เลือก) สำหรับ Librarian เลือกแจกตามเนื้อเรื่อง</div>}

        <div style={{ borderTop: '1px solid #f0eee9', paddingTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6b6860', marginBottom: 8 }}>
            ปรับราคาร้าน <span style={{ fontWeight: 400, color: '#a8a59d' }}>· ราคากลางคงเดิม · “ราคาต้นทุน” = ลด 35% จากราคากลาง</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {PRICE_STEPS.filter((s) => s < 0).map((s) => (
              <button key={s} onClick={() => setPriceMod((m) => (m === s ? 0 : s))} style={{ ...chip(priceMod === s), borderColor: priceMod === s ? '#2f7d4f' : '#e0ded7', background: priceMod === s ? '#2f7d4f' : '#fff', color: priceMod === s ? '#fff' : '#2f7d4f' }}>{s}%</button>
            ))}
            <button onClick={() => setPriceMod(0)} style={{ ...chip(priceMod === 0), padding: '7px 15px' }}>ราคากลาง</button>
            {PRICE_STEPS.filter((s) => s > 0).map((s) => (
              <button key={s} onClick={() => setPriceMod((m) => (m === s ? 0 : s))} style={{ ...chip(priceMod === s), borderColor: priceMod === s ? '#b4602a' : '#e0ded7', background: priceMod === s ? '#b4602a' : '#fff', color: priceMod === s ? '#fff' : '#b4602a' }}>+{s}%</button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {shown ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {section('🛒 หน้าร้าน', 'ของ Common ที่วางขายทั่วไป', '#5f7a5f', shown.storefront)}
          {section('📦 หลังร้าน', 'ของ Uncommon ขึ้นไป ที่เก็บไว้ด้านใน', '#2a5fbd', shown.back)}
          {section('✨ ของดีประจำร้าน', 'ของ Rare / Legendary ประจำร้าน', '#b4842a', shown.best)}
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px dashed #ddd9d0', borderRadius: 16, padding: '40px 20px', textAlign: 'center', color: '#a8a59d', fontSize: 13.5 }}>
          เลือกระดับร้านและประเภท แล้วกด “🎲 สุ่มร้าน” เพื่อเปิดร้าน
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name ?? ''}>
        {detail && <CatalogDetail item={detail} cfg={CATALOG_CONFIGS[detail.category]} category={detail.category} isFeature={false} onEdit={() => {}} embedded />}
      </Modal>
    </section>
  );
}
