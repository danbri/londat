// Shop adapters of the region canary-wharf for the stock-mcp server (a source adapter with its area: OKRS.md KR1.4;
// tools/check-locale.mjs counts nothing in tools/stock-mcp/adapters/): one stock check per call, for the Canary Wharf branch, through the calls the
// shops' own pages make (survey: cwplans/registry/sources/stock/stock-check-survey.json; skill cwplans-stock-check).
// Each adapter takes the shop's own product id (never a GTIN unless the shop's call takes one) and returns
// { canary_wharf: { store, answer }, stores: [...], source } with no page text beyond store names, counts and flags.
// The place (Canary Wharf: store ids, lat/long, postcode) is data here, per shop, not a constant of the core.
import { politeFetch } from '../policy.mjs';

import { readFileSync } from 'node:fs';
// the place and the shops' market come from a region data file (STOCK_MCP_REGION, default data/region.json)
const REGION = JSON.parse(readFileSync(process.env.STOCK_MCP_REGION || new URL('../data/region.json', import.meta.url), 'utf8'));
const CW = REGION.place, LOCALE = REGION.locale;
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim();
const need = (a, ...k) => { for (const x of k) if (a[x] == null || a[x] === '') throw new Error(`argument "${x}" is needed for this shop`); };

export const SHOPS = {
  'the-white-company': {
    name: 'The White Company', canaryWharf: 'jubilee-place', answer: 'unit count per shop (stockLevel, stockLevelStatus)',
    args: { variant_code: 'variant code, e.g. CLDDSNNA (base code + option; from /TWCcommercewebservices/v2/twc-uk/products/{code}?fields=FULL)' },
    async check(a, ctx) { need(a, 'variant_code');
      const u = `https://www.thewhitecompany.com/TWCcommercewebservices/v2/twc-uk/products/${encodeURIComponent(a.variant_code)}/stock?fields=DEFAULT`;
      const j = await (await politeFetch(u, {}, ctx)).json();
      const stores = (j.stores || []).map(s => ({ store: s.name, name: s.displayName, level: s.stockInfo?.stockLevel ?? null, status: s.stockInfo?.stockLevelStatus ?? null }));
      return { canary_wharf: stores.find(s => s.store === 'jubilee-place') || null, stores: stores.filter(s => s.level > 0).slice(0, 10), stores_total: stores.length, source: u };
    } },
  'crockett-jones': {
    name: 'Crockett & Jones', canaryWharf: '316', answer: 'quantity per shop (Quantity; the page shows <1 Out of Stock, <3 Low Stock)',
    args: { sku: 'variant SKU "<product>/<fit>/<size>", e.g. 20499A-J01L3/E/060 (Shopify products.json variants[].sku)' },
    async check(a, ctx) { need(a, 'sku'); const [product, fit, size] = String(a.sku).split('/'); if (!size) throw new Error('sku must be "<product>/<fit>/<size>"');
      const u = 'https://cj-app-152ce4da90df.herokuapp.com/stockcheck/';
      const j = await (await politeFetch(u, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ product, fit, size }).toString() }, ctx)).json();
      const stores = (Array.isArray(j) ? j : []).map(x => x.stockLevel || x).map(s => ({ store: String(s.StoreNum), name: s.Store, quantity: s.Quantity, in_transit: s.InTransit }));
      return { canary_wharf: stores.find(s => s.store === '316') || null, stores, source: u };
    } },
  'robert-dyas': {
    name: 'Robert Dyas', canaryWharf: 'rd_6088', answer: 'in stock yes/no for the asked quantity, collection time',
    args: { sku: 'numeric Magento SKU, e.g. 251735 (product page)', qty: 'quantity to ask for (default 1)' },
    async check(a, ctx) { need(a, 'sku');
      const u = 'https://www.robertdyas.co.uk/rest/robertdyas_uk_main_en_gb/V1/wct-fulfillment/location/get-inventory-availability';
      const body = { request: { items: [{ sku: String(a.sku), qty: String(a.qty || 1) }], locations: ['rd_6088'], extension_attributes: { skip_locations_stock: false } } };
      const j = await (await politeFetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, ctx)).json();
      const src = (j.source_list || []).find(s => s.source_code === 'rd_6088');
      return { canary_wharf: src ? { store: 'rd_6088', status: src.status?.code, label: src.status?.label, in_stock_items: (src.in_stock_items || []).length, collection: src.extension_attributes?.estimated_delivery_date_label || null } : null, source: u };
    } },
  'sostrene-grene': {
    name: 'Søstrene Grene', canaryWharf: '8039', answer: 'per shop 1 out of stock, 2 few in stock, 3 in stock',
    args: { sku: 'variant SKU "999999-999", e.g. 521893-002 (product page variants[].sku)' },
    async check(a, ctx) { need(a, 'sku');
      const u = `https://sostrenegrene.com/umbraco/api/store/inventorysearch?sku=${encodeURIComponent(a.sku)}&address=${encodeURIComponent(CW.postcode)}&usegeocodingfeaturetoggle=false`;
      // the market comes from the culture: without it the Danish shop answers
      const j = await (await politeFetch(u, { headers: { culture: LOCALE, cookie: `culture=${LOCALE}` } }, ctx)).json();
      const lv = { 1: 'out of stock', 2: 'few in stock', 3: 'in stock' };
      const stores = (j.stores || []).map(s => { const inv = (s.inventory || [])[0] || {}; return { store: String(s.id), name: s.name, state: inv.state, level: lv[inv.state] || inv.description || null, distance: s.distance }; });
      const cw = stores.find(s => s.store === '8039') || null;
      return { canary_wharf: cw, stores: stores.slice(0, 6), market_check: cw ? LOCALE : 'Canary Wharf (8039) not in the answer: check the market (Danish answer?)', source: u };
    } },
  'watches-of-switzerland': {
    name: 'Watches of Switzerland', canaryWharf: '466', answer: 'stockLevel and status (inStock, lowStock, outOfStock) for the showroom',
    args: { product_code: '8-digit SAP Commerce product code, e.g. 17631061 (product URL /p/<code>)', store: 'showroom id (default 466, Canary Wharf)' },
    async check(a, ctx) { need(a, 'product_code'); const st = String(a.store || '466');
      const u = `https://www.watches-of-switzerland.co.uk/occ/v2/WatchesOfSwitzerland_UK/products/${encodeURIComponent(a.product_code)}/stock/${encodeURIComponent(st)}`;
      const j = await (await politeFetch(u, {}, ctx)).json();
      return { canary_wharf: { store: st, level: j.stockLevel ?? null, status: j.stockLevelStatus ?? null, rounded: j.isValueRounded ?? null }, source: u };
    } },
  'space-nk': {
    name: 'Space NK', canaryWharf: 'Canary Wharf (the id is the name)', answer: 'available yes/no per shop, same-day courier flags',
    args: { product_id: 'variant id UK2000xxxxx (JSON-LD hasVariant[].sku)' },
    async check(a, ctx) { need(a, 'product_id');
      const u = `https://www.spacenk.com/on/demandware.store/Sites-spacenkgb-Site/en_GB/FindInStore-GetStores?storesCount=5&productID=${encodeURIComponent(a.product_id)}&postcode=${encodeURIComponent(CW.postcode)}`;
      const j = await (await politeFetch(u, {}, ctx)).json();
      const stores = (j.stores || []).map(s => ({ store: s.ID, name: s.name, available: s.isAvailable, courier_stuart: s.isStuartAvailable, courier_express: s.isExpressAvailable }));
      return { canary_wharf: stores.find(s => /canary wharf/i.test(s.store + ' ' + s.name)) || null, stores, source: u };
    } },
  hobbs: {
    name: 'Hobbs', canaryWharf: '377', answer: 'count per shop ("N in stock" or "Out of Stock")',
    args: { pid: 'master product id, e.g. 0226-5770-9045L00', color: 'colour code from the product page find-in-store form, e.g. 1880', size: 'size code from that form (UK 12 = 004), not the UK size' },
    async check(a, ctx) { need(a, 'pid', 'color');
      const p = new URLSearchParams({ pid: a.pid, lat: CW.lat, long: CW.lon, [`dwvar_${a.pid}_color`]: a.color, dwfrm_address_country: CW.country, postalCode: CW.postcode });
      if (a.size) p.set(`dwvar_${a.pid}_size`, a.size);
      const u = `https://www.hobbs.com/on/demandware.store/Sites-HB-UK-Site/en/Product-StockCheck?${p}`;
      const h = await (await politeFetch(u, {}, ctx)).text();
      const stores = [...h.matchAll(/for="store-([0-9A-Za-z]+)"([\s\S]*?)(?=for="store-|$)/g)].map(m => { const t = strip('<x ' + m[2]); return { store: m[1], name: (t.match(/^([A-Z][A-Z '&.-]+?)(?=\s+\d|\s+[A-Z][a-z])/) || [])[1] || t.slice(0, 40), stock: (t.match(/(\d+\s+in stock|Out of Stock)/i) || [])[1] || null, distance: (t.match(/([\d.]+\s*mi)/) || [])[1] || null }; });
      return { canary_wharf: stores.find(s => s.store === '377') || null, stores, heading: (strip(h).match(/Stock found in \d+ stores?|No stock[^.]*/i) || [])[0] || null, source: u };
    } },
  boss: {
    name: 'BOSS (Hugo Boss)', canaryWharf: 'boss-store-unit-5-cabot-place-west-london (no number)', answer: 'sizes in stock per shop (no counts)',
    args: { pid: 'product and colour id, e.g. hbeu50565503_001', skus: 'array of [EAN, size] pairs for the sizes to ask about (product page data)' },
    async check(a, ctx) { need(a, 'pid', 'skus');
      const p = new URLSearchParams({ skus: JSON.stringify(a.skus), pid: a.pid, lat: CW.lat, lon: CW.lon });
      const u = `https://www.hugoboss.com/on/demandware.store/Sites-UK-Site/en_GB/Retail-DoRetailAvailabilitySearch?${p}`;
      const h = await (await politeFetch(u, {}, ctx)).text();
      const stores = [...h.matchAll(/class="retailavailability-store"([\s\S]*?)(?=class="retailavailability-store"|$)/g)].map(m => ({ store: (m[1].match(/\/uk\/(boss-store-[a-z0-9-]+)\//) || [])[1] || null, text: strip(m[1]).slice(0, 200) }));
      return { canary_wharf: stores.find(s => /cabot-place/.test(s.store || '')) || null, stores: stores.slice(0, 5), not_found: /could not find/i.test(h), source: u };
    } },
  intimissimi: {
    name: 'Intimissimi', canaryWharf: 'IGJ4', answer: 'per shop and size: none, low or high (shops without the item are left out)',
    args: { pid: 'style code, e.g. CLD28B (product URL)', color: 'colour code, e.g. 019', size: 'up to 3 sizes joined by _, e.g. S_M_L' },
    async check(a, ctx) { need(a, 'pid', 'color', 'size');
      const p = new URLSearchParams({ lat: CW.lat, lon: CW.lon, rad: 0, pid: a.pid, color: a.color, size: a.size, filterBopis: 'false', currentHour: new Date().getUTCHours() });
      const u = `https://www.intimissimi.com/on/demandware.store/Sites-intimissimi-uk-Site/en_GB/FindInStore-GetStoresWithProductAvailability?${p}`;
      const j = await (await politeFetch(u, {}, ctx)).json();
      // each record: { availabilities: { S: 'high', ... }, store: { ...details }, labels }; the id field name of the
      // nested store is not fixed in what we saw, so the 4-character store code is the fallback
      const idOf = st => st.ID || st.id || st.storeId || st.storeID || (JSON.stringify(st).match(/"([0-9A-Z]{4})"/) || [])[1] || null;
      const stores = (j.stores || []).map(x => { const st = typeof x.store === 'object' && x.store ? x.store : x;
        return { store: idOf(st), name: st.name || st.storeName || null, distance: st.distance ?? null, sizes: x.availabilities || null }; });
      return { canary_wharf: stores.find(x => x.store === 'IGJ4' || /canary wharf/i.test(x.name || '')) || null, stores: stores.slice(0, 9), source: u };
    } },
  accessorize: {
    name: 'Accessorize', canaryWharf: '1163', answer: 'products the Canary Wharf shop holds for a search term (no counts per product)',
    args: { query: 'search text, e.g. "bag"' },
    async check(a, ctx) { need(a, 'query');
      const u = `https://www.accessorize.com/uk/search?q=${encodeURIComponent(a.query)}&prefn1=storeAvailability&prefv1=1163`;
      const h = await (await politeFetch(u, { headers: { 'accept-language': LOCALE } }, ctx)).text();
      const pids = [...new Set([...h.matchAll(/data-pid="([0-9A-Za-z_-]+)"/g)].map(m => m[1]))];
      return { canary_wharf: { store: '1163', products: Number((h.match(/(\d[\d,]*)\s*(?:products|Products)/) || [])[1]?.replace(/,/g, '')) || pids.length, first_page_pids: pids.slice(0, 40) }, source: u };
    } },
};
