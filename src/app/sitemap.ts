// src/app/sitemap.ts
//
// Squarespace generated a sitemap automatically. Moving off it without
// replacing that would quietly cost search visibility, so this is part of the
// migration rather than a nice-to-have.
//
// Deliberately EXCLUDES /privacy, /terms and /accessibility — those are set to
// noindex in their own metadata, and a legal page outranking the grocery
// delivery page would be a bad outcome. Also excludes /admin and /account,
// which have no business in an index.

import type { MetadataRoute } from 'next';

// APEX, NOT www. Sept 2026: the domain moved off Squarespace and the bare
// graftontowboatservices.com is now the canonical address, with www and the
// order.* subdomain both redirecting to it. A sitemap that advertises a
// hostname which 301s is a self-inflicted crawl tax — every URL costs Google an
// extra round trip and the redirect target is what gets indexed anyway.
//
// If the canonical host ever changes, this constant, robots.ts and
// StructuredData.tsx must all move together or they'll disagree about which
// site this is.
const SITE = 'https://graftontowboatservices.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE}/services`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE}/about`, lastModified: now, changeFrequency: 'yearly', priority: 0.6 },
    { url: `${SITE}/contact`, lastModified: now, changeFrequency: 'yearly', priority: 0.7 },
    // The catalogue is the money page — it changes nightly with the Sinclair's
    // sync, and it's where a search for a specific product should land.
    { url: `${SITE}/catalog`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    // The customer install page. Listed, unlike /admin/install and
    // /shop/install, which are noindex — those are handed to named staff, this
    // one is a link GTS gives out and wants found.
    { url: `${SITE}/install`, lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
  ];
}
