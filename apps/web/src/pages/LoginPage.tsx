import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PublicUser } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';

type Mode = 'login' | 'signup';
type Role = 'user' | 'dev';

const fieldLabel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 500, color: '#46443c' };
const fieldInput: React.CSSProperties = { border: '1px solid #e0ded7', borderRadius: 9, padding: '12px 14px', fontSize: 14, outline: 'none' };

export function LoginPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setUser } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [role, setRole] = useState<Role>('user');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [demoMsg, setDemoMsg] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      if (mode === 'login') return api.post<{ user: PublicUser }>('/auth/login', { email, password });
      return api.post<{ user: PublicUser }>('/auth/signup', { email, password, displayName, role, devCode: role === 'dev' ? devCode : undefined });
    },
    onSuccess: (res) => {
      setUser(res.user);
      qc.invalidateQueries();
      navigate('/');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด'),
  });

  function roleStyle(active: boolean): React.CSSProperties {
    return {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      alignItems: 'flex-start',
      padding: '11px 14px',
      borderRadius: 10,
      border: `1px solid ${active ? '#15140f' : '#e0ded7'}`,
      background: active ? '#15140f' : '#fff',
      cursor: 'pointer',
      textAlign: 'left',
    };
  }

  return (
    <section style={{ animation: 'fadeUp .4s ease', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, maxWidth: 920, margin: '24px auto', background: '#fff', border: '1px solid #e4e2dc', borderRadius: 18, overflow: 'hidden' }}>
      {/* left dark panel */}
      <div style={{ background: '#15140f', padding: '44px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -50, bottom: -50, width: 280, height: 280, background: 'radial-gradient(circle,rgba(224,122,95,.4),transparent 65%)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, position: 'relative' }}>
          <div style={{ width: 34, height: 34, background: '#fff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 13, height: 13, border: '2px solid #15140f', borderRadius: 3, transform: 'rotate(45deg)' }} />
          </div>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Wiwon&#8202;Anant</span>
        </div>
        <div style={{ position: 'relative' }}>
          <h2 style={{ color: '#fff', fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 28, lineHeight: 1.2, margin: 0 }}>Enter the Wiwon Library.</h2>
          <p style={{ color: '#b6b3aa', fontSize: 13.5, lineHeight: 1.7, margin: '14px 0 0' }}>
            เข้าสู่ระบบเพื่อบันทึกความคืบหน้า ติดตามบทความ และ (สำหรับผู้พัฒนา) แก้ไขเนื้อหาสารานุกรมได้โดยตรง
          </p>
        </div>
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#7d7a72', letterSpacing: '.08em' }}>บัญชีทดลอง</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { setDemoMsg(true); setMode('signup'); setError(null); }}
              style={{ flex: 1, padding: 9, background: '#2a2822', border: '1px solid #3d3a32', color: '#d4d1c9', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}
            >
              ผู้เล่น / GM
            </button>
          </div>
          {demoMsg && (
            <div style={{ fontSize: 12.5, color: '#f0b8a8', lineHeight: 1.65 }}>
              อะอ้าว หมดโควต้าบัญชีทดลองแล้วจ้า ถึงเวลาสมัครสมาชิกแล้วนะ
            </div>
          )}
        </div>
      </div>

      {/* right form panel */}
      <div style={{ padding: '44px 40px' }}>
        <div style={{ display: 'flex', gap: 4, background: '#f0eee9', borderRadius: 10, padding: 4, marginBottom: 24 }}>
          {(['login', 'signup'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); }}
              style={{ flex: 1, padding: '9px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: mode === m ? '#fff' : 'transparent', color: mode === m ? '#15140f' : '#8d8a82' }}
            >
              {m === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setError(null); submit.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          {mode === 'signup' && (
            <label style={fieldLabel}>
              ชื่อที่แสดง
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="เช่น Rune Keeper" style={fieldInput} />
            </label>
          )}
          <label style={fieldLabel}>
            อีเมล
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={fieldInput} />
          </label>
          <label style={fieldLabel}>
            รหัสผ่าน
            <div style={{ position: 'relative' }}>
              <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={{ ...fieldInput, paddingRight: 44, boxSizing: 'border-box', width: '100%' }} />
              <button type="button" onClick={() => setShowPw((s) => !s)} title={showPw ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} aria-label={showPw ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 4, color: '#8d8a82' }}>{showPw ? '🙈' : '👁️'}</button>
            </div>
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: '#46443c' }}>ประเภทบัญชี</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setRole('user')} style={roleStyle(role === 'user')}>
                <span style={{ fontWeight: 600, fontSize: 13, color: role === 'user' ? '#fff' : '#15140f' }}>ผู้เล่น / GM</span>
                <span style={{ fontSize: 11, color: role === 'user' ? '#b6b3aa' : '#8d8a82' }}>อ่านและติดตามเนื้อหา</span>
              </button>
              <button type="button" onClick={() => setRole('dev')} style={roleStyle(role === 'dev')}>
                <span style={{ fontWeight: 600, fontSize: 13, color: role === 'dev' ? '#fff' : '#15140f' }}>ผู้พัฒนา</span>
                <span style={{ fontSize: 11, color: role === 'dev' ? '#b6b3aa' : '#8d8a82' }}>ต้องมีรหัสเข้าถึง 🔒</span>
              </button>
            </div>
          </div>
          {role === 'dev' && (
            <label style={fieldLabel}>
              รหัสเข้าถึงผู้พัฒนา
              <input type="password" value={devCode} onChange={(e) => setDevCode(e.target.value)} placeholder="รหัสลับสำหรับทีมพัฒนา" style={{ ...fieldInput, border: '1px solid #d8b9af', background: '#fbf6f4' }} />
              <span style={{ fontSize: 11, color: '#a8a59d' }}>บัญชีผู้พัฒนาสงวนไว้สำหรับทีมงานที่มีรหัสเท่านั้น</span>
            </label>
          )}
          {error && <div style={{ background: '#fbeae6', border: '1px solid #f3cabf', color: '#b4513a', fontSize: 12.5, padding: '10px 14px', borderRadius: 9 }}>{error}</div>}
          <button type="submit" disabled={submit.isPending} style={{ marginTop: 4, padding: 13, background: '#15140f', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            {submit.isPending ? 'กำลังดำเนินการ…' : mode === 'login' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี'}
          </button>
        </form>
      </div>
    </section>
  );
}
