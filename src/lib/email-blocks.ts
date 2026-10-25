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

export const GROCERY_OUTREACH_HTML = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#edf2f5"><tr><td align="center" style="padding:24px 8px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;font-family:Arial,sans-serif;color:#123047"><tr><td style="background:#09283f;color:#fff;padding:19px 28px;font-size:16px;font-weight:bold;letter-spacing:2px">GRAFTON TOWBOAT SERVICES</td></tr><tr><td><a href="https://www.graftontowboatservices.com" target="_blank"><img src="https://graftontowboatservices.com/og/grocery-outreach-banner.jpg" width="600" alt="Grafton Towboat Services delivering groceries and supplies to the river community" style="display:block;width:100%;height:auto;border:0" /></a></td></tr><tr><td style="padding:28px 30px 18px"><div style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#86620e">SINCLAIR’S GROCERIES. DELIVERED TO YOUR BOAT.</div><h1 style="font-size:32px;line-height:1.15;margin:12px 0 16px">Your next grocery order<br />just got easier.</h1><p style="font-size:17px;line-height:1.6;margin:0">No more printing, marking, scanning, and emailing the long order sheet. Use the familiar Sinclair’s order form online, or shop the full store for additional items.</p></td></tr><tr><td align="center" style="padding:8px 30px 24px"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#f4bd39" style="border-radius:5px"><a href="https://www.graftontowboatservices.com" style="display:inline-block;padding:17px 25px;color:#09283f;font-size:17px;font-weight:bold;text-decoration:none" target="_blank">SHOP SINCLAIR’S GROCERIES →</a></td></tr></table><p style="font-size:12px;margin:12px 0 0"><a href="https://www.graftontowboatservices.com" style="color:#245676" target="_blank">www.graftontowboatservices.com</a></p></td></tr><tr><td style="padding:0 30px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#edf4f7"><tr><td style="padding:22px"><div style="font-size:13px;letter-spacing:1px;font-weight:bold">FROM YOUR ORDER TO YOUR BOAT</div><p style="font-size:16px;line-height:1.6;margin:14px 0 0"><b style="color:#86620e">01 &nbsp; YOU ORDER</b><br />Choose your groceries online.</p><p style="font-size:16px;line-height:1.6;margin:14px 0 0"><b style="color:#86620e">02 &nbsp; SINCLAIR’S SHOPS</b><br />Sinclair’s fills your grocery order.</p><p style="font-size:16px;line-height:1.6;margin:14px 0 0"><b style="color:#86620e">03 &nbsp; WE DELIVER</b><br />Grafton Towboat Services brings it to you.</p></td></tr></table></td></tr><tr><td style="padding:25px 30px;font-size:16px;line-height:1.6"><p style="margin:0 0 16px"><b>Van delivery within approximately three hours of Grafton, Illinois.</b> Contact us to confirm timing for your location. We also offer boat delivery in our local river area. Our refrigerated van keeps your cold groceries cold on the way.</p><p style="margin:0">Save your boat’s favorites for easier future orders and follow your order’s progress online.</p></td></tr><tr><td style="padding:0 30px 28px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="border-left:5px solid #f4bd39;background:#fff8e7;padding:20px;font-size:16px;line-height:1.6"><b>Need groceries on an upcoming trip?</b><br />Reply with your boat name, expected location, and when you’ll need them. I’ll help you get started and confirm delivery arrangements.<br /><br /><b>Jen Gibson</b><br />Grafton Towboat Services<br /><a href="tel:+16185560290" style="color:#123047" target="_blank">618-556-0290</a><br /><a href="mailto:GraftonTowboatServices@gmail.com" style="color:#123047" target="_blank">GraftonTowboatServices@gmail.com</a></td></tr></table></td></tr><tr><td style="background:#09283f;color:#ffffff;text-align:center;padding:22px;font-size:13px;line-height:1.7"><b>FAMILY OWNED. RIVER FOCUSED.</b><br />Grafton, Illinois · Available 24/7/365</td></tr><tr><td style="padding:17px 30px;color:#647785;font-size:12px;line-height:1.6">If someone else handles grocery orders aboard your boat, please pass this along to them.</td></tr></table></td></tr></table>';

export function groceryOutreachDoc(): EmailDoc {
  return {
    branded: false,
    blocks: [{ id: newId(), type: 'html', html: GROCERY_OUTREACH_HTML }],
  };
}

/** Ready-made emails to start from. */
export const STARTERS: { key: string; name: string; subject?: string; doc: () => EmailDoc }[] = [
  { key: 'grocery-outreach', name: "Grocery Outreach (Jen's design)", subject: 'Sinclair’s groceries, delivered to your boat — Grafton Towboat Services', doc: groceryOutreachDoc },
  { key: 'specials', name: 'Weekly specials', subject: 'This week at Grafton Towboat Services', doc: starterDoc },
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
