import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

// "กระดานวิวรณ์" — hex battle maps inside a campaign. A campaign may keep
// several maps (scenes); one is flagged active for the players. Board state
// (tokens, pings) lives in `CampaignMap.data` as JSON; every mutation is a
// server-side read-modify-write of one key so concurrent edits don't clobber
// unrelated state (same pattern as the campaign loot/log/initiative routes).
export const boardsRouter = Router();
boardsRouter.use(requireAuth);

// ── shapes stored in CampaignMap.data ──
export interface BoardToken {
  id: string;
  kind: 'dweller' | 'monster' | 'custom';
  refId?: string; // characterId (dweller) or catalogItemId (monster)
  name: string;
  color: string;
  emoji?: string;
  q: number; // offset column
  r: number; // offset row
}
interface BoardPing { id: string; q: number; r: number; name: string; color: string; at: string }
interface BoardData { tokens?: BoardToken[]; pings?: BoardPing[] }

const parseData = (s: string): BoardData => { try { return JSON.parse(s) as BoardData; } catch { return {}; } };
const rid = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;

// Colors cycled across auto-created dweller tokens.
const TOKEN_COLORS = ['#e07a5f', '#2a5fbd', '#2f7d4f', '#8a5fc0', '#b4842a', '#c04a7a', '#2f8d8a', '#5f5030'];

type CampaignWithMembers = NonNullable<Awaited<ReturnType<typeof loadCampaign>>>;
async function loadCampaign(id: string) {
  return prisma.campaign.findUnique({ where: { id }, include: { members: { include: { character: true }, orderBy: { createdAt: 'asc' } } } });
}
const isMember = (c: CampaignWithMembers, meId: string) =>
  c.librarianUserId === meId || c.members.some((m) => m.character.ownerUserId === meId);

// Seed/refresh dweller tokens: one per campaign member, placed on the first
// free hexes along the top rows. Existing tokens keep their position.
function withMemberTokens(c: CampaignWithMembers, tokens: BoardToken[], cols: number): BoardToken[] {
  const out = [...tokens];
  const taken = new Set(out.map((t) => `${t.q},${t.r}`));
  const nextFree = () => {
    for (let r = 1; r < 999; r++) for (let q = 1; q < Math.max(2, cols - 1); q++) {
      if (!taken.has(`${q},${r}`)) { taken.add(`${q},${r}`); return { q, r }; }
    }
    return { q: 0, r: 0 };
  };
  c.members.forEach((m, i) => {
    if (out.some((t) => t.kind === 'dweller' && t.refId === m.characterId)) return;
    const pos = nextFree();
    out.push({ id: rid('t'), kind: 'dweller', refId: m.characterId, name: m.character.name || 'ตัวละคร', color: TOKEN_COLORS[i % TOKEN_COLORS.length], ...pos });
  });
  return out;
}

const serializeMap = (m: { id: string; name: string; isActive: boolean; cols: number; rows: number; data: string; updatedAt: Date }) => {
  const d = parseData(m.data);
  // Only ship pings from the last 30s — old ones are noise and get pruned on write.
  const cutoff = Date.now() - 30_000;
  return {
    id: m.id, name: m.name, isActive: m.isActive, cols: m.cols, rows: m.rows,
    tokens: Array.isArray(d.tokens) ? d.tokens : [],
    pings: (Array.isArray(d.pings) ? d.pings : []).filter((p) => new Date(p.at).getTime() > cutoff),
    updatedAt: m.updatedAt.toISOString(),
  };
};

// ── map management ──

boardsRouter.get('/:id/maps', async (req, res) => {
  const c = await loadCampaign(req.params.id);
  if (!c || !isMember(c, req.currentUser!.id)) { res.status(404).json({ error: 'ไม่พบแคมเปญ' }); return; }
  const maps = await prisma.campaignMap.findMany({ where: { campaignId: c.id }, orderBy: { createdAt: 'asc' } });
  res.json({ maps: maps.map((m) => ({ id: m.id, name: m.name, isActive: m.isActive, cols: m.cols, rows: m.rows })) });
});

boardsRouter.post('/:id/maps', async (req, res) => {
  const c = await loadCampaign(req.params.id);
  if (!c || c.librarianUserId !== req.currentUser!.id) { res.status(404).json({ error: 'ไม่พบแคมเปญ' }); return; }
  const name = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim() : 'แผนที่ใหม่';
  const cols = Math.min(60, Math.max(6, Math.round(Number(req.body?.cols) || 22)));
  const rows = Math.min(60, Math.max(6, Math.round(Number(req.body?.rows) || 15)));
  const count = await prisma.campaignMap.count({ where: { campaignId: c.id } });
  const tokens = withMemberTokens(c, [], cols);
  const map = await prisma.campaignMap.create({
    data: { campaignId: c.id, name, cols, rows, isActive: count === 0, data: JSON.stringify({ tokens }) },
  });
  res.status(201).json({ map: serializeMap(map) });
});

