// src/lib/email-access.ts
// Who may build, send and see stats for list emails: Grafton Towboat
// Services' own people (Owner, GTS Manager). Never Sinclair's: not their
// Manager or staff, and not a GTS account flagged for the Sinclair view.
// Shared by the server gate and the nav, so both say the same thing.
export function canUseEmails(role: string | null | undefined, permissions?: readonly string[] | null): boolean {
  if (role !== 'owner' && role !== 'gts_manager') return false;
  return !(permissions || []).includes('sinclair');
}
