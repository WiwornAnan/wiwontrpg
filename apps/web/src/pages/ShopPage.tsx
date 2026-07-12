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

interface ShopResult { storefront: CatalogItem[]; back: CatalogItem[]; best: CatalogItem[] }

export function ShopPage() {
  const { data } = useQuery({
    queryKey: ['catalog', 'equipment', 'shop-all'],
    queryFn: () => api.get<CatalogListResult>('/catalog/equipment?scope=all&all=1'),
  });
  const items = useMemo(() => data?.items ?? [], [data]);

  const [tier, setTier] = useState<Tier>('Kiosk');
  const [questMode, setQuestMode] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [shop, setShop] = useState<ShopResult | null>(null);
  const [detail, setDetail] = useState<CatalogItem | null>(null);

  const toggleTag = (t: string) => setTags((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  const tagMatch = (it: CatalogItem) => {
    if (tags.length === 0) return true;
    const tg = String(it.fields.tag ?? it.tags[0] ?? '');
    return tags.includes(tg);
  };
  const rarOf = (it: CatalogItem) => String(it.fields.rarity ?? '');

  // Normal shop pool: cumulative availability (rank ≤ tier), tag-filtered, no Quest items.
  const generate = () => {
    const pool = items.filter((it) => tagMatch(it) && rankOf(String(it.fields.availability ?? '')) <= AVAIL_TIERS.indexOf(tier));
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

  const card = (it: CatalogItem) => {
    const rar = rarOf(it);
    const [bg, col] = RARITY_COLOR[rar] ?? ['#efece6', '#8d8a82'];
    const cost = String(it.fields.cost ?? '');
    return (
      <button
        key={it.id}
        onClick={() => setDetail(it)}
        style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', background: '#fff', border: '1px solid #e7e4de', borderRadius: 12, cursor: 'pointer', transition: 'border-color .1s' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#2f2c25' }}>{it.name}</span>
          {rar && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', borderRadius: 5, padding: '2px 7px', background: bg, color: col }}>{rar}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: '#8d8a82', flexWrap: 'wrap' }}>
          <span>{String(it.fields.tag ?? it.tags[0] ?? '—')}</span>
          <span style={{ color: '#d8d5cd' }}>·</span>
          <span>💰 {cost || '—'}</span>
        </div>
      </button>
    );
  };

  const section = (title: string, note: string, accent: string, list: CatalogItem[]) => (
    <div style={{ background: '#fff', border: '1px solid #e4e2dc', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid #efece6', borderLeft: `4px solid ${accent}` }}>
        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-serif)', color: '#2f2c25' }}>{title}</div>
        <div style={{ fontSize: 11.5, color: '#a8a59d', marginTop: 2 }}>{note}</div>
      </div>
      <div style={{ padding: 14 }}>
        {list.length === 0 ? (
          <div style={{ fontSize: 12.5, color: '#bdbab2', textAlign: 'center', padding: '18px 0' }}>— ไม่มีของในหมวดนี้ —</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>{list.map(card)}</div>
        )}
      </div>
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
        {detail && <CatalogDetail item={detail} cfg={CATALOG_CONFIGS.equipment} category="equipment" isFeature={false} onEdit={() => {}} embedded />}
      </Modal>
    </section>
  );
}
