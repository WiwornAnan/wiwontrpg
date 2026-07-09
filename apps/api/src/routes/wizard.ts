import { Router } from 'express';
import { z } from 'zod';
import type { WizardLevel } from '@wiwonanant/shared';
import { prisma } from '../db.js';
import { requireDev } from '../middleware/auth.js';

// Dev-authored wizard templates (currently the class Lv 1–15 reward table).
// Reading is public (players need it); writing is dev-only.
export const wizardRouter = Router();

const LEVELS = 15;

const optionSchema = z.object({
  id: z.string(),
  featureId: z.string().nullable().default(null),
  featureName: z.string().nullable().default(null),
  text: z.string().default(''),
});
const levelSchema = z.object({
  lv: z.number().int().min(1).max(LEVELS),
  note: z.string().default(''),
  options: z.array(optionSchema).default([]),
});
const templateSchema = z.object({ levels: z.array(levelSchema) });

// A blank Lv 1–15 table, used when a class has no template yet.
function emptyLevels(): WizardLevel[] {
  return Array.from({ length: LEVELS }, (_, i) => ({ lv: i + 1, note: '', options: [] }));
}

wizardRouter.get('/class-levels/:refId', async (req, res) => {
  const row = await prisma.wizardTemplate.findUnique({
    where: { kind_refId: { kind: 'class-levels', refId: req.params.refId } },
  });
  let levels = emptyLevels();
  if (row) {
    try {
      const parsed = templateSchema.safeParse(JSON.parse(row.data));
      if (parsed.success) {
        // Normalise to exactly Lv 1–15, keeping any authored level as-is.
        const byLv = new Map(parsed.data.levels.map((l) => [l.lv, l]));
        levels = emptyLevels().map((l) => byLv.get(l.lv) ?? l);
      }
    } catch {
      /* fall back to empty */
    }
  }
  res.json({ template: { levels } });
});

wizardRouter.put('/class-levels/:refId', requireDev, async (req, res) => {
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const data = JSON.stringify(parsed.data);
  await prisma.wizardTemplate.upsert({
    where: { kind_refId: { kind: 'class-levels', refId: req.params.refId } },
    create: { kind: 'class-levels', refId: req.params.refId, data },
    update: { data },
  });
  res.json({ ok: true });
});
