// src/lib/doc-text.ts
// Text out of a Word (.docx) or PDF file, in the browser, for the newsletter
// editor. Jen reviews and edits the result; nothing is sent from the file.

/** Paragraphs from a .docx: it's a zip holding word/document.xml. */
export async function docxText(buf: ArrayBuffer): Promise<string> {
  const xml = await unzipEntry(new Uint8Array(buf), 'word/document.xml');
  const paras = xml.split(/<\/w:p>/).map((p) => p
    .replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, '\u0000$1\u0000')
    .split('\u0000').filter((_, i) => i % 2 === 1).join(''));
  return decode(paras.join('\n\n')).replace(/\n{3,}/g, '\n\n').trim();
}

/** Text from a PDF, a blank line between paragraphs where the gap shows one. */
export async function pdfText(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  if (typeof window !== 'undefined') {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    let out = '';
    let lastY: number | null = null;
    let lastH = 0;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform?.[5] as number | undefined;
      if (lastY != null && y != null && Math.abs(y - lastY) > 2) {
        out += Math.abs(y - lastY) > (lastH || 12) * 1.8 ? '\n\n' : '\n';
      } else if (out && !out.endsWith(' ') && item.str && !item.str.startsWith(' ')) out += ' ';
      out += item.str;
      if (y != null) { lastY = y; lastH = item.height || lastH; }
    }
    pages.push(out.trim());
  }
  // Lines broken only by the page width rejoin into their paragraph.
  return pages.join('\n\n').split(/\n{2,}/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).join('\n\n').trim();
}

export async function fileText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  if (/\.docx$/i.test(file.name)) return docxText(buf);
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') return pdfText(buf);
  throw new Error('Upload a Word (.docx) or PDF file.');
}

function decode(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');
}

/** One file out of a zip, via the central directory. */
async function unzipEntry(z: Uint8Array, name: string): Promise<string> {
  const v = new DataView(z.buffer, z.byteOffset, z.byteLength);
  let eocd = -1;
  for (let i = z.length - 22; i >= Math.max(0, z.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('That file isn\'t a Word document.');
  let p = v.getUint32(eocd + 16, true);
  const count = v.getUint16(eocd + 10, true);
  for (let n = 0; n < count; n++) {
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extra = v.getUint16(p + 30, true);
    const comment = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const fname = new TextDecoder().decode(z.subarray(p + 46, p + 46 + nameLen));
    if (fname === name) {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const data = z.subarray(start, start + size);
      if (method === 0) return new TextDecoder().decode(data);
      if (method !== 8) throw new Error('That Word file uses a compression we can\'t read.');
      const out = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new TextDecoder().decode(await new Response(out).arrayBuffer());
    }
    p += 46 + nameLen + extra + comment;
  }
  throw new Error('That file isn\'t a Word document.');
}
