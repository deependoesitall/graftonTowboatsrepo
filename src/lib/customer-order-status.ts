// src/lib/customer-order-status.ts
//
// Customer-facing order status — cooks, not staff jargon.
// Maps the real OrderStatus values honestly. Never invents steps we cannot know.
//
// Pipeline (staff): new → in_progress → shopped → fulfilled (or cancelled)
// Cooks see:        Received → Shopping → On the way → Delivered
// Van vs boat stays staff-side. Customers get one set of status labels.

/** Same four tracker labels as the boat dashboard. */
export const CUSTOMER_STATUS_WALKTHROUGH =
  'Received → Shopping → On the way → Delivered.';

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

/**
 * Honest map from staff OrderStatus to cook copy.
 * Aligns with confirmation ("we've received it") and final email ("Delivered").
 * deliveryMethod is unused — customers see one tracker, not van vs boat.
 */
export function customerOrderStatus(
  status: string | null | undefined,
  _deliveryMethod?: DeliveryHint,
): CustomerOrderStatus {
  const s = (status || 'new').toLowerCase();
  switch (s) {
    case 'new':
      return {
        key: 'received',
        label: 'Received',
        nextStep: "Grafton Towboat Services has your order. Sinclair's will start shopping it soon.",
        chipClass: 'bg-blue-50 text-blue-700 border-blue-200',
      };
    case 'in_progress':
      return {
        key: 'shopping',
        label: "Shopping",
        nextStep: "Sinclair's has this in progress and is shopping your list.",
        chipClass: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'shopped':
      return {
        key: 'ready',
        label: 'On the way',
        nextStep: "Sinclair's is finished shopping. Grafton Towboat Services is on the way.",
        chipClass: 'bg-purple-50 text-purple-800 border-purple-200',
      };
    case 'fulfilled':
      return {
        key: 'done',
        label: 'Delivered',
        nextStep: "Grafton Towboat Services marked this delivered. The final email has the Grafton Towboat Services delivery charge — Sinclair's totals stay on this page.",
        chipClass: 'bg-green-50 text-green-700 border-green-200',
      };
    case 'cancelled':
      return {
        key: 'cancelled',
        label: 'Cancelled',
        nextStep: 'This order was cancelled. Call Grafton Towboat Services if that looks wrong.',
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
  _deliveryMethod?: DeliveryHint,
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
      blurb: 'Grafton Towboat Services has your order.',
    },
    {
      key: 'shopping',
      label: 'Shopping',
      blurb: "Sinclair's is working your list.",
    },
    {
      key: 'ready',
      label: 'On the way',
      blurb: "Sinclair's is done. Grafton Towboat Services is on the way.",
    },
    {
      key: 'done',
      label: 'Delivered',
      blurb: 'Grafton Towboat Services marked it delivered.',
    },
  ];

  const idx = order.findIndex(o => o.key === currentKey);
  return order.map((o, i) => ({
    ...o,
    state: i < idx ? 'past' : i === idx ? 'current' : 'upcoming',
  }));
}

/** How far Sinclair's has gotten through the grocery lines. Substitutes don't double-count. */
export function customerShoppingProgress(
  items: Array<{ item_type?: string | null; shopping_status?: string | null; is_substitution?: boolean | null }> | null | undefined,
): { done: number; total: number } {
  const lines = (items || []).filter(i => i.item_type !== 'service' && !i.is_substitution);
  const total = lines.length;
  const done = lines.filter(i => i.shopping_status === 'shopped' || i.shopping_status === 'out_of_stock').length;
  return { done, total };
}
