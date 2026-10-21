// src/lib/email-blocks.ts
// A newsletter made of blocks: text, picture, button, line, and an imported
// design kept as is ("html", whose buttons and pictures stay editable).
// Shared by the editor (browser) and the renderer (server).
import { Parser } from 'htmlparser2';

/** The GTS brand kit: the only colours buttons and words come in. */
export type BrandColor = 'green' | 'orange' | 'yellow' | 'ink';
export const BRAND: Record<BrandColor, { bg: string; fg: string; label: string }> = {
  green: { bg: '#1E3D1E', fg: '#D9E84A', label: 'GTS green' },
  orange: { bg: '#D9640A', fg: '#FFFFFF', label: 'Orange' },
  yellow: { bg: '#D9E84A', fg: '#1E3D1E', label: 'Yellow' },
  ink: { bg: '#15181C', fg: '#FFFFFF', label: 'Charcoal' },
};
export type Size = 'sm' | 'md' | 'lg';
export type Align = 'start' | 'center' | 'end';

export type TextBlock = { id: string; type: 'text'; text: string; heading?: boolean; color?: BrandColor; size?: Size; align?: Align };
export type ImageBlock = { id: string; type: 'image'; src: string; alt: string; href?: string; width?: number };
export type ButtonSpec = { label: string; href: string; color?: BrandColor; size?: Size };
export type ButtonBlock = ButtonSpec & { id: string; type: 'button'; align?: Align };
/** Two or three buttons side by side; one under another on phones. */
export type ButtonsBlock = { id: string; type: 'buttons'; buttons: ButtonSpec[] };
export type DividerBlock = { id: string; type: 'divider' };
export type SpacerBlock = { id: string; type: 'spacer'; height: number };
/** A picture with words beside it; the words go under it on phones. */
export type PicTextBlock = { id: string; type: 'pictext'; src: string; alt: string; href?: string; text: string };
export type HtmlBlock = { id: string; type: 'html'; html: string };
export type Block = TextBlock | ImageBlock | ButtonBlock | ButtonsBlock | DividerBlock | SpacerBlock | PicTextBlock | HtmlBlock;
export type EmailDoc = { blocks: Block[]; branded?: boolean };

export const SITE = 'https://graftontowboatservices.com';
export const LOGO_URL = `${SITE}/branding/gts-badge.png`;
export const PHONE = '(618) 556-0290';
export const GTS_EMAIL = 'GraftonTowboatServices@gmail.com';
/** One-tap links for buttons. */
export const SAVED_LINKS = [
  { label: 'Order', href: `${SITE}/order` },
  { label: 'Shop', href: `${SITE}/catalog` },
  { label: 'Specials', href: `${SITE}/weekly-ad` },
  { label: 'Sign-up', href: `${SITE}/account?signup=1` },
  { label: 'Call', href: 'tel:6185560290' },
  { label: 'Email', href: `mailto:${GTS_EMAIL}` },
] as const;

export const newId = () => Math.random().toString(36).slice(2, 10);

export type NewKind = Block['type'] | 'heading';
export function newBlock(type: NewKind): Block {
  const id = newId();
  if (type === 'heading') return { id, type: 'text', heading: true, text: 'Heading' };
  if (type === 'text') return { id, type, text: 'Write here.' };
  if (type === 'image') return { id, type, src: '', alt: '' };
  if (type === 'button') return { id, type, label: 'Order now', href: `${SITE}/order`, color: 'green', size: 'md', align: 'center' };
  if (type === 'buttons') return { id, type, buttons: [{ label: 'Order', href: `${SITE}/order`, color: 'green' }, { label: 'Specials', href: `${SITE}/weekly-ad`, color: 'orange' }] };
  if (type === 'divider') return { id, type };
  if (type === 'spacer') return { id, type, height: 24 };
  if (type === 'pictext') return { id, type, src: '', alt: '', text: '**New this week**\nA few words about it.' };
  return { id, type: 'html', html: '' };
}

const t = (text: string, heading = false): TextBlock => ({ id: newId(), type: 'text', text, ...(heading ? { heading } : {}) });
const btn = (label: string, href: string, color: BrandColor = 'green'): ButtonBlock => ({ id: newId(), type: 'button', label, href, color, size: 'md', align: 'center' });
const SIGN_OFF = () => t(`Questions? Call ${PHONE}, day or night.\n\nJen`);

/** Ready-made emails to start from. */
export const STARTERS: { key: string; name: string; doc: () => EmailDoc }[] = [
  { key: 'specials', name: 'Weekly specials', doc: starterDoc },
  { key: 'announcement', name: 'Announcement', doc: () => ({ branded: true, blocks: [
    t('Something new at Grafton Towboat Services', true),
    t('Hi captains and crew,\n\nWrite the news here in a sentence or two.'),
    btn('Find out more', `${SITE}/order-online`), { id: newId(), type: 'divider' }, SIGN_OFF(),
  ] }) },
  { key: 'hours', name: 'Holiday hours', doc: () => ({ branded: true, blocks: [
    t('Holiday hours', true),
    t('Here is when we deliver over the holiday:\n\n- **Wed:** regular hours\n- **Thu:** closed\n- **Fri:** 8 AM to noon\n\nGet orders in early so nothing waits.'),
    { id: newId(), type: 'buttons', buttons: [{ label: 'Order now', href: `${SITE}/order`, color: 'green' }, { label: 'Call us', href: 'tel:6185560290', color: 'orange' }] },
    SIGN_OFF(),
  ] }) },
  { key: 'item', name: 'New item', doc: () => ({ branded: true, blocks: [
    t('Now on the shelf', true),
    { id: newId(), type: 'pictext', src: `${SITE}/branding/email/onsale.jpg`, alt: 'New item', text: '**Item name**\nWhat it is, the size, and the price.' },
    btn('Add it to your order', `${SITE}/catalog`), SIGN_OFF(),
  ] }) },
];

