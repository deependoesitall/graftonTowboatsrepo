// src/lib/image-shrink.ts
// A picture picked for an email, made inbox-sized in the browser before it
// uploads: at most 1200 px wide (sharp on phones, twice the email's width),
// JPEG unless it has see-through parts. GIFs stay as they are (animation).
export async function shrinkImage(file: File, maxWidth = 1200): Promise<Blob> {
  if (file.type === 'image/gif') return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i); i.onerror = () => bad(new Error('That file is not a picture.'));
      i.src = url;
    });
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    let clear = false;
    if (file.type === 'image/png' || file.type === 'image/webp') {
      const px = ctx.getImageData(0, 0, w, h).data;
      for (let i = 3; i < px.length; i += 4 * 7) if (px[i] < 250) { clear = true; break; }
    }
    const type = clear ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, 0.85));
    // Keep whichever is smaller.
    return blob && (blob.size < file.size || scale < 1) ? blob : file;
  } finally { URL.revokeObjectURL(url); }
}
