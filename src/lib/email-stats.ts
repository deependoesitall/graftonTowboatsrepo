// src/lib/email-stats.ts
// What happened to each list send: sent, delivered, opened, clicked,
// bounced, blocked or marked as spam, unsubscribed. Events come from
// Resend's webhook (table email_events) and our unsubscribe page. Server only.
import { createServiceClient } from '@/lib/supabase/server';

type Supa = ReturnType<typeof createServiceClient>;
export type EventType = 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'unsubscribed';

/** The send a Resend email id belongs to, from the recipient row (or the
 *  tags the email went out with). */
async function owner(supabase: Supa, emailId: string, tags: Record<string, string>): Promise<{ import_id: string | null; newsletter_key: string | null; email: string | null }> {
  if (emailId) {
    const { data } = await supabase.from('email_import_recipients')
      .select('import_id, email, email_imports(newsletter_key)').eq('resend_email_id', emailId).limit(1).maybeSingle();
    if (data) {
      const imp = (data as unknown as { email_imports: { newsletter_key: string | null } | null }).email_imports;
      return { import_id: data.import_id as string, newsletter_key: imp?.newsletter_key ?? tags.newsletter ?? null, email: data.email as string };
    }
  }
  return { import_id: tags.import || null, newsletter_key: tags.newsletter || null, email: null };
}

export function tagMap(raw: unknown): Record<string, string> {
  if (Array.isArray(raw)) return Object.fromEntries(raw.filter((t) => t && t.name).map((t) => [String(t.name), String(t.value ?? '')]));
  if (raw && typeof raw === 'object') return Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]));
  return {};
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function recordEvent(supabase: Supa, e: { type: EventType; emailId?: string; tags?: Record<string, string>; email?: string; link?: string | null; at: string; dedupe?: string }) {
  const o = await owner(supabase, e.emailId || '', e.tags || {});
  const row = {
    type: e.type,
    resend_email_id: e.emailId || null,
    newsletter_key: o.newsletter_key,
    import_id: o.import_id && UUID.test(o.import_id) ? o.import_id : null,
    email: (o.email || e.email || '').toLowerCase() || null,
    link: e.link ? e.link.slice(0, 2000) : null,
    at: e.at,
    dedupe: e.dedupe || null,
  };
  // Not a list email (welcome, sign-in, a test): nothing to count.
  if (!row.import_id && !row.newsletter_key) return false;
  const { error } = await supabase.from('email_events').upsert(row, { onConflict: 'dedupe', ignoreDuplicates: true });
  return !error;
}

