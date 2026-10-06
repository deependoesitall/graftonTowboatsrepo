// src/lib/onboard-links.ts
//
// The two staff onboarding links, kept in one place so they can be copied from
// Settings → Admin Users instead of dug out of old emails.
//
// Each site gets only its own link (never offered across sites):
//   · GTS staff        → graftontowboatservices.com/admin/install
//                        (src/app/admin/install/page.tsx, "GTS Orders")
//   · Sinclair's staff → shop.graftontowboatservices.com/install
//                        (middleware sends shop.*/install to /shop/install,
//                        src/app/shop/install/page.tsx, Sinclair's install page)
// Each guide walks through Add to Home Screen; the installed icon opens
// /admin/orders, which asks them to sign in with their username and password.
//
// To change a link, edit the URL below and redeploy.

export type OnboardKind = 'gts' | 'sinclair';

export const ONBOARD_LINKS: Record<OnboardKind, { label: string; url: string }> = {
  gts: {
    label: 'GTS staff app',
    url: 'https://graftontowboatservices.com/admin/install',
  },
  sinclair: {
    label: "Sinclair's staff app",
    url: 'https://shop.graftontowboatservices.com/install',
  },
};

export const ONBOARD_HELP_PHONE = '(618) 556-0290';

export function onboardSubject(kind: OnboardKind): string {
  return kind === 'sinclair'
    ? "Your Sinclair's app login"
    : 'Your GTS app login';
}

export function onboardBody(opts: {
  kind: OnboardKind;
  name?: string | null;
  username: string;
  password?: string;
}): string {
  const { kind, name, username, password } = opts;
  const first = (name || '').trim().split(/\s+/)[0];
  return [
    first ? `Hi ${first},` : 'Hi,',
    '',
    `On your phone, open ${ONBOARD_LINKS[kind].url} and follow the steps to add the app to your Home Screen. Then open it and sign in:`,
    '',
    `Username: ${username}`,
    `Password: ${password ? password : '(sent separately)'}`,
    '',
    `Trouble? Call ${ONBOARD_HELP_PHONE}.`,
    '',
    'Grafton Towboat Services',
  ].join('\n');
}

export function onboardMailto(to: string, subject: string, body: string): string {
  const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, '\r\n'));
  return `mailto:${encodeURI(to.trim())}?subject=${enc(subject)}&body=${enc(body)}`;
}