/** Built-in sections to drop into any email. Saved ones are added to these. */
export const BUILT_IN_SECTIONS: { name: string; blocks: () => Block[] }[] = [
  { name: 'GTS header', blocks: () => [{ id: newId(), type: 'image', src: `${SITE}/branding/gts-badge.png`, alt: 'Grafton Towboat Services', width: 120 }, t('Grafton Towboat Services', true)] },
  { name: 'Contact footer', blocks: () => [{ id: newId(), type: 'divider' }, t(`Grafton Towboat Services\n${PHONE} · [graftontowboatservices.com](${SITE})`), { id: newId(), type: 'buttons', buttons: [{ label: 'Call', href: 'tel:6185560290', color: 'green' }, { label: 'Email', href: `mailto:${GTS_EMAIL}`, color: 'ink' }] }] },
  { name: 'Order buttons', blocks: () => [{ id: newId(), type: 'buttons', buttons: [{ label: 'Order', href: `${SITE}/order`, color: 'green' }, { label: 'Shop', href: `${SITE}/catalog`, color: 'ink' }, { label: 'Specials', href: `${SITE}/weekly-ad`, color: 'orange' }] }] },
];

/** A copy of blocks with fresh ids, for inserting a section again. */
export const freshIds = (bs: Block[]): Block[] => bs.map((b) => ({ ...b, id: newId() }) as Block);

/** The GTS starter: logo header (from the branded frame), intro, specials,
 *  Order Now, and the GTS footer. */
export function starterDoc(): EmailDoc {
  return {
    branded: true,
    blocks: [
      t('This week at Grafton Towboat Services', true),
      t('Hi captains and crew,\n\nHere is what is fresh and on sale this week. Order by Thursday noon for Friday delivery.'),
      { id: newId(), type: 'image', src: `${SITE}/branding/email/onsale.jpg`, alt: "This week's specials" },
      t('Specials', true),
      t('- Ribeyes\n- Pork loin\n- Frozen vegetables'),
      { ...btn('Order now', `${SITE}/catalog`) },
      { id: newId(), type: 'divider' },
      SIGN_OFF(),
    ],
  };
}

/** [words](address) links inside written words. */
export const MD_LINK = /\[([^\]]+)\]\(((?:https?:|mailto:|tel:)[^)\s]+)\)/g;

export function isDoc(x: unknown): x is EmailDoc {
  return !!x && typeof x === 'object' && Array.isArray((x as EmailDoc).blocks);
}

/** Every web address a doc points to, in order (buttons, picture links,
 *  links inside text and imported designs). */
export function docLinks(doc: EmailDoc): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  for (const b of doc.blocks) {
    if (b.type === 'button') out.push({ label: b.label, href: b.href });
    if (b.type === 'buttons') for (const x of b.buttons) out.push({ label: x.label, href: x.href });
    if ((b.type === 'image' || b.type === 'pictext') && b.href) out.push({ label: b.alt || 'Picture', href: b.href });
    if (b.type === 'text' || b.type === 'pictext') {
      for (const m of b.text.matchAll(MD_LINK)) out.push({ label: m[1], href: m[2] });
      for (const m of b.text.replace(MD_LINK, '').matchAll(/https?:\/\/[^\s)<>"]+/g)) out.push({ label: m[0], href: m[0] });
    }
    if (b.type === 'html') for (const p of htmlParts(b.html)) if (p.kind === 'link') out.push({ label: p.text || p.attrs.href || '', href: p.attrs.href || '' });
  }
  return out;
}

export function docImages(doc: EmailDoc): { src: string; alt: string }[] {
  const out: { src: string; alt: string }[] = [];
  for (const b of doc.blocks) {
    if (b.type === 'image' || b.type === 'pictext') out.push({ src: b.src, alt: b.alt });
    if (b.type === 'html') for (const p of htmlParts(b.html)) if (p.kind === 'image') out.push({ src: p.attrs.src || '', alt: p.attrs.alt || '' });
  }
  return out;
}

/** Readable text of a doc, for the text part and the plain version. */
export function docToText(doc: EmailDoc): string {
  const parts: string[] = [];
  for (const b of doc.blocks) {
    const words = (x: string) => x.replace(MD_LINK, '$1: $2').replace(/\*\*([^*]+)\*\*/g, '$1');
    const where = (h: string) => h.replace(/^(tel|mailto):/, '');
    if (b.type === 'text') parts.push(b.heading ? words(b.text).toUpperCase() : words(b.text));
    if (b.type === 'button') parts.push(`${b.label}: ${where(b.href)}`);
    if (b.type === 'buttons') parts.push(b.buttons.map((x) => `${x.label}: ${where(x.href)}`).join('\n'));
    if (b.type === 'pictext') parts.push(words(b.text) + (b.href ? `\n${b.href}` : ''));
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
