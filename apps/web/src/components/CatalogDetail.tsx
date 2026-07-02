import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { CatalogCategory, CatalogConfig, CatalogItem } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { StarButton } from './StarButton';
import { Button } from './ui';
import styles from './catalog.module.css';

function val(item: CatalogItem, key: string): string {
  if (key === 'source') return item.source;
  if (key === 'tag') return String(item.fields.tag ?? item.tags[0] ?? '—');
  const v = item.fields[key];
  return v === undefined || v === null || v === '' ? '—' : String(v);
}

interface Props {
  item: CatalogItem;
  cfg: CatalogConfig;
  category: CatalogCategory;
  isFeature: boolean;
  onEdit: (item: CatalogItem) => void;
  onSubmitOfficial?: (item: CatalogItem) => void;
}

export function CatalogDetail({ item, cfg, category, isFeature, onEdit, onSubmitOfficial }: Props) {
  const { user, isDev } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const source = isFeature && cfg.feature ? cfg.feature : cfg;
  const detailKeys = source.detailKeys;

  const canEdit = isDev || (user && item.isHomebrew && item.ownerUserId === user.id);

  const del = useMutation({
    mutationFn: () => api.delete(`/catalog/${category}/item/${item.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog', category] }),
  });

  // Magic (non-feature) gets 3 highlighted stat boxes.
  const highlight = category === 'magic' && !isFeature;

  return (
    <div className={styles.detail}>
      <div style={{ background: 'var(--ink)', color: '#fff', padding: '16px 20px', position: 'relative' }}>
        {item.approvedFromHomebrew && (
          <div title="ได้รับอนุมัติเป็น Official" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: 'linear-gradient(#e9d9a0,#c9a94a)' }} />
        )}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 22 }}>
                {item.approvedFromHomebrew && '🌙 '}
                {item.name}
              </h3>
              {item.isHomebrew && <span className={styles.hbBadge}>HOMEBREW</span>}
            </div>
            <div style={{ fontSize: 12.5, color: '#9a978e', marginTop: 3 }}>
              {String(item.fields[cfg.subtitleKey] ?? item.source)}
              {item.isHomebrew && item.ownerName ? ` · โดย ${item.ownerName}` : ''}
            </div>
          </div>
          <StarButton catalogItemId={item.id} size={18} />
        </div>
      </div>

      <div style={{ padding: '18px 20px 20px' }}>
        {highlight && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <HL label="Magic Slot" value={val(item, 'cost')} bg="#fdece2" color="#c1502a" />
            <HL label="Quality of Life" value={val(item, 'ql')} bg="var(--purple-bg)" color="var(--purple)" />
            <HL label="Knowledge" value={val(item, 'knowledge')} bg="#e4effb" color="#2f6aa8" />
          </div>
        )}

        {item.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {item.tags.map((t) => (
              <span key={t} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: cfg.tagBg ?? '#edeae4', color: cfg.tagColor ?? 'var(--text-dim)' }}>
                #{t}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px 16px', marginBottom: 16 }}>
          {detailKeys
            .filter(([, k]) => !(highlight && (k === 'cost' || k === 'ql' || k === 'knowledge')))
            .map(([label, key]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, borderBottom: '1px solid var(--divider)', paddingBottom: 6 }}>
                <span style={{ color: 'var(--text-faint)' }}>{label}</span>
                <span style={{ fontWeight: 600, textAlign: 'right' }}>{val(item, key)}</span>
              </div>
            ))}
        </div>

        {item.description && (
          <div
            className="rt-html"
            style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-muted)', marginBottom: 12 }}
            dangerouslySetInnerHTML={{ __html: item.description }}
          />
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          {canEdit && (
            <Button variant="ghost" style={{ fontSize: 12.5 }} onClick={() => onEdit(item)}>
              ✎ แก้ไข
            </Button>
          )}
          {canEdit && (
            <Button variant="danger" style={{ fontSize: 12.5 }} onClick={() => del.mutate()}>
              ลบ
            </Button>
          )}
          {/* submit-to-official button (owner of homebrew, not yet approved) — Phase 5 */}
          {onSubmitOfficial && user && item.isHomebrew && !item.approvedFromHomebrew && item.ownerUserId === user.id && (
            <Button variant="coral" style={{ fontSize: 12.5 }} onClick={() => onSubmitOfficial(item)}>
              ⬆ ส่งเรื่องถึงผู้พัฒนา เพื่อลง Official
            </Button>
          )}
          {!user && (
            <Button variant="ghost" style={{ fontSize: 12.5 }} onClick={() => navigate('/login')}>
              เข้าสู่ระบบเพื่อจัดการ
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function HL({ label, value, bg, color }: { label: string; value: string; bg: string; color: string }) {
  return (
    <div style={{ flex: 1, background: bg, borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10.5, color, opacity: 0.8, marginTop: 2 }}>{label}</div>
    </div>
  );
}
