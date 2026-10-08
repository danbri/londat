// Coarse terrain of Greater London for the 3D page's outer terrain ring: EU-DEM v1.1 (Copernicus, 25 m) heights from the
// OpenTopoData public API on a 250 m British National Grid lattice, E 503000-562000, N 155000-201000 (237 x 185 points).
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/fetch-london-terrain.mjs     (fetch the missing points, then the operation)
//   node cwplans/tools/fetch-london-terrain.mjs --no-fetch                (only the operation, from the raw file)
// Fetch (outside the operation): points not yet in cwplans/data/raw/london-eudem25m-250m.json.gz, 100 a request, one
// request every 1.1 s (public API limits: 100 locations a request, 1 call a second, 1,000 calls a day), saved every 10
// requests, so a re-run fetches nothing. Operation fetch-london-terrain (kgx Flow, log in kgx/log): raw file ->
// cwplans/docklands/data/london-terrain.json (page frame x = E - 537550, z = -(N - 180300), heights in dm) and graph
// version london-terrain, named in kgx/external-heads.json.
// Skills: docklands-3d-page ("Terrain of London"), cwplans-dataflow, docklands-data-curation (data register).
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { gzipSync, gunzipSync } from 'zlib';
import { createHash } from 'crypto';
import { join } from 'path';
import vm from 'vm';
import proj4 from 'proj4';
import { dataFactory as F } from '@factoidal/core';
import { TOOLS, UA } from './lib.mjs';
import { LONDAT_DIR } from './londat.mjs';
import { Flow } from './kgx-ops.mjs';
import { kid, VOCAB } from './kgx-ids.mjs';

const CW = join(TOOLS, '..'), RAWF = join(CW, 'data', 'raw', 'london-eudem25m-250m.json.gz'), OUT = join(CW, 'docklands', 'data', 'london-terrain.json');
const AREA = join(CW, 'docklands', 'data', 'area.js'), K = join(LONDAT_DIR, 'kgx');
const DATASET = 'eudem25m', API = `https://api.opentopodata.org/v1/${DATASET}`;
const G = { e0: 503000, e1: 562000, n0: 155000, n1: 201000, cell: 250 }, E0 = 537550, N0 = 180300;
const nx = (G.e1 - G.e0) / G.cell + 1, nz = (G.n1 - G.n0) / G.cell + 1;
// OSGB36 Helmert to WGS84 (about 2 m out here; the OSTN15 grid is not needed for 250 m spacing of a 25 m DEM)
proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs');
const toLL = proj4('EPSG:27700', 'EPSG:4326');
// row j runs north to south (z = -(N - N0) grows), column i west to east, as A.terrain in area.js
const pts = [];
for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
  const E = G.e0 + i * G.cell, N = G.n1 - j * G.cell, [lon, lat] = toLL.forward([E, N]);
  pts.push({ E, N, key: lat.toFixed(6) + ',' + lon.toFixed(6) });
}

// ---- fetch (not part of the operation: it makes the input file)
const raw = existsSync(RAWF) ? JSON.parse(gunzipSync(readFileSync(RAWF))) : { about: `EU-DEM v1.1 heights (m, EVRS2000; null = no data) from the OpenTopoData public API ${API}, at the WGS84 points (OSGB36 Helmert) of a 250 m BNG lattice. Made by cwplans/tools/fetch-london-terrain.mjs. Copernicus data (EU-DEM v1.1), funded by the European Union.`, api: API, fetched: {}, h: {} };
const saveRaw = () => writeFileSync(RAWF, gzipSync(JSON.stringify(raw)));
if (!process.argv.includes('--no-fetch')) {
  if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) console.warn('warning: HTTPS_PROXY is set but NODE_USE_ENV_PROXY is not; Node fetch will not use the proxy');
  const todo = pts.filter(p => !(p.key in raw.h)), sleep = ms => new Promise(r => setTimeout(r, ms));
  let req = 0;
  for (let k = 0; k < todo.length; k += 100) {
    const batch = todo.slice(k, k + 100), url = `${API}?locations=${batch.map(p => p.key).join('|')}`;
    let ok = false;
    for (let a = 0; a < 5 && !ok; a++) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA } }); req++;
        if (r.status === 429) throw new Error('HTTP 429 (rate limit)');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const js = await r.json(); if (js.status !== 'OK' || js.results.length !== batch.length) throw new Error('status ' + js.status);
        js.results.forEach((x, m) => { raw.h[batch[m].key] = x.elevation == null ? null : Math.round(x.elevation * 10) / 10; });
        ok = true;
      } catch (e) { console.error(`request ${k / 100}: ${e.message}; retry ${a + 1}`); await sleep(5000 * (a + 1)); }
    }
    if (!ok) { saveRaw(); throw new Error('giving up; points so far are saved, run again later'); }
    raw.fetched[new Date().toISOString().slice(0, 10)] = (raw.fetched[new Date().toISOString().slice(0, 10)] || 0) + batch.length;
    if (req % 10 === 0) saveRaw();
    process.stdout.write(`\r${Math.min(k + 100, todo.length)}/${todo.length} points, ${req} requests`);
    await sleep(1100);
  }
  if (todo.length) { saveRaw(); console.log(); }
  console.log(JSON.stringify({ points: pts.length, fetched_now: todo.length, requests_now: req }));
}

