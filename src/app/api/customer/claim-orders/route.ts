// src/app/api/customer/claim-orders/route.ts
// POST: After a guest creates an account, link their previous guest orders to their new user_id.
// Matches on customer_email — the email entered at checkout must equal the signup email.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createClient as createSupabaseJs } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const anonClient = createSupabaseJs(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const userId = data.user.id;
  const email = data.user.email?.toLowerCase();

  if (!email) {
    return NextResponse.json({ error: 'No email on account' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: updated, error: updateError } = await supabase
    .from('orders')
    .update({ user_id: userId })
    .eq('customer_email', email)
    .is('user_id', null)
    .select('id');

  if (updateError) {
    console.error('claim-orders error:', updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ claimed: updated?.length ?? 0 });
}
