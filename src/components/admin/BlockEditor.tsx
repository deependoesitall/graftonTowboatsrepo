'use client';

// The email builder. The email is shown as it will look, and is edited
// right there: tap words to change them (small toolbar for bold, colour,
// size, link), tap a button or picture to change it, use + between parts
// to add more, and drag the handle to move a part. Saves itself as you go,
// undoes with Ctrl+Z, checks the email before it goes out, and sends one
// copy to the GTS inbox first.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bold, Check, Copy, GripVertical, Image as ImageIcon, Link2, List, Loader2, Plus,
  Send, ShieldCheck, Trash2, Undo2, AlignCenter, AlignLeft, AlignRight, Bookmark, X,
} from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import {
  BRAND, BUILT_IN_SECTIONS, SAVED_LINKS, freshIds, htmlParts, newBlock, patchHtmlPart,
  type Align, type Block, type BrandColor, type ButtonSpec, type EmailDoc, type NewKind, type Size,
} from '@/lib/email-blocks';
import { fromEditableHtml, toEditableHtml, toggleBullets } from '@/lib/rich-text';
import { shrinkImage } from '@/lib/image-shrink';

export type BuilderDraft = { id?: string; name: string; subject: string; doc: EmailDoc; send_plain: boolean };
type Problem = { level: 'stop' | 'warn'; text: string };
type Section = { id?: string; name: string; blocks: Block[] };

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const ctTime = (d: Date) => d.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }) + ' CT';
const COLORS = Object.keys(BRAND) as BrandColor[];
const SIZES: [Size, string][] = [['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']];
const ALIGNS: [Align, typeof AlignLeft, string][] = [['start', AlignLeft, 'Line up with the words'], ['center', AlignCenter, 'Centered'], ['end', AlignRight, 'Line up with the far edge']];
const TEXT_PX: Record<Size, number> = { sm: 13, md: 15, lg: 18 };
const ADD: [NewKind, string][] = [['button', 'Button'], ['buttons', 'Button row'], ['text', 'Text'], ['heading', 'Heading'], ['image', 'Picture'], ['pictext', 'Picture + text'], ['divider', 'Line'], ['spacer', 'Space']];

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

