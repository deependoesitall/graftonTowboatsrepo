'use client';
// src/components/admin/EmailQueuePanel.tsx
//
// The send queue and per-recipient progress on the Emails tab: the daily send
// time, a visual progress bar + searchable recipient status list (open by
// default), and every list that has been loaded with what went, what is waiting
// for tomorrow's batch, and what was left out.
import { useState, useEffect, useCallback } from 'react';
import { Clock, Loader2, Pause, Play, X, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, ListChecks, Search } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';

export type QueueImport = {
  id: string; created_by_name: string | null; created_at: string; total: number; subject?: string | null;
  sent: number; pending: number; skipped: number; failed: number; invalid_count: number;
  status: 'queued' | 'sending' | 'paused' | 'done' | 'cancelled';
  last_run_at: string | null; last_error: string | null; next_send_at: string | null;
};

function ct(iso: string, withDay = true): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    ...(withDay ? { weekday: 'short', month: 'short', day: 'numeric' } : {}),
    hour: 'numeric', minute: '2-digit',
  }) + ' CT';
}
/** Every quarter hour, so picking a time is one tap and never half-typed. */
const TIMES = Array.from({ length: 96 }, (_, i) =>
  `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);

function label12(hm: string): string {
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'} CT`;
}

const STATUS: Record<QueueImport['status'], string> = {
  queued: 'bg-brand-sand text-brand-navy',
  sending: 'bg-blue-50 text-blue-700',
  paused: 'bg-amber-50 text-amber-800',
  done: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

function LeftOut({ id }: { id: string }) {
  const [rows, setRows] = useState<{ email: string; status: string; error: string | null }[] | null>(null);
  useEffect(() => {
    adminFetch(`/api/admin/email-imports/${id}`).then(r => r.json()).then(j => setRows(j.rows || [])).catch(() => setRows([]));
  }, [id]);
  if (!rows) return <Loader2 className="w-4 h-4 animate-spin text-gray-300 my-2" />;
  if (!rows.length) return <p className="text-xs text-gray-400 my-2">Nothing was left out.</p>;
  return (
    <ul className="mt-2 max-h-56 overflow-auto rounded-lg border border-gray-100 divide-y divide-gray-100 text-xs">
      {rows.map(r => (
        <li key={r.status + r.email} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
          <span className="font-mono truncate">{r.email}</span>
          <span className={`shrink-0 ${r.status === 'invalid' || r.status === 'failed' ? 'text-red-600' : 'text-gray-500'}`}>
            {r.error || r.status}
          </span>
        </li>
      ))}
    </ul>
  );
}

type Recipient = {
  email: string; status: string; sent_at: string | null; failed_at?: string | null; error: string | null;
  import_id?: string; has_account: boolean; signed_up_at: string | null;
};
type Filter = 'all' | 'notsent' | 'sent' | 'account' | 'failed';
const FILTERS: [Filter, string, (r: Recipient) => boolean][] = [
  ['all', 'All', () => true],
  ['notsent', 'Waiting for next batch', r => r.status === 'pending'],
  ['sent', 'Sent', r => r.status === 'sent'],
  ['account', 'Created account', r => r.has_account],
  ['failed', 'Failed or bounced', r => r.status === 'failed' || r.status === 'invalid'],
];

/** Visual progress bar + searchable per-recipient status list. */
function QueueProgress({ reloadKey, imports }: { reloadKey?: number; imports: QueueImport[] }) {
  const [rows, setRows] = useState<Recipient[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selectedImport, setSelectedImport] = useState<string>('all');

  useEffect(() => {
    adminFetch('/api/admin/email-imports?progress=1').then(r => r.json())
      .then(j => { if (j.recipients) setRows(j.recipients); else setError(j.error || 'Could not load progress.'); })
      .catch(() => setError('Could not load progress.'));
  }, [reloadKey]);

  if (error) return <p className="text-sm text-red-600 mt-3">{error}</p>;
  if (!rows) return <Loader2 className="w-4 h-4 animate-spin text-gray-300 mt-3" />;

  const scopedRows = selectedImport === 'all' ? rows : rows.filter(r => r.import_id === selectedImport);

  // One line per address, the most useful status if it is in two lists.
  const rank: Record<string, number> = { pending: 6, failed: 5, sent: 4, skipped: 2, invalid: 1 };
  const byEmail = new Map<string, Recipient>();
  for (const r of scopedRows) {
    const k = r.email.toLowerCase();
    const cur = byEmail.get(k);
    if (!cur || (rank[r.status] || 0) > (rank[cur.status] || 0)) byEmail.set(k, r);
  }
  const all = Array.from(byEmail.values());
  const count = (f: (r: Recipient) => boolean) => all.filter(f).length;
  const sentCount = count(r => r.status === 'sent');
  const waitingCount = count(r => r.status === 'pending');
  const failedCount = count(r => r.status === 'failed' || r.status === 'invalid');
  const accountCount = count(r => r.has_account);
  const deliverableTotal = Math.max(1, sentCount + waitingCount + failedCount);
  const sentPct = Math.round((sentCount / deliverableTotal) * 100);
  const waitPct = Math.round((waitingCount / deliverableTotal) * 100);
  const failPct = Math.max(0, 100 - sentPct - waitPct);

  const q = search.trim().toLowerCase();
  const shown = all
    .filter(FILTERS.find(f => f[0] === filter)![2])
    .filter(r => !q || r.email.toLowerCase().includes(q));

  const stat = (n: number, label: string, tone: string) => (
    <div className={`rounded-lg px-3 py-2 border ${tone}`}>
      <div className="text-lg font-extrabold leading-none">{n}</div>
      <div className="text-[11px] font-bold uppercase tracking-wide mt-1 opacity-80">{label}</div>
    </div>
  );
  const statusText = (r: Recipient) =>
    r.status === 'sent' ? `Sent ${r.sent_at ? ct(r.sent_at) : ''}`
    : r.status === 'pending' ? 'Waiting for next daily batch'
    : r.status === 'invalid' ? 'Bad address'
    : r.status === 'failed' ? `${r.error || 'Failed'}${r.failed_at ? ` · ${ct(r.failed_at)}` : ''}`
    : `Skipped${r.error ? `: ${r.error}` : ''}`;

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-xs font-bold text-brand-navy">
          Sent {sentCount} of {sentCount + waitingCount} deliverable ({sentPct}%)
          {waitingCount > 0 ? ` · ${waitingCount} waiting for tomorrow's batch` : ''}
          {failedCount > 0 ? ` · ${failedCount} bounced/failed` : ''}
          {accountCount > 0 ? ` · ${accountCount} created an account` : ''}
        </p>
        {imports.length > 1 && (
          <select
            className="input-base text-xs py-1 max-w-[220px]"
            value={selectedImport}
            onChange={(e) => setSelectedImport(e.target.value)}
          >
            <option value="all">All sends combined ({all.length})</option>
            {imports.map((imp) => (
              <option key={imp.id} value={imp.id}>
                {(imp.subject || 'Announcement').slice(0, 32)} · {ct(imp.created_at, false)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="h-2.5 w-full rounded-full bg-gray-200 overflow-hidden flex">
        {sentCount > 0 && (
          <div className="h-full bg-emerald-600 transition-all" style={{ width: `${sentPct}%` }} title={`Sent: ${sentCount}`} />
        )}
        {waitingCount > 0 && (
          <div className="h-full bg-amber-400 transition-all" style={{ width: `${waitPct}%` }} title={`Waiting for next batch: ${waitingCount}`} />
        )}
        {failedCount > 0 && (
          <div className="h-full bg-red-500 transition-all" style={{ width: `${failPct}%` }} title={`Failed/bounced: ${failedCount}`} />
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        {stat(sentCount, 'Sent', 'bg-emerald-50 border-emerald-200 text-emerald-900')}
        {stat(waitingCount, 'Waiting for next batch', 'bg-amber-50 border-amber-200 text-brand-navy')}
        {stat(failedCount, 'Failed / Bounced', 'bg-red-50 border-red-200 text-red-700')}
        {stat(accountCount, 'Accounts created', 'bg-blue-50 border-blue-200 text-blue-900')}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(([k, label, f]) => (
            <button key={k} type="button" onClick={() => setFilter(k)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold border ${
                filter === k ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-gold'
              }`}>
              {label} <span className="opacity-70">({count(f)})</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-[180px] flex-1 sm:max-w-[220px]">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            placeholder="Search email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base text-xs pl-8 py-1 w-full"
          />
        </div>
      </div>

      <ul className="mt-2 max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white divide-y divide-gray-100 text-xs">
        {!shown.length && <li className="px-2.5 py-2 text-gray-400">No addresses match this filter.</li>}
        {shown.map(r => (
          <li key={r.email} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-2.5 py-1.5">
            <span className="font-mono truncate min-w-0">{r.email}</span>
            <span className="flex items-center gap-2 shrink-0">
              <span className={r.status === 'sent' ? 'text-emerald-700 font-medium' : r.status === 'pending' ? 'text-amber-800 font-semibold'
                : r.status === 'skipped' ? 'text-gray-400' : 'text-red-600'}>{statusText(r)}</span>
              {r.has_account && (
                <span className="rounded-full bg-blue-50 text-blue-800 px-2 py-0.5 font-semibold">
                  Account{r.signed_up_at ? ` · signed up ${new Date(r.signed_up_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-gray-500 mt-1.5">
        Failed includes addresses that bounced or marked it as spam, as Resend reports them, usually within minutes of the send.
      </p>
    </div>
  );
}

export function EmailQueuePanel({ reloadKey }: { reloadKey?: number }) {
  const [sendTime, setSendTime] = useState<string | null>(null);
  const [nextRunAt, setNextRunAt] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [imports, setImports] = useState<QueueImport[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showProgress, setShowProgress] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/email-imports');
      const j = await res.json();
      if (!res.ok) { setError(j.error || 'Could not load the queue.'); return; }
      setSendTime(j.settings.sendTime);
      setNextRunAt(j.settings.nextRunAt);
      setDraft(d => d || j.settings.sendTime || '');
      setImports(j.imports);
    } catch {
      setError('Could not load the queue.');
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => { load(); }, [load, reloadKey]);

  async function saveTime() {
    setSaving(true); setSaved(''); setError('');
    try {
      const res = await adminFetch('/api/admin/email-imports', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sendTime: draft }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.message) { setError(`Not saved: ${j.error || `the server answered ${res.status}`}. Try again.`); return; }
      setSaved(j.message);
      load();
      window.dispatchEvent(new Event('gts-schedules-updated'));
    } catch {
      setError('Not saved: could not reach the server. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function act(id: string, action: 'pause' | 'resume' | 'cancel') {
    if (action === 'cancel' && !window.confirm('Cancel this list? The addresses still waiting will not be sent.')) return;
    setBusy(id + action); setError('');
    try {
      const res = await adminFetch(`/api/admin/email-imports/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      });
      const j = await res.json();
      if (!res.ok) setError(j.error || 'Could not change that list.');
      load();
    } finally {
      setBusy(null);
    }
  }

  const waiting = imports.reduce((n, i) => n + (i.status === 'queued' || i.status === 'sending' ? i.pending : 0), 0);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-brand-gold" />
        <h2 className="text-sm font-bold text-brand-navy">Send Progress &amp; Daily Queue</h2>
        <button type="button" onClick={() => setShowProgress(v => !v)}
          className="ml-auto btn-outline text-xs inline-flex items-center gap-1 py-1">
          <ListChecks className="w-3.5 h-3.5" /> {showProgress ? 'Hide recipient list' : 'Show recipient list'}
        </button>
      </div>
      {showProgress && <QueueProgress reloadKey={reloadKey} imports={imports} />}

      {loaded && !sendTime && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <b>Not sending yet.</b> {waiting ? `${waiting} ${waiting === 1 ? 'address is' : 'addresses are'} waiting. ` : ''}
            Set a daily send time below and the queue will start at the next one.
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-[13px] text-gray-600">
          <span className="block mb-1 font-semibold text-brand-navy">Send remaining daily batches at (CT)</span>
          <select className="input-base w-40" value={draft}
            onChange={e => { setDraft(e.target.value); setSaved(''); setError(''); }}>
            <option value="">Pick a time</option>
            {sendTime && !TIMES.includes(sendTime) && <option value={sendTime}>{label12(sendTime)}</option>}
            {TIMES.map(t => <option key={t} value={t}>{label12(t)}</option>)}
          </select>
        </label>
        <button type="button" disabled={!draft || saving || draft === sendTime} onClick={saveTime}
          className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-40">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {sendTime ? 'Change time' : 'Set send time'}
        </button>
      </div>
      {!!draft && draft !== sendTime && !saving && (
        <p className="text-xs font-semibold text-amber-700 mt-2">
          Not saved yet. Tap {sendTime ? 'Change time' : 'Set send time'} to save {label12(draft)}.
        </p>
      )}
      {sendTime && !saved && draft === sendTime && (
        <p className="text-xs text-gray-500 mt-2">
          Sends leftover batches every day at {label12(sendTime)}, up to Resend&apos;s daily 100-email limit.
          {nextRunAt && waiting > 0 && <> Next batch: {ct(nextRunAt)}.</>}
        </p>
      )}
      {saved && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /><span>{saved}</span>
        </div>
      )}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

      <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400 mt-5 mb-2">Past &amp; Active Sends</h3>
      {!loaded ? <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
        : !imports.length ? <p className="text-xs text-gray-400">None yet.</p>
        : (
        <ul className="flex flex-col gap-2">
          {imports.map(i => {
            const live = i.status === 'queued' || i.status === 'sending';
            const denom = Math.max(1, i.sent + i.pending + i.failed);
            const pctSent = Math.round((i.sent / denom) * 100);
            const pctWait = Math.round((i.pending / denom) * 100);
            return (
              <li key={i.id} className="rounded-lg border border-gray-200 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13px] font-semibold text-brand-navy">{i.created_by_name || 'GTS'}</span>
                  <span className="text-xs text-gray-400">{ct(i.created_at)}</span>
                  <span className={`ml-auto text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${STATUS[i.status]}`}>{i.status}</span>
                </div>
                {i.subject && <p className="text-xs font-semibold text-brand-navy mt-1 truncate">{i.subject}</p>}
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden flex">
                  {i.sent > 0 && <div className="h-full bg-emerald-600" style={{ width: `${pctSent}%` }} />}
                  {i.pending > 0 && <div className="h-full bg-amber-400" style={{ width: `${pctWait}%` }} />}
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  {i.total} total · <b>{i.sent}</b> sent ({pctSent}%) · <b>{i.pending}</b> waiting for next batch · {i.skipped} skipped · {i.invalid_count} invalid
                  {i.failed ? <> · <span className="text-red-600">{i.failed} failed</span></> : null}
                </p>
                {live && i.pending > 0 && (
                  <p className="text-xs font-semibold text-amber-800 mt-0.5">
                    {sendTime ? (i.next_send_at ? <>Next batch ({i.pending} remaining) goes out {ct(i.next_send_at)}</> : null) : 'Waiting for a daily send time'}
                  </p>
                )}
                {i.last_error && <p className="text-xs text-red-600 mt-0.5">Last run: {i.last_error}</p>}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {live && i.pending > 0 && (
                    <button type="button" disabled={!!busy} onClick={() => act(i.id, 'pause')} className="btn-outline text-xs inline-flex items-center gap-1 py-1">
                      <Pause className="w-3 h-3" /> Pause
                    </button>
                  )}
                  {i.status === 'paused' && (
                    <button type="button" disabled={!!busy} onClick={() => act(i.id, 'resume')} className="btn-outline text-xs inline-flex items-center gap-1 py-1">
                      <Play className="w-3 h-3" /> Resume
                    </button>
                  )}
                  {(live || i.status === 'paused') && i.pending > 0 && (
                    <button type="button" disabled={!!busy} onClick={() => act(i.id, 'cancel')} className="btn-outline text-xs inline-flex items-center gap-1 py-1 text-red-600">
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  )}
                  {(i.skipped + i.invalid_count + i.failed) > 0 && (
                    <button type="button" onClick={() => setOpen(open === i.id ? null : i.id)}
                      className="text-xs text-gray-500 hover:text-brand-navy inline-flex items-center gap-0.5">
                      {open === i.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      Skipped and invalid
                    </button>
                  )}
                </div>
                {open === i.id && <LeftOut id={i.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
