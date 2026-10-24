// Skeleton reader: national and world "skeleton" vector data cut by the worldwide geodetic quadtree (OKR KR2.7). Plain ES
// module, no dependencies, no three.js, no place constants: the browser (docklands/) and node (tools, tests) import it.
// The data and its manifest are made by a builder per region (the UK: cwplans/tools/build-uk-skeleton.mjs, output
// cwplans/docklands/data/uk/manifest.json; contract: cwplans/docklands/data/uk/README.md, skill cwplans-uk-skeleton).
//
// Cells (docs/planet-architecture.md, "Cell scheme"): level L cells are 180 / 2^L degrees square; level 0 has 2 cells
// (x 0 and 1, y 0). x = floor((lon + 180) / size), y = floor((lat + 90) / size): y counts from the SOUTH, as the
// region bounding volumes of 3D Tiles 1.1 implicit tiling. A file is one (layer, level, cell).
//
//   const sk = await openSkeleton('https://danbri.github.io/londat/cwplans/docklands/data/uk/');
//   await sk.features('roads', [w, s, e, n], 8)   -> GeoJSON Features (WGS84 lon, lat), each with .bbox and .properties
//   await sk.search('Leeds', { limit: 10, near: [lon, lat] })  -> gazetteer hits, best first
//   await sk.card(hit)                             -> facts with source and date (Wikidata, ONS), or null
//   await sk.whereAmI(lon, lat)                    -> { country, region, county, district, nationalPark, landscape, builtUp, nearest }
//   sk.describe(feature, layerId)                  -> one plain sentence for a screen reader
//   levelForSpan(degrees)                          -> the data level for a view that spans that many degrees
//
// Polygons are whole (never clipped): a polygon is stored in the cell of its bbox centre and the manifest gives each
// file's real bbox, so a query reads every file whose bbox meets the view. Lines are clipped at cell edges (a piece per
// cell; properties repeated). Points are in the cell that holds them.

import { latinPreferred, isLatin, pickName, scrubText } from './script.js';

export const cellSize = level => 180 / 2 ** level;
export function cellOf(level, lon, lat) {
  const s = cellSize(level), nx = 2 ** (level + 1), ny = 2 ** level;
  return [Math.min(nx - 1, Math.max(0, Math.floor((lon + 180) / s))), Math.min(ny - 1, Math.max(0, Math.floor((lat + 90) / s)))];
}
export function cellBbox(level, x, y) { const s = cellSize(level); return [-180 + x * s, -90 + y * s, -180 + (x + 1) * s, -90 + (y + 1) * s]; }
export function cellsIn(level, [w, s, e, n]) {
  const [x0, y0] = cellOf(level, w, s), [x1, y1] = cellOf(level, e, n), out = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([x, y]);
  return out;
}
export const bboxMeets = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
// the data level for a view of a given span (degrees of latitude across the screen): national, regional, city
export const levelForSpan = span => span > 6 ? 3 : span > 1.2 ? 6 : 8;

// Name folding for search: no accents, lower case, '&' as 'and', apostrophes dropped, other marks as spaces.
export function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
// the gazetteer file key of a folded name: its first two letters or digits (spaces skipped), padded with '_'
export const gazKey = folded => (folded.replace(/ /g, '') + '__').slice(0, 2);

