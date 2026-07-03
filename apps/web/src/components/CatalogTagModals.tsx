import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FilterField } from '@wiwonanant/shared';
import { api } from '../lib/api';
import { mergeFieldOptions } from '../lib/catalogHooks';

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
  order,
  onClose,
}: {
  field: FilterField;
  catScope: string;
  custom: string[];
  hidden: string[];
  order: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState('');
  const [err, setErr] = useState('');
  const scope = `${catScope}:${field.key}`;
  const invalidate = () => qc.invalidateQueries({ queryKey: ['catalog-fieldtags', catScope] });

  const add = useMutation({
    mutationFn: (label: string) => api.post('/tags', { scope, label }),
    onSuccess: () => { setValue(''); setErr(''); invalidate(); },
  });
  const remove = useMutation({
    mutationFn: (p: { label: string; builtin: boolean }) => api.delete('/tags', { scope, label: p.label, builtin: p.builtin }),
    onSuccess: invalidate,
  });
  const saveOrder = useMutation({
    mutationFn: (ord: string[]) => api.post('/tags/order', { scope, order: ord }),
    onSuccess: invalidate,
  });

  const allBuiltins = field.options ?? [];
  const customSet = new Set(custom);
  const visible = mergeFieldOptions(allBuiltins, { custom, hidden, order });

  const tryAdd = () => {
    const label = value.trim();
    if (!label) return;
    const lower = label.toLowerCase();
    // A currently-visible tag (built-in not removed, or a custom) is a duplicate;
    // a name that was removed earlier can be typed again to bring it back.
    if (visible.some((o) => o.toLowerCase() === lower)) {
      setErr(`มีแท็ก “${label}” อยู่แล้ว`);
      return;
    }
    add.mutate(label);
  };
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= visible.length) return;
    const next = visible.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    saveOrder.mutate(next);
  };

  return (
    <TagModalShell eyebrow="MANAGE TAGS" title={`จัดการแท็ก — ${field.label}`} onClose={onClose}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 500, color: '#46443c', marginBottom: 6 }}>
        เพิ่มแท็กใหม่
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={value}
            onChange={(e) => { setValue(e.target.value); if (err) setErr(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') tryAdd(); }}
            placeholder="พิมพ์ชื่อแท็ก…"
            style={{ flex: 1, border: `1px solid ${err ? '#e0a99a' : '#e0ded7'}`, borderRadius: 9, padding: '11px 14px', fontSize: 14, outline: 'none' }}
          />
          <button
            onClick={tryAdd}
            disabled={add.isPending || !value.trim()}
            style={{ padding: '11px 18px', background: '#15140f', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            เพิ่ม
          </button>
        </div>
      </label>
      {err && <div style={{ fontSize: 11.5, color: '#b4513a', marginBottom: 8 }}>{err}</div>}
      <div style={{ fontSize: 11.5, color: '#8d8a82', margin: '8px 0' }}>
        ▲▼ จัดลำดับ · เขียว = มาตรฐาน · ส้ม = เพิ่มเอง · กด × เพื่อเอาออก
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 300, overflowY: 'auto' }}>
        {visible.map((o, i) => {
          const isCustom = customSet.has(o);
          return (
            <div key={o} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button onClick={() => move(i, -1)} disabled={i === 0} title="เลื่อนขึ้น" style={{ border: 'none', background: 'none', cursor: i === 0 ? 'default' : 'pointer', fontSize: 9, lineHeight: 1, color: i === 0 ? '#d5d2cb' : '#8d8a82', padding: 0 }}>▲</button>
                <button onClick={() => move(i, 1)} disabled={i === visible.length - 1} title="เลื่อนลง" style={{ border: 'none', background: 'none', cursor: i === visible.length - 1 ? 'default' : 'pointer', fontSize: 9, lineHeight: 1, color: i === visible.length - 1 ? '#d5d2cb' : '#8d8a82', padding: 0 }}>▼</button>
              </div>
              <span style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 5, background: isCustom ? '#fbeee7' : '#e8f2ea', color: isCustom ? '#b4513a' : '#3f7a52', border: `1px solid ${isCustom ? '#f0cabd' : '#c9e2d1'}`, borderRadius: 7, padding: '5px 8px 5px 11px', fontSize: 12.5 }}>
                {o}
                <button
                  onClick={() => remove.mutate({ label: o, builtin: !isCustom })}
                  title={isCustom ? 'ลบแท็กนี้' : 'เอาแท็กนี้ออก'}
                  style={{ border: 'none', background: 'none', color: isCustom ? '#d08a76' : '#7fae90', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
                >
                  ×
                </button>
              </span>
            </div>
          );
        })}
        {visible.length === 0 && <span style={{ fontSize: 12, color: '#c4c1b9' }}>ยังไม่มีแท็ก</span>}
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
