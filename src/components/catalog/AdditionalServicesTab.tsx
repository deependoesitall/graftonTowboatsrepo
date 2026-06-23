'use client';
// src/components/catalog/AdditionalServicesTab.tsx
// Tab for requesting parts pickup and package delivery alongside grocery orders.

import { useState, useEffect } from 'react';
import { Package, Wrench, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { AdditionalServices } from '@/types';
import { getAdditionalServices, saveAdditionalServices } from '@/lib/cart';

function SectionCard({
  icon,
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`card-base overflow-hidden transition-all ${enabled ? 'ring-2 ring-brand-green/40' : ''}`}>
      <button
        type="button"
        onClick={() => onToggle(!enabled)}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
          enabled ? 'bg-brand-green text-white' : 'bg-gray-100 text-gray-400'
        }`}>
          {enabled ? <Check className="w-5 h-5" /> : icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-display font-bold text-sm ${enabled ? 'text-brand-green' : 'text-brand-navy'}`}>
            {title}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        </div>
        <div className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
          enabled
            ? 'bg-brand-green/10 text-brand-green'
            : 'bg-gray-100 text-gray-400'
        }`}>
          {enabled ? 'Added' : 'Add'}
        </div>
      </button>

      {enabled && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3 bg-gray-50/50">
          {children}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
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

export function AdditionalServicesTab() {
  const [services, setServices] = useState<AdditionalServices>(getAdditionalServices());

  // Persist on every change
  useEffect(() => {
    saveAdditionalServices(services);
  }, [services]);

  function patch<K extends keyof AdditionalServices>(
    section: K,
    patch: Partial<AdditionalServices[K]>
  ) {
    setServices(prev => ({
      ...prev,
      [section]: { ...prev[section], ...patch },
    }));
  }

  return (
    <div className="space-y-4">
      <div className="mb-2">
        <h2 className="font-display text-lg font-bold text-brand-navy">Additional Services</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          These services are included with your delivery. Toggle on anything you need and fill in the details.
        </p>
      </div>

      {/* ── PARTS PICKUP ── */}
      <SectionCard
        icon={<Wrench className="w-5 h-5" />}
        title="Parts Pickup"
        description="We'll pick up parts or supplies from a local supplier on our way to your vessel."
        enabled={services.parts_pickup.enabled}
        onToggle={v => patch('parts_pickup', { enabled: v })}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Pickup Location" required>
            <input
              type="text"
              className="input-base text-sm"
              placeholder="e.g. NAPA Auto Parts, Grafton"
              value={services.parts_pickup.pickup_location}
              onChange={e => patch('parts_pickup', { pickup_location: e.target.value })}
            />
          </Field>
          <Field label="Order # or Receipt #">
            <input
              type="text"
              className="input-base text-sm"
              placeholder="e.g. INV-12345"
              value={services.parts_pickup.order_number}
              onChange={e => patch('parts_pickup', { order_number: e.target.value })}
            />
          </Field>
          <Field label="Contact Name" required>
            <input
              type="text"
              className="input-base text-sm"
              placeholder="Name at pickup location"
              value={services.parts_pickup.contact_name}
              onChange={e => patch('parts_pickup', { contact_name: e.target.value })}
            />
          </Field>
          <Field label="Contact Phone" required>
            <input
              type="tel"
              className="input-base text-sm"
              placeholder="(555) 123-4567"
              value={services.parts_pickup.contact_phone}
              onChange={e => patch('parts_pickup', { contact_phone: e.target.value })}
            />
          </Field>
        </div>
      </SectionCard>

      {/* ── PACKAGE / OTHER DELIVERY ── */}
      <SectionCard
        icon={<Package className="w-5 h-5" />}
        title="Package / Other Delivery"
        description="We'll pick up a package from Sam's Club, Walmart, or another location and deliver it with your order."
        enabled={services.package_delivery.enabled}
        onToggle={v => patch('package_delivery', { enabled: v })}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Description of Package / Items" required>
            <input
              type="text"
              className="input-base text-sm"
              placeholder="e.g. Sam's Club grocery order"
              value={services.package_delivery.description}
              onChange={e => patch('package_delivery', { description: e.target.value })}
            />
          </Field>
          <Field label="Pickup Location / Store" required>
            <input
              type="text"
              className="input-base text-sm"
              placeholder="e.g. Sam's Club, Jerseyville IL"
              value={services.package_delivery.origin}
              onChange={e => patch('package_delivery', { origin: e.target.value })}
            />
          </Field>
          <Field label="Contact Name" required>
            <input
              type="text"
              className="input-base text-sm"
              placeholder="Name to ask for"
              value={services.package_delivery.contact_name}
              onChange={e => patch('package_delivery', { contact_name: e.target.value })}
            />
          </Field>
          <Field label="Contact Phone" required>
            <input
              type="tel"
              className="input-base text-sm"
              placeholder="(555) 123-4567"
              value={services.package_delivery.contact_phone}
              onChange={e => patch('package_delivery', { contact_phone: e.target.value })}
            />
          </Field>
        </div>
      </SectionCard>

      {!services.parts_pickup.enabled && !services.package_delivery.enabled && (
        <p className="text-center text-sm text-gray-400 py-6">
          No additional services added. Toggle one on above if needed.
        </p>
      )}
    </div>
  );
}
