import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WiwonCover } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { api, uploadImage } from '../lib/api';
import { CategoryDocLayout } from '../components/CategoryDocLayout';
import { Modal } from '../components/Modal';
import { Button, inputStyle, labelStyle } from '../components/ui';
import { CATEGORY_META } from '../lib/categoryConfig';
import styles from '../components/layout.module.css';

export function WiwonPage() {
  const { isDev } = useAuth();
  const qc = useQueryClient();
  const meta = CATEGORY_META.wiwon;

  const { data } = useQuery({
    queryKey: ['wiwon-covers'],
    queryFn: () => api.get<{ covers: WiwonCover[] }>('/wiwon-covers'),
  });
  const covers = useMemo(() => data?.covers ?? [], [data]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', heroTitle: '', heroSubtitle: '', updateDateLabel: '' });

  // Default to the first cover that has data.
  useEffect(() => {
    if (!selectedId && covers.length) {
      setSelectedId((covers.find((c) => c.hasData) ?? covers[0]).id);
    }
  }, [covers, selectedId]);

  const selected = covers.find((c) => c.id === selectedId) ?? null;

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

  const carousel = (
    <ActiveWiwon covers={covers} selectedId={selectedId} onSelect={setSelectedId} isDev={isDev} onAdd={() => setAddOpen(true)} />
  );

  const heroTitle = selected?.heroTitle || selected?.name || meta.name;
  const heroSubtitle = selected?.heroSubtitle || meta.tagline;

  return (
    <>
      <CategoryDocLayout
        category="wiwon"
        coverId={selectedId ?? undefined}
        heroTitle={heroTitle}
        heroSubtitle={heroSubtitle}
        paneTitle={selected?.name}
        aboveGrid={carousel}
        emptyNote={selected ? 'ปกนี้ยังไม่มีบทความ' : 'เลือกเล่ม Wiwon เพื่อเริ่มอ่าน'}
      />

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="เพิ่มปก Wiwon ใหม่"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              ยกเลิก
            </Button>
            <Button variant="coral" onClick={() => form.name.trim() && addCover.mutate()} disabled={addCover.isPending}>
              เพิ่มปก
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
    </>
  );
}

function ActiveWiwon({
  covers,
  selectedId,
  onSelect,
  isDev,
  onAdd,
}: {
  covers: WiwonCover[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isDev: boolean;
  onAdd: () => void;
}) {
  const qc = useQueryClient();
  const [editCover, setEditCover] = useState<WiwonCover | null>(null);

  return (
    <div className={styles.card} style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 9, fontSize: 17, fontWeight: 600 }}>
          <span style={{ width: 9, height: 9, background: 'var(--coral)', borderRadius: '50%' }} />
          Active Wiwon
        </h2>
      </div>
      <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 6 }}>
        {covers.map((c) => {
          const active = c.id === selectedId;
          return (
            <div key={c.id} style={{ flex: 'none', textAlign: 'center', cursor: 'pointer' }} onClick={() => onSelect(c.id)}>
              <div
                style={{
                  width: active ? 132 : 108,
                  height: active ? 176 : 148,
                  borderRadius: 12,
                  transition: 'all .2s',
                  border: active ? '2px solid var(--coral)' : '1px solid var(--border)',
                  background: c.coverImageUrl
                    ? `center/cover url(${c.coverImageUrl})`
                    : c.hasData
                      ? 'linear-gradient(160deg,#f4d9d1,#e7b6a7)'
                      : 'var(--surface-sunken)',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  padding: 8,
                  position: 'relative',
                }}
              >
                {!c.hasData && !c.coverImageUrl && (
                  <span style={{ fontSize: 11, color: 'var(--text-ghost)' }}>ว่าง</span>
                )}
                {isDev && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditCover(c);
                    }}
                    style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(21,20,15,.7)', border: 'none', color: '#fff', borderRadius: 6, fontSize: 11, padding: '3px 6px', cursor: 'pointer' }}
                  >
                    ✎
                  </button>
                )}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 8, maxWidth: 132 }}>{c.name}</div>
              {c.updateDateLabel && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{c.updateDateLabel}</div>}
            </div>
          );
        })}
        {isDev && (
          <button
            onClick={onAdd}
            style={{ flex: 'none', width: 108, height: 148, borderRadius: 12, border: '1px dashed #e0c4ba', background: 'var(--coral-bg)', color: 'var(--coral-ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}
          >
            + เพิ่มปก
          </button>
        )}
        {covers.length === 0 && !isDev && (
          <div style={{ color: 'var(--text-ghost)', fontSize: 13, padding: '30px 0' }}>ยังไม่มีเล่ม Wiwon</div>
        )}
      </div>

      {editCover && <CoverEditModal cover={editCover} onClose={() => setEditCover(null)} onSaved={() => qc.invalidateQueries({ queryKey: ['wiwon-covers'] })} />}
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
