// src/lib/billing-packet.ts
//
// THE BILLING PACKET — one PDF per invoice.
//
// WHY THIS EXISTS.
// Ingram's accounts payable will not pay a delivery invoice that arrives
// without the signed delivery log, and won't accept the grocery line without
// Sinclair's itemised register receipt. Until now those lived as two separate
// links, which meant Mary Karen attached two files to every QuickBooks invoice
// — two trips through the file picker, and one of them eventually gets
// forgotten. A rejected invoice costs far more than the download did.
//
// One file cannot be half-attached. That is the entire point of this module.
//
// WHAT'S IN IT, IN ORDER:
//   1. A cover sheet — the exact invoice lines, so AP can reconcile the
//      packet against the QuickBooks invoice without opening anything else.
//   2. Every signed delivery log for the deliveries on that invoice.
//   3. Every Sinclair's register receipt (these run 20+ pages; they go last
//      so the reviewable material is at the front).
//
// A MISSING OR UNREADABLE DOCUMENT NEVER FAILS THE DOWNLOAD.
// It becomes a visible page in the packet saying what's missing and where it
// lives. A packet that silently drops a receipt is worse than one that says
// "this receipt is a HEIC and couldn't be embedded" — the first gets sent and
// bounced, the second gets fixed in thirty seconds.

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import { QbHandoff, shortDate } from '@/lib/quickbooks-handoff';

const PAGE_W = 612;   // US Letter, points
const PAGE_H = 792;
const MARGIN = 54;

// Brand navy / gold, matching the invoice and the site.
const NAVY = rgb(0.09, 0.16, 0.27);
const GOLD = rgb(0.72, 0.55, 0.20);
const GREY = rgb(0.45, 0.45, 0.45);
const RULE = rgb(0.85, 0.85, 0.85);

const usd = (n: number) =>
  '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

/** Hard-wrap to a pixel width, since pdf-lib has no text flow of its own. */
function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxW && line) {
      out.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

/** Truncate with an ellipsis so a long description can't run off the page. */
function fit(text: string, font: PDFFont, size: number, maxW: number): string {
  let s = String(text ?? '');
  if (font.widthOfTextAtSize(s, size) <= maxW) return s;
  while (s.length > 1 && font.widthOfTextAtSize(s + '…', size) > maxW) s = s.slice(0, -1);
  return s + '…';
}

type Fetched = { bytes: Uint8Array; kind: 'pdf' | 'jpg' | 'png' | 'unknown' };

/**
 * Detect by MAGIC BYTES, not by file extension or Content-Type.
 *
 * Both lie here: Supabase storage serves some uploads as
 * application/octet-stream, and phone uploads arrive named ".jpg" while
 * actually being HEIC. The first four bytes don't lie.
 */
function sniff(bytes: Uint8Array): Fetched['kind'] {
  if (bytes.length < 4) return 'unknown';
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';   // %PDF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  return 'unknown';
}

async function fetchDoc(url: string): Promise<Fetched | { error: string }> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length) return { error: 'empty file' };
    return { bytes, kind: sniff(bytes) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'could not be downloaded' };
  }
}

/** A page saying what's missing — never a silent gap in the packet. */
function problemPage(
  pdf: PDFDocument, bold: PDFFont, body: PDFFont,
  title: string, detail: string, url?: string,
) {
  const p = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN - 40;
  p.drawText('DOCUMENT NOT INCLUDED', { x: MARGIN, y, size: 10, font: bold, color: GOLD });
  y -= 26;
  p.drawText(fit(title, bold, 16, PAGE_W - MARGIN * 2), { x: MARGIN, y, size: 16, font: bold, color: NAVY });
  y -= 22;
  for (const l of wrap(detail, body, 11, PAGE_W - MARGIN * 2)) {
    p.drawText(l, { x: MARGIN, y, size: 11, font: body, color: GREY });
    y -= 15;
  }
  if (url) {
    y -= 8;
    p.drawText('It is still available here:', { x: MARGIN, y, size: 9, font: body, color: GREY });
    y -= 13;
    for (const l of wrap(url, body, 8, PAGE_W - MARGIN * 2)) {
      p.drawText(l, { x: MARGIN, y, size: 8, font: body, color: NAVY });
      y -= 11;
    }
  }
}

