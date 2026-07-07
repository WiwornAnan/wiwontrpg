import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireDev } from '../middleware/auth.js';
import { toCover } from '../serialize.js';

export const coversRouter = Router();

coversRouter.get('/', async (req, res) => {
  const isDev = req.currentUser?.role === 'dev';
  const rows = await prisma.wiwonCover.findMany({ orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }] });
  // A cover "has data" if it has at least one article visible to the viewer.
  const counts = await prisma.article.groupBy({
    by: ['wiwonCoverId'],
    where: { category: 'wiwon', ...(isDev ? {} : { status: 'published' }) },
    _count: { _all: true },
  });
  const hasByCover = new Map(counts.map((c) => [c.wiwonCoverId, c._count._all > 0]));
  const covers = rows.map((r) => ({ ...toCover(r), hasData: hasByCover.get(r.id) ?? false }));
  res.json({ covers });
});

const coverInput = z.object({
  name: z.string().min(1, 'กรุณากรอกชื่อเล่ม'),
  setName: z.string().nullable().optional(),
  updateDateLabel: z.string().nullable().optional(),
  coverImageUrl: z.string().nullable().optional(),
  heroTitle: z.string().nullable().optional(),
  heroSubtitle: z.string().nullable().optional(),
  heroImageUrl: z.string().nullable().optional(),
  hasData: z.boolean().optional(),
});

coversRouter.post('/', requireDev, async (req, res) => {
  const parsed = coverInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const last = await prisma.wiwonCover.findFirst({ orderBy: { orderIndex: 'desc' } });
  const row = await prisma.wiwonCover.create({
    data: {
      name: parsed.data.name,
      setName: parsed.data.setName ?? null,
      updateDateLabel: parsed.data.updateDateLabel ?? null,
      coverImageUrl: parsed.data.coverImageUrl ?? null,
      heroTitle: parsed.data.heroTitle ?? null,
      heroSubtitle: parsed.data.heroSubtitle ?? null,
      heroImageUrl: parsed.data.heroImageUrl ?? null,
      hasData: parsed.data.hasData ?? false,
      orderIndex: (last?.orderIndex ?? -1) + 1,
    },
  });
  res.status(201).json({ cover: toCover(row) });
});

coversRouter.patch('/:id', requireDev, async (req, res) => {
  const existing = await prisma.wiwonCover.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: 'ไม่พบเล่ม' });
    return;
  }
  const parsed = coverInput.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const row = await prisma.wiwonCover.update({ where: { id: req.params.id }, data: parsed.data });
  res.json({ cover: toCover(row) });
});

coversRouter.delete('/:id', requireDev, async (req, res) => {
  await prisma.wiwonCover.deleteMany({ where: { id: req.params.id } });
  res.json({ ok: true });
});
