'use client';

// How a list email did: every send of it, newest first, with who opened and
// who tapped what, and a spreadsheet of each reader.
import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import type { SendStats } from '@/lib/email-stats';

const day = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT';
const pct = (n: number | null) => (n === null ? '–' : `${n}%`);
const short = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

function Num({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-xl font-bold text-brand-navy leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
}

export function EmailStats({ newsletterKey }: { newsletterKey: string }) {
  const [sends, setSends] = useState<SendStats[] | null>(null);
  const [pick, setPick] = useState(0);
  const [err, setErr] = useState('');
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    setSends(null); setPick(0);
    adminFetch(`/api/admin/email-builder?stats=${encodeURIComponent(newsletterKey)}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!live) return;
      if (!r.ok) setErr(j.error || 'Could not load the numbers.'); else setSends(j.sends);
    });
    return () => { live = false; };
  }, [newsletterKey]);

  async function csv(id: string) {
    const r = await adminFetch(`/api/admin/email-builder?csv=${id}`);
    if (!r.ok) { setErr('Could not make the spreadsheet.'); return; }
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a');
    a.href = url; a.download = `email-stats-${id.slice(0, 8)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (err) return <p className="text-sm text-red-700">{err}</p>;
  if (!sends) return <p className="text-sm text-gray-500 inline-flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" /> Loading the numbers…</p>;
  if (!sends.length) return <p className="text-sm text-gray-500">No sends of this email yet. The numbers show up here once it goes out.</p>;
  const s = sends[pick];
  const noTracking = s.opened.total === 0 && s.clicked.total === 0 && s.delivered === 0;
  const people = all ? s.people : s.people.slice(0, 12);
  const maxRate = Math.max(1, ...sends.map((x) => x.openRate || 0));

  return (
    <div className="flex flex-col gap-3">
      {sends.length > 1 && (
        <select className="input-base text-sm" value={pick} onChange={(e) => { setPick(Number(e.target.value)); setAll(false); }}>
          {sends.map((x, i) => <option key={x.importId} value={i}>{day(x.at)} · {x.sent} sent</option>)}
        </select>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Num label="Sent" value={s.sent} sub={day(s.at)} />
        <Num label="Delivered" value={s.delivered || (noTracking ? '–' : 0)} />
        <Num label="Opened" value={s.opened.unique} sub={`${pct(s.openRate)} · ${s.opened.total} opens`} />
        <Num label="Clicked" value={s.clicked.unique} sub={`${pct(s.clickRate)} · ${s.clicked.total} clicks`} />
        <Num label="Bounced" value={s.bounced} />
        <Num label="Blocked" value={s.blocked} sub="Resend won't send to these" />
        <Num label="Marked spam" value={s.complained} />
        <Num label="Unsubscribed" value={s.unsubscribed} />
      </div>
      <p className="text-xs text-gray-500">
        Opens are a rough count. iPhone and Mac Mail open every email on their own to load its pictures, so opens run high. Clicks are the surest sign someone read it.
        {noTracking && ' Opens, clicks and deliveries start counting once tracking is switched on for the sending address.'}
      </p>

      {s.links.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">What people tapped</p>
          <ul className="flex flex-col gap-1 text-sm">
            {s.links.map((l) => (
              <li key={l.link} className="flex items-baseline gap-2 min-w-0">
                <span className="truncate min-w-0 text-brand-navy" title={l.link}>{short(l.link)}</span>
                <span className="ml-auto shrink-0 text-gray-600">{l.unique} people · {l.total} taps</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.people.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Who opened or tapped</p>
          <ul className="flex flex-col divide-y divide-gray-100 text-sm">
            {people.map((p) => (
              <li key={p.email} className="py-1.5 flex flex-wrap items-baseline gap-x-2 min-w-0">
                <span className="font-semibold text-brand-navy">{p.name || p.email}</span>
                {p.vessel && <span className="text-gray-600">{p.vessel}</span>}
                <span className="ml-auto text-xs text-gray-500">{p.clicks ? `${p.clicks} tap${p.clicks > 1 ? 's' : ''}` : ''}{p.clicks && p.opens ? ' · ' : ''}{p.opens ? `opened ${p.opens}×` : ''}</span>
              </li>
            ))}
          </ul>
          {s.people.length > 12 && !all && <button type="button" onClick={() => setAll(true)} className="text-sm text-brand-navy underline mt-1">Show all {s.people.length}</button>}
        </div>
      )}

      {sends.length > 1 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Opened, send by send</p>
          <div className="flex items-end gap-1 h-16">
            {[...sends].reverse().map((x) => (
              <div key={x.importId} title={`${day(x.at)}: ${pct(x.openRate)} opened, ${pct(x.clickRate)} clicked`} className="flex-1 min-w-[6px] bg-brand-navy/80 rounded-t" style={{ height: `${Math.max(4, ((x.openRate || 0) / maxRate) * 100)}%` }} />
            ))}
          </div>
        </div>
      )}

      <button type="button" onClick={() => csv(s.importId)} className="btn-outline text-sm self-start inline-flex items-center gap-1.5">
        <Download className="w-4 h-4" /> Spreadsheet of every reader
      </button>
    </div>
  );
}
