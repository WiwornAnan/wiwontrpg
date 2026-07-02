import { useQuery } from '@tanstack/react-query';
import type { Article, Bookmark, Comment } from '@wiwonanant/shared';
import { api } from './api';
import { useAuth } from '../auth/AuthContext';

export function useArticles(category: string, coverId?: string) {
  return useQuery({
    queryKey: ['articles', category, coverId ?? null],
    queryFn: () =>
      api.get<{ articles: Article[] }>(
        `/articles?category=${category}${coverId ? `&coverId=${coverId}` : ''}`,
      ),
  });
}

export function useArticle(id: string | undefined) {
  return useQuery({
    queryKey: ['article', id],
    queryFn: () => api.get<{ article: Article }>(`/articles/${id}`),
    enabled: !!id,
  });
}

export function useComments() {
  return useQuery({
    queryKey: ['comments'],
    queryFn: () => api.get<{ comments: Comment[] }>('/comments'),
  });
}

export function useBookmarks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['bookmarks'],
    queryFn: () => api.get<{ bookmarks: Bookmark[] }>('/bookmarks'),
    enabled: !!user,
  });
}

export function useLatest() {
  return useQuery({
    queryKey: ['articles', 'latest'],
    queryFn: () => api.get<{ articles: Article[] }>('/articles/latest'),
  });
}
