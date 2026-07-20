// src/lib/utils.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function generateOrderNumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `GTS-${year}${month}${day}-${rand}`;
}

export const ORDER_STATUSES = [
  { value: 'new', label: 'New', color: 'bg-blue-100 text-blue-800' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'fulfilled', label: 'Fulfilled', color: 'bg-green-100 text-green-800' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-800' },
] as const;

export function getStatusStyle(status: string): string {
  return ORDER_STATUSES.find(s => s.value === status)?.color ?? 'bg-gray-100 text-gray-800';
}

export function getStatusLabel(status: string): string {
  return ORDER_STATUSES.find(s => s.value === status)?.label ?? status;
}

// Normalize category names from the raw spreadsheet data
export function normalizeCategory(raw: string): string {
  const upper = raw.toUpperCase().trim();
  if (upper.includes('MEAT') || upper.includes('BEEF') || upper.includes('PORK') || upper.includes('CHICKEN') || upper.includes('SEAFOOD') || upper.includes('FISH')) return 'Meat & Seafood';
  if (upper.includes('DAIRY') || upper.includes('CHEESE') || upper.includes('MILK') || upper.includes('BUTTER') || upper.includes('YOGURT') || upper.includes('EGG')) return 'Dairy';
  if (upper.includes('PRODUCE') || upper.includes('VEGETABLE') || upper.includes('FRUIT') || upper.includes('SALAD')) return 'Produce';
  if (upper.includes('FROZEN')) return 'Frozen Foods';
  if (upper.includes('BREAD') || upper.includes('BAKERY') || upper.includes('DELI')) return 'Bakery & Deli';
  if (upper.includes('BEVERAGE') || upper.includes('DRINK') || upper.includes('JUICE') || upper.includes('WATER') || upper.includes('SODA') || upper.includes('COFFEE') || upper.includes('TEA')) return 'Beverages';
  if (upper.includes('SNACK') || upper.includes('CHIP') || upper.includes('CANDY') || upper.includes('COOKIE') || upper.includes('CRACKER')) return 'Snacks & Sweets';
  if (upper.includes('PAPER') || upper.includes('CLEAN') || upper.includes('SOAP') || upper.includes('TISSUE') || upper.includes('TOWEL') || upper.includes('LAUNDRY') || upper.includes('DETERGENT')) return 'Household & Cleaning';
  if (upper.includes('CANNED') || upper.includes('CAN ') || upper.includes('SOUP') || upper.includes('PASTA') || upper.includes('RICE') || upper.includes('CEREAL') || upper.includes('CONDIMENT') || upper.includes('SAUCE') || upper.includes('GROCERY')) return 'Pantry & Grocery';
  if (upper.includes('HEALTH') || upper.includes('MEDICINE') || upper.includes('VITAMIN') || upper.includes('PHARMACY') || upper.includes('PERSONAL CARE') || upper.includes('HYGIENE')) return 'Health & Personal Care';
  if (upper.includes('SUPPLY') || upper.includes('SUPPLIES') || upper.includes('MARINE') || upper.includes('BOAT') || upper.includes('TOW')) return 'Boat Supplies';
  return 'General';
}

// ── By-the-pound quantities ───────────────────────────────────
// Sinclair's own site drives this: products carry quantity_step (0.25 for
// deli by-lb items, 1 for counted things like produce). ONLY fractional-step
// items get the lb preset dropdown; everything else counts whole units.
export const WEIGHT_PRESETS = [0.25, 0.5, 1, 2, 3, 5];

/** Preset lb amounts derived from a product's own quantity_step (0.25 → ¼, ½, ¾, 1, 1.5, 2). */
export function lbStepsFor(step: number): number[] {
  return [1, 2, 3, 4, 6, 8].map(m => Math.round(m * step * 100) / 100);
}

/** True when a product orders in fractional-lb increments (deli scale items). */
export function usesLbSteps(quantityStep: number | null | undefined): boolean {
  return typeof quantityStep === 'number' && quantityStep > 0 && quantityStep < 1;
}

export function formatLb(n: number): string {
  if (n === 0.25) return '¼ lb';
  if (n === 0.5) return '½ lb';
  if (n === 0.75) return '¾ lb';
  return `${n} lb`;
}

/** Show a quantity as pounds when it's clearly a pounds quantity (LB unit or fractional). */
export function isPoundQty(uom: string | null | undefined, quantity: number): boolean {
  return (uom || '').toUpperCase() === 'LB' || quantity % 1 !== 0;
}

/** "×3" for counted items, "½ lb" for pound quantities. */
export function formatQty(quantity: number, asPounds: boolean | undefined | null): string {
  return asPounds ? formatLb(quantity) : `×${quantity}`;
}

/**
 * Customer-facing product name. The catalog spreadsheet's `description` is
 * abbreviated POS-style ("YOP STRWBRY YOG"); the full name from Sinclair's
 * website lives in `details` ("Yoplait Low Fat Strawberry Yogurt 6 oz").
 * Customers see the full name — like Sinclair's own site. `description`
 * stays untouched in the DB: the paper-order-form matcher depends on it.
 */
export function productDisplayName(p: { description: string; details?: string | null }): string {
  const d = (p.details || '').trim();
  return d.length >= 4 ? d : p.description;
}

export const MAIN_CATEGORIES = [
  'Meat & Seafood',
  'Dairy',
  'Produce',
  'Frozen Foods',
  'Bakery & Deli',
  'Beverages',
  'Snacks & Sweets',
  'Pantry & Grocery',
  'Household & Cleaning',
  'Health & Personal Care',
  'Boat Supplies',
  'General',
];
