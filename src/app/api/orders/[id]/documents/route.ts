// src/app/api/orders/[id]/documents/route.ts
// Upload / remove an order's billing documents:
//   kind=receipt — Sinclair's register receipt (PDF/image). Attached to the
//                  final email on grocery-billed orders.
//   kind=slip    — signed Ingram Receipt Acknowledgement (image/PDF).
// POST field: "file" (multipart). Query/body: kind. Owner-only.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

const BUCKET = 'order-documents';
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB — receipts can be photos
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const COL: Record<string, 'sinclairs_receipt_url' | 'ingram_slip_url'> = {
  receipt: 'sinclairs_receipt_url',
  slip: 'ingram_slip_url',
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = requireAdmin(req, { ownerOnly: true });
  if (session instanceof NextResponse) return session;

  const { id: orderId } = await params;
  const { searchParams } = new URL(req.url);

  let file: File | null = null;
  let kind = searchParams.get('kind') || 'receipt';
  try {
    const form = await req.formData();
    file = form.get('file') as File | null;
    kind = (form.get('kind') as string) || kind;
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }
  const column = COL[kind];
  if (!column) return NextResponse.json({ error: 'Unknown document kind' }, { status: 400 });
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported type: ${file.type}. Use PDF, JPEG, PNG, or WebP.` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 15 MB.` }, { status: 400 });
  }

  const supabase = createServiceClient();
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1].replace('jpeg', 'jpg');
  const path = `${orderId}/${kind}.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = urlData.publicUrl;

  const { error: updErr } = await supabase.from('orders').update({ [column]: url }).eq('id', orderId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ url, kind });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = requireAdmin(req, { ownerOnly: true });
  if (session instanceof NextResponse) return session;

  const { id: orderId } = await params;
  const { kind } = await req.json().catch(() => ({ kind: 'receipt' }));
  const column = COL[kind];
  if (!column) return NextResponse.json({ error: 'Unknown document kind' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: existing } = await supabase.storage.from(BUCKET).list(orderId);
  if (existing) {
    const toRemove = existing.filter(f => f.name.startsWith(kind)).map(f => `${orderId}/${f.name}`);
    if (toRemove.length) await supabase.storage.from(BUCKET).remove(toRemove);
  }
  await supabase.from('orders').update({ [column]: null }).eq('id', orderId);
  return NextResponse.json({ success: true });
}
