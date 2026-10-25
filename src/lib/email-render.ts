// src/lib/email-render.ts
// A block newsletter → the email that goes out (HTML + text). Built with
// react-email plus hand-made table markup where inboxes are fussiest:
// buttons are "bulletproof" (a VML shape for Outlook on Windows, a styled
// link everywhere else), and side-by-side parts are table cells that stack
// one under another on phones. Branded puts it inside the same GTS header
// and footer as the other emails. Server only.
import { createElement as h, type ReactNode } from 'react';
import { render } from '@react-email/render';
import { Hr, Img, Link, Section } from '@react-email/components';
import { brandedShell, INK } from '@/lib/customer-emails';
import { textToHtml, SIGNUP_TOKEN, type AnnouncementEmail } from '@/lib/announcement-versions';
import { SIGNUP_URL } from '@/lib/boat-invite';
import { BRAND, MD_LINK, SITE, docToText, type Block, type BrandColor, type ButtonSpec, type EmailDoc, type Size } from '@/lib/email-blocks';
import { sanitizeEmailHtml } from '@/lib/email-sanitize';

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const signup = (s: string) => s.split(SIGNUP_TOKEN).join(SIGNUP_URL);
/** Only web, email and phone links go out. */
const safeHref = (u: string) => { const v = signup(String(u || '').trim()); return /^(https?:|mailto:|tel:)/i.test(v) ? v : ''; };
const safeSrc = (u: string) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');
const ALIGN = { start: 'left', center: 'center', end: 'right' } as const;
const TEXT_PX: Record<Size, number> = { sm: 13, md: 15, lg: 18 };
const color = (c?: BrandColor) => (c && c !== 'yellow' ? BRAND[c].bg : INK);

/** Written words → HTML: paragraphs, "- " lists, **bold**, [words](link),
 *  and bare web addresses made clickable. */
export function textBlockHtml(text: string, linkColor = BRAND.green.bg): string {
  const inline = (line: string) => {
    const links: string[] = [];
    let s = signup(line).replace(MD_LINK, (_m, label: string, href: string) => {
      links.push(`<a href="${esc(href)}" style="color:${linkColor};text-decoration:underline;">${esc(label)}</a>`);
      return `\u0000${links.length - 1}\u0000`;
    });
    s = esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => `<a href="${u}" style="color:${linkColor};">${u}</a>`);
    return s.replace(/\u0000(\d+)\u0000/g, (_m, i) => links[Number(i)]);
  };
  return text.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/).map((para) => {
    const lines = para.split('\n');
    if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) {
      return `<ul style="margin:0 0 14px;padding-left:22px;">${lines.map((l) => `<li style="margin:0 0 4px;">${inline(l.replace(/^\s*[-•*]\s+/, ''))}</li>`).join('')}</ul>`;
    }
    return `<p style="margin:0 0 14px;">${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

const BTN: Record<Size, { font: number; padY: number; padX: number }> = {
  sm: { font: 12, padY: 9, padX: 18 }, md: { font: 14, padY: 13, padX: 28 }, lg: { font: 16, padY: 16, padX: 36 },
};

/** One bulletproof button. `full` fills its cell (used in rows). */
export function buttonHtml(b: ButtonSpec, opts: { align?: 'left' | 'center' | 'right'; full?: boolean } = {}): string {
  const k = BRAND[b.color || 'green'] || BRAND.green;
  const z = BTN[b.size || 'md'];
  const href = esc(safeHref(b.href) || SITE);
  const label = esc(b.label || 'Open');
  const height = z.font + z.padY * 2 + 4;
  const width = opts.full ? 200 : Math.round((b.label || 'Open').length * z.font * 0.72 + z.padX * 2 + 8);
  const css = `display:${opts.full ? 'block' : 'inline-block'};background:${k.bg};color:${k.fg};padding:${z.padY}px ${z.padX}px;border-radius:24px;font-family:${FONT};font-size:${z.font}px;line-height:1.2;font-weight:800;text-transform:uppercase;letter-spacing:1px;text-decoration:none;text-align:center;mso-hide:all;`;
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="${opts.align || 'center'}"${opts.full ? ' width="100%"' : ''} style="border-collapse:separate;${opts.align === 'center' || !opts.align ? 'margin:0 auto;' : ''}"><tr><td align="center" bgcolor="${k.bg}" style="border-radius:24px;background:${k.bg};">`
    + `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:${height}px;v-text-anchor:middle;width:${width}px;" arcsize="50%" stroke="f" fillcolor="${k.bg}"><w:anchorlock/><center style="color:${k.fg};font-family:Arial,sans-serif;font-size:${z.font}px;font-weight:bold;">${label}</center></v:roundrect><![endif]-->`
    + `<!--[if !mso]><!--><a href="${href}" target="_blank" style="${css}">${label}</a><!--<![endif]-->`
    + `</td></tr></table>`;
}

/** Cells side by side on a computer, one under another on a phone. */
const row = (cells: string[], widths?: number[]) =>
  `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>${cells.map((c, i) => {
    const w = widths?.[i] ?? Math.floor(100 / cells.length);
    return `<td class="gts-stack" width="${w}%" valign="top" style="width:${w}%;padding:0 ${i < cells.length - 1 ? 6 : 0}px 0 ${i > 0 ? 6 : 0}px;vertical-align:top;">${c}</td>`;
  }).join('')}</tr></table>`;

