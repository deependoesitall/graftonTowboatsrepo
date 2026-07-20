// src/app/api/admin/email-preview/route.ts
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
  notes: 'Please deliver to the south dock by 2pm.',
  eta: '2:00 PM',
  vessel_name: 'River Hawk',
  vessel_type: 'Towboat',
  captain_name: 'Captain Smith',
  captain_phone: '(618) 555-0142',
  vessel_email: null,
  delivery_method: 'boat',
  terminal_name: 'Mel Price Locks, Alton IL',
  arrival_date: 'June 15',
  arrival_time: '6 AM',
  approach_side: 'port',
  vhf_channel: '16',
  crew_change: 'no',
  crew_change_notes: null,
  crew_arriving: null,
  crew_departing: null,
  extended_info: null,
  cod_payment_method: null,
  cod_payment_handle: null,
  cod_preferred_phone: null,
  cod_contact_time: null,
  cod_fee_percent: null,
  discount_total: 0,
  items: [
    { id: '1', order_id: 'sample', product_id: 'p1', description: 'Bologna Salad', category: 'Bakery & Deli', pkg_size: 'PER LB', uom: null, upc: '023456789012', location: null, location_seq: null, unit_price: 6.29, quantity: 2, line_total: 12.58, shopping_status: 'pending', actual_weight: null, actual_total: null, is_substitution: false, substitutes_item_id: null, item_type: 'grocery', service_type: null, service_details: null, paid_by: 'vessel', cod_name: null, image_url: null },
    { id: '2', order_id: 'sample', product_id: 'p2', description: '2% Milk Gallon', category: 'Dairy', pkg_size: '1 GAL', uom: null, upc: '070470003498', location: null, location_seq: null, unit_price: 3.89, quantity: 3, line_total: 11.67, shopping_status: 'pending', actual_weight: null, actual_total: null, is_substitution: false, substitutes_item_id: null, item_type: 'grocery', service_type: null, service_details: null, paid_by: 'vessel', cod_name: null, image_url: null },
    { id: '3', order_id: 'sample', product_id: 'p3', description: 'Lysol 19oz 2-Pk', category: 'Household', pkg_size: '2 CT', uom: null, upc: null, location: null, location_seq: null, unit_price: 9.99, quantity: 1, line_total: 9.99, shopping_status: 'pending', actual_weight: null, actual_total: null, is_substitution: false, substitutes_item_id: null, item_type: 'grocery', service_type: null, service_details: null, paid_by: 'vessel', cod_name: null, image_url: null },
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
