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
  /**
   * RELATIVE ON PURPOSE (Sept 2026).
   *
   * This was hardcoded to https://order.graftontowboatservices.com/catalog back
   * when the marketing site and the app lived on different hosts. They don't
   * anymore — the apex serves both, and order.* redirects to it.
   *
   * Leaving it absolute would have sent every "Order Groceries" button on the
   * new site out to order.*, only to be 301'd straight back to the domain the
   * visitor was already on. A pointless round trip on a phone with one bar of
   * signal in the middle of the river, which is exactly where these buttons get
   * pressed.
   *
   * Relative also means this keeps working on Vercel preview deployments, where
   * an absolute production URL would jump the visitor out of the preview.
   */
  orderUrl: '/catalog',
} as const;

/**
 * PHOTOGRAPHY.
 *
 * These are the real images from the Squarespace site, chosen from everything
 * that was on it. Three are Unsplash stock, which quietly undercuts the
 * "small town, family owned" pitch — so they are placeholders with a deadline,
 * not a final answer. Jen is photographing deliveries; each entry says what
 * should eventually replace it.
 *
 * ✅ NOW SERVED LOCALLY from /public/site/ (Sept 7, 2026).
 * They used to load from Squarespace's CDN, which would have died with the
 * subscription on May 6, 2027 and silently emptied the site of every image.
 * That dependency is gone. To swap any photo, drop a file with the same name
 * into public/site/ — no code change needed.
 *
 * `alt` is written properly on every one. Every image on the live Squarespace
 * site has alt="" — that's 13 accessibility failures and 13 wasted SEO signals.
 */
/**
 * DONE — Sept 7, 2026. The five files were downloaded into public/site/ by
 * scripts/download-site-images.ps1 and this was switched on.
 *
 * The remote branch below is kept only as a record of where each image came
 * from, and as an escape hatch if a local file is ever lost before May 2027.
 * After the Squarespace subscription lapses those URLs are dead, and the whole
 * `pick()` mechanism can be deleted in favour of plain '/site/…' strings.
 */
const USE_LOCAL_IMAGES = true;

const CDN = 'https://images.squarespace-cdn.com/content/v1/6819038bc556772f05a46e4d';

/**
 * Local path if we've downloaded the images, remote CDN if we haven't.
 *
 * An EMPTY remote means there is no Squarespace original to fall back to —
 * true of every photo Jen has taken since the migration. Those exist only in
 * public/site/, which is where they should be. The remote branch is dead code
 * kept as provenance for the five images that came off the old site; it can go
 * once the Squarespace subscription lapses in May 2027.
 */
const pick = (local: string, remote: string) => (USE_LOCAL_IMAGES ? `/site/${local}` : `${CDN}/${remote}`);

