-- UPDATE_DELIVERIES_LEDGER.sql
--
-- Brings the deliveries ledger up to date from Jen's "2025_2026 DELIVERIES"
-- spreadsheet (pulled Sept 2, 2026 — her sheet runs through Sept 5).
--
-- SAFE TO RE-RUN. Every row is guarded by NOT EXISTS on
-- (date + vessel + driver + service type + fee), so a second run inserts
-- nothing. It also back-fills any 2026 row the original 044b seed missed,
-- not just the new ones.
--
-- NOTHING IS UPDATED OR DELETED. Rows already in the ledger stay exactly as
-- they are, including anything edited in the app.

-- ── 1. WHERE YOU ARE NOW ───────────────────────────────────────────
SELECT 'BEFORE' AS stage, count(*) AS deliveries,
       to_char(coalesce(sum(delivery_fee),0),'FM$999,999.00')            AS delivery_fees,
       to_char(coalesce(sum(sinclairs_grocery_total),0),'FM$999,999.00') AS groceries,
       to_char(coalesce(sum(amount_paid_driver),0),'FM$999,999.00')      AS driver_pay
  FROM deliveries
 WHERE delivery_date >= '2026-01-01' AND delivery_date < '2027-01-01';


-- ── 2. IMPORT — 171 rows of 2026 from the sheet ──────────────────────
WITH incoming (delivery_date, delivery_driver, hours_worked, amount_paid_driver, vessel_name, company_name, service_type, location_delivered, delivery_fee, bill_for_groceries, sinclairs_grocery_total, updated_quickbooks, phone_number_used, issues_comments, gts_correspondent, invoice_sent, incentive) AS (
  VALUES
    ('2026-01-10'::date, 'Jeremy Gibson'::text, 7.0::numeric, 275.0::numeric, 'Diane Denise'::text, 'Reliant'::text, 'Nighttime Van Delivery'::text, 'Granite City'::text, 450.0::numeric, true::boolean, NULL::numeric, true::boolean, '217-559-5809'::text, 'Bill for two bags of flour $4.81 purchased on business credit card, purchased corn starch from Ruler Foods $3.59. sent MK pic of reciept'::text, 'Jen'::text, NULL::date, 'Pizza Hut: $26.16'::text),
    ('2026-01-11', 'Jeremy Gibson', 2.0, 150.0, 'R Stewart', 'Kirby', 'Nighttime Boat Delivery', 'Grafton', 450.0, false, NULL, true, '225-270-1132', 'Picked up a router from Walmart grocery pickup, bought 25'' ethernet cable with my personal card and they venmoed me. No charge for this.', 'Jen', NULL, 'None'),
    ('2026-01-11', 'Tanner Critchfield', 2.0, 50.0, 'Prosperity', 'Artco', 'Daytime Boat Delivery', 'Grafton', 350.0, true, NULL, true, '314-803-4832', 'No issues', 'Jen', NULL, 'None'),
    ('2026-01-11', 'Brett Lander', 3.0, 175.0, 'Coop Mariner', 'Reliant', 'Nighttime Boat Delivery', 'Grafton', 450.0, false, NULL, true, '314-803-4815', 'No issues, very large order', 'Jen', NULL, 'None'),
    ('2026-01-15', 'Nipper DeSherlia', 3.0, 175.0, 'Coop Mariner', 'Reliant', 'Nighttime Boat Delivery', 'Grafton', 450.0, false, NULL, true, '314-803-4815', 'No issues, gave Nipper one additional hour because he pulled the boat out and parked it by the coolers for us', 'Jen', NULL, 'None'),
    ('2026-01-15', 'Rhylon DeSherlia', 2.0, 50.0, 'Philip Pfeffer', 'Ingram', 'Daytime Van Delivery', 'Ingram Depo', 350.0, NULL, NULL, true, '270-933-0908', 'Bill for a 12 pk Barqs $9.14 used Jens personal card by accident, Bill for 12pk Dr Pepper and cigarettes $24.54 used card in van', 'Jen', NULL, 'Chip clip and notebook'),
    ('2026-01-15', 'Keith Kasinger', 3.5, 87.5, 'Ardyce Randall', 'Artco', 'Daytime Van Delivery', 'Artco Terminal', 450.0, true, NULL, true, '314-803-4812', 'Purchased a case of red bull for the captain with my personal card, and he venmoed me. This is the delivery I picked up from Sinclairs and brought to Grafton.', 'Jen', NULL, 'Chip clip and notebook'),
    ('2026-01-16', 'Nipper DeSherlia', 2.0, 50.0, NULL, NULL, 'Pick up items Keith Kessigner left on Ardyce Randall by accident.', NULL, NULL, NULL, NULL, true, NULL, NULL, NULL, NULL, NULL),
    ('2026-01-20', 'Travis Maurer', 4.0, 200.0, 'Prosperity', 'Artco', 'Nighttime Boat Delivery', 'Artco Terminal', 450.0, true, NULL, true, '314-803-4832', 'None', 'Jen', NULL, 'Chip clip and notebook'),
    ('2026-01-20', 'Travis Maurer', 4.5, 162.5, 'New Dawn', 'Artco', 'Nighttime Boat Delivery', 'Artco Terminal', 450.0, true, NULL, true, '314-803-4830', 'None Invoice column on the spreadsheet read: "This is the first invoice where sinclairs was approved by ARTCO to bill them directly.".', 'Jen', NULL, 'Chip clip and notebook'),
    ('2026-01-20', 'Nipper DeSherlia', 0.0, 50.0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, NULL, 'Helped Travis get gas at the properity. Travis asked that $50 of his pay go to Nipper.', 'Jen', NULL, NULL),
    ('2026-01-30', 'Ira Moore', 4.0, 100.0, 'Thomas K', 'Reliant', 'Daytime Van Delivery', 'Ingram', 450.0, false, NULL, true, '662-394-1563', 'Trained and Did delivery', 'Laura', NULL, 'Cup and chip clip'),
    ('2026-01-31', 'Ira Moore', 6.0, 150.0, 'Diane Denise', 'Reliant', 'Daytime Van Delivery Extended', 'Granite City then PTL', 450.0, false, NULL, true, '270-559-5809', 'Had issue with ice and needed to switch to PTL once we got there', 'Laura', NULL, NULL),
    ('2026-02-07', 'Travis Maurer', 4.5, 212.5, 'Dwaine Stephens', 'Excel Marine', 'Nighttime Van Delivery Extended', 'Gateway Arch', 550.0, false, NULL, true, '270-556-5388', NULL, 'Laura', NULL, NULL),
    ('2026-02-08', 'Travis Maurer', 3.0, 75.0, 'Susan K', 'Reliant', 'Daytime Van Delivery', 'Ingram', 450.0, false, NULL, true, '662-394-1562', NULL, 'Laura', NULL, NULL),
    ('2026-02-08', 'Ira Moore', 3.0, 75.0, 'Ardyce Randyl', 'Artco', 'Daytime Van Delivery', 'Artco Terminal', 450.0, false, NULL, true, '314-802-4812', NULL, 'Laura', NULL, NULL),
    ('2026-02-17', 'Rhylon DeSherlia', 6.0, 150.0, 'Susan Stall', 'Canal', 'Daytime Van Delivery Extended', 'Dock Past Beardstown', 500.0, true, NULL, true, '901-833-0185', 'This is our first delivery with them. They sent email with invoice information.', 'Laura', NULL, NULL),
    ('2026-02-18', 'Nipper DeSherlia', 2.0, 150.0, 'Coop Ambassador', 'Reliant', 'Nighttime Boat Delivery', 'Grafton', 450.0, false, NULL, true, '314-803-4813', 'Went great. Trained Travis', 'Laura', NULL, NULL),
    ('2026-02-18', 'Travis Maurer', 2.0, 50.0, 'Training', NULL, NULL, NULL, NULL, NULL, NULL, true, NULL, 'Training', 'Laura', NULL, NULL),
    ('2026-02-26', 'Training (Nipper)', 3.0, 75.0, 'R Stewart', 'Kirby', 'Daytime Boat Delivery', 'Grafton', 350.0, false, NULL, true, '1-225-270-1132', 'Went Great. Trained Travis and Michael Chakur', 'Laura', NULL, NULL),
    ('2026-02-26', 'Travis Maurer', 2.5, 62.5, 'Prosperity', 'Artco', 'Daytime Boat Delivery', 'Grafton', 350.0, false, NULL, true, '1-314-803-4832', 'Went Great. Now ready for boat deliveries alone', 'Laura', NULL, NULL),
    ('2026-02-27', 'Travis Maurer', 3.0, 75.0, 'Ardyce Randall', 'Artco', 'Daytime Van Delivery', 'Arcto Terminal', 450.0, false, NULL, true, '1-314-803-4812', NULL, NULL, NULL, NULL),
    ('2026-03-05', 'Dad', 2.0, 0.0, 'Tom McCoin', 'Southern Devall', 'Crew Change', 'Grafton', 350.0, false, NULL, false, '901-734-0086', 'Laura Sent information to them per ach form but not set up. Billing Contact per boat is Paula 901-734-0086', 'Laura', NULL, NULL),
    ('2026-03-07', 'Travis Maurer', 7.0, 175.0, 'Coop Ambassador', 'Reliant', 'Daytime Boat Delivery', 'Grafton', 350.0, false, NULL, true, '1-314-803-4813', 'ALL THE ISSUES. Van battery was dead so Travis had to jump it. Cooler leaked so we had to bring damaged goods to STL.', 'Laura', NULL, NULL),
    ('2026-03-09', 'Travis Maurer', 2.0, 150.0, 'REC', 'Ingram', 'Nighttime Boat Delivery', 'Grafton', 450.0, false, NULL, true, NULL, NULL, 'MK', NULL, NULL),
    ('2026-03-09', 'Travis Maurer', 2.0, 150.0, 'Ardyce Randall', 'Artco', 'Nighttime Boat Delivery', 'Grafton', 450.0, false, NULL, true, NULL, NULL, 'MK', NULL, NULL),
    ('2026-03-12', 'Travis Maurer', 2.25, 156.25, 'Co Op Mariner', 'Reliant', 'Nighttime Boat Delivery', 'Grafton', 450.0, false, NULL, true, NULL, NULL, 'MK', NULL, NULL),
    ('2026-03-17', 'Nipper', 2.0, 150.0, 'Coop Ambassador', 'Reliant', 'nighttime Boat Delivery', 'Grafton', 450.0, false, NULL, true, '13148034813.0', '03:30:00', 'Laura', NULL, NULL),
    ('2026-03-17', 'Dad Training', NULL, NULL, 'New Dawn', 'Artco', 'Daytime Boat Delivery', 'Grafton', 350.0, false, NULL, false, '314-803-4830', 'No issues. Training went well would like to ride along one more time.', 'Laura', NULL, NULL),
    ('2026-03-18', 'Travis Maurer', 3.0, 175.0, 'Show Me State', 'Marquette', 'Nightime Boat Delivery', 'Grafton', 450.0, false, NULL, true, '270-217-4380', '04:30:00', 'Laura', NULL, NULL),
    ('2026-03-18', 'Travis Maurer', 4.0, 100.0, 'Ardyce Randall', 'Artco', 'Van', 'Artco STL Terminal', 450.0, false, NULL, true, '314-803-4812', 'Filled up tank', 'Laura', NULL, NULL),
    ('2026-03-22', 'John Critchfield', 3.0, 75.0, 'Phillip Pfeffer', 'Ingram', 'Daytime Van Delivery', 'Sauget', 350.0, false, NULL, true, '270-933-0908', NULL, 'Laura', NULL, NULL),
    ('2026-03-23', 'Brad Cumberledge', 3.5, 87.5, 'Coop Ambassador', 'Reliant', 'Daytime Van Delivery', 'STL Artco North Terminal', 450.0, false, NULL, true, '314-803-4813', NULL, 'Laura', NULL, NULL),
    ('2026-03-29', 'Joe DeSherlia', 1.0, 0.0, 'Coop Mariner', 'Reliant', 'Daytime Boat Delivery', 'Grafton', 350.0, false, NULL, false, '314-803-4815', 'Kevin Harmon started this delivery and never finished it. Joe finished it.', 'Jen', NULL, NULL),
    ('2026-04-04', 'Travis Maurer', 2.0, 50.0, 'Brees', 'Florida Marine', 'Daytime Boat Delivery', 'Grafton', 350.0, true, NULL, true, '985-237-4598', NULL, 'Jen', NULL, NULL),
    ('2026-04-11', 'John Critchfield', 2.0, 50.0, 'MV The Judge', 'Southern Devall', 'Daytime Boat Delivery', 'Grafton', 350.0, false, NULL, true, '901-734-0180', 'Training Brad Did Great', 'Laura', NULL, NULL),
    ('2026-04-11', 'Brad Cumberledge', 2.0, 50.0, 'Training', NULL, NULL, NULL, NULL, NULL, NULL, true, NULL, NULL, 'Laura', NULL, NULL),
    ('2026-04-14', 'Travis Maurer', 3.0, 175.0, 'Coop Ambassador', 'Reliant', 'Nightime Boat Delivery', 'Grafton', 450.0, false, NULL, true, '314-803-4813', '00:00:00', 'Laura', NULL, NULL),
    ('2026-04-18', 'Travis Maurer', 2.0, 50.0, 'Lindsay Ann Erickson', 'Marquette', 'Van Delivery', 'PTL', 0.0, false, NULL, true, '270-559-6040', 'Fee waved. Marquette questioned this charge. Sinclairs delivered the groceries to us. We delivered them to PTL. PTL delivered them to the vessel. We waved our fee for "good will"', 'Laura', NULL, NULL),
    ('2026-04-22', 'Travis Maurer', 3.0, 75.0, 'Coral Dawn', 'Artco', 'Daytime Boat Delivery', 'Grafton', 350.0, false, NULL, true, '314-803-4819', NULL, 'Laura', NULL, NULL),
    ('2026-04-24', 'Travis Maurer', 2.0, 150.0, 'The Judge', 'Southern Devall', 'Dusk To Dawn boat Delivery', 'Grafton', 450.0, false, NULL, true, '901-734-0180', 'Started at 4:30am', 'Laura', NULL, NULL),
    ('2026-04-24', 'Dad', NULL, 0.0, 'Darin Adrian', 'Marquette', 'Daytime Boat Delivery', 'Grafton', 350.0, false, NULL, false, '270-217-3831', 'Freezer Items Sinclairs missed in first delivery to PTL. We brought', 'Laura', NULL, NULL),
    ('2026-04-26', 'Travis Maurer', 6.0, 150.0, 'Mr Lampton', 'Magnolia', 'Extended Van Delivery', 'Washington', 475.0, false, NULL, true, '601-415-7007', NULL, 'Laura', NULL, NULL),
    ('2026-04-26', 'Travis Maurer', 2.0, 50.0, 'Coop Mariner', 'Reliant', 'Dusk To Dawn boat Delivery', 'Grafton', 450.0, false, NULL, true, '314-803-4815', NULL, 'Laura', NULL, NULL),
    ('2026-04-26', 'Nipper', NULL, 100.0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, NULL, 'Helped Travis and he wanted to give him night delivery fee', NULL, NULL, NULL),
    ('2026-04-29', 'Travis Maurer', 2.0, 50.0, 'Coop Ambassador', 'Reliant', 'Daytime Boat Delivery', 'Grafton', 350.0, false, NULL, true, '314-803-4813', NULL, 'Laura', NULL, NULL),
    ('2026-04-30', 'John Critchfield', 2.0, 50.0, 'Ardyce Randall', 'Artco', 'Crew Change', 'Grafton', 350.0, false, NULL, true, '314-803-4812', NULL, 'Laura', NULL, NULL),
    ('2026-05-01', 'John Critchfield', 2.0, 150.0, 'George King', 'Marquette', 'Dusk to Dawn Mechanic Transport', 'Grafton', 450.0, false, 0.0, true, '12702171419.0', '9;30 drop off', 'Laura', NULL, NULL),
    ('2026-05-02', 'John Critchfield', 2.0, 150.0, 'George King', 'Marquette', 'Dusk to Dawn Mechanic Pick Up', 'Grafton', 450.0, false, 0.0, true, NULL, '1am pickup', 'Laura', NULL, NULL),
    ('2026-05-02', 'Nipper', 2.0, 150.0, 'Coop Mariner', 'Reliant', 'Dusk to Dawn Delivery', 'Grafton', 450.0, false, 0.0, true, NULL, NULL, 'Laura', NULL, NULL),
    ('2026-05-02', 'Nipper', 2.0, 50.0, 'Philip Mpfeffer', 'Ingram', 'Daytime Boat Delivery', 'Grafton', 350.0, false, 0.0, true, NULL, NULL, 'Laura', NULL, NULL),
    ('2026-05-04', 'John Critchfield', 2.0, 50.0, 'Coop Vanguard', 'Artco', 'Daytime Crew Change', 'Grafton', 350.0, false, 0.0, true, '314-803-4817', NULL, 'Laura', NULL, NULL),
    ('2026-05-08', 'Travis Maurer', 2.0, 50.0, 'Coop Vanguard', 'Artco', 'Daytime Crew Change 1/2 off', 'Grafton', 150.0, false, 0.0, true, '314-803-4817', NULL, 'Laura', NULL, NULL),
    ('2026-05-08', 'Travis Maurer', NULL, NULL, 'Coop Vanguard', 'Artco', 'Daytime Grocery Delivery', 'Grafton', 350.0, false, 0.0, false, '314-803-4817', NULL, 'Laura', NULL, NULL),
    ('2026-05-08', 'Travis Maurer', 3.0, 75.0, 'Prosperity', 'Artco', 'Daytime Grocery Delivery', 'Grafton', 350.0, false, 0.0, true, '314-803-4832', NULL, 'Laura', NULL, NULL),
    ('2026-05-11', 'Nipper DeSherlia', 3.0, 75.0, 'Ardyce Randall', 'Artco', 'Daytime Grocery Delivery', 'Grafton', 350.0, false, 0.0, true, '314-803-4812', NULL, 'Laura', NULL, NULL),
    ('2026-05-10', 'Nipper DeSherlia', 3.0, 175.0, 'Frankie Wiseman', 'Kirby', 'Dusk to Dawn Grocery Delivery', 'Grafton', 450.0, false, 0.0, true, '1-225-432-0330', NULL, 'Laura', NULL, NULL),
    ('2026-05-14', 'Keith Kasinger', 2.0, 50.0, 'Darin Adrian', 'Marquette', 'Daytime Grocery Delivery', 'Grafton', 350.0, false, 0.0, true, '270-217-3831', NULL, 'Laura', NULL, NULL),
    ('2026-05-14', 'Travis Maurer', 3.0, 75.0, 'Coop Ambassador', 'Reliant', 'Daytime Van Delivery', 'Grafton', 350.0, false, 0.0, true, '314-803-4813', NULL, 'Laura', NULL, NULL),
    ('2026-05-16', 'Nipper DeSherlia', 2.0, 150.0, 'Coop Mariner', 'Reliant', 'Nighttime Van Delivery', 'Grafton', 450.0, false, 0.0, true, '314-803-4815', NULL, 'Laura', NULL, NULL),
    ('2026-05-17', 'Keith Kasinger', 2.0, 50.0, 'Coop Vanguard', 'Artco', 'Daytime Van Delivery', 'Grafton', 350.0, false, 0.0, true, '1-314-803-4817', NULL, 'Laura', NULL, NULL),
    ('2026-05-18', 'Nipper DeSherlia', 3.0, 75.0, 'Noble Parsonage', 'ACBL', 'Daytime Van Delivery', 'Grafton', 350.0, false, 0.0, true, '314-614-8237', 'Sinclairs sent us an invoice for this but MK confirmed with Dave that Sinclairs will bill for the groceries. 6/1/26', 'Laura', NULL, NULL),
    ('2026-05-12', 'Keith Kasinger', 3.0, 75.0, 'Training', NULL, NULL, NULL, NULL, NULL, NULL, true, NULL, NULL, 'Laura', NULL, NULL),
    ('2026-05-12', 'Landon Crawford', NULL, NULL, 'Training', NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, 'Laura', NULL, NULL),
    ('2026-05-19', 'Rhylon DeSherlia', 4.0, 100.0, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'East Carondalet', 225.0, true, 3065.17, true, '314-560-4533', NULL, 'Laura', NULL, NULL),
    ('2026-05-21', 'Keith Kasinger', 2.5, 162.5, 'Ardyce Randall', 'Artco', 'Nighttime Boat Delivery', 'Grafton', 450.0, false, 0.0, true, '314-803-4812', NULL, 'Laura', NULL, NULL),
    ('2026-05-22', 'Rhylon DeSherlia', 3.5, 87.5, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'East Carondalet', 225.0, true, 2031.08, true, '314-560-4533', NULL, 'Laura', NULL, NULL),
    ('2026-05-23', 'Travis Maurer', 4.0, 100.0, 'OA Franks', 'Ingram', 'Daytime Van Delivery', 'East Carondalet', 125.0, true, 1709.7, true, '270-933-0965', NULL, 'Laura', NULL, NULL),
    ('2026-05-26', 'Jon Hughes', 2.0, 50.0, 'Coop Mariner', 'Reliant', 'Daytime Boat Delivery', 'Grafton', 350.0, false, 0.0, true, '314-803-4815', NULL, 'Laura', NULL, NULL),
    ('2026-05-27', 'Keith Kasinger', 4.5, 112.5, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'East Carondalet', 225.0, true, 2363.83, true, '314-560-4533', NULL, 'Laura', NULL, NULL),
    ('2026-05-28', 'Keith Kasinger', 2.25, 156.25, 'Prairie Dawn', 'Artco', 'Nighttime Boat Delivery', 'Grafton', 450.0, false, 0.0, true, '314-803-4831', '12-2AM', 'Laura', NULL, NULL),
    ('2026-05-30', 'Keith Kasinger', 3.5, 87.5, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'East Carondalet', 225.0, true, 1543.53, true, '314-560-4533', NULL, 'Jen', NULL, NULL),
    ('2026-05-30', 'Keith Kasinger', 2.0, 50.0, 'Prairie Dawn', 'Artco', 'Daytime Boat Delivery', 'Grafton', 350.0, false, 0.0, true, '314-803-4831', NULL, 'Jen', NULL, NULL),
    ('2026-05-31', 'Keith Kasinger', 3.0, 175.0, 'Paul Brotzge', 'ACBL', 'Nighttime Boat Delivery', 'Grafton', 450.0, false, 0.0, true, '812-786-9244', NULL, 'Jen', NULL, NULL),
    ('2026-06-01', 'Keith Kasinger', 2.0, 150.0, 'D Dewaine Stephens', 'Excel Marine', 'Nightime Crew Change', 'Grafton', 450.0, NULL, 0.0, true, '270-556-5388', 'Calling 6/1 with PO', 'Jen', NULL, NULL),
    ('2026-06-04', 'Keith Kasinger', 3.25, 81.25, 'Coop Mariner', 'Reliant', 'Daytime Boat Delivery', 'Grafton', 350.0, false, 0.0, true, '314-803-4815', 'See comment.', 'Jen', NULL, NULL),
    ('2026-06-04', 'Keith Kasinger', 3.5, 187.5, 'Coop Enterprises', 'Artco', 'Nighttime Van Delivery', 'Artco docks', 450.0, false, 0.0, true, '314-803-4814', NULL, 'Jen', NULL, NULL),
    ('2026-06-05', 'Keith Kasinger', 3.25, 81.25, 'W Scott Noble', 'Ingram', 'Daytime Van Delivery', 'East Carondalet', 225.0, true, 3094.95, true, '314-560-4533', 'See comment.', 'Jen', NULL, NULL),
    ('2026-06-05', 'Keith Kasinger', 3.25, 181.25, 'Coop Ambassador', 'Reliant', 'Nighttime Boat Delivery', 'Grafton', 450.0, false, 0.0, true, '314-803-4813', NULL, 'Jen', NULL, NULL),
    ('2026-06-08', 'Keith Kasinger', 5.0, 125.0, 'John Nugent', 'ACBL', 'Daytime Van Delivery= long distance', 'Clarksville', 475.0, false, 0.0, true, '812-786-2194', 'See comment', 'Jen', NULL, NULL),
    ('2026-06-08', 'Keith Kasinger', 3.5, 87.5, 'Mike Schmaeng', 'Ingram', 'Daytime Van Delivery', 'East Carondalet', 225.0, true, 2296.96, true, '504-415-2219', NULL, 'Jen', NULL, NULL),
    ('2026-06-09', 'Coby Gibson (pay Jeremy)', 3.0, 75.0, 'W Scott Noble', 'Ingram', 'Daytime Van Delivery', 'East Carondalet', 225.0, true, 3335.37, true, '314-560-4533', NULL, 'Laura', NULL, NULL),
    ('2026-06-10', 'Keith Kasinger', 4.5, 112.5, 'Kelly Rae Erickson', 'Marquette', 'Van Osage Dock', 'St. Louis', 450.0, false, 0.0, true, '270-217-1043', NULL, 'Laura', NULL, NULL),
    ('2026-06-10', 'Keith Kasinger', 2.5, 62.5, 'Paul Brotzge', 'ACBL', 'Daytime boat delivery', 'Grafton', 350.0, false, 0.0, true, '812-786-9244', NULL, 'Laura', NULL, NULL),
    ('2026-06-12', 'Keith Kasinger', 3.0, 75.0, 'Andrew Koch', 'ACBL', 'Daytime Boat Delivery', 'Grafton', 350.0, false, 0.0, true, '314-614-8229', NULL, 'Laura', NULL, NULL),
    ('2026-06-12', 'Keith Kasinger', 3.25, 81.25, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'East Carondalet', 225.0, true, 2300.39, true, '314-560-4533', NULL, 'Jen', NULL, NULL),
    ('2026-06-12', 'Keith Kasinger', 0.0, 0.0, 'Jeff Boat (maybe)', 'ACBL', 'Daytime Boat Delivery', 'Grafton', NULL, false, 0.0, false, '812-786-9162', 'see comment', 'Laura', NULL, NULL),
    ('2026-06-15', 'Keith Kasinger', 2.0, 50.0, 'Clearence Nixon', 'Kirby', 'Daytime Boat Delivery', 'Grafton', 350.0, false, 0.0, true, '225-252-9159', NULL, 'Jen', NULL, NULL),
    ('2026-06-16', 'Keith Kasinger', 3.25, 81.25, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'East Charondelet', 225.0, true, 2949.04, true, '314-560-4533', NULL, 'Laura', NULL, NULL),
    ('2026-06-18', 'Keith Kasinger', 2.0, 50.0, 'AA Birch', 'Ingram', 'Daytime Boat Delivery', 'Grafton', 350.0, true, 1622.78, true, '270-217-8460', NULL, 'Laura', NULL, NULL),
    ('2026-06-18', 'Keith Kasinger', 2.5, 62.5, 'Frankie Wiseman', 'Kirby', 'Daytime Van Delivery', 'East Charondelet', 450.0, false, 0.0, true, '225-432-0330', NULL, 'Laura', NULL, NULL),
    ('2026-06-19', 'Keith Kasinger', 2.75, 68.75, 'Mike Schmaeng', 'Ingram', 'Daytime Van Delivery', 'PTL', 125.0, true, 1916.8, true, '504-415-2219', 'See comments', 'Jen', NULL, NULL),
    ('2026-06-19', 'Keith Kasinger', 2.5, 62.5, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'East Charondelet', 225.0, true, 2245.0, true, '314-560-4533', 'see comments', 'Jen', NULL, NULL),
    ('2026-06-19', 'Keith Kasinger', 2.0, 150.0, 'Ron Nokes', 'Kirby', 'Nighttime Boat Delivery', 'Grafton', 450.0, false, 0.0, true, '346-339-4685', NULL, 'Jen', NULL, NULL),
    ('2026-06-19', 'Keith Kasinger', 3.25, 181.25, 'Prosperity', 'Artco', 'Nightime Van Delivery', 'Artco Terminal', 450.0, false, 0.0, true, '314-803-4832', NULL, 'Jen', NULL, NULL),
    ('2026-06-21', 'Nipper DeSherlia', 2.0, 50.0, 'Michael Draughn', 'ACBL', 'Daytime Boat Delivery', 'Grafton', 350.0, false, 0.0, true, '812-786-9235', NULL, 'Jen', NULL, NULL),
    ('2026-06-23', 'Travis Maurer', 2.5, 62.5, 'Tony Espinoza', 'ACBL', 'Daytime Boat Delivery', 'Grafton', 350.0, false, 0.0, true, '314-614-8230', NULL, 'Laura', NULL, NULL),
    ('2026-06-23', 'Travis Maurer', 3.0, 75.0, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'East Charondelet', 225.0, true, 2087.63, true, '225-432-0330', NULL, 'Laura', NULL, NULL),
    ('2026-06-23', 'Travis Maurer', 3.0, 75.0, 'Coop Vanguard', 'Artco', 'Daytime Boat Delivery', 'Grafton', 350.0, false, 0.0, true, '314-803-4817', NULL, 'Laura', NULL, NULL),
    ('2026-06-23', 'Travis Maurer', 2.0, 75.0, 'Coop Mariner', 'Reliant', 'Dusk to Dawn Boat Delivery', 'Grafton', 450.0, false, 0.0, true, '314-803-4815', '00:30:00', 'Laura', NULL, NULL),
    ('2026-06-23', 'Travis Maurer', 2.0, 50.0, 'David Evans', 'ACBL', 'Daytime Van Delivery', 'Campsville', 350.0, false, 0.0, true, '812-786-9251', NULL, 'Laura', NULL, NULL),
    ('2026-06-24', 'Tommy Tucker', 4.5, 112.5, 'Coral Dawn', 'Artco', 'Daytime Van Delivery', 'Artco STL Terminal', 450.0, false, 0.0, true, '314-803-4819', NULL, 'Laura', NULL, NULL),
    ('2026-06-24', 'Travis Maurer', 3.5, 137.5, 'Coop Ambassador', 'Reliant', 'Dusk to Dawn Boat Delivery', 'Grafton', 450.0, false, 0.0, true, '314-803-4813', NULL, 'Laura', NULL, NULL),
    ('2026-06-24', 'Tommy Tucker', 3.5, 137.5, 'Training', NULL, NULL, NULL, NULL, false, 0.0, true, NULL, NULL, 'Laura', NULL, NULL),
    ('2026-06-23', 'Tommy Tucker', 10.0, 250.0, 'Training', NULL, NULL, NULL, NULL, false, 0.0, true, NULL, NULL, 'Laura', NULL, NULL),
    ('2026-06-25', 'Tommy Tucker', 4.0, 100.0, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'East Charondelet', 225.0, true, 1855.94, true, '225-432-0330', NULL, 'Laura', NULL, NULL),
    ('2026-06-26', 'Keith Kasinger', 3.75, 93.75, 'Gregory David', 'Reliant', 'Daytime Van Delivery', 'Ingram dock', 350.0, false, 0.0, true, '270-564-7334', NULL, 'Jen', NULL, NULL),
    ('2026-06-26', 'Keith Kasinger', 3.5, 87.5, 'Mike Schmeng', 'Ingram', 'Daytime Van Delivery', 'Ingram dock', 225.0, true, 2132.07, true, '504-415-2219', NULL, 'Jen', NULL, NULL),
    ('2026-06-30', 'Keith Kasinger', 2.75, 168.75, 'Coop Vanguard', 'Artco', 'Nighttime Boat Delivery', 'Grafton', 450.0, false, 0.0, true, '314-803-4817', NULL, 'Jen', NULL, NULL),
    ('2026-06-30', 'Keith Kasinger', 3.75, 93.75, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'Ingram dock', 225.0, true, 4347.13, true, '225-432-0330', NULL, 'Jen', NULL, NULL),
    ('2026-07-03', 'Coby Gibson (pay Jeremy)', 2.0, 50.0, 'W Scott Noble', 'Ingram', 'Daytime Van Delivery', 'Ingram dock', 225.0, true, 1494.18, true, '573-291-1530', NULL, 'Jen', NULL, NULL),
    ('2026-07-03', 'Coby Gibson (pay Jeremy)', 2.0, 50.0, 'Mike Schmeng', 'Ingram', 'Daytime Van Delivery', 'Ingram dock', 225.0, true, 1585.66, true, '504-415-2219', NULL, 'Jen', NULL, NULL),
    ('2026-07-03', 'Coby Gibson (pay Jeremy)', 2.0, 50.0, 'Andrew F Koch', 'ACBL', 'Daytime Boat Delivery', 'Grafton', 350.0, false, 0.0, true, '314-614-8229', NULL, 'Jen', NULL, NULL),
    ('2026-07-03', 'Coby Gibson (pay Jeremy)', 2.0, 50.0, 'Prosperity', 'Artco', 'Daytime Boat Delivery', 'Grafton', 350.0, false, 0.0, true, '314-803-4832', NULL, 'Jen', NULL, NULL),
    ('2026-07-06', 'Keith Kasinger', 3.75, 193.75, 'Philip Pfeffer', 'Ingram', 'Nightime Van Delivery', 'Ingram dock', 325.0, true, 3986.32, true, '270-933-0908', NULL, 'Jen', NULL, NULL),
    ('2026-07-07', 'Tommy Tucker', 3.0, 75.0, 'Rick Hay', 'Excel Marine', 'Daytime Van Delivery', 'Hardin Launching Ramp', 350.0, false, 0.0, true, 'Personal 601-529-4507, boat 270-792-8352', 'Extra large delivery', 'Jen', NULL, NULL),
    ('2026-07-08', 'Keith Kasinger', 2.0, 50.0, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'Ingram dock', 225.0, true, 3333.88, true, '314-560-4533 (greg)', NULL, 'Jen', NULL, NULL),
    ('2026-07-08', 'Tommy Tucker', 3.5, 87.5, 'Coop Mariner', 'Reliant', 'Daytime Boat Delivery', 'Grafton', 350.0, false, 0.0, true, '314-803-4815', NULL, 'Jen', NULL, NULL),
    ('2026-07-09', 'Keith Kasinger', 2.0, 150.0, 'Prairie Dawn', 'Artco', 'Nighttime Boat Delivery', 'Grafton', 450.0, false, 0.0, true, '314-803-4831', NULL, 'Jen', NULL, NULL),
    ('2026-07-10', 'Keith Kasinger', 4.25, 106.25, 'W Scott Noble', 'Ingram', 'Daytime Van Delivery', 'Ingram Docks', 225.0, true, 1539.03, true, '270-933-0908', NULL, 'Jen', NULL, NULL),
    ('2026-07-10', 'Keith Kasinger', 5.5, 137.5, 'John Nugent', 'ACBL', 'Nightime Long Distance Delivery', 'Lock 22', 522.5, false, 0.0, true, '812-786-2194', NULL, 'Jen', NULL, NULL),
    ('2026-07-11', 'Keith Kasinger', 4.0, 100.0, 'Mike Schmeng', 'Ingram', 'Daytime Van Delivery', 'Ingram Dock', 225.0, true, 1324.62, true, '314-560-4533 (greg)', NULL, 'Jen', NULL, NULL),
    ('2026-07-14', 'Tommy Tucker', 3.5, 87.5, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'Ingram Dock', 225.0, true, 3021.99, true, '314-560-4533 (greg)', NULL, 'Laura', NULL, NULL),
    ('2026-07-14', 'Keith Kasinger', 3.0, 75.0, 'Coop Ambassador', 'Reliant', 'Daytime Boat Delivery', 'Grafton', 350.0, false, 0.0, true, '314-803-4813', NULL, 'Laura', NULL, NULL),
    ('2026-07-17', 'Tommy Tucker', 3.25, 81.25, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'Ingram Dock', 225.0, true, 2702.57, true, '314-560-4533 (greg)', NULL, 'Laura', NULL, NULL),
    ('2026-07-16', 'Tommy Tucker', 3.0, 75.0, 'Crimson Glory', 'Artco', 'Daytime Van Delivery', 'Artco', 450.0, false, 0.0, true, '314-803-4822', NULL, 'Laura', NULL, NULL),
    ('2026-07-19', 'Keith Kasinger', 4.0, 100.0, 'Mike Schmeng', 'Ingram', 'Daytime Van Delivery', 'Ingram Dock', 225.0, true, 2682.84, true, '314-560-4533 (greg)', NULL, 'Laura', NULL, NULL),
    ('2026-07-20', 'Tommy Tucker', 3.0, 75.0, 'Coop Mariner', 'Reliant', 'Daytime Boat Delivery', 'Grafton', 350.0, false, 0.0, true, '314-803-4815', NULL, 'Laura', NULL, NULL),
    ('2026-07-21', 'Keith Kasinger', 4.0, 100.0, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'Ingram Dock', 225.0, true, 2278.38, true, '314-560-4533 (greg)', NULL, 'Laura', NULL, NULL),
    ('2026-07-22', 'Tommy Tucker', 2.0, 50.0, 'Nick G Buford', 'Tennessee Valley Towing', 'Daytime Crew Change', 'Grafton', 350.0, false, 0.0, true, '270-331-8645', 'Billing 270-554-0154 Gail OConnell 270-898-7392', 'Laura', NULL, NULL),
    ('2026-07-23', 'Tommy Tucker', 3.0, 75.0, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'Ingram', 225.0, true, 1493.69, true, '314-560-4533 (greg', NULL, 'Laura', NULL, NULL),
    ('2026-07-24', 'Travis Maurer', 3.0, 75.0, 'Crimson Glory', 'Artco', 'Daytime Boat Delivery', 'Grafton', 350.0, false, 0.0, true, '314-803-4822', NULL, 'Laura', NULL, NULL),
    ('2026-07-27', 'Tommy Tucker', 2.0, 50.0, 'Coop Ambassador', 'Reliant', 'Daytime Van Delivery', 'Grafton', 350.0, false, 0.0, true, '314-803-4813', NULL, 'Laura', NULL, NULL),
    ('2026-07-28', 'Tommy Tucker', 2.0, 50.0, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'Ingram', 225.0, true, 2776.03, true, '314-560-4533 (greg', NULL, 'Laura', NULL, NULL),
    ('2026-07-28', 'Tommy Tucker', 2.25, 31.25, 'Mike Schmeng', 'Ingram', 'Daytime Van Delivery', 'Ingram', 225.0, true, 2724.48, true, '504-415-2219', NULL, 'Laura', NULL, NULL),
    ('2026-07-29', 'Travis Maurer', 2.0, 50.0, 'Raymond Grant', 'Marquette', 'Daytime Crew Change', 'Grafton', 350.0, false, 0.0, true, '270-350-7954', NULL, 'Laura', NULL, NULL),
    ('2026-07-29', 'Travis Maurer', 2.0, 50.0, 'Ardyce Randall', 'Artco', 'Daytime Grocery Delivery', 'Grafton', 350.0, false, 0.0, true, '573-873-4662', NULL, 'Laura', NULL, NULL),
    ('2026-07-31', 'Tommy Tucker', 3.5, 87.5, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'Ingram', 225.0, true, 1489.64, true, NULL, NULL, 'Laura', NULL, NULL),
    ('2026-07-31', 'Tommy Tucker', 3.0, 75.0, 'Glenn Jones', 'ACBL', 'Daytime Boat Delivery', 'Grafton', 350.0, false, 0.0, true, '812-786-9155', NULL, 'Laura', NULL, NULL),
    ('2026-08-01', 'Tommy Tucker', 3.0, 175.0, 'Coop Ambassador', 'Reliant', 'Nighttime boat Delivery', 'Grafton', 450.0, false, 0.0, true, '314-803-4813', NULL, 'Laura', NULL, NULL),
    ('2026-08-01', 'Tommy Tucker', 0.0, 100.0, 'Coop Mariner', 'Reliant', 'Nighttime boat Delivery', 'Grafton', 450.0, false, 0.0, true, '314-803-4815', 'Deliveries were at the same time so I put them together', 'Laura', NULL, NULL),
    ('2026-08-03', 'Tommy Tucker', 3.0, 75.0, 'Lori Blocker', 'ACBL', 'Daytime Boat Delivery', 'Grafton', 350.0, false, 0.0, true, '304-674-6580', NULL, 'Laura', NULL, NULL),
    ('2026-08-04', 'Tommy Tucker', 3.5, 87.5, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'East Charondelet', 225.0, true, 3647.81, true, '314-560-4533', NULL, 'Laura', NULL, NULL),
    ('2026-08-07', 'Tommy Tucker', 3.5, 87.5, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'East Charondelet', 225.0, true, 1138.96, true, '314-560-4533', NULL, 'Laura', NULL, NULL),
    ('2026-08-08', 'Tommy Tucker', 3.25, 81.25, 'Jennie K', 'Reliant', 'Boat Delivery', 'Grafton', 350.0, false, 0.0, true, '662-394-1564', NULL, 'Laura', NULL, NULL),
    ('2026-08-08', 'Tommy Tucker', 3.5, 87.5, 'Mike Schmeng', 'Ingram', 'Daytime Van Delivery', 'East Charondelet', 225.0, true, 2709.51, true, '504-415-2219', 'Tommy said the ticket may be $10 short', 'Laura', NULL, NULL),
    ('2026-08-11', 'Tommy Tucker', 3.0, 75.0, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'East Charondelet', 225.0, true, 4358.31, true, '314-560-4533', NULL, 'Jen', NULL, NULL),
    ('2026-08-11', 'Tommy Tucker', 2.5, 62.5, 'Jeff Boat', 'ACBL', 'Daytime Boat Delivery', 'Pere Marquette Area', 350.0, false, 0.0, true, '812-786-9162', NULL, 'Jen', NULL, NULL),
    ('2026-08-13', 'Grocery Charge Only', NULL, NULL, 'Scott Noble', 'Ingram', 'Self Pick-Up by Vessel', 'Sinclairs', 0.0, true, 148.71, false, NULL, NULL, NULL, NULL, NULL),
    ('2026-08-13', 'Tommy Tucker', 2.5, 162.5, 'Young Suk CHi', 'Ingram', 'Nighttime boat Delivery', 'Grafton', 450.0, true, 2901.43, true, '270-556-2613', NULL, 'Jen', NULL, NULL),
    ('2026-08-14', 'Tommy Tucker', 2.0, 50.0, 'Ardyce Randall', 'Artco', 'Daytime boat delivery', 'Grafton', 350.0, false, 0.0, true, '314-803-4812', NULL, 'Jen', NULL, NULL),
    ('2026-08-16', 'Tommy Tucker', 2.0, 150.0, 'Robert Stone', 'Kirby', 'Nighttime boat Delivery', 'Grafton', 450.0, false, 0.0, true, '225-223-7242', 'Kirby boat that pays by credit card, per Dave', 'Jen', NULL, NULL),
    ('2026-08-15', 'Tommy Tucker', 4.0, 100.0, 'Mike Schmeng', 'Ingram', 'Daytime Van Delivery', 'East Charondelet', 225.0, true, 1366.22, true, '504-415-2219', NULL, 'Jen', NULL, NULL),
    ('2026-08-16', 'Tommy Tucker', 3.5, 187.5, 'Coop Venture', 'Reliant', 'Nighttime boat Delivery', 'Grafton', 450.0, false, 0.0, true, '314-803-4818', 'see comment', 'Jen', NULL, NULL),
    ('2026-08-17', 'Tommy Tucker', 2.0, 50.0, 'Coop Venture', 'Reliant', 'Daytime Boat Delivery', 'Grafton', NULL, false, 0.0, true, '314-803-4841', 'See comment above Delivery fee recorded on the spreadsheet as "Courtsey Delivery".', 'Jen', NULL, NULL),
    ('2026-08-18', 'Tommy Tucker', 3.25, 81.25, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'East Charondelet', 225.0, true, 2577.39, true, NULL, NULL, 'Jen', NULL, NULL),
    ('2026-08-18', 'Tommy Tucker', 2.0, 50.0, 'Michael Poindexter', 'ACBL', 'Daytime Boat Delivery', 'Grafton', 350.0, false, 0.0, true, '812-786-9252', NULL, 'Laura', NULL, NULL),
    ('2026-08-18', 'Tommy Tucker', 2.5, 62.5, 'Andrew F Koch', 'ACBL', 'Daytime Boat Delivery', 'Grafton', 350.0, false, 0.0, true, NULL, NULL, 'Laura', NULL, NULL),
    ('2026-08-21', 'Tommy Tucker', 3.5, 87.5, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'East Charondelet', 225.0, true, 1427.62, true, NULL, NULL, 'Laura', NULL, NULL),
    ('2026-08-22', 'Tommy Tucker', 5.5, 137.5, 'Mike Schmeng', 'Ingram', 'Daytime Van Delivery', 'East Charondelet', 225.0, true, 1161.13, true, '504-415-2219', 'see comment', 'Jen', NULL, NULL),
    ('2026-08-25', 'Tommy Tucker', 3.0, 75.0, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'East Charondelet', 225.0, true, 3329.43, true, '314-560-4533', NULL, 'Jen', NULL, NULL),
    ('2026-08-25', 'Tommy Tucker', 2.5, 62.5, 'Young Suk CHi', 'Ingram', 'Daytime Van Delivery', 'East Charondelet', 350.0, true, 2289.7, true, '270-556-2613', 'see comment Date corrected from 2025-08-25 to 2026-08-25 (year mistyped on the spreadsheet; row sits between the 2026-08-25 and 2026-08-26 entries). Confirmed Sept 2026.', 'Jen', NULL, NULL),
    ('2026-08-26', 'Tommy Tucker', 2.5, 62.5, 'Gregory David', 'Reliant', 'Daytime Van Delivery', 'East Charondelet', 350.0, false, 0.0, true, '270-564-7334', 'see comment', 'Jen', NULL, NULL),
    ('2026-08-28', 'Tommy Tucker', 3.0, 75.0, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'East Charondelet', 225.0, true, 1447.27, true, '314-560-4533', NULL, 'Jen', NULL, NULL),
    ('2026-08-28', 'Tommy Tucker', 4.25, 106.25, 'Mike Schmeng', 'Ingram', 'Daytime Van Delivery', 'East Charondelet', 225.0, true, 2286.86, true, '504-415-2219', NULL, 'Jen', NULL, NULL),
    ('2026-08-30', 'Tommy Tucker', 2.0, 50.0, 'Sheila K Barger', 'Marquette', 'Daytime Boat Crew Change', 'Grafton', 350.0, false, 0.0, true, '270-519-4478 boat, 270-393-1033 dropped off crew at GH', NULL, 'Jen', NULL, NULL),
    ('2026-09-01', 'Coby Gibson (pay Jeremy)', 4.0, 100.0, 'Scott Noble boat and appartments', 'Ingram', 'Daytime Van Delivery', 'East Charondelet', 225.0, true, NULL, false, '314-560-4533', 'see comment', 'Jen', NULL, NULL),
    ('2026-09-04', 'Tommy Tucker', NULL, 0.0, 'Max A Fletcher', 'Reliant', NULL, 'Grafton', NULL, false, 0.0, false, '270-564-2074', NULL, 'Jen', NULL, NULL),
    ('2026-09-04', 'Tommy Tucker', NULL, 0.0, 'John Nugent', 'ACBL', NULL, 'Ozage Marine, 750 Davis St., St Louis MO 63111', NULL, false, 0.0, false, '812-786-2194', NULL, 'Jen', NULL, NULL),
    ('2026-09-05', 'Tommy Tucker', NULL, 0.0, 'Mike Schmeng', 'Ingram', 'Daytime Van Delivery', 'East Charondelet', 225.0, true, NULL, false, '504-415-2219', NULL, 'Jen', NULL, NULL),
    ('2026-09-05', 'Tommy Tucker', NULL, 0.0, 'Scott Noble', 'Ingram', 'Daytime Van Delivery', 'East CHarondelet', 225.0, true, NULL, false, '314-560-4533', NULL, 'Jen', NULL, NULL)
),
resolved AS (
  SELECT i.*, c.id AS company_id
    FROM incoming i
    LEFT JOIN companies c ON lower(btrim(c.name)) = lower(btrim(i.company_name))
)
INSERT INTO deliveries (company_id, delivery_date, delivery_driver, hours_worked, amount_paid_driver, vessel_name, service_type, location_delivered, delivery_fee, bill_for_groceries, sinclairs_grocery_total, updated_quickbooks, phone_number_used, issues_comments, gts_correspondent, invoice_sent, incentive)
SELECT r.company_id, r.delivery_date, r.delivery_driver, r.hours_worked, r.amount_paid_driver, r.vessel_name, r.service_type, r.location_delivered, r.delivery_fee, r.bill_for_groceries, r.sinclairs_grocery_total, r.updated_quickbooks, r.phone_number_used, r.issues_comments, r.gts_correspondent, r.invoice_sent, r.incentive
  FROM resolved r
 WHERE NOT EXISTS (
   SELECT 1 FROM deliveries d
    WHERE d.delivery_date = r.delivery_date
      AND coalesce(d.vessel_name,'')      = coalesce(r.vessel_name,'')
      AND coalesce(d.delivery_driver,'')  = coalesce(r.delivery_driver,'')
      AND coalesce(d.service_type,'')     = coalesce(r.service_type,'')
      AND coalesce(d.delivery_fee, -1)    = coalesce(r.delivery_fee, -1)
 );


