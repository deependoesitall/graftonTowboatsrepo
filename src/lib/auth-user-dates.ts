// src/lib/auth-user-dates.ts
//
// Every customer account Supabase Auth knows about, with when it was made and
// when it last signed in. Server only (service role).
import { createServiceClient } from '@/lib/supabase/server';

export type AuthUserRow = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  provider: string | null;
};

export async function listAuthUsers(supabase: ReturnType<typeof createServiceClient>): Promise<AuthUserRow[]> {
  const out: AuthUserRow[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const users = data?.users || [];
    for (const u of users) {
      out.push({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        provider: (u.app_metadata as { provider?: string } | undefined)?.provider ?? null,
      });
    }
    if (users.length < 1000) break;
  }
  return out;
}
