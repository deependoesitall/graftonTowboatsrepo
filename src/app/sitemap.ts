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

const SITE = 'https://www.graftontowboatservices.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE}/services`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE}/about`, lastModified: now, changeFrequency: 'yearly', priority: 0.6 },
    { url: `${SITE}/contact`, lastModified: now, changeFrequency: 'yearly', priority: 0.7 },
    // The catalogue is the money page — it changes nightly with the Sinclair's
    // sync, and it's where a search for a specific product should land.
    { url: 'https://order.graftontowboatservices.com/catalog', lastModified: now, changeFrequency: 'daily', priority: 0.9 },
  ];
}
