'use client';
// src/components/admin/PaperFormQuantities.tsx
//
// THE QUANTITIES STEP.
//
// One mark on screen at a time, very large, with a keypad under it. No text
// fields, no scrolling past ninety rows, no hunting for the box that goes with
// the crop you just read. Tap the number, it moves on.
//
// ⚠️ NOTHING HERE GUESSES A NUMBER, AND NOTHING FILLS ITSELF IN.
//
// Tesseract cannot read this handwriting — measured on the real order, 5 of 41
// digits, 35 blank, 1 wrong (the note in paper-form-scan.ts has the detail).
// What IS reliable is that one hand writes the same digit the same way forty
// times, so the marks arrive here already sorted into sets that look alike. A
// person answers a set once and every mark in it takes that answer. The sets
// are built at a threshold measured to never put two different numbers
// together, and the looser "looks like this too" offer below is shown WITH the
// pictures and applies only when someone says so.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Layers, ListChecks, Pencil, SkipForward } from 'lucide-react';
import { type MarkShape, type MarkGroup, similarMarks, PRETICK_THRESHOLD } from '@/lib/paper-form-scan';

export interface QtyMark {
  /** Identifies the row back in the import screen. */
  key: string;
  /** Index into `shapes` / the group members. */
  index: number;
  imageUrl: string | null;
  contextUrl: string;
  description: string;
  page: number;
  qty: string;
  note: string;
}

export interface PaperFormQuantitiesProps {
  marks: QtyMark[];
  shapes: Array<MarkShape | null>;
  groups: MarkGroup[];
  onSet: (keys: string[], qty: string) => void;
  onNote: (key: string, text: string) => void;
}

/** What people actually write on this form, in the order they write it. */
const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '12', '24'];

