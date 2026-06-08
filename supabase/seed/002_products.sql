-- ============================================================
-- Grafton Towboat Services — Product Seed Data
-- Based on Sinclair Foods style catalog for towboat crews
-- Run AFTER 001_initial_schema.sql
-- ============================================================

-- NOTE: When you receive the actual .xlsx/.csv/.tsv files from the client,
-- use the CSV Import tool in /admin/products to upload them.
-- This seed provides representative sample data to get started immediately.

INSERT INTO products (category, sub_category, upc, description, pkg_size, uom, price) VALUES

-- ============================================================
-- MEAT & SEAFOOD
-- ============================================================
('Meat & Seafood', 'BEEF', '024000160428', 'GROUND BEEF 73/27 BULK', '10 LB', 'CS', 28.99),
('Meat & Seafood', 'BEEF', '024000160435', 'GROUND BEEF 80/20 PATTIES 4OZ', '10 LB', 'CS', 34.99),
('Meat & Seafood', 'BEEF', '024000160442', 'RIBEYE STEAKS 10-12 OZ', '10 LB', 'CS', 89.99),
('Meat & Seafood', 'BEEF', '024000160459', 'T-BONE STEAKS 12-14 OZ', '10 LB', 'CS', 84.99),
('Meat & Seafood', 'BEEF', '024000160466', 'NY STRIP STEAKS 10-12 OZ', '10 LB', 'CS', 82.99),
('Meat & Seafood', 'BEEF', '024000160473', 'CHUCK ROAST BONELESS', '5 LB', 'EA', 18.99),
('Meat & Seafood', 'BEEF', '024000160480', 'BEEF STEW MEAT CUBED', '5 LB', 'EA', 22.99),
('Meat & Seafood', 'BEEF', '024000160497', 'HOT DOGS ALL BEEF 8/1', '3 LB', 'PKG', 9.99),
('Meat & Seafood', 'PORK', '024000161005', 'PORK CHOPS BONE-IN THICK CUT', '10 LB', 'CS', 32.99),
('Meat & Seafood', 'PORK', '024000161012', 'PORK LOIN BONELESS', '8 LB', 'EA', 24.99),
('Meat & Seafood', 'PORK', '024000161019', 'BACON SLICED 1 LB PACK', '15 LB', 'CS', 44.99),
('Meat & Seafood', 'PORK', '024000161026', 'SAUSAGE LINKS BREAKFAST', '5 LB', 'PKG', 14.99),
('Meat & Seafood', 'PORK', '024000161033', 'SAUSAGE BULK MILD ITALIAN', '5 LB', 'PKG', 13.99),
('Meat & Seafood', 'PORK', '024000161040', 'HAM WHOLE BONE-IN', '12 LB', 'EA', 29.99),
('Meat & Seafood', 'POULTRY', '024000162001', 'CHICKEN BREAST BONELESS SKINLESS', '10 LB', 'CS', 26.99),
('Meat & Seafood', 'POULTRY', '024000162008', 'CHICKEN THIGHS BONE-IN', '10 LB', 'CS', 18.99),
('Meat & Seafood', 'POULTRY', '024000162015', 'CHICKEN WINGS WHOLE', '10 LB', 'CS', 22.99),
('Meat & Seafood', 'POULTRY', '024000162022', 'WHOLE CHICKEN 4-5 LB', '4 LB', 'EA', 7.99),
('Meat & Seafood', 'POULTRY', '024000162029', 'TURKEY BREAST BONELESS', '6 LB', 'EA', 18.99),
('Meat & Seafood', 'POULTRY', '024000162036', 'GROUND TURKEY 93/7', '3 LB', 'PKG', 10.99),
('Meat & Seafood', 'SEAFOOD', '024000163001', 'SHRIMP JUMBO 16/20 FROZEN RAW', '5 LB', 'CS', 38.99),
('Meat & Seafood', 'SEAFOOD', '024000163008', 'CATFISH FILLETS FRESH', '5 LB', 'CS', 24.99),
('Meat & Seafood', 'SEAFOOD', '024000163015', 'TILAPIA FILLETS FROZEN', '5 LB', 'CS', 16.99),
('Meat & Seafood', 'SEAFOOD', '024000163022', 'SALMON FILLETS FRESH ATLANTIC', '5 LB', 'CS', 44.99),
('Meat & Seafood', 'LUNCHMEAT', '024000164001', 'BOLOGNA SLICED 1 LB', '1 LB', 'PKG', 3.49),
('Meat & Seafood', 'LUNCHMEAT', '024000164008', 'TURKEY BREAST SLICED DELI', '1 LB', 'PKG', 5.99),
('Meat & Seafood', 'LUNCHMEAT', '024000164015', 'HAM SLICED HONEY', '1 LB', 'PKG', 5.49),
('Meat & Seafood', 'LUNCHMEAT', '024000164022', 'SALAMI HARD SLICED', '1 LB', 'PKG', 5.99),

