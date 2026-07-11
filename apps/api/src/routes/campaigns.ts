import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { toCharacter } from '../serialize.js';

// Campaigns: a Librarian (GM) runs a campaign; players join with a code and add
// one character. The Librarian may open every member's Dweller Sheet and
// broadcast Buff/Debuff. `data` (JSON) holds clock/calendar/notes shared state.
export const campaignsRouter = Router();
campaignsRouter.use(requireAuth);

function genCode() {
  const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => s[Math.floor(Math.random() * s.length)]).join('');
}

const parseData = (s: string) => { try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; } };

function serializeCampaign(c: {
  id: string; name: string; joinCode: string; librarianUserId: string; data: string;
  createdAt: Date; updatedAt: Date;
  members: { id: string; characterId: string; character: Parameters<typeof toCharacter>[0] }[];
}, meId: string) {
  return {
    id: c.id,
    name: c.name,
    joinCode: c.joinCode,
    librarianUserId: c.librarianUserId,
    isLibrarian: c.librarianUserId === meId,
    data: parseData(c.data),
    members: c.members.map((m) => ({ memberId: m.id, character: toCharacter(m.character) })),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

const withMembers = { members: { include: { character: true }, orderBy: { createdAt: 'asc' as const } } };

// List: campaigns I run + campaigns my characters are in.
campaignsRouter.get('/', async (req, res) => {
  const me = req.currentUser!.id;
  const led = await prisma.campaign.findMany({ where: { librarianUserId: me }, include: withMembers, orderBy: { updatedAt: 'desc' } });
  const joined = await prisma.campaign.findMany({
    where: { librarianUserId: { not: me }, members: { some: { character: { ownerUserId: me } } } },
    include: withMembers, orderBy: { updatedAt: 'desc' },
  });
  res.json({
    led: led.map((c) => serializeCampaign(c, me)),
    joined: joined.map((c) => serializeCampaign(c, me)),
  });
});

campaignsRouter.post('/', async (req, res) => {
  const name = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim() : 'แคมเปญใหม่';
  let joinCode = genCode();
  for (let i = 0; i < 5; i++) { if (!(await prisma.campaign.findUnique({ where: { joinCode } }))) break; joinCode = genCode(); }
  const c = await prisma.campaign.create({ data: { name, librarianUserId: req.currentUser!.id, joinCode }, include: withMembers });
  res.status(201).json({ campaign: serializeCampaign(c, req.currentUser!.id) });
});

// Access a campaign if I'm the librarian or one of my characters is a member.
async function loadIfMember(id: string, meId: string) {
  const c = await prisma.campaign.findUnique({ where: { id }, include: withMembers });
  if (!c) return null;
  const ok = c.librarianUserId === meId || c.members.some((m) => m.character.ownerUserId === meId);
  return ok ? c : null;
}

campaignsRouter.get('/:id', async (req, res) => {
  const c = await loadIfMember(req.params.id, req.currentUser!.id);
  if (!c) { res.status(404).json({ error: 'ไม่พบแคมเปญ' }); return; }
  res.json({ campaign: serializeCampaign(c, req.currentUser!.id) });
});

const patchInput = z.object({ name: z.string().optional(), data: z.record(z.unknown()).optional() });
campaignsRouter.patch('/:id', async (req, res) => {
  const c = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!c || c.librarianUserId !== req.currentUser!.id) { res.status(404).json({ error: 'ไม่พบแคมเปญ' }); return; }
  const parsed = patchInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' }); return; }
  const updated = await prisma.campaign.update({
    where: { id: req.params.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.data !== undefined ? { data: JSON.stringify(parsed.data.data) } : {}),
    },
    include: withMembers,
  });
  res.json({ campaign: serializeCampaign(updated, req.currentUser!.id) });
});

campaignsRouter.delete('/:id', async (req, res) => {
  await prisma.campaign.deleteMany({ where: { id: req.params.id, librarianUserId: req.currentUser!.id } });
  res.json({ ok: true });
});

