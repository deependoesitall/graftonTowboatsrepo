// src/lib/search-keywords.ts
//
// Auto-assigned search keywords for every catalog item.
//
// THE PROBLEM: product names are register shorthand, so what a cook TYPES and
// what the item is CALLED rarely line up:
//     types "pop"       → item is "PEPSI 12PK"
//     types "TP"        → item is "BATH TISSUE"
//     types "hamburger" → item is "GROUND CHUCK 80% LEAN"
//     types "veggies"   → item is "BROCCOLI FLORETS"
//
// Hand-writing keywords for ~1,100 items would take days and would go stale the
// moment Sinclair's adds something. Instead these RULES derive keywords from
// what an item actually is — so every product, including ones imported
// tonight, gets the right search words automatically.
//
// Admin-entered `tags` still work and are searched too; these rules are the
// baseline so nobody has to curate the common cases by hand.

interface KeywordRule {
  /** Matched against the product's name + category + form section. */
  when: RegExp;
  /** Extra words the item should be findable by. */
  add: string[];
}

/** Order doesn't matter — every matching rule contributes its keywords. */
export const KEYWORD_RULES: KeywordRule[] = [
  // ── Beverages ────────────────────────────────────────────────────────
  { when: /\b(pepsi|coke|coca.?cola|dr\.? ?pepper|mtn ?dew|mountain dew|sprite|7.?up|sierra mist|fanta|crush|squirt|barq)/i,
    add: ['pop', 'soda', 'cola', 'soft drink', 'can', 'bottle'] },
  { when: /\b(juice|jc|orange juice|apple juice|lemonade|punch|nectar)/i, add: ['juice', 'drink', 'beverage'] },
  { when: /\b(coffee|cffe|folgers|maxwell|community|dunkin)/i, add: ['coffee', 'brew', 'grounds', 'caffeine'] },
  { when: /\b(kcup|k.?cup|keurig|pod)/i, add: ['k cup', 'kcup', 'kcups', 'pods', 'single serve', 'coffee'] },
  { when: /\b(tea|lipton|nestea|snapple)/i, add: ['tea', 'drink'] },
  { when: /\b(water|aquafina|dasani|ozarka)/i, add: ['water', 'bottled water', 'drink'] },
  { when: /\b(gatorade|powerade|body ?armor|electrolyte|energy drink|monster|red bull)/i,
    add: ['sports drink', 'energy', 'gatorade', 'drink'] },
  { when: /\b(milk|mlk|buttermilk)/i, add: ['milk', 'dairy', 'drink'] },

  // ── Paper & cleaning (deck supplies) ─────────────────────────────────
  { when: /\b(bath tissue|toilet (paper|tissue)|charmin|angel soft|scott)/i,
    add: ['tp', 'toilet paper', 'bathroom', 'restroom', 'paper'] },
  { when: /\b(paper towel|towel|bounty|brawny|sparkle)/i, add: ['paper towels', 'towels', 'roll', 'cleanup'] },
  { when: /\b(kleenex|facial tissue|tissue|tiss)/i, add: ['kleenex', 'tissues', 'facial'] },
  { when: /\b(napkin)/i, add: ['napkins', 'paper'] },
  { when: /\b(trash|garbage|can liner|hefty|glad bag)/i, add: ['trash bags', 'garbage bags', 'liners'] },
  { when: /\b(detergent|dtrgnt|tide|gain|persil|laundry)/i, add: ['laundry', 'detergent', 'soap', 'washing'] },
  { when: /\b(dish (soap|liquid)|dawn|palmolive|cascade)/i, add: ['dish soap', 'dishes', 'sink', 'cleaning'] },
  { when: /\b(bleach|clorox|lysol|disinfect|pine.?sol|comet|ajax|cleaner)/i,
    add: ['cleaning', 'cleaner', 'disinfectant', 'sanitize'] },
  { when: /\b(foil|aluminum|saran|plastic wrap|cling|zip ?loc|ziploc|storage bag|freezer bag|baggie)/i,
    add: ['wrap', 'storage', 'bags', 'kitchen'] },
  { when: /\b(paper (plate|cup)|styrofoam|solo cup|plasticware|cutlery|utensil)/i,
    add: ['disposable', 'paper plates', 'cups', 'plasticware'] },

  // ── Meat ─────────────────────────────────────────────────────────────
  { when: /\b(ground (chuck|beef|round)|hamburger|hmbrgr|patty|patties)/i,
    add: ['hamburger', 'burger', 'ground beef', 'beef', 'meat'] },
  { when: /\b(steak|ribeye|sirloin|t.?bone|new york strip|filet|porterhouse)/i,
    add: ['steak', 'beef', 'meat', 'grill'] },
  { when: /\b(roast|brisket|chuck|rump|round)/i, add: ['roast', 'beef', 'meat'] },
  { when: /\b(bacon|sausage|saus|sasg|link|patty)/i, add: ['bacon', 'sausage', 'breakfast', 'pork', 'meat'] },
  { when: /\b(ham|pork|chop|loin|rib|butt|jowl|hock)/i, add: ['pork', 'meat'] },
  { when: /\b(chicken|chkn|ckn|poultry|wing|thigh|drumstick|fryer|hen)/i,
    add: ['chicken', 'poultry', 'meat'] },
  { when: /\b(turkey|butterball)/i, add: ['turkey', 'poultry', 'meat'] },
  { when: /\b(hot ?dog|frank|wiener|weenie|coney)/i, add: ['hot dogs', 'franks', 'wieners', 'cookout'] },
  { when: /\b(lunch ?meat|deli meat|bologna|salami|pastrami|sliced turkey|sliced ham)/i,
    add: ['lunch meat', 'deli', 'sandwich', 'cold cuts'] },
  { when: /\b(fish|salmon|tilapia|catfish|cod|shrimp|crab|lobster|scallop|seafood|roughy)/i,
    add: ['seafood', 'fish'] },

  // ── Produce ──────────────────────────────────────────────────────────
  { when: /\b(lettuce|spinach|kale|cabbage|broccoli|cauliflower|celery|carrot|pepper|onion|cucumber|squash|zucchini|bean|pea|corn|asparagus|mushroom)/i,
    add: ['vegetable', 'veggies', 'produce', 'fresh'] },
  { when: /\b(apple|banana|orange|grape|berry|strawberry|blueberry|melon|watermelon|cantaloupe|peach|pear|plum|pineapple|lemon|lime|mango)/i,
    add: ['fruit', 'fresh', 'produce'] },
  { when: /\b(potato|russet|yukon|idaho)/i, add: ['potatoes', 'spuds', 'produce'] },
  { when: /\b(salad|slaw|coleslaw)/i, add: ['salad', 'greens', 'produce'] },

  // ── Dairy & eggs ─────────────────────────────────────────────────────
  { when: /\b(egg)/i, add: ['eggs', 'breakfast', 'dairy'] },
  { when: /\b(cheese|chs|cheddar|chdr|mozz|swiss|colby|jack|american|provolone|gouda|parmesan)/i,
    add: ['cheese', 'dairy'] },
  { when: /\b(butter|btr|margarine|oleo)/i, add: ['butter', 'dairy', 'spread'] },
  { when: /\b(yogurt|yog|yoplait|yop|greek)/i, add: ['yogurt', 'dairy', 'snack'] },
  { when: /\b(cream|crm|creamer|half.?and.?half|whipped)/i, add: ['cream', 'creamer', 'dairy', 'coffee'] },
  { when: /\b(sour cream|cream cheese)/i, add: ['sour cream', 'cream cheese', 'dairy'] },

  // ── Bakery & breakfast ───────────────────────────────────────────────
  { when: /\b(bread|brd|loaf|bun|roll|rls|bagel|biscuit|croissant|tortilla|pita)/i,
    add: ['bread', 'bakery', 'sandwich'] },
  { when: /\b(cereal|oatmeal|granola|cheerio|frosted|life|grits)/i, add: ['cereal', 'breakfast'] },
  { when: /\b(pancake|waffle|syrup|french toast)/i, add: ['pancakes', 'breakfast', 'syrup'] },
  { when: /\b(cake|pie|cookie|brownie|donut|doughnut|pastry|muffin|cupcake|dessert)/i,
    add: ['dessert', 'sweets', 'bakery', 'treat'] },

  // ── Pantry / cooking ─────────────────────────────────────────────────
  { when: /\b(flour|flr|sugar|sgr|baking|yeast|yst|corn ?starch|vanilla|van)/i,
    add: ['baking', 'pantry'] },
  { when: /\b(oil|crisco|shortening|pam|cooking spray)/i, add: ['cooking oil', 'grease', 'fry', 'pantry'] },
  { when: /\b(ketchup|mustard|mayo|mayonnaise|relish|bbq|barbecue|hot sauce|sauce|dressing|ranch|vinegar)/i,
    add: ['condiment', 'sauce', 'topping'] },
  { when: /\b(salt|pepper|seasoning|spice|garlic|cumin|paprika|chili powder|cajun|lawry)/i,
    add: ['seasoning', 'spices', 'salt', 'pepper'] },
  { when: /\b(pasta|spaghetti|noodle|macaroni|penne|lasagna|ramen)/i, add: ['pasta', 'noodles', 'dinner'] },
  { when: /\b(rice|beans|lentil)/i, add: ['rice', 'beans', 'side'] },
  { when: /\b(soup|broth|stock|chili|stew)/i, add: ['soup', 'canned', 'lunch'] },
  { when: /\b(can|canned|del monte|green giant)/i, add: ['canned goods', 'pantry'] },

  // ── Snacks & frozen ──────────────────────────────────────────────────
  { when: /\b(chip|crisp|dorito|lay|frito|pretzel|popcorn|cracker|nut|peanut|trail mix)/i,
    add: ['snacks', 'chips', 'munchies'] },
  { when: /\b(candy|chocolate|choc|m ?& ?m|snickers|hershey|gum|mint)/i, add: ['candy', 'sweets', 'snack'] },
  { when: /\b(ice cream|popsicle|frozen (yogurt|treat)|sherbet|blue bell)/i,
    add: ['ice cream', 'frozen', 'dessert'] },
  { when: /\b(pizza|pza|totino|digiorno|red baron|tombstone)/i, add: ['pizza', 'frozen', 'dinner'] },
  { when: /\b(frozen|frz|hash ?brown|tater|fries|french fry|nugget|ngt)/i, add: ['frozen', 'freezer'] },

  // ── Health & personal ────────────────────────────────────────────────
  { when: /\b(tylenol|advil|ibuprofen|aspirin|aleve|pain relief|medicine|antacid|tums|pepto|benadryl|neosporin|band.?aid|bandage|first aid)/i,
    add: ['medicine', 'first aid', 'health', 'pharmacy'] },
  { when: /\b(shampoo|soap|body wash|deodorant|toothpaste|toothbrush|razor|shave|lotion)/i,
    add: ['personal care', 'toiletries', 'hygiene'] },
  { when: /\b(battery|batteries|duracell|energizer)/i, add: ['batteries', 'supplies'] },
];

/** Derive the extra search words for one product. */
export function keywordsFor(text: string): string[] {
  const out = new Set<string>();
  for (const rule of KEYWORD_RULES) {
    if (rule.when.test(text)) for (const k of rule.add) out.add(k);
  }
  return Array.from(out);
}
