// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// src/lib/supabase/server.ts — kept inline here for single-file delivery
// Import { createServerClient, type CookieOptions } from '@supabase/ssr'
// Use in Server Components / Route Handlers as shown below
