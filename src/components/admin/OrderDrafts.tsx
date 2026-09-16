'use client';
// src/components/admin/OrderDrafts.tsx
//
// The Drafted Orders strip at the top of the order builder.
//
// ⚠️ IT ONLY APPEARS WHEN THERE IS SOMETHING TO SAY. No drafts, or a database
// without migration 090, and this renders nothing at all — the builder works
// exactly as it did before drafts existed. A permanent empty panel on the page
// staff use most would be a tax on every order to advertise a feature.

import { useCallback, useEffect, useState } from 'react';
import { FileClock, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import { adminFetch } from '@/lib/admin-auth';
import { formatCurrency } from '@/lib/utils';
import { draftTouchedLabel, type DraftRow } from '@/lib/order-draft';

export function OrderDraftsBar({
  currentDraftId, onResume, refreshKey,
}: {
  /** Hidden from the list — you are already in it. */
  currentDraftId: string | null;
  onResume: (id: string) => void;
  /** Changes when the builder saves, so the strip re-reads. */
  refreshKey: number;
}) {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/order-drafts');
      if (!res.ok) { setDrafts([]); return; }
      const body = await res.json();
      setDrafts((body.drafts as DraftRow[]) || []);
    } catch {
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function discard(id: string) {
    setBusyId(id);
    try {
      await adminFetch(`/api/admin/order-drafts/${id}`, { method: 'DELETE' });
      setDrafts(d => d.filter(x => x.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  const others = drafts.filter(d => d.id !== currentDraftId);
  if (loading || dismissed || others.length === 0) return null;

  return (
    <div className="mb-5 rounded-xl border border-brand-navy/15 bg-brand-navy/[0.03] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-brand-navy/10">
        <FileClock className="w-4 h-4 text-brand-navy/50 shrink-0" />
        <p className="text-sm font-bold text-brand-navy flex-1">
          {others.length} order{others.length === 1 ? '' : 's'} part-built
        </p>
        <button type="button" onClick={() => setDismissed(true)}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Hide drafts">
          <X className="w-4 h-4" />
        </button>
      </div>
      <ul className="divide-y divide-brand-navy/10">
        {others.slice(0, 6).map(d => (
          <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-brand-navy truncate">
                {d.vessel_name || 'No boat yet'}
                {d.company_name ? <span className="text-gray-400 font-normal"> · {d.company_name}</span> : null}
              </p>
              <p className="text-xs text-gray-400">
                {d.line_count} line{d.line_count === 1 ? '' : 's'}
                {d.subtotal > 0 ? ` · ${formatCurrency(d.subtotal)}` : ''}
                {' · '}{draftTouchedLabel(d)}
              </p>
            </div>
            <button type="button" onClick={() => onResume(d.id)}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-navy/90 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> Carry on
            </button>
            <button type="button" onClick={() => discard(d.id)} disabled={busyId === d.id}
              className="shrink-0 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
              aria-label={`Discard draft for ${d.vessel_name || 'unnamed boat'}`}>
              {busyId === d.id
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Trash2 className="w-4 h-4" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The little "saved" marker that sits beside the page title. */
export function DraftSaveState({ state, touchedBy }: {
  state: 'idle' | 'saving' | 'saved' | 'error';
  /** Set when somebody else has saved over this draft since we loaded it. */
  touchedBy: string | null;
}) {
  if (touchedBy) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
        {touchedBy} is working on this draft too — whoever saves last wins
      </span>
    );
  }
  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
        <Loader2 className="w-3 h-3 animate-spin" /> Saving draft
      </span>
    );
  }
  if (state === 'saved') {
    return <span className="text-xs text-gray-400">Draft saved</span>;
  }
  if (state === 'error') {
    return (
      <span className="text-xs text-amber-700">
        Draft not saved — the order itself is unaffected
      </span>
    );
  }
  return null;
}
