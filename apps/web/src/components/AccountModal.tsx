import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CR_LEDGER_REASON_LABELS,
  PAYMENT_METHOD_LABELS,
  type CrLedgerEntry,
  type PublicUser,
  type TopupOrder,
  type TopupPackage,
} from '@wiwonanant/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Modal } from './Modal';
import { Button, inputStyle, labelStyle } from './ui';

type Tab = 'profile' | 'wallet' | 'admin';

const th = (iso: string) => new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

const STATUS_LABEL: Record<string, { t: string; c: string; bg: string }> = {
  success: { t: 'สำเร็จ', c: '#2f6b4f', bg: '#eaf6ee' },
  pending: { t: 'รอชำระ', c: '#9a7a2a', bg: '#fbf3dd' },
  failed: { t: 'ล้มเหลว', c: '#b4432a', bg: '#fbeae6' },
  expired: { t: 'หมดอายุ', c: '#8a857c', bg: '#f0eee9' },
};

export function AccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, isDev, setUser } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('profile');
  if (!user) return null;

  return (
    <Modal open={open} onClose={onClose} title="บัญชีของฉัน" width={620}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, borderBottom: '1px solid var(--border-faint)', paddingBottom: 2 }}>
        {([['profile', '👤 โปรไฟล์'], ['wallet', '💳 กระเป๋าเงิน'], ...(isDev ? [['admin', '🛠 แอดมิน']] : [])] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{ border: 'none', background: 'none', padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: tab === id ? 'var(--ink)' : '#9a978e', borderBottom: `2px solid ${tab === id ? 'var(--coral)' : 'transparent'}`, marginBottom: -3 }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'profile' && <ProfileTab user={user} onUser={setUser} />}
      {tab === 'wallet' && <WalletTab user={user} />}
      {tab === 'admin' && isDev && <AdminTab />}

      <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border-faint)', display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="danger"
          onClick={() => { api.post('/auth/logout').finally(() => { setUser(null); qc.clear(); onClose(); }); }}
        >
          ออกจากระบบ
        </Button>
      </div>
    </Modal>
  );
}

