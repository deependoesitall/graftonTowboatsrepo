// src/lib/admin-auth.ts
//
// Client-side helpers for admin role-based UI gating.
//
// SECURITY NOTE: Authentication is handled entirely via an httpOnly,
// Secure, SameSite=Strict session cookie set by /api/admin/auth — it is
// never readable or storable by client-side JS. The values cached here
// (role, display name, username) are NON-SECRET UI HINTS ONLY, used to
// show/hide nav items and labels for a smoother UX. Every admin API
// route independently re-verifies the session cookie and re-checks role
// permissions server-side (see src/lib/admin-auth-server.ts), so a user
// tampering with these client-side values cannot gain access to
// anything the server wouldn't otherwise allow.

export type AdminRole = 'owner' | 'manager' | 'staff';

const ADMIN_ROLE_KEY = 'grafton_admin_role';
const ADMIN_NAME_KEY = 'grafton_admin_name';
const ADMIN_USERNAME_KEY = 'grafton_admin_username';

export function getAdminRole(): AdminRole | null {
  if (typeof window === 'undefined') return null;
  const r = sessionStorage.getItem(ADMIN_ROLE_KEY);
  if (r === 'owner' || r === 'manager' || r === 'staff') return r;
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

/** Cache non-secret UI hints after a successful login. The session cookie itself is set by the server. */
export function setAdminUiState(role: AdminRole, displayName: string, username?: string) {
  sessionStorage.setItem(ADMIN_ROLE_KEY, role);
  sessionStorage.setItem(ADMIN_NAME_KEY, displayName);
  sessionStorage.setItem(ADMIN_USERNAME_KEY, username || 'admin');
}

export function clearAdminUiState() {
  sessionStorage.removeItem(ADMIN_ROLE_KEY);
  sessionStorage.removeItem(ADMIN_NAME_KEY);
  sessionStorage.removeItem(ADMIN_USERNAME_KEY);
}

// Permission matrix — for UI show/hide only. The server enforces its own
// authoritative copy of this matrix on every request
// (see canAccess/canEdit in src/lib/admin-auth-server.ts).
export function canAccess(role: AdminRole | null, area: 'orders' | 'products' | 'settings' | 'reports' | 'logs'): boolean {
  if (!role) return false;
  if (role === 'owner') return true; // owner has access to everything, including reports & logs
  if (role === 'manager') return area === 'orders' || area === 'products';
  if (role === 'staff') return area === 'orders';
  return false;
}

// Can the role modify data in this area, or only view?
export function canEdit(role: AdminRole | null, area: 'orders' | 'products' | 'settings'): boolean {
  if (!role) return false;
  if (role === 'owner') return true;
  if (role === 'manager') return area === 'orders' || area === 'products';
  if (role === 'staff') return area === 'orders'; // staff can edit order status
  return false;
}

/**
 * Standard headers/options for authenticated admin API requests.
 *
 * Replaces the old token-based `adminHeaders()`. The session cookie is
 * sent automatically by the browser via `credentials: 'include'` — no
 * secret token is attached here. The x-admin-* headers below are
 * NON-SECRET display hints only (used for activity log display names);
 * the server derives the *authoritative* identity from the verified
 * session cookie and ignores these for authorization decisions.
 */
export function adminHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'x-admin-username': getAdminUsername(),
    'x-admin-name': getAdminName(),
    'x-admin-role': getAdminRole() || '',
    ...extra,
  };
}

/** fetch() wrapper that always sends the admin session cookie. */
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

/** Call the logout endpoint (clears the server-side cookie) and clear local UI state. */
export async function logoutAdmin(): Promise<void> {
  try {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
  } finally {
    clearAdminUiState();
  }
}

/**
 * Check whether a valid admin session cookie exists. If so, caches the
 * role/display info for UI use and returns it; otherwise returns null
 * and clears any stale local UI state.
 */
export async function fetchAdminSession(): Promise<{ role: AdminRole; display_name: string; username: string } | null> {
  const res = await fetch('/api/admin/me', { credentials: 'include' });
  if (!res.ok) {
    clearAdminUiState();
    return null;
  }
  const data = await res.json();
  setAdminUiState(data.role, data.display_name, data.username);
  return data;
}
