'use client';
// src/components/order/OrderStatusTimeline.tsx
import { Check } from 'lucide-react';
import { customerOrderTimeline, type TimelineStep } from '@/lib/customer-order-status';

export function OrderStatusTimeline({
  status,
  deliveryMethod,
  compact = false,
}: {
  status?: string | null;
  deliveryMethod?: string | null;
  compact?: boolean;
}) {
  const steps = customerOrderTimeline(status, deliveryMethod);
  if (steps.length === 1 && steps[0].key === 'cancelled') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-semibold">
        {steps[0].blurb}
      </div>
    );
  }

  return (
    <ol
      className={`rounded-2xl border border-brand-green/15 bg-white ${compact ? 'px-3 py-3' : 'px-4 py-4'} shadow-sm`}
      aria-label="What happens next"
    >
      {!compact && (
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-green/50 mb-3">
          What happens next
        </p>
      )}
      <div className="flex flex-col gap-0">
        {steps.map((step, i) => (
          <TimelineRow key={step.key} step={step} last={i === steps.length - 1} compact={compact} />
        ))}
      </div>
    </ol>
  );
}

function TimelineRow({
  step,
  last,
  compact,
}: {
  step: TimelineStep;
  last: boolean;
  compact: boolean;
}) {
  const done = step.state === 'past' || step.state === 'current';
  const current = step.state === 'current';
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${
            current
              ? 'bg-brand-orange border-brand-orange text-white'
              : done
                ? 'bg-brand-green border-brand-green text-white'
                : 'bg-white border-brand-green/25 text-brand-green/30'
          }`}
          aria-current={current ? 'step' : undefined}
        >
          {done && !current ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : (
            <span className={`w-2 h-2 rounded-full ${current ? 'bg-white' : 'bg-current'}`} />
          )}
        </span>
        {!last && (
          <span
            className={`w-0.5 flex-1 min-h-[1.1rem] my-0.5 ${
              step.state === 'past' ? 'bg-brand-green/40' : 'bg-brand-green/15'
            }`}
          />
        )}
      </div>
      <div className={`min-w-0 ${last ? '' : 'pb-3'}`}>
        <p className={`font-bold text-sm leading-tight ${
          current ? 'text-brand-navy' : done ? 'text-brand-green' : 'text-brand-green/40'
        }`}>
          {step.label}
          {current && (
            <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-brand-orange">
              Now
            </span>
          )}
        </p>
        <p className={`text-xs leading-relaxed mt-0.5 ${
          current ? 'text-brand-green/70' : 'text-brand-green/40'
        }`}>
          {step.blurb}
        </p>
      </div>
    </li>
  );
}
