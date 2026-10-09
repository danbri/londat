// Layer "piers" of the Three.js port (docklands/): the piers and pontoons of the model box and the vessels berthed at them,
// from ../cwplans/docklands/data/piers.json (tools/build-piers.mjs: OSM pier shapes, TfL river-bus piers, the tour
// operators' pages, Wikidata). Floating pontoons rise and fall with the tide (WU.tideLevel of water.js; docks keep their
// level), each gangway turns about its shore end and keeps its length (its pontoon end slides), lamps light by night.
// Fixed piers and jetties: their OSM outline as a deck. HMS Belfast: a low-poly Town-class cruiser at true size
// (piers-models.js), in its place from the OSM outline, floating at the tide; the model buildings of its outline are
// hidden while the layer is on. Other berthed historic vessels with an OSM outline: a generic model by type.
// Boats alongside (SIMULATED, not positions): a river-bus catamaran or the RB4 ferry at a TfL pier while the TfL timetable
// (feeds/river/river-bus.json) has a call there (1.5 min before to 1 min after; stated default), a tour boat at a tour pier
// in the 10 minutes before each departure of the operator's published frequency. No boat where an AIS vessel lies within
// 25 m of the berth (layers/ships.js). Nothing moves on the river here. Tap a pier, a boat or a ship for its card.
// ?piers=0 starts with the layer off; ?piers=all puts a boat at every berth (a test view, not a timetable).
// Skills: docklands-3d-page ("Three.js port"), cwplans-river-and-water ("Piers and berthed vessels").
import { WU } from '../water.js';
import { MFP } from '../build.js';
import { belfast, clipper, tourBoat, ferryBoat, berthed, vesselMaterial, GB, PAL } from '../piers-models.js';
import { vec3, mix } from 'three/tsl';

const KIND = { 'river-bus': 'river-bus pier (TfL London River Services)', ferry: 'ferry pier (TfL RB4)', tour: 'tour-boat pier', pier: 'pier', police: 'police pier', marina: 'marina pontoon', jetty: 'jetty or fixed pier' };
const LINE = { rb1: 'RB1', rb4: 'RB4', rb6: 'RB6', 'woolwich-ferry': 'Woolwich Ferry' };
const BOAT = { clipper: { L: 38, B: 8.6, name: 'River-bus catamaran' }, ferry: { L: 24, B: 7, name: 'RB4 ferry' }, citycruises: { L: 34, B: 7.6, name: 'Tour boat (City Cruises)' }, trs: { L: 30, B: 7, name: 'Tour boat (Thames River Sightseeing)' } };
const FB = .75, DREF = 4.25;   // pontoon deck above the water (m); the deck level at which a gangway's length is taken (about high water, m OD)

