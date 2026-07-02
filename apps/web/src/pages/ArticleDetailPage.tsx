import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { DocCategory } from '@wiwonanant/shared';
import { useArticle } from '../lib/hooks';
import { useAuth } from '../auth/AuthContext';
import { ArticleBody } from '../components/ArticleBody';
import { StarButton } from '../components/StarButton';
import { Button } from '../components/ui';
import styles from '../components/layout.module.css';

export function ArticleDetailPage({ category }: { category: DocCategory }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isDev } = useAuth();
  const { data, isLoading, error } = useArticle(id);
  const article = data?.article;

  // Table of contents: fixed sections + one entry per sticky note / table.
  const toc = useMemo(() => {
    if (!article) return [];
    const items: { id: string; label: string }[] = [{ id: 'sec-overview', label: 'ภาพรวม' }];
    if (article.bodyText.trim()) items.push({ id: 'sec-detail', label: 'รายละเอียด' });
    if (article.notes.length) items.push({ id: 'sec-notes', label: 'หมายเหตุ' });
    if (article.footnote) items.push({ id: 'sec-foot', label: 'เชิงอรรถ' });
    return items;
  }, [article]);

  if (isLoading) return <div className={styles.page}>กำลังโหลด…</div>;
  if (error || !article)
    return (
      <div className={styles.page}>
        <div className={styles.card} style={{ textAlign: 'center', padding: 48 }}>
          ไม่พบบทความ
          <div style={{ marginTop: 16 }}>
            <Button variant="ghost" onClick={() => navigate(`/${category}`)}>
              ← กลับ
            </Button>
          </div>
        </div>
      </div>
    );

  function scrollTo(secId: string) {
    document.getElementById(secId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className={styles.page}>
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 32, alignItems: 'start' }}>
        {/* TOC */}
        <div style={{ position: 'sticky', top: 96 }}>
          <Button variant="ghost" onClick={() => navigate(`/${category}`)} style={{ marginBottom: 18 }}>
            ← กลับ
          </Button>
          <div style={{ fontSize: 11, letterSpacing: '.12em', color: 'var(--text-ghost)', fontWeight: 700, marginBottom: 10 }}>
            ON THIS PAGE
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {toc.map((t) => (
              <button
                key={t.id}
                onClick={() => scrollTo(t.id)}
                style={{ textAlign: 'left', background: 'none', border: 'none', borderLeft: '2px solid var(--border)', padding: '5px 0 5px 12px', color: 'var(--text-dim)', fontSize: 13, cursor: 'pointer' }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Article */}
        <article style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '38px 44px', maxWidth: 820 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, letterSpacing: '.1em', color: 'var(--text-ghost)', fontWeight: 700 }}>
              {article.partSection}
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {article.status === 'draft' && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#b4844a', border: '1px solid #e6cfa6', background: '#fdf6e8', borderRadius: 5, padding: '2px 8px' }}>
                  ร่าง
                </span>
              )}
              <StarButton articleId={article.id} size={17} />
              {isDev && (
                <Button style={{ padding: '5px 11px', fontSize: 11.5 }} onClick={() => navigate(`/editor?id=${article.id}`)}>
                  ✎ แก้ไข
                </Button>
              )}
            </div>
          </div>

          <h1 id="sec-overview" style={{ margin: '0 0 14px', fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 34, lineHeight: 1.15 }}>
            {article.title}
          </h1>

          {article.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
              {article.tags.map((t) => (
                <span key={t} className={styles.tag}>
                  #{t}
                </span>
              ))}
            </div>
          )}

          {article.summary && (
            <p style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--ink-soft)', fontWeight: 500, margin: '0 0 22px', paddingBottom: 22, borderBottom: '1px solid var(--border-faint)' }}>
              {article.summary}
            </p>
          )}

          <div id="sec-detail">
            <ArticleBody article={article} />
          </div>

          {article.notes.length > 0 && <div id="sec-notes" />}
          {article.footnote && (
            <div id="sec-foot" style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--border-faint)', fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.7 }}>
              {article.footnote}
            </div>
          )}

          {article.authorName && (
            <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-faint)', marginTop: 28 }}>
              เขียนโดย <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{article.authorName}</span>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
