import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { NAV_ITEMS, type Bookmark } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { useBookmarks, useComments, useLatest } from '../lib/hooks';
import { api } from '../lib/api';
import { Button } from '../components/ui';
import styles from '../components/layout.module.css';

export function HomePage() {
  const navigate = useNavigate();
  const { data: latest } = useLatest();
  const { user } = useAuth();
  const { data: bookmarks } = useBookmarks();

  const latestArticles = latest?.articles ?? [];
  const suggested = latestArticles.slice(0, 4);

  // bookmarks grouped by category label
  const bmGroups = useMemo(() => {
    const map = new Map<string, Bookmark[]>();
    (bookmarks?.bookmarks ?? []).forEach((b) => {
      const arr = map.get(b.category) ?? [];
      arr.push(b);
      map.set(b.category, arr);
    });
    return [...map.entries()];
  }, [bookmarks]);

  return (
    <div className={styles.page}>
      {/* HERO A — full black banner */}
      <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--ink)', borderRadius: 18, padding: '54px 56px', minHeight: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', right: -60, top: -60, width: 420, height: 420, background: 'radial-gradient(circle at 30% 30%,rgba(224,122,95,.55),transparent 62%)', filter: 'blur(10px)' }} />
        <span style={{ color: '#9a978e', fontSize: 13, letterSpacing: '.02em', marginBottom: 14, position: 'relative' }}>
          Welcome to Wiwon&#8202;Anant
        </span>
        <h1 style={{ margin: 0, color: '#fff', fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 42, lineHeight: 1.12, letterSpacing: '-.01em', maxWidth: 760, position: 'relative' }}>
          Welcome, visitors, to the ‘Wiwon Library,’ a repository of infinite volumes of ‘Golden Revelations.’
        </h1>
        <p style={{ color: '#b6b3aa', fontSize: 15, lineHeight: 1.65, maxWidth: 480, margin: '20px 0 0', position: 'relative' }}>
          A comprehensive database of ever-changing raw data for ‘Wiwon&#8202;Anant’ — a TRPG crafted from the passion to give fantasy universes a more logical framework.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 26, position: 'relative' }}>
          <Button variant="coral" onClick={() => navigate('/core-rules')}>
            เริ่มสำรวจ Core Rules
          </Button>
          <Button variant="ghost" onClick={() => navigate('/wiwon')}>
            เข้าสู่ Wiwon
          </Button>
        </div>
      </div>

      {/* suggested + trending */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 22, marginTop: 24 }}>
        <div className={styles.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 9, fontSize: 17, fontWeight: 600 }}>
              <span style={{ width: 9, height: 9, background: 'var(--coral)', borderRadius: '50%' }} />
              Suggested for you
            </h2>
            <Link to="/core-rules" style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
              ดูทั้งหมด →
            </Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
            {suggested.length === 0 && <div style={{ color: 'var(--text-ghost)', fontSize: 13 }}>ยังไม่มีบทความ</div>}
            {suggested.map((a) => (
              <div
                key={a.id}
                onClick={() => navigate(`/${a.category}/${a.id}`)}
                style={{ cursor: 'pointer', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-faint)' }}
              >
                <div style={{ height: 104, background: '#f4d9d1', display: 'flex', alignItems: 'flex-end', padding: 8 }}>
                  <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 9.5, color: '#bb8276' }}>{a.partSection.split(':')[0]}</span>
                </div>
                <div style={{ padding: '11px 12px 13px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{a.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 3 }}>บทความ</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.card} style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 600 }}>Trending Categories</h2>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {NAV_ITEMS.filter((n) => n.id !== 'home' && n.id !== 'pray').map((n) => (
              <Link
                key={n.id}
                to={n.href}
                style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 8px', borderBottom: '1px solid var(--divider)' }}
              >
                <span style={{ width: 26, height: 26, borderRadius: 7, background: '#efece6', flex: 'none' }} />
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{n.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* bookmarks */}
      {user && bmGroups.length > 0 && (
        <div className={styles.card} style={{ marginTop: 22 }}>
          <h2 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 9, fontSize: 17, fontWeight: 600 }}>
            <span style={{ color: 'var(--gold-star)', fontSize: 18 }}>★</span>
            Wiwon ที่คุณสนใจ <span style={{ fontSize: 12.5, color: 'var(--text-ghost)', fontWeight: 500 }}>/ Bookmarks</span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {bmGroups.map(([label, items]) => (
              <div key={label}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold-star)', flex: 'none' }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-ghost)' }}>{items.length} รายการ</span>
                  <span style={{ flex: 1, height: 1, background: 'var(--divider)' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  {items.map((b) => (
                    <div
                      key={b.id}
                      onClick={() => navigate(b.href)}
                      style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px', border: '1px solid var(--border-faint)', borderRadius: 11, cursor: 'pointer' }}
                    >
                      <span style={{ width: 30, height: 30, borderRadius: 8, background: '#f4d9d1', flex: 'none' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{b.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{b.category}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* latest updates */}
      <div style={{ marginTop: 22 }}>
        <div className={styles.card}>
          <h2 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 600 }}>Latest Updates</h2>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {latestArticles.length === 0 && <div style={{ color: 'var(--text-ghost)', fontSize: 13 }}>ยังไม่มีการอัปเดต</div>}
            {latestArticles.map((a) => (
              <button
                key={a.id}
                onClick={() => navigate(`/${a.category}/${a.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 8px', background: 'none', border: 'none', borderBottom: '1px solid var(--divider)', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              >
                <span style={{ width: 38, height: 38, borderRadius: 8, background: '#efece6', flex: 'none' }} />
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{a.title}</span>
                <span style={{ fontSize: 11, padding: '3px 10px', border: '1px solid var(--border)', borderRadius: 20, color: 'var(--text-dim)' }}>
                  {a.partSection.split(':')[0]}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-faint)', width: 90, textAlign: 'right' }}>
                  {new Date(a.updatedAt).toLocaleDateString('th-TH')}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <CommentsBoard />
    </div>
  );
}

function CommentsBoard() {
  const { user, isDev } = useAuth();
  const qc = useQueryClient();
  const { data } = useComments();
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const comments = data?.comments ?? [];

  const post = useMutation({
    mutationFn: () => api.post('/comments', { body: draft }),
    onSuccess: () => {
      setDraft('');
      qc.invalidateQueries({ queryKey: ['comments'] });
    },
  });
  const saveEdit = useMutation({
    mutationFn: (id: string) => api.patch(`/comments/${id}`, { body: editDraft }),
    onSuccess: () => {
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ['comments'] });
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/comments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments'] }),
  });

  return (
    <div className={styles.card} style={{ marginTop: 22 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600 }}>ความคิดเห็นจากผู้ใช้</h2>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--text-faint)' }}>
        แบ่งปันความคิดเห็นถึงทีมพัฒนาและผู้เล่นคนอื่น ๆ
      </p>

      {user ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 18 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="เขียนความคิดเห็น…"
            style={{ flex: 1, minHeight: 46, maxHeight: 140, border: '1px solid var(--border-soft)', borderRadius: 10, padding: '11px 14px', fontSize: 13.5, outline: 'none', lineHeight: 1.6, resize: 'vertical', fontFamily: 'var(--font-body)' }}
          />
          <Button onClick={() => draft.trim() && post.mutate()} disabled={post.isPending}>
            ส่ง
          </Button>
        </div>
      ) : (
        <div style={{ padding: '14px 16px', background: 'var(--surface-alt)', border: '1px solid var(--border-faint)', borderRadius: 10, fontSize: 12.5, color: 'var(--text-faint)', marginBottom: 18 }}>
          เข้าสู่ระบบก่อนจึงจะแสดงความคิดเห็นได้
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {comments.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-ghost)', fontSize: 12.5 }}>
            ยังไม่มีความคิดเห็น — เป็นคนแรกที่แสดงความคิดเห็น
          </div>
        )}
        {comments.map((c) => (
          <div key={c.id} style={{ border: '1px solid var(--divider)', borderRadius: 12, padding: '13px 15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{c.authorName}</span>
              {c.authorIsDev && (
                <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--purple)', background: 'var(--purple-bg)', borderRadius: 5, padding: '2px 7px' }}>
                  DEV
                </span>
              )}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: 'var(--text-ghost)' }}>{new Date(c.createdAt).toLocaleDateString('th-TH')}</span>
            </div>
            {editingId === c.id ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  style={{ flex: 1, minHeight: 44, border: '1px solid var(--border-soft)', borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none', lineHeight: 1.6, resize: 'vertical', fontFamily: 'var(--font-body)' }}
                />
                <Button style={{ padding: '9px 15px', fontSize: 12.5 }} onClick={() => saveEdit.mutate(c.id)}>
                  บันทึก
                </Button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{c.body}</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center' }}>
                  {user?.id === c.authorUserId && (
                    <button
                      onClick={() => {
                        setEditingId(c.id);
                        setEditDraft(c.body);
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, padding: 0 }}
                    >
                      แก้ไข
                    </button>
                  )}
                  {isDev && (
                    <button
                      onClick={() => del.mutate(c.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, padding: 0 }}
                    >
                      ลบ
                    </button>
                  )}
                  {c.edited && <span style={{ fontSize: 11, color: '#cbc8c0' }}>(แก้ไขแล้ว)</span>}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
