import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AddField, CatalogCategory, CatalogConfig, CatalogItem } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { api, uploadImage } from '../lib/api';
import { Modal } from './Modal';
import { Button, inputStyle, labelStyle } from './ui';

interface Props {
  open: boolean;
  onClose: () => void;
  category: CatalogCategory;
  cfg: CatalogConfig;
  isFeature: boolean;
  editItem?: CatalogItem | null;
}

// numeric mirror keys the list/filters sort on (e.g. cost -> costNum)
const NUM_MIRROR: Record<string, string> = { cost: 'costNum', weight: 'weightNum', dr: 'drNum' };

export function CatalogAddModal({ open, onClose, category, cfg, isFeature, editItem }: Props) {
  const { isDev } = useAuth();
  const qc = useQueryClient();
  const source = isFeature && cfg.feature ? cfg.feature : cfg;
  const addFields = source.addFields;

  const [fields, setFields] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    addFields.forEach((f) => {
      init[f.key] = editItem ? String((editItem.fields as Record<string, unknown>)[f.key] ?? (f.key === 'name' ? editItem.name : '')) : '';
    });
    if (editItem) init.name = editItem.name;
    return init;
  });
  const [tags, setTags] = useState<string[]>(editItem?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [description, setDescription] = useState(editItem?.description ?? '');
  const [iconUrl, setIconUrl] = useState<string | null>(editItem?.iconUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const { name, ...rest } = fields;
      const outFields: Record<string, unknown> = { ...rest };
      // derive numeric mirror fields
      for (const [k, numKey] of Object.entries(NUM_MIRROR)) {
        if (rest[k]) {
          const n = parseFloat(String(rest[k]).replace(/[^\d.]/g, ''));
          if (!Number.isNaN(n)) outFields[numKey] = n;
        }
      }
      const body = { isFeature, name, fields: outFields, description, tags, iconUrl };
      if (editItem) return api.patch(`/catalog/${category}/item/${editItem.id}`, body);
      return api.post(`/catalog/${category}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog', category] });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'),
  });

  function renderField(f: AddField) {
    const v = fields[f.key] ?? '';
    const set = (val: string) => setFields((s) => ({ ...s, [f.key]: val }));
    if (f.kind === 'select') {
      return (
        <select style={inputStyle} value={v} onChange={(e) => set(e.target.value)}>
          <option value="">— เลือก —</option>
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }
    if (f.kind === 'radio') {
      return (
        <div style={{ display: 'flex', gap: 8 }}>
          {(f.options ?? []).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => set(o)}
              style={{ flex: 1, padding: '9px', borderRadius: 8, border: `1px solid ${v === o ? 'var(--ink)' : 'var(--border-soft)'}`, background: v === o ? 'var(--ink)' : '#fff', color: v === o ? '#fff' : 'var(--text-muted)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
            >
              {o}
            </button>
          ))}
        </div>
      );
    }
    return <input style={inputStyle} value={v} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} />;
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      title={editItem ? 'แก้ไขข้อมูล' : isDev ? 'เพิ่มข้อมูล (Official)' : 'เพิ่ม Homebrew'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button variant="coral" onClick={() => (fields.name?.trim() ? save.mutate() : setError('กรุณากรอกชื่อ'))} disabled={save.isPending}>
            {editItem ? 'บันทึก' : 'เพิ่มข้อมูล'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {addFields.map((f) => (
          <div key={f.key} style={{ gridColumn: f.key === 'name' ? '1 / -1' : 'auto' }}>
            <label style={labelStyle}>{f.label}</label>
            {renderField(f)}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={labelStyle}>แท็ก</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {tags.map((t) => (
            <span key={t} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#edeae4', display: 'inline-flex', gap: 5, alignItems: 'center' }}>
              #{t}
              <button onClick={() => setTags(tags.filter((x) => x !== t))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                ×
              </button>
            </span>
          ))}
        </div>
        <input
          style={inputStyle}
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && tagInput.trim()) {
              e.preventDefault();
              if (!tags.includes(tagInput.trim())) setTags([...tags, tagInput.trim()]);
              setTagInput('');
            }
          }}
          placeholder="พิมพ์แท็กแล้วกด Enter"
        />
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={labelStyle}>รายละเอียด</label>
        <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="อธิบายข้อมูลนี้…" />
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={labelStyle}>รูปภาพประกอบ</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ ...inputStyle, width: 'auto', cursor: 'pointer', padding: '7px 12px', fontSize: 12 }}>
            {uploading ? 'กำลังอัปโหลด…' : iconUrl ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploading(true);
                try {
                  setIconUrl(await uploadImage(f));
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
          {iconUrl && <img src={iconUrl} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />}
        </div>
      </div>

      {error && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--danger)' }}>{error}</div>}
    </Modal>
  );
}