// Join with a code, bringing one of my characters in.
campaignsRouter.post('/join', async (req, res) => {
  const me = req.currentUser!.id;
  const joinCode = String(req.body?.joinCode ?? '').trim().toUpperCase();
  const characterId = String(req.body?.characterId ?? '');
  if (!joinCode || !characterId) { res.status(400).json({ error: 'กรอกรหัสและเลือกตัวละคร' }); return; }
  const campaign = await prisma.campaign.findUnique({ where: { joinCode } });
  if (!campaign) { res.status(404).json({ error: 'ไม่พบแคมเปญจากรหัสนี้' }); return; }
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.ownerUserId !== me) { res.status(404).json({ error: 'ไม่พบตัวละคร' }); return; }
  const existing = await prisma.campaignMember.findUnique({ where: { characterId } });
  if (existing) { res.status(400).json({ error: 'ตัวละครนี้อยู่ในแคมเปญอื่นแล้ว' }); return; }
  await prisma.campaignMember.create({ data: { campaignId: campaign.id, characterId } });
  const full = await prisma.campaign.findUnique({ where: { id: campaign.id }, include: withMembers });
  res.status(201).json({ campaign: serializeCampaign(full!, me) });
});

// Remove a member (librarian, or the character's owner).
campaignsRouter.delete('/:id/members/:characterId', async (req, res) => {
  const me = req.currentUser!.id;
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  const character = await prisma.character.findUnique({ where: { id: req.params.characterId } });
  if (!campaign || !character) { res.status(404).json({ error: 'ไม่พบข้อมูล' }); return; }
  if (campaign.librarianUserId !== me && character.ownerUserId !== me) { res.status(403).json({ error: 'ไม่มีสิทธิ์' }); return; }
  await prisma.campaignMember.deleteMany({ where: { campaignId: req.params.id, characterId: req.params.characterId } });
  res.json({ ok: true });
});

// Librarian broadcasts Buff/Debuff to every member's Dweller Sheet.
const statusInput = z.object({
  buffsOn: z.record(z.boolean()).optional(),
  statusOn: z.record(z.boolean()).optional(),
  targetCharacterIds: z.array(z.string()).optional(), // omit = all members
});
campaignsRouter.post('/:id/apply-status', async (req, res) => {
  const c = await prisma.campaign.findUnique({ where: { id: req.params.id }, include: withMembers });
  if (!c || c.librarianUserId !== req.currentUser!.id) { res.status(404).json({ error: 'ไม่พบแคมเปญ' }); return; }
  const parsed = statusInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' }); return; }
  const { buffsOn, statusOn, targetCharacterIds } = parsed.data;
  const targets = c.members.filter((m) => !targetCharacterIds || targetCharacterIds.includes(m.characterId));
  for (const m of targets) {
    const data = parseData(m.character.data);
    const sheet = (data.sheet && typeof data.sheet === 'object' ? data.sheet : {}) as Record<string, unknown>;
    const curBuffs = (sheet.buffsOn && typeof sheet.buffsOn === 'object' ? sheet.buffsOn : {}) as Record<string, boolean>;
    const curStatus = (sheet.statusOn && typeof sheet.statusOn === 'object' ? sheet.statusOn : {}) as Record<string, boolean>;
    const nextBuffs = { ...curBuffs };
    const nextStatus = { ...curStatus };
    if (buffsOn) for (const [k, v] of Object.entries(buffsOn)) { if (v) nextBuffs[k] = true; else delete nextBuffs[k]; }
    if (statusOn) for (const [k, v] of Object.entries(statusOn)) { if (v) nextStatus[k] = true; else delete nextStatus[k]; }
    data.sheet = { ...sheet, buffsOn: nextBuffs, statusOn: nextStatus };
    await prisma.character.update({ where: { id: m.characterId }, data: { data: JSON.stringify(data) } });
  }
  const full = await prisma.campaign.findUnique({ where: { id: req.params.id }, include: withMembers });
  res.json({ campaign: serializeCampaign(full!, req.currentUser!.id) });
});