// ---- the operation: raw heights -> page grid (dm), no-data filled from neighbours
const flow = new Flow(K);
const inputs = [flow.file(RAWF, 'cwplans/data/raw/london-eudem25m-250m.json.gz')];
const op = { id: 'fetch-london-terrain', version: 1, skill: 'docklands-3d-page', tool: 'cwplans/tools/fetch-london-terrain.mjs',
  about: 'EU-DEM v1.1 heights fetched from OpenTopoData on a 250 m BNG lattice over Greater London -> a coarse terrain grid in the 3D page frame (docklands/data/london-terrain.json) for the outer terrain ring' };
const body = async () => {
  const R = JSON.parse(gunzipSync(readFileSync(RAWF)));
  const h = pts.map(p => { if (!(p.key in R.h)) throw new Error('raw file lacks ' + p.key + ': fetch first'); return R.h[p.key]; });
  let gaps = h.filter(v => v == null).length; const nulls = gaps;
  while (gaps) {   // each pass fills a missing point with the mean of its known 8 neighbours
    const nh = h.slice(); gaps = 0;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (h[k] != null) continue; let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const v = h[b * nx + a]; if (v != null) { s += v; n++; } }
      if (n) nh[k] = s / n; else gaps++; }
    h.splice(0, h.length, ...nh);
  }
  const dm = h.map(v => Math.round(v * 10)), mn = Math.min(...dm) / 10, mx = Math.max(...dm) / 10, top = pts[dm.indexOf(mx * 10)];
  const out = { about: 'Coarse terrain of Greater London for the outer terrain ring of the 3D page, made by cwplans/tools/fetch-london-terrain.mjs (do not edit by hand). Heights: EU-DEM v1.1 (m above EVRS2000, close to m OD here), in decimetres, row-major: row j at z = z0 + j * cell (north to south), column i at x = x0 + i * cell, page frame x = E - 537550, z = -(N - 180300).',
    source: 'EU-DEM v1.1, Copernicus Land Monitoring Service, via the OpenTopoData public API (api.opentopodata.org, dataset eudem25m)',
    attribution: 'Produced using Copernicus data and information funded by the European Union: EU-DEM layers. Resampled to a 250 m grid; no-data points filled from their neighbours.',
    licence: 'Copernicus data and information policy, Regulation (EU) No 1159/2013 (free, full and open access with attribution); EU-DEM v1.1',
    bng: G, x0: G.e0 - E0, z0: -(G.n1 - N0), cell: G.cell, nx, nz, filled: nulls, min_m: mn, max_m: mx, dm };
  writeFileSync(OUT, JSON.stringify(out) + '\n');
  const N = F.namedNode, V = VOCAB, S = 'https://schema.org/', q = [], s = kid('area', 'terrain', 'london-eudem25m-250m');
  const lit = (x, dt) => F.literal(String(x), dt ? N('http://www.w3.org/2001/XMLSchema#' + dt) : undefined), add = (p, o) => q.push(F.quad(N(s), N(p), o, F.defaultGraph()));
  add('http://www.w3.org/1999/02/22-rdf-syntax-ns#type', N(S + 'Dataset')); add(S + 'name', lit('Coarse terrain of Greater London, 250 m (EU-DEM v1.1)'));
  add(S + 'isBasedOn', N('https://land.copernicus.eu/en/products/products-that-are-no-longer-disseminated-on-the-clms-website')); add(S + 'license', lit(out.licence)); add(S + 'creditText', lit(out.attribution));
  add(V + 'file', lit('cwplans/docklands/data/london-terrain.json')); add(V + 'sha256', lit(createHash('sha256').update(readFileSync(OUT)).digest('hex')));
  add(V + 'gridCellM', lit(G.cell, 'integer')); add(V + 'points', lit(nx * nz, 'integer')); add(V + 'filledPoints', lit(nulls, 'integer'));
  add(S + 'box', lit(`BNG E ${G.e0}-${G.e1} N ${G.n0}-${G.n1}`)); add(V + 'minM', lit(mn, 'decimal')); add(V + 'maxM', lit(mx, 'decimal')); add(V + 'highestPointBNG', lit(`${top.E} ${top.N}`));
  return { 'london-terrain': { quads: q, about: { title: 'Coarse terrain of Greater London (EU-DEM v1.1 at 250 m) for the 3D page', licence: out.licence, osm: false } } };
};
const res = await flow.run(op, inputs, {}, body);
const v = res['london-terrain'], ehF = join(K, 'external-heads.json'), eh = JSON.parse(readFileSync(ehF, 'utf8'));
eh['london-terrain'] = v.iri; writeFileSync(ehF, JSON.stringify(eh, null, 1) + '\n');

// ---- a measurement for the skill (not part of the operation): EU-DEM minus the page's LiDAR ground inside the model box
const ctx = {}; vm.createContext(ctx); vm.runInContext(readFileSync(AREA, 'utf8'), ctx); const T = ctx.DOCKLANDS_AREA.terrain, D = JSON.parse(readFileSync(OUT, 'utf8')), d = [];
for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = D.x0 + i * D.cell, z = D.z0 + j * D.cell, a = Math.round((x - T.x0) / T.cell), b = Math.round((z - T.z0) / T.cell);
  if (a >= 0 && b >= 0 && a < T.nx && b < T.nz) d.push((D.dm[j * nx + i] - T.dm[b * T.nx + a]) / 10); }
d.sort((a, b) => a - b);
console.log(JSON.stringify({ version: v.iri, triples: v.triples, new: flow.ran.length, grid: `${nx} x ${nz}`, filled: D.filled, min_m: D.min_m, max_m: D.max_m, bytes: readFileSync(OUT).length,
  eudem_minus_lidar_in_model_box: { n: d.length, median: d[d.length >> 1], p10: d[Math.floor(d.length * .1)], p90: d[Math.floor(d.length * .9)] } }));
