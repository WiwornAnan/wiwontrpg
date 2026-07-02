import { Fragment, type ReactNode } from 'react';
import type { Article, ArticleImage, ArticleTable, StickyNote } from '@wiwonanant/shared';

// Render lightweight inline markup safely (no HTML injection). Supports **bold**.
function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<strong key={key++}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function ImageBlock({ img }: { img: ArticleImage }) {
  const isFloat = img.layout === 'left' || img.layout === 'right';
  const style: React.CSSProperties = isFloat
    ? {
        float: img.layout as 'left' | 'right',
        width: 'min(46%, 320px)',
        margin: img.layout === 'left' ? '4px 20px 12px 0' : '4px 0 12px 20px',
        borderRadius: 12,
        border: '1px solid var(--border)',
      }
    : { display: 'block', width: '100%', margin: '18px 0', borderRadius: 12, border: '1px solid var(--border)' };
  return <img src={img.url} alt="" style={style} />;
}

function TableBlock({ table }: { table: ArticleTable }) {
  return (
    <div style={{ overflowX: 'auto', margin: '18px 0' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13.5 }}>
        {table.headCells.length > 0 && (
          <thead>
            <tr>
              {table.headCells.map((h, i) => (
                <th
                  key={i}
                  style={{ border: '1px solid var(--border)', padding: '8px 12px', background: 'var(--surface-sunken)', textAlign: 'left', fontWeight: 600 }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ border: '1px solid var(--border)', padding: '8px 12px' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NoteBlock({ note }: { note: StickyNote }) {
  return (
    <div
      style={{
        margin: '18px 0',
        padding: '14px 16px',
        background: '#fffdf3',
        border: '1px solid #ecdfa8',
        borderLeft: '4px solid var(--gold-star)',
        borderRadius: 10,
        fontSize: 13.5,
        lineHeight: 1.7,
        color: 'var(--text-muted)',
        whiteSpace: 'pre-wrap',
      }}
    >
      📌 {note.text}
    </div>
  );
}

/** Renders body prose with images/tables/notes interleaved at their `afterParagraph` index. */
export function ArticleBody({ article }: { article: Article }) {
  const paragraphs = article.bodyText.split(/\n\s*\n/).map((p) => p.trim());

  const imagesByPara = new Map<number, ArticleImage[]>();
  for (const img of [...article.images].sort((a, b) => a.order - b.order)) {
    const arr = imagesByPara.get(img.afterParagraph) ?? [];
    arr.push(img);
    imagesByPara.set(img.afterParagraph, arr);
  }
  const tablesByPara = new Map<number, ArticleTable[]>();
  for (const t of article.tables) {
    const p = t.afterParagraph ?? paragraphs.length;
    const arr = tablesByPara.get(p) ?? [];
    arr.push(t);
    tablesByPara.set(p, arr);
  }
  const notesByPara = new Map<number, StickyNote[]>();
  for (const n of article.notes) {
    const p = n.afterParagraph ?? paragraphs.length;
    const arr = notesByPara.get(p) ?? [];
    arr.push(n);
    notesByPara.set(p, arr);
  }

  const blocksAt = (i: number): ReactNode => (
    <>
      {(imagesByPara.get(i) ?? []).map((img) => (
        <ImageBlock key={img.id} img={img} />
      ))}
      {(tablesByPara.get(i) ?? []).map((t) => (
        <TableBlock key={t.id} table={t} />
      ))}
      {(notesByPara.get(i) ?? []).map((n) => (
        <NoteBlock key={n.id} note={n} />
      ))}
    </>
  );

  return (
    <div style={{ fontSize: 14.5, lineHeight: 1.8, color: 'var(--text-muted)' }}>
      {/* blocks positioned before the body (afterParagraph = 0) */}
      {blocksAt(0)}
      {paragraphs.map((para, i) => (
        <Fragment key={i}>
          {para && (
            <p style={{ margin: '0 0 14px' }}>{renderInline(para)}</p>
          )}
          {blocksAt(i + 1)}
        </Fragment>
      ))}
      <div style={{ clear: 'both' }} />
    </div>
  );
}
