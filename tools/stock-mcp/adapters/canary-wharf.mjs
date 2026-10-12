// Shop adapters of the region canary-wharf for the stock-mcp server (a source adapter with its area: OKRS.md KR1.4;
// tools/check-locale.mjs counts nothing in tools/stock-mcp/adapters/): one stock check per call, for the Canary Wharf branch, through the calls the
// shops' own pages make (survey: cwplans/registry/sources/stock/stock-check-survey.json; skill cwplans-stock-check).
// Each adapter takes the shop's own product id (never a GTIN unless the shop's call takes one) and returns
// { canary_wharf: { store, answer }, stores: [...], source } with no page text beyond store names, counts and flags.
// The place (Canary Wharf: store ids, lat/long, postcode) is data here, per shop, not a constant of the core.
import { politeFetch, fetchWithJar, browserPage, browserGoto, browserFetchText } from '../policy.mjs';

import { readFileSync } from 'node:fs';
// the place and the shops' market come from a region data file (STOCK_MCP_REGION, default data/region.json)
const REGION = JSON.parse(readFileSync(process.env.STOCK_MCP_REGION || new URL('../data/region.json', import.meta.url), 'utf8'));
const CW = REGION.place, LOCALE = REGION.locale;
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim();
const localHour = () => +new Intl.DateTimeFormat('en', { hour: 'numeric', hourCycle: 'h23', timeZone: REGION.timeZone }).format(new Date());
const unent = t => String(t || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const getJson = async (u, init, ctx) => (await politeFetch(u, init, ctx)).json();
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
    },
    findBy: 'words or a variant code (storefront search; EANs are not indexed), then the product JSON for sizes and colours',
    async find(a, ctx) {
      const base = 'https://www.thewhitecompany.com';
      const r = await fetchWithJar(`${base}/uk/search/async/search?text=${encodeURIComponent(a.query)}&countryIsoCode=${CW.country}&currencyIsoCode=GBP`, { headers: { accept: 'application/json' } }, ctx);
      const j = await r.json(), res = j.results || [];
      const code = x => x.singleSizeSku || (x.variantsSecondId || []).map(v => String(v).replace(/^v_uko_bs_/, '').toUpperCase())[0] || null;
      const cands = res.slice(0, 10).map(x => ({ name: x.name, url: x.url ? base + '/uk' + x.url : null, base_code: x.baseProductCode, online: x.stock?.stockLevelStatus?.code || null, args: code(x) && x.singleSizeSku ? { variant_code: code(x) } : {} }));
      const top = res[0];
      if (top && !top.singleSizeSku) {                                                 // several sizes or colours: the product JSON
        const pj = await (await politeFetch(`${base}/TWCcommercewebservices/v2/twc-uk/products/${encodeURIComponent(top.baseProductCode)}?fields=FULL`, { headers: { accept: 'application/json' } }, ctx)).json();
        cands[0].sizes = (pj.swatches || []).flatMap(sw => (sw.variantOptions || []).map(v => ({ label: [sw.name, v.size].filter(Boolean).join(' '), ean: v.ean || null, args: { variant_code: v.code } })));
      }
      return { total: j.pagination?.totalNumberOfResults ?? null, candidates: cands };
    } },
  'crockett-jones': {
    name: 'Crockett & Jones', canaryWharf: '316', answer: 'quantity per shop (Quantity; the page shows <1 Out of Stock, <3 Low Stock)',
    args: { sku: 'variant SKU "<product>/<fit>/<size>", e.g. 20499A-J01L3/E/060 (Shopify products.json variants[].sku)' },
    async check(a, ctx) { need(a, 'sku'); const [product, fit, size] = String(a.sku).split('/'); if (!size) throw new Error('sku must be "<product>/<fit>/<size>"');
      const u = 'https://cj-app-152ce4da90df.herokuapp.com/stockcheck/';
      const j = await (await politeFetch(u, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ product, fit, size }).toString() }, ctx)).json();
      const stores = (Array.isArray(j) ? j : []).map(x => x.stockLevel || x).map(s => ({ store: String(s.StoreNum), name: s.Store, quantity: s.Quantity, in_transit: s.InTransit }));
      return { canary_wharf: stores.find(s => s.store === '316') || null, stores, source: u };
    },
    findBy: 'words or the product part of a SKU (Shopify suggest), then the product JSON for sizes',
    async find(a, ctx) {
      const base = 'https://www.crockettandjones.com';
      const j = await getJson(`${base}/search/suggest.json?q=${encodeURIComponent(a.query)}&resources[type]=product&resources[limit]=10`, {}, ctx);
      const hits = j.resources?.results?.products || [];
      const top = hits[0]; let sizes = null;
      if (top) { const pj = await getJson(`${base}/products/${top.handle}.js`, {}, ctx);
        sizes = (pj.variants || []).map(v => ({ label: v.option1 || v.title, sku: v.sku, online: v.available, args: { sku: v.sku } })); }
      return { candidates: hits.map((h, i) => ({ name: h.title, url: base + String(h.url || '').split('?')[0], online: h.available, ...(i === 0 ? { sizes, args: {} } : { args: {} }) })), note: 'Crockett & Jones checks per size: choose sizes[].args (UK size with fit E); other candidates need find_product with their name' };
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
    },
    findBy: 'words, or an exact SKU (Magento GraphQL)',
    async find(a, ctx) {
      const q = /^\d{5,7}$/.test(a.query) ? `{products(filter:{sku:{eq:${JSON.stringify(a.query)}}}){total_count items{sku name url_key url_suffix stock_status}}}`
        : `{products(search:${JSON.stringify(a.query)},pageSize:10){total_count items{sku name url_key url_suffix stock_status}}}`;
      const j = await getJson(`https://www.robertdyas.co.uk/graphql?query=${encodeURIComponent(q)}`, { headers: { store: 'robertdyas_uk_main_en_gb', accept: 'application/json' } }, ctx);
      const d = j.data?.products || {};
      return { total: d.total_count ?? null, candidates: (d.items || []).map(x => ({ name: unent(x.name), url: `https://www.robertdyas.co.uk/${x.url_key}${x.url_suffix || ''}`, online: x.stock_status, args: { sku: x.sku } })) };
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
    },
    findBy: 'words or a variant SKU (site search)',
    async find(a, ctx) {
      const j = await getJson(`https://sostrenegrene.com/umbraco/api/search/batchedsearch?term=${encodeURIComponent(a.query)}&pageSize=10&searchType=0`, { headers: { culture: LOCALE, cookie: `culture=${LOCALE}`, accept: 'application/json' } }, ctx);
      const items = (j.searchResultItems || []).filter(x => x.type === 1);
      return { total: j.hitsProduct ?? null, candidates: items.map(x => ({ name: [x.name, x.subtitle].filter(Boolean).join(', '), url: x.directUrl ? new URL(x.directUrl, 'https://sostrenegrene.com').href : null,
        args: { sku: (x.mostRelevantVariant?.sku) || x.variants?.[0]?.sku }, sizes: (x.variants || []).map(v => ({ label: v.variantName || v.sku, args: { sku: v.sku } })) })) };
    } },
  'watches-of-switzerland': {
    name: 'Watches of Switzerland', canaryWharf: '466', answer: 'stockLevel and status (inStock, lowStock, outOfStock) for the showroom',
    args: { product_code: '8-digit SAP Commerce product code, e.g. 17631061 (product URL /p/<code>)', store: 'showroom id (default 466, Canary Wharf)' },
    async check(a, ctx) { need(a, 'product_code'); const st = String(a.store || '466');
      const u = `https://www.watches-of-switzerland.co.uk/occ/v2/WatchesOfSwitzerland_UK/products/${encodeURIComponent(a.product_code)}/stock/${encodeURIComponent(st)}`;
      const j = await (await politeFetch(u, {}, ctx)).json();
      return { canary_wharf: { store: st, level: j.stockLevel ?? null, status: j.stockLevelStatus ?? null, rounded: j.isValueRounded ?? null }, source: u };
    },
    findBy: 'words, a model reference (MPN) or a product code (OCC search; results mix new, pre-owned and ex-display)',
    async find(a, ctx) {
      const base = 'https://www.watches-of-switzerland.co.uk';
      const j = await getJson(`${base}/occ/v2/WatchesOfSwitzerland_UK/products/search?fields=PLP&query=${encodeURIComponent(a.query)}&currentPage=0&pageSize=48&lang=en&curr=GBP`, { headers: { accept: 'application/json' } }, ctx);
      return { total: j.pagination?.totalResults ?? null, candidates: (j.products || []).slice(0, 10).map(x => ({ name: [x.manufacturer, x.name].filter(Boolean).join(' '), url: x.url ? base + x.url : null, mpn: (String(x.url || '').match(/-([^/-]+)\/p\//) || [])[1] || null, price: x.price?.formattedValue || null, args: { product_code: x.code } })) };
    } },
  'space-nk': {
    name: 'Space NK', canaryWharf: 'Canary Wharf (the id is the name)', answer: 'available yes/no per shop, same-day courier flags',
    args: { product_id: 'variant id UK2000xxxxx (JSON-LD hasVariant[].sku)' },
    async check(a, ctx) { need(a, 'product_id');
      const u = `https://www.spacenk.com/on/demandware.store/Sites-spacenkgb-Site/en_GB/FindInStore-GetStores?storesCount=5&productID=${encodeURIComponent(a.product_id)}&postcode=${encodeURIComponent(CW.postcode)}`;
      const j = await (await politeFetch(u, {}, ctx)).json();
      const stores = (j.stores || []).map(s => ({ store: s.ID, name: s.name, available: s.isAvailable, courier_stuart: s.isStuartAvailable, courier_express: s.isExpressAvailable }));
      return { canary_wharf: stores.find(s => /canary wharf/i.test(s.store + ' ' + s.name)) || null, stores, source: u };
    },
    findBy: 'words (site search; EANs are not indexed): products with their shades',
    async find(a, ctx) {
      const base = 'https://www.spacenk.com';
      const h = await (await politeFetch(`${base}/uk/search?q=${encodeURIComponent(a.query)}`, { headers: { 'accept-language': LOCALE } }, ctx)).text();
      const parts = h.split(/<div[^>]+class="product[" ][^>]*data-pid="(MUK[0-9]+)"/).slice(1), cands = [];
      for (let i = 0; i < parts.length && cands.length < 10; i += 2) { const master = parts[i], body = parts[i + 1].slice(0, 20000);
        const shades = [...body.matchAll(/data-pid="(UK[0-9]+)"[^>]*aria-label="Select ([^"]+)"/g)].map(m => ({ label: unent(m[2]), args: { product_id: m[1] } }));
        const quick = (body.match(/quickbuy[^>]*data-pid="(UK[0-9]+)"|data-pid="(UK[0-9]+)"[^>]*quickbuy/) || []).slice(1).find(Boolean);
        const href = (body.match(/href="(\/uk\/[^"]*-MUK[0-9]+\.html)"/) || [])[1], name = unent((body.match(/class="[^"]*(?:product-name|pdp-link|tile-name)[^"]*"[^>]*>\s*(?:<a[^>]*>)?\s*([^<]{2,120})/) || [])[1] || '').trim();
        cands.push({ name: name || null, master, url: href ? base + href : null, args: quick ? { product_id: quick } : (shades[0]?.args || {}), sizes: shades.length ? shades : null }); }
      return { total: Number((h.match(/(\d[\d,]*)\s*Results/i) || [])[1]?.replace(/,/g, '')) || null, candidates: cands, note: 'sizes[] are the shades (each with its own product_id)' };
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
    },
    findBy: 'words (site search), then the product page for the size codes',
    async find(a, ctx) {
      const base = 'https://www.hobbs.com';
      const h = await (await politeFetch(`${base}/search/?q=${encodeURIComponent(a.query)}&sz=60`, { headers: { 'accept-language': LOCALE } }, ctx)).text();
      const cands = [], seen = new Set();
      for (const m of h.matchAll(/data-tracking="([^"]+)"/g)) { let t; try { t = JSON.parse(unent(m[1])); } catch { continue; } const it = t.item || t; if (!it.group_id || seen.has(it.id)) continue; seen.add(it.id);
        const near = h.slice(m.index, m.index + 8000), color = (near.match(new RegExp('dwvar_' + String(it.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '_color=([0-9A-Za-z]+)')) || near.match(/dwvar_[^=&"]+_color=([0-9A-Za-z]+)/) || [])[1];
        const href = (near.match(/href="(\/product\/[^"?]+\.html)/) || [])[1];
        cands.push({ name: it.name, url: href ? base + href : (it.url || null), colour_pid: it.id, args: color ? { pid: it.group_id, color } : { pid: it.group_id } }); if (cands.length >= 10) break; }
      const top = cands[0];
      if (top?.url && top.args.color) { const ph = await (await politeFetch(`${top.url}?dwvar_${encodeURIComponent(top.colour_pid)}_color=${top.args.color}`, { headers: { 'accept-language': LOCALE } }, ctx)).text();
        const sizes = [...ph.matchAll(/<li[^>]*size-capsules__list_item[^>]*>/g)].map(m => { const tag = m[0], v = (tag.match(/data-value="([^"]+)"/) || [])[1], c = (unent(tag).match(/_size=([0-9A-Za-z]+)/) || [])[1];
          return v && c ? { label: 'UK ' + unent(v).replace(/^UK\s*/i, ''), args: { ...top.args, size: c } } : null; }).filter(Boolean);
        const uniq = [...new Map(sizes.map(z => [z.args.size, z])).values()]; if (uniq.length) top.sizes = uniq; }
      return { total: Number((h.match(/data-total="(\d+)"/) || h.match(/(\d+)\s+results/i) || [])[1]) || null, candidates: cands, note: 'Hobbs checks per size: choose sizes[].args (size codes are not UK sizes)' };
    } },
  boss: {
    name: 'BOSS (Hugo Boss)', canaryWharf: 'boss-store-unit-5-cabot-place-west-london (no number)', answer: 'sizes in stock per shop (no counts)',
    args: { pid: 'product and colour id, e.g. hbeu50565503_001', skus: 'array of [EAN, size] pairs (find_product gives them)', url: 'the product page URL (find_product gives it)' },
    findBy: 'words, a style number or an EAN (site search, in headless Chromium: Akamai refuses plain fetch), then the product page for [EAN, size] pairs',
    base: 'https://www.hugoboss.com',
    async productSkus(page, u, ctx) { if (!ctx.already) await browserGoto(page, u, ctx);
      const blocks = await page.$$eval('script[type="application/ld+json"]', xs => xs.map(x => x.textContent));
      for (const b of blocks) { let j; try { j = JSON.parse(b); } catch { continue; }
        for (const g of [].concat(j['@graph'] || j)) if (g.hasVariant) return { pid: g.mpn || null, name: g.name || null, skus: g.hasVariant.filter(v => typeof v.size === 'string' && v.sku).map(v => [String(v.sku), v.size]) }; }
      return { pid: null, skus: [] };
    },
    async check(a, ctx) { need(a, 'pid');
      const page = await browserPage({ locale: LOCALE });
      try {
        let skus = a.skus;
        if (!skus?.length) { need(a, 'url'); skus = (await this.productSkus(page, a.url, ctx)).skus; } else await browserGoto(page, a.url || `${this.base}/uk/search?q=${encodeURIComponent(a.pid.replace(/^hbeu/, '').split('_')[0])}`, ctx);
        const p = new URLSearchParams({ skus: JSON.stringify(skus), pid: a.pid, lat: CW.lat, lon: CW.lon });
        const u = `${this.base}/on/demandware.store/Sites-UK-Site/en_GB/Retail-DoRetailAvailabilitySearch?${p}`;
        const h = await browserFetchText(page, u, ctx);
        // parse the HTML fragment with the browser's own DOM (one entry per shop: its store page and its text)
        const stores = await page.evaluate(html => { const d = document.createElement('div'); d.innerHTML = html;
          return [...d.querySelectorAll('[class*="retailavailability-store"]')].filter(e => !e.parentElement.closest('[class*="retailavailability-store"]')).map(e => ({
            store: ((e.querySelector('a[href*="/boss-store-"]') || {}).getAttribute?.('href') || '').match(/(boss-store-[a-z0-9-]+)/)?.[1] || null,
            text: e.textContent.replace(/\s+/g, ' ').trim().slice(0, 240) })); }, h);
        return { canary_wharf: stores.find(s => /cabot-place/.test(s.store || '')) || null, stores: stores.slice(0, 5), not_found: /could not find/i.test(h), source: u.replace(/\?.*/, '') };
      } finally { await page.close(); }
    },
    async find(a, ctx) {
      const page = await browserPage({ locale: LOCALE });
      try { await browserGoto(page, `${this.base}/uk/search?q=${encodeURIComponent(a.query)}`, ctx);
        if (/\/uk\/[^/]+\/hbeu[0-9]+_[0-9]+\.html/.test(page.url())) {          // an exact style or EAN goes straight to the product page
          const r = await this.productSkus(page, page.url(), { ...ctx, already: true }).catch(() => ({ skus: [] }));
          return { candidates: [{ name: r.name, url: page.url(), args: { pid: r.pid, skus: r.skus, url: page.url() }, sizes: r.skus.map(([e, z]) => ({ label: z, args: { pid: r.pid, skus: [[e, z]], url: page.url() } })) }] }; }
        const tiles = await page.$$eval('[data-pid^="hbeu"]', xs => xs.map(x => { const pid = x.getAttribute('data-pid'), tile = x.closest('article, [class*=product-tile]') || x;
          const a = tile.querySelector(`a[href*="/${pid}.html"]`) || document.querySelector(`a[href*="/${pid}.html"]`);
          let name = null; try { name = JSON.parse(tile.getAttribute('data-as-product') || (tile.querySelector('[data-as-product]') || {}).getAttribute?.('data-as-product') || '{}').item_name || null; } catch {}
          return { pid, href: a ? a.href : null, name: name || (a ? (a.getAttribute('title') || a.textContent) : null) }; }));
        const seen = new Set(), cands = tiles.filter(t => t.pid && !seen.has(t.pid) && seen.add(t.pid)).slice(0, 10).map(t => ({ name: t.name ? t.name.trim() : null, url: t.href, args: { pid: t.pid, url: t.href } }));
        if (cands[0]?.url) { const r = await this.productSkus(page, cands[0].url, ctx); cands[0].args.skus = r.skus; cands[0].sizes = r.skus.map(([e, z]) => ({ label: z, args: { pid: cands[0].args.pid, skus: [[e, z]], url: cands[0].url } })); }
        return { candidates: cands, note: 'stock_check with all skus gives every size per shop; sizes[].args asks for one size' };
      } finally { await page.close(); }
    } },
  intimissimi: {
    name: 'Intimissimi', canaryWharf: 'IGJ4', answer: 'per shop and size: none, low or high (shops without the item are left out)',
    args: { pid: 'style code, e.g. CLD28B (product URL)', color: 'colour code, e.g. 019', size: 'up to 3 sizes joined by _, e.g. S_M_L' },
    async check(a, ctx) { need(a, 'pid', 'color', 'size');
      const p = new URLSearchParams({ lat: CW.lat, lon: CW.lon, rad: 0, pid: a.pid, color: a.color, size: a.size, filterBopis: 'false', currentHour: localHour() });     // the shop's local hour, from the region
      const u = `https://www.intimissimi.com/on/demandware.store/Sites-intimissimi-uk-Site/en_GB/FindInStore-GetStoresWithProductAvailability?${p}`;
      const j = await (await politeFetch(u, {}, ctx)).json();
      // each record: { availabilities: { S: 'high', ... }, store: { ...details }, labels }; the id field name of the
      // nested store is not fixed in what we saw, so the 4-character store code is the fallback
      const idOf = st => st.ID || st.id || st.storeId || st.storeID || (JSON.stringify(st).match(/"([0-9A-Z]{4})"/) || [])[1] || null;
      const stores = (j.stores || []).map(x => { const st = typeof x.store === 'object' && x.store ? x.store : x;
        return { store: idOf(st), name: st.name || st.storeName || null, distance: st.distance ?? null, sizes: x.availabilities || null }; });
      return { canary_wharf: stores.find(x => x.store === 'IGJ4' || /canary wharf/i.test(x.name || '')) || null, stores: stores.slice(0, 9), dispo_active: j.isDispoActive ?? null, source: u };
    },
    findBy: 'words (site search), then the variation JSON for sizes',
    async find(a, ctx) {
      const base = 'https://www.intimissimi.com';
      const h = await (await politeFetch(`${base}/uk/search/?q=${encodeURIComponent(a.query)}`, { headers: { 'accept-language': LOCALE } }, ctx)).text();
      const seen = new Set(), tiles = [];
      for (const m of h.matchAll(/data-pid="([A-Z0-9]+)_color_([A-Z0-9]+)"/g)) { const k = m[1] + '_' + m[2]; if (seen.has(k)) continue; seen.add(k);
        const near = h.slice(m.index, m.index + 3000), name = unent((near.match(/data-item_name="([^"]+)"/) || [])[1] || ''), href = (near.match(/href="(\/uk\/product\/[^"]+)"/) || [])[1];
        tiles.push({ style: m[1], color: m[2], name, url: href ? base + unent(href) : null }); if (tiles.length >= 10) break; }
      let sizes = null, t = null;
      for (const cand of tiles.slice(0, 2)) { t = cand; let v;                     // Product-Variation answers 500 for some products: try the next tile
        try { v = await getJson(`${base}/on/demandware.store/Sites-intimissimi-uk-Site/en_GB/Product-Variation?pid=${t.style}&dwvar_${t.style}_Z_COL_INTD=${t.color}&quantity=1`, { headers: { accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' } }, ctx);
        } catch { continue; }
        const sz = (v.product?.variationAttributes || []).find(x => /size|taglie/i.test(x.attributeId + ' ' + x.id))?.values || [];
        sizes = sz.map(z => ({ label: z.displayValue, args: { pid: t.style, color: t.color, size: z.displayValue } })); if (sizes.length) break; }
      const ordered = t && sizes?.length ? [t, ...tiles.filter(x => x !== t)] : tiles;
      return { candidates: ordered.map((x, i) => ({ name: x.name, url: x.url, args: i === 0 && sizes?.length ? { pid: x.style, color: x.color, size: sizes.slice(0, 3).map(z => z.label).join('_') } : { pid: x.style, color: x.color, size: 'S_M_L' }, ...(i === 0 && sizes?.length ? { sizes } : {}) })) };
    } },
  'hotel-chocolat': {
    name: 'Hotel Chocolat', canaryWharf: '305 (Jubilee Place), 160 (Canada Place)', answer: 'units available to sell (ats) per shop',
    args: { product_id: '6-digit product id (variant), e.g. 120410 (find_product: representedProduct.id)' },
    findBy: 'words (SCAPI product search); an EAN search is loose',
    // Salesforce Composable Storefront through the site's own proxy (/mobify/: robots.txt disallows it, so calls need
    // owner_approval). The guest token comes from the private SLAS proxy, which adds the client id itself.
    api: 'https://www.hotelchocolat.com/mobify', org: 'f_ecom_aazp_prd', site: 'HotelChocolat', stores: { 'inventory_store_305': '305', 'inventory_store_160': '160' },
    async token(ctx) {
      if (this._tok && Date.now() < this._tokUntil) return this._tok;
      const j = await getJson(`${this.api}/slas/private/shopper/auth/v1/organizations/${this.org}/oauth2/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', channel_id: this.site, dnt: 'true' }).toString() }, ctx);
      if (!j.access_token) throw new Error('Hotel Chocolat: no guest token in the answer');
      this._tok = j.access_token; this._tokUntil = Date.now() + Math.min(25 * 60e3, (j.expires_in || 1800) * 1000 - 60e3); return this._tok;
    },
    async check(a, ctx) { need(a, 'product_id'); const tok = await this.token(ctx);
      const u = `${this.api}/proxy/api/product/shopper-products/v1/organizations/${this.org}/products/${encodeURIComponent(a.product_id)}?siteId=${this.site}&locale=${LOCALE}&currency=GBP&inventoryIds=${Object.keys(this.stores).join(',')}`;
      const j = await getJson(u, { headers: { authorization: `Bearer ${tok}`, accept: 'application/json' } }, ctx);
      const inv = (j.inventories || []).filter(i => this.stores[i.id]).map(i => ({ store: this.stores[i.id], ats: i.ats ?? null, stock_level: i.stockLevel ?? null, orderable: i.orderable ?? null }));
      return { canary_wharf: { name: j.name || null, stores: inv, in_stock_any: inv.some(i => i.ats > 0) }, source: u.replace(/\?.*/, '') };
    },
    async find(a, ctx) { const tok = await this.token(ctx);
      const u = `${this.api}/proxy/api/search/shopper-search/v1/organizations/${this.org}/product-search?siteId=${this.site}&locale=${LOCALE}&currency=GBP&q=${encodeURIComponent(a.query)}&limit=10`;
      const j = await getJson(u, { headers: { authorization: `Bearer ${tok}`, accept: 'application/json' } }, ctx);
      return { total: j.total ?? null, candidates: (j.hits || []).map(h => ({ name: h.productName, online: h.orderable ?? null, args: { product_id: h.representedProduct?.id || String(h.productId || '').replace(/m$/, '') } })) };
    } },
  accessorize: {
    name: 'Accessorize', canaryWharf: '1163', answer: 'held at the Canary Wharf shop yes/no per product (no counts), from the store list on each search tile',
    args: { query: 'search text, e.g. "tote"' },
    findBy: 'words (site search); each result already says whether the Canary Wharf shop holds it',
    async tiles(a, ctx, facet) {
      const u = `https://www.accessorize.com/uk/search?q=${encodeURIComponent(a.query)}${facet ? '&prefn1=storeAvailability&prefv1=1163' : ''}`;
      const h = await (await politeFetch(u, { headers: { 'accept-language': LOCALE } }, ctx)).text();
      const out = [], seen = new Set();
      for (const m of h.matchAll(/data-available-stores="([^"]*)"/g)) {
        const back = h.slice(Math.max(0, m.index - 6000), m.index), pid = [...back.matchAll(/data-pid="([0-9A-Za-z_-]+)"/g)].pop()?.[1];
        if (!pid || seen.has(pid)) continue; seen.add(pid);
        let stores = []; try { stores = JSON.parse(unent(m[1])).map(String); } catch {}
        const url = [...back.matchAll(/data-product-url="([^"]+)"/g)].pop()?.[1], name = unent([...back.matchAll(/class="b-tile__title[^"]*"[^>]*>\s*([^<]{2,120})</g)].pop()?.[1] || '').trim();
        out.push({ pid, name: name || null, url: url ? new URL(unent(url), 'https://www.accessorize.com').href : null, at_canary_wharf: stores.includes('1163'), stores_holding: stores.length });
      }
      return { total: Number((h.match(/(\d[\d,]*)\s*Products/) || [])[1]?.replace(/,/g, '')) || null, tiles: out, source: u };
    },
    async check(a, ctx) { need(a, 'query'); const r = await this.tiles(a, ctx, true);
      return { canary_wharf: { store: '1163', products: r.total, held: r.tiles.filter(t => t.at_canary_wharf).slice(0, 40) }, source: r.source }; },
    async find(a, ctx) { const r = await this.tiles(a, ctx, false);
      return { total: r.total, candidates: r.tiles.map(t => ({ name: t.name, url: t.url, at_canary_wharf: t.at_canary_wharf, args: { query: a.query } })), note: 'at_canary_wharf comes from the same search (no stock_check needed)' }; } },
};
