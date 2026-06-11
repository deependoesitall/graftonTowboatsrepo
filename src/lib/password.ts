// src/lib/password.ts
// Password hashing using bcrypt (per-password random salt baked into the
// hash, adaptive cost factor). Replaces the old SHA-256 + hardcoded salt.
//
// MIGRATION PATH FOR EXISTING ADMIN USERS:
// Existing rows in `admin_users.password_hash` and
// `admin_settings.admin_password_hash` contain SHA-256 hex digests
// (64 hex characters) produced by the old `sha256(password + 'gts-salt-2024')`
// scheme. `verifyPassword()` detects this format and verifies against it
// using the legacy algorithm ONE TIME. The auth route (`/api/admin/auth`)
// then immediately re-hashes the password with bcrypt and persists the new
// hash, so every existing account is transparently upgraded the next time
// that user logs in — no forced reset email or manual migration step needed.
// New hashes are always bcrypt (60 chars, starting with `$2`).

import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** Verify a password against a hash, supporting both bcrypt and legacy SHA-256 hashes. */
export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;

  if (isLegacyHash(hash)) {
    const { createHash } = await import('crypto');
    const legacyHash = createHash('sha256').update(password + 'gts-salt-2024').digest('hex');
    return legacyHash === hash;
  }

  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/** True if `hash` is an old SHA-256 hex digest (64 hex chars) that should be upgraded. */
export function isLegacyHash(hash: string | null | undefined): boolean {
  return !!hash && /^[a-f0-9]{64}$/i.test(hash);
}
