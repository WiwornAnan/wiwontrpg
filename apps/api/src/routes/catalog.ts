import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { toCatalogItem } from '../serialize.js';
import { sanitizeDescription } from '../lib/sanitize.js';
import {
  CATALOG_CATEGORIES,
  CATALOG_PAGE_SIZE,
  allowedFieldKeys,
  getCatalogConfig,
  type CatalogCategory,
  type CatalogItem,
} from '@wiwonanant/shared';

export const catalogRouter = Router();

function isCategory(x: string): x is CatalogCategory {
  return (CATALOG_CATEGORIES as readonly string[]).includes(x);
}

// Pull the display value for a field key from the item (real column or JSON bag).
function fieldValue(item: CatalogItem, key: string): unknown {
  if (key === 'name') return item.name;
  if (key === 'source') return item.source;
  if (key === 'tag') return item.fields.tag ?? item.tags[0];
  return item.fields[key];
}

// GET /:category — list with scope, isFeature, filters, search, pagination.
catalogRouter.get('/:category', async (req, res) => {
  const category = req.params.category;
  if (!isCategory(category)) {
    res.status(404).json({ error: 'ไม่พบหมวดหมู่' });
    return;
  }
  const cfg = getCatalogConfig(category);
  const isFeature = req.query.isFeature === 'true';
  const scope = (req.query.scope as string) || 'all';
  const search = ((req.query.q as string) || '').trim().toLowerCase();
  const page = Math.max(1, Number(req.query.page) || 1);

  const where: Record<string, unknown> = { category, isFeature };
  if (scope === 'official') where.isHomebrew = false;
  else if (scope === 'homebrew') where.isHomebrew = true;

  const rows = await prisma.catalogItem.findMany({ where, include: { owner: true }, orderBy: { createdAt: 'asc' } });
  let items = rows.map(toCatalogItem);

  // Full text on name + tags.
  if (search) {
    items = items.filter(
      (it) => it.name.toLowerCase().includes(search) || it.tags.some((t) => t.toLowerCase().includes(search)),
    );
  }

  // Advanced filters — driven by the shared config's filterFields.
  const source = isFeature && cfg.feature ? cfg.feature : cfg;
  for (const f of source.filterFields) {
    if (f.kind === 'range') {
      const min = req.query[`${f.key}_min`];
      const max = req.query[`${f.key}_max`];
      const numKey = f.numKey ?? f.key;
      if (min !== undefined && min !== '') items = items.filter((it) => Number(it.fields[numKey] ?? NaN) >= Number(min));
      if (max !== undefined && max !== '') items = items.filter((it) => Number(it.fields[numKey] ?? NaN) <= Number(max));
    } else if (f.kind === 'checks') {
      const raw = req.query[f.key];
      const vals = Array.isArray(raw) ? (raw as string[]) : raw ? [raw as string] : [];
      if (vals.length) items = items.filter((it) => vals.includes(String(fieldValue(it, f.key))));
    } else {
      const val = req.query[f.key];
      if (val && val !== '') {
        if (f.key === 'tag') items = items.filter((it) => it.tags.includes(String(val)) || String(it.fields.tag) === val);
        else items = items.filter((it) => String(fieldValue(it, f.key)) === String(val));
      }
    }
  }

  // Popular tags computed live from the (scope-filtered, pre-search) set.
  const tagCounts = new Map<string, number>();
  rows
    .map(toCatalogItem)
    .forEach((it) => it.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)));
  const popularTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t);

  const total = items.length;
  const start = (page - 1) * CATALOG_PAGE_SIZE;
  const paged = items.slice(start, start + CATALOG_PAGE_SIZE);

  // Live stats.
  const officialCount = rows.filter((r) => !r.isHomebrew).length;
  const stats = { total: rows.length, official: officialCount, homebrew: rows.length - officialCount };

  res.json({ items: paged, total, page, pageSize: CATALOG_PAGE_SIZE, popularTags, stats });
});

