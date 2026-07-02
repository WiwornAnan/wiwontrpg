import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { api, uploadImage } from '../lib/api';
import { CATEGORY_META } from '../lib/categoryConfig';
import type { DocCategory } from '@wiwonanant/shared';
import { Modal } from './Modal';
import { Button, inputStyle, labelStyle } from './ui';
import styles from './layout.module.css';

interface HeroData {
  title: string;
  subtitle: string;
  imageUrl: string | null;
}

export function HeroBanner({ category, title, subtitle }: { category: DocCategory; title?: string; subtitle?: string }) {
  const { isDev } = useAuth();
  const qc = useQueryClient();
  const meta = CATEGORY_META[category];

  const { data } = useQuery({
    queryKey: ['hero', category],
    queryFn: () => api.get<{ hero: HeroData | null }>(`/heroes/${category}`),
  });
  const hero = data?.hero;

  const shownTitle = hero?.title ?? title ?? meta.name;
  const shownSub = hero?.subtitle ?? subtitle ?? meta.tagline;
  const bgImage = hero?.imageUrl ?? null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<HeroData>({ title: shownTitle, subtitle: shownSub, imageUrl: bgImage });
  const [uploading, setUploading] = useState(false);

  const save = useMutation({
    mutationFn: () => api.put(`/heroes/${category}`, draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hero', category] });
      setEditing(false);
    },
  });
  const reset = useMutation({
    mutationFn: () => api.delete(`/heroes/${category}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hero', category] });
      setEditing(false);
    },
  });

  function openEdit() {
    setDraft({ title: shownTitle, subtitle: shownSub, imageUrl: bgImage });
    setEditing(true);
  }

  async function onFile(file: File) {
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setDraft((d) => ({ ...d, imageUrl: url }));
    } finally {
      setUploading(false);
    }
  }

  const heroStyle: React.CSSProperties = bgImage
    ? { backgroundImage: `linear-gradient(rgba(21,20,15,.62),rgba(21,20,15,.62)), url(${bgImage})` }
    : {};

  return (
    <>
      <div className={styles.hero} style={heroStyle}>
        <div className={styles.heroGlow} />
        <div style={{ position: 'relative', maxWidth: 640 }}>
          <h1 className={styles.heroTitle}>{shownTitle}</h1>
          <p className={styles.heroSub}>{shownSub}</p>
        </div>
        {isDev && (
          <button className={styles.heroEdit} onClick={openEdit}>
            ✎ แก้ไข Banner
          </button>
        )}
      </div>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="แก้ไข Banner"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              ยกเลิก
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              บันทึก Banner
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>หัวข้อ</label>
            <input style={inputStyle} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>คำโปรย</label>
            <textarea
              style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
              value={draft.subtitle}
              onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
            />
          </div>
          <div>
            <label style={labelStyle}>รูปพื้นหลัง (แนะนำ 1600 × 480 px, อัตราส่วน 10:3)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ ...inputStyle, width: 'auto', cursor: 'pointer', display: 'inline-block' }}>
                {uploading ? 'กำลังอัปโหลด…' : 'อัปโหลดรูป'}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                />
              </label>
              {draft.imageUrl && (
                <Button variant="danger" onClick={() => setDraft({ ...draft, imageUrl: null })}>
                  ลบรูป กลับเป็นพื้นฐาน
                </Button>
              )}
            </div>
            {draft.imageUrl && (
              <img
                src={draft.imageUrl}
                alt=""
                style={{ marginTop: 10, width: '100%', height: 120, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }}
              />
            )}
          </div>
          {hero && (
            <button
              onClick={() => reset.mutate()}
              style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 12.5, textDecoration: 'underline', cursor: 'pointer', alignSelf: 'flex-start' }}
            >
              คืนค่า Banner เป็นค่าเริ่มต้นทั้งหมด
            </button>
          )}
        </div>
      </Modal>
    </>
  );
}
