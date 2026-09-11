// src/lib/register-receipt-pdf.ts
// Pull text from a Sinclair register PDF (client-side). Photos → ask for PDF for now.

export async function extractPdfText(file: File): Promise<string> {
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    throw new Error('Upload the Sinclair register PDF for now (photo OCR comes next).');
  }
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const parts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const line = content.items
      .map(item => ('str' in item ? String(item.str) : ''))
      .filter(Boolean)
      .join(' ');
    // pdfjs often returns one long stream — also keep item positions roughly by reconstructing newlines
    // when transform y jumps. Simpler fallback: join with newlines between items that look like Plu#.
    const richer: string[] = [];
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const str = String(item.str);
      const tr = 'transform' in item ? (item as { transform?: number[] }).transform : undefined;
      const y = tr?.[5];
      if (lastY != null && y != null && Math.abs(y - lastY) > 2) richer.push('\n');
      else if (richer.length) richer.push(' ');
      richer.push(str);
      if (y != null) lastY = y;
    }
    parts.push(richer.join('') || line);
  }
  return parts.join('\n');
}