// ── Profile ─────────────────────────────────────────────────────────────────
function ProfileTab({ user, onUser }: { user: PublicUser; onUser: (u: PublicUser) => void }) {
  const [name, setName] = useState(user.displayName);
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [nameMsg, setNameMsg] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const saveName = useMutation({
    mutationFn: () => api.patch<{ user: PublicUser }>('/auth/profile', { displayName: name.trim() }),
    onSuccess: (r) => { onUser(r.user); setNameMsg('บันทึกชื่อแล้ว ✓'); setTimeout(() => setNameMsg(''), 2500); },
    onError: (e) => setNameMsg(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ'),
  });
  const changePw = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: cur, newPassword: nw }),
    onSuccess: () => { setPwMsg({ ok: true, text: 'เปลี่ยนรหัสผ่านแล้ว ✓' }); setCur(''); setNw(''); },
    onError: (e) => setPwMsg({ ok: false, text: e instanceof ApiError ? e.message : 'เปลี่ยนไม่สำเร็จ' }),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontSize: 11.5, color: '#a8a59d' }}>อีเมล (ใช้เข้าสู่ระบบ)</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{user.email}</div>
      </div>
      <div>
        <label style={labelStyle}>ชื่อที่แสดง</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={inputStyle} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <Button onClick={() => name.trim() && saveName.mutate()} disabled={saveName.isPending || !name.trim() || name.trim() === user.displayName}>บันทึก</Button>
        </div>
        {nameMsg && <div style={{ fontSize: 11.5, color: '#2f6b4f', marginTop: 5 }}>{nameMsg}</div>}
      </div>
      <div style={{ borderTop: '1px solid var(--border-faint)', paddingTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>เปลี่ยนรหัสผ่าน</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input style={inputStyle} type="password" placeholder="รหัสผ่านปัจจุบัน" value={cur} onChange={(e) => setCur(e.target.value)} />
          <input style={inputStyle} type="password" placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)" value={nw} onChange={(e) => setNw(e.target.value)} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button variant="coral" onClick={() => cur && nw.length >= 6 && changePw.mutate()} disabled={changePw.isPending || !cur || nw.length < 6}>เปลี่ยนรหัสผ่าน</Button>
            {pwMsg && <span style={{ fontSize: 11.5, color: pwMsg.ok ? '#2f6b4f' : '#b4432a' }}>{pwMsg.text}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Wallet ──────────────────────────────────────────────────────────────────
function WalletTab({ user }: { user: PublicUser }) {
  const qc = useQueryClient();
  const [view, setView] = useState<'buy' | 'topups' | 'ledger'>('buy');
  const [payMsg, setPayMsg] = useState('');

  const { data: pkgData } = useQuery({ queryKey: ['topup-packages'], queryFn: () => api.get<{ packages: TopupPackage[] }>('/wallet/packages') });
  const { data: topups } = useQuery({ queryKey: ['topup-history'], queryFn: () => api.get<{ orders: TopupOrder[] }>('/wallet/topup/history'), enabled: view === 'topups' });
  const { data: ledger } = useQuery({ queryKey: ['cr-ledger'], queryFn: () => api.get<{ entries: CrLedgerEntry[] }>('/credits/ledger'), enabled: view === 'ledger' });

  // Sandbox top-up: create a pending order then run the mock-pay shortcut. A real
  // gateway would redirect to a PromptPay/card checkout instead of mock-pay.
  const buy = useMutation({
    mutationFn: async (pkgId: string) => {
      const { order, mock } = await api.post<{ order: TopupOrder; mock: boolean }>('/wallet/topup/create', { packageId: pkgId, method: 'promptpay' });
      if (mock) return api.post<{ balance: number }>(`/wallet/topup/${order.id}/mock-pay`);
      throw new ApiError('ยังไม่ได้เชื่อมต่อช่องทางชำระเงินจริง', 400);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['topup-history'] });
      qc.invalidateQueries({ queryKey: ['cr-ledger'] });
      setPayMsg('เติม Cr. สำเร็จ ✓');
      setTimeout(() => setPayMsg(''), 2500);
    },
    onError: (e) => setPayMsg(e instanceof ApiError ? e.message : 'เติมไม่สำเร็จ'),
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(135deg,#2a2620,#15140f)', color: '#f7dca0', borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: '.05em' }}>Cr. คงเหลือ</div>
          <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>{user.creditBalance} <span style={{ fontSize: 15 }}>Cr.</span></div>
        </div>
        <div style={{ fontSize: 34 }}>🪙</div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {([['buy', 'เติม Cr.'], ['topups', 'ประวัติเติมเงิน'], ['ledger', 'ประวัติ Cr.']] as [typeof view, string][]).map(([id, l]) => (
          <button key={id} onClick={() => setView(id)} style={{ border: `1px solid ${view === id ? 'var(--coral)' : 'var(--border-soft)'}`, background: view === id ? '#fdeee9' : '#fff', color: view === id ? '#c0492e' : '#6f6b62', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
        ))}
      </div>

      {view === 'buy' && (
        <>
          {payMsg && <div style={{ fontSize: 12.5, fontWeight: 700, color: payMsg.includes('✓') ? '#2f6b4f' : '#b4432a', marginBottom: 10 }}>{payMsg}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10 }}>
            {(pkgData?.packages ?? []).map((p) => (
              <div key={p.id} style={{ border: '1px solid var(--border-soft)', borderRadius: 12, padding: '13px 12px', textAlign: 'center', background: '#fff' }}>
                {p.label && <div style={{ fontSize: 10.5, fontWeight: 800, color: '#c0492e', letterSpacing: '.03em' }}>{p.label}</div>}
                <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink)', marginTop: 2 }}>{p.credits + p.bonusCredits} <span style={{ fontSize: 12 }}>Cr.</span></div>
                {p.bonusCredits > 0 && <div style={{ fontSize: 10, color: '#2f6b4f', fontWeight: 700 }}>{p.credits} + โบนัส {p.bonusCredits}</div>}
                <div style={{ fontSize: 12, color: '#8a857c', margin: '4px 0 9px' }}>{p.priceTHB} บาท</div>
                <Button variant="coral" style={{ width: '100%', padding: '7px 0', fontSize: 12 }} disabled={buy.isPending} onClick={() => buy.mutate(p.id)}>เติม</Button>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: '#a8a59d', marginTop: 12, lineHeight: 1.6 }}>
            💳 รองรับ {Object.values(PAYMENT_METHOD_LABELS).join(' · ')} — โหมดนี้เป็นการจำลองการชำระเงิน (Sandbox) จนกว่าจะเชื่อมต่อ Payment Gateway จริง
          </div>
        </>
      )}

      {view === 'topups' && (
        <HistoryTable
          rows={(topups?.orders ?? []).map((o) => [th(o.createdAt), `${o.priceTHB} บาท`, `+${o.credits} Cr.`, o.status])}
          head={['วันที่', 'ราคา', 'Cr.', 'สถานะ']}
          empty="ยังไม่มีการเติมเงิน"
        />
      )}
      {view === 'ledger' && (
        <HistoryTable
          rows={(ledger?.entries ?? []).map((e) => [th(e.createdAt), CR_LEDGER_REASON_LABELS[e.reason as keyof typeof CR_LEDGER_REASON_LABELS] ?? e.reason, `${e.amount > 0 ? '+' : ''}${e.amount}`, String(e.balanceAfter)])}
          head={['วันที่', 'รายการ', 'เปลี่ยนแปลง', 'คงเหลือ']}
          empty="ยังไม่มีประวัติ Cr."
        />
      )}
    </div>
  );
}

function HistoryTable({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (rows.length === 0) return <div style={{ padding: '26px 0', textAlign: 'center', color: '#a8a59d', fontSize: 12.5 }}>{empty}</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>{head.map((h, i) => <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '7px 8px', color: '#a8a59d', fontWeight: 700, borderBottom: '1px solid var(--border-faint)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => {
                const isStatus = head[ci] === 'สถานะ';
                const s = isStatus ? STATUS_LABEL[String(cell)] : null;
                return (
                  <td key={ci} style={{ textAlign: ci === 0 ? 'left' : 'right', padding: '7px 8px', borderBottom: '1px solid #f3f1ec', whiteSpace: 'nowrap', color: '#46443c' }}>
                    {s ? <span style={{ fontSize: 10.5, fontWeight: 700, color: s.c, background: s.bg, borderRadius: 6, padding: '2px 8px' }}>{s.t}</span> : cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Admin (dev only) ──────────────────────────────────────────────────────────
function AdminTab() {
  const qc = useQueryClient();
  const { data: pkgData } = useQuery({ queryKey: ['topup-packages-all'], queryFn: () => api.get<{ packages: TopupPackage[] }>('/wallet/packages?all=1') });
  const { data: orders } = useQuery({ queryKey: ['admin-orders'], queryFn: () => api.get<{ orders: (TopupOrder & { userName: string; userEmail: string })[] }>('/wallet/admin/orders') });

  const blank = { label: '', priceTHB: 0, credits: 0, bonusCredits: 0 };
  const [draft, setDraft] = useState(blank);
  const [adjUser, setAdjUser] = useState('');
  const [adjAmt, setAdjAmt] = useState('');
  const [adjNote, setAdjNote] = useState('');
  const [adjMsg, setAdjMsg] = useState('');

  const savePkg = useMutation({
    mutationFn: () => api.post('/wallet/packages', { label: draft.label, priceTHB: Number(draft.priceTHB), credits: Number(draft.credits), bonusCredits: Number(draft.bonusCredits) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['topup-packages-all'] }); qc.invalidateQueries({ queryKey: ['topup-packages'] }); setDraft(blank); },
  });
  const togglePkg = useMutation({
    mutationFn: (p: TopupPackage) => api.patch(`/wallet/packages/${p.id}`, { active: !p.active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['topup-packages-all'] }); qc.invalidateQueries({ queryKey: ['topup-packages'] }); },
  });
  const adjust = useMutation({
    mutationFn: () => api.post<{ balance: number }>('/wallet/admin/adjust', { userId: adjUser.trim(), amount: Number(adjAmt), note: adjNote.trim() || undefined }),
    onSuccess: (r) => { setAdjMsg(`สำเร็จ — คงเหลือ ${r.balance} Cr.`); setAdjAmt(''); setAdjNote(''); qc.invalidateQueries({ queryKey: ['admin-orders'] }); },
    onError: (e) => setAdjMsg(e instanceof ApiError ? e.message : 'ปรับไม่สำเร็จ'),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>แพ็กเกจเติมเงิน</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {(pkgData?.packages ?? []).map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: '1px solid var(--border-faint)', borderRadius: 9, opacity: p.active ? 1 : 0.5 }}>
              <span style={{ flex: 1, fontSize: 12.5 }}><b>{p.priceTHB} บาท</b> → {p.credits + p.bonusCredits} Cr.{p.bonusCredits > 0 ? ` (โบนัส ${p.bonusCredits})` : ''}{p.label ? ` · ${p.label}` : ''}</span>
              <button onClick={() => togglePkg.mutate(p)} style={{ border: '1px solid var(--border-soft)', background: '#fff', borderRadius: 7, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: p.active ? '#b4432a' : '#2f6b4f' }}>{p.active ? 'ปิดขาย' : 'เปิดขาย'}</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', background: '#faf9f6', borderRadius: 10, padding: 10 }}>
          <input style={{ ...inputStyle, width: 100 }} placeholder="ชื่อ" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          <input style={{ ...inputStyle, width: 84 }} type="number" placeholder="บาท" value={draft.priceTHB || ''} onChange={(e) => setDraft({ ...draft, priceTHB: Number(e.target.value) })} />
          <input style={{ ...inputStyle, width: 84 }} type="number" placeholder="Cr." value={draft.credits || ''} onChange={(e) => setDraft({ ...draft, credits: Number(e.target.value) })} />
          <input style={{ ...inputStyle, width: 84 }} type="number" placeholder="โบนัส" value={draft.bonusCredits || ''} onChange={(e) => setDraft({ ...draft, bonusCredits: Number(e.target.value) })} />
          <Button onClick={() => draft.priceTHB > 0 && draft.credits >= 0 && savePkg.mutate()} disabled={savePkg.isPending || !draft.priceTHB}>เพิ่ม</Button>
        </div>
      </section>

      <section style={{ borderTop: '1px solid var(--border-faint)', paddingTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>ปรับ Cr. ให้ผู้ใช้ (บันทึกใน Ledger)</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input style={{ ...inputStyle, width: 190 }} placeholder="User ID" value={adjUser} onChange={(e) => setAdjUser(e.target.value)} />
          <input style={{ ...inputStyle, width: 100 }} type="number" placeholder="+/- จำนวน" value={adjAmt} onChange={(e) => setAdjAmt(e.target.value)} />
          <input style={{ ...inputStyle, flex: 1, minWidth: 120 }} placeholder="เหตุผล" value={adjNote} onChange={(e) => setAdjNote(e.target.value)} />
          <Button variant="coral" onClick={() => adjUser.trim() && Number(adjAmt) !== 0 && adjust.mutate()} disabled={adjust.isPending}>ปรับ</Button>
        </div>
        {adjMsg && <div style={{ fontSize: 11.5, marginTop: 6, color: adjMsg.includes('สำเร็จ') ? '#2f6b4f' : '#b4432a' }}>{adjMsg}</div>}
      </section>

      <section style={{ borderTop: '1px solid var(--border-faint)', paddingTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>ธุรกรรมเติมเงินล่าสุด</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
            <thead><tr>{['วันที่', 'ผู้ใช้', 'ราคา', 'Cr.', 'สถานะ'].map((h, i) => <th key={i} style={{ textAlign: i > 1 ? 'right' : 'left', padding: '6px 7px', color: '#a8a59d', fontWeight: 700, borderBottom: '1px solid var(--border-faint)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {(orders?.orders ?? []).slice(0, 20).map((o) => {
                const s = STATUS_LABEL[o.status];
                return (
                  <tr key={o.id}>
                    <td style={{ padding: '6px 7px', borderBottom: '1px solid #f3f1ec', whiteSpace: 'nowrap' }}>{th(o.createdAt)}</td>
                    <td style={{ padding: '6px 7px', borderBottom: '1px solid #f3f1ec' }} title={o.userEmail}>{o.userName}</td>
                    <td style={{ padding: '6px 7px', borderBottom: '1px solid #f3f1ec', textAlign: 'right' }}>{o.priceTHB} ฿</td>
                    <td style={{ padding: '6px 7px', borderBottom: '1px solid #f3f1ec', textAlign: 'right' }}>+{o.credits}</td>
                    <td style={{ padding: '6px 7px', borderBottom: '1px solid #f3f1ec', textAlign: 'right' }}><span style={{ fontSize: 10, fontWeight: 700, color: s?.c, background: s?.bg, borderRadius: 6, padding: '2px 7px' }}>{s?.t ?? o.status}</span></td>
                  </tr>
                );
              })}
              {(orders?.orders ?? []).length === 0 && <tr><td colSpan={5} style={{ padding: '20px 0', textAlign: 'center', color: '#a8a59d' }}>ยังไม่มีธุรกรรม</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
