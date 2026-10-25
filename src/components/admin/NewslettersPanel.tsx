'use client';

// Newsletters: write several list emails, keep them as drafts, duplicate,
// delete, and send or plan one. The announcement's two copies (Branded,
// Plain) are here too, read-only, so either can go out as its own send.
// Every send uses the same daily-limited queue and shows in its history.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, CalendarClock, Copy, FileCode, LayoutTemplate, Loader2, Plus, Trash2 } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import { EMPTY_DRAFT, NewsletterEditor, type NewsletterDraft } from '@/components/admin/NewsletterEditor';
import { EmailQueuePanel } from '@/components/admin/EmailQueuePanel';
import { EmailPreview } from '@/components/admin/EmailPreview';
import { NewsletterSendBox } from '@/components/admin/NewsletterSendBox';
import { BlockEditor, type BuilderDraft } from '@/components/admin/BlockEditor';
import { EmailStats, ResultsSummaryBar } from '@/components/admin/EmailStats';
import { STARTERS, type EmailDoc } from '@/lib/email-blocks';

type Newsletter = NewsletterDraft & { id: string; updated_at: string; format?: 'text' | 'blocks' };
const BUILT_IN = [{ key: 'branded', name: 'Announcement · Branded' }, { key: 'plain', name: 'Announcement · Plain' }];

const NEW = '__new';
const BUILD = '__build';
const IMPORT = '__import';
const PICK = '__pick';

/** Bring in an outside email: paste it, or pick its .html (or a .zip with
 *  its pictures, or the .html plus its pictures). */
function ImportBox({ onDone }: { onDone: (d: BuilderDraft, notice: string) => void }) {
  const [html, setHtml] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go() {
    setBusy(true); setErr('');
    const fd = new FormData();
    fd.set('action', 'import');
    if (html.trim()) fd.set('html', html);
    for (const f of files) fd.append('file', f);
    const res = await adminFetch('/api/admin/email-builder', { method: 'POST', body: fd });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error || 'Could not bring that in.'); return; }
    const notes: string[] = [j.mode === 'blocks' ? 'Brought in as blocks you can edit.' : 'Kept as one design, exactly as it looked. Its buttons and pictures can still be changed.'];
    if (j.hosted) notes.push(`${j.hosted} picture${j.hosted > 1 ? 's' : ''} saved with the email.`);
    if (j.missing?.length) notes.push(`${j.missing.length} picture${j.missing.length > 1 ? 's were' : ' was'} not found; add ${j.missing.length > 1 ? 'them' : 'it'} again in its picture spot.`);
    if (j.removed?.length) notes.push(`Taken out for safety: ${j.removed.join(', ')}.`);
    const subject = j.subject || '';
    onDone({ name: subject || 'Imported email', subject, doc: j.doc as EmailDoc, send_plain: false }, notes.join(' '));
  }
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-sm text-gray-600">Paste an email made in another program, or pick its file. An unsubscribe link is added to every send.</p>
      <textarea className="input-base min-h-[160px] font-mono text-xs" placeholder="Paste the email code here" value={html} onChange={(e) => setHtml(e.target.value)} />
      <label className="btn-outline text-sm self-start cursor-pointer inline-flex items-center gap-1.5">
        <FileCode className="w-4 h-4" /> {files.length ? `${files.length} file${files.length > 1 ? 's' : ''} picked` : 'Pick the .html, .zip or pictures'}
        <input type="file" multiple accept=".html,.htm,.zip,image/*" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
      </label>
      <button type="button" disabled={busy || (!html.trim() && !files.length)} onClick={go} className="btn-primary text-sm self-start inline-flex items-center gap-1.5 disabled:opacity-40">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Bring it in
      </button>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  );
}

