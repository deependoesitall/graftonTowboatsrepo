// src/lib/email-check.ts
// The check before sending, in plain words: links that don't open, pictures
// that are missing or have no description, an email big enough for Gmail to
// cut off, no subject. Server only (it opens every link).
import { docImages, docLinks, type EmailDoc } from '@/lib/email-blocks';
import { isPublicUrl } from '@/lib/email-images';

export const GMAIL_CLIP_BYTES = 102 * 1024;
export const SIZE_WARN_BYTES = 90 * 1024;

export type Problem = { level: 'stop' | 'warn'; text: string };
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

async function opens(url: string, fetcher: Fetcher): Promise<boolean> {
  if (!isPublicUrl(url)) return false;
  for (const method of ['HEAD', 'GET']) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    try {
      const r = await fetcher(url, { method, redirect: 'follow', signal: ctl.signal });
      if (r.ok) return true;
      // Some sites refuse HEAD; try once more with GET.
      if (method === 'HEAD' && [403, 405, 501].includes(r.status)) continue;
      return false;
    } catch { if (method === 'GET') return false; } finally { clearTimeout(t); }
  }
  return false;
}

export async function checkEmail(doc: EmailDoc, o: { subject: string; html: string; fetcher?: Fetcher }): Promise<Problem[]> {
  const fetcher = o.fetcher || fetch;
  const out: Problem[] = [];
  if (!o.subject.trim()) out.push({ level: 'stop', text: 'There is no subject line.' });
  if (!doc.blocks.length) out.push({ level: 'stop', text: 'The email is empty.' });

  const links = docLinks(doc).filter((l) => !/^(mailto|tel):/i.test(l.href) && l.href !== '{unsubscribe_link}');
  for (const l of links.filter((x) => !x.href.trim())) out.push({ level: 'stop', text: `The "${l.label || 'button'}" button has no web address.` });
  const unique = [...new Set(links.map((l) => l.href.trim()).filter(Boolean))].slice(0, 40);
  const results = await Promise.all(unique.map(async (u) => [u, await opens(u, fetcher)] as const));
  for (const [u, ok] of results) {
    if (ok) continue;
    const label = links.find((l) => l.href.trim() === u)?.label || u;
    out.push({ level: 'stop', text: `This link doesn't open: "${label}" (${u}).` });
  }

  const imgs = docImages(doc);
  const missing = imgs.filter((i) => !i.src.trim());
  if (missing.length) out.push({ level: 'stop', text: missing.length === 1 ? 'One picture is missing. Add it again or remove it.' : `${missing.length} pictures are missing. Add them again or remove them.` });
  const srcs = [...new Set(imgs.map((i) => i.src.trim()).filter(Boolean))].slice(0, 30);
  const imgOk = await Promise.all(srcs.map(async (u) => [u, await opens(u, fetcher)] as const));
  for (const [u] of imgOk.filter(([, ok]) => !ok)) out.push({ level: 'stop', text: `A picture won't load (${u.length > 80 ? `${u.slice(0, 77)}...` : u}).` });
  const noAlt = imgs.filter((i) => i.src && !i.alt.trim()).length;
  if (noAlt) out.push({ level: 'warn', text: `${noAlt === 1 ? 'One picture has' : `${noAlt} pictures have`} no description. Add a few words for readers whose pictures are turned off.` });

  const bytes = Buffer.byteLength(o.html, 'utf8');
  if (bytes > GMAIL_CLIP_BYTES) out.push({ level: 'warn', text: `The email is ${Math.round(bytes / 1024)} KB. Gmail cuts off anything over 102 KB and hides the rest behind "View entire message". Shorten it or use fewer sections.` });
  else if (bytes > SIZE_WARN_BYTES) out.push({ level: 'warn', text: `The email is ${Math.round(bytes / 1024)} KB, close to Gmail's 102 KB cut-off.` });
  return out;
}
