'use client';

// On a send day: what goes out today and when, with Pause one tap away.
import { useEffect, useState } from 'react';
import { CalendarClock, Pause } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';

type Schedule = { id: string; newsletter_key: string; next_at: string | null; paused: boolean };
const TZ = 'America/Chicago';
const dayOf = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) + ' CT';
const BUILT_IN: Record<string, string> = { branded: 'The announcement (Branded)', plain: 'The announcement (Plain)' };

export function SendDayReminder() {
  const [today, setToday] = useState<(Schedule & { name: string })[]>([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    Promise.all([
      adminFetch('/api/admin/newsletter-schedules').then((r) => r.json()),
      adminFetch('/api/admin/newsletters').then((r) => r.json()),
    ]).then(([s, n]) => {
      const names = new Map<string, string>((n.newsletters || []).map((x: { id: string; name: string }) => [x.id, x.name]));
      const now = new Date();
      setToday((s.schedules || [] as Schedule[])
        .filter((x: Schedule) => !x.paused && x.next_at && dayOf(new Date(x.next_at)) === dayOf(now) && new Date(x.next_at) > now)
        .map((x: Schedule) => ({ ...x, name: BUILT_IN[x.newsletter_key] || names.get(x.newsletter_key) || 'A newsletter' })));
    }).catch(() => {});
  }, []);

  async function pause(id: string) {
    const r = await adminFetch('/api/admin/newsletter-schedules', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, paused: true }) });
    if (r.ok) { setToday((t) => t.filter((x) => x.id !== id)); setMsg('Paused. Start it again from the Newsletters tab.'); }
    else setMsg('Could not pause it. Try again.');
  }

  if (!today.length && !msg) return null;
  return (
    <div className="mb-4 -mt-2 flex flex-col gap-1.5">
      {today.map((x) => (
        <div key={x.id} className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex flex-wrap items-center gap-2 text-sm text-amber-900">
          <CalendarClock className="w-4 h-4 shrink-0" />
          <span className="min-w-0"><b>{x.name}</b> goes out today at {time(x.next_at!)}.</span>
          <button type="button" onClick={() => pause(x.id)} className="ml-auto rounded-full bg-white border border-amber-300 px-3 py-1 text-xs font-bold inline-flex items-center gap-1 hover:bg-amber-100">
            <Pause className="w-3.5 h-3.5" /> Pause
          </button>
        </div>
      ))}
      {msg && <p className="text-xs text-gray-600">{msg}</p>}
    </div>
  );
}
