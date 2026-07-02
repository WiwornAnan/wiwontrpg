import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Article, DocCategory } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { useArticles } from '../lib/hooks';
import { api } from '../lib/api';
import { CATEGORY_META } from '../lib/categoryConfig';
import { HeroBanner } from './HeroBanner';
import { StarButton } from './StarButton';
import { Modal } from './Modal';
import { Button, inputStyle, labelStyle } from './ui';
import styles from './layout.module.css';

interface Props {
  category: DocCategory;
  coverId?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  aboveGrid?: ReactNode; // e.g. Wiwon cover carousel
  emptyNote?: string;
  hideHero?: boolean; // Wiwon renders its own cover-driven hero instead
  hideTagSearch?: boolean; // Wiwon has no in-page tag search
  paneTitle?: string; // reading-pane header label
}

interface Group {
  section: string;
  items: Article[];
}

export function CategoryDocLayout({ category, coverId, heroTitle, heroSubtitle, aboveGrid, emptyNote, hideHero, hideTagSearch, paneTitle }: Props) {
  const { isDev } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useArticles(category, coverId);
  const meta = CATEGORY_META[category];

  const [tagQuery, setTagQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addPartOpen, setAddPartOpen] = useState(false);
  const [newPart, setNewPart] = useState('');

  const articles = data?.articles ?? [];

  const filtered = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter(
      (a) => a.tags.some((t) => t.toLowerCase().includes(q)) || a.title.toLowerCase().includes(q),
    );
  }, [articles, tagQuery]);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Article[]>();
    for (const a of filtered) {
      const key = a.partSection || 'Contents';
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return [...map.entries()].map(([section, items]) => ({ section, items }));
  }, [filtered]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    articles.forEach((a) => a.tags.forEach((t) => s.add(t)));
    return [...s];
  }, [articles]);
  const tagSuggestions = tagQuery
    ? allTags.filter((t) => t.toLowerCase().includes(tagQuery.toLowerCase())).slice(0, 6)
    : [];

  const selected = filtered.find((a) => a.id === selectedId) ?? filtered[0] ?? null;

  const reorder = useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: 'up' | 'down' }) =>
      api.patch(`/articles/${id}/order`, { direction }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['articles', category] }),
  });

  const addPart = useMutation({
    mutationFn: (title: string) =>
      api.post('/articles', {
        category,
        wiwonCoverId: coverId ?? null,
        partSection: title,
        title: 'หัวข้อใหม่',
        summary: '',
        status: 'draft',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['articles', category] });
      setAddPartOpen(false);
      setNewPart('');
    },
  });

  return (
    <div className={styles.page}>
      {!hideHero && <HeroBanner category={category} title={heroTitle} subtitle={heroSubtitle} />}

      {aboveGrid}

      {/* tag search (this page only) */}
      {!hideTagSearch && (
      <div style={{ position: 'relative', margin: '18px 0 22px', maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid var(--border-soft)', borderRadius: 11, padding: '0 14px' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a8a59d" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={tagQuery}
            onChange={(e) => setTagQuery(e.target.value)}
            placeholder="ค้นหาแท็กในหน้านี้…"
            style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13.5, padding: '11px 0' }}
          />
          {tagQuery && (
            <button onClick={() => setTagQuery('')} style={{ background: 'none', border: 'none', color: '#a8a59d', cursor: 'pointer', fontSize: 15 }}>
              ×
            </button>
          )}
        </div>
        {tagSuggestions.length > 0 && (
          <div style={{ position: 'absolute', top: 48, left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--border)', borderRadius: 11, boxShadow: '0 12px 30px rgba(0,0,0,.1)', padding: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tagSuggestions.map((t) => (
              <button
                key={t}
                onMouseDown={() => setTagQuery(t)}
                style={{ padding: '5px 11px', background: 'var(--coral-bg)', border: '1px solid #ecd9d2', color: 'var(--coral-ink)', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>
      )}

      <div className={styles.docGrid}>
        <div className={styles.partCol}>
          {isLoading && <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>กำลังโหลด…</div>}
          {!isLoading && groups.length === 0 && (
            <div className={styles.partCard} style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-ghost)', fontSize: 13 }}>
              {emptyNote ?? 'ยังไม่มีเนื้อหาในหมวดนี้'}
            </div>
          )}
          {groups.map((g) => (
            <div key={g.section} className={styles.partCard}>
              <div className={styles.partHead}>
                <span>{g.section}</span>
              </div>
              <div className={styles.partBody}>
                {g.items.map((it, idx) => (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      onClick={() => setSelectedId(it.id)}
                      className={`${styles.docLink} ${selected?.id === it.id ? styles.docLinkActive : ''}`}
                    >
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#cbc8c0', flex: 'none' }} />
                      <span style={{ flex: 1 }}>{it.title}</span>
                      {it.status === 'draft' && <span className={styles.draftBadge}>ร่าง</span>}
                    </button>
                    {isDev && (
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 'none' }}>
                        <button
                          onClick={() => reorder.mutate({ id: it.id, direction: 'up' })}
                          disabled={idx === 0}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb7af', fontSize: 9, lineHeight: 1, padding: '1px 4px' }}
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => reorder.mutate({ id: it.id, direction: 'down' })}
                          disabled={idx === g.items.length - 1}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb7af', fontSize: 9, lineHeight: 1, padding: '1px 4px' }}
                        >
                          ▼
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {isDev && (
            <button className={styles.addPart} onClick={() => setAddPartOpen(true)}>
              + เพิ่ม Part ใหม่
            </button>
          )}
        </div>

        {/* reading pane */}
        {selected ? (
          <div className={styles.pane}>
            <div className={styles.paneHead}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{paneTitle ?? heroTitle ?? meta.name}</span>
              <span style={{ fontSize: 12, color: '#9a978e' }}>Update date: {new Date(selected.updatedAt).toLocaleDateString('th-TH')}</span>
            </div>
            <div style={{ padding: '22px 24px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 11, letterSpacing: '.1em', color: 'var(--text-ghost)', fontWeight: 700 }}>
                  {selected.partSection}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 'none' }}>
                  {selected.status === 'draft' && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#b4844a', border: '1px solid #e6cfa6', background: '#fdf6e8', borderRadius: 5, padding: '2px 8px' }}>
                      ร่าง
                    </span>
                  )}
                  <StarButton articleId={selected.id} />
                  {isDev && (
                    <Button style={{ padding: '5px 11px', fontSize: 11.5 }} onClick={() => navigate(`/editor?id=${selected.id}`)}>
                      ✎ แก้ไข
                    </Button>
                  )}
                </div>
              </div>
              <h3 style={{ margin: '0 0 12px', fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 22, lineHeight: 1.2 }}>
                {selected.title}
              </h3>
              {selected.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {selected.tags.map((t) => (
                    <span key={t} className={styles.tag}>
                      #{t}
                    </span>
                  ))}
                </div>
              )}
              {selected.summary && (
                <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--ink-soft)', fontWeight: 500, margin: '0 0 10px' }}>
                  {selected.summary}
                </p>
              )}
              <p style={{ fontSize: 13.5, lineHeight: 1.75, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', margin: 0, maxHeight: 220, overflow: 'hidden' }}>
                {selected.bodyText}
              </p>
              {selected.authorName && (
                <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-faint)', marginTop: 14 }}>
                  เขียนโดย <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{selected.authorName}</span>
                </div>
              )}
              <button className={styles.readMore} onClick={() => navigate(`/${category}/${selected.id}`)}>
                อ่านบทความเต็ม →
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.pane} style={{ padding: '50px 30px', textAlign: 'center', color: 'var(--text-ghost)', fontSize: 13 }}>
            {tagQuery ? 'ยังไม่มีเนื้อหาที่ตรงกับการค้นหา' : (emptyNote ?? 'ยังไม่มีเนื้อหา')}
          </div>
        )}
      </div>

      <div className={styles.footNote}>
        This information is the exclusive property of the game Infinite Revelation. No copying or claiming ownership of it is permitted.
      </div>

      <Modal
        open={addPartOpen}
        onClose={() => setAddPartOpen(false)}
        title="เพิ่ม Part ใหม่"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddPartOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={() => newPart.trim() && addPart.mutate(newPart.trim())} disabled={addPart.isPending}>
              สร้าง Part
            </Button>
          </>
        }
      >
        <label style={labelStyle}>ชื่อ Part</label>
        <input
          style={inputStyle}
          value={newPart}
          onChange={(e) => setNewPart(e.target.value)}
          placeholder="เช่น Part 3: Character & Attributes"
          autoFocus
        />
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 10 }}>
          จะสร้างหัวข้อเริ่มต้น (สถานะ “ร่าง”) ให้ แล้วไปแก้เนื้อหาต่อใน Content Editor ได้เลย
        </p>
      </Modal>
    </div>
  );
}
