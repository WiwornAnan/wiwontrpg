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

// ---- Nested lists ---------------------------------------------------------
// A list is one block; nesting is expressed by 2 spaces of indent per level,
// e.g.  "1. top\n  - sub\n    - deep". Shared by the renderer and the editor.
export interface ListNode {
  ordered: boolean;
  items: { content: string; children: ListNode | null }[];
}

const listLineRe = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

export function isListBlock(block: string): boolean {
  const lines = block.split('\n').filter((l) => l.trim());
  return lines.length > 0 && lines.every((l) => listLineRe.test(l));
}

export function parseNestedList(block: string): ListNode {
  const lines = block.split('\n').filter((l) => l.trim());
  const depthOf = (l: string) => Math.floor((l.match(/^\s*/)?.[0] ?? '').replace(/\t/g, '  ').length / 2);
  let i = 0;
  const build = (depth: number): ListNode => {
    const items: ListNode['items'] = [];
    let ordered = false;
    let typed = false;
    while (i < lines.length) {
      const d = depthOf(lines[i]);
      if (d < depth) break;
      if (d > depth) {
        const child = build(depth + 1);
        if (items.length) items[items.length - 1].children = child;
        continue;
      }
      const m = listLineRe.exec(lines[i]);
      if (!m) break;
      if (!typed) {
        ordered = /\d/.test(m[2]);
        typed = true;
      }
      items.push({ content: m[3], children: null });
      i++;
    }
    return { ordered, items };
  };
  return build(0);
}

function listNodeToHtml(node: ListNode): string {
  const tag = node.ordered ? 'ol' : 'ul';
  const items = node.items.map((it) => `<li>${inlineMdToHtml(it.content)}${it.children ? listNodeToHtml(it.children) : ''}</li>`).join('');
  return `<${tag}>${items}</${tag}>`;
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
      if (isListBlock(t)) return listNodeToHtml(parseNestedList(t));
      // Plain paragraph — keep any leading indent as literal text (the editor
      // uses white-space:pre-wrap so it shows, and serialises straight back).
      const indent = block.match(/^[\t ]+/)?.[0] ?? '';
      return `<p>${escapeHtml(indent)}${inlineMdToHtml(block.slice(indent.length))}</p>`;
    })
    .join('');
}