/** Drop an image onto its own page, scaled to fit, with a caption. */
function imagePage(
  pdf: PDFDocument, bold: PDFFont,
  img: { width: number; height: number },
  draw: (page: PDFPage, x: number, y: number, w: number, h: number) => void,
  caption: string,
) {
  const p = pdf.addPage([PAGE_W, PAGE_H]);
  const capH = 34;
  p.drawText(fit(caption, bold, 11, PAGE_W - MARGIN * 2), {
    x: MARGIN, y: PAGE_H - MARGIN, size: 11, font: bold, color: NAVY,
  });
  const availW = PAGE_W - MARGIN * 2;
  const availH = PAGE_H - MARGIN * 2 - capH;
  const scale = Math.min(availW / img.width, availH / img.height, 1);
  const w = img.width * scale;
  const h = img.height * scale;
  draw(p, (PAGE_W - w) / 2, MARGIN + (availH - h) / 2, w, h);
}

/**
 * Build the packet. Returns PDF bytes.
 *
 * `h` is one invoice's worth of work — see buildQbHandoff, which groups by
 * boat because that is the invoice unit.
 */
export async function buildBillingPacket(h: QbHandoff): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const body = await pdf.embedFont(StandardFonts.Helvetica);

  const title = [h.billTo, h.vessel].filter(Boolean).join(' — ') || 'Delivery';
  pdf.setTitle(`Billing packet — ${title}`);
  pdf.setProducer('Grafton Towboat Services');
  pdf.setCreator('Grafton Towboat Services');

  // ── Cover sheet ────────────────────────────────────────────────────────
  const cover = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  cover.drawText('GRAFTON TOWBOAT SERVICES', { x: MARGIN, y, size: 10, font: bold, color: GOLD });
  y -= 30;
  cover.drawText('Invoice backup', { x: MARGIN, y, size: 22, font: bold, color: NAVY });
  y -= 24;
  cover.drawText(fit(title, bold, 14, PAGE_W - MARGIN * 2), { x: MARGIN, y, size: 14, font: bold, color: NAVY });
  y -= 18;

  const meta = [
    h.invoiceDate ? `Delivery date: ${shortDate(h.invoiceDate)}` : '',
    h.poNumbers.length ? `PO ${h.poNumbers.join(', ')}` : '',
  ].filter(Boolean).join('    ·    ');
  if (meta) {
    cover.drawText(meta, { x: MARGIN, y, size: 10, font: body, color: GREY });
    y -= 18;
  }

  y -= 10;
  cover.drawLine({
    start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y },
    thickness: 1, color: NAVY,
  });
  y -= 22;

  // Line-item table. Columns mirror the QuickBooks invoice grid so AP can lay
  // the two side by side.
  const xItem = MARGIN;
  const xDesc = MARGIN + 132;
  const xQty = PAGE_W - MARGIN - 108;
  const xAmt = PAGE_W - MARGIN;

  cover.drawText('PRODUCT / SERVICE', { x: xItem, y, size: 8, font: bold, color: GREY });
  cover.drawText('DESCRIPTION', { x: xDesc, y, size: 8, font: bold, color: GREY });
  cover.drawText('QTY', { x: xQty, y, size: 8, font: bold, color: GREY });
  const amtHdrW = bold.widthOfTextAtSize('AMOUNT', 8);
  cover.drawText('AMOUNT', { x: xAmt - amtHdrW, y, size: 8, font: bold, color: GREY });
  y -= 6;
  cover.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: RULE });
  y -= 16;

  for (const l of h.lines) {
    cover.drawText(fit(l.item, body, 10, xDesc - xItem - 8), { x: xItem, y, size: 10, font: body, color: NAVY });
    cover.drawText(fit(l.description, body, 10, xQty - xDesc - 8), { x: xDesc, y, size: 10, font: body, color: NAVY });
    cover.drawText(String(l.qty), { x: xQty, y, size: 10, font: body, color: NAVY });
    const amt = usd(l.rate * l.qty);
    cover.drawText(amt, { x: xAmt - body.widthOfTextAtSize(amt, 10), y, size: 10, font: body, color: NAVY });
    y -= 18;
  }

  y -= 4;
  cover.drawLine({ start: { x: xQty - 40, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: NAVY });
  y -= 18;
  cover.drawText('Invoice total', { x: xQty - 40, y, size: 11, font: bold, color: NAVY });
  const totalStr = usd(h.total);
  cover.drawText(totalStr, { x: xAmt - bold.widthOfTextAtSize(totalStr, 11), y, size: 11, font: bold, color: NAVY });
  y -= 40;

  // What follows, so a reader knows whether the packet is complete before
  // scrolling through twenty pages of receipt.
  cover.drawText('ATTACHED', { x: MARGIN, y, size: 8, font: bold, color: GREY });
  y -= 16;
  if (h.documents.length === 0) {
    cover.drawText('No supporting documents were uploaded for this delivery.', {
      x: MARGIN, y, size: 10, font: body, color: GREY,
    });
    y -= 15;
  }
  for (const d of h.documents) {
    const label = d.forDate ? `${d.label} — ${shortDate(d.forDate)}` : d.label;
    cover.drawText(`•  ${fit(label, body, 10, PAGE_W - MARGIN * 2 - 20)}`, {
      x: MARGIN, y, size: 10, font: body, color: NAVY,
    });
    y -= 15;
  }

  if (h.warnings.length) {
    y -= 18;
    cover.drawText('NEEDS ATTENTION', { x: MARGIN, y, size: 8, font: bold, color: GOLD });
    y -= 15;
    for (const w of h.warnings) {
      for (const l of wrap(`•  ${w}`, body, 9, PAGE_W - MARGIN * 2)) {
        if (y < MARGIN) break;
        cover.drawText(l, { x: MARGIN, y, size: 9, font: body, color: GREY });
        y -= 12;
      }
    }
  }

  cover.drawText(
    'Generated by the Grafton Towboat ordering system. Not an invoice — the invoice is issued from QuickBooks.',
    { x: MARGIN, y: MARGIN - 20, size: 7.5, font: body, color: GREY },
  );

  // ── Supporting documents ───────────────────────────────────────────────
  // Signed logs before receipts: the log is the one AP checks by eye, the
  // receipt is the one they scroll past.
  const ordered = [
    ...h.documents.filter(d => /log|slip/i.test(d.label)),
    ...h.documents.filter(d => !/log|slip/i.test(d.label)),
  ];

  for (const doc of ordered) {
    const caption = doc.forDate ? `${doc.label} — ${shortDate(doc.forDate)}` : doc.label;
    const got = await fetchDoc(doc.url);

    if ('error' in got) {
      problemPage(pdf, bold, body, caption,
        `This document could not be downloaded (${got.error}). Attach it to the invoice by hand.`,
        doc.url);
      continue;
    }

    try {
      if (got.kind === 'pdf') {
        const src = await PDFDocument.load(got.bytes, { ignoreEncryption: true });
        const pages = await pdf.copyPages(src, src.getPageIndices());
        pages.forEach((p, i) => {
          pdf.addPage(p);
          if (i === 0) {
            // Caption the first page only — a 23-page receipt doesn't need
            // the same header stamped 23 times.
            const { height } = p.getSize();
            p.drawText(fit(caption, bold, 9, PAGE_W - 24), {
              x: 12, y: height - 14, size: 9, font: bold, color: NAVY,
            });
          }
        });
      } else if (got.kind === 'jpg') {
        const img = await pdf.embedJpg(got.bytes);
        imagePage(pdf, bold, img, (p, x, yy, w, hh) => p.drawImage(img, { x, y: yy, width: w, height: hh }), caption);
      } else if (got.kind === 'png') {
        const img = await pdf.embedPng(got.bytes);
        imagePage(pdf, bold, img, (p, x, yy, w, hh) => p.drawImage(img, { x, y: yy, width: w, height: hh }), caption);
      } else {
        // Almost always a HEIC straight off an iPhone. The upload endpoint
        // accepts image/heic, and no PDF library can embed it.
        problemPage(pdf, bold, body, caption,
          'This file is in a format that cannot be placed in a PDF (usually an iPhone HEIC photo). '
          + 'Open the link below and attach it to the invoice separately, or re-upload it as a JPEG.',
          doc.url);
      }
    } catch (e) {
      problemPage(pdf, bold, body, caption,
        `This document could not be added to the packet (${e instanceof Error ? e.message : 'unreadable'}). `
        + 'Attach it to the invoice by hand.',
        doc.url);
    }
  }

  return pdf.save();
}

/** `Ingram-Barge-Scott-Noble-2026-06-30.pdf` — sorts and reads sensibly. */
export function packetFilename(h: QbHandoff): string {
  const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const parts = [h.billTo, h.vessel].filter(Boolean).map(slug).filter(Boolean);
  const date = (h.invoiceDate || '').slice(0, 10);
  return [parts.join('-') || 'billing-packet', date].filter(Boolean).join('-') + '.pdf';
}
