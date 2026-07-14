import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCatalogConfig, type CatalogCategory, type CatalogItem, type FilterField, type WiwonCover } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { useCatalog, useCatalogFieldTags, type CatalogQuery } from '../lib/catalogHooks';
import { api } from '../lib/api';
import { AdvancedFilterPanel } from '../components/AdvancedFilterPanel';
import { ManageTagsModal, PopularTagsModal } from '../components/CatalogTagModals';
import { CatalogDetail } from '../components/CatalogDetail';
import { CatalogAddModal } from '../components/CatalogAddModal';
import { Modal } from '../components/Modal';
import { Button } from '../components/ui';
import layout from '../components/layout.module.css';

const emptyQuery = (): CatalogQuery => ({ scope: 'all', isFeature: false, q: '', page: 1, filters: {}, ranges: {}, sortKey: '', sortDir: 'asc' });

// Compact page list: first page, a window around the current page, the last
// page, with '…' filling the gaps (e.g. 1 2 3 4 … 10). All shown when few.
function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) out.push('…');
  for (let i = left; i <= right; i++) out.push(i);
  if (right < total - 1) out.push('…');
  out.push(total);
  return out;
}

export function CatalogPage({ category }: { category: CatalogCategory }) {
  const { user } = useAuth();
  const cfg = getCatalogConfig(category);
  const [params, setParams] = useSearchParams();

  const [query, setQuery] = useState<CatalogQuery>(emptyQuery());
  const [showFilters, setShowFilters] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('item'));
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  const [submitItem, setSubmitItem] = useState<CatalogItem | null>(null);
  const [manageField, setManageField] = useState<FilterField | null>(null);
  const [popEditOpen, setPopEditOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkMsg, setBulkMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const qc = useQueryClient();

  const bulkImport = useMutation({
    mutationFn: async () => {
      let items: unknown;
      try { items = JSON.parse(bulkText); } catch { throw new Error('JSON ไม่ถูกต้อง — ตรวจวงเล็บ/เครื่องหมายจุลภาคอีกครั้ง'); }
      if (!Array.isArray(items)) throw new Error('ต้องเป็น JSON แบบ array ของไอเทม (ขึ้นต้นด้วย [ )');
      return api.post<{ created: number; names: string[] }>(`/catalog/${category}/bulk-import`, { items });
    },
    onSuccess: (res) => {
      setBulkMsg({ ok: true, text: `เพิ่มสำเร็จ ${res.created} ชิ้น` });
      setBulkText('');
      qc.invalidateQueries({ queryKey: ['catalog', category] });
    },
    onError: (e) => setBulkMsg({ ok: false, text: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' }),
  });

  const isFeature = query.isFeature && !!cfg.hasFeature; // never applies to non-feature categories
  const source = isFeature && cfg.feature ? cfg.feature : cfg;
  const isDev = user?.role === 'dev';

  const effQuery = query.isFeature === isFeature ? query : { ...query, isFeature };
  const { data, isLoading } = useCatalog(category, effQuery);
  const catScope = isFeature ? `${category}-feature` : category;
  const { data: fieldTags } = useCatalogFieldTags(catScope);

  const items = useMemo(() => data?.items ?? [], [data]);
  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;

  const { data: coversData } = useQuery({
    queryKey: ['wiwon-covers'],
    queryFn: () => api.get<{ covers: WiwonCover[] }>('/wiwon-covers'),
  });
  const covers = useMemo(() => coversData?.covers ?? [], [coversData]);
  const coverName = (id: string) => covers.find((c) => c.id === id)?.name ?? id;

  const submitOfficial = useMutation({
    mutationFn: (item: CatalogItem) => api.post(`/catalog/${category}/item/${item.id}/submit-official`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog', category] });
      qc.invalidateQueries({ queryKey: ['pray'] });
      setSubmitItem(null);
    },
  });

  // Copy an item → a new Homebrew owned by the user (name + " (Copy)"), then open
  // the edit modal on it so they can tweak without rewriting from scratch.
  const copyItem = useMutation({
    mutationFn: (item: CatalogItem) => api.post<{ item: CatalogItem }>(`/catalog/${category}`, {
      name: `${item.name} (Copy)`,
      subtitle: item.subtitle ?? undefined,
      isFeature: !!item.isFeature,
      relatedWiwonId: item.relatedWiwonId ?? undefined,
      fields: item.fields ?? {},
      description: item.description ?? '',
      tags: item.tags ?? [],
      iconUrl: item.iconUrl ?? undefined,
    }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['catalog', category] });
      // A dev's copy is Official; a user's is Homebrew — switch to the scope that
      // actually contains the new item so it's visible + selected for editing.
      setQuery((q) => ({ ...q, scope: isDev ? 'official' : 'homebrew' }));
      setSelectedId(d.item.id);
      setEditItem(d.item);
      setAddOpen(true);
      setCopyMsg(`สร้างสำเนาแล้ว: “${d.item.name}” (${isDev ? 'Official' : 'Homebrew ของคุณ'}) — กำลังแก้ไขสำเนาใหม่ · ต้นฉบับไม่ถูกแตะต้อง`);
    },
  });

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

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const columns = source.columns;
  const popular = data?.popularTags?.length ? data.popularTags : source.popularTags;
  const statBoxes = data?.statBoxes ?? [];
  const listGrid = `42px ${columns.map((c) => `${c.grow ?? 1}fr`).join(' ')}`;

  const activeChips = Object.entries(query.filters).filter(([, v]) => v);

  return (
    <div className={layout.page} style={{ paddingTop: 32 }}>
      {copyMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: '#eef6f0', border: '1px solid #cfe6d6', color: '#2f6b4f', fontSize: 13, fontWeight: 600 }}>
          <span style={{ flex: 1 }}>⧉ {copyMsg}</span>
          <button onClick={() => setCopyMsg(null)} style={{ flex: 'none', border: '1px solid #cfe6d6', background: '#fff', color: '#2f6b4f', borderRadius: 7, padding: '3px 11px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>รับทราบ ✓</button>
        </div>
      )}
      {/* title + stats box */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, marginBottom: 22 }}>
        <div style={{ maxWidth: 460 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 38, letterSpacing: '-.01em' }}>{cfg.title}</h1>
          <p style={{ color: '#5f5c54', fontSize: 14, lineHeight: 1.6, margin: '12px 0 0' }}>{cfg.desc}</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e4e2dc', borderRadius: 14, padding: '16px 20px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {statBoxes.map((s) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b6860' }}>
                <span style={{ width: 16, height: 16, borderRadius: 4, background: '#efece6' }} />
                {s.label}
              </span>
              <span style={{ fontWeight: 600 }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* magic/feature toggle */}
      {cfg.hasFeature && (
        <div style={{ display: 'flex', gap: 4, background: '#e7e5df', borderRadius: 9, padding: 4, marginBottom: 14, width: 'max-content' }}>
          {[
            { f: false, label: 'Magic' },
            { f: true, label: 'Feature' },
          ].map((m) => (
            <button
              key={String(m.f)}
              onClick={() => patchQuery({ isFeature: m.f, filters: {}, ranges: {} })}
              style={{ padding: '7px 18px', borderRadius: 7, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: isFeature === m.f ? '#fff' : 'transparent', color: isFeature === m.f ? '#15140f' : '#8d8a82' }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* search */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#fff', border: '1px solid #e0ded7', borderRadius: 11, padding: '7px 14px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a8a59d" strokeWidth="2" style={{ flex: 'none' }}>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          {activeChips.map(([k, v]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#15140f', color: '#fff', borderRadius: 7, padding: '4px 6px 4px 10px', fontSize: 12, fontWeight: 500 }}>
              {k === 'relatedWiwon' ? `Wiwon: ${coverName(v)}` : v}
              <button onClick={() => setFilter(k, '')} style={{ border: 'none', background: 'none', color: '#b6b3aa', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>
                ×
              </button>
            </span>
          ))}
          <input value={query.q} onChange={(e) => patchQuery({ q: e.target.value })} placeholder={cfg.searchPlaceholder} style={{ flex: 1, minWidth: 120, border: 'none', background: 'transparent', outline: 'none', fontSize: 14, padding: '6px 0' }} />
        </div>
        <button
          onClick={() => setShowFilters((s) => !s)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', background: showFilters ? '#15140f' : '#fff', color: showFilters ? '#fff' : '#46443c', border: '1px solid #e0ded7', borderRadius: 11, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          <span style={{ width: 14, height: 14, borderRadius: 4, background: 'currentColor', opacity: 0.3 }} />
          Advanced Filter
        </button>
        <button
          onClick={() => {
            if (!user) return (window.location.href = '/login');
            setEditItem(null);
            setAddOpen(true);
          }}
          style={{ padding: '0 20px', background: '#e07a5f', color: '#fff', border: 'none', borderRadius: 11, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          + เพิ่มข้อมูล
        </button>
        {isDev && (
          <button
            onClick={() => { setBulkMsg(null); setBulkOpen(true); }}
            title="นำเข้าหลายชิ้นพร้อมกันด้วย JSON"
            style={{ padding: '0 16px', background: '#15140f', color: '#fff', border: 'none', borderRadius: 11, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            ⇪ Bulk Import
          </button>
        )}
      </div>

      {showFilters && (
        <AdvancedFilterPanel
          fields={source.filterFields}
          filters={query.filters}
          ranges={query.ranges}
          fieldTags={fieldTags}
          wiwonOptions={covers}
          canManage={isDev}
          onManage={setManageField}
          onFilter={setFilter}
          onRange={setRange}
          onClear={() => setQuery((q) => ({ ...q, filters: {}, ranges: {}, page: 1 }))}
        />
      )}

      {/* popular tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 22 }}>
        <span style={{ fontSize: 12.5, color: '#8d8a82', marginRight: 4 }}>Popular Tags</span>
        {popular.map((t) => {
          const on = query.filters.tag === t;
          return (
            <button
              key={t}
              onClick={() => setFilter('tag', on ? '' : t)}
              style={{ padding: '5px 13px', borderRadius: 20, fontSize: 12.5, cursor: 'pointer', border: `1px solid ${on ? '#15140f' : '#e4e2dc'}`, background: on ? '#15140f' : '#fff', color: on ? '#fff' : '#46443c' }}
            >
              #{t}
            </button>
          );
        })}
        {isDev && (
          <button
            onClick={() => setPopEditOpen(true)}
            style={{ padding: '5px 11px', borderRadius: 20, fontSize: 11.5, cursor: 'pointer', border: '1px dashed #e0c4ba', background: '#faf6f4', color: '#b4513a', fontWeight: 600 }}
          >
            ✎ แก้ไข
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 22, alignItems: 'start' }}>
        {/* detail (left) */}
        {selected ? (
          <CatalogDetail key={selected.id} item={selected} cfg={cfg} category={category} isFeature={isFeature} onEdit={(it) => { setEditItem(it); setAddOpen(true); }} onSubmitOfficial={setSubmitItem} onCopy={user ? (it) => copyItem.mutate(it) : undefined} />
        ) : (
          <div style={{ background: '#fff', border: '1px solid #e4e2dc', borderRadius: 14, padding: '50px 24px', textAlign: 'center', color: '#a8a59d', fontSize: 13, position: 'sticky', top: 96 }}>
            เลือกรายการเพื่อดูรายละเอียด
          </div>
        )}

        {/* list (right) */}
        <div style={{ background: '#fff', border: '1px solid #e4e2dc', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ background: '#15140f', color: '#fff', padding: '13px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{source.title ?? cfg.listTitle}</span>
            <div style={{ display: 'flex', background: '#2a2822', borderRadius: 8, padding: 3, gap: 2 }}>
              {(['all', 'official', 'homebrew'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => patchQuery({ scope: s })}
                  style={{ padding: '5px 11px', border: 'none', borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: query.scope === s ? '#fff' : 'transparent', color: query.scope === s ? '#15140f' : '#b6b3aa' }}
                >
                  {s === 'all' ? 'ทั้งหมด' : s === 'official' ? 'ทางการ' : `My Homebrew (${data?.stats.homebrew ?? 0})`}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: listGrid, gap: 0, padding: '12px 22px', borderBottom: '1px solid #ece9e3', fontSize: 11.5, color: '#8d8a82', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>
            <span>No.</span>
            {columns.map((c) => {
              const sortable = !!c.sort;
              const active = query.sortKey === c.key;
              return (
                <span
                  key={c.key}
                  onClick={sortable ? () => patchQuery({ sortKey: c.key, sortDir: active && query.sortDir === 'asc' ? 'desc' : 'asc', page: 1 }) : undefined}
                  style={{ cursor: sortable ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: 4, color: active ? '#15140f' : undefined, userSelect: 'none' }}
                >
                  {c.label}
                  {sortable && <span style={{ fontSize: 9, opacity: active ? 1 : 0.35 }}>{active ? (query.sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>}
                </span>
              );
            })}
          </div>

          {isLoading && <div style={{ padding: 40, textAlign: 'center', color: '#a8a59d', fontSize: 13 }}>กำลังโหลด…</div>}
          {!isLoading && items.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: '#a8a59d', fontSize: 13 }}>ไม่พบข้อมูลที่ตรงกับตัวกรอง</div>}
          {items.map((it, i) => {
            const no = String((query.page - 1) * (data?.pageSize ?? 15) + i + 1).padStart(2, '0');
            return (
              <div
                key={it.id}
                onClick={() => setSelectedId(it.id)}
                style={{ display: 'grid', gridTemplateColumns: listGrid, gap: 0, padding: '11px 22px', borderBottom: '1px solid #f3f1ec', fontSize: 12.5, cursor: 'pointer', alignItems: 'center', background: selected?.id === it.id ? '#faf6f4' : 'transparent' }}
              >
                <span style={{ color: '#a8a59d' }}>{no}</span>
                <span style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 7 }}>
                  {it.name}
                  {it.approvedFromHomebrew && <span title="Official" style={{ fontSize: 11, color: '#5b3fa0' }}>🌙</span>}
                  {it.isHomebrew && <span style={{ fontSize: 9, fontWeight: 700, color: '#e07a5f', border: '1px solid #f0cabd', borderRadius: 4, padding: '1px 5px' }}>HB</span>}
                </span>
                {columns.slice(1).map((c) => {
                  let v: string;
                  if (c.key === 'source') v = it.source;
                  else if (c.key === 'tag') v = String(it.fields.tag ?? it.tags[0] ?? '—');
                  else if (c.key === 'school') v = String(it.fields.school ?? '—').replace(/\s*school\s*$/i, '').trim() || '—';
                  else if (c.key === 'cost') v = String(it.fields.cost ?? '—').replace(/A particle of Ehen/gi, 'P.E');
                  else v = String(it.fields[c.key] ?? '—');
                  return (
                    <span key={c.key} style={{ color: '#6b6860', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 6 }}>
                      {v}
                    </span>
                  );
                })}
              </div>
            );
          })}

          {data && data.total > data.pageSize && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 22px', borderTop: '1px solid #ece9e3', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, color: '#a8a59d' }}>
                {(query.page - 1) * data.pageSize + 1}–{Math.min(query.page * data.pageSize, data.total)} จาก {data.total}
              </span>
              <span style={{ flex: 1 }} />
              <button onClick={() => patchQuery({ page: Math.max(1, query.page - 1) })} disabled={query.page <= 1} style={pgBtn}>
                ‹ ก่อนหน้า
              </button>
              {pageWindow(query.page, totalPages).map((p, i) =>
                p === '…' ? (
                  <span key={`e${i}`} style={{ minWidth: 20, textAlign: 'center', fontSize: 13, color: '#a8a59d', userSelect: 'none' }}>…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => patchQuery({ page: p })}
                    style={{ minWidth: 30, padding: '6px 9px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1px solid ${query.page === p ? '#15140f' : '#e0ded7'}`, background: query.page === p ? '#15140f' : '#fff', color: query.page === p ? '#fff' : '#6b6860' }}
                  >
                    {p}
                  </button>
                ),
              )}
              <button onClick={() => patchQuery({ page: Math.min(totalPages, query.page + 1) })} disabled={query.page >= totalPages} style={pgBtn}>
                ถัดไป ›
              </button>
            </div>
          )}
        </div>
      </div>

      {addOpen && (
        <CatalogAddModal open={addOpen} onClose={() => { setAddOpen(false); setEditItem(null); }} category={category} cfg={cfg} isFeature={isFeature} editItem={editItem} />
      )}

      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title={`⇪ Bulk Import — ${category}`}
        width={620}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulkOpen(false)}>ปิด</Button>
            <Button variant="coral" onClick={() => bulkImport.mutate()} disabled={bulkImport.isPending || !bulkText.trim()}>
              {bulkImport.isPending ? 'กำลังนำเข้า…' : 'นำเข้าเข้าฐานข้อมูล'}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.7 }}>
          วาง JSON แบบ array ของไอเทม (แต่ละชิ้นมี <code>name</code>, <code>fields</code>, <code>tags</code>, <code>description</code>) แล้วกดนำเข้า —
          ทุกชิ้นจะถูกสร้างเป็น Official ลงฐานข้อมูลจริงทันที
        </p>
        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder={'[\n  { "name": "…", "fields": { "tag": "Weapon", … }, "tags": ["Weapon"], "description": "…" }\n]'}
          spellCheck={false}
          style={{ width: '100%', boxSizing: 'border-box', minHeight: 260, border: '1px solid #e0ded7', borderRadius: 10, padding: '11px 13px', fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace', lineHeight: 1.5, outline: 'none', resize: 'vertical' }}
        />
        {bulkMsg && (
          <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600, padding: '9px 13px', borderRadius: 9, background: bulkMsg.ok ? '#eef6f0' : '#fbeae6', color: bulkMsg.ok ? '#2f7d4f' : '#b4513a', border: `1px solid ${bulkMsg.ok ? '#cfe6d6' : '#f3cabf'}` }}>
            {bulkMsg.ok ? '✓ ' : '⚠️ '}{bulkMsg.text}
          </div>
        )}
      </Modal>

      {manageField && (
        <ManageTagsModal
          field={manageField}
          catScope={catScope}
          custom={fieldTags?.[manageField.key]?.custom ?? []}
          hidden={fieldTags?.[manageField.key]?.hidden ?? []}
          order={fieldTags?.[manageField.key]?.order ?? []}
          onClose={() => setManageField(null)}
        />
      )}

      {popEditOpen && (
        <PopularTagsModal catScope={catScope} current={popular} onClose={() => setPopEditOpen(false)} />
      )}

      <Modal
        open={!!submitItem}
        onClose={() => setSubmitItem(null)}
        title="ส่งเรื่องถึงผู้พัฒนา"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSubmitItem(null)}>ยังก่อน</Button>
            <Button variant="coral" onClick={() => submitItem && submitOfficial.mutate(submitItem)} disabled={submitOfficial.isPending}>ยืนยัน ส่งเรื่อง</Button>
          </>
        }
      >
        <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-muted)', margin: 0 }}>
          คุณแน่ใจแล้วใช่ไหม? จะส่ง “{submitItem?.name}” ให้ผู้พัฒนาพิจารณายกระดับเป็น Official
        </p>
      </Modal>
    </div>
  );
}

const pgBtn: React.CSSProperties = { padding: '6px 11px', borderRadius: 7, border: '1px solid #e0ded7', background: '#fff', color: '#6b6860', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
