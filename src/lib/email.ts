// src/lib/email.ts
import { Resend } from 'resend';
import { Order } from '@/types';
import { formatCurrency, formatDate } from './utils';
import { generateOrderPdfBuffer } from './pdf-attachment';

const resend = new Resend(process.env.RESEND_API_KEY);

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
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
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
  const itemRows = order.items.map(item => `
    <tr style="border-bottom:1px solid #f0f0f0;">
      <td style="padding:8px 10px;font-size:11px;color:#888;">${item.upc || '—'}</td>
      <td style="padding:8px 10px;font-size:13px;color:#1E3D1E;font-weight:600;">${item.description}</td>
      <td style="padding:8px 10px;font-size:12px;color:#666;text-align:center;">${item.pkg_size || '—'}</td>
      <td style="padding:8px 10px;font-size:13px;font-weight:800;color:#1E3D1E;text-align:center;">${item.quantity}</td>
      <td style="padding:8px 10px;font-size:12px;text-align:right;">${formatCurrency(item.unit_price)}</td>
      <td style="padding:8px 10px;font-size:13px;font-weight:700;text-align:right;">${formatCurrency(item.line_total)}</td>
    </tr>`).join('');

  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);

  const sinclairNote = opts.showSinclairNote
    ? `<div style="background:#f0f7f0;border:1px solid #1E3D1E;padding:12px 16px;border-radius:4px;margin:16px 0;">
        <div style="font-size:9px;font-weight:800;color:#1E3D1E;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Fulfilled by Sinclair Foods</div>
        <div style="font-size:11px;color:#444;">Jerseyville, IL · (618) 498-6856 · sinclairfoods@jerseyville-il.net</div>
       </div>`
    : '';

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

    <!-- Vessel info -->
    <table width="100%" style="background:#f8fde8;border-left:3px solid #1E3D1E;padding:14px;border-radius:0 4px 4px 0;margin-bottom:20px;border-spacing:0;">
      <tr>
        <td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">Company / Vessel</div>
        <div style="font-size:14px;font-weight:800;color:#1E3D1E;">${order.company_name}</div></td>
        <td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">Contact</div>
        <div style="font-size:14px;font-weight:800;color:#1E3D1E;">${order.contact_name}</div></td>
        <td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">Phone</div>
        <div style="font-size:14px;font-weight:800;color:#1E3D1E;">${order.phone}</div></td>
      </tr>
      ${order.po_number || order.eta ? `<tr>
        ${order.po_number ? `<td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">PO Number</div><div style="font-size:13px;font-weight:600;">${order.po_number}</div></td>` : '<td></td>'}
        ${order.eta ? `<td style="padding:4px 12px;"><div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1px;">Vessel ETA</div><div style="font-size:13px;font-weight:700;color:#E8640A;">${order.eta}</div></td>` : '<td></td>'}
        <td></td>
      </tr>` : ''}
    </table>

    ${order.notes ? `<div style="background:#fff8ec;border:1px solid #E8640A;padding:10px 14px;border-radius:4px;margin-bottom:20px;">
      <div style="font-size:9px;font-weight:800;color:#E8640A;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Special Instructions</div>
      <div style="font-size:12px;color:#444;">${order.notes}</div>
    </div>` : ''}

    <!-- Items table -->
    <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1E3D1E;margin-bottom:6px;">
      Order Items (${itemCount} items)
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
        <tr style="background:#D9E84A;">
          <td colspan="5" style="padding:10px;font-size:14px;font-weight:900;color:#1E3D1E;text-transform:uppercase;">ORDER TOTAL</td>
          <td style="padding:10px;text-align:right;font-size:16px;font-weight:900;color:#1E3D1E;">${formatCurrency(order.subtotal)}</td>
        </tr>
      </tfoot>
    </table>

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
  const pdfAttachment = [{
    filename: `order-${order.order_number}.pdf`,
    content:  pdfBuffer,
  }];

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

  const businessResult = await resend.emails.send({
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
    const customerResult = await resend.emails.send({
      from:        fromEmail,
      to:          [order.customer_email],
      replyTo:     toEmail,
      subject:     `✅ Order Confirmed — ${order.order_number} — Grafton Towboat Services`,
      html:        customerHtml,
      attachments: pdfAttachment,
    });
    if (customerResult.error) {
      // Log but don't fail order — business already notified
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
  const appUrl    = getAppUrl();
  const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const toEmail   = opts.businessEmail || process.env.BUSINESS_EMAIL || 'GraftonTowboatServices@gmail.com';
  const ccList    = parseCcList(opts.ccEmailRaw ?? process.env.ORDER_EMAIL_CC ?? '');
  const pdfBuffer = await generateOrderPdfBuffer(order);

  const shoppedHtml = buildOrderEmailHtml(order, {
    tagline:    'Order Fulfilled',
    intro:      `Great news, ${order.contact_name}! Your order has been shopped and is ready. Please find your final order summary attached.`,
    buttonText: 'Questions? Contact Us',
    buttonUrl:  `mailto:GraftonTowboatServices@gmail.com`,
    footerText: 'Grafton Towboat Services · Grafton, IL 62037 · (618) 556-0290 · GraftonTowboatServices@gmail.com',
  });

  // Send to customer (primary) + business (CC) so Jennifer has visibility
  const recipients = order.customer_email ? [order.customer_email] : [toEmail];
  const cc = order.customer_email
    ? [toEmail, ...ccList].filter(Boolean)
    : ccList;

  const result = await resend.emails.send({
    from:        fromEmail,
    to:          recipients,
    ...(cc.length > 0 ? { cc } : {}),
    replyTo:     toEmail,
    subject:     `📦 Your Order is Ready — ${order.order_number} — Grafton Towboat Services`,
    html:        shoppedHtml,
    attachments: [{
      filename: `order-${order.order_number}-fulfilled.pdf`,
      content:  pdfBuffer,
    }],
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
    tagline:         applyTemplateVars(t.header_tagline, order, appUrl),
    intro:           applyTemplateVars(t.intro_message, order, appUrl),
    buttonText:      applyTemplateVars(t.button_text, order, appUrl),
    buttonUrl,
    footerText:      applyTemplateVars(t.footer_text, order, appUrl),
    showSinclairNote: true,
  });
}
