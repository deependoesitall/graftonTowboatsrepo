// src/lib/rich-text.ts
// Words edited right on the email (bold, links, bullet lists, line breaks) ↔
// the simple text a block stores (**bold**, [words](link), "- " bullets, new
// lines). Works in the browser and on the server, so it can be tested.
import { Parser } from 'htmlparser2';
import { MD_LINK } from '@/lib/email-blocks';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const okHref = (h: string) => /^(https?:|mailto:|tel:)/i.test(h.trim());

/** Stored text → HTML for an editable box. */
export function toEditableHtml(text: string): string {
  const links: string[] = [];
  const s = text.replace(MD_LINK, (_m, l: string, u: string) => { links.push(`<a href="${esc(u)}">${esc(l)}</a>`); return `\u0000${links.length - 1}\u0000`; });
  return esc(s)
    .replace(/^[-•*]\s+/gm, '• ')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>')
    .replace(/\u0000(\d+)\u0000/g, (_m, i) => links[Number(i)]);
}

/** Toggle `- ` bullet prefixes on every line of a text block (or the lines
 *  matching `selected`). If all targeted non-empty lines already start with a
 *  bullet, strips them; otherwise adds `- ` to each. */
export function toggleBullets(text: string, selected?: string): string {
  const norm = (s: string) => s.replace(/^\s*(?:[-•*]\s+)+/, '');
  const isBullet = (s: string) => /^\s*[-•*]\s+/.test(s);
  const lines = text.split('\n');
  const selTrim = (selected || '').replace(/^\s*•\s*/gm, '- ').trim();
  let indices = lines.map((_, i) => i);
  if (selTrim) {
    const selLines = selTrim.split('\n').map((l) => norm(l).trim()).filter(Boolean);
    const matched = lines.map((l, i) => (selLines.some((sl) => norm(l).trim().includes(sl)) ? i : -1)).filter((i) => i >= 0);
    if (matched.length) indices = matched;
  }
  const nonEmpty = indices.filter((i) => lines[i].trim().length > 0);
  if (!nonEmpty.length) return text ? `${text}\n- ` : '- ';
  const allBulleted = nonEmpty.every((i) => isBullet(lines[i]));
  return lines.map((l, i) => {
    if (!indices.includes(i) || !l.trim()) return l;
    return allBulleted ? norm(l) : `- ${norm(l)}`;
  }).join('\n');
}

/** HTML typed into an editable box → stored text. Anything else is dropped. */
export function fromEditableHtml(html: string): string {
  let out = '';
  const stack: { tag: string; start: number; href?: string }[] = [];
  const block = /^(div|p|li|h\d)$/;
  const p = new Parser({
    onopentag(name, a) {
      if (name === 'br') { out += '\n'; return; }
      if (block.test(name) && out && !out.endsWith('\n')) out += '\n';
      if (name === 'li') out += '- ';
      stack.push({ tag: name, start: out.length, href: a.href });
    },
    ontext(t) { out += t.replace(/\u00a0/g, ' '); },
    onclosetag(name) {
      const i = stack.map((x) => x.tag).lastIndexOf(name);
      if (i < 0 || name === 'br') return;
      const it = stack.splice(i)[0];
      const inner = out.slice(it.start);
      if (!inner.trim()) return;
      if (name === 'b' || name === 'strong') out = out.slice(0, it.start) + `**${inner}**`;
      else if (name === 'a' && it.href && okHref(it.href)) out = out.slice(0, it.start) + `[${inner.replace(/[[\]]/g, '')}](${it.href.trim()})`;
    },
  }, { decodeEntities: true });
  p.write(html); p.end();
  return out
    .replace(/^[ \t]*•[ \t]+/gm, '- ')
    .replace(/^[ \t]*- - /gm, '- ')
    .replace(/\*\*\*\*/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
