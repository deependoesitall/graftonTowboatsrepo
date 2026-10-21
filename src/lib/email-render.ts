// src/lib/email-render.ts
// A block newsletter → the email that goes out (HTML + text), built with
// react-email so buttons, lines and spacing hold up in Gmail, Outlook and
// Apple Mail. Branded puts it inside the same GTS header and footer as the
// other emails. Server only.
import { createElement as h, type ReactNode } from 'react';
import { render } from '@react-email/render';
import { Button, Hr, Img, Link, Section } from '@react-email/components';
import { brandedShell, GREEN, YELLOW, ORANGE, INK } from '@/lib/customer-emails';
import { textToHtml, SIGNUP_TOKEN, type AnnouncementEmail } from '@/lib/announcement-versions';
import { SIGNUP_URL } from '@/lib/boat-invite';
import { SITE, docToText, type Block, type EmailDoc } from '@/lib/email-blocks';
import { sanitizeEmailHtml } from '@/lib/email-sanitize';

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const signup = (s: string) => s.split(SIGNUP_TOKEN).join(SIGNUP_URL);
/** Only web, email and phone links go out. */
const safeHref = (u: string) => { const v = signup(String(u || '').trim()); return /^(https?:|mailto:|tel:)/i.test(v) ? v : ''; };
const safeSrc = (u: string) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');

/** Written words → HTML: paragraphs, "- " lists, **bold**, clickable links. */
export function textBlockHtml(text: string): string {
  const inline = (line: string) => esc(signup(line))
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => `<a href="${u}" style="color:${GREEN};">${u}</a>`);
  return text.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/).map((para) => {
    const lines = para.split('\n');
    if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) {
      return `<ul style="margin:0 0 14px;padding-left:22px;">${lines.map((l) => `<li style="margin:0 0 4px;">${inline(l.replace(/^\s*[-•*]\s+/, ''))}</li>`).join('')}</ul>`;
    }
    return `<p style="margin:0 0 14px;">${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

function blockEl(b: Block): ReactNode {
  const pad = { padding: '0 26px' };
  if (b.type === 'text') {
    const style = b.heading
      ? { margin: '6px 0 10px', fontSize: '22px', lineHeight: '1.25', fontWeight: 800, color: INK }
      : { fontSize: '15px', lineHeight: '1.6', color: INK };
    const html = b.heading ? esc(signup(b.text)).replace(/\n/g, '<br>') : textBlockHtml(b.text);
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
  if (b.type === 'button') {
    const bg = b.color === 'orange' ? ORANGE : GREEN;
    const fg = b.color === 'orange' ? '#ffffff' : YELLOW;
    return h(Section, { key: b.id, style: { ...pad, textAlign: 'center' as const, margin: '6px 0 20px' } },
      h(Button, { href: safeHref(b.href) || SITE, style: { background: bg, color: fg, padding: '13px 30px', borderRadius: '24px', fontSize: '14px', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '1px', textDecoration: 'none', display: 'inline-block' } }, b.label || 'Open'));
  }
  if (b.type === 'divider') return h(Section, { key: b.id, style: pad }, h(Hr, { style: { borderColor: '#dde1dd', margin: '8px 0 22px' } }));
  // Imported design, kept as is. Cleaned again here: whatever was saved,
  // only the allowed tags and links go out.
  return h(Section, { key: b.id }, h('div', { dangerouslySetInnerHTML: { __html: signup(sanitizeEmailHtml(b.html).html) } }));
}

export type RenderOpts = { subject: string; plain?: boolean };

/** The email for a block newsletter. `plain` sends the same words as a
 *  personal-looking email (no pictures, buttons become links). */
export async function renderBlocks(doc: EmailDoc, o: RenderOpts): Promise<AnnouncementEmail> {
  const subject = o.subject.trim();
  const text = signup(docToText(doc));
  if (o.plain) return { subject, text, html: textToHtml(text) };
  const inner = await render(h('div', { style: { fontFamily: FONT, padding: '24px 0 10px' } }, ...doc.blocks.map(blockEl)), { pretty: false });
  // render() returns a full document; only its body goes inside the frame.
  const body = (inner.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? inner).replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[^>]*>/gi, '').trim();
  const html = doc.branded === false
    ? `<!DOCTYPE html>\n<html><body style="margin:0;padding:0;background:#ffffff;"><div style="max-width:600px;margin:0 auto;background:#ffffff;font-family:${FONT};">${body}</div>\n</body></html>`
    : brandedShell(body);
  return { subject, text, html };
}
