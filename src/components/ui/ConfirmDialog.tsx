'use client';
// src/components/ui/ConfirmDialog.tsx
// In-app replacement for window.confirm()/alert() — every confirmation in the
// app renders as our own styled dialog, never a browser-native popup
// (Deepen: "any feature that is browser side popping up a message needs to be
// in the app as its own message").
//
// Usage:
//   const { confirm, dialog } = useConfirm();
//   ...
//   if (!(await confirm({ title: 'Delete this coupon?', danger: true }))) return;
//   ...
//   return (<> ... {dialog} </>);
//
// Multi-choice (returns the chosen action id, or null on cancel/backdrop):
//   const choice = await confirm({
//     title: 'Mark as In Progress before printing?',
//     actions: [
//       { id: 'lock',  label: 'Lock & Print' },
//       { id: 'print', label: 'Just Print', variant: 'neutral' },
//     ],
//   });

import { useCallback, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle } from 'lucide-react';

export interface ConfirmAction {
  id: string;
  label: string;
  variant?: 'primary' | 'danger' | 'neutral';
}

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  /** Custom action buttons. Default: one Confirm button (id 'ok'). */
  actions?: ConfirmAction[];
  /** Styles the default action red + warning icon. */
  danger?: boolean;
  cancelLabel?: string;
}

const VARIANT_CLASSES: Record<string, string> = {
  primary: 'bg-brand-navy text-white hover:bg-brand-steel',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  neutral: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
};

export function useConfirm() {
  const [pending, setPending] = useState<null | {
    opts: ConfirmOptions;
    resolve: (choice: string | null) => void;
  }>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<string | null>(resolve => setPending({ opts, resolve }));
  }, []);

  function settle(choice: string | null) {
    pending?.resolve(choice);
    setPending(null);
  }

  const dialog = pending
    ? createPortal(
        <div className="fixed inset-0 z-[110] bg-black/60 flex items-center justify-center p-4"
          onClick={() => settle(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 animate-fade-in"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                pending.opts.danger ? 'bg-red-100' : 'bg-brand-sand'
              }`}>
                {pending.opts.danger
                  ? <AlertTriangle className="w-5 h-5 text-red-600" />
                  : <HelpCircle className="w-5 h-5 text-brand-navy" />}
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-base font-bold text-brand-navy leading-snug">
                  {pending.opts.title}
                </h3>
                {pending.opts.message && (
                  <div className="text-sm text-gray-600 mt-1.5 leading-relaxed">{pending.opts.message}</div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 mt-4">
              {(pending.opts.actions ?? [{ id: 'ok', label: 'Confirm', variant: pending.opts.danger ? 'danger' as const : 'primary' as const }])
                .map(a => (
                  <button key={a.id}
                    onClick={() => settle(a.id)}
                    className={`w-full py-2.5 rounded-xl text-sm font-bold transition-colors ${
                      VARIANT_CLASSES[a.variant ?? (pending.opts.danger ? 'danger' : 'primary')]
                    }`}>
                    {a.label}
                  </button>
                ))}
              <button onClick={() => settle(null)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
                {pending.opts.cancelLabel ?? 'Cancel'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return { confirm, dialog };
}
