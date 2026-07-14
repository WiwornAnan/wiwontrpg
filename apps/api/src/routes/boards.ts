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
interface BoardBg { url: string; w: number; x: number; y: number; opacity: number }
interface PaletteEntry { id: string; color: string; label: string }
interface BoardAura {
  id: string;
  by: string; // creator userId (may delete their own)
  radius: number; // in hexes
  color: string;
  label: string;
  follow: boolean; // true = moves with the token, false = static snapshot
  tokenId?: string;
  q?: number;
  r?: number;
}
interface BoardData {
  tokens?: BoardToken[];
  pings?: BoardPing[];
  bg?: BoardBg | null;
  palette?: PaletteEntry[];
  terrain?: Record<string, string>; // "q,r" -> palette entry id
  elev?: Record<string, number>; // "q,r" -> height level (−9..9, 0 = flat/absent)
  fog?: Record<string, 1>; // "q,r" -> hidden from players
  auras?: BoardAura[];
  metersPerHex?: number; // real-world scale for the measure tool
}

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
    bg: d.bg ?? null,
    palette: Array.isArray(d.palette) ? d.palette : null,
    terrain: d.terrain && typeof d.terrain === 'object' ? d.terrain : {},
    elev: d.elev && typeof d.elev === 'object' ? d.elev : {},
    fog: d.fog && typeof d.fog === 'object' ? d.fog : {},
    auras: Array.isArray(d.auras) ? d.auras : [],
    metersPerHex: Number(d.metersPerHex) > 0 ? Number(d.metersPerHex) : 1.5,
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
  // Follow-auras attached to the removed token go with it.
  d.auras = (Array.isArray(d.auras) ? d.auras : []).filter((a) => !(a.follow && a.tokenId === req.params.tokenId));
  await prisma.campaignMap.update({ where: { id: map.id }, data: { data: JSON.stringify(d) } });
  res.json({ ok: true });
});

// ── board layers (Librarian) ──

// Background image + terrain palette.
boardsRouter.patch('/:id/maps/:mapId/board', async (req, res) => {
  const c = await loadCampaign(req.params.id);
  if (!c || c.librarianUserId !== req.currentUser!.id) { res.status(404).json({ error: 'ไม่พบแคมเปญ' }); return; }
  const map = await prisma.campaignMap.findFirst({ where: { id: req.params.mapId, campaignId: c.id } });
  if (!map) { res.status(404).json({ error: 'ไม่พบแผนที่' }); return; }
  const d = parseData(map.data);
  if ('bg' in (req.body ?? {})) {
    const bg = req.body.bg as Record<string, unknown> | null;
    d.bg = bg && typeof bg.url === 'string' && bg.url.startsWith('/uploads/')
      ? {
          url: bg.url,
          w: Math.min(20000, Math.max(50, Number(bg.w) || 800)),
          x: Math.max(-20000, Math.min(20000, Number(bg.x) || 0)),
          y: Math.max(-20000, Math.min(20000, Number(bg.y) || 0)),
          opacity: Math.min(1, Math.max(0.1, Number(bg.opacity) || 1)),
        }
      : null;
  }
  if (Array.isArray(req.body?.palette)) {
    d.palette = (req.body.palette as Record<string, unknown>[])
      .slice(0, 24)
      .filter((p) => typeof p.id === 'string' && typeof p.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.color))
      .map((p) => ({ id: String(p.id).slice(0, 24), color: String(p.color), label: String(p.label ?? '').slice(0, 40) }));
  }
  if (req.body?.metersPerHex !== undefined) {
    d.metersPerHex = Math.min(100000, Math.max(0.01, Number(req.body.metersPerHex) || 1.5));
  }
  await prisma.campaignMap.update({ where: { id: map.id }, data: { data: JSON.stringify(d) } });
  res.json({ ok: true });
});

