// src/lib/email-quota-server.ts
//
// Reads what Resend says is left to send: GET https://api.resend.com/usage,
// the endpoint behind the Resend SDK's usage.get(). It returns the plan's daily
// and monthly limits, what is used, and when each resets. The daily quota is a
// UTC calendar day on the free plan; paid plans have none (limit null).
import type { EmailQuota } from '@/lib/email-quota';

type Window = { used?: number; limit?: number | null; resets_at?: string };

/** Resend reports the end of the window (23:59:59.999); show the reset itself. */
function resetIso(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(Math.ceil(t / 1000) * 1000).toISOString() : null;
}

export async function getEmailQuota(apiKey: string): Promise<EmailQuota> {
  const res = await fetch('https://api.resend.com/usage', {
    headers: { Authorization: `Bearer ${apiKey}`, 'User-Agent': 'gts-admin/1.0' },
    cache: 'no-store',
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.message || `Resend usage returned ${res.status}`);
  const d: Window = j?.emails?.daily || {};
  const m: Window = j?.emails?.monthly || {};
  if (typeof d.used !== 'number' || typeof m.used !== 'number') {
    throw new Error('Resend usage came back without email counts');
  }
  const dailyLimit = typeof d.limit === 'number' ? d.limit : null;
  const monthlyLimit = typeof m.limit === 'number' ? m.limit : null;
  return {
    dailyLimit,
    dailyUsed: d.used,
    dailyRemaining: dailyLimit == null ? null : Math.max(0, dailyLimit - d.used),
    monthlyLimit,
    monthlyUsed: m.used,
    monthlyRemaining: monthlyLimit == null ? null : Math.max(0, monthlyLimit - m.used),
    resetsAt: dailyLimit == null ? null : resetIso(d.resets_at),
    monthlyResetsAt: resetIso(m.resets_at),
  };
}
