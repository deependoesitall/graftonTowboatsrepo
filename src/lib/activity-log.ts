// src/lib/activity-log.ts
//
// One insert shape for the Settings → Activity Log. Callers must never let a
// log failure take down the action they just completed — we swallow the error
// after writing it.

import type { createServiceClient } from '@/lib/supabase/server';

export type ActivityAction =
  | 'status_change'
  | 'order_deleted'
  | 'order_placed'
  | 'register_import'
  | 'confirmation_email_sent'
  | 'final_email_sent'
  | 'catalog_import'
  | 'catalog_enriched'
  | string;

export interface ActivityLogRow {
  order_id?: string | null;
  order_number?: string | null;
  action: ActivityAction;
  from_value?: string | null;
  to_value?: string | null;
  admin_username?: string | null;
  admin_display_name?: string | null;
  admin_role?: string | null;
  company_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  po_number?: string | null;
  note?: string | null;
}

export async function logActivity(
  supabase: ReturnType<typeof createServiceClient>,
  row: ActivityLogRow,
): Promise<void> {
  const { error } = await supabase.from('activity_logs').insert({
    order_id: row.order_id ?? null,
    order_number: row.order_number ?? null,
    action: row.action,
    from_value: row.from_value ?? null,
    to_value: row.to_value ?? null,
    admin_username: row.admin_username ?? null,
    admin_display_name: row.admin_display_name ?? null,
    admin_role: row.admin_role ?? null,
    company_name: row.company_name ?? null,
    contact_name: row.contact_name ?? null,
    phone: row.phone ?? null,
    po_number: row.po_number ?? null,
    note: row.note ?? null,
  });
  if (error) console.error('activity log:', error.message);
}
