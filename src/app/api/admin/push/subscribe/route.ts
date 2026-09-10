// src/app/api/admin/push/subscribe/route.ts
//
// Register / remove a device for order notifications. ADMIN SESSION REQUIRED.
//
// The session is the whole security model here. A push endpoint is a
// capability: whoever holds it, plus our VAPID keys, can make that device
// buzz. So a row is only ever written for a caller who already proved they're
// staff, and the owning user id comes from the SIGNED TOKEN — never from the
// request body, which the caller controls.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, isSinclairScoped } from '@/lib/admin-auth-server';

export const dynamic = 'force-dynamic';

const Body = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

/**
 * The caller's OWN devices. Never anyone else's.
 *
 * Scoped to session.sub rather than taking a user id — a staff member can see
 * and revoke the phones they've enabled and nothing more. Managing other
 * people's devices is an owner-level job that would need its own route and its
 * own thinking about who's allowed to silence whom.
 */
export async function GET(req: NextRequest) {
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, user_agent, created_at, last_sent_at, expired_at')
    .eq('admin_user_id', session.sub)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The endpoint is returned so the browser can identify which row is the
  // device currently being used ("This device"). Safe: it's the caller's own
  // endpoint, which their browser already holds.
  return NextResponse.json({ devices: data ?? [] });
}

export async function POST(req: NextRequest) {
  // Any signed-in staff member may subscribe. No area gate: a shopper who can
  // only see orders is exactly who most needs to know an order arrived.
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid subscription.' }, { status: 400 });
  }
  const { endpoint, keys } = parsed.data;

  const supabase = createServiceClient();

  // UPSERT ON endpoint, NOT insert.
  //
  // Browsers re-subscribe on their own schedule — after an update, a permission
  // re-grant, or a push-service key rotation — and hand back the same endpoint.
  // Inserting would accumulate duplicate rows and the same person would get the
  // same notification three or four times, which is how staff turn
  // notifications off entirely.
  //
  // Re-upserting also refreshes role/is_sinclair, so someone whose permissions
  // changed starts receiving the right fan-out without touching their phone.
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      admin_user_id: session.sub,
      role: session.role,
      is_sinclair: isSinclairScoped(session),
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: (req.headers.get('user-agent') || '').slice(0, 300),
      expired_at: null,   // a device coming back is alive again
    }, { onConflict: 'endpoint' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;

  // Either identifier works. `endpoint` is what the device itself knows;
  // `id` is what the settings list uses to switch off a phone you aren't
  // currently holding — a lost handset, or a shopper who's left.
  const { endpoint, id } = await req.json().catch(() => ({ endpoint: '', id: '' }));
  if (!endpoint && !id) {
    return NextResponse.json({ error: 'Missing endpoint or id' }, { status: 400 });
  }

  const supabase = createServiceClient();
  // ALWAYS scoped to the caller's own admin_user_id as well. Without it, a
  // guessed or leaked id would let one staff member silence another's phone —
  // and silently, since nothing on the victim's device would indicate it.
  let q = supabase.from('push_subscriptions').delete().eq('admin_user_id', session.sub);
  q = id ? q.eq('id', id) : q.eq('endpoint', endpoint);
  const { error } = await q;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