export function PaperFormQuantities({ marks, shapes, groups, onSet, onNote }: PaperFormQuantitiesProps) {
  const byIndex = useMemo(() => new Map(marks.map(m => [m.index, m])), [marks]);

  /**
   * The sets, in the order worth working through: the ones that answer the most
   * marks at once first, so the longest job is over in the first few taps.
   */
  const sets = useMemo(() => {
    const seen = new Set<number>();
    const out: Array<{ id: string; members: QtyMark[]; lead: QtyMark }> = [];
    for (const g of groups) {
      const members = g.members.map(i => byIndex.get(i)).filter((m): m is QtyMark => !!m);
      if (!members.length) continue;
      for (const m of members) seen.add(m.index);
      const lead = byIndex.get(g.representative) || members[0];
      out.push({ id: `g${g.representative}`, members, lead });
    }
    // A mark whose shape could not be read is still a mark, and still needs a
    // number — it just stands on its own.
    for (const m of marks) {
      if (seen.has(m.index)) continue;
      out.push({ id: `m${m.index}`, members: [m], lead: m });
    }
    return out.sort((a, b) => b.members.length - a.members.length);
  }, [groups, marks, byIndex]);

  const answered = useCallback(
    (s: { members: QtyMark[] }) => s.members.every(m => m.qty.trim() !== '' || m.note.trim() !== ''),
    [],
  );

  const [cursor, setCursor] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [other, setOther] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [suggestOn, setSuggestOn] = useState<Set<number>>(new Set());
  /** Members the operator has tapped out of the current set as "not that one". */
  const [dropped, setDropped] = useState<Set<number>>(new Set());

  const current = sets[cursor];

  const doneMarks = marks.filter(m => m.qty.trim() !== '' || m.note.trim() !== '').length;
  const doneSets = sets.filter(answered).length;

  const advance = useCallback(() => {
    for (let step = 1; step <= sets.length; step++) {
      const i = (cursor + step) % sets.length;
      if (!answered(sets[i])) { setCursor(i); return; }
    }
    setCursor(c => Math.min(sets.length - 1, c + 1));
  }, [cursor, sets, answered]);

  /**
   * Marks OUTSIDE the current set that still look like it.
   *
   * Deliberately a looser test than the one that built the sets, and
   * deliberately never applied on its own — the pictures are right there and
   * the operator ticks the ones that match. On the real order this is where
   * most of the remaining taps go.
   */
  const suggestions = useMemo(() => {
    if (!current) return [];
    const lead = shapes[current.lead.index];
    if (!lead) return [];
    const exclude = new Set(current.members.map(m => m.index));
    return similarMarks(lead, shapes, exclude)
      .map(s => ({ mark: byIndex.get(s.index), distance: s.distance }))
      .filter((s): s is { mark: QtyMark; distance: number } =>
        !!s.mark && s.mark.qty.trim() === '' && s.mark.note.trim() === '')
      .slice(0, 12);
  }, [current, shapes, byIndex]);

  // ⚠️ ONLY THE CLOSE ONES ARRIVE TICKED. An offer that is usually wrong costs
  // a tap to refuse, and refusing ten of them is slower than answering them.
  useEffect(() => {
    setSuggestOn(new Set(
      suggestions.filter(s => s.distance <= PRETICK_THRESHOLD).map(s => s.mark.index),
    ));
  }, [suggestions]);
  useEffect(() => { setOther(''); setNoteDraft(''); setNoteOpen(false); setDropped(new Set()); }, [cursor]);

  const apply = useCallback((value: string) => {
    if (!current) return;
    /**
     * ⚠️ ONLY THE MEMBERS STILL WAITING, AND ONLY THE ONES NOT TAPPED OUT.
     *
     * A member already answered — because it was the odd one out last time
     * round — must not be silently overwritten by the next answer, and a member
     * the operator has just tapped out of the set must not take it either. Both
     * come back on their own afterwards.
     */
    const keys = current.members
      .filter(m => !dropped.has(m.index) && m.qty.trim() === '' && m.note.trim() === '')
      .map(m => m.key);
    for (const s of suggestions) if (suggestOn.has(s.mark.index)) keys.push(s.mark.key);
    setDropped(new Set());
    if (!keys.length) { advance(); return; }
    onSet(keys, value);
    advance();
  }, [current, suggestions, suggestOn, dropped, onSet, advance]);

  /** Desktop: type the number, press Enter. */
  useEffect(() => {
    if (showAll || !current) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key >= '0' && e.key <= '9') { setOther(o => (o + e.key).slice(0, 3)); e.preventDefault(); return; }
      if (e.key === 'Enter') {
        if (other.trim()) apply(other.trim());
        e.preventDefault(); return;
      }
      if (e.key === 'Backspace') { setOther(o => o.slice(0, -1)); e.preventDefault(); return; }
      if (e.key === 'ArrowRight') { setCursor(c => Math.min(sets.length - 1, c + 1)); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { setCursor(c => Math.max(0, c - 1)); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAll, current, other, apply, sets.length]);

  if (!marks.length) return null;

  return (
    <section className="rounded-2xl border border-brand-navy/10 bg-white overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-brand-navy/5 border-b border-brand-navy/10">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-brand-navy flex items-center gap-2">
            <ListChecks className="w-4 h-4" /> Quantities
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {doneMarks} of {marks.length} marks · {doneSets} of {sets.length} sets answered
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className="text-xs font-semibold text-brand-navy hover:underline"
        >
          {showAll ? 'Back to one at a time' : 'Show every mark'}
        </button>
      </header>

      <div className="h-1 bg-gray-100">
        <div
          className="h-1 bg-brand-green transition-all"
          style={{ width: `${marks.length ? (doneMarks / marks.length) * 100 : 0}%` }}
        />
      </div>

      {!showAll && doneMarks === marks.length && marks.length > 0 && (
        <div className="px-4 py-3 bg-brand-green/5 border-b border-brand-green/20 flex items-center gap-2">
          <Check className="w-4 h-4 text-brand-green shrink-0" />
          <p className="text-sm text-brand-navy">
            Every mark has a quantity. Check them below, then add the order.
          </p>
        </div>
      )}

      {showAll ? (
        <div className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {marks.map(m => (
            <div key={m.key} className="rounded-xl border border-gray-100 p-2 flex gap-2 items-center">
              {m.imageUrl
                ? <img src={m.imageUrl} alt="" className="h-12 w-auto max-w-[5rem] object-contain shrink-0" />
                : <span className="text-xs text-gray-400 w-16 shrink-0">no crop</span>}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-brand-navy truncate">{m.description}</p>
                <p className="text-[10px] text-gray-400">p{m.page}</p>
              </div>
              <input
                type="number" min={0} step="any" value={m.qty}
                onChange={e => onSet([m.key], e.target.value)}
                className="input-base w-16 py-1 text-sm text-center"
                placeholder="—"
              />
            </div>
          ))}
        </div>
      ) : current ? (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button" onClick={() => setCursor(c => Math.max(0, c - 1))} disabled={cursor === 0}
              className="p-2 rounded-lg text-gray-400 hover:text-brand-navy disabled:opacity-30" aria-label="Previous">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center min-w-0">
              <p className="text-sm font-semibold text-brand-navy truncate">{current.lead.description}</p>
              <p className="text-[11px] text-gray-400">
                Set {cursor + 1} of {sets.length} · page {current.lead.page}
                {current.members.length > 1 && (
                  <span className="ml-1 inline-flex items-center gap-1 text-brand-green font-semibold">
                    <Layers className="w-3 h-3" /> {current.members.length} marks look identical
                  </span>
                )}
              </p>
            </div>
            <button
              type="button" onClick={() => setCursor(c => Math.min(sets.length - 1, c + 1))}
              disabled={cursor >= sets.length - 1}
              className="p-2 rounded-lg text-gray-400 hover:text-brand-navy disabled:opacity-30" aria-label="Next">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex items-center justify-center min-h-[8rem]">
            {current.lead.imageUrl
              ? <img src={current.lead.imageUrl} alt="The handwritten quantity" className="max-h-40 w-auto" />
              : <p className="text-xs text-gray-400">No clean crop — use the row below.</p>}
          </div>

          {current.members.length > 1 && (
            <div className="space-y-1">
              {/* ⚠️ EVERY MEMBER IS SHOWN, AND EVERY MEMBER CAN BE REMOVED.
                  The sets are built by shape, and a mark cut short by the row
                  rule above it can look like a different digit. The threshold
                  is set low enough that this is rare; this row is what makes it
                  harmless when it happens. */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {current.members.map(m => {
                  const settled = m.qty.trim() !== '' || m.note.trim() !== '';
                  const out = dropped.has(m.index);
                  return (
                    <button
                      key={m.key} type="button" disabled={settled}
                      onClick={() => setDropped(prev => {
                        const next = new Set(prev);
                        if (next.has(m.index)) next.delete(m.index); else next.add(m.index);
                        return next;
                      })}
                      title={settled
                        ? `Already ${m.qty || m.note}`
                        : out ? 'Put this one back' : `${m.description} — tap if this one is different`}
                      className={`relative rounded-lg border-2 p-0.5 bg-white shrink-0 transition ${
                        settled ? 'border-gray-200 opacity-60'
                          : out ? 'border-gray-200 opacity-35' : 'border-brand-green/60'
                      }`}>
                      {m.imageUrl
                        ? <img src={m.imageUrl} alt="" className="h-10 w-auto" />
                        : <span className="block h-10 px-2 text-[10px] leading-10 text-gray-400">p{m.page}</span>}
                      {settled && (
                        <span className="absolute -top-1.5 -right-1.5 rounded-full bg-brand-green text-white
                                         text-[10px] font-bold px-1.5 leading-4">{m.qty || '•'}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-400">
                Tap any of these if it is not the same number — it drops out and gets asked on its own.
              </p>
            </div>
          )}

          <div className="grid grid-cols-4 gap-2">
            {PAD.map(v => (
              <button
                key={v} type="button" onClick={() => apply(v)}
                className="py-3 rounded-xl border border-gray-200 bg-white text-lg font-bold text-brand-navy
                           hover:border-brand-green hover:bg-brand-green/5 active:scale-95 transition">
                {v}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="number" min={0} step="any" inputMode="numeric" value={other}
              onChange={e => setOther(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && other.trim()) { e.preventDefault(); apply(other.trim()); } }}
              placeholder="Other"
              className="input-base w-24 py-2 text-center"
              aria-label="Another quantity"
            />
            <button
              type="button" disabled={!other.trim()} onClick={() => apply(other.trim())}
              className="btn-primary px-4 py-2 text-sm disabled:opacity-40 flex items-center gap-1.5">
              <Check className="w-4 h-4" /> Use this
            </button>
            <button
              type="button" onClick={() => setNoteOpen(v => !v)}
              className="btn-outline px-3 py-2 text-sm flex items-center gap-1.5">
              <Pencil className="w-4 h-4" /> Not a number
            </button>
            <button
              type="button" onClick={advance}
              className="ml-auto text-xs text-gray-400 hover:text-brand-navy flex items-center gap-1">
              <SkipForward className="w-3.5 h-3.5" /> Skip
            </button>
          </div>

          {noteOpen && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-xs text-amber-900">
                Marks like “Case”, “5#” or “2 bags” mean something to the cook. Write it down and it
                travels with the order instead of turning into a number nobody meant.
              </p>
              <div className="flex gap-2">
                <input
                  type="text" value={noteDraft} onChange={e => setNoteDraft(e.target.value)}
                  placeholder="Case, 5#, 2 bags…"
                  className="input-base flex-1 py-2 text-sm"
                />
                <button
                  type="button" disabled={!noteDraft.trim()}
                  onClick={() => { onNote(current.lead.key, noteDraft.trim()); setNoteOpen(false); advance(); }}
                  className="btn-primary px-3 py-2 text-sm disabled:opacity-40">Save</button>
              </div>
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-3 space-y-2">
              <p className="text-xs text-sky-900 font-semibold">
                {suggestions.length} more mark{suggestions.length === 1 ? '' : 's'} look like this one.
                The close ones are already ticked — tap to change your mind either way.
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map(({ mark }) => {
                  const on = suggestOn.has(mark.index);
                  return (
                    <button
                      key={mark.key} type="button"
                      onClick={() => setSuggestOn(prev => {
                        const next = new Set(prev);
                        if (next.has(mark.index)) next.delete(mark.index); else next.add(mark.index);
                        return next;
                      })}
                      title={`${mark.description} · p${mark.page}`}
                      className={`rounded-lg border-2 p-1 bg-white transition ${
                        on ? 'border-brand-green' : 'border-gray-200 opacity-45'
                      }`}>
                      {mark.imageUrl
                        ? <img src={mark.imageUrl} alt="" className="h-9 w-auto" />
                        : <span className="block h-9 px-2 text-[10px] leading-9 text-gray-400">p{mark.page}</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-sky-800">
                Whatever you tap above is applied to the {suggestOn.size} ticked here as well.
              </p>
            </div>
          )}

          <details className="group">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-brand-navy">
              Show this row on the page
            </summary>
            <img src={current.lead.contextUrl} alt="" className="mt-2 w-full rounded-lg border border-gray-200" />
          </details>
        </div>
      ) : null}
    </section>
  );
}
