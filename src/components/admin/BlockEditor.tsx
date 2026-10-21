'use client';

// The email builder: an email made of blocks (words, heading, picture,
// button, line, and an imported design). Saves itself as you go, undoes
// with Ctrl+Z, shows a live preview, checks the email before it goes out,
// and sends one copy to the GTS inbox first.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, Check, Copy, Image as ImageIcon, Loader2, Minus, MousePointerClick,
  Send, ShieldCheck, Trash2, Type, Undo2, Heading as HeadingIcon,
} from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import {
  SAVED_LINKS, htmlParts, newBlock, newId, patchHtmlPart,
  type Block, type EmailDoc,
} from '@/lib/email-blocks';
import { shrinkImage } from '@/lib/image-shrink';

export type BuilderDraft = { id?: string; name: string; subject: string; doc: EmailDoc; send_plain: boolean };
type Problem = { level: 'stop' | 'warn'; text: string };

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const ctTime = (d: Date) => d.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }) + ' CT';

async function uploadPicture(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) throw new Error('Pick a JPG, PNG, GIF or WebP picture.');
  const blob = await shrinkImage(file);
  const fd = new FormData();
  fd.set('action', 'image');
  fd.set('file', blob, file.name.replace(/\.\w+$/, blob.type === 'image/png' ? '.png' : blob.type === 'image/gif' ? '.gif' : '.jpg'));
  const res = await adminFetch('/api/admin/email-builder', { method: 'POST', body: fd });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'Could not upload that picture.');
  return j.url as string;
}

