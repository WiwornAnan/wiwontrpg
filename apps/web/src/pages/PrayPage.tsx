import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCatalogConfig, type CatalogCategory, type PrayMessage } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';
import { Button, inputStyle, labelStyle } from '../components/ui';
import layout from '../components/layout.module.css';

export function PrayPage() {
  const { user, isDev } = useAuth();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['pray'],
    queryFn: () => api.get<{ messages: PrayMessage[] }>('/pray'),
    enabled: !!user,
  });
  const messages = useMemo(() => data?.messages ?? [], [data]);
  const selected = messages.find((m) => m.id === selectedId) ?? messages[0] ?? null;

  useEffect(() => {
    if (selected && ((isDev && !selected.readByDev) || (!isDev && !selected.readByUser))) {
      api.post(`/pray/${selected.id}/read`).then(() => qc.invalidateQueries({ queryKey: ['pray'] }));
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) {
    return (
      <div className={layout.page}>
        <div className={layout.card} style={{ textAlign: 'center', padding: 48 }}>
          เข้าสู่ระบบเพื่อใช้งาน Pray to the Creator
          <div style={{ marginTop: 16 }}>
            <Button onClick={() => (window.location.href = '/login')}>เข้าสู่ระบบ</Button>
          </div>
        </div>
      </div>
    );
  }

  function unread(m: PrayMessage) {
    return isDev ? !m.readByDev : !m.readByUser;
  }

  return (
    <div className={layout.page}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 32 }}>Pray to the Creator</h1>
        <Button variant="coral" onClick={() => setComposeOpen(true)}>
          ✎ เขียนถึงผู้พัฒนา
        </Button>
      </div>
      <p style={{ color: 'var(--text-dim)', fontSize: 14, margin: '4px 0 22px' }}>
        ช่องทางติดต่อระหว่างผู้เล่นและทีมพัฒนา — ส่งคำขอ ลง Official, แจ้งปัญหา, หรือพูดคุย
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 22, alignItems: 'start' }}>
        <div className={layout.card} style={{ padding: 0, overflow: 'hidden' }}>
          {messages.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-ghost)', fontSize: 13 }}>ยังไม่มีข้อความ</div>}
          {messages.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedId(m.id)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '13px 16px', border: 'none', borderBottom: '1px solid var(--divider)', cursor: 'pointer', background: selected?.id === m.id ? 'var(--coral-bg)' : 'transparent' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                {unread(m) && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--coral)', flex: 'none' }} />}
                {m.kind === 'official-request' && (
                  <span style={{ fontSize: 8.5, fontWeight: 800, color: 'var(--orange)', background: 'var(--orange-bg)', borderRadius: 4, padding: '1px 6px' }}>
                    REQUEST
                  </span>
                )}
                {m.approved && <span style={{ fontSize: 12 }}>🌙</span>}
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                จาก {m.fromName} · {new Date(m.createdAt).toLocaleDateString('th-TH')}
              </div>
            </button>
          ))}
        </div>

        {selected ? <Thread key={selected.id} message={selected} /> : <div className={layout.card} style={{ padding: 40, textAlign: 'center', color: 'var(--text-ghost)' }}>เลือกข้อความเพื่ออ่าน</div>}
      </div>

      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
    </div>
  );
}

