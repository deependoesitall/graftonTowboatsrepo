// src/lib/email-sanitize.ts
// Clean an outside HTML email (pasted or uploaded) down
// to what is safe and works in inboxes. Allow-list only: anything not named
// here is dropped. Server only.
import sanitizeHtml from 'sanitize-html';

const TAGS = [
  'a', 'b', 'blockquote', 'br', 'center', 'div', 'em', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'small', 'span', 'strong', 'sub', 'sup', 'u', 'ul',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'col', 'colgroup',
];
const BOX = ['align', 'valign', 'width', 'height', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'role', 'style', 'dir', 'colspan', 'rowspan'];

// CSS properties inboxes understand. Anything else (position, behaviors,
// url() backgrounds, expressions) is dropped.
const SAFE_CSS = /^(color|background-color|background|font|font-family|font-size|font-weight|font-style|line-height|letter-spacing|text-align|text-decoration|text-transform|vertical-align|white-space|word-break|padding(-(top|right|bottom|left))?|margin(-(top|right|bottom|left))?|border(-(top|right|bottom|left))?(-(width|style|color|radius))?|border-collapse|border-spacing|border-radius|width|min-width|max-width|height|min-height|max-height|display|mso-[a-z-]+)$/;

/** Unsubscribe placeholders from other mailers become ours, so nobody ends
 *  up with a dead link. Our own footer is added at send time regardless. */
export const UNSUB_TOKEN = '{unsubscribe_link}';
const FOREIGN_UNSUB = /\*\|UNSUB\|\*|\{\{\{?\s*RESEND_UNSUBSCRIBE_URL\s*\}?\}\}|\{\{\s*unsubscribe(_url|_link)?\s*\}\}|%unsubscribe(_url)?%|\[unsubscribe\]/gi;

function cleanStyle(style: string): string {
  return style.split(';').map((d) => d.trim()).filter(Boolean).filter((d) => {
    const i = d.indexOf(':');
    if (i < 1) return false;
    const prop = d.slice(0, i).trim().toLowerCase();
    const val = d.slice(i + 1).trim().toLowerCase();
    if (!SAFE_CSS.test(prop)) return false;
    return !/url\s*\(|expression|javascript:|behavior|@import|-moz-binding/.test(val);
  }).join(';');
}

const styled = (a: Record<string, string>) => (a.style ? { ...a, style: cleanStyle(a.style) } : a);

/** 1×1 or hidden pictures are other mailers' open trackers. */
function isTracker(attrs: Record<string, string>): boolean {
  const w = parseInt(attrs.width || '', 10), h = parseInt(attrs.height || '', 10);
  const st = (attrs.style || '').replace(/\s/g, '').toLowerCase();
  if ((w > 0 && w <= 2) || (h > 0 && h <= 2)) return true;
  if (/display:none|visibility:hidden|(^|;)(width|height):[0-2]px/.test(st)) return true;
  return /(\/open|\/track|pixel|beacon|\/wf\/open|list-manage\.com\/track)/i.test(attrs.src || '') && !attrs.alt;
}

export type Cleaned = { html: string; removed: string[] };

/** The body of an outside email, safe to send. `removed` says, in plain
 *  words, what was taken out. */
export function sanitizeEmailHtml(raw: string): Cleaned {
  const removed = new Set<string>();
  let src = raw;
  if (/<script/i.test(src)) removed.add('scripts');
  if (/<form|<input|<button|<select|<textarea/i.test(src)) removed.add('forms');
  if (/<iframe|<object|<embed|<video|<audio/i.test(src)) removed.add('embedded media');
  if (/\son[a-z]+\s*=/i.test(src)) removed.add('click scripts');
  if (/<style/i.test(src) || /<link[^>]+stylesheet/i.test(src)) removed.add('style sheets (inline styles kept)');
  // Only what's inside <body>; head, meta and outside stylesheets go.
  const body = src.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (body) src = body[1];
  src = src.replace(FOREIGN_UNSUB, UNSUB_TOKEN);

  const html = sanitizeHtml(src, {
    allowedTags: TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'style', 'name'],
      img: ['src', 'alt', 'width', 'height', 'style', 'border', 'align', 'data-cid', 'data-gts-missing'],
      font: ['color', 'face', 'size'],
      '*': BOX,
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https', 'data', 'cid'] },
    allowProtocolRelative: false,
    // Pictures with a relative address are kept so they can be matched to
    // uploaded files; links must be absolute.
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    disallowedTagsMode: 'discard',
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'title', 'head'],
    transformTags: {
      a: (tag, attrs) => {
        const href = (attrs.href || '').trim();
        if (href === UNSUB_TOKEN) return { tagName: 'a', attribs: styled(attrs) };
        if (href && !/^(https?:|mailto:|tel:)/i.test(href)) { removed.add('links without a full web address'); delete attrs.href; }
        return { tagName: 'a', attribs: styled({ ...attrs, target: '_blank' }) };
      },
      img: (tag, attrs) => {
        if (isTracker(attrs)) { removed.add('tracking pixels'); return { tagName: 'span', attribs: {} }; }
        return { tagName: 'img', attribs: styled(attrs) };
      },
      '*': (tag, attrs) => ({ tagName: tag, attribs: styled(attrs) }),
    },
  });
  return { html: html.trim(), removed: [...removed] };
}
