// src/app/api/products/[id]/image/route.ts
// POST  — upload or replace a product image (multipart/form-data, field: "file")
// DELETE — remove the product image (clears storage object + image_url)

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

const BUCKET = 'product-images';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = requireAdmin(req, { area: 'products', editRequired: true });
  if (session instanceof NextResponse) return session;

  const { id: productId } = await params;
  const supabase = createServiceClient();

  // Verify product exists
  const { data: product, error: prodErr } = await supabase
    .from('products')
    .select('id, image_url')
    .eq('id', productId)
    .single();

  if (prodErr || !product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  // Parse multipart form
  let file: File | null = null;
  try {
    const form = await req.formData();
    file = form.get('file') as File | null;
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}. Use JPEG, PNG, WebP, or GIF.` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.` },
      { status: 400 },
    );
  }

  const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
  const storagePath = `${productId}/product.${ext}`;
  const bytes = await file.arrayBuffer();

  // Delete old image from storage if it exists under the same product folder
  if (product.image_url) {
    const oldPath = `${productId}/`;
    const { data: existing } = await supabase.storage.from(BUCKET).list(productId);
    if (existing) {
      const toRemove = existing.map((f: { name: string }) => `${productId}/${f.name}`);
      if (toRemove.length > 0) {
        await supabase.storage.from(BUCKET).remove(toRemove);
      }
    }
  }

  // Upload new image
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  // Get public URL
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const publicUrl = urlData.publicUrl;

  // Update product record
  // A human uploaded this — mark it 'manual'. The sync only fills a MISSING
  // image, so an uploaded photo is never overwritten.
  const { data: updated, error: updateErr } = await supabase
    .from('products')
    .update({ image_url: publicUrl, image_source: 'manual' })
    .eq('id', productId)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ product: updated, image_url: publicUrl });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = requireAdmin(req, { area: 'products', editRequired: true });
  if (session instanceof NextResponse) return session;

  const { id: productId } = await params;
  const supabase = createServiceClient();

  // Remove all files in the product's folder
  const { data: existing } = await supabase.storage.from(BUCKET).list(productId);
  if (existing && existing.length > 0) {
    const toRemove = existing.map((f: { name: string }) => `${productId}/${f.name}`);
    await supabase.storage.from(BUCKET).remove(toRemove);
  }

  // Clear image_url on product
  const { data: updated, error: updateErr } = await supabase
    .from('products')
    .update({ image_url: null, image_source: null })
    .eq('id', productId)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ product: updated });
}
