// src/app/robots.ts
//
// Squarespace served a robots.txt automatically; this replaces it.
//
// The disallow list is the important part. The admin panel already sends
// X-Robots-Tag: noindex via next.config.js, but that header only helps once a
// crawler has already fetched the page. Keeping crawlers out at the robots
// level means the admin login never gets requested in the first place — and a
// login form that never appears in search results is a login form that never
// gets found by opportunistic credential stuffing.

import type { MetadataRoute } from 'next';

// Apex, not www — must match sitemap.ts and StructuredData.tsx. See the note in
// sitemap.ts for why the canonical host changed in Sept 2026.
const SITE = 'https://graftontowboatservices.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',        // staff panel — rates, ledger, customer data
        '/api/',         // no endpoint belongs in an index
        '/account',      // customer order history
        '/auth',
        '/confirm',      // order confirmation pages contain order details
        '/privacy',      // also noindex in metadata; belt and braces
        '/terms',
        '/accessibility',
      ],
    }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
