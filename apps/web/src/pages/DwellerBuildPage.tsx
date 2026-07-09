import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Character } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import layout from '../components/layout.module.css';

// Placeholder for the character-creation wizard (mode="build") and the finished
// Character Sheet (mode="sheet"). The full flow lands in the next phase; this
// keeps the Dweller Sheet navigation working end to end in the meantime.
export function DwellerBuildPage({ mode }: { mode: 'build' | 'sheet' }) {
  const { id } = useParams();
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['character', id],
    queryFn: () => api.get<{ character: Character }>(`/characters/${id}`),
    enabled: !!user && !!id,
  });
  const character = data?.character;

  return (
    <div className={layout.page} style={{ paddingTop: 40 }}>
      <Link to="/dweller" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#5f5c54', textDecoration: 'none', marginBottom: 22 }}>
        ← Dweller Sheet
      </Link>
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '48px 32px', textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
        <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.5 }}>{mode === 'sheet' ? '🧝' : '🛠️'}</div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 24 }}>
          {mode === 'sheet' ? 'Character Sheet' : 'ตั้งค่า Wiwon'}
        </h1>
        <p style={{ color: '#8d8a82', fontSize: 14, margin: '10px 0 0' }}>
          {character ? `ตัวละคร: ${character.name || 'ตัวละครใหม่'}` : 'กำลังโหลด…'}
        </p>
        <p style={{ color: '#bdbab2', fontSize: 13, margin: '18px 0 0' }}>
          {mode === 'sheet' ? 'หน้าชีตตัวละคร' : 'ระบบสร้างตัวละคร (Wizard 12 ขั้นตอน)'} กำลังพัฒนาในเฟสถัดไป
        </p>
      </div>
    </div>
  );
}