export default {
  id: 'piers', label: 'Piers and berthed vessels', on: true,
  async init(ctx, on) {
    const { THREE, esc } = ctx, ALL = ctx.qs.get('piers') === 'all';
    const J = await ctx.loadJSON(ctx.DATA + 'piers.json');
    const BUS = await ctx.loadJSON(ctx.WEBGL + '../feeds/river/river-bus.json').catch(e => { console.warn('piers: river-bus.json', e); return null; });
    const group = new THREE.Group(); group.name = 'piers';
    const lev = P => P.water === 'dock' ? P.level : WU.tideLevel.value;
    const loc = (cx, cz, h, lx, lz) => [cx + lx * Math.cos(h) - lz * Math.sin(h), cz + lx * Math.sin(h) + lz * Math.cos(h)];   // local (x across, z along, aft) to grid
    const col = new THREE.Color(), dummy = new THREE.Object3D(), unitBox = () => new THREE.BoxGeometry(1, 1, 1);
    const std = o => new THREE.MeshStandardNodeMaterial({ roughness: .75, metalness: 0, flatShading: true, ...o });
    const PASS = new Set(['river-bus', 'ferry', 'tour', 'pier', 'police']);

    // ---------- floating parts (move with the water): pontoon bodies, decks, rails, posts, shelters; lamp heads
    const parts = [], lamps = [];
    const part = (P, pt, lx, ly, lz, sx, sy, sz, c) => parts.push({ P, pt, lx, ly, lz, sx, sy, sz, c });
    for (const P of J.piers) for (const pt of P.pontoons) {
      const [, , len, wid] = pt, pass = PASS.has(P.kind) && P.water === 'tidal', dock = P.water === 'dock', fb = dock ? .4 : FB, h = dock ? .9 : 1.9;
      part(P, pt, 0, fb - h / 2, 0, wid, h, len, dock ? PAL.wood : PAL.steelDark);
      part(P, pt, 0, fb + .03, 0, Math.max(.5, wid - .3), .08, Math.max(.5, len - .3), dock ? [.42, .36, .3] : [.5, .5, .48]);
      if (!pass) continue;
      const main = P.berth && Math.abs(P.berth.len - len) < .2, bside = main ? Math.sign((P.berth.x - pt[0]) * Math.cos(pt[4]) + (P.berth.z - pt[1]) * Math.sin(pt[4])) || 1 : 0;
      for (const s of [-1, 1]) { if (s === bside) continue;   // rails (not on the berthing side), posts every 3 m
        part(P, pt, s * (wid / 2 - .1), fb + 1.1, 0, .07, .07, len - .4, [.85, .87, .88]); part(P, pt, s * (wid / 2 - .1), fb + .55, 0, .04, .04, len - .4, [.85, .87, .88]);
        for (let z = -len / 2 + .5; z <= len / 2 - .4; z += 3) part(P, pt, s * (wid / 2 - .1), fb + .55, z, .06, 1.1, .06, [.85, .87, .88]); }
      for (let z = -len / 2 + 4; z < len / 2 - 2; z += 12) for (const s of [-1, 1]) {   // lamp posts along both sides
        part(P, pt, s * (wid / 2 - .5), fb + 1.8, z, .12, 3.6, .12, PAL.steelDark); lamps.push({ P, pt, lx: s * (wid / 2 - .5), ly: fb + 3.75, lz: z }); }
      if (main && P.kind !== 'police') {   // a shelter on the main pontoon: roof, posts, a glazed back wall on the landward side
        const sl = Math.min(30, len * .4), sw = Math.min(5, wid * .55), sx = -bside * (wid / 2 - sw / 2 - .6);
        part(P, pt, sx, fb + 2.75, 0, sw + .6, .25, sl + .6, [.78, .8, .82]); part(P, pt, sx - bside * (sw / 2), fb + 1.35, 0, .1, 2.6, sl, PAL.glass);
        for (const z of [-sl / 2, 0, sl / 2]) part(P, pt, sx + bside * (sw / 2), fb + 1.35, z, .15, 2.7, .15, [.78, .8, .82]);
      }
    }
    // guide piles: two per passenger pontoon on the landward side (static: they stand in the river bed)
    const piles = [];
    for (const P of J.piers) if (PASS.has(P.kind) && P.water === 'tidal') for (const pt of P.pontoons) { if (pt[2] < 12) continue;
      const main = P.berth && Math.abs(P.berth.len - pt[2]) < .2, bside = main ? Math.sign((P.berth.x - pt[0]) * Math.cos(pt[4]) + (P.berth.z - pt[1]) * Math.sin(pt[4])) || 1 : 1;
      for (const z of [-pt[2] * .35, pt[2] * .35]) piles.push(loc(pt[0], pt[1], pt[4], -bside * (pt[3] / 2 + .7), z)); }
    const partMesh = new THREE.InstancedMesh(unitBox(), std(), Math.max(1, parts.length)); partMesh.frustumCulled = false; partMesh.castShadow = partMesh.receiveShadow = true;
    parts.forEach((q, i) => partMesh.setColorAt(i, col.setRGB(...q.c)));
    const lampMat = new THREE.MeshBasicNodeMaterial(); lampMat.colorNode = mix(vec3(.32, .32, .3), vec3(1, .78, .45).mul(7), ctx.U.night);
    const lampMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(.28, 8, 6), lampMat, Math.max(1, lamps.length)); lampMesh.frustumCulled = false;
    const pileMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.45, .45, 1, 10).translate(0, .5, 0), std({ color: 0x3a3f44 }), Math.max(1, piles.length)); pileMesh.castShadow = true;
    piles.forEach(([x, z], i) => { dummy.position.set(x, -6, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 13.8, 1); dummy.updateMatrix(); pileMesh.setMatrixAt(i, dummy.matrix); });
    group.add(partMesh, lampMesh, pileMesh);

    // ---------- gangways: the shore end fixed; a long one (over 45 m) is a fixed jetty and a 32 m hinged span at its end
    const fixed = new GB(), triPier = [], mark = P => { const n0 = fixed.p.length / 9; return () => { for (let k = n0; k < fixed.p.length / 9; k++) triPier[k] = P; }; };
    const piling = (x0, z0, x1, z1, top) => { const l = Math.hypot(x1 - x0, z1 - z0); for (let d = 4; d < l - 2; d += 9) { const x = x0 + (x1 - x0) * d / l, z = z0 + (z1 - z0) * d / l; fixed.rod([x, -5, z], [x, top - 1, z], .35, [.36, .38, .4], { seg: 6 }); } };
    const deckBox = (x0, z0, x1, z1, w, top, c) => { const l = Math.hypot(x1 - x0, z1 - z0); if (l < .3) return; fixed.box((x0 + x1) / 2, top - .5, (z0 + z1) / 2, w, 1, l, c, { ry: -Math.atan2(x1 - x0, -(z1 - z0)) }); };
    const gangs = [];
    for (const P of J.piers) for (const g of P.gangways) {
      const [sx, sz, ex, ez, w, pi, h] = g, pt = P.pontoons[pi] || P.pontoons[0]; if (!pt) continue;
      const hz = Math.hypot(ex - sx, ez - sz), ux = (ex - sx) / hz, uz = (ez - sz) / hz;
      let jx = sx, jz = sz; if (hz > 45) { jx = sx + ux * (hz - 32); jz = sz + uz * (hz - 32); const done = mark(P); deckBox(sx, sz, jx, jz, w, h, [.62, .62, .6]); piling(sx, sz, jx, jz, h); done(); }
      const reach0 = Math.hypot(ex - jx, ez - jz), len = Math.hypot(reach0, h - DREF);
      gangs.push({ P, pt, jx, jz, ux, uz, h, w, len, ox: ex - pt[0], oz: ez - pt[1] });
    }
    // fixed piers (OSM outline as a deck), walks (fixed narrow parts) with piles in the river
    for (const P of J.piers) {
      const done = mark(P);
      if (P.rings && P.rings[0].length >= 3) {
        const sh = new THREE.Shape(P.rings[0].map(([x, z]) => new THREE.Vector2(x, -z))); for (const r of P.rings.slice(1)) sh.holes.push(new THREE.Path(r.map(([x, z]) => new THREE.Vector2(x, -z))));
        const G = new THREE.ExtrudeGeometry(sh, { depth: 1.2, bevelEnabled: false }); G.rotateX(-Math.PI / 2); G.translate(0, P.top - 1.2, 0);
        const p = (G.index ? G.toNonIndexed() : G).attributes.position.array, c = P.water === 'dock' ? [.45, .38, .3] : [.6, .6, .58];
        for (let k = 0; k < p.length; k += 9) fixed.tri([p[k], p[k + 1], p[k + 2]], [p[k + 3], p[k + 4], p[k + 5]], [p[k + 6], p[k + 7], p[k + 8]], c);
        G.dispose();
      }
      for (const [x0, z0, x1, z1, w, top] of P.walks) { deckBox(x0, z0, x1, z1, w, top, [.58, .56, .52]); if (P.water === 'tidal') piling(x0, z0, x1, z1, top); }
      done();
    }
    const fixedMesh = new THREE.Mesh(fixed.geometry(), vesselMaterial(ctx.U.night)); fixedMesh.castShadow = fixedMesh.receiveShadow = true; group.add(fixedMesh);
    const gangMesh = new THREE.InstancedMesh(unitBox(), std(), Math.max(1, gangs.length * 3)); gangMesh.frustumCulled = false; gangMesh.castShadow = true;
    for (let i = 0; i < gangs.length * 3; i++) gangMesh.setColorAt(i, col.setRGB(...(i % 3 ? [.86, .88, .9] : [.55, .6, .63])));
    group.add(gangMesh);

    // ---------- berthed vessels (OSM outlines): HMS Belfast at true size, the others by type
    const vmat = vesselMaterial(ctx.U.night), vessels = [];
    for (const v of J.vessels) {
      const isB = v.kind === 'cruiser', G = isB ? belfast(187, 21) : berthed(v.kind, v.L, v.B), m = new THREE.Mesh(G, vmat);
      m.castShadow = m.receiveShadow = true; m.userData.vessel = v; m.rotation.y = -v.heading; m.position.set(v.x, 0, v.z); group.add(m);
      vessels.push({ v, m, ph: Math.random() * 6, amp: isB ? .02 : .06 });
    }
    // the model buildings of those outlines are hidden while the layer is on (buildBuildings opts.skip; main.js's own skip
    // set, the detailed glTF models, is rebuilt here from building-models.json because the option replaces it)
    const hide = new Set(J.vessels.flatMap(v => v.buildings || [])), base = new Set();
    const BM = await ctx.loadJSON(ctx.DATA + 'building-models.json').catch(() => null);
    if (BM) for (const m of Object.values(BM.models)) if (m.model_fp === MFP && m.mi) for (const i of m.mi) base.add(i);
    const prev = ctx.buildOpts.skip; let visible = on;
    ctx.buildOpts.skip = { has: i => (visible && hide.has(i)) || base.has(i) || !!(prev && prev.has(i)), get size() { return base.size + hide.size; } };
    if (on && hide.size) ctx.rebuildBuildings();

    // ---------- boats alongside (simulated)
    const boatMeshes = {}, BOATCAP = { clipper: 16, ferry: 4, citycruises: 6, trs: 4 };
    for (const [k, cap] of Object.entries(BOATCAP)) { const G = k === 'clipper' ? clipper() : k === 'ferry' ? ferryBoat() : tourBoat(BOAT[k].L, BOAT[k].B, k);
      const m = new THREE.InstancedMesh(G, vmat, cap); m.frustumCulled = false; m.castShadow = m.receiveShadow = true; m.count = 0; m.userData.boat = k; boatMeshes[k] = m; group.add(m); }
    const LDN = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23' });
    const lp = t => { const o = {}; for (const p of LDN.formatToParts(new Date(t))) o[p.type] = p.value; return o; };
    const hmm = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
    const toMin = s => { const m = /^(\d{1,2}):(\d\d)/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
    const schedFits = (name, wd) => { const s = name.toLowerCase(); if (/monday/.test(s)) return wd >= 1 && wd <= 5; if (/saturday and sunday/.test(s)) return wd === 0 || wd === 6; if (/saturday/.test(s)) return wd === 6; if (/sunday/.test(s)) return wd === 0; return false; };
    const calls = new Map();   // naptan -> [{ line, dir, sched, m }]
    if (BUS) for (const it of BUS.items) { if (it.kind !== 'river-bus-timetable') continue; const v = it.values;
      for (const d of v.departures) { const st = v.minutes_to_later_zone_piers_by_interval[d.iv]; if (!st) continue; const t0 = toMin(d.t);
        for (const [n, m] of Object.entries(st)) { if (!calls.has(n)) calls.set(n, []); calls.get(n).push({ line: v.line, dir: v.direction, sched: v.schedule, m: t0 + m }); } } }
    const seasonOf = (S, md) => S.find(([a, b]) => a <= b ? md >= a && md <= b : md >= a || md <= b);
    const berths = J.piers.filter(P => P.berth);
    let boats = [], aisSkip = 0;
    function nowParts() { const p = lp(ctx.clock); return { wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), m: +p.hour * 60 + +p.minute + +p.second / 60, md: `${p.month}-${p.day}` }; }
    function nextBuses(P, n = 4) { const N = nowParts(), out = []; for (const c of calls.get(P.tfl?.naptan) || []) if (schedFits(c.sched, N.wd) && c.m >= N.m) out.push(c); return out.sort((a, b) => a.m - b.m).slice(0, n); }
    function tourDeps(T, N) { const s = seasonOf(T.seasons, N.md); if (!s) return null; const a = toMin(s[2]), b = toMin(s[3]); return { a, b, every: T.every_min, s }; }
    function computeBoats() {
      const N = nowParts(), out = []; aisSkip = 0;
      const ais = (globalThis.__docklands3 && globalThis.__docklands3.layers && globalThis.__docklands3.layers.ships && globalThis.__docklands3.layers.ships.on && globalThis.__docklands3.layers.ships.api.vessels) || [];
      for (const P of berths) {
        const here = [];
        if (P.tfl) { const ferry = P.tfl.lines.length === 1 && P.tfl.lines[0] === 'rb4';
          for (const c of calls.get(P.tfl.naptan) || []) if (schedFits(c.sched, N.wd) && N.m >= c.m - 1.5 && N.m <= c.m + 1 && !(c.line === 'rb4' && here.some(b => b.why.line === 'rb4'))) here.push({ type: c.line === 'rb4' ? 'ferry' : 'clipper', why: c, P });   // RB4 is one shuttle boat: one call shown
          if (ALL && !here.length) here.push({ type: ferry ? 'ferry' : 'clipper', why: { test: true }, P }); }
        for (const T of P.tours || []) { const k = T.operator === 'City Cruises' ? 'citycruises' : 'trs', D = tourDeps(T, N);
          if (D) for (let d = D.a; d <= D.b; d += D.every) if (N.m >= d - 10 && N.m <= d) here.push({ type: k, why: { tour: T, dep: d }, P });
          if (ALL && !here.some(b => b.type === k)) here.push({ type: k, why: { test: true, tour: T }, P }); }
        // the slots along the berth, centred on the berth point
        const B = P.berth, ux = Math.sin(B.up), uz = -Math.cos(B.up), tot = here.reduce((s, b) => s + BOAT[b.type].L + 3, -3); let off = -tot / 2;
        for (const b of here) { const S = BOAT[b.type]; b.along = off + S.L / 2; off += S.L + 3;
          b.x = B.x + B.nx * (S.B / 2 + .5) + ux * b.along; b.z = B.z + B.nz * (S.B / 2 + .5) + uz * b.along;
          b.h = b.why.dir === 'outbound' ? B.up + Math.PI : B.up; b.ph = (P.at[0] * 7 + P.at[1]) % 6 + b.along;
          if (ais.some(a => Math.hypot(a.x - b.x, a.z - b.z) < 25)) { aisSkip++; continue; }
          out.push(b); }
      }
      boats = out;
      for (const k of Object.keys(boatMeshes)) boatMeshes[k].count = 0;
      for (const b of boats) { const m = boatMeshes[b.type]; if (m.count < BOATCAP[b.type]) { b.mesh = m; b.idx = m.count++; } }
      status(); ctx.draw();
    }

    // ---------- each frame: the floating parts follow the water (when it moves 2 mm), boats and ships bob
    let lastCam = null, lastT = null, tick = 0;
    const put = (mesh, i, x, y, z, ry, sx, sy, sz, rx = 0, rz = 0) => { dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz, 'YXZ'); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); };
    function placeFloating() {
      // a part that holds the camera or lies within 3 m of it is hidden: photo views stand on a pontoon (?view=greenlandday was inside its shelter)
      const cp = ctx.camera.position;
      parts.forEach((q, i) => { const [x, z] = loc(q.pt[0], q.pt[1], q.pt[4], q.lx, q.lz), y = lev(q.P) + q.ly, k = Math.hypot(cp.x - x, cp.z - z) < Math.hypot(q.sx, q.sz) / 2 + 3 && cp.y > y - q.sy / 2 - 3 && cp.y < y + q.sy / 2 + 3 ? 0 : 1;
        put(partMesh, i, x, y, z, -q.pt[4], q.sx * k, q.sy * k, q.sz * k); });
      lamps.forEach((q, i) => { const [x, z] = loc(q.pt[0], q.pt[1], q.pt[4], q.lx, q.lz); put(lampMesh, i, x, lev(q.P) + q.ly, z, 0, 1, 1, 1); });
      const a = new THREE.Vector3(), b = new THREE.Vector3(), q4 = new THREE.Quaternion(), m4 = new THREE.Matrix4(), off = new THREE.Vector3();
      gangs.forEach((g, i) => {
        const deck = lev(g.P) + (g.P.water === 'dock' ? .4 : FB), dy = g.h - deck, reach = Math.sqrt(Math.max(.25, g.len * g.len - dy * dy));
        g.ex = g.jx + g.ux * reach; g.ez = g.jz + g.uz * reach; g.deck = deck; g.slope = Math.atan2(dy, reach) * 180 / Math.PI;
        a.set(g.jx, g.h, g.jz); b.set(g.ex, deck, g.ez); dummy.position.copy(a).add(b).multiplyScalar(.5); dummy.scale.set(1, 1, 1); dummy.lookAt(b); q4.copy(dummy.quaternion);
        const L = a.distanceTo(b);
        m4.compose(dummy.position, q4, new THREE.Vector3(g.w, .3, L)); gangMesh.setMatrixAt(3 * i, m4);
        for (const s of [-1, 1]) { off.set(s * g.w / 2, .65, 0).applyQuaternion(q4).add(dummy.position); m4.compose(off, q4, new THREE.Vector3(.12, 1.1, L)); gangMesh.setMatrixAt(3 * i + 1 + (s > 0 ? 1 : 0), m4); }
      });
      for (const m of [partMesh, lampMesh, gangMesh]) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }
      partMesh.instanceColor.needsUpdate = true; gangMesh.instanceColor.needsUpdate = true;
    }
    function frame() {
      if (!visible) return;
      const T = WU.tideLevel.value, cq = ctx.camera.position; if (lastT == null || Math.abs(T - lastT) > .002 || !lastCam || lastCam.distanceTo(cq) > 2) { lastT = T; lastCam = (lastCam || cq.clone()).copy(cq); placeFloating(); }
      const t = performance.now() / 1000, amp = .04 + Math.min(12, WU.windSpeed.value) * .01;
      // a vessel or boat that holds the camera (a photo view taken from a pier, e.g. ?view=greenlandday) is hidden: the lens is not inside a hull
      const cp = ctx.camera.position, near = (x, z, r, y) => cp.y < y + 25 && Math.hypot(cp.x - x, cp.z - z) < r;
      for (const s of vessels) { s.m.visible = !near(s.v.x, s.v.z, (s.v.len || 30) * .6 + 2, s.v.water === 'dock' ? s.v.level : T); }
      for (const s of vessels) { const w = s.v.water === 'dock' ? s.v.level : T; s.m.position.y = w + Math.sin(t * .9 + s.ph) * s.amp; s.m.rotation.set(Math.sin(t * .5 + s.ph) * s.amp * .02, -s.v.heading, Math.sin(t * .7 + s.ph) * s.amp * .05, 'YXZ'); }
      for (const b of boats) { if (!b.mesh) continue; const sc = near(b.x, b.z, 24, lev(b.P)) ? 0 : 1; put(b.mesh, b.idx, b.x, lev(b.P) + Math.sin(t * 1.3 + b.ph) * amp, b.z, -b.h, sc, sc, sc, Math.sin(t * .8 + b.ph) * amp * .01, Math.sin(t * 1.1 + b.ph) * amp * .03); }
      for (const m of Object.values(boatMeshes)) { m.instanceMatrix.needsUpdate = true; if (m.count) m.computeBoundingSphere(); }
      placeLabels();
    }

    // ---------- labels: the passenger piers and the named berthed vessels
    const host = document.getElementById('labels'), LBL = [];
    if (!document.getElementById('piersCss')) { const st = document.createElement('style'); st.id = 'piersCss'; st.textContent = '.lab.pier{border:1px solid #7fc4ff;color:#dff0ff;pointer-events:auto;cursor:pointer;font:inherit;font-size:12px}.lab.pier.ship{border-color:#e6c46b;color:#fff3cf}'; document.head.appendChild(st); }
    const named = (t, x, z) => ctx.A.places.some(p => p.name === t && Math.hypot(p.x - x, p.z - z) < 150);   // the page's own place labels already name it
    const label = (text, x, y, z, open, ship) => { if (!host || named(text, x, z)) return; const el = document.createElement('button'); el.type = 'button'; el.className = 'lab pier' + (ship ? ' ship' : ''); el.textContent = text; el.onclick = open; el.hidden = true; host.appendChild(el); LBL.push({ el, v: new THREE.Vector3(x, y, z), ship, far: ship === 'big' ? 4000 : 1500 }); };
    for (const P of J.piers) if ((P.berth || (P.name && P.kind === 'police')) && !(P.name && named(P.name, P.at[0], P.at[1]))) label(P.tfl ? P.tfl.name : P.name, P.at[0], 12, P.at[1], () => pierCard(P));
    for (const s of vessels) if (s.v.name) label(s.v.name, s.v.x, s.v.kind === 'cruiser' ? 50 : 18, s.v.z, () => vesselCard(s), s.v.kind === 'cruiser' ? 'big' : true);
    const v3 = new THREE.Vector3();
    function placeLabels() {
      const W = innerWidth, H = innerHeight, cam = ctx.camera.position, on2 = visible && ctx.U.cut.value >= 250;
      for (const l of LBL) { v3.copy(l.v).project(ctx.camera); const x = (v3.x + 1) / 2 * W, y = (1 - v3.y) / 2 * H, d = l.v.distanceTo(cam);
        const vis = on2 && v3.z < 1 && x > 0 && x < W && y > 40 && y < H && d < l.far;
        if (vis) l.el.style.transform = `translate(${x | 0}px,${y | 0}px) translate(-50%,-100%)`; if (l.el.hidden === vis) l.el.hidden = !vis; }
    }

    // ---------- cards
    const osmLink = id => { const m = /^osm:(way|relation|node)\/(\d+)$/.exec(id || ''); return m ? `<a href="https://www.openstreetmap.org/${m[1]}/${m[2]}" target="_blank" rel="noopener">OpenStreetMap ${m[1]} ${m[2]}</a>` : ''; };
    const OSMC = `<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>`;
    const row = (k, v) => v != null && v !== '' ? `<tr><td>${k}</td><td>${v}</td></tr>` : '';
    function pierCard(P) {
      const N = nowParts(), here = boats.filter(b => b.P === P), pt = P.pontoons[0], gs = gangs.filter(g => g.P === P);
      const tours = (P.tours || []).map(T => { const D = tourDeps(T, N); return `${esc(T.operator)}: ${D ? `${T.assumed ? 'assumed ' : ''}every ${T.every_min} min, ${hmm(D.a)} to ${hmm(D.b)} (this season)` : 'no sailings this season'} · <a href="${esc(T.url)}" target="_blank" rel="noopener">operator page</a> (read ${esc(T.read)})`; }).join('<br>');
      const nb = P.tfl ? nextBuses(P) : [];
      ctx.showCard(`<h2>${esc(P.tfl ? P.tfl.name : P.name || 'Pier')}</h2><p class="small">${esc(KIND[P.kind] || P.kind)}${P.name && P.tfl && P.name !== P.tfl.name ? ` · OSM name ${esc(P.name)}` : ''}</p><table>` +
        row('Operator', P.osm && P.osm.operator ? esc(P.osm.operator) : P.tfl ? 'London River Services (TfL) pier; river buses run by Uber Boat by Thames Clippers' : null) +
        row('Routes', P.tfl ? P.tfl.lines.map(l => LINE[l] || l).join(', ') : null) + row('Tour boats', tours || null) +
        row('Next river buses', P.tfl ? (nb.length ? nb.map(c => `${hmm(c.m)} ${LINE[c.line] || c.line} ${c.dir}`).join('; ') : 'none later this day in the timetables held') : null) +
        row('Alongside now', P.berth ? (here.length ? here.map(b => `${BOAT[b.type].name}${b.why.test ? ' (test view)' : b.why.m != null ? ` (${LINE[b.why.line]} call ${hmm(b.why.m)})` : b.why.dep != null ? ` (departs ${hmm(b.why.dep)})` : ''}`).join('; ') + ' — simulated' : 'no boat (simulated from the timetable)') : null) +
        row('Structure', `${P.float ? 'floating pontoon' + (P.pontoons.length > 1 ? 's' : '') : 'fixed deck'}${pt ? `, ${pt[2].toFixed(0)} x ${pt[3].toFixed(0)} m` : ''}${gs.length ? `, ${gs.length} gangway${gs.length > 1 ? 's' : ''}` : ''}`) +
        row('Now', P.float ? `deck ${(lev(P) + (P.water === 'dock' ? .4 : FB)).toFixed(2)} m OD on water at ${lev(P).toFixed(2)} m OD${gs.length ? `; gangway slope ${gs[0].slope.toFixed(1)}°` : ''}` : P.top != null ? `deck ${P.top.toFixed(1)} m OD` : null) +
        `</table><p class="small">Shape: ${osmLink(P.id) || 'no OSM pier shape (' + esc(P.synthetic || '') + ')'}, ${OSMC}, extract of ${esc(String(J.meta.osm_data_as_of).slice(0, 10))}. ` +
        `${P.tfl ? `Pier and lines: <a href="${esc(P.tfl.url)}" target="_blank" rel="noopener">TfL StopPoint ${esc(P.tfl.naptan)}</a>, timetables of ${esc(String(BUS?.meta?.fetched || '').slice(0, 10))}. Powered by TfL Open Data. ` : ''}` +
        `Boats alongside are SIMULATED from the TfL timetable (1.5 min before to 1 min after a call) or the operator's frequency (10 min before a departure), not positions; live vessels are in Ships (AIS). Pontoon and gangway cut from the OSM shape by tools/build-piers.mjs.</p>`);
    }
    function vesselCard(s) {
      const v = s.v, F = v.facts, y = s.m.position.y;
      const body = F ? `<p>${esc(F.summary)}</p><table>${row('Length', `${F.length_m} m`)}${row('Beam', `${F.beam_m} m (${esc(F.beam_note)})`)}${row('Draught', `${F.draught_m} m`)}${row('Displacement', `${F.displacement_t.toLocaleString()} t`)}${row('Main guns', esc(F.armament))}${row('Paint', esc(F.paint))}${row('Here', `bow heading ${(v.heading * 180 / Math.PI).toFixed(0)}° (grid), waterline at ${y.toFixed(2)} m OD (the tide now)`)}</table>` +
        `<p class="small">Sources: ${F.sources.map(q => `<a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.title)}</a>`).join('; ')}. ${OSMC}. Model: low-poly, true length and beam; turrets, superstructure, funnels and tripod masts after published drawings in outline only; turrets shown trained fore and aft.</p>`
        : `<table>${row('Type', esc(v.wd && v.wd.description || v.kind))}${row('Size (OSM outline)', `${v.L.toFixed(0)} x ${v.B.toFixed(0)} m`)}${row('Built', v.osm && v.osm.start_date ? esc(v.osm.start_date) : null)}${row('Water', v.water === 'dock' ? `dock, ${v.level} m OD` : 'tidal: floats at the tide in this model')}</table>` +
          `<p class="small">${osmLink(v.id)}${v.wikidata ? ` · <a href="https://www.wikidata.org/wiki/${esc(v.wikidata)}" target="_blank" rel="noopener">Wikidata ${esc(v.wikidata)}</a> (CC0)` : ''}${v.osm && v.osm.website ? ` · <a href="${esc(v.osm.website)}" target="_blank" rel="noopener">website</a>` : ''}. ${OSMC}. A generic model of its type (${esc(v.kind)}) sized by the outline, not a model of this vessel.</p>`;
      ctx.showCard(`<h2>${esc(v.name || 'Vessel')}</h2><p class="small">berthed vessel</p>${body}`);
    }
    function boatCard(b) {
      const S = BOAT[b.type], w = b.why;
      ctx.showCard(`<h2>${esc(S.name)}</h2><p class="small">SIMULATED boat alongside ${esc(b.P.tfl ? b.P.tfl.name : b.P.name)}</p><table>` +
        row('Why here', w.test ? 'test view (?piers=all): a boat at every berth' : w.m != null ? `${LINE[w.line] || w.line} ${esc(w.dir)}, timetabled call ${hmm(w.m)} (${esc(w.sched)})` : `${esc(w.tour.operator)} departure ${hmm(w.dep)} (${w.tour.assumed ? 'assumed' : 'published'} frequency every ${w.tour.every_min} min)`) +
        row('Model', `${S.L} x ${S.B} m, generic livery (no names or logos)`) + `</table><p class="small">Not a position report: the TfL timetable or the operator's published frequency says a boat calls about now. Live vessels: Ships (AIS). Powered by TfL Open Data.</p>`);
    }

    // ---------- tap: a pier part, a gangway, a fixed deck, a boat or a ship
    ctx.addPick(ray => {
      if (!visible) return null;
      const objs = [partMesh, gangMesh, fixedMesh, ...vessels.map(s => s.m), ...Object.values(boatMeshes).filter(m => m.count)];
      const hit = ray.intersectObjects(objs, false)[0]; if (!hit) return null; const o = hit.object;
      if (o === partMesh) { const P = parts[hit.instanceId]?.P; return P && { distance: hit.distance, open: () => pierCard(P) }; }
      if (o === gangMesh) { const g = gangs[Math.floor(hit.instanceId / 3)]; return g && { distance: hit.distance, open: () => pierCard(g.P) }; }
      if (o === fixedMesh) { const P = triPier[hit.faceIndex]; return P && { distance: hit.distance, open: () => pierCard(P) }; }
      if (o.userData.vessel) { const s = vessels.find(q => q.m === o); return { distance: hit.distance, open: () => vesselCard(s) }; }
      if (o.userData.boat) { const b = boats.find(q => q.mesh === o && q.idx === hit.instanceId); return b && { distance: hit.distance, open: () => boatCard(b) }; }
      return null;
    });

    // ---------- menu
    ctx.ui.section('Piers and berthed vessels');
    const setVisible = v => { visible = v; group.visible = v; for (const l of LBL) l.el.hidden = true; if (hide.size) ctx.rebuildBuildings(); if (v) { lastT = null; computeBoats(); } ctx.draw(); };
    ctx.ui.toggle('Piers, pontoons and berthed vessels', on, setVisible);
    const note = ctx.ui.note('');
    function status() {
      const c = J.meta.counts;
      note.innerHTML = esc(`${c.piers} piers and pontoons (${c.floating} floating, following the tide; ${c.river_bus} river-bus piers, ${c.tour} tour-boat piers), ${c.gangways} gangways, ${vessels.length} berthed vessels (HMS Belfast at true size). ` +
        `Boats alongside now: ${boats.length}${aisSkip ? ` (${aisSkip} left out: an AIS vessel at the berth)` : ''}${ALL ? ' — test view, a boat at every berth' : ''}. These boats are SIMULATED from the TfL timetable and the tour operators' published frequencies, not positions. `) +
        `Sources: ${OSMC} (extract of ${esc(String(J.meta.osm_data_as_of).slice(0, 10))}); Powered by TfL Open Data; Wikidata (CC0); IWM; operators' pages (facts only).`;
      ctx.stats.piers = { piers: c.piers, pontoons: c.pontoons, gangways: gangs.length, parts: parts.length, lamps: lamps.length, vessels: vessels.length, boats: boats.length, aisSkip, hidden_buildings: hide.size, fixed_triangles: fixed.p.length / 9 };
    }

    // ---------- start
    ctx.onFrame(frame); group.visible = on; computeBoats(); placeFloating();
    setInterval(() => { tick++; if (visible) computeBoats(); }, 15000);
    let lastClock = ctx.clock; setInterval(() => { if (Math.abs(ctx.clock - lastClock) > 30e3) { lastClock = ctx.clock; if (visible) computeBoats(); } }, 1000);
    return { object: group, setVisible, ownUi: true, get boats() { return boats.map(b => ({ type: b.type, pier: b.P.tfl ? b.P.tfl.name : b.P.name, x: b.x, z: b.z, h: b.h })); }, get vessels() { return vessels.map(s => ({ name: s.v.name, kind: s.v.kind, x: s.v.x, z: s.v.z, y: s.m.position.y })); },
      piers: J.piers, computeBoats, pierCard: name => { const P = J.piers.find(q => q.name === name || q.tfl?.name === name); if (P) pierCard(P); }, vesselCard: name => { const s = vessels.find(q => q.v.name === name); if (s) vesselCard(s); } };
  },
};