// point in polygon (GeoJSON Polygon or MultiPolygon coordinates; even-odd over all rings)
function inRing(p, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
export function pointInGeometry(p, g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.some(rings => rings.reduce((inside, r) => inRing(p, r) ? !inside : inside, false));
}
// great-circle distance in metres (mean radius; enough for ranking and "x km from")
export function distanceM(a, b) {
  const R = 6371008.8, r = Math.PI / 180, dl = (b[1] - a[1]) * r, dn = (b[0] - a[0]) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// 'skeleton-1' files: integer coordinates (degrees x q), delta-coded within each line or ring -> GeoJSON features
export function unpack(file) {
  if (file.format !== 'skeleton-1') return file;
  const q = file.q, line = d => { const out = new Array(d.length / 2); let x = 0, y = 0; for (let i = 0; i < d.length; i += 2) { x += d[i]; y += d[i + 1]; out[i / 2] = [x / q, y / q]; } return out; };
  return { type: 'FeatureCollection', features: file.features.map(f => {
    const { type, d } = f.geometry, coordinates = type === 'Point' ? [d[0] / q, d[1] / q] : type === 'LineString' ? line(d) : type === 'Polygon' ? d.map(line) : d.map(p => p.map(line));
    let bbox = f.bbox;
    if (!bbox) { if (type === 'Point') bbox = [...coordinates, ...coordinates]; else { bbox = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [x, y] of type === 'LineString' ? coordinates : type === 'Polygon' ? coordinates[0] : coordinates.flatMap(p => p[0])) { if (x < bbox[0]) bbox[0] = x; if (y < bbox[1]) bbox[1] = y; if (x > bbox[2]) bbox[2] = x; if (y > bbox[3]) bbox[3] = y; } } }
    return { type: 'Feature', id: f.id, bbox, properties: f.properties, geometry: { type, coordinates } };
  }) };
}

// properties with their name in Latin script while that is preferred (script.js): the Latin one of name, name_en, alt, else
// no name (a template part with {name} is then left out)
function latinProps(P) {
  if (!latinPreferred() || isLatin(P.name)) return P;
  const n = pickName(P.name_en, P.alt, P.name_alt), out = { ...P }; if (n) out.name = n; else delete out.name; return out;
}

const defaultFetchJson = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };

