import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
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

interface BoardToken { id: string; kind: 'dweller' | 'monster' | 'custom'; refId?: string; name: string; color: string; emoji?: string; q: number; r: number }
interface BoardPing { id: string; q: number; r: number; name: string; color: string; at: string }
interface BoardMap { id: string; name: string; isActive: boolean; cols: number; rows: number; tokens: BoardToken[]; pings: BoardPing[]; updatedAt: string }
interface MapMeta { id: string; name: string; isActive: boolean; cols: number; rows: number }

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

const num = (v: unknown, def = 0) => (typeof v === 'number' && isFinite(v) ? v : def);
const WOUND_NAMES = ['ปกติ', 'First Blood', 'Impaired', 'Suppressed', 'Desperate Edge', "Death's Door"];
const buffLabel = (k: string) => BUFF_EFFECTS.find((e) => e[0] === k)?.[1] ?? k;
const statusLabel = (k: string) => STATUS_EFFECTS.find((e) => e[0] === k)?.[1] ?? k;
const SWATCHES = ['#e07a5f', '#2a5fbd', '#2f7d4f', '#8a5fc0', '#b4842a', '#c04a7a', '#2f8d8a', '#5f5030', '#b4513a', '#15140f'];

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
    refetchInterval: 5000,
  });
  const c = campData?.campaign;

  const { data: mapsData } = useQuery({
    queryKey: ['board-maps', id],
    queryFn: () => api.get<{ maps: MapMeta[] }>(`/campaigns/${id}/maps`),
    enabled: !!id && !!user,
    refetchInterval: 8000,
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
    refetchInterval: 2000,
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
      if (prev) qc.setQueryData(boardKey, { map: { ...prev.map, tokens: prev.map.tokens.map((t) => (t.id === v.tokenId ? { ...t, q: v.q, r: v.r } : t)) } });
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
  const sendPing = useMutation({
    mutationFn: (v: { q: number; r: number }) => api.post(`/campaigns/${id}/maps/${mapId}/ping`, v),
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

  // Locally-seen time per ping id — pings render for 6s from when THIS client first saw them.
  const pingSeen = useRef(new Map<string, number>());
  const pings = (map?.pings ?? []).filter((p) => {
    if (!pingSeen.current.has(p.id)) pingSeen.current.set(p.id, Date.now());
    return Date.now() - (pingSeen.current.get(p.id) ?? 0) < 6000;
  });
  useEffect(() => {
    const iv = window.setInterval(() => setTick((t) => t + 1), 700);
    return () => window.clearInterval(iv);
  }, []);

  const toBoard = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - v.x) / v.k, y: (clientY - rect.top - v.y) / v.k };
  };

  const canMove = (t: BoardToken) =>
    !!c && (c.isLibrarian || (t.kind === 'dweller' && !!t.refId && c.members.some((m) => m.character.id === t.refId && m.character.ownerUserId === user?.id)));

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

  // Token drag → snap to nearest hex on release; a near-still release = select.
  const startTokenDrag = (e: React.PointerEvent, t: BoardToken) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const movable = canMove(t);
    setDrag({ token: t, x: hexX(t.q, t.r), y: hexY(t.r), moved: false });
    const onMove = (ev: PointerEvent) => {
      if (!movable && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 6) return;
      const p = toBoard(ev.clientX, ev.clientY);
      setDrag((d) => (d ? { ...d, x: p.x, y: p.y, moved: d.moved || Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 6 } : d));
    };
    const end = (ev: PointerEvent) => {
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

  if (!user) return <div className={layout.page} style={{ paddingTop: 40 }}><Link to="/login">เข้าสู่ระบบ</Link></div>;
  if (!c) return <div className={layout.page} style={{ paddingTop: 40, color: '#a8a59d' }}>กำลังโหลด…</div>;

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
            style={{ display: 'block', width: '100%', height: 'calc(100vh - 235px)', minHeight: 440, touchAction: 'none', cursor: 'grab', userSelect: 'none' }}
            onPointerDown={startPan}
            onDoubleClick={onDblClick}
          >
            <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
              {/* grid */}
              {hexes.map((h) => (
                <polygon key={`${h.q},${h.r}`} points={h.pts} fill="#fbf9f4" stroke="#ddd6c8" strokeWidth={1.2} />
              ))}
              {/* drag target highlight */}
              {drag && drag.moved && canMove(drag.token) && (() => {
                const hex = nearestHex(drag.x, drag.y, map.cols, map.rows);
                return hex ? <polygon points={hexPoints(hex.q, hex.r)} fill="#e07a5f22" stroke="#e07a5f" strokeWidth={2} /> : null;
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
              {/* tokens */}
              {map.tokens.map((t) => {
                const isDrag = drag?.token.id === t.id && drag.moved;
                const x = isDrag ? drag.x : hexX(t.q, t.r);
                const y = isDrag ? drag.y : hexY(t.r);
                const movable = canMove(t);
                const sel = t.id === selTokenId;
                return (
                  <g
                    key={t.id}
                    transform={`translate(${x},${y})`}
                    onPointerDown={(e) => startTokenDrag(e, t)}
                    style={{ cursor: movable ? 'grab' : 'pointer' }}
                  >
                    {sel && <circle r={HEX * 0.78} fill="none" stroke="#e07a5f" strokeWidth={2.5} strokeDasharray="5 4" />}
                    <circle r={HEX * 0.6} fill={t.color} stroke="#fff" strokeWidth={movable ? 3 : 2} opacity={isDrag ? 0.85 : 1} />
                    <text y={t.emoji ? 7 : 6} textAnchor="middle" style={{ fontSize: t.emoji ? 20 : 17, fontWeight: 800, fill: '#fff', pointerEvents: 'none' }}>
                      {t.emoji ?? (t.kind === 'monster' ? '👹' : (t.name || '?').charAt(0).toUpperCase())}
                    </text>
                    <text y={HEX * 0.6 + 15} textAnchor="middle" style={{ fontSize: 11.5, fontWeight: 700, fill: '#3c3a33', paintOrder: 'stroke', stroke: '#fbf9f4', strokeWidth: 3.5, pointerEvents: 'none' }}>
                      {t.name.length > 14 ? t.name.slice(0, 13) + '…' : t.name}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* hint bar */}
          <div style={{ position: 'absolute', left: 10, bottom: 10, fontSize: 10.5, color: '#8d8a82', background: 'rgba(255,255,255,.85)', border: '1px solid #e4e2dc', borderRadius: 8, padding: '5px 10px', pointerEvents: 'none' }}>
            ลากพื้นหลัง = เลื่อน · ล้อเมาส์ = ซูม · ดับเบิลคลิก = 📍 ชี้จุดให้ทุกคนเห็น{c.isLibrarian || map.tokens.some(canMove) ? ' · ลากตัวหมาก = ย้าย' : ''}
          </div>

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

              {c.isLibrarian && (
                <div style={{ borderTop: '1px dashed #efece6', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
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
