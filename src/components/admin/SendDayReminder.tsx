'use client';

// Upcoming and today's scheduled sends at the top of the Emails page: shows
// who gets each email, how the daily 100-email Resend limit splits a large
// list across days, any back-to-back overlap heads-up, and 1-click Move or
// Pause buttons so GTS staff see the full rollout without guessing.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Loader2, Pause, Play, Users } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import { buildSendPlan, planDayLabel, type PlanScheduleInput } from '@/lib/send-plan';

type ScheduleRow = {
  id: string;
  newsletter_key: string;
  next_at: string | null;
  paused: boolean;
  recipient_count?: number;
};

const TZ = 'America/Chicago';
const ctFull = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }) + ' CT';
const BUILT_IN: Record<string, string> = {
  branded: 'Announcement · Branded',
  plain: 'Announcement · Plain',
};

export function SendDayReminder() {
  const [schedules, setSchedules] = useState<(ScheduleRow & { name: string })[]>([]);
  const [subscribedCount, setSubscribedCount] = useState(141);
  const [queueSendTime, setQueueSendTime] = useState('08:30');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const [sRes, nRes] = await Promise.all([
        adminFetch('/api/admin/newsletter-schedules').then((r) => r.json()),
        adminFetch('/api/admin/newsletters').then((r) => r.json()),
      ]);
      const names = new Map<string, string>(
        (nRes.newsletters || []).map((x: { id: string; name: string }) => [x.id, x.name])
      );
      if (typeof sRes.subscribedCount === 'number' && sRes.subscribedCount > 0) {
        setSubscribedCount(sRes.subscribedCount);
      }
      if (typeof sRes.queueSendTime === 'string' && sRes.queueSendTime) {
        setQueueSendTime(sRes.queueSendTime);
      }
      const rows = ((sRes.schedules || []) as ScheduleRow[])
        .filter((x) => x.next_at)
        .sort((a, b) => Date.parse(a.next_at!) - Date.parse(b.next_at!))
        .map((x) => ({
          ...x,
          name: BUILT_IN[x.newsletter_key] || names.get(x.newsletter_key) || 'Newsletter',
        }));
      setSchedules(rows);
    } catch {
      /* ignore background poll failure */
    }
  }, []);

  useEffect(() => {
    load();
    const onUpdate = () => load();
    window.addEventListener('gts-schedules-updated', onUpdate);
    return () => window.removeEventListener('gts-schedules-updated', onUpdate);
  }, [load]);

  const planMap = useMemo(() => {
    const inputs: PlanScheduleInput[] = schedules.map((s) => ({
      id: s.id,
      newsletter_key: s.newsletter_key,
      name: s.name,
      next_at: s.next_at,
      paused: s.paused,
      recipientCount: s.recipient_count || subscribedCount || 141,
    }));
    return buildSendPlan({ schedules: inputs, queueSendTime });
  }, [schedules, subscribedCount, queueSendTime]);

  const overlappingMoves = useMemo(() => {
    const out: { id: string; date: string; time: string }[] = [];
    for (const s of schedules) {
      if (s.paused) continue;
      const p = planMap.get(s.id);
      if (p?.suggestedMoveDate) {
        out.push({ id: s.id, date: p.suggestedMoveDate, time: p.suggestedMoveTime });
      }
    }
    return out;
  }, [schedules, planMap]);

  async function togglePause(s: ScheduleRow, paused: boolean) {
    setBusyId(s.id); setMsg(''); setErr('');
    const r = await adminFetch('/api/admin/newsletter-schedules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, paused }),
    });
    setBusyId(null);
    if (r.ok) {
      setMsg(paused ? 'Paused.' : 'Resumed.');
      await load();
      window.dispatchEvent(new Event('gts-schedules-updated'));
    } else setErr('Could not update schedule.');
  }

  async function moveOne(id: string, date: string, time: string) {
    setBusyId(id); setMsg(''); setErr('');
    const r = await adminFetch('/api/admin/newsletter-schedules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, date, time }),
    });
    setBusyId(null);
    if (r.ok) {
      setMsg(`Moved to ${planDayLabel(date)}.`);
      await load();
      window.dispatchEvent(new Event('gts-schedules-updated'));
    } else {
      const j = await r.json().catch(() => ({}));
      setErr(j.error || 'Could not move schedule.');
    }
  }

  async function spaceAllOut() {
    if (!overlappingMoves.length) return;
    setBusyId('__all'); setMsg(''); setErr('');
    const r = await adminFetch('/api/admin/newsletter-schedules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moves: overlappingMoves }),
    });
    setBusyId(null);
    if (r.ok) {
      setMsg('Spaced out so each email finishes its 2-day send before the next one starts.');
      await load();
      window.dispatchEvent(new Event('gts-schedules-updated'));
    } else setErr('Could not space out schedules.');
  }

  if (!schedules.length && !msg && !err) return null;

  return (
    <div className="mb-5 -mt-1 rounded-2xl border-2 border-brand-navy/15 bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-brand-navy text-brand-yellow grid place-items-center shrink-0">
            <CalendarClock className="w-4 h-4" />
          </span>
          <div>
            <h2 className="text-sm font-extrabold text-brand-navy leading-tight">
              Planned Sends &amp; Daily Batch Rollout ({schedules.length} scheduled)
            </h2>
            <p className="text-xs text-gray-500">
              Resend sends up to 100 emails/day (~95 list contacts/day). Lists over ~95 send their first batch on schedule and finish automatically the next morning at {queueSendTime === '08:30' ? '8:30 AM CT' : `${queueSendTime} CT`}.
            </p>
          </div>
        </div>
        {overlappingMoves.length > 1 && (
          <button
            type="button"
            disabled={busyId === '__all'}
            onClick={spaceAllOut}
            className="rounded-full bg-brand-navy text-white hover:bg-brand-navy/90 px-3.5 py-1.5 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {busyId === '__all' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
            Space all {schedules.length} sends 2 days apart
          </button>
        )}
      </div>

      <ul className="mt-3 flex flex-col gap-2.5">
        {schedules.map((s) => {
          const plan = planMap.get(s.id);
          const count = s.recipient_count || subscribedCount || 141;
          return (
            <li key={s.id} className="rounded-xl border border-gray-200 bg-gray-50/70 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="font-extrabold text-brand-navy truncate">“{s.name}”</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-bold text-brand-navy">
                    <Users className="w-3 h-3" /> {count} subscribed contacts
                  </span>
                  <span className="text-xs font-semibold text-gray-600">
                    Scheduled: {ctFull(s.next_at!)}
                    {s.paused ? ' (Paused)' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {plan?.suggestedMoveDate && !s.paused && (
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => moveOne(s.id, plan.suggestedMoveDate!, plan.suggestedMoveTime)}
                      className="rounded-full bg-amber-100 border border-amber-300 hover:bg-amber-200 px-3 py-1 text-xs font-bold text-brand-navy inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      {busyId === s.id && <Loader2 className="w-3 h-3 animate-spin" />}
                      {plan.suggestedMoveLabel}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() => togglePause(s, !s.paused)}
                    className="rounded-full bg-white border border-gray-300 px-2.5 py-1 text-xs font-bold text-brand-navy inline-flex items-center gap-1 hover:border-brand-gold"
                  >
                    {s.paused ? <><Play className="w-3 h-3" /> Resume</> : <><Pause className="w-3 h-3" /> Pause</>}
                  </button>
                </div>
              </div>

              {plan && !s.paused && (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                    {plan.batches.map((b, idx) => (
                      <span key={b.day + idx} className="inline-flex items-center gap-1.5">
                        {idx > 0 && <ArrowRight className="w-3 h-3 text-gray-400" />}
                        <span className={`rounded-lg px-2.5 py-1 font-semibold border ${
                          b.isCarryover
                            ? 'bg-white border-gray-200 text-gray-700'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        }`}>
                          Batch {idx + 1}: <b>~{b.count}</b> on {b.dayLabel} at {b.timeLabel}
                        </span>
                      </span>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-gray-700 leading-relaxed">{plan.summary}</p>
                  {plan.overlapNotice && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-950 leading-relaxed">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <span>{plan.overlapNotice}</span>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {msg && (
        <p className="mt-2.5 text-xs font-semibold text-emerald-700 inline-flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" /> {msg}
        </p>
      )}
      {err && <p className="mt-2.5 text-xs font-semibold text-red-700">{err}</p>}
    </div>
  );
}