-- ============================================================
-- DAIRY & EGGS
-- ============================================================
('Dairy & Eggs', 'DAIRY - MILK', '011110871015', 'WHOLE MILK GALLON', '1 GAL', 'EA', 3.99),
('Dairy & Eggs', 'DAIRY - MILK', '011110871022', '2% MILK GALLON', '1 GAL', 'EA', 3.89),
('Dairy & Eggs', 'DAIRY - MILK', '011110871039', 'SKIM MILK GALLON', '1 GAL', 'EA', 3.69),
('Dairy & Eggs', 'DAIRY - CHEESE', '011110872001', 'AMERICAN CHEESE SLICED 2 LB', '2 LB', 'PKG', 7.99),
('Dairy & Eggs', 'DAIRY - CHEESE', '011110872008', 'CHEDDAR CHEESE BLOCK SHARP', '2 LB', 'EA', 8.99),
('Dairy & Eggs', 'DAIRY - CHEESE', '011110872015', 'MOZZARELLA SHREDDED', '5 LB', 'CS', 16.99),
('Dairy & Eggs', 'DAIRY - CHEESE', '011110872022', 'PARMESAN GRATED', '3 LB', 'CS', 18.99),
('Dairy & Eggs', 'DAIRY - CHEESE', '011110872029', 'PEPPER JACK SLICED', '2 LB', 'PKG', 8.49),
('Dairy & Eggs', 'DAIRY - BUTTER', '011110873001', 'BUTTER UNSALTED 4 STICKS', '1 LB', 'PKG', 5.49),
('Dairy & Eggs', 'DAIRY - BUTTER', '011110873008', 'BUTTER SALTED 4 STICKS', '1 LB', 'PKG', 5.49),
('Dairy & Eggs', 'DAIRY - BUTTER', '011110873015', 'MARGARINE STICK 4PK', '1 LB', 'PKG', 2.99),
('Dairy & Eggs', 'EGGS', '011110874001', 'EGGS LARGE GRADE A DOZEN', '1 DOZ', 'EA', 3.49),
('Dairy & Eggs', 'EGGS', '011110874008', 'EGGS LARGE GRADE A 18-CT', '18 CT', 'EA', 4.99),
('Dairy & Eggs', 'DAIRY - SOUR CREAM', '011110875001', 'SOUR CREAM 16 OZ', '16 OZ', 'EA', 2.49),
('Dairy & Eggs', 'DAIRY - YOGURT', '011110876001', 'YOGURT PLAIN GREEK 32 OZ', '32 OZ', 'EA', 5.49),
('Dairy & Eggs', 'DAIRY - CREAM', '011110877001', 'HEAVY WHIPPING CREAM PINT', '16 OZ', 'EA', 3.99),
('Dairy & Eggs', 'DAIRY - CREAM CHEESE', '011110878001', 'CREAM CHEESE BLOCK 8 OZ', '8 OZ', 'EA', 2.99),

