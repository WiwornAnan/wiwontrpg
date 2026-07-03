import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DOC_CATEGORIES,
  DOC_CATEGORY_LABELS,
  SUMMARY_MAX_LENGTH,
  type Article,
  type ArticleImage,
  type ArticleTable,
  type DocCategory,
  type ImageLayout,
  type StickyNote,
  type WiwonCover,
} from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { api, uploadImage } from '../lib/api';
import { Modal } from '../components/Modal';
import { Button, inputStyle, labelStyle } from '../components/ui';
import styles from '../components/layout.module.css';

const uid = () => Math.random().toString(36).slice(2, 10);

type StatusFilter = 'all' | 'published' | 'draft';

interface Draft {
  id?: string;
  category: DocCategory;
  wiwonCoverId: string | null;
  partSection: string;
  title: string;
  summary: string;
  bodyText: string;
  tags: string[];
  authorName: string;
  footnote: string;
  images: ArticleImage[];
  tables: ArticleTable[];
  notes: StickyNote[];
  iconLarge: string | null;
  iconSmall: string | null;
  status: 'draft' | 'published';
}

const emptyDraft = (): Draft => ({
  category: 'core-rules',
  wiwonCoverId: null,
  partSection: 'Contents',
  title: '',
  summary: '',
  bodyText: '',
  tags: [],
  authorName: '',
  footnote: '',
  images: [],
  tables: [],
  notes: [],
  iconLarge: null,
  iconSmall: null,
  status: 'draft',
});

function toDraft(a: Article): Draft {
  return {
    id: a.id,
    category: a.category,
    wiwonCoverId: a.wiwonCoverId,
    partSection: a.partSection,
    title: a.title,
    summary: a.summary,
    bodyText: a.bodyText,
    tags: a.tags,
    authorName: a.authorName ?? '',
    footnote: a.footnote ?? '',
    images: a.images,
    tables: a.tables,
    notes: a.notes,
    iconLarge: a.iconLarge,
    iconSmall: a.iconSmall,
    status: a.status,
  };
}

