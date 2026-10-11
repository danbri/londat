// Region: the one object that says where a place is and how it is read (OKR O1, architecture rule 1). The core takes
// every place-dependent value from a Region; locale constants live only in region configs (docklands/geo/regions/) and
// adapters (docklands/geo/adapters/). Plain ES module, browser and node.
//
//   region(cfg) -> { id, name, origin {lon, lat, h}, bbox [w, s, e, n] (WGS84 degrees), timeZone (IANA), locale (BCP 47),
//                    heightDatum, adapters [], enu (enuFrame at the origin), clock (clockFor(timeZone)),
//                    contains(lon, lat), toLocal(lon, lat, h) -> [e, n, u], fromLocal(e, n, u) -> {lon, lat, h} }
//
// heightDatum: 'ellipsoid' (WGS84 heights) or the id of a height datum that an adapter of the region converts (for the
// Docklands 'ODN', through the uk-os adapter). adapters: [{ id, module?, area, licence, fallback, ... }] (the contract:
// docs/planet-architecture.md, "Adapters").
import { enuFrame } from './ellipsoid.js';
import { clockFor } from './clock.js';

const need = (c, k, ok) => { if (!ok(c[k])) throw new TypeError(`region ${c.id || '?'}: bad or missing ${k}`); };
const num = v => typeof v === 'number' && isFinite(v);

export function region(cfg) {
  need(cfg, 'id', v => typeof v === 'string' && /^[a-z0-9-]+$/.test(v));
  need(cfg, 'name', v => typeof v === 'string' && v.length > 0);
  need(cfg, 'origin', o => o && num(o.lon) && num(o.lat) && Math.abs(o.lat) <= 90 && Math.abs(o.lon) <= 180 && (o.h == null || num(o.h)));
  need(cfg, 'bbox', b => Array.isArray(b) && b.length === 4 && b.every(num) && b[1] < b[3] && b[1] >= -90 && b[3] <= 90);
  need(cfg, 'timeZone', v => typeof v === 'string' && v.length > 0);
  need(cfg, 'locale', v => typeof v === 'string' && Intl.getCanonicalLocales(v).length === 1);
  need(cfg, 'heightDatum', v => typeof v === 'string');
  need(cfg, 'adapters', Array.isArray);
  const origin = { lon: cfg.origin.lon, lat: cfg.origin.lat, h: cfg.origin.h ?? 0 }, enu = enuFrame(origin), clock = clockFor(cfg.timeZone);
  const [w, s, e, n] = cfg.bbox;
  // a bbox with w > e crosses the antimeridian
  const contains = (lon, lat) => lat >= s && lat <= n && (w <= e ? lon >= w && lon <= e : lon >= w || lon <= e);
  return Object.freeze({ ...cfg, origin: Object.freeze(origin), enu, clock, contains,
    toLocal: (lon, lat, h = 0) => enu.toEnu(lon, lat, h), fromLocal: (e2, n2, u = 0) => enu.fromEnu(e2, n2, u),
    adapter: id => cfg.adapters.find(a => a.id === id) || null });
}
