import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WiwonCover } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { api, uploadImage } from '../lib/api';
import { CategoryDocLayout } from '../components/CategoryDocLayout';
import { Modal } from '../components/Modal';
import { Button, inputStyle, labelStyle } from '../components/ui';
import { CATEGORY_META } from '../lib/categoryConfig';
import layout from '../components/layout.module.css';

export function WiwonPage() {
  const { isDev } = useAuth();
  const qc = useQueryClient();
  const meta = CATEGORY_META.wiwon;
  const [params, setParams] = useSearchParams();

  const { data } = useQuery({
    queryKey: ['wiwon-covers'],
    queryFn: () => api.get<{ covers: WiwonCover[] }>('/wiwon-covers'),
  });
  const covers = useMemo(() => data?.covers ?? [], [data]);

  const [addOpen, setAddOpen] = useState(false);
  const [editCoverId, setEditCoverId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', heroTitle: '', heroSubtitle: '', updateDateLabel: '' });

  // The chosen วิวรณ์ lives in the URL (?book=), so the shelf ↔ book transition
  // works with the browser Back button and is shareable.
  const selectedId = params.get('book');
  const selected = covers.find((c) => c.id === selectedId) ?? null;
  const openBook = (id: string) => setParams({ book: id });
  const backToShelf = () => setParams({});

  const addCover = useMutation({
    mutationFn: () =>
      api.post('/wiwon-covers', {
        name: form.name,
        heroTitle: form.heroTitle || form.name,
        heroSubtitle: form.heroSubtitle,
        updateDateLabel: form.updateDateLabel || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wiwon-covers'] });
      setAddOpen(false);
      setForm({ name: '', heroTitle: '', heroSubtitle: '', updateDateLabel: '' });
    },
  });

  const heroTitle = selected?.heroTitle || selected?.name || meta.name;
  const heroSubtitle = selected?.heroSubtitle || meta.tagline;

  const aboveGrid = (
    <>
      <button
        onClick={backToShelf}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#5f5c54', cursor: 'pointer', marginBottom: 16 }}
      >
        ← ชั้นหนังสือ
      </button>
      <ActiveWiwon covers={covers} selectedId={selectedId} onSelect={openBook} isDev={isDev} onAdd={() => setAddOpen(true)} onEditCover={setEditCoverId} />
      {selected && (
        <div style={{ position: 'relative', overflow: 'hidden', background: '#15140f', borderRadius: 18, padding: '46px 48px', minHeight: 200, display: 'flex', flexDirection: 'column', justifyContent: 'center', marginBottom: 22 }}>
          <div style={{ position: 'absolute', right: -40, top: -40, width: 300, height: 300, background: 'radial-gradient(circle,rgba(224,122,95,.3),transparent 65%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', maxWidth: 620 }}>
            <span style={{ fontSize: 11, letterSpacing: '.14em', color: '#e07a5f', fontWeight: 700 }}>ACTIVE WIWON</span>
            <h1 style={{ margin: '10px 0 0', color: '#fff', fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 32, letterSpacing: '-.01em' }}>{heroTitle}</h1>
            <p style={{ color: '#c4c1b8', fontSize: 14, lineHeight: 1.6, margin: '12px 0 0' }}>{heroSubtitle}</p>
          </div>
          {isDev && (
            <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8 }}>
              <button
                onClick={() => setEditCoverId(selected.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(42,40,34,.85)', border: '1px solid #3d3a32', color: '#e8e5dd', borderRadius: 8, fontSize: 12, cursor: 'pointer', backdropFilter: 'blur(4px)' }}
              >
                ✎ แก้ไขปก
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      {!selectedId ? (
        <Bookshelf covers={covers} isDev={isDev} onOpen={openBook} onAdd={() => setAddOpen(true)} onEditCover={setEditCoverId} />
      ) : (
        <CategoryDocLayout
          category="wiwon"
          coverId={selectedId}
          heroTitle={heroTitle}
          paneTitle={selected?.name}
          hideHero
          hideTagSearch
          aboveGrid={aboveGrid}
          emptyNote="ปกเล่มนี้ยังไม่มีบทความ — ผู้พัฒนาเพิ่มได้ผ่าน Content Editor"
        />
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="เพิ่มวิวรณ์ใหม่"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              ยกเลิก
            </Button>
            <Button variant="coral" onClick={() => form.name.trim() && addCover.mutate()} disabled={addCover.isPending}>
              เพิ่มวิวรณ์
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>ชื่อเล่ม</label>
            <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="เช่น Wiwon เล่มที่ 2" autoFocus />
          </div>
          <div>
            <label style={labelStyle}>หัวข้อ Hero</label>
            <input style={inputStyle} value={form.heroTitle} onChange={(e) => setForm({ ...form, heroTitle: e.target.value })} placeholder="(ไม่กรอกจะใช้ชื่อเล่ม)" />
          </div>
          <div>
            <label style={labelStyle}>คำโปรย Hero</label>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={form.heroSubtitle} onChange={(e) => setForm({ ...form, heroSubtitle: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>วันที่อัปเดต (ป้ายกำกับ)</label>
            <input style={inputStyle} value={form.updateDateLabel} onChange={(e) => setForm({ ...form, updateDateLabel: e.target.value })} placeholder="เช่น 15/06/2569" />
          </div>
        </div>
      </Modal>

      {editCoverId && (
        <CoverEditModal
          cover={covers.find((c) => c.id === editCoverId)!}
          onClose={() => setEditCoverId(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['wiwon-covers'] })}
        />
      )}
    </>
  );
}

// The landing "shelf" — pick a วิวรณ์ (book) to open, or (dev) add one.
function Bookshelf({
  covers,
  isDev,
  onOpen,
  onAdd,
  onEditCover,
}: {
  covers: WiwonCover[];
  isDev: boolean;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onEditCover: (id: string) => void;
}) {
  return (
    <div className={layout.page} style={{ paddingTop: 32 }}>
      <div style={{ marginBottom: 26 }}>
        <span style={{ fontSize: 11, letterSpacing: '.14em', color: '#e07a5f', fontWeight: 700 }}>WIWON</span>
        <h1 style={{ margin: '6px 0 0', fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 32, letterSpacing: '-.01em' }}>ชั้นหนังสือ</h1>
        <p style={{ margin: '8px 0 0', color: '#8d8a82', fontSize: 14 }}>เลือกวิวรณ์ที่ต้องการเปิดอ่าน</p>
      </div>

      {/* A wooden bookcase: books stand upright on continuous shelf planks. */}
      <div style={{ borderRadius: 16, border: '1px solid #cdb79a', background: 'linear-gradient(#efe7d9,#e6dbc8)', boxShadow: 'inset 0 2px 12px rgba(90,60,30,.09)', padding: '26px 16px 12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(126px, 1fr))', columnGap: 0, rowGap: 26 }}>
          {covers.map((c) => (
            <div key={c.id} onClick={() => onOpen(c.id)} style={{ cursor: 'pointer', padding: '0 12px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {/* book cover, standing on the shelf */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: 104,
                  height: 150,
                  borderRadius: '4px 7px 7px 4px',
                  border: '1px solid rgba(0,0,0,.14)',
                  boxShadow: '0 12px 10px -8px rgba(70,45,20,.5)',
                  background: c.coverImageUrl
                    ? `center/cover url(${c.coverImageUrl})`
                    : c.hasData
                      ? 'linear-gradient(160deg,#f4d9d1,#e7b6a7)'
                      : 'linear-gradient(160deg,#ded6c6,#cbc1ab)',
                }}
              >
                <div style={{ position: 'absolute', left: 6, top: 0, bottom: 0, width: 3, background: 'rgba(0,0,0,.10)', borderRadius: '4px 0 0 4px' }} />
                {isDev && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditCover(c.id); }}
                    title="แก้ไขปก"
                    style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: '50%', background: 'rgba(21,20,15,.55)', border: 'none', color: '#fff', fontSize: 12, cursor: 'pointer' }}
                  >
                    ✎
                  </button>
                )}
                {!c.hasData && !c.coverImageUrl && (
                  <span style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', fontSize: 11, color: '#8d8378', background: 'rgba(255,255,255,.72)', borderRadius: 5, padding: '2px 9px', whiteSpace: 'nowrap' }}>ว่าง</span>
                )}
              </div>
              {/* wooden plank — spans the full cell so neighbours join into one shelf */}
              <div style={{ width: 'calc(100% + 24px)', marginLeft: -12, marginRight: -12, height: 14, background: 'linear-gradient(#8a5a34,#5c3a1e)', borderTop: '2px solid #a4713f', boxShadow: '0 6px 7px rgba(70,45,20,.3)' }} />
              <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 9, width: '100%', textAlign: 'center', color: '#4a3f2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
              <div style={{ fontSize: 10.5, color: '#9a8a70', marginTop: 1 }}>อัพเดท {c.updateDateLabel || '—'}</div>
            </div>
          ))}

          {isDev && (
            <div onClick={onAdd} style={{ cursor: 'pointer', padding: '0 12px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '100%', maxWidth: 104, height: 150, borderRadius: 6, border: '2px dashed #c3a184', background: 'rgba(255,255,255,.35)', color: '#a06a44', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span style={{ fontSize: 28, lineHeight: 1 }}>＋</span>
                <span style={{ fontSize: 11.5, fontWeight: 600 }}>เพิ่มวิวรณ์</span>
              </div>
              <div style={{ width: 'calc(100% + 24px)', marginLeft: -12, marginRight: -12, height: 14, background: 'linear-gradient(#8a5a34,#5c3a1e)', borderTop: '2px solid #a4713f', boxShadow: '0 6px 7px rgba(70,45,20,.3)' }} />
              <div style={{ height: 30 }} />
            </div>
          )}
        </div>

        {covers.length === 0 && !isDev && (
          <div style={{ color: '#9a8a70', fontSize: 13, textAlign: 'center', padding: '30px 0' }}>ยังไม่มีวิวรณ์บนชั้น</div>
        )}
      </div>
    </div>
  );
}

// The original in-page cover carousel, shown once you open a วิวรณ์ so you can
// switch between books (and dev can add / edit covers) — same as before.
function ActiveWiwon({
  covers,
  selectedId,
  onSelect,
  isDev,
  onAdd,
  onEditCover,
}: {
  covers: WiwonCover[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isDev: boolean;
  onAdd: () => void;
  onEditCover: (id: string) => void;
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e2dc', borderRadius: 16, padding: '22px 24px', marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 9 }}>
          Active Wiwon <span style={{ fontSize: 12, color: '#a8a59d', fontWeight: 500 }}>เลื่อนเพื่อดูปกทั้งหมด</span>
        </h2>
        {isDev && (
          <button onClick={onAdd} style={{ padding: '7px 14px', background: '#faf6f4', border: '1px solid #e0c4ba', color: '#b4513a', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            + เพิ่มปก
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 16, overflowX: 'auto', padding: '10px 12px 14px', margin: '0 -2px', alignItems: 'flex-start' }}>
        {covers.map((c) => {
          const active = c.id === selectedId;
          return (
            <div key={c.id} style={{ flex: 'none', textAlign: 'center', cursor: 'pointer' }} onClick={() => onSelect(c.id)}>
              <div
                style={{
                  width: active ? 148 : 132,
                  height: active ? 190 : 168,
                  borderRadius: 12,
                  transition: 'all .2s',
                  border: active ? '2px solid var(--coral)' : '1px solid var(--border)',
                  background: c.coverImageUrl
                    ? `center/cover url(${c.coverImageUrl})`
                    : c.hasData
                      ? 'linear-gradient(160deg,#f4d9d1,#e7b6a7)'
                      : 'var(--surface-sunken)',
                  position: 'relative',
                }}
              >
                {isDev && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditCover(c.id); }}
                    title="แก้ไขปก"
                    style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: '50%', background: 'rgba(21,20,15,.55)', border: 'none', color: '#fff', fontSize: 12, cursor: 'pointer' }}
                  >
                    ✎
                  </button>
                )}
                {!c.hasData && !c.coverImageUrl && (
                  <span style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', fontSize: 11, color: '#9a978e', background: 'rgba(255,255,255,.7)', borderRadius: 5, padding: '2px 9px' }}>ว่าง</span>
                )}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, marginTop: 9, maxWidth: 148 }}>{c.name}</div>
              <div style={{ fontSize: 10.5, color: '#9a978e', marginTop: 2 }}>อัพเดท {c.updateDateLabel || '—'}</div>
            </div>
          );
        })}
        {covers.length === 0 && !isDev && (
          <div style={{ color: 'var(--text-ghost)', fontSize: 13, padding: '30px 0' }}>ยังไม่มีเล่ม Wiwon</div>
        )}
      </div>
    </div>
  );
}

function CoverEditModal({ cover, onClose, onSaved }: { cover: WiwonCover; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: cover.name,
    heroTitle: cover.heroTitle ?? '',
    heroSubtitle: cover.heroSubtitle ?? '',
    updateDateLabel: cover.updateDateLabel ?? '',
    coverImageUrl: cover.coverImageUrl,
  });
  const [uploading, setUploading] = useState(false);
  const save = useMutation({
    mutationFn: () => api.patch(`/wiwon-covers/${cover.id}`, form),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const del = useMutation({
    mutationFn: () => api.delete(`/wiwon-covers/${cover.id}`),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="แก้ไขปก Wiwon"
      footer={
        <>
          <Button variant="danger" onClick={() => del.mutate()} style={{ marginRight: 'auto' }}>
            ลบเล่ม
          </Button>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button variant="coral" onClick={() => save.mutate()} disabled={save.isPending}>
            บันทึก
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={labelStyle}>ชื่อเล่ม</label>
          <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>หัวข้อ Hero</label>
          <input style={inputStyle} value={form.heroTitle} onChange={(e) => setForm({ ...form, heroTitle: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>คำโปรย Hero</label>
          <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={form.heroSubtitle} onChange={(e) => setForm({ ...form, heroSubtitle: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>วันที่อัปเดต</label>
          <input style={inputStyle} value={form.updateDateLabel} onChange={(e) => setForm({ ...form, updateDateLabel: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>รูปปก</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ ...inputStyle, width: 'auto', cursor: 'pointer', padding: '7px 12px', fontSize: 12 }}>
              {uploading ? 'กำลังอัปโหลด…' : 'อัปโหลดรูปปก'}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploading(true);
                  try {
                    const url = await uploadImage(f);
                    setForm((s) => ({ ...s, coverImageUrl: url }));
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
            {form.coverImageUrl && (
              <img src={form.coverImageUrl} alt="" style={{ width: 44, height: 58, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
