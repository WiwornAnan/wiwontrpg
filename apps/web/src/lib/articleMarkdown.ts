// Bridges the article body between the stored **markdown** format (what
// ArticleBody renders and what the image/table/note placement counts as
// paragraphs) and the **HTML** a WYSIWYG contentEditable surface needs.
//
// Both directions must stay inverse so editing an existing article round-trips
// its markdown unchanged. Supported grammar mirrors ArticleBody exactly:
//   block:  # H1 · ## H2 · > quote · - / 1. lists · --- rule · plain paragraph
//   inline: **bold** · *italic* · ~~strike~~ · [text](url)
// Leading tabs/spaces on a paragraph survive as a first-line indent.

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Inline markdown → inline HTML (single-pass tokenizer, no nesting — matches
// ArticleBody.renderInline). Returns '<br>' for an empty run so the block is
// still focusable in contentEditable.
export function inlineMdToHtml(text: string): string {
  const regex = /(\*\*([^]+?)\*\*)|(\*([^]+?)\*)|(~~([^]+?)~~)|(\[([^\]]+?)\]\(([^)]+?)\))/g;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    out += escapeHtml(text.slice(last, m.index));
    if (m[2] !== undefined) out += `<strong>${escapeHtml(m[2])}</strong>`;
    else if (m[4] !== undefined) out += `<em>${escapeHtml(m[4])}</em>`;
    else if (m[6] !== undefined) out += `<s>${escapeHtml(m[6])}</s>`;
    else if (m[8] !== undefined) out += `<a href="${escapeHtml(m[9])}">${escapeHtml(m[8])}</a>`;
    last = m.index + m[0].length;
  }
  out += escapeHtml(text.slice(last));
  return out || '<br>';
}

// Markdown document → HTML for seeding the editor. Blocks are the same
// blank-line-separated units the renderer and paragraph counter use.
export function markdownToHtml(md: string): string {
  const blocks = md.split(/\n\s*\n/).map((b) => b.replace(/\s+$/, '')).filter((b) => b.trim().length);
  if (!blocks.length) return '<p><br></p>';
  return blocks
    .map((block) => {
      const t = block.trim();
      if (/^---+$/.test(t)) return '<hr>';
      if (t.startsWith('## ')) return `<h2>${inlineMdToHtml(t.slice(3))}</h2>`;
      if (t.startsWith('# ')) return `<h1>${inlineMdToHtml(t.slice(2))}</h1>`;
      if (t.startsWith('> ')) return `<blockquote>${inlineMdToHtml(t.replace(/^> ?/gm, ''))}</blockquote>`;
      const lines = t.split('\n');
      if (lines.every((l) => /^[-*] /.test(l.trim())))
        return `<ul>${lines.map((l) => `<li>${inlineMdToHtml(l.trim().slice(2))}</li>`).join('')}</ul>`;
      if (lines.every((l) => /^\d+\. /.test(l.trim())))
        return `<ol>${lines.map((l) => `<li>${inlineMdToHtml(l.trim().replace(/^\d+\.\s/, ''))}</li>`).join('')}</ol>`;
      // Plain paragraph — keep any leading indent as literal text (the editor
      // uses white-space:pre-wrap so it shows, and serialises straight back).
      const indent = block.match(/^[\t ]+/)?.[0] ?? '';
      return `<p>${escapeHtml(indent)}${inlineMdToHtml(block.slice(indent.length))}</p>`;
    })
    .join('');
}

// Minimal shape of the DOM nodes we read — lets this be unit-tested with plain
// objects and keeps the walker independent of a real document.
export interface MdNode {
  nodeType: number;
  nodeValue?: string | null;
  tagName?: string;
  childNodes: ArrayLike<MdNode>;
  children?: ArrayLike<MdNode>;
  getAttribute?(name: string): string | null;
}

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

function childrenToMd(el: MdNode): string {
  let s = '';
  const kids = el.childNodes;
  for (let i = 0; i < kids.length; i++) s += inlineNodeToMd(kids[i]);
  return s;
}

