import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireDev } from '../middleware/auth.js';

export const heroesRouter = Router();

export interface HeroData {
  title: string;
  subtitle: string;
  imageUrl: string | null;
}

// GET /:category — returns the dev-saved hero override for a page, or null (frontend
// falls back to its built-in default).
heroesRouter.get('/:category', async (req, res) => {
  const row = await prisma.siteSetting.findUnique({ where: { key: `hero:${req.params.category}` } });
  res.json({ hero: row ? (JSON.parse(row.value) as HeroData) : null });
});

const heroSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().default(''),
  imageUrl: z.string().nullable().default(null),
});

heroesRouter.put('/:category', requireDev, async (req, res) => {
  const parsed = heroSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูล Banner ไม่ถูกต้อง' });
    return;
  }
  const key = `hero:${req.params.category}`;
  const value = JSON.stringify(parsed.data);
  await prisma.siteSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  res.json({ hero: parsed.data });
});

// Reset hero back to the built-in default.
heroesRouter.delete('/:category', requireDev, async (req, res) => {
  await prisma.siteSetting.deleteMany({ where: { key: `hero:${req.params.category}` } });
  res.json({ ok: true });
});
