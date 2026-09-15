import {
  stripDuplicateReceiptCopy,
  parseRegisterReceiptText,
} from '../src/lib/register-receipt-parse.ts';

const sample = `
BAKERY
Plu# 25022400000
12 CT CUPCAKES              12.99 1 F
Plu# 25016300000
FRENCH BREAD                 1.99 1 F
Plu# 25016300000
FRENCH BREAD                 1.99 1 F
DAIRY
Plu# 7003836538
AS ORANGE JUICE              6.99 1 F
6 @       6.99 EA           41.94 1 F
Plu# 7003837280
BC LARGE EGGS           W
30 @      1.49 EA           44.70 1 F
Plu# 30081073088
NEOSPORIN ONTMNT             6.09 1
Plu# 4011
BANANAS                 W
2.60 lb @  0.74/ lb          1.92 1 F
Plu# 4132100625
WISHBONE
1 @  2 FOR  5.00             2.50 1 F
MEATS
MEATS                      107.97 1 F
TAX-CODE  TAXABLE-VAL  TAX-VALUE
Food Tax                    42.08
BALANCE DUE               4347.13
IN HOUSE CHARGE
CASHIER NAME: SHIRLEY
 D U P L I C A T E   R E C E I P T
BAKERY
Plu# 25022400000
12 CT CUPCAKES              12.99 1 F
Plu# 25016300000
FRENCH BREAD                 1.99 1 F
Plu# 25016300000
FRENCH BREAD                 1.99 1 F
`;

const stripped = stripDuplicateReceiptCopy(sample);
const pluCount = stripped.split('Plu#').length - 1;
if (/DUPLICATE/i.test(stripped) || pluCount !== 8) {
  console.error('strip failed', pluCount, stripped.slice(-200));
  process.exit(1);
}
const rows = parseRegisterReceiptText(sample);
const by = Object.fromEntries(rows.map(r => [r.plu || r.description, r]));
const checks = [
  ['25022400000', 1, 12.99],
  ['25016300000', 2, 1.99],
  ['7003836538', 6, 6.99],
  ['7003837280', 30, 1.49],
  ['30081073088', 1, 6.09],
  ['4011', 2.6, 0.74],
  ['4132100625', 1, 2.5],
];
let fail = 0;
for (const [plu, qty, price] of checks) {
  const r = by[plu];
  if (!r) { console.error('missing', plu); fail++; continue; }
  if (Math.abs(r.qty - qty) > 0.01) { console.error(plu, 'qty', r.qty, 'want', qty); fail++; }
  if (r.unitPrice == null || Math.abs(r.unitPrice - price) > 0.02) { console.error(plu, 'price', r.unitPrice, 'want', price); fail++; }
}
const meats = rows.find(r => !r.plu && r.description === 'MEATS');
if (!meats || Math.abs((meats.unitPrice || 0) - 107.97) > 0.01) {
  console.error('MEATS write-in missing', meats); fail++;
}
if (fail) process.exit(1);

const reprintFirst = `PLEASE KEEP FOR YOUR RECORDS
CASHIER NAME: SHIRLEY
 D U P L I C A T E   R E C E I P T
BAKERY
Plu# 25022400000
12 CT CUPCAKES              12.99 1 F
Plu# 111
MILK                         3.00 1 F
`;
const kept = stripDuplicateReceiptCopy(reprintFirst);
if ((kept.match(/Plu#/g) || []).length < 2) {
  console.error('reprint-first dropped items', kept);
  process.exit(1);
}

const meatsPack = `
MEATS
MEATS                      107.97 1 F
MEATS
2 @      6.99              13.98 1 F
MEATS                      328.32 1 F
`;
const mp = parseRegisterReceiptText(meatsPack);
const meatSum = mp.filter(r => !r.plu).reduce((s, r) => s + (r.lineTotal || 0), 0);
if (Math.abs(meatSum - (107.97 + 13.98 + 328.32)) > 0.05) {
  console.error('MEATS pack lines missing', mp, meatSum);
  process.exit(1);
}

console.log('ok', rows.length, 'rows');