export function ContentEditorPage() {
  const { isDev } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [tagInput, setTagInput] = useState('');
  const [publishConfirm, setPublishConfirm] = useState(false);

  // Load ALL docs across doc categories (dev sees drafts too).
  const { data } = useQuery({
    queryKey: ['editor-docs'],
    queryFn: async () => {
      const results = await Promise.all(
        DOC_CATEGORIES.map((c) => api.get<{ articles: Article[] }>(`/articles?category=${c}`)),
      );
      return results.flatMap((r) => r.articles);
    },
    enabled: isDev,
  });
  const allDocs = useMemo(() => data ?? [], [data]);

  const { data: coversData } = useQuery({
    queryKey: ['wiwon-covers'],
    queryFn: () => api.get<{ covers: WiwonCover[] }>('/wiwon-covers'),
    enabled: isDev,
  });
  const covers = coversData?.covers ?? [];

  // Open a doc for editing when ?id= is present.
  const editId = params.get('id');
  useEffect(() => {
    if (editId && allDocs.length) {
      const found = allDocs.find((d) => d.id === editId);
      if (found) setDraft(toDraft(found));
    }
  }, [editId, allDocs]);

  const grouped = useMemo(() => {
    const filtered = allDocs.filter((d) => statusFilter === 'all' || d.status === statusFilter);
    const map = new Map<DocCategory, Article[]>();
    filtered.forEach((d) => {
      const arr = map.get(d.category) ?? [];
      arr.push(d);
      map.set(d.category, arr);
    });
    return [...map.entries()];
  }, [allDocs, statusFilter]);

  const save = useMutation({
    mutationFn: async (status: 'draft' | 'published') => {
      const payload = { ...draft, status };
      if (draft.id) return api.patch<{ article: Article }>(`/articles/${draft.id}`, payload);
      return api.post<{ article: Article }>('/articles', payload);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['editor-docs'] });
      qc.invalidateQueries({ queryKey: ['articles'] });
      setDraft(toDraft(res.article));
      setParams({ id: res.article.id });
      setPublishConfirm(false);
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/articles/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['editor-docs'] });
      qc.invalidateQueries({ queryKey: ['articles'] });
      newDoc();
    },
  });

  const reorder = useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: 'up' | 'down' }) =>
      api.patch(`/articles/${id}/order`, { direction }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['editor-docs'] }),
  });

  function newDoc() {
    setDraft(emptyDraft());
    setParams({});
  }
  function edit(a: Article) {
    setDraft(toDraft(a));
    setParams({ id: a.id });
  }

  if (!isDev) {
    return (
      <div className={styles.page}>
        <div className={styles.card} style={{ textAlign: 'center', padding: 48 }}>
          ต้องเป็นบัญชีผู้พัฒนาจึงจะเข้าถึง Content Editor ได้
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 30 }}>Content Editor</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--text-dim)' }}>จัดการบทความและข้อมูลในสารานุกรม WiwonAnant</p>
        </div>
        <button onClick={newDoc} style={{ padding: '11px 20px', background: '#15140f', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
          + บทความใหม่
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 22, alignItems: 'start' }}>
        {/* doc list */}
        <div className={styles.card} style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-faint)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>บทความทั้งหมด ({allDocs.length})</div>
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface-sunken)', borderRadius: 8, padding: 3 }}>
              {(['all', 'published', 'draft'] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  style={{ flex: 1, padding: '6px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: statusFilter === s ? '#fff' : 'transparent', color: statusFilter === s ? 'var(--ink)' : 'var(--text-faint)' }}
                >
                  {s === 'all' ? 'ทั้งหมด' : s === 'published' ? 'เผยแพร่แล้ว' : 'ฉบับร่าง'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {grouped.map(([cat, docs]) => (
              <div key={cat}>
                <div style={{ position: 'sticky', top: 0, background: 'var(--ink)', color: '#fff', padding: '8px 16px', fontSize: 12, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{DOC_CATEGORY_LABELS[cat]}</span>
                  <span style={{ color: '#9a978e' }}>{docs.length} บทความ</span>
                </div>
                {docs.map((d, i) => (
                  <div
                    key={d.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px 10px 16px', borderBottom: '1px solid var(--divider)', background: draft.id === d.id ? 'var(--coral-bg)' : 'transparent' }}
                  >
                    <button onClick={() => edit(d)} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{d.title || '(ไม่มีชื่อ)'}</div>
                      <div style={{ fontSize: 11, color: 'var(--coral-ink)', marginTop: 2 }}>{d.partSection}</div>
                    </button>
                    {d.status === 'draft' && <span className={styles.draftBadge}>ร่าง</span>}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <button onClick={() => reorder.mutate({ id: d.id, direction: 'up' })} disabled={i === 0} style={miniBtn}>▲</button>
                      <button onClick={() => reorder.mutate({ id: d.id, direction: 'down' })} disabled={i === docs.length - 1} style={miniBtn}>▼</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {grouped.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-ghost)', fontSize: 12.5 }}>ยังไม่มีบทความ</div>}
          </div>
        </div>

        {/* form */}
        <div className={styles.card}>
          <EditorForm
            draft={draft}
            setDraft={setDraft}
            tagInput={tagInput}
            setTagInput={setTagInput}
            covers={covers}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--border-faint)' }}>
            <Button variant="ghost" onClick={() => save.mutate('draft')} disabled={save.isPending || !draft.title.trim()}>
              บันทึกร่าง
            </Button>
            <Button variant="coral" onClick={() => setPublishConfirm(true)} disabled={!draft.title.trim()}>
              เผยแพร่
            </Button>
            <span style={{ flex: 1 }} />
            {draft.id && (
              <Button variant="danger" onClick={() => del.mutate(draft.id!)}>
                ลบบทความ
              </Button>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={publishConfirm}
        onClose={() => setPublishConfirm(false)}
        title="ยืนยันการเผยแพร่"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPublishConfirm(false)}>
              ยังก่อน
            </Button>
            <Button variant="coral" onClick={() => save.mutate('published')} disabled={save.isPending}>
              ใช่, เผยแพร่เลย
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-muted)', margin: 0 }}>
          Do you really want to publish this?
          <br />
          จะตีพิมพ์หรือเผยแพร่ผลงานนี้จริง ๆ ใช่ไหม?
        </p>
      </Modal>
    </div>
  );
}

const miniBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: '#bbb7af', fontSize: 9, lineHeight: 1, padding: '1px 4px' };

function EditorForm({
  draft,
  setDraft,
  tagInput,
  setTagInput,
  covers,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  tagInput: string;
  setTagInput: (v: string) => void;
  covers: WiwonCover[];
}) {
  const [uploadingIcon, setUploadingIcon] = useState<'large' | 'small' | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const paraCount = draft.bodyText.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const posOptions = Array.from({ length: paraCount + 1 }, (_, i) => i);

  async function addImage(file: File) {
    const url = await uploadImage(file);
    setDraft((d) => ({
      ...d,
      images: [...d.images, { id: uid(), url, layout: 'full', afterParagraph: 0, order: d.images.length }],
    }));
  }
  function updateImage(id: string, patch: Partial<ArticleImage>) {
    setDraft((d) => ({ ...d, images: d.images.map((im) => (im.id === id ? { ...im, ...patch } : im)) }));
  }
  function removeImage(id: string) {
    setDraft((d) => ({ ...d, images: d.images.filter((im) => im.id !== id) }));
  }
  async function setIcon(kind: 'large' | 'small', file: File) {
    setUploadingIcon(kind);
    try {
      const url = await uploadImage(file);
      setDraft((d) => ({ ...d, [kind === 'large' ? 'iconLarge' : 'iconSmall']: url }));
    } finally {
      setUploadingIcon(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={labelStyle}>หมวดหมู่ (หน้าปลายทาง)</label>
          <select
            style={inputStyle}
            value={draft.category}
            onChange={(e) => {
              const category = e.target.value as DocCategory;
              setDraft({ ...draft, category, wiwonCoverId: category === 'wiwon' ? draft.wiwonCoverId : null });
            }}
          >
            {DOC_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {DOC_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Part / หัวข้อกลุ่ม</label>
          <input style={inputStyle} value={draft.partSection} onChange={(e) => setDraft({ ...draft, partSection: e.target.value })} placeholder="เช่น Part 1: World & Lore" />
        </div>
      </div>

      {draft.category === 'wiwon' && (
        <div>
          <label style={labelStyle}>อยู่ในปกเล่ม (Wiwon)</label>
          <select style={inputStyle} value={draft.wiwonCoverId ?? ''} onChange={(e) => setDraft({ ...draft, wiwonCoverId: e.target.value || null })}>
            <option value="">— ไม่ระบุเล่ม —</option>
            {covers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label style={labelStyle}>ชื่อบทความ</label>
        <input style={inputStyle} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="ชื่อหัวข้อ" />
      </div>

      <div>
        <label style={labelStyle}>
          สรุป (สูงสุด {SUMMARY_MAX_LENGTH} ตัวอักษร)
          <span style={{ float: 'right', color: draft.summary.length > SUMMARY_MAX_LENGTH ? 'var(--danger)' : 'var(--text-ghost)', fontWeight: 400 }}>
            {draft.summary.length}/{SUMMARY_MAX_LENGTH}
          </span>
        </label>
        <textarea
          style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }}
          maxLength={SUMMARY_MAX_LENGTH}
          value={draft.summary}
          onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
        />
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>เนื้อหา (รายละเอียด)</label>
          <span style={{ fontSize: 11.5, color: 'var(--text-ghost)' }}>เลือกข้อความก่อน แล้วกดปุ่มจัดรูปแบบ</span>
        </div>
        <MarkdownToolbar textareaRef={bodyRef} value={draft.bodyText} onChange={(v) => setDraft({ ...draft, bodyText: v })} onAddNote={() => setDraft((d) => ({ ...d, notes: [...d.notes, { id: uid(), text: '', afterParagraph: paraCount }] }))} onAddTable={() => setDraft((d) => ({ ...d, tables: [...d.tables, { id: uid(), headCells: ['หัวข้อ 1', 'หัวข้อ 2'], rows: [['', '']], afterParagraph: paraCount }] }))} />
        <textarea
          ref={bodyRef}
          style={{ ...inputStyle, minHeight: 180, resize: 'vertical', lineHeight: 1.7, borderRadius: '0 0 9px 9px', borderTop: 'none' }}
          value={draft.bodyText}
          onChange={(e) => setDraft({ ...draft, bodyText: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const ta = e.currentTarget;
              const { selectionStart: s, selectionEnd: en } = ta;
              const next = draft.bodyText.slice(0, s) + '\t' + draft.bodyText.slice(en);
              setDraft({ ...draft, bodyText: next });
              requestAnimationFrame(() => {
                ta.selectionStart = ta.selectionEnd = s + 1;
              });
            }
          }}
          placeholder="พิมพ์เนื้อหาบทความ… (กด Tab เพื่อย่อหน้า)"
        />
      </div>

      {/* images */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>ภาพประกอบเนื้อหา (ใส่ได้หลายรูป)</label>
          <label style={{ ...inputStyle, width: 'auto', cursor: 'pointer', padding: '6px 12px', fontSize: 12 }}>
            + เพิ่มรูป
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && addImage(e.target.files[0])} />
          </label>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {draft.images.map((im) => (
            <div key={im.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--border-faint)', borderRadius: 10, padding: 8 }}>
              <img src={im.url} alt="" style={{ width: 54, height: 40, objectFit: 'cover', borderRadius: 6 }} />
              <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                <select value={im.layout} onChange={(e) => updateImage(im.id, { layout: e.target.value as ImageLayout })} style={{ ...inputStyle, padding: '6px 8px', fontSize: 12 }}>
                  <option value="full">เต็มกว้าง</option>
                  <option value="left">ลอยซ้าย</option>
                  <option value="right">ลอยขวา</option>
                </select>
                <select value={im.afterParagraph} onChange={(e) => updateImage(im.id, { afterParagraph: Number(e.target.value) })} style={{ ...inputStyle, padding: '6px 8px', fontSize: 12 }}>
                  {posOptions.map((p) => (
                    <option key={p} value={p}>
                      {p === 0 ? 'ก่อนเนื้อหา' : `หลังย่อหน้าที่ ${p}`}
                    </option>
                  ))}
                </select>
              </div>
              <button onClick={() => removeImage(im.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16 }}>
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {draft.notes.map((n) => (
        <div key={n.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea
            value={n.text}
            onChange={(e) => setDraft((d) => ({ ...d, notes: d.notes.map((x) => (x.id === n.id ? { ...x, text: e.target.value } : x)) }))}
            placeholder="ข้อความหมายเหตุ…"
            style={{ ...inputStyle, minHeight: 44, resize: 'vertical', background: '#fffdf3', borderColor: '#ecdfa8' }}
          />
          <button onClick={() => setDraft((d) => ({ ...d, notes: d.notes.filter((x) => x.id !== n.id) }))} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16 }}>
            ×
          </button>
        </div>
      ))}

      {draft.tables.map((t) => (
        <TableEditor key={t.id} table={t} onChange={(nt) => setDraft((d) => ({ ...d, tables: d.tables.map((x) => (x.id === t.id ? nt : x)) }))} onRemove={() => setDraft((d) => ({ ...d, tables: d.tables.filter((x) => x.id !== t.id) }))} />
      ))}

      {/* tags */}
      <div>
        <label style={labelStyle}>แท็ก</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {draft.tags.map((t) => (
            <span key={t} className={styles.tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              #{t}
              <button onClick={() => setDraft((d) => ({ ...d, tags: d.tags.filter((x) => x !== t) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 12 }}>
                ×
              </button>
            </span>
          ))}
        </div>
        <input
          style={inputStyle}
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && tagInput.trim()) {
              e.preventDefault();
              if (!draft.tags.includes(tagInput.trim())) setDraft((d) => ({ ...d, tags: [...d.tags, tagInput.trim()] }));
              setTagInput('');
            }
          }}
          placeholder="พิมพ์แท็กแล้วกด Enter"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={labelStyle}>ผู้เขียน</label>
          <input style={inputStyle} value={draft.authorName} onChange={(e) => setDraft({ ...draft, authorName: e.target.value })} placeholder="ชื่อผู้เขียน" />
        </div>
        <div>
          <label style={labelStyle}>หมายเหตุท้ายบทความ</label>
          <input style={inputStyle} value={draft.footnote} onChange={(e) => setDraft({ ...draft, footnote: e.target.value })} />
        </div>
      </div>

      {/* icons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <IconField label="ไอคอนหัวข้อใหญ่ (Latest Updates)" url={draft.iconLarge} uploading={uploadingIcon === 'large'} onPick={(f) => setIcon('large', f)} onClear={() => setDraft({ ...draft, iconLarge: null })} />
        <IconField label="ไอคอนหัวข้อเล็ก (What's New)" url={draft.iconSmall} uploading={uploadingIcon === 'small'} onPick={(f) => setIcon('small', f)} onClear={() => setDraft({ ...draft, iconSmall: null })} />
      </div>
    </div>
  );
}

function IconField({ label, url, uploading, onPick, onClear }: { label: string; url: string | null; uploading: boolean; onPick: (f: File) => void; onClear: () => void }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {url && <img src={url} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)' }} />}
        <label style={{ ...inputStyle, width: 'auto', cursor: 'pointer', padding: '7px 12px', fontSize: 12 }}>
          {uploading ? 'กำลังอัปโหลด…' : url ? 'เปลี่ยน' : 'อัปโหลด'}
          <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} />
        </label>
        {url && (
          <button onClick={onClear} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 12 }}>
            ลบ
          </button>
        )}
      </div>
    </div>
  );
}

function TableEditor({ table, onChange, onRemove }: { table: ArticleTable; onChange: (t: ArticleTable) => void; onRemove: () => void }) {
  function setHead(i: number, v: string) {
    onChange({ ...table, headCells: table.headCells.map((h, idx) => (idx === i ? v : h)) });
  }
  function setCell(ri: number, ci: number, v: string) {
    onChange({ ...table, rows: table.rows.map((r, idx) => (idx === ri ? r.map((c, cidx) => (cidx === ci ? v : c)) : r)) });
  }
  function addRow() {
    onChange({ ...table, rows: [...table.rows, table.headCells.map(() => '')] });
  }
  function addCol() {
    onChange({ ...table, headCells: [...table.headCells, `หัวข้อ ${table.headCells.length + 1}`], rows: table.rows.map((r) => [...r, '']) });
  }
  return (
    <div style={{ border: '1px solid var(--border-faint)', borderRadius: 10, padding: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>ตาราง</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={addCol} style={miniAction}>+ คอลัมน์</button>
          <button onClick={addRow} style={miniAction}>+ แถว</button>
          <button onClick={onRemove} style={{ ...miniAction, color: 'var(--danger)' }}>ลบตาราง</button>
        </div>
      </div>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
        <thead>
          <tr>
            {table.headCells.map((h, i) => (
              <th key={i} style={{ border: '1px solid var(--border)', padding: 2 }}>
                <input value={h} onChange={(e) => setHead(i, e.target.value)} style={{ border: 'none', width: '100%', padding: 5, fontWeight: 600, background: 'var(--surface-sunken)', outline: 'none' }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => (
                <td key={ci} style={{ border: '1px solid var(--border)', padding: 2 }}>
                  <input value={c} onChange={(e) => setCell(ri, ci, e.target.value)} style={{ border: 'none', width: '100%', padding: 5, outline: 'none' }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const miniAction: React.CSSProperties = { background: 'var(--surface-sunken)', border: '1px solid var(--border-faint)', borderRadius: 6, fontSize: 11, padding: '4px 8px', cursor: 'pointer', color: 'var(--text-muted)' };

// Markdown toolbar that wraps/prefixes the current selection in the body textarea.
function MarkdownToolbar({
  textareaRef,
  value,
  onChange,
  onAddNote,
  onAddTable,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (v: string) => void;
  onAddNote: () => void;
  onAddTable: () => void;
}) {
  function apply(kind: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = value.slice(start, end) || 'ข้อความ';
    const wrap = (a: string, b = a) => value.slice(0, start) + a + sel + b + value.slice(end);
    const prefixLine = (pre: string) => {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      return value.slice(0, lineStart) + pre + value.slice(lineStart);
    };
    let next = value;
    if (kind === 'b') next = wrap('**');
    else if (kind === 'i') next = wrap('*');
    else if (kind === 's') next = wrap('~~');
    else if (kind === 'h1') next = prefixLine('# ');
    else if (kind === 'h2') next = prefixLine('## ');
    else if (kind === 'quote') next = prefixLine('> ');
    else if (kind === 'ul') next = prefixLine('- ');
    else if (kind === 'ol') next = prefixLine('1. ');
    else if (kind === 'hr') next = value.slice(0, start) + '\n\n---\n\n' + value.slice(end);
    else if (kind === 'link') next = value.slice(0, start) + `[${sel}](https://)` + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => ta.focus());
  }
  const btn: React.CSSProperties = { minWidth: 30, height: 30, padding: '0 8px', border: '1px solid var(--border-soft)', background: '#fff', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: 'var(--text-muted)' };
  const tools: [string, React.ReactNode][] = [
    ['b', <b>B</b>],
    ['i', <i>I</i>],
    ['s', <s>S</s>],
    ['h1', 'H1'],
    ['h2', 'H2'],
    ['quote', '“'],
    ['ul', '•'],
    ['ol', '1.'],
    ['hr', '—'],
    ['link', '🔗'],
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', border: '1px solid var(--border-soft)', borderRadius: '9px 9px 0 0', padding: 8, background: 'var(--surface-alt)' }}>
      {tools.map(([k, label]) => (
        <button key={k} type="button" onClick={() => apply(k)} style={btn}>
          {label}
        </button>
      ))}
      <span style={{ flex: 1 }} />
      <button type="button" onClick={onAddNote} style={{ ...btn, minWidth: 'auto', color: '#b4844a', borderColor: '#e6cfa6', background: '#fdf6e8' }}>📌 แปะป้าย</button>
      <button type="button" onClick={onAddTable} style={{ ...btn, minWidth: 'auto' }}>▦ เพิ่มตาราง</button>
    </div>
  );
}
