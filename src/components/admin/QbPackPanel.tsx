'use client';
// src/components/admin/QbPackPanel.tsx
//
// "For QuickBooks" — one delivery, laid out as the one invoice Mary Karen will
// type into QBO Plus.
//
// DESIGN RULE: she should never need the Google Sheet open beside this.
// Everything that used to require hunting — the fee, the grocery total, which
// lines get taxed, the PO, the tape, the slip — is on this panel with a copy
// button next to it.
//
// ⚠️ WE DO NOT INVOICE FROM HERE. No invoice number, no PDF, no email to AP.
// Plus is the system of record. The only thing this panel writes back is
// "Mary entered this in QuickBooks".

import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Copy, Check, AlertTriangle, FileText, Receipt,
  ExternalLink, Loader2, ShieldAlert,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-auth';
import { buildPack, linesAsText, packIsClean, type PackDelivery } from '@/lib/quickbooks-pack';

export default function QbPackPanel({ delivery, onClose, onMarked }: {
  delivery: PackDelivery & { customer_invoiced_in_qb?: boolean };
  onClose: () => void;
  onMarked: () => void;
}) {
  const pack = buildPack(delivery);
  const [copied, setCopied] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(c => (c === key ? '' : c)), 1600);
    } catch {
      setError('Your browser blocked the copy. Select the text and copy it manually.');
    }
  }

  async function markInvoiced() {
    setSaving(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/deliveries/qb-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [delivery.id], customer_invoiced_in_qb: true }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save that');
      onMarked();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that');
    } finally {
      setSaving(false);
    }
  }

  const CopyBtn = ({ text, k, label = 'Copy' }: { text: string; k: string; label?: string }) => (
    <button onClick={() => copy(text, k)}
      className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
        copied === k
          ? 'border-green-300 bg-green-50 text-green-700'
          : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-brand-navy'
      }`}>
      {copied === k ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied === k ? 'Copied' : label}
    </button>
  );

  const errors = pack.warnings.filter(w => w.level === 'error');
  const warns = pack.warnings.filter(w => w.level === 'warn');

  return createPortal(
    // No backdrop click-to-close: Mary is mid-transcription into another
    // window, and a stray click that wipes the panel means starting over.
    <div className="fixed inset-0 z-[95] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-bold text-brand-navy">For QuickBooks</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Type this into QBO Plus. We don&apos;t create the invoice — you do.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">

          {/* THE BANNER. Always visible, never dismissible. This is the single
              most expensive mistake available on this screen: taxing the
              courtesy line charges the barge line tax twice and makes GTS
              remit tax it never collected. */}
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 flex gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-[13px] text-amber-900 leading-relaxed">
              <strong>Do not let Plus add sales tax to Sinclair&apos;s courtesy.</strong>{' '}
              That tax is already in the register total.
            </p>
          </div>

          {errors.map((w, i) => (
            <div key={i} className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex gap-3">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-[13px] text-red-800 leading-relaxed">{w.text}</p>
            </div>
          ))}

          {/* ── A. Customer ─────────────────────────────────────────────── */}
          <Block title="Customer" hint="The barge line, not the boat.">
            <div className="flex items-center gap-3">
              <p className="flex-1 font-bold text-brand-navy">{pack.customer || <span className="text-red-600">No company on this row</span>}</p>
              {pack.customer && <CopyBtn text={pack.customer} k="customer" />}
            </div>
          </Block>

          {/* ── B. Memo ─────────────────────────────────────────────────── */}
          <Block title="Memo" hint="Paste into the QBO memo field.">
            <div className="flex items-start gap-3">
              <p className="flex-1 font-mono text-[13px] text-brand-navy leading-relaxed break-words">
                {pack.memo}
              </p>
              <CopyBtn text={pack.memo} k="memo" />
            </div>
          </Block>

          {/* ── C. Lines ────────────────────────────────────────────────── */}
          <Block
            title="Lines"
            hint="Each line is copyable on its own — QBO can't paste more than one row at a time."
            action={<CopyBtn text={linesAsText(pack)} k="alllines" label="Copy all" />}
          >
            <div className="divide-y divide-gray-100">
              {pack.lines.map((l, i) => (
                <div key={i} className="py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-brand-navy truncate">{l.description}</p>
                    {l.note && <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{l.note}</p>}
                  </div>
                  <p className="text-sm font-bold text-brand-navy tabular-nums shrink-0">
                    {formatCurrency(l.amount)}
                  </p>
                  {/* The tax flag is the reason this panel exists — it gets
                      colour and weight, not a quiet grey label. */}
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md shrink-0 ${
                    l.taxable
                      ? 'bg-brand-navy text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    Tax: {l.taxable ? 'Yes' : 'No'}
                  </span>
                  <CopyBtn text={`${l.description}\t${l.amount.toFixed(2)}`} k={`line${i}`} label="" />
                </div>
              ))}
              {!pack.lines.length && (
                <p className="py-4 text-sm text-gray-400 text-center">Nothing to invoice on this row.</p>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 mt-1 border-t border-gray-200">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Before tax
              </span>
              <span className="font-display text-lg font-bold text-brand-navy tabular-nums">
                {formatCurrency(pack.total)}
              </span>
            </div>
          </Block>

          {/* ── D. Attachments ──────────────────────────────────────────── */}
          <Block title="Attachments" hint="Attach these to the invoice in QBO.">
            <div className="space-y-2">
              <Attachment
                label="Sinclair's tape"
                icon={Receipt}
                url={pack.attachments.sinclairTapeUrl}
                missing={delivery.grocery_mode === 'sinclair_courtesy' && !pack.attachments.sinclairTapeUrl}
                missingLevel="error"
                missingText="Need tape"
              />
              <Attachment
                label="Signed delivery log"
                icon={FileText}
                url={pack.attachments.signedSlipUrl}
                missing={!!delivery.company?.requires_signed_receipt && !pack.attachments.signedSlipUrl}
                missingLevel="warn"
                missingText="Need slip — don't send to AP yet"
              />
            </div>
          </Block>

          {warns.map((w, i) => (
            <div key={i} className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 flex gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[13px] text-amber-800 leading-relaxed">{w.text}</p>
            </div>
          ))}

          {error && (
            <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* ── E. Done ───────────────────────────────────────────────────── */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 items-center">
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Close
          </button>
          {delivery.customer_invoiced_in_qb ? (
            <p className="flex-1 text-sm font-semibold text-green-700 flex items-center justify-center gap-2">
              <Check className="w-4 h-4" /> Already marked as entered
            </p>
          ) : (
            <button onClick={markInvoiced} disabled={saving}
              // NOT disabled on errors. Mary may know something the data
              // doesn't — a tape that arrived by text, a total she has on
              // paper. Blocking her would send her back to the spreadsheet,
              // which is the exact habit this screen replaces.
              className="flex-1 py-2.5 rounded-xl bg-brand-green text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-brand-gmed disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              I entered this in QuickBooks
            </button>
          )}
        </div>

        {!packIsClean(pack) && !delivery.customer_invoiced_in_qb && (
          <p className="px-5 pb-4 -mt-1 text-[11px] text-gray-400 text-center leading-relaxed">
            You can still mark it entered — the warnings above are for your judgement, not a lock.
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Block({ title, hint, action, children }: {
  title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{title}</h4>
          {hint && <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Attachment({ label, icon: Icon, url, missing, missingLevel, missingText }: {
  label: string;
  icon: typeof FileText;
  url: string | null;
  missing: boolean;
  missingLevel: 'error' | 'warn';
  missingText: string;
}) {
  if (url) {
    return (
      <div className="flex items-center gap-3">
        <Icon className="w-4 h-4 text-brand-navy shrink-0" />
        <span className="text-sm text-brand-navy flex-1">{label}</span>
        <a href={url} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-brand-navy">
          <ExternalLink className="w-3 h-3" /> Open
        </a>
        <a href={url} download
          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-brand-navy">
          Download
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-gray-300 shrink-0" />
      <span className="text-sm text-gray-400 flex-1">{label}</span>
      {missing ? (
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
          missingLevel === 'error'
            ? 'bg-red-100 text-red-700'
            : 'bg-amber-100 text-amber-800'
        }`}>
          {missingText}
        </span>
      ) : (
        <span className="text-[11px] text-gray-300">Not needed</span>
      )}
    </div>
  );
}