-- ============================================================
-- PRODUCE
-- ============================================================
('Produce', 'PRODUCE - VEGETABLES', '033300000011', 'POTATOES RUSSET 10 LB BAG', '10 LB', 'BAG', 6.99),
('Produce', 'PRODUCE - VEGETABLES', '033300000028', 'ONIONS YELLOW 3 LB BAG', '3 LB', 'BAG', 2.99),
('Produce', 'PRODUCE - VEGETABLES', '033300000035', 'CABBAGE GREEN HEAD', '3 LB', 'EA', 2.49),
('Produce', 'PRODUCE - VEGETABLES', '033300000042', 'CARROTS 5 LB BAG', '5 LB', 'BAG', 3.49),
('Produce', 'PRODUCE - VEGETABLES', '033300000059', 'CELERY BUNCH', '1 EA', 'EA', 1.99),
('Produce', 'PRODUCE - VEGETABLES', '033300000066', 'BROCCOLI FLORETS', '3 LB', 'BAG', 5.49),
('Produce', 'PRODUCE - VEGETABLES', '033300000073', 'ROMAINE LETTUCE 3-PK', '3 CT', 'PKG', 4.99),
('Produce', 'PRODUCE - VEGETABLES', '033300000080', 'ICEBERG LETTUCE HEAD', '1 EA', 'EA', 1.79),
('Produce', 'PRODUCE - VEGETABLES', '033300000097', 'TOMATOES ROMA LB', '1 LB', 'LB', 1.49),
('Produce', 'PRODUCE - VEGETABLES', '033300000104', 'BELL PEPPERS GREEN LB', '1 LB', 'LB', 1.49),
('Produce', 'PRODUCE - VEGETABLES', '033300000111', 'MUSHROOMS SLICED 8 OZ', '8 OZ', 'PKG', 2.99),
('Produce', 'PRODUCE - VEGETABLES', '033300000128', 'CORN ON THE COB 6-CT', '6 CT', 'PKG', 3.99),
('Produce', 'PRODUCE - VEGETABLES', '033300000135', 'GREEN BEANS FRESH LB', '1 LB', 'LB', 1.99),
('Produce', 'PRODUCE - VEGETABLES', '033300000142', 'CUCUMBER EACH', '1 EA', 'EA', 0.99),
('Produce', 'PRODUCE - FRUIT', '033300001001', 'APPLES GALA 3 LB BAG', '3 LB', 'BAG', 4.99),
('Produce', 'PRODUCE - FRUIT', '033300001008', 'BANANAS LB', '1 LB', 'LB', 0.59),
('Produce', 'PRODUCE - FRUIT', '033300001015', 'ORANGES NAVEL 4 LB BAG', '4 LB', 'BAG', 4.99),
('Produce', 'PRODUCE - FRUIT', '033300001022', 'GRAPES RED SEEDLESS LB', '1 LB', 'LB', 2.49),
('Produce', 'PRODUCE - FRUIT', '033300001029', 'STRAWBERRIES 16 OZ', '1 LB', 'PKG', 3.99),
('Produce', 'PRODUCE - FRUIT', '033300001036', 'WATERMELON WHOLE', '14 LB', 'EA', 6.99),
('Produce', 'PRODUCE - FRUIT', '033300001043', 'LEMONS EACH', '1 EA', 'EA', 0.69),

