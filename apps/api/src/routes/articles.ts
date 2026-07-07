import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireDev } from '../middleware/auth.js';
import { toArticle } from '../serialize.js';
import { SUMMARY_MAX_LENGTH, DOC_CATEGORIES } from '@wiwonanant/shared';

export const articlesRouter = Router();

const imageSchema = z.object({
  id: z.string(),
  url: z.string(),
  layout: z.enum(['full', 'left', 'right']).default('full'),
  afterParagraph: z.number().int().min(0).default(0),
  order: z.number().int().default(0),
});
const noteSchema = z.object({
  id: z.string(),
  text: z.string(),
  afterParagraph: z.number().int().min(0).optional(),
});
const tableSchema = z.object({
  id: z.string(),
  headCells: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  afterParagraph: z.number().int().min(0).optional(),
});

const articleInput = z.object({
  category: z.enum(DOC_CATEGORIES),
  wiwonCoverId: z.string().nullable().optional(),
  partSection: z.string().min(1).default('Contents'),
  title: z.string().min(1, 'กรุณากรอกชื่อบทความ'),
  summary: z.string().max(SUMMARY_MAX_LENGTH).default(''),
  bodyText: z.string().default(''),
  notes: z.array(noteSchema).default([]),
  tables: z.array(tableSchema).default([]),
  images: z.array(imageSchema).default([]),
  footnote: z.string().nullable().optional(),
  authorName: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  iconLarge: z.string().nullable().optional(),
  iconSmall: z.string().nullable().optional(),
  status: z.enum(['draft', 'published']).default('draft'),
});

// GET /?category=&status=  — public sees published only; dev sees all.
articlesRouter.get('/', async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const coverId = typeof req.query.coverId === 'string' ? req.query.coverId : undefined;
  const isDev = req.currentUser?.role === 'dev';

  const where: Record<string, unknown> = {};
  if (category) where.category = category;
  if (coverId) where.wiwonCoverId = coverId;
  if (!isDev) where.status = 'published';

  const rows = await prisma.article.findMany({
    where,
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ articles: rows.map(toArticle) });
});

// Latest published updates (for Home). Must come before '/:id'.
articlesRouter.get('/latest', async (_req, res) => {
  const rows = await prisma.article.findMany({
    where: { status: 'published' },
    orderBy: { updatedAt: 'desc' },
    take: 8,
  });
  res.json({ articles: rows.map(toArticle) });
});

articlesRouter.get('/:id', async (req, res) => {
  const row = await prisma.article.findUnique({ where: { id: req.params.id } });
  if (!row) {
    res.status(404).json({ error: 'ไม่พบบทความ' });
    return;
  }
  if (row.status !== 'published' && req.currentUser?.role !== 'dev') {
    res.status(404).json({ error: 'ไม่พบบทความ' });
    return;
  }
  res.json({ article: toArticle(row) });
});

articlesRouter.post('/', requireDev, async (req, res) => {
  const parsed = articleInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const d = parsed.data;
  // Place new docs at the end of their part group.
  const last = await prisma.article.findFirst({
    where: { category: d.category, partSection: d.partSection },
    orderBy: { orderIndex: 'desc' },
  });
  const row = await prisma.article.create({
    data: {
      category: d.category,
      wiwonCoverId: d.wiwonCoverId ?? null,
      partSection: d.partSection,
      orderIndex: (last?.orderIndex ?? -1) + 1,
      title: d.title,
      summary: d.summary,
      bodyText: d.bodyText,
      notes: JSON.stringify(d.notes),
      tables: JSON.stringify(d.tables),
      images: JSON.stringify(d.images),
      footnote: d.footnote ?? null,
      authorName: d.authorName ?? null,
      tags: JSON.stringify(d.tags),
      iconLarge: d.iconLarge ?? null,
      iconSmall: d.iconSmall ?? null,
      status: d.status,
    },
  });
  res.status(201).json({ article: toArticle(row) });
});

