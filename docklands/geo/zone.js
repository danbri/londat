// The time zone of a point on Earth, for the page clock (OKR KR1.2, KR1.1; architecture rule 1: no locale constant in the
// core). Locale-free: zones come from the region configs (docklands/geo/regions/), from the Natural Earth populated places
// (public domain; their IANA "tz" in cwplans/docklands/data/world/places.json, already on the globe) and from Intl. No
// table of zone rules and no new data file. Plain ES module, browser and node. Tests: docklands/geo/test/zone.test.mjs.
//
//   zoneAt(lon, lat, { regions, world, a3 }) -> { timeZone, source, approximate, method, region?, locale? }
//     1. a region with a 3D place whose surroundings square holds the point (León, Sarajevo ...): its timeZone, exact
//     2. a small region whose bbox holds the point (the Docklands model box): its timeZone, exact
//     3. the world (worldZones over the Natural Earth places): the nearest place of the same country (a3 from the country
//        polygons), else the nearest place within 300 km; approximate when a town of another zone of that country is near
//     4. a large region whose bbox holds the point (the UK skeleton): its timeZone, approximate (a bbox is not a border)
//     5. the nautical zone of the longitude (15 degree bands, Etc/GMT-n): approximate; at sea this is the legal one
// Skill: docklands-sky, "Place-aware page clock".
import { wallParts, offsetMs } from './clock.js';

const D2R = Math.PI / 180, R = 6371008.8;
const km = (lon1, lat1, lon2, lat2) => { const a = Math.sin((lat2 - lat1) * D2R / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin((lon2 - lon1) * D2R / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(a))) / 1000; };

// is tz a time zone that Intl knows (IANA name or an Etc/ zone)?
export function validZone(tz) { if (typeof tz !== 'string' || !tz) return false; try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }
// a ?tz= value: an IANA name, "UTC", or a whole-hour offset "UTC+2" / "+02:00" / "-5" -> the zone name, else null
export function parseZone(s) {
  s = String(s ?? '').trim(); if (!s) return null;
  const m = /^(?:UTC|GMT)?\s*([+-])(\d{1,2})(?::?00)?$/i.exec(s);
  if (m) { const h = +m[2]; if (h > 14) return null; return h === 0 ? 'UTC' : `Etc/GMT${m[1] === '+' ? '-' : '+'}${h}`; }
  if (/^(UTC|GMT|Z)$/i.test(s)) return 'UTC';
  return validZone(s) ? s : null;
}
// the nautical zone of a longitude: whole hours, 15 degree bands centred on multiples of 15 (Etc/GMT signs are inverted)
export function solarZone(lon) {
  const h = Math.max(-12, Math.min(12, Math.round((((lon + 180) % 360 + 360) % 360 - 180) / 15)));
  return h === 0 ? 'UTC' : `Etc/GMT${h > 0 ? '-' : '+'}${Math.abs(h)}`;
}