export function NewslettersPanel() {
  const [list, setList] = useState<Newsletter[]>([]);
  const [open, setOpen] = useState('');
  const [preview, setPreview] = useState<{ subject: string; html: string; bytes?: number }>({ subject: '', html: '' });
  const [builder, setBuilder] = useState<{ key: string; draft: BuilderDraft; notice?: string } | null>(null);
  const [builtInSubject, setBuiltInSubject] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [historyKey, setHistoryKey] = useState(0);
  const [statsOpen, setStatsOpen] = useState(true);
  const statsRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (show?: string) => {
    const res = await adminFetch('/api/admin/newsletters');
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error || 'Could not load newsletters.'); return; }
    setList(j.newsletters);
    if (show !== undefined) setOpen(show);
    else setOpen((cur) => cur || j.newsletters[0]?.id || 'branded');
  }, []);
  useEffect(() => { load(); }, [load]);
  const builtIn = BUILT_IN.find((b) => b.key === open);
  useEffect(() => {
    if (!builtIn) return;
    adminFetch(`/api/admin/newsletters?preview=${builtIn.key}`).then((r) => r.json()).then((j) => {
      setPreview({ subject: j.subject || '', html: j.html || '' }); setBuiltInSubject(j.subject || '');
    }).catch(() => {});
  }, [builtIn]);

  // A new email in the builder keeps its editor open once it has saved.
  const current = list.find((n) => n.id === (open === BUILD ? builder?.draft.id : open));
  const initial = useMemo<NewsletterDraft>(() => (current
    ? { id: current.id, name: current.name, subject: current.subject, body: current.body, style: current.style }
    : EMPTY_DRAFT), [current]);

  const names = useMemo(() => {
    const m: Record<string, string> = { branded: 'Announcement · Branded', plain: 'Announcement · Plain' };
    for (const n of list) m[n.id] = n.name;
    return m;
  }, [list]);

  // A builder email opens with its blocks.
  useEffect(() => {
    if (open === BUILD || !current || current.format !== 'blocks' || builder?.key === current.id) return;
    adminFetch(`/api/admin/newsletters?id=${current.id}`).then((r) => r.json()).then((j) => {
      const n = j.newsletter;
      if (n) setBuilder({ key: n.id, draft: { id: n.id, name: n.name, subject: n.subject, doc: n.blocks, send_plain: !!n.send_plain } });
    }).catch(() => {});
  }, [open, current, builder?.key]);

  function startBuild(draft: BuilderDraft, notice?: string) {
    setBuilder({ key: BUILD + Date.now(), draft, notice }); setOpen(BUILD); setMsg(''); setErr('');
  }

  function viewStatsFor(key: string) {
    setOpen(key);
    setStatsOpen(true);
    setMsg(''); setErr('');
    window.setTimeout(() => statsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  }

  async function copyLast() {
    const res = await adminFetch('/api/admin/newsletters', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ copyLast: true }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setBuilder(null); await load(j.id); setMsg(`Copied: ${j.name}.`); } else setErr(j.error || 'Could not copy.');
  }

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

  const activeStatsKey = current?.id || builtIn?.key || 'branded';
  const activeStatsTitle = current?.name || builtIn?.name || 'Announcement · Branded';

  return (
    <div className="flex flex-col gap-6">
      <ResultsSummaryBar
        names={names}
        activeStatsOpen={statsOpen}
        onToggleStats={() => {
          if (!current && !builtIn) setOpen(list[0]?.id || 'branded');
          setStatsOpen((v) => !v);
          window.setTimeout(() => statsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
        }}
        onSelectNewsletter={(key) => viewStatsFor(key)}
      />

      <div className="grid gap-6 lg:gap-8 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5 min-w-0">
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Your emails &amp; newsletters</p>
            <div className="flex flex-col gap-1.5">
              {BUILT_IN.map((n) => {
                const isActive = open === n.key;
                return (
                  <div
                    key={n.key}
                    className={`flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 transition ${
                      isActive ? 'border-brand-navy bg-brand-navy/5' : 'border-gray-200 bg-white hover:border-brand-gold'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => { setOpen(n.key); setMsg(''); setErr(''); }}
                      className="text-left text-sm font-bold text-brand-navy truncate min-w-0 flex-1"
                    >
                      {n.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => viewStatsFor(n.key)}
                      className="shrink-0 rounded-full border border-brand-navy/20 bg-amber-50 hover:bg-brand-gold/30 px-2.5 py-1 text-xs font-bold text-brand-navy inline-flex items-center gap-1"
                    >
                      <BarChart3 className="w-3.5 h-3.5" /> View stats
                    </button>
                  </div>
                );
              })}
              {list.map((n) => {
                const isActive = open === n.id || (open === BUILD && builder?.draft.id === n.id);
                return (
                  <div
                    key={n.id}
                    className={`flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 transition ${
                      isActive ? 'border-brand-navy bg-brand-navy/5' : 'border-gray-200 bg-white hover:border-brand-gold'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => { setOpen(n.id); setMsg(''); setErr(''); }}
                      className="text-left text-sm font-bold text-brand-navy truncate min-w-0 flex-1"
                    >
                      {n.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => viewStatsFor(n.id)}
                      className="shrink-0 rounded-full border border-brand-navy/20 bg-amber-50 hover:bg-brand-gold/30 px-2.5 py-1 text-xs font-bold text-brand-navy inline-flex items-center gap-1"
                    >
                      <BarChart3 className="w-3.5 h-3.5" /> View stats
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setOpen(PICK); setMsg(''); setErr(''); }}
              className="btn-primary text-sm inline-flex items-center gap-1.5"><LayoutTemplate className="w-4 h-4" /> Build an email</button>
            <button type="button" onClick={() => { setOpen(IMPORT); setMsg(''); setErr(''); }}
              className="btn-outline text-sm inline-flex items-center gap-1.5"><FileCode className="w-4 h-4" /> Bring in an email</button>
            <button type="button" onClick={copyLast}
              className="btn-outline text-sm inline-flex items-center gap-1.5"><CalendarClock className="w-4 h-4" /> Copy last week's</button>
            <button type="button" onClick={() => { setOpen(NEW); setMsg(''); setErr(''); }}
              className="btn-outline text-sm inline-flex items-center gap-1.5"><Plus className="w-4 h-4" /> Plain text draft</button>
          </div>

          {open === PICK && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STARTERS.map((t) => (
                <button key={t.key} type="button" onClick={() => startBuild({ name: t.name, subject: t.subject || '', doc: t.doc(), send_plain: false })}
                  className="rounded-xl border-2 border-gray-200 bg-white px-3.5 py-3 text-left text-sm font-bold text-brand-navy hover:border-brand-gold">{t.name}</button>
              ))}
              <button type="button" onClick={() => startBuild({ name: '', subject: '', doc: { branded: true, blocks: [] }, send_plain: false })}
                className="rounded-xl border-2 border-dashed border-gray-300 px-3.5 py-3 text-left text-sm font-semibold text-gray-600 hover:border-brand-gold">Blank email</button>
            </div>
          )}
          {open === IMPORT && <ImportBox onDone={(d, notice) => startBuild(d, notice)} />}
          {open === BUILD && builder && (
            <BlockEditor key={builder.key} initial={builder.draft} notice={builder.notice} onPreview={setPreview}
              onSaved={async (id) => { setBuilder((b) => (b ? { ...b, draft: { ...b.draft, id } } : b)); await load(BUILD); }} />
          )}
          {open !== BUILD && current?.format === 'blocks' && builder?.key === current.id && (
            <BlockEditor key={current.id} initial={builder.draft} onPreview={setPreview} onSaved={() => {}} />
          )}
          {open !== BUILD && current?.format === 'blocks' && builder?.key !== current.id && <p className="text-sm text-gray-500">Opening…</p>}

          {open && !builtIn && open !== BUILD && open !== IMPORT && open !== PICK && current?.format !== 'blocks' && (
            <NewsletterEditor key={open} initial={initial} onPreview={setPreview}
              saveLabel={current ? 'Save changes' : 'Save draft'}
              onSaved={async (id) => { await load(id); setMsg('Saved.'); }} />
          )}

          {current && (
            <>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => viewStatsFor(current.id)} className="btn-outline text-sm inline-flex items-center gap-1.5"><BarChart3 className="w-4 h-4" /> View stats</button>
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

          {statsOpen && (current || builtIn) && (
            <div ref={statsRef} className="rounded-2xl border-2 border-brand-navy/20 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-brand-navy" />
                  <h3 className="text-sm font-extrabold text-brand-navy">How it did · {activeStatsTitle}</h3>
                </div>
                <button type="button" onClick={() => setStatsOpen(false)} className="text-xs font-semibold text-gray-500 hover:text-brand-navy">Hide</button>
              </div>
              <EmailStats newsletterKey={activeStatsKey} title={activeStatsTitle} />
            </div>
          )}

          {msg && <p className="text-sm text-emerald-700">{msg}</p>}
          {err && <p className="text-sm text-red-700">{err}</p>}
          <EmailQueuePanel reloadKey={historyKey} />
        </div>
        <EmailPreview subject={preview.subject} html={preview.html} bytes={preview.bytes} />
      </div>
    </div>
  );
}
