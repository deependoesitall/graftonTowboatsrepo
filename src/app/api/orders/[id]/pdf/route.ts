// src/app/api/orders/[id]/pdf/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: order, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*)')
    .eq('id', id)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  try {
    // Dynamic import avoids React bundling conflicts with @react-pdf/renderer
    const { renderToBuffer } = await import('@react-pdf/renderer');
    const { OrderPDFDocument } = await import('@/lib/pdf');
    const React = await import('react');

    const element = React.createElement(OrderPDFDocument, { order });
    const buffer = await renderToBuffer(element as any);
    const uint8Array = new Uint8Array(buffer);

    return new NextResponse(uint8Array, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${order.order_number}.pdf"`,
        'Content-Length': uint8Array.byteLength.toString(),
      },
    });
  } catch (err) {
    console.error('PDF generation error:', err);
    return NextResponse.json(
      { error: 'PDF generation failed', detail: String(err) },
      { status: 500 }
    );
  }
}
