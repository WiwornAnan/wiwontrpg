import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FilterField } from '@wiwonanant/shared';
import { api } from '../lib/api';

// Shared dark-header modal shell (matches the prototype's MANAGE/POPULAR dialogs).
function TagModalShell({ eyebrow, title, onClose, children }: { eyebrow: string; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 121, background: 'rgba(21,20,15,.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn .2s ease' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
        <div style={{ background: '#15140f', color: '#fff', padding: '18px 24px' }}>
          <div style={{ fontSize: 11, letterSpacing: '.1em', color: '#e07a5f', fontWeight: 700 }}>{eyebrow}</div>
          <h2 style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 600 }}>{title}</h2>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
}

// ---- Manage a single field's tags (add new / hide built-in / delete custom) ----
export function ManageTagsModal({
  field,
  catScope,
  custom,
  hidden,
  onClose,
}: {
  field: FilterField;
  catScope: string;
  custom: string[];
  hidden: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState('');
  const scope = `${catScope}:${field.key}`;
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['catalog-fieldtags', catScope] });
  };

  const add = useMutation({
    mutationFn: (label: string) => api.post('/tags', { scope, label }),
    onSuccess: () => { setValue(''); invalidate(); },
  });
  // builtin=true hides a standard option; builtin=false deletes a row for real
  // (a dev-added tag, or a "hidden" marker row — deleting the marker un-hides it).
  const remove = useMutation({
    mutationFn: (p: { label: string; builtin: boolean }) => api.delete('/tags', { scope, label: p.label, builtin: p.builtin }),
    onSuccess: invalidate,
  });

  const hiddenSet = new Set(hidden);
  const allBuiltins = field.options ?? [];

  return (
    <TagModalShell eyebrow="MANAGE TAGS" title={`จัดการแท็ก — ${field.label}`} onClose={onClose}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 500, color: '#46443c', marginBottom: 14 }}>
        เพิ่มแท็กใหม่
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) add.mutate(value.trim()); }}
            placeholder="พิมพ์ชื่อแท็ก…"
            style={{ flex: 1, border: '1px solid #e0ded7', borderRadius: 9, padding: '11px 14px', fontSize: 14, outline: 'none' }}
          />
          <button
            onClick={() => value.trim() && add.mutate(value.trim())}
            disabled={add.isPending || !value.trim()}
            style={{ padding: '11px 18px', background: '#15140f', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            เพิ่ม
          </button>
        </div>
      </label>
      <div style={{ fontSize: 11.5, color: '#8d8a82', marginBottom: 8 }}>
        แท็กทั้งหมด — สีเขียวคือแท็กมาตรฐาน (กด × เพื่อซ่อน), สีส้มคือแท็กที่เพิ่มเอง (กด × เพื่อลบถาวร)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 28 }}>
        {allBuiltins.map((o) => {
          const isHidden = hiddenSet.has(o);
          return (
            <span key={o} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: isHidden ? '#f3f1ec' : '#e8f2ea', color: isHidden ? '#a8a59d' : '#3f7a52', border: `1px solid ${isHidden ? '#e4e2dc' : '#c9e2d1'}`, borderRadius: 7, padding: '3px 4px 3px 9px', fontSize: 12, textDecoration: isHidden ? 'line-through' : 'none' }}>
              {o}
              <button
                onClick={() => remove.mutate({ label: o, builtin: !isHidden })}
                title={isHidden ? 'คืนค่าแท็กนี้' : 'ซ่อนแท็กนี้'}
                style={{ border: 'none', background: 'none', color: isHidden ? '#a8a59d' : '#7fae90', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}
              >
                {isHidden ? '↺' : '×'}
              </button>
            </span>
          );
        })}
        {custom.map((o) => (
          <span key={o} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fbeee7', color: '#b4513a', border: '1px solid #f0cabd', borderRadius: 7, padding: '3px 4px 3px 9px', fontSize: 12 }}>
            {o}
            <button
              onClick={() => remove.mutate({ label: o, builtin: false })}
              title="ลบแท็กนี้ถาวร"
              style={{ border: 'none', background: 'none', color: '#d08a76', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
            >
              ×
            </button>
          </span>
        ))}
        {allBuiltins.length === 0 && custom.length === 0 && <span style={{ fontSize: 12, color: '#c4c1b9' }}>ยังไม่มีแท็ก</span>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
        <button onClick={onClose} style={{ padding: '10px 22px', background: '#fff', border: '1px solid #d9d7d0', borderRadius: 9, fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>
          เสร็จสิ้น
        </button>
      </div>
    </TagModalShell>
  );
}

// ---- Edit the Popular Tags row (comma-separated; empty = auto by frequency) ----
export function PopularTagsModal({ catScope, current, onClose }: { catScope: string; current: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(current.join(', '));

  const save = useMutation({
    mutationFn: (tags: string[]) => api.post('/tags/popular', { scope: catScope, tags }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog'] });
      onClose();
    },
  });

  return (
    <TagModalShell eyebrow="POPULAR TAGS" title="แก้ไข Popular Tags" onClose={onClose}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 500, color: '#46443c', marginBottom: 8 }}>
        รายการแท็ก (คั่นด้วยจุลภาค ,)
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ border: '1px solid #e0ded7', borderRadius: 9, padding: '10px 13px', fontSize: 13.5, outline: 'none', minHeight: 80, resize: 'vertical', lineHeight: 1.6, fontFamily: "'Anuphan',sans-serif" }}
        />
      </label>
      <div style={{ fontSize: 11, color: '#a8a59d', marginBottom: 16 }}>
        เว้นว่างไว้เพื่อกลับไปใช้แท็กยอดนิยมอัตโนมัติ (ตามจำนวนการใช้งาน)
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
        <button onClick={onClose} style={{ padding: '10px 20px', background: '#fff', border: '1px solid #d9d7d0', borderRadius: 9, fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>
          ยกเลิก
        </button>
        <button
          onClick={() => save.mutate(draft.split(',').map((t) => t.trim()).filter(Boolean))}
          disabled={save.isPending}
          style={{ padding: '10px 22px', background: '#15140f', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}
        >
          บันทึก
        </button>
      </div>
    </TagModalShell>
  );
}
