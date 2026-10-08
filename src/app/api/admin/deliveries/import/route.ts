// src/app/api/admin/deliveries/import/route.ts
// Sheet → ledger import / diff. Engine lives in src/lib/delivery-sheet-import.ts
// POST { mode: 'preview' | 'apply', rows: [...] }

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { importDeliveryRows, type SheetRow } from '@/lib/delivery-sheet-import';

export async function POST(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports', editRequired: true });
  if (session instanceof NextResponse) return session;

  const body = await req.json();
  const mode: 'preview' | 'apply' = body.mode === 'apply' ? 'apply' : 'preview';
  const createMissingCompanies = !!body.createMissingCompanies;
  const rawRows: SheetRow[] = Array.isArray(body.rows) ? body.rows : [];
  const headers: string[] = Array.isArray(body.headers)
    ? body.headers.map(String)
    : rawRows[0]
      ? Object.keys(rawRows[0])
      : [];

  const result = await importDeliveryRows({
    mode,
    headers,
    rows: rawRows,
    createMissingCompanies,
  });
  if (result.error) {
    return NextResponse.json(
      { error: result.error, headerMap: result.headerMap, headers: result.headers },
      { status: result.status || 400 },
    );
  }
  return NextResponse.json(result);
}
