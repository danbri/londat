// A "skeleton" data set (format skeleton-1, read by docklands/geo/skeleton.js; the first is the UK skeleton of KR2.7,
// cwplans/docklands/data/uk/) drawn on the globe through the globe's layer contract (globe.js addCellLayer,
// addSearchProvider, addWhereProvider): its layers streamed by view cell and level of detail, its gazetteer in the search
// (near the view), its place cards, and its "where am I" answer in the readout and the descriptions. Generic: the style
// table is keyed by layer kinds (roads, rail, rivers ...), not by place; a layer with an unknown id gets a plain style.
// Skill: docklands-3d-page, "Three.js port: globe and world skeleton (2026-10-13)"; data contract: skill cwplans-uk-skeleton.
import { openSkeleton } from '../geo/skeleton.js';

// eye altitude (m) -> the data level: 3 national, 6 regional, 8 city (skeleton.js levelForSpan by the view's span)
const LEVELS = [[1.2e5, 8], [8e5, 6], [Infinity, 3]];
// style by layer id: colour, opacity, the highest eye altitude it shows at; polygons drawn as outlines unless draw: false
const STYLE = {
  boundaries: { color: '#e6c48a', opacity: 0.7, maxAlt: 2.5e6 },
  roads: { color: '#ff9c4a', opacity: 0.9, maxAlt: 2.5e6 },
  rail: { color: '#c7a6ff', opacity: 0.8, maxAlt: 6e5 },
  rivers: { color: '#6fc0ff', opacity: 0.9, maxAlt: 8e5 },
  lakes: { color: '#6fc0ff', opacity: 0.9, maxAlt: 6e5 },
  'built-up': { color: '#ff8fb0', opacity: 0.6, maxAlt: 4e5 },
  'national-parks': { color: '#7fe08a', opacity: 0.8, maxAlt: 2.5e6 },
  landscapes: { color: '#b9e6a0', opacity: 0.55, maxAlt: 8e5 },
  countries: { draw: false }, regions: { draw: false }, counties: { draw: false }, districts: { draw: false },
  places: { maxAlt: 4e6 }, stations: { maxAlt: 1.5e5 },
};
// labels of point layers: the web-map zoom from which a place shows, and its order (smaller first)
const PLACE_Z = { city: 4.5, town: 7, village: 9.5, suburb: 10, settlement: 10.5 }, PLACE_R = { city: 0, town: 1, village: 3, suburb: 3, settlement: 4 };
const KIND_ALT = { city: 40000, town: 15000, village: 6000, suburb: 5000, 'postcode district': 8000, 'hill or mountain': 9000, 'hills or mountain range': 60000, river: 30000, island: 30000 };

// ?archive=1 (a test flag, off by default): read the set from one ZIP next to its folder (`<base>.zip`, e.g. data/uk.zip),
// or ?archive=<url> from that archive, by HTTP range requests (docklands/geo/range-archive.js; packer
// cwplans/tools/pack-range-archive.mjs; study docs/hosting-options.md). If the archive cannot be opened, the files are read.
async function archiveReader(base) {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('archive') : null;
  if (!q || q === '0') return null;
  const url = q === '1' ? base.replace(/\/+$/, '') + '.zip' : new URL(q, location.href).href;
  try {
    const { openRangeArchive, archiveFetchJson } = await import('../geo/range-archive.js');
    const ar = await openRangeArchive(url);
    (globalThis.__rangeArchives || (globalThis.__rangeArchives = [])).push(ar);   // stats for tests (docklands/test/archive-check.mjs)
    return archiveFetchJson(ar, base);
  } catch (e) { console.warn('skeleton: archive not read, reading files', url, e.message); return null; }
}

