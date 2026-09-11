// src/lib/email.ts
import { Resend } from 'resend';
import { Order } from '@/types';
import { formatCurrency, formatDate } from './utils';
import { generateOrderPdfBuffer } from './pdf-attachment';
import { codFeePercent, codFeeLabel, codTotalWithFee, allocateCodTotals } from '@/lib/cod-fee';
import { readCodPayments, codMethodSentence } from '@/lib/cod-payments';

// Lazily construct the Resend client so importing this module (e.g. during
// `next build` page-data collection) doesn't require RESEND_API_KEY to be set.
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

/**
 * THE ADDRESS CUSTOMERS SEE AND REPLY TO.
 *
 * Separate from the internal `to` address on purpose. Two different jobs:
 *
 *   · BUSINESS_EMAIL / the hardcoded Gmail = where order notifications LAND.
 *     Internal. Jen's team inbox. Nobody outside GTS should ever see it.
 *   · PUBLIC_CONTACT_EMAIL = what a captain sees in the From line, the footer
 *     and the "Questions?" button, and what their reply goes to.
 *
 * Until Sept 2026 these were the same value, and the customer-facing one was
 * hardcoded to the Gmail address in three places. A barge line receiving an
 * order confirmation from a gmail.com address is a small thing that reads as
 * a big one when you're deciding whether to trust a new vendor.
 *
 * ⚠️ SEQUENCE MATTERS — DO NOT SET THIS ENV VAR EARLY.
 * Pointing this at orders@graftontowboatservices.com before the domain can
 * actually RECEIVE mail (MX records + a forwarder) sends every customer reply
 * into a black hole. Nothing bounces, nothing errors, the questions just never
 * arrive. Set up receiving first, send a test, THEN set this.
 *
 * The fallback is deliberately the working Gmail, so an unset variable is
 * merely unpolished rather than broken.
 */
const publicContactEmail = () =>
  process.env.PUBLIC_CONTACT_EMAIL || 'GraftonTowboatServices@gmail.com';

/**
 * SINCLAIR'S. They shop the orders, so they need to see one the moment it lands.
 *
 * NEW-ORDER EMAIL ONLY. Not the final/delivery email — that one renders GTS's
 * delivery charge and grand total via `showDelivery`, which is GTS's commercial
 * relationship with the barge line and none of Sinclair's business. The
 * new-order email deliberately omits it, which is what makes this safe to send
 * as-is rather than building a separate template.
 *
 * The COD handling fee IS shown, and that's correct — confirmed by Deepen,
 * Sept 2026: that fee is Sinclair's, not GTS's. I had assumed the opposite and
 * nearly built a stripped-down template to hide it from the people it belongs to.
 *
 * Hardcoded default rather than env-only on purpose: an unset variable would
 * mean Sinclair's silently never hears about an order, and nobody would notice
 * until a boat arrived at an empty dock. Override via env if the addresses
 * change.
 */
const sinclairsOrderEmails = (): string[] =>
  (process.env.SINCLAIRS_ORDER_EMAILS
    || 'sinclairfoods@jerseyville-il.net,dwittman@jerseyville-il.net')
    .split(',').map(s => s.trim()).filter(Boolean);

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

