// src/lib/customer-emails.ts
//
// THE TWO EMAILS JEN SENDS BY HAND.
//
// Everything else this system mails is triggered by an order. These two are
// not: Jen fires them at a person. Asked for on the Sep 21 call —
//
//   "I need to be able to send him an email with all of the, his username,
//    his password, a little bit of directions ... so he's ready to place an
//    order."
//   "I want to send out mass emails too, to all the different companies and
//    all the contacts that we have ... saying, look what we have now."
//
// Written for a cook or a captain reading on a phone with one bar in the
// middle of the river. Short sentences, no jargon, nothing that assumes they
// have seen the site before.
//
// ⚠️ NO ALCOHOL anywhere in this copy, and never a line that reads as though
// Sinclair's delivers. Sinclair's shops it. Grafton Towboat Services carries it out.
import { signatureBlock, getAppUrl } from './email';
import { CUSTOMER_STATUS_WALKTHROUGH } from './customer-order-status';
import { SIGNUP_URL } from './boat-invite';

export type CustomerEmailKey = 'welcome' | 'announcement' | 'signin';

export interface WelcomeVars {
  firstName: string;
  vesselName: string;
  loginEmail: string;
  password: string;
}

export const GREEN = '#1E3D1E';
export const YELLOW = '#D9E84A';
export const ORANGE = '#D9640A';
export const INK = '#15181C';
const SOFT = '#4A544C';
const ORDER_URL = 'https://graftontowboatservices.com/catalog';
const HOW_IT_WORKS_URL = 'https://graftontowboatservices.com/order-online';

/** Belt and braces: these go to real customers, so never paste raw input. */
function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shell(inner: string, footer: string): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f5f6;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <div style="background:${GREEN};padding:18px 26px;">
    <div style="color:${YELLOW};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.6px;">Grafton Towboat Services</div>
  </div>
  ${inner}
  <div style="background:${GREEN};padding:14px 26px;text-align:center;">
    <div style="color:#a8c86a;font-size:11px;">${footer}</div>
  </div>
</div>
</body></html>`;
}

/**
 * The welcome and announcement emails: the GTS badge beside the name in the
 * green bar, a lime rule under it, and a green footer with the address,
 * phone and website. The badge shows here and in the signature lockup, and
 * nowhere else, so the footer carries text only.
 */
export function brandedShell(inner: string): string {
  const badge = `${getAppUrl()}/branding/gts-badge.png`;
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f5f6;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${GREEN}" style="background:${GREEN};border-collapse:collapse;">
    <tr><td style="padding:14px 22px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>
        <td style="width:56px;vertical-align:middle;"><img src="${badge}" width="56" height="56" alt="Grafton Towboat Services" style="display:block;width:56px;height:56px;border:0;" /></td>
        <td style="padding-left:14px;vertical-align:middle;">
          <div style="color:#ffffff;font-size:16px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;line-height:1.15;">Grafton Towboat Services</div>
          <div style="color:${YELLOW};font-size:10.5px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;margin-top:4px;">Groceries &middot; Supplies &middot; Crew change</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td height="4" bgcolor="${YELLOW}" style="height:4px;line-height:4px;font-size:0;background:${YELLOW};">&nbsp;</td></tr>
  </table>
  ${inner}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${GREEN}" style="background:${GREEN};border-collapse:collapse;">
    <tr><td height="3" bgcolor="${ORANGE}" style="height:3px;line-height:3px;font-size:0;background:${ORANGE};">&nbsp;</td></tr>
    <tr><td align="center" style="padding:20px 26px 22px;text-align:center;">
      <div style="color:#ffffff;font-size:12.5px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase;">Grafton Towboat Services</div>
      <div style="color:#a8c86a;font-size:12px;line-height:1.7;margin-top:6px;">
        Grafton, IL 62037 &middot; Mile Marker 219 Mississippi &middot; Mile Marker 0 Illinois<br>
        <a href="tel:6185560290" style="color:${YELLOW};text-decoration:none;font-weight:700;">(618) 556-0290</a> &nbsp;&middot;&nbsp;
        <a href="https://graftontowboatservices.com" style="color:${YELLOW};text-decoration:none;font-weight:700;">graftontowboatservices.com</a>
      </div>
    </td></tr>
  </table>
</div>
</body></html>`;
}

