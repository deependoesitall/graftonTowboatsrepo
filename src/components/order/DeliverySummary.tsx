import type { ReactNode } from 'react';
'use client';
// src/components/order/DeliverySummary.tsx
// Shared delivery card for customer confirm (incl. guests) and admin.
import { Anchor, MapPin, Radio, Users, Package, Ship, Phone, Mail, FileText } from 'lucide-react';
import { Order } from '@/types';
import { formatDateOnly, formatArrivalTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

export interface DeliverySummaryProps {
  order: Order;
  variant?: 'customer' | 'admin';
  className?: string;
}

function Field({ label, value, highlight }: { label: string; value: ReactNode; highlight?: boolean }) {
  if (value == null || value === '') return null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-green/45 mb-0.5">{label}</p>
      <p className={cn(
        'text-sm font-semibold leading-snug break-words',
        highlight ? 'text-brand-navy' : 'text-brand-navy/90',
      )}>{value}</p>
    </div>
  );
}

function methodLabel(m: string | null | undefined) {
  if (m === 'boat') return 'Boat delivery';
  if (m === 'van') return 'Van delivery';
  return m || null;
}

function crewLabel(v: Order['crew_change']) {
  if (v === 'yes') return 'Yes — planned';
  if (v === 'maybe') return 'Maybe — confirm';
  if (v === 'no') return 'No';
  return null;
}

export function DeliverySummary({ order, variant = 'customer', className }: DeliverySummaryProps) {
  const ext = order.extended_info || null;
  const isAdmin = variant === 'admin';

  const hasVessel = !!(order.company_name || order.vessel_name || order.vessel_type);
  const hasDelivery = !!(order.terminal_name || order.arrival_date || order.delivery_method || order.approach_side || order.vhf_channel);
  const hasPeople = !!(order.contact_name || order.phone || order.captain_name || order.captain_phone || order.vessel_email || order.customer_email);
  const hasCrew = order.crew_change === 'yes' || order.crew_change === 'maybe' || !!order.crew_change_notes;
  const hasSecondary = !!(ext?.secondary_terminal_name || ext?.secondary_arrival_date);
  const hasNotes = !!(order.notes || ext?.docking_notes || ext?.personal_cod_notes || order.po_number);

  if (!hasVessel && !hasDelivery && !hasPeople && !hasCrew && !hasSecondary && !hasNotes) {
    return null;
  }

  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-brand-green/15 bg-gradient-to-br from-white via-brand-sand/30 to-brand-cream shadow-sm',
        isAdmin && 'rounded-xl shadow-none',
        className,
      )}
    >
      <div className={cn(
        'flex items-center gap-2.5 px-4 py-3 border-b border-brand-gold/25',
        'bg-gradient-to-r from-brand-navy to-brand-green text-white',
      )}>
        <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0">
          <Anchor className="w-4 h-4 text-brand-yellow" />
        </div>
        <div className="min-w-0">
          <h2 className="font-display font-bold text-sm tracking-wide">Delivery</h2>
          <p className="text-[11px] text-white/70 truncate">
            {[order.company_name, order.vessel_name].filter(Boolean).join(' · ') || 'Your delivery details'}
          </p>
        </div>
      </div>

      <div className={cn('p-4 space-y-4', isAdmin && 'p-3 space-y-3')}>
        {hasVessel && (
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase tracking-widest text-brand-green/50">
              <Ship className="w-3.5 h-3.5" /> Vessel
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Company" value={order.company_name} highlight />
              <Field label="Vessel" value={order.vessel_name} highlight />
              <Field label="Type" value={order.vessel_type} />
              <Field label="PO #" value={order.po_number} />
            </div>
          </div>
        )}

        {hasDelivery && (
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase tracking-widest text-brand-green/50">
              <MapPin className="w-3.5 h-3.5" /> Where & when
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Terminal / location" value={order.terminal_name} highlight />
              <Field label="Method" value={methodLabel(order.delivery_method)} />
              <Field
                label="Arrival"
                value={
                  order.arrival_date
                    ? `${formatDateOnly(order.arrival_date)}${order.arrival_time ? ` · ${formatArrivalTime(order.arrival_time)}` : ''}`
                    : (order.arrival_time ? formatArrivalTime(order.arrival_time) : null)
                }
                highlight
              />
              <Field label="ETA note" value={order.eta} />
              <Field label="Approach" value={order.approach_side ? String(order.approach_side) : null} />
              {order.vhf_channel && (
                <Field label="VHF" value={<span className="inline-flex items-center gap-1"><Radio className="w-3.5 h-3.5" /> Ch {order.vhf_channel}</span>} />
              )}
            </div>
          </div>
        )}

        {hasSecondary && (
          <div className="rounded-xl bg-brand-sand/50 border border-brand-gold/20 p-3">
            <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase tracking-widest text-brand-green/50">
              <Package className="w-3.5 h-3.5" /> Secondary stop
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Terminal" value={ext?.secondary_terminal_name} />
              <Field label="Method" value={methodLabel(ext?.secondary_delivery_method)} />
              <Field
                label="Arrival"
                value={
                  ext?.secondary_arrival_date
                    ? `${formatDateOnly(ext.secondary_arrival_date)}${ext.secondary_arrival_time ? ` · ${formatArrivalTime(ext.secondary_arrival_time)}` : ''}`
                    : (ext?.secondary_arrival_time ? formatArrivalTime(ext.secondary_arrival_time) : null)
                }
              />
            </div>
          </div>
        )}

        {hasPeople && (
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase tracking-widest text-brand-green/50">
              <Phone className="w-3.5 h-3.5" /> Contacts
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Order contact" value={order.contact_name || ext?.order_contact_name} />
              <Field label="Phone" value={order.phone || ext?.order_contact_phone} />
              <Field label="Captain" value={order.captain_name} />
              <Field label="Captain phone" value={order.captain_phone} />
              <Field label="Vessel email" value={order.vessel_email ? <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5 shrink-0" />{order.vessel_email}</span> : null} />
              <Field label="Confirmation email" value={order.customer_email} />
            </div>
          </div>
        )}

        {hasCrew && (
          <div className="rounded-xl border border-brand-green/15 bg-white/70 p-3">
            <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase tracking-widest text-brand-green/50">
              <Users className="w-3.5 h-3.5" /> Crew change
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Needed" value={crewLabel(order.crew_change)} highlight />
              <Field label="Arriving" value={order.crew_arriving != null ? String(order.crew_arriving) : null} />
              <Field label="Departing" value={order.crew_departing != null ? String(order.crew_departing) : null} />
            </div>
            {order.crew_change_notes && (
              <p className="mt-2 text-sm text-brand-navy/80 leading-relaxed">{order.crew_change_notes}</p>
            )}
          </div>
        )}

        {(ext?.docking_notes || ext?.personal_cod_notes || order.notes) && (
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase tracking-widest text-brand-green/50">
              <FileText className="w-3.5 h-3.5" /> Notes
            </div>
            <div className="space-y-2 text-sm text-brand-navy/85 leading-relaxed">
              {ext?.docking_notes && <p><span className="font-bold text-brand-green/60">Docking: </span>{ext.docking_notes}</p>}
              {ext?.personal_cod_notes && <p><span className="font-bold text-brand-green/60">COD: </span>{ext.personal_cod_notes}</p>}
              {order.notes && <p>{order.notes}</p>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