-- ============================================================
-- FROZEN FOODS
-- ============================================================
('Frozen Foods', 'FROZEN - ENTREES', '044700021010', 'PIZZA PEPPERONI 12" FROZEN', '2 CT', 'PKG', 8.99),
('Frozen Foods', 'FROZEN - ENTREES', '044700021027', 'LASAGNA MEAT FROZEN FAMILY', '3 LB', 'EA', 7.99),
('Frozen Foods', 'FROZEN - ENTREES', '044700021034', 'POT PIES CHICKEN 4-CT', '4 CT', 'BOX', 5.99),
('Frozen Foods', 'FROZEN - ENTREES', '044700021041', 'BURRITOS BEEF FROZEN 12-CT', '12 CT', 'PKG', 8.49),
('Frozen Foods', 'FROZEN - VEGETABLES', '044700022001', 'CORN FROZEN 5 LB', '5 LB', 'BAG', 4.99),
('Frozen Foods', 'FROZEN - VEGETABLES', '044700022008', 'GREEN BEANS FROZEN 5 LB', '5 LB', 'BAG', 4.99),
('Frozen Foods', 'FROZEN - VEGETABLES', '044700022015', 'PEAS FROZEN 5 LB', '5 LB', 'BAG', 4.99),
('Frozen Foods', 'FROZEN - VEGETABLES', '044700022022', 'BROCCOLI FLORETS FROZEN 5 LB', '5 LB', 'BAG', 5.49),
('Frozen Foods', 'FROZEN - VEGETABLES', '044700022029', 'MIXED VEGETABLES FROZEN 5 LB', '5 LB', 'BAG', 4.79),
('Frozen Foods', 'FROZEN - POTATOES', '044700023001', 'FRENCH FRIES CRINKLE CUT 5 LB', '5 LB', 'BAG', 6.99),
('Frozen Foods', 'FROZEN - POTATOES', '044700023008', 'TATER TOTS FROZEN 5 LB', '5 LB', 'BAG', 6.99),
('Frozen Foods', 'FROZEN - POTATOES', '044700023015', 'HASH BROWN PATTIES 24-CT', '24 CT', 'BOX', 7.99),
('Frozen Foods', 'FROZEN - BREAKFAST', '044700024001', 'SAUSAGE BISCUITS FROZEN 12-CT', '12 CT', 'BOX', 8.99),
('Frozen Foods', 'FROZEN - BREAKFAST', '044700024008', 'PANCAKES FROZEN BUTTERMILK 48-CT', '48 CT', 'BOX', 9.99),
('Frozen Foods', 'FROZEN - FISH', '044700025001', 'FISH STICKS FROZEN 40-CT', '40 CT', 'BOX', 9.99),
('Frozen Foods', 'FROZEN - FISH', '044700025008', 'POPCORN SHRIMP FROZEN 2 LB', '2 LB', 'BAG', 11.99),
('Frozen Foods', 'FROZEN - MISC', '044700026001', 'ICE CREAM VANILLA 1.5 QT', '1.5 QT', 'CTR', 5.49),
('Frozen Foods', 'FROZEN - MISC', '044700026008', 'ICE CREAM CHOCOLATE 1.5 QT', '1.5 QT', 'CTR', 5.49),

-- ============================================================
-- BEVERAGES
-- ============================================================
('Beverages', 'BEVERAGES - WATER', '075720005010', 'WATER BOTTLED 24-PACK 16.9 OZ', '24 CT', 'CS', 5.99),
('Beverages', 'BEVERAGES - WATER', '075720005027', 'WATER GALLON JUG', '1 GAL', 'EA', 1.29),
('Beverages', 'BEVERAGES - SODA', '075720006001', 'COCA-COLA 12-PACK CANS', '12 CT', 'CS', 6.99),
('Beverages', 'BEVERAGES - SODA', '075720006008', 'PEPSI 12-PACK CANS', '12 CT', 'CS', 6.99),
('Beverages', 'BEVERAGES - SODA', '075720006015', 'DR PEPPER 12-PACK CANS', '12 CT', 'CS', 6.99),
('Beverages', 'BEVERAGES - SODA', '075720006022', 'MOUNTAIN DEW 12-PACK CANS', '12 CT', 'CS', 6.99),
('Beverages', 'BEVERAGES - SODA', '075720006029', 'SPRITE 12-PACK CANS', '12 CT', 'CS', 6.99),
('Beverages', 'BEVERAGES - SODA', '075720006036', 'ROOT BEER 12-PACK CANS', '12 CT', 'CS', 5.99),
('Beverages', 'BEVERAGES - COFFEE', '075720007001', 'COFFEE FOLGERS CLASSIC ROAST 48 OZ', '48 OZ', 'CAN', 10.99),
('Beverages', 'BEVERAGES - COFFEE', '075720007008', 'COFFEE MAXWELL HOUSE ORIGINAL 30.6 OZ', '30.6 OZ', 'CAN', 8.99),
('Beverages', 'BEVERAGES - COFFEE', '075720007015', 'COFFEE CREAMER FRENCH VANILLA 32 OZ', '32 OZ', 'BTL', 5.49),
('Beverages', 'BEVERAGES - TEA', '075720008001', 'TEA LIPTON 100-BAG BOX', '100 CT', 'BOX', 6.99),
('Beverages', 'BEVERAGES - TEA', '075720008008', 'SWEET TEA GALLON JUG', '1 GAL', 'EA', 2.99),
('Beverages', 'BEVERAGES - JUICE', '075720009001', 'ORANGE JUICE TROPICANA 89 OZ', '89 OZ', 'CTR', 5.99),
('Beverages', 'BEVERAGES - JUICE', '075720009008', 'APPLE JUICE 64 OZ', '64 OZ', 'BTL', 3.99),
('Beverages', 'BEVERAGES - ENERGY', '075720010001', 'GATORADE THIRST QUENCHER 32 OZ ASST', '12 CT', 'CS', 14.99),
('Beverages', 'BEVERAGES - ENERGY', '075720010008', 'RED BULL ENERGY 8.4 OZ 4-PACK', '4 CT', 'PKG', 8.99),

