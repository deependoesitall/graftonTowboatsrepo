// src/app/admin/orders/[id]/page.tsx
//
// A REDIRECT SHIM FOR NOTIFICATIONS THAT ARE ALREADY OUT THERE.
//
// Push payloads pointed at /admin/orders/<id> for weeks, and this route did not
// exist — every staff notification opened a Vercel 404. push.ts now sends
// /admin/orders?order=<id> instead, but that only fixes notifications sent from
// now on. The broken ones are sitting in notification trays and in the history
// of every installed app, and they keep working the moment someone taps an old
// one — which is exactly when you don't want a 404, because the person tapping
// it is usually reacting to a live order.
//
// So this stays. It costs one file and it means no version of the URL, past or
// future, can dead-end.
//
// The order detail is a MODAL on the list page, not a page of its own, which is
// why there is no real route here to build. The list page reads ?order= and
// opens it.

import { redirect } from 'next/navigation';

export const metadata = { title: 'Order', robots: 'noindex' };

export default async function AdminOrderRedirect(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  redirect(`/admin/orders?order=${encodeURIComponent(id)}`);
}
