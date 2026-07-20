import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, uploadImage } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Modal } from '../components/Modal';
import { Button } from '../components/ui';
import { CatalogDetail } from '../components/CatalogDetail';
import { CATALOG_CONFIGS } from '@wiwonanant/shared';
import type { CatalogItem } from '@wiwonanant/shared';
import type { CampaignDTO } from '../data/statusEffects';
import { BUFF_EFFECTS, STATUS_EFFECTS } from '../data/statusEffects';
import layout from '../components/layout.module.css';

// ── "กระดานวิวรณ์" — the campaign hex battle board ──

interface BoardToken { id: string; kind: 'dweller' | 'monster' | 'custom'; refId?: string; name: string; color: string; emoji?: string; q: number; r: number; size?: number; facing?: number; tail?: { q: number; r: number }[]; hidden?: boolean }
interface BoardPing { id: string; q: number; r: number; name: string; color: string; at: string }
interface BoardBg { url: string; w: number; x: number; y: number; opacity: number }
interface PaletteEntry { id: string; color: string; label: string }
interface BoardAura { id: string; by: string; radius: number; color: string; label: string; follow: boolean; tokenId?: string; q?: number; r?: number }
interface BoardMap {
  id: string; name: string; isActive: boolean; cols: number; rows: number;
  tokens: BoardToken[]; pings: BoardPing[];
  bg: BoardBg | null; palette: PaletteEntry[] | null;
  terrain: Record<string, string>; elev: Record<string, number>; fog: Record<string, 1>;
  auras: BoardAura[]; metersPerHex: number;
  updatedAt: string;
}
interface MapMeta { id: string; name: string; isActive: boolean; cols: number; rows: number }

// Terrain palette shown until the Librarian customises it (then stored on the map).
const DEFAULT_PALETTE: PaletteEntry[] = [
  { id: 'water', color: '#4a7fb5', label: 'น้ำ' },
  { id: 'forest', color: '#4a7d4f', label: 'ป่า' },
  { id: 'mountain', color: '#8d7a5a', label: 'ภูเขา / หิน' },
  { id: 'sand', color: '#d9c48a', label: 'ทราย / ถนน' },
  { id: 'wall', color: '#3c3a33', label: 'กำแพง / สิ่งกีดขวาง' },
];

type Tool = 'move' | 'paint' | 'erase' | 'elev-up' | 'elev-down' | 'fog-hide' | 'fog-reveal' | 'measure';
type CellLayer = 'terrain' | 'elev' | 'fog';

// Pointy-top hexes on an odd-r offset grid.
const SQ3 = Math.sqrt(3);
const HEX = 34; // hex radius in board units
const hexX = (q: number, r: number) => HEX * SQ3 * (q + 0.5 * (r & 1)) + HEX * SQ3 * 0.75;
const hexY = (r: number) => HEX * 1.5 * r + HEX;
const boardW = (cols: number) => HEX * SQ3 * (cols + 0.75);
const boardH = (rows: number) => HEX * 1.5 * (rows + 0.8);
const CORNERS = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 180) * (60 * i - 30);
  return [Math.cos(a) * HEX, Math.sin(a) * HEX] as const;
});
const hexPoints = (q: number, r: number) => CORNERS.map(([dx, dy]) => `${(hexX(q, r) + dx).toFixed(1)},${(hexY(r) + dy).toFixed(1)}`).join(' ');
// Nearest in-grid hex to a board-space point (brute force — grids are small).
function nearestHex(x: number, y: number, cols: number, rows: number): { q: number; r: number } | null {
  let best: { q: number; r: number } | null = null;
  let bd = Infinity;
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const d = (hexX(q, r) - x) ** 2 + (hexY(r) - y) ** 2;
    if (d < bd) { bd = d; best = { q, r }; }
  }
  return bd <= (HEX * 1.5) ** 2 ? best : null;
}

// Hex distance on the odd-r offset grid (offset → cube coords → cube distance).
function hexDist(a: { q: number; r: number }, b: { q: number; r: number }): number {
  const ax = a.q - ((a.r - (a.r & 1)) / 2), az = a.r, ay = -ax - az;
  const bx = b.q - ((b.r - (b.r & 1)) / 2), bz = b.r, by = -bx - bz;
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}
function hexNeighbors(p: { q: number; r: number }, cols: number, rows: number): { q: number; r: number }[] {
  const odd = p.r & 1;
  const deltas = odd
    ? [[1, 0], [-1, 0], [1, -1], [0, -1], [1, 1], [0, 1]]
    : [[1, 0], [-1, 0], [0, -1], [-1, -1], [0, 1], [-1, 1]];
  return deltas.map(([dq, dr]) => ({ q: p.q + dq, r: p.r + dr })).filter((n) => n.q >= 0 && n.r >= 0 && n.q < cols && n.r < rows);
}
// Rope-pull a snake tail behind a moved head (mirror of the server logic, for
// the optimistic update so the body follows the drag instantly).
function dragTail(head: { q: number; r: number }, tail: { q: number; r: number }[], cols: number, rows: number): { q: number; r: number }[] {
  let ahead = head;
  return tail.map((seg) => {
    if (hexDist(seg, ahead) <= 1) { ahead = seg; return seg; }
    const options = hexNeighbors(ahead, cols, rows);
    let best = options[0] ?? seg;
    let bd = Infinity;
    for (const n of options) { const dist = hexDist(n, seg); if (dist < bd) { bd = dist; best = n; } }
    ahead = best;
    return best;
  });
}

const num = (v: unknown, def = 0) => (typeof v === 'number' && isFinite(v) ? v : def);
const WOUND_NAMES = ['ปกติ', 'First Blood', 'Impaired', 'Suppressed', 'Desperate Edge', "Death's Door"];
const buffLabel = (k: string) => BUFF_EFFECTS.find((e) => e[0] === k)?.[1] ?? k;
const statusLabel = (k: string) => STATUS_EFFECTS.find((e) => e[0] === k)?.[1] ?? k;
const SWATCHES = ['#e07a5f', '#2a5fbd', '#2f7d4f', '#8a5fc0', '#b4842a', '#c04a7a', '#2f8d8a', '#5f5030', '#b4513a', '#15140f'];
const miniBtn: React.CSSProperties = { width: 24, height: 24, flex: 'none', border: '1px solid #e0ded7', background: '#fff', color: '#6b6860', borderRadius: 7, fontSize: 13, fontWeight: 800, cursor: 'pointer', lineHeight: 1 };

// Topographic elevation bands — each level gets its own distinct colour so height
// reads at a glance (warm earth going up, deepening blue going down).
const ELEV_UP = ['#efe3bd', '#e8d193', '#ddbc6d', '#d0a64f', '#c29038', '#b27b28', '#a1681d', '#8f5715', '#7d480f'];
const ELEV_DOWN = ['#c6dbe9', '#9fc3da', '#7aaac9', '#5b91b6', '#44799f', '#356387', '#2a4f6f', '#213d58', '#192e43'];
const elevFill = (v: number) => (v > 0 ? ELEV_UP[Math.min(v, 9) - 1] : ELEV_DOWN[Math.min(-v, 9) - 1]);
// Shared-edge corner pairs per neighbor direction (pointy-top, odd-r offset) —
// used to draw "cliff" lines where the ground drops between two hexes.
const edgeDirs = (r: number): [number, number, number, number][] => (r & 1
  ? [[1, 0, 0, 1], [-1, 0, 3, 4], [1, 1, 1, 2], [0, 1, 2, 3], [1, -1, 5, 0], [0, -1, 4, 5]]
  : [[1, 0, 0, 1], [-1, 0, 3, 4], [0, 1, 1, 2], [-1, 1, 2, 3], [0, -1, 5, 0], [-1, -1, 4, 5]]);

async function fetchMonsters(): Promise<CatalogItem[]> {
  const out: CatalogItem[] = [];
  for (let page = 1; page < 50; page++) {
    const d = await api.get<{ items: CatalogItem[]; total: number }>(`/catalog/monster?scope=all&page=${page}`);
    out.push(...d.items);
    if (d.items.length === 0 || out.length >= d.total) break;
  }
  return out;
}

