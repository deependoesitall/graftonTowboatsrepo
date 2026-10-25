'use client';

// How a list email did: every send of it, newest first, with who opened and
// who tapped what, a top-level summary across sends, and a 1-click CSV export.
import { useEffect, useState } from 'react';
import { BarChart3, Download, ExternalLink, Loader2, Ship, Users } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import { rollupStats, type SendStats } from '@/lib/email-stats';

const day = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT';
const pct = (n: number | null) => (n === null ? '–' : `${n}%`);
const short = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

function Num({ label, value, sub, tone = 'default' }: { label: string; value: number | string; sub?: string; tone?: 'default' | 'good' | 'warn' }) {
  const ring = tone === 'good' ? 'border-emerald-200 bg-emerald-50/50' : tone === 'warn' ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200 bg-white';
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 min-w-0 shadow-xs ${ring}`}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-2xl font-extrabold text-brand-navy leading-tight mt-0.5">{value}</p>
      {sub && <p className="text-xs font-medium text-gray-600 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

export function ResultsSummaryBar({
  names,
  activeStatsOpen,
  onToggleStats,
  onSelectNewsletter,
}: {
  names: Record<string, string>;
  activeStatsOpen: boolean;
  onToggleStats: () => void;
  onSelectNewsletter: (key: string) => void;
}) {
  const [sends, setSends] = useState<SendStats[] | null>(null);

  useEffect(() => {
    let live = true;
    adminFetch('/api/admin/email-builder?stats=all').then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (live && r.ok) setSends(j.sends || []);
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  const totals = sends ? rollupStats(sends) : null;

  return (
    <div className="rounded-2xl border-2 border-brand-navy/15 bg-white p-3.5 sm:p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-brand-navy text-white grid place-items-center shrink-0">
            <BarChart3 className="w-4 h-4" />
          </span>
          <div>
            <p className="text-sm font-extrabold text-brand-navy leading-tight">Results &amp; Stats</p>
            <p className="text-xs text-gray-500">
              {totals ? (totals.sends ? `Across ${totals.sends} recent send${totals.sends > 1 ? 's' : ''}` : 'Every open, click, bounce, and unsubscribe shows up here') : 'Loading recent sends…'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleStats}
          className={`rounded-full px-3.5 py-1.5 text-xs font-bold inline-flex items-center gap-1.5 transition ${
            activeStatsOpen ? 'bg-brand-navy text-white' : 'bg-amber-100 text-brand-navy hover:bg-brand-gold/40'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          {activeStatsOpen ? 'Hide detailed stats' : 'View detailed stats'}
        </button>
      </div>

      {totals && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-2.5 py-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Sent</p>
            <p className="text-base font-extrabold text-brand-navy">{totals.sent}</p>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-2.5 py-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Delivered</p>
            <p className="text-base font-extrabold text-brand-navy">{totals.delivered}</p>
          </div>
          <div className="rounded-lg bg-emerald-50/60 border border-emerald-200 px-2.5 py-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Unique opens</p>
            <p className="text-base font-extrabold text-brand-navy">{totals.openedUnique} <span className="text-xs font-semibold text-gray-500">({pct(totals.openRate)})</span></p>
          </div>
          <div className="rounded-lg bg-emerald-50/60 border border-emerald-200 px-2.5 py-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Unique clicks</p>
            <p className="text-base font-extrabold text-brand-navy">{totals.clickedUnique} <span className="text-xs font-semibold text-gray-500">({pct(totals.clickRate)})</span></p>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-2.5 py-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Bounces</p>
            <p className="text-base font-extrabold text-brand-navy">{totals.bounced}</p>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-2.5 py-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Unsubscribed</p>
            <p className="text-base font-extrabold text-brand-navy">{totals.unsubscribed}</p>
          </div>
        </div>
      )}

      {sends && sends.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-gray-100 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mr-1">Jump to send:</span>
          {sends.slice(0, 5).map((s) => (
            <button
              key={s.importId}
              type="button"
              onClick={() => onSelectNewsletter(s.newsletterKey)}
              className="rounded-full border border-gray-200 bg-gray-50 hover:border-brand-gold px-2.5 py-1 text-xs font-semibold text-brand-navy inline-flex items-center gap-1.5"
            >
              <span className="truncate max-w-[160px]">{names[s.newsletterKey] || s.subject || 'Announcement'}</span>
              <span className="text-gray-500">· {s.sent} sent · {pct(s.openRate)} open</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function EmailStats({ newsletterKey, title }: { newsletterKey: string; title?: string }) {
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
  if (!sends.length) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        <p className="font-semibold text-brand-navy">No sends of {title ? `“${title}”` : 'this email'} yet</p>
        <p className="text-xs text-gray-500 mt-1">
          As soon as this email goes out, you will see Sent, Delivered, Opened (with open rate), Clicked (with click rate), per-button clicks, which boats opened or clicked, and a 1-click spreadsheet export right here.
        </p>
      </div>
    );
  }
  const s = sends[pick];
  const noTracking = s.opened.total === 0 && s.clicked.total === 0 && s.delivered === 0;
  const people = all ? s.people : s.people.slice(0, 12);
  const maxRate = Math.max(1, ...sends.map((x) => x.openRate || 0));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {sends.length > 1 ? (
          <select className="input-base text-sm max-w-xs" value={pick} onChange={(e) => { setPick(Number(e.target.value)); setAll(false); }}>
            {sends.map((x, i) => <option key={x.importId} value={i}>{day(x.at)} · {x.sent} sent</option>)}
          </select>
        ) : (
          <p className="text-xs font-semibold text-gray-500">Sent {day(s.at)}{s.subject ? ` · “${s.subject}”` : ''}</p>
        )}
        <button type="button" onClick={() => csv(s.importId)} className="btn-outline text-xs sm:text-sm inline-flex items-center gap-1.5">
          <Download className="w-4 h-4" /> Export CSV (every reader)
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <Num label="Sent" value={s.sent} sub={day(s.at)} />
        <Num label="Delivered" value={s.delivered || (noTracking ? '–' : 0)} sub={s.sent ? `${Math.round((s.delivered / s.sent) * 100)}% reached inbox` : undefined} />
        <Num label="Opened" value={s.opened.unique} sub={`${pct(s.openRate)} open rate · ${s.opened.total} total`} tone="good" />
        <Num label="Clicked" value={s.clicked.unique} sub={`${pct(s.clickRate)} click rate · ${s.clicked.total} taps`} tone="good" />
        <Num label="Bounced" value={s.bounced} sub={s.blocked ? `${s.blocked} blocked · ${s.complained} spam` : 'Bad or full inbox'} tone={s.bounced > 0 ? 'warn' : 'default'} />
        <Num label="Unsubscribed" value={s.unsubscribed} sub="Opted out of list" />
      </div>

      <div className="rounded-lg bg-amber-50/70 border border-amber-200/80 px-3 py-2 text-xs text-amber-950 leading-relaxed">
        <strong>About Apple Mail opens:</strong> iPhone and Mac Mail often pre-load pictures automatically, which can make open counts look higher than real human reads. <strong>Button and link clicks</strong> are the surest sign someone read the email.
      </div>

      {s.links.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-3.5 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-500">
            <span>Button / Link</span>
            <span>Unique readers · Total clicks</span>
          </div>
          <ul className="divide-y divide-gray-100 text-sm">
            {s.links.map((l) => (
              <li key={l.link} className="px-3.5 py-2 flex items-center justify-between gap-3 min-w-0">
                <a href={l.link} target="_blank" rel="noreferrer" className="truncate min-w-0 font-semibold text-brand-navy hover:underline inline-flex items-center gap-1" title={l.link}>
                  <span className="truncate">{short(l.link)}</span>
                  <ExternalLink className="w-3 h-3 shrink-0 text-gray-400" />
                </a>
                <span className="shrink-0 text-xs font-bold text-brand-navy bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                  {l.unique} {l.unique === 1 ? 'reader' : 'readers'} · {l.total} {l.total === 1 ? 'click' : 'clicks'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.people.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-3.5 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-500">
            <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Who opened or clicked</span>
            <span>{s.people.length} {s.people.length === 1 ? 'person' : 'people'}</span>
          </div>
          <ul className="divide-y divide-gray-100 text-sm">
            {people.map((p) => (
              <li key={p.email} className="px-3.5 py-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
                <span className="font-semibold text-brand-navy truncate">{p.name || p.email}</span>
                {p.vessel && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-semibold text-brand-navy">
                    <Ship className="w-3 h-3" /> {p.vessel}
                  </span>
                )}
                <span className="ml-auto text-xs font-semibold text-gray-600">
                  {p.clicks ? `${p.clicks} click${p.clicks > 1 ? 's' : ''}` : ''}
                  {p.clicks && p.opens ? ' · ' : ''}
                  {p.opens ? `opened ${p.opens}×` : ''}
                </span>
              </li>
            ))}
          </ul>
          {s.people.length > 12 && !all && (
            <div className="px-3.5 py-2 border-t border-gray-100 bg-gray-50">
              <button type="button" onClick={() => setAll(true)} className="text-xs font-bold text-brand-navy hover:underline">
                Show all {s.people.length} readers
              </button>
            </div>
          )}
        </div>
      )}

      {sends.length > 1 && (
        <div className="rounded-xl border border-gray-200 bg-white p-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Trend across sends (open rate)</p>
          <div className="flex items-end gap-1.5 h-16">
            {[...sends].reverse().map((x) => (
              <div key={x.importId} title={`${day(x.at)}: ${pct(x.openRate)} opened, ${pct(x.clickRate)} clicked`} className="flex-1 min-w-[8px] bg-brand-navy/85 hover:bg-brand-navy rounded-t transition-all" style={{ height: `${Math.max(6, ((x.openRate || 0) / maxRate) * 100)}%` }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
