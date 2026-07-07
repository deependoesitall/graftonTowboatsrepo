// src/app/coupons/page.tsx
// ALL of Sinclair's digital coupons, auto-pulled and grouped by department.
// Server-rendered with a 15-minute cache. Savings are applied by Sinclair's
// when the order is shopped — display only, no clipping needed here.
import Link from 'next/link';
import { ArrowLeft, BadgePercent, TicketX } from 'lucide-react';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { fetchSinclairCoupons, SinclairCoupon } from '@/lib/sinclair-coupons';
import { createClient } from '@/lib/supabase/server';

export const revalidate = 900;

export default async function CouponsPage() {
  // Respect the Sinclair manager's toggle
  const supabase = await createClient();
  const { data: s } = await supabase.from('admin_settings').select('show_digital_coupons').single();
  const enabled = s?.show_digital_coupons ?? true;

  const { items, total } = enabled ? await fetchSinclairCoupons(300) : { items: [], total: 0 };

  // Group by department, departments sorted by coupon count
  const byDept = new Map<string, SinclairCoupon[]>();
  for (const c of items) {
    const dept = c.department || 'Other';
    if (!byDept.has(dept)) byDept.set(dept, []);
    byDept.get(dept)!.push(c);
  }
  const departments = Array.from(byDept.entries()).sort((a, b) => b[1].length - a[1].length);
  for (const [, list] of departments) list.sort((a, b) => b.popularity - a.popularity);

  return (
    <div className="min-h-screen bg-brand-cream flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        <Link href="/catalog" className="inline-flex items-center gap-1.5 text-brand-river text-sm hover:text-brand-steel mb-1">
          <ArrowLeft className="w-4 h-4" /> Back to Catalog
        </Link>
        <h1 className="font-display text-2xl font-bold text-brand-navy flex items-center gap-2">
          <BadgePercent className="w-6 h-6 text-brand-orange" /> Sinclair&apos;s Digital Coupons
        </h1>
        <p className="text-gray-500 text-sm mb-6">
          {total.toLocaleString()} active coupons — no clipping needed. Order from the catalog and
          Sinclair&apos;s applies the savings when your order is shopped.
        </p>

        {items.length === 0 ? (
          <div className="card-base p-12 text-center">
            <TicketX className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="font-bold text-brand-navy mb-1">No coupons available right now</p>
            <p className="text-sm text-gray-400">Check back soon, or see this week&apos;s specials in the <Link href="/weekly-ad" className="text-brand-river underline">weekly ad</Link>.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {departments.map(([dept, coupons]) => (
              <section key={dept}>
                <h2 className="font-display text-lg font-bold text-brand-navy mb-3">
                  {dept} <span className="text-sm font-normal text-gray-400">({coupons.length})</span>
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {coupons.map(c => (
                    <div key={c.id} className="card-base p-3 flex flex-col">
                      {c.cover_image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.cover_image_url} alt={c.brand || c.name}
                          loading="lazy" decoding="async"
                          className="w-full h-24 object-contain mb-2 mix-blend-multiply" />
                      )}
                      <p className="text-sm font-bold text-brand-orange leading-tight">
                        {c.offer_value ? `${c.offer_value} off` : c.name}
                      </p>
                      {c.brand && <p className="text-xs font-semibold text-brand-navy truncate">{c.brand}</p>}
                      {c.description && (
                        <p className="text-[11px] text-gray-500 leading-snug mt-0.5">{c.description}</p>
                      )}
                      {c.finish_date && (
                        <p className="text-[10px] text-gray-400 mt-auto pt-1.5">
                          Valid through {new Date(c.finish_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-8">
          Coupon savings are applied by Sinclair&apos;s Foods when your order is shopped and reflected on
          your final invoice. <Link href="/catalog" className="text-brand-river underline">Start your order →</Link>
        </p>
      </main>
    </div>
  );
}
