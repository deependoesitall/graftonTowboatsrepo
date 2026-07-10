'use client';
// src/components/ui/EstimatedInfo.tsx
// The "Why estimated?" helper Jen asked to appear everywhere an Estimated
// Total is shown — exact wording from the checkout tooltip.
import { useState, useRef, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';

export const ESTIMATED_EXPLANATION =
  'Some orders may display an estimated total at checkout. This is because certain items are sold by weight, market prices may change, or substitutions may be necessary if an item is unavailable. Your final invoice will reflect the actual items delivered, including any approved substitutions, quantity adjustments, or weighted products. We make every effort to keep pricing accurate and will contact you if there are any significant changes to your order. If you have any questions, please contact us at (618) 556-0290 or GraftonTowboatServices@gmail.com.';

export function EstimatedInfo({ align = 'left' }: { align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  return (
    <span className="relative inline-flex" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 text-xs font-normal text-brand-river hover:text-brand-navy focus:outline-none align-middle">
        <HelpCircle className="w-3.5 h-3.5" />
        <span className="underline underline-offset-2">Why estimated?</span>
      </button>
      {open && (
        <span className={`absolute bottom-full ${align === 'right' ? 'right-0' : 'left-0'} mb-2 z-30 w-80 max-w-[85vw] bg-white border border-gray-200 rounded-lg shadow-xl p-4 block text-left font-normal normal-case`}>
          <span className="flex justify-between gap-2 mb-2">
            <span className="font-bold text-gray-800 text-sm">Why is my total estimated?</span>
            <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
          <span className="text-xs text-gray-600 leading-relaxed block">{ESTIMATED_EXPLANATION}</span>
        </span>
      )}
    </span>
  );
}
