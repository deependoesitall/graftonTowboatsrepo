// src/lib/boat-cart-sync.ts
//
// Keeps localStorage cart in sync with the boat's shared cart so two cooks
// on Scott Noble build one grocery list. Guest shoppers (no login) stay
// local-only.

'use client';

import { getCart, saveCart, getVesselInfo, saveVesselInfo } from '@/lib/cart';
import { createClient } from '@/lib/supabase/client';
import type { CartItem } from '@/types';

let started = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushing = false;
let pulling = false;
const removedIds = new Set<string>();
let lastPushedJson = '';

async function bearer(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

async function api(method: 'GET' | 'PUT', body?: unknown) {
  const token = await bearer();
  if (!token) return null;
  const vessel = getVesselInfo().vessel_name || '';
  const url = method === 'GET'
    ? `/api/customer/boat-cart?vessel=${encodeURIComponent(vessel)}`
    : '/api/customer/boat-cart';
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 || res.status === 400) return null;
  if (!res.ok) return null;
  return res.json();
}

function mergeItems(server: CartItem[], local: CartItem[]): CartItem[] {
  const byId = new Map<string, CartItem>();
  for (const it of server) {
    const id = String(it.product_id || '');
    if (id && !removedIds.has(id)) byId.set(id, { paid_by: 'vessel', cod_name: '', ...it });
  }
  for (const it of local) {
    const id = String(it.product_id || '');
    if (id) byId.set(id, it);
  }
  return Array.from(byId.values());
}

async function pull() {
  const data = await api('GET');
  if (!data?.vessel_id) return;
  const serverItems: CartItem[] = Array.isArray(data.items) ? data.items : [];
  const local = getCart();
  const merged = mergeItems(serverItems, local);
  const next = JSON.stringify(merged);
  if (next !== JSON.stringify(local)) {
    pulling = true;
    saveCart(merged);
    pulling = false;
  }
  if (data.vessel_info && typeof data.vessel_info === 'object') {
    const cur = getVesselInfo();
    if (!cur.vessel_name && data.vessel_info.vessel_name) {
      saveVesselInfo({ ...cur, ...data.vessel_info });
    }
  }
}

async function push(replace = false) {
  if (pushing) return;
  const items = getCart();
  const json = JSON.stringify(items);
  if (!replace && json === lastPushedJson) return;
  pushing = true;
  try {
    if (!replace) await pull();
    const payload = {
      items: getCart(),
      vessel_name: getVesselInfo().vessel_name,
      vessel_info: getVesselInfo(),
      replace: true,
    };
    const data = await api('PUT', payload);
    if (data?.items) {
      lastPushedJson = JSON.stringify(data.items);
      removedIds.clear();
    }
  } finally {
    pushing = false;
  }
}

function onCartUpdated() {
  if (pulling) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { void push(false); }, 700);
}

function onItemRemoved(e: Event) {
  const id = (e as CustomEvent).detail?.product_id;
  if (id) removedIds.add(String(id));
}

function onBoatClear() {
  if (pushTimer) clearTimeout(pushTimer);
  void clearBoatCart();
}

export function startBoatCartSync() {
  if (typeof window === 'undefined' || started) return;
  started = true;
  window.addEventListener('cart-updated', onCartUpdated);
  window.addEventListener('cart-item-removed', onItemRemoved);
  window.addEventListener('boat-cart-clear', onBoatClear);
  void pull();
  pollTimer = setInterval(() => { void pull(); }, 8000);
}

export function stopBoatCartSync() {
  started = false;
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  if (typeof window !== 'undefined') {
    window.removeEventListener('cart-updated', onCartUpdated);
    window.removeEventListener('cart-item-removed', onItemRemoved);
    window.removeEventListener('boat-cart-clear', onBoatClear);
  }
}

export async function clearBoatCart() {
  removedIds.clear();
  await push(true);
}
