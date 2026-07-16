import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Character } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';
import { Button } from '../components/ui';
import type { CampaignDTO } from '../data/statusEffects';
import layout from '../components/layout.module.css';

const TOTAL_STEPS = 12;

export function DwellerSheetPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [delTarget, setDelTarget] = useState<Character | null>(null);

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/characters/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['characters'] }); setDelTarget(null); },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['characters'],
    queryFn: () => api.get<{ characters: Character[] }>('/characters'),
    enabled: !!user,
  });
  const characters = data?.characters ?? [];

  const create = useMutation({
    mutationFn: () => api.post<{ character: Character }>('/characters', {}),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['characters'] });
      navigate(`/dweller/build/${res.character.id}`);
    },
  });

  // ── Campaigns ──
  const { data: campData } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get<{ led: CampaignDTO[]; joined: CampaignDTO[] }>('/campaigns'),
    enabled: !!user,
  });
  const campaigns = [...(campData?.led ?? []), ...(campData?.joined ?? [])];
  const [joinCode, setJoinCode] = useState('');
  const [joinChar, setJoinChar] = useState('');
  const [joinErr, setJoinErr] = useState('');
  const createCamp = useMutation({
    mutationFn: () => api.post<{ campaign: CampaignDTO }>('/campaigns', { name: 'แคมเปญใหม่' }),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['campaigns'] }); navigate(`/campaign/${res.campaign.id}`); },
  });
  const [moveConfirm, setMoveConfirm] = useState<{ fromName: string } | null>(null);
  const joinCamp = useMutation({
    mutationFn: (move: boolean) => api.post<{ campaign: CampaignDTO }>('/campaigns/join', { joinCode, characterId: joinChar, move }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); setJoinCode(''); setJoinChar(''); setJoinErr(''); setMoveConfirm(null); },
    onError: (e: Error) => { setMoveConfirm(null); setJoinErr(e.message || 'เข้าร่วมไม่สำเร็จ'); },
  });
  // A character can only be in one campaign. If the chosen one already belongs to
  // another, confirm a MOVE (leaves the old) before joining.
  const currentCampaignOf = (characterId: string) =>
    campaigns.find((cp) => cp.members.some((m) => m.character.id === characterId));
  const attemptJoin = () => {
    setJoinErr('');
    if (!joinCode || !joinChar) return;
    const cur = currentCampaignOf(joinChar);
    if (cur) setMoveConfirm({ fromName: cur.name || 'แคมเปญเดิม' });
    else joinCamp.mutate(false);
  };

  const openCharacter = (c: Character) =>
    navigate(c.status === 'complete' ? `/dweller/sheet/${c.id}` : `/dweller/build/${c.id}`);

  if (!user) {
    return (
      <div className={layout.page} style={{ paddingTop: 48 }}>
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '48px 32px', textAlign: 'center', maxWidth: 460, margin: '0 auto' }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 26 }}>Dweller Sheet</h1>
          <p style={{ color: '#8d8a82', fontSize: 14, margin: '10px 0 22px' }}>เข้าสู่ระบบก่อนเพื่อสร้างและจัดการตัวละครของคุณ</p>
          <Link to="/login" style={{ display: 'inline-block', background: '#e07a5f', color: '#fff', borderRadius: 11, padding: '11px 26px', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={layout.page} style={{ paddingTop: 32 }}>
      <div style={{ marginBottom: 26 }}>
        <span style={{ fontSize: 11, letterSpacing: '.14em', color: '#e07a5f', fontWeight: 700 }}>CHARACTER</span>
        <h1 style={{ margin: '6px 0 0', fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 32, letterSpacing: '-.01em' }}>Dweller Sheet</h1>
        <p style={{ margin: '8px 0 0', color: '#8d8a82', fontSize: 14 }}>แคมเปญและตัวละครทั้งหมดของคุณ</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        {/* ── แคมเปญของฉัน ── */}
        <section style={frameStyle}>
          <div style={frameHeadStyle}>
            <h2 style={frameTitleStyle}>แคมเปญของฉัน</h2>
            <button onClick={() => createCamp.mutate()} disabled={createCamp.isPending} style={{ background: '#15140f', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>+ สร้างแคมเปญ</button>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {campaigns.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#a8a59d', fontSize: 13 }}>
                <div style={{ fontSize: 30, marginBottom: 8, opacity: 0.4 }}>🎲</div>ยังไม่มีแคมเปญ — สร้างเป็นบรรณารักษ์ หรือเข้าร่วมด้วยรหัส
              </div>
            )}
            {campaigns.map((c) => (
              <button key={c.id} onClick={() => navigate(`/campaign/${c.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: '#faf9f7', border: '1px solid #eae7e0', borderRadius: 11, padding: '12px 14px', cursor: 'pointer', width: '100%' }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, flex: 'none', background: c.isLibrarian ? 'linear-gradient(160deg,#2a2620,#4a463d)' : '#ece8df', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{c.isLibrarian ? '📖' : '🎲'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#2f2c25', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    {(c.extraSlots ?? 0) > 0 && <span title={`ขยายช่องตัวละครแล้ว +${c.extraSlots}`} style={{ flex: 'none', fontSize: 9.5, fontWeight: 800, borderRadius: 5, padding: '2px 6px', background: '#fbf3dd', color: '#8a6a1e', border: '1px solid #ead9a6' }}>✨ +{c.extraSlots}</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#9a978e', marginTop: 2 }}>{c.members.length}/{c.memberCap ?? 3} ตัวละคร · รหัส {c.joinCode}</div>
                  {c.members.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                      {c.members.map(({ memberId, character: ch }) => (
                        <span key={memberId} style={{ fontSize: 10.5, fontWeight: 600, color: '#6b5b45', background: '#f0ece4', borderRadius: 6, padding: '2px 8px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.name || 'ตัวละคร'}</span>
                      ))}
                    </div>
                  )}
                </div>
                <span style={{ flex: 'none', fontSize: 10, fontWeight: 700, borderRadius: 5, padding: '3px 9px', background: c.isLibrarian ? '#efe7f6' : '#eef4fb', color: c.isLibrarian ? '#5b3fa0' : '#2a5fbd' }}>{c.isLibrarian ? 'บรรณารักษ์' : 'ผู้เล่น'}</span>
              </button>
            ))}
            {/* join by code */}
            <div style={{ borderTop: '1px solid #efece6', marginTop: 4, paddingTop: 12 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#a8a59d', marginBottom: 8 }}>เข้าร่วมด้วยรหัส</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="รหัส" style={{ width: 90, border: '1px solid #e0ded7', borderRadius: 8, padding: '8px 10px', fontSize: 13, textTransform: 'uppercase' }} />
                <select value={joinChar} onChange={(e) => setJoinChar(e.target.value)} style={{ flex: 1, minWidth: 120, border: '1px solid #e0ded7', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#fff' }}>
                  <option value="">— เลือกตัวละคร —</option>
                  {characters.map((c) => <option key={c.id} value={c.id}>{c.name || 'ตัวละครใหม่'}</option>)}
                </select>
                <button onClick={attemptJoin} disabled={!joinCode || !joinChar || joinCamp.isPending} style={{ background: '#e07a5f', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: joinCode && joinChar ? 'pointer' : 'not-allowed', opacity: joinCode && joinChar ? 1 : 0.5 }}>เข้าร่วม</button>
              </div>
              {joinErr && <div style={{ fontSize: 11.5, color: '#b4513a', marginTop: 6 }}>{joinErr}</div>}
            </div>
          </div>
        </section>

        {/* ── Dweller ของฉัน ── */}
        <section style={frameStyle}>
          <div style={frameHeadStyle}>
            <h2 style={frameTitleStyle}>Dweller ของฉัน</h2>
            <button
              onClick={() => create.mutate()}
              disabled={create.isPending}
              style={{ background: '#e07a5f', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
            >
              + สร้าง Dweller
            </button>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {isLoading && <div style={{ color: '#a8a59d', fontSize: 13, textAlign: 'center', padding: 20 }}>กำลังโหลด…</div>}
            {!isLoading && characters.length === 0 && (
              <div style={{ padding: '30px 20px', textAlign: 'center', color: '#a8a59d', fontSize: 13.5 }}>
                <div style={{ fontSize: 34, marginBottom: 10, opacity: 0.4 }}>🧝</div>
                ยังไม่มีตัวละคร — กด “+ สร้าง Dweller” เพื่อเริ่ม
              </div>
            )}
            {characters.map((c) => {
              const done = c.status === 'complete';
              return (
                <div
                  key={c.id}
                  onClick={() => openCharacter(c)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: '#faf9f7', border: '1px solid #eae7e0', borderRadius: 11, padding: '12px 14px', cursor: 'pointer', width: '100%' }}
                >
                  <div style={{ width: 44, height: 44, borderRadius: 10, flex: 'none', background: done ? 'linear-gradient(160deg,#f4d9d1,#e7b6a7)' : '#ece8df', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                    {done ? '🧝' : '✎'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#2f2c25', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name || 'ตัวละครใหม่'}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#9a978e', marginTop: 2 }}>
                      {done ? 'สร้างเสร็จแล้ว · แตะเพื่อดูชีต' : `ร่าง · Step ${Math.min(c.step + 1, TOTAL_STEPS)}/${TOTAL_STEPS} · แตะเพื่อสร้างต่อ`}
                    </div>
                  </div>
                  <span style={{ flex: 'none', fontSize: 10, fontWeight: 700, letterSpacing: '.04em', borderRadius: 5, padding: '3px 9px', background: done ? '#e6f4ea' : '#fdf6e8', color: done ? '#2f7d4f' : '#b4844a' }}>
                    {done ? 'เสร็จแล้ว' : 'ร่าง'}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDelTarget(c); }}
                    title="ลบตัวละคร"
                    style={{ flex: 'none', width: 30, height: 30, borderRadius: 8, border: '1px solid #f0d3cb', background: '#fff', color: '#b4513a', fontSize: 15, cursor: 'pointer', lineHeight: 1 }}
                  >🗑</button>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <Modal
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        title="ยืนยันการลบตัวละคร"
        footer={
          <>
            <Button variant="ghost" disabled={del.isPending} onClick={() => setDelTarget(null)}>ยกเลิก</Button>
            <Button variant="danger" disabled={del.isPending} onClick={() => delTarget && del.mutate(delTarget.id)}>{del.isPending ? 'กำลังลบ…' : 'ลบถาวร'}</Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: '#3c3a33' }}>
          แน่ใจแล้วใช่ไหมว่าจะลบ <b>{delTarget?.name || 'ตัวละครใหม่'}</b>?<br />
          <span style={{ color: '#b4513a', fontWeight: 600 }}>การลบนี้ถาวร — ข้อมูลตัวละคร ชีต และของทั้งหมดจะหายไปและกู้คืนไม่ได้</span>
        </p>
      </Modal>

      <Modal
        open={!!moveConfirm}
        onClose={() => setMoveConfirm(null)}
        title="ย้ายตัวละครมาแคมเปญนี้?"
        width={440}
        footer={
          <>
            <Button variant="ghost" disabled={joinCamp.isPending} onClick={() => setMoveConfirm(null)}>ยกเลิก</Button>
            <Button variant="coral" disabled={joinCamp.isPending} onClick={() => joinCamp.mutate(true)}>{joinCamp.isPending ? 'กำลังย้าย…' : 'ย้ายมาที่นี่'}</Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.75, color: '#3c3a33' }}>
          ตัวละครนี้อยู่ในแคมเปญ <b>{moveConfirm?.fromName}</b> อยู่แล้ว<br />
          ตัวละครหนึ่งอยู่ได้ทีละแคมเปญ — ถ้าย้ายมาที่นี่ ตัวละครจะ<b>ออกจาก {moveConfirm?.fromName}</b> โดยอัตโนมัติ
          <br /><span style={{ color: '#8a857c', fontSize: 12.5 }}>(ข้อมูลตัวละคร ชีต และของ ไม่หาย — เฉพาะการเป็นสมาชิกแคมเปญเดิมที่ถูกยกเลิก)</span>
        </p>
      </Modal>
    </div>
  );
}

const frameStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e4e2dc',
  borderRadius: 16,
  overflow: 'hidden',
  alignSelf: 'start',
};
const frameHeadStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '16px 18px',
  borderBottom: '1px solid #efece6',
};
const frameTitleStyle: React.CSSProperties = { margin: 0, fontSize: 16, fontWeight: 700 };