// Full board state — what the board page polls.
boardsRouter.get('/:id/maps/:mapId', async (req, res) => {
  const c = await loadCampaign(req.params.id);
  if (!c || !isMember(c, req.currentUser!.id)) { res.status(404).json({ error: 'ไม่พบแคมเปญ' }); return; }
  const map = await prisma.campaignMap.findFirst({ where: { id: req.params.mapId, campaignId: c.id } });
  if (!map) { res.status(404).json({ error: 'ไม่พบแผนที่' }); return; }
  res.json({ map: serializeMap(map) });
});

boardsRouter.patch('/:id/maps/:mapId', async (req, res) => {
  const c = await loadCampaign(req.params.id);
  if (!c || c.librarianUserId !== req.currentUser!.id) { res.status(404).json({ error: 'ไม่พบแคมเปญ' }); return; }
  const map = await prisma.campaignMap.findFirst({ where: { id: req.params.mapId, campaignId: c.id } });
  if (!map) { res.status(404).json({ error: 'ไม่พบแผนที่' }); return; }
  const patch: Record<string, unknown> = {};
  if (typeof req.body?.name === 'string' && req.body.name.trim()) patch.name = req.body.name.trim();
  if (req.body?.cols !== undefined) patch.cols = Math.min(60, Math.max(6, Math.round(Number(req.body.cols) || map.cols)));
  if (req.body?.rows !== undefined) patch.rows = Math.min(60, Math.max(6, Math.round(Number(req.body.rows) || map.rows)));
  // Shrinking the grid must not strand tokens outside it.
  if (patch.cols !== undefined || patch.rows !== undefined) {
    const cols = (patch.cols as number) ?? map.cols;
    const rows = (patch.rows as number) ?? map.rows;
    const d = parseData(map.data);
    d.tokens = (d.tokens ?? []).map((t) => ({ ...t, q: Math.min(t.q, cols - 1), r: Math.min(t.r, rows - 1) }));
    patch.data = JSON.stringify(d);
  }
  if (req.body?.isActive === true) {
    await prisma.campaignMap.updateMany({ where: { campaignId: c.id }, data: { isActive: false } });
    patch.isActive = true;
  }
  const updated = await prisma.campaignMap.update({ where: { id: map.id }, data: patch });
  res.json({ map: serializeMap(updated) });
});

boardsRouter.delete('/:id/maps/:mapId', async (req, res) => {
  const c = await loadCampaign(req.params.id);
  if (!c || c.librarianUserId !== req.currentUser!.id) { res.status(404).json({ error: 'ไม่พบแคมเปญ' }); return; }
  await prisma.campaignMap.deleteMany({ where: { id: req.params.mapId, campaignId: c.id } });
  res.json({ ok: true });
});

// ── tokens ──

// Librarian adds a monster/custom token, or syncs missing member tokens.
boardsRouter.post('/:id/maps/:mapId/tokens', async (req, res) => {
  const c = await loadCampaign(req.params.id);
  if (!c || c.librarianUserId !== req.currentUser!.id) { res.status(404).json({ error: 'ไม่พบแคมเปญ' }); return; }
  const map = await prisma.campaignMap.findFirst({ where: { id: req.params.mapId, campaignId: c.id } });
  if (!map) { res.status(404).json({ error: 'ไม่พบแผนที่' }); return; }
  const d = parseData(map.data);
  let tokens = Array.isArray(d.tokens) ? d.tokens : [];
  if (req.body?.mode === 'sync-members') {
    tokens = withMemberTokens(c, tokens, map.cols);
  } else {
    const kind = req.body?.kind === 'monster' ? 'monster' : 'custom';
    const name = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim().slice(0, 60) : 'ตัวหมาก';
    const color = typeof req.body?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(req.body.color) ? req.body.color : kind === 'monster' ? '#b4513a' : '#5f5c54';
    const emoji = typeof req.body?.emoji === 'string' ? req.body.emoji.slice(0, 4) : undefined;
    const refId = typeof req.body?.refId === 'string' ? req.body.refId : undefined;
    // Place on the free hex nearest the board center.
    const taken = new Set(tokens.map((t) => `${t.q},${t.r}`));
    const cq = Math.floor(map.cols / 2), cr = Math.floor(map.rows / 2);
    let pos = { q: cq, r: cr };
    let bd = Infinity;
    for (let r = 0; r < map.rows; r++) for (let q = 0; q < map.cols; q++) {
      if (taken.has(`${q},${r}`)) continue;
      const dist = (q - cq) ** 2 + (r - cr) ** 2;
      if (dist < bd) { bd = dist; pos = { q, r }; }
    }
    tokens = [...tokens, { id: rid('t'), kind, refId, name, color, ...(emoji ? { emoji } : {}), ...pos }];
  }
  await prisma.campaignMap.update({ where: { id: map.id }, data: { data: JSON.stringify({ ...d, tokens }) } });
  res.json({ ok: true });
});