export const IMAGES = {
  // ✅ REAL GTS PHOTO — Jen, Sept 2026. Replaced an Unsplash stock barge at
  // sunset, which was pretty and told a captain nothing.
  //
  // This is the entire business in one frame: the branded GTS van parked
  // alongside a towboat at the dock, mid-delivery. Stock photography on a
  // "small town, family owned" site quietly argues against the copy — a real
  // van next to a real boat argues for it.
  hero: {
    src: pick('gts-van-alongside.jpg', ''),
    alt: 'The Grafton Towboat Services van parked alongside a towboat at the dock, delivering supplies',
    replaceWith: null,
  },
  groceries: {
    src: pick('meat-counter.jpg', '1746472744398-E7VAP4L3025LGQT3MXVP/unsplash-image-qgfjZUXup1M.jpg'),
    alt: 'A full fresh meat counter at a grocery store',
    replaceWith: "The real case at Sinclair's Foods in Jerseyville.",
  },
  // ✅ REAL GTS PHOTO — Jen, Sept 2026. Replaced Unsplash stock.
  // Someone actually working: the van backed up to the boat, doors open, a
  // person handling the load. People sell this service; scenery doesn't.
  crewChange: {
    src: pick('gts-loading-vessel.jpg', ''),
    alt: 'Grafton Towboat Services staff loading supplies from the van onto a towboat at the dock',
    replaceWith: null,
  },
  supplies: {
    // REPLACED Sept 2026 via scripts/replace-forklift-photo.ps1. The original
    // was 269×188 and 13 KB — the softest image on the site, upscaled ~1.7x on
    // the Services page and sitting next to two 2500px photos, which made it
    // look worse than it would have alone. It was stock, not a GTS photograph,
    // so swapping cost nothing in authenticity.
    //
    // ⚠️ The replacement carries another company's livery on the truck
    // (Portuguese, "TRANSPORTES, LDA"). Small in frame, licensed for commercial
    // use, and far better than the blur — but it IS someone else's branding on
    // GTS's services page. First thing to swap when Jen photographs a real
    // loaded pallet at the Grafton dock.
    // ✅ FIXED — Jen's photo, Sept 2026. This slot has been the worst on the
    // site twice over: first a 269px blur, then a stock forklift carrying
    // ANOTHER COMPANY'S LIVERY (Portuguese, "TRANSPORTES, LDA") on GTS's own
    // services page. Both are gone. This is GTS supplies going aboard at the
    // Grafton dock — the actual thing the page is describing.
    src: pick('gts-supplies-dock.jpg', ''),
    alt: 'Supplies and crates being loaded aboard a vessel at the Grafton dock',
    replaceWith: null,
  },
  sisters: {
    // Already on their Contact page and nobody was using it properly.
    // This is the family-owned signal Jen asked for.
    src: pick('sisters.png', '2e583c7d-c344-4fb0-a74e-eb91759643e6/Untitled+%281%29.png'),
    alt: 'The three sisters who own and run Grafton Towboat Services',
    replaceWith: 'A higher-resolution version — this one is only 500px wide.',
  },
} as const;

/** Squarespace's CDN resizes on request, so we ask for what we'll display
 *  rather than pulling a 2500px original onto a phone. */
export const img = (src: string, width: number) =>
  src.startsWith('/') ? src : `${src}?format=${width}w`;

/**
 * THE OWNERS.
 *
 * Carried over from the Squarespace contact page, where they sit under
 * "Owners Contacts". Three sisters, three direct numbers — and for a business
 * whose entire pitch is "family owned", a captain being able to ring an owner
 * directly IS the product. Worth more prominence than a line of small text.
 *
 * ORDER MATTERS — left to right: MaryKaren, Laura, Jennifer.
 * Confirmed by Deepen, Sept 8, and the array below is in that order because
 * SistersPortrait renders it as a three-column grid aligned under the faces.
 * REORDERING THIS ARRAY PUTS THE WRONG NAME UNDER SOMEONE'S PHOTOGRAPH.
 *
 * Worth having asked rather than inferred: the Squarespace page these came from
 * renders its own labels misaligned on a wide screen — MaryKaren's under the
 * first portrait, Laura's under the third, Jennifer's under nothing at all — so
 * reading the mapping off that page would have got it wrong.
 */
export const OWNERS = [
  { name: 'MaryKaren', phone: '314-809-0853', href: 'tel:3148090853' },
  { name: 'Laura',     phone: '618-779-2592', href: 'tel:6187792592' },
  { name: 'Jennifer',  phone: '618-946-4377', href: 'tel:6189464377' },
] as const;

