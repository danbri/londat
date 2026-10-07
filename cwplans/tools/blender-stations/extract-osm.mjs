// usage: node cwplans/tools/blender-stations/extract-osm.mjs <work>/osm-stations.json  (skill: blender-station-models)
// Decode the 3D page's OSM-derived data around the two stations into one JSON for Blender.
import { fileURLToPath } from 'url'; import { dirname, join } from 'path';
const D = join(dirname(fileURLToPath(import.meta.url)), '../../docklands/data/');
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
require(D + 'area.js'); require(D + 'under.js');
const A = globalThis.DOCKLANDS_AREA, U = globalThis.DOCKLANDS_UNDER;
const dec = (q, stride = 2) => { const out = [], prev = new Array(stride).fill(0); for (let i = 0; i < q.length; i++) { const k = i % stride; prev[k] += q[i]; out.push(prev[k] / 10); } const pts = []; for (let i = 0; i < out.length; i += stride) pts.push(out.slice(i, i + stride)); return pts; };
const ST = { 'canada-water': { c: [-2085, 831.9], r: 200 }, 'canary-wharf': { c: [64.6, 120], r: 260 } };
const near = (pts, c, r) => pts.some(p => Math.hypot(p[0] - c[0], p[1] - c[1]) < r);
const res = { origin: A.meta.origin, stations: {} };
const lk = {}; for (const l of A.lines) lk[l.k] = (lk[l.k] || 0) + 1; res.lineKinds = lk;
for (const [id, s] of Object.entries(ST)) {
  const o = { indoor: [], lines: [], pois: [], buildings: [] };
  for (const f of U.indoor) {
    const pts = f.line ? dec(f.line) : dec(f.p);
    if (!near(pts, s.c, s.r)) continue;
    o.indoor.push({ kind: f.kind, lv: f.lv, g: f.g, name: f.name, closed: !f.line, pts });
  }
  for (const l of A.lines) {
    if (!/rail|subway|light_rail/.test(l.k)) continue;
    const pts = l.q ? dec(l.q, 3) : l.pts.map(p => [p[0], p[1], p[2]]);
    if (!near(pts, s.c, s.r)) continue;
    o.lines.push({ k: l.k, name: l.name, tunnel: l.tunnel || 0, layer: l.layer, src: l.src, pts: pts.filter(p => Math.hypot(p[0] - s.c[0], p[1] - s.c[1]) < s.r + 150) });
  }
  for (const p of U.pois) if (Math.hypot(p.x - s.c[0], p.z - s.c[1]) < s.r) o.pois.push(p);
  for (const b of A.buildings) { const pts = dec(b.p); if (near(pts, s.c, 90)) o.buildings.push({ b: b.b, h: b.h, pts }); }
  res.stations[id] = o;
  const cnt = {}; for (const f of o.indoor) cnt[f.kind] = (cnt[f.kind] || 0) + 1;
  console.log(id, 'indoor', JSON.stringify(cnt), 'lines', o.lines.length, 'pois', o.pois.length, 'bldgs', o.buildings.length);
}
console.log(JSON.stringify(lk));
(await import('fs')).writeFileSync(process.argv[2], JSON.stringify(res));
