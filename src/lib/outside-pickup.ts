// src/lib/outside-pickup.ts
//
// Outside pickups (Walmart Instant Pot, a carton of smokes) sit on a service
// line with no catalog price until Sinclair's keys Price Paid. Who pays is
// stored on service_details (grocery | deck | cod) — the order_items.paid_by
// column was often left at 'vessel', which made a $2000 boat-grocery Instant
// Pot silently inflate the COD collect total and get split across Amber /
// Marcus / Tyler without ever appearing as a line.

import type { OrderItem } from '@/types';

export type PickupPay = 'vessel' | 'deck' | 'cod';

/** Group name when a COD pickup has no crew member attached. */
export const BOAT_COD_NAME = 'To the boat';

export interface CodCollectLine {
  id: string;
  description: string;
  quantity: number;
  amount: number;
  unpriced: boolean;
}

export function lineAmount(item: Pick<OrderItem, 'shopping_status' | 'actual_total' | 'unit_price' | 'quantity'>): number {
  if (item.shopping_status === 'out_of_stock') return 0;
  const n = Number(item.actual_total ?? Number(item.unit_price) * Number(item.quantity || 1));
  return Number.isFinite(n) ? n : 0;
}

export function pickupIsPriced(item: Pick<OrderItem, 'unit_price' | 'actual_total'>): boolean {
  return Number(item.unit_price) > 0 || Number(item.actual_total) > 0;
}

/**
 * Who pays for an outside pickup. service_details wins — place-order writes
 * grocery|cod there, while the paid_by column on the same row is frequently
 * still 'vessel'.
 */
export function pickupPay(item: OrderItem): { paid_by: PickupPay; cod_name: string } {
  const d = (item.service_details || {}) as Record<string, unknown>;
  const raw = String(d.paid_by || '').toLowerCase().trim();
  const detailsName = String(d.cod_name || '').trim();
  if (raw === 'cod') {
    return { paid_by: 'cod', cod_name: detailsName || (item.cod_name || '').trim() };
  }
  if (raw === 'deck') return { paid_by: 'deck', cod_name: '' };
  if (raw === 'grocery' || raw === 'vessel' || raw === 'boat') {
    return { paid_by: 'vessel', cod_name: '' };
  }
  if (item.paid_by === 'cod') {
    return { paid_by: 'cod', cod_name: (item.cod_name || detailsName).trim() };
  }
  if (item.paid_by === 'deck') return { paid_by: 'deck', cod_name: '' };
  return { paid_by: 'vessel', cod_name: '' };
}

/** Prefer the notes ("Instant Pot") over the generic service description. */
export function pickupLabel(item: OrderItem): string {
  const d = (item.service_details || {}) as Record<string, unknown>;
  const notes = String(d.notes || '').trim();
  if (notes) return notes.split(/\n/)[0].slice(0, 120);
  return item.description;
}

export function pickupPayLabel(item: OrderItem): string {
  const { paid_by, cod_name } = pickupPay(item);
  if (paid_by === 'cod') return `COD — ${cod_name || '(no name given)'}`;
  if (paid_by === 'deck') return 'Deck — company billed, not grocery allowance';
  return 'Boat grocery';
}

export function splitOutsidePickups(serviceItems: OrderItem[]) {
  const all = serviceItems.filter(i => i.service_type === 'other_pickup');
  const vessel: OrderItem[] = [];
  const deck: OrderItem[] = [];
  const cod: OrderItem[] = [];
  for (const i of all) {
    const p = pickupPay(i).paid_by;
    if (p === 'cod') cod.push(i);
    else if (p === 'deck') deck.push(i);
    else vessel.push(i);
  }
  return { all, vessel, deck, cod };
}

/**
 * One collect-view group per crew member (plus "To the boat" for unnamed COD
 * pickups). Grocery COD lines and priced/unpriced COD pickups share a group
 * so Instant Pot appears under the person who owes it — or as its own block,
 * never silently folded into everyone else's header.
 */
export function groupCodCollect(
  groceryCod: OrderItem[],
  pickupCod: OrderItem[],
): Array<[string, CodCollectLine[]]> {
  const map = new Map<string, CodCollectLine[]>();
  const push = (name: string, line: CodCollectLine) => {
    const key = name.trim() || BOAT_COD_NAME;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(line);
  };

  for (const i of groceryCod) {
    push((i.cod_name || '').trim() || 'Crew member', {
      id: i.id,
      description: i.description,
      quantity: i.quantity,
      amount: lineAmount(i),
      unpriced: false,
    });
  }

  for (const i of pickupCod) {
    const priced = pickupIsPriced(i);
    push(pickupPay(i).cod_name, {
      id: i.id,
      description: pickupLabel(i),
      quantity: i.quantity || 1,
      amount: priced ? lineAmount(i) : 0,
      unpriced: !priced,
    });
  }

  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}
