// src/lib/announcement-versions.ts
//
// Which copy of the announcement goes out. 'branded' is the designed email in
// customer-emails.ts. 'plain' is the same words written like a personal
// email: no banner, no photos, no button, a short text signature. Custom
// versions are written by GTS on the Emails tab and stored in
// email_announcement_versions. Every version is sent as text + HTML.
import { buildAnnouncementEmail } from './customer-emails';
import { SIGNATURE } from './email';
import { SIGNUP_URL } from './boat-invite';
import { CUSTOMER_STATUS_WALKTHROUGH } from './customer-order-status';

export type AnnouncementEmail = { subject: string; html: string; text: string };
export type CustomVersion = { id: string; name: string; subject: string; body: string; format: 'text' | 'html' };

export const SIGNUP_TOKEN = '{signup_link}';
const HOW_IT_WORKS_URL = 'https://graftontowboatservices.com/order-online';
const FONT = 'font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222;';

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const SIGNATURE_TEXT = `${SIGNATURE.name}\n${SIGNATURE.phone}\n${SIGNATURE.email}`;

/** Plain text → simple HTML: paragraphs, line breaks, links clickable. */
export function textToHtml(text: string): string {
  const linked = (line: string) => esc(line).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => `<a href="${u}">${u}</a>`);
  const paras = text.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/)
    .map((p) => `<p>${p.split('\n').map(linked).join('<br>')}</p>`).join('\n');
  return `<!DOCTYPE html>\n<html><body><div style="${FONT}">\n${paras}\n</div></body></html>`;
}

/** HTML → readable text for the text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
      const l = label.replace(/<[^>]+>/g, '').trim();
      return l && l !== href ? `${l}: ${href}` : href;
    })
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h\d|li|tr)>/gi, '\n\n').replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'").replace(/&rarr;/g, '→')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const ALLOWED_TAGS = new Set(['a', 'b', 'strong', 'i', 'em', 'u', 'p', 'br', 'div', 'span', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img']);
const ALLOWED_ATTRS = new Set(['href', 'src', 'alt', 'title', 'width', 'height', 'style', 'align', 'colspan', 'rowspan']);

/** Keep a short list of tags and attributes; drop scripts, handlers, forms,
 *  and any link that isn't http(s), mailto or tel. Body content only. */
export function sanitizeHtml(raw: string): string {
  let s = String(raw || '');
  const body = s.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (body) s = body[1];
  s = s.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|form|noscript|svg|math|template|head|title|meta|link|base)[\s\S]*?(<\/\1\s*>|$)/gi, '')
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|meta|link|base)\b[^>]*>/gi, '');
  return s.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (tag, name: string, attrs: string) => {
    const n = name.toLowerCase();
    if (!ALLOWED_TAGS.has(n)) return '';
    if (tag.startsWith('</')) return `</${n}>`;
    const kept: string[] = [];
    for (const m of attrs.matchAll(/([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      const a = m[1].toLowerCase();
      const v = m[3] ?? m[4] ?? m[5] ?? '';
      if (!ALLOWED_ATTRS.has(a)) continue;
      if ((a === 'href' || a === 'src') && !/^(https?:|mailto:|tel:)/i.test(v.trim())) continue;
      if (a === 'style' && /expression|url\s*\(|javascript:/i.test(v)) continue;
      kept.push(`${a}="${v.replace(/"/g, '&quot;')}"`);
    }
    return `<${n}${kept.length ? ' ' + kept.join(' ') : ''}>`;
  });
}

/** The current announcement's words, as a personal-style email. */
export function buildPlainAnnouncement(): AnnouncementEmail {
  const { subject } = buildAnnouncementEmail();
  const text = `Grafton Towboat Services now takes grocery and supply orders online.

Hi there. Your boat can put its next order in online, free to use, instead of working off that limited spreadsheet. Make an account for your boat and every order saves, so the next one is quicker.

The old order sheet was 1,329 lines. Slide it over and you have the whole store.

Search instead of scrolling. Type what you want and it comes up, priced, ready to add.

Reorder in one tap. Your last order becomes your next one.

Track what happens next. ${CUSTOMER_STATUS_WALKTHROUGH}

Anything else. Not at Sinclair’s? Paste a link from Walmart or anywhere else, or just write it in. It comes out with your order.

Their sale prices land on your order screen the same week they hit the shelf.

Create your boat's account: ${SIGNUP_URL}
Free. Takes a minute. See how it works: ${HOW_IT_WORKS_URL}

Meat, produce and deli go by weight, so your total is an estimate until it is rung up. The invoice shows what actually came aboard.

Anything at all, call ${SIGNATURE.phone}. Day or night.

${SIGNATURE_TEXT}`;
  return { subject, text, html: textToHtml(text) };
}

/** A version written on the Emails tab. {signup_link} becomes the link. */
export function renderCustomVersion(v: Pick<CustomVersion, 'subject' | 'body' | 'format'>): AnnouncementEmail {
  const subject = v.subject.trim();
  if (v.format === 'html') {
    const clean = sanitizeHtml(v.body).split(SIGNUP_TOKEN).join(`<a href="${SIGNUP_URL}">${SIGNUP_URL}</a>`);
    const html = `<!DOCTYPE html>\n<html><body><div style="${FONT}">\n${clean}\n</div></body></html>`;
    return { subject, html, text: htmlToText(html) };
  }
  const text = v.body.replace(/\r\n?/g, '\n').trim().split(SIGNUP_TOKEN).join(SIGNUP_URL);
  return { subject, text, html: textToHtml(text) };
}

/** The branded email with a text part derived from it. */
export function buildBrandedAnnouncement(): AnnouncementEmail {
  const { subject, html } = buildAnnouncementEmail();
  return { subject, html, text: htmlToText(html) };
}