-- ============================================================
-- PANTRY & GROCERY
-- ============================================================
('Pantry & Grocery', 'GROCERY - BREAD', '072220003015', 'BREAD WHITE WONDER 20 OZ', '20 OZ', 'LF', 3.49),
('Pantry & Grocery', 'GROCERY - BREAD', '072220003022', 'BREAD WHOLE WHEAT 20 OZ', '20 OZ', 'LF', 3.69),
('Pantry & Grocery', 'GROCERY - BREAD', '072220003029', 'BUNS HAMBURGER 8-CT', '8 CT', 'PKG', 2.99),
('Pantry & Grocery', 'GROCERY - BREAD', '072220003036', 'BUNS HOT DOG 8-CT', '8 CT', 'PKG', 2.99),
('Pantry & Grocery', 'GROCERY - BREAD', '072220003043', 'TORTILLAS FLOUR 10" 10-CT', '10 CT', 'PKG', 3.49),
('Pantry & Grocery', 'GROCERY - CANNED', '072220004001', 'SOUP CAMPBELLS TOMATO 10.75 OZ 6-PK', '6 CT', 'CS', 6.99),
('Pantry & Grocery', 'GROCERY - CANNED', '072220004008', 'SOUP CHICKEN NOODLE 10.75 OZ 6-PK', '6 CT', 'CS', 7.49),
('Pantry & Grocery', 'GROCERY - CANNED', '072220004015', 'BEANS PORK AND BEANS 28 OZ 6-PK', '6 CT', 'CS', 10.99),
('Pantry & Grocery', 'GROCERY - CANNED', '072220004022', 'CORN CREAM STYLE 15.25 OZ 6-PK', '6 CT', 'CS', 5.99),
('Pantry & Grocery', 'GROCERY - CANNED', '072220004029', 'GREEN BEANS CUT 14.5 OZ 6-PK', '6 CT', 'CS', 5.99),
('Pantry & Grocery', 'GROCERY - CANNED', '072220004036', 'TOMATOES DICED 14.5 OZ 6-PK', '6 CT', 'CS', 7.49),
('Pantry & Grocery', 'GROCERY - CANNED', '072220004043', 'TUNA CHUNK LIGHT IN WATER 5 OZ 6-PK', '6 CT', 'CS', 8.99),
('Pantry & Grocery', 'GROCERY - CANNED', '072220004050', 'CHILI HORMEL NO BEANS 15 OZ 6-PK', '6 CT', 'CS', 12.99),
('Pantry & Grocery', 'GROCERY - PASTA', '072220005001', 'PASTA PENNE 1 LB', '1 LB', 'BOX', 1.49),
('Pantry & Grocery', 'GROCERY - PASTA', '072220005008', 'PASTA SPAGHETTI 1 LB', '1 LB', 'BOX', 1.49),
('Pantry & Grocery', 'GROCERY - PASTA', '072220005015', 'PASTA ELBOW MACARONI 2 LB', '2 LB', 'BOX', 2.49),
('Pantry & Grocery', 'GROCERY - PASTA', '072220005022', 'MAC AND CHEESE KRAFT DINNER 24-PK', '24 CT', 'CS', 17.99),
('Pantry & Grocery', 'GROCERY - RICE', '072220006001', 'RICE LONG GRAIN WHITE 5 LB', '5 LB', 'BAG', 4.99),
('Pantry & Grocery', 'GROCERY - RICE', '072220006008', 'RICE MINUTE INSTANT 28 OZ', '28 OZ', 'BOX', 4.99),
('Pantry & Grocery', 'GROCERY - CONDIMENTS', '072220007001', 'KETCHUP HEINZ 44 OZ', '44 OZ', 'BTL', 4.49),
('Pantry & Grocery', 'GROCERY - CONDIMENTS', '072220007008', 'MUSTARD YELLOW 20 OZ', '20 OZ', 'BTL', 2.49),
('Pantry & Grocery', 'GROCERY - CONDIMENTS', '072220007015', 'MAYONNAISE HELLMANS 30 OZ', '30 OZ', 'JAR', 5.99),
('Pantry & Grocery', 'GROCERY - CONDIMENTS', '072220007022', 'BBQ SAUCE SWEET BABY RAYS 40 OZ', '40 OZ', 'BTL', 4.99),
('Pantry & Grocery', 'GROCERY - CONDIMENTS', '072220007029', 'HOT SAUCE FRANKS RED HOT 12 OZ', '12 OZ', 'BTL', 3.49),
('Pantry & Grocery', 'GROCERY - CONDIMENTS', '072220007036', 'SOY SAUCE 10 OZ', '10 OZ', 'BTL', 2.49),
('Pantry & Grocery', 'GROCERY - OILS', '072220008001', 'VEGETABLE OIL 48 OZ', '48 OZ', 'BTL', 4.99),
('Pantry & Grocery', 'GROCERY - OILS', '072220008008', 'CANOLA OIL 48 OZ', '48 OZ', 'BTL', 4.99),
('Pantry & Grocery', 'GROCERY - OILS', '072220008015', 'OLIVE OIL EXTRA VIRGIN 17 OZ', '17 OZ', 'BTL', 7.99),
('Pantry & Grocery', 'GROCERY - BAKING', '072220009001', 'FLOUR ALL PURPOSE 5 LB', '5 LB', 'BAG', 3.99),
('Pantry & Grocery', 'GROCERY - BAKING', '072220009008', 'SUGAR GRANULATED 4 LB', '4 LB', 'BAG', 3.49),
('Pantry & Grocery', 'GROCERY - BAKING', '072220009015', 'PANCAKE MIX BUTTERMILK 32 OZ', '32 OZ', 'BOX', 4.49),
('Pantry & Grocery', 'GROCERY - BAKING', '072220009022', 'BISCUIT MIX BISQUICK 60 OZ', '60 OZ', 'BOX', 6.99),
('Pantry & Grocery', 'GROCERY - CEREAL', '072220010001', 'CHEERIOS HONEY NUT 19.5 OZ', '19.5 OZ', 'BOX', 5.49),
('Pantry & Grocery', 'GROCERY - CEREAL', '072220010008', 'FROSTED FLAKES 29.3 OZ', '29.3 OZ', 'BOX', 5.99),
('Pantry & Grocery', 'GROCERY - CEREAL', '072220010015', 'OATMEAL QUAKER INSTANT 18-PK', '18 CT', 'BOX', 6.99),