const raw = (key: string, html: string, style: Record<string, string> = { padding: '0 26px' }) =>
  h(Section, { key, style }, h('div', { dangerouslySetInnerHTML: { __html: html } }));

function blockEl(b: Block): ReactNode {
  const pad = { padding: '0 26px' };
  if (b.type === 'text') {
    const px = TEXT_PX[b.size || 'md'];
    const style = b.heading
      ? { margin: '6px 0 10px', fontSize: `${px + 7}px`, lineHeight: '1.25', fontWeight: 800, color: color(b.color), textAlign: ALIGN[b.align || 'start'] }
      : { fontSize: `${px}px`, lineHeight: '1.6', color: color(b.color), textAlign: ALIGN[b.align || 'start'] };
    const html = b.heading ? textBlockHtml(b.text).replace(/^<p style="margin:0 0 14px;">|<\/p>$/g, '') : textBlockHtml(b.text);
    return h(Section, { key: b.id, style: pad }, h(b.heading ? 'h2' : 'div', { style, dangerouslySetInnerHTML: { __html: html } }));
  }
  if (b.type === 'image') {
    const src = safeSrc(b.src);
    if (!src) return null;
    const href = b.href ? safeHref(b.href) : '';
    const w = Math.min(548, b.width || 548);
    const img = h(Img, { src, alt: b.alt || '', width: w, style: { display: 'block', width: '100%', maxWidth: `${w}px`, height: 'auto', margin: '0 auto 16px', border: 0, borderRadius: '4px' } });
    return h(Section, { key: b.id, style: pad }, href ? h(Link, { href }, img) : img);
  }
  if (b.type === 'button') return raw(b.id, `<div style="margin:6px 0 20px;">${buttonHtml(b, { align: ALIGN[b.align || 'center'] })}</div>`);
  if (b.type === 'buttons') {
    const bs = b.buttons.slice(0, 3);
    return raw(b.id, `<div style="margin:6px 0 20px;">${row(bs.map((x) => `<div class="gts-gap">${buttonHtml(x, { full: true })}</div>`))}</div>`);
  }
  if (b.type === 'pictext') {
    const src = safeSrc(b.src);
    const href = b.href ? safeHref(b.href) : '';
    const img = src ? `<img src="${esc(src)}" alt="${esc(b.alt)}" width="240" style="display:block;width:100%;max-width:240px;height:auto;border:0;border-radius:4px;margin:0 0 12px;">` : '';
    const pic = href && img ? `<a href="${esc(href)}">${img}</a>` : img;
    const words = `<div style="font-family:${FONT};font-size:15px;line-height:1.6;color:${INK};">${textBlockHtml(b.text)}</div>`;
    return raw(b.id, `<div style="margin:0 0 10px;">${row([pic, words], [45, 55])}</div>`);
  }
  if (b.type === 'divider') return h(Section, { key: b.id, style: pad }, h(Hr, { style: { borderColor: '#dde1dd', margin: '8px 0 22px' } }));
  if (b.type === 'spacer') {
    const px = Math.max(8, Math.min(80, Math.round(b.height || 24)));
    return raw(b.id, `<div style="height:${px}px;line-height:${px}px;font-size:1px;">&nbsp;</div>`, {});
  }
  // Imported design, kept as is. Cleaned again here: whatever was saved,
  // only the allowed tags and links go out.
  return h(Section, { key: b.id }, h('div', { dangerouslySetInnerHTML: { __html: signup(sanitizeEmailHtml(b.html).html) } }));
}

// Phones: side-by-side cells stack; Outlook needs the VML namespace.
const HEAD = `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">`
  + `<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->`
  + `<style>@media only screen and (max-width:480px){.gts-stack{display:block!important;width:100%!important;max-width:100%!important;padding:0!important}.gts-gap{padding-bottom:10px}}</style></head>`;
const HTML_TAG = '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">';

export type RenderOpts = { subject: string; plain?: boolean };

/** The email for a block newsletter. `plain` sends the same words as a
 *  personal-looking email (no pictures, buttons become links). */
export async function renderBlocks(doc: EmailDoc, o: RenderOpts): Promise<AnnouncementEmail> {
  const subject = o.subject.trim();
  const text = signup(docToText(doc));
  if (o.plain) return { subject, text, html: textToHtml(text) };
  const inner = await render(h('div', { style: { fontFamily: FONT, padding: '24px 0 10px' } }, ...doc.blocks.map(blockEl)), { pretty: false });
  // render() returns a full document; only its body goes inside the frame.
  // React's own markers go; Outlook's [if mso] comments stay.
  const body = (inner.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? inner)
    .replace(/<!--\/?\$\??-->|<!-- -->/g, '').replace(/<!DOCTYPE[^>]*>/gi, '').trim();
  const page = doc.branded === false
    ? `<!DOCTYPE html>\n<html><body style="margin:0;padding:0;background:#ffffff;"><div style="max-width:600px;margin:0 auto;background:#ffffff;font-family:${FONT};">${body}</div>\n</body></html>`
    : brandedShell(body);
  return { subject, text, html: page.replace(/<html[^>]*>/i, HTML_TAG + HEAD) };
}
