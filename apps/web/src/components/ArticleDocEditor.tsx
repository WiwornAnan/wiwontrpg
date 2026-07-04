import { Fragment } from 'react';
import type { ArticleImage, ArticleTable, ImageLayout, StickyNote } from '@wiwonanant/shared';
import { RichBodyEditor } from './RichBodyEditor';
import { splitDoc, joinDoc, type DocModel, type DocSeg } from '../lib/articleDoc';

const uid = () => Math.random().toString(36).slice(2, 10);

// One flowing document: text runs (RichBodyEditor) interleaved with the table /
// note / image blocks that sit between them, plus a slim insert bar at every
// seam. Editing anything reassembles the storage shape (markdown body + the
// positioned block arrays) through joinDoc, so nothing downstream changes.
export function ArticleDocEditor({
  model,
  onChange,
  uploadImage,
}: {
  model: DocModel;
  onChange: (m: DocModel) => void;
  uploadImage: (f: File) => Promise<string>;
}) {
  const segs = splitDoc(model);
  const commit = (next: DocSeg[]) => onChange(joinDoc(next));

  const setRun = (run: number, md: string) => commit(segs.map((s) => (s.type === 'text' && s.run === run ? { ...s, md } : s)));
  const insertAt = (index: number, seg: DocSeg) => commit([...segs.slice(0, index), seg, ...segs.slice(index)]);

  // Block content edits patch the arrays directly (afterParagraph untouched).
  const patchTable = (id: string, t: ArticleTable) => onChange({ ...model, tables: model.tables.map((x) => (x.id === id ? t : x)) });
  const patchNote = (id: string, text: string) => onChange({ ...model, notes: model.notes.map((x) => (x.id === id ? { ...x, text } : x)) });
  const patchImage = (id: string, patch: Partial<ArticleImage>) => onChange({ ...model, images: model.images.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const removeBlock = (kind: DocSeg['type'], id: string) =>
    onChange({
      ...model,
      images: kind === 'image' ? model.images.filter((x) => x.id !== id) : model.images,
      tables: kind === 'table' ? model.tables.filter((x) => x.id !== id) : model.tables,
      notes: kind === 'note' ? model.notes.filter((x) => x.id !== id) : model.notes,
    });

  const mkTable = (): DocSeg => {
    const id = uid();
    return { type: 'table', id, block: { id, headCells: ['หัวข้อ 1', 'หัวข้อ 2'], rows: [['', '']], afterParagraph: 0 } };
  };
  const mkNote = (): DocSeg => {
    const id = uid();
    return { type: 'note', id, block: { id, text: '', afterParagraph: 0 } };
  };
  const addImageAt = async (index: number, file: File) => {
    const url = await uploadImage(file);
    const id = uid();
    insertAt(index, { type: 'image', id, block: { id, url, layout: 'full', afterParagraph: 0, order: 0 } });
  };

  const renderSeg = (seg: DocSeg) => {
    if (seg.type === 'text')
      return (
        <RichBodyEditor
          value={seg.md}
          onChange={(md) => setRun(seg.run, md)}
          minHeight={seg.md.trim() ? 92 : 46}
          placeholder={seg.run === 0 ? 'เริ่มพิมพ์เนื้อหาบทความ…' : 'พิมพ์เนื้อหาต่อ…'}
        />
      );
    if (seg.type === 'table') return <TableEditor table={seg.block} onChange={(t) => patchTable(seg.id, t)} onRemove={() => removeBlock('table', seg.id)} />;
    if (seg.type === 'note') return <NoteCard note={seg.block} onChange={(text) => patchNote(seg.id, text)} onRemove={() => removeBlock('note', seg.id)} />;
    return <ImageCard image={seg.block} onLayout={(layout) => patchImage(seg.id, { layout })} onRemove={() => removeBlock('image', seg.id)} />;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <style>{DOC_CSS}</style>
      <InsertBar onTable={() => insertAt(0, mkTable())} onNote={() => insertAt(0, mkNote())} onImage={(f) => addImageAt(0, f)} />
      {segs.map((seg, i) => (
        <Fragment key={seg.type === 'text' ? `t${seg.run}` : `${seg.type}-${seg.id}`}>
          {renderSeg(seg)}
          <InsertBar onTable={() => insertAt(i + 1, mkTable())} onNote={() => insertAt(i + 1, mkNote())} onImage={(f) => addImageAt(i + 1, f)} />
        </Fragment>
      ))}
    </div>
  );
}

// A quiet seam between blocks: just a faint "+" until you hover it, then the
// insert options fade in over a hairline — so the page stays clean.
const DOC_CSS = `
.wiwon-ins{position:relative;display:flex;align-items:center;justify-content:center;height:20px}
.wiwon-ins::before{content:"";position:absolute;left:6px;right:6px;top:50%;height:1px;background:var(--border-faint);opacity:0;transition:opacity .14s;pointer-events:none}
.wiwon-ins:hover::before{opacity:1}
.wiwon-ins-dot{color:var(--border);font-size:15px;line-height:1;opacity:.6;transition:opacity .14s;user-select:none;pointer-events:none}
.wiwon-ins:hover .wiwon-ins-dot{display:none}
.wiwon-ins-inner{display:none;gap:6px;position:relative;background:var(--surface,#fff);padding:0 8px}
.wiwon-ins:hover .wiwon-ins-inner{display:flex}
.wiwon-ins-btn{border:1px solid var(--border-faint);background:#fff;border-radius:20px;font-size:11px;font-weight:600;color:var(--text-faint);padding:3px 11px;cursor:pointer;line-height:1.5;display:inline-flex;align-items:center}
.wiwon-ins-btn:hover{color:var(--coral-ink,#b4513a);border-color:#e6cfa6;background:#fdf6f2}
`;

function InsertBar({ onTable, onNote, onImage }: { onTable: () => void; onNote: () => void; onImage: (f: File) => void }) {
  return (
    <div className="wiwon-ins">
      <span className="wiwon-ins-dot" aria-hidden>＋</span>
      <div className="wiwon-ins-inner">
        <button type="button" className="wiwon-ins-btn" title="แทรกตารางตรงนี้" onClick={onTable}>▦ ตาราง</button>
        <button type="button" className="wiwon-ins-btn" title="แทรกป้ายหมายเหตุตรงนี้" onClick={onNote}>📌 ป้าย</button>
        <label className="wiwon-ins-btn" title="แทรกรูปตรงนี้">
          🖼 รูป
          <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onImage(e.target.files[0])} />
        </label>
      </div>
    </div>
  );
}

function NoteCard({ note, onChange, onRemove }: { note: StickyNote; onChange: (text: string) => void; onRemove: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', border: '1px solid #ecdfa8', borderRadius: 10, padding: 8, background: '#fffdf3' }}>
      <span style={{ fontSize: 15, marginTop: 4 }}>📌</span>
      <textarea
        value={note.text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ข้อความหมายเหตุ (แปะป้าย)…"
        style={{ flex: 1, minHeight: 44, resize: 'vertical', border: 'none', background: 'transparent', outline: 'none', fontSize: 13.5, lineHeight: 1.7, color: '#3a3527' }}
      />
      <button onClick={onRemove} title="ลบป้ายนี้" style={delBtn}>✕ ลบป้าย</button>
    </div>
  );
}

const delBtn: React.CSSProperties = { flex: 'none', background: '#fff', border: '1px solid #f0d3cb', color: 'var(--danger)', borderRadius: 7, fontSize: 11, fontWeight: 600, padding: '4px 9px', cursor: 'pointer', whiteSpace: 'nowrap' };

function ImageCard({ image, onLayout, onRemove }: { image: ArticleImage; onLayout: (l: ImageLayout) => void; onRemove: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--border-faint)', borderRadius: 10, padding: 8 }}>
      <img src={image.url} alt="" style={{ width: 64, height: 46, objectFit: 'cover', borderRadius: 6 }} />
      <select value={image.layout} onChange={(e) => onLayout(e.target.value as ImageLayout)} style={{ border: '1px solid var(--border-soft)', borderRadius: 8, padding: '6px 8px', fontSize: 12, background: '#faf9f7', outline: 'none' }}>
        <option value="full">เต็มกว้าง</option>
        <option value="left">ลอยซ้าย</option>
        <option value="right">ลอยขวา</option>
      </select>
      <span style={{ flex: 1 }} />
      <button onClick={onRemove} title="ลบรูปนี้" style={delBtn}>✕ ลบรูป</button>
    </div>
  );
}

// Inline table editor (moved from the old separate section).
const miniAction: React.CSSProperties = { background: 'var(--surface-sunken)', border: '1px solid var(--border-faint)', borderRadius: 6, fontSize: 11, padding: '4px 8px', cursor: 'pointer', color: 'var(--text-muted)' };

function TableEditor({ table, onChange, onRemove }: { table: ArticleTable; onChange: (t: ArticleTable) => void; onRemove: () => void }) {
  const setHead = (i: number, v: string) => onChange({ ...table, headCells: table.headCells.map((h, idx) => (idx === i ? v : h)) });
  const setCell = (ri: number, ci: number, v: string) => onChange({ ...table, rows: table.rows.map((r, idx) => (idx === ri ? r.map((c, cidx) => (cidx === ci ? v : c)) : r)) });
  const addRow = () => onChange({ ...table, rows: [...table.rows, table.headCells.map(() => '')] });
  const addCol = () => onChange({ ...table, headCells: [...table.headCells, `หัวข้อ ${table.headCells.length + 1}`], rows: table.rows.map((r) => [...r, '']) });
  return (
    <div style={{ border: '1px solid var(--border-faint)', borderRadius: 10, padding: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>▦ ตาราง</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={addCol} style={miniAction}>+ คอลัมน์</button>
          <button onClick={addRow} style={miniAction}>+ แถว</button>
          <button onClick={onRemove} style={{ ...miniAction, color: 'var(--danger)' }}>ลบตาราง</button>
        </div>
      </div>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
        <thead>
          <tr>
            {table.headCells.map((h, i) => (
              <th key={i} style={{ border: '1px solid var(--border)', padding: 2 }}>
                <input value={h} onChange={(e) => setHead(i, e.target.value)} style={{ border: 'none', width: '100%', padding: 5, fontWeight: 600, background: 'var(--surface-sunken)', outline: 'none' }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => (
                <td key={ci} style={{ border: '1px solid var(--border)', padding: 2 }}>
                  <input value={c} onChange={(e) => setCell(ri, ci, e.target.value)} style={{ border: 'none', width: '100%', padding: 5, outline: 'none' }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