-- ============================================================
-- SNACKS & SWEETS
-- ============================================================
('Snacks & Sweets', 'SNACKS - CHIPS', '028400055031', 'LAYS CLASSIC POTATO CHIPS 8 OZ 6-PK', '6 CT', 'CS', 19.99),
('Snacks & Sweets', 'SNACKS - CHIPS', '028400055048', 'DORITOS NACHO CHEESE 9.25 OZ 6-PK', '6 CT', 'CS', 21.99),
('Snacks & Sweets', 'SNACKS - CHIPS', '028400055055', 'PRINGLES ORIGINAL 5.2 OZ 12-PK', '12 CT', 'CS', 24.99),
('Snacks & Sweets', 'SNACKS - CHIPS', '028400055062', 'FRITOS CORN CHIPS 9.25 OZ 6-PK', '6 CT', 'CS', 19.99),
('Snacks & Sweets', 'SNACKS - CRACKERS', '028400056001', 'SALTINE CRACKERS PREMIUM 3 LB', '3 LB', 'BOX', 6.99),
('Snacks & Sweets', 'SNACKS - CRACKERS', '028400056008', 'RITZ CRACKERS ORIGINAL 13.7 OZ', '13.7 OZ', 'BOX', 5.49),
('Snacks & Sweets', 'SNACKS - NUTS', '028400057001', 'PEANUTS SALTED DRY ROASTED 16 OZ', '16 OZ', 'JAR', 4.99),
('Snacks & Sweets', 'SNACKS - NUTS', '028400057008', 'MIXED NUTS PLANTER 15.25 OZ', '15.25 OZ', 'CAN', 7.99),
('Snacks & Sweets', 'SNACKS - CANDY', '028400058001', 'SNICKERS FULL SIZE 24-CT BOX', '24 CT', 'BOX', 21.99),
('Snacks & Sweets', 'SNACKS - CANDY', '028400058008', 'M&M PEANUT 12-CT', '12 CT', 'BOX', 16.99),
('Snacks & Sweets', 'SNACKS - COOKIES', '028400059001', 'OREOS CLASSIC 14.3 OZ 6-PK', '6 CT', 'CS', 19.99),
('Snacks & Sweets', 'SNACKS - COOKIES', '028400059008', 'CHIPS AHOY ORIGINAL 13 OZ', '13 OZ', 'PKG', 4.99),

