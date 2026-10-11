'use client';
// src/components/admin/EmailQueuePanel.tsx
//
// The announcement queue on the Emails tab: the daily send time, and every
// list that has been loaded with what went, what is waiting and what was left
// out. Nothing in the queue goes out on its own until a send time is saved.
import { useState, useEffect, useCallback } from 'react';
import { Clock, Loader2, Pause, Play, X, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
      const j = await res.json();
      if (!res.ok) { setError(j.error || 'Could not save the time.'); return; }
      setSaved(j.message);
      load();
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
      </div>

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
          <input type="time" step={900} className="input-base w-36" value={draft}
            onChange={e => { setDraft(e.target.value); setSaved(''); }} />
        </label>
        <button type="button" disabled={!draft || saving || draft === sendTime} onClick={saveTime}
          className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-40">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {sendTime ? 'Change time' : 'Set send time'}
        </button>
      </div>
      {sendTime && !saved && (
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
