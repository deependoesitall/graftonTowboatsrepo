// src/lib/email-blocks.ts
// A newsletter made of blocks: text, picture, button, line, and an imported
// design kept as is ("html", whose buttons and pictures stay editable).
// Shared by the editor (browser) and the renderer (server).
import { Parser } from 'htmlparser2';

export type TextBlock = { id: string; type: 'text'; text: string; heading?: boolean };
export type ImageBlock = { id: string; type: 'image'; src: string; alt: string; href?: string; width?: number };
export type ButtonBlock = { id: string; type: 'button'; label: string; href: string; color?: 'green' | 'orange' };
export type DividerBlock = { id: string; type: 'divider' };
export type HtmlBlock = { id: string; type: 'html'; html: string };
export type Block = TextBlock | ImageBlock | ButtonBlock | DividerBlock | HtmlBlock;
export type EmailDoc = { blocks: Block[]; branded?: boolean };

export const SITE = 'https://graftontowboatservices.com';
export const LOGO_URL = `${SITE}/branding/gts-badge.png`;
/** One-tap links for buttons. */
export const SAVED_LINKS = [
  { label: 'Shop', href: `${SITE}/catalog` },
  { label: 'Order page', href: `${SITE}/order` },
  { label: 'Sign-up', href: `${SITE}/account?signup=1` },
  { label: "This week's specials", href: `${SITE}/weekly-ad` },
] as const;

export const newId = () => Math.random().toString(36).slice(2, 10);

export function newBlock(type: Block['type']): Block {
  const id = newId();
  if (type === 'text') return { id, type, text: '' };
  if (type === 'image') return { id, type, src: '', alt: '' };
  if (type === 'button') return { id, type, label: 'Order now', href: SAVED_LINKS[0].href, color: 'green' };
  if (type === 'divider') return { id, type };
  return { id, type: 'html', html: '' };
}

/** The GTS starter: logo header (from the branded frame), intro, specials,
 *  Order Now, and the GTS footer. */
export function starterDoc(): EmailDoc {
  return {
    branded: true,
    blocks: [
      { id: newId(), type: 'text', heading: true, text: 'This week at Grafton Towboat Services' },
      { id: newId(), type: 'text', text: 'Hi captains and crew,\n\nHere is what is fresh and on sale this week. Order by Thursday noon for Friday delivery.' },
      { id: newId(), type: 'image', src: `${SITE}/branding/email/onsale.jpg`, alt: "This week's specials" },
      { id: newId(), type: 'text', heading: true, text: 'Specials' },
      { id: newId(), type: 'text', text: '- Ribeyes\n- Pork loin\n- Frozen vegetables' },
      { id: newId(), type: 'button', label: 'Order now', href: `${SITE}/catalog`, color: 'green' },
      { id: newId(), type: 'divider' },
      { id: newId(), type: 'text', text: 'Questions? Call (618) 556-0290, day or night.\n\nJen' },
    ],
  };
}

export function isDoc(x: unknown): x is EmailDoc {
  return !!x && typeof x === 'object' && Array.isArray((x as EmailDoc).blocks);
}

/** Every web address a doc points to, in order (buttons, picture links,
 *  links inside text and imported designs). */
