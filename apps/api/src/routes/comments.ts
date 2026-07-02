import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireDev } from '../middleware/auth.js';
import { toComment } from '../serialize.js';

export const commentsRouter = Router();

commentsRouter.get('/', async (_req, res) => {
  const rows = await prisma.comment.findMany({
    orderBy: { createdAt: 'desc' },
    include: { author: true },
  });
  res.json({ comments: rows.map(toComment) });
});

const bodySchema = z.object({ body: z.string().min(1, 'กรุณากรอกความคิดเห็น').max(2000) });

// Only logged-in users may post.
commentsRouter.post('/', requireAuth, async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const row = await prisma.comment.create({
    data: { authorUserId: req.currentUser!.id, body: parsed.data.body },
    include: { author: true },
  });
  res.status(201).json({ comment: toComment(row) });
});

// Anyone may edit their own comment.
commentsRouter.patch('/:id', requireAuth, async (req, res) => {
  const existing = await prisma.comment.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: 'ไม่พบความคิดเห็น' });
    return;
  }
  if (existing.authorUserId !== req.currentUser!.id) {
    res.status(403).json({ error: 'แก้ไขได้เฉพาะความคิดเห็นของตนเอง' });
    return;
  }
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const row = await prisma.comment.update({
    where: { id: req.params.id },
    data: { body: parsed.data.body, edited: true },
    include: { author: true },
  });
  res.json({ comment: toComment(row) });
});

// Only developers may delete comments.
commentsRouter.delete('/:id', requireDev, async (req, res) => {
  await prisma.comment.deleteMany({ where: { id: req.params.id } });
  res.json({ ok: true });
});
