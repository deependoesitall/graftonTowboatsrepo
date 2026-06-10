// src/lib/admin-auth.ts
// Shared helpers for admin role-based access control

export const ADMIN_TOKEN_KEY = 'grafton_admin_token';
export const ADMIN_ROLE_KEY = 'grafton_admin_role';
export const ADMIN_NAME_KEY = 'grafton_admin_name';

export type AdminRole = 'owner' | 'manager' | 'staff';

export function getAdminRole(): AdminRole | null {
  if (typeof window === 'undefined') return null;
  const r = sessionStorage.getItem(ADMIN_ROLE_KEY);
  if (r === 'owner' || r === 'manager' || r === 'staff') return r;
  return null;
}

export function getAdminToken(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

export function getAdminName(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(ADMIN_NAME_KEY) || '';
}

export function setAdminSession(token: string, role: AdminRole, displayName: string) {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  sessionStorage.setItem(ADMIN_ROLE_KEY, role);
  sessionStorage.setItem(ADMIN_NAME_KEY, displayName);
}

export function clearAdminSession() {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_ROLE_KEY);
  sessionStorage.removeItem(ADMIN_NAME_KEY);
}

// Permission matrix
export function canAccess(role: AdminRole | null, area: 'orders' | 'products' | 'settings'): boolean {
  if (!role) return false;
  if (role === 'owner') return true;
  if (role === 'manager') return area === 'orders' || area === 'products';
  if (role === 'staff') return area === 'orders';
  return false;
}

// Can the role modify data in this area, or only view?
export function canEdit(role: AdminRole | null, area: 'orders' | 'products' | 'settings'): boolean {
  if (!role) return false;
  if (role === 'owner') return true;
  if (role === 'manager') return area === 'orders' || area === 'products';
  if (role === 'staff') return false; // staff = read-only on orders
  return false;
}
