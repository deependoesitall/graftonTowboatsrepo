// src/lib/vessel-report.ts
//
// VESSEL ACTIVITY REPORT — a branded, printable summary of what a barge line's
// boats have ordered.
//
// This replaces a raw `vessels_report.csv` download. Nobody opened that file,
// and if they had it wasn't something you'd forward to a port captain. The one
// export on this screen that has genuine external value is "here's what your
// fleet ordered from us" — so it should look like it came from a real company.
//
// Styling deliberately mirrors the monthly billing packet (same brand bar, same
// palette, same letter page): a barge line receiving both should see one
// consistent set of documents, not two different apps.

const GREEN = '#1E3D1E', LIME = '#D9E84A', ORANGE = '#E8640A';

function esc(s: string | null | undefined): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const money = (n: number) =>
  '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface VesselReportRow {
  company_name: string;
  contact_name: string;
  phone: string;
  orderCount: number;
  totalSpent: number;
  avgOrderValue: number;
  mostOrdered: Array<{ description: string; qty: number }>;
  orders: Array<{ order_number: string; created_at: string; subtotal: number; status: string; vessel_name: string | null }>;
}

function brandBar(rangeLabel: string, generated: string): string {
  return `
  <table width="100%" style="border-collapse:collapse;background:${GREEN};border-radius:6px 6px 0 0;">
    <tr>
      <td style="padding:16px 22px;">
        <div style="font-size:18px;font-weight:900;color:${LIME};text-transform:uppercase;letter-spacing:-0.5px;">Grafton Towboat Services</div>
        <div style="font-size:9px;font-weight:700;color:${ORANGE};letter-spacing:1px;">GROCERIES, SUPPLIES &amp; CREW CHANGE</div>
        <div style="font-size:9px;color:#a8c86a;margin-top:4px;line-height:1.6;">
          25 Dagget Hollow · Grafton, IL 62037 · Mile Marker 219 Mississippi River / Mile Marker 0 Illinois River<br>
          (618) 556-0290 · GraftonTowboatServices@gmail.com · Channel 68 via Grafton Harbor
        </div>
      </td>
      <td style="padding:16px 22px;text-align:right;vertical-align:top;">
        <div style="font-size:12px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:1.5px;line-height:1.4;">Vessel<br>Activity Report</div>
        <div style="font-size:10px;color:#a8c86a;margin-top:5px;">${esc(rangeLabel)}<br>Generated ${generated}</div>
      </td>
    </tr>
  </table>`;
}

