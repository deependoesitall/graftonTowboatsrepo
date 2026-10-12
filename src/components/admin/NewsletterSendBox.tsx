'use client';

// "Send it": who gets it (everyone subscribed, the people on an earlier send,
// or pasted addresses) and when (now, on a date, every week, every other
// week, Chicago time). Below it, the newsletter's planned sends with Pause.
import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Loader2, Pause, Play, Send, Trash2 } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';

type ContactLite = { email: string; company: string | null; source: string; status: string };
type PastSend = { id: string; subject: string | null; created_at: string; total: number };
type Schedule = {
  id: string; newsletter_key: string; kind: 'once' | 'weekly' | 'biweekly'; next_at: string | null;
  paused: boolean; last_sent_at: string | null; last_error: string | null;
  audience: { fromImport?: string; emails?: string; company?: string; source?: string };
};
type Who = 'all' | 'past' | 'paste';
type When = 'now' | 'once' | 'weekly' | 'biweekly';

const WHEN: { v: When; label: string }[] = [
  { v: 'now', label: 'Now' }, { v: 'once', label: 'On a date' },
  { v: 'weekly', label: 'Every week' }, { v: 'biweekly', label: 'Every other week' },
];

const ct = (iso: string) => new Date(iso).toLocaleString('en-US', {
  timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}) + ' CT';