articlesRouter.patch('/:id', requireDev, async (req, res) => {
  const existing = await prisma.article.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: 'ไม่พบบทความ' });
    return;
  }
  const parsed = articleInput.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const d = parsed.data;
  const row = await prisma.article.update({
    where: { id: req.params.id },
    data: {
      ...(d.category !== undefined ? { category: d.category } : {}),
      ...(d.wiwonCoverId !== undefined ? { wiwonCoverId: d.wiwonCoverId } : {}),
      ...(d.partSection !== undefined ? { partSection: d.partSection } : {}),
      ...(d.title !== undefined ? { title: d.title } : {}),
      ...(d.summary !== undefined ? { summary: d.summary } : {}),
      ...(d.bodyText !== undefined ? { bodyText: d.bodyText } : {}),
      ...(d.notes !== undefined ? { notes: JSON.stringify(d.notes) } : {}),
      ...(d.tables !== undefined ? { tables: JSON.stringify(d.tables) } : {}),
      ...(d.images !== undefined ? { images: JSON.stringify(d.images) } : {}),
      ...(d.footnote !== undefined ? { footnote: d.footnote } : {}),
      ...(d.authorName !== undefined ? { authorName: d.authorName } : {}),
      ...(d.tags !== undefined ? { tags: JSON.stringify(d.tags) } : {}),
      ...(d.iconLarge !== undefined ? { iconLarge: d.iconLarge } : {}),
      ...(d.iconSmall !== undefined ? { iconSmall: d.iconSmall } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
    },
  });
  res.json({ article: toArticle(row) });
});

// Reorder a whole Part group up/down. Rewrites orderIndex so every Part's
// articles form a contiguous block, in the dev-chosen order (each article's
// position within its Part is preserved).
articlesRouter.patch('/parts/reorder', requireDev, async (req, res) => {
  const category = typeof req.body?.category === 'string' ? req.body.category : undefined;
  const coverId = typeof req.body?.coverId === 'string' ? req.body.coverId : undefined;
  const section = typeof req.body?.section === 'string' ? req.body.section : undefined;
  const dir = req.body?.direction === 'up' ? 'up' : 'down';
  if (!category || !section) {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const where: Record<string, unknown> = { category };
  if (coverId) where.wiwonCoverId = coverId;
  const rows = await prisma.article.findMany({
    where,
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
  });
  // Match the client's group key (null/empty partSection shows as "Contents").
  const keyOf = (a: (typeof rows)[number]) => a.partSection || 'Contents';

  const order: string[] = [];
  const byKey = new Map<string, typeof rows>();
  for (const a of rows) {
    const k = keyOf(a);
    if (!byKey.has(k)) {
      byKey.set(k, []);
      order.push(k);
    }
    byKey.get(k)!.push(a);
  }

  const i = order.indexOf(section);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= order.length) {
    res.json({ ok: true });
    return;
  }
  [order[i], order[j]] = [order[j], order[i]];

  const updates = [];
  let idx = 0;
  for (const k of order) {
    for (const a of byKey.get(k) ?? []) {
      if (a.orderIndex !== idx) {
        updates.push(prisma.article.update({ where: { id: a.id }, data: { orderIndex: idx } }));
      }
      idx++;
    }
  }
  if (updates.length) await prisma.$transaction(updates);
  res.json({ ok: true });
});

// Reorder within a part group: move up/down by swapping orderIndex with neighbor.
articlesRouter.patch('/:id/order', requireDev, async (req, res) => {
  const dir = req.body?.direction === 'up' ? 'up' : 'down';
  const cur = await prisma.article.findUnique({ where: { id: req.params.id } });
  if (!cur) {
    res.status(404).json({ error: 'ไม่พบบทความ' });
    return;
  }
  const neighbor = await prisma.article.findFirst({
    where: {
      category: cur.category,
      partSection: cur.partSection,
      orderIndex: dir === 'up' ? { lt: cur.orderIndex } : { gt: cur.orderIndex },
    },
    orderBy: { orderIndex: dir === 'up' ? 'desc' : 'asc' },
  });
  if (neighbor) {
    await prisma.$transaction([
      prisma.article.update({ where: { id: cur.id }, data: { orderIndex: neighbor.orderIndex } }),
      prisma.article.update({ where: { id: neighbor.id }, data: { orderIndex: cur.orderIndex } }),
    ]);
  }
  res.json({ ok: true });
});

articlesRouter.delete('/:id', requireDev, async (req, res) => {
  await prisma.article.deleteMany({ where: { id: req.params.id } });
  res.json({ ok: true });
});
