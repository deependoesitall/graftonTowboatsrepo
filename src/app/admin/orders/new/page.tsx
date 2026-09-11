'use client';
// src/app/admin/orders/new/page.tsx
//
// PAPER ORDER → SYSTEM ORDER, IN ONE SITTING.
//
// ── THE JOB THIS TOOL IS SHAPED AROUND ───────────────────────────────────
//
// A cook prints Sinclair's order form, pencils quantities into the QNTY
// column, scans twenty pages and emails them. Somebody at GTS then has to turn
// that into an order here. Until now the only way was to open the customer
// storefront and shop as if you were the boat: search each item by name, wait
// for a card with a photograph, click add, watch it animate, search again.
//
// That is a shopping tool being used for a transcription job, and the two want
// opposite things. Shopping wants discovery — pictures, categories, related
// items. Transcription wants the eye to never leave the line it is on.
//
// So SHEET mode renders the catalogue in the exact order of the paper form
// (products.form_seq, migration 035 — the same ordering the barges asked for),
// with one quantity box per row. You hold the scan beside the screen, read
// down, and type. Tab moves to the next row because the boxes are in document
// order; nothing else has to be true for that to work.
//
// QUICK ADD is for the other half of the paper: rows where the cook wrote next
// to a printed UPC. Type the UPC, type the number, Enter. No searching.
//
// PASTE is for an order that arrived as a text message or an email body.
//
// SCAN is for the marked paper form itself — PDF or photos of the QNTY
// column. Ink detection + optional OCR prefill a review list; nothing is
// committed until staff confirm.
//
// ── WHY IT SUBMITS TO /api/orders AND NOT SOMEWHERE NEW ────────────────────
//
// That endpoint already prices the lines, applies the sale and coupon rules,
// writes the COD apportionment, emails the boat and Sinclair's, and fires the
// staff notifications. A second "admin order" path would be a second copy of
// all of it, and the copy would drift — quietly, in the direction of whichever
// one gets tested less. A staff-built order is a normal order. The only thing
// that makes it different is a line in the notes saying who typed it.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Loader2, Check, X, Plus, Minus, ClipboardPaste,
  Keyboard, ListOrdered, ChevronRight, AlertCircle, Ship, Camera,
} from 'lucide-react';
import { adminFetch, fetchAdminSession } from '@/lib/admin-auth';
import { formatCurrency } from '@/lib/utils';
import { PaperFormImport, type CustomLine } from '@/components/admin/PaperFormImport';

/* ───────────────────────── types ───────────────────────── */

interface SheetItem {
  id: string;
  upc: string | null;
  description: string;
  category: string;
  sub_category: string | null;
  pkg_size: string | null;
  uom: string | null;
  price: number;
  quantity_step: number | null;
  billed_by_weight: boolean;
  form_section: string | null;
  form_subsection: string | null;
  form_seq: number | null;
  image_url: string | null;
  is_available: boolean;
}

interface VesselHeader {
  vessel_name: string;
  company_name: string;
  vessel_type: string;
  captain_name: string;
  captain_phone: string;
  vessel_email: string;
  billing_email: string;
  contact_name: string;
  phone: string;
  terminal_name: string;
  delivery_method: 'boat' | 'van' | '';
  approach_side: string;
  vhf_channel: string;
  po_number: string;
  last_ordered: string;
  order_count: number;
}

type Mode = 'sheet' | 'quick' | 'paste' | 'scan';

/** The order header, exactly the fields /api/orders takes for a vessel. */
interface HeaderState {
  vessel_name: string; company_name: string; vessel_type: string;
  captain_name: string; captain_phone: string; vessel_email: string; billing_email: string;
  contact_name: string; phone: string;
  terminal_name: string; arrival_date: string; arrival_time: string;
  delivery_method: '' | 'boat' | 'van';
  approach_side: string; vhf_channel: string; po_number: string; notes: string;
}

/* ───────────────────────── helpers ───────────────────────── */

/** Digits only — UPCs are printed with no separators on the form. */
const digits = (s: string) => s.replace(/\D+/g, '');

/**
 * UPC match is deliberately forgiving about leading zeros.
 *
 * The printed form, the register and our own catalogue do not agree on whether
 * a 12-digit UPC-A carries its leading zero, and a human typing one off a page
 * will copy whatever is printed. Comparing the significant digits means the
 * person doing the typing never has to care which convention a given row used.
 */
const upcKey = (s: string | null | undefined) => digits(s || '').replace(/^0+/, '');

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/* ───────────────────────── page ────────────────────────── */

