// src/app/site/page.tsx
//
// /site → / permanent redirect.
//
// The marketing home lived here while the domain still pointed at Squarespace
// and `/` was an ordering landing page. On Sept 8, 2026 it moved to `/`.
//
// This stays as a redirect rather than being deleted, for two reasons:
//
//  1. DUPLICATE CONTENT. Leaving the same page served at two URLs splits
//     ranking signals and lets Google pick the wrong canonical — it might well
//     have chosen /site, which is exactly the URL nobody should ever see.
//
//  2. Anything that already points at /site keeps working. The deployed nav
//     linked here for a day, and I'd rather an old link land on the right page
//     than 404.
//
// 308 (permanent) rather than 307, so search engines transfer the ranking to
// `/` instead of treating this as a temporary detour.

import { permanentRedirect } from 'next/navigation';

export default function SiteRedirect(): never {
  permanentRedirect('/');
}