// Google Docs / Word often emit list nesting NOT as real nested <ul>/<ol> but
// as a flat run of sibling lists whose <li>s carry the depth in `aria-level`
// (or a margin-left indent). Rebuild those runs into genuinely nested lists so
// the hierarchy survives once styles are stripped. Real nested lists pass
// through unchanged (their DOM depth already gives the level).
function renestPastedLists(root: Node): void {
  const isList = (n: Node) => n.nodeType === 1 && ((n as HTMLElement).tagName === 'UL' || (n as HTMLElement).tagName === 'OL');
  // Depth-first: fix runs inside non-list containers first.
  Array.from(root.childNodes).forEach((n) => {
    if (n.nodeType === 1 && !isList(n)) renestPastedLists(n);
  });
  // Group consecutive sibling lists (whitespace between is allowed) into runs.
  const runs: HTMLElement[][] = [];
  let cur: HTMLElement[] | null = null;
  Array.from(root.childNodes).forEach((n) => {
    if (isList(n)) {
      if (!cur) { cur = []; runs.push(cur); }
      cur.push(n as HTMLElement);
    } else if (n.nodeType === 3 && !(n.nodeValue ?? '').trim()) {
      /* whitespace — keep the run open */
    } else {
      cur = null;
    }
  });

  const levelOf = (li: HTMLElement, base: number): number => {
    const aria = parseInt(li.getAttribute('aria-level') ?? '0', 10);
    if (aria > 0) return aria - 1;
    const m = /margin-left:\s*([\d.]+)\s*(px|pt|em)/.exec((li.getAttribute('style') ?? '').toLowerCase());
    if (m) return Math.min(6, Math.round(parseFloat(m[1]) / (m[2] === 'em' ? 2 : 36)));
    return base;
  };
  interface Flat { level: number; ordered: boolean; nodes: Node[] }
  const collect = (list: HTMLElement, base: number, acc: Flat[]) => {
    const ordered = list.tagName === 'OL';
    Array.from(list.children).forEach((li) => {
      if (li.tagName !== 'LI') return;
      const level = Math.max(base, levelOf(li as HTMLElement, base));
      const nodes: Node[] = [];
      const nested: HTMLElement[] = [];
      Array.from(li.childNodes).forEach((c) => {
        if (isList(c)) nested.push(c as HTMLElement);
        else nodes.push(c);
      });
      acc.push({ level, ordered, nodes });
      nested.forEach((nl) => collect(nl, level + 1, acc));
    });
  };
  const buildFrom = (acc: Flat[]): HTMLElement | null => {
    if (!acc.length) return null;
    let i = 0;
    const rec = (level: number): HTMLElement => {
      let ordered = false;
      let typed = false;
      const items: HTMLElement[] = [];
      while (i < acc.length && acc[i].level === level) {
        const it = acc[i];
        if (!typed) { ordered = it.ordered; typed = true; }
        i++;
        const li = document.createElement('li');
        it.nodes.forEach((c) => li.appendChild(c.cloneNode(true)));
        if (i < acc.length && acc[i].level === level + 1) li.appendChild(rec(level + 1));
        items.push(li);
      }
      const listEl = document.createElement(ordered ? 'ol' : 'ul');
      items.forEach((li) => listEl.appendChild(li));
      return listEl;
    };
    return rec(acc[0].level);
  };

  runs.forEach((run) => {
    const acc: Flat[] = [];
    run.forEach((list) => collect(list, 0, acc));
    const rebuilt = buildFrom(acc);
    if (!rebuilt) return;
    root.insertBefore(rebuilt, run[0]);
    run.forEach((list) => { if (list.parentNode === root) root.removeChild(list); });
  });
}

// Clean HTML pasted from other apps (Google Docs, Word, web pages…) down to the
// small tag set the editor understands, dropping every inline style so the
// pasted text takes on the editor's own font instead of the source's. Bold /
// italic / strike expressed only through styles (as Google Docs does) are
// recovered into real tags. Runs in the browser only (uses `document`).
export function sanitizePastedHtml(html: string): string {
  // Inline emphasis tags — but Google Docs uses <b style="font-weight:normal">
  // as a *non*-bold wrapper, so honour a style that negates the emphasis.
  const INLINE: Record<string, string> = { B: 'STRONG', STRONG: 'STRONG', I: 'EM', EM: 'EM', S: 'S', STRIKE: 'S', DEL: 'S' };
  const BLOCK: Record<string, string> = {
    H1: 'H1', H2: 'H2', H3: 'H2', H4: 'H2', H5: 'H2', H6: 'H2',
    P: 'P', DIV: 'P', UL: 'UL', OL: 'OL', LI: 'LI', BLOCKQUOTE: 'BLOCKQUOTE', A: 'A', BR: 'BR',
  };
  const negated = (tag: string, s: string): boolean =>
    (tag === 'B' || tag === 'STRONG') ? /font-weight:\s*(normal|[1-4]00)/.test(s)
      : (tag === 'I' || tag === 'EM') ? /font-style:\s*normal/.test(s)
      : false;
  const styleWrap = (s: string): string | null => {
    if (/font-weight:\s*(bold|[6-9]00)/.test(s)) return 'STRONG';
    if (/font-style:\s*italic/.test(s)) return 'EM';
    if (/line-through/.test(s)) return 'S';
    return null;
  };
  const walk = (node: Node, out: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        out.appendChild(document.createTextNode(child.nodeValue ?? ''));
        return;
      }
      if (child.nodeType !== 1) return;
      const el = child as HTMLElement;
      const tag = el.tagName;
      const style = (el.getAttribute('style') ?? '').toLowerCase();
      if (INLINE[tag]) {
        if (negated(tag, style)) walk(el, out); // e.g. GDocs' non-bold <b> → unwrap
        else {
          const ne = document.createElement(INLINE[tag]);
          walk(el, ne);
          out.appendChild(ne);
        }
        return;
      }
      if (BLOCK[tag]) {
        const ne = document.createElement(BLOCK[tag]);
        if (BLOCK[tag] === 'A') {
          const href = el.getAttribute('href');
          if (href) ne.setAttribute('href', href);
        }
        walk(el, ne);
        out.appendChild(ne);
        return;
      }
      const wrap = styleWrap(style);
      if (wrap) {
        const ne = document.createElement(wrap);
        walk(el, ne);
        out.appendChild(ne);
      } else {
        walk(el, out); // unknown tag (span, font, b-wrapper…) → unwrap
      }
    });
  };
  const src = document.createElement('template');
  src.innerHTML = html;
  renestPastedLists(src.content); // rebuild flat aria-level/margin lists into real nesting
  const dst = document.createElement('div');
  walk(src.content, dst);
  return dst.innerHTML;
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

