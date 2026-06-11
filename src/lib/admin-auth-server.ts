// src/lib/admin-auth-server.ts
// Server-side admin session verification and role-based access control
// (RBAC). This is the SINGLE SOURCE OF TRUTH for admin authorization.
//
// Sessions are JWTs signed with ADMIN_SECRET_KEY (HS256), stored in an
// httpOnly, Secure, SameSite=Strict cookie. The token is never exposed
// to client-side JS — only this server-side helper reads it.

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

export type AdminRole = 'owner' | 'manager' | 'staff';
export type Area = 'orders' | 'products' | 'settings' | 'reports' | 'logs';

export const SESSION_COOKIE = 'gts_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 10; // 10 hours

export interface AdminSessionPayload {
  sub: string;          // admin_users.id, or 'admin' for legacy single-password login
  username: string;
  role: AdminRole;
  display_name: string;
}

function getSecret(): string {
  const secret = process.env.ADMIN_SECRET_KEY;
  if (!secret || secret.length < 16) {
    // Fail loudly server-side; never leak this detail to the client.
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
    const { sub, username, role, display_name } = decoded as Record<string, unknown>;
    if (
      typeof sub === 'string' &&
      typeof username === 'string' &&
      typeof role === 'string' &&
      typeof display_name === 'string' &&
      (role === 'owner' || role === 'manager' || role === 'staff')
    ) {
      return { sub, username, role, display_name };
    }
    return null;
  } catch {
    return null;
  }
}

/** Read and verify the admin session from the request's cookies. */
export function getAdminSession(req: NextRequest): AdminSessionPayload | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyAdminSession(token);
}

/** Cookie options used when setting the session cookie at login.
 * No maxAge -> this becomes a browser "session cookie": it is cleared
 * automatically when the browser/tab is fully closed, so each new
 * visit to /admin requires logging in again. The JWT itself still
 * carries a 10-hour expiry as a server-side backstop. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
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
  if (role === 'manager') return area === 'orders' || area === 'products';
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
 * Usage in an API route:
 *
 *   const session = requireAdmin(req, { area: 'products', editRequired: true });
 *   if (session instanceof NextResponse) return session; // 401 / 403
 *   // ... session.role, session.username, session.display_name available
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
