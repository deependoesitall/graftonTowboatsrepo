// src/lib/admin-auth.ts
//
// Client-side admin auth helpers.
//
// SESSION MODEL:
//   • Stay signed in OFF (default was die-on-close): JWT in sessionStorage —
//     survives refresh, cleared when the tab/PWA is closed.
//   • Stay signed in ON (checkbox default): JWT in localStorage + httpOnly
//     cookie on the server (30d). Closing the phone app keeps you signed in.
//
// The token is sent on every admin API call as
// `Authorization: Bearer <jwt>`. The server independently verifies the
// JWT signature and re-checks role permissions on every request (see
// src/lib/admin-auth-server.ts), so this token grants exactly what the
// server allows for that role — nothing client-side tampering can expand.

/**
 * Roles span TWO ORGANISATIONS, not one ladder.
 *
 *   owner        — Grafton Towboat. Everything.
 *   gts_manager  — Grafton Towboat. Orders, products, settings, PLUS the
 *                  delivery rate cards, barge lines and customer billing
 *                  terms GTS negotiates with the boat companies.
 *   manager      — SINCLAIR'S Manager. Products, orders, weekly ad, coupons.
 *                  Unchanged, and deliberately so: this is the existing store
 *                  role and Dave's team already uses it.
 *   staff        — Sinclair's floor staff. Orders only.
 *
 * gts_manager is NOT "manager plus extras" — the split is a confidentiality
 * boundary between two businesses, not a seniority ladder. What Sinclair's
 * must never see is what GTS charges its own customers to deliver.
 */
export type AdminRole = 'owner' | 'gts_manager' | 'manager' | 'staff';

/** Grafton Towboat side? Gates GTS-only commercial UI (delivery terms, rates). */
export function isGtsRole(role: AdminRole | null): boolean {
  return role === 'owner' || role === 'gts_manager';
}
export type AdminPermission = 'sinclair';

const ADMIN_TOKEN_KEY = 'grafton_admin_token';
const ADMIN_ROLE_KEY = 'grafton_admin_role';
const ADMIN_NAME_KEY = 'grafton_admin_name';
const ADMIN_USERNAME_KEY = 'grafton_admin_username';
const ADMIN_PERMISSIONS_KEY = 'grafton_admin_permissions';
const ADMIN_REMEMBER_KEY = 'grafton_admin_remember';

function readKey(key: string): string | null {
  if (typeof window === 'undefined') return null;
  // Prefer localStorage (remembered), then sessionStorage (this tab only).
  return localStorage.getItem(key) ?? sessionStorage.getItem(key);
}

/** Which store currently holds the session — for in-place UI hint updates. */
function activeStore(): Storage {
  if (localStorage.getItem(ADMIN_TOKEN_KEY)) return localStorage;
  return sessionStorage;
}

/** Read the stored admin JWT, or null if not logged in. */
export function getAdminToken(): string | null {
  return readKey(ADMIN_TOKEN_KEY);
}

export function getAdminRole(): AdminRole | null {
  const r = readKey(ADMIN_ROLE_KEY);
  if (r === 'owner' || r === 'gts_manager' || r === 'manager' || r === 'staff') return r;
  return null;
}

export function getAdminName(): string {
  return readKey(ADMIN_NAME_KEY) || '';
}

export function getAdminUsername(): string {
  return readKey(ADMIN_USERNAME_KEY) || '';
}

export function getAdminPermissions(): AdminPermission[] {
  try {
    return JSON.parse(readKey(ADMIN_PERMISSIONS_KEY) || '[]');
  } catch { return []; }
}

export function hasAdminPermission(permission: AdminPermission): boolean {
  return getAdminPermissions().includes(permission);
}

/**
 * Store the JWT and non-secret UI hints after a successful login.
 * `remember` true → localStorage (survives close); false → sessionStorage only.
 */
export function setAdminSession(
  token: string,
  role: AdminRole,
  displayName: string,
  username?: string,
  permissions?: AdminPermission[],
  remember: boolean = true,
) {
  // Avoid leaving a stale copy in the other store.
  clearAdminUiState();
  const store = remember ? localStorage : sessionStorage;
  store.setItem(ADMIN_TOKEN_KEY, token);
  store.setItem(ADMIN_ROLE_KEY, role);
  store.setItem(ADMIN_NAME_KEY, displayName);
  store.setItem(ADMIN_USERNAME_KEY, username || 'admin');
  store.setItem(ADMIN_PERMISSIONS_KEY, JSON.stringify(permissions ?? []));
  if (remember) localStorage.setItem(ADMIN_REMEMBER_KEY, '1');
}

