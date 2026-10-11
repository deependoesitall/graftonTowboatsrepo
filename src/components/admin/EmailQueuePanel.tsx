'use client';
// src/components/admin/EmailQueuePanel.tsx
//
// The announcement queue on the Emails tab: the daily send time, and every
// list that has been loaded with what went, what is waiting and what was left
// out. Nothing in the queue goes out on its own until a send time is saved.
import { useState, useEffect, useCallback } from 'react';
import { Clock, Loader2, Pause, Play, X, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, ListChecks } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';

export type QueueImport = {
  id: string; created_by_name: string | null; created_at: string; total: number;
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
  email: string; status: string; sent_at: string | null; error: string | null;
  has_account: boolean; signed_up_at: string | null;
};
type Filter = 'all' | 'notsent' | 'noaccount' | 'account' | 'failed';
const FILTERS: [Filter, string, (r: Recipient) => boolean][] = [
  ['all', 'All', () => true],
  ['notsent', 'Not sent', r => r.status === 'pending'],
  ['noaccount', 'Sent but no account', r => r.status === 'sent' && !r.has_account],
  ['account', 'Created account', r => r.has_account],
  ['failed', 'Failed or bad address', r => r.status === 'failed' || r.status === 'invalid'],
];

/** Every queued address: sent when, still waiting, or failed, and whether
 *  that address has made an account since. */
function QueueProgress({ reloadKey }: { reloadKey?: number }) {
  const [rows, setRows] = useState<Recipient[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  useEffect(() => {
    adminFetch('/api/admin/email-imports?progress=1').then(r => r.json())
      .then(j => { if (j.recipients) setRows(j.recipients); else setError(j.error || 'Could not load progress.'); })
      .catch(() => setError('Could not load progress.'));
  }, [reloadKey]);
  if (error) return <p className="text-sm text-red-600 mt-3">{error}</p>;
  if (!rows) return <Loader2 className="w-4 h-4 animate-spin text-gray-300 mt-3" />;

  // One line per address, the most useful status if it is in two lists.
  const rank: Record<string, number> = { sent: 5, pending: 4, failed: 3, skipped: 2, invalid: 1 };
  const byEmail = new Map<string, Recipient>();
  for (const r of rows) {
    const k = r.email.toLowerCase();
    const cur = byEmail.get(k);
    if (!cur || (rank[r.status] || 0) > (rank[cur.status] || 0)) byEmail.set(k, r);
  }
  const all = Array.from(byEmail.values());
  const count = (f: (r: Recipient) => boolean) => all.filter(f).length;
  const shown = all.filter(FILTERS.find(f => f[0] === filter)![2]);
  const stat = (n: number, label: string, tone: string) => (
    <div className={`rounded-lg px-3 py-2 ${tone}`}>
      <div className="text-lg font-bold leading-none">{n}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide mt-1 opacity-75">{label}</div>
    </div>
  );
  const statusText = (r: Recipient) =>
    r.status === 'sent' ? `Sent ${r.sent_at ? ct(r.sent_at) : ''}`
    : r.status === 'pending' ? 'Not sent yet'
    : r.status === 'invalid' ? 'Bad address'
    : r.status === 'failed' ? `Failed${r.error ? `: ${r.error}` : ''}`
    : `Skipped${r.error ? `: ${r.error}` : ''}`;

  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {stat(count(r => r.status === 'sent'), 'Sent', 'bg-emerald-50 text-emerald-800')}
        {stat(count(r => r.status === 'pending'), 'Waiting', 'bg-brand-sand text-brand-navy')}
        {stat(count(r => r.status === 'failed' || r.status === 'invalid'), 'Failed', 'bg-red-50 text-red-700')}
        {stat(count(r => r.has_account), 'Accounts created', 'bg-blue-50 text-blue-800')}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {FILTERS.map(([k, label, f]) => (
          <button key={k} type="button" onClick={() => setFilter(k)}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold border ${
              filter === k ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-gold'
            }`}>
            {label} <span className="opacity-60">{count(f)}</span>
          </button>
        ))}
      </div>
      <ul className="mt-2 max-h-96 overflow-auto rounded-lg border border-gray-100 divide-y divide-gray-100 text-xs">
        {!shown.length && <li className="px-2.5 py-2 text-gray-400">No addresses here.</li>}
        {shown.map(r => (
          <li key={r.email} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-2.5 py-1.5">
            <span className="font-mono truncate min-w-0">{r.email}</span>
            <span className="flex items-center gap-2 shrink-0">
              <span className={r.status === 'sent' ? 'text-emerald-700' : r.status === 'pending' ? 'text-gray-500'
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
      <p className="text-[11px] text-gray-400 mt-1.5">
        Failed means Resend refused the send. Bounces after delivery show in Resend, not here.
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
  const [showProgress, setShowProgress] = useState(false);

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
        <h2 className="text-sm font-bold text-brand-navy">Announcement queue</h2>
        <button type="button" onClick={() => setShowProgress(v => !v)}
          className="ml-auto btn-outline text-xs inline-flex items-center gap-1 py-1">
          <ListChecks className="w-3.5 h-3.5" /> {showProgress ? 'Hide progress' : 'See progress'}
        </button>
      </div>
      {showProgress && <QueueProgress reloadKey={reloadKey} />}

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
          <span className="block mb-1 font-semibold text-brand-navy">Send daily at (CT)</span>
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
          Sends every day at {label12(sendTime)}, as many as Resend allows that day.
          {nextRunAt && waiting > 0 && <> Next: {ct(nextRunAt)}.</>}
        </p>
      )}
      {saved && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /><span>{saved}</span>
        </div>
      )}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

      <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400 mt-5 mb-2">Lists loaded</h3>
      {!loaded ? <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
        : !imports.length ? <p className="text-xs text-gray-400">None yet.</p>
        : (
        <ul className="flex flex-col gap-2">
          {imports.map(i => {
            const live = i.status === 'queued' || i.status === 'sending';
            return (
              <li key={i.id} className="rounded-lg border border-gray-100 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13px] font-semibold text-brand-navy">{i.created_by_name || 'GTS'}</span>
                  <span className="text-xs text-gray-400">{ct(i.created_at)}</span>
                  <span className={`ml-auto text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${STATUS[i.status]}`}>{i.status}</span>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  {i.total} total · <b>{i.sent}</b> sent · <b>{i.pending}</b> remaining · {i.skipped} skipped · {i.invalid_count} invalid
                  {i.failed ? <> · <span className="text-red-600">{i.failed} failed</span></> : null}
                </p>
                {live && i.pending > 0 && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {sendTime ? (i.next_send_at ? <>Next send {ct(i.next_send_at)}</> : null) : 'Waiting for a daily send time'}
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
