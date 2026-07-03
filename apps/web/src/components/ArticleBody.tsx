import { Fragment, type ReactNode } from 'react';
import type { Article, ArticleImage, ArticleTable, StickyNote } from '@wiwonanant/shared';

// Render lightweight inline markdown safely (no HTML injection):
// **bold**, *italic*, ~~strike~~, [text](url).
function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(~~(.+?)~~)|(\[(.+?)\]\((.+?)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2] !== undefined) parts.push(<strong key={key++}>{m[2]}</strong>);
    else if (m[4] !== undefined) parts.push(<em key={key++}>{m[4]}</em>);
    else if (m[6] !== undefined) parts.push(<s key={key++}>{m[6]}</s>);
    else if (m[8] !== undefined)
      parts.push(
        <a key={key++} href={m[9]} target="_blank" rel="noreferrer" style={{ color: '#5b3fa0', textDecoration: 'underline' }}>
          {m[8]}
        </a>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// Render a single paragraph, honoring block markdown (#, ##, >, -, 1., ---).
function renderParagraph(para: string, key: number): ReactNode {
  const trimmed = para.trim();
  if (/^---+$/.test(trimmed)) return <hr key={key} style={{ border: 'none', borderTop: '1px solid #cbc8c0', margin: '18px 0' }} />;
  if (trimmed.startsWith('## ')) return <h3 key={key} style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 22, margin: '20px 0 10px' }}>{renderInline(trimmed.slice(3))}</h3>;
  if (trimmed.startsWith('# ')) return <h2 key={key} style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 27, margin: '22px 0 12px' }}>{renderInline(trimmed.slice(2))}</h2>;
  if (trimmed.startsWith('> ')) return <blockquote key={key} style={{ borderLeft: '3px solid #e0ded7', paddingLeft: 14, margin: '14px 0', color: '#5f5c54', fontStyle: 'italic' }}>{renderInline(trimmed.slice(2))}</blockquote>;
  const lines = trimmed.split('\n');
  if (lines.every((l) => /^[-*] /.test(l.trim())))
    return <ul key={key} style={{ margin: '10px 0', paddingLeft: 22 }}>{lines.map((l, i) => <li key={i} style={{ marginBottom: 4 }}>{renderInline(l.trim().slice(2))}</li>)}</ul>;
  if (lines.every((l) => /^\d+\. /.test(l.trim())))
    return <ol key={key} style={{ margin: '10px 0', paddingLeft: 22 }}>{lines.map((l, i) => <li key={i} style={{ marginBottom: 4 }}>{renderInline(l.trim().replace(/^\d+\.\s/, ''))}</li>)}</ol>;
  const indentMatch = para.match(/^[\t ]+/);
  const indentEm = indentMatch ? Math.min(6, indentMatch[0].replace(/\t/g, '    ').length) * 0.5 : 0;
  return (
    <p key={key} style={{ margin: '0 0 14px', textIndent: indentEm ? `${indentEm}em` : undefined }}>
      {renderInline(para.replace(/^[\t ]+/, ''))}
    </p>
  );
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
        minWidth: 240,
        border: '1px solid #ecd9a8',
        borderRadius: 11,
        padding: '16px 18px',
        fontSize: 14,
        lineHeight: 1.85,
        color: '#3a3527',
        whiteSpace: 'pre-wrap',
        background: 'repeating-linear-gradient(#fffdf2,#fffdf2 29px,#f4eccf 30px)',
        boxShadow: '0 6px 18px rgba(180,150,60,.16)',
      }}
    >
      {note.text}
    </div>
  );
}

/** Renders body prose with images/tables/notes interleaved at their `afterParagraph` index. */
export function ArticleBody({ article }: { article: Article }) {
  const paragraphs = article.bodyText.split(/\n\s*\n/).map((p) => p.replace(/\s+$/, ''));

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
          {para.trim() && renderParagraph(para, i)}
          {blocksAt(i + 1)}
        </Fragment>
      ))}
      <div style={{ clear: 'both' }} />
    </div>
  );
}
