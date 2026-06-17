// src/lib/pdf-attachment.ts
// Generates a PDF Buffer for email attachment using pdfkit.
// Does NOT use @react-pdf/renderer or any browser-only API — safe for Node.js serverless.

import type { Order } from '@/types';
import { formatCurrency, formatDate } from './utils';

// ─── Colours / brand ─────────────────────────────────────────
const DARK_GREEN = '#1E3D1E';
const LIME       = '#D9E84A';
const ORANGE     = '#E8640A';
const GRAY       = '#555555';
const LIGHT_GRAY = '#999999';

// ─── Layout helpers ──────────────────────────────────────────
const PAGE_W    = 612;  // US Letter points
const MARGIN    = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

/** Returns a Buffer containing a complete PDF for the given order. */
export async function generateOrderPdfBuffer(order: Order): Promise<Buffer> {
  // Dynamic import keeps pdfkit out of the browser bundle
  const PDFDocument = (await import('pdfkit')).default;

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: MARGIN,
      info: {
        Title: `Order ${order.order_number} — Grafton Towboat Services`,
        Author: 'Grafton Towboat Services',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);

    // ── HEADER ────────────────────────────────────────────────
    doc.rect(MARGIN, MARGIN, CONTENT_W, 56).fill(DARK_GREEN);
    doc.fillColor(LIME)
       .fontSize(16).font('Helvetica-Bold')
       .text('GRAFTON TOWBOAT SERVICES', MARGIN + 10, MARGIN + 10, { width: CONTENT_W - 20 });
    doc.fillColor(ORANGE).fontSize(8).font('Helvetica-Bold')
       .text('GROCERIES, SUPPLIES & CREW CHANGE', MARGIN + 10, MARGIN + 30);
    doc.fillColor('#a8c86a').fontSize(7).font('Helvetica')
       .text('25 Dagget Hollow · Grafton, IL 62037 · Mile Marker 218 · (618) 556-0290 · GraftonTowboatServices@gmail.com',
         MARGIN + 10, MARGIN + 42);

    // Order number top-right
    doc.fillColor(ORANGE).fontSize(14).font('Helvetica-Bold')
       .text(order.order_number, MARGIN, MARGIN + 10, { align: 'right', width: CONTENT_W });
    doc.fillColor('#cccccc').fontSize(7).font('Helvetica')
       .text(`Date: ${formatDate(order.created_at)}  ·  Status: ${order.status.replace('_', ' ').toUpperCase()}  ·  Items: ${itemCount}`,
         MARGIN, MARGIN + 28, { align: 'right', width: CONTENT_W });

    let y = MARGIN + 68;

    // ── VESSEL INFO BOX ───────────────────────────────────────
    doc.rect(MARGIN, y, CONTENT_W, 52).fill('#f0f7a0');
    doc.rect(MARGIN, y, 4, 52).fill(DARK_GREEN);
    doc.fillColor(DARK_GREEN).fontSize(7).font('Helvetica-Bold')
       .text('VESSEL & CONTACT INFORMATION', MARGIN + 10, y + 6, { characterSpacing: 0.5 });
    y += 18;

    const col = CONTENT_W / 3;
    const fields: [string, string][] = [
      ['COMPANY / VESSEL', order.company_name],
      ['CONTACT',          order.contact_name],
      ['PHONE',            order.phone],
    ];
    fields.forEach(([label, value], i) => {
      const x = MARGIN + 10 + i * col;
      doc.fillColor(GRAY).fontSize(7).font('Helvetica').text(label, x, y);
      doc.fillColor(DARK_GREEN).fontSize(11).font('Helvetica-Bold').text(value, x, y + 9, { width: col - 8 });
    });

    y += 32;
    if (order.po_number || order.eta) {
      y += 4;
      if (order.po_number) {
        doc.fillColor(GRAY).fontSize(7).font('Helvetica').text('PO NUMBER', MARGIN + 10, y);
        doc.fillColor(DARK_GREEN).fontSize(10).font('Helvetica-Bold').text(order.po_number, MARGIN + 10, y + 9);
      }
      if (order.eta) {
        doc.fillColor(GRAY).fontSize(7).font('Helvetica').text('VESSEL ETA', MARGIN + 10 + col, y);
        doc.fillColor(ORANGE).fontSize(10).font('Helvetica-Bold').text(order.eta, MARGIN + 10 + col, y + 9);
      }
      y += 22;
    }

    y += 8;

    // ── SPECIAL INSTRUCTIONS ─────────────────────────────────
    if (order.notes) {
      doc.rect(MARGIN, y, CONTENT_W, 1).fill('#E8640A');
      y += 5;
      doc.rect(MARGIN, y, CONTENT_W, 28).fill('#fff8ec');
      doc.fillColor(ORANGE).fontSize(7).font('Helvetica-Bold')
         .text('SPECIAL INSTRUCTIONS', MARGIN + 8, y + 4, { characterSpacing: 0.5 });
      doc.fillColor('#444444').fontSize(9).font('Helvetica')
         .text(order.notes, MARGIN + 8, y + 14, { width: CONTENT_W - 16 });
      y += 34;
    }

    y += 4;

    // ── ITEMS TABLE HEADER ────────────────────────────────────
    doc.fillColor(DARK_GREEN).fontSize(7).font('Helvetica-Bold')
       .text(`ORDER ITEMS — ${itemCount} items`, MARGIN, y, { characterSpacing: 0.5 });
    y += 10;

    // Column layout: Item# | Description | Pack | UOM | Qty | Unit Price | Total
    const cols = {
      upc:   { x: MARGIN,            w: 62 },
      desc:  { x: MARGIN + 64,       w: 170 },
      pack:  { x: MARGIN + 236,      w: 60 },
      uom:   { x: MARGIN + 298,      w: 38 },
      qty:   { x: MARGIN + 338,      w: 30 },
      unit:  { x: MARGIN + 370,      w: 60 },
      total: { x: MARGIN + 432,      w: 60 },
    };

    // Header row
    doc.rect(MARGIN, y, CONTENT_W, 16).fill(DARK_GREEN);
    const headers: [keyof typeof cols, string][] = [
      ['upc',   'ITEM #'],
      ['desc',  'DESCRIPTION'],
      ['pack',  'PACK'],
      ['uom',   'UOM'],
      ['qty',   'QTY'],
      ['unit',  'UNIT PRICE'],
      ['total', 'TOTAL'],
    ];
    headers.forEach(([col, label]) => {
      const align = ['qty','unit','total'].includes(col) ? 'right' : 'left';
      doc.fillColor(LIME).fontSize(7).font('Helvetica-Bold')
         .text(label, cols[col].x + 3, y + 5, { width: cols[col].w - 6, align });
    });
    y += 16;

    // Group items by category
    const grouped = order.items.reduce((acc, item) => {
      const cat = item.category || 'General';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {} as Record<string, typeof order.items>);

    let rowBg = false;
    Object.entries(grouped).forEach(([cat, items]) => {
      // Category row
      doc.rect(MARGIN, y, CONTENT_W, 12).fill(LIME);
      doc.fillColor(DARK_GREEN).fontSize(7).font('Helvetica-Bold')
         .text(cat.toUpperCase(), MARGIN + 4, y + 3, { characterSpacing: 0.8 });
      y += 12;

      items.forEach(item => {
        // Check for page break
        if (y > 700) {
          doc.addPage();
          y = MARGIN;
        }

        const bg = rowBg ? '#f8f9fa' : '#ffffff';
        doc.rect(MARGIN, y, CONTENT_W, 16).fill(bg);
        rowBg = !rowBg;

        doc.fillColor(GRAY).fontSize(8).font('Helvetica')
           .text(item.upc || '—', cols.upc.x + 3, y + 4, { width: cols.upc.w - 6 });
        doc.fillColor('#222222').fontSize(8).font('Helvetica')
           .text(item.description, cols.desc.x + 3, y + 4, { width: cols.desc.w - 6 });
        doc.fillColor(GRAY).fontSize(8).font('Helvetica')
           .text(item.pkg_size || '—', cols.pack.x + 3, y + 4, { width: cols.pack.w - 6 });
        doc.fillColor(GRAY).fontSize(8).font('Helvetica')
           .text(item.uom || '—', cols.uom.x + 3, y + 4, { width: cols.uom.w - 6, align: 'center' });
        doc.fillColor(DARK_GREEN).fontSize(9).font('Helvetica-Bold')
           .text(String(item.quantity), cols.qty.x + 3, y + 4, { width: cols.qty.w - 6, align: 'right' });
        doc.fillColor(GRAY).fontSize(8).font('Helvetica')
           .text(formatCurrency(item.unit_price), cols.unit.x + 3, y + 4, { width: cols.unit.w - 6, align: 'right' });
        doc.fillColor(DARK_GREEN).fontSize(9).font('Helvetica-Bold')
           .text(formatCurrency(item.line_total), cols.total.x + 3, y + 4, { width: cols.total.w - 6, align: 'right' });

        // Bottom border
        doc.moveTo(MARGIN, y + 16).lineTo(MARGIN + CONTENT_W, y + 16).strokeColor('#eeeeee').lineWidth(0.5).stroke();
        y += 16;
      });
    });

    y += 4;

    // ── TOTAL ROW ─────────────────────────────────────────────
    if (y > 680) { doc.addPage(); y = MARGIN; }
    const totalRowX = MARGIN + CONTENT_W * 0.55;
    const totalRowW = CONTENT_W * 0.45;
    doc.rect(totalRowX, y, totalRowW, 26).fill(LIME);
    doc.fillColor(DARK_GREEN).fontSize(12).font('Helvetica-Bold')
       .text(`TOTAL  ${formatCurrency(order.subtotal)}`, totalRowX + 8, y + 7,
         { width: totalRowW - 16, align: 'right' });
    y += 34;

    // ── SINCLAIR FOODS BOX ────────────────────────────────────
    if (y > 680) { doc.addPage(); y = MARGIN; }
    doc.rect(MARGIN, y, CONTENT_W, 48).fill('#f0f7f0').stroke(DARK_GREEN);
    doc.fillColor(DARK_GREEN).fontSize(8).font('Helvetica-Bold')
       .text('FOR SINCLAIR FOODS — Jerseyville, IL · (618) 498-6856 · sinclairfoods@jerseyville-il.net',
         MARGIN + 10, y + 8, { width: CONTENT_W - 20 });
    doc.fillColor('#444444').fontSize(8).font('Helvetica')
       .text('Please prepare the items above for delivery to the vessel listed. This order was placed through the Grafton Towboat Services online ordering system.',
         MARGIN + 10, y + 22, { width: CONTENT_W - 20 });
    y += 56;

    // ── FOOTER ────────────────────────────────────────────────
    const footerY = doc.page.height - MARGIN - 18;
    doc.moveTo(MARGIN, footerY).lineTo(MARGIN + CONTENT_W, footerY).strokeColor('#eeeeee').lineWidth(1).stroke();
    doc.fillColor(LIGHT_GRAY).fontSize(7).font('Helvetica')
       .text(
         `Grafton Towboat Services · 25 Dagget Hollow, Grafton, IL 62037 · Mile Marker 218 · ${order.order_number} · Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
         MARGIN, footerY + 6, { align: 'center', width: CONTENT_W }
       );

    doc.end();
  });
}
