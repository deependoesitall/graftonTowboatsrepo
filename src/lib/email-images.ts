// src/lib/email-images.ts
// Every picture in an email ends up hosted in our public `email-images`
// bucket: embedded (base64), attached (cid:), relative ("images/logo.png",
// matched to the files uploaded with it) and outside addresses alike.
// Inboxes clip or block embedded pictures; hosted ones load everywhere.
// Server only.
import { createHash } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { htmlParts, patchHtmlPart, type EmailDoc } from '@/lib/email-blocks';

export const BUCKET = 'email-images';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };

export type ImageStore = { put(bytes: Uint8Array, type: string): Promise<string>; owns(url: string): boolean };
export type ImportFile = { name: string; type: string; bytes: Uint8Array; cid?: string };
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export type HostResult = { hosted: number; missing: string[]; failed: string[] };

export function supabaseImageStore(supabase: ReturnType<typeof createServiceClient>): ImageStore {
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
  return {
    owns: (url) => url.startsWith(base),
    async put(bytes, type) {
      const ext = TYPES[type];
      if (!ext) throw new Error('Pictures must be JPG, PNG, GIF or WebP.');
      if (bytes.length > MAX_IMAGE_BYTES) throw new Error('That picture is over 5 MB.');
      // Same picture, same address: re-imports don't pile up copies.
      const path = `${new Date().toISOString().slice(0, 7)}/${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: true });
      if (error) throw new Error(error.message);
      return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    },
  };
}

function sniff(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}

/** Public web address, not a local or private one. */
export function isPublicUrl(u: string): boolean {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return false;
    const h = url.hostname.toLowerCase();
    return !(h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':'));
  } catch { return false; }
}

async function download(url: string, fetcher: Fetcher): Promise<{ bytes: Uint8Array; type: string }> {
  if (!isPublicUrl(url)) throw new Error('not a public address');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetcher(url, { signal: ctl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_IMAGE_BYTES) throw new Error('over 5 MB');
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error('over 5 MB');
    const type = sniff(bytes) || (res.headers.get('content-type') || '').split(';')[0];
    return { bytes, type };
  } finally { clearTimeout(t); }
}

const basename = (s: string) => decodeURIComponent(s.split(/[?#]/)[0].split('/').pop() || '').toLowerCase();

/** The hosted address for one picture source, or null if it can't be found. */
async function hostOne(src: string, ctx: { store: ImageStore; files: ImportFile[]; fetcher: Fetcher; res: HostResult }): Promise<string | null> {
  const s = src.trim();
  if (!s) return null;
  if (ctx.store.owns(s)) return s;
  const data = s.match(/^data:(image\/[a-z+.-]+);base64,([\s\S]+)$/i);
  if (data) {
    const bytes = Uint8Array.from(Buffer.from(data[2].replace(/\s/g, ''), 'base64'));
    ctx.res.hosted++;
    return ctx.store.put(bytes, sniff(bytes) || data[1].toLowerCase());
  }
  if (/^cid:/i.test(s)) {
    const cid = s.slice(4).replace(/^<|>$/g, '').toLowerCase();
    const f = ctx.files.find((x) => (x.cid || '').toLowerCase() === cid || x.name.toLowerCase() === cid || basename(x.name) === basename(cid));
    if (!f) return null;
    ctx.res.hosted++;
    return ctx.store.put(f.bytes, sniff(f.bytes) || f.type);
  }
  if (/^https?:\/\//i.test(s)) {
    try {
      const { bytes, type } = await download(s, ctx.fetcher);
      ctx.res.hosted++;
      return await ctx.store.put(bytes, type);
    } catch {
      // Keep the outside address; the pre-send check reports it if broken.
      ctx.res.failed.push(s);
      return s;
    }
  }
  // Relative ("images/logo.png"): match an uploaded file by name.
  const f = ctx.files.find((x) => basename(x.name) === basename(s));
  if (!f) return null;
  ctx.res.hosted++;
  return ctx.store.put(f.bytes, sniff(f.bytes) || f.type);
}

export async function hostHtmlImages(html: string, opts: { store: ImageStore; files?: ImportFile[]; fetcher?: Fetcher; res?: HostResult }): Promise<{ html: string } & HostResult> {
  const res = opts.res || { hosted: 0, missing: [], failed: [] };
  const ctx = { store: opts.store, files: opts.files || [], fetcher: opts.fetcher || fetch, res };
  let out = html;
  const imgs = htmlParts(out).filter((p) => p.kind === 'image');
  for (const p of imgs) {
    const src = p.attrs.src || '';
    const url = await hostOne(src, ctx);
    if (url === src) continue;
    if (url) out = patchHtmlPart(out, 'image', p.index, { src: url });
    else {
      res.missing.push(src.startsWith('data:') ? 'an embedded picture' : src || 'a picture with no address');
      out = patchHtmlPart(out, 'image', p.index, { src: '' });
    }
  }
  return { html: out, ...res };
}

export async function hostDocImages(doc: EmailDoc, opts: { store: ImageStore; files?: ImportFile[]; fetcher?: Fetcher }): Promise<{ doc: EmailDoc } & HostResult> {
  const res: HostResult = { hosted: 0, missing: [], failed: [] };
  const ctx = { store: opts.store, files: opts.files || [], fetcher: opts.fetcher || fetch, res };
  const blocks = [];
  for (const b of doc.blocks) {
    if (b.type === 'image' && b.src) {
      const url = await hostOne(b.src, ctx);
      if (!url) res.missing.push(b.src.startsWith('data:') ? 'an embedded picture' : b.src);
      blocks.push({ ...b, src: url || '' });
    } else if (b.type === 'html') {
      const r = await hostHtmlImages(b.html, { ...opts, res });
      blocks.push({ ...b, html: r.html });
    } else blocks.push(b);
  }
  return { doc: { ...doc, blocks }, ...res };
}
