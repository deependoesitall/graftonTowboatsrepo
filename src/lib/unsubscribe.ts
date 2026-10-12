// Signed unsubscribe links. The token is an HMAC of the address, so a link
// only unsubscribes the address it was sent to and needs no table lookup.
import { createHmac, timingSafeEqual } from 'crypto';
import { getAppUrl } from '@/lib/email';

function secret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.EMAIL_QUEUE_SECRET;
  if (!s) throw new Error('UNSUBSCRIBE_SECRET is not set');
  return s;
}

export function unsubscribeToken(email: string): string {
  return createHmac('sha256', secret()).update(`unsubscribe:${email.trim().toLowerCase()}`).digest('base64url').slice(0, 32);
}

export function verifyUnsubscribe(email: string, token: string): boolean {
  const want = Buffer.from(unsubscribeToken(email));
  const got = Buffer.from(String(token || ''));
  return got.length === want.length && timingSafeEqual(got, want);
}

export function unsubscribeUrl(email: string): string {
  const base = getAppUrl().replace(/\/$/, '');
  const e = email.trim().toLowerCase();
  return `${base}/api/unsubscribe?e=${encodeURIComponent(e)}&t=${unsubscribeToken(e)}`;
}

/** Headers that let Gmail and others show their own one-tap Unsubscribe. */
export function unsubscribeHeaders(url: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
