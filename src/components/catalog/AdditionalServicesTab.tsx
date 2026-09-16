'use client';
// src/components/catalog/AdditionalServicesTab.tsx
//
// The customer's Additional Services tab — the cart-backed wrapper around the
// shared form in components/order/ServiceFields.
//
// ⚠️ THE FIELDS ARE NOT DEFINED HERE ANY MORE. They were, and the consequence
// was that the admin order builder had no services section at all: staff could
// not place an order a customer could place, because the only copy of the form
// was welded to this page's localStorage cart. The questions now live in
// AdditionalServicesFields and this file owns exactly one thing — that on this
// page, the answers belong in the cart.
//
// The "other store" request keeps its own card at the bottom of the groceries
// tab (OtherPickupCard), so it is switched off here.

import { useState, useEffect } from 'react';
import { Info } from 'lucide-react';
import { AdditionalServices, VesselInfo } from '@/types';
import {
  getAdditionalServices, saveAdditionalServices,
  getVesselInfo, saveVesselInfo,
} from '@/lib/cart';
import { AdditionalServicesFields, type CrewChangeState } from '@/components/order/ServiceFields';

const DISCLAIMER =
  'Additional services shown below have no fixed price at checkout. Final charges — including any delivery or pickup fees — are confirmed after fulfillment and billed on your regular monthly invoice. Questions? Call Grafton Towboat Services at (618) 556-0290.';

export function AdditionalServicesTab() {
  const [services, setServices] = useState<AdditionalServices>(getAdditionalServices());
  const [vessel, setVessel] = useState<VesselInfo>(getVesselInfo());

  useEffect(() => {
    saveAdditionalServices(services);
    window.dispatchEvent(new Event('cart-updated'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services]);

  function patchVessel(patch: Partial<CrewChangeState>) {
    setVessel(prev => {
      const next = { ...prev, ...patch };
      saveVesselInfo(next);
      return next;
    });
  }

  const crew: CrewChangeState = {
    crew_change: vessel.crew_change,
    crew_arriving: vessel.crew_arriving,
    crew_departing: vessel.crew_departing,
    crew_change_notes: vessel.crew_change_notes,
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-brand-navy mb-2">Additional Services</h2>

      <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-900 leading-relaxed">
          {DISCLAIMER.split('(618) 556-0290')[0]}
          <a href="tel:6185560290" className="font-bold underline">(618) 556-0290</a>.
        </p>
      </div>

      <AdditionalServicesFields
        services={services}
        onServicesChange={setServices}
        crew={crew}
        onCrewChange={patchVessel}
        includeOther={false}
      />

      <p className="text-xs text-gray-400 px-1">
        You&apos;ll see the crew change question again at checkout — details entered here carry over.
      </p>
    </div>
  );
}
