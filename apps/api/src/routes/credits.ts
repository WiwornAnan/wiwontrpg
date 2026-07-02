import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { canClaimCredits } from '../serialize.js';
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
  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: u.id },
      data: { creditBalance: { increment: DAILY_CR_AMOUNT }, lastCrClaimAt: new Date() },
    }),
    prisma.crLedgerEntry.create({ data: { userId: u.id, amount: DAILY_CR_AMOUNT, reason: 'daily-claim' } }),
  ]);
  res.json({ balance: updated.creditBalance, awarded: DAILY_CR_AMOUNT });
});