// Move — Librarian may move anything; a player only their own dweller token.
boardsRouter.post('/:id/maps/:mapId/tokens/:tokenId/move', async (req, res) => {
  const me = req.currentUser!.id;
  const c = await loadCampaign(req.params.id);
  if (!c || !isMember(c, me)) { res.status(404).json({ error: 'ไม่พบแคมเปญ' }); return; }
  const map = await prisma.campaignMap.findFirst({ where: { id: req.params.mapId, campaignId: c.id } });
  if (!map) { res.status(404).json({ error: 'ไม่พบแผนที่' }); return; }
  const d = parseData(map.data);
  const tokens = Array.isArray(d.tokens) ? d.tokens : [];
  const token = tokens.find((t) => t.id === req.params.tokenId);
  if (!token) { res.status(404).json({ error: 'ไม่พบตัวหมาก' }); return; }
  const ownsIt = token.kind === 'dweller' && !!token.refId &&
    c.members.some((m) => m.characterId === token.refId && m.character.ownerUserId === me);
  if (c.librarianUserId !== me && !ownsIt) { res.status(403).json({ error: 'ขยับได้เฉพาะตัวหมากของตัวเอง' }); return; }
  const q = Math.min(map.cols - 1, Math.max(0, Math.round(Number(req.body?.q) || 0)));
  const r = Math.min(map.rows - 1, Math.max(0, Math.round(Number(req.body?.r) || 0)));
  d.tokens = tokens.map((t) => (t.id === token.id ? { ...t, q, r } : t));
  await prisma.campaignMap.update({ where: { id: map.id }, data: { data: JSON.stringify(d) } });
  res.json({ ok: true });
});

boardsRouter.patch('/:id/maps/:mapId/tokens/:tokenId', async (req, res) => {
  const c = await loadCampaign(req.params.id);
  if (!c || c.librarianUserId !== req.currentUser!.id) { res.status(404).json({ error: 'ไม่พบแคมเปญ' }); return; }
  const map = await prisma.campaignMap.findFirst({ where: { id: req.params.mapId, campaignId: c.id } });
  if (!map) { res.status(404).json({ error: 'ไม่พบแผนที่' }); return; }
  const d = parseData(map.data);
  d.tokens = (Array.isArray(d.tokens) ? d.tokens : []).map((t) => {
    if (t.id !== req.params.tokenId) return t;
    return {
      ...t,
      ...(typeof req.body?.name === 'string' && req.body.name.trim() ? { name: req.body.name.trim().slice(0, 60) } : {}),
      ...(typeof req.body?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(req.body.color) ? { color: req.body.color } : {}),
      ...(typeof req.body?.emoji === 'string' ? { emoji: req.body.emoji.slice(0, 4) || undefined } : {}),
    };
  });
  await prisma.campaignMap.update({ where: { id: map.id }, data: { data: JSON.stringify(d) } });
  res.json({ ok: true });
});

boardsRouter.delete('/:id/maps/:mapId/tokens/:tokenId', async (req, res) => {
  const c = await loadCampaign(req.params.id);
  if (!c || c.librarianUserId !== req.currentUser!.id) { res.status(404).json({ error: 'ไม่พบแคมเปญ' }); return; }
  const map = await prisma.campaignMap.findFirst({ where: { id: req.params.mapId, campaignId: c.id } });
  if (!map) { res.status(404).json({ error: 'ไม่พบแผนที่' }); return; }
  const d = parseData(map.data);
  d.tokens = (Array.isArray(d.tokens) ? d.tokens : []).filter((t) => t.id !== req.params.tokenId);
  await prisma.campaignMap.update({ where: { id: map.id }, data: { data: JSON.stringify(d) } });
  res.json({ ok: true });
});

// ── ping (everyone) — a short-lived "look here" marker broadcast to the party ──
boardsRouter.post('/:id/maps/:mapId/ping', async (req, res) => {
  const me = req.currentUser!;
  const c = await loadCampaign(req.params.id);
  if (!c || !isMember(c, me.id)) { res.status(404).json({ error: 'ไม่พบแคมเปญ' }); return; }
  const map = await prisma.campaignMap.findFirst({ where: { id: req.params.mapId, campaignId: c.id } });
  if (!map) { res.status(404).json({ error: 'ไม่พบแผนที่' }); return; }
  const d = parseData(map.data);
  const q = Math.min(map.cols - 1, Math.max(0, Math.round(Number(req.body?.q) || 0)));
  const r = Math.min(map.rows - 1, Math.max(0, Math.round(Number(req.body?.r) || 0)));
  // Ping color: the pinger's own dweller token color, or a neutral for the GM.
  const myToken = (Array.isArray(d.tokens) ? d.tokens : []).find(
    (t) => t.kind === 'dweller' && c.members.some((m) => m.characterId === t.refId && m.character.ownerUserId === me.id),
  );
  const color = c.librarianUserId === me.id ? '#15140f' : myToken?.color ?? '#e07a5f';
  const name = c.librarianUserId === me.id ? 'Librarian 📖' : myToken?.name ?? me.displayName;
  const cutoff = Date.now() - 30_000;
  const pings = (Array.isArray(d.pings) ? d.pings : []).filter((p) => new Date(p.at).getTime() > cutoff);
  d.pings = [...pings, { id: rid('p'), q, r, name, color, at: new Date().toISOString() }].slice(-20);
  await prisma.campaignMap.update({ where: { id: map.id }, data: { data: JSON.stringify(d) } });
  res.json({ ok: true });
});
