'use client';

// The email list: everyone a newsletter can go to. Search, filter, add by
// hand or paste/CSV, edit, change status, remove. Addresses that look like
// a scan misread ("m/" in front) are flagged before they're added.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import { looksMisread, parseContactText, type ContactRow } from '@/lib/email-address';

type Contact = {
  email: string; name: string | null; company: string | null; vessel: string | null;
  user_id: string | null; source: 'imported' | 'sign-up' | 'manual';
  status: 'subscribed' | 'unsubscribed' | 'bounced' | 'suppressed'; added_at: string; has_account?: boolean;
};

const STATUS_LABEL: Record<Contact['status'], string> = {
  subscribed: 'Subscribed', unsubscribed: 'Unsubscribed', bounced: 'Bounced', suppressed: 'Blocked',
};
const STATUS_TONE: Record<Contact['status'], string> = {
  subscribed: 'bg-emerald-50 text-emerald-700', unsubscribed: 'bg-gray-100 text-gray-600',
  bounced: 'bg-red-50 text-red-700', suppressed: 'bg-amber-50 text-amber-800',
};
const SOURCE_LABEL: Record<Contact['source'], string> = { imported: 'Imported', 'sign-up': 'Signed up', manual: 'Added by hand' };

export function ContactsPanel() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [account, setAccount] = useState('');
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: '', company: '', vessel: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await adminFetch('/api/admin/contacts');
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { setErr(j.error || 'Could not load the list.'); return; }
    setContacts(j.contacts);
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return contacts.filter((c) => (!status || c.status === status) && (!source || c.source === source)
      && (!account || !!c.has_account === (account === 'yes'))
      && (!s || [c.email, c.name, c.company, c.vessel].some((v) => (v || '').toLowerCase().includes(s))));
  }, [contacts, q, status, source, account]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of contacts) m[c.status] = (m[c.status] || 0) + 1;
    return m;
  }, [contacts]);

  // What adding the pasted text would do, before anything is saved.
  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    const { rows, invalid } = parseContactText(text);
    const have = new Set(contacts.map((c) => c.email));
    const fresh = rows.filter((r) => !have.has(r.email));
    return { fresh, existing: rows.length - fresh.length, invalid, flagged: fresh.filter((r) => looksMisread(r.email)) };
  }, [text, contacts]);

  async function add(rows: ContactRow[]) {
    setBusy(true); setErr(''); setMsg('');
    const res = await adminFetch('/api/admin/contacts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error || 'Could not add.'); return; }
    setMsg(`Added ${j.added}.${j.existing ? ` ${j.existing} were already on the list.` : ''}`);
    setText(''); setAdding(false); load();
  }

  async function patch(email: string, body: Record<string, unknown>) {
    const res = await adminFetch('/api/admin/contacts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, ...body }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error || 'Could not save.'); return; }
    load();
  }
  async function remove(c: Contact) {
    if (!window.confirm(`Remove ${c.email} from the list?`)) return;
    await adminFetch(`/api/admin/contacts?email=${encodeURIComponent(c.email)}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold text-brand-navy">{contacts.length} on the list</span>
        {(['subscribed', 'unsubscribed', 'bounced', 'suppressed'] as const).map((s) => counts[s] ? (
          <span key={s} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[s]}`}>{counts[s]} {STATUS_LABEL[s].toLowerCase()}</span>
        ) : null)}
        <button type="button" onClick={() => setAdding((a) => !a)} className="btn-primary text-sm inline-flex items-center gap-1.5 ml-auto">
          <Plus className="w-4 h-4" /> Add people
        </button>
      </div>

      {adding && (
        <div className="rounded-xl border border-gray-200 p-3.5 flex flex-col gap-2">
          <p className="text-sm font-bold text-brand-navy">Add people</p>
          <p className="text-xs text-gray-500">Paste addresses (one per line), or a spreadsheet saved as CSV with an “email” column. Name, company and boat columns are picked up too.</p>
          <textarea className="input-base min-h-[120px] font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)}
            placeholder={'captain@example.com\ndispatch@example.com'} />
          <label className="btn-outline text-sm inline-flex items-center gap-1.5 w-fit cursor-pointer">
            <Upload className="w-4 h-4" /> Use a CSV file
            <input type="file" accept=".csv,text/csv" className="hidden"
              onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = ''; }} />
          </label>
          {parsed && (
            <div className="text-sm flex flex-col gap-1">
              <p><b>{parsed.fresh.length}</b> new · {parsed.existing} already on the list · {parsed.invalid.length} not an address</p>
              {parsed.invalid.length > 0 && <p className="text-xs text-red-700 break-words">Skipped: {parsed.invalid.slice(0, 10).join(', ')}{parsed.invalid.length > 10 ? '…' : ''}</p>}
              {parsed.flagged.length > 0 && (
                <p className="text-xs text-amber-800 flex items-start gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>These look like a scan misread (“m/” in front). Check them: {parsed.flagged.map((r) => r.email).join(', ')}</span>
                </p>
              )}
              <div className="flex gap-2 mt-1">
                <button type="button" disabled={busy || !parsed.fresh.length} onClick={() => add(parsed.fresh)}
                  className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-40">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />} Add {parsed.fresh.length}
                </button>
                {parsed.flagged.length > 0 && (
                  <button type="button" disabled={busy} onClick={() => add(parsed.fresh.filter((r) => !looksMisread(r.email)))}
                    className="btn-outline text-sm">Add all but the flagged</button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input-base pl-9" placeholder="Search name, address, company, boat" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input-base" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input-base" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">However they joined</option>
          {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input-base" value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="">Account or not</option>
          <option value="yes">Has an account</option>
          <option value="no">No account yet</option>
        </select>
      </div>
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      {err && <p className="text-sm text-red-700">{err}</p>}

      {loading ? <Loader2 className="w-5 h-5 animate-spin text-gray-300" /> : (
        <ul className="flex flex-col divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {shown.slice(0, 500).map((c) => (
            <li key={c.email} className="px-3.5 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {editing === c.email ? (
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 min-w-0">
                  <input className="input-base" placeholder="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                  <input className="input-base" placeholder="Company" value={edit.company} onChange={(e) => setEdit({ ...edit, company: e.target.value })} />
                  <input className="input-base" placeholder="Boat" value={edit.vessel} onChange={(e) => setEdit({ ...edit, vessel: e.target.value })} />
                  <div className="sm:col-span-3 flex gap-2">
                    <button type="button" className="btn-primary text-sm" onClick={async () => { await patch(c.email, edit); setEditing(null); }}>Save</button>
                    <button type="button" className="btn-outline text-sm" onClick={() => setEditing(null)}><X className="w-4 h-4" /></button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm font-semibold text-brand-navy break-all">
                    {c.email}
                    {looksMisread(c.email) && <span className="ml-1.5 text-[11px] font-semibold text-amber-800">check spelling</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {[c.name, c.company, c.vessel].filter(Boolean).join(' · ') || '—'}
                    {c.has_account ? ' · has an account' : ' · no account yet'} · {SOURCE_LABEL[c.source]} · added {new Date(c.added_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              )}
              <select value={c.status} onChange={(e) => patch(c.email, { status: e.target.value })}
                className={`rounded-full border-0 px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[c.status]}`}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              {editing !== c.email && (
                <button type="button" title="Edit" className="p-1.5 text-gray-400 hover:text-brand-navy"
                  onClick={() => { setEditing(c.email); setEdit({ name: c.name || '', company: c.company || '', vessel: c.vessel || '' }); }}>
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              <button type="button" title="Remove" className="p-1.5 text-gray-400 hover:text-red-700" onClick={() => remove(c)}>
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
          {!shown.length && <li className="px-3.5 py-6 text-sm text-gray-500">Nobody matches.</li>}
        </ul>
      )}
      {shown.length > 500 && <p className="text-xs text-gray-500">Showing the first 500. Search to narrow it down.</p>}
    </div>
  );
}
