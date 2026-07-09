import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Character } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import layout from '../components/layout.module.css';

const TOTAL_STEPS = 12;

export function DwellerSheetPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

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
        {/* ── แคมเปญของฉัน (ว่างไว้ก่อน) ── */}
        <section style={frameStyle}>
          <div style={frameHeadStyle}>
            <h2 style={frameTitleStyle}>แคมเปญของฉัน</h2>
          </div>
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#a8a59d', fontSize: 13.5 }}>
            <div style={{ fontSize: 34, marginBottom: 10, opacity: 0.4 }}>🎲</div>
            ยังไม่มีแคมเปญ
            <div style={{ fontSize: 12, marginTop: 6, color: '#bdbab2' }}>ระบบแคมเปญกำลังจะมาเร็ว ๆ นี้</div>
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
                <button
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
                </button>
              );
            })}
          </div>
        </section>
      </div>
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