/** An unsubscribe counts against the latest list send to that address. */
export async function recordUnsubscribe(supabase: Supa, email: string, at: string) {
  const { data } = await supabase.from('email_import_recipients')
    .select('import_id, resend_email_id, email_imports(newsletter_key)').eq('email', email).eq('status', 'sent')
    .order('sent_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return;
  const imp = (data as unknown as { email_imports: { newsletter_key: string | null } | null }).email_imports;
  await supabase.from('email_events').upsert({
    type: 'unsubscribed', resend_email_id: data.resend_email_id, import_id: data.import_id,
    newsletter_key: imp?.newsletter_key ?? null, email, at, dedupe: `unsub:${data.import_id}:${email}`,
  }, { onConflict: 'dedupe', ignoreDuplicates: true });
}

// ── The stats view ──────────────────────────────────────────────────────

export type Person = { email: string; name: string | null; vessel: string | null; opens: number; clicks: number; links: string[] };
export type SendStats = {
  importId: string; at: string; subject: string | null; newsletterKey: string;
  sent: number; delivered: number; failed: number; bounced: number; blocked: number; complained: number; unsubscribed: number;
  opened: { unique: number; total: number }; clicked: { unique: number; total: number };
  openRate: number | null; clickRate: number | null;
  links: { link: string; unique: number; total: number }[];
  people: Person[];
};

type Ev = { type: EventType; email: string | null; link: string | null; import_id: string | null };
type Rec = { email: string; status: string; error: string | null };

export function summarize(imp: { id: string; created_at: string; subject: string | null; newsletter_key: string | null }, recs: Rec[], evs: Ev[], contacts: Map<string, { name: string | null; vessel: string | null }>): SendStats {
  const sentRows = recs.filter((r) => r.status === 'sent' || r.status === 'failed');
  const failed = recs.filter((r) => r.status === 'failed');
  const blocked = failed.filter((r) => /suppress|block|spam/i.test(r.error || '')).length;
  const by = (t: EventType) => evs.filter((e) => e.type === t);
  const uniq = (xs: Ev[]) => new Set(xs.map((e) => e.email).filter(Boolean)).size;
  const opens = by('opened'), clicks = by('clicked');
  const delivered = uniq(by('delivered'));
  const linkMap = new Map<string, Ev[]>();
  for (const c of clicks) if (c.link) linkMap.set(c.link, [...(linkMap.get(c.link) || []), c]);
  const people = new Map<string, Person>();
  for (const e of [...opens, ...clicks]) {
    if (!e.email) continue;
    const c = contacts.get(e.email);
    const p = people.get(e.email) || { email: e.email, name: c?.name ?? null, vessel: c?.vessel ?? null, opens: 0, clicks: 0, links: [] };
    if (e.type === 'opened') p.opens++;
    else { p.clicks++; if (e.link && !p.links.includes(e.link)) p.links.push(e.link); }
    people.set(e.email, p);
  }
  const base = sentRows.length - failed.length;
  const rate = (n: number) => (base > 0 ? Math.round((n / base) * 1000) / 10 : null);
  return {
    importId: imp.id, at: imp.created_at, subject: imp.subject, newsletterKey: imp.newsletter_key || 'branded',
    sent: sentRows.length, delivered, failed: failed.length,
    bounced: failed.length - blocked, blocked, complained: uniq(by('complained')), unsubscribed: uniq(by('unsubscribed')),
    opened: { unique: uniq(opens), total: opens.length }, clicked: { unique: uniq(clicks), total: clicks.length },
    openRate: rate(uniq(opens)), clickRate: rate(uniq(clicks)),
    links: [...linkMap].map(([link, xs]) => ({ link, unique: uniq(xs), total: xs.length })).sort((a, b) => b.total - a.total),
    people: [...people.values()].sort((a, b) => b.clicks - a.clicks || b.opens - a.opens),
  };
}

async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await q(i, i + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

/** Every send of a newsletter (or every list send if key is omitted),
 *  newest first, up to `limit`. */
export async function loadStats(supabase: Supa, opts: { key?: string | null; importId?: string | null; limit?: number }): Promise<SendStats[]> {
  let q = supabase.from('email_imports').select('id, created_at, subject, newsletter_key').order('created_at', { ascending: false }).limit(opts.limit || 12);
  if (opts.importId) q = q.eq('id', opts.importId);
  else if (opts.key) q = q.eq('newsletter_key', opts.key);
  const { data: imps, error } = await q;
  if (error) throw new Error(error.message);
  if (!imps?.length) return [];
  const ids = imps.map((i) => i.id as string);
  const recs = await all<Rec & { import_id: string }>((a, b) => supabase.from('email_import_recipients').select('import_id, email, status, error').in('import_id', ids).range(a, b));
  const evs = await all<Ev>((a, b) => supabase.from('email_events').select('type, email, link, import_id').in('import_id', ids).range(a, b));
  const emails = [...new Set(evs.map((e) => e.email).filter(Boolean))] as string[];
  const contacts = new Map<string, { name: string | null; vessel: string | null }>();
  for (let i = 0; i < emails.length; i += 200) {
    const { data } = await supabase.from('email_contacts').select('email, name, vessel').in('email', emails.slice(i, i + 200));
    for (const c of data || []) contacts.set(c.email, { name: c.name, vessel: c.vessel });
  }
  return imps.map((imp) => summarize(imp as never, recs.filter((r) => r.import_id === imp.id), evs.filter((e) => e.import_id === imp.id), contacts));
}

const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** One row per reader of a send: what happened to their copy. */
export async function statsCsv(supabase: Supa, importId: string): Promise<string> {
  const recs = await all<Rec & { sent_at: string | null }>((a, b) => supabase.from('email_import_recipients').select('email, status, error, sent_at').eq('import_id', importId).range(a, b));
  const evs = await all<Ev & { at: string }>((a, b) => supabase.from('email_events').select('type, email, link, import_id, at').eq('import_id', importId).range(a, b));
  const contacts = new Map<string, { name: string | null; vessel: string | null }>();
  const emails = recs.map((r) => r.email);
  for (let i = 0; i < emails.length; i += 200) {
    const { data } = await supabase.from('email_contacts').select('email, name, vessel').in('email', emails.slice(i, i + 200));
    for (const c of data || []) contacts.set(c.email, { name: c.name, vessel: c.vessel });
  }
  const head = ['email', 'name', 'boat', 'status', 'sent_at', 'delivered', 'opens', 'first_open', 'clicks', 'links_clicked', 'unsubscribed', 'problem'];
  const rows = recs.map((r) => {
    const mine = evs.filter((e) => e.email === r.email);
    const opens = mine.filter((e) => e.type === 'opened').sort((a, b) => a.at.localeCompare(b.at));
    const clicks = mine.filter((e) => e.type === 'clicked');
    const c = contacts.get(r.email);
    return [r.email, c?.name, c?.vessel, r.status, r.sent_at, mine.some((e) => e.type === 'delivered') ? 'yes' : '', opens.length, opens[0]?.at || '',
      clicks.length, [...new Set(clicks.map((e) => e.link).filter(Boolean))].join(' '), mine.some((e) => e.type === 'unsubscribed') ? 'yes' : '', r.error || ''];
  });
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

export type StatsTotals = {
  sends: number;
  sent: number;
  delivered: number;
  openedUnique: number;
  openedTotal: number;
  clickedUnique: number;
  clickedTotal: number;
  bounced: number;
  blocked: number;
  complained: number;
  unsubscribed: number;
  openRate: number | null;
  clickRate: number | null;
};

/** Aggregate numbers across a list of sends, for the top-level Results & Stats bar. */
export function rollupStats(sends: SendStats[]): StatsTotals {
  let sent = 0, delivered = 0, openedUnique = 0, openedTotal = 0, clickedUnique = 0, clickedTotal = 0;
  let bounced = 0, blocked = 0, complained = 0, unsubscribed = 0, failed = 0;
  for (const s of sends) {
    sent += s.sent;
    delivered += s.delivered;
    openedUnique += s.opened.unique;
    openedTotal += s.opened.total;
    clickedUnique += s.clicked.unique;
    clickedTotal += s.clicked.total;
    bounced += s.bounced;
    blocked += s.blocked;
    complained += s.complained;
    unsubscribed += s.unsubscribed;
    failed += s.failed;
  }
  const base = sent - failed;
  const rate = (n: number) => (base > 0 ? Math.round((n / base) * 1000) / 10 : null);
  return {
    sends: sends.length, sent, delivered, openedUnique, openedTotal, clickedUnique, clickedTotal,
    bounced, blocked, complained, unsubscribed, openRate: rate(openedUnique), clickRate: rate(clickedUnique),
  };
}