-- ── 3. VERIFY ──────────────────────────────────────────────────────
-- Expect: 171 deliveries · $54,472.50 fees · $104,121.03 groceries · $15,643.75 driver pay
SELECT 'AFTER' AS stage, count(*) AS deliveries,
       to_char(coalesce(sum(delivery_fee),0),'FM$999,999.00')            AS delivery_fees,
       to_char(coalesce(sum(sinclairs_grocery_total),0),'FM$999,999.00') AS groceries,
       to_char(coalesce(sum(amount_paid_driver),0),'FM$999,999.00')      AS driver_pay
  FROM deliveries
 WHERE delivery_date >= '2026-01-01' AND delivery_date < '2027-01-01';

-- Rows with a vessel but no matched barge line.
-- Expect ONLY "Training" rows — those legitimately have no company.
SELECT delivery_date, vessel_name, delivery_driver
  FROM deliveries
 WHERE delivery_date >= '2026-01-01' AND company_id IS NULL AND vessel_name IS NOT NULL
 ORDER BY delivery_date;


-- ═══════════════════════════════════════════════════════════════════
-- OPTIONAL — 2025 history (51 rows, Oct–Dec 2025)
-- ═══════════════════════════════════════════════════════════════════
-- These import cleanly, but the ledger screen is hard-coded to 2026
-- (LEDGER_YEAR), so they stay invisible until the year selector is made
-- dynamic. Worth having for year-over-year reporting. Uncomment to run:
/*
WITH incoming (delivery_date, delivery_driver, hours_worked, amount_paid_driver, vessel_name, company_name, service_type, location_delivered, delivery_fee, bill_for_groceries, sinclairs_grocery_total, updated_quickbooks, phone_number_used, issues_comments, gts_correspondent, invoice_sent, incentive) AS (
  VALUES
    ('2025-10-02'::date, 'Jon Huges'::text, 2.0::numeric, 150.0::numeric, 'Pat Pickett'::text, 'Reliant'::text, 'Dusk to Dawn Delivery(Grocery)'::text, 'In front of Grafton'::text, 450.0::numeric, false::boolean, NULL::numeric, true::boolean, '270-564-7338'::text, 'No issues or problems'::text, 'Jen'::text, '2025-10-31'::date, NULL::text),
    ('2025-10-06', 'Tanner Critchfield', 2.0, 50.0, 'Joyce Hale', 'Artco', 'Daytime Water Delivery', 'In front of Grafton', 350.0, true, NULL, true, '314-803-4828', 'No issues or problems', 'Jen', '2025-10-31', NULL),
    ('2025-10-09', 'Tanner Critchfield', 2.0, 150.0, 'Co Op Vanguard', 'Artco', 'Dusk to Dawn Delivery(Grocery)', 'In front of Grafton', 450.0, true, NULL, true, '314-803-4817', 'No issues or problems', 'MK', '2025-10-31', NULL),
    ('2025-10-10', 'Rhylon DeSherlia', 3.0, 175.0, 'Mary Evelyn', 'Artco', 'Land Nighttime Delivery - Port of STL', 'ARTCO STL Port', 550.0, true, NULL, true, '314-803-4829', 'No issues or problems', 'MK', '2025-10-31', NULL),
    ('2025-10-12', 'John Hughes', 2.0, 50.0, 'Thomas K', 'Reliant', 'Daytime Water Delivery', 'In front of Grafton', 650.0, false, NULL, true, '662-394-1563', 'Includes Fridge (40% markup plus $300 Delivery Fee) and Lumber', 'MK', '2025-10-31', NULL),
    ('2025-10-18', 'John Critchfield', 2.0, 50.0, 'Coop Mariner', 'Reliant', 'Daytime Water Delivery', 'In front of Grafton', 350.0, false, NULL, true, '314-803-4815', 'No issues or problems', 'LS', '2025-10-31', NULL),
    ('2025-10-19', 'John Critchfield', 2.0, 50.0, 'Donna Furlong', 'Hines Furlong', 'Daytime Water Delivery', 'In front of Grafton', 350.0, true, NULL, true, '270-816-2141', 'No issues or problems', 'LS', '2025-10-31', NULL),
    ('2025-10-20', 'Rhylon DeSherlia', 4.0, 100.0, 'Mary Evelyn', 'Artco', 'Land Daytime Delivery', 'ARTCO STL Port', 450.0, true, NULL, true, '314-803-4829', 'No issues or problems', 'Jen', '2025-10-31', NULL),
    ('2025-10-21', 'John Critchfield', 2.0, 150.0, 'Darin Adrian', 'Marquette', 'Dusk to Dawn Delivery(Grocery)', 'In front of Grafton', 450.0, false, NULL, true, '270-217-3831', 'No issues or problems', 'Jen', '2025-10-31', NULL),
    ('2025-10-28', 'John Critchfield', 2.0, 50.0, 'Ron Nokes', 'Kirby', 'Daytime Water Delivery', 'In front of Grafton', 350.0, false, NULL, true, '346-339-4685', 'No issues or problems', 'MK', '2025-10-31', NULL),
    ('2025-10-28', 'John Critchfield', 2.0, 150.0, 'Kevin Michael', 'Reliant', 'Crew Change Nighttime (1 person)', 'Chautauqua', 450.0, false, NULL, true, '270-210-5105', 'No issues or problems', 'MK', '2025-10-31', NULL),
    ('2025-10-29', 'John Critchfield', 2.0, 50.0, 'Kevin Michael', 'Reliant', 'Crew Change Daytime (2 people)', 'Chautauqua', 350.0, false, NULL, true, '270-210-5105', 'No issues or problems', 'MK', '2025-10-31', NULL),
    ('2025-11-04', 'John Critchfield', 2.0, 50.0, 'Jennie K', 'Reliant', 'Daytime Water Delivery', 'In front of Grafton', 350.0, false, NULL, true, NULL, 'No issues or problems', 'LS', '2025-12-01', NULL),
    ('2025-11-04', 'Rhylon DeSherlia', 2.0, 50.0, 'Training', NULL, NULL, NULL, NULL, NULL, NULL, true, NULL, NULL, NULL, NULL, NULL),
    ('2025-11-05', 'Rhylon DeSherlia', 2.0, 50.0, 'Noble Parsonage', 'ACBL', 'Daytime Land Delivery', 'River Road', 350.0, false, NULL, true, NULL, 'No issues or problems', 'LS', '2025-12-01', NULL),
    ('2025-11-05', 'Joe and Rhylon', 2.0, 50.0, 'Kevin Michael', 'Reliant', 'Daytime Water Delivery', 'In front of Grafton', 350.0, false, NULL, true, NULL, 'No issues or problems', 'LS', '2025-12-01', NULL),
    ('2025-11-09', 'John Critchfield', 2.0, 50.0, 'YoungSuk Chi', 'Ingram', 'Daytime Water Delivery', 'In Front of Grafton', 350.0, false, NULL, true, NULL, 'No issues or problems', 'LS', '2025-12-01', NULL),
    ('2025-11-10', 'Dad', 2.0, 0.0, 'Dale Heller', 'Ingram', 'Daytime Water Delivery', 'In Front of Grafton', 350.0, false, NULL, true, NULL, 'No issues or problems', 'LS', '2025-12-01', NULL),
    ('2025-11-14', 'Josh Brunaugh', 7.5, 287.5, 'Mary Evelyn', 'Artco', 'Nighttime Land Delivery', 'Artco North Terminal', 550.0, true, NULL, true, '314-803-4829', '- Driver had to wait a long time to deliver.', 'Jen', '2025-12-01', NULL),
    ('2025-11-15', 'Brett Lander', 2.0, 50.0, 'Jennie K', 'Reliant', 'Daytime Delivery by Boat', 'In Front of Grafton', 350.0, false, NULL, true, '662-394-1564', 'No issues or problems', 'Jen', '2025-12-01', NULL),
    ('2025-11-15', 'Brett Lander', 2.0, 150.0, 'Coop Vanguard', 'Artco', 'Nighttime Boat Delivery', 'In Front of Grafton', 450.0, true, NULL, true, '314-803-4817', 'No issues or problems', 'Jen', '2025-12-01', NULL),
    ('2025-11-18', 'John Critchfield', 2.0, 50.0, 'R Stewart', 'Kirby', 'Daytime Delivery by Boat', 'In front of Grafton', 350.0, false, NULL, true, '1-225-270-1132', 'No Issues charge CC', 'LS', '2025-12-01', NULL),
    ('2025-11-21', 'Rhylon DeSherlia (with Nipper)', 2.0, 100.0, 'Richard Waugh', 'Ingram', 'Daytime Delivery by Boat', 'In front of Grafton', 350.0, false, NULL, true, '1-270-559-4277', 'No Issues', 'LS', '2025-12-01', NULL),
    ('2025-11-23', 'Rhylon DeSherlia (with Nipper)', 2.0, 200.0, 'Prairie Dawn', 'Artco', 'Nighttime Boat Delivery', 'In Front of Grafton', 450.0, true, NULL, true, '1-314-803-4831', 'No Issues', 'LS', '2025-12-01', NULL),
    ('2025-11-25', 'Jeremy Gibson', 2.0, 50.0, 'Mary Evelyn', 'Artco', 'Daytime Land Delivery', 'Artco North Terminal', 450.0, true, NULL, true, '314-803-4829', 'No issues', 'Jen', '2025-12-01', NULL),
    ('2025-11-25', 'Brett Lander', 2.0, 150.0, 'Ron Nokes', 'Kirby', 'Nighttime Boat Delivery', 'In front of Grafton', 450.0, false, NULL, true, '346-339-4685', 'No issues', 'Jen', '2025-12-01', NULL),
    ('2025-11-26', 'Brett Lander', 2.0, 50.0, 'Noble Parsonage', 'ACBL', 'Daytime Delivery by Boat', 'In front of Grafton', 350.0, false, NULL, true, '314-614-8237', 'No issues', 'Jen', '2025-12-01', NULL),
    ('2025-11-28', 'Brett Lander', 2.0, 150.0, 'Coop Venture', 'Reliant', 'Nighttime Boat Delivery', 'In front of Grafton', 450.0, false, NULL, true, '618-513-7876 and 314-803-4841', 'No issues', 'Jen', '2025-12-01', NULL),
    ('2025-11-28', 'Brett Lander', 2.0, 150.0, 'Andrew Cannava', 'ACBL', 'Nighttime Boat Delivery', 'In front of Grafton', 450.0, false, NULL, true, '812-786-9206', 'Cart into water', 'Jen', '2025-12-01', NULL),
    ('2025-11-29', 'Brett Lander', 2.0, 150.0, 'Coop Mariner', 'Reliant', 'Nighttime Boat Delivery', 'Parked below Grafton', 450.0, true, NULL, true, '314-803-4815', 'Severe weather', 'Jen', '2025-12-01', NULL),
    ('2025-12-02', 'Rhylon', 3.0, 75.0, 'New Dawn', 'Artco', 'Daytime Land Delivery', 'Artco North Terminal', 450.0, true, NULL, true, '314-803-4830', 'No issues', 'LS', NULL, NULL),
    ('2025-12-04', 'Rhylon and Nipper', 2.0, 100.0, 'Thomas K', 'Reliant', 'Daytime Water Delivery', 'Grafton', 350.0, false, NULL, true, NULL, NULL, 'LS', NULL, NULL),
    ('2025-12-04', 'Rhylon and Nipper', 1.0, 50.0, 'Ron Nokes', 'Kirby', 'Daytime Water Delivery', 'Grafton', 350.0, false, NULL, true, NULL, NULL, 'LS', NULL, NULL),
    ('2025-12-03', 'John Critchfield', 5.0, 125.0, 'Oliver Shearer', 'Excel Marine', 'Extended Land Delivery', 'Meredosia', 500.0, false, NULL, true, '618-600-3451', NULL, 'LS', NULL, NULL),
    ('2025-12-03', 'Tanner Critchfield', 2.0, 50.0, 'Diane Denise', 'Reliant', 'Daytime Water Delivery', 'Grafton', 350.0, true, NULL, true, '270-559-5809', '$187.44 Ice Melt Includes $50 for delivery for Laura', 'LS', NULL, NULL),
    ('2025-12-04', 'Rhylon and Nipper', 2.0, 200.0, 'Coop Vanguard', 'Artco', 'Nighttime Water Delivery', 'Grafton', 450.0, true, NULL, true, '314-803-4817', NULL, 'LS', NULL, NULL),
    ('2025-12-07', 'Tanner Critchfield', 2.0, 150.0, 'Dennis Delaney', 'Ingram', 'Nighttime Water Delivery', 'Grafton', 450.0, false, NULL, true, '1-270-933-0934', 'Need to send you picture of receipt from shed', 'LS', NULL, NULL),
    ('2025-12-07', 'Tanner Critchfield', 2.0, 50.0, 'Prairie Dawn', 'Artco', 'Daytime Water Delivery', 'Grafton', 350.0, true, NULL, true, '314-803-4831', NULL, 'LS', NULL, NULL),
    ('2025-12-08', 'Rhylon and Nipper', 2.0, 150.0, 'Coop Mariner', 'Reliant', 'Nighttime Water Delivery', 'Grafton', 450.0, true, NULL, true, '314-803-4815', 'No Issues', 'Jen', NULL, NULL),
    ('2025-12-11', 'Brett Lander', 2.0, 150.0, 'R Stewart', 'Kirby', 'Nighttime Water Delivery', 'Grafton', 450.0, false, NULL, true, '225-270-1132', 'No Issues', 'Jen', NULL, NULL),
    ('2025-12-16', 'Brett Lander', 7.0, 175.0, 'Paul Brotzke', 'ACBL', 'Daytime Extended Van Delivery', 'Naples', 500.0, false, NULL, true, '812-786-9244', 'Picked Up at PTL in Woodriver then Took to Naples IL', 'LS', NULL, NULL),
    ('2025-12-17', 'Brett Lander', 2.0, 50.0, 'Co Op Mariner', 'Reliant', 'Daytime Boat Delivery', 'Grafton', 350.0, false, NULL, true, '314-803-4815', 'No Issues', 'LS', NULL, NULL),
    ('2025-12-18', 'Brett Lander', 3.0, 75.0, 'Sierra Dawn', 'Artco', 'Daytime Van Delivery', 'National maintenance Alton', 350.0, true, NULL, true, '314-803-4835', 'All good, added an hour for Brett filling up diesel at the property', NULL, NULL, NULL),
    ('2025-12-18', 'Brett Lander', 4.0, 100.0, 'Oliver Shearer', 'Excel Marine', 'Daytime Van Delivery', 'Florance, IL', 450.0, false, NULL, true, NULL, 'No Issues', 'LS', NULL, NULL),
    ('2025-12-18', 'Brett Lander', 2.0, 150.0, 'Sugarland', 'Florida Marine', 'Nighttime Van Delivery', 'Pere Marquette', 450.0, true, NULL, true, NULL, 'PO Number:FMT 149214 1-985-373-0529', 'LS', NULL, NULL),
    ('2025-12-23', 'Nipper and Rhylon (both)', 2.0, NULL, 'Ron Nokes', 'Kirby', 'Crew Change- Daytime', 'Grafton', 350.0, NULL, NULL, true, '346-339-4685', 'PO Number- 1022860 Driver pay recorded on the spreadsheet as "$50/$50".', 'Jen', NULL, NULL),
    ('2025-12-28', 'Brett Lander', 2.0, 150.0, 'Donna Furlong', 'Hines Furlong', 'Nighttime Boat Delivery', 'Grafton', 450.0, true, NULL, true, '207-816-2141', 'No issues', 'Jen', NULL, NULL),
    ('2025-12-29', 'Brett Lander', 2.0, 50.0, 'Coop Mariner', 'Reliant', 'Daytime Boat Delivery', 'Grafton', 350.0, false, NULL, true, '314-803-4815', 'No issues', 'Jen', NULL, NULL),
    ('2025-12-30', 'Brett Lander', 3.0, 175.0, 'Coop Enterprise', 'Artco', 'Nighttime Van Delivery', 'Artco North Terminal', 450.0, true, NULL, true, '314-803-4814', 'No issues', 'Jen', NULL, NULL),
    ('2025-12-31', 'Brett Lander', 3.0, 175.0, 'Prosperity', 'Artco', 'Nighttime Van Delivery', 'Artco North Terminal', 450.0, true, NULL, true, '314-803-4832', 'No issues', 'Jen', NULL, NULL),
    ('2025-12-01', 'Nipper', 2.0, 50.0, 'New Dawn', 'Artco', 'Daytime Land Delivery', 'Artco North Terminal', 0.0, NULL, NULL, true, NULL, 'Per text to Brandi on 12/29, pay to correct breakdown between Rhylon and Nipper''s pay', 'MK', NULL, NULL)
),
resolved AS (
  SELECT i.*, c.id AS company_id
    FROM incoming i
    LEFT JOIN companies c ON lower(btrim(c.name)) = lower(btrim(i.company_name))
)
INSERT INTO deliveries (company_id, delivery_date, delivery_driver, hours_worked, amount_paid_driver, vessel_name, service_type, location_delivered, delivery_fee, bill_for_groceries, sinclairs_grocery_total, updated_quickbooks, phone_number_used, issues_comments, gts_correspondent, invoice_sent, incentive)
SELECT r.company_id, r.delivery_date, r.delivery_driver, r.hours_worked, r.amount_paid_driver, r.vessel_name, r.service_type, r.location_delivered, r.delivery_fee, r.bill_for_groceries, r.sinclairs_grocery_total, r.updated_quickbooks, r.phone_number_used, r.issues_comments, r.gts_correspondent, r.invoice_sent, r.incentive
  FROM resolved r
 WHERE NOT EXISTS (
   SELECT 1 FROM deliveries d
    WHERE d.delivery_date = r.delivery_date
      AND coalesce(d.vessel_name,'')      = coalesce(r.vessel_name,'')
      AND coalesce(d.delivery_driver,'')  = coalesce(r.delivery_driver,'')
 );
*/


