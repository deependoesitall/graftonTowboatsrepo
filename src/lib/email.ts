// src/lib/email.ts
import { Resend } from 'resend';
import { Order } from '@/types';
import { formatCurrency, formatDate } from './utils';
import { generateOrderPdfBuffer } from './pdf-attachment';

// Lazily construct the Resend client so importing this module (e.g. during
// `next build` page-data collection) doesn't require RESEND_API_KEY to be set.
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export interface EmailTemplateConfig {
  subject_template?: string;
  header_tagline?: string;
  intro_message?: string;
  footer_text?: string;
  button_text?: string;
  button_url?: string;
}

const DEFAULT_TEMPLATE: Required<EmailTemplateConfig> = {
  subject_template: '🚢 New Order #{order_number} — {company_name} ({order_total})',
  header_tagline: 'New Order Received',
  intro_message: '',
  footer_text: 'Grafton Towboat Services · Grafton, IL 62037 · (618) 556-0290',
  button_text: 'Order Dashboard',
  button_url: '/admin/orders',
};

function applyTemplateVars(text: string, order: Order, appUrl: string): string {
  const itemCount = order.items.filter(i => i.item_type !== 'service').reduce((s, i) => s + i.quantity, 0);
  return text
    .replaceAll('{order_number}', order.order_number)
    .replaceAll('{company_name}', order.company_name)
    .replaceAll('{contact_name}', order.contact_name)
    .replaceAll('{phone}', order.phone || '')
    .replaceAll('{po_number}', order.po_number || '')
    .replaceAll('{eta}', order.eta || '')
    .replaceAll('{order_total}', formatCurrency(order.subtotal))
    .replaceAll('{item_count}', String(itemCount))
    .replaceAll('{order_date}', formatDate(order.created_at))
    .replaceAll('{app_url}', appUrl);
}

function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('*')) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  return 'http://localhost:3000';
}

// ─────────────────────────────────────────────────────────────
// HTML email builder (used for both business & customer emails)
// ─────────────────────────────────────────────────────────────