function step(n: number, lead: string, rest: string, last = false): string {
  const pad = last ? '0' : '0 0 16px';
  return `<tr>
    <td style="width:34px;vertical-align:top;padding:${pad};">
      <div style="width:25px;height:25px;border-radius:13px;background:${GREEN};color:${YELLOW};font-size:13px;font-weight:800;text-align:center;line-height:25px;">${n}</div>
    </td>
    <td style="vertical-align:top;padding:${pad};font-size:14.5px;line-height:1.55;color:${INK};">
      <b>${lead}</b> ${rest}
    </td></tr>`;
}

/**
 * One selling point, in the same rhythm as the SaveOrderPrompt the site shows
 * a guest after checkout: orange disc, bold claim, one short line. That modal
 * is the version customers already respond to, so the email echoes it rather
 * than inventing a second voice.
 */
function benefit(lead: string, rest: string, last = false): string {
  const pad = last ? '0' : '0 0 14px';
  return `<tr>
    <td style="width:22px;vertical-align:top;padding:${pad};">
      <div style="width:8px;height:8px;border-radius:4px;background:${ORANGE};margin-top:7px;"></div>
    </td>
    <td style="vertical-align:top;padding:${pad};font-size:14.5px;line-height:1.5;color:${INK};">
      <b>${lead}</b><br><span style="color:${SOFT};">${rest}</span>
    </td></tr>`;
}

/** A real screenshot of the customer's own ordering screen, with a caption.
 *  Hotlinked at 2x and displayed at 548 so it stays sharp on a phone. */
function shot(file: string, alt: string, caption: string): string {
  return `
    <div style="margin:0 0 22px;">
      <img src="${getAppUrl()}/branding/email/${file}" width="548" alt="${alt}"
           style="display:block;width:100%;max-width:548px;height:auto;border:1px solid #E3E8DE;border-radius:6px;" />
      <p style="margin:8px 0 0;font-size:13px;line-height:1.5;color:${SOFT};">${caption}</p>
    </div>`;
}

function signInCard(email: string, password: string): string {
  return `<div style="border:1px solid #D7DCD4;border-radius:5px;padding:16px 18px;margin:0 0 20px;background:#F6F8F4;">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:#5C6B5E;margin-bottom:10px;">Your sign in</div>
      <div style="font-size:14px;line-height:1.9;color:${INK};">
        <div><span style="display:inline-block;min-width:84px;color:#5C6B5E;">Website</span><b>graftontowboatservices.com</b></div>
        <div><span style="display:inline-block;min-width:84px;color:#5C6B5E;">Email</span><b>${esc(email)}</b></div>
        <div><span style="display:inline-block;min-width:84px;color:#5C6B5E;">Password</span><b>${esc(password)}</b></div>
      </div>
    </div>`;
}

/** Sent to ONE crew member, right after their login is created. */
export function buildWelcomeEmail(v: WelcomeVars): { subject: string; html: string } {
  const first  = esc(v.firstName.trim()) || 'there';
  const vessel = esc(v.vesselName.trim()) || 'your boat';
  const inner = `
  <div style="padding:26px;">
    <h1 style="margin:0 0 12px;font-size:25px;line-height:1.2;color:${INK};">You're set up to order.</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:${INK};">
      Hi ${first}. I set up an account for you, free to use, for the <b>${vessel}</b>. Put your next boat order in online instead of working off that limited spreadsheet.
    </p>

    ${shot('store-toggle.jpg', 'The barge order form next to the full Sinclair\'s store',
           'The old order sheet was 1,329 lines. Slide it over and you have the whole store.')}

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:22px;">
      ${benefit('Search instead of scrolling.', 'Type what you want and it comes up, priced, ready to add.')}
      ${benefit('Reorder in one tap.', 'This list becomes your next order.')}
      ${benefit('Track what happens next.', CUSTOMER_STATUS_WALKTHROUGH.replace(/→/g, '&rarr;'), true)}
    </table>

    ${shot('onsale.jpg', "Sinclair's weekly sale items on the order screen",
           "Their sale prices land on your order screen the same week they hit the shelf.")}

    ${signInCard(v.loginEmail, v.password)}

    <div style="text-align:center;padding:16px;background:#f8f9fa;border-radius:4px;margin-bottom:20px;">
      <a href="${ORDER_URL}" style="background:${GREEN};color:${YELLOW};padding:12px 28px;border-radius:24px;text-decoration:none;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;display:inline-block;">Start an order &rarr;</a>
    </div>

    <p style="margin:0 0 16px;font-size:13.5px;line-height:1.6;color:${SOFT};">
      Meat, produce and deli go by weight, so your total is an estimate until it is rung up. The invoice shows what actually came aboard.
    </p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:${SOFT};">
      Anything at all, call <b style="color:${INK};">(618) 556-0290</b>. Day or night.
    </p>
    ${signatureBlock()}
  </div>`;
  return {
    subject: `You're set up to order groceries — ${v.vesselName.trim() || 'Grafton Towboat Services'}`,
    html: brandedShell(inner),
  };
}

