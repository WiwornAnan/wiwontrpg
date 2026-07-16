import type { Prisma } from '@prisma/client';
import type { CrLedgerReason } from '@wiwonanant/shared';

/** Raised when a debit would push the wallet below zero. */
export class InsufficientCreditsError extends Error {
  constructor() {
    super('Cr. ไม่เพียงพอ');
    this.name = 'InsufficientCreditsError';
  }
}

interface ApplyOpts {
  note?: string;
  refOrderId?: string;
  refPrayMessageId?: string;
  /** Allow the balance to go negative (never used in practice; admin-only escape hatch). */
  allowNegative?: boolean;
}

/**
 * The ONLY way Cr. ever moves. Runs inside a caller-supplied transaction so the
 * balance update + ledger entry (+ any sibling writes) commit atomically. Reads
 * the current balance with the tx client, guards debits against going negative,
 * and snapshots `balanceAfter` into the ledger for a tamper-evident audit trail.
 *
 * @param amount signed: positive credits the wallet, negative debits it.
 */
export async function applyCredits(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  reason: CrLedgerReason,
  opts: ApplyOpts = {},
): Promise<number> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { creditBalance: true } });
  if (!user) throw new Error('ไม่พบผู้ใช้');
  const balanceAfter = user.creditBalance + amount;
  if (balanceAfter < 0 && !opts.allowNegative) throw new InsufficientCreditsError();

  await tx.user.update({ where: { id: userId }, data: { creditBalance: balanceAfter } });
  await tx.crLedgerEntry.create({
    data: {
      userId,
      amount,
      balanceAfter,
      reason,
      note: opts.note ?? null,
      refOrderId: opts.refOrderId ?? null,
      refPrayMessageId: opts.refPrayMessageId ?? null,
    },
  });
  return balanceAfter;
}