-- ============================================================
-- HOUSEHOLD & CLEANING
-- ============================================================
('Household & Cleaning', 'PAPER - TOWELS', '036000000011', 'PAPER TOWELS BOUNTY SELECT-A-SIZE 12-PK', '12 CT', 'CS', 19.99),
('Household & Cleaning', 'PAPER - TISSUE', '036000001001', 'TOILET PAPER CHARMIN ULTRA SOFT 30-CT', '30 CT', 'CS', 21.99),
('Household & Cleaning', 'PAPER - PLATES', '036000002001', 'PLATES PAPER 9" 200-CT', '200 CT', 'PKG', 9.99),
('Household & Cleaning', 'PAPER - CUPS', '036000003001', 'CUPS STYROFOAM 8 OZ 250-CT', '250 CT', 'PKG', 8.99),
('Household & Cleaning', 'PAPER - CUPS', '036000003008', 'CUPS PLASTIC 16 OZ 50-CT', '50 CT', 'PKG', 4.99),
('Household & Cleaning', 'PAPER - BAGS', '036000004001', 'PLASTIC BAGS GALLON ZIP 50-CT', '50 CT', 'BOX', 4.99),
('Household & Cleaning', 'PAPER - BAGS', '036000004008', 'TRASH BAGS HEAVY DUTY 30-GAL 50-CT', '50 CT', 'BOX', 11.99),
('Household & Cleaning', 'PAPER - BAGS', '036000004015', 'TRASH BAGS TALL KITCHEN 13-GAL 80-CT', '80 CT', 'BOX', 9.99),
('Household & Cleaning', 'PAPER - WRAP', '036000005001', 'ALUMINUM FOIL HEAVY DUTY 75 FT', '75 FT', 'ROLL', 5.99),
('Household & Cleaning', 'PAPER - WRAP', '036000005008', 'PLASTIC WRAP CLING WRAP 200 FT', '200 FT', 'ROLL', 3.99),
('Household & Cleaning', 'CLEAN - DISH', '036000006001', 'DISH SOAP DAWN ORIGINAL 38 OZ', '38 OZ', 'BTL', 5.99),
('Household & Cleaning', 'CLEAN - DISH', '036000006008', 'SPONGES SCRUB DADDY 3-PK', '3 CT', 'PKG', 5.99),
('Household & Cleaning', 'CLEAN - LAUNDRY', '036000007001', 'LAUNDRY DETERGENT TIDE PODS 42-CT', '42 CT', 'PKG', 14.99),
('Household & Cleaning', 'CLEAN - LAUNDRY', '036000007008', 'FABRIC SOFTENER DOWNY 90 OZ', '90 OZ', 'BTL', 10.99),
('Household & Cleaning', 'CLEAN - SURFACE', '036000008001', 'LYSOL SPRAY DISINFECTANT 19 OZ 2-PK', '2 CT', 'PKG', 9.99),
('Household & Cleaning', 'CLEAN - SURFACE', '036000008008', 'CLOROX WIPES 75-CT 2-PK', '2 CT', 'PKG', 9.99),