export async function addSkeleton(G, base, { fetchJson } = {}) {
  if (!fetchJson) fetchJson = await archiveReader(base);
  const sk = await openSkeleton(base, fetchJson ? { fetchJson } : {}), M = sk.manifest, [bw, bs, be, bn] = M.bbox || [-180, -90, 180, 90];
  const inside = (lon, lat) => lon >= bw && lon <= be && lat >= bs && lat <= bn;
  const credit = typeof M.credits === 'string' ? M.credits : (M.credits && M.credits.text) || '';
  for (const L of M.layers) {
    const st = { ...(STYLE[L.id] || { color: '#dddddd', opacity: 0.7, maxAlt: 1e6 }) }; if (st.draw === false) continue;
    const point = /Point/.test(L.geometry || '');
    G.addCellLayer({ id: (M.id || 'skeleton') + ':' + L.id, label: `${L.title || L.id} (${M.name || M.id})`, kind: point ? 'points' : /Polygon/.test(L.geometry || '') ? 'polygons' : 'lines', style: st, levels: LEVELS,
      labels: point ? { text: 'name', class: L.id === 'stations' ? 'extra' : 'place', minZoom: p => L.id === 'stations' ? 11 : PLACE_Z[p.kind] ?? 10, rank: p => L.id === 'stations' ? 6 : PLACE_R[p.kind] ?? 4 } : null,
      // a feature belongs to the view cell that holds the middle of its bbox (lines come in pieces per cell, polygons whole)
      query: async (bbox, level) => (await sk.features(L.id, bbox, level)).filter(f => { const b = f.bbox, x = (b[0] + b[2]) / 2, y = (b[1] + b[3]) / 2; return x >= bbox[0] && x < bbox[2] && y >= bbox[1] && y < bbox[3]; }),
      entry: f => ({ name: f.properties.name, kind: f.properties.kind || L.id, facts: [{ label: 'Kind', value: f.properties.kind || L.title || L.id, source: credit.split('.')[0] }], text: sk.describe(f, L.id), more: f.properties.wd ? () => card({ wd: f.properties.wd, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }) : null }),
    });
  }
  // place cards: Wikidata facts with their source and date
  async function card(hit) {
    const c = await sk.card(hit).catch(() => null); if (!c) return null;
    const facts = (c.facts || []).map(f => ({ label: f.p, value: typeof f.v === 'number' ? f.v.toLocaleString('en') : f.v, source: `${f.src === 'wikidata' ? 'Wikidata (CC0)' : f.src}${f.retrieved ? ', ' + f.retrieved : ''}` }));
    if (c.description) facts.unshift({ label: 'About', value: c.description, source: 'Wikidata (CC0)' });
    if (c.parent) facts.push({ label: 'Part of', value: c.parent.name, source: 'Wikidata (CC0)' });
    for (const [k, u] of Object.entries(c.links || {})) if (/^(wikidata|wikipedia|website)$/.test(k)) facts.push({ label: k[0].toUpperCase() + k.slice(1), value: u.replace(/^https?:\/\//, '').slice(0, 60), url: u, source: k === 'website' ? 'Wikidata (CC0)' : k });
    return facts;
  }
  // search: the gazetteer, near the view (so a name that many places share finds the one in view first)
  G.addSearchProvider(async (q, n, near) => (await sk.search(q, { limit: n, near })).map(h => ({
    name: h.name, local_name: h.alt || undefined, kind: h.kindLabel, lon: h.lon, lat: h.lat, region: h.la || undefined, country: undefined, id: (M.id || 'skeleton') + ':' + (h.id ?? h.wd ?? h.name), wikidata: h.wd,
    score: Math.floor(h.score / 1e6) === 3 ? 100 : Math.floor(h.score / 1e6) === 2 ? 80 : 60, alt_m: KIND_ALT[h.kindLabel] ?? 8000, set: M.id,
    facts: [{ label: 'Kind', value: h.kindLabel, source: 'gazetteer (' + (M.name || M.id) + ')' }, ...(h.population ? [{ label: 'Population', value: h.population.toLocaleString('en'), source: 'Wikidata (CC0)' }] : [])],
    more: h.wd ? () => card(h) : null })));
  // where am I: country, region, county, district, national park, landscape, built-up area and the nearest place
  G.addWhereProvider(async (lon, lat) => {
    if (!inside(lon, lat)) return {};
    const w = await sk.whereAmI(lon, lat), nm = k => w[k] && w[k].name ? w[k].name : null, out = {};
    for (const k of ['country', 'region', 'county', 'district', 'nationalPark', 'landscape', 'builtUp']) if (nm(k)) out[k] = nm(k);
    if (w.nearest) out.nearest = { name: w.nearest.name, kind: w.nearest.kind, dist_m: w.nearest.distanceM };
    if (Object.keys(out).length) out.source = M.name || M.id;
    return out;
  });
  return sk;
}
