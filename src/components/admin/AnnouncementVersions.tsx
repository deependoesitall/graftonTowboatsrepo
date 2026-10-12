'use client';

// Which copy of the announcement goes out: Branded, Plain, or one written
// here. Tapping a version previews it; "Send this version" makes it the one
// the queue sends from its next batch on.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, FileUp, Link2, Loader2, Plus, Trash2 } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';

type Version = { key: string; name: string; custom: boolean };
export type AnnouncementPreview = { subject: string; html: string };

const NEW = '__new';
const TOKEN = '{signup_link}';

export function AnnouncementVersions({ onPreview, onShowing }: {
  onPreview: (p: AnnouncementPreview) => void;
  /** The version being looked at ('' while writing a new one), for test sends. */
  onShowing: (key: string) => void;
}) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [selected, setSelected] = useState('');
  const [showing, setShowing] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [format, setFormat] = useState<'text' | 'html'>('text');
  const area = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async (show?: string) => {
    const res = await adminFetch('/api/admin/announcement-versions');
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error || 'Could not load versions.'); return; }
    setVersions(j.versions); setSelected(j.selected);
    setShowing((cur) => show ?? (cur || j.selected));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Preview whatever is being looked at.
  useEffect(() => {
    onShowing(showing === NEW ? '' : showing);
    if (!showing) return;
    let live = true;
    const t = window.setTimeout(async () => {
      const res = showing === NEW
        ? await adminFetch('/api/admin/announcement-versions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preview: { subject, body, format } }),
        })
        : await adminFetch(`/api/admin/announcement-versions?preview=${encodeURIComponent(showing)}`);
      const j = await res.json().catch(() => ({}));
      if (live && res.ok) onPreview({ subject: j.subject, html: j.html });
    }, showing === NEW ? 300 : 0);
    return () => { live = false; window.clearTimeout(t); };
  }, [showing, subject, body, format, onPreview, onShowing]);

  async function choose(key: string) {
    setBusy(true); setErr(''); setMsg('');
    const res = await adminFetch('/api/admin/announcement-versions', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selected: key }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error || 'Could not switch versions.'); return; }
    setSelected(key);
    setMsg(`The queue now sends “${versions.find((v) => v.key === key)?.name}”, starting with its next batch.`);
  }

  async function save() {
    setBusy(true); setErr(''); setMsg('');
    const res = await adminFetch('/api/admin/announcement-versions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, subject, body, format }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error || 'Could not save.'); return; }
    setName(''); setSubject(''); setBody(''); setFormat('text');
    await load(j.key);
    setMsg('Saved. Tap “Send this version” to use it.');
  }

  async function remove(key: string) {
    if (!window.confirm('Delete this version?')) return;
    await adminFetch(`/api/admin/announcement-versions?key=${key}`, { method: 'DELETE' });
    await load(selected === key ? 'branded' : showing === key ? selected : undefined);
  }

  function insertLink() {
    const el = area.current;
    const at = el ? el.selectionStart : body.length;
    const next = body.slice(0, at) + TOKEN + body.slice(el ? el.selectionEnd : at);
    setBody(next);
    window.requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + TOKEN.length, at + TOKEN.length); });
  }

  async function upload(file: File) {
    if (file.size > 100_000) { setErr('That file is too big.'); return; }
    const text = await file.text();
    const isHtml = /\.html?$/i.test(file.name) || /<\/?(p|div|br|html|body|table)\b/i.test(text);
    setFormat(isHtml ? 'html' : 'text');
    setBody(text);
    if (!name) setName(file.name.replace(/\.[^.]+$/, ''));
    const title = text.match(/<title>([^<]*)<\/title>/i);
    if (!subject && title) setSubject(title[1].trim());
  }

  const viewing = versions.find((v) => v.key === showing);

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

      {showing && showing !== NEW && viewing && (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {selected === showing ? (
            <p className="text-sm text-emerald-700 inline-flex items-center gap-1"><Check className="w-4 h-4" /> The queue sends this one.</p>
          ) : (
            <button type="button" disabled={busy} onClick={() => choose(showing)}
              className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-40">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send this version
            </button>
          )}
          {viewing.custom && (
            <button type="button" onClick={() => remove(showing)}
              className="btn-outline text-sm inline-flex items-center gap-1.5 text-red-700">
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          )}
        </div>
      )}

      {showing === NEW && (
        <div className="mt-3 flex flex-col gap-2.5">
          <input className="input-base" placeholder="Name (only you see this)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input-base" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea ref={area} className="input-base min-h-[200px] text-[14px]"
            placeholder={'Hi there.\n\nWrite it like a normal email. Leave a blank line between paragraphs.'}
            value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={insertLink} className="btn-outline text-sm inline-flex items-center gap-1.5">
              <Link2 className="w-4 h-4" /> Insert signup link
            </button>
            <label className="btn-outline text-sm inline-flex items-center gap-1.5 cursor-pointer">
              <FileUp className="w-4 h-4" /> Upload .txt or .html
              <input type="file" accept=".txt,.html,.htm,text/plain,text/html" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
            </label>
            {format === 'html' && (
              <button type="button" onClick={() => setFormat('text')} className="text-xs text-gray-500 underline">
                Treat as plain text
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500">
            {TOKEN} becomes the link to make a boat account. {format === 'html'
              ? 'Uploaded HTML is cleaned: scripts, forms and tracking code are removed.'
              : 'It goes out as a plain email, with links clickable.'}
          </p>
          <button type="button" disabled={busy || !subject.trim() || !body.trim()} onClick={save}
            className="btn-primary text-sm self-start inline-flex items-center gap-1.5 disabled:opacity-40">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save version
          </button>
        </div>
      )}

      {msg && <p className="text-sm text-emerald-700 mt-2.5">{msg}</p>}
      {err && <p className="text-sm text-red-700 mt-2.5">{err}</p>}
    </div>
  );
}
