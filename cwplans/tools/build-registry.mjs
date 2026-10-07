#!/usr/bin/env node
// Canary Wharf building registry: internal building ids, cross-references, occupants and owners.
//   node magpie/cwplans/tools/registry-osm.mjs        # OSM features with tags in the Canary Wharf box
//   node magpie/cwplans/tools/registry-wikidata.mjs   # Wikidata via QLever (geo)
//   node magpie/cwplans/tools/registry-fhrs.mjs       # FSA Tower Hamlets file, dated snapshot
//   node magpie/cwplans/tools/build-registry.mjs      # -> magpie/cwplans/registry/buildings.json, ids.json
// Ids: "cwb-NNNN", minted once and kept in registry/ids.json (keyed by OSM element); a rebuild reuses them.
// Only organisations appear as occupants or owners. Method and limits: magpie/cwplans/registry/README.md.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { TOOLS, RAW, bngProjector, polyArea, pointIn, joinRings } from './lib.mjs';
import { ORIGIN } from './fetch-docklands.mjs';
import { CW_BOX } from './registry-osm.mjs';
import { osmList, osmLevels } from './osm-values.mjs';
import { CWG_PLACES, CWG_MALLS, cwgFields, nameKeys } from '../registry/sources/brands/tools/cwg-fields.mjs';

const OUT = join(TOOLS, '..', 'registry'), R = join(RAW, 'registry');
mkdirSync(OUT, { recursive: true });
const toBNG = await bngProjector();
const local = (lon, lat) => { const [e, n] = toBNG(lon, lat); return [e - ORIGIN.E0, -(n - ORIGIN.N0)]; };
const r1 = v => Math.round(v * 10) / 10;

// ---- inputs
const osm = JSON.parse(gunzipSync(readFileSync(join(R, 'osm-cw.json.gz'))));
const wd = JSON.parse(readFileSync(join(R, 'wikidata-cw.json'), 'utf8'));
const fhrsFile = readdirSync(join(R, 'fhrs')).filter(f => /^FHRS530-.*\.json\.gz$/.test(f)).sort().at(-1);
const fhrs = JSON.parse(gunzipSync(readFileSync(join(R, 'fhrs', fhrsFile))));
const pcs = new Map(JSON.parse(readFileSync(join(TOOLS, '..', 'postcodes', 'postcodes.json'), 'utf8')).postcodes.map(p => [p.pc, p]));
const normPc = pc => String(pc || '').toUpperCase().replace(/\s+/g, '').replace(/^(.+)(\d[A-Z]{2})$/, '$1 $2');