// Serialise a <ul>/<ol> to indented markdown lines. Handles both proper nesting
// (a nested list inside an <li>) and the stray nested list some browsers create
// on indent (a <ul>/<ol> sitting directly inside the parent list).
function domListToMd(el: MdNode, depth: number, out: string[]): void {
  const ordered = el.tagName === 'OL';
  let n = 1;
  const kids = el.childNodes;
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    const t = child.tagName;
    if (t === 'LI') {
      let inline = '';
      const nested: MdNode[] = [];
      const lk = child.childNodes;
      for (let j = 0; j < lk.length; j++) {
        const c = lk[j];
        if (c.tagName === 'UL' || c.tagName === 'OL') nested.push(c);
        else inline += inlineNodeToMd(c);
      }
      out.push('  '.repeat(depth) + (ordered ? `${n}.` : '-') + ' ' + inline.trim());
      n++;
      for (const nl of nested) domListToMd(nl, depth + 1, out);
    } else if (t === 'UL' || t === 'OL') {
      domListToMd(child, depth + 1, out); // stray nested list → belongs to the item above
    }
  }
}

// Walk a container's children into markdown blocks. Block elements each become
// their own block; consecutive bare text/inline nodes are grouped into one
// paragraph so their formatting survives. Recurses into P/DIV wrappers so a
// list nested inside one (as contentEditable and pastes produce) still
// serialises as a real list instead of being flattened into a run-on line.
function serializeBlocks(container: MdNode, blocks: string[]): void {
  let buf = '';
  const flush = () => {
    const t = buf.replace(/\s+$/, '');
    if (t.trim()) blocks.push(t);
    buf = '';
  };
  const kids = container.childNodes;
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
    } else if (tag === 'H1') {
      flush();
      const md = childrenToMd(node).trim();
      if (md) blocks.push('# ' + md);
    } else if (tag === 'H2' || tag === 'H3') {
      flush();
      const md = childrenToMd(node).trim();
      if (md) blocks.push('## ' + md);
    } else if (tag === 'BLOCKQUOTE') {
      flush();
      const md = childrenToMd(node).trim();
      if (md) blocks.push(md.split('\n').map((l) => '> ' + l).join('\n'));
    } else if (tag === 'UL' || tag === 'OL') {
      flush();
      const out: string[] = [];
      domListToMd(node, 0, out);
      if (out.length) blocks.push(out.join('\n'));
    } else if (tag === 'P' || tag === 'DIV') {
      flush();
      serializeBlocks(node, blocks);
    } else {
      buf += inlineNodeToMd(node); // inline (B/EM/S/A/SPAN…) → paragraph buffer
    }
  }
  flush();
}

// Editor DOM (root element) → markdown document, inverse of markdownToHtml.
export function htmlToMarkdown(root: MdNode): string {
  const blocks: string[] = [];
  serializeBlocks(root, blocks);
  return blocks.join('\n\n');
}
