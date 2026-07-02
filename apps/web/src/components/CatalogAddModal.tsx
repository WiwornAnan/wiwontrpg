import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AddField, CatalogCategory, CatalogConfig, CatalogItem } from '@wiwonanant/shared';
import { useAuth } from '../auth/AuthContext';
import { api, uploadImage } from '../lib/api';
import { useCatalogFieldTags } from '../lib/catalogHooks';
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
  // Merge dev-managed tags into the field options, same as the filter panel:
  // built-ins (minus hidden) + custom. Lets Tags management flow into this form.
  const catScope = isFeature ? `${category}-feature` : category;
  const { data: fieldTags } = useCatalogFieldTags(catScope);
  const optsFor = (f: AddField): string[] => {
    const t = fieldTags?.[f.key];
    const hidden = new Set(t?.hidden ?? []);
    return [...(f.options || []).filter((o) => !hidden.has(o)), ...(t?.custom ?? [])];
  };

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

  // Tags auto-derived from the dropdown / multi-select choices, so the picks
  // themselves become the item's tags (plus any typed manually).
  const autoTags = Array.from(
    new Set(
      addFields
        .filter((f) => f.kind === 'select' || f.kind === 'checks')
        .flatMap((f) => (fields[f.key] ?? '').split(',').map((s) => s.trim()))
        .filter(Boolean),
    ),
  );

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
      const body = { isFeature, name, fields: outFields, description, tags: Array.from(new Set([...autoTags, ...tags])), iconUrl };
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
    if (f.kind === 'checks') {
      const cur = v ? v.split(',').map((x) => x.trim()).filter(Boolean) : [];
      const toggle = (o: string) => set((cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]).join(', '));
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {optsFor(f).map((o) => {
            const on = cur.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => toggle(o)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, border: `1.5px solid ${on ? 'var(--ink)' : 'var(--border-soft)'}`, background: on ? 'var(--ink)' : '#fff', color: on ? '#fff' : 'var(--text-muted)' }}
              >
                <span style={{ width: 20, height: 20, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: on ? 'rgba(255,255,255,.22)' : '#efece6', color: on ? '#fff' : '#a8a59d' }}>
                  {o.charAt(0).toUpperCase()}
                </span>
                {o}
              </button>
            );
          })}
        </div>
      );
    }
    if (f.kind === 'select') {
      return (
        <select style={inputStyle} value={v} onChange={(e) => set(e.target.value)}>
          <option value="">— เลือก —</option>
          {optsFor(f).map((o) => (
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
          {optsFor(f).map((o) => (
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
          <div key={f.key} style={{ gridColumn: f.key === 'name' || f.kind === 'checks' ? '1 / -1' : 'auto' }}>
            <label style={labelStyle}>{f.label}</label>
            {renderField(f)}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={labelStyle}>แท็ก</label>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>ตัวเลือกด้านบนกลายเป็นแท็กอัตโนมัติ (สีม่วง) — เพิ่มแท็กเองได้ด้านล่าง</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {autoTags.map((t) => (
            <span key={`auto-${t}`} title="แท็กอัตโนมัติจากตัวเลือก" style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#ede7f6', color: '#5b3fa0', display: 'inline-flex', gap: 5, alignItems: 'center' }}>
              #{t}
            </span>
          ))}
          {tags
            .filter((t) => !autoTags.includes(t))
            .map((t) => (
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
        <RichTextEditor initialHtml={editItem?.description ?? ''} onChange={setDescription} />
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

// Toolbar colours (label used as the button tooltip).
const RT_COLORS: [string, string][] = [
  ['#15140f', 'ดำ'],
  ['#b4513a', 'แดง'],
  ['#2a6a9a', 'น้ำเงิน'],
  ['#2f6b4f', 'เขียว'],
  ['#5b3fa0', 'ม่วง'],
  ['#b06a2a', 'ส้ม'],
];

// Lightweight rich-text editor for item descriptions: bold / italic /
// divider / colour, backed by a contentEditable div. The produced HTML
// (b, i, hr, span[style=color]) matches what the server sanitiser allows.
function RichTextEditor({ initialHtml, onChange }: { initialHtml: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initialHtml || '';
    // Only seed the DOM once per mount; the modal remounts per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sync = () => onChange(ref.current?.innerHTML ?? '');
  // styleWithCSS only for colour (so it emits <span style="color">); bold/italic
  // stay as <b>/<i> tags, which is what survives the server sanitiser.
  const exec = (cmd: string, val?: string, css = false) => {
    ref.current?.focus();
    try {
      document.execCommand('styleWithCSS', false, css ? 'true' : 'false');
    } catch {
      /* older browsers */
    }
    try {
      document.execCommand(cmd, false, val);
    } catch {
      /* noop */
    }
    sync();
  };
  const btn: React.CSSProperties = {
    height: 28,
    minWidth: 28,
    padding: '0 8px',
    borderRadius: 6,
    border: '1px solid var(--border-soft)',
    background: '#fff',
    cursor: 'pointer',
    fontSize: 12.5,
    color: 'var(--ink)',
    lineHeight: 1,
  };
  // keep the text selection while clicking a toolbar button
  const hold = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '7px 9px', background: '#faf9f7', border: '1px solid var(--border-soft)', borderBottom: 'none', borderRadius: '9px 9px 0 0' }}>
        <button type="button" title="ตัวหนา" onMouseDown={hold} onClick={() => exec('bold')} style={{ ...btn, fontWeight: 800 }}>
          B
        </button>
        <button type="button" title="ตัวเอียง" onMouseDown={hold} onClick={() => exec('italic')} style={{ ...btn, fontStyle: 'italic', fontWeight: 700 }}>
          I
        </button>
        <button type="button" title="ใส่บรรทัดคั่น" onMouseDown={hold} onClick={() => exec('insertHTML', '<hr>')} style={{ ...btn, fontWeight: 700, fontSize: 11 }}>
          — เส้นคั่น
        </button>
        <span style={{ width: 1, height: 20, background: 'var(--border-soft)', margin: '0 2px' }} />
        <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600 }}>สี:</span>
        {RT_COLORS.map(([c, label]) => (
          <button key={c} type="button" title={label} onMouseDown={hold} onClick={() => exec('foreColor', c, true)} style={{ width: 22, height: 22, borderRadius: 6, cursor: 'pointer', border: '1.5px solid rgba(0,0,0,.12)', background: c }} />
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        onInput={sync}
        data-placeholder="อธิบายข้อมูลนี้… (เลือกข้อความแล้วกดปุ่มด้านบนเพื่อจัดรูปแบบ)"
        style={{ border: '1px solid var(--border-soft)', borderRadius: '0 0 9px 9px', padding: '11px 14px', fontSize: 13.5, outline: 'none', minHeight: 90, maxHeight: 240, overflowY: 'auto', lineHeight: 1.7 }}
      />
    </div>
  );
}
