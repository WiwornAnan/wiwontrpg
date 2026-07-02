import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useBookmarks } from '../lib/hooks';
import { api } from '../lib/api';

interface Props {
  articleId?: string;
  catalogItemId?: string;
  size?: number;
}

// Toggles a bookmark ("★") for an article or catalog item. Redirects to login if signed out.
export function StarButton({ articleId, catalogItemId, size = 15 }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useBookmarks();

  const marked = (data?.bookmarks ?? []).some(
    (b) => (articleId && b.articleId === articleId) || (catalogItemId && b.catalogItemId === catalogItemId),
  );

  const toggle = useMutation({
    mutationFn: async () => {
      const target = articleId ? { articleId } : { catalogItemId };
      if (marked) await api.delete('/bookmarks', target);
      else await api.post('/bookmarks', target);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookmarks'] }),
  });

  return (
    <button
      title={marked ? 'เอาออกจากรายการที่สนใจ' : 'บันทึกอ่านภายหลัง'}
      onClick={() => {
        if (!user) return navigate('/login');
        toggle.mutate();
      }}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: marked ? 'var(--gold-star)' : '#c9c6be',
        fontSize: size,
        lineHeight: 1,
        padding: 2,
      }}
    >
      ★
    </button>
  );
}
