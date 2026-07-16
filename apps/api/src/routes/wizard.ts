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
  // When claimed, lets the player pick an extra effect:
  // weapon = class Weapon Proficiency, language = tag Language,
  // lifestyle = tags Specialization/Social/Local Knowledge/Life lesson,
  // core = raise one Core Attribute +1 grade, skill = one Dweller Skill proficiency.
  grantType: z.enum(['none', 'weapon', 'language', 'lifestyle', 'core', 'skill']).default('none'),
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

// Parse a class-levels row into a normalised Lv 1–15 table (or empty if absent).
function levelsFromRow(row: { data: string } | null): WizardLevel[] {
  if (!row) return emptyLevels();
  try {
    const parsed = templateSchema.safeParse(JSON.parse(row.data));
    if (parsed.success) {
      const byLv = new Map(parsed.data.levels.map((l) => [l.lv, l]));
      return emptyLevels().map((l) => byLv.get(l.lv) ?? l);
    }
  } catch {
    /* fall back to empty */
  }
  return emptyLevels();
}

// Every class except Boundless shares Vanguard's default Lv 1–15 table (they're
// identical to start); once a class saves its own table it uses that instead.
const BOUNDLESS_RE = /boundless/i;
const VANGUARD_REFS = ['Vanguard', 'Vanguard Class'];

wizardRouter.get('/class-levels/:refId', async (req, res) => {
  const refId = req.params.refId;
  const row = await prisma.wizardTemplate.findUnique({
    where: { kind_refId: { kind: 'class-levels', refId } },
  });
  let levels = levelsFromRow(row);
  // No own table yet + not Boundless + not Vanguard itself → inherit Vanguard's.
  if (!row && !BOUNDLESS_RE.test(refId) && !VANGUARD_REFS.includes(refId)) {
    const vRow = await prisma.wizardTemplate.findFirst({
      where: { kind: 'class-levels', refId: { in: VANGUARD_REFS } },
    });
    if (vRow) levels = levelsFromRow(vRow);
  }
  res.json({ template: { levels } });
});

// ── Race grants: Features a race hands the player (dev adds/removes) ──────────
const grantSchema = z.object({
  features: z.array(z.object({ featureId: z.string(), featureName: z.string().nullable().default(null) })),
});

wizardRouter.get('/race-grant/:refId', async (req, res) => {
  const row = await prisma.wizardTemplate.findUnique({
    where: { kind_refId: { kind: 'race-grant', refId: req.params.refId } },
  });
  let grant = { features: [] as { featureId: string; featureName: string | null }[] };
  if (row) {
    const parsed = grantSchema.safeParse((() => { try { return JSON.parse(row.data); } catch { return {}; } })());
    if (parsed.success) grant = parsed.data;
  }
  res.json({ grant });
});

