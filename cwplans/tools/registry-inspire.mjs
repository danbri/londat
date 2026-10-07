// HM Land Registry INSPIRE Index Polygons (freehold title extents) for Tower Hamlets, clipped to the Canary Wharf box.
// Run: node cwplans/tools/registry-inspire.mjs
// Needs cwplans/data/raw/registry/inspire/Land_Registry_Cadastral_Parcels.gml, from
//   https://use-land-property-data.service.gov.uk/datasets/inspire/download/London_Borough_of_Tower_Hamlets.zip
//   (no account; the site sets a session cookie first, so fetch the download page with a cookie jar, then the zip.
//    The older name Tower_Hamlets.zip still answers, with a stale 2023 file.)
// Writes registry/sources/landregistry/inspire-canary-wharf.geojson (WGS84 via OSTN15; area and centroid from BNG).
// The data holds polygons and IDs only: no title numbers, no owners.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import proj4 from 'proj4';
import { bngProjector, polyArea } from './lib.mjs';
import { OUT, RAWREG, CW_BOX } from './registry-lib.mjs';

const gmlPath = join(RAWREG, 'inspire', 'Land_Registry_Cadastral_Parcels.gml');
const dir = join(OUT, 'landregistry');
mkdirSync(dir, { recursive: true });

const toBng = await bngProjector();           // registers the OSTN15 'BNG' definition
const inv = proj4('BNG', 'EPSG:4326');
const toWgs = (e, n) => inv.forward([e, n]);

// CW box in BNG: project the four corners, test in BNG against the WGS84 box after converting candidates
const corners = [[CW_BOX[0], CW_BOX[1]], [CW_BOX[2], CW_BOX[1]], [CW_BOX[2], CW_BOX[3]], [CW_BOX[0], CW_BOX[3]]].map(([lo, la]) => toBng(lo, la));
const bx0 = Math.min(...corners.map(c => c[0])) - 50, bx1 = Math.max(...corners.map(c => c[0])) + 50;
const by0 = Math.min(...corners.map(c => c[1])) - 50, by1 = Math.max(...corners.map(c => c[1])) + 50;

const gml = readFileSync(gmlPath, 'utf8');
const stamp = /timeStamp="([^"]+)"/.exec(gml)?.[1];
const members = gml.split('<wfs:member>').slice(1);
const B = CW_BOX;
const inside = ([x, y]) => x >= B[0] && x <= B[2] && y >= B[1] && y <= B[3];
function segHitsBox([x0, y0], [x1, y1]) {      // Liang-Barsky
  let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
  for (const [p, q] of [[-dx, x0 - B[0]], [dx, B[2] - x0], [-dy, y0 - B[1]], [dy, B[3] - y0]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}
const pointIn = (p, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

const feats = []; let total = 0, multi = 0;
const r7 = v => Math.round(v * 1e7) / 1e7, r2 = v => Math.round(v * 100) / 100;
for (const m of members) {
  total++;
  const tag = t => new RegExp(`<LR:${t}>([^<]*)</LR:${t}>`).exec(m)?.[1] ?? null;
  // every gml:Polygon in the member (a MultiSurface holds several); each has one exterior and 0+ interiors
  const polys = [];
  for (const pm of m.split('<gml:Polygon').slice(1)) {
    const rings = [...pm.matchAll(/<gml:posList[^>]*>([^<]*)<\/gml:posList>/g)].map(x => {
      const v = x[1].trim().split(/\s+/).map(Number); const r = [];
      for (let i = 0; i + 1 < v.length; i += 2) r.push([v[i], v[i + 1]]);
      return r;
    });
    if (rings.length) polys.push(rings);
  }
  if (!polys.length) continue;
  if (polys.length > 1) multi++;
  const all = polys.flatMap(p => p[0]);
  if (!all.some(([e, n]) => e >= bx0 && e <= bx1 && n >= by0 && n <= by1)) {
    // a huge parcel could still enclose the box: check its bbox overlap
    const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
    if (Math.max(...xs) < bx0 || Math.min(...xs) > bx1 || Math.max(...ys) < by0 || Math.min(...ys) > by1) continue;
  }
  const wpolys = polys.map(rings => rings.map(r => r.map(([e, n]) => toWgs(e, n))));
  const hit = wpolys.some(rings => {
    const ext = rings[0];
    if (ext.some(inside)) return true;
    if ([[B[0], B[1]], [B[2], B[1]], [B[2], B[3]], [B[0], B[3]]].some(c => pointIn(c, ext))) return true;
    for (let i = 0; i + 1 < ext.length; i++) if (segHitsBox(ext[i], ext[i + 1])) return true;
    return false;
  });
  if (!hit) continue;
  const area = polys.reduce((s, rings) => s + Math.abs(polyArea(rings[0])) - rings.slice(1).reduce((t, r) => t + Math.abs(polyArea(r)), 0), 0);
  let cx = 0, cy = 0; for (const [e, n] of polys[0][0]) { cx += e; cy += n; } cx /= polys[0][0].length; cy /= polys[0][0].length;
  const [clon, clat] = toWgs(cx, cy);
  const coords = wpolys.map(rings => rings.map(r => r.map(([x, y]) => [r7(x), r7(y)])));
  feats.push({
    type: 'Feature',
    properties: {
      inspire_id: tag('INSPIREID'), valid_from: tag('VALIDFROM')?.slice(0, 10), begin_lifespan: tag('BEGINLIFESPANVERSION')?.slice(0, 10),
      area_m2: r2(area), centroid_bng: [Math.round(cx), Math.round(cy)], centroid: [r7(clon), r7(clat)],
      fully_inside_box: wpolys.every(rings => rings[0].every(inside)),
    },
    geometry: coords.length === 1 ? { type: 'Polygon', coordinates: coords[0] } : { type: 'MultiPolygon', coordinates: coords },
  });
}
feats.sort((a, b) => Number(a.properties.inspire_id) - Number(b.properties.inspire_id));
const year = (stamp || '').slice(0, 4);
const fc = {
  type: 'FeatureCollection',
  name: 'HM Land Registry INSPIRE Index Polygons, London Borough of Tower Hamlets, intersecting the Canary Wharf box',
  source: 'https://use-land-property-data.service.gov.uk/datasets/inspire/download/London_Borough_of_Tower_Hamlets.zip',
  published: stamp, fetched: new Date().toISOString().slice(0, 10), box: CW_BOX,
  crs_note: 'Coordinates are WGS84 lon/lat, converted from EPSG:27700 with the OS OSTN15 NTv2 grid; area_m2 and centroid_bng are from the original BNG geometry.',
  attribution: [
    `This information is subject to Crown copyright and database rights ${year} and is reproduced with the permission of HM Land Registry.`,
    `The polygons (including the associated geometry, namely x, y co-ordinates) are subject to Crown copyright and database rights ${year} Ordnance Survey 100026316.`,
  ],
  conditions: 'https://use-land-property-data.service.gov.uk/datasets/inspire/#conditions',
  note: 'One polygon per registered freehold title extent (an index, not a legal boundary). INSPIRE ID is not the title number. No owner data is included in this product.',
  borough_polygons: total, features_count: feats.length,
  features: feats,
};
writeFileSync(join(dir, 'inspire-canary-wharf.geojson'), JSON.stringify(fc).replace(/\},\{"type":"Feature"/g, '},\n{"type":"Feature"'));
console.log(`borough polygons ${total} (multi ${multi}); intersecting CW box ${feats.length}; fully inside ${feats.filter(f => f.properties.fully_inside_box).length}`);
