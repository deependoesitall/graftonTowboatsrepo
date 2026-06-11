'use client';
// src/lib/cart.ts
import { CartItem, VesselInfo } from '@/types';

const CART_KEY = 'grafton_cart';
const VESSEL_KEY = 'grafton_vessel_info';

export function getCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    // Defensive: handle legacy/malformed { items: [...] } shape
    if (parsed && Array.isArray(parsed.items)) return parsed.items;
    return [];
  } catch {
    return [];
  }
}

export function saveCart(items: CartItem[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('cart-updated'));
}

export function addToCart(item: CartItem) {
  const cart = getCart();
  const idx = cart.findIndex(i => i.product_id === item.product_id);
  if (idx >= 0) {
    cart[idx].quantity += item.quantity;
  } else {
    cart.push(item);
  }
  saveCart(cart);
}

export function updateCartItem(product_id: string, quantity: number) {
  const cart = getCart();
  if (quantity <= 0) {
    saveCart(cart.filter(i => i.product_id !== product_id));
    return;
  }
  const idx = cart.findIndex(i => i.product_id === product_id);
  if (idx >= 0) {
    cart[idx].quantity = quantity;
    saveCart(cart);
  }
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

export function getVesselInfo(): VesselInfo {
  if (typeof window === 'undefined') return defaultVesselInfo();
  try {
    const raw = localStorage.getItem(VESSEL_KEY);
    return raw ? { ...defaultVesselInfo(), ...JSON.parse(raw) } : defaultVesselInfo();
  } catch {
    return defaultVesselInfo();
  }
}

export function saveVesselInfo(info: VesselInfo) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VESSEL_KEY, JSON.stringify(info));
}

function defaultVesselInfo(): VesselInfo {
  return {
    company_name: '',
    contact_name: '',
    phone: '',
    po_number: '',
    notes: '',
    eta: '',
  };
}
