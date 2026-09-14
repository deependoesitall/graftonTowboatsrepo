// src/lib/public-url.ts
//
// Customer-facing links (emails, receipt PDFs). Never send people to a
// Vercel preview host or localhost — those were dummy URLs on the old
// grafton-ordering.vercel.app receipt footer.

const CANONICAL = 'https://graftontowboatservices.com';

export function publicSiteUrl(): string {
  const env = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  if (env && !/localhost|127\.0\.0\.1|vercel\.app|\*/i.test(env)) return env;
  return CANONICAL;
}

export function accountUrl(orderId?: string | null): string {
  const base = `${publicSiteUrl()}/account`;
  return orderId ? `${base}?order=${encodeURIComponent(orderId)}` : base;
}