function tomorrowCt(): string {
  const d = new Date(Date.now() + 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

export function NewsletterSendBox({ newsletterKey, subject, onSent }: {
  newsletterKey: string; subject: string; onSent: () => void;
}) {
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [past, setPast] = useState<PastSend[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [who, setWho] = useState<Who>('all');
  const [company, setCompany] = useState('');
  const [source, setSource] = useState('');
  const [pastId, setPastId] = useState('');
  const [pasted, setPasted] = useState('');
  const [when, setWhen] = useState<When>('now');
  const [date, setDate] = useState(tomorrowCt());
  const [time, setTime] = useState('08:00');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadSchedules = useCallback(async () => {
    const j = await adminFetch('/api/admin/newsletter-schedules').then((r) => r.json()).catch(() => ({}));
    setSchedules(j.schedules || []);
  }, []);
  useEffect(() => {
    adminFetch('/api/admin/contacts').then((r) => r.json()).then((j) => setContacts(j.contacts || [])).catch(() => {});
    adminFetch('/api/admin/email-imports').then((r) => r.json()).then((j) => setPast(j.imports || [])).catch(() => {});
    loadSchedules();
  }, [loadSchedules]);

  const subscribed = contacts.filter((c) => c.status === 'subscribed');
  const companies = [...new Set(subscribed.map((c) => c.company).filter(Boolean) as string[])].sort();
  const pastSend = past.find((p) => p.id === pastId);
  const pastedCount = pasted.split(/[\s,;]+/).filter((x) => x.includes('@')).length;
  const count = who === 'all'
    ? subscribed.filter((c) => (!company || c.company === company) && (!source || c.source === source)).length
    : who === 'past' ? (pastSend?.total ?? 0) : pastedCount;
  const audience = who === 'all' ? { company: company || undefined, source: source || undefined }
    : who === 'past' ? { fromImport: pastId } : { emails: pasted };
  const mine = schedules.filter((s) => s.newsletter_key === newsletterKey);

  async function go() {
    if (!count) return;
    setErr(''); setMsg('');
    if (when === 'now') {
      if (!window.confirm(`Send “${subject}” to ${count} now? As many as today's limit allows go now; the rest go at the daily send time.`)) return;
      setBusy(true);
      const res = await adminFetch('/api/admin/email-imports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newsletter: newsletterKey, audience, sendNow: true }),
      });
      const j = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) { setErr(j.error || 'Send failed.'); return; }
      const parts = [`Sent to ${j.sentNow} now.`];
      if (j.queued > 0) parts.push(`${j.queued} wait for the daily send.`);
      if (j.skipped > 0) parts.push(`${j.skipped} skipped (already got it, unsubscribed or bounced).`);
      if (j.note) parts.push(j.note);
      setMsg(parts.join(' '));
      onSent();
      return;
    }
    setBusy(true);
    const res = await adminFetch('/api/admin/newsletter-schedules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newsletter: newsletterKey, audience, kind: when, date, time }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error || 'Could not plan it.'); return; }
    setMsg(`Planned. First one goes ${ct(j.next_at)}.`);
    loadSchedules();
  }

  async function setPaused(s: Schedule, paused: boolean) {
    await adminFetch('/api/admin/newsletter-schedules', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, paused }),
    });
    loadSchedules();
  }
  async function stop(s: Schedule) {
    if (!window.confirm('Stop this for good? Emails already sent stay sent.')) return;
    await adminFetch(`/api/admin/newsletter-schedules?id=${s.id}`, { method: 'DELETE' });
    loadSchedules();
  }

  const chip = (on: boolean) => `rounded-lg border-2 px-3 py-2 text-sm font-semibold text-left ${
    on ? 'border-brand-navy bg-brand-navy text-white' : 'border-gray-200 bg-white text-brand-navy hover:border-brand-gold'}`;

  return (
    <div className="rounded-xl border border-gray-200 p-3.5 flex flex-col gap-3">
      <p className="text-sm font-bold text-brand-navy">Send it</p>

      <div>
        <p className="text-xs font-semibold text-gray-600 mb-1.5">Who gets it</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button type="button" className={chip(who === 'all')} onClick={() => setWho('all')}>Everyone subscribed</button>
          <button type="button" className={chip(who === 'past')} onClick={() => setWho('past')}>People from an earlier send</button>
          <button type="button" className={chip(who === 'paste')} onClick={() => setWho('paste')}>Paste addresses</button>
        </div>
        {who === 'all' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            <select className="input-base" value={company} onChange={(e) => setCompany(e.target.value)}>
              <option value="">Every company</option>
              {companies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="input-base" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">However they joined</option>
              <option value="imported">Imported</option>
              <option value="sign-up">Signed up</option>
              <option value="manual">Added by hand</option>
            </select>
          </div>
        )}
        {who === 'past' && (
          <select className="input-base mt-2" value={pastId} onChange={(e) => setPastId(e.target.value)}>
            <option value="">Pick a send…</option>
            {past.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.subject || 'Announcement').slice(0, 50)} · {p.total} people · {new Date(p.created_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' })}
              </option>
            ))}
          </select>
        )}
        {who === 'paste' && (
          <textarea className="input-base mt-2 min-h-[90px] font-mono text-xs" placeholder="One address per line"
            value={pasted} onChange={(e) => setPasted(e.target.value)} />
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-600 mb-1.5">When</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {WHEN.map((w) => (
            <button key={w.v} type="button" className={chip(when === w.v)} onClick={() => setWhen(w.v)}>{w.label}</button>
          ))}
        </div>
        {when !== 'now' && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <label className="text-xs text-gray-600">{when === 'once' ? 'Day' : 'First day'}
              <input type="date" className="input-base mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="text-xs text-gray-600">Time (Central)
              <input type="time" className="input-base mt-1" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </div>
        )}
      </div>

      <button type="button" disabled={busy || !count || (who === 'past' && !pastId)} onClick={go}
        className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-40">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : when === 'now' ? <Send className="w-4 h-4" /> : <CalendarClock className="w-4 h-4" />}
        {when === 'now' ? `Send to ${count} now` : `Plan it for ${count}`}
      </button>
      <p className="text-xs text-gray-500">
        One email each, within the daily limit; any left over go at the daily send time. Unsubscribed and bounced addresses are skipped, and nobody gets the same newsletter twice.
      </p>
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      {err && <p className="text-sm text-red-700">{err}</p>}

      {mine.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-600 mb-1.5">Planned</p>
          <ul className="flex flex-col gap-2">
            {mine.map((s) => (
              <li key={s.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[180px]">
                  <p className="font-semibold text-brand-navy">
                    {s.kind === 'once' ? 'Once' : s.kind === 'weekly' ? 'Every week' : 'Every other week'}
                    {s.paused ? ' · paused' : ''}
                  </p>
                  <p className="text-xs text-gray-600">
                    {s.next_at ? `Next: ${ct(s.next_at)}` : 'Done'}
                    {s.last_sent_at ? ` · Last: ${ct(s.last_sent_at)}` : ''}
                  </p>
                  {s.last_error && <p className="text-xs text-red-700">{s.last_error}</p>}
                </div>
                {s.next_at && (
                  <button type="button" onClick={() => setPaused(s, !s.paused)} className="btn-outline text-xs inline-flex items-center gap-1">
                    {s.paused ? <><Play className="w-3.5 h-3.5" /> Resume</> : <><Pause className="w-3.5 h-3.5" /> Pause</>}
                  </button>
                )}
                <button type="button" onClick={() => stop(s)} className="btn-outline text-xs inline-flex items-center gap-1 text-red-700">
                  <Trash2 className="w-3.5 h-3.5" /> Stop
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
