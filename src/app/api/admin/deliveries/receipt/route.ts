// src/app/api/admin/deliveries/[nothing] — Sinclair's receipt for a delivery
// POST   — upload/replace (multipart: file, delivery_id)
// DELETE — remove ({ delivery_id })
// Stored in the shared 'order-documents' bucket under deliveries/<id>/.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

const BUCKET = 'order-documents';
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports', editRequired: true });
  if (session instanceof NextResponse) return session;

  let file: File | null = null;
  let deliveryId = '';
  try {
    const form = await req.formData();
    file = form.get('file') as File | null;
    deliveryId = (form.get('delivery_id') as string) || '';
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }
  if (!deliveryId) return NextResponse.json({ error: 'Missing delivery_id' }, { status: 400 });
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported type: ${file.type}. Use PDF, JPEG, PNG, or WebP.` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 15 MB.` }, { status: 400 });
  }

  const supabase = createServiceClient();
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1].replace('jpeg', 'jpg');
  const path = `deliveries/${deliveryId}/receipt.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = urlData.publicUrl;
  const { error: updErr } = await supabase.from('deliveries').update({ sinclairs_receipt_url: url }).eq('id', deliveryId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ url });
}

export async function DELETE(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports', editRequired: true });
  if (session instanceof NextResponse) return session;
  const { delivery_id } = await req.json().catch(() => ({}));
  if (!delivery_id) return NextResponse.json({ error: 'Missing delivery_id' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: existing } = await supabase.storage.from(BUCKET).list(`deliveries/${delivery_id}`);
  if (existing?.length) {
    await supabase.storage.from(BUCKET).remove(existing.map(f => `deliveries/${delivery_id}/${f.name}`));
  }
  await supabase.from('deliveries').update({ sinclairs_receipt_url: null }).eq('id', delivery_id);
  return NextResponse.json({ success: true });
}
