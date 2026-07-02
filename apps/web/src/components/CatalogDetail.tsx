import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { CatalogCategory, CatalogConfig, CatalogItem } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { StarButton } from './StarButton';

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
const MAGIC_EXCLUDE = new Set(['ql', 'knowledge', 'cost']);

export function CatalogDetail({ item, cfg, category, isFeature, onEdit, onSubmitOfficial }: Props) {
  const { user, isDev } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const source = isFeature && cfg.feature ? cfg.feature : cfg;
  const isMagicSpell = category === 'magic' && !isFeature;

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
      if (isMagicSpell && MAGIC_EXCLUDE.has(f.key)) return false;
      if (seen.has(f.key)) return false;
      seen.add(f.key);
      return true;
    })
    .map((f) => ({ label: f.label, value: f.key === 'components' ? abbrevComponents(fv(item, f.key)) : fv(item, f.key) }))
    .filter((s) => s.value !== '' && s.label !== 'Cost' && s.label !== 'Rarity' && s.label !== 'School');

  const keyStats = isMagicSpell
    ? [
        { label: 'Magic Slot', value: fv(item, 'cost') || '—', bg: '#fdece2', color: '#c1502a' },
        { label: 'Quality of Life', value: fv(item, 'ql') || '—', bg: '#ede7f6', color: '#5b3fa0' },
        { label: 'Knowledge', value: fv(item, 'knowledge') || '—', bg: '#e5edfb', color: '#2a6fdb' },
      ]
    : [];

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

