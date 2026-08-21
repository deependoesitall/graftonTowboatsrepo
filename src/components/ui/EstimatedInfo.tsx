'use client';
// src/components/ui/EstimatedInfo.tsx
// The "Why estimated?" helper Jen asked to appear everywhere an Estimated
// Total is shown — exact wording from the checkout tooltip.
//
// PORTALED TO <body>, DELIBERATELY. This used to be an absolutely-positioned
// span inside the trigger. Every place it appears sits inside a rounded card,
// and those cards clip their overflow — so on the confirmation page the
// explanation was cut in half by the card edge. An absolute element can always
// be clipped by an ancestor; a fixed element in a portal cannot, because it
// escapes the card entirely. Same reason the order dialogs portal out.
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';

export const ESTIMATED_EXPLANATION =
  'Some orders may display an estimated total at checkout. This is because certain items are sold by weight, market prices may change, or substitutions may be necessary if an item is unavailable. Your final invoice will reflect the actual items delivered, including any approved substitutions, quantity adjustments, or weighted products. We make every effort to keep pricing accurate and will contact you if there are any significant changes to your order. If you have any questions, please contact us at (618) 556-0290 or GraftonTowboatServices@gmail.com.';

const PANEL_WIDTH = 320;
const GAP = 8;
const MARGIN = 12;   // keep this far from the viewport edge

export function EstimatedInfo({ align = 'left' }: { align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  /** Place the panel above the trigger, flipping below when there isn't room,
   *  and clamp it inside the viewport so it can never run off screen. */
  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH, window.innerWidth - MARGIN * 2);
    const panelH = panelRef.current?.offsetHeight ?? 240;

    const roomAbove = r.top;
    const top = roomAbove > panelH + GAP + MARGIN
      ? r.top - panelH - GAP                       // preferred: above
      : Math.min(r.bottom + GAP, window.innerHeight - panelH - MARGIN); // flip below

    let left = align === 'right' ? r.right - width : r.left;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN));

    setPos({ top: Math.max(MARGIN, top), left, width });
  }, [align]);

  useEffect(() => {
    if (!open) return;
    place();
    // Re-measure once the panel has rendered and its real height is known.
    const raf = requestAnimationFrame(place);

    function outside(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }

    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', onKey);
    // Anchored to a moving element — follow it rather than drift away from it.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  return (
    <span className="inline-flex">
      <button ref={triggerRef} type="button" onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs font-normal text-brand-river hover:text-brand-navy focus:outline-none align-middle">
        <HelpCircle className="w-3.5 h-3.5" />
        <span className="underline underline-offset-2">Why estimated?</span>
      </button>

      {mounted && open && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          style={{
            position: 'fixed',
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            width: pos?.width ?? PANEL_WIDTH,
            // Hidden until measured, so it never flashes in the wrong spot.
            visibility: pos ? 'visible' : 'hidden',
          }}
          className="z-[100] bg-white border border-gray-200 rounded-lg shadow-xl p-4 text-left font-normal normal-case max-h-[70vh] overflow-y-auto"
        >
          <div className="flex justify-between gap-2 mb-2">
            <span className="font-bold text-gray-800 text-sm">Why is my total estimated?</span>
            <button type="button" onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600 shrink-0" aria-label="Close">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">{ESTIMATED_EXPLANATION}</p>
        </div>,
        document.body,
      )}
    </span>
  );
}