// ---- buildings (outlines) and parts, as rings of [lon, lat]
const wayById = new Map(osm.features.filter(f => f.type === 'way').map(f => [f.id, f]));
const ringOf = refs => refs.map(r => osm.nodes[r]).filter(Boolean);
function rings(f) {
  if (f.type === 'way') return f.refs[0] === f.refs.at(-1) ? [ringOf(f.refs)] : null;
  const outer = joinRings(f.members.filter(m => m.type === 'way' && m.role !== 'inner').map(m => wayById.get(m.ref)?.refs));
  return outer ? outer.map(ringOf) : null;
}
const [W, S, E, N] = CW_BOX, inBox = (lon, lat) => lon >= W && lon <= E && lat >= S && lat <= N;
const mean = ring => ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0]);
const all = [];
for (const f of osm.features) {
  if (f.type === 'node' || !(f.tags.building || f.tags['building:part'])) continue;
  const rs = rings(f); if (!rs || !rs[0] || rs[0].length < 4) continue;
  const c = mean(rs[0]);
  all.push({ f, rs, c, part: !!f.tags['building:part'] && !f.tags.building });
}
const outlines = all.filter(b => !b.part && inBox(b.c[0], b.c[1]));
const inside = (b, lon, lat) => b.rs.some(r => pointIn([lon, lat], r));
// metres from a point to a building outline (for points just outside, e.g. entrances on the wall)
const mPerDeg = [111320 * Math.cos(51.5 * Math.PI / 180), 110540];
function distTo(b, lon, lat) {
  let d = Infinity;
  for (const r of b.rs) for (let i = 1; i < r.length; i++) {
    const ax = (r[i - 1][0] - lon) * mPerDeg[0], ay = (r[i - 1][1] - lat) * mPerDeg[1], bx = (r[i][0] - lon) * mPerDeg[0], by = (r[i][1] - lat) * mPerDeg[1];
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    d = Math.min(d, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return d;
}
function buildingAt(lon, lat, tol = 12) {
  let hit = outlines.find(b => inside(b, lon, lat)); if (hit) return { b: hit, how: 'inside' };
  let best = null; for (const b of outlines) { const d = distTo(b, lon, lat); if (d < tol && (!best || d < best.d)) best = { b, d }; }
  return best ? { b: best.b, how: `within ${Math.round(best.d)} m` } : null;
}

// ---- ids: reuse, else mint in reading order (north to south in 100 m bands, then west to east)
const idsFile = join(OUT, 'ids.json'), ids = existsSync(idsFile) ? JSON.parse(readFileSync(idsFile, 'utf8')) : { note: 'Canary Wharf building ids. Keys are OSM elements; never reuse a retired id.', next: 1, map: {} };
const key = b => `${b.f.type}/${b.f.id}`;
for (const b of outlines) b.xz = local(b.c[0], b.c[1]);
let minted = 0;
for (const b of [...outlines].sort((a, z) => Math.floor(a.xz[1] / 100) - Math.floor(z.xz[1] / 100) || a.xz[0] - z.xz[0])) {
  if (!ids.map[key(b)]) { ids.map[key(b)] = 'cwb-' + String(ids.next++).padStart(4, '0'); minted++; }
  b.id = ids.map[key(b)];
}

// ---- records
const rec = new Map(outlines.map(b => {
  const t = b.f.tags, lr = b.rs[0].map(([lon, lat]) => local(lon, lat));
  return [b.id, {
    id: b.id, name: t.name || null, osm_name: t.name || null, ...(t['addr:housename'] ? { housename: t['addr:housename'] } : {}), osm: [key(b)], wikidata: t.wikidata || null, wikipedia: t.wikipedia || null,
    address: [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ') || null, postcodes: new Set(osmList(t['addr:postcode']).map(normPc)),
    building: t.building, levels: t['building:levels'] ? +t['building:levels'] : null, levels_underground: t['building:levels:underground'] ? +t['building:levels:underground'] : null, height: t.height ? parseFloat(t.height) : null,
    lat: +b.c[1].toFixed(6), lon: +b.c[0].toFixed(6), x: r1(b.xz[0]), z: r1(b.xz[1]), area_m2: Math.round(Math.abs(polyArea(lr))),
    parts: [], occupants: [], features: [], owners: [], facts: {},
  }];
}));
for (const p of all.filter(b => b.part)) { const h = buildingAt(p.c[0], p.c[1], 0); if (h) rec.get(h.b.id).parts.push({ osm: key(p), name: p.f.tags.name || null, height: p.f.tags.height ? parseFloat(p.f.tags.height) : null, min_height: p.f.tags.min_height ? parseFloat(p.f.tags.min_height) : null, levels: p.f.tags['building:levels'] ? +p.f.tags['building:levels'] : null }); }

// ---- occupants from OSM: tagged nodes and non-building ways (shops in malls are often areas)
const ROLE = t => t.shop ? 'shop' : /^(restaurant|cafe|bar|pub|fast_food|food_court|ice_cream|biergarten)$/.test(t.amenity || '') ? 'food and drink' : t.office ? 'office' : t.amenity ? 'service: ' + t.amenity : t.leisure ? 'leisure: ' + t.leisure : t.tourism ? 'tourism: ' + t.tourism : t.healthcare ? 'healthcare' : t.craft ? 'craft' : /station|subway_entrance|train_station_entrance/.test(t.railway || t.public_transport || '') ? 'transport' : null;
// details an occupant's OSM tags state, copied as they are (OSM values, ODbL): hours, contact, cuisine, access, dates
const DETAIL = ['opening_hours', 'cuisine', 'wheelchair', 'check_date', 'start_date', 'opening_date', 'operator', 'url'];
function osmDetail(t) {
  const o = {};
  for (const k of DETAIL) if (t[k]) o[k] = t[k];
  const first = (...ks) => ks.map(k => t[k]).find(Boolean);
  const website = first('website', 'contact:website'), phone = first('phone', 'contact:phone'), email = first('email', 'contact:email');
  if (website) o.website = website; if (phone) o.phone = phone; if (email) o.email = email;
  // other contact links (contact:instagram, contact:facebook ...), keyed without the prefix
  const links = Object.fromEntries(Object.entries(t).filter(([k]) => /^contact:/.test(k) && !/^contact:(website|phone|email|mobile)$/.test(k)).map(([k, v]) => [k.slice(8), v]));
  if (Object.keys(links).length) o.contact = links;
  return o;
}
let osmPlaced = 0, osmLoose = 0;
for (const f of osm.features) {
  const t = f.tags; if (t.building || t['building:part'] || !t.name) continue;
  const role = ROLE(t); if (!role) continue;
  const c = f.type === 'node' ? [f.lon, f.lat] : (() => { const rs = rings(f); return rs && rs[0] ? mean(rs[0]) : null; })(); if (!c || !inBox(c[0], c[1])) continue;
  const h = buildingAt(c[0], c[1]); if (!h) { osmLoose++; continue; }
  osmPlaced++;
  const r = rec.get(h.b.id);
  // public art, information boards and the like are features of the building, not occupants
  if (/^tourism: (artwork|information|viewpoint|attraction)$/.test(role)) { r.features.push({ name: t.name, kind: role.replace('tourism: ', ''), osm: `${f.type}/${f.id}` }); continue; }
  r.occupants.push({ name: t.name, role, source: 'osm', osm: `${f.type}/${f.id}`, placed: h.how, ...(t.level ? { level: t.level, levels: osmLevels(t.level) } : {}), ...(t.brand ? { brand: t.brand } : {}), ...(t['brand:wikidata'] ? { brand_wikidata: t['brand:wikidata'] } : {}), ...osmDetail(t) });
  for (const pc of osmList(t['addr:postcode'])) r.postcodes.add(normPc(pc));
}

// ---- occupants from the FSA file: positioned premises by location; the rest listed under their postcode
const byPostcode = {};
let fsaPlaced = 0;
for (const e of fhrs.establishments) {
  const o = { name: e.name, role: 'food business (FSA)', source: 'fsa', fhrs_id: e.id, type: e.type, rating: e.rating, rating_date: e.rating_date, address: e.address, postcode: normPc(e.postcode), url: `https://ratings.food.gov.uk/business/${e.id}` };
  const h = e.lat != null && inBox(e.lon, e.lat) ? buildingAt(e.lon, e.lat) : null;
  if (h) { const r = rec.get(h.b.id); r.occupants.push({ ...o, placed: h.how }); r.postcodes.add(o.postcode); fsaPlaced++; }
  else if (pcs.get(o.postcode) && /^cw-/.test(pcs.get(o.postcode).tier)) (byPostcode[o.postcode] ||= []).push({ ...o, placed: e.lat == null ? 'no position in the FSA data' : 'position outside every building' });
}

// ---- Wikidata: the building's own item, items located in it, headquarters, occupants, owners
const items = new Map(wd.items.map(i => [i.id, i]));
const wkt = s => s.match(/-?[\d.]+/g).map(Number);
const BUILDINGISH = /building|skyscraper|tower|shopping|station|hotel|structure|block|plaza|mall|museum|hall|centre|center/i;
// an item that an OSM outline already names in its wikidata tag is not attached to a second outline by coordinate
// (One Canada Square's coordinate falls in the Cabot Place mall outline below the tower)
const taggedQ = new Set([...rec.values()].map(r => r.wikidata).filter(Boolean));
for (const it of wd.items) {
  const [lon, lat] = wkt(it.coord); if (!inBox(lon, lat)) continue;
  if (taggedQ.has(it.id)) continue;
  const h = buildingAt(lon, lat, 5); if (!h) continue;
  const r = rec.get(h.b.id), cls = (it.props['instance of'] || []).map(c => c.label).join(', ');
  if (!r.wikidata && BUILDINGISH.test(cls) && !wd.items.some(o => o !== it && o.id !== it.id && BUILDINGISH.test((o.props['instance of'] || []).map(c => c.label).join(' ')) && (() => { const [a, b] = wkt(o.coord); return inside(h.b, a, b); })())) r.wikidata = it.id;
  else if (r.wikidata !== it.id && !BUILDINGISH.test(cls)) r.occupants.push({ name: it.label, role: 'located here (Wikidata)', source: 'wikidata', wikidata: it.id, type: cls, placed: h.how });
}
const recByQ = new Map([...rec.values()].filter(r => r.wikidata).map(r => [r.wikidata, r]));
for (const r of recByQ.values()) {
  const it = items.get(r.wikidata); if (!it) continue;
  // OSM often names a tower after its main occupant ("HSBC UK" for 8 Canada Square): the Wikidata label names the building
  r.name = it.label || r.name; r.description = it.description || null;
  for (const [k, vs] of Object.entries(it.props)) if (!['instance of'].includes(k)) r.facts[k] = vs.map(v => typeof v === 'object' ? v.label || v.id : v);
  r.facts.classes = (it.props['instance of'] || []).map(c => c.label);
  for (const o of it.props['owned by'] || []) r.owners.push({ name: o.label, wikidata: o.id, source: 'wikidata P127' });
  for (const o of it.props['occupant'] || []) r.occupants.push({ name: o.label, role: 'occupant (Wikidata P466)', source: 'wikidata', wikidata: o.id });
  for (const pc of it.props['postal code'] || []) r.postcodes.add(normPc(pc));
}
for (const h of wd.hq) { const r = recByQ.get(h.place); if (r) r.occupants.push({ name: h.label, role: 'headquarters (Wikidata P159)', source: 'wikidata', wikidata: h.org, ...(h.website ? { website: h.website } : {}) }); }

// ---- joins with the company and property sources (registry/sources/, see SOURCES-companies-property.md)
// Privacy: company-level and property-level only; figures about homes are given only where there are at least
// K homes, so no figure describes a single home; company addresses are not copied (the Companies House link has them).
const K = 5, SRC = join(OUT, 'sources'), has = f => existsSync(join(SRC, f));
const readJ = f => JSON.parse(readFileSync(join(SRC, f), 'utf8'));
const recs = [...rec.values()], outlineOf = new Map(outlines.map(b => [b.id, b]));
const NUM = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10, TWENTY: 20, 'TWENTY FIVE': 25, THIRTY: 30, FORTY: 40, FIFTY: 50 };
const normAddr = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\b(TWENTY FIVE|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|TWENTY|THIRTY|FORTY|FIFTY)\b/g, m => NUM[m]).replace(/\s+/g, ' ').trim();
// keys a building answers to: "1 CANADA SQUARE", "ONE CANADA SQUARE" -> "1 CANADA SQUARE", the OSM and Wikidata names
for (const r of recs) r.keys = [...new Set([r.address, r.name, r.osm_name, ...(r.facts['street address'] || [])].filter(Boolean).map(normAddr).filter(k => k.length > 5))];
const matchBuilding = (pc, text) => { const t = normAddr(text); const c = recs.filter(r => r.postcodes.has(pc) && r.keys.some(k => t.includes(k))); return c.length === 1 ? c[0] : null; };
const joins = {};
if (has('uprn/uprn-canary-wharf.csv')) {
  const toidOf = new Map(), usrnOf = new Map();
  if (has('uprn/uprn-linked-ids-canary-wharf.csv')) for (const line of readFileSync(join(SRC, 'uprn/uprn-linked-ids-canary-wharf.csv'), 'utf8').split('\n').slice(1)) { const [u, link, id] = line.split(','); if (link === 'TopographicArea_TOID') toidOf.set(u, id); else if (link === 'Street_USRN') usrnOf.set(u, id); }
  let placed = 0;
  for (const line of readFileSync(join(SRC, 'uprn/uprn-canary-wharf.csv'), 'utf8').split('\n').slice(1)) {
    const [u, , , lat, lon] = line.split(','); if (!u) continue;
    const h = buildingAt(+lon, +lat, 0); if (!h) continue;
    const r = rec.get(h.b.id); r.uprns = (r.uprns || 0) + 1; placed++;
    if (toidOf.has(u)) (r.toidSet ||= new Set()).add(toidOf.get(u));
    if (usrnOf.has(u)) (r.usrnSet ||= new Set()).add(usrnOf.get(u));
  }
  joins.uprn_in_buildings = placed;
}
if (has('uprn/lbsm2-homes-summary.json')) {
  const l = readJ('uprn/lbsm2-homes-summary.json'); let n = 0;
  for (const r of recs) if (r.toidSet) {
    const parts = [...r.toidSet].map(t => l.per_toid[t]).filter(Boolean); if (!parts.length) continue;
    const homes = parts.reduce((s, p) => s + p.homes, 0);
    const sum = k => parts.reduce((o, p) => { for (const [a, v] of Object.entries(p[k] || {})) o[a] = (o[a] || 0) + v; return o; }, {});
    r.homes = homes >= K ? { count: homes, source: 'GLA London Building Stock Model 2 (modelled where no EPC)', property_type: sum('property_type'), construction_age_band: sum('construction_age_band'), epc_rating: sum('epc_rating') } : { count: `fewer than ${K}`, source: 'GLA LBSM2' };
    n++;
  }
  joins.lbsm_buildings = n;
}
if (has('landregistry/inspire-canary-wharf.geojson')) {
  const g = readJ('landregistry/inspire-canary-wharf.geojson'); let n = 0;
  for (const r of recs) for (const f of g.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    if (polys.some(pl => pointIn([r.lon, r.lat], pl[0]))) { (r.inspire ||= []).push(f.properties.inspire_id); n++; }
  }
  joins.inspire_links = n; joins.inspire_attribution = g.attribution;
}
const companiesOut = {}, homesOut = {};
if (has('companies/companies-by-postcode.json')) {
  const c = readJ('companies/companies-by-postcode.json'); let matched = 0, total = 0;
  for (const [pc, list] of Object.entries(c.postcodes)) for (const co of list) {
    total++;
    const b = matchBuilding(pc, [co.address_line1, co.address_line2].join(' '));
    const slimCo = { number: co.number, name: co.name, status: co.status, category: co.category, incorporated: co.incorporated, sic: (co.sic || []).map(x => String(x).slice(0, 5)), ...(b ? { building: b.id } : {}) };
    (companiesOut[pc] ||= []).push(slimCo);
    if (b) { matched++; (b.companies ||= []).push({ number: co.number, name: co.name, incorporated: co.incorporated, sic: slimCo.sic }); }
  }
  joins.companies = total; joins.companies_matched_to_building = matched;
}
if (has('landregistry/price-paid-by-postcode.json')) {
  const pp = readJ('landregistry/price-paid-by-postcode.json'), byB = new Map();
  const agg = txs => { const homes = new Set(txs.map(t => `${t.paon}|${t.saon}|${t.street}`)), prices = txs.map(t => t.price).sort((a, b) => a - b), years = {}; for (const t of txs) years[t.date.slice(0, 4)] = (years[t.date.slice(0, 4)] || 0) + 1;
    return { homes_sold_since_1995: homes.size, sales: txs.length, first: txs.map(t => t.date).sort()[0], last: txs.map(t => t.date).sort().at(-1), median_price: prices[prices.length >> 1], new_build_sales: txs.filter(t => t.new_build).length, sales_by_year: years }; };
  for (const [pc, txs] of Object.entries(pp.postcodes)) {
    const a = agg(txs); if (a.homes_sold_since_1995 >= K) homesOut[pc] = a; else homesOut[pc] = { homes_sold_since_1995: `fewer than ${K}` };
    for (const t of txs) { const b = matchBuilding(pc, `${t.paon} ${t.street}`) || matchBuilding(pc, t.paon); if (b) { if (!byB.has(b.id)) byB.set(b.id, []); byB.get(b.id).push(t); } }
  }
  for (const [id, txs] of byB) { const a = agg(txs); rec.get(id).sales = a.homes_sold_since_1995 >= K ? { ...a, source: 'HM Land Registry Price Paid (OGL)' } : { homes_sold_since_1995: `fewer than ${K}` }; }
  joins.price_paid_buildings = byB.size;
}
// Chain-store branches (sources/brands/branches.json: NSI brands found in OSM, FSA and the archived CWG directory).
// A branch with an OSM or FSA id enriches that occupant; others are placed by position, marked when the position is
// only a mall or postcode centre.
if (has('brands/branches.json')) {
  const br = readJ('brands/branches.json').branches; let enriched = 0, added = 0, loose = 0;
  const index = new Map();
  for (const r of recs) for (const o of r.occupants) { if (o.osm) index.set('osm:' + o.osm, o); if (o.fhrs_id) index.set('fhrs:' + o.fhrs_id, o); }
  const extra = x => ({ brand: x.brand, brand_wikidata: x.brand_wikidata || null, nsi_id: x.nsi_id, ...(x.mall ? { mall: x.mall } : {}), ...(x.level_cwg ? { level_cwg: x.level_cwg } : {}),
    ...(x.cwg_url ? { cwg_url: x.cwg_url, cwg_archived: x.cwg_archived || null } : {}), ...(x.store_url ? { store_url: x.store_url } : {}), brand_confidence: x.confidence });
  for (const x of br) {
    const hit = (x.osm_id && index.get('osm:' + x.osm_id)) || (x.fhrs_id && index.get('fhrs:' + x.fhrs_id));
    if (hit) { Object.assign(hit, extra(x)); enriched++; continue; }
    const h = x.lat != null ? buildingAt(x.lon, x.lat) : null;
    if (!h) { loose++; continue; }
    rec.get(h.b.id).occupants.push({ name: x.name, role: 'branch: ' + x.category, source: x.sources.join('+'), ...extra(x), placed: /centroid|centre/.test(x.position || '') ? `approximate (${x.position})` : h.how });
    added++;
  }
  joins.brand_branches = br.length; joins.brand_enriched_occupants = enriched; joins.brand_added_occupants = added; joins.brand_not_placed = loose;
}

// Canary Wharf Group directory (sources/brands/cwg-directory.json, archived copies). Entries a branch already joined keep
// that link. Every other entry joins existing occupants (OSM, FSA, Wikidata, branches) by name AND place; an entry that
// joins nothing becomes a new occupant, placed by its mall or street address. Rules and error classes: pipeline.json
// activity "build-registry"; skill docklands-data-curation (CWG join).
const cwgOut = { unplaced: [], ambiguous: [] };
// the CWG place (mall, street, square) a free-text address names; never a name inside a longer one that also appears
const PLACES = CWG_PLACES.map(p => p.toLowerCase());
const placeIn = text => { const low = String(text || '').toLowerCase(), hits = PLACES.filter(p => low.includes(p)); return CWG_PLACES[PLACES.indexOf(hits.filter(p => !hits.some(o => o !== p && o.includes(p)))[0])] || null; };
let MALL_HOST = {};   // mall name -> { id, how }: set by the CWG join, used again by the registers join
if (has('brands/cwg-directory.json')) {
  const D = readJ('brands/cwg-directory.json').directory, st = { entries: D.length, linked_by_branch: 0, joined: 0, joined_by: {}, added: 0, added_by: {}, added_confidence: {}, unplaced: 0, unplaced_by: {}, ambiguous: 0 };
  const tagsOf = new Map(osm.features.map(f => [`${f.type}/${f.id}`, f.tags || {}]));
  const MALL = CWG_MALLS;
  // mall host outline: the outline whose OSM name or addr:housename is the mall's name or starts with it ("Cabot Place
  // Shopping Centre", "Cabot Place East"); an OSM name outranks a house name; two or more left: no host.
  const bare = s => String(s || '').toLowerCase().replace(/^the /, '');
  const hostOf = {};
  for (const m of MALL) {
    const k = bare(m), starts = v => v && !/entrance|car park/i.test(v) && (bare(v) === k || bare(v).startsWith(k + ' '));
    const byName = outlines.filter(b => starts(b.f.tags.name)), byHouse = outlines.filter(b => starts(b.f.tags['addr:housename']));
    const c = byName.length ? byName : byHouse;
    if (c.length === 1) hostOf[m] = { id: c[0].id, how: `${byName.length ? 'OSM name' : 'OSM addr:housename'} "${byName.length ? c[0].f.tags.name : c[0].f.tags['addr:housename']}" (${key(c[0])})` };
  }
  st.mall_hosts = Object.fromEntries(Object.entries(hostOf).map(([m, h]) => [m, h.id]));
  MALL_HOST = hostOf;
  // what each existing occupant says about its place: mall (branch table, OSM address tags, FSA address), postcodes, building
  const cand = [];
  for (const r of recs) for (const o of r.occupants) {
    const t = o.osm ? tagsOf.get(o.osm) || {} : {};
    const mall = o.mall || placeIn([t['addr:place'], t['addr:housename'], t['addr:street']].filter(Boolean).join(' | ')) || (o.source === 'fsa' ? placeIn(o.address) : null);
    const pcs = new Set([...osmList(t['addr:postcode']).map(normPc), o.postcode ? normPc(o.postcode) : null].filter(Boolean));
    cand.push({ o, r, mall, pcs, keys: new Set([...nameKeys(o.name)]) });
  }
  const linked = new Set(cand.map(c => c.o.cwg_url).filter(Boolean));
  // two different named malls are never the same place; but Canada Place and the One Canada Square mall are one connected
  // level that CWG and the FSA name both ways ("Unit 463 Canada Place, 1 Canada Square"), as in build-branches.mjs
  const CANADA = /^(Canada Place|One Canada Square)$/;
  const malls = (a, b) => a && b && MALL.has(a) && MALL.has(b) && a !== b && !(CANADA.test(a) && CANADA.test(b));
  const kindOf = new Map(D.map(e => [e.cwg_url, e.kind]));
  // "mall" only for a named mall; a street, square or district CWG names is kept as cwg_place
  const cwgInfo = (e, f) => ({ cwg_url: e.cwg_url, cwg_archived: e.archived || null, cwg_kind: e.kind, ...(e.categories?.length ? { cwg_categories: e.categories } : {}),
    ...(e.mall && MALL.has(e.mall) ? { mall: e.mall } : e.mall ? { cwg_place: e.mall } : {}), ...(e.level ? { level_cwg: e.level } : {}), ...(e.website ? { cwg_website: e.website } : {}), ...(f.flags?.length ? { cwg_flags: f.flags } : {}) });
  const unplaced = (e, why) => { st.unplaced++; st.unplaced_by[why] = (st.unplaced_by[why] || 0) + 1; cwgOut.unplaced.push({ slug: e.slug, title: e.title || null, kind: e.kind, mall: e.mall || null, postcode: e.postcode || null, why }); };
  for (const e of D) {
    if (linked.has(e.cwg_url)) { st.linked_by_branch++; continue; }
    if (!e.title) { unplaced(e, 'no archived page (no name, no address)'); continue; }
    const f = cwgFields(e.address_lines), pc = e.postcode ? normPc(e.postcode) : null, keys = nameKeys(e.title);
    // where the entry is: the building whose address its street line names; else its mall's host outline
    let home = null;
    const street = f.street ? normAddr(f.street) : null;
    const byStreet = street ? recs.filter(r => r.keys.includes(street)) : [];
    const streetHit = byStreet.length > 1 && pc ? byStreet.filter(r => r.postcodes.has(pc)) : byStreet;
    if (streetHit.length === 1) home = { id: streetHit[0].id, rule: 'street address', how: `CWG street address "${f.street}"${pc && streetHit[0].postcodes.has(pc) ? ' and postcode' : ''}`, confidence: pc && streetHit[0].postcodes.has(pc) ? 'high' : 'medium' };
    else if (hostOf[e.mall]) home = { id: hostOf[e.mall].id, rule: 'mall host outline', how: `CWG mall ${e.mall}: ${hostOf[e.mall].how}`, confidence: 'medium' };
    // 1. join: same name key, and the same place: the same mall, a shared postcode, or the entry's own building; never two different malls
    // an occupant that already has a CWG link takes a second entry only from another CWG section (GoBoat under shop and
    // see-do); two entries of one section are two places (two photo booths in Canada Place)
    const hits = cand.filter(c => keys.some(k => c.keys.has(k)) && !malls(c.mall, e.mall) && (!c.o.cwg_url || (kindOf.get(c.o.cwg_url) !== e.kind && !(c.o.cwg_also || []).length)));
    const tiers = [[MALL.has(e.mall) ? 'name + mall' : 'name + street or square', c => c.mall && c.mall === e.mall], ['name + postcode', c => pc && c.pcs.has(pc)], ['name + building', c => home && c.r.id === home.id]];
    let joinedTo = null;
    for (const [how, test] of tiers) {
      const t = hits.filter(test); if (!t.length) continue;
      const bySrc = {}; for (const c of t) (bySrc[c.o.source] ||= []).push(c);
      // two records of one source in one building are one place recorded twice (audit ID-2); in two buildings, two places
      if (Object.values(bySrc).some(l => new Set(l.map(c => c.r.id)).size > 1)) { st.ambiguous++; cwgOut.ambiguous.push({ slug: e.slug, title: e.title, how, candidates: t.map(c => ({ building: c.r.id, name: c.o.name, source: c.o.source, ...(c.o.osm ? { osm: c.o.osm } : {}), ...(c.o.fhrs_id ? { fhrs_id: c.o.fhrs_id } : {}) })) }); joinedTo = 'ambiguous'; break; }
      joinedTo = { how, list: t }; break;
    }
    if (joinedTo === 'ambiguous') { unplaced(e, 'name matches two or more occupants of one source at that place'); continue; }
    if (joinedTo) {
      for (const c of joinedTo.list) {
        if (c.o.cwg_url) { (c.o.cwg_also ||= []).push(e.cwg_url); continue; }
        const info = cwgInfo(e, f); for (const k of Object.keys(info)) if (c.o[k] == null) c.o[k] = info[k]; c.o.cwg_join = joinedTo.how;
      }
      st.joined++; st.joined_by[joinedTo.how] = (st.joined_by[joinedTo.how] || 0) + 1;
      if (new Set(joinedTo.list.map(c => c.r.id)).size > 1) st.joined_records_in_different_buildings = (st.joined_records_in_different_buildings || 0) + 1;
      continue;
    }
    // 2. a new occupant. Without a mall host or a street address: the one building with the postcode, else the one
    // building in the postcode that OSM states is retail. Estate-wide entries and car parks have no building.
    if (f.flags.includes('estate-wide')) { unplaced(e, 'estate-wide (no single place)'); continue; }
    if (f.flags.includes('car park')) { unplaced(e, 'in a car park (no outline of its own)'); continue; }
    if (!home && pc) {
      const inPc = recs.filter(r => r.postcodes.has(pc)), retail = inPc.filter(r => { const t = outlineOf.get(r.id).f.tags; return t.building === 'retail' || t.landuse === 'retail' || t.shop === 'mall'; });
      if (inPc.length === 1) home = { id: inPc[0].id, rule: 'only building with the postcode', how: `the one registry building with postcode ${pc}`, confidence: 'low' };
      else if (retail.length === 1) home = { id: retail[0].id, rule: 'only retail building with the postcode', how: `the one building with postcode ${pc} that OSM tags as retail`, confidence: 'low' };
    }
    if (!home) {
      const inPc = pc ? recs.filter(r => r.postcodes.has(pc)).length : 0;
      unplaced(e, !e.address_lines?.length ? 'page has no address' : f.street ? 'street address names no registry building'
        : !pc ? (e.mall ? 'no postcode; its place is a street, square or district' : 'no postcode and no place') : !/^E14 /.test(pc) ? 'postcode outside E14, no street address'
        : inPc ? 'postcode names several buildings, no mall or street address' : 'postcode on no registry building, no street address');
      continue;
    }
    const o = { name: e.title, role: `directory: ${e.kind}`, source: 'cwg', ...cwgInfo(e, f), address: e.address_lines.join(', '), ...(pc ? { postcode: pc } : {}), placed: home.how, placed_confidence: home.confidence };
    rec.get(home.id).occupants.push(o); cand.push({ o, r: rec.get(home.id), mall: e.mall, pcs: new Set(pc ? [pc] : []), keys: new Set(keys) });
    st.added++; st.added_by[home.rule] = (st.added_by[home.rule] || 0) + 1; st.added_confidence[home.confidence] = (st.added_confidence[home.confidence] || 0) + 1;
  }
  joins.cwg = st;
}

// Regulatory and public registers (sources/registers/, tools/fetch-registers.mjs): schools (GIAS), care (CQC), NHS
// organisations (ODS), charities, Ofsted childcare, gambling premises, Sport England Active Places, FSA pubs and bars.
// Keys in order: UPRN (OS Open UPRN point inside an outline), the register's own point, the street address or the name
// of an occupant at the same postcode, and the postcode alone where it covers one building. A unit in a named mall is
// placed in the mall's host outline (F4). Each link keeps the key, its precision and a confidence. Rules: pipeline.json
// activity "build-registry"; error classes: skill docklands-data-curation (registers join).
const regOut = { unplaced: [], uprn_rejected: [] };
if (has('registers/gias.json')) {
  const uprnPt = new Map();
  if (has('uprn/uprn-canary-wharf.csv')) for (const line of readFileSync(join(SRC, 'uprn/uprn-canary-wharf.csv'), 'utf8').split('\n').slice(1)) { const [u, , , lat, lon] = line.split(','); if (u) uprnPt.set(u, [+lon, +lat]); }
  const regKeys = n => new Set([n, String(n || '').replace(/\(.*?\)/g, ' '), String(n || '').replace(/\b(limited|ltd|plc|llp)\b\.?/gi, ' ')].flatMap(nameKeys));
  const tagsOf = new Map(osm.features.map(f => [`${f.type}/${f.id}`, f.tags || {}]));
  const cand = [];
  const index = (o, r) => { const t = o.osm ? tagsOf.get(o.osm) || {} : {}; cand.push({ o, r, keys: regKeys(o.name), pcs: new Set([...osmList(t['addr:postcode']).map(normPc), o.postcode ? normPc(o.postcode) : null].filter(Boolean)), mall: o.mall || placeIn(o.address) }); };
  for (const r of recs) for (const o of r.occupants) index(o, r);
  const byFhrs = new Map(cand.filter(c => c.o.fhrs_id).map(c => [String(c.o.fhrs_id), c]));
  const residential = r => !!r.homes || /^(apartments|residential|house|terrace|detached|semidetached_house|dormitory)$/.test(r.building);
  // ODS organisation records (a provider, a headquarters, an agency) are where the organisation is registered, not a
  // service: kept as "head office" occupants, never given a service category
  const ODS_ORG = /^(Social Care Provider|Independent Sector Healthcare Provider|Non-Nhs Organisation|Pharmacy Headquarter|Optical Headquarters|Clinical Commissioning Group|Local Authority|Executive Agency|Special Health Authority \(Spha\)|Primary Care Network|Application Service Provider|Gp Abeyance And Dispersal)/;
  const REGS = [
    ['gias', 'gias.json', r => ({ urn: r.urn }), r => r.status !== 'Closed', r => r.address_role ? 'correspondence address (the establishment is not here)' : null],
    ['active-places', 'active-places.json', r => ({ active_places_site_id: r.site_id }), r => r.status !== 'closed', () => null],
    ['ods', 'ods.json', r => ({ ods_code: r.ods_code }), r => r.status === 'Active', r => r.postcode === 'E14 5HU' ? 'registered-office service at E14 5HU (5 Churchill Place)' : null],
    ['cqc', 'cqc.json', r => ({ cqc_location_id: r.id }), () => true, () => null],
    ['ofsted-childcare', 'ofsted-childcare.json', r => ({ ofsted_urn: r.urn }), r => r.status === 'Active', () => null],
    ['gambling', 'gambling.json', r => ({ gambling_premises_id: r.id, gambling_operator_account: r.operator_account }), () => true, () => null],
    ['charities', 'charities.json', r => ({ charity_number: r.charity_number, ...(r.company_number ? { company_number: r.company_number } : {}) }), r => r.status === 'registered', () => null],
    ['fsa-pubs', 'fsa-pubs.json', r => ({ fhrs_id: +r.id.replace('fhrs:', '') }), () => true, () => null],
  ];
  // a care-of or accountant's address is where letters go, not where the organisation works (like SE-1)
  // the company-secretarial service on the 10th floor of 5 Churchill Place (E14 5HU) holds registered offices for many
  // organisations whose services are elsewhere (register README; like audit SE-1)
  const HUB = /10th floor,? 5 churchill place|5 churchill place,? (canary wharf,? )?10th floor|corporation service company|tower bridge international services/i;
  const CARE_OF = /\bc\/o\b|\bcare of\b|accountant|accounts direct/i;
  // a street the address names ("71-75 SHELTON STREET"): when the postcode alone would place the record, the building must
  // be on that street (a virtual-office address with an E14 postcode is not in E14)
  const STREET = /\b\d+[a-z]?(?:\s*-\s*\d+[a-z]?)?,?\s+((?:[a-z']+\s+){0,3}(?:street|road|place|square|walk|lane|avenue|way|crescent|colonnade|circus|drive|grove|passage|terrace|quay|court|wall|row|gardens))\b/i;
  const st = {};
  for (const [reg, file, ids, current, exclude] of REGS) {
    if (!has('registers/' + file)) continue;
    const s = st[reg] = { records: 0, placed_by: {}, joined_existing: 0, added: 0, unplaced_by: {} };
    const miss = (r, why) => { s.unplaced_by[why] = (s.unplaced_by[why] || 0) + 1; regOut.unplaced.push({ register: reg, id: r.id, name: r.name, postcode: r.postcode || null, in_box: !!r.in_box, why }); };
    const RS = readJ('registers/' + file).records;
    // a UPRN that one register gives to records at two or more postcodes names an office that handles them (GIAS gives
    // the council's UPRN to several schools), not each place
    const uprnPcs = new Map(); for (const r of RS) if (r.uprn) uprnPcs.set(String(r.uprn), new Set([...(uprnPcs.get(String(r.uprn)) || []), r.postcode]));
    for (const r of RS) {
      s.records++;
      const ex = exclude(r) || (HUB.test(r.address || '') || normPc(r.postcode) === 'E14 5HU' ? 'registered-office service at E14 5HU (5 Churchill Place)' : null)
        || (CARE_OF.test(r.address || '') ? 'care-of or accountant address (not where it works)' : null); if (ex) { miss(r, ex); continue; }
      const pc = r.postcode ? normPc(r.postcode) : null, mallName = placeIn(r.address), mall = CWG_MALLS.has(mallName) ? mallName : null;
      const link = { register: reg, id: r.id, kind: r.kind, status: r.status, ...(r.url ? { url: r.url } : {}) };
      // FSA pubs are FSA premises the registry already holds when their FHRS id is an occupant
      if (reg === 'fsa-pubs' && byFhrs.has(r.id.replace('fhrs:', ''))) { const c = byFhrs.get(r.id.replace('fhrs:', '')); (c.o.registers ||= []).push({ ...link, key: 'FHRS id', precision: 'same FSA premises', confidence: 'high' }); s.joined_existing++; s.placed_by['FHRS id'] = (s.placed_by['FHRS id'] || 0) + 1; continue; }
      let home = null, above = null;
      // 1. UPRN
      const u = r.uprn ? String(r.uprn) : null, up = u && uprnPt.get(u);
      const rejectU = why => { s['uprn_rejected: ' + why] = (s['uprn_rejected: ' + why] || 0) + 1; regOut.uprn_rejected.push({ register: reg, id: r.id, name: r.name, uprn: u, postcode: r.postcode || null, why }); };
      if (up && uprnPcs.get(u).size > 1) rejectU(`one UPRN on ${RS.filter(x => String(x.uprn) === u).length} records at ${uprnPcs.get(u).size} postcodes`);
      else if (up && r.position === 'source' && r.lat != null && Math.hypot((up[0] - r.lon) * mPerDeg[0], (up[1] - r.lat) * mPerDeg[1]) > 150) rejectU('UPRN point over 150 m from the register\'s own point');
      else if (up) { const h = buildingAt(up[0], up[1], 0); if (h) home = { id: h.b.id, key: 'UPRN', precision: 'OS Open UPRN point inside the outline', confidence: 'high' }; else s.uprn_point_in_no_outline = (s.uprn_point_in_no_outline || 0) + 1; }
      // 2. the register's own point (an FSA point within 3 m of its postcode centre is a postcode, F7)
      if (!home && r.position === 'source' && r.lat != null && inBox(r.lon, r.lat)) {
        const p = pcs.get(pc), atPc = p?.lat && Math.hypot((+p.lon - r.lon) * mPerDeg[0], (+p.lat - r.lat) * mPerDeg[1]) <= 3;
        const h = atPc ? null : buildingAt(r.lon, r.lat);
        if (h) home = { id: h.b.id, key: 'register point', precision: `register point, ${h.how}`, confidence: h.how === 'inside' ? 'medium' : 'low' };
      }
      // F4: a unit in a named mall belongs to the mall, whatever outline its point lies in
      if (mall && MALL_HOST[mall] && (!home || home.id !== MALL_HOST[mall].id)) { above = home?.id || null; home = { id: MALL_HOST[mall].id, key: home ? `${home.key} + mall` : 'mall named in the address', precision: `mall ${mall}: ${MALL_HOST[mall].how}`, confidence: 'medium' }; }
      // 3. street address, then the name of an occupant at the same postcode or mall
      if (!home && pc) { const b = matchBuilding(pc, r.address || ''); if (b) home = { id: b.id, key: 'street address + postcode', precision: 'address text names the building, postcode agrees', confidence: 'high' }; }
      // the street address alone: one registry building whose numbered address key the address text contains
      if (!home) { const t = normAddr(r.address || ''), c = recs.filter(x => x.keys.some(k => /^\d/.test(k) && new RegExp(`(^| )${k}( |$)`).test(t))); if (c.length === 1) home = { id: c[0].id, key: 'street address', precision: 'address text names the building; its postcode is not on the building', confidence: 'medium' }; }
      const keys = regKeys(r.name);
      const named = cand.filter(c => [...keys].some(k => c.keys.has(k)) && ((pc && c.pcs.has(pc)) || (mall && c.mall === mall) || (home && c.r.id === home.id)));
      const namedB = [...new Set(named.map(c => c.r.id))];
      if (!home && namedB.length === 1) home = { id: namedB[0], key: 'name + postcode', precision: 'an occupant of this building has the same name and postcode', confidence: 'medium' };
      // 4. the postcode alone, where it covers one building (never for a charity: its address is a contact address)
      // the one registry building with the postcode must also lie at the postcode (ONSPD centre within 50 m), and be on
      // the street the address names
      let pcWhy = null;
      if (!home && pc && reg !== 'charities') {
        const inPc = recs.filter(x => x.postcodes.has(pc)), p = pcs.get(pc);
        if (inPc.length === 1) {
          const sm = (r.address || '').match(STREET), street = sm ? normAddr(sm[1]) : null;
          if (p?.lat && distTo(outlineOf.get(inPc[0].id), +p.lon, +p.lat) > 50 && !inside(outlineOf.get(inPc[0].id), +p.lon, +p.lat)) pcWhy = 'postcode on one registry building, but the postcode centre is over 50 m from it';
          else if (street && inPc[0].keys.some(k => /^\d/.test(k)) && !inPc[0].keys.some(k => k.includes(street))) pcWhy = 'street in the address is not the street of the one building with the postcode';
          else home = { id: inPc[0].id, key: 'postcode (one building)', precision: `the one registry building with postcode ${pc}, at the postcode centre`, confidence: 'low' };
        }
      }
      if (!home) {
        const inPc = pc ? recs.filter(x => x.postcodes.has(pc)).length : 0;
        miss(r, !r.in_box && !inPc ? 'outside the registry box' : pcWhy || (reg === 'charities' ? 'charity: no UPRN, street address or same-name occupant' : !pc ? 'no postcode' : namedB.length > 1 ? 'same name in two or more buildings' : inPc ? 'postcode covers several buildings, no other key' : 'postcode on no registry building'));
        continue;
      }
      const b = rec.get(home.id);
      if (reg === 'charities' && home.key !== 'UPRN' && !named.length && residential(b)) { miss(r, 'charity: contact address in a residential building'); continue; }
      s.placed_by[home.key] = (s.placed_by[home.key] || 0) + 1;
      const full = { ...link, key: home.key, precision: home.precision, confidence: home.confidence, ...(above ? { point_in: above } : {}) };
      const same = cand.filter(c => c.r.id === home.id && [...keys].some(k => c.keys.has(k)));
      if (same.length) { for (const c of same) { (c.o.registers ||= []).push(full); Object.assign(c.o, ...Object.entries(ids(r)).filter(([k]) => c.o[k] == null).map(([k, v]) => ({ [k]: v }))); } s.joined_existing++; continue; }
      const o = { name: r.name, role: reg === 'ods' && ODS_ORG.test(r.kind) ? 'head office (ODS)' : `register: ${reg}`, source: reg, ...ids(r), register_kind: r.kind, current: !!current(r),
        ...(r.address ? { address: r.address } : {}), ...(pc ? { postcode: pc } : {}), ...(mall ? { mall } : {}), registers: [full], placed: home.precision, placed_confidence: home.confidence };
      b.occupants.push(o); index(o, b); s.added++;
    }
  }
  joins.registers = st;
}

// In a residential building a registered office is often a flat: give the number of companies, not their names.
for (const r of recs) if (r.companies && (r.homes || /^(apartments|residential|house|terrace|detached|semidetached_house)$/.test(r.building))) r.companies = { count: r.companies.length, note: 'residential building: company names are not listed here (see the Companies House link)' };
for (const r of recs) { if (r.toidSet) r.toids = [...r.toidSet].sort(); if (r.usrnSet) r.usrns = [...r.usrnSet].sort(); delete r.toidSet; delete r.usrnSet; delete r.keys; }
if (Object.keys(companiesOut).length) writeFileSync(join(OUT, 'companies-by-postcode.json'), JSON.stringify({ source: 'Companies House Basic Company Data (company-level only; addresses not copied)', postcodes: companiesOut }));
if (Object.keys(homesOut).length) writeFileSync(join(OUT, 'homes-by-postcode.json'), JSON.stringify({ source: `HM Land Registry Price Paid (OGL); totals per postcode, only where at least ${K} homes have sold`, postcodes: homesOut }));
console.log('joins', JSON.stringify(joins));

// ---- links per building and per postcode
const ch = pc => `https://find-and-update.company-information.service.gov.uk/advanced-search/get-results?registeredOfficeAddress=${encodeURIComponent(pc).replace(/%20/g, '+')}`;
const ppd = pc => `https://landregistry.data.gov.uk/app/ppd/search?postcode=${encodeURIComponent(pc).replace(/%20/g, '+')}`;
const out = [...rec.values()].sort((a, b) => a.id.localeCompare(b.id)).map(r => {
  const postcodes = [...r.postcodes].filter(Boolean).sort();
  return {
    ...r, postcodes,
    postcode_info: postcodes.map(pc => { const p = pcs.get(pc); return { pc, status: p ? p.status : 'not in ONSPD E14 list', tier: p?.tier || null, large_user: !!p?.large_user }; }),
    links: {
      osm: r.osm.map(k => `https://www.openstreetmap.org/${k}`),
      ...(r.wikidata ? { wikidata: `https://www.wikidata.org/wiki/${r.wikidata}` } : {}),
      ...(r.wikipedia ? { wikipedia: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.wikipedia.replace(/^en:/, '').replace(/ /g, '_'))}` } : {}),
      companies_house_by_postcode: postcodes.map(ch), land_registry_price_paid_by_postcode: postcodes.map(ppd),
    },
  };
});
const summary = {
  generated: new Date().toISOString().slice(0, 10), box: CW_BOX, buildings: out.length, minted_this_run: minted,
  named: out.filter(r => r.name).length, with_wikidata: out.filter(r => r.wikidata).length, with_occupants: out.filter(r => r.occupants.length).length,
  occupants: out.reduce((n, r) => n + r.occupants.length, 0), osm_placed: osmPlaced, osm_not_in_a_building: osmLoose, fsa_placed: fsaPlaced, fsa_by_postcode_only: Object.values(byPostcode).flat().length,
  with_owner: out.filter(r => r.owners.length).length, joins: Object.fromEntries(Object.entries(joins).filter(([k]) => k !== 'inspire_attribution')), attribution_inspire: joins.inspire_attribution || null,
  sources: { osm: osm.extracted, wikidata_qlever: wd.fetched, fsa: fhrs.fetched },
};
writeFileSync(idsFile, JSON.stringify(ids, null, 1));
writeFileSync(join(OUT, 'buildings.json'), JSON.stringify({ summary, buildings: out, unplaced_by_postcode: byPostcode, cwg_unplaced: cwgOut.unplaced, cwg_ambiguous: cwgOut.ambiguous, registers_unplaced: regOut.unplaced, registers_uprn_rejected: regOut.uprn_rejected }));
console.log(JSON.stringify(summary, null, 1));
