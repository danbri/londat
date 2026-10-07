// Opening hours by mall and area: every hours text the project holds (CWG directory pages, OSM opening_hours tags, web
// facts, and the canonical schema.org hours read with @factoidal/core) on one half-hour grid of the week, read with
// docklands/opening-hours.js (the reader the 3D page uses); profiles and statistics per area and kind; a permutation test
// of whether the mall explains weekly hours within a kind; agreement between sources for the same occupant; and the
// postcode -> mall table that places a web branch from its parsed address.
//   in:  registry/sources/brands/cwg-hours.json, cwg-directory.json, cwg-directory-typed.json, registry/buildings.json,
//        third_party/cwplans-structured-data/idioms/canonical.nq.gz
//   out: registry/sources/web/hours-by-place.json
//   node cwplans/tools/hours-by-place.mjs
// Skill: cwplans-web-harvest, "Opening hours".
import { readFileSync, writeFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { createRequire } from 'module';
import { join } from 'path';
import { parse, query } from '@factoidal/core';
import { TOOLS } from './lib.mjs';

const CW = join(TOOLS, '..'), TP = join(CW, '..', 'third_party', 'cwplans-structured-data');
const OH = createRequire(import.meta.url)(join(CW, 'docklands', 'opening-hours.js'));
const J = f => JSON.parse(readFileSync(join(CW, f), 'utf8'));
const hours = J('registry/sources/brands/cwg-hours.json').entries, dir = J('registry/sources/brands/cwg-directory.json').directory;
const typed = new Map(J('registry/sources/brands/cwg-directory-typed.json').entries.map(e => [e.slug, e]));
const buildings = J('registry/buildings.json').buildings;
const SLOTS = 336, DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

// a week as 336 half-hour slots (Monday 00:00 first); a span past midnight runs into the next day, Sunday into Monday
function gridOfWeek(week) {
  const g = new Uint8Array(SLOTS);
  week.forEach((spans, d) => { for (const [o, c] of spans || []) for (let m = o; m < c; m += 30) { const mid = m + 15; if (mid < c) g[(d * 48 + Math.floor(mid / 30)) % SLOTS] = 1; } });
  return g;
}
const gridOf = text => { let P; try { P = OH.parse(text); } catch { return null; } return P ? gridOfWeek(P.week) : null; };
const hex = g => { let s = ''; for (let i = 0; i < SLOTS; i += 4) s += ((g[i] << 3) | (g[i + 1] << 2) | (g[i + 2] << 1) | g[i + 3]).toString(16); return s; };
const sum = g => g.reduce((a, b) => a + b, 0);
const median = v => { const s = [...v].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const hm = slot => slot == null ? null : `${String(Math.floor(slot / 2)).padStart(2, '0')}:${slot % 2 ? '30' : '00'}`;
function measures(g) {
  const day = d => g.subarray(d * 48, d * 48 + 48), first = d => { const i = day(d).indexOf(1); return i < 0 ? null : i; };
  const last = d => { const a = day(d); for (let i = 47; i >= 0; i--) if (a[i]) return i + 1; return null; };
  const wk = [0, 1, 2, 3, 4].filter(d => first(d) != null);
  return { hours_week: sum(g) / 2, opens_weekday: wk.length ? median(wk.map(first)) : null, closes_weekday: wk.length ? median(wk.map(last)) : null,
    open_saturday: first(5) != null, open_sunday: first(6) != null, sunday_hours: sum(day(6)) / 2,
    late: [0, 1, 2, 3, 4, 5, 6].some(d => day(d)[44] === 1 || day((d + 1) % 7)[0] === 1), early: wk.some(d => first(d) <= 14), always: sum(g) === SLOTS };
}
// coarse kind, the same for every source; fine kind for the CWG list
const FOOD = new Set(['Restaurant', 'FoodEstablishment', 'FastFoodRestaurant', 'CafeOrCoffeeShop', 'Bakery', 'IceCreamShop', 'BarOrPub']);
const SHOP = new Set(['Store', 'ClothingStore', 'ShoeStore', 'JewelryStore', 'ElectronicsStore', 'BookStore', 'HomeGoodsStore', 'Florist', 'GroceryStore']);
const fineOf = types => types.includes('BarOrPub') ? 'bar' : types.some(t => ['CafeOrCoffeeShop', 'Bakery', 'FastFoodRestaurant', 'IceCreamShop'].includes(t)) ? 'cafe, bakery, grab-and-go'
  : types.some(t => ['Restaurant', 'FoodEstablishment'].includes(t)) ? 'restaurant' : types.some(t => SHOP.has(t)) ? 'shop' : 'service, leisure, stay';
const coarseOfTypes = types => types.some(t => FOOD.has(t)) ? 'food and drink' : types.some(t => SHOP.has(t)) ? 'shop' : 'service, leisure, stay';
const coarseOfRole = r => /food|restaurant|bar|cafe/.test(r || '') ? 'food and drink' : /^shop|directory: shop/.test(r || '') ? 'shop' : 'service, leisure, stay';
const MALLS = ['Cabot Place', 'Canada Place', 'Jubilee Place', 'Crossrail Place', 'One Canada Square'];
const areaOfMall = m => MALLS.includes(m) ? m : m === 'Wood Wharf' ? 'Wood Wharf' : m ? 'Canary Wharf estate, street level' : 'Canary Wharf estate, street level';

// 1. CWG directory pages
const recs = [];
for (const h of hours) {
  if (!h.opening_hours) continue; const g = gridOf(h.opening_hours); if (!g) continue;
  const t = typed.get(h.slug) || {}, types = t.schema_types || [];
  recs.push({ id: 'cwg:' + h.slug, name: h.name, source: 'cwg', area: areaOfMall(h.mall), mall: h.mall, level: h.level, postcode: h.postcode, kind: coarseOfTypes(types), fine: fineOf(types),
    buildings: t.registry_buildings || [], opening_hours: h.opening_hours, as_of: h.archived_on, grid: g });
}
// 2. registry occupants: OSM tags and web facts (also kept for the agreement check when the occupant is in the CWG list)
const sector = pc => (pc || '').toUpperCase().replace(/\s+/g, ' ').match(/^([A-Z]{1,2}\d[A-Z\d]?) (\d)/)?.slice(1).join(' ') || null;
const other = [];
for (const b of buildings) for (const o of b.occupants || []) for (const [src, text] of [['osm', o.opening_hours], ['web', o.web?.opening_hours]]) {
  if (!text) continue; const g = gridOf(text); if (!g) continue;
  const slug = o.cwg_url ? o.cwg_url.replace(/\/$/, '').split('/').pop() : null;
  other.push({ id: `${src}:${b.id}:${o.osm || o.name}`, name: o.name, source: src, building: b.id, building_name: b.name, lat: b.lat, lon: b.lon, postcode: (b.postcodes || [])[0] || null,
    cwg_slug: slug, mall: o.mall || null, kind: coarseOfRole(o.role), role: o.role, opening_hours: text, grid: g });
}
// occupants outside the CWG list: their own area by postcode sector
for (const r of other) if (!r.cwg_slug && !(r.mall && MALLS.includes(r.mall))) recs.push({ ...r, area: r.mall ? areaOfMall(r.mall) : 'postcode sector ' + (sector(r.postcode) || 'unknown'), fine: r.kind });

// 3. postcode -> mall from the whole CWG list (the parsed address of a web branch places it in a mall)
const pcMall = {};
for (const e of dir) if (e.postcode && e.mall) { const pc = e.postcode.toUpperCase().replace(/\s+/g, ' '); (pcMall[pc] ||= {})[e.mall] = (pcMall[pc][e.mall] || 0) + 1; }
const pcTable = Object.entries(pcMall).map(([pc, m]) => { const tot = Object.values(m).reduce((a, b) => a + b, 0), [top, n] = Object.entries(m).sort((a, b) => b[1] - a[1])[0]; return { postcode: pc, mall: top, share: +(n / tot).toFixed(2), entries: tot, malls: m }; }).sort((a, b) => b.entries - a.entries);
const pcToMall = new Map(pcTable.filter(r => r.share >= 0.8 && r.entries >= 3).map(r => [r.postcode, r.mall]));

// 4. canonical schema.org hours with a parsed postcode, read with Factoidal (needs the skolemized canonical layer)
const ds = await parse(gunzipSync(readFileSync(join(TP, 'idioms', 'canonical.nq.gz'))).toString(), { format: 'nquads' });
const rows = await query(ds, `PREFIX s: <https://schema.org/> SELECT ?g ?b ?name ?pc ?street ?h ?d ?o ?c ?vf WHERE { GRAPH ?g {
  ?b s:address ?a . ?a s:postalCode ?pc . OPTIONAL { ?a s:streetAddress ?street } OPTIONAL { ?b s:name ?name }
  ?b s:openingHoursSpecification ?h . ?h s:dayOfWeek ?d . OPTIONAL { ?h s:opens ?o } OPTIONAL { ?h s:closes ?c } OPTIONAL { ?h s:validFrom ?vf } } }`);
const web = new Map();
const tm = s => { const m = /^(\d{1,2}):(\d\d)/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
for (const r of rows) {
  if (r.get('vf')) continue;                                  // dated special hours are not the weekly pattern
  const k = r.get('g').value + '\t' + r.get('b').value; let w = web.get(k);
  if (!w) web.set(k, w = { page: r.get('g').value, name: r.get('name')?.value || null, postcode: r.get('pc').value.toUpperCase().replace(/\s+/g, ' ').trim(), street: r.get('street')?.value || null, week: DAYS.map(() => null) });
  const d = DAYS.indexOf(r.get('d').value.replace('https://schema.org/', '').slice(0, 2)); if (d < 0) continue;
  const o = tm(r.get('o')?.value), c = tm(r.get('c')?.value); if (o == null || c == null) continue;
  (w.week[d] ||= []).some(([a, b]) => a === o) || w.week[d].push([o, c <= o ? c + 1440 : c]);
}
const webBranches = [...web.values()].map(w => ({ ...w, grid: gridOfWeek(w.week.map(s => s || [])), mall_by_postcode: pcToMall.get(w.postcode) || null, in_zone: /^E1[46] /.test(w.postcode) }));

// 5. statistics per area and kind
const groups = {};
for (const r of recs) { const k = r.area + '\t' + r.kind; (groups[k] ||= []).push(r); }
const profile = rs => { const p = new Array(SLOTS).fill(0); for (const r of rs) for (let i = 0; i < SLOTS; i++) p[i] += r.grid[i]; return p.map(v => +(v / rs.length).toFixed(3)); };
const statOf = rs => { const m = rs.map(r => measures(r.grid)); const share = f => +(m.filter(f).length / m.length).toFixed(2);
  return { n: rs.length, median_hours_week: median(m.map(x => x.hours_week)), median_opens_weekday: hm(median(m.filter(x => x.opens_weekday != null).map(x => x.opens_weekday))),
    median_closes_weekday: hm(median(m.filter(x => x.closes_weekday != null).map(x => x.closes_weekday))), open_saturday: share(x => x.open_saturday), open_sunday: share(x => x.open_sunday),
    median_sunday_hours: median(m.map(x => x.sunday_hours)), late_after_22: share(x => x.late), early_before_0730: share(x => x.early), always_open: share(x => x.always) }; };
const areas = Object.entries(groups).map(([k, rs]) => { const [area, kind] = k.split('\t'); return { area, kind, ...statOf(rs), profile: profile(rs) }; }).sort((a, b) => b.n - a.n);
const fine = {};
for (const r of recs.filter(r => r.source === 'cwg')) { const k = r.area + '\t' + r.fine; (fine[k] ||= []).push(r); }
const fineStats = Object.entries(fine).map(([k, rs]) => { const [area, kind] = k.split('\t'); return { area, kind, ...statOf(rs) }; }).filter(s => s.n >= 3).sort((a, b) => a.kind.localeCompare(b.kind) || b.n - a.n);

// 6. does the mall explain weekly hours within a kind? Stratified permutation of mall labels (fixed seed), statistic =
// between-mall sum of squares of hours per week, summed over kinds; also the share of variance the mall explains
let seed = 20261006; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
function permTest(rs, label, strata, n = 5000, metric = r => measures(r.grid).hours_week) {
  const byS = {}; for (const r of rs) (byS[strata(r)] ||= []).push({ y: metric(r), l: label(r) });
  const stat = S => { let b = 0; for (const xs of Object.values(S)) { const mu = xs.reduce((a, x) => a + x.y, 0) / xs.length, g = {}; for (const x of xs) (g[x.l] ||= []).push(x.y); for (const ys of Object.values(g)) { const m = ys.reduce((a, y) => a + y, 0) / ys.length; b += ys.length * (m - mu) ** 2; } } return b; };
  const tot = Object.values(byS).reduce((a, xs) => { const mu = xs.reduce((s, x) => s + x.y, 0) / xs.length; return a + xs.reduce((s, x) => s + (x.y - mu) ** 2, 0); }, 0);
  const obs = stat(byS); let ge = 0;
  for (let i = 0; i < n; i++) { const P = {}; for (const [k, xs] of Object.entries(byS)) { const ls = xs.map(x => x.l); for (let j = ls.length - 1; j > 0; j--) { const q = Math.floor(rnd() * (j + 1)); [ls[j], ls[q]] = [ls[q], ls[j]]; } P[k] = xs.map((x, j) => ({ y: x.y, l: ls[j] })); } if (stat(P) >= obs) ge++; }
  return { n: rs.length, permutations: n, p: +((ge + 1) / (n + 1)).toFixed(4), share_of_within_kind_variance: +(obs / tot).toFixed(3) };
}
const inMalls = recs.filter(r => r.source === 'cwg' && MALLS.includes(r.area));
const tests = {
  hours_week_by_mall_within_fine_kind: permTest(inMalls, r => r.area, r => r.fine),
  closes_weekday_by_mall_within_fine_kind: permTest(inMalls.filter(r => measures(r.grid).closes_weekday != null), r => r.area, r => r.fine, 5000, r => measures(r.grid).closes_weekday),
  mall_vs_street_hours_week_within_fine_kind: permTest(recs.filter(r => r.source === 'cwg'), r => MALLS.includes(r.area) ? 'mall' : 'street', r => r.fine),
};

// 7. agreement between sources for the same occupant: CWG page vs OSM tag vs web fact (share of open slots in common)
const cwgBySlug = new Map(recs.filter(r => r.source === 'cwg').map(r => [r.id.slice(4), r]));
const jac = (a, b) => { let i = 0, u = 0; for (let k = 0; k < SLOTS; k++) { i += a[k] & b[k]; u += a[k] | b[k]; } return u ? i / u : 1; };
const pairs = [];
for (const r of other) { const c = r.cwg_slug && cwgBySlug.get(r.cwg_slug); if (c) pairs.push({ name: c.name, a: 'cwg', b: r.source, a_text: c.opening_hours, b_text: r.opening_hours, agreement: +jac(c.grid, r.grid).toFixed(2) }); }
const byOcc = new Map(); for (const r of other) { const k = r.building + '|' + r.name; (byOcc.get(k) || byOcc.set(k, []).get(k)).push(r); }
for (const rs of byOcc.values()) { const o = rs.find(r => r.source === 'osm'), w = rs.find(r => r.source === 'web'); if (o && w) pairs.push({ name: o.name, a: 'osm', b: 'web', a_text: o.opening_hours, b_text: w.opening_hours, agreement: +jac(o.grid, w.grid).toFixed(2) }); }
pairs.sort((a, b) => a.agreement - b.agreement);
const agree = k => { const ps = pairs.filter(p => `${p.a}-${p.b}` === k); return { pairs: ps.length, same: ps.filter(p => p.agreement === 1).length, median: median(ps.map(p => p.agreement)) }; };

// 8. the web branches placed by their parsed postcode
const webPlaced = webBranches.filter(w => w.in_zone);
const out = {
  generated: new Date().toISOString(), tool: 'cwplans/tools/hours-by-place.mjs', engine: '@factoidal/core (canonical hours) and docklands/opening-hours.js (hours text)',
  note: 'Grid: 336 half-hour slots, Monday 00:00 first, as hex (4 slots a digit). Hours are as each source gave them on its date; CWG pages carry their archive date. Kinds: CWG kinds from the schema.org types in cwg-directory-typed.json; registry kinds from the occupant role.',
  counts: { records: recs.length, by_source: recs.reduce((m, r) => (m[r.source] = (m[r.source] || 0) + 1, m), {}), cwg_with_hours: recs.filter(r => r.source === 'cwg').length,
    web_branches_with_postcode_and_hours: webBranches.length, in_zone: webPlaced.length, placed_in_mall_by_postcode: webPlaced.filter(w => w.mall_by_postcode).length },
  areas, fine_kinds: fineStats, tests,
  agreement: { 'cwg-osm': agree('cwg-osm'), 'cwg-web': agree('cwg-web'), 'osm-web': agree('osm-web'), worst: pairs.slice(0, 25) },
  postcode_to_mall: pcTable,
  web_branches: webPlaced.map(w => ({ name: w.name, page: w.page, postcode: w.postcode, street: w.street, mall_by_postcode: w.mall_by_postcode, hours_week: sum(w.grid) / 2, grid: hex(w.grid) })),
  records: recs.map(r => ({ id: r.id, name: r.name, source: r.source, area: r.area, kind: r.kind, fine: r.fine, mall: r.mall || null, level: r.level || null, postcode: r.postcode || null,
    building: r.building || r.buildings?.[0] || null, lat: r.lat ?? null, lon: r.lon ?? null, opening_hours: r.opening_hours, as_of: r.as_of || null, grid: hex(r.grid) })),
};
writeFileSync(join(CW, 'registry/sources/web/hours-by-place.json'), JSON.stringify(out) + '\n');
console.log(JSON.stringify(out.counts)); console.log(JSON.stringify(tests)); console.log(JSON.stringify(out.agreement, (k, v) => k === 'worst' ? v.length : v));
for (const a of areas.filter(a => a.n >= 5)) console.log(a.area.padEnd(36), a.kind.padEnd(24), String(a.n).padStart(3), a.median_hours_week, a.median_opens_weekday, a.median_closes_weekday, 'sun', a.open_sunday, 'late', a.late_after_22);
