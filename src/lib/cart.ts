'use client';
// src/lib/cart.ts
import { CartItem, VesselInfo, AdditionalServices } from '@/types';

const CART_KEY     = 'grafton_cart';
const VESSEL_KEY   = 'grafton_vessel_info';
const SERVICES_KEY = 'grafton_additional_services';

// ── Cart ──────────────────────────────────────────────────────

export function getCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.items)) return parsed.items;
    return [];
  } catch { return []; }
}

export function saveCart(items: CartItem[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('cart-updated'));
}

export function addToCart(item: CartItem) {
  const cart = getCart();
  const idx = cart.findIndex(i => i.product_id === item.product_id);
  if (idx >= 0) cart[idx].quantity += item.quantity;
  else cart.push(item);
  saveCart(cart);
}

export function updateCartItem(product_id: string, quantity: number) {
  const cart = getCart();
  if (quantity <= 0) { saveCart(cart.filter(i => i.product_id !== product_id)); return; }
  const idx = cart.findIndex(i => i.product_id === product_id);
  if (idx >= 0) { cart[idx].quantity = quantity; saveCart(cart); }
}

export function removeFromCart(product_id: string) {
  saveCart(getCart().filter(i => i.product_id !== product_id));
}

export function clearCart() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CART_KEY);
  window.dispatchEvent(new CustomEvent('cart-updated'));
}

export function getCartTotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

export function getCartCount(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

// ── Vessel info ───────────────────────────────────────────────

export function getVesselInfo(): VesselInfo {
  if (typeof window === 'undefined') return defaultVesselInfo();
  try {
    const raw = localStorage.getItem(VESSEL_KEY);
    return raw ? { ...defaultVesselInfo(), ...JSON.parse(raw) } : defaultVesselInfo();
  } catch { return defaultVesselInfo(); }
}

export function saveVesselInfo(info: VesselInfo) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VESSEL_KEY, JSON.stringify(info));
}

function defaultVesselInfo(): VesselInfo {
  return {
    // Company
    company_name: '',
    po_number: '',
    // Billing contact
    contact_name: '',
    phone: '',
    email: '',
    // Vessel
    vessel_name: '',
    vessel_type: '',
    vessel_type_other: '',
    captain_name: '',
    captain_phone: '',
    vessel_email: '',
    // Order contact
    order_contact_name: '',
    order_contact_title: '',
    order_contact_phone: '',
    order_contact_email: '',
    // Primary delivery
    terminal_name: '',
    arrival_date: '',
    arrival_time: '',
    delivery_method: '',
    approach_side: '',
    vhf_channel: '',
    // Secondary delivery
    secondary_terminal_name: '',
    secondary_arrival_date: '',
    secondary_arrival_time: '',
    secondary_delivery_method: '',
    // Crew change
    crew_change: false,
    crew_arriving: '',
    crew_departing: '',
    // Notes
    notes: '',
    // Legacy
    eta: '',
  };
}

// ── Additional services ───────────────────────────────────────

export function getAdditionalServices(): AdditionalServices {
  if (typeof window === 'undefined') return defaultServices();
  try {
    const raw = localStorage.getItem(SERVICES_KEY);
    return raw ? { ...defaultServices(), ...JSON.parse(raw) } : defaultServices();
  } catch { return defaultServices(); }
}

export function saveAdditionalServices(services: AdditionalServices) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SERVICES_KEY, JSON.stringify(services));
  window.dispatchEvent(new CustomEvent('cart-updated'));
}

export function clearAdditionalServices() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SERVICES_KEY);
  window.dispatchEvent(new CustomEvent('cart-updated'));
}

export function getActiveServicesCount(services: AdditionalServices): number {
  return (services.parts_pickup.enabled ? 1 : 0)
       + (services.package_delivery.enabled ? 1 : 0);
}

function defaultServices(): AdditionalServices {
  return {
    parts_pickup: {
      enabled: false,
      pickup_location: '',
      order_number: '',
      contact_name: '',
      contact_phone: '',
    },
    package_delivery: {
      enabled: false,
      description: '',
      origin: '',
      contact_name: '',
      contact_phone: '',
    },
  };
}
