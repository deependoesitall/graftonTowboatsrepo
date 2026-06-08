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
  if (upper.includes('DAIRY') || upper.includes('CHEESE') || upper.includes('MILK') || upper.includes('BUTTER') || upper.includes('YOGURT') || upper.includes('EGG')) return 'Dairy & Eggs';
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

export const MAIN_CATEGORIES = [
  'Meat & Seafood',
  'Dairy & Eggs',
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
