import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireDev } from '../middleware/auth.js';
import type { Announcement } from '@wiwonanant/shared';

export const announcementsRouter = Router();

function serialize(a: { id: string; body: string; createdAt: Date; updatedAt: Date }): Announcement {
  return { id: a.id, body: a.body, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() };
}

// Latest active announcement (single banner).
announcementsRouter.get('/', async (_req, res) => {
  const row = await prisma.announcement.findFirst({ orderBy: { createdAt: 'desc' } });
  res.json({ announcement: row ? serialize(row) : null });
});

// Dev sets/replaces the announcement (keeps only the newest banner meaningful).
announcementsRouter.post('/', requireDev, async (req, res) => {
  const parsed = z.object({ body: z.string().min(1).max(400) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'กรุณากรอกข้อความประกาศ' });
    return;
  }
  await prisma.announcement.deleteMany({});
  const row = await prisma.announcement.create({ data: { body: parsed.data.body } });
  res.status(201).json({ announcement: serialize(row) });
});

announcementsRouter.delete('/', requireDev, async (_req, res) => {
  await prisma.announcement.deleteMany({});
  res.json({ ok: true });
});
