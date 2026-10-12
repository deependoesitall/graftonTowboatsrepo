'use client';

// Write or edit one list email: subject, body (typed, or the text of an
// uploaded Word or PDF file to review),
// the signup link, and Plain or Branded style. Renders a live preview
// through onPreview as you type.
import { useEffect, useRef, useState } from 'react';
import { FileUp, Link2, Loader2 } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import { fileText } from '@/lib/doc-text';

export type NewsletterDraft = {
  id?: string; name: string; subject: string; body: string; style: 'plain' | 'branded';
};
export const EMPTY_DRAFT: NewsletterDraft = { name: '', subject: '', body: '', style: 'plain' };

const TOKEN = '{signup_link}';

export function NewsletterEditor({ initial, onPreview, onSaved, saveLabel = 'Save' }: {
  initial: NewsletterDraft;
  onPreview: (p: { subject: string; html: string }) => void;
  onSaved: (id: string) => void;
  saveLabel?: string;
}) {
  const [d, setD] = useState<NewsletterDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const set = (p: Partial<NewsletterDraft>) => { setD((x) => ({ ...x, ...p })); setErr(''); };

  useEffect(() => { setD(initial); }, [initial]);

  useEffect(() => {
    let live = true;
    const t = window.setTimeout(async () => {
      const res = await adminFetch('/api/admin/newsletters', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview: d }),
      });
      const j = await res.json().catch(() => ({}));
      if (live && res.ok) onPreview({ subject: j.subject, html: j.html });
    }, 300);
    return () => { live = false; window.clearTimeout(t); };
  }, [d, onPreview]);

  function insertLink() {
    const el = area.current;
    const at = el ? el.selectionStart : d.body.length;
    set({ body: d.body.slice(0, at) + TOKEN + d.body.slice(el ? el.selectionEnd : at) });
    window.requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + TOKEN.length, at + TOKEN.length); });
  }

  async function upload(file: File) {
    if (file.size > 10_000_000) { setErr('That file is too big.'); return; }
    setBusy(true);
    try {
      const text = await fileText(file);
      if (!text.trim()) { setErr('No text found in that file. A scanned PDF has none; type it in instead.'); return; }
      set({ body: text, name: d.name || file.name.replace(/\.[^.]+$/, '') });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    const res = await adminFetch('/api/admin/newsletters', {
      method: d.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error || 'Could not save.'); return; }
    onSaved(j.id);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <input className="input-base" placeholder="Name (only you see this)" value={d.name} onChange={(e) => set({ name: e.target.value })} />
      <input className="input-base" placeholder="Subject" value={d.subject} onChange={(e) => set({ subject: e.target.value })} />
      <div className="flex rounded-lg bg-gray-100 p-0.5 self-start">
        {(['plain', 'branded'] as const).map((s) => (
          <button key={s} type="button" onClick={() => set({ style: s })}
            className={`px-3 py-1 rounded-md text-sm font-semibold ${d.style === s ? 'bg-white shadow-sm text-brand-navy' : 'text-gray-500'}`}>
            {s === 'plain' ? 'Plain' : 'Branded'}
          </button>
        ))}
      </div>
      <textarea ref={area} className="input-base min-h-[220px] text-[14px]"
        placeholder={'Hi there.\n\nWrite it like a normal email. Leave a blank line between paragraphs.'}
        value={d.body} onChange={(e) => set({ body: e.target.value })} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={insertLink} className="btn-outline text-sm inline-flex items-center gap-1.5">
          <Link2 className="w-4 h-4" /> Insert signup link
        </button>
        <label className="btn-outline text-sm inline-flex items-center gap-1.5 cursor-pointer">
          <FileUp className="w-4 h-4" /> Use a Word or PDF file
          <input type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
        </label>
      </div>
      <p className="text-xs text-gray-500">
        {TOKEN} becomes the link to make a boat account. A file's text lands in the box to check and fix. An unsubscribe link is added to every send.
      </p>
      <button type="button" disabled={busy || !d.subject.trim() || !d.body.trim()} onClick={save}
        className="btn-primary text-sm self-start inline-flex items-center gap-1.5 disabled:opacity-40">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} {saveLabel}
      </button>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  );
}
