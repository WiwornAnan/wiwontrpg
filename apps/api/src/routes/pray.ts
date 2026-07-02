import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireDev } from '../middleware/auth.js';
import { toPray } from '../serialize.js';

export const prayRouter = Router();

const prayInclude = {
  fromUser: true,
  catalogItem: { include: { owner: true } },
  replies: { include: { byUser: true }, orderBy: { createdAt: 'asc' as const } },
};

// GET / — inbox. Dev sees all; user sees messages they sent, are addressed to, or broadcasts.
prayRouter.get('/', requireAuth, async (req, res) => {
  const u = req.currentUser!;
  const where =
    u.role === 'dev'
      ? {}
      : { OR: [{ fromUserId: u.id }, { toUserId: u.id }, { toUserId: null, kind: 'general' }] };
  const rows = await prisma.prayMessage.findMany({ where, include: prayInclude, orderBy: { createdAt: 'desc' } });
  res.json({ messages: rows.map(toPray) });
});

prayRouter.get('/:id', requireAuth, async (req, res) => {
  const row = await prisma.prayMessage.findUnique({ where: { id: req.params.id }, include: prayInclude });
  if (!row) {
    res.status(404).json({ error: 'ไม่พบข้อความ' });
    return;
  }
  res.json({ message: toPray(row) });
});

// Compose a general message (to a dev = broadcast to devs, or a specific user for devs).
prayRouter.post('/', requireAuth, async (req, res) => {
  const parsed = z
    .object({ subject: z.string().min(1, 'กรุณากรอกหัวข้อ'), body: z.string().min(1, 'กรุณากรอกข้อความ'), toUserId: z.string().nullable().optional() })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const isDev = req.currentUser!.role === 'dev';
  const row = await prisma.prayMessage.create({
    data: {
      kind: 'general',
      fromUserId: req.currentUser!.id,
      // regular users address devs (toUserId null); devs may target a specific user
      toUserId: isDev ? parsed.data.toUserId ?? null : null,
      subject: parsed.data.subject,
      body: parsed.data.body,
      readByDev: isDev,
      readByUser: !isDev,
    },
    include: prayInclude,
  });
  res.status(201).json({ message: toPray(row) });
});

prayRouter.post('/:id/reply', requireAuth, async (req, res) => {
  const parsed = z.object({ body: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'กรุณากรอกข้อความ' });
    return;
  }
  const msg = await prisma.prayMessage.findUnique({ where: { id: req.params.id } });
  if (!msg) {
    res.status(404).json({ error: 'ไม่พบข้อความ' });
    return;
  }
  const isDev = req.currentUser!.role === 'dev';
  await prisma.prayReply.create({
    data: { prayMessageId: msg.id, byUserId: req.currentUser!.id, isDev, body: parsed.data.body },
  });
  const row = await prisma.prayMessage.findUnique({ where: { id: msg.id }, include: prayInclude });
  res.status(201).json({ message: toPray(row!) });
});

// Mark read.
prayRouter.post('/:id/read', requireAuth, async (req, res) => {
  const isDev = req.currentUser!.role === 'dev';
  await prisma.prayMessage.updateMany({
    where: { id: req.params.id },
    data: isDev ? { readByDev: true } : { readByUser: true },
  });
  res.json({ ok: true });
});

// Dev approves an official-request: promote the homebrew item, award Cr., auto-reply.
prayRouter.post('/:id/approve', requireDev, async (req, res) => {
  const credits = Math.max(0, Number(req.body?.credits) || 0);
  const msg = await prisma.prayMessage.findUnique({ where: { id: req.params.id }, include: { catalogItem: true } });
  if (!msg || msg.kind !== 'official-request' || !msg.catalogItemId) {
    res.status(400).json({ error: 'ไม่ใช่คำขอที่ถูกต้อง' });
    return;
  }
  if (msg.approved) {
    res.status(409).json({ error: 'อนุมัติไปแล้ว' });
    return;
  }
  const item = msg.catalogItem!;
  await prisma.$transaction([
    // promote item: no longer homebrew, flagged as approved-from-homebrew (keeps owner credit)
    prisma.catalogItem.update({
      where: { id: item.id },
      data: { isHomebrew: false, approvedFromHomebrew: true, source: 'Official' },
    }),
    prisma.prayMessage.update({ where: { id: msg.id }, data: { approved: true, creditsAwarded: credits, readByUser: false } }),
    prisma.prayReply.create({
      data: {
        prayMessageId: msg.id,
        byUserId: req.currentUser!.id,
        isDev: true,
        body: `🌙 List "${item.name}" ของคุณได้รับการอนุมัติแล้ว — ยกระดับเป็น Official เรียบร้อย${credits > 0 ? ` และได้รับ ${credits} Cr.` : ''}`,
      },
    }),
    ...(credits > 0 && item.ownerUserId
      ? [
          prisma.user.update({ where: { id: item.ownerUserId }, data: { creditBalance: { increment: credits } } }),
          prisma.crLedgerEntry.create({ data: { userId: item.ownerUserId, amount: credits, reason: 'official-approval', refPrayMessageId: msg.id } }),
        ]
      : []),
  ]);
  const row = await prisma.prayMessage.findUnique({ where: { id: msg.id }, include: prayInclude });
  res.json({ message: toPray(row!) });
});

// Dev asks the requester to revise (auto-reply, not approved).
prayRouter.post('/:id/notify-revise', requireDev, async (req, res) => {
  const note = String(req.body?.note || 'กรุณาปรับแก้ข้อมูลเพิ่มเติมก่อนพิจารณาอีกครั้ง');
  const msg = await prisma.prayMessage.findUnique({ where: { id: req.params.id } });
  if (!msg) {
    res.status(404).json({ error: 'ไม่พบข้อความ' });
    return;
  }
  await prisma.prayReply.create({
    data: { prayMessageId: msg.id, byUserId: req.currentUser!.id, isDev: true, isNotify: true, body: `✎ ${note}` },
  });
  await prisma.prayMessage.update({ where: { id: msg.id }, data: { readByUser: false } });
  const row = await prisma.prayMessage.findUnique({ where: { id: msg.id }, include: prayInclude });
  res.json({ message: toPray(row!) });
});

// Delete a message (owner if not approved, or dev).
prayRouter.delete('/:id', requireAuth, async (req, res) => {
  const msg = await prisma.prayMessage.findUnique({ where: { id: req.params.id } });
  if (!msg) {
    res.json({ ok: true });
    return;
  }
  const isDev = req.currentUser!.role === 'dev';
  const isOwner = msg.fromUserId === req.currentUser!.id;
  if (!isDev && !(isOwner && !msg.approved)) {
    res.status(403).json({ error: 'ไม่มีสิทธิ์ลบข้อความนี้' });
    return;
  }
  await prisma.prayMessage.delete({ where: { id: msg.id } });
  res.json({ ok: true });
});
