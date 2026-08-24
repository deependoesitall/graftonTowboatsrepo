import { pickSheetHtml } from './pick-sheet.js';
let n=0;
const it = o => ({ id:`i${++n}`, description:o.d, category:o.cat||'Pantry & Grocery', pkg_size:o.size||null,
  uom:o.uom||'EA', upc:o.upc??'012345678905', location:o.loc||'Aisle 5', location_seq:null,
  image_url:o.img===false?null:'https://x/y.png', unit_price:o.p??3.99, quantity:o.q??1,
  line_total:(o.p??3.99)*(o.q??1), actual_total:o.actual??null, actual_weight:o.wt??null,
  item_type:o.svc?'service':'grocery', service_type:o.svc||null, service_details:o.sd||null,
  paid_by:o.pb||'vessel', cod_name:o.cod||null, shopping_status:o.oos?'out_of_stock':'pending',
  is_substitution:!!o.isSub, regular_price:o.reg??null, sale_finish_date:o.end??null });
const order = { order_number:'GTS-1', created_at:'2026-08-21T17:00:00Z', status:'in_progress',
  vessel_name:'TestShip', company_name:'JennyK', arrival_date:'2026-08-22', arrival_time:'15:30',
  terminal_name:'Dock 3', notes:null, items:[
    it({ d:'Sweet Yellow Corn', cat:'Produce', loc:'Produce', p:0.69, q:6, reg:0.79, end:'2026-08-25' }),
    it({ d:'GROUND CHUCK', cat:'Meat & Seafood', loc:'Meat', p:24.95 }),
    it({ d:'PAPER TOWELS', pb:'deck', p:21.99, loc:'Aisle 9' }),
    it({ d:'TYLENOL', pb:'cod', cod:'Andy', p:11.47, reg:13.99, end:'2026-08-25' }),
    it({ d:'ADVIL', pb:'cod', cod:'Lisa', p:11.93, img:false }),
    it({ d:'Other Third-Party Item', svc:'other_pickup', p:0, upc:null,
         sd:{ url:'https://www.walmart.com/ip/VIZIO-55-Mini-LED-TV/7751017286?x=1', notes:'TV please', paid_by:'cod', cod_name:'Deepen' } }),
  ]};
const h = pickSheetHtml(order);
const ck = (n,c)=>console.log(`  ${c?'ok  ':'FAIL'} ${n}`);
console.log('SECTIONS:', [...h.matchAll(/<h2>(.*?)<\/h2>/g)].map(m=>m[1].replace(/&mdash;/g,'—')).join(' → '));
console.log('\nPICK SHEET AUDIT');
ck('sale shows price, dates, struck-through regular', /class="sale">\$0\.69.*thru 08\/25\/26.*<s>\$0\.79<\/s>/s.test(h));
ck('non-sale line shows a plain price', h.includes('$24.95') && !/\$24\.95[^<]*<s>/.test(h));
ck('COD sale line also formatted', /\$11\.47.*<s>\$13\.99<\/s>/s.test(h));
ck('deck section present + own page', h.includes('Deck Supplies') && h.includes('newpage'));
ck('COD grouped by person', h.includes('>Andy<') && h.includes('>Lisa<'));
ck('outside pickup last', h.lastIndexOf('Outside Pickups') > h.lastIndexOf('COD &mdash; collect'));
ck('walmart URL shortened for print', h.includes('walmart.com/ip/VIZIO-55-Mini-LED-TV') && !h.includes('?x=1'));
ck('landscape', h.includes('letter landscape'));
ck('thumbnails + placeholder', h.includes('class="thumb"') && h.includes('thumb-empty'));
ck('Freshop-style counts', /Unique Item<br\/>Count/.test(h));
ck('subtotals per section', ([...h.matchAll(/dept-total">.*?<b>/g)]||[]).length >= 3);
ck('no unescaped user text', !h.includes('<script'));
