'use client';

// "Send it": who gets it (everyone subscribed, the people on an earlier send,
// or pasted addresses) and when (now, on a date, every week, every other
// week, Chicago time). Below it, the newsletter's planned sends with exact
// recipient counts, multi-day batch breakdowns, 1-click reschedule, and Pause.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, Loader2, Pause, Play, Send, Trash2, Users } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import {
  buildSendPlan, describeSingleRollout, planCtDay, planCtHm, planDayLabel,
  type PlanScheduleInput,
} from '@/lib/send-plan';

type ContactLite = { email: string; company: string | null; source: string; status: string; has_account?: boolean };
type PastSend = { id: string; subject: string | null; created_at: string; total: number };
type Schedule = {
  id: string; newsletter_key: string; kind: 'once' | 'weekly' | 'biweekly'; next_at: string | null;
  paused: boolean; last_sent_at: string | null; last_error: string | null; recipient_count?: number;
  audience: { fromImport?: string; emails?: string; company?: string; source?: string };
};
type Who = 'all' | 'yes' | 'no' | 'past' | 'paste';
const LIST: Who[] = ['all', 'yes', 'no'];
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

export function NewsletterSendBox({ newsletterKey, newsletterName, allNewsletterNames, subject, onSent }: {
  newsletterKey: string;
  newsletterName?: string;
  allNewsletterNames?: Record<string, string>;
  subject: string;
  onSent: () => void;
}) {
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [past, setPast] = useState<PastSend[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [queueSendTime, setQueueSendTime] = useState('08:30');
  const [who, setWho] = useState<Who>('all');
  const [company, setCompany] = useState('');
  const [source, setSource] = useState('');
  const [pastId, setPastId] = useState('');
  const [pasted, setPasted] = useState('');
  const [when, setWhen] = useState<When>('now');
  const [date, setDate] = useState(tomorrowCt());
  const [time, setTime] = useState('10:00');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('10:00');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadSchedules = useCallback(async () => {
    const j = await adminFetch('/api/admin/newsletter-schedules').then((r) => r.json()).catch(() => ({}));
    setSchedules(j.schedules || []);
    if (typeof j.queueSendTime === 'string' && j.queueSendTime) setQueueSendTime(j.queueSendTime);
  }, []);

  useEffect(() => {
    adminFetch('/api/admin/contacts').then((r) => r.json()).then((j) => setContacts(j.contacts || [])).catch(() => {});
    adminFetch('/api/admin/email-imports').then((r) => r.json()).then((j) => setPast(j.imports || [])).catch(() => {});
    loadSchedules();
    const onUpdate = () => loadSchedules();
    window.addEventListener('gts-schedules-updated', onUpdate);
    return () => window.removeEventListener('gts-schedules-updated', onUpdate);
  }, [loadSchedules]);

  const subscribed = contacts.filter((c) => c.status === 'subscribed');
  const companies = [...new Set(subscribed.map((c) => c.company).filter(Boolean) as string[])].sort();
  const pastSend = past.find((p) => p.id === pastId);
  const pastedCount = pasted.split(/[\s,;]+/).filter((x) => x.includes('@')).length;
  const filtered = subscribed.filter((c) => (!company || c.company === company) && (!source || c.source === source));
  const listCount = (w: Who) => w === 'all' ? filtered.length : filtered.filter((c) => !!c.has_account === (w === 'yes')).length;
  const count = LIST.includes(who) ? listCount(who)
    : who === 'past' ? (pastSend?.total ?? 0) : pastedCount;
  const audience = LIST.includes(who)
    ? { company: company || undefined, source: source || undefined, account: who === 'all' ? undefined : who }
    : who === 'past' ? { fromImport: pastId } : { emails: pasted };
  const mine = schedules.filter((s) => s.newsletter_key === newsletterKey);

  const planMap = useMemo(() => {
    const fallbackCount = subscribed.length || 141;
    const inputs: PlanScheduleInput[] = schedules.map((s) => ({
      id: s.id,
      newsletter_key: s.newsletter_key,
      name: allNewsletterNames?.[s.newsletter_key] || (s.newsletter_key === newsletterKey ? newsletterName || subject || 'Newsletter' : 'Newsletter'),
      next_at: s.next_at,
      paused: s.paused,
      recipientCount: s.recipient_count || fallbackCount,
    }));
    return buildSendPlan({ schedules: inputs, queueSendTime });
  }, [schedules, subscribed.length, allNewsletterNames, newsletterKey, newsletterName, subject, queueSendTime]);

  const draftRollout = useMemo(() => {
    if (!count) return null;
    const startDay = when === 'now' ? planCtDay(new Date()) : date;
    const startTime = when === 'now' ? planCtHm(new Date()) : time;
    return describeSingleRollout({
      recipientCount: count,
      startDay,
      startTime,
      queueSendTime,
      isImmediate: when === 'now',
    });
  }, [count, when, date, time, queueSendTime]);

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
      if (j.queued > 0) parts.push(`${j.queued} queued for tomorrow's batch (${queueSendTime === '08:30' ? '8:30 AM CT' : `${queueSendTime} CT`}).`);
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
    setMsg(`Planned. First batch goes ${ct(j.next_at)}.`);
    await loadSchedules();
    window.dispatchEvent(new Event('gts-schedules-updated'));
  }

  async function setPaused(s: Schedule, paused: boolean) {
    await adminFetch('/api/admin/newsletter-schedules', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, paused }),
    });
    await loadSchedules();
    window.dispatchEvent(new Event('gts-schedules-updated'));
  }

  async function reschedule(id: string, newDate: string, newTime: string) {
    setBusy(true); setErr(''); setMsg('');
    const res = await adminFetch('/api/admin/newsletter-schedules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, date: newDate, time: newTime }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error || 'Could not move schedule.'); return; }
    setEditingId(null);
    setMsg(`Moved to ${planDayLabel(newDate)}.`);
    await loadSchedules();
    window.dispatchEvent(new Event('gts-schedules-updated'));
  }

  async function stop(s: Schedule) {
    if (!window.confirm('Stop this for good? Emails already sent stay sent.')) return;
    await adminFetch(`/api/admin/newsletter-schedules?id=${s.id}`, { method: 'DELETE' });
    await loadSchedules();
    window.dispatchEvent(new Event('gts-schedules-updated'));
  }

  const chip = (on: boolean) => `rounded-lg border-2 px-3 py-2 text-sm font-semibold text-left ${
    on ? 'border-brand-navy bg-brand-navy text-white' : 'border-gray-200 bg-white text-brand-navy hover:border-brand-gold'}`;

  return (
    <div className="rounded-xl border border-gray-200 p-3.5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-brand-navy">Send it</p>
        {count > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-bold text-brand-navy">
            <Users className="w-3.5 h-3.5" /> {count} subscribed {count === 1 ? 'contact' : 'contacts'}
          </span>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-600 mb-1.5">Who gets it <span className="font-normal text-gray-400">(subscribed only)</span></p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button type="button" className={chip(who === 'all')} onClick={() => setWho('all')}>Everyone ({listCount('all')})</button>
          <button type="button" className={chip(who === 'yes')} onClick={() => setWho('yes')}>Has an account ({listCount('yes')})</button>
          <button type="button" className={chip(who === 'no')} onClick={() => setWho('no')}>No account yet ({listCount('no')})</button>
          <button type="button" className={chip(who === 'past')} onClick={() => setWho('past')}>People from an earlier send</button>
          <button type="button" className={chip(who === 'paste')} onClick={() => setWho('paste')}>Paste addresses</button>
        </div>
        {LIST.includes(who) && (
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

      {draftRollout && draftRollout.batches.length > 1 && (
        <div className="rounded-lg bg-blue-50/70 border border-blue-200 px-3 py-2 text-xs text-brand-navy leading-relaxed">
          <b>Automatic 2-day rollout:</b> {draftRollout.summary}
        </div>
      )}

      <button type="button" disabled={busy || !count || (who === 'past' && !pastId)} onClick={go}
        className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-40">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : when === 'now' ? <Send className="w-4 h-4" /> : <CalendarClock className="w-4 h-4" />}
        {when === 'now' ? `Send to ${count} now` : `Plan it for ${count}`}
      </button>
      <p className="text-xs text-gray-500">
        One email each, within the daily limit; any left over go at the daily send time. Unsubscribed and bounced addresses are skipped, and nobody gets the same newsletter twice.
      </p>
      {msg && <p className="text-sm text-emerald-700 font-semibold">{msg}</p>}
      {err && <p className="text-sm text-red-700">{err}</p>}

      {mine.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Planned for this email</p>
          <ul className="flex flex-col gap-2.5">
            {mine.map((s) => {
              const plan = planMap.get(s.id);
              const recCount = s.recipient_count || subscribed.length || 141;
              const isEditing = editingId === s.id;
              return (
                <li key={s.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-brand-navy">
                          {s.kind === 'once' ? 'One-time send' : s.kind === 'weekly' ? 'Every week' : 'Every other week'}
                          {s.paused ? ' · Paused' : ''}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-bold text-brand-navy">
                          <Users className="w-3 h-3" /> {recCount} subscribed contacts
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {s.next_at ? `Scheduled: ${ct(s.next_at)}` : 'Completed'}
                        {s.last_sent_at ? ` · Last sent: ${ct(s.last_sent_at)}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {s.next_at && (
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditing) setEditingId(null);
                            else {
                              setEditingId(s.id);
                              setEditDate(planCtDay(s.next_at!));
                              setEditTime(planCtHm(s.next_at!));
                            }
                          }}
                          className="btn-outline text-xs py-1 px-2.5"
                        >
                          {isEditing ? 'Cancel' : 'Change day'}
                        </button>
                      )}
                      {s.next_at && (
                        <button type="button" onClick={() => setPaused(s, !s.paused)} className="btn-outline text-xs py-1 px-2.5 inline-flex items-center gap-1">
                          {s.paused ? <><Play className="w-3.5 h-3.5" /> Resume</> : <><Pause className="w-3.5 h-3.5" /> Pause</>}
                        </button>
                      )}
                      <button type="button" onClick={() => stop(s)} className="btn-outline text-xs py-1 px-2.5 inline-flex items-center gap-1 text-red-700">
                        <Trash2 className="w-3.5 h-3.5" /> Stop
                      </button>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="flex flex-wrap items-end gap-2 rounded-lg bg-white border border-gray-200 p-2.5">
                      <label className="text-xs text-gray-600">
                        New day
                        <input type="date" className="input-base mt-1 text-xs py-1" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                      </label>
                      <label className="text-xs text-gray-600">
                        Time (CT)
                        <input type="time" className="input-base mt-1 text-xs py-1" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
                      </label>
                      <button
                        type="button"
                        disabled={busy || !editDate}
                        onClick={() => reschedule(s.id, editDate, editTime)}
                        className="btn-primary text-xs py-1.5 px-3"
                      >
                        Save new date
                      </button>
                    </div>
                  )}

                  {plan && !s.paused && (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {plan.batches.map((b, idx) => (
                          <span key={b.day + idx} className="inline-flex items-center gap-1">
                            {idx > 0 && <ArrowRight className="w-3 h-3 text-gray-400" />}
                            <span className={`rounded-md px-2 py-0.5 font-semibold border ${
                              b.isCarryover ? 'bg-white border-gray-200 text-gray-700' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            }`}>
                              ~{b.count} on {b.dayLabel} ({b.timeLabel})
                            </span>
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-gray-700 leading-relaxed">{plan.summary}</p>
                      {plan.overlapNotice && (
                        <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-950 flex flex-col gap-2">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                            <span className="leading-relaxed">{plan.overlapNotice}</span>
                          </div>
                          {plan.suggestedMoveDate && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => reschedule(s.id, plan.suggestedMoveDate!, plan.suggestedMoveTime)}
                              className="self-start rounded-full bg-brand-navy text-white hover:bg-brand-navy/90 px-3 py-1 text-xs font-bold inline-flex items-center gap-1"
                            >
                              <CalendarClock className="w-3.5 h-3.5" /> {plan.suggestedMoveLabel}
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  {s.last_error && <p className="text-xs text-red-700">{s.last_error}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
