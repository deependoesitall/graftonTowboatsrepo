// src/lib/customer-order-status.ts
//
// Customer-facing order status — cooks, not staff jargon.
// Maps the real OrderStatus values honestly. Never invents steps we cannot know.
//
// Pipeline (staff): new → in_progress → shopped → fulfilled (or cancelled)
// Cooks see:        Received → Shopping → On the way / ready for boat → Done

export type CustomerStatusKey =
  | 'received'
  | 'shopping'
  | 'ready'
  | 'done'
  | 'cancelled';

export interface CustomerOrderStatus {
  key: CustomerStatusKey;
  /** Short chip label */
  label: string;
  /** One friendly next-step / what's happening line */
  nextStep: string;
  chipClass: string;
}

type DeliveryHint = 'boat' | 'van' | '' | string | null | undefined;

function readyLabel(delivery: DeliveryHint): string {
  if (delivery === 'van') return 'Ready for van';
  return 'On the way';
}

function readyNext(delivery: DeliveryHint): string {
  if (delivery === 'van') {
    return 'Shopped and ready — pick up when you get to Grafton.';
  }
  // boat (default) and unknown: Grafton brings it to the boat / landing
  return 'Shopped and ready — Grafton is getting it to your boat.';
}

/**
 * Honest map from staff OrderStatus (+ optional delivery_method) to cook copy.
 * Aligns with confirmation ("we've received it") and final email ("Delivered").
 */
export function customerOrderStatus(
  status: string | null | undefined,
  deliveryMethod?: DeliveryHint,
): CustomerOrderStatus {
  const s = (status || 'new').toLowerCase();
  switch (s) {
    case 'new':
      return {
        key: 'received',
        label: 'Received',
        nextStep: "We got your order. Sinclair's will start shopping it soon.",
        chipClass: 'bg-blue-50 text-blue-700 border-blue-200',
      };
    case 'in_progress':
      return {
        key: 'shopping',
        label: 'Shopping',
        nextStep: "Sinclair's is shopping your list now.",
        chipClass: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'shopped':
      return {
        key: 'ready',
        label: readyLabel(deliveryMethod),
        nextStep: readyNext(deliveryMethod),
        chipClass: 'bg-purple-50 text-purple-800 border-purple-200',
      };
    case 'fulfilled':
      return {
        key: 'done',
        label: 'Done',
        nextStep: "Delivered — you're all set. Check your email for the final summary.",
        chipClass: 'bg-green-50 text-green-700 border-green-200',
      };
    case 'cancelled':
      return {
        key: 'cancelled',
        label: 'Cancelled',
        nextStep: 'This order was cancelled. Call Grafton if that looks wrong.',
        chipClass: 'bg-red-50 text-red-600 border-red-200',
      };
    default:
      return {
        key: 'received',
        label: 'Received',
        nextStep: "We have your order.",
        chipClass: 'bg-gray-50 text-gray-700 border-gray-200',
      };
  }
}

export interface TimelineStep {
  key: CustomerStatusKey;
  label: string;
  blurb: string;
  /** past | current | upcoming */
  state: 'past' | 'current' | 'upcoming';
}

/**
 * Post-order "what happens next" timeline.
 * Only the four real milestones — cancelled orders get a single honest line instead.
 */
export function customerOrderTimeline(
  status: string | null | undefined,
  deliveryMethod?: DeliveryHint,
): TimelineStep[] {
  const s = (status || 'new').toLowerCase();
  if (s === 'cancelled') {
    return [{
      key: 'cancelled',
      label: 'Cancelled',
      blurb: 'This order was cancelled.',
      state: 'current',
    }];
  }

  const currentKey: CustomerStatusKey =
    s === 'fulfilled' ? 'done'
      : s === 'shopped' ? 'ready'
        : s === 'in_progress' ? 'shopping'
          : 'received';

  const order: Array<{ key: CustomerStatusKey; label: string; blurb: string }> = [
    {
      key: 'received',
      label: 'Received',
      blurb: 'Grafton has your order.',
    },
    {
      key: 'shopping',
      label: 'Shopping',
      blurb: "Sinclair's shops your list.",
    },
    {
      key: 'ready',
      label: deliveryMethod === 'van' ? 'Ready for van' : 'On the way',
      blurb: deliveryMethod === 'van'
        ? 'Ready when you get to Grafton.'
        : 'Grafton brings it to your boat.',
    },
    {
      key: 'done',
      label: 'Done',
      blurb: 'Delivered — final summary by email.',
    },
  ];

  const idx = order.findIndex(o => o.key === currentKey);
  return order.map((o, i) => ({
    ...o,
    state: i < idx ? 'past' : i === idx ? 'current' : 'upcoming',
  }));
}
