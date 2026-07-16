import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ENV } from '../env.js';
import { requireAuth, requireDev } from '../middleware/auth.js';
import { applyCredits } from '../services/wallet.js';
import { toLedgerEntry, toTopupOrder, toTopupPackage } from '../serialize.js';

// Wallet & top-up. Cr. is the site currency; users buy it with real money.
// Money never touches this app directly — a payment gateway does, then calls our
// signed webhook. Cr. is granted ONLY by the webhook (or, in the sandbox, the
// mock-pay shortcut), always inside a DB transaction, deduped by transactionId.
export const walletRouter = Router();

const HMAC = (raw: string) => crypto.createHmac('sha256', ENV.PAYMENT_WEBHOOK_SECRET).update(raw).digest('hex');

// ── Packages ────────────────────────────────────────────────────────────────

// Users see active packages; devs (with ?all=1) see every package to manage them.
walletRouter.get('/packages', requireAuth, async (req, res) => {
  const all = req.query.all === '1' && req.currentUser!.role === 'dev';
  const packages = await prisma.topupPackage.findMany({
    where: all ? {} : { active: true },
    orderBy: [{ sortOrder: 'asc' }, { priceTHB: 'asc' }],
  });
  res.json({ packages: packages.map(toTopupPackage) });
});

const packageInput = z.object({
  label: z.string().max(80).optional(),
  priceTHB: z.number().int().min(1),
  credits: z.number().int().min(0),
  bonusCredits: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

walletRouter.post('/packages', requireDev, async (req, res) => {
  const parsed = packageInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'ข้อมูลแพ็กเกจไม่ถูกต้อง' }); return; }
  const p = await prisma.topupPackage.create({
    data: {
      label: parsed.data.label ?? '',
      priceTHB: parsed.data.priceTHB,
      credits: parsed.data.credits,
      bonusCredits: parsed.data.bonusCredits ?? 0,
      active: parsed.data.active ?? true,
      sortOrder: parsed.data.sortOrder ?? 0,
    },
  });
  res.status(201).json({ package: toTopupPackage(p) });
});

walletRouter.patch('/packages/:id', requireDev, async (req, res) => {
  const parsed = packageInput.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'ข้อมูลแพ็กเกจไม่ถูกต้อง' }); return; }
  const exists = await prisma.topupPackage.findUnique({ where: { id: req.params.id } });
  if (!exists) { res.status(404).json({ error: 'ไม่พบแพ็กเกจ' }); return; }
  const p = await prisma.topupPackage.update({ where: { id: req.params.id }, data: parsed.data });
  res.json({ package: toTopupPackage(p) });
});

