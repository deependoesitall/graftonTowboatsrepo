// src/lib/announcement-versions.ts
//
// Rendering for every list email. The announcement has two built-in copies:
// 'branded' (the designed email in customer-emails.ts) and 'plain' (the same
// words written like a personal email: no banner, no photos, no button, a
// short text signature). Newsletters are written by GTS on the Emails tab
// (table newsletters) in either style, and can also stand in as the
// announcement. Every email is sent as text + HTML.
import { buildAnnouncementEmail, brandedShell } from './customer-emails';
import { SIGNATURE } from './email';
import { SIGNUP_URL } from './boat-invite';
import { CUSTOMER_STATUS_WALKTHROUGH } from './customer-order-status';

export type AnnouncementEmail = { subject: string; html: string; text: string };
export type Newsletter = { id: string; name: string; subject: string; body: string; style: 'plain' | 'branded' };

export const SIGNUP_TOKEN = '{signup_link}';
const HOW_IT_WORKS_URL = 'https://graftontowboatservices.com/order-online';
const FONT = 'font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222;';

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const SIGNATURE_TEXT = `${SIGNATURE.name}\n${SIGNATURE.phone}\n${SIGNATURE.email}`;

/** Plain text → paragraphs with line breaks and clickable links. */
function bodyHtml(text: string): string {
  const linked = (line: string) => esc(line).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => `<a href="${u}">${u}</a>`);
  return text.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/)
    .map((p) => `<p>${p.split('\n').map(linked).join('<br>')}</p>`).join('\n');
}

/** Plain text → a simple, personal-looking HTML email. */
export function textToHtml(text: string): string {
  return `<!DOCTYPE html>\n<html><body><div style="${FONT}">\n${bodyHtml(text)}\n</div></body></html>`;
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

/** A newsletter. {signup_link} becomes the link to make a boat account.
 *  'branded' puts the body inside the GTS header and footer. */
export function renderNewsletter(v: Pick<Newsletter, 'subject' | 'body'> & { style?: Newsletter['style'] }): AnnouncementEmail {
  const subject = v.subject.trim();
  const text = v.body.replace(/\r\n?/g, '\n').trim().split(SIGNUP_TOKEN).join(SIGNUP_URL);
  const inner = bodyHtml(text);
  const html = v.style === 'branded'
    ? brandedShell(`<div style="padding:26px;${FONT}font-size:15px;">\n${inner}\n</div>`)
    : `<!DOCTYPE html>\n<html><body><div style="${FONT}">\n${inner}\n</div></body></html>`;
  return { subject, html, text };
}

/** Adds the unsubscribe line to the end of an email. */
export function withUnsubscribe(e: AnnouncementEmail, url: string): AnnouncementEmail {
  const line = `<p style="font-family:Arial,sans-serif;font-size:12px;color:#777;margin:18px 0 0;text-align:center;">Don't want these emails? <a href="${esc(url)}" style="color:#777;">Unsubscribe</a></p>`;
  const html = e.html.includes('</body>') ? e.html.replace('</body>', `${line}\n</body>`) : e.html + line;
  return { ...e, html, text: `${e.text}\n\n--\nUnsubscribe: ${url}` };
}

/** The branded email with a text part derived from it. */
export function buildBrandedAnnouncement(): AnnouncementEmail {
  const { subject, html } = buildAnnouncementEmail();
  return { subject, html, text: htmlToText(html) };
}
