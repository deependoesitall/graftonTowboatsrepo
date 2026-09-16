'use client';
// src/components/order/ServiceFields.tsx
//
// THE ADDITIONAL-SERVICES FORM, ONCE.
//
// ⚠️ ONE DEFINITION, TWO KINDS OF CALLER.
//
// A captain fills this in on /catalog, where it autosaves to their cart in
// localStorage. A GTS or Sinclair's staffer fills the same thing in on the
// admin order builder, where there is no cart and the answers belong to the
// order being built for somebody else. Those are different storage stories
// wrapped around identical questions.
//
// Everything here is CONTROLLED — value in, onChange out, no storage of any
// kind. AdditionalServicesTab and OtherPickupCard are the thin localStorage
// wrappers for the customer side; the admin builder holds the same state in
// React and posts it. A field added here reaches both, which is the point: the
// staff builder shipped for months without a services section at all, so an
// order a customer could place was an order staff could not.

import { useState } from 'react';
import {
  Check, ChevronDown, Link2, Package, Plus, ShoppingBag, Trash2, Users, Wrench, X,
} from 'lucide-react';
import type { AdditionalServices, OtherPickupItem } from '@/types';

export const EMPTY_OTHER_ENTRY: OtherPickupItem = { url: '', notes: '' };

/** The crew-change answers. Held on the vessel/cart on the customer side and on
 *  the header on the admin side, so it travels as its own little record. */
export interface CrewChangeState {
  crew_change: 'yes' | 'no' | 'maybe';
  crew_arriving: string;
  crew_departing: string;
  crew_change_notes: string;
}

export const EMPTY_CREW: CrewChangeState = {
  crew_change: 'no', crew_arriving: '', crew_departing: '', crew_change_notes: '',
};

export function emptyServices(): AdditionalServices {
  return {
    parts_pickup: {
      enabled: false, pickup_location: '', order_number: '', contact_name: '', contact_phone: '',
    },
    package_delivery: {
      enabled: false, description: '', origin: '', contact_name: '', contact_phone: '',
    },
    other_pickup: { enabled: false, items: [{ ...EMPTY_OTHER_ENTRY }] },
  };
}

/** True when anything at all has been added — used to badge a collapsed section. */
export function countActiveServices(s: AdditionalServices | null | undefined): number {
  if (!s) return 0;
  let n = 0;
  if (s.parts_pickup?.enabled) n++;
  if (s.package_delivery?.enabled) n++;
  if (s.other_pickup?.enabled) n++;
  return n;
}

