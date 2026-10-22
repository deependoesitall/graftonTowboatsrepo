// src/lib/email-import.ts
// An outside HTML email (another mailer, or a saved .html)
// → blocks. Simple one-column layouts become ordinary editable blocks.
// Anything fancier is kept as one locked "imported design" block, whose
// buttons and pictures can still be changed. Server only.
import { parseDocument, DomUtils } from 'htmlparser2';
import type { Element, AnyNode } from 'domhandler';
import { sanitizeEmailHtml } from '@/lib/email-sanitize';
import { newId, type Block, type EmailDoc } from '@/lib/email-blocks';

const words = (s: string) => s.replace(/\s+/g, ' ').trim();
const isEl = (n: AnyNode): n is Element => n.type === 'tag';
const text = (n: AnyNode) => words(DomUtils.textContent(n));

/** Columns side by side make it a "design": keep it whole. */
function hasColumns(root: AnyNode[]): boolean {
  return DomUtils.findAll((e) => e.name === 'tr', root).some((tr) =>
    tr.children.filter((c) => isEl(c) && (c.name === 'td' || c.name === 'th') && (text(c) || DomUtils.findOne((x) => x.name === 'img', [c]))).length > 1);
}

const looksLikeButton = (a: Element) => /background|padding|border-radius/i.test(a.attribs.style || '') || /button|btn/i.test(a.attribs.class || '');

/** Blocks from a cleaned one-column layout, or null if it isn't one. */
function toBlocks(html: string): Block[] | null {
  const dom = parseDocument(html, { decodeEntities: true });
  if (hasColumns(dom.children)) return null;
  const out: Block[] = [];
  let covered = 0;
  const total = text(dom).length;
  let ok = true;
  const walk = (nodes: AnyNode[]) => {
    for (const n of nodes) {
      if (!ok) return;
      if (n.type === 'text') { const t = words((n as unknown as { data: string }).data); if (t) { out.push({ id: newId(), type: 'text', text: t }); covered += t.length; } continue; }
      if (!isEl(n)) continue;
      const name = n.name;
      if (/^h[1-6]$/.test(name)) { const t = text(n); if (t) { out.push({ id: newId(), type: 'text', heading: true, text: t }); covered += t.length; } continue; }
      if (name === 'hr') { out.push({ id: newId(), type: 'divider' }); continue; }
      if (name === 'img') { out.push({ id: newId(), type: 'image', src: n.attribs.src || '', alt: n.attribs.alt || '', width: parseInt(n.attribs.width || '', 10) || undefined }); continue; }
      const links = DomUtils.findAll((e) => e.name === 'a', [n]);
      const imgs = DomUtils.findAll((e) => e.name === 'img', [n]);
      // A link alone in its box: a button, or a linked picture.
      if (name === 'a' || (links.length === 1 && text(links[0]) === text(n) && (text(n) || imgs.length === 1))) {
        const a = name === 'a' ? n : links[0];
        const img = DomUtils.findOne((e) => e.name === 'img', [a]);
        if (img && !text(a)) { out.push({ id: newId(), type: 'image', src: img.attribs.src || '', alt: img.attribs.alt || '', href: a.attribs.href }); continue; }
        if (text(a) && (looksLikeButton(a) || name !== 'a')) { out.push({ id: newId(), type: 'button', label: text(a), href: a.attribs.href || '', color: /orange|#d9640a|#f[0-9a-f]{2}[0-9a-f]{0,3}/i.test(a.attribs.style || '') ? 'orange' : 'green' }); covered += text(a).length; continue; }
      }
      if (name === 'p' || name === 'li' || ((name === 'div' || name === 'td') && !n.children.some((c) => isEl(c) && /^(p|div|table|h\d|ul|ol|img|hr)$/.test(c.name)))) {
        if (imgs.length) { ok = false; return; }
        // Inline links keep their address in the words ("Shop: https://…").
        const t = words(DomUtils.getChildren(n).map(function flat(c): string {
          if (c.type === 'text') return (c as unknown as { data: string }).data;
          if (!isEl(c)) return '';
          if (c.name === 'br') return '\n';
          const inner = c.children.map(flat).join('');
          if (c.name === 'a' && c.attribs.href && /^https?:/.test(c.attribs.href) && words(inner) !== c.attribs.href) return `${inner} (${c.attribs.href})`;
          if (c.name === 'b' || c.name === 'strong') return `**${inner}**`;
          return inner;
        }).join('').replace(/[ \t]*\n[ \t]*/g, '\u0000')).replace(/\u0000/g, '\n');
        if (t) { out.push({ id: newId(), type: 'text', text: name === 'li' ? `- ${t}` : t }); covered += text(n).length; }
        continue;
      }
      walk(n.children);
    }
  };
  walk(dom.children);
  if (!ok || !out.length || (total > 0 && covered / total < 0.9)) return null;
  // Neighbouring list items become one list.
  const merged: Block[] = [];
  for (const b of out) {
    const prev = merged[merged.length - 1];
    if (b.type === 'text' && prev?.type === 'text' && !prev.heading && /^- /.test(b.text) && /^- /m.test(prev.text)) prev.text += `\n${b.text}`;
    else merged.push(b);
  }
  return merged;
}

export type ImportResult = { doc: EmailDoc; mode: 'blocks' | 'locked'; removed: string[]; subject?: string };

/** Coloured panels, bars or call-out boxes mean someone designed this
 *  email: keep it exactly as it looks rather than flatten it into blocks. */
export function isDesigned(html: string): boolean {
  const dom = parseDocument(html, { decodeEntities: true });
  const colours = new Set<string>();
  let callouts = 0;
  for (const e of DomUtils.findAll((x) => /^(table|tr|td|th|div|p|center)$/.test(x.name), dom.children)) {
    const st = (e.attribs.style || '').toLowerCase();
    const bg = (e.attribs.bgcolor || st.match(/background(?:-color)?\s*:\s*([^;]+)/)?.[1] || '').trim();
    if (bg && !/^(#fff(fff)?|white|transparent|none|inherit)$/.test(bg)) colours.add(bg);
    if (/border(-left|-top)?\s*:\s*[2-9]px/.test(st)) callouts++;
  }
  return colours.size >= 2 || callouts > 0;
}

export function importHtml(raw: string): ImportResult {
  const subject = words(raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '') || undefined;
  const { html, removed } = sanitizeEmailHtml(raw);
  const blocks = isDesigned(html) ? null : toBlocks(html);
  if (blocks) return { doc: { branded: true, blocks }, mode: 'blocks', removed, subject };
  return { doc: { branded: false, blocks: [{ id: newId(), type: 'html', html }] }, mode: 'locked', removed, subject };
}