-- ═══════════════════════════════════════════════════════════════════
-- CORRECTIONS APPLIED ON THE WAY IN (37)
-- ═══════════════════════════════════════════════════════════════════
--   r5 company 'ARTCO' -> 'Artco'
--   r6 company 'ARTCO' -> 'Artco'
--   r7 company 'ARTCO' -> 'Artco'
--   r11 company 'ARTCO' -> 'Artco'
--   r22 company 'ARTCO' -> 'Artco'
--   r24 company 'ARTCO' -> 'Artco'
--   r27 company 'ARTCO' -> 'Artco'
--   r28 company 'ARTCO' -> 'Artco'
--   r34 company 'ARTCO' -> 'Artco'
--   r37 company 'Excell' -> 'Excel Marine'
--   r47 company 'Excell' -> 'Excel Marine'
--   r49 driver pay '$50/$50' -> NULL, wording kept in comments
--   r52 company 'ARTco' -> 'Artco'
--   r54 company 'ARTCO' -> 'Artco'
--   r60 company 'ARTCO' -> 'Artco'
--   r64 company 'ARTCO' -> 'Artco'
--   r67 invoice_sent (free text) -> NULL, wording kept in comments
--   r71 company 'Excell' -> 'Excel Marine'
--   r72 company 'Relient' -> 'Reliant'
--   r75 company 'Relient' -> 'Reliant'
--   r87 company 'Relient' -> 'Reliant'
--   r93 company 'Relient' -> 'Reliant'
--   r94 company 'Relient' -> 'Reliant'
--   r98 company 'Relient' -> 'Reliant'
--   r104 company 'Relient' -> 'Reliant'
--   r106 company 'Relient' -> 'Reliant'
--   r137 company 'ARTco' -> 'Artco'
--   r155 company 'ARTco' -> 'Artco'
--   r160 company 'Relient' -> 'Reliant'
--   r177 company 'Excell' -> 'Excel Marine'
--   r189 company 'Relient' -> 'Reliant'
--   r194 company 'Relient' -> 'Reliant'
--   r201 company 'Relient' -> 'Reliant'
--   r202 company 'Relient' -> 'Reliant'
--   r208 service 'Dayvime Van Delivery' -> corrected
--   r216 delivery fee 'Courtsey Delivery' -> NULL, wording kept in comments
--   r223 delivery_date '2025-08-25' -> '2026-08-25' (CONFIRMED year typo)
--
-- The spreadsheet itself is untouched. "Relient" for Reliant is the one that
-- keeps recurring (13 rows) — worth fixing at the source or it needs doing
-- again on every future import.