wizardRouter.put('/race-grant/:refId', requireDev, async (req, res) => {
  const parsed = grantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const data = JSON.stringify(parsed.data);
  await prisma.wizardTemplate.upsert({
    where: { kind_refId: { kind: 'race-grant', refId: req.params.refId } },
    create: { kind: 'race-grant', refId: req.params.refId, data },
    update: { data },
  });
  res.json({ ok: true });
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

// ── Class weapon proficiencies: dev lists the options a class may pick from,
//    and the player chooses which to be proficient in. ─────────────────────────
const weaponsSchema = z.object({
  options: z.array(z.object({
    id: z.string(),
    featureId: z.string().nullable().default(null),
    featureName: z.string().nullable().default(null),
    text: z.string().default(''),
  })),
});

wizardRouter.get('/class-weapons/:refId', async (req, res) => {
  const row = await prisma.wizardTemplate.findUnique({
    where: { kind_refId: { kind: 'class-weapons', refId: req.params.refId } },
  });
  let weapons = { options: [] as z.infer<typeof weaponsSchema>['options'] };
  if (row) {
    const parsed = weaponsSchema.safeParse((() => { try { return JSON.parse(row.data); } catch { return {}; } })());
    if (parsed.success) weapons = parsed.data;
  }
  res.json({ weapons });
});

wizardRouter.put('/class-weapons/:refId', requireDev, async (req, res) => {
  const parsed = weaponsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const data = JSON.stringify(parsed.data);
  await prisma.wizardTemplate.upsert({
    where: { kind_refId: { kind: 'class-weapons', refId: req.params.refId } },
    create: { kind: 'class-weapons', refId: req.params.refId, data },
    update: { data },
  });
  res.json({ ok: true });
});

// ── Class Core Attributes: dev-graded (A/B/C/D/X), players just receive them.
//    Defaults to the 2 main attributes when a class has none yet. ──────────────
const coreSchema = z.object({
  attributes: z.array(z.object({
    id: z.string(),
    name: z.string().default(''),
    grade: z.enum(['A', 'B', 'C', 'D', 'X']).default('C'),
  })),
});
const defaultCore = () => [
  { id: 'core-1', name: '', grade: 'C' as const },
  { id: 'core-2', name: '', grade: 'C' as const },
];

wizardRouter.get('/class-core/:refId', async (req, res) => {
  const row = await prisma.wizardTemplate.findUnique({
    where: { kind_refId: { kind: 'class-core', refId: req.params.refId } },
  });
  let attributes: z.infer<typeof coreSchema>['attributes'] = defaultCore();
  if (row) {
    const parsed = coreSchema.safeParse((() => { try { return JSON.parse(row.data); } catch { return {}; } })());
    if (parsed.success) attributes = parsed.data.attributes;
  }
  res.json({ core: { attributes } });
});

wizardRouter.put('/class-core/:refId', requireDev, async (req, res) => {
  const parsed = coreSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const data = JSON.stringify(parsed.data);
  await prisma.wizardTemplate.upsert({
    where: { kind_refId: { kind: 'class-core', refId: req.params.refId } },
    create: { kind: 'class-core', refId: req.params.refId, data },
    update: { data },
  });
  res.json({ ok: true });
});

// Race Core Attributes (Step 1) — same shape, keyed by the Race id.
wizardRouter.get('/race-core/:refId', async (req, res) => {
  const row = await prisma.wizardTemplate.findUnique({
    where: { kind_refId: { kind: 'race-core', refId: req.params.refId } },
  });
  let attributes: z.infer<typeof coreSchema>['attributes'] = defaultCore();
  if (row) {
    const parsed = coreSchema.safeParse((() => { try { return JSON.parse(row.data); } catch { return {}; } })());
    if (parsed.success) attributes = parsed.data.attributes;
  }
  res.json({ core: { attributes } });
});

wizardRouter.put('/race-core/:refId', requireDev, async (req, res) => {
  const parsed = coreSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const data = JSON.stringify(parsed.data);
  await prisma.wizardTemplate.upsert({
    where: { kind_refId: { kind: 'race-core', refId: req.params.refId } },
    create: { kind: 'race-core', refId: req.params.refId, data },
    update: { data },
  });
  res.json({ ok: true });
});

// ── Step 4 questionnaire: dev-authored questions, players tick one option each.
//    Each option carries a Quality-of-Life (QL) value the dev sets. Global set,
//    so keyed by a fixed refId ('global'). ─────────────────────────────────────
const step4Schema = z.object({
  questions: z.array(z.object({
    id: z.string(),
    section: z.string().default(''),
    title: z.string().default(''),
    options: z.array(z.object({
      id: z.string(),
      text: z.string().default(''),
      ql: z.number().int().default(0),
    })).default([]),
  })),
});

wizardRouter.get('/step4-questions/:refId', async (req, res) => {
  const row = await prisma.wizardTemplate.findUnique({
    where: { kind_refId: { kind: 'step4-questions', refId: req.params.refId } },
  });
  let questions: z.infer<typeof step4Schema>['questions'] = [];
  if (row) {
    const parsed = step4Schema.safeParse((() => { try { return JSON.parse(row.data); } catch { return {}; } })());
    if (parsed.success) questions = parsed.data.questions;
  }
  res.json({ step4: { questions } });
});

wizardRouter.put('/step4-questions/:refId', requireDev, async (req, res) => {
  const parsed = step4Schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const data = JSON.stringify(parsed.data);
  await prisma.wizardTemplate.upsert({
    where: { kind_refId: { kind: 'step4-questions', refId: req.params.refId } },
    create: { kind: 'step4-questions', refId: req.params.refId, data },
    update: { data },
  });
  res.json({ ok: true });
});

// ── Step 5 written answers: dev-authored open-ended prompts; players write
//    free-form text (unlimited length). Global set, keyed by 'global'. ─────────
const step5Schema = z.object({
  questions: z.array(z.object({
    id: z.string(),
    prompt: z.string().default(''),
  })),
});

wizardRouter.get('/step5-questions/:refId', async (req, res) => {
  const row = await prisma.wizardTemplate.findUnique({
    where: { kind_refId: { kind: 'step5-questions', refId: req.params.refId } },
  });
  let questions: z.infer<typeof step5Schema>['questions'] = [];
  if (row) {
    const parsed = step5Schema.safeParse((() => { try { return JSON.parse(row.data); } catch { return {}; } })());
    if (parsed.success) questions = parsed.data.questions;
  }
  res.json({ step5: { questions } });
});

wizardRouter.put('/step5-questions/:refId', requireDev, async (req, res) => {
  const parsed = step5Schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const data = JSON.stringify(parsed.data);
  await prisma.wizardTemplate.upsert({
    where: { kind_refId: { kind: 'step5-questions', refId: req.params.refId } },
    create: { kind: 'step5-questions', refId: req.params.refId, data },
    update: { data },
  });
  res.json({ ok: true });
});

// Step 6 written answers — same shape as Step 5, separate global question set.
wizardRouter.get('/step6-questions/:refId', async (req, res) => {
  const row = await prisma.wizardTemplate.findUnique({
    where: { kind_refId: { kind: 'step6-questions', refId: req.params.refId } },
  });
  let questions: z.infer<typeof step5Schema>['questions'] = [];
  if (row) {
    const parsed = step5Schema.safeParse((() => { try { return JSON.parse(row.data); } catch { return {}; } })());
    if (parsed.success) questions = parsed.data.questions;
  }
  res.json({ step6: { questions } });
});

wizardRouter.put('/step6-questions/:refId', requireDev, async (req, res) => {
  const parsed = step5Schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const data = JSON.stringify(parsed.data);
  await prisma.wizardTemplate.upsert({
    where: { kind_refId: { kind: 'step6-questions', refId: req.params.refId } },
    create: { kind: 'step6-questions', refId: req.params.refId, data },
    update: { data },
  });
  res.json({ ok: true });
});

// Ancestry Core Attributes (Step 1) — same shape, keyed by the Ancestry id.
wizardRouter.get('/ancestry-core/:refId', async (req, res) => {
  const row = await prisma.wizardTemplate.findUnique({
    where: { kind_refId: { kind: 'ancestry-core', refId: req.params.refId } },
  });
  let attributes: z.infer<typeof coreSchema>['attributes'] = defaultCore();
  if (row) {
    const parsed = coreSchema.safeParse((() => { try { return JSON.parse(row.data); } catch { return {}; } })());
    if (parsed.success) attributes = parsed.data.attributes;
  }
  res.json({ core: { attributes } });
});

wizardRouter.put('/ancestry-core/:refId', requireDev, async (req, res) => {
  const parsed = coreSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const data = JSON.stringify(parsed.data);
  await prisma.wizardTemplate.upsert({
    where: { kind_refId: { kind: 'ancestry-core', refId: req.params.refId } },
    create: { kind: 'ancestry-core', refId: req.params.refId, data },
    update: { data },
  });
  res.json({ ok: true });
});
