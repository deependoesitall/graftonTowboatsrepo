'use client';

// Newsletters: write several list emails, keep them as drafts, duplicate,
// delete, and send or plan one. The announcement's two copies (Branded,
// Plain) are here too, read-only, so either can go out as its own send.
// Every send uses the same daily-limited queue and shows in its history.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import { EMPTY_DRAFT, NewsletterEditor, type NewsletterDraft } from '@/components/admin/NewsletterEditor';
import { EmailQueuePanel } from '@/components/admin/EmailQueuePanel';
import { EmailPreview } from '@/components/admin/EmailPreview';
import { NewsletterSendBox } from '@/components/admin/NewsletterSendBox';

type Newsletter = NewsletterDraft & { id: string; updated_at: string };
const BUILT_IN = [{ key: 'branded', name: 'Announcement · Branded' }, { key: 'plain', name: 'Announcement · Plain' }];

const NEW = '__new';

export function NewslettersPanel() {
  const [list, setList] = useState<Newsletter[]>([]);
  const [open, setOpen] = useState('');
  const [preview, setPreview] = useState({ subject: '', html: '' });
  const [builtInSubject, setBuiltInSubject] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [historyKey, setHistoryKey] = useState(0);

  const load = useCallback(async (show?: string) => {
    const res = await adminFetch('/api/admin/newsletters');
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error || 'Could not load newsletters.'); return; }
    setList(j.newsletters);
    if (show !== undefined) setOpen(show);
    else setOpen((cur) => cur || j.newsletters[0]?.id || NEW);
  }, []);
  useEffect(() => { load(); }, [load]);
  const builtIn = BUILT_IN.find((b) => b.key === open);
  useEffect(() => {
    if (!builtIn) return;
    adminFetch(`/api/admin/newsletters?preview=${builtIn.key}`).then((r) => r.json()).then((j) => {
      setPreview({ subject: j.subject || '', html: j.html || '' }); setBuiltInSubject(j.subject || '');
    }).catch(() => {});
  }, [builtIn]);

  const current = list.find((n) => n.id === open);
  const initial = useMemo<NewsletterDraft>(() => (current
    ? { id: current.id, name: current.name, subject: current.subject, body: current.body, style: current.style }
    : EMPTY_DRAFT), [current]);

  async function duplicate() {
    if (!current) return;
    const res = await adminFetch('/api/admin/newsletters', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ duplicate: current.id }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { await load(j.id); setMsg('Copied.'); } else setErr(j.error || 'Could not copy.');
  }

  async function remove() {
    if (!current || !window.confirm(`Delete “${current.name}”? Waiting sends of it stop.`)) return;
    await adminFetch(`/api/admin/newsletters?id=${current.id}`, { method: 'DELETE' });
    await load(''); setMsg('Deleted.');
  }

  return (
    <div className="grid gap-6 lg:gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5 min-w-0">
        <div className="flex flex-wrap gap-2">
          {BUILT_IN.map((n) => (
            <button key={n.key} type="button" onClick={() => { setOpen(n.key); setMsg(''); setErr(''); }}
              className={`rounded-full border-2 px-3 py-1.5 text-sm font-semibold ${
                open === n.key ? 'border-brand-navy bg-brand-navy text-white' : 'border-gray-200 bg-gray-50 text-brand-navy hover:border-brand-gold'
              }`}>{n.name}</button>
          ))}
          {list.map((n) => (
            <button key={n.id} type="button" onClick={() => { setOpen(n.id); setMsg(''); setErr(''); }}
              className={`rounded-full border-2 px-3 py-1.5 text-sm font-semibold max-w-full truncate ${
                open === n.id ? 'border-brand-navy bg-brand-navy text-white' : 'border-gray-200 bg-white text-brand-navy hover:border-brand-gold'
              }`}>{n.name}</button>
          ))}
          <button type="button" onClick={() => { setOpen(NEW); setMsg(''); setErr(''); }}
            className={`rounded-full border-2 border-dashed px-3 py-1.5 text-sm font-semibold inline-flex items-center gap-1 ${
              open === NEW ? 'border-brand-navy text-brand-navy' : 'border-gray-300 text-gray-500 hover:border-brand-gold'
            }`}><Plus className="w-3.5 h-3.5" /> New newsletter</button>
        </div>

        {open && !builtIn && (
          <NewsletterEditor key={open} initial={initial} onPreview={setPreview}
            saveLabel={current ? 'Save changes' : 'Save draft'}
            onSaved={async (id) => { await load(id); setMsg('Saved.'); }} />
        )}

        {current && (
          <>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={duplicate} className="btn-outline text-sm inline-flex items-center gap-1.5"><Copy className="w-4 h-4" /> Duplicate</button>
              <button type="button" onClick={remove} className="btn-outline text-sm inline-flex items-center gap-1.5 text-red-700"><Trash2 className="w-4 h-4" /> Delete</button>
            </div>
            <NewsletterSendBox key={current.id} newsletterKey={current.id} subject={current.subject} onSent={() => setHistoryKey((k) => k + 1)} />
          </>
        )}
        {builtIn && (
          <>
            <p className="text-sm text-gray-600">The announcement's built-in wording. For different words, start a new newsletter.</p>
            <NewsletterSendBox key={builtIn.key} newsletterKey={builtIn.key} subject={builtInSubject} onSent={() => setHistoryKey((k) => k + 1)} />
          </>
        )}
        {msg && <p className="text-sm text-emerald-700">{msg}</p>}
        {err && <p className="text-sm text-red-700">{err}</p>}
        <EmailQueuePanel reloadKey={historyKey} />
      </div>
      <EmailPreview subject={preview.subject} html={preview.html} />
    </div>
  );
}
