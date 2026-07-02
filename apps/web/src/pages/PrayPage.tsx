import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCatalogConfig, type CatalogCategory, type PrayMessage } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';

export function PrayPage() {
  const { user, isDev } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compose, setCompose] = useState(false);

  const { data } = useQuery({
    queryKey: ['pray'],
    queryFn: () => api.get<{ messages: PrayMessage[] }>('/pray'),
    enabled: !!user,
  });
  const messages = useMemo(() => data?.messages ?? [], [data]);
  const selected = !compose ? messages.find((m) => m.id === selectedId) ?? null : null;

  useEffect(() => {
    if (selected && ((isDev && !selected.readByDev) || (!isDev && !selected.readByUser))) {
      api.post(`/pray/${selected.id}/read`).then(() => qc.invalidateQueries({ queryKey: ['pray'] }));
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const banner = (
    <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', marginBottom: 22, background: 'linear-gradient(135deg,#15140f,#3a2f4a 62%,#5b3fa0)', padding: '34px 30px' }}>
      <div style={{ position: 'absolute', right: -40, top: -40, width: 300, height: 300, background: 'radial-gradient(circle,rgba(224,122,95,.3),transparent 65%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: 11, letterSpacing: '.16em', color: '#e7c9a0', fontWeight: 700 }}>WIWONANANT · MESSAGES</div>
        <h1 style={{ margin: '8px 0 6px', fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 32, color: '#fff' }}>Pray to the Creator</h1>
        <p style={{ color: '#cfc7e0', fontSize: 13.5, margin: 0, maxWidth: 620, lineHeight: 1.6 }}>
          ส่งคำอธิษฐาน คำถาม หรือคำขอถึง <b style={{ color: '#fff' }}>ผู้พัฒนา (The Creator)</b> — และรอคำตอบกลับ เหมือนกล่องจดหมายระหว่างผู้ใช้กับผู้สร้างโลก
        </p>
      </div>
    </div>
  );

  const section: React.CSSProperties = { maxWidth: 1060, margin: '0 auto', padding: '32px 40px 80px', animation: 'fadeIn .4s ease' };

  if (!user) {
    return (
      <div style={section}>
        {banner}
        <div style={{ background: '#fff', border: '1px solid #e4e2dc', borderRadius: 14, padding: '44px 30px', textAlign: 'center', color: '#8d8a82', fontSize: 13.5, lineHeight: 1.7 }}>
          ต้องเข้าสู่ระบบก่อนจึงจะส่งหรืออ่านข้อความได้
          <br />
          <button onClick={() => navigate('/login')} style={{ marginTop: 14, padding: '10px 22px', background: '#15140f', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            ไปหน้าเข้าสู่ระบบ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={section}>
      {banner}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, alignItems: 'start' }}>
        {/* inbox */}
        <div style={{ background: '#fff', border: '1px solid #e4e2dc', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 420 }}>
          <div style={{ padding: '13px 15px', borderBottom: '1px solid #ece9e3', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>📬 กล่องข้อความ</span>
            <span style={{ flex: 1 }} />
            {isDev && <span style={{ fontSize: 10, fontWeight: 700, color: '#5b3fa0', background: '#ede7f6', borderRadius: 5, padding: '2px 8px' }}>มุมมองผู้พัฒนา</span>}
          </div>
          <button
            onClick={() => { setCompose(true); setSelectedId(null); }}
            style={{ margin: '11px 13px', padding: 9, background: isDev ? '#5b3fa0' : '#15140f', color: '#fff', border: 'none', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
          >
            {isDev ? '✎ ส่งข้อความถึงผู้ใช้' : '✎ เขียนคำอธิษฐานใหม่'}
          </button>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {messages.map((m) => {
              const unread = isDev ? !m.readByDev : !m.readByUser;
              return (
                <div
                  key={m.id}
                  onClick={() => { setCompose(false); setSelectedId(m.id); }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '12px 14px', borderBottom: '1px solid #f0eee9', cursor: 'pointer', background: selected?.id === m.id ? '#f3eefb' : unread ? '#fffaf2' : '#fff' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {m.kind === 'official-request' && <span style={{ fontSize: 9, fontWeight: 800, color: '#b06a2a', background: '#fbf0e3', borderRadius: 4, padding: '1px 6px' }}>REQUEST</span>}
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: '#15140f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject}</span>
                    {unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e07a5f', flex: 'none' }} />}
                  </div>
                  <div style={{ fontSize: 11, color: '#8d8a82' }}>จาก {m.fromName} · ตอบ {m.replies.length}</div>
                  <div style={{ fontSize: 11, color: '#a8a59d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.body}</div>
                </div>
              );
            })}
            {messages.length === 0 && (
              <div style={{ padding: '40px 18px', textAlign: 'center', color: '#cbc8c0', fontSize: 12.5, lineHeight: 1.7 }}>
                ยังไม่มีข้อความ
                <br />
                กด “{isDev ? 'ส่งข้อความถึงผู้ใช้' : 'เขียนคำอธิษฐานใหม่'}” เพื่อเริ่ม
              </div>
            )}
          </div>
        </div>

        {/* detail / compose */}
        <div style={{ background: '#fff', border: '1px solid #e4e2dc', borderRadius: 14, minHeight: 420, display: 'flex', flexDirection: 'column' }}>
          {compose ? (
            <ComposeForm onClose={() => setCompose(false)} onSent={() => setCompose(false)} />
          ) : selected ? (
            <Thread key={selected.id} message={selected} />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbc8c0', fontSize: 13, padding: 30, textAlign: 'center' }}>
              เลือกข้อความทางซ้ายเพื่ออ่าน หรือเขียนคำอธิษฐานใหม่
            </div>
          )}
        </div>
      </div>
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
  const detailKeys = cfg ? (item!.isFeature && cfg.feature ? cfg.feature.detailKeys : cfg.detailKeys).slice(0, 6) : [];
  const canDelete = isDev || (message.fromUserId === user?.id && !message.approved);
  const bubble = (mine: boolean, dev: boolean): React.CSSProperties => ({
    maxWidth: '80%',
    padding: '9px 13px',
    borderRadius: 12,
    fontSize: 13,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    ...(mine
      ? { alignSelf: 'flex-end', background: '#15140f', color: '#fff' }
      : dev
        ? { alignSelf: 'flex-start', background: '#ede7f6', color: '#3a2f4a' }
        : { alignSelf: 'flex-start', background: '#faf9f7', border: '1px solid #ece9e3', color: '#46443c' }),
  });
  const origMine = message.fromUserId === user?.id;

  return (
    <>
      <div style={{ padding: '18px 20px', borderBottom: '1px solid #ece9e3', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            {message.kind === 'official-request' && <span style={{ fontSize: 9, fontWeight: 800, color: '#b06a2a', background: '#fbf0e3', borderRadius: 4, padding: '2px 7px' }}>REQUEST · ขอลง Official</span>}
            {message.approved && <span style={{ fontSize: 9, fontWeight: 800, color: '#5b3fa0', background: '#ede7f6', borderRadius: 4, padding: '2px 7px' }}>🌙 อนุมัติแล้ว</span>}
            <span style={{ fontSize: 16, fontWeight: 800 }}>{message.subject}</span>
          </div>
          <div style={{ fontSize: 11.5, color: '#8d8a82', marginTop: 3 }}>
            จากไอดี <b style={{ color: '#46443c' }}>{message.fromName}</b> · {new Date(message.createdAt).toLocaleString('th-TH')}
          </div>
        </div>
        {canDelete && (
          <button onClick={() => del.mutate()} style={{ flex: 'none', padding: '6px 12px', background: '#fff', border: '1px solid #f0d3cb', color: '#b4513a', borderRadius: 8, fontSize: 11.5, cursor: 'pointer' }}>
            🗑 ลบข้อความ
          </button>
        )}
      </div>

      {item && isDev && (
        <div style={{ margin: '14px 20px 0', padding: '13px 15px', background: '#faf8fd', border: '1px solid #e7defa', borderRadius: 11, display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#a8a59d', letterSpacing: '.04em' }}>รายการที่ขอ</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#46443c' }}>{item.name}</div>
          </div>
          {!message.approved ? (
            <>
              <input value={credits} onChange={(e) => setCredits(e.target.value)} inputMode="numeric" placeholder="Cr." title="จำนวน Cr." style={{ width: 64, border: '1px solid #e6c98a', borderRadius: 9, padding: '8px 10px', fontSize: 12, fontWeight: 700, textAlign: 'center', outline: 'none', color: '#a8760f' }} />
              <button onClick={() => notify.mutate()} style={{ padding: '8px 14px', background: '#fff', border: '1px solid #d8d5ce', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✎ ส่งแจ้งเตือนให้แก้ไข</button>
              <button onClick={() => approve.mutate()} style={{ padding: '8px 16px', background: '#5b3fa0', color: '#fff', border: 'none', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>🌙 อนุมัติ · ลง Official</button>
            </>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 700, color: '#5b3fa0' }}>🌙 อนุมัติเป็น Official แล้ว</span>
          )}
        </div>
      )}

      {item && (
        <div style={{ margin: '12px 20px 0', border: '1px solid #ece9e3', borderRadius: 11, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: '#faf9f7', borderBottom: '1px solid #ece9e3', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#46443c' }}>📋 ข้อมูลที่ผู้ใช้ส่งมา</span>
            <span style={{ fontSize: 9.5, color: '#a8a59d' }}>{cfg?.title}</span>
          </div>
          <div style={{ padding: '13px 15px' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#15140f', marginBottom: 8 }}>{item.name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 10 }}>
              {detailKeys.map(([label, key]) => (
                <div key={key} style={{ background: '#faf9f7', border: '1px solid #ece9e3', borderRadius: 8, padding: '6px 10px' }}>
                  <div style={{ fontSize: 9, color: '#a8a59d', fontWeight: 700 }}>{label}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#46443c' }}>{key === 'source' ? item.source : String(item.fields[key] ?? '—')}</div>
                </div>
              ))}
            </div>
            {item.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 9 }}>
                {item.tags.map((t) => (
                  <span key={t} style={{ fontSize: 10, fontWeight: 600, color: '#5f5c54', background: '#f0eee9', borderRadius: 6, padding: '2px 9px' }}>#{t}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={bubble(origMine, false)}>
          <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.7, marginBottom: 3 }}>{message.fromName} · {new Date(message.createdAt).toLocaleString('th-TH')}</div>
          {message.body}
        </div>
        {message.replies.map((r) => (
          <div key={r.id} style={bubble(r.byUserId === user?.id, r.isDev)}>
            <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.7, marginBottom: 3 }}>{r.byName} · {new Date(r.createdAt).toLocaleString('th-TH')}</div>
            {r.body}
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px solid #ece9e3', padding: '13px 16px', display: 'flex', gap: 9, alignItems: 'flex-end' }}>
        <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="พิมพ์คำตอบ…" style={{ flex: 1, minHeight: 44, maxHeight: 120, border: '1px solid #e0ded7', borderRadius: 9, padding: '10px 13px', fontSize: 13, outline: 'none', lineHeight: 1.6, resize: 'vertical', fontFamily: 'var(--font-body)' }} />
        <button onClick={() => reply.trim() && sendReply.mutate()} disabled={sendReply.isPending} style={{ flex: 'none', padding: '11px 18px', background: '#15140f', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ตอบกลับ
        </button>
      </div>
    </>
  );
}

function ComposeForm({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const { isDev } = useAuth();
  const qc = useQueryClient();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const send = useMutation({
    mutationFn: () => api.post('/pray', { subject, body, toUserId: isDev && to ? to : null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pray'] }); onSent(); },
  });
  return (
    <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
      <div style={{ fontSize: 14, fontWeight: 800 }}>{isDev ? 'ส่งข้อความถึงผู้ใช้' : 'เขียนคำอธิษฐานใหม่'}</div>
      {isDev && <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="ถึงไอดีผู้ใช้ (เว้นว่าง = ทุกคน)" style={inp} />}
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="หัวข้อ" style={inp} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="เขียนข้อความของคุณ…" style={{ ...inp, flex: 1, minHeight: 200, lineHeight: 1.7, resize: 'vertical', fontFamily: 'var(--font-body)' }} />
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ padding: '10px 18px', background: '#fff', border: '1px solid #d9d7d0', borderRadius: 9, fontSize: 13, cursor: 'pointer' }}>ยกเลิก</button>
        <button onClick={() => subject.trim() && body.trim() && send.mutate()} disabled={send.isPending} style={{ padding: '10px 20px', background: '#15140f', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>📨 ส่งข้อความ</button>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { border: '1px solid #e0ded7', borderRadius: 9, padding: '11px 14px', fontSize: 13.5, outline: 'none' };