function inlineNodeToMd(node: MdNode): string {
  if (node.nodeType === TEXT_NODE) return node.nodeValue ?? '';
  if (node.nodeType !== ELEMENT_NODE) return '';
  const tag = node.tagName ?? '';
  const inner = childrenToMd(node);
  switch (tag) {
    case 'BR':
      return '\n';
    case 'STRONG':
    case 'B':
      return inner.trim() ? `**${inner}**` : inner;
    case 'EM':
    case 'I':
      return inner.trim() ? `*${inner}*` : inner;
    case 'S':
    case 'STRIKE':
    case 'DEL':
      return inner.trim() ? `~~${inner}~~` : inner;
    case 'A':
      return `[${inner}](${node.getAttribute?.('href') ?? ''})`;
    default: {
      // execCommand sometimes emits styled spans instead of tags — recover them.
      const style = (node.getAttribute?.('style') ?? '').toLowerCase();
      if (inner.trim()) {
        if (/font-weight:\s*(bold|[6-9]00)/.test(style)) return `**${inner}**`;
        if (/font-style:\s*italic/.test(style)) return `*${inner}*`;
        if (/line-through/.test(style)) return `~~${inner}~~`;
      }
      return inner; // span/font/etc. — unwrap
    }
  }
}

function liChildren(el: MdNode): MdNode[] {
  const kids = el.children ?? el.childNodes;
  const out: MdNode[] = [];
  for (let i = 0; i < kids.length; i++) if (kids[i].tagName === 'LI') out.push(kids[i]);
  return out;
}

// Editor DOM (root element) → markdown document, inverse of markdownToHtml.
// Block elements each become their own paragraph; consecutive bare text/inline
// nodes at the root (as a freshly-typed or select-all-deleted editor produces)
// are grouped into a single paragraph so their formatting survives.
export function htmlToMarkdown(root: MdNode): string {
  const blocks: string[] = [];
  let buf = '';
  const flush = () => {
    const t = buf.replace(/\s+$/, '');
    if (t.trim()) blocks.push(t);
    buf = '';
  };
  const kids = root.childNodes;
  for (let i = 0; i < kids.length; i++) {
    const node = kids[i];
    if (node.nodeType === TEXT_NODE) {
      buf += node.nodeValue ?? '';
      continue;
    }
    if (node.nodeType !== ELEMENT_NODE) continue;
    const tag = node.tagName ?? '';
    if (tag === 'HR') {
      flush();
      blocks.push('---');
      continue;
    }
    if (tag === 'H1') {
      flush();
      const md = childrenToMd(node).trim();
      if (md) blocks.push('# ' + md);
      continue;
    }
    if (tag === 'H2' || tag === 'H3') {
      flush();
      const md = childrenToMd(node).trim();
      if (md) blocks.push('## ' + md);
      continue;
    }
    if (tag === 'BLOCKQUOTE') {
      flush();
      const md = childrenToMd(node).trim();
      if (md)
        blocks.push(
          md
            .split('\n')
            .map((l) => '> ' + l)
            .join('\n'),
        );
      continue;
    }
    if (tag === 'UL') {
      flush();
      const items = liChildren(node).map((li) => '- ' + childrenToMd(li).trim());
      if (items.length) blocks.push(items.join('\n'));
      continue;
    }
    if (tag === 'OL') {
      flush();
      const items = liChildren(node).map((li, i2) => `${i2 + 1}. ` + childrenToMd(li).trim());
      if (items.length) blocks.push(items.join('\n'));
      continue;
    }
    if (tag === 'P' || tag === 'DIV') {
      flush();
      const md = childrenToMd(node).replace(/\s+$/, '');
      if (md.trim()) blocks.push(md);
      continue;
    }
    // inline element at the root (B/EM/S/A/SPAN…) — keep it in the paragraph buffer
    buf += inlineNodeToMd(node);
  }
  flush();
  return blocks.join('\n\n');
}
