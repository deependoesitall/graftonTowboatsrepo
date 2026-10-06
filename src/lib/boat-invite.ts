// src/lib/boat-invite.ts
//
// The text Jen / Mary Karen / Laura paste into a text message when a boat
// calls out of the blue. Short, phone-sized, no jargon. Same URL the
// welcome email uses.
export const ORDER_SITE_URL = 'https://graftontowboatservices.com/catalog';
export const GTS_PHONE = '(618) 556-0290';

export function boatInviteText(opts?: { vesselName?: string }): string {
  const boat = (opts?.vesselName || '').trim();
  return [
    `Grafton Towboat Services grocery ordering is online${boat ? ` for the ${boat}` : ''}.`,
    '',
    'Tap the link, create a free account, and your cart stays with you.',
    '',
    ORDER_SITE_URL,
    '',
    `Questions? Call ${GTS_PHONE}`,
  ].join('\n');
}

export function boatSignInText(opts: {
  vesselName?: string;
  email: string;
  password: string;
}): string {
  const boat = (opts.vesselName || '').trim();
  return [
    `You're set up to order${boat ? ` for the ${boat}` : ''} with Grafton Towboat Services.`,
    '',
    'Website: graftontowboatservices.com',
    `Email: ${opts.email}`,
    `Password: ${opts.password}`,
    '',
    ORDER_SITE_URL,
    '',
    `Questions? Call ${GTS_PHONE}`,
  ].join('\n');
}

