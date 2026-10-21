// The world skeleton as data, for the globe of the Three.js port and for Node (OKR KR2.2, KR2.7, KR3.4): layer manifests
// in the globe's layer contract, the compact wsk1 format and plain GeoJSON decoded to one feature form, "where is this"
// lookups (country, admin-1 region, sea, lake) by point in polygon, the nearest places, a gazetteer search, names in the
// visitor's language, and a description of a globe view in words. Pure: no DOM, no three.js (tools in Node import it).
// Locale-free: it knows no place; places come from the data (Natural Earth, region configs, later the UK skeleton).
//
// Layer contract (a manifest, JSON; the world one is cwplans/docklands/data/world/layers.json):
//   { v: 1, id, name, credit, names?: { url: 'names-{lang}.json', langs: [...] },
//     layers: [ { id, label, kind: 'lines' | 'polygons' | 'points', url (relative to the manifest) | data (inline),
//                 format?: 'wsk1' | 'geojson' (by content when absent), draw?: false, style?: { color, opacity, minAlt, maxAlt },
//                 lookup?: 'country' | 'admin1' | 'sea' | 'lake' | any word (a "where am I" answer), idProp?: property (the id other layers use),
//                 labels?: { text: prop, names?: prop holding { lang: name }, at?: [lonProp, latProp], minZoom?: prop | number,
//                            maxZoom?: prop | number, rank?: prop (smaller first), zoomAdd?: number, class?: string, minAlt?, maxAlt? },
//                 gazetteer?: { kind, text: [props], names?: prop, at?: [lonProp, latProp], rank?: prop, rankLowFirst?: true },
//                 namesTable?: key in the names-{lang} files, nearest?: true (points used for "nearest places"),
//                 facts?: [ { label, prop, source } ] } ] }
// GeoJSON is WGS84 lon/lat (RFC 7946); properties are free. Skill: docklands-3d-page, "Three.js port: globe and world
// skeleton (2026-10-13)".
import { surfaceDistance, D2R, R2D } from '../geo/ellipsoid.js';
import { latinPreferred, isLatin, pickName } from '../geo/script.js';

export const WORLD_VERSION = '1.0.0';
// languages of the world names (names-{lang}.json) written in another script than Latin
export const NONLATIN_LANGS = ['ar', 'bn', 'el', 'fa', 'he', 'hi', 'ja', 'ko', 'ru', 'uk', 'ur', 'zh', 'zht'];

// ---------- decoding: wsk1 (delta-encoded integers in 1/q degrees) or GeoJSON -> [{ properties, geometry: { type, coordinates } }]
function dec(a, q) { const out = []; let x = 0, y = 0; for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; out.push([x / q, y / q]); } return out; }
export function decodeLayer(J) {
  if (J && J.type === 'FeatureCollection') return J.features.filter(f => f && f.geometry).map(f => ({ properties: f.properties || {}, geometry: f.geometry }));
  if (!J || J.format !== 'wsk1') throw new Error('unknown layer format');
  const q = J.q || 1000;
  return J.features.map(f => {
    const g = J.kind === 'points' ? { type: 'Point', coordinates: [f.g[0] / q, f.g[1] / q] }
      : J.kind === 'lines' ? { type: 'MultiLineString', coordinates: f.g.map(l => dec(l, q)) }
      : { type: 'MultiPolygon', coordinates: f.g.map(p => p.map(r => dec(r, q))) };
    return { properties: f.p || {}, geometry: g };
  });
}
// every line of a geometry (rings of polygons too)
export function linesOf(g) {
  if (!g) return []; const c = g.coordinates;
  switch (g.type) { case 'LineString': return [c]; case 'MultiLineString': case 'Polygon': return c; case 'MultiPolygon': return c.flat(); default: return []; }
}
const polysOf = g => !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
const pointOf = g => g && g.type === 'Point' ? g.coordinates : g && g.type === 'MultiPoint' ? g.coordinates[0] : null;

