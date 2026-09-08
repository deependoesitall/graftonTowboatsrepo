// src/components/site/StructuredData.tsx
//
// JSON-LD for Google. Invisible on the page, and probably the highest-return
// thing on this whole site.
//
// WHY IT MATTERS HERE SPECIFICALLY: a port captain searching "grocery delivery
// Grafton Illinois" gets a results page. Structured data is what lets Google
// render the business card — name, phone, hours, location — instead of a plain
// blue link. For a local service business, that panel IS the conversion. The
// Squarespace site had none of this.
//
// Two rules followed here:
//   · Every claim must be TRUE and must match what's visible on the page.
//     Google penalises structured data that contradicts the rendered content,
//     and inventing review counts or ratings is exactly how a small business
//     gets a manual action.
//   · No geo coordinates. Google geocodes from the postal address perfectly
//     well, and guessing lat/long to five decimal places would be asserting
//     precision nobody verified. Better absent than wrong.

import { BUSINESS } from '@/app/site/content';

const SITE = 'https://www.graftontowboatservices.com';

export function LocalBusinessSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${SITE}/#business`,
    name: BUSINESS.name,
    legalName: BUSINESS.legalName,
    url: SITE,
    telephone: BUSINESS.phone,
    email: BUSINESS.email,
    description:
      "Family-owned marine delivery at Grafton, Illinois. Groceries from Sinclair's Foods, towboat supplies and crew change transport, delivered to vessels on the Mississippi and Illinois rivers.",
    image: `${SITE}/branding/gts-logo.png`,
    logo: `${SITE}/branding/gts-logo.png`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: BUSINESS.street,
      addressLocality: 'Grafton',
      addressRegion: 'IL',
      postalCode: '62037',
      addressCountry: 'US',
    },
    // Genuinely 24/7 — this is the claim the site makes everywhere, and it's
    // true: they answer the phone at night for crew changes.
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '00:00',
      closes: '23:59',
    }],
    areaServed: [
      { '@type': 'Place', name: 'Mississippi River — Mile Marker 219, Grafton, Illinois' },
      { '@type': 'Place', name: 'Illinois River — Mile Marker 0, Grafton, Illinois' },
    ],
    knowsAbout: ['Marine grocery delivery', 'Towboat supplies', 'Crew change transportation'],
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Services',
      itemListElement: [
        { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Grocery Delivery', description: "Groceries from Sinclair's Foods delivered to your vessel by boat or refrigerated van." } },
        { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Crew Change & 24/7 Support', description: 'Crew transport between vessel and shore, available around the clock.' } },
        { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Towboat Supplies', description: 'Deck supplies, parts and hardware sourced and delivered to your towboat.' } },
      ],
    },
  };

  return (
    <script
      type="application/ld+json"
      // Safe: `schema` is a literal object built here from constants, never
      // from user input, so there is no injection surface.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
