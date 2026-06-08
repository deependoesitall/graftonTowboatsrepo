// src/lib/email.ts
import { Resend } from 'resend';
import { Order } from '@/types';
import { formatCurrency, formatDate } from './utils';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOrderEmail(order: Order) {
  const itemRows = order.items
    .map(
      item =>
        `<tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px 12px;color:#333;">${item.description}</td>
          <td style="padding:8px 12px;color:#555;font-size:13px;">${item.pkg_size || '—'}</td>
          <td style="padding:8px 12px;text-align:center;font-weight:600;">${item.quantity}</td>
          <td style="padding:8px 12px;text-align:right;">${formatCurrency(item.unit_price)}</td>
          <td style="padding:8px 12px;text-align:right;font-weight:600;">${formatCurrency(item.line_total)}</td>
        </tr>`
    )
    .join('');

  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const businessEmail = process.env.BUSINESS_EMAIL || '';
  const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const ccEmail = process.env.ORDER_EMAIL_CC;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F8FC;font-family:Georgia,serif;">
  <div style="max-width:680px;margin:32px auto;background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1);">
    <div style="background:#1B3A5C;padding:28px 32px;">
      <div style="color:#fff;font-size:22px;font-weight:bold;">Grafton Towboat Services</div>
      <div style="color:#9BB8D4;font-size:13px;margin-top:4px;">New Order Received — ${order.order_number}</div>
    </div>
    <div style="padding:28px 32px;">
      <div style="background:#F0F4F8;border-left:4px solid #1B3A5C;padding:16px 20px;border-radius:0 4px 4px 0;margin-bottom:24px;">
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Vessel &amp; Contact</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="width:50%;padding-bottom:8px;">
              <div style="font-size:11px;color:#888;">Company / Vessel</div>
              <div style="font-size:15px;font-weight:bold;color:#1B3A5C;">${order.company_name}</div>
            </td>
            <td style="width:50%;padding-bottom:8px;">
              <div style="font-size:11px;color:#888;">Contact Person</div>
              <div style="font-size:15px;font-weight:bold;color:#1B3A5C;">${order.contact_name}</div>
            </td>
          </tr>
          <tr>
            <td>
              <div style="font-size:11px;color:#888;">Phone</div>
              <div style="font-size:14px;color:#333;">${order.phone}</div>
            </td>
            ${order.po_number ? `<td><div style="font-size:11px;color:#888;">PO Number</div><div style="font-size:14px;color:#333;">${order.po_number}</div></td>` : '<td></td>'}
          </tr>
          ${order.eta ? `<tr><td colspan="2" style="padding-top:8px;"><div style="font-size:11px;color:#888;">Vessel ETA</div><div style="font-size:14px;color:#C9922A;font-weight:600;">${order.eta}</div></td></tr>` : ''}
        </table>
      </div>

      <div style="margin-bottom:8px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">Order Items (${itemCount} items)</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#1B3A5C;">
            <th style="padding:10px 12px;text-align:left;color:#fff;font-size:12px;">Item</th>
            <th style="padding:10px 12px;text-align:left;color:#fff;font-size:12px;">Pack</th>
            <th style="padding:10px 12px;text-align:center;color:#fff;font-size:12px;">Qty</th>
            <th style="padding:10px 12px;text-align:right;color:#fff;font-size:12px;">Unit</th>
            <th style="padding:10px 12px;text-align:right;color:#fff;font-size:12px;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr style="background:#F5E6C8;border-top:2px solid #C9922A;">
            <td colspan="4" style="padding:12px;font-size:15px;font-weight:bold;color:#1B3A5C;">ORDER TOTAL</td>
            <td style="padding:12px;text-align:right;font-size:18px;font-weight:bold;color:#C9922A;">${formatCurrency(order.subtotal)}</td>
          </tr>
        </tfoot>
      </table>

      ${order.notes ? `
      <div style="margin-top:20px;padding:14px 18px;background:#FFF8EC;border:1px solid #E8A93C;border-radius:4px;">
        <div style="font-size:11px;color:#C9922A;font-weight:bold;text-transform:uppercase;margin-bottom:6px;">Special Instructions</div>
        <div style="font-size:14px;color:#444;line-height:1.5;">${order.notes}</div>
      </div>` : ''}

      ${appUrl ? `
      <div style="margin-top:24px;padding:14px 18px;background:#EBF2FA;border-radius:4px;text-align:center;">
        <div style="font-size:12px;color:#666;margin-bottom:8px;">Manage this order in the admin dashboard:</div>
        <a href="${appUrl}/admin" style="background:#1B3A5C;color:#fff;padding:8px 20px;border-radius:3px;text-decoration:none;font-size:13px;font-weight:600;">View Orders Dashboard →</a>
      </div>` : ''}
    </div>
    <div style="background:#0D1B2A;padding:16px 32px;text-align:center;">
      <div style="color:#6B8DAF;font-size:12px;">Grafton Towboat Services · Grafton, IL 62037</div>
      <div style="color:#4A6882;font-size:11px;margin-top:4px;">(618) 556-0290 · Channel 68</div>
    </div>
  </div>
</body>
</html>`;

  try {
    const result = await resend.emails.send({
      from: fromEmail,
      to: [businessEmail],
      ...(ccEmail ? { cc: [ccEmail] } : {}),
      subject: `🚢 New Order ${order.order_number} — ${order.company_name} (${formatCurrency(order.subtotal)})`,
      html,
    });
    console.log('Email sent:', result);
    return result;
  } catch (err) {
    console.error('Email send error:', err);
    throw err;
  }
}
