-- Migration 020: Recategorize products based on Sinclair Foods catalogue
-- Fixes category assignments using description-based matching from catalogue sections.
-- Run in Supabase SQL editor.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rename "Frozen Foods" → "Frozen Goods"
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE products
SET category = 'Frozen Goods'
WHERE category = 'Frozen Foods';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Move frozen seafood / poultry / smoked meat from Meat & Seafood → Frozen Goods
--    (Catalogue sections: FROZEN FISH/SEAFOOD, FROZEN POULTRY, FROZEN SMOKED MEAT)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE products
SET category = 'Frozen Goods'
WHERE category = 'Meat & Seafood'
  AND (
    description ILIKE '%FROG LEG%'
    OR description ILIKE '%PERCH FILLET%'
    OR description ILIKE '%SALMON FILLET%'
    OR description ILIKE '%TALAPIA%'
    OR description ILIKE '%TILAPIA%'
    OR description ILIKE '%CRAB LEG%'
    OR description ILIKE '%CATFISH FILLET%'
    OR description ILIKE '%ORANGE ROUGHY%'
    OR description ILIKE '%COD LOIN%'
    OR description ILIKE '%BREADED COD%'
    OR description ILIKE '%SHRIMP BREADED%'
    OR description ILIKE '%BREADED SHRIMP%'
    -- Frozen poultry
    OR description ILIKE '%TYS BNL%'
    OR description ILIKE '%CHICKEN BREADED PATT%'
    OR description ILIKE '%CHICKEN LEG QTR%'
    OR description ILIKE '%HOT WINGS%'
    OR description ILIKE '%CKN BRST STRIP%'
    OR description ILIKE '%CHICKEN BREAST STRIP%'
    OR description ILIKE '%FAJITA MEAT CHICKEN%'
    OR description ILIKE '%FAJITA CHICKEN%'
    OR description ILIKE '%CORNISH HEN%'
    -- Frozen smoked meat
    OR description ILIKE '%SWAGGERTY%'
    OR description ILIKE '%OLD FOLKS SAUSAGE%'
    OR description ILIKE '%OLD FOLKS LINK%'
    OR description ILIKE '%CORN DOG%'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Move Household & Cleaning items from Pantry & Grocery → Household & Cleaning
--    (Catalogue sections: CLEANING SUPPLIES, LAUNDRY DETERGENT, SOAPS, PAPER TOWELS,
--     BATH TISSUE, STORAGE, TRASH BAGS, EATING/DRINKING UTENSILS, INSECTICIDE, CHARCOAL)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE products
SET category = 'Household & Cleaning'
WHERE category = 'Pantry & Grocery'
  AND (
    -- Cleaning supplies
    description ILIKE '%FABULOSO%'
    OR description ILIKE '%FEBREZE%'
    OR description ILIKE '%FABREEZE%'
    OR description ILIKE '%MURPHY%OIL SOAP%'
    OR description ILIKE '%SCRUBBING BUBBLES%'
    OR description ILIKE '%409 ALL PURPOSE%'
    OR description ILIKE '%SPRAY N WASH%'
    OR description ILIKE '%WINDEX%'
    OR description ILIKE '%LYSOL ALL PURPOSE%'
    OR description ILIKE '%LYSOL DISINFECT%'
    OR description ILIKE '%LYSOL SPRAY%'
    OR description ILIKE '%COMET%'
    OR description ILIKE '%SOS PAD%'
    OR description ILIKE '%S.O.S%'
    OR description ILIKE '%SPRAYWAY%'
    OR description ILIKE '%WIEMAN%STAINLESS%'
    OR description ILIKE '%STAINLESS STEEL CLEANER%'
    OR description ILIKE '%KITCHEN SCRUBBER%'
    OR description ILIKE '%SPONGE%'
    OR description ILIKE '%STEEL SCRUBBER%'
    OR description ILIKE '%COPPER SCRUBBER%'
    OR description ILIKE '%SCOURING PAD%'
    OR description ILIKE '%NITRIL GLOVE%'
    OR description ILIKE '%NITRILE GLOVE%'
    OR description ILIKE '%VINYL GLOVE%'
    OR description ILIKE '%RID-X%'
    OR description ILIKE '%RIDX%'
    OR description ILIKE '%DRAINO%'
    OR description ILIKE '%DRANO%'
    OR description ILIKE '%CLOROX BLEACH%'
    OR description ILIKE '%CLOROX WIPE%'
    OR description ILIKE '%MEAN GREEN%'
    OR description ILIKE '%RENUZIT%'
    OR description ILIKE '%GLADE AIR%'
    OR description ILIKE '%GLADE%FRESHEN%'
    OR description ILIKE '%MOP HANDLE%'
    OR description ILIKE '%MOP HEAD%'
    OR description ILIKE '%BROOM%'
    OR description ILIKE '%DUST PAN%'
    OR description ILIKE '%DUSTPAN%'
    OR description ILIKE '%AMONIA%'
    OR description ILIKE '%AMMONIA%'
    -- Laundry detergent
    OR description ILIKE '%DOWNY%'
    OR description ILIKE '%GAIN POD%'
    OR description ILIKE '%GAIN ORIGINAL%'
    OR description ILIKE '%GAIN POWDER%'
    OR description ILIKE '%GAIN DRYER%'
    OR description ILIKE '%TIDE POD%'
    OR description ILIKE '%TIDE ORIGINAL%'
    OR description ILIKE '%TIDE LIQUID%'
    OR description ILIKE '%ARM & HAMMER CLEAR%'
    OR description ILIKE '%ARM%HAMMER%LAUNDRY%'
    OR description ILIKE '%DRYER SHEET%'
    -- Soaps
    OR description ILIKE '%DAWN DISH%'
    OR description ILIKE '%GAIN DISH%'
    OR description ILIKE '%CASCADE%'
    OR description ILIKE '%SUAVE BODY WASH%'
    OR description ILIKE '%BAR SOAP%'
    -- Paper towels
    OR description ILIKE '%BOUNTY%'
    OR description ILIKE '%VIVA%PAPER%'
    OR description ILIKE '%VIVA TOWEL%'
    -- Bath tissue
    OR description ILIKE '%CHARMIN%'
    OR description ILIKE '%ANGEL SOFT%'
    OR description ILIKE '%COTTONELLE%'
    OR description ILIKE '%TORK%TISSUE%'
    OR description ILIKE '%TORK%BATH%'
    OR description ILIKE '%SCOTT%TISSUE%'
    OR description ILIKE '%SCOTT%BATH%'
    OR description ILIKE '%BATH TISSUE%'
    OR description ILIKE '%TOILET PAPER%'
    -- Storage / wrap
    OR description ILIKE '%PLASTIC WRAP%'
    OR description ILIKE '%HEAVY DUTY FOIL%'
    OR description ILIKE '%ALUMINUM FOIL%'
    OR description ILIKE '%FREEZER PAPER%'
    OR description ILIKE '%PARCHMENT PAPER%'
    OR description ILIKE '%ZIPLOC%'
    OR description ILIKE '%ZIP LOC%'
    -- Trash bags
    OR description ILIKE '%HEFTY%'
    OR description ILIKE '%GLAD FORCE FLEX%'
    OR description ILIKE '%TRASH BAG%'
    OR description ILIKE '%GARBAGE BAG%'
    -- Eating / drinking utensils / disposables
    OR description ILIKE '%CHINET%'
    OR description ILIKE '%PLASTIC STRAW%'
    OR description ILIKE '%TOOTHPICK%'
    OR description ILIKE '%BOUNTY NAPKIN%'
    OR description ILIKE '%HOT PAPER CUP%'
    OR description ILIKE '%PAPER CUP%'
    OR description ILIKE '%FOAM CUP%'
    OR description ILIKE '%STYROFOAM CUP%'
    OR description ILIKE '%PLASTIC FORK%'
    OR description ILIKE '%PLASTIC SPOON%'
    OR description ILIKE '%PLASTIC KNIFE%'
    OR description ILIKE '%DISPOSABLE PLATE%'
    OR description ILIKE '%PAPER PLATE%'
    -- Charcoal / grilling
    OR description ILIKE '%LIGHTER FLUID%'
    OR description ILIKE '%KINGSFORD%'
    OR description ILIKE '%CHARCOAL%'
    OR description ILIKE '%WOOD PELLET%'
    OR description ILIKE '%SMOKING CHIP%'
    OR description ILIKE '%BIC LIGHTER%'
    OR description ILIKE '%MATCH%BOOK%'
    OR description ILIKE '%BEST CHOICE MATCH%'
    -- Insecticide / pest control
    OR (description ILIKE '%OFF%DEEP WOOD%' OR description ILIKE '%OFF ACTIVE%' OR description ILIKE '%OFF INSECT%')
    OR description ILIKE '%RAID%WASP%'
    OR description ILIKE '%RAID%ANT%'
    OR description ILIKE '%HOT SHOT%FLEA%'
    OR description ILIKE '%MOUSE TRAP%'
    OR description ILIKE '%INSECT REPEL%'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Move Health & Personal care from Pantry & Grocery → Health & Personal
--    (Catalogue section: MEDICINE / FIRST AID)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE products
SET category = 'Health & Personal'
WHERE category = 'Pantry & Grocery'
  AND (
    description ILIKE '%RUBBING ALCOHOL%'
    OR description ILIKE '%HYDROGEN PEROXIDE%'
    OR description ILIKE '%PEROXIDE%'
    OR description ILIKE '%NEOSPORIN%'
    OR description ILIKE '%PETROLEUM JELLY%'
    OR description ILIKE '%VASELINE%'
    OR description ILIKE '%BAND-AID%'
    OR description ILIKE '%BANDAID%'
    OR description ILIKE '%BANDAGE%'
    OR description ILIKE '%BC POWDER%'
    OR description ILIKE '%ALKA SELTZER%'
    OR description ILIKE '%TYLENOL%'
    OR description ILIKE '%ALEVE%'
    OR description ILIKE '%TUMS%'
    OR description ILIKE '%FOOT POWDER%'
    OR description ILIKE '%Q-TIP%'
    OR description ILIKE '%QTIP%'
    OR description ILIKE '%COTTON SWAB%'
    OR description ILIKE '%HALLS%COUGH%'
    OR description ILIKE '%COUGH DROP%'
    OR description ILIKE '%FIRST AID%'
    OR description ILIKE '%IBUPROFEN%'
    OR description ILIKE '%ASPIRIN%'
    OR description ILIKE '%ADVIL%'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Move Beverages from Pantry & Grocery → Beverages
--    (Catalogue sections: SOFT DRINKS, SPORTS DRINKS, ENERGY DRINKS,
--     WATER, WATER MODIFIERS, JUICES - SHELF STABLE)
--    Only moves items clearly identifiable as beverages that ended up miscategorized.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE products
SET category = 'Beverages'
WHERE category = 'Pantry & Grocery'
  AND (
    description ILIKE '%COCA COLA%'
    OR description ILIKE '%COKE%'
    OR description ILIKE '%DR PEPPER%'
    OR description ILIKE '%PEPSI%'
    OR description ILIKE '%MOUNTAIN DEW%'
    OR description ILIKE '%MTN DEW%'
    OR description ILIKE '%SPRITE%'
    OR description ILIKE '%7UP%'
    OR description ILIKE '%7 UP%'
    OR description ILIKE '%ROOT BEER%'
    OR description ILIKE '%GINGER ALE%'
    OR description ILIKE '%LEMON LIME SODA%'
    OR description ILIKE '%ORANGE SODA%'
    OR description ILIKE '%GRAPE SODA%'
    OR description ILIKE '%CLUB SODA%'
    OR description ILIKE '%SPARKLING WATER%'
    OR description ILIKE '%GATORADE%'
    OR description ILIKE '%POWERADE%'
    OR description ILIKE '%BODY ARMOR%'
    OR description ILIKE '%RED BULL%'
    OR description ILIKE '%MONSTER ENERGY%'
    OR description ILIKE '%BANG ENERGY%'
    OR description ILIKE '%CELSIUS%ENERGY%'
    OR description ILIKE '%5 HOUR ENERGY%'
    OR description ILIKE '%BOTTLED WATER%'
    OR description ILIKE '%WATER BOTTLE%'
    OR description ILIKE '%DASANI%'
    OR description ILIKE '%AQUAFINA%'
    OR description ILIKE '%CRYSTAL LIGHT%'
    OR description ILIKE '%MIO WATER%'
    OR description ILIKE '%DRINK MIX%'
    OR description ILIKE '%LEMONADE%'
    OR description ILIKE '%APPLE JUICE%'
    OR description ILIKE '%ORANGE JUICE%'
    OR description ILIKE '%CRANBERRY JUICE%'
    OR description ILIKE '%GRAPE JUICE%'
    OR description ILIKE '%V8 JUICE%'
    OR description ILIKE '%V8 SPLASH%'
    OR description ILIKE '%FRUIT PUNCH%'
    OR description ILIKE '%ICED TEA%'
    OR description ILIKE '%ICE TEA%'
    OR description ILIKE '%SWEET TEA%'
    OR description ILIKE '%LIPTON TEA%'
    OR description ILIKE '%SNAPPLE%'
    OR description ILIKE '%KOOL AID%'
    OR description ILIKE '%KOOL-AID%'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Move Snacks & Sweets from Pantry & Grocery (if any slipped through)
--    (Catalogue sections: SNACKS-COOKIES, SNACKS-CRACKERS, SNACKS-CHIPS,
--     SNACKS-PEANUTS/POPCORN, LITTLE DEBBIE, HOSTESS)
--    Note: most snacks should already be in Snacks & Sweets — this catches stragglers.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE products
SET category = 'Snacks & Sweets'
WHERE category = 'Pantry & Grocery'
  AND (
    description ILIKE '%LITTLE DEBBIE%'
    OR description ILIKE '%HOSTESS%'
    OR description ILIKE '%TWINKIES%'
    OR description ILIKE '%DING DONG%'
    OR description ILIKE '%HO HO%'
    OR description ILIKE '%OATMEAL CREAM PIE%'
    OR description ILIKE '%NUTTY BAR%'
    OR description ILIKE '%SWISS ROLL%'
    OR description ILIKE '%HONEY BUN%'
    OR description ILIKE '%DONUT%'
    OR description ILIKE '%MOON PIE%'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Verify counts after migration (optional — run separately to check)
-- SELECT category, COUNT(*) FROM products GROUP BY category ORDER BY category;
-- ─────────────────────────────────────────────────────────────────────────────