// ---------- language: the visitor's (navigator.languages) matched to the languages a manifest has; zh-Hant / zh-TW / zh-HK -> 'zht'
export function pickLang(prefs, available) {
  const av = new Set(available || []);
  for (const p of prefs || []) {
    const l = String(p).toLowerCase(), base = l.split('-')[0];
    if (base === 'zh' && /hant|-tw|-hk|-mo/.test(l) && av.has('zht')) return 'zht';
    if (av.has(l)) return l; if (av.has(base)) return base;
  }
  return null;
}
// accent- and case-free form for search ("León" = "leon", "Łódź" = "lodz")
export const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/ß/g, 'ss').toLowerCase().trim();

// ---------- point in polygon with a 5-degree bucket index of bounding boxes
function ringsBox(polys) { let w = 180, s = 90, e = -180, n = -90; for (const p of polys) for (const [x, y] of p[0] || []) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; } return [w, s, e, n]; }
function inRing(r, x, y) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
function inPolys(polys, x, y) { for (const p of polys) if (p[0] && inRing(p[0], x, y)) { let hole = false; for (let k = 1; k < p.length; k++) if (inRing(p[k], x, y)) { hole = true; break; } if (!hole) return true; } return false; }
const CELL = 5, cellKey = (i, j) => i * 100 + j;
function polyIndex(features) {
  const grid = new Map(), items = features.map(f => ({ f, polys: polysOf(f.geometry) })).filter(it => it.polys.length);
  items.forEach((it, k) => { it.box = ringsBox(it.polys); const [w, s, e, n] = it.box;
    for (let i = Math.floor((w + 180) / CELL); i <= Math.floor((e + 180) / CELL); i++) for (let j = Math.floor((s + 90) / CELL); j <= Math.floor((n + 90) / CELL); j++) { const key = cellKey(i, j); if (!grid.has(key)) grid.set(key, []); grid.get(key).push(k); } });
  return { items, find(lon, lat) {
    const ks = grid.get(cellKey(Math.floor((lon + 180) / CELL), Math.floor((lat + 90) / CELL))) || [];
    for (const k of ks) { const it = items[k], [w, s, e, n] = it.box; if (lon < w || lon > e || lat < s || lat > n) continue; if (inPolys(it.polys, lon, lat)) return it.f; }
    return null; },
    // the nearest feature whose outline comes within maxKm (for a sea when the point is in no sea polygon)
    near(lon, lat, maxKm = 300) { let best = null, bd = maxKm * 1000; const dl = maxKm / 111 / Math.max(0.1, Math.cos(lat * D2R)), db = maxKm / 111;
      for (const it of items) { const [w, s, e, n] = it.box; if (lon < w - dl || lon > e + dl || lat < s - db || lat > n + db) continue;
        for (const p of it.polys) for (const r of p) for (let i = 0; i < r.length; i += 4) { const d = surfaceDistance(lon, lat, r[i][0], r[i][1]); if (d < bd) { bd = d; best = it.f; } } }
      return best ? { f: best, dist_m: Math.round(bd) } : null; } };
}