export function BoardPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: campData } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api.get<{ campaign: CampaignDTO }>(`/campaigns/${id}`),
    enabled: !!id && !!user,
    refetchInterval: 20000, // heavy (member sheets) + rarely changes during a battle
    refetchIntervalInBackground: false,
  });
  const c = campData?.campaign;

  const { data: mapsData } = useQuery({
    queryKey: ['board-maps', id],
    queryFn: () => api.get<{ maps: MapMeta[] }>(`/campaigns/${id}/maps`),
    enabled: !!id && !!user,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
  const maps = mapsData?.maps ?? [];
  const activeMap = maps.find((m) => m.isActive);

  const [selMapId, setSelMapId] = useState<string | null>(null);
  const mapId = c?.isLibrarian ? (selMapId && maps.some((m) => m.id === selMapId) ? selMapId : activeMap?.id ?? maps[0]?.id) : activeMap?.id;

  const boardKey = ['board', id, mapId];
  const { data: boardData } = useQuery({
    queryKey: boardKey,
    queryFn: () => api.get<{ map: BoardMap }>(`/campaigns/${id}/maps/${mapId}`),
    enabled: !!id && !!user && !!mapId,
    // The live board — the one poll that must feel responsive. 4s (up from 2s)
    // roughly halves its egress while token moves still sync quickly enough.
    refetchInterval: 4000,
    refetchIntervalInBackground: false,
  });
  const map = boardData?.map;
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['board', id] }); qc.invalidateQueries({ queryKey: ['board-maps', id] }); };

  // ── mutations ──
  const createMap = useMutation({
    mutationFn: (b: { name: string; cols: number; rows: number }) => api.post<{ map: BoardMap }>(`/campaigns/${id}/maps`, b),
    onSuccess: (d) => { invalidate(); setSelMapId(d.map.id); setNewOpen(false); },
  });
  const patchMap = useMutation({
    mutationFn: (b: Record<string, unknown>) => api.patch(`/campaigns/${id}/maps/${mapId}`, b),
    onSuccess: () => { invalidate(); },
  });
  const deleteMap = useMutation({
    mutationFn: () => api.delete(`/campaigns/${id}/maps/${mapId}`),
    onSuccess: () => { setSelMapId(null); setSettingsOpen(false); invalidate(); },
  });
  const addToken = useMutation({
    mutationFn: (b: Record<string, unknown>) => api.post(`/campaigns/${id}/maps/${mapId}/tokens`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey }),
  });
  const moveToken = useMutation({
    mutationFn: (v: { tokenId: string; q: number; r: number }) => api.post(`/campaigns/${id}/maps/${mapId}/tokens/${v.tokenId}/move`, { q: v.q, r: v.r }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: boardKey });
      const prev = qc.getQueryData<{ map: BoardMap }>(boardKey);
      if (prev) qc.setQueryData(boardKey, { map: { ...prev.map, tokens: prev.map.tokens.map((t) => {
        if (t.id !== v.tokenId) return t;
        const moved = { ...t, q: v.q, r: v.r };
        if (t.tail?.length) moved.tail = dragTail({ q: v.q, r: v.r }, t.tail, prev.map.cols, prev.map.rows);
        return moved;
      }) } });
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(boardKey, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: boardKey }),
  });
  const patchToken = useMutation({
    mutationFn: (v: { tokenId: string } & Record<string, unknown>) => { const { tokenId, ...b } = v; return api.patch(`/campaigns/${id}/maps/${mapId}/tokens/${tokenId}`, b); },
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey }),
  });
  const deleteToken = useMutation({
    mutationFn: (tokenId: string) => api.delete(`/campaigns/${id}/maps/${mapId}/tokens/${tokenId}`),
    onSuccess: () => { setSelToken(null); qc.invalidateQueries({ queryKey: boardKey }); },
  });
  const tokenTail = useMutation({
    mutationFn: (v: { tokenId: string; op: 'add' | 'remove' }) => api.post(`/campaigns/${id}/maps/${mapId}/tokens/${v.tokenId}/tail`, { op: v.op }),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey }),
  });
  const sendPing = useMutation({
    mutationFn: (v: { q: number; r: number }) => api.post(`/campaigns/${id}/maps/${mapId}/ping`, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey }),
  });
  const patchBoard = useMutation({
    mutationFn: (b: { bg?: BoardBg | null; palette?: PaletteEntry[]; metersPerHex?: number }) => api.patch(`/campaigns/${id}/maps/${mapId}/board`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey }),
  });
  const paintCells = useMutation({
    mutationFn: (b: { layer: CellLayer; cells: { q: number; r: number; v: string | number }[] }) => api.post(`/campaigns/${id}/maps/${mapId}/cells`, b),
  });
  const clearCells = useMutation({
    mutationFn: (layer: CellLayer) => api.post(`/campaigns/${id}/maps/${mapId}/cells/clear`, { layer }),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey }),
  });
  const addAura = useMutation({
    mutationFn: (b: { tokenId: string; radius: number; color: string; label: string; follow: boolean }) => api.post(`/campaigns/${id}/maps/${mapId}/auras`, b),
    onSuccess: () => { setAuraForm(null); qc.invalidateQueries({ queryKey: boardKey }); },
  });
  const delAura = useMutation({
    mutationFn: (auraId: string) => api.delete(`/campaigns/${id}/maps/${mapId}/auras/${auraId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey }),
  });

  // ── view (pan/zoom) + interaction state ──
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 30, y: 20, k: 1 });
  const viewRef = useRef(view); viewRef.current = view;
  const [drag, setDrag] = useState<{ token: BoardToken; x: number; y: number; moved: boolean } | null>(null);
  const dragRef = useRef(drag); dragRef.current = drag;
  const [selTokenId, setSelToken] = useState<string | null>(null);
  const [monsterInfo, setMonsterInfo] = useState<string | null>(null); // refId whose full data is open
  const [newOpen, setNewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [monPicker, setMonPicker] = useState(false);
  const [monQuery, setMonQuery] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [, setTick] = useState(0); // re-render for ping fade-out

  // ── map tools ──
  const [tool, setTool] = useState<Tool>('move');
  const [paintId, setPaintId] = useState(DEFAULT_PALETTE[0].id);
  const [showElevNums, setShowElevNums] = useState(true);
  // Measure: A → (hover) → B. Distance in hexes × metersPerHex.
  const [meas, setMeas] = useState<{ a: { q: number; r: number }; b?: { q: number; r: number } } | null>(null);
  const [measHover, setMeasHover] = useState<{ q: number; r: number } | null>(null);
  // Aura creation form (opened from the token info panel).
  const [auraForm, setAuraForm] = useState<{ tokenId: string; radius: number; color: string; label: string; follow: boolean } | null>(null);
  // Brush strokes render locally first (survives the 2s polls), then flush on release.
  const overlay = useRef(new Map<string, { layer: CellLayer; v: string | number }>());
  const [overlayBump, bumpOverlay] = useState(0);
  const bgRatioRef = useRef(new Map<string, number>()); // bg url -> naturalH/naturalW

  // Locally-seen time per ping id — pings render for 6s from when THIS client first saw them.
  const pingSeen = useRef(new Map<string, number>());
  const pings = (map?.pings ?? []).filter((p) => {
    if (!pingSeen.current.has(p.id)) pingSeen.current.set(p.id, Date.now());
    return Date.now() - (pingSeen.current.get(p.id) ?? 0) < 6000;
  });
  // Only tick (to fade pings) while pings actually exist — otherwise the whole
  // board would needlessly re-render twice a second.
  const anyPing = (map?.pings?.length ?? 0) > 0;
  useEffect(() => {
    if (!anyPing) return;
    const iv = window.setInterval(() => setTick((t) => t + 1), 700);
    return () => window.clearInterval(iv);
  }, [anyPing]);

  const toBoard = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - v.x) / v.k, y: (clientY - rect.top - v.y) / v.k };
  };

  const canMove = (t: BoardToken) =>
    !!c && (c.isLibrarian || (t.kind === 'dweller' && !!t.refId && c.members.some((m) => m.character.id === t.refId && m.character.ownerUserId === user?.id)));

  // Layer readers: a fresh brush stroke (local overlay) wins over server data.
  const cellTerrain = (key: string) => { const o = overlay.current.get(key); return o && o.layer === 'terrain' ? String(o.v) : map?.terrain[key] ?? ''; };
  const cellElev = (key: string) => { const o = overlay.current.get(key); return o && o.layer === 'elev' ? Number(o.v) : map?.elev[key] ?? 0; };
  const cellFog = (key: string) => { const o = overlay.current.get(key); return o && o.layer === 'fog' ? Number(o.v) === 1 : !!map?.fog[key]; };

  // Pan: drag the background. Window-level listeners (same pattern as the float windows).
  const startPan = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    const { x: ox, y: oy } = viewRef.current;
    const onMove = (ev: PointerEvent) => setView((v) => ({ ...v, x: ox + (ev.clientX - sx), y: oy + (ev.clientY - sy) }));
    const end = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  // Brush stroke: paint hexes locally while dragging, flush one batch on release.
  const startStroke = (e: React.PointerEvent) => {
    if (e.button !== 0 || !map) return;
    const layer: CellLayer = tool === 'paint' || tool === 'erase' ? 'terrain' : tool === 'elev-up' || tool === 'elev-down' ? 'elev' : 'fog';
    const strokeCells = new Map<string, string | number>();
    const applyAt = (clientX: number, clientY: number) => {
      const p = toBoard(clientX, clientY);
      const hex = nearestHex(p.x, p.y, map.cols, map.rows);
      if (!hex) return;
      const key = `${hex.q},${hex.r}`;
      if (strokeCells.has(key)) return; // each hex once per stroke (matters for ▲▼)
      let v: string | number;
      if (tool === 'paint') v = paintId;
      else if (tool === 'erase') v = '';
      else if (tool === 'elev-up') v = Math.min(9, cellElev(key) + 1);
      else if (tool === 'elev-down') v = Math.max(-9, cellElev(key) - 1);
      else v = tool === 'fog-hide' ? 1 : 0;
      strokeCells.set(key, v);
      overlay.current.set(key, { layer, v });
      bumpOverlay((n) => n + 1);
    };
    applyAt(e.clientX, e.clientY);
    const onMove = (ev: PointerEvent) => applyAt(ev.clientX, ev.clientY);
    const end = () => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
      if (strokeCells.size === 0) return;
      const cells = [...strokeCells].map(([k, v]) => { const [q, r] = k.split(',').map(Number); return { q, r, v }; });
      paintCells.mutate({ layer, cells }, {
        onSettled: async () => {
          await qc.invalidateQueries({ queryKey: boardKey });
          // Drop only overlay entries this stroke owns (a newer stroke may have repainted them).
          strokeCells.forEach((v, k) => { const o = overlay.current.get(k); if (o && o.layer === layer && o.v === v) overlay.current.delete(k); });
          bumpOverlay((n) => n + 1);
        },
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  // Measure clicks: 1st = anchor, 2nd = freeze target, 3rd = new anchor.
  const measureClick = (e: React.PointerEvent) => {
    if (!map) return;
    const p = toBoard(e.clientX, e.clientY);
    const hex = nearestHex(p.x, p.y, map.cols, map.rows);
    if (!hex) return;
    setMeas((m) => (!m || m.b ? { a: hex } : { a: m.a, b: hex }));
  };

  const onSvgDown = (e: React.PointerEvent) => {
    if (!c?.isLibrarian && tool !== 'move' && tool !== 'measure') { startPan(e); return; }
    if (tool === 'move') startPan(e);
    else if (tool === 'measure') measureClick(e);
    else startStroke(e);
  };
  const onSvgMove = (e: React.PointerEvent) => {
    if (tool !== 'measure' || !meas || meas.b || !map) return;
    const p = toBoard(e.clientX, e.clientY);
    setMeasHover(nearestHex(p.x, p.y, map.cols, map.rows));
  };

  // Token drag → snap to nearest hex on release; a near-still release = select.
  const startTokenDrag = (e: React.PointerEvent, t: BoardToken) => {
    if (e.button !== 0) return;
    if (tool !== 'move') return; // let the stroke/measure handler on the svg take it
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const movable = canMove(t);
    setDrag({ token: t, x: hexX(t.q, t.r), y: hexY(t.r), moved: false });
    // Coalesce pointer moves to one state update per animation frame — the pointer
    // fires far faster than we can repaint, and without this the queue backs up
    // and the drag feels laggy.
    let raf = 0; let pending: { x: number; y: number; moved: boolean } | null = null;
    const onMove = (ev: PointerEvent) => {
      if (!movable && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 6) return;
      const p = toBoard(ev.clientX, ev.clientY);
      pending = { x: p.x, y: p.y, moved: Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 6 };
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; if (pending) setDrag((d) => (d ? { ...d, x: pending!.x, y: pending!.y, moved: d.moved || pending!.moved } : d)); });
    };
    const end = (ev: PointerEvent) => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
      const cur = dragRef.current;
      setDrag(null);
      if (!cur || !map) return;
      if (!cur.moved) { setSelToken((s) => (s === t.id ? null : t.id)); return; }
      if (!movable) return;
      const p = toBoard(ev.clientX, ev.clientY);
      const hex = nearestHex(p.x, p.y, map.cols, map.rows);
      if (hex && (hex.q !== t.q || hex.r !== t.r)) moveToken.mutate({ tokenId: t.id, ...hex });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  // Wheel-zoom toward the cursor. A native non-passive listener so we can
  // preventDefault (React's synthetic wheel handlers are passive at the root).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      setView((v) => {
        const k = Math.min(3, Math.max(0.3, v.k * (e.deltaY < 0 ? 1.12 : 0.9)));
        return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [map ? map.id : '']); // eslint-disable-line react-hooks/exhaustive-deps
  const zoomBy = (f: number) => setView((v) => ({ ...v, k: Math.min(3, Math.max(0.3, v.k * f)) }));

  // Fit the whole grid on screen — on first load of each map and on ⟳.
  const fitView = () => {
    const el = svgRef.current;
    if (!el || !map) return;
    const rect = el.getBoundingClientRect();
    const bw = boardW(map.cols), bh = boardH(map.rows);
    const k = Math.min(2, Math.max(0.3, Math.min(rect.width / bw, rect.height / bh) * 0.94));
    setView({ x: (rect.width - bw * k) / 2, y: Math.max(10, (rect.height - bh * k) / 2), k });
  };
  const fittedMap = useRef('');
  useEffect(() => {
    if (map && fittedMap.current !== map.id) { fittedMap.current = map.id; fitView(); }
  }, [map?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDblClick = (e: React.MouseEvent) => {
    if (!map) return;
    const p = toBoard(e.clientX, e.clientY);
    const hex = nearestHex(p.x, p.y, map.cols, map.rows);
    if (hex) sendPing.mutate(hex);
  };

  const { data: monsters } = useQuery({ queryKey: ['board-monsters'], queryFn: fetchMonsters, enabled: monPicker });
  const selected = map?.tokens.find((t) => t.id === selTokenId) ?? null;
  const selMember = selected?.kind === 'dweller' ? c?.members.find((m) => m.character.id === selected.refId) : undefined;
  const { data: monItemData } = useQuery({
    queryKey: ['board-monster-item', selected?.refId],
    queryFn: () => api.get<{ item: CatalogItem }>(`/catalog/monster/item/${selected!.refId}`),
    enabled: !!selected && selected.kind === 'monster' && !!selected.refId,
  });
  const monInfoItem = monsterInfo && monItemData?.item.id === monsterInfo ? monItemData.item : null;

  // hexes render list (memo — only changes with grid size)
  const hexes = useMemo(() => {
    if (!map) return [];
    const out: { q: number; r: number; pts: string }[] = [];
    for (let r = 0; r < map.rows; r++) for (let q = 0; q < map.cols; q++) out.push({ q, r, pts: hexPoints(q, r) });
    return out;
  }, [map?.cols, map?.rows]); // eslint-disable-line react-hooks/exhaustive-deps

  // Background image aspect ratio (loaded once per url so <image> gets a height).
  const [bgRatio, setBgRatio] = useState(0);
  useEffect(() => {
    const url = map?.bg?.url;
    if (!url) { setBgRatio(0); return; }
    const cached = bgRatioRef.current.get(url);
    if (cached) { setBgRatio(cached); return; }
    const img = new Image();
    img.onload = () => { const ratio = img.naturalHeight / Math.max(1, img.naturalWidth); bgRatioRef.current.set(url, ratio); setBgRatio(ratio); };
    img.src = url;
  }, [map?.bg?.url]);

  // The board's *static* layers (grid, terrain, elevation, cliffs, auras, fog)
  // are expensive to build (hundreds of SVG nodes + per-hex neighbour maths).
  // Memoising them means dragging a token — which only changes `drag` — no longer
  // rebuilds the whole map on every pointer move, killing the lag.
  const staticLayers = useMemo(() => {
    if (!map) return null;
    const pal = map.palette && map.palette.length ? map.palette : DEFAULT_PALETTE;
    const pById = new Map(pal.map((p) => [p.id, p] as const));
    const isLib = !!c?.isLibrarian;
    const auras = (map.auras ?? []).flatMap((a) => {
      if (a.follow) { const t = map.tokens.find((x) => x.id === a.tokenId); return t ? [{ ...a, cq: t.q, cr: t.r }] : []; }
      return [{ ...a, cq: a.q ?? 0, cr: a.r ?? 0 }];
    });
    return (
      <>
        {map.bg && bgRatio > 0 && (
          <image href={map.bg.url} x={map.bg.x} y={map.bg.y} width={map.bg.w} height={map.bg.w * bgRatio} opacity={map.bg.opacity} preserveAspectRatio="none" pointerEvents="none" />
        )}
        {hexes.map((h) => {
          const key = `${h.q},${h.r}`;
          const ter = cellTerrain(key);
          const col = ter ? pById.get(ter)?.color : undefined;
          return <polygon key={key} points={h.pts} fill={col ?? (map.bg ? 'transparent' : '#fbf9f4')} fillOpacity={col ? 0.62 : 1} stroke="#c9c2b2" strokeWidth={1} />;
        })}
        {hexes.map((h) => {
          const key = `${h.q},${h.r}`;
          const v = cellElev(key);
          if (v === 0) return null;
          return (
            <g key={`e${key}`} pointerEvents="none">
              <polygon points={h.pts} fill={elevFill(v)} fillOpacity={v > 0 ? 0.55 : 0.6} />
              {showElevNums && (
                <text x={hexX(h.q, h.r)} y={hexY(h.r) - HEX * 0.45} textAnchor="middle" style={{ fontSize: 9.5, fontWeight: 800, fill: v > 0 ? '#6b4a17' : '#1c3a56', paintOrder: 'stroke', stroke: '#ffffffcc', strokeWidth: 2.5 }}>{v > 0 ? `+${v}` : v}</text>
              )}
            </g>
          );
        })}
        {hexes.map((h) => {
          const v = cellElev(`${h.q},${h.r}`);
          const cx = hexX(h.q, h.r), cy = hexY(h.r);
          const lines: React.ReactNode[] = [];
          for (const [dq, dr, c1, c2] of edgeDirs(h.r)) {
            const nq = h.q + dq, nr = h.r + dr;
            if (nq < 0 || nr < 0 || nq >= map.cols || nr >= map.rows) continue;
            const nv = cellElev(`${nq},${nr}`);
            if (nv >= v) continue;
            lines.push(<line key={`${dq},${dr}`} x1={cx + CORNERS[c1][0]} y1={cy + CORNERS[c1][1]} x2={cx + CORNERS[c2][0]} y2={cy + CORNERS[c2][1]} stroke={v > 0 || nv >= 0 ? '#5c4a2e' : '#16324f'} strokeWidth={1.6 + Math.min(v - nv, 4) * 0.9} strokeOpacity={0.55} strokeLinecap="round" />);
          }
          return lines.length ? <g key={`cl${h.q},${h.r}`} pointerEvents="none">{lines}</g> : null;
        })}
        {auras.map((a) => {
          const cells = hexes.filter((h) => hexDist({ q: h.q, r: h.r }, { q: a.cq, r: a.cr }) <= a.radius);
          return (
            <g key={a.id} pointerEvents="none">
              {cells.map((h) => <polygon key={`${a.id}${h.q},${h.r}`} points={h.pts} fill={a.color} fillOpacity={0.18} />)}
              {cells.filter((h) => hexDist({ q: h.q, r: h.r }, { q: a.cq, r: a.cr }) === a.radius).map((h) => (
                <polygon key={`${a.id}o${h.q},${h.r}`} points={h.pts} fill="none" stroke={a.color} strokeWidth={1.6} strokeOpacity={0.55} />
              ))}
              {a.label && <text x={hexX(a.cq, a.cr)} y={hexY(a.cr) + HEX * 1.1} textAnchor="middle" style={{ fontSize: 10.5, fontWeight: 800, fill: a.color, paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>◎ {a.label}</text>}
            </g>
          );
        })}
        {hexes.map((h) => {
          const key = `${h.q},${h.r}`;
          if (!cellFog(key)) return null;
          return <polygon key={`f${key}`} points={h.pts} fill="#262019" fillOpacity={isLib ? 0.3 : 0.97} stroke={isLib ? '#26201955' : '#1b1712'} strokeWidth={1} pointerEvents="none" />;
        })}
      </>
    );
    // Rebuilds only when the map data, grid, bg, elev-number toggle, viewer role
    // or a live brush stroke changes — NOT while dragging a token.
  }, [map, hexes, bgRatio, showElevNums, c?.isLibrarian, overlayBump]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return <div className={layout.page} style={{ paddingTop: 40 }}><Link to="/login">เข้าสู่ระบบ</Link></div>;
  if (!c) return <div className={layout.page} style={{ paddingTop: 40, color: '#a8a59d' }}>กำลังโหลด…</div>;

  // ── derived render data ──
  const palette = map?.palette && map.palette.length ? map.palette : DEFAULT_PALETTE;
  // Current initiative turn → highlight the matching token on the board.
  const initiative = Array.isArray(c.data.initiative) ? (c.data.initiative as { id: string; name: string }[]) : [];
  const initTurn = typeof c.data.initTurn === 'string' ? (c.data.initTurn as string) : '';
  const turnEntry = initiative.find((e) => e.id === initTurn);
  const isTurnToken = (t: BoardToken) =>
    !!turnEntry && (turnEntry.id === `d:${t.refId}` || (t.kind !== 'dweller' && turnEntry.name === t.name));
  // Auras resolved to a center (follow → the token's live position).
  const resolvedAuras = (map?.auras ?? []).flatMap((a) => {
    if (a.follow) {
      const t = map?.tokens.find((x) => x.id === a.tokenId);
      return t ? [{ ...a, cq: t.q, cr: t.r, tokenName: t.name }] : [];
    }
    return [{ ...a, cq: a.q ?? 0, cr: a.r ?? 0, tokenName: '' }];
  });
  const canDelAura = (a: BoardAura) => c.isLibrarian || a.by === user.id;
  // Player fog rule: fogged cells hide other people's tokens (own stays visible).
  const isMine = (t: BoardToken) => t.kind === 'dweller' && !!t.refId && c.members.some((m) => m.character.id === t.refId && m.character.ownerUserId === user.id);
  const tokenHidden = (t: BoardToken) => !c.isLibrarian && cellFog(`${t.q},${t.r}`) && !isMine(t);
  // Measure numbers (hex count + real distance from the map scale).
  const measB = meas?.b ?? measHover;
  const measInfo = map && meas && measB ? (() => {
    const dist = hexDist(meas.a, measB);
    const meters = dist * map.metersPerHex;
    const distTxt = meters >= 1000 ? `${(meters / 1000).toLocaleString('th-TH', { maximumFractionDigits: 2 })} กม.` : `${meters.toLocaleString('th-TH', { maximumFractionDigits: 1 })} ม.`;
    const dElev = cellElev(`${measB.q},${measB.r}`) - cellElev(`${meas.a.q},${meas.a.r}`);
    return { dist, distTxt, dElev };
  })() : null;

  const btn: React.CSSProperties = { border: '1px solid #e0ded7', background: '#fff', color: '#5f5c54', borderRadius: 9, padding: '7px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
  const chip = (on: boolean): React.CSSProperties => ({ ...btn, background: on ? '#15140f' : '#fff', color: on ? '#fff' : '#5f5c54', borderColor: on ? '#15140f' : '#e0ded7' });

  return (
    <div className={layout.page} style={{ paddingTop: 20, maxWidth: 1400 }}>
      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <Link to={`/campaign/${id}`} style={{ fontSize: 12.5, color: '#8d8a82', textDecoration: 'none', flex: 'none' }}>← กลับแคมเปญ</Link>
        <span style={{ fontSize: 17, fontWeight: 800, color: '#2f2c25', display: 'inline-flex', alignItems: 'center', gap: 7 }}>🗺 กระดานวิวรณ์ <span style={{ fontSize: 12, fontWeight: 600, color: '#a8a59d' }}>· {c.name}</span></span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => zoomBy(0.85)} style={btn} title="ซูมออก">−</button>
          <span style={{ fontSize: 11.5, color: '#8d8a82', minWidth: 40, textAlign: 'center' }}>{Math.round(view.k * 100)}%</span>
          <button onClick={() => zoomBy(1.18)} style={btn} title="ซูมเข้า">＋</button>
          <button onClick={fitView} style={btn} title="ปรับให้พอดีจอ">⟳</button>
        </span>
      </div>

      {/* librarian: map tabs + tools */}
      {c.isLibrarian && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {maps.map((m) => (
            <button key={m.id} onClick={() => setSelMapId(m.id)} style={chip(m.id === mapId)} title={m.isActive ? 'แผนที่ที่ผู้เล่นเห็นอยู่' : undefined}>
              {m.isActive ? '● ' : ''}{m.name}
            </button>
          ))}
          <button onClick={() => setNewOpen(true)} style={{ ...btn, color: '#e07a5f', borderColor: '#f0cabd' }}>＋ แผนที่</button>
          {map && (
            <>
              <span style={{ width: 1, height: 22, background: '#e4e2dc', margin: '0 4px' }} />
              {!map.isActive && <button onClick={() => patchMap.mutate({ isActive: true })} style={{ ...btn, background: '#2f6b4f', color: '#fff', borderColor: '#2f6b4f' }}>▶ ใช้แผนที่นี้กับผู้เล่น</button>}
              <button onClick={() => setMonPicker(true)} style={{ ...btn, color: '#b4513a', borderColor: '#f0d3cb' }}>👹 มอนสเตอร์</button>
              <button onClick={() => setCustomOpen(true)} style={btn}>🚩 ตัวหมาก</button>
              <button onClick={() => addToken.mutate({ mode: 'sync-members' })} style={btn} title="เพิ่มตัวละครสมาชิกที่ยังไม่อยู่บนกระดาน">👥 ซิงก์ตัวละคร</button>
              <button onClick={() => setSettingsOpen(true)} style={btn}>⚙ ตั้งค่า</button>
            </>
          )}
        </div>
      )}
      {!c.isLibrarian && map && <div style={{ fontSize: 12.5, color: '#8d8a82', marginBottom: 10 }}>แผนที่: <b style={{ color: '#46443c' }}>{map.name}</b></div>}

      {/* tools row */}
      {map && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {([
            ['move', '🖐 เลื่อน/ย้าย'],
            ['measure', '📏 วัดระยะ'],
            ...(c.isLibrarian ? [
              ['paint', '🖌 ระบายสี'],
              ['erase', '🧽 ลบสี'],
              ['elev-up', '▲ ยกพื้น'],
              ['elev-down', '▼ กดพื้น'],
              ['fog-hide', '🌫 ซ่อน (หมอก)'],
              ['fog-reveal', '☀ เปิดหมอก'],
            ] as [Tool, string][] : []),
          ] as [Tool, string][]).map(([t, label]) => (
            <button key={t} onClick={() => { setTool(t); if (t !== 'measure') { setMeas(null); setMeasHover(null); } }} style={chip(tool === t)}>{label}</button>
          ))}
          <button onClick={() => setShowElevNums((s) => !s)} style={{ ...btn, opacity: showElevNums ? 1 : 0.55 }} title="แสดง/ซ่อนตัวเลขระดับความสูง">🔢 เลขระดับ</button>
          {c.isLibrarian && (tool === 'elev-up' || tool === 'elev-down') && (
            <button onClick={() => { if (window.confirm('รีเซ็ตระดับพื้นทั้งแผนที่กลับเป็น 0?')) clearCells.mutate('elev'); }} style={{ ...btn, color: '#b4513a', borderColor: '#f0d3cb' }} title="ปรับพื้นทั้งแผนที่กลับเป็นระดับ 0">⟲ รีเซ็ตระดับเป็น 0</button>
          )}
          {tool === 'paint' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 4, padding: '4px 9px', background: '#faf9f7', border: '1px solid #ece9e3', borderRadius: 10 }}>
              {(map.palette && map.palette.length ? map.palette : DEFAULT_PALETTE).map((p) => (
                <button key={p.id} onClick={() => setPaintId(p.id)} title={p.label} style={{ width: 22, height: 22, borderRadius: 6, background: p.color, border: paintId === p.id ? '2.5px solid #15140f' : '2.5px solid #fff', outline: '1px solid #d8d5ce', cursor: 'pointer', padding: 0, flex: 'none' }} />
              ))}
            </span>
          )}
          {tool === 'measure' && map && (
            <span style={{ fontSize: 11.5, color: '#8a6a3a', background: '#fbf3dd', border: '1px solid #e6c98a', borderRadius: 8, padding: '4px 11px' }}>
              1 ช่อง = {map.metersPerHex.toLocaleString('th-TH')} ม.{c.isLibrarian ? ' (แก้ได้ใน ⚙ ตั้งค่า)' : ''}
            </span>
          )}
        </div>
      )}

      {/* board */}
      {!map ? (
        <div style={{ border: '1px dashed #d8d5ce', borderRadius: 16, padding: '70px 20px', textAlign: 'center', color: '#a8a59d', background: '#faf9f7' }}>
          {c.isLibrarian ? (
            <>
              <div style={{ fontSize: 34, marginBottom: 10 }}>🗺</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#6b6860', marginBottom: 14 }}>ยังไม่มีแผนที่ในแคมเปญนี้</div>
              <button onClick={() => setNewOpen(true)} style={{ border: 'none', background: '#e07a5f', color: '#fff', borderRadius: 10, padding: '11px 22px', fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}>＋ สร้างแผนที่แรก</button>
            </>
          ) : (
            <div style={{ fontSize: 13.5 }}>Librarian ยังไม่เปิดแผนที่ — รอสักครู่…</div>
          )}
        </div>
      ) : (
        <div style={{ position: 'relative', border: '1px solid #e4e2dc', borderRadius: 16, overflow: 'hidden', background: '#f4f0e8' }}>
          <svg
            ref={svgRef}
            style={{ display: 'block', width: '100%', height: 'calc(100vh - 268px)', minHeight: 420, touchAction: 'none', cursor: tool === 'move' ? 'grab' : 'crosshair', userSelect: 'none' }}
            onPointerDown={onSvgDown}
            onPointerMove={onSvgMove}
            onDoubleClick={onDblClick}
          >
            <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
              {/* static layers (grid / terrain / elevation / cliffs / auras / fog) — memoised */}
              {staticLayers}
              {/* drag target highlight */}
              {drag && drag.moved && canMove(drag.token) && (() => {
                const hex = nearestHex(drag.x, drag.y, map.cols, map.rows);
                return hex ? <polygon points={hexPoints(hex.q, hex.r)} fill="#e07a5f22" stroke="#e07a5f" strokeWidth={2} /> : null;
              })()}
              {/* measure line */}
              {meas && measB && measInfo && (() => {
                const x1 = hexX(meas.a.q, meas.a.r), y1 = hexY(meas.a.r);
                const x2 = hexX(measB.q, measB.r), y2 = hexY(measB.r);
                return (
                  <g pointerEvents="none">
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#b4842a" strokeWidth={3} strokeDasharray="7 5" strokeLinecap="round" />
                    <circle cx={x1} cy={y1} r={6} fill="#b4842a" />
                    <circle cx={x2} cy={y2} r={6} fill="#b4842a" />
                    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 12} textAnchor="middle" style={{ fontSize: 13.5, fontWeight: 800, fill: '#8a6a3a', paintOrder: 'stroke', stroke: '#fff', strokeWidth: 4 }}>
                      {measInfo.dist} ช่อง · {measInfo.distTxt}{measInfo.dElev !== 0 ? ` · ${measInfo.dElev > 0 ? `↑ สูงขึ้น +${measInfo.dElev}` : `↓ ต่ำลง ${measInfo.dElev}`}` : ''}
                    </text>
                  </g>
                );
              })()}
              {/* pings */}
              {pings.map((p) => (
                <g key={p.id} pointerEvents="none">
                  <circle cx={hexX(p.q, p.r)} cy={hexY(p.r)} r={7} fill={p.color} opacity={0.9} />
                  <circle cx={hexX(p.q, p.r)} cy={hexY(p.r)} fill="none" stroke={p.color} strokeWidth={3}>
                    <animate attributeName="r" values="9;32" dur="1.1s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.85;0" dur="1.1s" repeatCount="indefinite" />
                  </circle>
                  <text x={hexX(p.q, p.r)} y={hexY(p.r) - 16} textAnchor="middle" style={{ fontSize: 11, fontWeight: 800, fill: p.color, paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>📍 {p.name}</text>
                </g>
              ))}
              {/* snake tails — beneath every head so bodies never cover faces */}
              {map.tokens.filter((t) => !tokenHidden(t)).map((t) => {
                if (!t.tail?.length) return null;
                const ghost = !!t.hidden; // only the Librarian ever receives hidden ones
                const segR = HEX * 0.42 * Math.min(t.size ?? 1, 1.6);
                const pts = [{ q: t.q, r: t.r }, ...t.tail];
                return (
                  <g key={`tail${t.id}`} pointerEvents="none" opacity={ghost ? 0.4 : 0.9}>
                    {pts.slice(1).map((seg, i) => {
                      const prev = pts[i];
                      return <line key={`l${i}`} x1={hexX(prev.q, prev.r)} y1={hexY(prev.r)} x2={hexX(seg.q, seg.r)} y2={hexY(seg.r)} stroke={t.color} strokeWidth={segR * 1.1} strokeLinecap="round" opacity={0.55} />;
                    })}
                    {t.tail.map((seg, i) => (
                      <circle key={i} cx={hexX(seg.q, seg.r)} cy={hexY(seg.r)} r={segR * (1 - (i / Math.max(1, t.tail!.length)) * 0.35)} fill={t.color} stroke="#fff" strokeWidth={1.5} />
                    ))}
                  </g>
                );
              })}
              {/* tokens */}
              {map.tokens.filter((t) => !tokenHidden(t)).map((t) => {
                const isDrag = drag?.token.id === t.id && drag.moved;
                const x = isDrag ? drag.x : hexX(t.q, t.r);
                const y = isDrag ? drag.y : hexY(t.r);
                const movable = canMove(t);
                const sel = t.id === selTokenId;
                const turn = isTurnToken(t);
                const sz = t.size ?? 1;
                const R = HEX * 0.6 * sz;
                const ghost = !!t.hidden; // Librarian-only preview of an unrevealed token
                return (
                  <g
                    key={t.id}
                    transform={`translate(${x},${y})`}
                    onPointerDown={(e) => startTokenDrag(e, t)}
                    style={{ cursor: tool !== 'move' ? 'crosshair' : movable ? 'grab' : 'pointer' }}
                    opacity={ghost ? 0.45 : 1}
                  >
                    {turn && (
                      <circle r={R + HEX * 0.26} fill="none" stroke="#e0a72a" strokeWidth={3.5}>
                        <animate attributeName="stroke-opacity" values="1;0.35;1" dur="1.4s" repeatCount="indefinite" />
                      </circle>
                    )}
                    {sel && <circle r={R + HEX * 0.18} fill="none" stroke="#e07a5f" strokeWidth={2.5} strokeDasharray="5 4" />}
                    {/* facing arrow — the "head" direction */}
                    {t.facing !== undefined && (
                      <g transform={`rotate(${(t.facing % 6) * 60})`} pointerEvents="none">
                        <polygon points={`${R + 15},0 ${R + 4},-7 ${R + 4},7`} fill={t.color} stroke="#fff" strokeWidth={1.5} strokeLinejoin="round" />
                      </g>
                    )}
                    <circle r={R} fill={t.color} stroke="#fff" strokeWidth={movable ? 3 : 2} strokeDasharray={ghost ? '5 4' : undefined} opacity={isDrag ? 0.85 : 1} />
                    <text y={(t.emoji ? 7 : 6) * sz} textAnchor="middle" style={{ fontSize: (t.emoji ? 20 : 17) * sz, fontWeight: 800, fill: '#fff', pointerEvents: 'none' }}>
                      {t.emoji ?? (t.kind === 'monster' ? '👹' : (t.name || '?').charAt(0).toUpperCase())}
                    </text>
                    {turn && <text y={-(R + HEX * 0.35)} textAnchor="middle" style={{ fontSize: 10.5, fontWeight: 800, fill: '#b4842a', paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>◆ ถึงตา</text>}
                    {ghost && <text y={-(R + 7)} textAnchor="middle" style={{ fontSize: 11, pointerEvents: 'none' }}>🙈</text>}
                    <text y={R + 15} textAnchor="middle" style={{ fontSize: 11.5, fontWeight: 700, fill: '#3c3a33', paintOrder: 'stroke', stroke: '#fbf9f4', strokeWidth: 3.5, pointerEvents: 'none' }}>
                      {t.name.length > 14 ? t.name.slice(0, 13) + '…' : t.name}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* hint bar */}
          <div style={{ position: 'absolute', left: 10, bottom: 10, fontSize: 10.5, color: '#8d8a82', background: 'rgba(255,255,255,.85)', border: '1px solid #e4e2dc', borderRadius: 8, padding: '5px 10px', pointerEvents: 'none', maxWidth: '55%' }}>
            {tool === 'measure' ? 'คลิกจุดแรก แล้วคลิกจุดปลายเพื่อวัดระยะ · คลิกอีกครั้งเริ่มใหม่'
              : tool !== 'move' ? 'คลิก/ลากบนช่องเพื่อระบาย · สลับกลับ 🖐 เพื่อเลื่อนแผนที่'
              : `ลากพื้นหลัง = เลื่อน · ล้อเมาส์ = ซูม · ดับเบิลคลิก = 📍 ชี้จุดให้ทุกคนเห็น${c.isLibrarian || map.tokens.some(canMove) ? ' · ลากตัวหมาก = ย้าย' : ''}`}
          </div>

          {/* terrain legend (ตารางบอกสี) — everyone sees; Librarian edits */}
          <div style={{ position: 'absolute', right: 10, bottom: 10, width: c.isLibrarian ? 210 : 170, background: 'rgba(255,255,255,.94)', border: '1px solid #e4e2dc', borderRadius: 11, padding: '9px 11px', maxHeight: 240, overflowY: 'auto' }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', color: '#a8a59d', marginBottom: 6 }}>สัญลักษณ์สี</div>
            {palette.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                {c.isLibrarian
                  ? <input type="color" value={p.color} onChange={(e) => patchBoard.mutate({ palette: palette.map((x) => (x.id === p.id ? { ...x, color: e.target.value } : x)) })} style={{ width: 18, height: 18, padding: 0, border: 'none', background: 'none', cursor: 'pointer', flex: 'none' }} />
                  : <span style={{ width: 13, height: 13, borderRadius: 4, background: p.color, flex: 'none', border: '1px solid rgba(0,0,0,.15)' }} />}
                {c.isLibrarian
                  ? <input key={p.id + p.label} defaultValue={p.label} placeholder="ความหมาย…" onBlur={(e) => { if (e.target.value !== p.label) patchBoard.mutate({ palette: palette.map((x) => (x.id === p.id ? { ...x, label: e.target.value } : x)) }); }} style={{ flex: 1, minWidth: 0, border: 'none', borderBottom: '1px dashed #e0ded7', background: 'transparent', outline: 'none', fontSize: 11.5, color: '#46443c' }} />
                  : <span style={{ flex: 1, fontSize: 11.5, color: '#46443c' }}>{p.label || '—'}</span>}
                {c.isLibrarian && palette.length > 1 && <button onClick={() => patchBoard.mutate({ palette: palette.filter((x) => x.id !== p.id) })} title="ลบสีนี้" style={{ border: 'none', background: 'none', color: '#cb5a44', cursor: 'pointer', fontSize: 12, flex: 'none', padding: 0 }}>×</button>}
              </div>
            ))}
            {c.isLibrarian && (
              <button onClick={() => patchBoard.mutate({ palette: [...palette, { id: `c${Date.now().toString(36)}`, color: '#888888', label: '' }] })} style={{ marginTop: 3, border: '1px dashed #d8d5ce', background: '#fff', color: '#8d8a82', borderRadius: 7, padding: '3px 10px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', width: '100%' }}>＋ เพิ่มสี</button>
            )}
          </div>

          {/* aura list — anyone can see; delete if yours (or Librarian) */}
          {resolvedAuras.length > 0 && (
            <div style={{ position: 'absolute', left: 10, top: 10, width: 200, background: 'rgba(255,255,255,.94)', border: '1px solid #e4e2dc', borderRadius: 11, padding: '9px 11px', maxHeight: 220, overflowY: 'auto' }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', color: '#a8a59d', marginBottom: 6 }}>◎ อาณาเขต ({resolvedAuras.length})</div>
              {resolvedAuras.map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: a.color, flex: 'none', border: '1px solid rgba(0,0,0,.15)' }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: '#46443c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.label || 'อาณาเขต'} · {a.radius} ช่อง {a.follow ? `· 🔗 ${a.tokenName}` : '· 📍 ปักหมุด'}
                  </span>
                  {canDelAura(a) && <button onClick={() => delAura.mutate(a.id)} title="ลบอาณาเขต" style={{ border: 'none', background: 'none', color: '#cb5a44', cursor: 'pointer', fontSize: 12, flex: 'none', padding: 0 }}>×</button>}
                </div>
              ))}
            </div>
          )}

          {/* selected token info */}
          {selected && (
            <div style={{ position: 'absolute', right: 10, top: 10, width: 250, background: '#fff', border: '1px solid #e4e2dc', borderRadius: 13, boxShadow: '0 14px 36px rgba(0,0,0,.14)', padding: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
                <span style={{ width: 30, height: 30, borderRadius: '50%', background: selected.color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flex: 'none' }}>
                  {selected.emoji ?? (selected.kind === 'monster' ? '👹' : (selected.name || '?').charAt(0).toUpperCase())}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 800, color: '#2f2c25', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</span>
                <button onClick={() => setSelToken(null)} style={{ border: 'none', background: 'none', color: '#a8a59d', cursor: 'pointer', fontSize: 16, flex: 'none' }}>×</button>
              </div>

              {selected.kind === 'dweller' && selMember && (() => {
                const cd = selMember.character.data as Record<string, unknown>;
                const sheet = (cd.sheet ?? {}) as Record<string, unknown>;
                const sm = (sheet.summary ?? {}) as Record<string, number>;
                const wl = num(sheet.woundLevel);
                const buffs = Object.keys((sheet.buffsOn ?? {}) as Record<string, boolean>);
                const status = Object.keys((sheet.statusOn ?? {}) as Record<string, boolean>);
                const cur = (v: unknown, max?: number) => `${v !== undefined && v !== null ? Number(v) : max ?? '—'}${max !== undefined ? ` / ${max}` : ''}`;
                const stat = (label: string, val: React.ReactNode, color: string) => (
                  <div style={{ background: '#faf9f7', border: '1px solid #efece6', borderRadius: 8, padding: '4px 8px' }}>
                    <div style={{ fontSize: 8.5, fontWeight: 700, color: '#a8a59d' }}>{label}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color }}>{val}</div>
                  </div>
                );
                return (
                  <>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                      {typeof cd.raceName === 'string' && cd.raceName && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 7, background: '#f0ece4', color: '#6b5b45' }}>{cd.raceName}</span>}
                      {typeof cd.className === 'string' && cd.className && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 7, background: '#ede7f6', color: '#5b3fa0' }}>{cd.className}</span>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 8 }}>
                      {stat('SAN', cur(sheet.sanCur, sm.sanMax), '#2a5fbd')}
                      {stat('Scratch', cur(sheet.scratchCur, sm.scrMax), '#c15a3f')}
                      {stat('WP', cur(sheet.wpCur, 3), '#2f6b4f')}
                      {stat('Wounds', <span style={{ color: wl >= 4 ? '#b4513a' : '#5f5c54' }}>{WOUND_NAMES[wl] ?? wl}</span>, '#5f5c54')}
                    </div>
                    {(buffs.length > 0 || status.length > 0) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                        {buffs.map((k) => <span key={k} style={{ fontSize: 9.5, padding: '2px 7px', borderRadius: 6, background: '#eef6f0', color: '#2f6b4f', border: '1px solid #cfe6d6' }}>✦ {buffLabel(k)}</span>)}
                        {status.map((k) => <span key={k} style={{ fontSize: 9.5, padding: '2px 7px', borderRadius: 6, background: '#fbeae6', color: '#b4513a', border: '1px solid #f0d3cb' }}>▼ {statusLabel(k)}</span>)}
                      </div>
                    )}
                    {(c.isLibrarian || selMember.character.ownerUserId === user.id) && (
                      <Link to={`/dweller/sheet/${selMember.character.id}`} style={{ display: 'block', textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: '#fff', background: '#5b3fa0', borderRadius: 8, padding: '7px', textDecoration: 'none', marginBottom: 6 }}>เปิด Dweller Sheet</Link>
                    )}
                  </>
                );
              })()}

              {selected.kind === 'monster' && (
                <button onClick={() => selected.refId && setMonsterInfo(selected.refId)} style={{ display: 'block', width: '100%', textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: '#b4513a', background: '#fbeae6', border: '1px solid #f0d3cb', borderRadius: 8, padding: '7px', cursor: 'pointer', marginBottom: 6 }}>ⓘ ดูข้อมูลมอนสเตอร์</button>
              )}

              {/* aura (พื้นที่อาณาเขต) — Librarian on any token; a player on their own */}
              {(c.isLibrarian || isMine(selected)) && (
                auraForm && auraForm.tokenId === selected.id ? (
                  <div style={{ border: '1px solid #e2d7f2', background: '#faf8fd', borderRadius: 9, padding: 9, marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#5b3fa0', flex: 1 }}>◎ อาณาเขตใหม่</span>
                      <button onClick={() => setAuraForm(null)} style={{ border: 'none', background: 'none', color: '#a8a59d', cursor: 'pointer', fontSize: 13, padding: 0 }}>×</button>
                    </div>
                    <input value={auraForm.label} onChange={(e) => setAuraForm({ ...auraForm, label: e.target.value })} placeholder="ชื่อ เช่น แสงศักดิ์สิทธิ์" style={{ border: '1px solid #e0ded7', borderRadius: 7, padding: '6px 9px', fontSize: 11.5, outline: 'none' }} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#5f5c54' }}>
                      รัศมี
                      <input type="number" min={1} max={30} value={auraForm.radius} onChange={(e) => setAuraForm({ ...auraForm, radius: Math.min(30, Math.max(1, Math.round(Number(e.target.value) || 1))) })} style={{ width: 56, border: '1px solid #e0ded7', borderRadius: 7, padding: '5px 7px', fontSize: 11.5, textAlign: 'center' }} />
                      ช่อง <span style={{ color: '#a8a59d' }}>(≈ {(auraForm.radius * map.metersPerHex).toLocaleString('th-TH')} ม.)</span>
                    </label>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {SWATCHES.map((col) => (
                        <button key={col} onClick={() => setAuraForm({ ...auraForm, color: col })} style={{ width: 17, height: 17, borderRadius: '50%', background: col, border: auraForm.color === col ? '2px solid #15140f' : '2px solid #fff', outline: '1px solid #e0ded7', cursor: 'pointer', padding: 0 }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button onClick={() => setAuraForm({ ...auraForm, follow: true })} style={{ flex: 1, border: `1px solid ${auraForm.follow ? '#5b3fa0' : '#e0ded7'}`, background: auraForm.follow ? '#ede7f6' : '#fff', color: auraForm.follow ? '#5b3fa0' : '#8d8a82', borderRadius: 7, padding: '5px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>🔗 ตามตัวละคร</button>
                      <button onClick={() => setAuraForm({ ...auraForm, follow: false })} style={{ flex: 1, border: `1px solid ${!auraForm.follow ? '#5b3fa0' : '#e0ded7'}`, background: !auraForm.follow ? '#ede7f6' : '#fff', color: !auraForm.follow ? '#5b3fa0' : '#8d8a82', borderRadius: 7, padding: '5px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>📍 ปักไว้ตรงนี้</button>
                    </div>
                    <button onClick={() => addAura.mutate(auraForm)} disabled={addAura.isPending} style={{ border: 'none', background: '#5b3fa0', color: '#fff', borderRadius: 7, padding: '7px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>สร้างอาณาเขต</button>
                  </div>
                ) : (
                  <button onClick={() => setAuraForm({ tokenId: selected.id, radius: 2, color: '#8a5fc0', label: '', follow: true })} style={{ display: 'block', width: '100%', textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: '#5b3fa0', background: '#f3effa', border: '1px solid #e2d7f2', borderRadius: 8, padding: '7px', cursor: 'pointer', marginBottom: 6 }}>◎ สร้างอาณาเขตรอบตัวนี้</button>
                )
              )}

              {/* size / facing / tail — the token's owner or the Librarian */}
              {canMove(selected) && (
                <div style={{ borderTop: '1px dashed #efece6', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 2 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, color: '#8d8a82' }}>
                    ขนาด
                    <input type="range" min={0.6} max={3} step={0.1} value={selected.size ?? 1} onChange={(e) => patchToken.mutate({ tokenId: selected.id, size: Number(e.target.value) })} style={{ flex: 1 }} />
                    <span style={{ minWidth: 34, textAlign: 'right', color: '#5c4a2e' }}>{(selected.size ?? 1).toFixed(1)}×</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#8d8a82' }}>
                    ทิศทาง
                    <button onClick={() => patchToken.mutate({ tokenId: selected.id, facing: ((selected.facing ?? 0) + 5) % 6 })} title="หมุนซ้าย" style={miniBtn}>↺</button>
                    <span style={{ width: 26, textAlign: 'center', fontSize: 13, color: '#5c4a2e', display: 'inline-block', transform: selected.facing !== undefined ? `rotate(${selected.facing * 60}deg)` : 'none' }}>{selected.facing !== undefined ? '➤' : '—'}</span>
                    <button onClick={() => patchToken.mutate({ tokenId: selected.id, facing: ((selected.facing ?? 0) + 1) % 6 })} title="หมุนขวา" style={miniBtn}>↻</button>
                    <button onClick={() => patchToken.mutate({ tokenId: selected.id, facing: selected.facing === undefined ? 0 : null })} style={{ ...miniBtn, width: 'auto', padding: '0 9px', fontSize: 10.5 }}>{selected.facing === undefined ? 'แสดงลูกศร' : 'ซ่อนลูกศร'}</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#8d8a82' }}>
                    หาง (ลำตัว)
                    <button onClick={() => tokenTail.mutate({ tokenId: selected.id, op: 'remove' })} disabled={!selected.tail?.length} title="ลดหาง" style={{ ...miniBtn, opacity: selected.tail?.length ? 1 : 0.4 }}>−</button>
                    <span style={{ width: 24, textAlign: 'center', fontSize: 12.5, color: '#5c4a2e' }}>{selected.tail?.length ?? 0}</span>
                    <button onClick={() => tokenTail.mutate({ tokenId: selected.id, op: 'add' })} disabled={(selected.tail?.length ?? 0) >= 20} title="เพิ่มหาง (เช่น งูยักษ์)" style={miniBtn}>＋</button>
                    <span style={{ fontWeight: 400, color: '#b0ada4', fontSize: 10 }}>ลากหัว → หางไหลตาม</span>
                  </div>
                </div>
              )}

              {c.isLibrarian && (
                <div style={{ borderTop: '1px dashed #efece6', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <button onClick={() => patchToken.mutate({ tokenId: selected.id, hidden: !selected.hidden })} style={{ border: `1px solid ${selected.hidden ? '#e6c98a' : '#e0ded7'}`, background: selected.hidden ? '#fbf3dd' : '#fff', color: selected.hidden ? '#8a6a1f' : '#5f5c54', borderRadius: 7, padding: '7px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                    {selected.hidden ? '🙈 ซ่อนอยู่ — กดเพื่อเปิดให้ผู้เล่นเห็น' : '👁 ผู้เล่นมองเห็น — กดเพื่อซ่อน'}
                  </button>
                  <input key={selected.id + selected.name} defaultValue={selected.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== selected.name) patchToken.mutate({ tokenId: selected.id, name: v }); }} style={{ border: '1px solid #e0ded7', borderRadius: 7, padding: '6px 9px', fontSize: 12, outline: 'none' }} />
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {SWATCHES.map((col) => (
                      <button key={col} onClick={() => patchToken.mutate({ tokenId: selected.id, color: col })} title={col} style={{ width: 20, height: 20, borderRadius: '50%', background: col, border: selected.color === col ? '2px solid #15140f' : '2px solid #fff', outline: '1px solid #e0ded7', cursor: 'pointer', padding: 0 }} />
                    ))}
                  </div>
                  <button onClick={() => deleteToken.mutate(selected.id)} style={{ border: '1px solid #f0d3cb', background: '#fff', color: '#b4513a', borderRadius: 7, padding: '6px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>ลบตัวหมากออกจากกระดาน</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* new map */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="＋ สร้างแผนที่ใหม่"
        footer={<><Button variant="ghost" onClick={() => setNewOpen(false)}>ยกเลิก</Button><Button variant="coral" disabled={createMap.isPending} onClick={() => { const f = newForm.current; createMap.mutate({ name: f.name || 'แผนที่ใหม่', cols: f.cols, rows: f.rows }); }}>สร้าง</Button></>}>
        <NewMapForm formRef={newForm} />
      </Modal>

      {/* map settings */}
      {map && (
        <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title={`⚙ ตั้งค่า “${map.name}”`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#8d8a82' }}>ชื่อแผนที่
              <input key={map.name} defaultValue={map.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== map.name) patchMap.mutate({ name: v }); }} style={{ display: 'block', marginTop: 5, width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 9, padding: '9px 12px', fontSize: 13 }} />
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#8d8a82', flex: 1 }}>กว้าง (ช่อง)
                <input key={`c${map.cols}`} type="number" min={6} max={60} defaultValue={map.cols} onBlur={(e) => { const v = Math.min(60, Math.max(6, Math.round(Number(e.target.value) || map.cols))); if (v !== map.cols) patchMap.mutate({ cols: v }); }} style={{ display: 'block', marginTop: 5, width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 9, padding: '9px 12px', fontSize: 13 }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#8d8a82', flex: 1 }}>สูง (ช่อง)
                <input key={`r${map.rows}`} type="number" min={6} max={60} defaultValue={map.rows} onBlur={(e) => { const v = Math.min(60, Math.max(6, Math.round(Number(e.target.value) || map.rows))); if (v !== map.rows) patchMap.mutate({ rows: v }); }} style={{ display: 'block', marginTop: 5, width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 9, padding: '9px 12px', fontSize: 13 }} />
              </label>
            </div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#8d8a82' }}>มาตราส่วน — 1 ช่อง = ? เมตร
              <input key={`m${map.metersPerHex}`} type="number" min={0.01} step={0.5} defaultValue={map.metersPerHex} onBlur={(e) => { const v = Number(e.target.value) || 1.5; if (v !== map.metersPerHex) patchBoard.mutate({ metersPerHex: v }); }} style={{ display: 'block', marginTop: 5, width: 140, boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 9, padding: '9px 12px', fontSize: 13 }} />
            </label>

            <div style={{ borderTop: '1px dashed #ece9e3', paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#8d8a82', marginBottom: 8 }}>🖼 ภาพแผนที่พื้นหลัง (ใต้ตารางหกเหลี่ยม)</div>
              <label style={{ display: 'inline-block', border: '1px solid #d8cfc0', background: '#f6f2ea', color: '#6b5b45', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                {map.bg ? 'เปลี่ยนรูป…' : 'อัปโหลดรูป…'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const url = await uploadImage(f);
                    patchBoard.mutate({ bg: { url, w: Math.round(boardW(map.cols)), x: 0, y: 0, opacity: 1 } });
                  } catch { window.alert('อัปโหลดรูปไม่สำเร็จ'); }
                  e.target.value = '';
                }} />
              </label>
              {map.bg && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                    {([['w', 'ความกว้างรูป', map.bg.w], ['x', 'เลื่อนแนวนอน (X)', map.bg.x], ['y', 'เลื่อนแนวตั้ง (Y)', map.bg.y]] as const).map(([k, label, val]) => (
                      <label key={k} style={{ fontSize: 11, fontWeight: 700, color: '#8d8a82' }}>{label}
                        <input key={`${k}${val}`} type="number" defaultValue={val} onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== val && map.bg) patchBoard.mutate({ bg: { ...map.bg, [k]: v } }); }} style={{ display: 'block', marginTop: 4, width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }} />
                      </label>
                    ))}
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#8d8a82' }}>ความทึบ (0.1–1)
                      <input key={`o${map.bg.opacity}`} type="number" min={0.1} max={1} step={0.1} defaultValue={map.bg.opacity} onBlur={(e) => { const v = Math.min(1, Math.max(0.1, Number(e.target.value) || 1)); if (v !== map.bg?.opacity && map.bg) patchBoard.mutate({ bg: { ...map.bg, opacity: v } }); }} style={{ display: 'block', marginTop: 4, width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }} />
                    </label>
                  </div>
                  <button onClick={() => patchBoard.mutate({ bg: null })} style={{ marginTop: 8, border: '1px solid #f0d3cb', background: '#fff', color: '#b4513a', borderRadius: 8, padding: '7px 13px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>เอารูปออก</button>
                </>
              )}
            </div>

            <button onClick={() => { if (window.confirm(`ลบแผนที่ “${map.name}” ถาวร? ตัวหมากบนแผนที่นี้จะหายไปด้วย`)) deleteMap.mutate(); }} style={{ border: '1px solid #f0d3cb', background: '#fff', color: '#b4513a', borderRadius: 9, padding: '9px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>🗑 ลบแผนที่นี้</button>
          </div>
        </Modal>
      )}

      {/* monster picker */}
      <Modal open={monPicker} onClose={() => setMonPicker(false)} title="👹 เพิ่มมอนสเตอร์ลงกระดาน" dark>
        <input value={monQuery} onChange={(e) => setMonQuery(e.target.value)} placeholder="🔍 ค้นหามอนสเตอร์…" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #3a3730', borderRadius: 10, padding: '9px 12px', fontSize: 13, background: '#221f1a', color: '#f3ede1', outline: 'none', marginBottom: 10 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 400, overflowY: 'auto' }}>
          {(monsters ?? []).filter((m) => !monQuery.trim() || m.name.toLowerCase().includes(monQuery.toLowerCase())).map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 10, border: '1px solid #35322b', background: '#26231e' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f3ede1' }}>{m.name}</div>
                {typeof m.fields.tag === 'string' && <div style={{ fontSize: 11, color: '#9a978e' }}>{String(m.fields.tag)}</div>}
              </div>
              <button onClick={() => { addToken.mutate({ kind: 'monster', refId: m.id, name: m.name, color: '#b4513a' }); setMonPicker(false); }} style={{ flex: 'none', border: 'none', borderRadius: 8, padding: '6px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: '#b4513a', color: '#fff' }}>วางลงกระดาน</button>
            </div>
          ))}
          {(monsters ?? []).length === 0 && <div style={{ fontSize: 12.5, color: '#8d8a82', textAlign: 'center', padding: '14px 0' }}>กำลังโหลด… / ยังไม่มีมอนสเตอร์ในคลัง</div>}
        </div>
      </Modal>

      {/* custom token */}
      <Modal open={customOpen} onClose={() => setCustomOpen(false)} title="🚩 เพิ่มตัวหมากกำหนดเอง"
        footer={<><Button variant="ghost" onClick={() => setCustomOpen(false)}>ยกเลิก</Button><Button variant="coral" disabled={addToken.isPending} onClick={() => { const f = customForm.current; if (f.name.trim()) { addToken.mutate({ kind: 'custom', name: f.name.trim(), color: f.color, emoji: f.emoji.trim() || undefined }); setCustomOpen(false); } }}>วางลงกระดาน</Button></>}>
        <CustomTokenForm formRef={customForm} />
      </Modal>

      {/* monster full data */}
      <Modal open={!!monsterInfo} onClose={() => setMonsterInfo(null)} title={monInfoItem?.name ?? 'ข้อมูลมอนสเตอร์'}>
        {monInfoItem
          ? <CatalogDetail item={monInfoItem} cfg={CATALOG_CONFIGS.monster} category="monster" isFeature={false} onEdit={() => {}} embedded />
          : <div style={{ fontSize: 13, color: '#a8a59d', padding: '20px 0', textAlign: 'center' }}>กำลังโหลด…</div>}
      </Modal>
    </div>
  );
}

// Small uncontrolled forms so typing doesn't re-render the whole board.
const newForm = { current: { name: '', cols: 22, rows: 15 } };
function NewMapForm({ formRef }: { formRef: { current: { name: string; cols: number; rows: number } } }) {
  useEffect(() => { formRef.current = { name: '', cols: 22, rows: 15 }; }, [formRef]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#8d8a82' }}>ชื่อแผนที่
        <input onChange={(e) => { formRef.current.name = e.target.value; }} placeholder="เช่น ป่านอกหมู่บ้าน" style={{ display: 'block', marginTop: 5, width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 9, padding: '9px 12px', fontSize: 13 }} autoFocus />
      </label>
      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#8d8a82', flex: 1 }}>กว้าง (ช่อง)
          <input type="number" min={6} max={60} defaultValue={22} onChange={(e) => { formRef.current.cols = Math.round(Number(e.target.value) || 22); }} style={{ display: 'block', marginTop: 5, width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 9, padding: '9px 12px', fontSize: 13 }} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#8d8a82', flex: 1 }}>สูง (ช่อง)
          <input type="number" min={6} max={60} defaultValue={15} onChange={(e) => { formRef.current.rows = Math.round(Number(e.target.value) || 15); }} style={{ display: 'block', marginTop: 5, width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 9, padding: '9px 12px', fontSize: 13 }} />
        </label>
      </div>
      <div style={{ fontSize: 11.5, color: '#a8a59d', lineHeight: 1.5 }}>ตัวละครของสมาชิกทุกคนจะถูกวางเป็นตัวหมากบนแผนที่ให้อัตโนมัติ</div>
    </div>
  );
}

const customForm = { current: { name: '', color: '#5f5c54', emoji: '' } };
function CustomTokenForm({ formRef }: { formRef: { current: { name: string; color: string; emoji: string } } }) {
  const [color, setColor] = useState('#5f5c54');
  useEffect(() => { formRef.current = { name: '', color: '#5f5c54', emoji: '' }; setColor('#5f5c54'); }, [formRef]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#8d8a82' }}>ชื่อ
        <input onChange={(e) => { formRef.current.name = e.target.value; }} placeholder="เช่น หีบสมบัติ, NPC พ่อค้า" style={{ display: 'block', marginTop: 5, width: '100%', boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 9, padding: '9px 12px', fontSize: 13 }} autoFocus />
      </label>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#8d8a82' }}>อีโมจิ (ไม่บังคับ)
        <input onChange={(e) => { formRef.current.emoji = e.target.value; }} placeholder="เช่น 📦 🐎 🔥" maxLength={4} style={{ display: 'block', marginTop: 5, width: 110, boxSizing: 'border-box', border: '1px solid #e0ded7', borderRadius: 9, padding: '9px 12px', fontSize: 14 }} />
      </label>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#8d8a82', marginBottom: 6 }}>สี</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SWATCHES.map((col) => (
            <button key={col} onClick={() => { formRef.current.color = col; setColor(col); }} style={{ width: 26, height: 26, borderRadius: '50%', background: col, border: color === col ? '3px solid #15140f' : '3px solid #fff', outline: '1px solid #e0ded7', cursor: 'pointer', padding: 0 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
