// src/app/site/content.ts
//
// ALL MARKETING COPY IN ONE FILE.
//
// WHY: moving off Squarespace means Jen can no longer edit her own site — every
// wording change routes through Deepen. That is a real cost of the migration,
// and this file is what keeps it cheap: any headline, service description,
// phone number or address can be changed here in seconds without touching
// layout, and without a developer needing to understand the components.
//
// It's also the seam for later. If GTS ever wants self-service editing, a CMS
// points at this shape rather than requiring a rewrite.
//
// RULES FOR EDITING:
//   · Facts that appear in more than one place (phone, address, mile markers)
//     live here ONCE. The Squarespace site had mile markers wrong in the footer
//     of all five pages simultaneously because they were typed five times.
//   · Keep meta descriptions between 140–160 characters. Google truncates past
//     that, and duplicate descriptions across pages actively hurt ranking.

export const BUSINESS = {
  name: 'Grafton Towboat Services',
  legalName: 'Grafton Towboat Services LLC',
  phone: '(618) 556-0290',
  phoneHref: 'tel:6185560290',
  email: 'GraftonTowboatServices@gmail.com',
  street: '25 Dagget Hollow',
  cityStateZip: 'Grafton, IL 62037',
  vhf: 'Monitor Channel 68 via Grafton Harbor',
  /** Corrected Sept 2026. The site said 218 / 0.7 for months. */
  mileMarkers: 'Mile Marker 219 (Mississippi River) · Mile Marker 0 (Illinois River)',
  mileMarkersShort: 'MM 219 Mississippi · MM 0 Illinois',
  orderUrl: 'https://order.graftontowboatservices.com/catalog',
} as const;

export const NAV = [
  { label: 'Home', href: '/site' },
  { label: 'Services', href: '/services' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
] as const;

/**
 * Every service. `cta.href` is deliberately explicit rather than derived —
 * the live Squarespace site had the primary grocery button pointing at an
 * orphaned scheduling page, which is exactly the kind of mistake that hides
 * when links are implicit.
 */
export const SERVICES = [
  {
    slug: 'grocery-delivery',
    title: 'Grocery Delivery',
    blurb:
      "Partnered with Sinclair's Foods for the best meat and produce you can find. Small town, fresh products. If they don't have it, they get it for you.",
    detail:
      "Order online and we shop it the same way you would — checking dates, picking the good cuts, swapping sensibly when something's out. Cold and frozen goods travel refrigerated the whole way to your vessel.",
    cta: { label: 'Order Groceries', href: BUSINESS.orderUrl },
    photo: {
      label: "Sinclair's meat counter",
      hint: 'Real shot of the case. Replaces the Unsplash stock photo currently on the live site.',
    },
  },
  {
    slug: 'crew-change',
    title: 'Crew Change & 24/7 Support',
    blurb:
      "We're here when you need us. Crew change, last-minute problems, odd hours — we've got you covered.",
    detail:
      'Vessel to shore, shore to vessel, airport runs and local transfers. Tell us the window and we work around your boat, not the other way round.',
    cta: { label: 'Call to Arrange', href: BUSINESS.phoneHref },
    photo: {
      label: 'Crew transfer at the dock',
      hint: 'People, not scenery. Faces sell this service.',
    },
  },
  {
    slug: 'towboat-supplies',
    title: 'Towboat Supplies',
    blurb:
      "We stock a large variety of items, and if we don't have it we'll get it quickly and keep it in stock going forward.",
    detail:
      "Deck supplies, cleaning gear, parts and hardware. Tell us what you're short of and we source it — no waiting for the next port.",
    cta: { label: 'Order Supplies', href: BUSINESS.orderUrl },
    photo: {
      label: 'Loaded pallet on the dock',
      hint: 'The current image is 269px wide — the fuzziest thing on the site.',
    },
  },
] as const;

export const HOME = {
  meta: {
    title: 'Grafton Towboat Services | Marine Grocery & Supply Delivery',
    description:
      "Family-owned marine delivery at Grafton, Illinois - Mile Marker 219. Groceries from Sinclair's Foods, towboat supplies and crew change, delivered to your vessel.",
  },
  heroLines: ['Groceries, Supplies', '& Crew Change', 'When You Need It.'],
  lede:
    'Family-owned marine delivery at the Grafton harbor, where the Illinois meets the Mississippi. We shop it, pack it, and bring it to your vessel — by boat or refrigerated van.',
  fineprint: 'No login required · Instant confirmation · 24/7 support',
  /** Jen's approved wording. Name prominent, NO Sinclair's logo (Dave's ask). */
  sinclairs: {
    lead: "Groceries from Sinclair's Foods.",
    rest:
      'Ordered and delivered by Grafton Towboat Services. Cold and frozen goods ride refrigerated the whole way.',
  },
  heroPhoto: {
    label: 'GTS boat alongside a towboat',
    hint: 'Mid-transfer, groceries going up to a deckhand. The single most valuable photo on the site.',
  },
} as const;

export const ABOUT = {
  meta: {
    title: 'Family-Owned Marine Services in Grafton, Illinois',
    description:
      'A family-owned marine delivery business at the confluence of the Mississippi and Illinois rivers, serving towboat crews with groceries, supplies and transport.',
  },
  headingLines: ['Small Town and', 'Family Owned'],
  paragraphs: [
    "We're a small-town, family-owned business with big-business inventory. Our family has been in the marina business for 20 years and has worked on the river for generations.",
    'We have a deep love and respect for the river, and a real understanding of why it matters.',
    "That's why we answer the phone at odd hours, and why we'd rather tell you we can't make a window than promise one we'll miss.",
  ],
  /** No "woman-owned" badge — Dad is an owner via the marina, so it isn't
   *  accurate. The sisters' photo carries the signal instead (Jen, Aug 25). */
  photo: {
    label: 'The three sisters',
    hint: 'Carries the family-owned signal. Replaces the marina drone photo — they no longer own the marina.',
  },
  stats: [
    { stat: '24/7', label: 'Support' },
    { stat: 'MM 219', label: 'Mississippi River' },
    { stat: 'Ch. 68', label: 'via Grafton Harbor' },
  ],
} as const;

export const SERVICES_PAGE = {
  meta: {
    title: 'Grocery Delivery, Crew Change & Towboat Supplies | Grafton, IL',
    description:
      "Groceries from Sinclair's Foods, deck supplies and crew change transport, delivered to your towboat at Grafton, Illinois. Order online or call - 24/7 support.",
  },
  heading: 'Our Services',
  lede:
    "Grocery delivery, crew change and supplies. Need something else? Tell us and we'll work it out.",
} as const;

export const CONTACT_PAGE = {
  meta: {
    title: 'Contact Us | Grafton, Illinois Marine Delivery',
    description:
      'Reach Grafton Towboat Services for grocery delivery, towboat supplies and crew change at Mile Marker 219 on the Mississippi. Call, email or order online.',
  },
  heading: 'Get In Touch',
  lede:
    "Coming through Grafton? Tell us what you need and when you'll be here. For anything urgent, call — we answer.",
} as const;

export const CTA = {
  heading: 'Coming Through Grafton?',
  lede: 'Order online any time, or call and talk to a person. Both work — most crews do both.',
} as const;