export function vesselReportHtml(vessels: VesselReportRow[], rangeLabel: string): string {
  const generated = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const sorted = [...vessels].sort((a, b) => b.totalSpent - a.totalSpent);
  const totalOrders = sorted.reduce((s, v) => s + (v.orderCount || 0), 0);
  const totalSpent = sorted.reduce((s, v) => s + (v.totalSpent || 0), 0);
  const avg = totalOrders ? totalSpent / totalOrders : 0;

  const stat = (label: string, value: string) => `
    <td style="padding:12px 16px;border-right:1px solid #e6e9dd;">
      <div style="font-size:8.5px;font-weight:700;color:#7a8471;text-transform:uppercase;letter-spacing:1px;">${label}</div>
      <div style="font-size:20px;font-weight:900;color:${GREEN};margin-top:2px;">${value}</div>
    </td>`;

  const card = (v: VesselReportRow, i: number) => {
    const top = (v.mostOrdered || []).slice(0, 5);
    const recent = [...(v.orders || [])]
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 6);
    return `
    <div style="border:1px solid #dfe4d5;border-radius:6px;margin-bottom:14px;page-break-inside:avoid;overflow:hidden;">
      <table width="100%" style="border-collapse:collapse;background:#f6f8f0;">
        <tr>
          <td style="padding:10px 14px;">
            <div style="font-size:14px;font-weight:900;color:${GREEN};">${i + 1}. ${esc(v.company_name) || 'Unknown company'}</div>
            <div style="font-size:9.5px;color:#7a8471;margin-top:2px;">
              ${esc(v.contact_name) || '—'}${v.phone ? ' · ' + esc(v.phone) : ''}
            </div>
          </td>
          <td style="padding:10px 14px;text-align:right;white-space:nowrap;">
            <div style="font-size:17px;font-weight:900;color:${GREEN};">${money(v.totalSpent)}</div>
            <div style="font-size:9px;color:#7a8471;">
              ${v.orderCount} order${v.orderCount === 1 ? '' : 's'} · ${money(v.avgOrderValue)} avg
            </div>
          </td>
        </tr>
      </table>
      <table width="100%" style="border-collapse:collapse;">
        <tr style="vertical-align:top;">
          <td style="width:48%;padding:10px 14px;border-right:1px solid #eef1e7;">
            <div style="font-size:8.5px;font-weight:700;color:#7a8471;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;">Most ordered</div>
            ${top.length ? top.map(t => `
              <div style="font-size:10px;color:#333;padding:2px 0;border-bottom:1px solid #f4f6ee;">
                <span style="display:inline-block;min-width:26px;font-weight:800;color:${ORANGE};">${t.qty}&times;</span>${esc(t.description)}
              </div>`).join('') : '<div style="font-size:10px;color:#aaa;">—</div>'}
          </td>
          <td style="width:52%;padding:10px 14px;">
            <div style="font-size:8.5px;font-weight:700;color:#7a8471;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;">Recent orders</div>
            ${recent.length ? recent.map(o => `
              <div style="font-size:10px;color:#333;padding:2px 0;border-bottom:1px solid #f4f6ee;">
                <span style="font-family:monospace;font-weight:700;color:${GREEN};">${esc(o.order_number)}</span>
                ${o.vessel_name ? ` · ${esc(o.vessel_name)}` : ''}
                <span style="float:right;font-weight:700;">${money(o.subtotal)}</span>
                <div style="font-size:8.5px;color:#9aa392;">${o.created_at ? new Date(o.created_at).toLocaleDateString() : ''}</div>
              </div>`).join('') : '<div style="font-size:10px;color:#aaa;">—</div>'}
          </td>
        </tr>
      </table>
    </div>`;
  };

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Vessel Activity Report</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color:#222; background:#fff; padding:24px 16px; }
  @page { size:letter; margin:0.5in; }
  @media print { .noprint { display:none !important; } }
</style></head><body>
  <div class="noprint" style="max-width:760px;margin:0 auto 14px;text-align:right;">
    <button onclick="window.print()" style="background:${GREEN};color:#fff;border:0;border-radius:6px;padding:8px 18px;font-size:13px;font-weight:700;cursor:pointer;">
      Print / Save as PDF
    </button>
  </div>
  <div style="max-width:760px;margin:0 auto;">
    ${brandBar(rangeLabel, generated)}
    <table width="100%" style="border-collapse:collapse;border:1px solid #dfe4d5;border-top:0;margin-bottom:18px;">
      <tr>
        ${stat('Barge lines', String(sorted.length))}
        ${stat('Orders', String(totalOrders))}
        ${stat('Total ordered', money(totalSpent))}
        <td style="padding:12px 16px;">
          <div style="font-size:8.5px;font-weight:700;color:#7a8471;text-transform:uppercase;letter-spacing:1px;">Average order</div>
          <div style="font-size:20px;font-weight:900;color:${GREEN};margin-top:2px;">${money(avg)}</div>
        </td>
      </tr>
    </table>
    ${sorted.length
      ? sorted.map(card).join('')
      : '<div style="padding:40px;text-align:center;color:#999;font-size:13px;">No vessel activity in this period.</div>'}
    <div style="margin-top:18px;padding-top:10px;border-top:1px solid #e6e9dd;font-size:9px;color:#9aa392;text-align:center;">
      Grafton Towboat Services · Groceries from Sinclair&rsquo;s Foods, ordered and delivered by us ·
      Order online at graftontowboatservices.com
    </div>
  </div>
</body></html>`;
}
