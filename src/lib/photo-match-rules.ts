// src/lib/photo-match-rules.ts
//
// Decides on its own whether a name match found by the nightly sync is safe
// to use as an item's PHOTO, so nobody has to review matches by hand.
// Strict on purpose: a skipped item keeps its placeholder and is tried again
// in 14 days; a wrong photo (pork loin on a ribeye) is what a crew sees.
//
// A match is used only when ALL of these hold:
//   1. Every word that names the item in our catalog line appears in the
//      Sinclair's name: brand, product, cut, flavor ("HELLMANS" must find
//      Hellman's, "TENDERS" must find tenders, "RIBEYE" must find ribeye).
//      Only packaging and grading words are allowed to go unmatched.
//   2. The Sinclair's name adds no meat, fish, cut or form we didn't name
//      ("Whole Pork Loin" adds PORK; "Turkey Breast" adds BREAST to a whole
//      turkey).
//   3. It adds no flavor or variant we didn't name (Mountain Dew → Baja Cabo).
//   4. A one-word catalog line ("SCOTT") only matches a name that adds at
//      most two words (brand, "Yellow"), not "One Ply Bathroom Tissue".
//   5. It is not pet food, unless ours is.
// The display name is never changed by this: the catalog name stays.
import { tokenize, tokenMatch } from '@/lib/image-backfill';

/** Words that describe packaging, grade or form loosely enough that a photo
 *  of the item without them is still the right picture. */
const LOOSE = new Set([
  'FROZEN', 'FRZ', 'FRESH', 'BAG', 'BOX', 'CASE', 'PINT', 'QUART', 'QT', 'GALLON', 'GAL',
  'DOZEN', 'DOZ', 'DZ', 'HEAD', 'LARGE', 'MEDIUM', 'SMALL', 'GRADE', 'CANS', 'CAN', 'BOTTLES',
  'BOTTLE', 'FULL', 'SIZE', 'BLOCK', 'STICKS', 'DELI', 'ORIGINAL', 'NY', 'CAB', 'SLICED',
  'WHOLE', 'BUNCH', 'LOOSE', 'BULK', 'ASSORTED', 'REGULAR', 'CLASSIC', 'TUB', 'JAR', 'ROLL',
  'ALL', 'BAR', 'PASTA',
]);

/** Meats, fish and cuts. The Sinclair's name may not bring one of these in. */
const KIND = new Set([
  'BEEF', 'PORK', 'CHICKEN', 'TURKEY', 'HAM', 'VEAL', 'LAMB', 'FISH', 'CATFISH', 'SALMON',
  'TILAPIA', 'COD', 'SHRIMP', 'CRAB', 'SAUSAGE', 'BACON', 'BREAST', 'BREASTS', 'THIGH',
  'THIGHS', 'WING', 'WINGS', 'DRUMSTICK', 'DRUMSTICKS', 'TENDER', 'TENDERS', 'TENDERLOIN',
  'LOIN', 'RIBEYE', 'SIRLOIN', 'STRIP', 'CHUCK', 'BRISKET', 'RIBS', 'RIB', 'CHOP', 'CHOPS',
  'BUTT', 'SHOULDER', 'GROUND', 'PATTIES', 'PATTY', 'STEAK', 'STEAKS', 'ROAST', 'FILLET',
  'FILLETS', 'NUGGETS', 'NUGGET', 'SALAMI', 'BOLOGNA', 'PEPPERONI', 'HOT', 'DOGS', 'COB',
]);

/** Flavors and variants. A different flavor is a different can or bag. */
const FLAVOR = new Set([
  'BAJA', 'CABO', 'CITRUS', 'ZERO', 'DIET', 'CHERRY', 'LIME', 'LEMON', 'GRAPE', 'ORANGE',
  'STRAWBERRY', 'MANGO', 'RASPBERRY', 'BLUEBERRY', 'PEACH', 'BERRY', 'TROPICAL', 'REAL',
  'WATERMELON', 'PINEAPPLE', 'COCONUT', 'APPLE', 'CINNAMON', 'MINT', 'SPICY', 'JALAPENO',
]);

const PET = new Set(['DOG', 'DOGS', 'CAT', 'CATS', 'PET', 'PUPPY', 'KITTEN', 'BIRD', 'JAC']);

const has = (list: string[], t: string) => list.some((x) => tokenMatch(t, x) > 0);
const named = (t: string) => !/\d/.test(t);

export type PhotoDecision = { use: boolean; reason: string };

export function decidePhoto(ourDescription: string, sinclairName: string): PhotoDecision {
  const ours = tokenize(ourDescription).filter(named);
  const theirs = tokenize(sinclairName).filter(named);
  if (!ours.length || !theirs.length) return { use: false, reason: 'Nothing to compare' };

  if (theirs.some((t) => PET.has(t)) && !ours.some((t) => PET.has(t))) {
    return { use: false, reason: 'Pet food' };
  }
  const missing = ours.filter((t) => !LOOSE.has(t) && !has(theirs, t));
  if (missing.length) return { use: false, reason: `Not in the match: ${missing.join(', ').toLowerCase()}` };

  const key = ours.filter((t) => !LOOSE.has(t));
  const extra = theirs.filter((t) => !LOOSE.has(t) && !has(ours, t));
  if (key.length < 2 && extra.length > 2) return { use: false, reason: 'Too little to go on' };

  const added = theirs.filter((t) => (KIND.has(t) || FLAVOR.has(t)) && !has(ours, t));
  // "HOT DOGS" names both HOT and DOGS; a lone HOT is a flavor, not a kind.
  const real = added.filter((t) => !(t === 'HOT' && !theirs.includes('DOGS')));
  if (real.length) return { use: false, reason: `Different item: ${real.join(', ').toLowerCase()}` };

  return { use: true, reason: 'Every word matches' };
}
