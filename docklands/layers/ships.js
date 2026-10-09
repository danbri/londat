// Layer "ships" of the Three.js port (docklands/): vessels from AIS, as the WebGL page's ships-layer.js (Layers > River >
// Ships (AIS), on by default): the same sources, private-craft rule, card and refresh (the data part: ../ships-data.js).
// Drawing: low-poly hulls sized by AIS length and beam, a superstructure, a mast and a plate coloured by type (passenger
// orange, high-speed cyan, tug yellow, cargo green, tanker red, aids to navigation violet), an arrow ahead of the bow when
// under way, labels for ships of 60 m or more; at night navigation lights (masthead and stern white, port red, starboard
// green, each in its sector; one all-round white when moored or at anchor) as emissive points that the bloom picks up.
// Hulls float at the water: tidal polygons at WU.tideLevel (water.js shared contract), docks at their polygon level.
// Motion: each moving vessel is dead-reckoned from its last report along its course at its speed (and the change of speed
// between two reports), up to 3 minutes, and a new report blends in over 2 s. The page clock: when it is now (not moved by
// the visitor, or within 5 minutes of now) the live data; else the snapshot nearest the clock from the londat hourly cache
// (or the committed snapshot), at its reported positions; no snapshot within 24 hours: moving vessels hidden (the note says so).
// Wakes: each frame the nearest MAXW moving vessels go to water.js setWakes(). AIS headings are true; the page frame is
// the British National Grid, so they are turned by the grid convergence (about 1.5 degrees here).
// ?ships=0 starts with the layer off; ?ships=test: 4 synthetic vessels on the Thames between Canary Wharf Pier and
// Greenland Pier (no fetch); ?ais=snapshot: the committed file only (no live, no cache; for comparing with the WebGL page).
// Skills: docklands-3d-page ("Ships (AIS)", "Three.js port"), cwplans-river-and-water ("AIS: Open Waters"), cwplans-londat-cache.
import { WU, MAXW, setWakes } from '../water.js';
import * as D from '../ships-data.js';
import { vec3, float } from 'three/tsl';

const KN = 0.514444, CAP_S = 180, BLEND = 2000, NOW_TOL = 5 * 60e3, HIST_MAX = 24 * 3600e3, CAP = 256;
const deg = Math.PI / 180, wrap = a => { a %= 2 * Math.PI; return a < -Math.PI ? a + 2 * Math.PI : a > Math.PI ? a - 2 * Math.PI : a; };
const okDeg = (a, max) => a != null && isFinite(a) && a >= 0 && a < max ? a : null;   // AIS: heading 511 and course 360 = not available

