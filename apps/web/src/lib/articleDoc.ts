import type { ArticleImage, ArticleTable, StickyNote } from '@wiwonanant/shared';

// Turns the stored article (a markdown body + separate image/table/note arrays
// positioned by `afterParagraph`) into a single ordered "document" of segments
// — runs of body text interleaved with the blocks that sit between them — and
// back again. This lets the editor read as one flowing page (text / table /
// text / note / text) while still serialising to the exact same storage shape
// the renderer already consumes.

export interface DocModel {
  bodyText: string;
  images: ArticleImage[];
  tables: ArticleTable[];
  notes: StickyNote[];
}

export type DocSeg =
  | { type: 'text'; run: number; md: string }
  | { type: 'image'; id: string; block: ArticleImage }
  | { type: 'table'; id: string; block: ArticleTable }
  | { type: 'note'; id: string; block: StickyNote };

// Body paragraphs, counting the same way the editor's paragraph counter does
// (blank-line separated, empties dropped) so positions line up.
export function paragraphsOf(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+$/, ''))
    .filter((p) => p.trim().length > 0);
}

export function splitDoc(model: DocModel): DocSeg[] {
  const P = paragraphsOf(model.bodyText);
  const clamp = (n: number) => Math.max(0, Math.min(P.length, Math.trunc(n) || 0));
  // Blocks that sit after paragraph k, in the renderer's own order: images, tables, notes.
  const at = (k: number): DocSeg[] => [
    ...[...model.images].sort((a, b) => a.order - b.order).filter((im) => clamp(im.afterParagraph) === k).map((im): DocSeg => ({ type: 'image', id: im.id, block: im })),
    ...model.tables.filter((t) => clamp(t.afterParagraph ?? P.length) === k).map((t): DocSeg => ({ type: 'table', id: t.id, block: t })),
    ...model.notes.filter((n) => clamp(n.afterParagraph ?? P.length) === k).map((n): DocSeg => ({ type: 'note', id: n.id, block: n })),
  ];

  // Flatten blocks in document order (by position, then renderer type order).
  const ordered: { k: number; seg: DocSeg }[] = [];
  for (let k = 0; k <= P.length; k++) for (const seg of at(k)) ordered.push({ k, seg });

  const segs: DocSeg[] = [];
  let run = 0;
  let pi = 0; // next paragraph not yet emitted
  const emitTextUpTo = (k: number) => {
    segs.push({ type: 'text', run: run++, md: P.slice(pi, k).join('\n\n') });
    pi = k;
  };
  // A text run precedes every block (holding the paragraphs since the previous
  // block — possibly empty, so there's always somewhere to type between blocks).
  for (const { k, seg } of ordered) {
    emitTextUpTo(k);
    segs.push(seg);
  }
  emitTextUpTo(P.length);
  return segs;
}

// Reassemble the ordered segments back into storage shape: body text is the
// concatenation of the text runs; every block's `afterParagraph` becomes the
// number of paragraphs that precede it. Blocks dropped from `segs` are dropped.
export function joinDoc(segs: DocSeg[]): DocModel {
  const bodyParts: string[] = [];
  const images: ArticleImage[] = [];
  const tables: ArticleTable[] = [];
  const notes: StickyNote[] = [];
  let count = 0;
  for (const seg of segs) {
    if (seg.type === 'text') {
      const ps = paragraphsOf(seg.md);
      bodyParts.push(...ps);
      count += ps.length;
    } else if (seg.type === 'image') {
      images.push({ ...seg.block, afterParagraph: count, order: images.length });
    } else if (seg.type === 'table') {
      tables.push({ ...seg.block, afterParagraph: count });
    } else {
      notes.push({ ...seg.block, afterParagraph: count });
    }
  }
  return { bodyText: bodyParts.join('\n\n'), images, tables, notes };
}

// Paragraph index just before a given segment — used when inserting a new
// block at that seam so its afterParagraph is correct immediately.
export function paragraphsBefore(segs: DocSeg[], index: number): number {
  let count = 0;
  for (let i = 0; i < index && i < segs.length; i++) {
    const seg = segs[i];
    if (seg.type === 'text') count += paragraphsOf(seg.md).length;
  }
  return count;
}