// initial bearing (degrees from true north) and a compass word
export function bearingDeg(lon1, lat1, lon2, lat2) { const p1 = lat1 * D2R, p2 = lat2 * D2R, dl = (lon2 - lon1) * D2R; return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) * R2D + 360) % 360; }
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const compass = b => COMPASS[Math.round(((b % 360) + 360) % 360 / 45) % 8];
export function fmtDist(m) { return m < 950 ? `${Math.round(m / 10) * 10} m` : m < 9500 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000).toLocaleString('en')} km`; }
export function fmtLatLon(lat, lon, d = 2) { return `${Math.abs(lat).toFixed(d)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(d)}° ${lon >= 0 ? 'E' : 'W'}`; }

// ---------- the world: layers from manifests, lookups, gazetteer, names
export function makeWorld({ fetchJson, lang = null } = {}) {
  const W = { manifests: [], layers: new Map(), lookups: new Map(), gaz: [], nearest: [], lang, names: new Map(), langs: new Set() };
  const resolve = (base, u) => { try { return new URL(u, base).href; } catch { return base.replace(/[^/]*$/, '') + u; } };

  // a manifest: the layer list (data loaded on demand by loadLayer); onlyKinds: load nothing yet
  W.addManifest = async function (url, M = null) {
    M = M || await fetchJson(url); M.base = url; W.manifests.push(M);
    for (const L of M.layers || []) { L.manifest = M; L.src = L.url ? resolve(url, L.url) : null; W.layers.set((M.id ? M.id + ':' : '') + L.id, L); }
    if (M.names) for (const l of M.names.langs || []) W.langs.add(l);
    return M;
  };
  W.layerList = () => [...W.layers.entries()].map(([key, L]) => ({ ...L, key }));
  // load one layer's features (once); builds its lookup index, gazetteer entries and nearest list
  W.loadLayer = async function (key) {
    const L = W.layers.get(key); if (!L) throw new Error('no layer ' + key);
    if (L.features) return L; if (L.loading) return L.loading;
    L.loading = (async () => {
      const J = L.data || await fetchJson(L.src); L.features = decodeLayer(J);
      if (L.namesTable && L.manifest.names && W.lang) await W.loadNames(L.manifest);
      if (L.lookup) W.lookups.set(L.lookup, { L, idx: polyIndex(L.features) });
      if (L.gazetteer) addGaz(L);
      if (L.nearest) for (const [i, f] of L.features.entries()) { const p = pointOf(f.geometry); if (p) W.nearest.push({ L, i, f, lon: p[0], lat: p[1] }); }
      return L;
    })();
    return L.loading;
  };
  W.loadAll = (pred = () => true) => Promise.all(W.layerList().filter(pred).map(l => W.loadLayer(l.key)));
  // names in the visitor's language (names-{lang}.json of a manifest)
  W.loadNames = async function (M) {
    if (!W.lang || !M.names || !(M.names.langs || []).includes(W.lang)) return null;
    const k = M.base + '#' + W.lang; if (W.names.has(k)) return W.names.get(k);
    const p = fetchJson(resolve(M.base, M.names.url.replace('{lang}', W.lang))).catch(() => null); W.names.set(k, p); const r = await p; W.names.set(k, r); return r;
  };
  const tableOf = L => { const t = W.lang && L.manifest.names ? W.names.get(L.manifest.base + '#' + W.lang) : null; return t && !t.then && L.namesTable ? t[L.namesTable] : null; };
  // the names of feature i of layer L, best first: the visitor's language where the data has it, the default name, English
  W.nameCands = function (L, i, f = L.features[i], textProp) {
    const p = f.properties, spec = L.labels || L.gazetteer || {}, tp = textProp || [].concat(spec.text || 'name')[0];
    const nm = spec.names && p[spec.names], t = tableOf(L);
    return [W.lang && nm && nm[W.lang], t && t[i], p[tp], p.name, nm && nm.en].filter(x => x != null && x !== '');
  };
  // the display name: the first of nameCands; while Latin script is preferred (geo/script.js; owner, 2026-10-22) the first
  // in Latin script, so a ?lang= in another script (ru, uk, ar, zh ...) does not override the setting; null when none is
  W.nameOf = (L, i, f = L.features[i], textProp) => pickName(...W.nameCands(L, i, f, textProp));
  W.localName = (L, i, f = L.features[i]) => { const spec = L.labels || L.gazetteer || {}, v = f.properties[[].concat(spec.text || 'name')[0]] ?? f.properties.name ?? null; return latinPreferred() && !isLatin(v) ? null : v; };
  // the visitor's language gives way to Latin names: true while the setting is on and ?lang= is in another script
  W.langOverridden = () => !!W.lang && latinPreferred() && NONLATIN_LANGS.includes(W.lang);

  function addGaz(L) {
    const g = L.gazetteer, texts = [].concat(g.text || 'name');
    L.features.forEach((f, i) => {
      const p = f.properties, at = g.at ? [p[g.at[0]], p[g.at[1]]] : pointOf(f.geometry) || labelPoint(f.geometry); if (!at || !isFinite(at[0])) return;
      const all = texts.map(t => p[t]).filter(Boolean); const nm = g.names && p[g.names]; if (nm) all.push(...Object.values(nm));
      const rank = g.rank ? +p[g.rank] || 0 : 0;
      W.gaz.push({ L, i, kind: g.kind || L.id, lon: +at[0], lat: +at[1], texts: [...new Set(all.map(fold))].filter(Boolean), rank: g.rankLowFirst ? -rank : rank, prio: KIND_PRIO[g.kind] ?? 3 });
    });
  }
  // extra entries (region configs, the UK skeleton): { name, names?: [..], kind, lon, lat, rank?, prio?, country?, facts?, id? }
  W.addGazetteer = function (items) { for (const it of items) W.gaz.push({ ...it, texts: [...new Set([it.name, ...(it.names || [])].map(fold))].filter(Boolean), rank: it.rank || 0, prio: it.prio ?? KIND_PRIO[it.kind] ?? 3 }); };
  const KIND_PRIO = { model: 0, region: 4, country: 1, place: 2, sea: 5, lake: 5, river: 6 };

  // search: exact, then starts with, then a word starts with, then contains (3+ letters); ties by kind and rank
  W.search = function (q, limit = 10) {
    const f = fold(q); if (f.length < 2) return [];
    const out = [];
    for (const e of W.gaz) {
      let s = 0; for (const t of e.texts) { const v = t === f ? 100 : t.startsWith(f) ? 80 : (' ' + t).includes(' ' + f) || t.includes('-' + f) ? 60 : f.length >= 3 && t.includes(f) ? 30 : 0; if (v > s) s = v; }
      if (s) out.push({ e, s });
    }
    out.sort((a, b) => b.s - a.s || a.e.prio - b.e.prio || b.e.rank - a.e.rank);
    const seen = new Set(), res = [];
    for (const { e, s } of out) { const r = W.entry(e); if (!r.name) continue; const k = r.kind + '|' + r.name + '|' + Math.round(r.lon * 10) + ',' + Math.round(r.lat * 10); if (seen.has(k)) continue; seen.add(k); r.score = s; res.push(r); if (res.length >= limit) break; }
    return res;
  };
  // an entry as the API gives it: name (visitor's language), local name, kind, lon, lat, country, region, facts, wikidata
  W.entry = function (e) {
    if (!e.L) return { name: pickName(e.name), kind: e.kind, lon: e.lon, lat: e.lat, country: e.country || null, facts: e.facts || [], id: e.id || null, wikidata: e.wd || null, alt_m: e.alt_m, view: e.view };
    const f = e.L.features[e.i], p = f.properties, name = W.nameOf(e.L, e.i), local = W.localName(e.L, e.i);
    const r = { name, kind: e.kind, lon: e.lon, lat: e.lat, id: e.L.manifest.id + ':' + e.L.id + ':' + e.i, wikidata: p.wd || null };
    if (local && local !== name) r.local_name = local;
    if (p.a3) { const c = W.country(p.a3); r.country = c ? c.name : p.country || null; }
    if (p.adm1) r.region = p.adm1;
    r.facts = factsOf(e.L, f, r);
    return r;
  };
  // facts with sources for a card or an answer
  function factsOf(L, f, r) {
    const p = f.properties, src = (L.manifest.sources && Object.values(L.manifest.sources)[0]) || L.manifest.name, out = [];
    const add = (label, value, source = src) => { if (value != null && value !== '' && value !== 0) out.push({ label, value, source }); };
    if (L.gazetteer && L.gazetteer.kind === 'country') { add('Continent', p.cont); add('Region', p.sub); add('Population (estimate)', p.pop ? `${(+p.pop).toLocaleString('en')}${p.popYear ? ' (' + p.popYear + ')' : ''}` : null); add('ISO 3166 code', p.iso3 || p.iso2); add('Type', p.type); }
    else if (L.gazetteer && L.gazetteer.kind === 'place') { add('Country', r.country); add('Region', p.adm1); add('Population (largest estimate)', p.pop ? (+p.pop).toLocaleString('en') : null); add('Capital', p.cap === 2 ? 'national capital' : p.cap === 1 ? 'regional capital' : null); add('Time zone', p.tz); }
    else if (L.gazetteer && L.gazetteer.kind === 'region') { add('Type', p.type); add('ISO 3166-2 code', p.iso); add('Area', p.area ? `${(+p.area).toLocaleString('en')} km²` : null); }
    else { add('Kind', p.c); }
    for (const fx of L.facts || []) add(fx.label, p[fx.prop], fx.source || src);
    if (p.wd) out.push({ label: 'Wikidata', value: p.wd, source: 'Wikidata (CC0)', url: 'https://www.wikidata.org/wiki/' + p.wd });
    return out;
  }
  W.country = function (a3) { const lk = W.lookups.get('country'); if (!lk) return null; const L = lk.L, i = L.features.findIndex(f => f.properties[L.idProp || 'a3'] === a3); return i < 0 ? null : { name: W.nameOf(L, i), local_name: W.localName(L, i), i, L }; };

  // where is this point: { country, admin1, sea, lake } (names in the visitor's language), each with its feature
  W.where = function (lon, lat) {
    const out = {};
    for (const [kind, { L, idx }] of W.lookups) { const f = idx.find(lon, lat); if (f && W.nameOf(L, L.features.indexOf(f), f)) { const i = L.features.indexOf(f); out[kind] = { name: W.nameOf(L, i, f), local_name: W.localName(L, i, f), kind, wikidata: f.properties.wd || null, props: f.properties, i, layer: L.id }; } }
    if (!out.country && !out.sea && W.lookups.has('sea')) { const { L, idx } = W.lookups.get('sea'), n = idx.near(lon, lat, 400); if (n) { const i = L.features.indexOf(n.f); out.sea = { name: W.nameOf(L, i, n.f), kind: 'sea', near: true, dist_m: n.dist_m, props: n.f.properties, i, layer: L.id }; } }
    return out;
  };
  // the n nearest places (points layers marked nearest), with distance and bearing from the point
  W.nearestPlaces = function (lon, lat, n = 3, { maxKm = 2000, minPop = 0 } = {}) {
    const res = [];
    for (const it of W.nearest) { if (Math.abs(it.lat - lat) > maxKm / 111) continue; const pop = +it.f.properties.pop || 0; if (pop < minPop) continue;
      const d = surfaceDistance(lon, lat, it.lon, it.lat); if (d > maxKm * 1000) continue; res.push({ it, d }); }
    res.sort((a, b) => a.d - b.d);
    return res.filter(({ it }) => W.nameOf(it.L, it.i, it.f)).slice(0, n).map(({ it, d }) => ({ ...W.entry({ L: it.L, i: it.i, kind: 'place', lon: it.lon, lat: it.lat }), dist_m: Math.round(d), bearing_deg: Math.round(bearingDeg(lon, lat, it.lon, it.lat)), direction: compass(bearingDeg(lon, lat, it.lon, it.lat)) }));
  };

  // a globe view in words. v: { eye: {lon, lat, alt_m}, centre: {lon, lat} | null, heading_deg, tilt_deg, samples: [{lon, lat}] (ray hits
  // over the screen), inView(lon, lat) -> bool, time?: string, sun?: { altitude_deg }, maxItems }
  W.describe = function (v) {
    const { eye, centre } = v, maxItems = v.maxItems || 8, c = centre || { lon: eye.lon, lat: eye.lat };
    const at = W.where(c.lon, c.lat), below = W.where(eye.lon, eye.lat);
    const counts = new Map(), seas = new Map();
    for (const s of v.samples || []) { const w = W.where(s.lon, s.lat); if (w.country) counts.set(w.country.name, (counts.get(w.country.name) || 0) + 1); else if (w.sea) seas.set(w.sea.name, (seas.get(w.sea.name) || 0) + 1); }
    const countries = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, maxItems);
    const seaList = [...seas.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 4);
    // places in view: by population, at most maxItems, those the view can see (inView)
    const places = [];
    if (v.inView) { const cand = W.nearest.filter(it => v.inView(it.lon, it.lat) && W.nameOf(it.L, it.i, it.f)).sort((a, b) => (+b.f.properties.pop || 0) - (+a.f.properties.pop || 0)).slice(0, maxItems);
      for (const it of cand) { const d = surfaceDistance(c.lon, c.lat, it.lon, it.lat), b = bearingDeg(c.lon, c.lat, it.lon, it.lat);
        places.push({ ...W.entry({ L: it.L, i: it.i, kind: 'place', lon: it.lon, lat: it.lat }), dist_m: Math.round(d), bearing_deg: Math.round(b), direction: compass(b) }); } }
    const near = W.nearestPlaces(c.lon, c.lat, 3);
    const alt = eye.alt_m, hereWord = w => w.country ? `${w.admin1 ? w.admin1.name + ', ' : ''}${w.country.name}` : w.lake ? w.lake.name : w.sea ? (w.sea.near ? `open water near the ${w.sea.name}` : `the ${w.sea.name}`) : 'open water';
    const parts = [];
    parts.push(`Globe view from ${fmtDist(alt)} above ${hereWord(below)} (${fmtLatLon(eye.lat, eye.lon)}).`);
    if (centre) parts.push(`At the centre of the view: ${hereWord(at)}${near[0] ? `; the nearest place is ${near[0].name}${near[0].country ? ' (' + near[0].country + ')' : ''}, ${fmtDist(near[0].dist_m)} ${near[0].direction}` : ''}.`);
    else parts.push('The centre of the view is sky or space.');
    if (countries.length) parts.push(`Countries in view: ${countries.join(', ')}${counts.size > countries.length ? ` and ${counts.size - countries.length} more` : ''}.`);
    if (seaList.length) parts.push(`Water in view: ${seaList.join(', ')}.`);
    if (places.length) parts.push(`Large places in view: ${places.slice(0, 6).map(p => p.name).join(', ')}.`);
    if (v.heading_deg != null) parts.push(`Facing ${compass(v.heading_deg)} (${Math.round(v.heading_deg)}°)${v.tilt_deg != null ? `, tilted ${Math.round(v.tilt_deg)}° from straight down` : ''}.`);
    if (v.time) parts.push(`Page time ${v.time}${v.sun ? `; the sun is ${v.sun.altitude_deg > 0 ? Math.round(v.sun.altitude_deg) + '° up' : 'down'} at the centre` : ''}.`);
    return { mode: 'globe', describe_version: WORLD_VERSION, text: parts.join(' '), eye, centre: centre ? { ...c, country: at.country?.name || null, region: at.admin1?.name || null, sea: at.sea?.name || null, lake: at.lake?.name || null } : null,
      below: { country: below.country?.name || null, region: below.admin1?.name || null, sea: below.sea?.name || null }, countries_in_view: countries, water_in_view: seaList, places_in_view: places, nearest: near, heading_deg: v.heading_deg, tilt_deg: v.tilt_deg };
  };
  return W;
}

// a label point for a polygon or line feature with none given: the middle of the largest outer ring's box
export function labelPoint(g) {
  let best = null, ba = -1;
  for (const p of polysOf(g)) { const b = ringsBox([p]), a = (b[2] - b[0]) * (b[3] - b[1]); if (a > ba) { ba = a; best = b; } }
  if (best) return [(best[0] + best[2]) / 2, (best[1] + best[3]) / 2];
  const ls = linesOf(g); if (ls.length) { const l = ls.reduce((a, b) => b.length > a.length ? b : a); return l[Math.floor(l.length / 2)]; }
  return null;
}
