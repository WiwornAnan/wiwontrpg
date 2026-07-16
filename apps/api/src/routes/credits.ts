import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { canClaimCredits, toLedgerEntry } from '../serialize.js';
import { applyCredits } from '../services/wallet.js';
import { DAILY_CR_AMOUNT } from '@wiwonanant/shared';

export const creditsRouter = Router();

creditsRouter.get('/me', requireAuth, async (req, res) => {
  const u = req.currentUser!;
  res.json({ balance: u.creditBalance, canClaimToday: canClaimCredits(u) });
});

// Daily +3 Cr. claim, server-side reset check (resets at 03:00 via claimDayKey).
creditsRouter.post('/claim', requireAuth, async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.currentUser!.id } });
  if (!u) {
    res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    return;
  }
  if (!canClaimCredits(u)) {
    res.status(409).json({ error: 'วันนี้รับ Cr. ไปแล้ว' });
    return;
  }
  const balance = await prisma.$transaction(async (tx) => {
    const b = await applyCredits(tx, u.id, DAILY_CR_AMOUNT, 'daily-claim', { note: 'รับ Cr. ประจำวัน' });
    await tx.user.update({ where: { id: u.id }, data: { lastCrClaimAt: new Date() } });
    return b;
  });
  res.json({ balance, awarded: DAILY_CR_AMOUNT });
});

// The signed-in user's own Cr. ledger — every credit/debit, newest first.
creditsRouter.get('/ledger', requireAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const take = 30;
  const entries = await prisma.crLedgerEntry.findMany({
    where: { userId: req.currentUser!.id },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * take,
    take: take + 1,
  });
  res.json({ entries: entries.slice(0, take).map(toLedgerEntry), hasMore: entries.length > take });
});
