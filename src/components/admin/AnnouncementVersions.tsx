'use client';

// Which copy the announcement sends: Branded, Plain, or any newsletter.
// Tapping one previews it; "Send this version" makes it the one the queue
// sends from its next batch on.
import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Plus } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import { EMPTY_DRAFT, NewsletterEditor } from '@/components/admin/NewsletterEditor';

type Version = { key: string; name: string };
export type AnnouncementPreview = { subject: string; html: string };

const NEW = '__new';
const BUILT_IN: Version[] = [{ key: 'branded', name: 'Branded' }, { key: 'plain', name: 'Plain' }];

export function AnnouncementVersions({ onPreview, onShowing }: {
  onPreview: (p: AnnouncementPreview) => void;
  /** The version being looked at ('' while writing a new one), for test sends. */
  onShowing: (key: string) => void;
}) {
  const [versions, setVersions] = useState<Version[]>(BUILT_IN);
  const [selected, setSelected] = useState('');
  const [showing, setShowing] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async (show?: string) => {
    const res = await adminFetch('/api/admin/newsletters');
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error || 'Could not load versions.'); return; }
    setVersions([...BUILT_IN, ...j.newsletters.map((n: { id: string; name: string }) => ({ key: n.id, name: n.name }))]);
    setSelected(j.selected);
    setShowing((cur) => show ?? (cur || j.selected));
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    onShowing(showing === NEW ? '' : showing);
    if (!showing || showing === NEW) return;
    let live = true;
    (async () => {
      const res = await adminFetch(`/api/admin/newsletters?preview=${encodeURIComponent(showing)}`);
      const j = await res.json().catch(() => ({}));
      if (live && res.ok) onPreview({ subject: j.subject, html: j.html });
    })();
    return () => { live = false; };
  }, [showing, onPreview, onShowing]);

  async function choose(key: string) {
    setBusy(true); setErr(''); setMsg('');
    const res = await adminFetch('/api/admin/newsletters', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selected: key }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error || 'Could not switch versions.'); return; }
    setSelected(key);
    setMsg(`The queue now sends “${versions.find((v) => v.key === key)?.name}”, starting with its next batch.`);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {versions.map((v) => (
          <button key={v.key} type="button" onClick={() => { setShowing(v.key); setMsg(''); setErr(''); }}
            className={`rounded-full border-2 px-3 py-1.5 text-sm font-semibold inline-flex items-center gap-1.5 ${
              showing === v.key ? 'border-brand-navy bg-brand-navy text-white' : 'border-gray-200 bg-white text-brand-navy hover:border-brand-gold'
            }`}>
            {selected === v.key && <Check className="w-3.5 h-3.5" />}{v.name}
          </button>
        ))}
        <button type="button" onClick={() => { setShowing(NEW); setMsg(''); setErr(''); }}
          className={`rounded-full border-2 border-dashed px-3 py-1.5 text-sm font-semibold inline-flex items-center gap-1 ${
            showing === NEW ? 'border-brand-navy text-brand-navy' : 'border-gray-300 text-gray-500 hover:border-brand-gold'
          }`}>
          <Plus className="w-3.5 h-3.5" /> New version
        </button>
      </div>

      {showing && showing !== NEW && (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {selected === showing ? (
            <p className="text-sm text-emerald-700 inline-flex items-center gap-1"><Check className="w-4 h-4" /> The queue sends this one.</p>
          ) : (
            <button type="button" disabled={busy} onClick={() => choose(showing)}
              className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-40">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send this version
            </button>
          )}
        </div>
      )}

      {showing === NEW && (
        <div className="mt-3">
          <NewsletterEditor initial={EMPTY_DRAFT} onPreview={onPreview} saveLabel="Save version"
            onSaved={async (id) => { await load(id); setMsg('Saved. Tap “Send this version” to use it.'); }} />
        </div>
      )}

      {msg && <p className="text-sm text-emerald-700 mt-2.5">{msg}</p>}
      {err && <p className="text-sm text-red-700 mt-2.5">{err}</p>}
    </div>
  );
}