export function buildOrderEmailHtml(
  order: Order,
  opts: {
    tagline: string;
    intro?: string;
    buttonText: string;
    buttonUrl: string;
    footerText: string;
    showSinclairNote?: boolean;
  }
): string {
  const groceryItems  = order.items.filter(i => i.item_type !== 'service');
  const serviceItems  = order.items.filter(i => i.item_type === 'service');
  const itemCount     = groceryItems.reduce((s, i) => s + i.quantity, 0);
  const ext           = order.extended_info || {};

  const codItems = groceryItems.filter(i => i.paid_by === 'cod');
  const codSubtotal = codItems.reduce((s, i) => s + Number(i.line_total), 0);
  // CODs grouped PER CREW MEMBER — each settles their own total at delivery
  const codByName = Array.from(codItems.reduce((acc, i) => {
    const name = (i.cod_name || '').trim() || 'Crew member';
    if (!acc.has(name)) acc.set(name, [] as typeof codItems);
    acc.get(name)!.push(i);
    return acc;
  }, new Map<string, typeof codItems>()).entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const discounts = order.discounts || [];
  const discountTotal = Number(order.discount_total) || 0;
  const codMethodLabel = order.cod_payment_method === 'credit_card' ? 'Credit Card — call to collect'
    : order.cod_payment_method === 'venmo' ? 'Venmo'
    : order.cod_payment_method === 'cash' ? 'Cash' : null;

  const itemRows = groceryItems.map(item => `
    <tr style="border-bottom:1px solid #f0f0f0;">
      <td style="padding:8px 10px;font-size:11px;color:#888;">${item.upc || '—'}</td>
      <td style="padding:8px 10px;font-size:13px;color:#1E3D1E;font-weight:600;">${item.description}${
        item.paid_by === 'cod'
          ? `<span style="display:inline-block;margin-left:6px;font-size:9px;font-weight:800;color:#9333ea;background:#faf5ff;border:1px solid #9333ea;border-radius:3px;padding:1px 4px;text-transform:uppercase;">COD${item.cod_name ? ` · ${item.cod_name}` : ''}</span>`
          : ''
      }</td>
      <td style="padding:8px 10px;font-size:12px;color:#666;text-align:center;">${item.pkg_size || '—'}</td>
      <td style="padding:8px 10px;font-size:13px;font-weight:800;color:#1E3D1E;text-align:center;">${item.quantity}</td>
      <td style="padding:8px 10px;font-size:12px;text-align:right;">${formatCurrency(item.unit_price)}</td>
      <td style="padding:8px 10px;font-size:13px;font-weight:700;text-align:right;">${formatCurrency(item.line_total)}</td>
    </tr>`).join('');

  const sinclairNote = opts.showSinclairNote
    ? `<div style="background:#f0f7f0;border:1px solid #1E3D1E;padding:12px 16px;border-radius:4px;margin:16px 0;">
        <div style="font-size:9px;font-weight:800;color:#1E3D1E;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Fulfilled by Sinclair Foods</div>
        <div style="font-size:11px;color:#444;">Jerseyville, IL · (618) 498-6856 · sinclairfoods@jerseyville-il.net</div>
       </div>`
    : '';

  const deliveryMethodLabel = order.delivery_method === 'boat' ? 'Boat Delivery'
    : order.delivery_method === 'van' ? 'Van Delivery' : null;
  const approachLabel = order.approach_side
    ? order.approach_side.charAt(0).toUpperCase() + order.approach_side.slice(1)
    : null;

  const serviceSection = serviceItems.length > 0 ? `
    <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1E3D1E;margin-bottom:6px;margin-top:20px;">
      Additional Services
    </div>
    <table width="100%" style="border-collapse:collapse;font-size:12px;margin-bottom:16px;border:1px solid #ddd;border-radius:4px;">
      ${serviceItems.map(item => {
        const d = (item.service_details || {}) as Record<string, string>;
        const details = item.service_type === 'parts_pickup'
          ? [d.pickup_location && `Pickup: ${d.pickup_location}`, d.order_number && `Order #${d.order_number}`, d.contact_name && `Contact: ${d.contact_name}`, d.contact_phone && d.contact_phone].filter(Boolean).join(' · ')
          : item.service_type === 'other_pickup'
          ? [d.url && `Link: ${d.url}`, d.notes && d.notes, 'Handled by Sinclair’s'].filter(Boolean).join(' · ')
          : [d.description && `Item: ${d.description}`, d.origin && `From: ${d.origin}`, d.contact_name && `Contact: ${d.contact_name}`, d.contact_phone && d.contact_phone].filter(Boolean).join(' · ');
        return `<tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px;font-size:13px;font-weight:700;color:#1E3D1E;width:35%;">${item.description}</td>
          <td style="padding:10px;font-size:12px;color:#555;">${details}</td>
        </tr>`;
      }).join('')}
    </table>` : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:24px auto;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">

  <!-- Header -->
  <div style="background:#1E3D1E;padding:24px 28px;">
    <div style="font-size:20px;font-weight:900;color:#D9E84A;text-transform:uppercase;letter-spacing:-0.5px;">
      Grafton Towboat Services
    </div>
    <div style="font-size:11px;color:#a8c86a;margin-top:3px;">${opts.tagline} — ${order.order_number}</div>
  </div>

  <!-- Order number banner -->
  <div style="background:#D9E84A;padding:10px 28px;">
    <span style="font-size:13px;font-weight:800;color:#1E3D1E;text-transform:uppercase;letter-spacing:0.5px;">
      ${order.order_number}
    </span>
    <span style="font-size:12px;color:#1E3D1E;margin-left:16px;">${formatDate(order.created_at)} · ${itemCount} items · ${formatCurrency(order.subtotal)}</span>
  </div>

  <div style="padding:24px 28px;">

    ${opts.intro ? `<div style="font-size:13px;color:#333;line-height:1.6;margin-bottom:18px;">${opts.intro}</div>` : ''}

    <!-- Vessel & billing info -->
    <table width="100%" style="background:#f8fde8;border-left:3px solid #1E3D1E;padding:14px;border-radius:0 4px 4px 0;margin-bottom:16px;border-spacing:0;">
      <tr>
        <td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">Company</div>
          <div style="font-size:14px;font-weight:800;color:#1E3D1E;">${order.company_name}</div></td>
        <td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">Billing Contact</div>
          <div style="font-size:14px;font-weight:800;color:#1E3D1E;">${order.contact_name}</div></td>
        <td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">Phone</div>
          <div style="font-size:14px;font-weight:800;color:#1E3D1E;">${order.phone}</div></td>
      </tr>
      ${order.po_number || order.eta ? `<tr>
        ${order.po_number ? `<td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">PO Number</div><div style="font-size:13px;font-weight:600;">${order.po_number}</div></td>` : '<td></td>'}
        ${order.eta ? `<td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">ETA</div><div style="font-size:13px;font-weight:700;color:#E8640A;">${order.eta}</div></td>` : '<td></td>'}
        <td></td>
      </tr>` : ''}
    </table>

    <!-- Vessel details (if provided) -->
    ${(order.vessel_name || order.captain_name) ? `
    <table width="100%" style="background:#f8fde8;border-left:3px solid #1E3D1E;padding:14px;border-radius:0 4px 4px 0;margin-bottom:16px;border-spacing:0;">
      <tr>
        ${order.vessel_name ? `<td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">Vessel Name</div><div style="font-size:14px;font-weight:800;color:#1E3D1E;">${order.vessel_name}${order.vessel_type ? ` <span style="font-size:11px;font-weight:normal;">(${order.vessel_type})</span>` : ''}</div></td>` : '<td></td>'}
        ${order.captain_name ? `<td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">Captain</div><div style="font-size:14px;font-weight:800;color:#1E3D1E;">${order.captain_name}</div></td>` : '<td></td>'}
        ${order.captain_phone ? `<td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">Captain Phone</div><div style="font-size:13px;font-weight:700;color:#1E3D1E;">${order.captain_phone}</div></td>` : '<td></td>'}
      </tr>
      ${ext.order_contact_name ? `<tr>
        <td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">Order Contact</div><div style="font-size:13px;font-weight:600;">${ext.order_contact_name}${ext.order_contact_title ? ` (${ext.order_contact_title})` : ''}</div></td>
        ${ext.order_contact_phone ? `<td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">Contact Phone</div><div style="font-size:13px;font-weight:600;">${ext.order_contact_phone}</div></td>` : '<td></td>'}
        <td></td>
      </tr>` : ''}
    </table>` : ''}

    <!-- Delivery info (if provided) -->
    ${(order.terminal_name || order.arrival_date) ? `
    <div style="background:#fff8f0;border-left:3px solid #E8640A;padding:14px;border-radius:0 4px 4px 0;margin-bottom:16px;">
      <table width="100%" style="border-spacing:0;">
        <tr>
          ${order.terminal_name ? `<td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">Deliver To</div><div style="font-size:15px;font-weight:900;color:#E8640A;">${order.terminal_name}</div></td>` : '<td></td>'}
          ${order.arrival_date  ? `<td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">Arrival Date</div><div style="font-size:15px;font-weight:900;color:#E8640A;">${order.arrival_date}</div></td>` : '<td></td>'}
          ${order.arrival_time  ? `<td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">Arrival Time</div><div style="font-size:15px;font-weight:900;color:#E8640A;">${order.arrival_time}</div></td>` : '<td></td>'}
        </tr>
        ${(deliveryMethodLabel || order.crew_change !== 'no') ? `<tr>
          ${deliveryMethodLabel ? `<td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">Method</div><div style="font-size:13px;font-weight:700;">${deliveryMethodLabel}${approachLabel ? ` · ${approachLabel} side` : ''}</div></td>` : '<td></td>'}
          ${order.vhf_channel ? `<td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">VHF</div><div style="font-size:13px;font-weight:600;">${order.vhf_channel}</div></td>` : '<td></td>'}
          ${order.crew_change === 'yes'
            ? `<td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">Crew Change</div><div style="font-size:13px;font-weight:700;color:#E8640A;">YES — ${order.crew_arriving ?? 0} in / ${order.crew_departing ?? 0} out</div></td>`
            : order.crew_change === 'maybe'
            ? `<td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">Crew Change</div><div style="font-size:13px;font-weight:700;color:#B45309;">MAYBE${order.crew_change_notes ? ` — ${order.crew_change_notes}` : ''}</div></td>`
            : '<td></td>'}
        </tr>` : ''}
      </table>
    </div>` : ''}

    ${order.notes ? `<div style="background:#fff8ec;border:1px solid #E8640A;padding:10px 14px;border-radius:4px;margin-bottom:20px;">
      <div style="font-size:9px;font-weight:800;color:#E8640A;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Special Instructions</div>
      <div style="font-size:12px;color:#444;">${order.notes}</div>
    </div>` : ''}

    ${codItems.length > 0 ? `<div style="background:#faf5ff;border:1px solid #9333ea;padding:10px 14px;border-radius:4px;margin-bottom:20px;">
      <div style="font-size:9px;font-weight:800;color:#9333ea;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">COD Items — collect ${formatCurrency(codSubtotal)} on delivery (not invoiced) · separated by crew member</div>
      ${codByName.map(([name, list]) => {
        const personTotal = list.reduce((s, i) => s + Number(i.line_total), 0);
        return `<div style="margin-bottom:6px;">
          <div style="font-size:12px;font-weight:800;color:#6b21a8;">${name} — ${formatCurrency(personTotal)}</div>
          ${list.map(i => `<div style="font-size:11px;color:#444;padding-left:10px;">${i.quantity}× ${i.description} · ${formatCurrency(Number(i.line_total))}</div>`).join('')}
        </div>`;
      }).join('')}
      ${codMethodLabel ? `<div style="font-size:11px;color:#6b21a8;margin-top:4px;border-top:1px solid #e9d5ff;padding-top:4px;"><strong>Payment:</strong> ${codMethodLabel}${
        order.cod_payment_method === 'credit_card'
          ? ` — call ${order.cod_preferred_phone || 'the crew member'}${order.cod_contact_time ? ` (best time: ${order.cod_contact_time})` : ''}`
          : ''
      }</div>` : ''}
    </div>` : ''}

    ${ext.personal_cod_notes ? `<div style="background:#faf5ff;border:1px solid #9333ea;padding:10px 14px;border-radius:4px;margin-bottom:20px;">
      <div style="font-size:9px;font-weight:800;color:#9333ea;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Personal / COD Items — collect payment on delivery</div>
      <div style="font-size:12px;color:#444;">${ext.personal_cod_notes}</div>
    </div>` : ''}

    <!-- Items table -->
    ${groceryItems.length > 0 ? `
    <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1E3D1E;margin-bottom:6px;">
      Grocery Items (${itemCount} items)
    </div>
    <table width="100%" style="border-collapse:collapse;font-size:12px;margin-bottom:16px;">
      <thead>
        <tr style="background:#1E3D1E;">
          <th style="padding:8px 10px;text-align:left;color:#D9E84A;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;">Item #</th>
          <th style="padding:8px 10px;text-align:left;color:#D9E84A;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;">Item</th>
          <th style="padding:8px 10px;text-align:center;color:#D9E84A;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;">Pack</th>
          <th style="padding:8px 10px;text-align:center;color:#D9E84A;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;">Qty</th>
          <th style="padding:8px 10px;text-align:right;color:#D9E84A;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;">Unit</th>
          <th style="padding:8px 10px;text-align:right;color:#D9E84A;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        ${discounts.map(d => `<tr style="background:#f0fdf4;">
          <td colspan="5" style="padding:6px 10px;font-size:11px;font-weight:700;color:#15803d;">🏷 ${d.name}${d.description ? ` <span style="font-weight:400;color:#4d7c5f;">— ${d.description}</span>` : ''}</td>
          <td style="padding:6px 10px;text-align:right;font-size:12px;font-weight:800;color:#15803d;">−${formatCurrency(Number(d.amount))}</td>
        </tr>`).join('')}
        <tr style="background:#D9E84A;">
          <td colspan="5" style="padding:10px;font-size:14px;font-weight:900;color:#1E3D1E;text-transform:uppercase;">ESTIMATED TOTAL</td>
          <td style="padding:10px;text-align:right;font-size:16px;font-weight:900;color:#1E3D1E;">${formatCurrency(order.subtotal)}</td>
        </tr>
        ${discountTotal > 0 ? `<tr style="background:#dcfce7;">
          <td colspan="5" style="padding:8px 10px;font-size:12px;font-weight:900;color:#15803d;text-transform:uppercase;">After estimated coupon savings (−${formatCurrency(discountTotal)})</td>
          <td style="padding:8px 10px;text-align:right;font-size:14px;font-weight:900;color:#15803d;">${formatCurrency(Math.max(0, Number(order.subtotal) - discountTotal))}</td>
        </tr>` : ''}
      </tfoot>
    </table>` : ''}

    ${serviceSection}

    ${sinclairNote}

    <div style="text-align:center;padding:14px;background:#f8f9fa;border-radius:4px;">
      <a href="${opts.buttonUrl}" style="background:#1E3D1E;color:#D9E84A;padding:10px 24px;border-radius:24px;text-decoration:none;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">
        ${opts.buttonText} →
      </a>
    </div>
  </div>

  <div style="background:#1E3D1E;padding:14px 28px;text-align:center;">
    <div style="color:#a8c86a;font-size:11px;">${opts.footerText}</div>
  </div>
</div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function parseCcList(raw: string): string[] {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return raw.split(',').map(e => e.trim()).filter(e => EMAIL_RE.test(e));
}

// ─────────────────────────────────────────────────────────────
// Order Received — sent immediately when customer places order
// Goes to: business (+ CC list) + customer
// ─────────────────────────────────────────────────────────────
export async function sendOrderReceivedEmail(
  order: Order,
  opts: {
    businessEmail?: string;
    ccEmailRaw?: string;
    template?: EmailTemplateConfig;
  } = {}
) {
  const appUrl     = getAppUrl();
  const fromEmail  = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const toEmail    = opts.businessEmail || process.env.BUSINESS_EMAIL || 'GraftonTowboatServices@gmail.com';
  const ccList     = parseCcList(opts.ccEmailRaw ?? process.env.ORDER_EMAIL_CC ?? '');
  const pdfBuffer  = await generateOrderPdfBuffer(order);
  const pdfAttachment = [{ filename: `order-${order.order_number}.pdf`, content: pdfBuffer }];

  // 1) Business notification email
  const businessHtml = buildOrderEmailHtml(order, {
    tagline:         'New Order Received',
    intro:           opts.template?.intro_message
                       ? applyTemplateVars(opts.template.intro_message, order, appUrl)
                       : '',
    buttonText:      opts.template?.button_text
                       ? applyTemplateVars(opts.template.button_text, order, appUrl)
                       : 'Order Dashboard',
    buttonUrl:       (() => {
                       const raw = opts.template?.button_url
                         ? applyTemplateVars(opts.template.button_url, order, appUrl)
                         : `${appUrl}/admin/orders`;
                       return raw.startsWith('http') ? raw : `${appUrl}${raw.startsWith('/') ? '' : '/'}${raw}`;
                     })(),
    footerText:      opts.template?.footer_text
                       ? applyTemplateVars(opts.template.footer_text, order, appUrl)
                       : 'Grafton Towboat Services · Grafton, IL 62037 · (618) 556-0290',
    showSinclairNote: true,
  });
  const businessSubject = opts.template?.subject_template
    ? applyTemplateVars(opts.template.subject_template, order, appUrl)
    : `🚢 New Order #${order.order_number} — ${order.company_name} (${formatCurrency(order.subtotal)})`;

  const businessResult = await getResend().emails.send({
    from:        fromEmail,
    to:          [toEmail],
    ...(ccList.length > 0 ? { cc: ccList } : {}),
    replyTo:     toEmail,
    subject:     businessSubject,
    html:        businessHtml,
    attachments: pdfAttachment,
  });
  if (businessResult.error) {
    console.error('Resend business email error:', businessResult.error);
    throw new Error(businessResult.error.message || JSON.stringify(businessResult.error));
  }

  // 2) Customer confirmation email (only if we have their email)
  if (order.customer_email) {
    const customerHtml = buildOrderEmailHtml(order, {
      tagline:    'Order Confirmation',
      intro:      `Thank you for your order, ${order.contact_name}! We've received it and will begin preparing your delivery. A copy of your order is attached to this email.`,
      buttonText: 'Questions? Contact Us',
      buttonUrl:  `mailto:GraftonTowboatServices@gmail.com`,
      footerText: 'Grafton Towboat Services · Grafton, IL 62037 · (618) 556-0290 · GraftonTowboatServices@gmail.com',
    });
    const customerResult = await getResend().emails.send({
      from:        fromEmail,
      to:          [order.customer_email],
      replyTo:     toEmail,
      subject:     `✅ Order Confirmed — ${order.order_number} — Grafton Towboat Services`,
      html:        customerHtml,
      attachments: pdfAttachment,
    });
    if (customerResult.error) {
      console.error('Customer confirmation email error:', customerResult.error);
    }
  }

  return businessResult;
}

// ─────────────────────────────────────────────────────────────
// Order Shopped — sent when staff marks order as fulfilled
// Goes to: customer + business (CC)
// ─────────────────────────────────────────────────────────────
export async function sendOrderShoppedEmail(
  order: Order,
  opts: {
    businessEmail?: string;
    ccEmailRaw?: string;
  } = {}
) {
  const appUrl     = getAppUrl();
  const fromEmail  = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const toEmail    = opts.businessEmail || process.env.BUSINESS_EMAIL || 'GraftonTowboatServices@gmail.com';
  const ccList     = parseCcList(opts.ccEmailRaw ?? process.env.ORDER_EMAIL_CC ?? '');
  const pdfBuffer2 = await generateOrderPdfBuffer(order);
  const pdfAttachment2 = [{ filename: `order-${order.order_number}-fulfilled.pdf`, content: pdfBuffer2 }];

  // Orders with no grocery items (crew change / services only) were never
  // "shopped" — use neutral fulfillment language for those.
  const hasGroceryItems = order.items.some(i => i.item_type !== 'service');
  const intro = hasGroceryItems
    ? `Great news, ${order.contact_name}! Your order has been shopped and is ready. Please find your final order summary attached.`
    : `Good news, ${order.contact_name}! Your request has been fulfilled. Please find your final order summary attached.`;

  const shoppedHtml = buildOrderEmailHtml(order, {
    tagline:    'Order Fulfilled',
    intro,
    buttonText: 'Questions? Contact Us',
    buttonUrl:  `mailto:GraftonTowboatServices@gmail.com`,
    footerText: 'Grafton Towboat Services · Grafton, IL 62037 · (618) 556-0290 · GraftonTowboatServices@gmail.com',
  });

  const recipients = order.customer_email ? [order.customer_email] : [toEmail];
  const cc = order.customer_email
    ? [toEmail, ...ccList].filter(Boolean)
    : ccList;

  const result = await getResend().emails.send({
    from:        fromEmail,
    to:          recipients,
    ...(cc.length > 0 ? { cc } : {}),
    replyTo:     toEmail,
    subject:     hasGroceryItems
                   ? `📦 Your Order is Ready — ${order.order_number} — Grafton Towboat Services`
                   : `✅ Your Request is Fulfilled — ${order.order_number} — Grafton Towboat Services`,
    html:        shoppedHtml,
    attachments: pdfAttachment2,
  });

  if (result.error) {
    console.error('Resend shopped email error:', result.error);
    throw new Error(result.error.message || JSON.stringify(result.error));
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// Legacy re-export — keeps admin email-preview endpoint working
// ─────────────────────────────────────────────────────────────
export function buildOrderEmailHtmlLegacy(order: Order, templateRaw?: EmailTemplateConfig): string {
  const appUrl = getAppUrl();
  const t = { ...DEFAULT_TEMPLATE, ...(templateRaw || {}) };
  const buttonUrlRaw = applyTemplateVars(t.button_url, order, appUrl);
  const buttonUrl = buttonUrlRaw.startsWith('http') ? buttonUrlRaw : `${appUrl}${buttonUrlRaw.startsWith('/') ? '' : '/'}${buttonUrlRaw}`;

  return buildOrderEmailHtml(order, {
    tagline:          applyTemplateVars(t.header_tagline, order, appUrl),
    intro:            applyTemplateVars(t.intro_message, order, appUrl),
    buttonText:       applyTemplateVars(t.button_text, order, appUrl),
    buttonUrl,
    footerText:       applyTemplateVars(t.footer_text, order, appUrl),
    showSinclairNote: true,
  });
}
