import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { toCharacter } from '../serialize.js';

// A player's own "Dweller" characters (draft + completed). All routes require
// login; a user can only see and edit their own characters.
export const charactersRouter = Router();

charactersRouter.use(requireAuth);

// Access rule: the owner, or the Librarian of a campaign this character is in.
async function canAccess(characterId: string, ownerUserId: string, meId: string): Promise<boolean> {
  if (ownerUserId === meId) return true;
  const member = await prisma.campaignMember.findUnique({ where: { characterId }, include: { campaign: true } });
  return !!member && member.campaign.librarianUserId === meId;
}

charactersRouter.get('/', async (req, res) => {
  const rows = await prisma.character.findMany({
    where: { ownerUserId: req.currentUser!.id },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ characters: rows.map(toCharacter) });
});

charactersRouter.get('/:id', async (req, res) => {
  const row = await prisma.character.findUnique({ where: { id: req.params.id } });
  if (!row || !(await canAccess(row.id, row.ownerUserId, req.currentUser!.id))) {
    res.status(404).json({ error: 'ไม่พบตัวละคร' });
    return;
  }
  res.json({ character: toCharacter(row) });
});

charactersRouter.post('/', async (req, res) => {
  const row = await prisma.character.create({
    data: { ownerUserId: req.currentUser!.id },
  });
  res.status(201).json({ character: toCharacter(row) });
});

const patchInput = z.object({
  name: z.string().optional(),
  status: z.enum(['draft', 'complete']).optional(),
  step: z.number().int().min(0).optional(),
  relatedWiwonId: z.string().nullable().optional(),
  data: z.record(z.unknown()).optional(),
});

charactersRouter.patch('/:id', async (req, res) => {
  const existing = await prisma.character.findUnique({ where: { id: req.params.id } });
  if (!existing || !(await canAccess(existing.id, existing.ownerUserId, req.currentUser!.id))) {
    res.status(404).json({ error: 'ไม่พบตัวละคร' });
    return;
  }
  const parsed = patchInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    return;
  }
  const d = parsed.data;
  const row = await prisma.character.update({
    where: { id: req.params.id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.step !== undefined ? { step: d.step } : {}),
      ...(d.relatedWiwonId !== undefined ? { relatedWiwonId: d.relatedWiwonId } : {}),
      ...(d.data !== undefined ? { data: JSON.stringify(d.data) } : {}),
    },
  });
  res.json({ character: toCharacter(row) });
});

charactersRouter.delete('/:id', async (req, res) => {
  await prisma.character.deleteMany({ where: { id: req.params.id, ownerUserId: req.currentUser!.id } });
  res.json({ ok: true });
});