// ── auras (พื้นที่อาณาเขต) — a hex-radius zone, following a token or static ──
// Librarian may create around any token; a player around their own dweller.
boardsRouter.post('/:id/maps/:mapId/auras', async (req, res) => {
  const me = req.currentUser!.id;
  const c = await loadCampaign(req.params.id);
  if (!c || !isMember(c, me)) { res.status(404).json({ error: 'ไม่พบแคมเปญ' }); return; }
  const map = await prisma.campaignMap.findFirst({ where: { id: req.params.mapId, campaignId: c.id } });
  if (!map) { res.status(404).json({ error: 'ไม่พบแผนที่' }); return; }
  const d = parseData(map.data);
  const tokens = Array.isArray(d.tokens) ? d.tokens : [];
  const token = tokens.find((t) => t.id === String(req.body?.tokenId ?? ''));
  if (!token) { res.status(404).json({ error: 'ไม่พบตัวหมาก' }); return; }
  const ownsIt = token.kind === 'dweller' && !!token.refId &&
    c.members.some((m) => m.characterId === token.refId && m.character.ownerUserId === me);
  if (c.librarianUserId !== me && !ownsIt) { res.status(403).json({ error: 'สร้างอาณาเขตได้เฉพาะตัวหมากของตัวเอง' }); return; }
  const follow = req.body?.follow === true;
  const aura: BoardAura = {
    id: rid('a'),
    by: me,
    radius: Math.min(30, Math.max(1, Math.round(Number(req.body?.radius) || 2))),
    color: typeof req.body?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(req.body.color) ? req.body.color : '#8a5fc0',
    label: String(req.body?.label ?? '').slice(0, 40),
    follow,
    ...(follow ? { tokenId: token.id } : { q: token.q, r: token.r }),
  };
  d.auras = [...(Array.isArray(d.auras) ? d.auras : []), aura].slice(-40);
  await prisma.campaignMap.update({ where: { id: map.id }, data: { data: JSON.stringify(d) } });
  res.json({ ok: true });
});

boardsRouter.delete('/:id/maps/:mapId/auras/:auraId', async (req, res) => {
  const me = req.currentUser!.id;
  const c = await loadCampaign(req.params.id);
  if (!c || !isMember(c, me)) { res.status(404).json({ error: 'ไม่พบแคมเปญ' }); return; }
  const map = await prisma.campaignMap.findFirst({ where: { id: req.params.mapId, campaignId: c.id } });
  if (!map) { res.status(404).json({ error: 'ไม่พบแผนที่' }); return; }
  const d = parseData(map.data);
  const auras = Array.isArray(d.auras) ? d.auras : [];
  const aura = auras.find((a) => a.id === req.params.auraId);
  if (!aura) { res.json({ ok: true }); return; }
  if (c.librarianUserId !== me && aura.by !== me) { res.status(403).json({ error: 'ลบได้เฉพาะอาณาเขตของตัวเอง' }); return; }
  d.auras = auras.filter((a) => a.id !== req.params.auraId);
  await prisma.campaignMap.update({ where: { id: map.id }, data: { data: JSON.stringify(d) } });
  res.json({ ok: true });
});

// Batch-set cells for one layer (a brush stroke arrives as one request).
// terrain: v = palette entry id | '' (erase) · elev: v = level −9..9 (0 erases) · fog: v = 1 | 0
boardsRouter.post('/:id/maps/:mapId/cells', async (req, res) => {
  const c = await loadCampaign(req.params.id);
  if (!c || c.librarianUserId !== req.currentUser!.id) { res.status(404).json({ error: 'ไม่พบแคมเปญ' }); return; }
  const map = await prisma.campaignMap.findFirst({ where: { id: req.params.mapId, campaignId: c.id } });
  if (!map) { res.status(404).json({ error: 'ไม่พบแผนที่' }); return; }
  const layer = String(req.body?.layer ?? '');
  const cells = Array.isArray(req.body?.cells) ? (req.body.cells as Record<string, unknown>[]).slice(0, 4000) : [];
  if (!['terrain', 'elev', 'fog'].includes(layer) || cells.length === 0) { res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' }); return; }
  const d = parseData(map.data);
  const terrain = { ...(d.terrain ?? {}) };
  const elev = { ...(d.elev ?? {}) };
  const fog = { ...(d.fog ?? {}) };
  for (const cell of cells) {
    const q = Math.round(Number(cell.q));
    const r = Math.round(Number(cell.r));
    if (!isFinite(q) || !isFinite(r) || q < 0 || r < 0 || q >= map.cols || r >= map.rows) continue;
    const key = `${q},${r}`;
    if (layer === 'terrain') {
      const v = String(cell.v ?? '');
      if (v) terrain[key] = v.slice(0, 24); else delete terrain[key];
    } else if (layer === 'elev') {
      const v = Math.max(-9, Math.min(9, Math.round(Number(cell.v) || 0)));
      if (v !== 0) elev[key] = v; else delete elev[key];
    } else {
      if (Number(cell.v) === 1) fog[key] = 1; else delete fog[key];
    }
  }
  d.terrain = terrain; d.elev = elev; d.fog = fog;
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