export default function NewOrderPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [items, setItems] = useState<SheetItem[]>([]);
  const [vessels, setVessels] = useState<VesselHeader[]>([]);
  const [terminals, setTerminals] = useState<string[]>([]);
  const [loadError, setLoadError] = useState('');

  // qty by product id. Kept separate from the catalogue so re-filtering the
  // sheet never touches what has been entered.
  const [qty, setQty] = useState<Record<string, number>>({});
  /** Per-line pay attribution from Scan (COD write-ins). Default vessel. */
  const [linePay, setLinePay] = useState<Record<string, { paid_by: 'vessel' | 'cod'; cod_name: string }>>({});
  /**
   * OFF-CATALOGUE LINES, RESOLVED FROM THE SCAN.
   *
   * A write-in for something Sinclair's stocks but never printed on the form
   * has no product row to hang a quantity on, so it cannot live in `qty`. It is
   * still an ordinary grocery line on the order and goes out on the same
   * submit — see the note by `product_id` in the payload below for why an empty
   * id is the right wire format rather than an invented one.
   */
  const [customLines, setCustomLines] = useState<CustomLine[]>([]);

  const [mode, setMode] = useState<Mode>('sheet');
  const [filter, setFilter] = useState('');
  const [step, setStep] = useState<'who' | 'what' | 'check'>('who');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [header, setHeader] = useState<HeaderState>({
    vessel_name: '', company_name: '', vessel_type: '',
    captain_name: '', captain_phone: '', vessel_email: '', billing_email: '',
    contact_name: '', phone: '',
    terminal_name: '', arrival_date: '', arrival_time: '',
    delivery_method: '',
    approach_side: '', vhf_channel: '', po_number: '', notes: '',
  });

  /* ── load ── */
  useEffect(() => {
    (async () => {
      const session = await fetchAdminSession();
      if (!session) { router.push('/admin'); return; }
      setStaffName(session.display_name || session.username || 'staff');

      const [sheetRes, defRes] = await Promise.all([
        adminFetch('/api/admin/catalog-sheet'),
        adminFetch('/api/admin/order-defaults'),
      ]);

      if (!sheetRes.ok) {
        setLoadError('Could not load the order form. Reload the page — nothing has been lost.');
      } else {
        const j = await sheetRes.json();
        setItems(j.items || []);
      }
      if (defRes.ok) {
        const j = await defRes.json();
        setVessels(j.vessels || []);
        setTerminals(j.terminals || []);
      }
      setReady(true);
    })();
  }, [router]);

  /* ── derived ── */

  const byUpc = useMemo(() => {
    const m = new Map<string, SheetItem>();
    for (const it of items) {
      const k = upcKey(it.upc);
      if (k && !m.has(k)) m.set(k, it);
    }
    return m;
  }, [items]);

  const chosen = useMemo(
    () => items.filter(i => (qty[i.id] || 0) > 0),
    [items, qty],
  );

  const total = useMemo(
    () => chosen.reduce((s, i) => s + i.price * (qty[i.id] || 0), 0)
        + customLines.reduce((s, c) => s + (c.price || 0) * c.qty, 0),
    [chosen, qty, customLines],
  );

  const visible = useMemo(() => {
    const q = norm(filter);
    if (!q) return items;
    const asDigits = digits(filter);
    return items.filter(i =>
      norm(i.description).includes(q) ||
      (!!asDigits && (i.upc || '').includes(asDigits)) ||
      norm(i.form_subsection || '').includes(q) ||
      norm(i.form_section || '').includes(q));
  }, [items, filter]);

  /**
   * Section/subsection headings, inserted into the flow rather than nesting the
   * rows inside containers. Flat rows are what makes Tab walk straight down the
   * form the way a finger does on paper; wrapping each group in its own
   * scrollable box would break that for no gain.
   */
  const rows = useMemo(() => {
    const out: Array<
      | { kind: 'section'; label: string }
      | { kind: 'sub'; label: string }
      | { kind: 'item'; item: SheetItem }
    > = [];
    let section: string | null = null;
    let sub: string | null = null;
    for (const it of visible) {
      const s = it.form_section || 'Other items';
      const b = it.form_subsection || '';
      if (s !== section) { out.push({ kind: 'section', label: s }); section = s; sub = null; }
      if (b && b !== sub) { out.push({ kind: 'sub', label: b }); sub = b; }
      out.push({ kind: 'item', item: it });
    }
    return out;
  }, [visible]);

  const sections = useMemo(() => {
    const seen: string[] = [];
    for (const it of items) {
      const s = it.form_section || 'Other items';
      if (!seen.includes(s)) seen.push(s);
    }
    return seen;
  }, [items]);

  /* ── mutations ── */

  const setLine = useCallback((id: string, n: number) => {
    setQty(prev => {
      const next = { ...prev };
      if (!n || n <= 0) delete next[id];
      else next[id] = Math.min(999, n);
      return next;
    });
    if (!n || n <= 0) {
      setLinePay(prev => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }, []);

  const applyLines = useCallback((lines: Array<{
    productId: string;
    qty: number;
    paid_by?: 'vessel' | 'cod';
    cod_name?: string;
  }>) => {
    setQty(prev => {
      const next = { ...prev };
      for (const l of lines) {
        if (!l.qty || l.qty <= 0) delete next[l.productId];
        else next[l.productId] = Math.min(999, l.qty);
      }
      return next;
    });
    setLinePay(prev => {
      const next = { ...prev };
      for (const l of lines) {
        if (!l.qty || l.qty <= 0) {
          delete next[l.productId];
          continue;
        }
        if (l.paid_by === 'cod') {
          next[l.productId] = {
            paid_by: 'cod',
            cod_name: (l.cod_name || '').trim() || 'COD (paper)',
          };
        } else if (l.productId in next) {
          // Keep prior COD mark unless this apply explicitly sets vessel.
          if (l.paid_by === 'vessel') delete next[l.productId];
        }
      }
      return next;
    });
  }, []);

  const bump = useCallback((id: string, by: number, step: number) => {
    setQty(prev => {
      const cur = prev[id] || 0;
      const n = Math.round((cur + by * step) * 100) / 100;
      const next = { ...prev };
      if (n <= 0) delete next[id];
      else next[id] = Math.min(999, n);
      return next;
    });
  }, []);

  function applyVessel(v: VesselHeader) {
    setHeader(h => ({
      ...h,
      vessel_name: v.vessel_name,
      company_name: v.company_name,
      vessel_type: v.vessel_type,
      captain_name: v.captain_name,
      captain_phone: v.captain_phone,
      vessel_email: v.vessel_email,
      billing_email: v.billing_email,
      contact_name: v.contact_name || v.captain_name,
      phone: v.phone || v.captain_phone,
      terminal_name: v.terminal_name,
      delivery_method: v.delivery_method,
      approach_side: v.approach_side,
      vhf_channel: v.vhf_channel,
      // PO is per-delivery, NOT per-boat. Carrying last month's number forward
      // would put it on an invoice Ingram's AP would then reject.
      po_number: '',
    }));
  }

  /* ── submit ── */

  async function submit() {
    setSubmitError('');

    if (!header.vessel_name.trim() || !header.company_name.trim()) {
      setSubmitError('The boat and the company are both needed before this can be placed.');
      setStep('who');
      return;
    }
    const contact = header.contact_name.trim() || header.captain_name.trim();
    const phone = header.phone.trim() || header.captain_phone.trim();
    if (!contact || !phone) {
      setSubmitError('A contact name and phone number are required — use the captain if that is who ordered.');
      setStep('who');
      return;
    }
    if (!header.vessel_email.trim() && !header.billing_email.trim()) {
      setSubmitError('An email address is needed so the boat gets its confirmation.');
      setStep('who');
      return;
    }
    if (!chosen.length && !customLines.length) {
      setSubmitError('Nothing has been added to this order yet.');
      setStep('what');
      return;
    }

    setSubmitting(true);
    try {
      // PROVENANCE, IN THE ONE FIELD EVERYONE ALREADY READS.
      //
      // `notes` is already shown in admin, on the pick sheet and in the emails,
      // so a line here is visible to every person who touches this order. That
      // beats a new database column nobody would have thought to look at when
      // wondering why an order has no matching customer account.
      const provenance = `Entered by ${staffName} from a paper order.`;
      const notes = header.notes.trim()
        ? `${provenance}\n${header.notes.trim()}`
        : provenance;

      const codNames = [...new Set(
        chosen
          .map(i => linePay[i.id])
          .filter((p): p is { paid_by: 'vessel' | 'cod'; cod_name: string } => !!p && p.paid_by === 'cod')
          .map(p => p.cod_name || 'COD (paper)'),
      )];
      const notesWithCod = codNames.length
        ? `${notes}\nCOD from paper (payment method defaulted to cash — confirm): ${codNames.join(', ')}`
        : notes;

      const payload = {
        vessel: {
          company_name: header.company_name.trim(),
          contact_name: contact,
          phone,
          email: header.billing_email.trim(),
          po_number: header.po_number.trim(),
          vessel_name: header.vessel_name.trim(),
          vessel_type: header.vessel_type.trim(),
          captain_name: header.captain_name.trim(),
          captain_phone: header.captain_phone.trim(),
          vessel_email: header.vessel_email.trim(),
          terminal_name: header.terminal_name.trim(),
          arrival_date: header.arrival_date,
          arrival_time: header.arrival_time,
          delivery_method: header.delivery_method,
          approach_side: header.approach_side,
          vhf_channel: header.vhf_channel.trim(),
          crew_change: 'no',
          notes: notesWithCod,
        },
        items: [...chosen.map(i => {
          const pay = linePay[i.id];
          return {
            product_id: i.id,
            description: i.description,
            category: i.category,
            pkg_size: i.pkg_size,
            uom: i.uom,
            price: i.price,
            quantity: qty[i.id],
            image_url: i.image_url,
            paid_by: (pay?.paid_by === 'cod' ? 'cod' : 'vessel') as 'vessel' | 'cod',
            cod_name: pay?.paid_by === 'cod' ? (pay.cod_name || '') : '',
          };
        }), ...customLines.map(c => ({
          // ⚠️ EMPTY product_id, DELIBERATELY.
          //
          // order_items.product_id is a uuid with a foreign key to products, so
          // there is no id we could invent for something that is not in the
          // catalogue — a made-up one fails the constraint and a real one would
          // bill the wrong item. The order route already stores null here for
          // its service lines; an empty string takes that same path and the
          // description, price and quantity below carry the line.
          product_id: '',
          description: c.description,
          category: 'Write-in',
          pkg_size: null,
          uom: null,
          price: c.price || 0,
          quantity: c.qty,
          image_url: null,
          paid_by: (c.paid_by === 'cod' ? 'cod' : 'vessel') as 'vessel' | 'cod',
          cod_name: c.paid_by === 'cod' ? (c.cod_name || '') : '',
        }))],
        // Paper forms rarely name Venmo/Cash App. Cash is the honest default
        // so attribution is not lost; staff can edit the order after place.
        cod_payments: (() => {
          const byName = new Map<string, { amount: number }>();
          for (const i of chosen) {
            const pay = linePay[i.id];
            if (pay?.paid_by !== 'cod') continue;
            const name = (pay.cod_name || 'COD (paper)').trim().slice(0, 80);
            const prev = byName.get(name) || { amount: 0 };
            prev.amount += (i.price || 0) * (qty[i.id] || 0);
            byName.set(name, prev);
          }
          return [...byName.entries()].map(([name, v]) => ({
            name,
            amount: Math.round(v.amount * 100) / 100,
            linked_items: 0,
            method: 'cash' as const,
            handle: '',
            phone: '',
            contact_time: '',
          }));
        })(),
      };

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        // Surface the server's own words. The order endpoint's messages are
        // written for a person ("COD items ride along with a regular
        // delivery…") and replacing them with "Something went wrong" would
        // throw away the only useful thing in the response.
        setSubmitError(
          j?.details?.[0]?.message || j?.error ||
          'The order could not be placed. Nothing has been saved — your lines are still here.',
        );
        return;
      }

      const j = await res.json();
      router.push(`/admin/orders?order=${j.order_id}`);
    } catch {
      setSubmitError('Could not reach the server. Your lines are still on screen — try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  }

  /* ───────────────────────── render ───────────────────────── */

  if (!ready) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-gray-400 text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading the order form…
      </div>
    );
  }

  return (
    <div className="pb-28">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-brand-navy">Build an order</h1>
          <p className="text-gray-400 text-sm">
            For a boat that phoned, faxed or sent a paper form
          </p>
        </div>
        <button onClick={() => router.push('/admin/orders')} className="btn-outline text-sm px-3 py-2">
          Cancel
        </button>
      </div>

      {loadError && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {loadError}
        </div>
      )}

      <StepTabs step={step} setStep={setStep} lines={chosen.length} />

      {step === 'who' && (
        <WhoStep
          header={header} setHeader={setHeader}
          vessels={vessels} terminals={terminals}
          applyVessel={applyVessel}
          onNext={() => setStep('what')}
        />
      )}

      {step === 'what' && (
        <>
          <ModeTabs mode={mode} setMode={setMode} />
          {mode === 'sheet' && (
            <SheetMode
              rows={rows} qty={qty} filter={filter} setFilter={setFilter}
              sections={sections} setLine={setLine} bump={bump}
              showing={visible.length} totalRows={items.length}
            />
          )}
          {mode === 'quick' && (
            <QuickAdd items={items} byUpc={byUpc} qty={qty} setLine={setLine} />
          )}
          {mode === 'paste' && (
            <PasteMode items={items} byUpc={byUpc} setLine={setLine} />
          )}
          {mode === 'scan' && (
            <PaperFormImport
              catalog={items}
              setLine={setLine}
              applyLines={applyLines}
              addCustomLines={(lines) => setCustomLines(prev => [...prev, ...lines])}
              appendNotes={(note) => setHeader(h => ({
                ...h,
                notes: h.notes.trim() ? `${h.notes.trim()}\n${note}` : note,
              }))}
            />
          )}
        </>
      )}

      {step === 'check' && (
        <ReviewStep
          customLines={customLines}
          removeCustomLine={(i) => setCustomLines(prev => prev.filter((_, k) => k !== i))}
          header={header} chosen={chosen} qty={qty}
          setLine={setLine} total={total}
          error={submitError} submitting={submitting}
          onSubmit={submit}
          onBack={() => setStep('what')}
        />
      )}

      <StickyBar
        lines={chosen.length} total={total} step={step}
        onReview={() => setStep('check')}
        onNext={() => setStep('what')}
      />
    </div>
  );
}

