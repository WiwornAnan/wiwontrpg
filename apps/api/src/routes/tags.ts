import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireDev } from '../middleware/auth.js';

export const tagsRouter = Router();

// GET /bulk/:catScope — all custom/hidden tags for every field of a catalog scope,
// grouped by field key. Per-field scopes are stored as `${catScope}:${fieldKey}`.
tagsRouter.get('/bulk/:catScope', async (req, res) => {
  const catScope = req.params.catScope;
  const rows = await prisma.tag.findMany({ where: { scope: { startsWith: `${catScope}:` } } });
  const out: Record<string, { custom: string[]; hidden: string[]; order: string[] }> = {};
  for (const r of rows) {
    const fieldKey = r.scope.slice(catScope.length + 1);
    if (!fieldKey) continue;
    const e = (out[fieldKey] ??= { custom: [], hidden: [], order: [] });
    if (r.hiddenBuiltin) e.hidden.push(r.label);
    else if (r.isCustom) e.custom.push(r.label);
  }
  const orderRows = await prisma.siteSetting.findMany({ where: { key: { startsWith: `tagOrder:${catScope}:` } } });
  for (const r of orderRows) {
    const fieldKey = r.key.slice(`tagOrder:${catScope}:`.length);
    if (!fieldKey) continue;
    const e = (out[fieldKey] ??= { custom: [], hidden: [], order: [] });
    try {
      e.order = JSON.parse(r.value) as string[];
    } catch {
      /* ignore malformed */
    }
  }
  res.json(out);
});

// GET /popular/:catScope — the dev-set Popular Tags override for a scope ([] = auto).
tagsRouter.get('/popular/:catScope', async (req, res) => {
  const row = await prisma.siteSetting.findUnique({ where: { key: `popTags:${req.params.catScope}` } });
  res.json({ tags: row ? (JSON.parse(row.value) as string[]) : [] });
});

// POST /popular — dev saves a Popular Tags override (empty list → back to auto).
tagsRouter.post('/popular', requireDev, async (req, res) => {
  const parsed = z.object({ scope: z.string().min(1), tags: z.array(z.string()) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const key = `popTags:${parsed.data.scope}`;
  const clean = parsed.data.tags.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) {
    await prisma.siteSetting.deleteMany({ where: { key } });
  } else {
    const value = JSON.stringify(clean);
    await prisma.siteSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  res.json({ ok: true });
});

// GET /:scope — dev-added custom tags + hidden built-ins for a single field scope
// (e.g. 'magic:rarity'). Frontend merges these with the built-in config options.
tagsRouter.get('/:scope', async (req, res) => {
  const rows = await prisma.tag.findMany({ where: { scope: req.params.scope } });
  const orderRow = await prisma.siteSetting.findUnique({ where: { key: `tagOrder:${req.params.scope}` } });
  let order: string[] = [];
  if (orderRow) {
    try {
      order = JSON.parse(orderRow.value) as string[];
    } catch {
      /* ignore */
    }
  }
  res.json({
    custom: rows.filter((r) => r.isCustom && !r.hiddenBuiltin).map((r) => r.label),
    hidden: rows.filter((r) => r.hiddenBuiltin).map((r) => r.label),
    order,
  });
});

// POST /order — dev saves a display order (array of labels) for a field scope.
tagsRouter.post('/order', requireDev, async (req, res) => {
  const parsed = z.object({ scope: z.string().min(1), order: z.array(z.string()) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const key = `tagOrder:${parsed.data.scope}`;
  const clean = parsed.data.order.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) {
    await prisma.siteSetting.deleteMany({ where: { key } });
  } else {
    const value = JSON.stringify(clean);
    await prisma.siteSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  res.json({ ok: true });
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
