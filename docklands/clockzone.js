// The time zone of the page clock of the Three.js port (OKR KR1.2): it follows the view. In the model, the model's region
// (geo/current.js: the Docklands, Europe/London); on the globe, the zone at the centre of the view (geo/zone.js zoneAt:
// a place's region config, the nearest Natural Earth town of the same country, or the nautical zone, stated as
// approximate). ?tz=<IANA zone | UTC+n> fixes it. The clock's instant (UTC) never changes when the zone changes: only the
// wheels, the clock label, ?t= without an offset, the hour slider and the day/night buttons read the wall clock through it.
// ?t= without an offset is the wall clock of the start view's zone (?tz=, else ?place=, ?ll=, else the model's region).
// One object per page (ZONE); DOM-free. Skill: docklands-sky, "Place-aware page clock".
import { REGION } from './geo/current.js';
import { REGIONS } from './geo/regions/index.js';
import { fromWall, wallParts, wallDate, wallHM, wallString } from './geo/clock.js';
import { zoneAt, parseZone, regionByName, zoneLabel, zoneTime } from './geo/zone.js';

const modelZone = () => ({ timeZone: REGION.timeZone, source: 'region:' + REGION.id, approximate: false, method: `the region config of ${REGION.name} (the model)`, region: REGION.id, locale: REGION.locale, name: REGION.name, at: { lon: REGION.origin.lon, lat: REGION.origin.lat } });
const nav = () => { try { return navigator.languages || [navigator.language]; } catch { return []; } };

export function makeClockZone(qs) {
  const fixed = qs.has('tz') ? parseZone(qs.get('tz')) : null;
  if (qs.has('tz') && !fixed) console.warn('?tz=: unknown time zone', qs.get('tz'));
  let info = modelZone(), why = 'model';
  // the start view (main.js reads ?t= before the globe exists): ?place= a region by name, ?ll= the point (regions only
  // until the world's towns are loaded: refined once, see follow)
  const ll = (qs.get('ll') || '').split(',').map(Number), placeR = qs.get('place') ? regionByName(REGIONS, qs.get('place')) : null;
  let refine = false;
  if (placeR) { info = { ...zoneAt(placeR.origin.lon, placeR.origin.lat, { regions: REGIONS }), at: { lon: placeR.origin.lon, lat: placeR.origin.lat } }; why = 'start'; }
  else if (ll.length >= 2 && ll.slice(0, 2).every(isFinite)) { info = { ...zoneAt(ll[1], ll[0], { regions: REGIONS }), at: { lon: ll[1], lat: ll[0] } }; why = 'start'; refine = info.approximate; }
  else if (qs.get('place') || qs.get('view') === 'globe') refine = true;   // a place that is not a region config, or the globe's start: known once the globe has it
  if (fixed) info = { ...info, timeZone: fixed, source: 'tz-parameter', approximate: false, method: 'set by ?tz= or setTimeZone' };
  const hooks = [];
  const Z = {
    get tz() { return info.timeZone; }, get info() { return info; }, get fixed() { return !!(Z.override || fixed); }, override: null,
    locales() { return [info.locale, ...nav()].filter(Boolean); },
    // wall clock <-> instant in the active zone
    fromLocal: s => fromWall(s, info.timeZone),
    // ?t=: with Z or an offset as it is, else the wall clock of the active zone (NaN when it does not parse)
    parse: s => { s = String(s || '').trim(); return /(Z|[+-]\d\d:?\d\d)$/i.test(s) ? Date.parse(s) : fromWall(s, info.timeZone); },
    // the active zone is not the model's (a place or a point on the globe, or ?tz=)
    get away() { return info.region !== REGION.id || info.timeZone !== REGION.timeZone; }, parts: t => wallParts(t, info.timeZone), date: t => wallDate(t, info.timeZone), hm: t => wallHM(t, info.timeZone), string: t => wallString(t, info.timeZone),
    label: t => zoneLabel(t, info.timeZone, Z.locales()),
    // the state for the API: zone, abbreviation, offset, local time, where the zone came from
    describe: t => ({ ...zoneTime(t, info.timeZone, Z.locales()), source: info.source, approximate: !!info.approximate, method: info.method, place: info.region || null, fixed: Z.fixed }),
    // the point whose sun the wheels show (sunrise, sunset, night shading): the place, else the centre of the view
    observer: () => info.at || { lon: REGION.origin.lon, lat: REGION.origin.lat },
    onChange(f) { hooks.push(f); },
    set(next, reason) { const prev = info; info = next; why = reason; if (prev.timeZone !== next.timeZone || prev.source !== next.source || (prev.at && next.at && (Math.abs(prev.at.lon - next.at.lon) > 0.05 || Math.abs(prev.at.lat - next.at.lat) > 0.05))) for (const f of hooks) f(info, prev, reason); },
    // setTimeZone (API): an IANA zone or "UTC+n" fixes the zone; null or "auto" lets it follow the view again
    setZone(s, view) {
      if (s == null || /^auto$/i.test(String(s))) { Z.override = null; Z.follow(view, true); return Z.info; }
      const tz = parseZone(s); if (!tz) throw new Error(`Unknown time zone "${s}": an IANA name such as Europe/Madrid, UTC, or UTC+2`);
      Z.override = tz; Z.set({ ...info, timeZone: tz, source: 'tz-parameter', approximate: false, method: 'set by setTimeZone' }, 'api'); return Z.info;
    },
    // the view: { mode: 'model' } or { mode: 'globe', lon, lat, zoneAt(lon, lat) } (globe.js G.zoneAt: with the world's
    // towns once loaded). Returns true when the start zone was refined (main.js then reads ?t= again in it).
    follow(v, force) {
      if (fixed || Z.override) return false;
      let next = v && v.mode === 'globe' && isFinite(v.lon) ? { ...(v.zoneAt ? v.zoneAt(v.lon, v.lat) : zoneAt(v.lon, v.lat, { regions: REGIONS })), at: { lon: v.lon, lat: v.lat } } : modelZone();
      if (next.region && REGIONS[next.region]?.place && next.region !== REGION.id) next.at = { lon: REGIONS[next.region].origin.lon, lat: REGIONS[next.region].origin.lat };   // a place: its own sun
      const wasRefine = refine && v && v.mode === 'globe' && v.worldReady;
      if (wasRefine) refine = false;
      if (!force && next.timeZone === info.timeZone && next.source === info.source && next.region === info.region && (!next.at || !info.at || Math.hypot(next.at.lon - info.at.lon, next.at.lat - info.at.lat) < 0.5)) return false;
      Z.set(next, wasRefine ? 'start' : 'view'); return wasRefine;
    },
    get why() { return why; },
  };
  return Z;
}
