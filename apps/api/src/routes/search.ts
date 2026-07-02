import { Router } from 'express';
import { prisma } from '../db.js';
import {
  CATALOG_CATEGORY_LABELS,
  DOC_CATEGORY_LABELS,
  type CatalogCategory,
  type DocCategory,
  type SearchHit,
} from '@wiwonanant/shared';

export const searchRouter = Router();

// Unions Articles + CatalogItems by title/name/tags. Public sees published articles only.
searchRouter.get('/', async (req, res) => {
  const q = (typeof req.query.q === 'string' ? req.query.q : '').trim();
  if (!q) {
    res.json({ hits: [] });
    return;
  }
  const isDev = req.currentUser?.role === 'dev';

  const [articles, items] = await Promise.all([
    prisma.article.findMany({
      where: {
        ...(isDev ? {} : { status: 'published' }),
        OR: [{ title: { contains: q } }, { tags: { contains: q } }, { summary: { contains: q } }],
      },
      take: 8,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.catalogItem.findMany({
      where: { OR: [{ name: { contains: q } }, { tags: { contains: q } }] },
      take: 8,
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  const hits: SearchHit[] = [
    ...articles.map(
      (a): SearchHit => ({
        kind: 'article',
        id: a.id,
        title: a.title,
        categoryLabel: DOC_CATEGORY_LABELS[a.category as DocCategory] ?? a.category,
        href: `/${a.category}/${a.id}`,
      }),
    ),
    ...items.map(
      (i): SearchHit => ({
        kind: 'catalog',
        id: i.id,
        title: i.name,
        categoryLabel: CATALOG_CATEGORY_LABELS[i.category as CatalogCategory] ?? i.category,
        href: `/${i.category}?item=${i.id}`,
      }),
    ),
  ].slice(0, 12);

  res.json({ hits });
});