// the offset of tz at t as text: "UTC+1", "UTC+5:30", "UTC" (Intl only)
export function offsetText(t, tz) {
  const m = Math.round(offsetMs(t, tz) / 6e4), a = Math.abs(m);
  return m === 0 ? 'UTC' : `UTC${m < 0 ? '−' : '+'}${Math.floor(a / 60)}${a % 60 ? ':' + String(a % 60).padStart(2, '0') : ''}`;
}
// the zone's short name at t ("BST", "CEST", "EDT") in the first of the locales that has one; else the offset text
export function zoneAbbr(t, tz, locales = []) {
  for (const l of [...locales, undefined]) {
    try { const v = new Intl.DateTimeFormat(l, { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(t)).find(p => p.type === 'timeZoneName')?.value;
      if (v && (!/^(GMT|UTC)\s*([+-−]|$)/.test(v) || (v === 'GMT' && offsetMs(t, tz) === 0))) return v; } catch { /* bad locale */ }   // "GMT" is a name only at offset 0
  }
  return offsetText(t, tz);
}
// "CEST (UTC+2)", "BST (UTC+1)", "UTC+1"
export function zoneLabel(t, tz, locales = []) { const a = zoneAbbr(t, tz, locales), o = offsetText(t, tz); return a === o ? o : `${a} (${o})`; }
// everything a clock label needs for the instant t in zone tz
export function zoneTime(t, tz, locales = []) {
  const p = wallParts(t, tz), p2 = n => String(n).padStart(2, '0');
  return { time_zone: tz, abbreviation: zoneAbbr(t, tz, locales), utc_offset: offsetText(t, tz), offset_min: Math.round(offsetMs(t, tz) / 6e4),
    wall_clock: `${p.year}-${p2(p.month)}-${p2(p.day)}T${p2(p.hour)}:${p2(p.minute)}`, iso: new Date(t).toISOString() };
}

// the area of a region in which its zone is taken as exact: the surroundings square of its 3D place, else the city bbox,
// else the bbox. [w, s, e, n]
export function regionExtent(r) {
  const P = r.place, o = r.origin;
  if (P && (P.surround?.size_m || P.size_m)) { const h = (P.surround?.size_m || P.size_m) / 2, dl = h / 111320 / Math.cos(o.lat * D2R), db = h / 110574;
    return [o.lon - dl, o.lat - db, o.lon + dl, o.lat + db]; }
  return P?.city?.bbox || r.bbox;
}
const inBox = (b, lon, lat) => lat >= b[1] && lat <= b[3] && (b[0] <= b[2] ? lon >= b[0] && lon <= b[2] : lon >= b[0] || lon <= b[2]);
const boxKm2 = b => Math.abs((b[2] - b[0]) * (b[3] - b[1])) * 111 * 111 * Math.cos((b[1] + b[3]) / 2 * D2R);
const SMALL_KM2 = 10000;   // a region bbox smaller than this (100 km x 100 km) is a place; a larger one is a country skeleton

// the world's zones: points { lon, lat, a3, tz } (the Natural Earth places that have a tz) in 5 degree cells
export function worldZones(points) {
  const grid = new Map(), byA3 = new Map(), key = (i, j) => i * 1000 + j, cell = (lon, lat) => [Math.floor((lon + 180) / 5), Math.floor((lat + 90) / 5)];
  for (const p of points) { if (!p.tz || !validZone(p.tz)) continue; const [i, j] = cell(p.lon, p.lat), k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p);
    if (p.a3) { if (!byA3.has(p.a3)) byA3.set(p.a3, new Set()); byA3.get(p.a3).add(p.tz); } }
  // the nearest point within maxKm (of country a3 when given; not in zone notTz when given), by rings of cells
  function nearest(lon, lat, a3 = null, maxKm = 300, notTz = null) {
    const [ci, cj] = cell(lon, lat); let best = null, bd = maxKm;
    const rings = Math.ceil(maxKm / (5 * 111 * Math.max(0.15, Math.cos(Math.min(85, Math.abs(lat)) * D2R)))) + 1;
    for (let r = 0; r <= Math.min(rings, 36); r++) {
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) { if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || j < 0 || j > 35) continue;
        for (const p of grid.get(key(((i % 72) + 72) % 72, j)) || []) { if ((a3 && p.a3 !== a3) || (notTz && p.tz === notTz)) continue; const d = km(lon, lat, p.lon, p.lat); if (d < bd) { bd = d; best = p; } } }
      if (best && (r + 1) * 5 * 111 * Math.max(0.15, Math.cos(Math.min(85, Math.abs(lat)) * D2R)) > bd + 600) break;   // later rings are farther than the best
    }
    return best ? { ...best, dist_km: Math.round(bd) } : null;
  }
  return { nearest, zonesOf: a3 => [...(byA3.get(a3) || [])], size: points.length };
}

// the zone at a point (see the header). regions: region configs (objects or region() values); world: worldZones() or
// null (not loaded yet); a3: the country at the point (ISO 3166 alpha-3 of the Natural Earth country polygons) or null
export function zoneAt(lon, lat, { regions = [], world = null, a3 = null } = {}) {
  const R = Object.values(regions || {});
  const out = (timeZone, source, approximate, method, r) => ({ timeZone, source, approximate, method, ...(r ? { region: r.id, locale: r.locale, name: r.name } : {}) });
  for (const r of R) if (r.place && inBox(regionExtent(r), lon, lat)) return out(r.timeZone, 'region:' + r.id, false, `the region config of ${r.name}`, r);
  const small = R.filter(r => !r.place && boxKm2(r.bbox) <= SMALL_KM2).find(r => inBox(r.bbox, lon, lat));
  if (small) return out(small.timeZone, 'region:' + small.id, false, `the region config of ${small.name}`, small);
  if (world) {
    const p = (a3 && world.nearest(lon, lat, a3, 2500)) || world.nearest(lon, lat, null, 300);
    // approximate: no country under the point, or a town of the same country in another zone is not much farther (a
    // zone border may lie between): within 3 times the distance, at least 300 km
    if (p) { const other = p.a3 && world.zonesOf(p.a3).length > 1 ? world.nearest(lon, lat, p.a3, Math.max(300, 3 * p.dist_km), p.tz) : null;
      return out(p.tz, 'natural-earth', !!other || !a3, `the time zone of the nearest town or city${a3 && p.a3 === a3 ? ' in the same country' : ''} (Natural Earth, ${p.dist_km} km away)${other ? `; ${other.tz} is used ${other.dist_km} km away` : ''}`); }
  }
  const big = R.filter(r => !r.place && boxKm2(r.bbox) > SMALL_KM2).find(r => inBox(r.bbox, lon, lat));
  if (big) return out(big.timeZone, 'region:' + big.id, true, `the region config of ${big.name} (its bounding box; borders not checked)`, big);
  return out(solarZone(lon), 'solar', true, 'the nautical time zone of the longitude (15 degree bands), not the local legal time');
}

// a region config by a place name or id (the ?place= of the page): id, name, place label or search words, no case
export function regionByName(regions, s) {
  const q = String(s || '').trim().toLowerCase(); if (!q) return null;
  for (const r of Object.values(regions || {})) {
    const names = [r.id, r.name, r.place?.label, ...(r.place?.search || [])].filter(Boolean).map(x => x.toLowerCase());
    if (names.some(n => n === q || n.split(/[ ,]+/).includes(q))) return r;
  }
  return null;
}
