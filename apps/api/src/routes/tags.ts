import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireDev } from '../middleware/auth.js';

export const tagsRouter = Router();

// GET /:scope — dev-added custom tags + hidden built-ins for a catalog scope
// (e.g. 'equipment', 'magic', 'magic-feature', 'monster'). Frontend merges these
// with the built-in options from the shared config.
tagsRouter.get('/:scope', async (req, res) => {
  const rows = await prisma.tag.findMany({ where: { scope: req.params.scope } });
  res.json({
    custom: rows.filter((r) => r.isCustom && !r.hiddenBuiltin).map((r) => r.label),
    hidden: rows.filter((r) => r.hiddenBuiltin).map((r) => r.label),
  });
});

const addSchema = z.object({ scope: z.string().min(1), label: z.string().min(1) });

tagsRouter.post('/', requireDev, async (req, res) => {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const { scope, label } = parsed.data;
  const existing = await prisma.tag.findFirst({ where: { scope, label } });
  if (existing) {
    await prisma.tag.update({ where: { id: existing.id }, data: { isCustom: true, hiddenBuiltin: false } });
  } else {
    await prisma.tag.create({ data: { scope, label, isCustom: true } });
  }
  res.status(201).json({ ok: true });
});

// Remove a tag: hide a built-in, or delete a custom one.
tagsRouter.delete('/', requireDev, async (req, res) => {
  const parsed = z.object({ scope: z.string(), label: z.string(), builtin: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const { scope, label, builtin } = parsed.data;
  const existing = await prisma.tag.findFirst({ where: { scope, label } });
  if (builtin) {
    if (existing) await prisma.tag.update({ where: { id: existing.id }, data: { hiddenBuiltin: true, isCustom: false } });
    else await prisma.tag.create({ data: { scope, label, hiddenBuiltin: true } });
  } else if (existing) {
    await prisma.tag.delete({ where: { id: existing.id } });
  }
  res.json({ ok: true });
});
