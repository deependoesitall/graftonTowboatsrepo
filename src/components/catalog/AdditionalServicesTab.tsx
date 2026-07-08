'use client';
// src/components/catalog/AdditionalServicesTab.tsx
// Accordion-style additional services with pricing disclaimer and the
// crew change (tri-state) card. The boat/land delivery info blocks moved
// to a banner on the catalog page (Demo 2 feedback).

import { useState, useEffect } from 'react';
import { Package, Wrench, Check, X, ChevronDown, Users, Info } from 'lucide-react';
import { AdditionalServices, VesselInfo } from '@/types';
import {
  getAdditionalServices, saveAdditionalServices,
  getVesselInfo, saveVesselInfo,
} from '@/lib/cart';

const DISCLAIMER =
  'Additional services shown below have no fixed price at checkout. Final charges — including any delivery or pickup fees — are confirmed after fulfillment and billed on your regular monthly invoice. Questions? Call Grafton Towboat Services at (618) 556-0290.';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="label-base text-xs">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

export function AdditionalServicesTab() {
  const [services, setServices] = useState<AdditionalServices>(getAdditionalServices());
  const [vessel, setVessel] = useState<VesselInfo>(getVesselInfo());
  const [openCard, setOpenCard] = useState<string | null>(null);

  useEffect(() => {
    saveAdditionalServices(services);
    window.dispatchEvent(new Event('cart-updated'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services]);

  function patchParts(patch: Partial<AdditionalServices['parts_pickup']>) {
    setServices(prev => ({ ...prev, parts_pickup: { ...prev.parts_pickup, ...patch } }));
  }
  function patchPkg(patch: Partial<AdditionalServices['package_delivery']>) {
    setServices(prev => ({ ...prev, package_delivery: { ...prev.package_delivery, ...patch } }));
  }
  function removeService(key: 'parts_pickup' | 'package_delivery') {
    setServices(prev => ({ ...prev, [key]: { ...prev[key], enabled: false } }));
  }
  function patchVessel(patch: Partial<VesselInfo>) {
    setVessel(prev => {
      const next = { ...prev, ...patch };
      saveVesselInfo(next);
      return next;
    });
  }

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
      <h2 className="font-display text-lg font-bold text-brand-navy mb-2">Additional Services</h2>

      {/* Pricing disclaimer */}
      <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-900 leading-relaxed">
          {DISCLAIMER.split('(618) 556-0290')[0]}
          <a href="tel:6185560290" className="font-bold underline">(618) 556-0290</a>.
        </p>
      </div>

      {/* Parts Pickup */}
      <AccordionCard
        id="parts_pickup"
        icon={<Wrench className="w-5 h-5" />}
        title="Parts Pickup"
        subtitle="We'll pick up parts or supplies from a local supplier on our way to your vessel."
        added={services.parts_pickup.enabled}
        open={openCard === 'parts_pickup'}
        onToggle={() => setOpenCard(o => o === 'parts_pickup' ? null : 'parts_pickup')}
        onRemove={() => removeService('parts_pickup')}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Pickup Location" required>
            <input type="text" className="input-base text-sm"
              placeholder="e.g. NAPA Auto Parts"
              value={services.parts_pickup.pickup_location}
              onChange={e => patchParts({ pickup_location: e.target.value })} />
          </Field>
          <Field label="Order # or Receipt #">
            <input type="text" className="input-base text-sm"
              placeholder="e.g. INV-12345"
              value={services.parts_pickup.order_number}
              onChange={e => patchParts({ order_number: e.target.value })} />
          </Field>
          <Field label="Contact Name" required>
            <input type="text" className="input-base text-sm"
              placeholder="Name at pickup location"
              value={services.parts_pickup.contact_name}
              onChange={e => patchParts({ contact_name: e.target.value })} />
          </Field>
          <Field label="Contact Phone" required>
            <input type="tel" className="input-base text-sm"
              placeholder="(555) 123-4567"
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

      {/* Package / Other Delivery */}
      <AccordionCard
        id="package_delivery"
        icon={<Package className="w-5 h-5" />}
        title="Package / Other Delivery"
        subtitle="We'll pick up a package from a store or supplier and deliver it with your order."
        added={services.package_delivery.enabled}
        open={openCard === 'package_delivery'}
        onToggle={() => setOpenCard(o => o === 'package_delivery' ? null : 'package_delivery')}
        onRemove={() => removeService('package_delivery')}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Description of Package / Items" required>
            <input type="text" className="input-base text-sm"
              placeholder="e.g. Walmart grocery order"
              value={services.package_delivery.description}
              onChange={e => patchPkg({ description: e.target.value })} />
          </Field>
          <Field label="Pickup Location / Store" required>
            <input type="text" className="input-base text-sm"
              placeholder="e.g. Walmart"
              value={services.package_delivery.origin}
              onChange={e => patchPkg({ origin: e.target.value })} />
          </Field>
          <Field label="Contact Name" required>
            <input type="text" className="input-base text-sm"
              placeholder="Name to ask for"
              value={services.package_delivery.contact_name}
              onChange={e => patchPkg({ contact_name: e.target.value })} />
          </Field>
          <Field label="Contact Phone" required>
            <input type="tel" className="input-base text-sm"
              placeholder="(555) 123-4567"
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

      {/* Crew Change (tri-state — also asked at checkout) */}
      <AccordionCard
        id="crew_change"
        icon={<Users className="w-5 h-5" />}
        title="Crew Change"
        subtitle="Swapping crew members when the vessel arrives? Let us know — even a Maybe helps us plan."
        added={vessel.crew_change !== 'no'}
        addedLabel={vessel.crew_change === 'maybe' ? 'Maybe' : 'Yes'}
        addedTone={vessel.crew_change === 'maybe' ? 'amber' : 'green'}
        open={openCard === 'crew_change'}
        onToggle={() => setOpenCard(o => o === 'crew_change' ? null : 'crew_change')}
        onRemove={() => patchVessel({ crew_change: 'no', crew_change_notes: '', crew_arriving: '', crew_departing: '' })}
      >
        <div className="flex gap-3">
          {([['no', 'No'], ['maybe', 'Maybe'], ['yes', 'Yes']] as const).map(([val, lbl]) => (
            <button key={val} type="button" onClick={() => patchVessel({ crew_change: val })}
              className={`flex-1 py-2 rounded-xl border-2 text-sm font-bold transition-all ${
                vessel.crew_change === val
                  ? val === 'maybe'
                    ? 'border-amber-500 bg-amber-500 text-white'
                    : 'border-brand-navy bg-brand-navy text-white'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>{lbl}</button>
          ))}
        </div>
        {vessel.crew_change === 'yes' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="# Crew Arriving">
                <input type="number" min="0" className="input-base text-sm" placeholder="0"
                  value={vessel.crew_arriving}
                  onChange={e => patchVessel({ crew_arriving: e.target.value })} />
              </Field>
              <Field label="# Crew Departing">
                <input type="number" min="0" className="input-base text-sm" placeholder="0"
                  value={vessel.crew_departing}
                  onChange={e => patchVessel({ crew_departing: e.target.value })} />
              </Field>
            </div>
            <Field label="Notes (optional)">
              <textarea className="input-base text-sm resize-none w-full" rows={2}
                placeholder="e.g. New deckhand lands at 11:40 AM — may run late…"
                value={vessel.crew_change_notes}
                onChange={e => patchVessel({ crew_change_notes: e.target.value })} />
            </Field>
          </div>
        )}
        {vessel.crew_change === 'maybe' && (
          <Field label="Notes (optional)">
            <textarea className="input-base text-sm resize-none w-full" rows={2}
              placeholder="e.g. Might swap 2 crew depending on schedule…"
              value={vessel.crew_change_notes}
              onChange={e => patchVessel({ crew_change_notes: e.target.value })} />
          </Field>
        )}
        <p className="text-xs text-gray-400">
          You&apos;ll see this again at checkout — details entered here carry over.
        </p>
      </AccordionCard>

    </div>
  );
}

function AccordionCard({
  icon, title, subtitle, added, addedLabel = 'Added', addedTone = 'green',
  open, onToggle, onRemove, children,
}: {
  id: string;
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
  const toneClasses = addedTone === 'amber'
    ? { ring: 'ring-amber-400/50', chip: 'bg-amber-100 text-amber-700 border-amber-300', iconBg: 'bg-amber-500 text-white', title: 'text-amber-700' }
    : { ring: 'ring-brand-green/40', chip: 'bg-green-100 text-green-700 border-green-300', iconBg: 'bg-brand-green text-white', title: 'text-brand-green' };

  return (
    <div className={`card-base overflow-hidden transition-all ${added ? `ring-2 ${toneClasses.ring}` : ''}`}>
      {/* Collapsed header — click to expand */}
      <button type="button" onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-gray-50/60 transition-colors">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
          added ? toneClasses.iconBg : 'bg-gray-100 text-gray-400'
        }`}>
          {added ? <Check className="w-5 h-5" /> : icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`font-display font-bold text-sm ${added ? toneClasses.title : 'text-brand-navy'}`}>{title}</p>
            {added && (
              <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${toneClasses.chip}`}>
                {addedLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
        <ChevronDown className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Remove action (visible when added, even collapsed) */}
      {added && !open && (
        <div className="px-4 pb-3 -mt-1">
          <button type="button" onClick={onRemove}
            className="flex items-center gap-1 text-xs font-bold text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
            <X className="w-3.5 h-3.5" /> Remove
          </button>
        </div>
      )}

      {/* Expanded body */}
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
