// src/lib/admin-auth-server.ts
// Server-side admin session verification and role-based access control
// (RBAC). This is the SINGLE SOURCE OF TRUTH for admin authorization.
//
// Sessions are JWTs signed with ADMIN_SECRET_KEY (HS256). The token is
// returned to the client on login and stored in sessionStorage (cleared
// automatically when the tab/window is closed — true "close tab = log
// out" behavior). The client sends it back as `Authorization: Bearer
// <jwt>` on every admin API call. A legacy httpOnly cookie is still
// accepted as a fallback.
//
// SESSION LIFETIME: 8 hours server-side as a backstop — in practice the
// session ends whenever the tab is closed (sessionStorage is cleared),
// not because of this expiry.

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

export type AdminRole = 'owner' | 'manager' | 'staff';
export type AdminPermission = 'sinclair';
export type Area = 'orders' | 'products' | 'settings' | 'reports' | 'logs';

export const SESSION_COOKIE = 'gts_admin_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hour backstop; sessionStorage clearing on tab close is the real boundary

export interface AdminSessionPayload {
  sub: string;          // admin_users.id, or 'admin' for legacy single-password login
  username: string;
  role: AdminRole;
  display_name: string;
  permissions: AdminPermission[];  // additive capability flags, e.g. ['sinclair']
}

/** Returns true if the session has the given permission flag. */
export function hasPermission(session: AdminSessionPayload, permission: AdminPermission): boolean {
  return (session.permissions ?? []).includes(permission);
}

function getSecret(): string {
  const secret = process.env.ADMIN_SECRET_KEY;
  if (!secret || secret.length < 16) {
    throw new Error(
      'ADMIN_SECRET_KEY is not set or too short (min 16 chars). Generate one with `openssl rand -hex 32` and set it in your environment variables.'
    );
  }
  return secret;
}

/** Sign a new admin session JWT. */
export function signAdminSession(payload: AdminSessionPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: SESSION_TTL_SECONDS });
}

/** Verify and decode an admin session JWT. Returns null if invalid/expired/malformed. */
export function verifyAdminSession(token: string): AdminSessionPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret());
    if (typeof decoded === 'string') return null;
    const { sub, username, role, display_name, permissions } = decoded as Record<string, unknown>;
    if (
      typeof sub === 'string' &&
      typeof username === 'string' &&
      typeof role === 'string' &&
      typeof display_name === 'string' &&
      (role === 'owner' || role === 'manager' || role === 'staff')
    ) {
      // permissions may be absent in tokens issued before this migration — default to []
      const perms: AdminPermission[] = Array.isArray(permissions)
        ? (permissions as string[]).filter((p): p is AdminPermission => p === 'sinclair')
        : [];
      return { sub, username, role, display_name, permissions: perms };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Read and verify the admin session.
 *
 * Checks, in order:
 *  1. `Authorization: Bearer <jwt>` header
 *  2. The legacy httpOnly session cookie — kept as a fallback
 */
export function getAdminSession(req: NextRequest): AdminSessionPayload | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    const session = verifyAdminSession(token);
    if (session) return session;
  }

  const cookieToken = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookieToken) return verifyAdminSession(cookieToken);

  return null;
}

/** Cookie options used when setting/refreshing the session cookie. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}

/** Cookie options used to clear the session cookie at logout. */
export function clearedCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 0,
  };
}

// ----- Permission matrix (server-enforced) -----

export function canAccess(role: AdminRole, area: Area): boolean {
  if (role === 'owner') return true;
  if (role === 'manager') return area === 'orders' || area === 'products' || area === 'settings';
  if (role === 'staff') return area === 'orders';
  return false;
}

export function canEdit(role: AdminRole, area: 'orders' | 'products' | 'settings'): boolean {
  if (role === 'owner') return true;
  if (role === 'manager') return area === 'orders' || area === 'products';
  if (role === 'staff') return area === 'orders';
  return false;
}

/**
 * Verify the admin session and (optionally) enforce an area/role requirement.
 *
 * Returns either the verified session payload, or a NextResponse
 * (401 Unauthorized / 403 Forbidden) that the caller should return immediately.
 */
export function requireAdmin(
  req: NextRequest,
  options?: { area?: Area; editRequired?: boolean; ownerOnly?: boolean }
): AdminSessionPayload | NextResponse {
  const session = getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (options?.ownerOnly && session.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (options?.area) {
    const allowed = options.editRequired
      ? canEdit(session.role, options.area as 'orders' | 'products' | 'settings')
      : canAccess(session.role, options.area);
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  return session;
}