-- ============================================================
-- HEALTH & PERSONAL CARE
-- ============================================================
('Health & Personal Care', 'PERSONAL CARE - SOAP', '037000000011', 'SOAP BAR IRISH SPRING 12-PK', '12 CT', 'CS', 9.99),
('Health & Personal Care', 'PERSONAL CARE - SHAMPOO', '037000001001', 'SHAMPOO HEAD SHOULDERS 29.2 OZ', '29.2 OZ', 'BTL', 8.99),
('Health & Personal Care', 'PERSONAL CARE - TOOTHPASTE', '037000002001', 'TOOTHPASTE COLGATE TOTAL 6 OZ 3-PK', '3 CT', 'PKG', 9.99),
('Health & Personal Care', 'PERSONAL CARE - DEODORANT', '037000003001', 'DEODORANT OLD SPICE 3 OZ 3-PK', '3 CT', 'PKG', 10.99),
('Health & Personal Care', 'PERSONAL CARE - RAZOR', '037000004001', 'RAZORS GILLETTE FUSION 8-PK', '8 CT', 'PKG', 19.99),
('Health & Personal Care', 'HEALTH - PAIN', '037000005001', 'IBUPROFEN 200 MG 200-CT', '200 CT', 'BTL', 8.99),
('Health & Personal Care', 'HEALTH - PAIN', '037000005008', 'ACETAMINOPHEN 500 MG 100-CT', '100 CT', 'BTL', 6.99),
('Health & Personal Care', 'HEALTH - ANTACID', '037000006001', 'ANTACID TUMS EXTRA 96-CT', '96 CT', 'PKG', 7.99),
('Health & Personal Care', 'HEALTH - BANDAGE', '037000007001', 'BANDAGES BAND-AID ASSORTED 280-CT', '280 CT', 'BOX', 9.99),

-- ============================================================
-- BOAT SUPPLIES
-- ============================================================
('Boat Supplies', 'SUPPLIES - MISC', '099999000011', 'ROPE NYLON 3/8" X 50 FT', '50 FT', 'EA', 14.99),
('Boat Supplies', 'SUPPLIES - MISC', '099999000028', 'GLOVES WORK LEATHER LARGE', '1 PR', 'PR', 8.99),
('Boat Supplies', 'SUPPLIES - MISC', '099999000035', 'RAIN PONCHO DISPOSABLE 10-PK', '10 CT', 'PKG', 12.99),
('Boat Supplies', 'SUPPLIES - MISC', '099999000042', 'HAND CLEANER GOJO ORIGINAL 1 GAL', '1 GAL', 'JUG', 12.99),
('Boat Supplies', 'SUPPLIES - MISC', '099999000059', 'WORK GLOVES NITRILE DISPOSABLE 100-CT', '100 CT', 'BOX', 14.99),
('Boat Supplies', 'SUPPLIES - MISC', '099999000066', 'SAFETY GLASSES CLEAR LENS 12-PK', '12 CT', 'CS', 19.99),
('Boat Supplies', 'SUPPLIES - MISC', '099999000073', 'FIRST AID KIT 163-PIECE', '163 CT', 'KIT', 24.99),
('Boat Supplies', 'SUPPLIES - MISC', '099999000080', 'INSECT REPELLENT DEET 10 OZ', '10 OZ', 'BTL', 7.99),
('Boat Supplies', 'SUPPLIES - MISC', '099999000097', 'SUNSCREEN SPF 50 6 OZ', '6 OZ', 'BTL', 8.99),
('Boat Supplies', 'SUPPLIES - MISC', '099999000104', 'HAND SANITIZER 32 OZ', '32 OZ', 'BTL', 6.99),
('Boat Supplies', 'SUPPLIES - MISC', '099999000111', 'PAPER TOWELS SHOP ROLL 6-PK', '6 CT', 'CS', 12.99),
('Boat Supplies', 'SUPPLIES - MISC', '099999000128', 'ZIP TIES 100-PK 8" ASSORTED', '100 CT', 'BAG', 6.99),
('Boat Supplies', 'SUPPLIES - MISC', '099999000135', 'DUCT TAPE HEAVY DUTY 60 YD', '60 YD', 'ROLL', 9.99),
('Boat Supplies', 'SUPPLIES - MISC', '099999000142', 'BATTERIES AA 24-PK', '24 CT', 'PKG', 12.99),
('Boat Supplies', 'SUPPLIES - MISC', '099999000159', 'BATTERIES 9V 8-PK', '8 CT', 'PKG', 12.99);

-- ============================================================
-- Verify counts
-- ============================================================
DO $$
DECLARE
  product_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO product_count FROM products;
  RAISE NOTICE 'Seed complete: % products inserted', product_count;
END $$;