/* ───────────────────────── sub-components ───────────────────────── */

function StepTabs({ step, setStep, lines }: {
  step: 'who' | 'what' | 'check'; setStep: (s: 'who' | 'what' | 'check') => void; lines: number;
}) {
  const tabs: Array<{ id: 'who' | 'what' | 'check'; label: string; hint: string }> = [
    { id: 'who', label: 'Boat', hint: 'Who it is for' },
    { id: 'what', label: 'Items', hint: lines ? `${lines} line${lines === 1 ? '' : 's'}` : 'Nothing yet' },
    { id: 'check', label: 'Check', hint: 'Then place it' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 mb-5">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => setStep(t.id)}
          className={`rounded-xl border p-3 text-left transition-all ${
            step === t.id ? 'bg-brand-navy/5 border-brand-navy/30 shadow-sm' : 'bg-white border-gray-200 hover:border-gray-300'
          }`}>
          <div className="text-sm font-bold text-brand-navy">{t.label}</div>
          <div className="text-xs text-gray-500">{t.hint}</div>
        </button>
      ))}
    </div>
  );
}

function ModeTabs({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const tabs: Array<{ id: Mode; label: string; icon: typeof ListOrdered; hint: string }> = [
    { id: 'sheet', label: 'Order form', icon: ListOrdered, hint: 'Same order as the paper' },
    { id: 'scan', label: 'Scan form', icon: Camera, hint: 'PDF or photos of the marked form' },
    { id: 'quick', label: 'Quick add', icon: Keyboard, hint: 'Type a UPC or a name' },
    { id: 'paste', label: 'Paste a list', icon: ClipboardPaste, hint: 'From a text or email' },
  ];
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {tabs.map(t => {
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            onClick={() => setMode(t.id)}
            className={`rounded-lg border px-3 py-2 text-left text-sm flex items-center gap-2 ${
              mode === t.id ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
            }`}>
            <Icon className="w-4 h-4 shrink-0" />
            <span>
              <span className="font-semibold block leading-tight">{t.label}</span>
              <span className={`text-xs ${mode === t.id ? 'text-white/70' : 'text-gray-400'}`}>{t.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── who ── */

function WhoStep({ header, setHeader, vessels, terminals, applyVessel, onNext }: {
  header: HeaderState;
  setHeader: React.Dispatch<React.SetStateAction<HeaderState>>;
  vessels: VesselHeader[];
  terminals: string[];
  applyVessel: (v: VesselHeader) => void;
  onNext: () => void;
}) {
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    const n = norm(q);
    if (!n) return vessels.slice(0, 8);
    return vessels.filter(v =>
      norm(v.vessel_name).includes(n) || norm(v.company_name).includes(n)
    ).slice(0, 12);
  }, [q, vessels]);

  const set = (k: keyof HeaderState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setHeader(h => ({ ...h, [k]: e.target.value } as HeaderState));

  return (
    <div className="space-y-5">
      <section className="card-base p-4">
        <h2 className="font-bold text-brand-navy text-sm mb-1">Which boat?</h2>
        {/* The fastest possible path: this boat has ordered before, and its
            whole header is already sitting in that order. One tap fills
            everything below — captain, phone, vessel email, terminal, how it
            gets there — exactly as it was last time. */}
        <p className="text-xs text-gray-500 mb-3">
          Pick one and the rest of this page fills itself in from their last order.
        </p>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            id="vessel-search" className="input-base pl-9" placeholder="Boat or company name…"
            value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
        </div>
        {matches.length > 0 && (
          <div className="flex flex-col divide-y divide-gray-100 -mx-1">
            {matches.map(v => (
              <button
                key={`${v.vessel_name}|${v.company_name}`}
                onClick={() => { applyVessel(v); setQ(''); }}
                className="text-left px-1 py-2.5 hover:bg-gray-50 flex items-center gap-3">
                <Ship className="w-4 h-4 text-gray-300 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-brand-navy truncate">{v.vessel_name}</span>
                  <span className="block text-xs text-gray-500 truncate">
                    {v.company_name}{v.terminal_name ? ` · ${v.terminal_name}` : ''}
                  </span>
                </span>
                <span className="text-xs text-gray-400 shrink-0">
                  {v.order_count} order{v.order_count === 1 ? '' : 's'}
                </span>
              </button>
            ))}
          </div>
        )}
        {q && matches.length === 0 && (
          <p className="text-xs text-gray-500 py-2">
            No boat by that name has ordered before — fill the fields in below and it will be
            there next time.
          </p>
        )}
      </section>

      <section className="card-base p-4 grid gap-3 sm:grid-cols-2">
        <Field label="Boat name" required value={header.vessel_name} onChange={set('vessel_name')} />
        <Field label="Company / barge line" required value={header.company_name} onChange={set('company_name')} />
        <Field label="Captain" value={header.captain_name} onChange={set('captain_name')} />
        <Field label="Captain's phone" value={header.captain_phone} onChange={set('captain_phone')} />
        {/* Required by the order endpoint: the confirmation has to go
            somewhere, and on this side of the counter it is the boat's. */}
        <Field label="Vessel email" required value={header.vessel_email} onChange={set('vessel_email')}
               hint="Where the confirmation goes" />
        <Field label="Billing email" value={header.billing_email} onChange={set('billing_email')}
               hint="Optional — the office, if different" />
        <Field label="Ordered by" value={header.contact_name} onChange={set('contact_name')}
               hint="Leave blank to use the captain" />
        <Field label="Their phone" value={header.phone} onChange={set('phone')}
               hint="Leave blank to use the captain's" />
      </section>

      <section className="card-base p-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label-base" htmlFor="terminal">Terminal</label>
          <input id="terminal" className="input-base" list="terminal-list"
                 value={header.terminal_name} onChange={set('terminal_name')} />
          <datalist id="terminal-list">
            {terminals.map(t => <option key={t} value={t} />)}
          </datalist>
        </div>
        <Field label="Delivery date" type="date" value={header.arrival_date} onChange={set('arrival_date')} />
        <Field label="Delivery time" type="time" value={header.arrival_time} onChange={set('arrival_time')} />
        <div>
          <label className="label-base" htmlFor="method">By boat or van</label>
          <select id="method" className="input-base" value={header.delivery_method} onChange={set('delivery_method')}>
            <option value="">Not decided yet</option>
            <option value="boat">Boat</option>
            <option value="van">Van</option>
          </select>
        </div>
        <Field label="PO number" value={header.po_number} onChange={set('po_number')}
               hint="Ingram's AP asks for this" />
        <div className="sm:col-span-2">
          <label className="label-base" htmlFor="notes">Notes</label>
          <textarea id="notes" className="input-base min-h-[72px]" value={header.notes}
                    onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))}
                    placeholder="Anything written on the sheet that doesn't fit a field" />
        </div>
      </section>

      <button onClick={onNext} className="btn-primary w-full sm:w-auto px-5 py-2.5 flex items-center justify-center gap-1.5">
        Add the items <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function Field({ label, value, onChange, required, hint, type = 'text' }: {
  label: string; value: string; required?: boolean; hint?: string; type?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const id = `f-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <div>
      <label className="label-base" htmlFor={id}>
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      <input id={id} type={type} className="input-base" value={value} onChange={onChange} />
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

/* ── sheet ── */

function SheetMode({ rows, qty, filter, setFilter, sections, setLine, bump, showing, totalRows }: {
  rows: Array<{ kind: 'section'; label: string } | { kind: 'sub'; label: string } | { kind: 'item'; item: SheetItem }>;
  qty: Record<string, number>;
  filter: string; setFilter: (s: string) => void;
  sections: string[];
  setLine: (id: string, n: number) => void;
  bump: (id: string, by: number, step: number) => void;
  showing: number; totalRows: number;
}) {
  return (
    <div>
      <div className="sticky top-0 z-10 bg-gray-50 pt-1 pb-3 -mx-1 px-1">
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            id="sheet-filter" className="input-base pl-9"
            placeholder="Jump to an item, a UPC or a section…"
            value={filter} onChange={e => setFilter(e.target.value)} autoComplete="off" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {/* Section jumps do the job the paper form's page numbers do. */}
          <button onClick={() => setFilter('')}
                  className={`shrink-0 text-xs px-2.5 py-1 rounded-full border ${
                    filter ? 'bg-white border-gray-200 text-gray-600' : 'bg-brand-navy text-white border-brand-navy'}`}>
            Whole form
          </button>
          {sections.map(s => (
            <button key={s} onClick={() => setFilter(s)}
                    className="shrink-0 text-xs px-2.5 py-1 rounded-full border bg-white border-gray-200 text-gray-600 hover:border-gray-300">
              {s}
            </button>
          ))}
        </div>
        {filter && (
          <p className="text-xs text-gray-500 mt-1">
            {showing.toLocaleString()} of {totalRows.toLocaleString()} rows
          </p>
        )}
      </div>

      {/* content-visibility lets the browser skip layout for the thousand rows
          that are off-screen. The whole form stays in the DOM — which is what
          keeps Tab walking straight down it — without the scroll going gluey on
          a phone. */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {rows.length === 0 && (
          <p className="p-6 text-sm text-gray-500 text-center">
            Nothing on the form matches that.
          </p>
        )}
        {rows.map((r, idx) => {
          if (r.kind === 'section') {
            return (
              <div key={`s${idx}`} className="bg-brand-navy text-white px-3 py-2 font-display font-bold text-sm uppercase tracking-wide">
                {r.label}
              </div>
            );
          }
          if (r.kind === 'sub') {
            return (
              <div key={`b${idx}`} className="bg-gray-100 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-gray-600">
                {r.label}
              </div>
            );
          }
          const it = r.item;
          const n = qty[it.id] || 0;
          const stepBy = it.quantity_step && it.quantity_step > 0 ? it.quantity_step : 1;
          return (
            <div key={it.id}
                 style={{ contentVisibility: 'auto', containIntrinsicSize: '0 56px' }}
                 className={`flex items-center gap-2 px-3 py-2 border-t border-gray-100 ${n > 0 ? 'bg-green-50/70' : ''}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900 leading-tight truncate">{it.description}</p>
                <p className="text-xs text-gray-400 truncate">
                  {[it.pkg_size, it.uom, formatCurrency(it.price)].filter(Boolean).join(' · ')}
                  {it.upc ? ` · ${it.upc}` : ''}
                  {!it.is_available && ' · out of stock'}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" tabIndex={-1} aria-label={`Less ${it.description}`}
                        onClick={() => bump(it.id, -1, stepBy)}
                        className="w-7 h-7 rounded-md border border-gray-200 text-gray-500 flex items-center justify-center disabled:opacity-30"
                        disabled={n <= 0}>
                  <Minus className="w-3.5 h-3.5" />
                </button>
                {/* THE ONLY CONTROL THAT MATTERS. inputMode="decimal" puts a
                    number pad on a phone; the +/- buttons are tabIndex={-1} so
                    Tab goes from one quantity box straight to the next one
                    down the form instead of through three buttons per row. */}
                <input
                  id={`q-${it.id}`}
                  className="w-14 text-center input-base px-1 py-1 text-sm tabular-nums"
                  inputMode="decimal" autoComplete="off"
                  value={n ? String(n) : ''}
                  placeholder="—"
                  onFocus={e => e.currentTarget.select()}
                  onChange={e => {
                    const v = e.target.value.trim();
                    if (!v) { setLine(it.id, 0); return; }
                    const parsed = Number(v.replace(/[^\d.]/g, ''));
                    if (!Number.isNaN(parsed)) setLine(it.id, parsed);
                  }} />
                <button type="button" tabIndex={-1} aria-label={`More ${it.description}`}
                        onClick={() => bump(it.id, 1, stepBy)}
                        className="w-7 h-7 rounded-md border border-gray-200 text-gray-500 flex items-center justify-center">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── quick add ── */

function QuickAdd({ items, byUpc, qty, setLine }: {
  items: SheetItem[];
  byUpc: Map<string, SheetItem>;
  qty: Record<string, number>;
  setLine: (id: string, n: number) => void;
}) {
  const [term, setTerm] = useState('');
  const [amount, setAmount] = useState('1');
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);
  const termRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const raw = term.trim();
    if (raw.length < 2) return [];
    const d = digits(raw);
    // A UPC typed off the sheet should win outright — no list to pick from,
    // because there is nothing to choose between.
    if (d.length >= 6) {
      const hit = byUpc.get(upcKey(d));
      if (hit) return [hit];
    }
    const n = norm(raw);
    return items.filter(i => norm(i.description).includes(n)).slice(0, 8);
  }, [term, items, byUpc]);

  function add(it: SheetItem) {
    const n = Number(amount.replace(/[^\d.]/g, '')) || 1;
    setLine(it.id, (qty[it.id] || 0) + n);
    setFlash({ text: `${n} × ${it.description}`, ok: true });
    setTerm('');
    setAmount('1');
    termRef.current?.focus();
  }

  return (
    <div className="card-base p-4">
      <p className="text-xs text-gray-500 mb-3">
        Read the UPC off the sheet, type the quantity, press Enter. Names work too.
      </p>
      <form
        onSubmit={e => {
          e.preventDefault();
          if (results.length === 1) add(results[0]);
          else if (results.length === 0 && term.trim()) {
            setFlash({ text: `Nothing on the form matches “${term.trim()}”`, ok: false });
          }
        }}
        className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input ref={termRef} id="quick-term" className="input-base pl-9" autoFocus autoComplete="off"
                 placeholder="UPC or item name" value={term} onChange={e => setTerm(e.target.value)} />
        </div>
        <input id="quick-qty" className="input-base w-20 text-center tabular-nums" inputMode="decimal"
               value={amount} onChange={e => setAmount(e.target.value)}
               onFocus={e => e.currentTarget.select()} aria-label="Quantity" />
        <button className="btn-primary px-4" type="submit">Add</button>
      </form>

      {flash && (
        <p className={`text-sm mb-3 flex items-center gap-1.5 ${flash.ok ? 'text-green-700' : 'text-amber-700'}`}>
          {flash.ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {flash.text}
        </p>
      )}

      <div className="divide-y divide-gray-100">
        {results.map(it => (
          <button key={it.id} onClick={() => add(it)}
                  className="w-full text-left py-2.5 hover:bg-gray-50 flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-gray-900 truncate">{it.description}</span>
              <span className="block text-xs text-gray-400 truncate">
                {[it.pkg_size, formatCurrency(it.price), it.upc].filter(Boolean).join(' · ')}
              </span>
            </span>
            {(qty[it.id] || 0) > 0 && (
              <span className="text-xs font-bold text-green-700 shrink-0">on order: {qty[it.id]}</span>
            )}
            <Plus className="w-4 h-4 text-gray-300 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── paste ── */

/**
 * Paste a list, get an order.
 *
 * Accepts the shapes a real order actually arrives in — a text from a captain,
 * the body of an email, a column copied out of a spreadsheet:
 *
 *     3 hamburger patties
 *     hamburger patties x3
 *     7003836447 2
 *     2 x 7003836447
 *     chicken thighs          (no number → 1)
 *
 * NOTHING IS ADDED SILENTLY. Every line is shown with what it matched, and
 * anything ambiguous or unmatched is listed separately for a human. A paste
 * tool that quietly guesses wrong puts food a boat did not order onto an
 * invoice a barge line will dispute.
 */
function PasteMode({ items, byUpc, setLine }: {
  items: SheetItem[];
  byUpc: Map<string, SheetItem>;
  setLine: (id: string, n: number) => void;
}) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<{
    matched: Array<{ line: string; item: SheetItem; n: number }>;
    missed: string[];
  } | null>(null);

  function parse() {
    const matched: Array<{ line: string; item: SheetItem; n: number }> = [];
    const missed: string[] = [];

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;

      // Quantity: a leading number, or a trailing "x3" / "× 3" / "- 3".
      let n = 1;
      let rest = line;
      const lead = /^(\d+(?:\.\d+)?)\s*(?:x|×)?\s+(.*)$/i.exec(line);
      const trail = /^(.*?)\s*(?:x|×|-|,)\s*(\d+(?:\.\d+)?)$/i.exec(line);
      if (lead) { n = Number(lead[1]); rest = lead[2]; }
      else if (trail) { rest = trail[1]; n = Number(trail[2]); }

      const d = digits(rest);
      // A bare number on its own line is a UPC, not a quantity — reinstate it.
      const asUpc = d.length >= 6 ? byUpc.get(upcKey(d)) : undefined;
      const wholeIsUpc = digits(line).length >= 6 && norm(rest) === '' ? byUpc.get(upcKey(digits(line))) : undefined;
      const hit = asUpc || wholeIsUpc;

      if (hit) { matched.push({ line, item: hit, n }); continue; }

      const q = norm(rest);
      if (!q) { missed.push(line); continue; }
      const exact = items.filter(i => norm(i.description) === q);
      const partial = exact.length ? exact : items.filter(i => norm(i.description).includes(q));
      // One clear match only. Two candidates is a question for a person, not a
      // coin toss between a 3 lb and an 8 lb roast.
      if (partial.length === 1) matched.push({ line, item: partial[0], n });
      else missed.push(line);
    }
    setResult({ matched, missed });
  }

  function commit() {
    if (!result) return;
    for (const m of result.matched) setLine(m.item.id, m.n);
    setText('');
    setResult(null);
  }

  return (
    <div className="card-base p-4">
      <p className="text-xs text-gray-500 mb-3">
        One item per line. A number before or after the name sets the quantity; UPCs work too.
      </p>
      <textarea
        id="paste-box"
        className="input-base min-h-[160px] font-mono text-sm"
        placeholder={'3 hamburger patties\n7003836447 2\nchicken thighs x6'}
        value={text} onChange={e => { setText(e.target.value); setResult(null); }} />
      <div className="flex gap-2 mt-3">
        <button className="btn-outline px-4 py-2 text-sm" onClick={parse} disabled={!text.trim()}>
          Match these lines
        </button>
        {result && result.matched.length > 0 && (
          <button className="btn-primary px-4 py-2 text-sm" onClick={commit}>
            Add {result.matched.length} line{result.matched.length === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {result && (
        <div className="mt-4 space-y-4">
          {result.matched.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                Matched
              </h3>
              <div className="divide-y divide-gray-100">
                {result.matched.map((m, i) => (
                  <div key={i} className="py-2 flex items-center gap-3 text-sm">
                    <Check className="w-4 h-4 text-green-600 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-gray-900 truncate">{m.n} × {m.item.description}</span>
                      <span className="block text-xs text-gray-400 truncate">from “{m.line}”</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.missed.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-2">
                Needs a human ({result.missed.length})
              </h3>
              <p className="text-xs text-gray-500 mb-2">
                These matched nothing, or matched more than one thing. Add them from the order
                form or Quick add.
              </p>
              <ul className="text-sm text-gray-700 space-y-1">
                {result.missed.map((l, i) => (
                  <li key={i} className="flex gap-2">
                    <X className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <span className="font-mono text-xs break-all">{l}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── review ── */

function ReviewStep({ header, chosen, qty, setLine, total, error, submitting, onSubmit, onBack,
                     customLines, removeCustomLine }: {
  customLines: CustomLine[];
  removeCustomLine: (index: number) => void;
  header: HeaderState;
  chosen: SheetItem[];
  qty: Record<string, number>;
  setLine: (id: string, n: number) => void;
  total: number;
  error: string;
  submitting: boolean;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-5">
      <section className="card-base p-4">
        <h2 className="font-bold text-brand-navy text-sm mb-2">Going to</h2>
        <p className="text-sm text-gray-900">
          {header.vessel_name || <span className="text-red-600">No boat named</span>}
          {header.company_name ? ` · ${header.company_name}` : ''}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {[header.terminal_name, header.arrival_date, header.arrival_time,
            header.delivery_method === 'boat' ? 'by boat' : header.delivery_method === 'van' ? 'by van' : '']
            .filter(Boolean).join(' · ') || 'No delivery details yet'}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Confirmation to {header.vessel_email || header.billing_email || <span className="text-red-600">nobody — add an email</span>}
        </p>
      </section>

      <section className="card-base overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-brand-navy text-sm">
            {chosen.length + customLines.length} line{chosen.length + customLines.length === 1 ? '' : 's'}
          </h2>
          <span className="text-sm font-bold text-brand-navy tabular-nums">{formatCurrency(total)}</span>
        </div>
        {chosen.length === 0 && customLines.length === 0 && (
          <p className="p-6 text-sm text-gray-500 text-center">Nothing added yet.</p>
        )}
        {chosen.map(it => (
          <div key={it.id} className="px-4 py-2.5 border-b border-gray-50 flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-gray-900 truncate">{it.description}</span>
              <span className="block text-xs text-gray-400">
                {qty[it.id]} × {formatCurrency(it.price)}
              </span>
            </span>
            <span className="text-sm tabular-nums text-gray-700 shrink-0">
              {formatCurrency(it.price * qty[it.id])}
            </span>
            <button onClick={() => setLine(it.id, 0)} aria-label={`Remove ${it.description}`}
                    className="text-gray-300 hover:text-red-500 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        {/* Off-catalogue lines are labelled, not blended in: a shopper walking
            the aisles needs to know this one has no shelf tag to scan and no
            price until the till. */}
        {customLines.map((c, i) => (
          <div key={`c${i}`} className="px-4 py-2.5 border-b border-gray-50 flex items-center gap-3 bg-amber-50/50">
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-gray-900 truncate">
                {c.description}
                <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
                  Write-in
                </span>
              </span>
              <span className="block text-xs text-gray-400">
                {c.qty} × {c.price ? formatCurrency(c.price) : 'price at the register'}
              </span>
            </span>
            <span className="text-sm tabular-nums text-gray-700 shrink-0">
              {c.price ? formatCurrency(c.price * c.qty) : '—'}
            </span>
            <button onClick={() => removeCustomLine(i)} aria-label={`Remove ${c.description}`}
                    className="text-gray-300 hover:text-red-500 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </section>

      {/* The register is the authority on price, not this screen. Saying so
          here stops a $2 difference at the till reading as a broken system. */}
      <p className="text-xs text-gray-500">
        Prices are Sinclair's shelf prices as of now. The register total at pick-up is what
        actually gets billed.
      </p>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <button onClick={onBack} className="btn-outline px-5 py-2.5">Back to the items</button>
        <button onClick={onSubmit} disabled={submitting || (chosen.length === 0 && customLines.length === 0)}
                className="btn-primary px-5 py-2.5 flex items-center justify-center gap-2 disabled:opacity-50">
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Place this order
        </button>
      </div>
      <p className="text-xs text-gray-400">
        This goes through exactly like an order the boat placed itself — the same confirmation
        email to the vessel, the same alerts to GTS and Sinclair's.
      </p>
    </div>
  );
}

/* ── sticky bar ── */

function StickyBar({ lines, total, step, onReview, onNext }: {
  lines: number; total: number; step: 'who' | 'what' | 'check';
  onReview: () => void; onNext: () => void;
}) {
  if (step === 'check') return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-200 bg-white/95 backdrop-blur px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <span className="text-sm text-gray-600 tabular-nums">
          <b className="text-brand-navy">{lines}</b> line{lines === 1 ? '' : 's'}
          <span className="text-gray-300 mx-2">·</span>
          <b className="text-brand-navy">{formatCurrency(total)}</b>
        </span>
        <div className="ml-auto flex gap-2">
          {step === 'who' && (
            <button onClick={onNext} className="btn-outline px-4 py-2 text-sm">Items</button>
          )}
          <button onClick={onReview} disabled={lines === 0}
                  className="btn-primary px-4 py-2 text-sm disabled:opacity-40">
            Review
          </button>
        </div>
      </div>
    </div>
  );
}