walletRouter.delete('/packages/:id', requireDev, async (req, res) => {
  // Soft-close so historical orders keep their package reference; hard-delete only
  // if it was never bought.
  const used = await prisma.topupOrder.count({ where: { packageId: req.params.id } });
  if (used > 0) await prisma.topupPackage.update({ where: { id: req.params.id }, data: { active: false } });
  else await prisma.topupPackage.deleteMany({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ── Top-up flow ───────────────────────────────────────────────────────────────

// 1) Create a PENDING order from a package. Price + Cr. are read from the package
//    server-side — never trusted from the client.
walletRouter.post('/topup/create', requireAuth, async (req, res) => {
  const packageId = String(req.body?.packageId ?? '');
  const method = String(req.body?.method ?? 'promptpay');
  const pkg = await prisma.topupPackage.findUnique({ where: { id: packageId } });
  if (!pkg || !pkg.active) { res.status(404).json({ error: 'ไม่พบแพ็กเกจ หรือปิดการขายแล้ว' }); return; }
  const order = await prisma.topupOrder.create({
    data: {
      userId: req.currentUser!.id,
      packageId: pkg.id,
      priceTHB: pkg.priceTHB,
      credits: pkg.credits + pkg.bonusCredits,
      provider: ENV.PAYMENTS_MOCK ? 'mock' : 'gateway',
      method,
      status: 'pending',
    },
  });
  // A real integration would create a charge with the gateway here and return its
  // checkout URL / QR payload. In the sandbox we just hand back the order id.
  res.status(201).json({ order: toTopupOrder(order), mock: ENV.PAYMENTS_MOCK });
});

// Shared completion: flip a pending order to success and grant Cr., exactly once.
// The unique `transactionId` is the idempotency key — a repeat webhook with the
// same id is a no-op.
async function completeOrder(orderId: string, transactionId: string, method?: string) {
  return prisma.$transaction(async (tx) => {
    // Idempotency: if this txn id already settled an order, do nothing.
    const dup = await tx.topupOrder.findUnique({ where: { transactionId } });
    if (dup) return { ok: true, duplicate: true as const, order: dup };
    const order = await tx.topupOrder.findUnique({ where: { id: orderId } });
    if (!order) return { ok: false as const, error: 'ไม่พบรายการชำระเงิน' };
    if (order.status === 'success') return { ok: true, duplicate: true as const, order };
    if (order.status !== 'pending') return { ok: false as const, error: 'รายการนี้ปิดไปแล้ว' };
    const settled = await tx.topupOrder.update({
      where: { id: order.id },
      data: { status: 'success', transactionId, paidAt: new Date(), ...(method ? { method } : {}) },
    });
    await applyCredits(tx, order.userId, order.credits, 'topup', {
      note: `เติมเงิน ${order.priceTHB} บาท`,
      refOrderId: order.id,
    });
    return { ok: true, duplicate: false as const, order: settled };
  });
}

// 2) Gateway webhook. Verifies an HMAC signature over the raw body, checks the
//    amount, then settles idempotently. This is where a real provider plugs in.
walletRouter.post('/topup/webhook', async (req, res) => {
  const signature = req.header('x-wiwon-signature') ?? '';
  const raw = JSON.stringify(req.body ?? {});
  const expected = HMAC(raw);
  // Constant-time compare; reject anything that doesn't match our secret.
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    res.status(401).json({ error: 'ลายเซ็นไม่ถูกต้อง' });
    return;
  }
  const orderId = String(req.body?.orderId ?? '');
  const transactionId = String(req.body?.transactionId ?? '');
  const amount = Number(req.body?.amount);
  const method = req.body?.method ? String(req.body.method) : undefined;
  if (!orderId || !transactionId) { res.status(400).json({ error: 'ข้อมูลไม่ครบ' }); return; }
  const order = await prisma.topupOrder.findUnique({ where: { id: orderId } });
  if (!order) { res.status(404).json({ error: 'ไม่พบรายการ' }); return; }
  // Amount check: the paid sum must match what we billed.
  if (Number.isFinite(amount) && amount !== order.priceTHB) {
    await prisma.topupOrder.update({ where: { id: order.id }, data: { status: 'failed' } });
    console.warn(`[webhook] amount mismatch order=${orderId} billed=${order.priceTHB} paid=${amount}`);
    res.status(400).json({ error: 'ยอดเงินไม่ตรง' });
    return;
  }
  const result = await completeOrder(orderId, transactionId, method);
  if (!result.ok) { res.status(409).json({ error: result.error }); return; }
  res.json({ ok: true, duplicate: result.duplicate });
});

// 2b) Sandbox shortcut: simulate the gateway paying an order (dev/local only).
//     Generates a txn id and runs the exact same settlement path as the webhook.
walletRouter.post('/topup/:id/mock-pay', requireAuth, async (req, res) => {
  if (!ENV.PAYMENTS_MOCK) { res.status(403).json({ error: 'ปิดใช้งานโหมดจำลองการชำระเงิน' }); return; }
  const order = await prisma.topupOrder.findUnique({ where: { id: req.params.id } });
  if (!order || order.userId !== req.currentUser!.id) { res.status(404).json({ error: 'ไม่พบรายการ' }); return; }
  const result = await completeOrder(order.id, `MOCK-${order.id}`, order.method ?? 'promptpay');
  if (!result.ok) { res.status(409).json({ error: result.error }); return; }
  const balance = (await prisma.user.findUnique({ where: { id: req.currentUser!.id } }))?.creditBalance ?? 0;
  res.json({ ok: true, order: toTopupOrder(result.order), balance });
});

// 3) A user's own top-up history.
walletRouter.get('/topup/history', requireAuth, async (req, res) => {
  const orders = await prisma.topupOrder.findMany({
    where: { userId: req.currentUser!.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ orders: orders.map(toTopupOrder) });
});

// ── Admin ─────────────────────────────────────────────────────────────────────

// Every top-up order across all users; optional status + text (user/txn) search.
walletRouter.get('/admin/orders', requireDev, async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const orders = await prisma.topupOrder.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ transactionId: { contains: q } }, { user: { email: { contains: q } } }, { user: { displayName: { contains: q } } }] } : {}),
    },
    include: { user: { select: { displayName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({
    orders: orders.map((o) => ({ ...toTopupOrder(o), userName: o.user.displayName, userEmail: o.user.email })),
  });
});

// Admin manually credits/debits a user (audited in the ledger with a reason).
const adjustInput = z.object({ userId: z.string(), amount: z.number().int(), note: z.string().max(200).optional() });
walletRouter.post('/admin/adjust', requireDev, async (req, res) => {
  const parsed = adjustInput.safeParse(req.body);
  if (!parsed.success || parsed.data.amount === 0) { res.status(400).json({ error: 'กรอกจำนวนและผู้ใช้ให้ถูกต้อง' }); return; }
  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) { res.status(404).json({ error: 'ไม่พบผู้ใช้' }); return; }
  try {
    const balance = await prisma.$transaction((tx) =>
      applyCredits(tx, parsed.data.userId, parsed.data.amount, 'admin-adjust', {
        note: parsed.data.note ?? `ปรับโดย ${req.currentUser!.displayName}`,
      }),
    );
    res.json({ ok: true, balance });
  } catch {
    res.status(400).json({ error: 'ปรับ Cr. ไม่สำเร็จ (คงเหลือติดลบ?)' });
  }
});

// Admin looks up any user's full ledger.
walletRouter.get('/admin/ledger', requireDev, async (req, res) => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : '';
  if (!userId) { res.status(400).json({ error: 'ระบุผู้ใช้' }); return; }
  const entries = await prisma.crLedgerEntry.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ entries: entries.map(toLedgerEntry) });
});