export default {
  id: 'ships', label: 'Ships (AIS)', on: true,
  async init(ctx, on) {
    const { THREE, A, qs, esc } = ctx, TEST = qs.get('ships') === 'test', ONLY_SNAPSHOT = qs.get('ais') === 'snapshot';
    const G = A.meta.geo, geo = (lon, lat) => { const a = lon - G.lon0, b = lat - G.lat0, t = [1, a, b, a * b, a * a, b * b]; return [t.reduce((s, v, i) => s + v * G.x[i], 0), t.reduce((s, v, i) => s + v * G.z[i], 0)]; };
    const E = A.meta.extent, inBox = (x, z) => x >= E.x0 && x <= E.x1 && z >= E.z0 && z <= E.z1;
    const conv = (lon, lat) => { const [x0, z0] = geo(lon, lat), [x1, z1] = geo(lon, lat + 1e-3); return Math.atan2(x1 - x0, -(z1 - z0)); };   // grid bearing of true north

    // ---------- water level under a point: tidal polygons follow WU.tideLevel, the others their own level
    const WATER = A.water.map(w => { const f = ctx.dec(w.p); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < f.length; i += 2) { x0 = Math.min(x0, f[i]); x1 = Math.max(x1, f[i]); z0 = Math.min(z0, f[i + 1]); z1 = Math.max(z1, f[i + 1]); }
      return { w, f, st: [0, ...(w.holes || []), f.length / 2], x0, x1, z0, z1 }; });
    const inPoly = (P, x, z) => { if (x < P.x0 || x > P.x1 || z < P.z0 || z > P.z1) return false; let c = false; const f = P.f;
      for (let r = 0; r < P.st.length - 1; r++) for (let i = P.st[r], j = P.st[r + 1] - 1; i < P.st[r + 1]; j = i++) { const ax = f[2 * i], az = f[2 * i + 1], bx = f[2 * j], bz = f[2 * j + 1]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) c = !c; }
      return c; };
    const polyAt = (x, z) => { let hit = null; for (const P of WATER) if (inPoly(P, x, z)) hit = P; return hit; };   // later polygons win, as in water.js
    const levelOf = S => { if (!S.poly || Math.hypot(S.x - S.px, S.z - S.pz) > 10) { S.poly = polyAt(S.x, S.z) || 0; S.px = S.x; S.pz = S.z; }
      const P = S.poly; return P ? (P.w.tidal ? WU.tideLevel.value : P.w.level) : Math.max(ctx.groundAt(S.x, S.z), WU.tideLevel.value); };

    // ---------- geometry: unit hull (bow at z -0.5, beam 1, keel -0.35 to deck 1), boxes, arrow, light points
    function hullGeometry() {
      const top = [[-.5, .5], [.5, .5], [.5, -.12], [.32, -.36], [0, -.5], [-.32, -.36], [-.5, -.12]], bot = top.map(([x, z]) => [x * .72, z * .9]), p = [];
      const v = (a, y) => p.push(a[0], y, a[1]), n = top.length;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; v(top[i], 1); v(bot[i], -.35); v(top[j], 1); v(top[j], 1); v(bot[i], -.35); v(bot[j], -.35); }
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; p.push(0, 1, 0); v(top[j], 1); v(top[i], 1); }   // deck
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return g;
    }
    function arrowGeometry() {
      const P = [[-.08, 0], [.08, 0], [.08, -.7], [.25, -.7], [0, -1], [-.25, -.7], [-.08, -.7]], T = [0, 1, 2, 0, 2, 6, 3, 4, 5], p = [];
      for (const k of T) p.push(P[k][0], 0, P[k][1]);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return g;
    }
    const unitBox = () => new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0);
    const solid = () => new THREE.MeshStandardNodeMaterial({ roughness: .6, metalness: 0, flatShading: true });
    const group = new THREE.Group(); group.name = 'ships';
    const inst = (geo, mat, cap, shadow = true) => { const m = new THREE.InstancedMesh(geo, mat, cap); m.frustumCulled = false; m.castShadow = shadow; m.receiveShadow = true;
      const c = new THREE.Color(1, 1, 1); for (let i = 0; i < cap; i++) m.setColorAt(i, c); m.count = 1; m.visible = false; group.add(m); return m; };
    // the plate is unlit: by night it dims to 15 % (at full brightness a plate on a ship moored near a photo view's eye filled the frame, 2026-10-09);
    // the instance colour multiplies this colour (NodeMaterial applies instanceColor after colorNode)
    const plateMat = new THREE.MeshBasicNodeMaterial(); plateMat.colorNode = vec3(1).mul(float(1).sub(ctx.U.night.mul(0.85)));
    const hulls = inst(hullGeometry(), solid(), CAP * 2), supers = inst(unitBox(), solid(), CAP), masts = inst(unitBox(), solid(), CAP), plates = inst(unitBox(), plateMat, CAP, false);   // the type plate unlit, a marker by day and night (the WebGL page draws its ships at full brightness)
    const arrowMat = solid(); arrowMat.side = THREE.DoubleSide; const arrows = inst(arrowGeometry(), arrowMat, CAP, false);
    const lamp = c => { const m = new THREE.MeshBasicNodeMaterial(); m.colorNode = vec3(...c).mul(9); return inst(new THREE.OctahedronGeometry(.5, 0), m, CAP * 3, false); };
    const lampW = lamp([1, .95, .85]), lampR = lamp([1, .08, .05]), lampG = lamp([.1, 1, .35]);
    const ALL = [hulls, supers, masts, plates, arrows, lampW, lampR, lampG];
    const col = new THREE.Color(), dummy = new THREE.Object3D();
    const HULL = [.93, .94, .96], BARGE = [.38, .33, .3];

    // ---------- state
    const SH = { from: TEST ? 'test' : 'none', at: null, n: { shown: 0, private: 0, outside: 0, moving: 0 }, err: 0, wait: 60e3, timer: 0, busy: false, lastError: null, mode: 'now', hist: null, attribution: {} };
    const ST = new Map();   // mmsi -> display state
    let visible = on, drawn = [];
    const clock0 = ctx.clock, now0 = Math.abs(clock0 - Date.now()) < NOW_TOL;
    const isNow = () => (ctx.clock === clock0 && now0) || Math.abs(ctx.clock - Date.now()) < NOW_TOL;
    const refTime = () => SH.mode === 'now' ? Date.now() : ctx.clock;

    function setData(list, from, at, extra = {}) {
      const { list: keep, n } = D.filter(list), seen = new Set();
      SH.from = from; SH.at = at; SH.n = { shown: 0, private: n.private, outside: 0, moving: 0, private_counted: extra.n ? extra.n.private_counted : null, nopos: extra.n ? extra.n.nopos : 0 }; SH.run = extra.run || null; SH.gap = extra.gap ?? null;
      for (const v of keep) {
        const [x, z] = geo(v.lon, v.lat); if (!inBox(x, z)) { SH.n.outside++; continue; }
        const c = conv(v.lon, v.lat), hdg = okDeg(v.heading, 360), cog = okDeg(v.cog, 360), spd = (v.sog || 0) * KN, t0 = v.seen ? Date.parse(v.seen) : Date.parse(at);
        const old = ST.get(v.mmsi), L = Math.max(v.length || 20, 8), W = Math.max(v.beam || L / 5, 3);
        let acc = 0; if (old && old.t0 !== t0) { const dt = (t0 - old.t0) / 1000; if (dt > 1 && dt < 900) acc = Math.max(-1.5, Math.min(1.5, (spd - old.spd) / dt)); } else if (old) acc = old.acc;
        const S = { v, x0: x, z0: z, t0, spd, acc, moving: v.kind !== 'aton' && !D.still(v), hd: ((hdg ?? cog ?? 0) * deg) + c, co: ((cog ?? hdg ?? 0) * deg) + c,
          L, W, H: Math.min(1.2 + L / 30, 6), col: D.colOf(v), x, z, h: 0, y: 0, cur: 0, poly: null, px: 0, pz: 0 };
        if (old && old.cur && Math.hypot(old.x - x, old.z - z) < 600) S.blend = { x: old.x, z: old.z, h: old.h, t: performance.now() };
        ST.set(v.mmsi, S); seen.add(v.mmsi); SH.n.shown++; if (S.moving) SH.n.moving++;
      }
      for (const k of [...ST.keys()]) if (!seen.has(k)) ST.delete(k);
      status(); ctx.draw();
    }

    // ---------- the synthetic test (?ships=test): a loop down the west lane and up the east lane of Limehouse Reach
    let PATH = null;
    function testPath() {
      const tidal = WATER.filter(P => P.w.tidal), rows = []; let cx = -710;
      for (let z = -40; z <= 1640; z += 40) { const xs = [];
        for (const P of tidal) { const f = P.f; for (let r = 0; r < P.st.length - 1; r++) for (let i = P.st[r], j = P.st[r + 1] - 1; i < P.st[r + 1]; j = i++) { const az = f[2 * i + 1], bz = f[2 * j + 1]; if ((az > z) !== (bz > z)) xs.push(f[2 * i] + (z - az) / (bz - az) * (f[2 * j] - f[2 * i])); } }
        xs.sort((a, b) => a - b); let best = null; for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k] <= cx && cx <= xs[k + 1]) best = [xs[k], xs[k + 1]];
        if (best) { cx = (best[0] + best[1]) / 2; rows.push([cx, z, best[1] - best[0]]); } }
      const sm = rows.map((r, i) => { const a = rows.slice(Math.max(0, i - 2), i + 3); return [a.reduce((s, q) => s + q[0], 0) / a.length, r[1], Math.min(...a.map(q => q[2]))]; });
      const west = sm.map(([x, z, w]) => [x - w * .22, z]), east = sm.map(([x, z, w]) => [x + w * .22, z]).reverse(), pts = [...west, ...east, west[0]];
      const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      return { pts, s, len: s.at(-1) };
    }
    const along = d => { const P = PATH; d = ((d % P.len) + P.len) % P.len; let i = 1; while (P.s[i] < d) i++;
      const a = P.pts[i - 1], b = P.pts[i], k = (d - P.s[i - 1]) / (P.s[i] - P.s[i - 1]); return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, h: Math.atan2(b[0] - a[0], -(b[1] - a[1])) }; };
    const TESTS = [   // name, ITU type, length, beam, speed m/s, start along the loop (0: the north end of the west lane)
      { mmsi: 900000001, name: 'TEST CLIPPER', ship_type: 40, length: 40, beam: 9, v: 12, d: 150 },
      { mmsi: 900000002, name: 'TEST TUG (towing a barge)', ship_type: 52, length: 25, beam: 8, v: 4, d: 2300, tow: { L: 50, W: 11, gap: 25 } },
      { mmsi: 900000003, name: 'TEST SAILING BARGE', ship_type: 69, length: 25, beam: 6, v: 3, d: 900 },
      { mmsi: 900000004, name: 'TEST POLICE', ship_type: 55, length: 15, beam: 4, v: 9, d: 2900, surge: 3 },
    ];
    function startTest() {
      PATH = testPath(); const T0 = performance.now();
      for (const t of TESTS) { const v = { mmsi: t.mmsi, kind: 'vessel', name: t.name, ship_type: t.ship_type, class: 'A', length: t.length, beam: t.beam, nav_status: 0, sog: t.v / KN, source: 'synthetic', attribution: 'synthetic test vessel (?ships=test), not AIS' };
        ST.set(t.mmsi, { v, test: t, L: t.length, W: t.beam, H: Math.min(1.2 + t.length / 30, 6), col: D.colOf(v), moving: true, x: 0, z: 0, h: 0, y: 0, cur: 1, spd: t.v, acc: 0, co: 0, poly: null, px: 0, pz: 0, T0 }); }
      SH.n = { shown: TESTS.length, private: 0, outside: 0, moving: TESTS.length }; SH.at = new Date().toISOString(); status();
    }
    function stepTest(S, now) {
      const t = S.test, sec = (now - S.T0) / 1000, w = 2 * Math.PI / 40;   // the police boat surges: 9 + 3 sin(w t) m/s (accelerating at the start)
      const d = t.d + t.v * sec + (t.surge ? t.surge * (1 - Math.cos(w * sec)) / w : 0), p = along(d);
      S.x = p.x; S.z = p.z; S.h = S.co = p.h; S.spd = t.v + (t.surge ? t.surge * Math.sin(w * sec) : 0); S.acc = t.surge ? t.surge * w * Math.cos(w * sec) : 0; S.d = d;
    }

    // ---------- data
    async function loadSnapshot() {
      try { const d = await D.loadSnapshot(ctx.loadJSON); SH.meta = d.meta; return d; } catch (e) { SH.lastError = 'snapshot: ' + e.message; status(); return null; }
    }
    async function fetchLive() {
      clearTimeout(SH.timer); if (TEST || ONLY_SNAPSHOT || SH.busy || !visible || document.hidden || SH.mode !== 'now') return; SH.busy = true;
      try { const d = await D.loadLive(); SH.attribution = d.attribution; if (SH.mode === 'now') setData(d.list, 'live', d.at); SH.err = 0; SH.wait = 60e3; SH.lastError = null; }
      catch (e) { SH.err++; SH.wait = Math.min(16 * 60e3, 60e3 * 2 ** SH.err); SH.lastError = e.message; if (SH.from !== 'live' && !SH.triedCache) { SH.triedCache = true; nearestCache(Date.now()).then(r => { if (r && SH.mode === 'now' && SH.from !== 'live' && (!SH.at || Date.parse(r.at) > Date.parse(SH.at))) setData(r.list, 'cache', r.at, r); }); } status(); }
      finally { SH.busy = false; schedule(); }
    }
    function schedule() { clearTimeout(SH.timer); if (!TEST && !ONLY_SNAPSHOT && visible && !document.hidden && SH.mode === 'now') SH.timer = setTimeout(fetchLive, SH.wait); }
    // the cache run nearest time t, or null
    async function nearestCache(t) {
      try { const runs = await D.listRuns(t); if (!runs.length) return null; const run = runs.reduce((a, b) => Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a); return await D.loadRun(run, runs); }
      catch (e) { console.warn('ships cache', e); return null; }
    }
    let histJob = 0;
    async function loadHistory(T) {
      const job = ++histJob; SH.from = 'loading'; status();
      const snap = SH.snapshot || (SH.snapshot = await loadSnapshot()), cache = ONLY_SNAPSHOT ? null : await nearestCache(T); if (job !== histJob) return;
      const cands = [cache, snap && { list: snap.list, at: snap.at, from: 'snapshot' }].filter(Boolean);
      if (!cands.length) { setData([], 'none', null); return; }
      const best = cands.reduce((a, b) => Math.abs(Date.parse(b.at) - T) < Math.abs(Date.parse(a.at) - T) ? b : a), gap = Date.parse(best.at) - T;
      SH.hist = { T, far: Math.abs(gap) > HIST_MAX };
      setData(SH.hist.far ? best.list.filter(v => v.kind === 'aton' || D.still(v)) : best.list, best.from, best.at, { ...best, gap });
    }
    function setMode() {
      const m = TEST ? 'test' : isNow() ? 'now' : 'history';
      if (m === 'now' && SH.mode !== 'now') { SH.mode = 'now'; SH.hist = null; histJob++; (SH.snapshot ? Promise.resolve(SH.snapshot) : loadSnapshot().then(d => (SH.snapshot = d))).then(d => { if (d && SH.mode === 'now') setData(d.list, 'snapshot', d.at); fetchLive(); }); }
      else if (m === 'history' && (SH.mode !== 'history' || Math.abs(ctx.clock - SH.histT) > 10 * 60e3)) { SH.mode = 'history'; SH.histT = ctx.clock; clearTimeout(SH.timer); loadHistory(ctx.clock); }
    }

    // ---------- each frame: positions, instances, lights, labels, wakes
    const v3 = new THREE.Vector3();
    const put = (mesh, i, x, y, z, h, sx, sy, sz, c) => { if (i >= mesh.instanceMatrix.count) return; dummy.position.set(x, y, z); dummy.rotation.set(0, -h, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); if (c) mesh.setColorAt(i, col.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace)); };
    const loc = (S, lx, lz) => [S.x + lx * Math.cos(S.h) - lz * Math.sin(S.h), S.z + lx * Math.sin(S.h) + lz * Math.cos(S.h)];   // local (x starboard, z aft) to grid
    function frame() {
      if (!visible) return;
      const now = performance.now(), ref = refTime(), cam = ctx.camera.position, night = ctx.U.night.value > .02;
      const c = { hull: 0, sup: 0, mast: 0, plate: 0, arrow: 0, W: 0, R: 0, G: 0 }; drawn = [];
      for (const S of ST.values()) {
        if (S.test) stepTest(S, now);
        else {
          let x = S.x0, z = S.z0, h = S.hd;
          if (S.moving) { const dt = Math.max(-CAP_S, Math.min(CAP_S, (ref - S.t0) / 1000)), v1 = Math.max(0, S.spd + S.acc * dt), d = dt * (S.spd + v1) / 2; x += Math.sin(S.co) * d; z -= Math.cos(S.co) * d; S.vnow = v1; }
          if (S.blend) { const k = Math.min(1, (now - S.blend.t) / BLEND), e = k * k * (3 - 2 * k); x = S.blend.x + (x - S.blend.x) * e; z = S.blend.z + (z - S.blend.z) * e; h = S.blend.h + wrap(h - S.blend.h) * e; if (k >= 1) S.blend = null; }
          S.x = x; S.z = z; S.h = h; S.cur = 1;
        }
        const y = levelOf(S) + .1, v = S.v; S.y = y; drawn.push(S);
        if (v.kind === 'aton') { put(masts, c.mast++, S.x, y, S.z, 0, 1.5, 10, 1.5, [.9, .9, .95]); put(plates, c.plate++, S.x, y + 10, S.z, 0, 3, 3, 3, S.col); continue; }
        const { L, W, H } = S, mh = Math.max(5, Math.min(14, L * .35));
        put(hulls, c.hull++, S.x, y, S.z, S.h, W, H, L, HULL);
        const [sx, sz] = loc(S, 0, L * .08); put(supers, c.sup++, sx, y + H, sz, S.h, W * .7, Math.min(2.5 + L / 40, 6), L * .35, S.col);
        const [mx, mz] = loc(S, 0, -L * .05), my = y + H + Math.min(2.5 + L / 40, 6);
        put(masts, c.mast++, mx, my, mz, S.h, .4, mh, .4, S.col); put(plates, c.plate++, mx, my + mh, mz, S.h, 5, 4, 5, S.col);
        if (S.test && S.test.tow) { const p = along(S.d - (L / 2 + S.test.tow.gap + S.test.tow.L / 2)); put(hulls, c.hull++, p.x, levelOf({ x: p.x, z: p.z, px: 0, pz: 0 }) + .1, p.z, p.h, S.test.tow.W, 1.6, S.test.tow.L, BARGE); }
        const moving = S.test || S.moving;
        if (moving) { const spd = S.test ? S.spd : S.vnow ?? S.spd, s = Math.min(10 + spd / KN * 3, 60), [ax, az] = loc(S, 0, -L / 2); put(arrows, c.arrow++, ax, y + 1.5, az, S.h, 20, 1, s, S.col); }
        if (night) {   // lights: each in its sector, as seen from the camera; size grows with distance so they stay a few pixels
          const dist = Math.hypot(cam.x - S.x, cam.y - y, cam.z - S.z), sz = Math.max(.6, Math.min(12, dist * .004));
          const rel = wrap(Math.atan2(cam.x - S.x, -(cam.z - S.z)) - S.h), a = Math.abs(rel), side = 112.5 * deg;
          if (!moving) put(lampW, c.W++, mx, my + mh + 4.5, mz, 0, sz, sz, sz);   // all-round white (moored, at anchor)
          else {
            if (a <= side) put(lampW, c.W++, mx, my + mh + 4.5, mz, 0, sz, sz, sz);   // masthead
            if (a >= side) { const [p, q] = loc(S, 0, L * .5); put(lampW, c.W++, p, y + H + .8, q, 0, sz, sz, sz); }   // stern
            if (rel <= 0 && rel >= -side) { const [p, q] = loc(S, -W * .5, -L * .1); put(lampR, c.R++, p, y + H + 1, q, 0, sz, sz, sz); }   // port
            if (rel >= 0 && rel <= side) { const [p, q] = loc(S, W * .5, -L * .1); put(lampG, c.G++, p, y + H + 1, q, 0, sz, sz, sz); }   // starboard
          }
        }
      }
      const set = (m, n) => { n = Math.min(n, m.instanceMatrix.count); m.count = Math.max(1, n); m.visible = n > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; };
      set(hulls, c.hull); set(supers, c.sup); set(masts, c.mast); set(plates, c.plate); set(arrows, c.arrow); set(lampW, c.W); set(lampR, c.R); set(lampG, c.G);
      placeLabels();
      const wakes = drawn.filter(S => (S.test || S.moving) && (S.test ? S.spd : S.vnow ?? S.spd) > .3).map(S => ({ S, d: (S.x - cam.x) ** 2 + (S.z - cam.z) ** 2 })).sort((a, b) => a.d - b.d).slice(0, MAXW)
        .map(({ S }) => ({ x: S.x, z: S.z, heading: ((S.co % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), speed: S.test ? S.spd : S.vnow ?? S.spd, len: S.L, accel: S.acc || 0 }));
      SH.wakes = wakes.length; if (ctx.stats.ships) ctx.stats.ships.wakes = wakes.length; setWakes(wakes);
    }

    // ---------- labels (ships of 60 m or more, as the WebGL page), tappable
    const host = document.getElementById('labels'), LBL = new Map();
    if (!document.getElementById('shipsCss')) { const st = document.createElement('style'); st.id = 'shipsCss'; st.textContent = '.lab.ais{border:1px solid #ffb36b;color:#ffe6cc;pointer-events:auto;cursor:pointer;font:inherit;font-size:12px}'; document.head.appendChild(st); }
    function placeLabels() {
      const W = innerWidth, H = innerHeight, keep = new Set();
      for (const S of drawn) { if (!(S.v.name && (S.v.length || 0) >= 60) || !host) continue; keep.add(S.v.mmsi);
        let el = LBL.get(S.v.mmsi); if (!el) { el = document.createElement('button'); el.type = 'button'; el.className = 'lab ais'; el.textContent = S.v.name; el.onclick = () => card(S); host.appendChild(el); LBL.set(S.v.mmsi, el); }
        v3.set(S.x, S.y + S.H + 22, S.z).project(ctx.camera); const x = (v3.x + 1) / 2 * W, y = (1 - v3.y) / 2 * H, vis = visible && v3.z < 1 && x > 0 && x < W && y > 40 && y < H;
        if (vis) el.style.transform = `translate(${x | 0}px,${y | 0}px) translate(-50%,-100%)`; if (el.hidden === vis) el.hidden = !vis; }
      for (const [k, el] of LBL) if (!keep.has(k)) { el.remove(); LBL.delete(k); }
    }

    // ---------- record card (ships-layer.js shipCard)
    function card(S) {
      const v = S.v, rows = [], add = (k, val) => { if (val != null && val !== '') rows.push(`<tr><td>${k}</td><td>${esc(val)}</td></tr>`); };
      const lt = iso => { try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; } };
      add('Type', v.kind === 'aton' ? 'aid to navigation' : `${D.GROUP(v.ship_type)}${v.ship_type ? ` (ITU ${v.ship_type})` : ''}`);
      add('Length', v.length ? `${v.length} m${v.beam ? ` x ${v.beam} m` : ''}` : null);
      add('Speed', S.test ? `${(S.spd / KN).toFixed(1)} kn (${S.spd.toFixed(1)} m/s)` : v.sog != null ? `${v.sog} kn` : null);
      add('Course', !S.test && v.cog != null ? `${Math.round(v.cog)}°` : null); add('Heading', !S.test && v.heading != null && v.heading !== 511 ? `${v.heading}°` : null);
      add('Status', v.nav_status != null ? D.NAV[v.nav_status] || `code ${v.nav_status}` : null); add('Destination', v.destination);
      add('Last heard', v.seen ? `${lt(v.seen)} (London time)` : null);
      add('MMSI', S.test ? null : v.mmsi); add('IMO', v.imo); add('Call sign', v.callsign); add('Flag', v.flag);
      const scoping = v.source === 'aishub' || v.source === 'aisstream', what = { live: 'live', snapshot: 'snapshot', cache: 'hourly cache', test: 'synthetic test' }[SH.from] || SH.from;
      const when = SH.mode === 'history' ? `Positions as reported at ${esc(lt(SH.at))} (the snapshot nearest the page clock), not now.` : S.moving && !S.test ? 'Position now: dead-reckoned from the last report along the course at the reported speed, 3 minutes at most.' : '';
      ctx.showCard(`<h2>${esc(v.name || 'MMSI ' + v.mmsi)}</h2><p class="small">AIS · ${esc(what)}</p><table>${rows.join('')}</table>` +
        `<p class="small">Source: ${esc(v.attribution)} (event source: ${esc(v.source)}). ${scoping ? 'Shown for scoping; licence under review (AISHub / aisstream.io).' : ''} ` +
        `${S.test ? '' : `<a href="https://ais.openwaters.io/v1/vessels/${esc(v.mmsi)}" target="_blank" rel="noopener">Open Waters record</a>. `}Not for navigation. ${when}</p>`);
    }
    // tap: the vessel nearest the ray within its half length, or a few pixels' worth at a distance
    ctx.addPick(ray => {
      if (!visible) return null; let best = null; const o = ray.ray.origin, d = ray.ray.direction;
      for (const S of drawn) { const cy = S.y + (S.v.kind === 'aton' ? 6 : S.H + 3), t = (S.x - o.x) * d.x + (cy - o.y) * d.y + (S.z - o.z) * d.z; if (t <= 0) continue;
        const px = o.x + d.x * t - S.x, py = o.y + d.y * t - cy, pz = o.z + d.z * t - S.z, r = Math.max(S.L * .55, t * .012);
        if (px * px + py * py + pz * pz < r * r && (!best || t < best.distance)) best = { distance: t - r * .5, open: () => card(S) }; }
      return best;
    });

    // ---------- the menu: toggle and note
    ctx.ui.section('Ships (AIS)');
    const note = document.createElement('p');
    function status() {
      const lt = iso => { try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso || '?'; } }, n = SH.n;
      const what = SH.from === 'test' ? '4 synthetic test vessels (?ships=test), not AIS' : SH.from === 'loading' ? 'loading the snapshot nearest the page clock…'
        : SH.from === 'live' ? `live from Open Waters AIS, ${lt(SH.at)}` : SH.from === 'cache' ? `hourly cache (londat) run of ${lt(SH.at)}` : SH.from === 'snapshot' ? `snapshot of ${lt(SH.at)} (committed file)` : 'no data';
      const priv = n.private || n.private_counted;
      let s = `${n.shown || 0} vessels and aids to navigation shown, ${what}${priv ? `; ${priv} small private craft not shown` : ''}${n.outside ? `; ${n.outside} outside the model` : ''}${n.nopos ? `; ${n.nopos} listed in that run with no position in the 8 runs before it` : ''}`;
      if (SH.mode === 'history' && SH.from !== 'loading') s += SH.hist && SH.hist.far ? `. No AIS snapshot within 24 hours of the page clock: moving vessels hidden, moored ones from the nearest (${((SH.gap || 0) / 3600e3).toFixed(0)} h away)` : `. The page clock is not now: positions as reported then (${((SH.gap || 0) / 60e3).toFixed(0)} min from the clock)`;
      else if (SH.mode === 'now' && SH.from !== 'test') s += '. Moving vessels are dead-reckoned from their last report, 3 minutes at most';
      if (SH.lastError && SH.err && SH.mode === 'now') s += `; live request failed (${SH.lastError}), next try in ${Math.round(SH.wait / 60e3)} min`;
      note.innerHTML = esc(s + '. Tap a ship for its record. ') + 'Source: <a href="https://openwaters.io/ais/" target="_blank" rel="noopener">Open Waters AIS</a> (AISHub, aisstream.io: shown for scoping, licence under review). Not for navigation.';
      ctx.stats.ships = { from: SH.from, at: SH.at, mode: SH.mode, ...SH.n, wakes: SH.wakes || 0, run: SH.run, gapMin: SH.gap != null ? Math.round(SH.gap / 60e3) : null };
    }
    const setVisible = v => { visible = v; group.visible = v; if (!v) { clearTimeout(SH.timer); setWakes([]); for (const el of LBL.values()) el.hidden = true; } else if (SH.mode === 'now') fetchLive(); ctx.draw(); };
    ctx.ui.toggle(TEST ? 'Ships (test vessels)' : 'Ships (AIS), live', on, setVisible);
    note.className = 'small'; ctx.ui.host().appendChild(note);

    // ---------- start: the WebGL page's order (the committed snapshot, then live) when the clock is now; else history
    ctx.onFrame(frame);
    if (TEST) { SH.mode = 'test'; startTest(); }
    else { SH.mode = 'none'; setMode(); }
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(SH.timer); else if (visible && SH.mode === 'now') fetchLive(); });
    // the page clock may move: check each second. The ships move with the animation loop (on by default); with ?animate=0
    // the page draws only on a change, and the ships take their new positions at the next frame.
    setInterval(() => { if (!TEST) setMode(); }, 1000);
    group.visible = on;
    const api = { object: group, setVisible, ownUi: true, get SH() { return SH; }, get vessels() { return drawn.map(S => ({ mmsi: S.v.mmsi, name: S.v.name, x: S.x, y: S.y, z: S.z, h: S.h, L: S.L, moving: !!(S.test || S.moving), speed: S.test ? S.spd : S.vnow ?? S.spd })); },
      screenOf(mmsi) { const S = drawn.find(q => q.v.mmsi === mmsi); if (!S) return null; v3.set(S.x, S.y + S.H + 3, S.z).project(ctx.camera); return { x: (v3.x + 1) / 2 * innerWidth, y: (1 - v3.y) / 2 * innerHeight, z: v3.z }; },
      isPrivate: D.isPrivate, fetchLive, get meshes() { return ALL; } };
    return api;
  },
};