/** @deprecated kept for backwards compatibility — use setAdminSession */
export function setAdminUiState(role: AdminRole, displayName: string, username?: string) {
  const store = activeStore();
  store.setItem(ADMIN_ROLE_KEY, role);
  store.setItem(ADMIN_NAME_KEY, displayName);
  store.setItem(ADMIN_USERNAME_KEY, username || 'admin');
}

export function clearAdminUiState() {
  if (typeof window === 'undefined') return;
  for (const store of [sessionStorage, localStorage]) {
    store.removeItem(ADMIN_TOKEN_KEY);
    store.removeItem(ADMIN_ROLE_KEY);
    store.removeItem(ADMIN_NAME_KEY);
    store.removeItem(ADMIN_USERNAME_KEY);
    store.removeItem(ADMIN_PERMISSIONS_KEY);
  }
  localStorage.removeItem(ADMIN_REMEMBER_KEY);
}

// Permission matrix — for UI show/hide only. The server enforces its own
// authoritative copy of this matrix on every request.
export function canAccess(role: AdminRole | null, area: 'orders' | 'products' | 'settings' | 'reports' | 'logs' | 'customers'): boolean {
  if (!role) return false;
  if (role === 'owner') return true;
  // GTS manager: everything the Sinclair's manager gets, plus 'reports' —
  // the Deliveries ledger and rate cards live there.
  if (role === 'gts_manager') return area !== 'logs';
  if (role === 'manager') return area === 'orders' || area === 'products' || area === 'settings' || area === 'customers';
  if (role === 'staff') return area === 'orders';
  return false;
}

export function canEdit(role: AdminRole | null, area: 'orders' | 'products' | 'settings'): boolean {
  if (!role) return false;
  if (role === 'owner') return true;
  if (role === 'gts_manager') return area === 'orders' || area === 'products' || area === 'settings';
  if (role === 'manager') return area === 'orders' || area === 'products';
  if (role === 'staff') return area === 'orders';
  return false;
}

/**
 * Standard headers for authenticated admin API requests.
 */
export function adminHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getAdminToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'x-admin-username': getAdminUsername(),
    'x-admin-name': getAdminName(),
    'x-admin-role': getAdminRole() || '',
    ...extra,
  };
}

/** fetch() wrapper that always sends the admin auth token. */
export function adminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: 'include',
    headers: {
      ...adminHeaders(),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

/** Log out: clear cookie + every client store. */
export async function logoutAdmin(): Promise<void> {
  try {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
  } finally {
    clearAdminUiState();
  }
}

/**
 * Check whether a valid admin session exists. If so, caches the role/display
 * info for UI use and returns it; otherwise returns null and clears any stale
 * local state.
 *
 * Tries Bearer from storage first; if storage is empty, still probes `/me`
 * with credentials so a remembered httpOnly cookie can rehydrate the UI.
 */
export async function fetchAdminSession(): Promise<{ role: AdminRole; display_name: string; username: string; permissions: AdminPermission[] } | null> {
  const token = getAdminToken();

  const res = await fetch('/api/admin/me', {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    clearAdminUiState();
    return null;
  }

  const data = await res.json();
  const permissions: AdminPermission[] = data.permissions ?? [];

  // Cookie-only recovery (storage empty but cookie still valid): keep UI hints
  // in localStorage so the next paint has a role without forcing a re-login.
  // Bearer stays absent until the next full login — adminFetch still sends
  // credentials:'include', and the server accepts the cookie.
  if (!token) {
    localStorage.setItem(ADMIN_ROLE_KEY, data.role);
    localStorage.setItem(ADMIN_NAME_KEY, data.display_name);
    localStorage.setItem(ADMIN_USERNAME_KEY, data.username);
    localStorage.setItem(ADMIN_PERMISSIONS_KEY, JSON.stringify(permissions));
    localStorage.setItem(ADMIN_REMEMBER_KEY, '1');
  } else {
    setAdminUiState(data.role, data.display_name, data.username);
    activeStore().setItem(ADMIN_PERMISSIONS_KEY, JSON.stringify(permissions));
  }

  return { ...data, permissions };
}
