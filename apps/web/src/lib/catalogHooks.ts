import { useQuery } from '@tanstack/react-query';
import type { CatalogCategory, CatalogItem } from '@wiwonanant/shared';
import { api } from './api';

export interface CatalogListResult {
  items: CatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  popularTags: string[];
  stats: { total: number; official: number; homebrew: number };
  statBoxes: { label: string; value: number | string }[];
}

export interface CatalogQuery {
  scope: string;
  isFeature: boolean;
  q: string;
  page: number;
  filters: Record<string, string>;
  ranges: Record<string, { min?: string; max?: string }>;
  sortKey: string;
  sortDir: 'asc' | 'desc';
}

export function buildCatalogParams(query: CatalogQuery): string {
  const p = new URLSearchParams();
  p.set('scope', query.scope);
  p.set('isFeature', String(query.isFeature));
  p.set('page', String(query.page));
  if (query.q) p.set('q', query.q);
  if (query.sortKey) {
    p.set('sort', query.sortKey);
    p.set('dir', query.sortDir);
  }
  for (const [k, v] of Object.entries(query.filters)) if (v) p.set(k, v);
  for (const [k, r] of Object.entries(query.ranges)) {
    if (r.min) p.set(`${k}_min`, r.min);
    if (r.max) p.set(`${k}_max`, r.max);
  }
  return p.toString();
}

export function useCatalog(category: CatalogCategory, query: CatalogQuery) {
  const qs = buildCatalogParams(query);
  return useQuery({
    queryKey: ['catalog', category, qs],
    queryFn: () => api.get<CatalogListResult>(`/catalog/${category}?${qs}`),
  });
}

export function useCatalogTags(scope: string) {
  return useQuery({
    queryKey: ['catalog-tags', scope],
    queryFn: () => api.get<{ custom: string[]; hidden: string[] }>(`/tags/${scope}`),
  });
}

export type FieldTagMap = Record<string, { custom: string[]; hidden: string[] }>;

// All dev-managed custom/hidden tags for every field of a catalog scope, at once.
export function useCatalogFieldTags(catScope: string) {
  return useQuery({
    queryKey: ['catalog-fieldtags', catScope],
    queryFn: () => api.get<FieldTagMap>(`/tags/bulk/${catScope}`),
  });
}