catalogRouter.get('/:category/item/:id', async (req, res) => {
  const row = await prisma.catalogItem.findUnique({ where: { id: req.params.id }, include: { owner: true } });
  if (!row) {
    res.status(404).json({ error: 'ไม่พบข้อมูล' });
    return;
  }
  res.json({ item: toCatalogItem(row) });
});

const itemInput = z.object({
  isFeature: z.boolean().optional(),
  name: z.string().min(1, 'กรุณากรอกชื่อ'),
  subtitle: z.string().nullable().optional(),
  fields: z.record(z.unknown()).default({}),
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
  source: z.string().optional(),
  iconUrl: z.string().nullable().optional(),
});

// Keep only whitelisted field keys for this category + isFeature.
function cleanFields(category: CatalogCategory, isFeature: boolean, fields: Record<string, unknown>) {
  const allowed = new Set(allowedFieldKeys(category, isFeature));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) if (allowed.has(k)) out[k] = v;
  return out;
}

// POST /:category — dev creates Official directly; regular user creates Homebrew.
catalogRouter.post('/:category', requireAuth, async (req, res) => {
  const category = req.params.category;
  if (!isCategory(category)) {
    res.status(404).json({ error: 'ไม่พบหมวดหมู่' });
    return;
  }
  const parsed = itemInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const d = parsed.data;
  const isFeature = !!d.isFeature;
  const isDev = req.currentUser!.role === 'dev';
  const row = await prisma.catalogItem.create({
    data: {
      category,
      isFeature,
      name: d.name,
      subtitle: d.subtitle ?? null,
      fields: JSON.stringify(cleanFields(category, isFeature, d.fields)),
      description: sanitizeDescription(d.description),
      tags: JSON.stringify(d.tags),
      source: isDev ? d.source || 'Official' : 'Homebrew',
      isHomebrew: !isDev,
      ownerUserId: isDev ? null : req.currentUser!.id,
      isOfficialAdded: isDev,
      iconUrl: d.iconUrl ?? null,
    },
    include: { owner: true },
  });
  res.status(201).json({ item: toCatalogItem(row) });
});

// Owner (homebrew) or dev may edit.
catalogRouter.patch('/:category/item/:id', requireAuth, async (req, res) => {
  const existing = await prisma.catalogItem.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: 'ไม่พบข้อมูล' });
    return;
  }
  const isDev = req.currentUser!.role === 'dev';
  const isOwner = existing.ownerUserId === req.currentUser!.id;
  if (!isDev && !(isOwner && existing.isHomebrew)) {
    res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขรายการนี้' });
    return;
  }
  const parsed = itemInput.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const d = parsed.data;
  const isFeature = d.isFeature ?? existing.isFeature;
  const row = await prisma.catalogItem.update({
    where: { id: req.params.id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.subtitle !== undefined ? { subtitle: d.subtitle } : {}),
      ...(d.fields !== undefined ? { fields: JSON.stringify(cleanFields(existing.category as CatalogCategory, isFeature, d.fields)) } : {}),
      ...(d.description !== undefined ? { description: sanitizeDescription(d.description) } : {}),
      ...(d.tags !== undefined ? { tags: JSON.stringify(d.tags) } : {}),
      ...(d.iconUrl !== undefined ? { iconUrl: d.iconUrl } : {}),
    },
    include: { owner: true },
  });
  res.json({ item: toCatalogItem(row) });
});

catalogRouter.delete('/:category/item/:id', requireAuth, async (req, res) => {
  const existing = await prisma.catalogItem.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: 'ไม่พบข้อมูล' });
    return;
  }
  const isDev = req.currentUser!.role === 'dev';
  const isOwner = existing.ownerUserId === req.currentUser!.id;
  if (!isDev && !(isOwner && existing.isHomebrew)) {
    res.status(403).json({ error: 'ไม่มีสิทธิ์ลบรายการนี้' });
    return;
  }
  await prisma.catalogItem.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
