'use client';
// Optional Sinclair's grocery handling fee — sits under the register total.
// Distinct from COD handling (cod_fee_*) and from Grafton's delivery fee.
// Empty by default; $50 is a soft suggest only.

import { cn } from '@/lib/utils';

const SOFT_SUGGEST = 50;

export function GroceryHandlingFeeField({
  value,
  onChange,
  disabled,
  compact,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Tighter layout for table / overlay bars */
  compact?: boolean;
  className?: string;
}) {
  const hasValue = value.trim() !== '';
  const num = hasValue ? parseFloat(value) : NaN;
  const showChip = !hasValue || Number.isNaN(num) || num !== SOFT_SUGGEST;

  return (
    <div
      className={cn(
        'rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-white to-brand-sand/40',
        compact ? 'px-3 py-2.5' : 'px-3.5 py-3',
        className,
      )}
    >
      <div className={cn('flex flex-wrap items-start gap-x-3 gap-y-2', compact ? '' : '')}>
        <div className="min-w-[10rem] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn(
              'font-bold text-brand-navy tracking-wide',
              compact ? 'text-xs uppercase' : 'text-[11px] uppercase',
            )}>
              Handling fee <span className="text-amber-800/90">(grocery)</span>
            </p>
            <span className="inline-flex items-center rounded-full bg-white/90 border border-amber-200/70 px-2 py-0.5 text-[10px] font-semibold text-amber-900/80 tracking-wide">
              Optional
            </span>
          </div>
          <p className={cn('text-gray-500 leading-snug', compact ? 'text-[11px] mt-0.5' : 'text-xs mt-1')}>
            Some boats skip this. Soft suggest{' '}
            <span className="font-semibold text-brand-navy/70">$50</span>
            {' '}— never required.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
          {showChip && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(String(SOFT_SUGGEST))}
              className={cn(
                'rounded-full border border-amber-300/80 bg-white px-2.5 py-1 text-xs font-bold text-amber-900',
                'hover:bg-amber-100/80 hover:border-amber-400 transition-colors',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/50',
              )}
              title="Fill $50 — optional"
            >
              $50
            </button>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-gray-400">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="50"
              disabled={disabled}
              value={value}
              onChange={e => onChange(e.target.value)}
              aria-label="Grocery handling fee (optional)"
              className={cn(
                'w-28 text-right font-display font-bold text-brand-navy',
                'border border-amber-200/90 rounded-lg bg-white/95',
                'px-2.5 py-1.5 text-base',
                'placeholder:text-amber-800/35 placeholder:font-semibold',
                'focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-navy/40',
                'disabled:opacity-50',
              )}
            />
          </div>
        </div>
      </div>
      {hasValue && !Number.isNaN(num) && num > 0 && (
        <p className="mt-1.5 text-[11px] text-amber-900/70 font-medium">
          Sinclair&apos;s charge, on top of the register. Not COD handling, and not Grafton&apos;s delivery fee.
        </p>
      )}
    </div>
  );
}
