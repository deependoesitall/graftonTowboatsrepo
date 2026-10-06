// Relative post-auth path only. Blocks protocol-relative / off-site redirects.

export function safeAuthNext(raw: string | null | undefined, fallback = '/account'): string {
  if (!raw) return fallback;
  let next = raw.trim();
  try { next = decodeURIComponent(next); } catch { /* already decoded */ }
  next = next.trim();
  if (!next.startsWith('/')) return fallback;
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback;
  if (next.includes('://') || next.includes('\\')) return fallback;
  if (next.startsWith('/auth/callback')) return fallback;
  if (next.length > 512) return fallback;
  return next;
}

/** Path + query the shopper is on, so Google OAuth can land them back on the list. */
export function currentAuthNext(): string {
  if (typeof window === 'undefined') return '/account';
  return safeAuthNext(`${window.location.pathname}${window.location.search}`);
}