export function Field({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label-base text-xs">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

export function AccordionCard({
  icon, title, subtitle, added, addedLabel = 'Added', addedTone = 'green',
  open, onToggle, onRemove, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  added: boolean;
  addedLabel?: string;
  addedTone?: 'green' | 'amber';
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const tone = addedTone === 'amber'
    ? { ring: 'ring-amber-400/50', chip: 'bg-amber-100 text-amber-700 border-amber-300', iconBg: 'bg-amber-500 text-white', title: 'text-amber-700' }
    : { ring: 'ring-brand-green/40', chip: 'bg-green-100 text-green-700 border-green-300', iconBg: 'bg-brand-green text-white', title: 'text-brand-green' };

  return (
    <div className={`card-base overflow-hidden transition-all ${added ? `ring-2 ${tone.ring}` : ''}`}>
      <button type="button" onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-gray-50/60 transition-colors">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
          added ? tone.iconBg : 'bg-gray-100 text-gray-400'
        }`}>
          {added ? <Check className="w-5 h-5" /> : icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`font-display font-bold text-sm ${added ? tone.title : 'text-brand-navy'}`}>{title}</p>
            {added && (
              <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${tone.chip}`}>
                {addedLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
        <ChevronDown className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {added && !open && (
        <div className="px-4 pb-3 -mt-1">
          <button type="button" onClick={onRemove}
            className="flex items-center gap-1 text-xs font-bold text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
            <X className="w-3.5 h-3.5" /> Remove
          </button>
        </div>
      )}

      {open && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3 bg-gray-50/50">
          {children}
          {added && (
            <button type="button" onClick={onRemove}
              className="flex items-center gap-1 text-xs font-bold text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
              <X className="w-3.5 h-3.5" /> Remove from order
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── The "other store" request list ───────────────────────────────────────── */

export function OtherPickupFields({ value, onChange }: {
  value: AdditionalServices['other_pickup'] | undefined;
  onChange: (next: AdditionalServices['other_pickup']) => void;
}) {
  const other = value ?? { enabled: false, items: [{ ...EMPTY_OTHER_ENTRY }] };
  const entries = other.items?.length ? other.items : [{ ...EMPTY_OTHER_ENTRY }];

  const patch = (p: Partial<AdditionalServices['other_pickup']>) =>
    onChange({ enabled: false, items: [{ ...EMPTY_OTHER_ENTRY }], ...other, ...p });
  const patchEntry = (idx: number, p: Partial<OtherPickupItem>) =>
    patch({ items: entries.map((e, i) => (i === idx ? { ...e, ...p } : e)) });
  const removeEntry = (idx: number) => {
    const next = entries.filter((_, i) => i !== idx);
    patch({ items: next.length ? next : [{ ...EMPTY_OTHER_ENTRY }] });
  };

  const filled = entries.filter(e => e.url.trim() || e.notes.trim());

  return (
    <>
      {entries.map((entry, idx) => (
        <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Item {idx + 1}</p>
            {entries.length > 1 && (
              <button type="button" onClick={() => removeEntry(idx)}
                className="flex items-center gap-1 text-[11px] font-bold text-red-400 hover:text-red-600"
                aria-label={`Remove item ${idx + 1}`}>
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            )}
          </div>
          <div>
            <label className="label-base text-xs">Link to Item</label>
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="url" className="input-base text-sm pl-9 w-full"
                placeholder="https://www.walmart.com/…"
                value={entry.url}
                onChange={e => patchEntry(idx, { url: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label-base text-xs">Details — size, color, quantity</label>
            <textarea className="input-base text-sm resize-none w-full" rows={2}
              placeholder="e.g. Men's XL, blue, qty 2"
              value={entry.notes}
              onChange={e => patchEntry(idx, { notes: e.target.value })} />
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Who pays</span>
            {/* These are ALWAYS COD — bought elsewhere and settled at delivery,
                never on the monthly invoice. The only question is whether the
                boat covers it or one crew member does. Stored values stay
                'grocery'/'cod' so existing orders keep working. */}
            {([['grocery', 'The boat'], ['cod', 'A crew member']] as const).map(([val, lbl]) => {
              const on = (entry.paid_by ?? 'grocery') === val;
              return (
                <button key={val} type="button"
                  onClick={() => patchEntry(idx, { paid_by: val, ...(val === 'grocery' ? { cod_name: '' } : {}) })}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold border transition-colors ${
                    on
                      ? (val === 'cod'
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-brand-navy text-white border-brand-navy')
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}>
                  {lbl}
                </button>
              );
            })}
            {entry.paid_by === 'cod' && (
              <input type="text"
                className="input-base text-sm py-1 flex-1 min-w-[140px]"
                placeholder="Which crew member? e.g. Andy"
                value={entry.cod_name ?? ''}
                onChange={e => patchEntry(idx, { cod_name: e.target.value })} />
            )}
          </div>
          {entry.paid_by === 'cod' && !((entry.cod_name ?? '').trim()) && (
            <p className="text-[11px] text-amber-600 font-semibold">
              Add a name so we know who to collect from.
            </p>
          )}
        </div>
      ))}

      <button type="button" onClick={() => patch({ items: [...entries, { ...EMPTY_OTHER_ENTRY }] })}
        className="flex items-center gap-1.5 text-xs font-bold text-brand-river hover:text-brand-navy transition-colors">
        <Plus className="w-3.5 h-3.5" /> Add another item
      </button>

      {!other.enabled && (
        filled.length > 0
          ? <button type="button" onClick={() => patch({ enabled: true })}
              className="w-full btn-gold py-2.5 flex items-center justify-center gap-2 rounded-lg text-sm font-bold">
              <Check className="w-4 h-4" /> Add {filled.length > 1 ? `${filled.length} Items` : ''} to Order
            </button>
          : <p className="text-xs text-gray-400 text-center pt-1">Add a link or details above to include this with your order.</p>
      )}
    </>
  );
}

/* ── The whole set ────────────────────────────────────────────────────────── */

export function AdditionalServicesFields({
  services, onServicesChange, crew, onCrewChange, includeOther = true,
}: {
  services: AdditionalServices;
  onServicesChange: (next: AdditionalServices) => void;
  /** Omit to hide the crew-change card (the customer's catalog tab owns its own). */
  crew?: CrewChangeState;
  onCrewChange?: (patch: Partial<CrewChangeState>) => void;
  includeOther?: boolean;
}) {
  const [openCard, setOpenCard] = useState<string | null>(null);
  const toggle = (id: string) => setOpenCard(o => (o === id ? null : id));

  const patchParts = (p: Partial<AdditionalServices['parts_pickup']>) =>
    onServicesChange({ ...services, parts_pickup: { ...services.parts_pickup, ...p } });
  const patchPkg = (p: Partial<AdditionalServices['package_delivery']>) =>
    onServicesChange({ ...services, package_delivery: { ...services.package_delivery, ...p } });

  const partsReady = !!(
    services.parts_pickup.pickup_location.trim() &&
    services.parts_pickup.contact_name.trim() &&
    services.parts_pickup.contact_phone.trim()
  );
  const pkgReady = !!(
    services.package_delivery.description.trim() &&
    services.package_delivery.origin.trim() &&
    services.package_delivery.contact_name.trim() &&
    services.package_delivery.contact_phone.trim()
  );

  return (
    <div className="space-y-4">
      <AccordionCard
        icon={<Wrench className="w-5 h-5" />}
        title="Parts Pickup"
        subtitle="We'll pick up parts or supplies from a local supplier on our way to your vessel."
        added={services.parts_pickup.enabled}
        open={openCard === 'parts_pickup'}
        onToggle={() => toggle('parts_pickup')}
        onRemove={() => patchParts({ enabled: false })}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Pickup Location" required>
            <input type="text" className="input-base text-sm" placeholder="e.g. NAPA Auto Parts"
              value={services.parts_pickup.pickup_location}
              onChange={e => patchParts({ pickup_location: e.target.value })} />
          </Field>
          <Field label="Order # or Receipt #">
            <input type="text" className="input-base text-sm" placeholder="e.g. INV-12345"
              value={services.parts_pickup.order_number}
              onChange={e => patchParts({ order_number: e.target.value })} />
          </Field>
          <Field label="Contact Name" required>
            <input type="text" className="input-base text-sm" placeholder="Name at pickup location"
              value={services.parts_pickup.contact_name}
              onChange={e => patchParts({ contact_name: e.target.value })} />
          </Field>
          <Field label="Contact Phone" required>
            <input type="tel" className="input-base text-sm" placeholder="(555) 123-4567"
              value={services.parts_pickup.contact_phone}
              onChange={e => patchParts({ contact_phone: e.target.value })} />
          </Field>
        </div>
        {!services.parts_pickup.enabled && (
          partsReady
            ? <button type="button" onClick={() => patchParts({ enabled: true })}
                className="w-full btn-gold py-2.5 flex items-center justify-center gap-2 rounded-lg text-sm font-bold">
                <Check className="w-4 h-4" /> Add Parts Pickup to Order
              </button>
            : <p className="text-xs text-gray-400 text-center pt-1">Fill in required fields above to add this service.</p>
        )}
      </AccordionCard>

      <AccordionCard
        icon={<Package className="w-5 h-5" />}
        title="Package / Other Delivery"
        subtitle="We'll pick up a package from a store or supplier and deliver it with your order."
        added={services.package_delivery.enabled}
        open={openCard === 'package_delivery'}
        onToggle={() => toggle('package_delivery')}
        onRemove={() => patchPkg({ enabled: false })}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Description of Package / Items" required>
            <input type="text" className="input-base text-sm" placeholder="e.g. Walmart grocery order"
              value={services.package_delivery.description}
              onChange={e => patchPkg({ description: e.target.value })} />
          </Field>
          <Field label="Pickup Location / Store" required>
            <input type="text" className="input-base text-sm" placeholder="e.g. Walmart"
              value={services.package_delivery.origin}
              onChange={e => patchPkg({ origin: e.target.value })} />
          </Field>
          <Field label="Contact Name" required>
            <input type="text" className="input-base text-sm" placeholder="Name to ask for"
              value={services.package_delivery.contact_name}
              onChange={e => patchPkg({ contact_name: e.target.value })} />
          </Field>
          <Field label="Contact Phone" required>
            <input type="tel" className="input-base text-sm" placeholder="(555) 123-4567"
              value={services.package_delivery.contact_phone}
              onChange={e => patchPkg({ contact_phone: e.target.value })} />
          </Field>
        </div>
        {!services.package_delivery.enabled && (
          pkgReady
            ? <button type="button" onClick={() => patchPkg({ enabled: true })}
                className="w-full btn-gold py-2.5 flex items-center justify-center gap-2 rounded-lg text-sm font-bold">
                <Check className="w-4 h-4" /> Add Package Delivery to Order
              </button>
            : <p className="text-xs text-gray-400 text-center pt-1">Fill in required fields above to add this service.</p>
        )}
      </AccordionCard>

      {includeOther && (
        <AccordionCard
          icon={<ShoppingBag className="w-5 h-5" />}
          title="Item From Another Store"
          subtitle="Anything Sinclair's doesn't carry — paste a link and it rides along. Always COD."
          added={!!services.other_pickup?.enabled}
          open={openCard === 'other_pickup'}
          onToggle={() => toggle('other_pickup')}
          onRemove={() => onServicesChange({
            ...services,
            other_pickup: { enabled: false, items: services.other_pickup?.items ?? [{ ...EMPTY_OTHER_ENTRY }] },
          })}
        >
          <OtherPickupFields
            value={services.other_pickup}
            onChange={next => onServicesChange({ ...services, other_pickup: next })}
          />
        </AccordionCard>
      )}

      {crew && onCrewChange && (
        <AccordionCard
          icon={<Users className="w-5 h-5" />}
          title="Crew Change"
          subtitle="Swapping crew members when the vessel arrives? Even a Maybe helps us plan."
          added={crew.crew_change !== 'no'}
          addedLabel={crew.crew_change === 'maybe' ? 'Maybe' : 'Yes'}
          addedTone={crew.crew_change === 'maybe' ? 'amber' : 'green'}
          open={openCard === 'crew_change'}
          onToggle={() => toggle('crew_change')}
          onRemove={() => onCrewChange({
            crew_change: 'no', crew_change_notes: '', crew_arriving: '', crew_departing: '',
          })}
        >
          <div className="flex gap-3">
            {([['no', 'No'], ['maybe', 'Maybe'], ['yes', 'Yes']] as const).map(([val, lbl]) => (
              <button key={val} type="button" onClick={() => onCrewChange({ crew_change: val })}
                className={`flex-1 py-2 rounded-xl border-2 text-sm font-bold transition-all ${
                  crew.crew_change === val
                    ? val === 'maybe'
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-brand-navy bg-brand-navy text-white'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}>{lbl}</button>
            ))}
          </div>
          {crew.crew_change === 'yes' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="# Crew Arriving">
                  <input type="number" min="0" className="input-base text-sm" placeholder="0"
                    value={crew.crew_arriving}
                    onChange={e => onCrewChange({ crew_arriving: e.target.value })} />
                </Field>
                <Field label="# Crew Departing">
                  <input type="number" min="0" className="input-base text-sm" placeholder="0"
                    value={crew.crew_departing}
                    onChange={e => onCrewChange({ crew_departing: e.target.value })} />
                </Field>
              </div>
              <Field label="Notes (optional)">
                <textarea className="input-base text-sm resize-none w-full" rows={2}
                  placeholder="e.g. New deckhand lands at 11:40 AM — may run late…"
                  value={crew.crew_change_notes}
                  onChange={e => onCrewChange({ crew_change_notes: e.target.value })} />
              </Field>
            </div>
          )}
          {crew.crew_change === 'maybe' && (
            <Field label="Notes (optional)">
              <textarea className="input-base text-sm resize-none w-full" rows={2}
                placeholder="e.g. Might swap 2 crew depending on schedule…"
                value={crew.crew_change_notes}
                onChange={e => onCrewChange({ crew_change_notes: e.target.value })} />
            </Field>
          )}
        </AccordionCard>
      )}
    </div>
  );
}
