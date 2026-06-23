'use client';
// src/components/catalog/AdditionalServicesTab.tsx

import { useState, useEffect } from 'react';
import { Package, Wrench, Check, Plus, X } from 'lucide-react';
import { AdditionalServices } from '@/types';
import { getAdditionalServices, saveAdditionalServices } from '@/lib/cart';

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
  const [partsOpen, setPartsOpen]     = useState(services.parts_pickup.enabled);
  const [packageOpen, setPackageOpen] = useState(services.package_delivery.enabled);

  useEffect(() => {
    saveAdditionalServices(services);
    window.dispatchEvent(new Event('cart-updated'));
  }, [services]);

  function patchParts(patch: Partial<AdditionalServices['parts_pickup']>) {
    setServices(prev => ({ ...prev, parts_pickup: { ...prev.parts_pickup, ...patch } }));
  }
  function patchPkg(patch: Partial<AdditionalServices['package_delivery']>) {
    setServices(prev => ({ ...prev, package_delivery: { ...prev.package_delivery, ...patch } }));
  }
  function removeService(key: 'parts_pickup' | 'package_delivery') {
    setServices(prev => ({ ...prev, [key]: { ...prev[key], enabled: false } }));
    if (key === 'parts_pickup')     setPartsOpen(false);
    if (key === 'package_delivery') setPackageOpen(false);
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

      {/* Parts Pickup */}
      <ServiceCard
        icon={<Wrench className="w-5 h-5" />}
        title="Parts Pickup"
        subtitle="We'll pick up parts or supplies from a local supplier on our way to your vessel."
        added={services.parts_pickup.enabled}
        open={partsOpen}
        onAdd={() => setPartsOpen(true)}
        onCancel={() => setPartsOpen(false)}
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
      </ServiceCard>

      {/* Package / Other Delivery */}
      <ServiceCard
        icon={<Package className="w-5 h-5" />}
        title="Package / Other Delivery"
        subtitle="We'll pick up a package from a store or supplier and deliver it with your order."
        added={services.package_delivery.enabled}
        open={packageOpen}
        onAdd={() => setPackageOpen(true)}
        onCancel={() => setPackageOpen(false)}
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
      </ServiceCard>

      {!services.parts_pickup.enabled && !services.package_delivery.enabled && !partsOpen && !packageOpen && (
        <p className="text-center text-sm text-gray-400 py-6">
          No additional services added. Use the buttons above if you need anything picked up.
        </p>
      )}
    </div>
  );
}

function ServiceCard({
  icon, title, subtitle, added, open, onAdd, onCancel, onRemove, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  added: boolean;
  open: boolean;
  onAdd: () => void;
  onCancel: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`card-base overflow-hidden transition-all ${added ? 'ring-2 ring-brand-green/40' : ''}`}>
      <div className="flex items-center gap-4 p-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
          added ? 'bg-brand-green text-white' : 'bg-gray-100 text-gray-400'
        }`}>
          {added ? <Check className="w-5 h-5" /> : icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-display font-bold text-sm ${added ? 'text-brand-green' : 'text-brand-navy'}`}>{title}</p>
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
        {added ? (
          <button type="button" onClick={onRemove}
            className="flex items-center gap-1 text-xs font-bold text-red-400 hover:text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0">
            <X className="w-3.5 h-3.5" /> Remove
          </button>
        ) : open ? (
          <button type="button" onClick={onCancel}
            className="text-xs font-bold bg-gray-100 text-gray-500 px-2.5 py-1.5 rounded-full transition-colors shrink-0">
            Cancel
          </button>
        ) : (
          <button type="button" onClick={onAdd}
            className="flex items-center gap-1 text-xs font-bold bg-brand-navy text-white hover:bg-brand-steel px-3 py-1.5 rounded-full transition-colors shrink-0">
            <Plus className="w-3 h-3" /> Add
          </button>
        )}
      </div>
      {(open || added) && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3 bg-gray-50/50">
          {children}
        </div>
      )}
    </div>
  );
}
