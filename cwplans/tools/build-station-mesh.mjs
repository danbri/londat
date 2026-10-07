// Converts the Blender station box models (danbri/londat third_party/tfl/am3d/models/stations-exports.zip, stations.glb)
// to docklands/data/stations.json for the 3D page's "Station models" layer (docklands/stations-layer.js).
// Keeps positions (cm, relative to each object's origin) and triangle indices; drops the text labels and the street
// reference plane. Skill: blender-station-models, "On the 3D page".
//   node cwplans/tools/build-station-mesh.mjs --glb <stations.glb | stations-exports.zip> [--out <file>]
import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { join } from 'path';
import { TOOLS } from './lib.mjs';

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const src = arg('--glb'); if (!src) { console.error('usage: --glb <stations.glb | stations-exports.zip>'); process.exit(2); }
const out = arg('--out') || join(TOOLS, '..', 'docklands', 'data', 'stations.json');
const glb = src.endsWith('.zip') ? execFileSync('unzip', ['-p', src, 'stations.glb'], { maxBuffer: 1 << 28 }) : readFileSync(src);
if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
const jl = glb.readUInt32LE(12), J = JSON.parse(glb.subarray(20, 20 + jl)), bin = glb.subarray(20 + jl + 8);
const acc = i => { const a = J.accessors[i], v = J.bufferViews[a.bufferView], o = (v.byteOffset || 0) + (a.byteOffset || 0);
  const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType], n = { SCALAR: 1, VEC3: 3 }[a.type];
  return new T(bin.buffer.slice(bin.byteOffset + o, bin.byteOffset + o + a.count * n * T.BYTES_PER_ELEMENT)); };

const DROP = new Set(['label', 'ground']), objects = [];
for (const n of J.nodes) {
  if (n.mesh == null) continue; const x = n.extras || {};
  if (DROP.has(x.element_class)) continue;
  if (n.rotation || n.scale) throw new Error(`${n.name}: rotation or scale on a node is not handled`);
  const t = n.translation || [0, 0, 0], key = new Map(), p = [], idx = [];
  for (const pr of J.meshes[n.mesh].primitives) {
    const P = acc(pr.attributes.POSITION), I = acc(pr.indices), map = [];
    for (let k = 0; k < P.length / 3; k++) {   // flat-shaded export splits vertices per face: merge equal positions
      const q = [0, 1, 2].map(c => Math.round(P[3 * k + c] * 100)), s = q.join(',');
      if (!key.has(s)) { key.set(s, p.length / 3); p.push(...q); } map.push(key.get(s));
    }
    for (let k = 0; k < I.length; k += 3) { const a = map[I[k]], b = map[I[k + 1]], c = map[I[k + 2]]; if (a !== b && b !== c && a !== c) idx.push(a, b, c); }
  }
  const { station, element_class: cls, ...rest } = x;
  objects.push({ name: n.name, station, cls, t: t.map(v => Math.round(v * 100) / 100), ...rest, p, i: idx });
}
// cut-out rectangles: where the models are drawn, the page leaves out its own tunnels and OSM indoor floors (minimum-area
// rectangle in plan of each structural box, plus a margin)
const MARGIN = 1.5, hide = [];
for (const o of objects.filter(o => o.cls === 'box')) {
  const pts = []; for (let k = 0; k < o.p.length; k += 3) pts.push([o.t[0] + o.p[k] / 100, o.t[2] + o.p[k + 2] / 100]);
  let best = null;
  for (let d = 0; d < 180; d += .25) {
    const a = d * Math.PI / 180, u = [Math.cos(a), Math.sin(a)]; let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    for (const [x, z] of pts) { const s = x * u[0] + z * u[1], t = -x * u[1] + z * u[0]; a0 = Math.min(a0, s); a1 = Math.max(a1, s); b0 = Math.min(b0, t); b1 = Math.max(b1, t); }
    if (!best || (a1 - a0) * (b1 - b0) < best.area) best = { area: (a1 - a0) * (b1 - b0), u, a0, a1, b0, b1 };
  }
  const { u, a0, a1, b0, b1 } = best, sc = (a0 + a1) / 2, tc = (b0 + b1) / 2, r = v => Math.round(v * 100) / 100;
  hide.push({ name: o.name, cx: r(sc * u[0] - tc * u[1]), cz: r(sc * u[1] + tc * u[0]), ux: +u[0].toFixed(5), uz: +u[1].toFixed(5),
    hl: r((a1 - a0) / 2 + MARGIN), hw: r((b1 - b0) / 2 + MARGIN) });
}
// OSM level -> m OD inside each station box, from the model's floors (the page's walking network and drone Walk use it;
// level 0 stays the page's own ground)
const LEVELS = { 'canary-wharf': { '-3': 'CWF.platform.WB_1', '-2': 'CWF.hall.floor_published', '-1': 'CWF.mezzanine' },
  'canada-water': { '-3': 'CW.platform.JL_WB_1', '-2': 'CW.concourse.ell_level', '-1': 'CW.hall.floor_osm' } };
const levels = Object.fromEntries(Object.entries(LEVELS).map(([st, m]) => [st, Object.fromEntries(Object.entries(m).map(([lv, name]) => {
  const o = objects.find(o => o.name === name); if (!o) throw new Error('no ' + name); return [lv, { m_od: o.level_m_od, from: name }]; }))]));
for (const h of hide) h.station = objects.find(o => o.name === h.name).station;
const doc = {
  hide, levels,
  meta: {
    about: 'Station box models of Canary Wharf and Canada Water (Jubilee line; Canada Water also the Windrush line), made in Blender through the blender-mcp MCP server on 2026-10-05. Positions in cm relative to t (m); frame of the 3D page: x = E - 537550, y = m OD, z = -(N - 180300). Text labels and the street reference plane left out.',
    source: 'https://github.com/danbri/londat/tree/main/third_party/tfl/am3d/models',
    glb_sha256: createHash('sha256').update(glb).digest('hex'),
    licence: 'Contains OpenStreetMap-derived geometry: ODbL 1.0, © OpenStreetMap contributors. Layout guide: TfL axonometric station diagrams (2015 FOI release), use approved by the owner for the scoping phase. Levels and sizes: TfL FOI-0493-2223, Wikipedia and the architect (facts only).',
    attribution: '© OpenStreetMap contributors (ODbL); layout after TfL station diagrams (FOI 2015)',
    built: new Date().toISOString().slice(0, 10), triangles: objects.reduce((s, o) => s + o.i.length / 3, 0)
  },
  objects
};
writeFileSync(out, JSON.stringify(doc));
console.log(out, objects.length, 'objects', doc.meta.triangles, 'triangles', JSON.stringify(doc).length, 'bytes');