/** A spot to drop a picture on, or tap to pick one. */
function PictureDrop({ src, onUrl, label = 'Drop a picture here, or tap to pick one' }: { src?: string; onUrl: (u: string) => void; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState('');
  async function take(f?: File | null) {
    if (!f) return;
    setBusy(true); setErr('');
    try { onUrl(await uploadPicture(f)); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not upload.'); } finally { setBusy(false); }
  }
  return (
    <label onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-3 text-center text-xs cursor-pointer min-h-[84px] ${over ? 'border-brand-gold bg-amber-50' : 'border-gray-300 bg-gray-50 hover:border-brand-gold'}`}>
      {src ? <img src={src} alt="" className="max-h-28 max-w-full rounded" /> : <ImageIcon className="w-5 h-5 text-gray-400" />}
      <span className="text-gray-600">{busy ? 'Uploading…' : src ? 'Drop or tap to swap the picture' : label}</span>
      {err && <span className="text-red-700">{err}</span>}
      <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
  );
}

/** Web address box with the one-tap saved links. */
function LinkField({ value, onChange, placeholder = 'Web address (https://…)' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <input className="input-base text-sm" inputMode="url" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value.trim())} />
      <div className="flex flex-wrap gap-1.5">
        {SAVED_LINKS.map((l) => (
          <button key={l.href} type="button" onClick={() => onChange(l.href)}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${value === l.href ? 'border-brand-navy bg-brand-navy text-white' : 'border-gray-200 bg-white text-brand-navy hover:border-brand-gold'}`}>
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BlockFields({ b, set }: { b: Block; set: (p: Partial<Block>) => void }) {
  if (b.type === 'text') {
    return b.heading
      ? <input className="input-base text-base font-bold" placeholder="Heading" value={b.text} onChange={(e) => set({ text: e.target.value })} />
      : <textarea className="input-base min-h-[110px] text-[14px]" value={b.text}
          placeholder={'Write here. Blank line between paragraphs.\n- Start lines with a dash for a list\n**Two stars** around words for bold'}
          onChange={(e) => set({ text: e.target.value })} />;
  }
  if (b.type === 'image') {
    return (
      <div className="flex flex-col gap-2">
        <PictureDrop src={b.src} onUrl={(src) => set({ src })} />
        <input className="input-base text-sm" placeholder="What the picture shows (for readers with pictures off)" value={b.alt} onChange={(e) => set({ alt: e.target.value })} />
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-600">Link and size</summary>
          <div className="mt-2 flex flex-col gap-2">
            <LinkField value={b.href || ''} onChange={(href) => set({ href: href || undefined })} placeholder="Opens when tapped (optional)" />
            <div className="flex rounded-lg bg-gray-100 p-0.5 self-start">
              {([[548, 'Full'], [400, 'Medium'], [260, 'Small']] as const).map(([w, l]) => (
                <button key={w} type="button" onClick={() => set({ width: w })}
                  className={`px-3 py-1 rounded-md text-xs font-semibold ${(b.width || 548) === w ? 'bg-white shadow-sm text-brand-navy' : 'text-gray-500'}`}>{l}</button>
              ))}
            </div>
          </div>
        </details>
      </div>
    );
  }
  if (b.type === 'button') {
    return (
      <div className="flex flex-col gap-2">
        <input className="input-base text-sm font-semibold" placeholder="Button words" value={b.label} onChange={(e) => set({ label: e.target.value })} />
        <LinkField value={b.href} onChange={(href) => set({ href })} />
        <div className="flex rounded-lg bg-gray-100 p-0.5 self-start">
          {(['green', 'orange'] as const).map((c) => (
            <button key={c} type="button" onClick={() => set({ color: c })}
              className={`px-3 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 ${(b.color || 'green') === c ? 'bg-white shadow-sm text-brand-navy' : 'text-gray-500'}`}>
              <span className="w-3 h-3 rounded-full" style={{ background: c === 'green' ? '#1E3D1E' : '#D9640A' }} /> {c === 'green' ? 'Green' : 'Orange'}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (b.type === 'divider') return <hr className="border-gray-300" />;
  // Imported design: kept as it came in; its buttons and pictures can change.
  const parts = htmlParts(b.html);
  const links = parts.filter((p) => p.kind === 'link' && p.attrs.href !== '{unsubscribe_link}');
  const imgs = parts.filter((p) => p.kind === 'image');
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-gray-600">This design is kept exactly as it came in. Change its buttons, links and pictures here.</p>
      {links.map((p) => (
        <div key={`l${p.index}`} className="rounded-lg border border-gray-200 p-2 flex flex-col gap-1.5">
          <input className="input-base text-sm font-semibold" value={p.text || ''} placeholder="(a picture or styled link)" disabled={!p.text}
            onChange={(e) => set({ html: patchHtmlPart(b.html, 'link', p.index, { text: e.target.value }) })} />
          <LinkField value={p.attrs.href || ''} onChange={(href) => set({ html: patchHtmlPart(b.html, 'link', p.index, { href }) })} />
        </div>
      ))}
      {imgs.map((p) => (
        <div key={`i${p.index}`} className="rounded-lg border border-gray-200 p-2 flex flex-col gap-1.5">
          <PictureDrop src={p.attrs.src} label="This picture is missing. Drop it here, or tap to pick it"
            onUrl={(src) => set({ html: patchHtmlPart(b.html, 'image', p.index, { src }) })} />
          <input className="input-base text-sm" placeholder="What the picture shows" value={p.attrs.alt || ''}
            onChange={(e) => set({ html: patchHtmlPart(b.html, 'image', p.index, { alt: e.target.value }) })} />
        </div>
      ))}
      {!links.length && !imgs.length && <p className="text-gray-500">No buttons or pictures in it.</p>}
    </div>
  );
}

const NAMES: Record<Block['type'], string> = { text: 'Words', image: 'Picture', button: 'Button', divider: 'Line', html: 'Imported design' };

export function BlockEditor({ initial, onPreview, onSaved, notice }: {
  initial: BuilderDraft;
  onPreview: (p: { subject: string; html: string; bytes?: number }) => void;
  onSaved: (id: string, name: string) => void;
  notice?: string;
}) {
  const [d, setD] = useState<BuilderDraft>(initial);
  const past = useRef<BuilderDraft[]>([]);
  const [saved, setSaved] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const dirty = useRef(false);
  const idRef = useRef(initial.id);

  const change = useCallback((fn: (x: BuilderDraft) => BuilderDraft) => {
    setD((x) => {
      const next = fn(x);
      past.current = [...past.current.slice(-49), x];
      dirty.current = true;
      return next;
    });
    setProblems(null); setErr(''); setTestMsg('');
  }, []);
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (prev) { dirty.current = true; setD(prev); }
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        const t = e.target as HTMLElement | null;
        // Inside a box, the box's own undo runs first.
        if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
        e.preventDefault(); undo();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [undo]);

  const setBlock = (id: string, p: Partial<Block>) => change((x) => ({ ...x, doc: { ...x.doc, blocks: x.doc.blocks.map((b) => (b.id === id ? { ...b, ...p } as Block : b)) } }));
  const move = (i: number, by: number) => change((x) => {
    const bs = [...x.doc.blocks]; const j = i + by;
    if (j < 0 || j >= bs.length) return x;
    [bs[i], bs[j]] = [bs[j], bs[i]];
    return { ...x, doc: { ...x.doc, blocks: bs } };
  });
  const add = (b: Block) => change((x) => ({ ...x, doc: { ...x.doc, blocks: [...x.doc.blocks, b] } }));

  // Live preview.
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(async () => {
      const res = await adminFetch('/api/admin/email-builder', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ action: 'render', doc: d.doc, subject: d.subject, plain: d.send_plain }) });
      const j = await res.json().catch(() => ({}));
      if (live && res.ok) onPreview({ subject: j.subject, html: j.html, bytes: j.bytes });
    }, 350);
    return () => { live = false; window.clearTimeout(t); };
  }, [d.doc, d.subject, d.send_plain, onPreview]);

  const save = useCallback(async (x: BuilderDraft) => {
    setSaving(true);
    const id = idRef.current;
    const res = await adminFetch('/api/admin/newsletters', {
      method: id ? 'PUT' : 'POST', headers: JSON_HEADERS,
      body: JSON.stringify({ id, name: x.name, subject: x.subject, format: 'blocks', blocks: x.doc, send_plain: x.send_plain }),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setErr(j.error || 'Could not save.'); return; }
    const first = !idRef.current;
    idRef.current = j.id;
    setD((cur) => ({ ...cur, id: j.id }));
    setSaved(new Date());
    if (first) onSaved(j.id, x.name || x.subject);
  }, [onSaved]);

  // Saves itself a moment after each change.
  useEffect(() => {
    if (!dirty.current) return;
    const t = window.setTimeout(() => { dirty.current = false; save(d); }, 1500);
    return () => window.clearTimeout(t);
  }, [d, save]);

  async function check() {
    setChecking(true); setProblems(null);
    const res = await adminFetch('/api/admin/email-builder', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ action: 'check', doc: d.doc, subject: d.subject, plain: d.send_plain }) });
    const j = await res.json().catch(() => ({}));
    setChecking(false);
    if (!res.ok) { setErr(j.error || 'Could not check.'); return; }
    setProblems(j.problems);
  }

  async function test() {
    setTestMsg('Sending…');
    if (dirty.current) { dirty.current = false; await save(d); }
    const res = await adminFetch('/api/admin/email-builder', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ action: 'test', id: idRef.current }) });
    const j = await res.json().catch(() => ({}));
    setTestMsg(res.ok ? `Sent to ${j.to}. It is exactly what readers get.` : j.error || 'Could not send.');
  }

  return (
    <div className="flex flex-col gap-3">
      {notice && <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">{notice}</p>}
      <input className="input-base" placeholder="Name (only you see this)" value={d.name} onChange={(e) => { const v = e.target.value; change((x) => ({ ...x, name: v })); }} />
      <input className="input-base" placeholder="Subject" value={d.subject} onChange={(e) => { const v = e.target.value; change((x) => ({ ...x, subject: v })); }} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="flex rounded-lg bg-gray-100 p-0.5">
          {([[true, 'GTS header and footer'], [false, 'No header']] as const).map(([v, l]) => (
            <button key={String(v)} type="button" onClick={() => change((x) => ({ ...x, doc: { ...x.doc, branded: v } }))}
              className={`px-3 py-1 rounded-md text-xs font-semibold ${(d.doc.branded !== false) === v ? 'bg-white shadow-sm text-brand-navy' : 'text-gray-500'}`}>{l}</button>
          ))}
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-gray-700">
          <input type="checkbox" checked={d.send_plain} onChange={(e) => { const v = e.target.checked; change((x) => ({ ...x, send_plain: v })); }} />
          Send as plain text (no pictures or buttons)
        </label>
      </div>

      <ol className="flex flex-col gap-2.5">
        {d.doc.blocks.map((b, i) => (
          <li key={b.id} className="rounded-xl border border-gray-200 bg-white p-2.5 flex flex-col gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mr-auto">{b.type === 'text' && b.heading ? 'Heading' : NAMES[b.type]}</span>
              <button type="button" title="Move earlier" disabled={i === 0} onClick={() => move(i, -1)} className="p-1.5 rounded text-gray-500 hover:text-brand-navy disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
              <button type="button" title="Move later" disabled={i === d.doc.blocks.length - 1} onClick={() => move(i, 1)} className="p-1.5 rounded text-gray-500 hover:text-brand-navy disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
              <button type="button" title="Copy this block" onClick={() => change((x) => { const bs = [...x.doc.blocks]; bs.splice(i + 1, 0, { ...b, id: newId() }); return { ...x, doc: { ...x.doc, blocks: bs } }; })} className="p-1.5 rounded text-gray-500 hover:text-brand-navy"><Copy className="w-4 h-4" /></button>
              <button type="button" title="Remove" onClick={() => change((x) => ({ ...x, doc: { ...x.doc, blocks: x.doc.blocks.filter((y) => y.id !== b.id) } }))} className="p-1.5 rounded text-gray-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
            </div>
            <BlockFields b={b} set={(p) => setBlock(b.id, p)} />
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs text-gray-500 self-center mr-1">Add:</span>
        <button type="button" onClick={() => add(newBlock('text'))} className="btn-outline text-xs inline-flex items-center gap-1"><Type className="w-3.5 h-3.5" /> Words</button>
        <button type="button" onClick={() => add({ id: newId(), type: 'text', heading: true, text: '' })} className="btn-outline text-xs inline-flex items-center gap-1"><HeadingIcon className="w-3.5 h-3.5" /> Heading</button>
        <button type="button" onClick={() => add(newBlock('image'))} className="btn-outline text-xs inline-flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" /> Picture</button>
        <button type="button" onClick={() => add(newBlock('button'))} className="btn-outline text-xs inline-flex items-center gap-1"><MousePointerClick className="w-3.5 h-3.5" /> Button</button>
        <button type="button" onClick={() => add(newBlock('divider'))} className="btn-outline text-xs inline-flex items-center gap-1"><Minus className="w-3.5 h-3.5" /> Line</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" onClick={check} disabled={checking} className="btn-outline text-sm inline-flex items-center gap-1.5">
          {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Check before sending
        </button>
        <button type="button" onClick={test} disabled={!d.subject.trim()} className="btn-outline text-sm inline-flex items-center gap-1.5 disabled:opacity-40">
          <Send className="w-4 h-4" /> Send me one first
        </button>
        <button type="button" onClick={undo} disabled={!past.current.length} title="Undo (Ctrl+Z)" className="btn-outline text-sm inline-flex items-center gap-1.5 disabled:opacity-40">
          <Undo2 className="w-4 h-4" /> Undo
        </button>
        <span className="text-xs text-gray-500 ml-auto">{saving ? 'Saving…' : saved ? `Saved ${ctTime(saved)}` : d.id ? 'Saved' : 'Saves as you go'}</span>
      </div>
      {testMsg && <p className="text-sm text-gray-700">{testMsg}</p>}
      {problems && (
        problems.length === 0
          ? <p className="text-sm text-emerald-700 inline-flex items-center gap-1.5"><Check className="w-4 h-4" /> All good: links open, pictures load, size is fine.</p>
          : <ul className="flex flex-col gap-1 text-sm">
              {problems.map((p, i) => <li key={i} className={p.level === 'stop' ? 'text-red-700' : 'text-amber-800'}>{p.level === 'stop' ? 'Fix: ' : 'Note: '}{p.text}</li>)}
            </ul>
      )}
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  );
}
