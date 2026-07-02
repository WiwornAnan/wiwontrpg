import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCatalogConfig, type CatalogCategory, type CatalogItem } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { useCatalog, useCatalogTags, type CatalogQuery } from '../lib/catalogHooks';
import { AdvancedFilterPanel } from '../components/AdvancedFilterPanel';
import { CatalogDetail } from '../components/CatalogDetail';
import { CatalogAddModal } from '../components/CatalogAddModal';
import { Button } from '../components/ui';
import layout from '../components/layout.module.css';
import styles from '../components/catalog.module.css';

const emptyQuery = (): CatalogQuery => ({ scope: 'all', isFeature: false, q: '', page: 1, filters: {}, ranges: {} });

export function CatalogPage({ category }: { category: CatalogCategory }) {
  const { user } = useAuth();
  const cfg = getCatalogConfig(category);
  const [params, setParams] = useSearchParams();

  const [query, setQuery] = useState<CatalogQuery>(emptyQuery());
  const [showFilters, setShowFilters] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('item'));
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);

  const isFeature = query.isFeature;
  const source = isFeature && cfg.feature ? cfg.feature : cfg;

  const { data, isLoading } = useCatalog(category, query);
  const scopeName = isFeature ? `${category}-feature` : category;
  const { data: customTags } = useCatalogTags(scopeName);

  const items = useMemo(() => data?.items ?? [], [data]);
  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;

  useEffect(() => {
    if (selected) setParams(selected.id ? { item: selected.id } : {}, { replace: true });
  }, [selected, setParams]);

  function patchQuery(p: Partial<CatalogQuery>) {
    setQuery((q) => ({ ...q, ...p, page: p.page ?? 1 }));
  }
  function setFilter(key: string, value: string) {
    setQuery((q) => ({ ...q, filters: { ...q.filters, [key]: value }, page: 1 }));
  }
  function setRange(key: string, bound: 'min' | 'max', value: string) {
    setQuery((q) => ({ ...q, ranges: { ...q.ranges, [key]: { ...q.ranges[key], [bound]: value } }, page: 1 }));
  }
  function togglePopular(tag: string) {
    setFilter('tag', query.filters.tag === tag ? '' : tag);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const columns = source.columns;
  const popular = data?.popularTags?.length ? data.popularTags : source.popularTags;

  return (
    <div className={layout.page}>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 32 }}>{cfg.title}</h1>
      <p style={{ color: 'var(--text-dim)', fontSize: 14, margin: '8px 0 0', maxWidth: 760 }}>{cfg.desc}</p>

      {/* live stats */}
      <div className={styles.stats}>
        <Stat value={data?.stats.total ?? 0} label={cfg.statLabels[0]} />
        <Stat value={data?.stats.official ?? 0} label="Official" />
        <Stat value={data?.stats.homebrew ?? 0} label="Homebrew" />
      </div>

      {/* Magic/Feature toggle */}
      {cfg.hasFeature && (
        <div className={styles.scopeTabs} style={{ marginBottom: 14 }}>
          <button className={`${styles.scopeTab} ${!isFeature ? styles.scopeTabActive : ''}`} onClick={() => patchQuery({ isFeature: false, filters: {}, ranges: {} })}>
            Magic
          </button>
          <button className={`${styles.scopeTab} ${isFeature ? styles.scopeTabActive : ''}`} onClick={() => patchQuery({ isFeature: true, filters: {}, ranges: {} })}>
            Feature
          </button>
        </div>
      )}

      {/* search + advanced filter toggle + add */}
      <div className={styles.searchRow}>
        <div className={styles.searchBox}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a8a59d" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input value={query.q} onChange={(e) => patchQuery({ q: e.target.value })} placeholder={cfg.searchPlaceholder} />
        </div>
        <Button variant={showFilters ? 'primary' : 'ghost'} onClick={() => setShowFilters((s) => !s)}>
          ⚙ Advanced Filter
        </Button>
        <Button
          variant="coral"
          onClick={() => {
            if (!user) return (window.location.href = '/login');
            setEditItem(null);
            setAddOpen(true);
          }}
        >
          + เพิ่มข้อมูล
        </Button>
      </div>

      {/* popular tags */}
      <div className={styles.chips}>
        <span style={{ fontSize: 12, color: 'var(--text-faint)', alignSelf: 'center', marginRight: 4 }}>Popular Tags:</span>
        {popular.map((t) => (
          <button key={t} className={`${styles.chip} ${query.filters.tag === t ? styles.chipActive : ''}`} onClick={() => togglePopular(t)}>
            {t}
          </button>
        ))}
      </div>

      {showFilters && (
        <AdvancedFilterPanel
          fields={source.filterFields}
          filters={query.filters}
          ranges={query.ranges}
          extraOptions={{ tag: customTags?.custom ?? [] }}
          hiddenOptions={{ tag: customTags?.hidden ?? [] }}
          onFilter={setFilter}
          onRange={setRange}
        />
      )}

      {/* scope tabs */}
      <div style={{ marginBottom: 16 }}>
        <div className={styles.scopeTabs}>
          {(['all', 'official', 'homebrew'] as const).map((s) => (
            <button key={s} className={`${styles.scopeTab} ${query.scope === s ? styles.scopeTabActive : ''}`} onClick={() => patchQuery({ scope: s })}>
              {s === 'all' ? 'ทั้งหมด' : s === 'official' ? 'ทางการ' : 'Homebrew'}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.catGrid}>
        {/* list */}
        <div className={styles.listCard}>
          <div className={styles.listHead}>
            {columns.map((c) => (
              <span key={c.key} style={{ flex: c.grow ?? '1', minWidth: 0 }}>
                {c.label}
              </span>
            ))}
          </div>
          {isLoading && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>กำลังโหลด…</div>}
          {!isLoading && items.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-ghost)', fontSize: 13 }}>ไม่พบข้อมูลที่ตรงกับเงื่อนไข</div>}
          {items.map((it) => (
            <div key={it.id} className={`${styles.listRow} ${selected?.id === it.id ? styles.listRowActive : ''}`} onClick={() => setSelectedId(it.id)}>
              {columns.map((c) => (
                <span key={c.key} style={{ flex: c.grow ?? '1', minWidth: 0, fontWeight: c.key === 'name' ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                  {c.key === 'name' ? (
                    <>
                      {it.approvedFromHomebrew && '🌙 '}
                      {it.name}
                      {it.isHomebrew && <span style={{ marginLeft: 6, fontSize: 8.5, fontWeight: 800, color: 'var(--orange)', background: 'var(--orange-bg)', borderRadius: 4, padding: '1px 5px' }}>HB</span>}
                    </>
                  ) : c.key === 'source' ? (
                    it.source
                  ) : c.key === 'tag' ? (
                    String(it.fields.tag ?? it.tags[0] ?? '—')
                  ) : (
                    String(it.fields[c.key] ?? '—')
                  )}
                </span>
              ))}
            </div>
          ))}
          {data && data.total > 0 && (
            <div className={styles.pageBtns}>
              <span>
                {(query.page - 1) * data.pageSize + 1}–{Math.min(query.page * data.pageSize, data.total)} จาก {data.total}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost" style={{ padding: '5px 12px' }} disabled={query.page <= 1} onClick={() => patchQuery({ page: query.page - 1 })}>
                  ← ก่อนหน้า
                </Button>
                <Button variant="ghost" style={{ padding: '5px 12px' }} disabled={query.page >= totalPages} onClick={() => patchQuery({ page: query.page + 1 })}>
                  ถัดไป →
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* detail */}
        {selected ? (
          <CatalogDetail
            item={selected}
            cfg={cfg}
            category={category}
            isFeature={isFeature}
            onEdit={(it) => {
              setEditItem(it);
              setAddOpen(true);
            }}
          />
        ) : (
          <div className={styles.detail} style={{ padding: '50px 30px', textAlign: 'center', color: 'var(--text-ghost)', fontSize: 13 }}>
            เลือกรายการเพื่อดูรายละเอียด
          </div>
        )}
      </div>

      {addOpen && (
        <CatalogAddModal
          open={addOpen}
          onClose={() => {
            setAddOpen(false);
            setEditItem(null);
          }}
          category={category}
          cfg={cfg}
          isFeature={isFeature}
          editItem={editItem}
        />
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className={styles.statBox}>
      <div className={styles.statVal}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}
