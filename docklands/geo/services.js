// The live services that apply to the view (OKR KR1.5, issue https://github.com/danbri/londat/issues/12; architecture
// rule 1: no locale constant in the core). The readout, describeView and the page API show only live data of the place in
// view: a METAR station near it, Open-Meteo at its point, the water level and current only where a region config names a
// water service. Every station id, point and water service comes from the region configs (docklands/geo/regions/,
// `services`); none is written here. Plain ES module, browser and node. Tests: docklands/geo/test/services.test.mjs.
//
//   metarIds(regions) -> ['EGLC', 'EIDW', ...]: every METAR station that a region config names (services.metar, and
//     services.metarStations for a large region such as the UK); the 5-minute job (cwplans/tools/fetch-live-cache.mjs)
//     asks the NOAA Aviation Weather Center for these in one request
//   siteAt(view, { regions, model }) -> site | null
//     view: { mode: 'model' } or { mode: 'globe', lon, lat, range } (the orbit of the globe)
//     model: the model's region (geo/current.js REGION)
//     site: { key, region (id | null), name, point {lon, lat} (Open-Meteo), metar (station id | null: null = the nearest
//             station of the list within METAR_KM, chosen by pickStation once the station positions are known),
//             water (services.water of the region | null), home (true: the model's own services apply: its station, its
//             hourly cache and snapshot files, its METAR archive) }
//     null: no place (the globe from higher than SITE_RANGE_M): no live weather is shown.
//   pickStation(site, stations) -> { id, name, lat, lon, dist_km } | null: the site's own station when it has one, else the
//     nearest station within METAR_KM of the site's point. stations: [{ id, name, lat, lon }]
import { regionExtent } from './zone.js';

export const SITE_RANGE_M = 300000;   // above this orbit range the view is a country or the planet: no local live data
export const METAR_KM = 50;           // a METAR station farther than this from the view does not describe it
export const HOME_KM = 30;            // a view this close to the model's weather point (same station) uses the model's files
const D2R = Math.PI / 180, SMALL_KM2 = 10000;
const km = (lon1, lat1, lon2, lat2) => { const a = Math.sin((lat2 - lat1) * D2R / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin((lon2 - lon1) * D2R / 2) ** 2; return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(a))); };
const inBox = (b, lon, lat) => lat >= b[1] && lat <= b[3] && (b[0] <= b[2] ? lon >= b[0] && lon <= b[2] : lon >= b[0] || lon <= b[2]);
const boxKm2 = b => Math.abs((b[2] - b[0]) * (b[3] - b[1])) * 111 * 111 * Math.cos((b[1] + b[3]) / 2 * D2R);
export { km as distanceKm };

export function metarIds(regions) {
  const out = new Set();
  for (const r of Object.values(regions || {})) { const s = r.services || {}; if (s.metar) out.add(s.metar); for (const id of s.metarStations || []) out.add(id); }
  return [...out].filter(id => /^[A-Z0-9]{4}$/.test(id)).sort();
}

// the region whose place (its extent) or small bbox holds the point: the smallest such (the model box inside Greater
// London names the model). A large region (a country skeleton, a lite set over a whole country) is not a place here: its
// one station would not describe every town in it.
function placeRegion(R, lon, lat) {
  return R.map(r => ({ r, b: r.place && r.place.kind !== 'lite' ? regionExtent(r) : boxKm2(r.bbox) <= SMALL_KM2 ? r.bbox : null }))
    .filter(x => x.b && boxKm2(x.b) <= SMALL_KM2 * 4 && inBox(x.b, lon, lat)).sort((a, b) => boxKm2(a.b) - boxKm2(b.b))[0]?.r || null;
}

export function siteAt(view, { regions = {}, model } = {}) {
  const R = Object.values(regions || {}), ms = (model && model.services) || {};
  const ofRegion = (r, how) => { const s = r.services || {}, p = s.weatherPoint || { lon: r.origin.lon, lat: r.origin.lat };
    return { key: 'region:' + r.id, region: r.id, name: r.name, point: { lon: p.lon, lat: p.lat }, metar: s.metar || null, water: s.water || null, how,
      home: !!model && (r.id === model.id || (!!s.metar && s.metar === ms.metar && !!ms.weatherPoint && km(p.lon, p.lat, ms.weatherPoint.lon, ms.weatherPoint.lat) <= HOME_KM)) }; };
  if (!view || view.mode !== 'globe') return model ? ofRegion(model, 'the model') : null;
  const { lon, lat, range } = view;
  if (!isFinite(lon) || !isFinite(lat) || (range != null && range > SITE_RANGE_M)) return null;
  const r = placeRegion(R, lon, lat);
  if (r) return ofRegion(r, `the region config of ${r.name}`);
  // no place: the centre of the view, rounded to 0.1 degree (one Open-Meteo request serves a small area; its grid is
  // coarser), and the nearest METAR station of the list
  const q = v => Math.round(v * 10) / 10;
  return { key: `point:${q(lon)},${q(lat)}`, region: null, name: null, point: { lon: q(lon), lat: q(lat) }, metar: null, water: null, home: false, how: 'the centre of the view' };
}

export function pickStation(site, stations = []) {
  if (!site) return null;
  const S = stations.filter(s => s && s.id && isFinite(s.lat) && isFinite(s.lon)), d = s => km(site.point.lon, site.point.lat, s.lon, s.lat);
  if (site.metar) { const s = S.find(x => x.id === site.metar); return s ? { ...s, dist_km: Math.round(d(s)) } : { id: site.metar, name: null, lat: null, lon: null, dist_km: null }; }
  let best = null, bd = METAR_KM;
  for (const s of S) { const v = d(s); if (v <= bd) { bd = v; best = s; } }
  return best ? { ...best, dist_km: Math.round(bd) } : null;
}