export const NAV = [
  { label: 'Home', href: '/' },
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
      "Order online and Sinclair's own staff pull it from the shelves — the same people who stock the store, choosing your meat and produce. Need something they don't carry? Paste a link or write it in the notes — a part, a TV, a carton of smokes — and it comes with the rest of the order. Cold and frozen goods travel refrigerated the whole way to your vessel.",
    cta: { label: 'Order Groceries', href: BUSINESS.orderUrl },
    image: IMAGES.groceries,
  },
  {
    slug: 'crew-change',
    title: 'Crew Change & 24/7 Support',
    blurb:
      "We're here when you need us. Crew change, last-minute problems, odd hours — we've got you covered.",
    detail:
      'Vessel to shore, shore to vessel, airport runs and local transfers. Tell us the window and we work around your boat, not the other way round.',
    cta: { label: 'Call to Arrange', href: BUSINESS.phoneHref },
    image: IMAGES.crewChange,
  },
  {
    slug: 'towboat-supplies',
    title: 'Towboat Supplies',
    blurb:
      "We stock a large variety of items, and if we don't have it we'll get it quickly and keep it in stock going forward.",
    detail:
      "Deck supplies, cleaning gear, parts and hardware. Tell us what you're short of and we source it — no waiting for the next port.",
    cta: { label: 'Order Supplies', href: BUSINESS.orderUrl },
    image: IMAGES.supplies,
  },
] as const;

export const HOME = {
  meta: {
    title: 'Grafton Towboat Services | Marine Grocery & Supply Delivery',
    description:
      "Family-owned, at Grafton, Illinois - Mile Marker 219. Groceries from Sinclair's Foods, towboat supplies and crew change, brought out to your vessel.",
  },
  heroLines: ['Groceries, Supplies', '& Crew Change', 'When You Need It.'],
  lede:
    // Was "We shop it, pack it, and bring it to your vessel" — inaccurate.
    // Sinclair's staff pull the groceries, and off-catalog items get fetched by
    // whoever is best placed that day. See the long note on step 02 in
    // page.tsx for why this copy deliberately doesn't say who does the work.
    //
    // TWO THINGS WERE WRONG HERE (Sept 2026) AND BOTH MATTERED.
    //
    // "at the Grafton harbor" — GTS is at 25 Dagget Hollow, Grafton. Grafton
    // Harbor is a DIFFERENT BUSINESS, the marina GTS relays VHF Channel 68
    // through. Putting the company "at" it misplaced GTS and implied a
    // relationship that isn't there, to an audience that knows the difference.
    // The Channel 68 references elsewhere are correct and stay — "via Grafton
    // Harbor" is a relay, not an address.
    //
    // "marine delivery" — nobody on the river calls it that. Captains say
    // groceries, supplies, crew change. Trade jargon in the first sentence of
    // a family business reads like a directory listing wrote it.
    "Family-owned, at the confluence of the Illinois and the Mississippi in Grafton, Illinois. Groceries from Sinclair's, and anything else you need tracked down — brought out to your vessel by boat or refrigerated van.",
  fineprint: 'No login required · Instant confirmation · 24/7 support',
  /** Jen's approved wording. Name prominent, NO Sinclair's logo (Dave's ask). */
  sinclairs: {
    lead: "Groceries from Sinclair's Foods.",
    rest:
      'Ordered and delivered by Grafton Towboat Services. Cold and frozen goods ride refrigerated the whole way.',
  },
} as const;

export const ABOUT = {
  meta: {
    title: 'Family-Owned Marine Services in Grafton, Illinois',
    description:
      'A family-owned business at the confluence of the Mississippi and Illinois rivers, serving towboat crews with groceries, supplies and crew transport.',
  },
  headingLines: ['Small Town and', 'Family Owned'],
  paragraphs: [
    "We're a small-town, family-owned business with big-business inventory. Our family has been in the marina business for 20 years and has worked on the river for generations.",
    'We have a deep love and respect for the river, and a real understanding of why it matters.',
    "That's why we answer the phone at odd hours, and why we'd rather tell you we can't make a window than promise one we'll miss.",
  ],
  /** No "woman-owned" badge — Dad is an owner via the marina, so it isn't
   *  accurate. The sisters' photo carries the signal instead (Jen, Aug 25). */
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
