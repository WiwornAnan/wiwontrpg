import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import type { CampaignDTO } from '../data/statusEffects';
import layout from '../components/layout.module.css';

const COLS = 3;
interface TSRow { id: string; cells: string[] }
interface TimeScript { headers: string[]; rows: TSRow[] }

const pad = (arr: string[], n: number) => Array.from({ length: n }, (_, i) => arr[i] ?? '');

// A free-form 3-column notebook ("Time Script") the Librarian keeps per campaign.
// The header row defaults to the campaign's character names; every other cell is
// free text. Rows can be added without limit and the whole grid can be cleared.
export function CampaignTimeScriptPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api.get<{ campaign: CampaignDTO }>(`/campaigns/${id}`),
    enabled: !!id && !!user,
  });
  const c = data?.campaign;
  const patch = useMutation({
    mutationFn: (body: { data: Record<string, unknown> }) => api.patch<{ campaign: CampaignDTO }>(`/campaigns/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', id] }),
  });

  if (!user) return <Shell><p style={{ color: '#8d8a82' }}>เข้าสู่ระบบก่อน</p></Shell>;
  if (isLoading || !c) return <Shell><p style={{ color: '#8d8a82' }}>กำลังโหลด…</p></Shell>;
  if (!c.isLibrarian) return <Shell><p style={{ color: '#b4513a' }}>เฉพาะ Librarian ของแคมเปญนี้เท่านั้น</p><Link to={`/campaign/${id}`}>← กลับ</Link></Shell>;

  const memberNames = c.members.map((m) => m.character.name || 'ตัวละคร');
  const raw = (c.data.timeScript ?? {}) as Partial<TimeScript>;
  const ts: TimeScript = {
    headers: pad(Array.isArray(raw.headers) ? raw.headers : memberNames, COLS),
    rows: Array.isArray(raw.rows) && raw.rows.length > 0
      ? raw.rows.map((r) => ({ id: r.id, cells: pad(r.cells ?? [], COLS) }))
      : [{ id: `r${Date.now()}`, cells: pad([], COLS) }],
  };
  const save = (next: TimeScript) => patch.mutate({ data: { ...c.data, timeScript: next } });

  const setHeader = (i: number, v: string) => save({ ...ts, headers: ts.headers.map((h, j) => (j === i ? v : h)) });
  const setCell = (rowId: string, ci: number, v: string) =>
    save({ ...ts, rows: ts.rows.map((r) => (r.id === rowId ? { ...r, cells: r.cells.map((x, j) => (j === ci ? v : x)) } : r)) });
  const addRow = () => save({ ...ts, rows: [...ts.rows, { id: `r${Date.now()}${Math.floor(Math.random() * 999)}`, cells: pad([], COLS) }] });
  const delRow = (rowId: string) => save({ ...ts, rows: ts.rows.filter((r) => r.id !== rowId).length ? ts.rows.filter((r) => r.id !== rowId) : [{ id: `r${Date.now()}`, cells: pad([], COLS) }] });
  const clearAll = () => { if (window.confirm('ล้างข้อมูลทั้งหมดใน Time Script? (หัวตารางกลับเป็นชื่อตัวละคร)')) save({ headers: pad(memberNames, COLS), rows: [{ id: `r${Date.now()}`, cells: pad([], COLS) }] }); };

  const cell = { border: '1px solid #e7e4dd', padding: 0, verticalAlign: 'top' as const };
  const area = { width: '100%', minHeight: 60, border: 'none', outline: 'none', resize: 'vertical' as const, padding: '9px 11px', fontSize: 13, lineHeight: 1.55, fontFamily: 'inherit', color: '#46443c', background: 'transparent', boxSizing: 'border-box' as const };

  return (
    <Shell>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <button onClick={() => navigate(`/campaign/${id}`)} style={{ border: '1px solid #e0ded7', background: '#fff', borderRadius: 9, padding: '7px 13px', fontSize: 12.5, fontWeight: 700, color: '#6f6b62', cursor: 'pointer' }}>← กลับแคมเปญ</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 26 }}>📜 Time Script</h1>
          <div style={{ fontSize: 12.5, color: '#9a978e', marginTop: 2 }}>{c.name} · ตารางบันทึก 3 คอลัมน์ · บันทึกอัตโนมัติ</div>
        </div>
        <button onClick={clearAll} style={{ border: '1px solid #f0d3cb', background: '#fff', color: '#b4513a', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>ล้างข้อมูลในตาราง</button>
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 16, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 520 }}>
          <colgroup>{Array.from({ length: COLS }, (_, i) => <col key={i} style={{ width: `${100 / COLS}%` }} />)}<col style={{ width: 40 }} /></colgroup>
          <thead>
            <tr>
              {ts.headers.map((h, i) => (
                <th key={i} style={{ ...cell, background: '#f4f1ea' }}>
                  <input
                    defaultValue={h}
                    key={`h${i}:${h}`}
                    onBlur={(e) => { if (e.target.value !== h) setHeader(i, e.target.value); }}
                    placeholder={`คอลัมน์ ${i + 1}`}
                    style={{ width: '100%', border: 'none', outline: 'none', padding: '10px 11px', fontSize: 13.5, fontWeight: 800, color: '#2f2c25', background: 'transparent', textAlign: 'center', fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                </th>
              ))}
              <th style={{ ...cell, background: '#f4f1ea' }} />
            </tr>
          </thead>
          <tbody>
            {ts.rows.map((r) => (
              <tr key={r.id}>
                {r.cells.map((v, ci) => (
                  <td key={ci} style={cell}>
                    <textarea
                      defaultValue={v}
                      key={`${r.id}:${ci}:${v}`}
                      onBlur={(e) => { if (e.target.value !== v) setCell(r.id, ci, e.target.value); }}
                      style={area}
                    />
                  </td>
                ))}
                <td style={{ ...cell, textAlign: 'center', background: '#fbfaf8' }}>
                  <button onClick={() => delRow(r.id)} title="ลบแถว" style={{ border: 'none', background: 'none', color: '#cb5a44', cursor: 'pointer', fontSize: 16, padding: 6 }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addRow} style={{ marginTop: 12, border: '1px dashed #cbb8ec', background: '#f7f3fd', color: '#5b3fa0', borderRadius: 9, padding: '8px 15px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>＋ เพิ่มแถว</button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className={layout.page} style={{ paddingTop: 30, paddingBottom: 60, maxWidth: 900, margin: '0 auto' }}>{children}</div>;
}
