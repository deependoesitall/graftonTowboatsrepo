// src/lib/boat-invite.ts
//
// The text Jen / Mary Karen / Laura paste into a text message when a boat
// calls out of the blue. Short, phone-sized, no jargon. Same links the
// emails use.
export const ORDER_SITE_URL = 'https://graftontowboatservices.com/catalog';
export const GTS_PHONE = '(618) 556-0290';
/** Opens the create-account form on /account. */
export const SIGNUP_URL = 'https://graftontowboatservices.com/account?signup=1';

/** Text version of the announcement email: same invite, same create-account link. */
export function boatInviteText(opts?: { vesselName?: string }): string {
  const boat = (opts?.vesselName || '').trim();
  return [
    `Grafton Towboat Services now takes grocery and supply orders online${boat ? ` for the ${boat}` : ''}.`,
    '',
    "Create your boat's free account here, and every order saves so the next one is quicker:",
    '',
    SIGNUP_URL,
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

