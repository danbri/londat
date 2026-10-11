// Generic boats at known moorings (Three.js port; drawn by layers/river.js, part "Moorings and houseboats", on by default).
// Owner, 2026-10-11: "add generic barge outline shaped boats where we know residential moorings are positioned?"
// NOT real vessels. The boats are placed by cwplans/tools/build-moorings.mjs (one generic rule from OpenStreetMap tags and
// geometry: houseboat outlines, pontoons of moorings, mooring lines, the quay edges of marinas, mooring buoys; class and
// mix of types by the tags and the water; seeded, so the same place always shows the same boats) into
// ../cwplans/docklands/data/moorings.json (© OpenStreetMap contributors, ODbL 1.0; data register entry). This module only
// draws them: one InstancedMesh per model type (boats-models.js), paint by a seeded hash, floating at the water (docks:
// the place's level; tidal water: WU.tideLevel, on the mud at low water: max(tide, ground + 0.3)), bobbing a little with
// the wind, hidden when a boat holds the camera (photo views stand on pontoons) or a live AIS vessel lies on it. The
// model buildings of the OSM houseboat outlines are hidden while the part is on (moorings.json `hide`, checked against
// build.js MFP). Tap: a card that says "Generic boats at a known mooring, not real vessels", with the OSM source and
// licence. describe(): a short text for screen readers and LLMs.
// Skill: docklands-3d-page, "Three.js port: boats and moored barges (2026-10-11)"; cwplans-river-and-water (moorings).
import { WU } from './water.js';
import { MFP } from './build.js';
import { models, boatMaterial, boatMesh, paintOf, hash01 } from './boats-models.js';

const CLASS = { canal: 'canal moorings', resid: 'residential moorings in a dock', tidal: 'residential moorings on the tidal river', marina: 'marina', mixed: 'moorings', tier: 'a mooring buoy' };
const KIND = { houseboat: 'a houseboat outline', pontoon: 'a pontoon of a mooring', quay: 'a mooring along a quay', buoy: 'a mooring buoy' };