export async function openSkeleton(base, { fetchJson = defaultFetchJson, manifest = null } = {}) {
  const root = base.endsWith('/') ? base : base + '/';
  const M = manifest || await fetchJson(root + 'manifest.json');
  // the files read and the layers decoded, least recently used first out (moglob, 2026-10-23: both grew for the whole
  // session as the view moved over the UK; a layer file is now kept only in its decoded form)
  const lru = (cap) => { const m = new Map(); return { get(k) { const v = m.get(k); if (v !== undefined) { m.delete(k); m.set(k, v); } return v; }, set(k, v) { m.set(k, v); while (m.size > cap) m.delete(m.keys().next().value); }, delete: k => m.delete(k), get size() { return m.size; } }; };
  const cache = lru(24), decoded = lru(24);
  const load = path => { let v = cache.get(path); if (!v) { v = fetchJson(root + path).catch(e => { cache.delete(path); throw e; }); cache.set(path, v); } return v; };
  const loadLayer = path => { let v = decoded.get(path); if (!v) { v = fetchJson(root + path).then(unpack).catch(e => { decoded.delete(path); throw e; }); decoded.set(path, v); } return v; };
  const layer = id => { const L = M.layers.find(l => l.id === id); if (!L) throw new Error(`no layer ${id}`); return L; };
  // the layer's own level for a wanted level: the finest at or below it, else its coarsest
  const levelOf = (L, want) => { const ls = L.levels.map(v => v.level).sort((a, b) => a - b); return L.levels.find(v => v.level === (ls.filter(l => l <= want).pop() ?? ls[0])); };

  async function features(id, bbox, level = 8) {
    const L = layer(id), lv = levelOf(L, level), files = lv.files.filter(f => bboxMeets(f.bbox, bbox));
    const out = [], seen = new Set();
    for (const fc of await Promise.all(files.map(f => loadLayer(f.path)))) for (const f of fc.features) {
      if (!bboxMeets(f.bbox, bbox)) continue;
      const key = f.id ?? null; if (key != null) { if (seen.has(key)) continue; seen.add(key); }
      out.push(f);
    }
    return out;
  }

  const G = M.gazetteer, KR = G.kindRank || {}, pre = G.prefixes?.length ? new RegExp(`^(${G.prefixes.map(fold).join('|')}) `) : null;
  async function search(query, { limit = 10, near = null, kinds = null } = {}) {
    const q = fold(query); if (!q) return [];
    const k = gazKey(q), keys = q.replace(/ /g, '').length >= 2 ? (G.files[k] ? [k] : []) : Object.keys(G.files).filter(x => x[0] === k[0]);
    const hits = [];
    for (const file of await Promise.all(keys.map(x => load(G.files[x].path)))) {
      const la = file.la || [];
      for (const e of file.entries) {
        const [name, alt, kind, lon, lat, lai, id, wd, pop] = e;
        if (kinds && !kinds.includes(kind)) continue;
        let best = 0;
        for (const n of [name, alt]) {
          if (!n) continue; const f = fold(n), g = pre ? f.replace(pre, '') : f;
          const s = f === q || g === q ? 3 : f.startsWith(q) || g.startsWith(q) ? 2 : (' ' + f).includes(' ' + q) ? 1 : 0; if (s > best) best = s;
        }
        if (!best) continue;
        // names in Latin script only while that is preferred (script.js; owner, 2026-10-22): the Latin one of name and alt,
        // else the entry is left out (a Cyrillic query still finds a place by its other name, shown in Latin)
        const shown = pickName(name, alt); if (!shown) continue;
        const other = shown === name ? alt : name, alt2 = other && (!latinPreferred() || isLatin(other)) ? other : null;
        hits.push({ name: shown, alt: alt2, kind, kindLabel: G.kinds[kind] || kind, lon, lat, la: la[lai] || null, id, wd: wd || null, population: pop || null,
          score: best * 1e6 + (KR[kind] ?? 0) * 1e4 + Math.min(9999, Math.log10(1 + (pop || 0)) * 1000) - (near ? Math.min(9999, distanceM(near, [lon, lat]) / 1000) : 0) });
      }
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  }

  async function card(hit) {
    if (!hit || !hit.wd || !M.cards) return null;
    const [x, y] = cellOf(M.cards.level, hit.lon, hit.lat), f = M.cards.files[`${x}-${y}`];
    const tryFile = async path => (await load(path)).cards[hit.wd] || null;
    if (f) { const c = await tryFile(f.path); if (c) return c; }
    // the card sits in the cell of the Wikidata point, which may differ from the gazetteer point: look next door
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
      const g = M.cards.files[`${x + dx}-${y + dy}`]; if (g) { const c = await tryFile(g.path); if (c) return c; }
    }
    return null;
  }

  async function whereAmI(lon, lat) {
    const p = [lon, lat], b = [lon, lat, lon, lat], out = {};
    const pick = async (id, level, key) => {
      if (!M.layers.some(l => l.id === id)) return;
      const f = (await features(id, b, level)).find(f => pointInGeometry(p, f.geometry)); if (f) out[key] = latinProps(f.properties);
    };
    await pick('countries', 6, 'country'); await pick('regions', 6, 'region'); await pick('counties', 8, 'county'); await pick('districts', 8, 'district');
    await pick('national-parks', 8, 'nationalPark'); await pick('landscapes', 8, 'landscape'); await pick('built-up', 8, 'builtUp');
    if (M.layers.some(l => l.id === 'places')) {
      const r = 0.25, near = await features('places', [lon - r * 1.6, lat - r, lon + r * 1.6, lat + r], 8);
      let best = null; for (const f of near) { if (!pickName(f.properties.name)) continue; const d = distanceM(p, f.geometry.coordinates); if (!best || d < best.d) best = { d, f }; }
      if (best) out.nearest = { ...best.f.properties, distanceM: Math.round(best.d), lon: best.f.geometry.coordinates[0], lat: best.f.geometry.coordinates[1] };
    }
    return out;
  }

  // one sentence per feature, from the layer's template in the manifest: {key} from the properties (numbers grouped in
  // thousands); a [bracketed part] is left out when a key in it has no value
  function describe(f, id) {
    const L = layer(id), P = latinProps(f.properties || {}), has = k => P[k] != null && P[k] !== '';
    const val = k => typeof P[k] === 'number' && P[k] >= 10000 ? String(P[k]).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : String(P[k]);
    const t = (L.describe || '{name}').replace(/\[([^\]]*)\]/g, (_, part) => [...part.matchAll(/\{(\w+)\}/g)].every(m => has(m[1])) ? part : '')
      .replace(/\{(\w+)\}/g, (_, k) => has(k) ? val(k) : '');
    return scrubText(t.replace(/\(\s*\)/g, '').replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').replace(/,\s*\./g, '.').trim());
  }

  return { manifest: M, features, search, card, whereAmI, describe, levelOf: (id, want) => levelOf(layer(id), want).level };
}
