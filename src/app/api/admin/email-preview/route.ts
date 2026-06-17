// src/app/api/admin/email-preview/route.ts
// Renders the order notification email with sample data + the admin's
// in-progress (unsaved) template settings, so they can preview before saving.
import { NextRequest, NextResponse } from 'next/server';
import { buildOrderEmailHtmlLegacy } from '@/lib/email';
import { requireAdmin } from '@/lib/admin-auth-server';
import { Order } from '@/types';

const SAMPLE_ORDER: Order = {
  id: 'sample',
  order_number: 'GTS-260611-1234',
  company_name: 'M/V River Hawk',
  contact_name: 'Captain Smith',
  phone: '(618) 555-0142',
  customer_email: 'captain@example.com',
  po_number: 'PO-44219',
  notes: 'Please deliver to the south dock by 2pm if possible. Thanks!',
  eta: '2:00 PM',
  items: [
    { id: '1', order_id: 'sample', product_id: 'p1', description: 'Bologna Salad', category: 'Bakery & Deli', pkg_size: 'PER LB', uom: null, upc: '023456789012', unit_price: 6.29, quantity: 2, line_total: 12.58 },
    { id: '2', order_id: 'sample', product_id: 'p2', description: '2% Milk Gallon', category: 'Dairy & Eggs', pkg_size: '1 GAL', uom: null, upc: '070470003498', unit_price: 3.89, quantity: 3, line_total: 11.67 },
    { id: '3', order_id: 'sample', product_id: 'p3', description: 'Lysol Spray Disinfectant 19oz 2-Pk', category: 'Household', pkg_size: '2 CT', uom: null, upc: null, unit_price: 9.99, quantity: 1, line_total: 9.99 },
  ],
  subtotal: 34.24,
  status: 'new',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { area: 'settings' });
  if (session instanceof NextResponse) return session;

  const body = await req.json();

  const html = buildOrderEmailHtmlLegacy(SAMPLE_ORDER, {
    subject_template: body.order_email_subject,
    header_tagline: body.email_header_tagline,
    intro_message: body.email_intro_message,
    footer_text: body.email_footer_text,
    button_text: body.email_button_text,
    button_url: body.email_button_url,
  });

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
