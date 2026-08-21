// src/lib/admin-auth.ts
//
// Client-side admin auth helpers.
//
// SESSION MODEL: on login, the server returns a signed JWT, which is
// stored in sessionStorage. sessionStorage is automatically cleared
// when the tab/window is closed, giving simple "logged in until the
// tab is closed" behavior — refreshing the page keeps you logged in
// (sessionStorage survives reloads), but closing the tab requires
// logging in again.
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

/** Read the stored admin JWT, or null if not logged in (or tab was closed/reopened). */
export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function getAdminRole(): AdminRole | null {
  if (typeof window === 'undefined') return null;
  const r = sessionStorage.getItem(ADMIN_ROLE_KEY);
  if (r === 'owner' || r === 'gts_manager' || r === 'manager' || r === 'staff') return r;
  return null;
}

export function getAdminName(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(ADMIN_NAME_KEY) || '';
}

export function getAdminUsername(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(ADMIN_USERNAME_KEY) || '';
}

export function getAdminPermissions(): AdminPermission[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(sessionStorage.getItem(ADMIN_PERMISSIONS_KEY) || '[]');
  } catch { return []; }
}

export function hasAdminPermission(permission: AdminPermission): boolean {
  return getAdminPermissions().includes(permission);
}

/** Store the JWT and non-secret UI hints after a successful login. */
export function setAdminSession(token: string, role: AdminRole, displayName: string, username?: string, permissions?: AdminPermission[]) {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  sessionStorage.setItem(ADMIN_ROLE_KEY, role);
  sessionStorage.setItem(ADMIN_NAME_KEY, displayName);
  sessionStorage.setItem(ADMIN_USERNAME_KEY, username || 'admin');
  sessionStorage.setItem(ADMIN_PERMISSIONS_KEY, JSON.stringify(permissions ?? []));
}

/** @deprecated kept for backwards compatibility — use setAdminSession */
export function setAdminUiState(role: AdminRole, displayName: string, username?: string) {
  sessionStorage.setItem(ADMIN_ROLE_KEY, role);
  sessionStorage.setItem(ADMIN_NAME_KEY, displayName);
  sessionStorage.setItem(ADMIN_USERNAME_KEY, username || 'admin');
}

export function clearAdminUiState() {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_ROLE_KEY);
  sessionStorage.removeItem(ADMIN_NAME_KEY);
  sessionStorage.removeItem(ADMIN_USERNAME_KEY);
  sessionStorage.removeItem(ADMIN_PERMISSIONS_KEY);
}

// Permission matrix — for UI show/hide only. The server enforces its own
// authoritative copy of this matrix on every request.
export function canAccess(role: AdminRole | null, area: 'orders' | 'products' | 'settings' | 'reports' | 'logs'): boolean {
  if (!role) return false;
  if (role === 'owner') return true;
  // GTS manager: everything the Sinclair's manager gets, plus 'reports' —
  // the Deliveries ledger and rate cards live there.
  if (role === 'gts_manager') return area !== 'logs';
  if (role === 'manager') return area === 'orders' || area === 'products' || area === 'settings';
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

/** Log out: clear the token from sessionStorage. */
export async function logoutAdmin(): Promise<void> {
  try {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
  } finally {
    clearAdminUiState();
  }
}

/**
 * Check whether a valid admin session exists for this tab. If so, caches
 * the role/display info for UI use and returns it; otherwise returns
 * null and clears any stale local state.
 */
export async function fetchAdminSession(): Promise<{ role: AdminRole; display_name: string; username: string; permissions: AdminPermission[] } | null> {
  const token = getAdminToken();
  if (!token) {
    clearAdminUiState();
    return null;
  }

  const res = await adminFetch('/api/admin/me');
  if (!res.ok) {
    clearAdminUiState();
    return null;
  }
  const data = await res.json();
  setAdminUiState(data.role, data.display_name, data.username);
  sessionStorage.setItem(ADMIN_PERMISSIONS_KEY, JSON.stringify(data.permissions ?? []));
  return { ...data, permissions: data.permissions ?? [] };
}