function Thread({ message }: { message: PrayMessage }) {
  const { isDev, user } = useAuth();
  const qc = useQueryClient();
  const [reply, setReply] = useState('');
  const [credits, setCredits] = useState('10');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['pray'] });
    qc.invalidateQueries({ queryKey: ['catalog'] });
    qc.invalidateQueries({ queryKey: ['me'] });
  };

  const sendReply = useMutation({ mutationFn: () => api.post(`/pray/${message.id}/reply`, { body: reply }), onSuccess: () => { setReply(''); invalidate(); } });
  const approve = useMutation({ mutationFn: () => api.post(`/pray/${message.id}/approve`, { credits: Number(credits) }), onSuccess: invalidate });
  const notify = useMutation({ mutationFn: () => api.post(`/pray/${message.id}/notify-revise`, {}), onSuccess: invalidate });
  const del = useMutation({ mutationFn: () => api.delete(`/pray/${message.id}`), onSuccess: invalidate });

  const item = message.catalogItem;
  const cfg = item ? getCatalogConfig(item.category as CatalogCategory) : null;
  const detailKeys = cfg ? (item!.isFeature && cfg.feature ? cfg.feature.detailKeys : cfg.detailKeys) : [];

  const canDelete = isDev || (message.fromUserId === user?.id && !message.approved);

  return (
    <div className={layout.card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>
            {message.approved && '🌙 '}
            {message.subject}
          </h2>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 3 }}>
            จาก {message.fromName} · {new Date(message.createdAt).toLocaleString('th-TH')}
          </div>
        </div>
        {canDelete && (
          <Button variant="danger" style={{ fontSize: 12 }} onClick={() => del.mutate()}>
            🗑 ลบข้อความ
          </Button>
        )}
      </div>

      <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-muted)', marginTop: 14, whiteSpace: 'pre-wrap' }}>{message.body}</p>

      {/* official-request item card */}
      {item && (
        <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', background: 'var(--surface-alt)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-faint)', marginBottom: 10 }}>📋 ข้อมูลที่ผู้ใช้ส่งมา</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{item.name}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', marginBottom: 10 }}>
            {detailKeys.map(([label, key]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, borderBottom: '1px solid var(--divider)', paddingBottom: 4 }}>
                <span style={{ color: 'var(--text-faint)' }}>{label}</span>
                <span style={{ fontWeight: 600 }}>{key === 'source' ? item.source : String(item.fields[key] ?? '—')}</span>
              </div>
            ))}
          </div>
          {item.description && <div className="rt-html" style={{ fontSize: 13, color: 'var(--text-muted)' }} dangerouslySetInnerHTML={{ __html: item.description }} />}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {item.tags.map((t) => (
              <span key={t} style={{ fontSize: 11, padding: '2px 9px', borderRadius: 20, background: '#edeae4', color: 'var(--text-dim)' }}>
                #{t}
              </span>
            ))}
          </div>

          {isDev && !message.approved && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <Button variant="ghost" style={{ fontSize: 12.5 }} onClick={() => notify.mutate()}>
                ✎ ส่งแจ้งเตือนให้แก้ไข
              </Button>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>มอบ Cr.</span>
              <input type="number" value={credits} onChange={(e) => setCredits(e.target.value)} style={{ ...inputStyle, width: 70, padding: '7px 9px' }} />
              <Button variant="coral" style={{ fontSize: 12.5 }} onClick={() => approve.mutate()}>
                🌙 อนุมัติ · ลง Official
              </Button>
            </div>
          )}
          {message.approved && (
            <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--green)', fontWeight: 600 }}>
              🌙 อนุมัติเป็น Official แล้ว{message.creditsAwarded ? ` · มอบ ${message.creditsAwarded} Cr.` : ''}
            </div>
          )}
        </div>
      )}

      {/* replies */}
      {message.replies.length > 0 && (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {message.replies.map((r) => (
            <div key={r.id} style={{ background: r.isDev ? 'var(--purple-bg)' : 'var(--surface-sunken)', borderRadius: 10, padding: '10px 13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>{r.byName}</span>
                {r.isDev && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--purple)', background: '#fff', borderRadius: 4, padding: '1px 6px' }}>DEV</span>}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: 'var(--text-ghost)' }}>{new Date(r.createdAt).toLocaleDateString('th-TH')}</span>
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{r.body}</div>
            </div>
          ))}
        </div>
      )}

      {/* reply box */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 16 }}>
        <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="ตอบกลับ…" style={{ ...inputStyle, minHeight: 44, resize: 'vertical' }} />
        <Button onClick={() => reply.trim() && sendReply.mutate()} disabled={sendReply.isPending}>
          ส่ง
        </Button>
      </div>
    </div>
  );
}

function ComposeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const send = useMutation({
    mutationFn: () => api.post('/pray', { subject, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pray'] });
      setSubject('');
      setBody('');
      onClose();
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="เขียนถึงผู้พัฒนา"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button variant="coral" onClick={() => subject.trim() && body.trim() && send.mutate()} disabled={send.isPending}>
            ส่งข้อความ
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={labelStyle}>หัวข้อ</label>
          <input style={inputStyle} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="เรื่องที่ต้องการแจ้ง" autoFocus />
        </div>
        <div>
          <label style={labelStyle}>ข้อความ</label>
          <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