export async function mooredBoats(ctx, J) {
  const { THREE, esc } = ctx, M = models(), T = J.types, osmUrl = id => 'https://www.openstreetmap.org/' + id.replace(/^osm:/, '');
  const places = J.places, boats = J.boats.map(([x, z, h, L, B, ti, pi, rafted, outline], i) => {
    const P = places[pi]; return { i, x, z, h, L, B, key: T[ti], P, rafted, outline, tidal: P.water === 'tidal', level: P.water === 'tidal' ? null : P.water, seed: `${P.id}#${i}` }; });
  const hide = new Set(J.meta.model_fp === MFP ? J.hide : []);
  if (J.meta.model_fp !== MFP) console.warn('moorings.json is for another area.js: the houseboat buildings stay');
  // a spatial grid of the boats (60 m cells) for the AIS check
  const CELL = 60, grid = new Map(), ck = (x, z) => Math.floor(x / CELL) * 100000 + Math.floor(z / CELL);
  for (const b of boats) { const k = ck(b.x, b.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(b); }

  // ---------- drawing: one InstancedMesh per model type
  const group = new THREE.Group(); group.name = 'moored boats';
  const mat = boatMaterial(ctx.U), byKey = {}, meshes = {};
  for (const b of boats) (byKey[b.key] ||= []).push(b);
  for (const [key, list] of Object.entries(byKey)) {
    const m = M[key]; if (!m) continue;
    const mesh = boatMesh(m, mat, list.length); meshes[key] = mesh; group.add(mesh);
    const t1 = mesh.geometry.getAttribute('tint'), t2 = mesh.geometry.getAttribute('tint2');
    list.forEach((b, i) => { b.mesh = mesh; b.idx = i; b.ph = hash01(b.seed + 'ph') * 6.28; const [c1, c2] = paintOf(key, b.seed); b.c1 = c1; b.c2 = c2; t1.setXYZ(i, ...c1); t2.setXYZ(i, ...c2);
      b.sx = b.B / m.B0; b.sz = b.L / m.L0; b.sy = Math.max(.85, Math.min(1.2, Math.sqrt(b.L / m.L0))); b.H = m.deck * b.sy; });
    t1.needsUpdate = t2.needsUpdate = true; mesh.count = list.length; mesh.visible = true;
  }
  const dummy = new THREE.Object3D(); dummy.rotation.order = 'YXZ';
  const levelOf = b => b.level != null ? b.level : Math.max(WU.tideLevel.value, ctx.groundAt(b.x, b.z) + .3);
  let visible = true, aisAt = 0, aisHidden = 0, held = 0;
  // a generic boat under a live AIS vessel (a real boat at that berth) is hidden; checked once a second
  function aisCheck() {
    const L = globalThis.__docklands3 && globalThis.__docklands3.layers && globalThis.__docklands3.layers.ships, V = (L && L.on && L.api && L.api.vessels) || [];
    aisHidden = 0; for (const b of boats) b.ais = false;
    for (const v of V) { if (!(v.L > 0)) continue; const o = { x: v.x, z: v.z, h: v.h, L: v.L, B: v.W || Math.max(2, v.L * .22) }, r = Math.hypot(o.L, o.B) / 2 + 30;
      for (let gx = Math.floor((o.x - r) / CELL); gx <= Math.floor((o.x + r) / CELL); gx++) for (let gz = Math.floor((o.z - r) / CELL); gz <= Math.floor((o.z + r) / CELL); gz++)
        for (const b of grid.get(gx * 100000 + gz) || []) if (!b.ais && overlap(o, b)) { b.ais = true; aisHidden++; } }
  }
  // level of detail (OKR O3, low-end devices): the boats drawn are packed to the front of each mesh and mesh.count is set,
  // so hidden boats and boats beyond FAR m of the camera cost nothing (a 20 m boat at 3 km is under 10 px)
  const FAR = 3000, tints = {}; for (const [key, mesh] of Object.entries(meshes)) tints[key] = [mesh.geometry.getAttribute('tint'), mesh.geometry.getAttribute('tint2')];
  let drawnN = 0;
  function frame() {
    if (!visible || !group.visible || (group.parent && !group.parent.visible)) return;
    if (performance.now() - aisAt > 1000) { aisAt = performance.now(); aisCheck(); }
    const t = performance.now() / 1000, wind = Math.min(14, WU.windSpeed ? WU.windSpeed.value : 3), cp = ctx.camera.position, n = {}; held = 0; drawnN = 0;
    for (const b of boats) {
      b.drawn = false; if (!b.mesh) continue;
      const y0 = levelOf(b); b.y = y0;
      const dx = cp.x - b.x, dz = cp.z - b.z; if (dx * dx + dz * dz + (cp.y - y0) ** 2 > FAR * FAR) continue;
      const ch = Math.cos(b.h), sh = Math.sin(b.h), lx = dx * ch + dz * sh, lz = -dx * sh + dz * ch;   // the camera in the boat's frame (x across, z along)
      if (Math.abs(lx) < b.B / 2 + 2 && Math.abs(lz) < b.L / 2 + 2 && cp.y < y0 + b.H + 3) { held++; continue; }   // the boat holds the camera
      if (b.ais) continue;
      const amp = (b.tidal ? .05 : .025) + wind * (b.tidal ? .008 : .004), j = n[b.key] = (n[b.key] || 0) + 1, i = j - 1;
      dummy.position.set(b.x, y0 + Math.sin(t * 1.1 + b.ph) * amp, b.z); dummy.rotation.set(Math.sin(t * .7 + b.ph) * amp * .02, -b.h, Math.sin(t * .9 + b.ph) * amp * .06);
      dummy.scale.set(b.sx, b.sy, b.sz); dummy.updateMatrix(); b.mesh.setMatrixAt(i, dummy.matrix);
      const [t1, t2] = tints[b.key]; t1.setXYZ(i, ...b.c1); t2.setXYZ(i, ...b.c2); b.drawn = true; drawnN++;
    }
    for (const [key, m] of Object.entries(meshes)) { const k = n[key] || 0; m.count = Math.max(1, k); m.visible = k > 0; m.instanceMatrix.needsUpdate = true; if (k) { tints[key][0].needsUpdate = tints[key][1].needsUpdate = true; } }
  }
  ctx.onFrame(frame); frame();

  // ---------- tap: the boat under the ray (its box from the keel to the cabin roof)
  function card(b) {
    const m = M[b.key], P = b.P, dims = `${b.L.toFixed(0)} m x ${b.B.toFixed(1)} m`, same = boats.filter(q => q.P === P).length;
    const tags = Object.entries(P.tags || {}).filter(([k]) => k !== 'name').map(([k, v]) => `${esc(k)}=${esc(v)}`).join(', ');
    const where = b.outline
      ? `Houseboat outline mapped in OpenStreetMap: <a href="${esc(osmUrl(P.id))}" target="_blank" rel="noopener">${esc(P.id.replace(/^osm:/, ''))}</a>. The model is fitted to the outline (${dims}, heading from the outline); its type follows the beam. A houseboat is a home: no name, address or occupant is shown.`
      : `${esc(P.name || (P.area && P.area.name) || 'Unnamed mooring')}: ${esc(KIND[P.kind])} (${esc(CLASS[P.cls])}${P.water_name ? ', ' + esc(P.water_name) : ''}), <a href="${esc(osmUrl(P.id))}" target="_blank" rel="noopener">OSM ${esc(P.id.replace(/^osm:/, ''))}</a>${tags ? ` (${tags})` : ''}${P.area ? `, in <a href="${esc(osmUrl(P.area.id))}" target="_blank" rel="noopener">${esc(P.area.name || P.area.id)}</a>` : ''}. ${same} generic boat${same === 1 ? '' : 's'} here. Type, size (${dims}), colour and berth are typical values for this class of mooring, chosen by a seeded hash${b.rafted ? '; rafted alongside another boat' : ''}.`;
    ctx.showCard(`<h2>Generic ${esc(m.name)}</h2><p class="small"><b>Generic boats at a known mooring, not real vessels.</b></p><p>${where}</p>`
      + `<p class="small">Mooring places: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> (ODbL 1.0), data of ${esc(String(J.meta.osm_data_as_of || '').slice(0, 10))}; placed by tools/build-moorings.mjs (one rule from OSM tags and shapes, for any place). Boats at moorings change; this shows what such a mooring typically holds, not who or what is there. Live vessels with AIS are in Ships (AIS).</p>`);
  }
  ctx.addPick(rc => {
    if (!visible || !group.visible || !group.parent || !group.parent.visible) return null;
    const o = rc.ray.origin, d = rc.ray.direction; let best = null;
    for (const b of boats) {
      if (!b.drawn) continue;
      const ch = Math.cos(b.h), sh = Math.sin(b.h), ox = o.x - b.x, oz = o.z - b.z, y0 = b.y ?? levelOf(b);
      const lo = [ox * ch + oz * sh, o.y - y0, -ox * sh + oz * ch], ld = [d.x * ch + d.z * sh, d.y, -d.x * sh + d.z * ch];
      const mn = [-b.B / 2, -1, -b.L / 2], mx = [b.B / 2, b.H, b.L / 2]; let t0 = 0, t1 = 1e9;
      for (let k = 0; k < 3; k++) { if (Math.abs(ld[k]) < 1e-9) { if (lo[k] < mn[k] || lo[k] > mx[k]) { t0 = 2e9; break; } continue; } let a = (mn[k] - lo[k]) / ld[k], c = (mx[k] - lo[k]) / ld[k]; if (a > c) [a, c] = [c, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c); }
      if (t0 <= t1 && t0 < 1e9 && (!best || t0 < best.distance)) best = { distance: t0, open: () => card(b) };
    }
    return best;
  });

  const count = (list, f) => list.reduce((o, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o; }, {});
  const byType = Object.fromEntries(Object.entries(byKey).map(([k, l]) => [k, l.length]));
  const stats = { boats: boats.length, places: places.length, outlines: boats.filter(b => b.outline).length, byType, byClass: count(boats, b => b.P.cls), byKind: count(boats, b => b.P.kind),
    tris: boats.reduce((s, b) => s + (M[b.key] ? M[b.key].tris : 0), 0), drawCalls: Object.keys(meshes).length, hidden_buildings: hide.size, get ais_hidden() { return aisHidden; }, get camera_held() { return held; }, get drawn() { return drawnN; },
    get drawnTris() { return boats.reduce((s, b) => s + (b.drawn ? M[b.key].tris : 0), 0); } };
  // a short text description (screen readers, LLMs, WebMCP): what is drawn, how many, where, and what it is not
  function describe(maxPlaces = 6) {
    if (!visible) return 'Generic boats at known moorings: off.';
    const names = {}; for (const P of places) { const n = P.name || (P.area && P.area.name) || (P.kind === 'houseboat' ? (P.water_name ? 'houseboats in ' + P.water_name : 'houseboat outlines') : P.water_name); if (n) names[n] = (names[n] || 0) + P.n; }
    const top = Object.entries(names).sort((a, b) => b[1] - a[1]).slice(0, maxPlaces).map(([n, k]) => `${n} (${k})`).join(', ');
    const types = Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${M[k] ? M[k].name : k}${n === 1 ? '' : 's'}`).join(', ');
    return `Generic boats at known moorings, not real vessels: ${boats.length} boats at ${places.length} mooring places mapped in OpenStreetMap (houseboat outlines, pontoons, quays, buoys), placed by a generic rule with typical types and sizes: ${types}. Most at: ${top}. ${stats.outlines} are fitted to OSM houseboat outlines. They float at the water level${aisHidden ? `; ${aisHidden} hidden under live AIS vessels` : ''}. Source: © OpenStreetMap contributors (ODbL 1.0), data of ${String(J.meta.osm_data_as_of || '').slice(0, 10)}.`;
  }
  return { group, boats, places, hide, stats, frame, describe, setVisible(v) { visible = v; group.visible = v; if (v) frame(); } };
}
// oriented box overlap (separating axes), boxes { x, z, h, L, B }
function overlap(a, b) {
  const C = o => { const ux = Math.sin(o.h), uz = -Math.cos(o.h), nx = Math.cos(o.h), nz = Math.sin(o.h), l = o.L / 2, w = o.B / 2;
    return [[o.x + ux * l + nx * w, o.z + uz * l + nz * w], [o.x + ux * l - nx * w, o.z + uz * l - nz * w], [o.x - ux * l - nx * w, o.z - uz * l - nz * w], [o.x - ux * l + nx * w, o.z - uz * l + nz * w]]; };
  const A4 = C(a), B4 = C(b);
  for (const o of [a, b]) for (const [ax, az] of [[Math.sin(o.h), -Math.cos(o.h)], [Math.cos(o.h), Math.sin(o.h)]]) {
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; for (const [x, z] of A4) { const p = x * ax + z * az; a0 = Math.min(a0, p); a1 = Math.max(a1, p); } for (const [x, z] of B4) { const p = x * ax + z * az; b0 = Math.min(b0, p); b1 = Math.max(b1, p); }
    if (a1 < b0 || b1 < a0) return false; }
  return true;
}
