// src/lib/email-quota.ts
//
// Shared by the Emails page and the send route: how many Resend emails an
// announcement costs, and how many addresses fit in what is left.

/** BCC per email. Resend takes about 50 recipients per email and each one
 *  also carries the GTS inbox in To, so 49 + 1 stays inside it. */
export const BCC_PER_EMAIL = 49;

export type EmailQuota = {
  dailyLimit: number | null;     // null: no daily cap on this plan
  dailyUsed: number;
  dailyRemaining: number | null;
  monthlyLimit: number | null;
  monthlyUsed: number;
  monthlyRemaining: number | null;
  resetsAt: string | null;       // next daily reset (ISO)
  monthlyResetsAt: string | null;
};

/** Resend counts every recipient, plus the GTS copy on each BCC group. */
export function announcementCost(addresses: number): number {
  return addresses > 0 ? addresses + Math.ceil(addresses / BCC_PER_EMAIL) : 0;
}

/** Most addresses whose cost fits in `remaining`. */
export function addressesThatFit(remaining: number): number {
  let n = Math.max(0, remaining);
  while (n > 0 && announcementCost(n) > remaining) n--;
  return n;
}

/** The tighter of the daily and monthly room, and which one it is. */
export function quotaRoom(q: EmailQuota): { left: number; per: 'today' | 'this month'; resetsAt: string | null } | null {
  const d = q.dailyRemaining;
  const m = q.monthlyRemaining;
  if (d != null && (m == null || d <= m)) return { left: d, per: 'today', resetsAt: q.resetsAt };
  if (m != null) return { left: m, per: 'this month', resetsAt: q.monthlyResetsAt };
  return null;
}