/** Sinclair staff install/origin ? shopping mode lives here, not on apex. */
function shopAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SHOP_URL || 'https://shop.graftontowboatservices.com';
  return raw.replace(/\/$/, '');
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
    /** Final email only — renders the GTS delivery charge + grand total. */
    showDelivery?: boolean;
    /** Documents too large to attach, offered as links instead. Passed down
     *  from sendOrderShoppedEmail when the size budget is hit. */
    linkedDocs?: Array<{ label: string; url: string }>;
  }
): string {
  /** Was this document linked rather than attached? */
  const isLinked = (url?: string | null) =>
    !!url && (opts.linkedDocs ?? []).some(d => d.url === url);
  const groceryItems  = order.items.filter(i => i.item_type !== 'service');
  const serviceItems  = order.items.filter(i => i.item_type === 'service');
  const itemCount     = groceryItems.reduce((s, i) => s + i.quantity, 0);
  const ext           = order.extended_info || {};

  const codItems = groceryItems.filter(i => i.paid_by === 'cod');
  const codSubtotal = codItems.reduce((s, i) => s + Number(i.line_total), 0);
  // Deck lines — company-billed but listed separately from the grocery allowance
  const deckItems = groceryItems.filter(i => i.paid_by === 'deck');
  const deckSubtotal = deckItems.reduce((s, i) => s + Number(i.line_total), 0);
  // CODs grouped PER CREW MEMBER — each settles their own total at delivery
  const codByName = Array.from(codItems.reduce((acc, i) => {
    const name = (i.cod_name || '').trim() || 'Crew member';
    if (!acc.has(name)) acc.set(name, [] as typeof codItems);
    acc.get(name)!.push(i);
    return acc;
  }, new Map<string, typeof codItems>()).entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const discounts = order.discounts || [];
  const discountTotal = Number(order.discount_total) || 0;

  // ── GTS final billing (final email only) ──
  // Groceries are the actual register total when entered, else the estimate.
  // The delivery fee is GTS's own charge; whether groceries are on THIS bill
  // depends on bill_for_groceries (some barge lines pay Sinclair's directly).
  const deliveryFee = Number(order.delivery_fee) || 0;
  const billGroceries = order.bill_for_groceries === true; // default false ? most boats pay Sinclair's directly
  // Company-billed groceries ONLY. orders.subtotal includes COD lines, and
  // CODs are settled personally at delivery — invoicing them would charge the
  // company for a crew member's own purchase. Sinclair's rings CODs separately,
  // so an entered register_total is already COD-free.
  const billableGroceryTotal = groceryItems
    .filter(i => i.paid_by !== 'cod' && i.shopping_status !== 'out_of_stock')
    .reduce((s, i) => s + Number(i.actual_total ?? i.line_total), 0);
  const groceryTotal = order.register_total != null ? Number(order.register_total) : billableGroceryTotal;
  const grandTotal = (billGroceries ? groceryTotal : 0) + deliveryFee;
  const deliveryBox = opts.showDelivery ? `
    <div style="border:2px solid #1E3D1E;border-radius:6px;margin-bottom:18px;overflow:hidden;">
      <div style="background:#1E3D1E;color:#D9E84A;padding:8px 12px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">
        Grafton Towboat Services — Final Charges
      </div>
      <table width="100%" style="border-collapse:collapse;font-size:13px;">
        ${billGroceries ? `<tr>
          <td style="padding:8px 12px;color:#333;">Groceries (Sinclair&apos;s)${order.sinclairs_receipt_url ? ` <span style="color:#4d7c5f;font-size:10px;">— itemized receipt ${isLinked(order.sinclairs_receipt_url) ? 'linked below' : 'attached'}</span>` : ''}</td>
          <td style="padding:8px 12px;text-align:right;font-weight:700;">${formatCurrency(groceryTotal)}</td>
        </tr>` : `<tr>
          <td colspan="2" style="padding:8px 12px;color:#666;font-size:11px;font-style:italic;">Groceries are billed to you directly by Sinclair&apos;s — these charges cover Grafton Towboat Services delivery only.</td>
        </tr>`}
        <tr>
          <td style="padding:8px 12px;color:#333;">Delivery${order.delivery_service_type ? ` — ${order.delivery_service_type}` : ''}</td>
          <td style="padding:8px 12px;text-align:right;font-weight:700;">${formatCurrency(deliveryFee)}</td>
        </tr>
        <tr style="background:#D9E84A;">
          <td style="padding:10px 12px;font-size:14px;font-weight:900;color:#1E3D1E;text-transform:uppercase;">Final Total</td>
          <td style="padding:10px 12px;text-align:right;font-size:16px;font-weight:900;color:#1E3D1E;">${formatCurrency(grandTotal)}</td>
        </tr>
      </table>
      ${/* THIS EMAIL IS NOT THE INVOICE.
           GTS bills through QuickBooks, addressed to the barge line's accounts
           payable — a different document to a different recipient. This goes to
           the BOAT, which needs to know what arrived and what it cost, not to
           pay anything. Saying "Final Total Due" here invited a captain to
           think he'd been billed, or worse, to pay twice. It's a summary; the
           bill follows from the office. */''}
      <div style="padding:9px 12px;background:#f7f9f1;border-top:1px solid #e4e8da;font-size:11px;color:#4d7c5f;line-height:1.6;">
        This is your delivery summary, not an invoice &mdash; nothing to pay from this email.
        Your company is billed monthly through QuickBooks (accounts payable) &mdash; often covering several vessel orders in one statement.
      </div>
      ${/* Spell out the paperwork. Barge-line accounts payable departments hold
           invoices that arrive without their supporting documents — Ingram's
           acknowledgement form states outright that they won't accept a
           supplier invoice without the signed receipt. Listing what's attached
           saves a phone call and a fortnight of Net-30 sitting still. */''}
      ${order.sinclairs_receipt_url || order.ingram_slip_url || order.po_number ? `
      <div style="padding:9px 12px;background:#f7f9f1;border-top:1px solid #e4e8da;font-size:11px;color:#4d7c5f;line-height:1.7;">
        <b style="color:#1E3D1E;">For your records:</b>
        ${order.po_number ? `<br>&bull; Purchase order <b>${order.po_number}</b>` : ''}
        ${order.sinclairs_receipt_url ? (
          isLinked(order.sinclairs_receipt_url)
            // Too large to attach without risking the whole message bouncing at
            // the recipient's mail server. Linked instead — same document.
            ? `<br>&bull; Sinclair&rsquo;s itemized register receipt &mdash; <a href="${order.sinclairs_receipt_url}" style="color:#E8640A;font-weight:700;">download here</a> <span style="color:#8aa294;">(too large to attach)</span>`
            : '<br>&bull; Sinclair&rsquo;s itemized register receipt <span style="color:#8aa294;">(attached)</span>'
        ) : ''}
        ${order.ingram_slip_url ? (
          isLinked(order.ingram_slip_url)
            ? `<br>&bull; Signed delivery log &amp; receipt acknowledgement &mdash; <a href="${order.ingram_slip_url}" style="color:#E8640A;font-weight:700;">download here</a> <span style="color:#8aa294;">(too large to attach)</span>`
            : '<br>&bull; Signed delivery log &amp; receipt acknowledgement <span style="color:#8aa294;">(attached)</span>'
        ) : ''}
      </div>` : ''}
    </div>` : '';
  // Per-person payment. Empty for orders placed before this existed, and the
  // order-level codMethodLabel below is the fallback for exactly those.
  const codPayments   = readCodPayments(ext);
  const codPayByName  = new Map(codPayments.map(p => [p.name, p]));
  // People who owe money ONLY through a linked item have no catalog lines,
  // so they never appear in codByName and would otherwise be invisible to the
  // person collecting payment at the dock.
  const codLinkedOnly = codPayments.filter(p =>
    p.linked_items > 0 && !codByName.some(([name]) => name === p.name));
  // Cent-exact: the rows are guaranteed to sum to the header total.
  const codShares = allocateCodTotals(order, codByName.map(([name, list]) => ({
    name, subtotal: list.reduce((s, i) => s + Number(i.line_total), 0),
  })), codSubtotal);

  const codMethodLabel = order.cod_payment_method === 'credit_card' ? 'Credit Card — we’ll call to collect'
    : order.cod_payment_method === 'venmo' ? 'Venmo — we’ll send a payment request'
    : order.cod_payment_method === 'cashapp' ? 'Cash App — we’ll send a payment request'
    : order.cod_payment_method === 'cash' ? 'Cash' : null;
  const codFeePct = codFeePercent(order);
  const codFeeLbl = (sub: number) => codFeeLabel(order, sub);

  const itemRows = groceryItems.map(item => `
    <tr style="border-bottom:1px solid #f0f0f0;">
      <td style="padding:8px 10px;font-size:11px;color:#888;">${item.upc || '—'}</td>
      <td style="padding:8px 10px;font-size:13px;color:#1E3D1E;font-weight:600;">${item.description}${
        item.paid_by === 'cod'
          ? `<span style="display:inline-block;margin-left:6px;font-size:9px;font-weight:800;color:#9333ea;background:#faf5ff;border:1px solid #9333ea;border-radius:3px;padding:1px 4px;text-transform:uppercase;">COD${item.cod_name ? ` · ${item.cod_name}` : ''}</span>`
          : item.paid_by === 'deck'
          ? `<span style="display:inline-block;margin-left:6px;font-size:9px;font-weight:800;color:#0f766e;background:#f0fdfa;border:1px solid #0f766e;border-radius:3px;padding:1px 4px;text-transform:uppercase;">DECK</span>`
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

    ${(codItems.length > 0 || codLinkedOnly.length > 0) ? `<div style="background:#faf5ff;border:1px solid #9333ea;padding:10px 14px;border-radius:4px;margin-bottom:20px;">
      <div style="font-size:9px;font-weight:800;color:#9333ea;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">COD Items — ${formatCurrency(codTotalWithFee(order, codSubtotal))}${codFeePct > 0 || codFeeLbl(codSubtotal) !== 'no handling fee' ? ` incl. ${codFeeLbl(codSubtotal)}` : ''} (not invoiced) · paid personally, separated by crew member</div>
      ${codByName.map(([name, list]) => {
        const personTotal = list.reduce((s, i) => s + Number(i.line_total), 0);
        const pay = codPayByName.get(name);
        return `<div style="margin-bottom:6px;">
          <div style="font-size:12px;font-weight:800;color:#6b21a8;">${name} — ${formatCurrency(codShares.get(name) ?? personTotal)}${codFeePct > 0 ? ' <span style="font-weight:400;color:#9d7bd8;">incl. fee</span>' : ''}${
            pay && pay.linked_items > 0 ? ` <span style="font-weight:400;color:#9d7bd8;">+ ${pay.linked_items === 1 ? 'linked item' : `${pay.linked_items} linked items`}</span>` : ''
          }</div>
          ${list.map(i => `<div style="font-size:11px;color:#444;padding-left:10px;">${i.quantity}× ${i.description} · ${formatCurrency(Number(i.line_total))}</div>`).join('')}
          ${pay ? `<div style="font-size:11px;color:#6b21a8;padding-left:10px;margin-top:2px;"><strong>Pays by:</strong> ${codMethodSentence(pay)}</div>` : ''}
        </div>`;
      }).join('')}
      ${codLinkedOnly.map(p => `<div style="margin-bottom:6px;">
        <div style="font-size:12px;font-weight:800;color:#6b21a8;">${p.name} — ${p.linked_items === 1 ? 'Linked item' : `${p.linked_items} linked items`} <span style="font-weight:400;color:#9d7bd8;">priced when bought</span></div>
        <div style="font-size:11px;color:#6b21a8;padding-left:10px;margin-top:2px;"><strong>Pays by:</strong> ${codMethodSentence(p)}</div>
      </div>`).join('')}
      ${codPayments.length === 0 && codMethodLabel ? `<div style="font-size:11px;color:#6b21a8;margin-top:4px;border-top:1px solid #e9d5ff;padding-top:4px;"><strong>Payment:</strong> ${codMethodLabel}${
        order.cod_payment_method === 'credit_card'
          ? ` — we’ll call ${order.cod_preferred_phone || 'the crew member'}${order.cod_contact_time ? ` (around ${order.cod_contact_time})` : ''}`
          : (order.cod_payment_method === 'venmo' || order.cod_payment_method === 'cashapp')
          ? ` to <strong>${order.cod_payment_handle || 'the account on file'}</strong> for the exact final amount once the order is shopped. Please don’t send payment ahead of time.`
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
        ${/* Prefer what Sinclair's ACTUALLY rang for deck. Dave asked for the
              two figures separately because most vessels don't charge the boat
              for deck items — "the boat really needs to see, this is how much
              the deck order was, and this is how much the grocery order was."
              Falls back to the estimate when the deck total hasn't been keyed. */''}
        ${deckItems.length > 0 ? `<tr style="background:#f0fdfa;">
          <td colspan="5" style="padding:6px 10px;font-size:11px;font-weight:700;color:#0f766e;">Deck order — company-billed, invoiced separately (not part of the grocery allowance)${
            order.deck_register_total == null ? ' <span style="font-weight:400;">· estimated</span>' : ''
          }</td>
          <td style="padding:6px 10px;text-align:right;font-size:12px;font-weight:800;color:#0f766e;">${
            formatCurrency(order.deck_register_total ?? deckSubtotal)
          }</td>
        </tr>` : ''}
        ${order.register_total != null ? `
        <tr style="background:#D9E84A;">
          <td colspan="5" style="padding:10px;font-size:14px;font-weight:900;color:#1E3D1E;text-transform:uppercase;">${deckItems.length > 0 ? 'Grocery Total' : 'Total'}</td>
          <td style="padding:10px;text-align:right;font-size:16px;font-weight:900;color:#1E3D1E;">${formatCurrency(order.register_total)}</td>
        </tr>
        <tr style="background:#f5f5f5;">
          <td colspan="5" style="padding:6px 10px;font-size:11px;color:#666;">System estimate</td>
          <td style="padding:6px 10px;text-align:right;font-size:11px;color:#666;">${formatCurrency(order.subtotal)}</td>
        </tr>` : `
        <tr style="background:#D9E84A;">
          <td colspan="5" style="padding:10px;font-size:14px;font-weight:900;color:#1E3D1E;text-transform:uppercase;">ESTIMATED TOTAL</td>
          <td style="padding:10px;text-align:right;font-size:16px;font-weight:900;color:#1E3D1E;">${formatCurrency(order.subtotal)}</td>
        </tr>`}
        ${discountTotal > 0 ? `<tr style="background:#dcfce7;">
          <td colspan="5" style="padding:8px 10px;font-size:12px;font-weight:900;color:#15803d;text-transform:uppercase;">After estimated coupon savings (−${formatCurrency(discountTotal)})</td>
          <td style="padding:8px 10px;text-align:right;font-size:14px;font-weight:900;color:#15803d;">${formatCurrency(Math.max(0, Number(order.subtotal) - discountTotal))}</td>
        </tr>` : ''}
      </tfoot>
    </table>` : ''}

    ${deliveryBox}

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

  // SINCLAIR'S GET A COPY — but only if there's anything for them to shop.
  //
  // A crew-change-only order has nothing but service lines, and Sinclair's has
  // no reason to see it. This mirrors the admin permission model, where
  // Sinclair's staff already can't open service-only orders: the email and the
  // UI should agree about what that account is entitled to see, or the
  // permission boundary is decorative.
  const hasShoppableItems = order.items.some(i => i.item_type !== 'service');
  // GTS inbox only on this message. Sinclair's get their OWN email below with a
  // one-tap Shopping Mode link ? CC'ing them on the GTS template mixed audiences
  // and sent them to the wrong dashboard.
  const businessCc = ccList;

  const businessResult = await getResend().emails.send({
    from:        fromEmail,
    to:          [toEmail],
    ...(businessCc.length > 0 ? { cc: businessCc } : {}),
    replyTo:     toEmail,
    subject:     businessSubject,
    html:        businessHtml,
    attachments: pdfAttachment,
  });
  if (businessResult.error) {
    console.error('Resend business email error:', businessResult.error);
    throw new Error(businessResult.error.message || JSON.stringify(businessResult.error));
  }

  // 2) Sinclair's ? only when there is grocery to shop. Dedicated message with
  // a one-tap link into Shopping Mode on the shop host (their installed app).
  if (hasShoppableItems) {
    const sinclairTo = sinclairsOrderEmails();
    if (sinclairTo.length) {
      const shopUrl = `${shopAppUrl()}/admin/orders?order=${encodeURIComponent(order.id)}&shop=1`;
      const sinclairHtml = buildOrderEmailHtml(order, {
        tagline:    'New order to shop',
        intro:      `Grocery order <strong>${order.order_number}</strong> for <strong>${order.company_name}</strong> / <strong>${order.vessel_name || 'vessel'}</strong> is ready to pick. Open it in Shopping Mode — barcode scan, aisle order, weights, and substitutions.`,
        buttonText: 'Open in Shopping Mode',
        buttonUrl:  shopUrl,
        footerText: 'Grafton Towboat Services — order alerts for Sinclair\'s Foods staff',
        showSinclairNote: false,
      });
      const sinclairResult = await getResend().emails.send({
        from:    fromEmail,
        to:      sinclairTo,
        replyTo: toEmail,
        subject: `Shop now — Order #${order.order_number} — ${order.vessel_name || order.company_name}`,
        html:    sinclairHtml,
        attachments: pdfAttachment,
      });
      if (sinclairResult.error) {
        // Don't fail the whole place-order path if Sinclair mail hiccups ?
        // GTS and the vessel already got theirs. Log loud so we notice.
        console.error('Resend Sinclair order email error:', sinclairResult.error);
      }
    }
  }

  // 3) Customer confirmation email — goes to the VESSEL email first (the boat
  // places and tracks the order); billing email is only the fallback. The home
  // office gets the monthly bill, not per-order noise (July 10 demo decision).
  const confirmTo = order.vessel_email || order.customer_email;
  if (confirmTo) {
    const customerHtml = buildOrderEmailHtml(order, {
      tagline:    'Order Confirmation',
      intro:      `Thank you for your order, ${order.contact_name}! We've received it and will begin preparing your delivery. A copy of your order is attached to this email.`,
      buttonText: 'Questions? Contact Us',
      buttonUrl:  `mailto:${publicContactEmail()}`,
      footerText: `Grafton Towboat Services · Grafton, IL 62037 · (618) 556-0290 · ${publicContactEmail()}`,
    });
    const customerResult = await getResend().emails.send({
      from:        fromEmail,
      to:          [confirmTo],
      // Customer replies go to the PUBLIC address, not the internal inbox.
      replyTo:     publicContactEmail(),
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
// Order Shopped — the FINAL customer email. NOT automatic: fired manually by
// a GTS owner from the admin dashboard once everything (groceries + CODs +
// crew changes + pickups) is truly done. buildOrderShoppedEmailHtml is
// exported separately so the dashboard can PREVIEW the exact email first.
// Goes to: customer + business (CC)
// ─────────────────────────────────────────────────────────────
/**
 * Documents that couldn't ride along as attachments.
 *
 * Passed in by sendOrderShoppedEmail when the size budget is hit, so the body
 * can offer a link instead of promising an attachment that isn't there. Saying
 * "attached" about a file the customer can't find is worse than saying nothing.
 */
export interface ShoppedEmailDocs {
  linked?: Array<{ label: string; url: string }>;
}

export function buildOrderShoppedEmailHtml(order: Order, docs: ShoppedEmailDocs = {}): string {
  // Orders with no grocery items (crew change / services only) were never
  // "shopped" — use neutral fulfillment language for those.
  const hasGroceryItems = order.items.some(i => i.item_type !== 'service');
  const intro = hasGroceryItems
    ? `Great news, ${order.contact_name}! Your order has been delivered. Please find your final delivery summary attached — including GTS delivery charges.`
    : `Good news, ${order.contact_name}! Your request has been completed and delivered. Please find your final summary attached.`;
  return buildOrderEmailHtml(order, {
    tagline:    'Delivered',
    intro,
    buttonText: 'Questions? Contact Us',
    buttonUrl:  `mailto:GraftonTowboatServices@gmail.com`,
    footerText: 'Grafton Towboat Services · Grafton, IL 62037 · (618) 556-0290 · GraftonTowboatServices@gmail.com',
    showDelivery: true,
    linkedDocs: docs.linked,
  });
}

export async function sendOrderShoppedEmail(
  order: Order,
  opts: {
    businessEmail?: string;
    ccEmailRaw?: string;
  } = {}
) {
  const fromEmail  = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const toEmail    = opts.businessEmail || process.env.BUSINESS_EMAIL || 'GraftonTowboatServices@gmail.com';
  const ccList     = parseCcList(opts.ccEmailRaw ?? process.env.ORDER_EMAIL_CC ?? '');
  const pdfBuffer2 = await generateOrderPdfBuffer(order);
  const attachments: Array<{ filename: string; content: Buffer }> = [
    { filename: `order-${order.order_number}-fulfilled.pdf`, content: pdfBuffer2 },
  ];

  // ── Supporting documents ──────────────────────────────────────────
  //
  // Some barge lines will not pay against an invoice on its own. Ingram's
  // Receipt Acknowledgement says it in red on the form itself:
  //
  //   "THIS RECEIPT MUST BE SUBMITTED WITH SUPPLIER'S INVOICE.
  //    INGRAM BARGE COMPANY WILL NOT ACCEPT SUPPLIER'S INVOICE WITHOUT IT."
  //
  // Jen's real June 30 billing for the Scott Noble went out as four pieces:
  // the invoice ($4,572.13), Sinclair's 23-page register receipt ($4,347.13),
  // and a photo of the clipboard — GTS's own Delivery Log plus Ingram's signed
  // acknowledgement carrying their P.O. number. Any of those missing and the
  // invoice sits in accounts payable unpaid.
  //
  // Both documents were already being uploaded and stored. Only the receipt
  // ever rode the email; the signed slip was captured and then forgotten,
  // which meant the one document the customer's AP department actually
  // requires was the one we didn't send.
  // ── SIZE BUDGET ───────────────────────────────────────────────────
  //
  // THE FAILURE THIS PREVENTS: Resend rejects an over-sized message, and a
  // rejection fails the WHOLE send — not just the offending attachment. The
  // captain then receives nothing at all, and the first anyone knows is a
  // phone call asking where the order confirmation went.
  //
  // The numbers make this a live risk rather than a theoretical one. Sinclair's
  // register receipt for the Scott Noble ran 23 pages, and the signed log is a
  // photo straight off a phone at 3–5 MB. Resend's own ceiling is 40 MB, but
  // that is not the binding constraint — MOST CORPORATE MAIL SYSTEMS REJECT
  // OVER 10 MB, and barge-line accounts payable run exactly that kind of mail
  // system. An email Resend happily accepts can still bounce at Ingram.
  //
  // So: budget 8 MB, leaving headroom under a 10 MB cap for headers and the
  // base64 encoding overhead (~33%, which is why the budget is checked against
  // raw bytes with room to spare).
  const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
  let attachedBytes = pdfBuffer2.length;

  /** Documents too large to attach. They get LINKED in the email instead. */
  const linkedDocs: Array<{ label: string; url: string }> = [];

  const attachDoc = async (url: string | null | undefined, name: string, label: string) => {
    if (!url) return;
    try {
      const res = await fetch(url);
      if (!res.ok) { console.error(`Could not attach ${label}: HTTP ${res.status}`); return; }
      const buf = Buffer.from(await res.arrayBuffer());

      if (attachedBytes + buf.length > MAX_ATTACHMENT_BYTES) {
        // Degrade, don't fail. The customer still gets the email and still
        // gets the document — one click further away instead of not at all.
        console.warn(
          `${label} not attached: ${(buf.length / 1024 / 1024).toFixed(1)} MB would take the message over `
          + `${(MAX_ATTACHMENT_BYTES / 1024 / 1024).toFixed(0)} MB. Linked in the email instead.`,
        );
        linkedDocs.push({ label, url });
        return;
      }

      const ext = url.split('.').pop()?.split('?')[0]?.slice(0, 5) || 'pdf';
      attachments.push({ filename: `${name}-${order.order_number}.${ext}`, content: buf });
      attachedBytes += buf.length;
    } catch (e) {
      // Never block the email on a document — a missing attachment is
      // recoverable by forwarding it; a final email that never sends is not.
      console.error(`Could not attach ${label}:`, e);
    }
  };

  // ORDER MATTERS. The signed log goes first because it is small (one photo)
  // and it is the document the customer's accounts payable actually REQUIRES —
  // Ingram's form says in red that they will not accept an invoice without it.
  // Sinclair's 23-page receipt is the big one and the one that can be looked up
  // later, so it yields the budget if something has to.
  await attachDoc(order.ingram_slip_url, 'signed-delivery-log', 'signed delivery log');

  // Sinclair's ACTUAL register receipt — the customer's itemized prices line by
  // line, rather than our estimate.
  if (order.bill_for_groceries === true) {
    await attachDoc(order.sinclairs_receipt_url, 'sinclairs-receipt', 'Sinclair receipt');
  }

  const hasGroceryItems = order.items.some(i => i.item_type !== 'service');
  const shoppedHtml = buildOrderShoppedEmailHtml(order, { linked: linkedDocs });

  // Vessel email first — the boat tracks the order, not the home office.
  const shoppedTo = order.vessel_email || order.customer_email;
  const recipients = shoppedTo ? [shoppedTo] : [toEmail];
  const cc = shoppedTo
    ? [toEmail, ...ccList].filter(Boolean)
    : ccList;

  const result = await getResend().emails.send({
    from:        fromEmail,
    to:          recipients,
    ...(cc.length > 0 ? { cc } : {}),
    // This one goes to the boat with GTS cc'd, so the reply address is the
    // public one — same reasoning as the confirmation email above.
    replyTo:     publicContactEmail(),
    subject:     hasGroceryItems
                   ? `Delivered — ${order.order_number} — Grafton Towboat Services`
                   : `Completed — ${order.order_number} — Grafton Towboat Services`,
    html:        shoppedHtml,
    attachments,
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
