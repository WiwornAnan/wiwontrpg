import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import {
  CATALOG_CATEGORY_LABELS,
  DOC_CATEGORY_LABELS,
  type Bookmark,
  type CatalogCategory,
  type DocCategory,
} from '@wiwonanant/shared';

export const bookmarksRouter = Router();

bookmarksRouter.get('/', requireAuth, async (req, res) => {
  const rows = await prisma.bookmark.findMany({
    where: { userId: req.currentUser!.id },
    orderBy: { createdAt: 'desc' },
    include: { article: true, catalogItem: true },
  });
  const bookmarks: Bookmark[] = rows
    .map((b): Bookmark | null => {
      if (b.article) {
        return {
          id: b.id,
          articleId: b.articleId,
          catalogItemId: null,
          category: DOC_CATEGORY_LABELS[b.article.category as DocCategory] ?? b.article.category,
          title: b.article.title,
          href: `/${b.article.category}/${b.article.id}`,
          createdAt: b.createdAt.toISOString(),
        };
      }
      if (b.catalogItem) {
        return {
          id: b.id,
          articleId: null,
          catalogItemId: b.catalogItemId,
          category: CATALOG_CATEGORY_LABELS[b.catalogItem.category as CatalogCategory] ?? b.catalogItem.category,
          title: b.catalogItem.name,
          href: `/${b.catalogItem.category}?item=${b.catalogItem.id}`,
          createdAt: b.createdAt.toISOString(),
        };
      }
      return null;
    })
    .filter((x): x is Bookmark => x !== null);
  res.json({ bookmarks });
});

const addSchema = z
  .object({
    articleId: z.string().optional(),
    catalogItemId: z.string().optional(),
  })
  .refine((d) => !!d.articleId !== !!d.catalogItemId, 'ต้องระบุ articleId หรือ catalogItemId อย่างใดอย่างหนึ่ง');

bookmarksRouter.post('/', requireAuth, async (req, res) => {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const { articleId, catalogItemId } = parsed.data;
  // Idempotent — avoid duplicate bookmarks.
  const existing = await prisma.bookmark.findFirst({
    where: { userId: req.currentUser!.id, articleId: articleId ?? null, catalogItemId: catalogItemId ?? null },
  });
  const row =
    existing ??
    (await prisma.bookmark.create({
      data: { userId: req.currentUser!.id, articleId: articleId ?? null, catalogItemId: catalogItemId ?? null },
    }));
  res.status(201).json({ id: row.id });
});

bookmarksRouter.delete('/:id', requireAuth, async (req, res) => {
  await prisma.bookmark.deleteMany({ where: { id: req.params.id, userId: req.currentUser!.id } });
  res.json({ ok: true });
});

// Remove by target (used by star-toggle when we only know the article/catalog id).
bookmarksRouter.delete('/', requireAuth, async (req, res) => {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  await prisma.bookmark.deleteMany({
    where: {
      userId: req.currentUser!.id,
      articleId: parsed.data.articleId ?? null,
      catalogItemId: parsed.data.catalogItemId ?? null,
    },
  });
  res.json({ ok: true });
});
