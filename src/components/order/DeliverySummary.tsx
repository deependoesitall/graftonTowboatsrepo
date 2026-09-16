'use client';
// src/components/order/DeliverySummary.tsx
//
// THE DELIVERY DETAILS, ON THE CUSTOMER CONFIRMATION AND IN THE ADMIN ORDER
// MODAL. One definition, two readers: a captain checking we got it right, and
// a GTS dispatcher working out who drives where.
//
// ⚠️ GUESTS SEE ALL OF IT. Nothing here is gated on a session — the
// confirmation page fetches the order by the id in its own URL. The delivery
// information is theirs; they typed it.
//
// ⚠️ TWO STOPS IS A DIFFERENT JOB, NOT AN EXTRA FIELD.
//
// A second stop means a second run, a second terminal to find and a second
// time to hit. It used to render as a quiet grey panel headed "Secondary stop"
// below the real one, which reads as an afterthought — and the first stop was
// not labelled as a first stop at all, so nothing on the screen said there
// were two of anything until you had read to the bottom. Both stops are now
// numbered, sit side by side, and the card says "2 stops" in its header.
//
// ⚠️ DATES HERE ARE CALENDAR DATES. arrival_date and secondary_arrival_date
// are bare 'YYYY-MM-DD' columns. formatDateOnly parses those as UTC midnight
// and renders them in Grafton time, which lands at 7 PM the DAY BEFORE — this
// card showed every arrival one day early, on both stops, on the customer's
// confirmation and on the screen staff schedule from. formatCalendarDate
// parses and formats in UTC, which is the only way a date with no time
// survives the trip. See the warning on formatDateOnly in lib/utils.
import { AlertTriangle, Anchor, MapPin, Radio, Users, Ship, Phone, Mail, FileText, Truck } from 'lucide-react';
import { Order } from '@/types';
import { formatCalendarDate, formatArrivalTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

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

/** One leg of the run, as entered. Nothing here is computed or assumed. */
interface Stop {
  n: number;
  terminal: string | null;
  date: string | null;   // bare YYYY-MM-DD
  time: string | null;   // HH:mm
  method: string | null;
}

/** "Sep 22, 2026 · 6:00 AM", "Sep 22, 2026", "6:00 AM", or null. */
function whenText(s: Stop): string | null {
  const d = s.date ? formatCalendarDate(s.date) : '';
  const t = s.time ? formatArrivalTime(s.time) : '';
  if (d && t) return `${d} · ${t}`;
  return d || t || null;
}

function StopCard({ stop, numbered }: { stop: Stop; numbered: boolean }) {
  const when = whenText(stop);
  const missing = 'Not given';
  return (
    <div className={cn(
      'rounded-xl border p-3',
      stop.n === 1
        ? 'border-brand-green/20 bg-white/80'
        : 'border-brand-gold/35 bg-brand-sand/50',
    )}>
      {numbered && (
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-orange mb-2">
          <MapPin className="w-3 h-3" /> Stop {stop.n}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Terminal / location" value={stop.terminal || <span className="italic font-normal opacity-50">{missing}</span>} highlight />
        <Field label="Arrival" value={when || <span className="italic font-normal opacity-50">{missing}</span>} highlight />
        {stop.method && (
          <Field
            label="Method"
            value={
              <span className="inline-flex items-center gap-1">
                {stop.method === 'van'
                  ? <Truck className="w-3.5 h-3.5 shrink-0" />
                  : <Ship className="w-3.5 h-3.5 shrink-0" />}
                {methodLabel(stop.method)}
              </span>
            }
          />
        )}
      </div>
    </div>
  );
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
  const hasDelivery = !!(order.terminal_name || order.arrival_date || order.arrival_time || order.delivery_method || order.approach_side || order.vhf_channel);
  const hasPeople = !!(order.contact_name || order.phone || order.captain_name || order.captain_phone || order.vessel_email || order.customer_email);
  const hasCrew = order.crew_change === 'yes' || order.crew_change === 'maybe' || !!order.crew_change_notes;
  const hasSecondary = !!(
    ext?.secondary_terminal_name || ext?.secondary_arrival_date || ext?.secondary_arrival_time
  );

  const stops: Stop[] = [
    {
      n: 1,
      terminal: order.terminal_name || null,
      date: order.arrival_date || null,
      time: order.arrival_time || null,
      method: order.delivery_method || null,
    },
    ...(hasSecondary ? [{
      n: 2,
      terminal: ext?.secondary_terminal_name || null,
      date: ext?.secondary_arrival_date || null,
      time: ext?.secondary_arrival_time || null,
      method: ext?.secondary_delivery_method || null,
    }] : []),
  ];

  // ⚠️ THE NUMBERS ARE A CLAIM, SO CHECK THEM.
  //
  // "Stop 1" and "Stop 2" come from which box the dates were typed into, not
  // from the dates themselves. Somebody filling the form out of order, or
  // correcting one date and not the other, produces a card that confidently
  // labels the later stop as first — and a driver plans the run off that. When
  // the dates disagree with the numbering, the card says so instead of picking
  // a side: we do not know which they meant, and guessing is worse than asking.
  const outOfOrder = !!(
    hasSecondary && stops[0].date && stops[1]?.date && stops[1].date < stops[0].date
  );
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
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-bold text-sm tracking-wide">Delivery</h2>
          <p className="text-[11px] text-white/70 truncate">
            {[order.company_name, order.vessel_name].filter(Boolean).join(' · ') || 'Your delivery details'}
          </p>
        </div>
        {/* ⚠️ THE ONE FACT THAT CHANGES THE JOB, STATED WHERE IT CANNOT BE
            SCROLLED PAST. Two stops is two runs; it does not belong buried at
            the bottom of the card. */}
        {hasSecondary && (
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-brand-navy bg-brand-yellow px-2 py-1 rounded-full">
            2 stops
          </span>
        )}
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

        {(hasDelivery || hasSecondary) && (
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase tracking-widest text-brand-green/50">
              <MapPin className="w-3.5 h-3.5" /> Where &amp; when
            </div>

            {outOfOrder && (
              <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-[13px] leading-snug text-amber-900">
                  <b>Stop 2 is dated before stop 1.</b> These are numbered in the order they were
                  entered, not by date — check which one the boat is making first before planning
                  the run.
                </p>
              </div>
            )}

            {/* Side by side, so the second stop is read WITH the first rather
                than after it. One stop keeps the full width and looks exactly
                as it always has. */}
            <div className={cn('grid gap-3', hasSecondary && 'sm:grid-cols-2')}>
              {stops.map(s => (
                <StopCard key={s.n} stop={s} numbered={hasSecondary} />
              ))}
            </div>

            {/* ⚠️ ORDER-LEVEL, NOT PER-STOP. The form asks for one approach
                side, one VHF channel and one ETA note for the whole order, so
                they sit outside the stop cards. Putting a copy inside each one
                would invent a distinction the customer was never offered and
                let a driver believe stop 2 had its own answer. */}
            {(order.eta || order.approach_side || order.vhf_channel) && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Field label="ETA note" value={order.eta} />
                <Field label="Approach" value={order.approach_side ? String(order.approach_side) : null} />
                {order.vhf_channel && (
                  <Field label="VHF" value={<span className="inline-flex items-center gap-1"><Radio className="w-3.5 h-3.5" /> Ch {order.vhf_channel}</span>} />
                )}
              </div>
            )}
            {hasSecondary && (order.approach_side || order.vhf_channel) && (
              <p className="mt-1.5 text-[11px] text-brand-green/50 leading-snug">
                Approach side and VHF were given once for the whole order — confirm them again for stop 2.
              </p>
            )}
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