function Chip({ on, onClick, children, title }: { on?: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold inline-flex items-center gap-1 ${on ? 'border-brand-navy bg-brand-navy text-white' : 'border-gray-200 bg-white text-brand-navy hover:border-brand-gold'}`}>
      {children}
    </button>
  );
}

function ColorDots({ value, onChange }: { value?: BrandColor; onChange: (c: BrandColor) => void }) {
  return (
    <div className="flex gap-1.5">
      {COLORS.map((c) => (
        <button key={c} type="button" title={BRAND[c].label} onClick={() => onChange(c)}
          className={`w-7 h-7 rounded-full border-2 ${value === c ? 'border-brand-gold ring-2 ring-brand-gold/40' : 'border-white shadow'}`} style={{ background: BRAND[c].bg }} />
      ))}
    </div>
  );
}

/** Where a button or link goes: one tap for the usual places, or any web address. */
function LinkPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const saved = SAVED_LINKS.find((l) => l.href === value);
  const [custom, setCustom] = useState(!saved && !!value);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {SAVED_LINKS.map((l) => <Chip key={l.href} on={!custom && value === l.href} onClick={() => { setCustom(false); onChange(l.href); }}>{l.label}</Chip>)}
        <Chip on={custom} onClick={() => setCustom(true)}>Web address</Chip>
      </div>
      {custom && <input className="input-base text-sm" inputMode="url" placeholder="https://…" value={value} onChange={(e) => onChange(e.target.value.trim())} autoFocus />}
    </div>
  );
}

function ButtonPanel({ b, set, align, onAlign }: { b: ButtonSpec; set: (p: Partial<ButtonSpec>) => void; align?: Align; onAlign?: (a: Align) => void }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-sm">
      <label className="flex flex-col gap-1"><span className="text-xs font-semibold text-gray-500">Words on the button</span>
        <input className="input-base text-sm font-semibold" value={b.label} onChange={(e) => set({ label: e.target.value })} /></label>
      <div className="flex flex-col gap-1"><span className="text-xs font-semibold text-gray-500">Opens</span><LinkPicker value={b.href} onChange={(href) => set({ href })} /></div>
      <div className="flex flex-wrap items-center gap-3">
        <ColorDots value={b.color || 'green'} onChange={(color) => set({ color })} />
        <div className="flex gap-1">{SIZES.map(([k, l]) => <Chip key={k} on={(b.size || 'md') === k} onClick={() => set({ size: k })}>{l}</Chip>)}</div>
        {onAlign && <div className="flex gap-1">{ALIGNS.map(([k, I, t]) => <Chip key={k} title={t} on={(align || 'center') === k} onClick={() => onAlign(k)}><I className="w-3.5 h-3.5" /></Chip>)}</div>}
      </div>
    </div>
  );
}

/** A button drawn the way it lands in the inbox. */
function ButtonFace({ b, full, onClick, active }: { b: ButtonSpec; full?: boolean; onClick: () => void; active?: boolean }) {
  const k = BRAND[b.color || 'green'];
  const z = { sm: 'px-4 py-2 text-[11px]', md: 'px-6 py-3 text-[13px]', lg: 'px-8 py-3.5 text-[15px]' }[b.size || 'md'];
  return (
    <button type="button" onClick={onClick} style={{ background: k.bg, color: k.fg }}
      className={`rounded-full font-extrabold uppercase tracking-wider ${z} ${full ? 'w-full' : ''} ${active ? 'ring-2 ring-offset-2 ring-brand-gold' : ''}`}>
      {b.label || 'Open'}
    </button>
  );
}

/** Words edited in place, with a small toolbar while you type. */
function InlineText({ text, heading, color, size, align, onText, onStyle }: {
  text: string; heading?: boolean; color?: BrandColor; size?: Size; align?: Align;
  onText: (t: string) => void; onStyle?: (p: { color?: BrandColor; size?: Size; align?: Align; heading?: boolean }) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const range = useRef<Range | null>(null);
  useEffect(() => {
    if (el.current && document.activeElement !== el.current) el.current.innerHTML = toEditableHtml(text);
  }, [text]);
  const commit = () => { if (el.current) onText(fromEditableHtml(el.current.innerHTML)); };
  const cmd = (c: string, v?: string) => { el.current?.focus(); document.execCommand(c, false, v); commit(); };
  const px = TEXT_PX[size || 'md'] + (heading ? 7 : 0);
  return (
    <div className="relative">
      {focus && onStyle && (
        <div onMouseDown={(e) => e.preventDefault()} className="absolute -top-11 left-0 z-20 flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-white px-1.5 py-1 shadow-lg">
          <button type="button" title="Bold" onClick={() => cmd('bold')} className="p-1.5 rounded hover:bg-gray-100"><Bold className="w-4 h-4" /></button>
          <button type="button" title="Bullet list" onClick={() => {
            const cur = el.current ? fromEditableHtml(el.current.innerHTML) : text;
            const selText = window.getSelection()?.toString() || '';
            const next = toggleBullets(cur, selText);
            onText(next);
            if (el.current) { el.current.innerHTML = toEditableHtml(next); el.current.focus(); }
          }} className="p-1.5 rounded hover:bg-gray-100 inline-flex items-center gap-1 text-xs font-semibold text-brand-navy"><List className="w-4 h-4" /> Bullets</button>
          <button type="button" title="Link" onClick={() => { const s = window.getSelection(); range.current = s && s.rangeCount ? s.getRangeAt(0).cloneRange() : null; setLinking('https://'); }} className="p-1.5 rounded hover:bg-gray-100"><Link2 className="w-4 h-4" /></button>
          <span className="w-px h-5 bg-gray-200 mx-0.5" />
          {COLORS.filter((c) => c !== 'yellow').map((c) => (
            <button key={c} type="button" title={BRAND[c].label} onClick={() => onStyle({ color: c })} className={`w-5 h-5 rounded-full border-2 ${color === c ? 'border-brand-gold' : 'border-white shadow'}`} style={{ background: BRAND[c].bg }} />
          ))}
          <span className="w-px h-5 bg-gray-200 mx-0.5" />
          {SIZES.map(([k]) => <button key={k} type="button" title={k === 'sm' ? 'Smaller' : k === 'lg' ? 'Bigger' : 'Normal size'} onClick={() => onStyle({ size: k })} className={`px-1.5 py-0.5 rounded font-bold ${size === k || (!size && k === 'md') ? 'bg-gray-100 text-brand-navy' : 'text-gray-500'}`} style={{ fontSize: k === 'sm' ? 11 : k === 'md' ? 13 : 16 }}>A</button>)}
          <span className="w-px h-5 bg-gray-200 mx-0.5" />
          {ALIGNS.map(([k, I, t]) => <button key={k} type="button" title={t} onClick={() => onStyle({ align: k })} className={`p-1 rounded ${(align || 'start') === k ? 'bg-gray-100 text-brand-navy' : 'text-gray-500'}`}><I className="w-4 h-4" /></button>)}
          <button type="button" onClick={() => onStyle({ heading: !heading })} className="px-1.5 py-0.5 rounded text-xs font-semibold text-gray-600 hover:bg-gray-100">{heading ? 'Normal text' : 'Heading'}</button>
        </div>
      )}
      {linking !== null && (
        <div onMouseDown={(e) => { if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault(); }} className="absolute -top-11 left-0 z-30 flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          {SAVED_LINKS.slice(0, 4).map((l) => <Chip key={l.href} onClick={() => setLinking(l.href)}>{l.label}</Chip>)}
          <input className="input-base text-xs w-44 py-1" value={linking} onChange={(e) => setLinking(e.target.value)} autoFocus />
          <button type="button" className="btn-primary text-xs px-2 py-1" onClick={() => {
            const sel = window.getSelection();
            if (range.current && sel) { sel.removeAllRanges(); sel.addRange(range.current); }
            if (/^(https?:\/\/.+|mailto:.+|tel:.+)$/.test(linking)) cmd('createLink', linking);
            setLinking(null);
          }}>Add link</button>
          <button type="button" title="Cancel" onClick={() => setLinking(null)} className="p-1 text-gray-500"><X className="w-4 h-4" /></button>
        </div>
      )}
      <div ref={el} contentEditable suppressContentEditableWarning role="textbox" aria-label={heading ? 'Heading' : 'Text'}
        onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); commit(); }} onInput={commit}
        onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); }}
        className={`outline-none rounded px-1 -mx-1 hover:bg-amber-50/60 focus:bg-amber-50 whitespace-pre-wrap break-words ${heading ? 'font-extrabold leading-tight' : 'leading-relaxed'}`}
        style={{ fontSize: px, color: color && color !== 'yellow' ? BRAND[color].bg : '#15181C', textAlign: align === 'end' ? 'right' : align === 'center' ? 'center' : 'left' }} />
    </div>
  );
}

/** One part of the email, drawn as it lands, editable where it stands. */
function BlockView({ b, set, selected, onSelect }: { b: Block; set: (p: Partial<Block>) => void; selected: boolean; onSelect: () => void }) {
  const [pick, setPick] = useState<number | null>(null);
  useEffect(() => { if (!selected) setPick(null); }, [selected]);
  if (b.type === 'text') {
    return <InlineText text={b.text} heading={b.heading} color={b.color} size={b.size} align={b.align}
      onText={(text) => set({ text })} onStyle={(p) => set(p)} />;
  }
  if (b.type === 'image') {
    return (
      <div className="flex flex-col gap-2">
        {b.src && !selected ? <button type="button" onClick={onSelect} className="block w-full"><img src={b.src} alt={b.alt} className="mx-auto rounded" style={{ maxWidth: Math.min(548, b.width || 548), width: '100%' }} /></button>
          : <PictureDrop src={b.src} onUrl={(src) => set({ src })} />}
        {selected && (
          <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 text-sm">
            <input className="input-base text-sm" placeholder="What the picture shows (for readers with pictures off)" value={b.alt} onChange={(e) => set({ alt: e.target.value })} />
            <div className="flex gap-1">{([[548, 'Full width'], [400, 'Medium'], [260, 'Small']] as const).map(([w, l]) => <Chip key={w} on={(b.width || 548) === w} onClick={() => set({ width: w })}>{l}</Chip>)}</div>
            <span className="text-xs font-semibold text-gray-500">Opens when tapped (optional)</span>
            <LinkPicker value={b.href || ''} onChange={(href) => set({ href: href || undefined })} />
          </div>
        )}
      </div>
    );
  }
  if (b.type === 'button') {
    const j = b.align === 'start' ? 'justify-start' : b.align === 'end' ? 'justify-end' : 'justify-center';
    return (
      <div className="flex flex-col gap-2">
        <div className={`flex ${j} py-2`}><ButtonFace b={b} active={selected} onClick={onSelect} /></div>
        {selected && <ButtonPanel b={b} set={(p) => set(p)} align={b.align} onAlign={(align) => set({ align })} />}
      </div>
    );
  }
  if (b.type === 'buttons') {
    const setOne = (i: number, p: Partial<ButtonSpec>) => set({ buttons: b.buttons.map((x, k) => (k === i ? { ...x, ...p } : x)) });
    return (
      <div className="flex flex-col gap-2">
        <div className="grid gap-2 py-2" style={{ gridTemplateColumns: `repeat(${b.buttons.length}, minmax(0,1fr))` }}>
          {b.buttons.map((x, i) => <ButtonFace key={i} b={x} full active={selected && pick === i} onClick={() => { onSelect(); setPick(i); }} />)}
        </div>
        {selected && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {b.buttons.length < 3 && <Chip onClick={() => { set({ buttons: [...b.buttons, { label: 'Shop', href: SAVED_LINKS[1].href, color: 'ink' }] }); setPick(b.buttons.length); }}><Plus className="w-3 h-3" /> Add a button</Chip>}
              {pick !== null && b.buttons.length > 2 && <Chip onClick={() => { set({ buttons: b.buttons.filter((_, k) => k !== pick) }); setPick(null); }}><Trash2 className="w-3 h-3" /> Remove this button</Chip>}
            </div>
            {pick !== null && b.buttons[pick] ? <ButtonPanel b={b.buttons[pick]} set={(p) => setOne(pick, p)} /> : <p className="text-xs text-gray-500">Tap a button to change it. On phones they sit one under another.</p>}
          </>
        )}
      </div>
    );
  }
  if (b.type === 'pictext') {
    return (
      <div className="flex flex-col gap-2">
        <div className="grid gap-3 sm:grid-cols-[45%_1fr] items-start">
          <PictureDrop src={b.src} onUrl={(src) => set({ src })} />
          <InlineText text={b.text} onText={(text) => set({ text })} onStyle={() => {}} />
        </div>
        {selected && (
          <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 text-sm">
            <input className="input-base text-sm" placeholder="What the picture shows" value={b.alt} onChange={(e) => set({ alt: e.target.value })} />
            <span className="text-xs font-semibold text-gray-500">Picture opens when tapped (optional)</span>
            <LinkPicker value={b.href || ''} onChange={(href) => set({ href: href || undefined })} />
          </div>
        )}
      </div>
    );
  }
  if (b.type === 'divider') return <hr className="my-3 border-gray-300" />;
  if (b.type === 'spacer') {
    return (
      <div>
        <div className="bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_6px,#fff_6px,#fff_12px)] rounded" style={{ height: b.height }} />
        {selected && <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">Space <input type="range" min={8} max={80} step={4} value={b.height} onChange={(e) => set({ height: Number(e.target.value) })} className="flex-1" /> {b.height}px</label>}
      </div>
    );
  }
  // Imported design: kept as it came in; its buttons and pictures can change.
  const parts = htmlParts(b.html);
  const links = parts.filter((p) => p.kind === 'link' && p.attrs.href !== '{unsubscribe_link}');
  const imgs = parts.filter((p) => p.kind === 'image');
  return (
    <div className="flex flex-col gap-3 text-sm">
      <iframe title="Imported design" sandbox="" srcDoc={b.html} className="pointer-events-none w-full h-72 rounded border border-gray-100 bg-white" />
      {!selected ? <p className="text-xs text-gray-500">Imported design, kept as it looked. Tap to change its buttons and pictures.</p> : (
        <>
          {links.map((p) => (
            <div key={`l${p.index}`} className="rounded-lg border border-gray-200 p-2 flex flex-col gap-1.5">
              <input className="input-base text-sm font-semibold" value={p.text || ''} placeholder="(a picture or styled link)" disabled={!p.text}
                onChange={(e) => set({ html: patchHtmlPart(b.html, 'link', p.index, { text: e.target.value }) })} />
              <LinkPicker value={p.attrs.href || ''} onChange={(href) => set({ html: patchHtmlPart(b.html, 'link', p.index, { href }) })} />
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
        </>
      )}
    </div>
  );
}

/** The + between parts: what to add, and saved sections. */
function AddHere({ onAdd, sections, open, setOpen }: { onAdd: (bs: Block[]) => void; sections: Section[]; open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <div className="relative flex justify-center h-6 group">
      <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-transparent group-hover:border-gray-300" />
      <button type="button" title="Add here" onClick={() => setOpen(!open)}
        className={`relative z-10 w-6 h-6 rounded-full grid place-items-center border shadow-sm ${open ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white text-brand-navy border-gray-300 opacity-60 group-hover:opacity-100'}`}>
        <Plus className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute top-7 z-30 w-[min(320px,90vw)] rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
          <div className="grid grid-cols-2 gap-1">
            {ADD.map(([k, l]) => <button key={k} type="button" onClick={() => { onAdd([newBlock(k)]); setOpen(false); }} className="rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-brand-navy hover:bg-gray-50">{l}</button>)}
          </div>
          <p className="mt-2 px-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Saved sections</p>
          <div className="flex flex-wrap gap-1 p-1">
            {sections.map((s) => <Chip key={s.id || s.name} onClick={() => { onAdd(freshIds(s.blocks)); setOpen(false); }}><Bookmark className="w-3 h-3" /> {s.name}</Chip>)}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [width, setWidth] = useState<'phone' | 'desktop'>('desktop');
  const [mine, setMine] = useState<Section[]>([]);
  const [drag, setDrag] = useState<{ id: string; to: number } | null>(null);
  const refs = useRef<Record<string, HTMLLIElement | null>>({});
  const dirty = useRef(false);
  const idRef = useRef(initial.id);

  useEffect(() => {
    adminFetch('/api/admin/email-builder?sections=1').then((r) => r.json()).then((j) => setMine(j.sections || [])).catch(() => {});
  }, []);

  const change = useCallback((fn: (x: BuilderDraft) => BuilderDraft) => {
    setD((x) => {
      const next = fn(x);
      if (next === x) return x;
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
        if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return;
        e.preventDefault(); undo();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [undo]);

  const blocks = d.doc.blocks;
  const setBlocks = (fn: (bs: Block[]) => Block[]) => change((x) => ({ ...x, doc: { ...x.doc, blocks: fn(x.doc.blocks) } }));
  const setBlock = (id: string, p: Partial<Block>) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...p } as Block : b)));
  const insertAt = (i: number, add: Block[]) => { setBlocks((bs) => [...bs.slice(0, i), ...add, ...bs.slice(i)]); setSel(add[0]?.id || null); };

  // Drag the handle (mouse or finger) to move a part.
  function startDrag(e: React.PointerEvent, id: string) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id, to: blocks.findIndex((b) => b.id === id) });
  }
  function moveDrag(e: React.PointerEvent) {
    if (!drag) return;
    let to = blocks.length;
    for (let i = 0; i < blocks.length; i++) {
      const r = refs.current[blocks[i].id]?.getBoundingClientRect();
      if (r && e.clientY < r.top + r.height / 2) { to = i; break; }
    }
    if (to !== drag.to) setDrag({ ...drag, to });
  }
  function endDrag() {
    if (!drag) return;
    const from = blocks.findIndex((b) => b.id === drag.id);
    const to = drag.to > from ? drag.to - 1 : drag.to;
    if (from > -1 && to !== from) setBlocks((bs) => { const c = [...bs]; const [m] = c.splice(from, 1); c.splice(to, 0, m); return c; });
    setDrag(null);
  }

  // Live preview of the real email.
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

  async function saveSection(b: Block) {
    const name = window.prompt('Name this section (for example "Footer")');
    if (!name?.trim()) return;
    const res = await adminFetch('/api/admin/email-builder', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ action: 'section-save', name, blocks: [b] }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setMine((m) => [{ id: j.id, name, blocks: [b] }, ...m]); setTestMsg(`Saved "${name}". Find it under + in any email.`); }
    else setErr(j.error || 'Could not save the section.');
  }

  const sections: Section[] = [...mine, ...BUILT_IN_SECTIONS.map((s) => ({ name: s.name, blocks: s.blocks() }))];
  const branded = d.doc.branded !== false;

  return (
    <div className="flex flex-col gap-3" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => setDrag(null)}>
      {notice && <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">{notice}</p>}
      <input className="input-base" placeholder="Name (only you see this)" value={d.name} onChange={(e) => { const v = e.target.value; change((x) => ({ ...x, name: v })); }} />
      <input className="input-base" placeholder="Subject" value={d.subject} onChange={(e) => { const v = e.target.value; change((x) => ({ ...x, subject: v })); }} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Chip on={branded} onClick={() => change((x) => ({ ...x, doc: { ...x.doc, branded: true } }))}>GTS header and footer</Chip>
        <Chip on={!branded} onClick={() => change((x) => ({ ...x, doc: { ...x.doc, branded: false } }))}>No header</Chip>
        <label className="inline-flex items-center gap-1.5 text-xs text-gray-700">
          <input type="checkbox" checked={d.send_plain} onChange={(e) => { const v = e.target.checked; change((x) => ({ ...x, send_plain: v })); }} />
          Send as plain text
        </label>
        <div className="ml-auto flex gap-1">
          <Chip on={width === 'desktop'} onClick={() => setWidth('desktop')}>Computer</Chip>
          <Chip on={width === 'phone'} onClick={() => setWidth('phone')}>Phone</Chip>
        </div>
      </div>

      {/* The email, edited where it stands. */}
      <div className="rounded-xl bg-gray-100 p-2 sm:p-3">
        <div className="mx-auto bg-white rounded-lg shadow-sm overflow-visible" style={{ maxWidth: width === 'phone' ? 390 : 600 }} onClick={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
          {branded && (
            <div className="rounded-t-lg px-4 py-3 flex items-center gap-3" style={{ background: BRAND.green.bg, borderBottom: `4px solid ${BRAND.yellow.bg}` }}>
              <img src="/branding/gts-badge.png" alt="" className="w-10 h-10" />
              <div><p className="text-white text-[13px] font-extrabold tracking-wider uppercase leading-tight">Grafton Towboat Services</p><p className="text-[9px] font-bold tracking-wider uppercase" style={{ color: BRAND.yellow.bg }}>Groceries · Supplies · Crew change</p></div>
            </div>
          )}
          <ol className="px-3 sm:px-6 py-3">
            {blocks.map((b, i) => (
              <li key={b.id} ref={(el) => { refs.current[b.id] = el; }} className="relative">
                <AddHere sections={sections} open={adding === i} setOpen={(v) => setAdding(v ? i : null)} onAdd={(bs) => insertAt(i, bs)} />
                {drag && drag.to === i && <div className="h-1 rounded bg-brand-gold my-1" />}
                <div onClick={() => setSel(b.id)}
                  className={`relative rounded-lg p-1.5 -mx-1.5 transition ${sel === b.id ? 'ring-2 ring-brand-gold bg-amber-50/30' : 'hover:ring-1 hover:ring-gray-200'} ${drag?.id === b.id ? 'opacity-40' : ''}`}>
                  {sel === b.id && (
                    <div className="absolute -top-3 right-1 z-10 flex items-center gap-0.5 rounded-full border border-gray-200 bg-white px-1 shadow">
                      <button type="button" title="Drag to move" onPointerDown={(e) => startDrag(e, b.id)} className="p-1.5 text-gray-500 cursor-grab touch-none"><GripVertical className="w-4 h-4" /></button>
                      <button type="button" title="Copy" onClick={(e) => { e.stopPropagation(); insertAt(i + 1, freshIds([b])); }} className="p-1.5 text-gray-500 hover:text-brand-navy"><Copy className="w-4 h-4" /></button>
                      <button type="button" title="Save as a section" onClick={(e) => { e.stopPropagation(); saveSection(b); }} className="p-1.5 text-gray-500 hover:text-brand-navy"><Bookmark className="w-4 h-4" /></button>
                      <button type="button" title="Remove" onClick={(e) => { e.stopPropagation(); setBlocks((bs) => bs.filter((y) => y.id !== b.id)); setSel(null); }} className="p-1.5 text-gray-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                  <BlockView b={b} selected={sel === b.id} onSelect={() => setSel(b.id)} set={(p) => setBlock(b.id, p)} />
                </div>
              </li>
            ))}
            {drag && drag.to === blocks.length && <div className="h-1 rounded bg-brand-gold my-1" />}
            <AddHere sections={sections} open={adding === blocks.length} setOpen={(v) => setAdding(v ? blocks.length : null)} onAdd={(bs) => insertAt(blocks.length, bs)} />
          </ol>
          {branded && <div className="rounded-b-lg px-4 py-3 text-center text-[10px] font-bold tracking-wider uppercase text-white" style={{ background: BRAND.green.bg, borderTop: `3px solid ${BRAND.orange.bg}` }}>Grafton Towboat Services · (618) 556-0290</div>}
        </div>
        {!blocks.length && <p className="text-center text-sm text-gray-500 py-4">Tap + to add the first part.</p>}
      </div>
      <p className="text-xs text-gray-500">Tap words to change them. Tap a button or picture to change it. Use + to add a part, and the handle to move one.</p>

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