export function docLinks(doc: EmailDoc): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  for (const b of doc.blocks) {
    if (b.type === 'button') out.push({ label: b.label, href: b.href });
    if (b.type === 'image' && b.href) out.push({ label: b.alt || 'Picture', href: b.href });
    if (b.type === 'text') for (const m of b.text.matchAll(/https?:\/\/[^\s)<>"]+/g)) out.push({ label: m[0], href: m[0] });
    if (b.type === 'html') for (const p of htmlParts(b.html)) if (p.kind === 'link') out.push({ label: p.text || p.attrs.href || '', href: p.attrs.href || '' });
  }
  return out;
}

export function docImages(doc: EmailDoc): { src: string; alt: string }[] {
  const out: { src: string; alt: string }[] = [];
  for (const b of doc.blocks) {
    if (b.type === 'image') out.push({ src: b.src, alt: b.alt });
    if (b.type === 'html') for (const p of htmlParts(b.html)) if (p.kind === 'image') out.push({ src: p.attrs.src || '', alt: p.attrs.alt || '' });
  }
  return out;
}

/** Readable text of a doc, for the text part and the plain version. */
export function docToText(doc: EmailDoc): string {
  const parts: string[] = [];
  for (const b of doc.blocks) {
    if (b.type === 'text') parts.push(b.heading ? b.text.toUpperCase() : b.text);
    if (b.type === 'button') parts.push(`${b.label}: ${b.href}`);
    if (b.type === 'image' && b.href) parts.push(`${b.alt || 'Picture'}: ${b.href}`);
    if (b.type === 'divider') parts.push('---');
    if (b.type === 'html') parts.push(htmlText(b.html));
  }
  return parts.filter((p) => p.trim()).join('\n\n').trim();
}

function htmlText(html: string): string {
  let out = '';
  let href: string | null = null;
  let linkText = '';
  const p = new Parser({
    onopentag(name, a) {
      if (name === 'a') { href = a.href || null; linkText = ''; }
      if (/^(p|div|h\d|tr|li|br|table)$/.test(name)) out += '\n';
    },
    ontext(t) { if (href !== null) linkText += t; else out += t; },
    onclosetag(name) {
      if (name === 'a') { const l = linkText.trim(); out += href && l && l !== href ? `${l}: ${href}` : (href || l); href = null; }
      if (/^(p|div|h\d|tr|li|table)$/.test(name)) out += '\n';
    },
  }, { decodeEntities: true });
  p.write(html); p.end();
  return out.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ── Buttons and pictures inside an imported design ──────────────────────

export type HtmlPart = {
  kind: 'link' | 'image'; index: number; start: number; end: number;
  attrs: Record<string, string>; text?: string; tag: string;
};

/** The links and pictures of an HTML fragment, with where each opening tag
 *  sits, so one can be changed without touching anything else. */
export function htmlParts(html: string): HtmlPart[] {
  const out: HtmlPart[] = [];
  let open: HtmlPart | null = null;
  let links = 0, images = 0;
  const p: Parser = new Parser({
    onopentag(name, attrs) {
      if (name === 'a') {
        open = { kind: 'link', index: links++, start: p.startIndex, end: p.endIndex + 1, attrs: { ...attrs }, text: '', tag: name };
        out.push(open);
      } else if (name === 'img') {
        out.push({ kind: 'image', index: images++, start: p.startIndex, end: p.endIndex + 1, attrs: { ...attrs }, tag: name });
      }
    },
    ontext(t) { if (open) open.text += t; },
    onclosetag(name) { if (name === 'a' && open) { open.text = open.text!.replace(/\s+/g, ' ').trim(); open = null; } },
  }, { decodeEntities: true, lowerCaseAttributeNames: true });
  p.write(html); p.end();
  return out;
}

const attrEsc = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const textEsc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Change one link (address and, if it holds only text, its words) or one
 *  picture (address, description) inside an imported design. */
export function patchHtmlPart(html: string, kind: HtmlPart['kind'], index: number,
  change: { href?: string; text?: string; src?: string; alt?: string }): string {
  const part = htmlParts(html).find((x) => x.kind === kind && x.index === index);
  if (!part) return html;
  const attrs = { ...part.attrs };
  if (kind === 'link' && change.href !== undefined) attrs.href = change.href;
  if (kind === 'image') {
    if (change.src !== undefined) attrs.src = change.src;
    if (change.alt !== undefined) attrs.alt = change.alt;
  }
  const self = kind === 'image' ? ' /' : '';
  const tag = `<${part.tag}${Object.entries(attrs).map(([k, v]) => ` ${k}="${attrEsc(v)}"`).join('')}${self}>`;
  let next = html.slice(0, part.start) + tag + html.slice(part.end);
  if (kind === 'link' && change.text !== undefined) {
    // Only when the link holds plain words (no picture or styling inside).
    const from = part.start + tag.length;
    const close = next.indexOf('</a>', from);
    if (close > -1 && !/[<]/.test(next.slice(from, close))) next = next.slice(0, from) + textEsc(change.text) + next.slice(close);
  }
  return next;
}
