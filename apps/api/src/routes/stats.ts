import { Router } from 'express';
import { prisma } from '../db.js';
import { CATALOG_CATEGORIES, DOC_CATEGORIES } from '@wiwonanant/shared';

export const statsRouter = Router();

// Per-category live counts for Home "Trending Categories" (published docs + catalog items).
statsRouter.get('/categories', async (_req, res) => {
  const counts: Record<string, number> = {};
  await Promise.all([
    ...DOC_CATEGORIES.map(async (c) => {
      counts[c] = await prisma.article.count({ where: { category: c, status: 'published' } });
    }),
    ...CATALOG_CATEGORIES.map(async (c) => {
      counts[c] = await prisma.catalogItem.count({ where: { category: c } });
    }),
  ]);
  res.json({ counts });
});