/**
 * After a password reset. Same sign-in card as the welcome email, without the
 * "you're new here" walkthrough — they already have an account.
 */
export function buildSignInEmail(v: WelcomeVars): { subject: string; html: string } {
  const first  = esc(v.firstName.trim()) || 'there';
  const vessel = esc(v.vesselName.trim()) || 'your boat';
  const inner = `
  <div style="padding:26px;">
    <h1 style="margin:0 0 12px;font-size:25px;line-height:1.2;color:${INK};">Your sign-in details.</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:${INK};">
      Hi ${first}. Here is how you sign in to order for the <b>${vessel}</b>.
    </p>
    ${signInCard(v.loginEmail, v.password)}
    <div style="text-align:center;padding:16px;background:#f8f9fa;border-radius:4px;margin-bottom:20px;">
      <a href="${ORDER_URL}" style="background:${GREEN};color:${YELLOW};padding:12px 28px;border-radius:24px;text-decoration:none;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;display:inline-block;">Start an order &rarr;</a>
    </div>
    <p style="margin:0;font-size:14px;line-height:1.6;color:${SOFT};">
      Anything at all, call <b style="color:${INK};">(618) 556-0290</b>. Day or night.
    </p>
    ${signatureBlock()}
  </div>`;
  return {
    subject: `Your Grafton Towboat Services sign in — ${v.vesselName.trim() || 'Grafton Towboat Services'}`,
    html: shell(inner, 'Grafton Towboat Services &middot; Grafton, IL 62037 &middot; Mile Marker 219 Mississippi &middot; Mile Marker 0 Illinois'),
  };
}

/** Sent wide — every company and contact on file. Nothing boat-specific.
 *  Same layout and screenshots as the welcome email, but no sign in: the
 *  button takes them to make their own account. */
export function buildAnnouncementEmail(): { subject: string; html: string } {
  const inner = `
  <div style="padding:26px;">
    <h1 style="margin:0 0 12px;font-size:25px;line-height:1.2;color:${INK};">Grafton Towboat Services now takes grocery and supply orders online.</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:${INK};">
      Hi there. Your boat can put its next order in online, free to use, instead of working off that limited spreadsheet. Make an account for your boat and every order saves, so the next one is quicker.
    </p>

    ${shot('store-toggle.jpg', 'The barge order form next to the full Sinclair\'s store',
           'The old order sheet was 1,329 lines. Slide it over and you have the whole store.')}

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:22px;">
      ${benefit('Search instead of scrolling.', 'Type what you want and it comes up, priced, ready to add.')}
      ${benefit('Reorder in one tap.', 'Your last order becomes your next one.')}
      ${benefit('Track what happens next.', CUSTOMER_STATUS_WALKTHROUGH.replace(/→/g, '&rarr;'))}
      ${benefit('Anything else.', 'Not at Sinclair&rsquo;s? Paste a link from Walmart or anywhere else, or just write it in. It comes out with your order.', true)}
    </table>

    ${shot('onsale.jpg', "Sinclair's weekly sale items on the order screen",
           "Their sale prices land on your order screen the same week they hit the shelf.")}

    <div style="text-align:center;padding:18px 16px;background:#f8f9fa;border-radius:4px;margin-bottom:20px;">
      <a href="${SIGNUP_URL}" style="background:${GREEN};color:${YELLOW};padding:14px 30px;border-radius:24px;text-decoration:none;font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:1px;display:inline-block;">Create your boat&rsquo;s account &rarr;</a>
      <div style="margin-top:12px;font-size:13px;color:#5C6B5E;">Free. Takes a minute. <a href="${HOW_IT_WORKS_URL}" style="color:${ORANGE};font-weight:700;text-decoration:none;">See how it works</a></div>
    </div>

    <p style="margin:0 0 16px;font-size:13.5px;line-height:1.6;color:${SOFT};">
      Meat, produce and deli go by weight, so your total is an estimate until it is rung up. The invoice shows what actually came aboard.
    </p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:${SOFT};">
      Anything at all, call <b style="color:${INK};">(618) 556-0290</b>. Day or night.
    </p>
    ${signatureBlock()}
  </div>`;
  return {
    subject: 'You can order groceries online now, Grafton Towboat Services',
    html: brandedShell(inner),
  };
}
