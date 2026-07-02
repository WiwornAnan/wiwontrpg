import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { DocCategory } from '@wiwonanant/shared';
import { useArticle } from '../lib/hooks';
import { useAuth } from '../auth/AuthContext';
import { useBookmarks } from '../lib/hooks';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ArticleBody } from '../components/ArticleBody';
import { CATEGORY_META } from '../lib/categoryConfig';

export function ArticleDetailPage({ category }: { category: DocCategory }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isDev, user } = useAuth();
  const { data, isLoading, error } = useArticle(id);
  const article = data?.article;
  const catName = CATEGORY_META[category].name;

  const toc = useMemo(() => {
    if (!article) return [];
    const items: { id: string; label: string }[] = [{ id: 'sec-overview', label: 'ภาพรวม' }];
    if (article.bodyText.trim() || article.images.length || article.tables.length) items.push({ id: 'sec-detail', label: 'รายละเอียด' });
    if (article.footnote) items.push({ id: 'sec-note', label: 'หมายเหตุ' });
    return items;
  }, [article]);

  const qc = useQueryClient();
  const { data: bm } = useBookmarks();
  const marked = (bm?.bookmarks ?? []).some((b) => b.articleId === article?.id);
  const toggleStar = useMutation({
    mutationFn: () => (marked ? api.delete('/bookmarks', { articleId: article!.id }) : api.post('/bookmarks', { articleId: article!.id })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookmarks'] }),
  });

  if (isLoading) return <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px' }}>กำลังโหลด…</div>;
  if (error || !article)
    return (
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px' }}>
        <div style={{ background: '#fff', border: '1px solid #e4e2dc', borderRadius: 16, textAlign: 'center', padding: 48 }}>
          ไม่พบบทความ
          <div style={{ marginTop: 16 }}>
            <button onClick={() => navigate(`/${category}`)} style={{ padding: '9px 16px', border: '1px solid #e0ded7', borderRadius: 9, background: '#fff', cursor: 'pointer' }}>← กลับ</button>
          </div>
        </div>
      </div>
    );

  const scrollTo = (secId: string) => document.getElementById(secId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <section style={{ animation: 'fadeIn .4s ease', display: 'grid', gridTemplateColumns: '1fr 260px', gap: 34, alignItems: 'start', maxWidth: 1040, margin: '0 auto', padding: '32px 40px 80px' }}>
      <article style={{ minWidth: 0 }}>
        <button onClick={() => navigate(`/${category}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#8d8a82', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 18 }}>
          ← {catName}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 11.5, letterSpacing: '.1em', color: '#e07a5f', fontWeight: 600 }}>{catName}</span>
          <span style={{ color: '#d4d2cc' }}>·</span>
          <span style={{ fontSize: 12.5, color: '#9a978e' }}>Update {new Date(article.updatedAt).toLocaleDateString('th-TH')}</span>
          {isDev && (
            <button onClick={() => navigate(`/editor?id=${article.id}`)} style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', background: '#15140f', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
              ✎ แก้ไขบทความ
            </button>
          )}
        </div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 38, lineHeight: 1.12, letterSpacing: '-.015em' }}>{article.title}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
          <button
            onClick={() => (user ? toggleStar.mutate() : navigate('/login'))}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, border: `1px solid ${marked ? '#e6c98a' : '#e0ded7'}`, background: marked ? '#fffdf3' : '#fff', color: marked ? '#a8760f' : '#6b6860', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
          >
            <span style={{ fontSize: 14, color: marked ? '#e0b94a' : '#c9c6be' }}>★</span>
            {marked ? 'บันทึกแล้ว' : 'บันทึกอ่านภายหลัง'}
          </button>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {article.tags.map((t) => (
              <span key={t} style={{ fontSize: 11.5, padding: '4px 11px', background: '#edeae4', borderRadius: 20, color: '#5f5c54' }}>#{t}</span>
            ))}
          </div>
        </div>

        {article.summary && (
          <p id="sec-overview" style={{ fontSize: 16, lineHeight: 1.7, color: '#2c2a23', fontWeight: 500, marginTop: 22 }}>{article.summary}</p>
        )}

        <div id="sec-detail" style={{ marginTop: 18 }}>
          <ArticleBody article={article} />
        </div>

        {article.footnote && (
          <div id="sec-note" style={{ marginTop: 24, padding: '16px 18px', background: '#faf9f7', border: '1px solid #ece9e3', borderRadius: 12 }}>
            <div style={{ fontSize: 11, letterSpacing: '.08em', color: '#a8a59d', fontWeight: 700, marginBottom: 7 }}>หมายเหตุ</div>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: '#5f5c54', margin: 0, whiteSpace: 'pre-wrap' }}>{article.footnote}</p>
          </div>
        )}

        {article.authorName && (
          <div style={{ marginTop: 30, paddingTop: 16, borderTop: '1px solid #f0eee9', textAlign: 'right' }}>
            <span style={{ fontSize: 12.5, color: '#8d8a82' }}>เขียนโดย <span style={{ color: '#46443c', fontWeight: 600 }}>{article.authorName}</span></span>
          </div>
        )}
      </article>

      <aside style={{ position: 'sticky', top: 96 }}>
        <div style={{ fontSize: 11, letterSpacing: '.1em', color: '#a8a59d', fontWeight: 600, marginBottom: 12 }}>ON THIS PAGE</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, borderLeft: '1px solid #e4e2dc' }}>
          {toc.map((t) => (
            <button key={t.id} onClick={() => scrollTo(t.id)} style={{ textAlign: 'left', background: 'none', border: 'none', borderLeft: '2px solid transparent', marginLeft: -1, padding: '6px 0 6px 14px', fontSize: 13, color: '#6b6860', cursor: 'pointer' }}>
              {t.label}
            </button>
          ))}
        </div>
      </aside>
    </section>
  );
}
