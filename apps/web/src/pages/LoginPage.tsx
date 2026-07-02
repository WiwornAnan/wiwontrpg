import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PublicUser } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';

type Mode = 'login' | 'signup';
type Role = 'user' | 'dev';

export function LoginPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setUser } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [role, setRole] = useState<Role>('user');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      if (mode === 'login') {
        return api.post<{ user: PublicUser }>('/auth/login', { email, password });
      }
      return api.post<{ user: PublicUser }>('/auth/signup', {
        email,
        password,
        displayName,
        role,
        devCode: role === 'dev' ? devCode : undefined,
      });
    },
    onSuccess: (res) => {
      setUser(res.user);
      qc.invalidateQueries();
      navigate('/');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด'),
  });

  function fillDemo() {
    setMode('login');
    setEmail('player@wiwonanant.local');
    setPassword('playerpass');
  }
  function fillDevDemo() {
    setMode('login');
    setEmail('dev@wiwonanant.local');
    setPassword('devpass');
  }

  return (
    <div style={{ maxWidth: 440, margin: '40px auto', padding: '0 20px' }}>
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 18, padding: '36px 34px' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 30 }}>
          {mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: 14, margin: '8px 0 24px' }}>
          เข้าสู่ Wiwon Library — สารานุกรมจักรวาล WiwonAnant
        </p>

        {mode === 'signup' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(['user', 'dev'] as Role[]).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 10,
                  border: `1px solid ${role === r ? 'var(--ink)' : 'var(--border-soft)'}`,
                  background: role === r ? 'var(--ink)' : '#fff',
                  color: role === r ? '#fff' : 'var(--text-muted)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {r === 'user' ? 'ผู้เล่น / GM' : 'ผู้พัฒนา'}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            submit.mutate();
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          {mode === 'signup' && (
            <Field label="ชื่อที่แสดง" value={displayName} onChange={setDisplayName} placeholder="เช่น Nara" />
          )}
          <Field label="อีเมล" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
          <Field label="รหัสผ่าน" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
          {mode === 'signup' && role === 'dev' && (
            <Field
              label="รหัสผู้พัฒนา (ลับ)"
              value={devCode}
              onChange={setDevCode}
              placeholder="รหัสเฉพาะทีมพัฒนา"
            />
          )}

          {error && (
            <div style={{ fontSize: 13, color: 'var(--danger)', background: '#fbeae6', border: '1px solid #f0cfc6', borderRadius: 8, padding: '9px 12px' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submit.isPending}
            style={{ padding: '12px', background: 'var(--ink)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}
          >
            {submit.isPending ? 'กำลังดำเนินการ…' : mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
          </button>
        </form>

        <div style={{ marginTop: 18, fontSize: 13, color: 'var(--text-dim)', textAlign: 'center' }}>
          {mode === 'login' ? 'ยังไม่มีบัญชี? ' : 'มีบัญชีอยู่แล้ว? '}
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setError(null);
            }}
            style={{ background: 'none', border: 'none', color: 'var(--coral-ink)', fontWeight: 600, cursor: 'pointer' }}
          >
            {mode === 'login' ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}
          </button>
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-faint)', display: 'flex', gap: 8 }}>
          <button onClick={fillDemo} style={demoBtn}>กรอกบัญชีผู้เล่นทดลอง</button>
          <button onClick={fillDevDemo} style={demoBtn}>บัญชีผู้พัฒนาทดลอง</button>
        </div>
      </div>
    </div>
  );
}

const demoBtn: React.CSSProperties = {
  flex: 1,
  padding: '9px',
  background: 'var(--surface-sunken)',
  border: '1px solid var(--border-faint)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--text-dim)',
  cursor: 'pointer',
};

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ border: '1px solid var(--border-soft)', borderRadius: 9, padding: '11px 13px', fontSize: 14, outline: 'none' }}
      />
    </label>
  );
}
