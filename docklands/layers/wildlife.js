// Layer "wildlife" of the Three.js port (docklands/): a simulation of the urban and river birds and the foxes of the
// model box, weighted by open records (owner, 2026-10-09: "use real data if you can find it to add urban and marine
// birdlife simulation to appropriate areas ... Occasional fox near woods and parks").
// Data: cwplans/docklands/data/wildlife.json (tools/fetch-wildlife.mjs): open NBN Atlas and GBIF records (CC0, CC BY, OGL;
// not eBird, not CC BY-NC, not GiGL) as counts per species per habitat class and per month, blended with general ecology;
// and a 10 m habitat raster (river = tidal water, dock, pond, park and grass, wood, garden; from area.js water and the green
// areas of trees.json). The animals are simulated: their positions are not observations.
// Population: the ground is cut into 200 m cells; each cell within 800 m of the camera gets its animals from a seeded
// random draw (the same animals each visit): animals per hectare of each habitat class (DENS) x the species weights of
// the file x the species' season (its share of all records by month: the recording effort taken out) x the time of day (sun altitude: roosting at night; foxes from dusk).
// Behaviours: waterfowl paddle and turn at the water's edge, divers (grebe, cormorant, tufted duck, coot) dive and come up
// elsewhere, birds take off and fly low to other water, gulls circle and land on water and roofs, pigeon flocks walk on
// open ground, take off together (boids: a flock centre and each bird steering to its slot) and land on roof edges, foxes
// trot along park and wood edges and quiet streets at dusk and at night. Swimmers float at the water: tidal water at
// WU.tideLevel (water.js), docks and ponds at their polygon level. No wakes (the water layer owns setWakes()).
// Drawing: two instanced meshes (birds, foxes), one draw call each, no shadows; positions, flap and neck in the TSL vertex
// stage from per-instance attributes, colours from a palette by species and part. Real sizes (a pigeon is 0.32 m long);
// animals more than 800 m from the camera are not drawn. ?wildlife=big draws them 4 times larger (to find them).
// Tap: a card with the species, what it is doing, the habitat and the data behind it.
// Skill: docklands-3d-page, "Three.js port".
import { Fn, If, attribute, positionGeometry, instancedDynamicBufferAttribute, uniformArray, uniform, varying, time, vec3, vec4, float, int, sin, cos, sign, min, max } from 'three/tsl';
import { WU } from '../water.js';

const CELL = 200, R_MIN = 800, R_MAX = 3000, CAP_B = 32768, CAP_F = 512, MAX_FOX = 4, TAU = Math.PI * 2;
// animals per hectare of each habitat class in daylight at the peak of the season (stated defaults, general ecology for
// inner London; the species mix within a class comes from the data file)
const DENS = { none: 0.9, river: 0.8, dock: 3.2, pond: 6, park: 2.5, wood: 1.0, garden: 0.6 };
// per species: length m, wingspan m, neck (fraction of length), neck angle (rad, standing/swimming), flap Hz, group
// behaviour, flock size [min, max], colours sRGB [body, head and neck, wing, bill]
const SPEC = {
  feralpigeon: { L: .32, W: .67, nk: .12, up: .9, f: 6, b: 'pigeon', fl: [6, 24], c: [[.55, .57, .62], [.36, .40, .47], [.62, .64, .68], [.25, .25, .25]] },
  woodpigeon: { L: .41, W: .77, nk: .12, up: .9, f: 5, b: 'ground', fl: [1, 5], c: [[.58, .58, .64], [.55, .56, .62], [.5, .5, .56], [.85, .7, .3]] },
  mallard: { L: .58, W: .9, nk: .2, up: 1.15, f: 7, b: 'duck', fl: [2, 6], c: [[.56, .52, .46], [.06, .32, .14], [.45, .38, .3], [.9, .78, .15]] },
  tufted: { L: .43, W: .7, nk: .14, up: 1.2, f: 7, b: 'diver', fl: [2, 8], c: [[.86, .86, .88], [.07, .07, .09], [.08, .08, .1], [.55, .6, .7]] },
  canadagoose: { L: .95, W: 1.7, nk: .38, up: 1.15, f: 3.5, b: 'goose', fl: [3, 12], c: [[.45, .38, .3], [.06, .06, .06], [.36, .31, .26], [.05, .05, .05]] },
  greylag: { L: .82, W: 1.6, nk: .3, up: 1.1, f: 3.5, b: 'goose', fl: [2, 8], c: [[.55, .52, .47], [.58, .55, .5], [.45, .43, .4], [.95, .55, .25]] },
  egyptiangoose: { L: .68, W: 1.4, nk: .3, up: 1.1, f: 4, b: 'goose', fl: [2, 4], c: [[.72, .6, .46], [.78, .7, .6], [.25, .22, .2], [.9, .5, .55]] },
  coot: { L: .38, W: .75, nk: .13, up: 1.1, f: 6, b: 'diver', fl: [1, 6], c: [[.08, .08, .09], [.07, .07, .08], [.1, .1, .11], [.95, .95, .95]] },
  moorhen: { L: .33, W: .52, nk: .15, up: 1.1, f: 6, b: 'duck', fl: [1, 3], c: [[.17, .17, .22], [.15, .15, .2], [.25, .22, .15], [.85, .15, .1]] },
  cormorant: { L: .9, W: 1.45, nk: .3, up: 1.05, f: 4, b: 'diver', fl: [1, 3], c: [[.1, .1, .11], [.12, .12, .12], [.12, .13, .12], [.75, .65, .3]] },
  muteswan: { L: 1.5, W: 2.3, nk: .45, up: 1.05, f: 2.5, b: 'duck', fl: [1, 3], c: [[.96, .96, .94], [.95, .95, .93], [.93, .93, .9], [.95, .45, .1]] },
  gcgrebe: { L: .48, W: .85, nk: .28, up: 1.3, f: 6, b: 'diver', fl: [1, 2], c: [[.62, .56, .5], [.45, .26, .15], [.4, .37, .35], [.85, .4, .4]] },
  bhgull: { L: .37, W: 1.0, nk: .14, up: .9, f: 3.2, b: 'gull', fl: [2, 10], c: [[.95, .95, .95], [.35, .25, .22], [.78, .8, .83], [.75, .15, .12]] },
  herringgull: { L: .6, W: 1.4, nk: .15, up: .9, f: 2.8, b: 'gull', fl: [1, 6], c: [[.96, .96, .96], [.95, .95, .95], [.68, .71, .75], [.95, .8, .2]] },
  lbbgull: { L: .55, W: 1.35, nk: .15, up: .9, f: 2.8, b: 'gull', fl: [1, 4], c: [[.95, .95, .95], [.95, .95, .95], [.3, .3, .33], [.95, .8, .2]] },
  commongull: { L: .42, W: 1.15, nk: .14, up: .9, f: 3, b: 'gull', fl: [1, 6], c: [[.95, .95, .95], [.95, .95, .95], [.62, .65, .7], [.85, .85, .3]] },
  gbbgull: { L: .71, W: 1.6, nk: .16, up: .9, f: 2.5, b: 'gull', fl: [1, 2], c: [[.96, .96, .96], [.96, .96, .96], [.12, .12, .13], [.95, .8, .3]] },
  crow: { L: .47, W: .98, nk: .12, up: .8, f: 4, b: 'ground', fl: [1, 3], c: [[.06, .06, .07], [.05, .05, .06], [.07, .07, .08], [.05, .05, .05]] },
  magpie: { L: .45, W: .56, nk: .1, up: .8, f: 5, b: 'ground', fl: [1, 2], c: [[.92, .92, .92], [.05, .05, .06], [.06, .08, .14], [.05, .05, .05]] },
  heron: { L: .95, W: 1.85, nk: .42, up: 1.2, f: 2, b: 'heron', fl: [1, 1], c: [[.62, .64, .67], [.9, .9, .9], [.42, .44, .48], [.85, .7, .3]] },
  fox: { L: 1.0, b: 'fox', fl: [1, 1], c: [[.78, .36, .1], [.8, .4, .14], [.18, .1, .06], [.7, .33, .12]] },
};
const SEASON_PRIOR = { commongull: [1, 1, 1, .5, .05, .05, .05, .1, .4, .8, 1, 1], tufted: [1, 1, .9, .5, .3, .3, .3, .4, .6, .9, 1, 1], bhgull: [1, 1, .9, .5, .3, .3, .5, .8, .9, 1, 1, 1], lbbgull: [.5, .5, .7, 1, 1, 1, 1, 1, .9, .7, .5, .5] };
const DOING = { swim: 'paddling', dive: 'diving (under water)', fly: 'flying', soar: 'circling', walk: 'walking and feeding', perch: 'resting on a roof edge', stand: 'standing at the edge, fishing', roost: 'roosting', trot: 'trotting', sniff: 'stopping to sniff' };

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const wrap = a => { a %= TAU; return a < -Math.PI ? a + TAU : a > Math.PI ? a - TAU : a; };

export default {
  id: 'wildlife', label: 'Birds and foxes (simulated)', on: true,
  async init(ctx, on) {
    const { THREE, A, esc } = ctx, t0 = performance.now();
    const D = await ctx.loadJSON(ctx.DATA + 'wildlife.json');
    // Menu > Layers > Wildlife: "More animals" (x1 to x10,000; owner, 2026-10-09: "create a checkbox for 1000x wildlife ...
    // maybe 10000x or whatever - just lots, maybe a slider") and "Size" (x1 to x20, to see them from a high view). The
    // radius round the camera follows its height above the ground (R_MIN to R_MAX), so a high view also gets animals.
    let ABUND = Math.min(10000, Math.max(1, +(ctx.qs.get('wildlifex') || 1) || 1)), SIZE = ctx.qs.get('wildlife') === 'big' ? 4 : Math.min(20, Math.max(1, +(ctx.qs.get('wildlifesize') || 1) || 1)), R_SIM = R_MIN, R_DRAW = R_MIN;
    const SP = D.species.filter(s => SPEC[s.id]), SPI = Object.fromEntries(SP.map((s, i) => [s.id, i]));
    const HC = D.habitats.classes, HI = Object.fromEntries(HC.map((h, i) => [h, i]));

    // ---------- the habitat raster
    const H = D.habitats, R = new Uint8Array(H.nx * H.nz); for (let i = 0, p = 0; i < H.rle.length; i += 2) { R.fill(H.rle[i], p, p + H.rle[i + 1]); p += H.rle[i + 1]; }
    const cls = (x, z) => { const i = Math.floor((x - H.x0) / H.cell), j = Math.floor((z - H.z0) / H.cell); return i < 0 || j < 0 || i >= H.nx || j >= H.nz ? -1 : R[j * H.nx + i]; };
    const wet = c => c >= 1 && c <= 3, green = c => c >= 4;

    // ---------- water level under a point (as layers/ships.js): tidal water at WU.tideLevel, docks and ponds at their own level
    const WATER = A.water.map(w => { const f = ctx.dec(w.p); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < f.length; i += 2) { x0 = Math.min(x0, f[i]); x1 = Math.max(x1, f[i]); z0 = Math.min(z0, f[i + 1]); z1 = Math.max(z1, f[i + 1]); } return { w, f, st: [0, ...(w.holes || []), f.length / 2], x0, x1, z0, z1 }; });
    const inRings = (f, st, x, z) => { let c = false; for (let r = 0; r < st.length - 1; r++) for (let i = st[r], j = st[r + 1] - 1; i < st[r + 1]; j = i++) { const ax = f[2 * i], az = f[2 * i + 1], bx = f[2 * j], bz = f[2 * j + 1]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) c = !c; } return c; };
    const polyAt = (x, z) => { let hit = null; for (const P of WATER) if (x >= P.x0 && x <= P.x1 && z >= P.z0 && z <= P.z1 && inRings(P.f, P.st, x, z)) hit = P; return hit; };
    const waterY = a => a.tidal ? Math.max(WU.tideLevel.value, ctx.groundAt(a.x, a.z) + .05) : a.lvl;

    // ---------- the flat green slabs of the page (build.js greensGeometry: each A.greens polygon flat at the ground under its
    // first vertex + 0.4 m): their top on the 10 m raster grid, so that birds and foxes stand on the slab, not under it
    const GT = new Float32Array(H.nx * H.nz).fill(-1e9);
    for (const g of A.greens) { const f = ctx.dec(g.p), top = ctx.groundAt(f[0], f[1]) + .45, st = [0, ...(g.holes || []), f.length / 2], rows = new Map();
      for (let r = 0; r < st.length - 1; r++) for (let i = st[r]; i < st[r + 1]; i++) { const j = i + 1 < st[r + 1] ? i + 1 : st[r], x0 = f[2 * i], z0 = f[2 * i + 1], x1 = f[2 * j], z1 = f[2 * j + 1];
        const ja = Math.max(0, Math.ceil((Math.min(z0, z1) - H.z0) / H.cell - .5)), jb = Math.min(H.nz - 1, Math.floor((Math.max(z0, z1) - H.z0) / H.cell - .5));
        for (let jj = ja; jj <= jb; jj++) { const zc = H.z0 + (jj + .5) * H.cell; if ((z0 > zc) === (z1 > zc)) continue; if (!rows.has(jj)) rows.set(jj, []); rows.get(jj).push(x0 + (zc - z0) / (z1 - z0) * (x1 - x0)); } }
      for (const [jj, xs] of rows) { xs.sort((a, b) => a - b); for (let q = 0; q + 1 < xs.length; q += 2) for (let ii = Math.max(0, Math.ceil((xs[q] - H.x0) / H.cell - .5)); ii <= Math.min(H.nx - 1, Math.floor((xs[q + 1] - H.x0) / H.cell - .5)); ii++) { const m = jj * H.nx + ii; if (top > GT[m]) GT[m] = top; } } }
    const landY = (x, z) => { const i = Math.floor((x - H.x0) / H.cell), j = Math.floor((z - H.z0) / H.cell), g = ctx.groundAt(x, z); return i < 0 || j < 0 || i >= H.nx || j >= H.nz ? g : Math.max(g, GT[j * H.nx + i]); };

    // ---------- buildings by 200 m cell (first vertex; decoded when a cell needs them): roof edges, and "not inside a building"
    const BK = new Map(), ck = (i, j) => (i + 2048) * 4096 + (j + 2048), unck = k => [Math.floor(k / 4096) - 2048, (k % 4096) - 2048];
    A.buildings.forEach((b, k) => { const key = ck(Math.floor(b.p[0] / 10 / CELL), Math.floor(b.p[1] / 10 / CELL)); if (!BK.has(key)) BK.set(key, []); BK.get(key).push(k); });
    const DEC = new Map();
    const bld = k => { let o = DEC.get(k); if (o) return o; const b = A.buildings[k], f = ctx.dec(b.p), n = b.holes && b.holes.length ? b.holes[0] : f.length / 2; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { x0 = Math.min(x0, f[2 * i]); x1 = Math.max(x1, f[2 * i]); z0 = Math.min(z0, f[2 * i + 1]); z1 = Math.max(z1, f[2 * i + 1]); cx += f[2 * i] / n; cz += f[2 * i + 1] / n; }
      o = { f, n, x0, x1, z0, z1, cx, cz, top: b.b + b.h, h: b.h }; DEC.set(k, o); return o; };
    // a 2.5 m building mask per 200 m cell (scanline fill of the outer rings), made when the cell is first asked
    const MASK = new Map(), MC = 2.5, MN = CELL / MC;
    function maskOf(ci, cj) { const key = ck(ci, cj); let m = MASK.get(key); if (m) return m; m = new Uint8Array(MN * MN); const X0 = ci * CELL, Z0 = cj * CELL;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const k of BK.get(ck(ci + di, cj + dj)) || []) { const o = bld(k); if (o.x1 < X0 || o.x0 > X0 + CELL || o.z1 < Z0 || o.z0 > Z0 + CELL) continue;
        for (let r = Math.max(0, Math.floor((o.z0 - Z0) / MC)); r <= Math.min(MN - 1, Math.floor((o.z1 - Z0) / MC)); r++) { const zc = Z0 + (r + .5) * MC, xs = [];
          for (let i = 0; i < o.n; i++) { const j = (i + 1) % o.n, az = o.f[2 * i + 1], bz = o.f[2 * j + 1]; if ((az > zc) !== (bz > zc)) xs.push(o.f[2 * i] + (zc - az) / (bz - az) * (o.f[2 * j] - o.f[2 * i])); }
          xs.sort((a, b) => a - b); for (let q = 0; q + 1 < xs.length; q += 2) for (let c = Math.max(0, Math.ceil((xs[q] - X0) / MC - .5)); c <= Math.min(MN - 1, Math.floor((xs[q + 1] - X0) / MC - .5)); c++) m[r * MN + c] = 1; } }
      MASK.set(key, m); return m; }
    const inBuilding = (x, z) => { const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), m = maskOf(ci, cj); return m[Math.min(MN - 1, Math.floor((z - cj * CELL) / MC)) * MN + Math.min(MN - 1, Math.floor((x - ci * CELL) / MC))] === 1; };
    const roofSpot = (ci, cj, r) => { const ks = (BK.get(ck(ci, cj)) || []).filter(k => A.buildings[k].h > 7); if (!ks.length) return null; const o = bld(ks[Math.floor(r() * ks.length)]), v = Math.floor(r() * o.n);
      const x = o.f[2 * v], z = o.f[2 * v + 1], d = Math.hypot(o.cx - x, o.cz - z) || 1; return { x: x + (o.cx - x) / d * .4, y: o.top, z: z + (o.cz - z) / d * .4 }; };

    // ---------- species weights by habitat, season and time of day
    const month = () => new Date(ctx.clock).getUTCMonth();
    // the season of a species: its records by month DIVIDED BY all records of that month (the recording effort: surveys and
    // apps peak in April to June, so raw counts put almost every species' peak in May), smoothed over three months, peak 1;
    // the file's raw s.season where a species has no months. Reporting rate, not abundance; see docklands/AUDIT.md, item 4.
    const EFF = new Array(12).fill(0); for (const s of D.species) if (s.months) s.months.forEach((v, i) => { EFF[i] += v; });
    for (const s of SP) { const n = s.months ? s.months.reduce((a, b) => a + b, 0) : 0; if (n < 24 || EFF.some(e => !e)) { s.seasonEff = s.season; continue; }
      const r = s.months.map((v, i) => v / EFF[i]), sm = r.map((v, i) => (r[(i + 11) % 12] + 2 * v + r[(i + 1) % 12]) / 4), mx = Math.max(...sm);
      s.seasonEff = sm.map(v => +(v / mx).toFixed(2)); }
    const season = (s, m) => { const d = s.seasonEff ? .3 + .7 * s.seasonEff[m] : 1, p = SEASON_PRIOR[s.id] ? SEASON_PRIOR[s.id][m] : 1; return Math.sqrt(d * p); };
    const sunAlt = () => (ctx.sky && ctx.sky.state ? ctx.sky.state.sun.alt : 30);
    const phaseOf = alt => alt > 3 ? 'day' : alt > -8 ? 'dusk' : 'night';
    function speciesFor(h, r, ph, m) {   // a species for habitat class h, or null
      let tot = 0; const c = [];
      for (const s of SP) { if (s.id === 'fox') continue; let w = (s.weight[HC[h]] || 0) * season(s, m);
        if (ph === 'night' && /^(woodpigeon|crow|magpie)$/.test(s.id)) w = 0;   // in the trees at night
        if (ph === 'night' && s.id === 'feralpigeon' && h === HI.none) w = 0;   // on the ledges at night (roof perches)
        if (w > 0) { c.push([s, w]); tot += w; } }
      if (!tot) return null; let x = r() * tot; for (const [s, w] of c) if ((x -= w) <= 0) return s; return c.at(-1)[0];
    }

    // ---------- population: cells within R_SIM of the camera, each from its own seed
    const CELLS = new Map(); let animals = [], PH = null, MON = null, foxes = 0;
    function pointIn(ci, cj, h, r, tries = 30) { for (let k = 0; k < tries; k++) { const x = (ci + r()) * CELL, z = (cj + r()) * CELL; if (cls(x, z) === h && !(h === HI.none && inBuilding(x, z))) return [x, z]; } return null; }
    function spawnCell(ci, cj) {
      const r = rng((ci * 73856093) ^ (cj * 19349663) ^ (PH === 'day' ? 1 : PH === 'dusk' ? 2 : 3) ^ (MON << 4)), list = [];
      const area = new Array(HC.length).fill(0); for (let k = 0; k < 100; k++) { const c = cls((ci + (k % 10 + .5) / 10) * CELL, (cj + (Math.floor(k / 10) + .5) / 10) * CELL); if (c >= 0) area[c] += CELL * CELL / 100 / 1e4; }
      const act = PH === 'day' ? 1 : PH === 'dusk' ? .8 : .55;
      for (let h = 0; h < HC.length; h++) { if (area[h] < .02) continue;
        let n = area[h] * DENS[HC[h]] * act * ABUND;
        while (n > 0) { const s = speciesFor(h, r, PH, MON); if (!s) break; const P = SPEC[s.id], g = P.fl[0] + Math.floor(r() * (P.fl[1] - P.fl[0] + 1)), k = Math.min(g, Math.max(1, Math.round(n)));
          if (r() < Math.min(1, n / g) || n >= g) { const p = pointIn(ci, cj, h, r); if (p) addGroup(list, s, h, p, k, r, ci, cj); }
          n -= g; } }
      // roof perches: gulls and pigeons on roof edges (more at night: the pigeons roost there)
      const roofN = Math.min(400, Math.round((area[HI.none] || 0) * (PH === 'night' ? .9 : .5) * (r() + .5) * ABUND));
      for (let k = 0; k < roofN; k++) { const q = roofSpot(ci, cj, r); if (!q) break; const s = r() < .55 ? SP[SPI.feralpigeon] : SP[SPI[r() < .6 ? 'herringgull' : 'lbbgull']]; if (!s || season(s, MON) < r() * .8) continue;
        list.push(mk(s, 'perch', HI.none, q.x, q.y, q.z, r)); }
      // foxes: rare, at dusk and at night (now and then by day), near woods and parks
      const gr = area[HI.wood] + area[HI.park] * .6 + area[HI.garden] * .5 + area[HI.none] * .05, pf = (PH === 'day' ? .015 : .14) * gr;
      for (let fk = 0, fn = ABUND === 1 ? 1 : Math.min(40, Math.ceil(pf * ABUND)); fk < fn; fk++) if (SPI.fox != null && foxes < MAX_FOX * ABUND && foxes < CAP_F && r() < (ABUND === 1 ? pf : Math.min(1, pf * ABUND / fn))) { const h = area[HI.wood] > .1 ? HI.wood : area[HI.park] > .1 ? HI.park : area[HI.garden] > .1 ? HI.garden : HI.none, p = pointIn(ci, cj, h, r); if (p) { list.push(mk(SP[SPI.fox], 'trot', h, p[0], landY(p[0], p[1]), p[1], r)); foxes++; } }
      return list;
    }
    function mk(s, st, h, x, y, z, r) {
      const P = SPEC[s.id];
      return { s, P, si: SPI[s.id], st, h, x, y, z, yaw: r() * TAU, v: 0, t: 2 + r() * 20, ph: r() * TAU, r, home: { x, y, z }, lvl: 0, tidal: false, hide: false, nk: P.nk, up: P.up, flap: 0, span: .15, bob: r() * TAU };
    }
    function addGroup(list, s, h, p, k, r, ci, cj) {
      const P = SPEC[s.id], b = P.b, w = wet(h);
      const flock = b === 'pigeon' && h === HI.none || b === 'pigeon' && h === HI.park ? { x: p[0], z: p[1], members: [], t: 20 + r() * 60, st: 'ground', ci, cj } : null;
      const P0 = w ? polyAt(p[0], p[1]) : null;
      for (let q = 0; q < k; q++) {
        let x = p[0], z = p[1]; for (let k = 0; k < 6; k++) { const tx = p[0] + (r() - .5) * (w ? 16 : 8), tz = p[1] + (r() - .5) * (w ? 16 : 8); if (cls(tx, tz) === h && !(h === HI.none && inBuilding(tx, tz))) { x = tx; z = tz; break; } }
        let st = w ? (b === 'heron' ? 'stand' : 'swim') : 'walk';
        if (PH === 'night' && st === 'swim') st = 'roost';
        if (b === 'gull' && PH === 'day' && r() < .3) st = 'soar';
        const a = mk(s, st, h, x, 0, z, r);
        if (w) { a.tidal = !!(P0 && P0.w.tidal) || h === HI.river; a.lvl = P0 ? P0.w.level : landY(x, z); a.y = waterY(a); }
        else a.y = landY(x, z);
        if (b === 'heron') { const e = edgeNear(x, z, h, r); if (e) { a.x = e[0]; a.z = e[1]; a.y = Math.max(waterY(a), landY(a.x, a.z)); } }
        if (st === 'soar') { a.cx = x; a.cz = z; a.rad = 25 + r() * 60; a.alt = 18 + r() * 45; a.y = a.alt; a.v = 8; }
        if (flock) { a.flock = flock; a.ox = (r() - .5) * 10; a.oz = (r() - .5) * 10; flock.members.push(a); }
        list.push(a);
      }
    }
    function edgeNear(x, z, h, r) { for (let k = 0; k < 24; k++) { const a = r() * TAU, d = 5 + r() * 60, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (cls(px, pz) === h && !wet(cls(px + 12 * Math.cos(a), pz + 12 * Math.sin(a)))) return [px, pz]; } return null; }
    function waterPoint(a, d0, d1) { for (let k = 0; k < 12; k++) { const g = a.r() * TAU, d = d0 + a.r() * (d1 - d0), x = a.x + Math.cos(g) * d, z = a.z + Math.sin(g) * d; const c = cls(x, z); if (wet(c)) { const P = polyAt(x, z); return { x, z, h: c, tidal: !!(P && P.w.tidal) || c === HI.river, lvl: P ? P.w.level : landY(x, z) }; } } return null; }

    let lastCellsT = 0;
    function updateCells(now) {
      const cam = ctx.camera.position, above = cam.y - landY(cam.x, cam.z), alt = sunAlt(), ph = phaseOf(alt), m = month();
      R_SIM = R_DRAW = Math.min(R_MAX, Math.max(R_MIN, above * 1.6));
      if (ph !== PH || m !== MON) { PH = ph; MON = m; CELLS.clear(); foxes = 0; }   // a new time of day or month: a new population
      const want = new Set();
      if (above < R_MAX) { const ci0 = Math.floor((cam.x - R_SIM) / CELL), ci1 = Math.floor((cam.x + R_SIM) / CELL), cj0 = Math.floor((cam.z - R_SIM) / CELL), cj1 = Math.floor((cam.z + R_SIM) / CELL);
        for (let i = ci0; i <= ci1; i++) for (let j = cj0; j <= cj1; j++) { const dx = Math.max(0, Math.abs((i + .5) * CELL - cam.x) - CELL / 2), dz = Math.max(0, Math.abs((j + .5) * CELL - cam.z) - CELL / 2); if (dx * dx + dz * dz < R_SIM * R_SIM) want.add(ck(i, j)); } }
      let changed = false;
      for (const k of [...CELLS.keys()]) if (!want.has(k)) { const c = CELLS.get(k); if (now - c.seen > 4000) { foxes -= c.list.filter(a => a.P.b === 'fox').length; CELLS.delete(k); changed = true; } } else CELLS.get(k).seen = now;
      // new cells: the nearest first, made outside the frame (fill(): 3 ms a slice, then a draw)
      QUEUE = [...want].filter(k => !CELLS.has(k)).map(k => { const [ci, cj] = unck(k); return [k, ci, cj, ((ci + .5) * CELL - cam.x) ** 2 + ((cj + .5) * CELL - cam.z) ** 2]; }).sort((a, b) => a[3] - b[3]);
      PENDING = QUEUE.length; if (PENDING && !filling) { filling = true; setTimeout(fill, 0); }
      if (changed) animals = [...CELLS.values()].flatMap(c => c.list);
    }
    let PENDING = 0, QUEUE = [], filling = false;
    function fill() {
      const tS = performance.now(); let made = 0;
      let pop = 0; for (const c of CELLS.values()) pop += c.list.length;
      // the nearest cells come first; once the population reaches the draw cap, farther cells stay empty (with "More
      // animals" at x1000 a 3 km radius made 319,068 animals and 88 ms of simulation a frame)
      while (QUEUE.length && performance.now() - tS < 3) { const [k, ci, cj] = QUEUE.shift(); if (!CELLS.has(k)) { const list = pop < CAP_B ? spawnCell(ci, cj) : []; pop += list.length; CELLS.set(k, { list, seen: performance.now() }); made++; } }
      cellMax = Math.max(cellMax, performance.now() - tS); PENDING = QUEUE.length;
      if (made) { animals = [...CELLS.values()].flatMap(c => c.list); ctx.draw(); }
      if (QUEUE.length) setTimeout(fill, 16); else filling = false;
    }

    // ---------- behaviours
    function steer(a, dt, speed, keep) {   // walk or paddle on; turn back where the next step leaves the habitat
      a.t -= dt; if (a.t <= 0) { a.yaw += (a.r() - .5) * 2.2; a.t = 2 + a.r() * 8; a.v = a.r() < .3 ? 0 : speed * (.4 + a.r() * .8); }
      const nx = a.x + Math.sin(a.yaw) * a.v * dt * 4, nz = a.z - Math.cos(a.yaw) * a.v * dt * 4;
      if (!keep(cls(nx, nz), nx, nz)) { a.yaw += Math.PI * (.6 + a.r() * .8); a.v *= .5; return; }
      a.x += Math.sin(a.yaw) * a.v * dt; a.z -= Math.cos(a.yaw) * a.v * dt;
    }
    function takeOff(a, to, speed, hArc) { a.fly = { x0: a.x, y0: a.y, z0: a.z, x1: to.x, y1: to.y, z1: to.z, k: 0, len: Math.max(1, Math.hypot(to.x - a.x, to.z - a.z)), v: speed, arc: hArc, then: to.then, to }; a.st = 'fly'; a.yaw = Math.atan2(to.x - a.x, -(to.z - a.z)); }
    function stepFly(a, dt) {
      const F = a.fly; F.k = Math.min(1, F.k + F.v * dt / F.len); const e = F.k;
      a.x = F.x0 + (F.x1 - F.x0) * e; a.z = F.z0 + (F.z1 - F.z0) * e; a.y = F.y0 + (F.y1 - F.y0) * e + Math.sin(Math.PI * e) * F.arc;
      if (F.k >= 1) { const to = F.to; a.st = F.then; a.fly = null; a.t = 3 + a.r() * 10; a.v = 0;
        if (to.h != null) { a.h = to.h; a.tidal = to.tidal; a.lvl = to.lvl; } if (a.st === 'soar') { a.cx = a.x; a.cz = a.z; } }
    }
    function update(dt, now) {
      const T = now / 1000, ph = PH;
      for (const a of animals) {
        const b = a.P.b;
        a.hide = false;
        if (b === 'fox') { stepFox(a, dt); continue; }
        if (a.flock && a.flock.lead !== a) { if (stepFlockMember(a, dt, T)) continue; }
        switch (a.st) {
          case 'swim': {
            steer(a, dt, b === 'duck' && a.P.L > 1 ? .35 : .25, c => c === a.h);
            a.y = waterY(a) + Math.sin(T * 1.3 + a.bob) * .02;
            a.t2 = (a.t2 ?? 20 + a.r() * 60) - dt;
            if (a.t2 <= 0) { a.t2 = 20 + a.r() * 90;
              if (b === 'diver' && a.r() < .7) { a.st = 'dive'; a.dt = a.s.id === 'cormorant' ? 20 + a.r() * 40 : a.s.id === 'coot' ? 3 + a.r() * 6 : 10 + a.r() * 25; a.yaw = a.r() * TAU; }
              else if (ph === 'day' && a.r() < ({ gull: .5, duck: .12, goose: .08, diver: .08 }[b] || 0) * (a.s.id === 'muteswan' ? .2 : 1)) { const to = waterPoint(a, 40, b === 'gull' ? 300 : 220); if (to) takeOff(a, { ...to, y: to.tidal ? WU.tideLevel.value : to.lvl, then: b === 'gull' && a.r() < .5 ? 'soar' : 'swim' }, b === 'gull' ? 9 : 14, 3 + a.r() * 8); }
            }
            break; }
          case 'roost': a.y = waterY(a) + Math.sin(T * .8 + a.bob) * .015; break;
          case 'dive': { a.hide = true; a.dt -= dt; const nx = a.x + Math.sin(a.yaw) * .8 * dt, nz = a.z - Math.cos(a.yaw) * .8 * dt; if (wet(cls(nx, nz)) && cls(nx, nz) === a.h) { a.x = nx; a.z = nz; } else a.yaw += 2;
            if (a.dt <= 0) { a.st = 'swim'; a.t = 1; } a.y = waterY(a); break; }
          case 'stand': { a.y = Math.max(waterY(a), landY(a.x, a.z)); a.t -= dt; if (a.t <= 0) { a.t = 30 + a.r() * 120; a.yaw += (a.r() - .5) * .8;
            if (ph !== 'night' && a.r() < .12) { const e = edgeNear(a.x, a.z, a.h, a.r); if (e) takeOff(a, { x: e[0], z: e[1], y: Math.max(a.y, landY(e[0], e[1])), then: 'stand' }, 6, 8); } } break; }
          case 'walk': {
            const keep = a.h === HI.none ? (c, x, z) => c === HI.none && !inBuilding(x, z) || green(c) : c => green(c) || c === a.h;
            steer(a, dt, b === 'goose' ? .3 : .45, keep); a.y = landY(a.x, a.z);
            a.t2 = (a.t2 ?? 30 + a.r() * 90) - dt;
            if (a.t2 <= 0 && ph === 'day') { a.t2 = 30 + a.r() * 120; if (a.r() < .35) { const g = a.r() * TAU, d = 30 + a.r() * 120, x = a.x + Math.cos(g) * d, z = a.z + Math.sin(g) * d, c = cls(x, z);
              if (green(c) || c === a.h) takeOff(a, { x, z, y: landY(x, z), h: c, then: 'walk' }, 10, 4 + a.r() * 6); } }
            break; }
          case 'perch': { a.t -= dt; if (a.t <= 0) { a.t = 20 + a.r() * 120; a.yaw += (a.r() - .5) * 1.5;
            if (ph === 'day' && b === 'gull' && a.r() < .25) { a.cx = a.x; a.cz = a.z; a.rad = 25 + a.r() * 50; a.alt = a.y + 10 + a.r() * 20; a.st = 'soar'; a.v = 8; } } break; }
          case 'soar': {
            const w = a.v / a.rad; a.ph += w * dt; a.cx += Math.sin(T * .05 + a.bob) * dt * 1.5; a.cz += Math.cos(T * .04 + a.bob) * dt * 1.5;
            const nx = a.cx + Math.cos(a.ph) * a.rad, nz = a.cz + Math.sin(a.ph) * a.rad; a.yaw = Math.atan2(nx - a.x, -(nz - a.z)); a.x = nx; a.z = nz;
            const gy = landY(a.x, a.z); a.y += ((Math.max(a.alt, gy + 15)) + Math.sin(T * .3 + a.bob) * 3 - a.y) * Math.min(1, dt * .5);
            a.t -= dt; if (a.t <= 0) { a.t = 15 + a.r() * 40;
              if (a.r() < .35) { const to = waterPoint(a, 10, 200); if (to) takeOff(a, { ...to, y: to.tidal ? WU.tideLevel.value : to.lvl, then: 'swim' }, 9, 2); else { const q = roofSpot(Math.floor(a.x / CELL), Math.floor(a.z / CELL), a.r); if (q) takeOff(a, { ...q, then: 'perch' }, 9, 2); } } }
            break; }
          case 'fly': stepFly(a, dt); break;
        }
      }
      for (const c of CELLS.values()) for (const a of c.list) if (a.flock && !a.flock.done) stepFlock(a.flock, dt, ph), a.flock.done = true;
      for (const c of CELLS.values()) for (const a of c.list) if (a.flock) a.flock.done = false;
    }
    // pigeon flocks: the flock (its centre) walks, now and then takes off together and lands on a roof edge or other open ground
    function stepFlock(F, dt, ph) {
      F.t -= dt; if (F.fly) { const G = F.fly; G.k = Math.min(1, G.k + 11 * dt / G.len); F.x = G.x0 + (G.x1 - G.x0) * G.k; F.z = G.z0 + (G.z1 - G.z0) * G.k; F.y = G.y0 + (G.y1 - G.y0) * G.k + Math.sin(Math.PI * G.k) * G.arc; F.yaw = Math.atan2(G.x1 - G.x0, -(G.z1 - G.z0)); if (G.k >= 1) { F.fly = null; F.st = G.then; F.y = G.y1; F.t = 25 + Math.random() * 80; } return; }
      if (F.t > 0 || ph !== 'day') return;
      const r = F.members[0].r, ci = Math.floor(F.x / CELL), cj = Math.floor(F.z / CELL);
      let to = null; if (F.st === 'ground' && r() < .5) { const q = roofSpot(ci, cj, r); if (q) to = { ...q, then: 'roof' }; }
      if (!to) { for (let k = 0; k < 20 && !to; k++) { const x = F.x + (r() - .5) * 300, z = F.z + (r() - .5) * 300, c = cls(x, z); if ((c === HI.none || c === HI.park) && !inBuilding(x, z)) to = { x, z, y: landY(x, z), then: 'ground' }; } }
      if (!to) { F.t = 30; return; }
      const y0 = F.y ?? landY(F.x, F.z); F.fly = { x0: F.x, y0, z0: F.z, x1: to.x, y1: to.y, z1: to.z, k: 0, len: Math.max(1, Math.hypot(to.x - F.x, to.z - F.z)), arc: 8 + r() * 15, then: to.then };
    }
    function stepFlockMember(a, dt, T) {   // boids-lite: each bird steers to its slot around the flock centre; separation by the slots
      const F = a.flock;
      const sl = F.fly ? 1.5 : F.st === 'roof' ? .12 : 1, wob = F.fly ? 2 : 0;
      if (F.fly || a.inAir) { const tx = F.x + a.ox * sl + Math.sin(T * .7 + a.bob) * wob, tz = F.z + a.oz * sl + Math.cos(T * .6 + a.bob) * wob, ty = (F.fly ? F.y : F.st === 'roof' ? F.y : landY(tx, tz)) + (F.fly ? Math.sin(T * 1.1 + a.bob) * 1.2 : 0);
        const dx = tx - a.x, dz = tz - a.z, dy = ty - a.y, d = Math.hypot(dx, dz), k = Math.min(1, dt * 2.5);
        a.x += dx * k; a.z += dz * k; a.y += dy * k; if (d > .05) a.yaw = Math.atan2(dx, -dz); a.st = 'fly'; a.inAir = !!F.fly || d > .6 || Math.abs(dy) > .3;
        if (!a.inAir) { a.st = F.st === 'roof' ? 'perch' : 'walk'; a.v = 0; }
        return true; }
      if (F.st === 'roof') { a.st = 'perch'; a.x = F.x + a.ox * .12; a.z = F.z + a.oz * .12; a.y = F.y; return true; }
      // on the ground: walk near the flock centre
      a.st = 'walk'; steer(a, dt, .4, (c, x, z) => (c === HI.none && !inBuilding(x, z) || green(c)) && Math.hypot(x - F.x, z - F.z) < 12);
      a.y = landY(a.x, a.z); a.inAir = false;
      if (F.fly) a.inAir = true;
      return true;
    }
    function stepFox(a, dt) {
      a.t -= dt;
      if (a.st === 'sniff') { if (a.t <= 0) { a.st = 'trot'; a.t = 3 + a.r() * 6; } a.v = 0; a.y = landY(a.x, a.z); return; }
      if (a.t <= 0) {
        if (a.r() < .25) { a.st = 'sniff'; a.t = 2 + a.r() * 5; return; }
        // choose a heading: green ahead, an edge to one side (park and wood edges), no building, little open street
        let best = a.yaw, bs = -1e9;
        for (let k = 0; k < 7; k++) { const y = a.yaw + (a.r() - .5) * 2.4, x1 = a.x + Math.sin(y) * 12, z1 = a.z - Math.cos(y) * 12, c = cls(x1, z1); let s = green(c) ? 2 : c === HI.none ? .6 : -6;
          if (c === HI.none && inBuilding(x1, z1)) s -= 6; const side = cls(x1 + Math.cos(y) * 15, z1 + Math.sin(y) * 15), side2 = cls(x1 - Math.cos(y) * 15, z1 - Math.sin(y) * 15); if (green(c) && (!green(side) || !green(side2))) s += 1.2; s += a.r() * .8;
          if (s > bs) { bs = s; best = y; } }
        a.yaw = best; a.t = 2 + a.r() * 4; a.v = 2 + a.r() * 1.2;
      }
      const nx = a.x + Math.sin(a.yaw) * a.v * dt, nz = a.z - Math.cos(a.yaw) * a.v * dt, c = cls(nx, nz);
      if (wet(c) || c < 0) { a.yaw += Math.PI * .8; a.t = .5; return; }
      a.x = nx; a.z = nz; a.y = landY(a.x, a.z);
    }

    // ---------- geometry: a unit bird (length 1, bill at -z; part 0 body, 1 neck and head, 2 wings, 3 bill; nw: 0 at the
    // neck base, 1 at the head) and a fox (metres; part 0 body, 1 head, 2 legs (nw: +1 or -1, the gait phase), 3 tail)
    function birdGeometry() {
      const P = [], PT = [], NW = [], tri = (a, b, c, part, w) => { P.push(...a, ...b, ...c); PT.push(part, part, part); NW.push(...(Array.isArray(w) ? w : [w, w, w])); };
      const F = [0, .02, -.3], B = [0, .05, .5], T = [0, .17, .02], Dn = [0, -.11, .05], Lf = [-.16, .03, 0], Rt = [.16, .03, 0];
      for (const [a, b, c] of [[F, Rt, T], [F, T, Lf], [F, Dn, Rt], [F, Lf, Dn], [B, T, Rt], [B, Lf, T], [B, Rt, Dn], [B, Dn, Lf]]) tri(a, b, c, 0, 0);
      // neck: a three-sided tube from the base (nw 0, around [0, .1, -.22]) to the head (nw 1, offsets about the head)
      const base = [0, .1, -.22], r0 = [[-.04, -.02], [.04, -.02], [0, .035]], r1 = [[-.025, -.015], [.025, -.015], [0, .02]];
      for (let i = 0; i < 3; i++) { const j = (i + 1) % 3, a0 = [base[0] + r0[i][0], base[1] + r0[i][1], base[2]], b0 = [base[0] + r0[j][0], base[1] + r0[j][1], base[2]], a1 = [base[0] + r1[i][0], base[1] + r1[i][1], base[2]], b1 = [base[0] + r1[j][0], base[1] + r1[j][1], base[2]];
        tri(a0, b0, a1, 1, [0, 0, 1]); tri(b0, b1, a1, 1, [0, 1, 1]); }
      // head (an octahedron about the neck top) and bill
      const hc = [base[0], base[1], base[2] - .03], s = .065, hv = [[0, 0, -s * 1.2], [0, 0, s], [-s * .8, 0, 0], [s * .8, 0, 0], [0, s, 0], [0, -s * .7, 0]].map(v => [hc[0] + v[0], hc[1] + v[1], hc[2] + v[2]]);
      for (const [a, b, c] of [[0, 3, 4], [0, 4, 2], [0, 5, 3], [0, 2, 5], [1, 4, 3], [1, 2, 4], [1, 3, 5], [1, 5, 2]]) tri(hv[a], hv[b], hv[c], 1, 1);
      const bt = [hc[0], hc[1] - .01, hc[2] - .17], bb = [[-.02, .012], [.02, .012], [0, -.015]].map(([x, y]) => [hc[0] + x, hc[1] + y, hc[2] - .06]);
      for (let i = 0; i < 3; i++) tri(bb[i], bb[(i + 1) % 3], bt, 3, 1);
      tri(bb[0], bb[2], bb[1], 3, 1);
      // wings: from the shoulder (|x| .07) to the tip (|x| .55); the shader stretches |x| - .07 and flaps about the shoulder
      for (const sx of [-1, 1]) { const a = [.07 * sx, .1, -.12], b = [.07 * sx, .1, .2], c = [.5 * sx, .1, .17], d = [.55 * sx, .1, .02], e = [.35 * sx, .1, -.1];
        tri(a, b, c, 2, 0); tri(a, c, d, 2, 0); tri(a, d, e, 2, 0); }
      const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('part', new THREE.Float32BufferAttribute(PT, 1)); g.setAttribute('nw', new THREE.Float32BufferAttribute(NW, 1)); return g;
    }
    function foxGeometry() {
      const P = [], PT = [], NW = [];
      const box = (w, h, l, x, y, z, part, nw, taper = 1) => { const G = new THREE.BoxGeometry(w, h, l).toNonIndexed(), p = G.attributes.position.array;
        for (let i = 0; i < p.length; i += 3) { const k = p[i + 2] < 0 ? taper : 1; P.push(p[i] * k + x, p[i + 1] * k + y, p[i + 2] + z); PT.push(part); NW.push(nw); } };
      box(.2, .2, .62, 0, .34, 0, 0, 0);                           // body
      box(.15, .14, .16, 0, .44, -.38, 1, 0); box(.07, .06, .12, 0, .41, -.5, 1, 0, .5);   // head and muzzle
      box(.035, .07, .02, -.05, .54, -.36, 1, 0); box(.035, .07, .02, .05, .54, -.36, 1, 0);   // ears
      box(.1, .1, .42, 0, .3, .5, 3, 0, 1.3);                      // brush
      for (const [x, z, s] of [[-.07, -.22, 1], [.07, -.22, -1], [-.07, .22, -1], [.07, .22, 1]]) box(.05, .27, .05, x, .135, z, 2, s);
      const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('part', new THREE.Float32BufferAttribute(PT, 1)); g.setAttribute('nw', new THREE.Float32BufferAttribute(NW, 1)); return g;
    }

    // ---------- materials: per instance iP (x, y, z, yaw), iA (scale, flap amplitude rad, flap Hz, phase), iB (wing stretch,
    // neck length (unit lengths), neck angle rad, species index); the palette by species and part
    const pal = []; for (const s of SP) for (const c of SPEC[s.id].c) pal.push(new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace));
    const palette = uniformArray(pal, 'color'), cutU = ctx.U.cut;
    function makeMesh(geo, cap, fox) {
      const buf = n => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); a.setUsage(THREE.DynamicDrawUsage); return a; };
      const aP = buf(), aA = buf(), aB = buf(), iP = instancedDynamicBufferAttribute(aP, 'vec4'), iA = instancedDynamicBufferAttribute(aA, 'vec4'), iB = instancedDynamicBufferAttribute(aB, 'vec4');
      const part = attribute('part', 'float'), nw = attribute('nw', 'float');
      const m = new THREE.MeshStandardNodeMaterial({ roughness: .85, metalness: 0, flatShading: true, side: THREE.DoubleSide });
      m.positionNode = Fn(() => {
        const p = positionGeometry.toVar();
        if (!fox) {
          If(part.equal(2), () => { const ax = p.x.abs(), r = max(ax.sub(.07), 0).mul(iB.x), a = sin(time.mul(iA.z).mul(TAU).add(iA.w)).mul(iA.y).add(iA.y.mul(.25));
            p.x.assign(sign(p.x).mul(min(ax, .07).add(r.mul(cos(a))))); p.y.addAssign(r.mul(sin(a))); });
          If(part.equal(1).or(part.equal(3)), () => { p.y.addAssign(nw.mul(sin(iB.z)).mul(iB.y)); p.z.subAssign(nw.mul(cos(iB.z)).mul(iB.y)); });
        } else {
          If(part.equal(2), () => { p.z.addAssign(float(.27).sub(p.y).mul(sin(time.mul(iA.z).mul(TAU).add(iA.w).mul(1)).mul(iA.y).mul(nw))); });
          If(part.equal(3), () => { p.y.addAssign(p.z.sub(.29).max(0).mul(sin(time.mul(1.3).add(iA.w)).mul(.15))); });
        }
        const s = p.mul(iA.x), c = cos(iP.w), n = sin(iP.w);   // yaw: 0 = grid north (-z), clockwise seen from above
        return vec3(s.x.mul(c).sub(s.z.mul(n)), s.y, s.x.mul(n).add(s.z.mul(c))).add(iP.xyz);
      })();
      m.colorNode = varying(vec4(palette.element(int(iB.w.mul(4).add(part))), 1));
      const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; geo.instanceCount = 0;
      return { mesh, aP, aA, aB, cap };
    }
    const MB = makeMesh(birdGeometry(), CAP_B, false), MF = makeMesh(foxGeometry(), CAP_F, true);
    const group = new THREE.Group(); group.name = 'wildlife'; group.add(MB.mesh, MF.mesh);

    // ---------- each frame: simulate, then fill the instance buffers with the animals within R_DRAW of the camera
    const SAMP = new Float32Array(120).fill(NaN); let visible = on, last = performance.now(), drawn = [], msAvg = 0, simAvg = 0, cellMs = 0, cellMax = 0, frames = 0, nB = 0, nF = 0;
    function frame() {
      if (!visible) return;
      const now = performance.now(), dt = Math.min(.25, (now - last) / 1000); last = now; const tA = performance.now();
      if (now - lastCellsT > 500) { lastCellsT = now; const tc = performance.now(); updateCells(now); cellMs = performance.now() - tc; } else cellMs = 0;
      const tU = performance.now();
      update(dt, now);
      const cam = ctx.camera.position, cut = cutU.value, scale = SIZE; drawn = []; nB = 0; nF = 0;
      for (const a of animals) {
        if (a.hide) continue; const dx = a.x - cam.x, dy = a.y - cam.y, dz = a.z - cam.z; if (dx * dx + dy * dy + dz * dz > R_DRAW * R_DRAW) continue; if (cut < 250 && a.y > cut) continue;
        const fox = a.P.b === 'fox', M = fox ? MF : MB, i = fox ? nF : nB; if (i >= M.cap) continue;
        const air = a.st === 'fly' || a.st === 'soar', L = fox ? 1 : a.P.L;
        let amp = 0, hz = 0, span = .14, nk = a.P.nk, up = a.P.up;
        if (fox) { amp = a.st === 'trot' ? .45 : 0; hz = a.v ? a.v * 1.1 : 0; }
        else if (air) { span = (a.P.W / L / 2 - .07) / .48; const glide = a.P.b === 'gull' && a.st === 'soar'; amp = glide ? .12 + .1 * Math.max(0, Math.sin(now / 1900 + a.bob)) : .75; hz = glide ? 1.2 : a.P.f; up = a.P.b === 'heron' ? .9 : .25; nk = a.P.b === 'heron' ? a.P.nk * .35 : a.P.nk * .8; }
        else if (a.st === 'walk' && a.P.b !== 'goose') up = a.P.up + Math.sin(now / 230 + a.bob) * .35;   // pecking
        else if (a.st === 'roost') { up = .4; nk = a.P.nk * .5; }
        const yy = a.y + (!fox && (a.st === 'swim' || a.st === 'roost') ? .07 * L * scale : 0), o = 4 * i; M.aP.array.set([a.x, yy, a.z, a.yaw], o); M.aA.array.set([L * scale, amp, hz, a.bob], o); M.aB.array.set([span, nk, up, a.si], o);
        if (fox) nF++; else nB++; drawn.push(a);
      }
      for (const [M, n] of [[MB, nB], [MF, nF]]) { M.mesh.geometry.instanceCount = n; M.mesh.visible = n > 0; if (n) { M.aP.needsUpdate = M.aA.needsUpdate = M.aB.needsUpdate = true; } }
      const ms = performance.now() - tA; msAvg += (ms - msAvg) * .05; simAvg += (performance.now() - tU - simAvg) * .05; SAMP[frames % SAMP.length] = ms; cellMax = Math.max(cellMax, cellMs); frames++;
      if (frames % 30 === 1) status();
    }
    ctx.onFrame(frame);

    // ---------- tap: the animal nearest the ray (within its size, or a few pixels' worth at a distance)
    const pct = v => Math.round(v * 100);
    function card(a) {
      const s = a.s, P = a.P, hab = { none: 'streets, squares and roofs', river: 'the tidal Thames (and its creeks)', dock: 'a dock', pond: 'a pond or lake', park: 'a park or grass', wood: 'a wood', garden: 'a garden or churchyard' }[HC[a.h]] || HC[a.h];
      const lic = Object.entries(D.byLicence).map(([k, v]) => `${k.replace(/^gbif:http:\/\/creativecommons.org\/(licenses|publicdomain)\//, 'gbif:CC ').replace(/\/legalcode$/, '')} ${v}`).join(', ');
      const hrec = Object.entries(s.habitat).filter(([, v]) => v).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(', ');
      const se = s.seasonEff ? `records peak in ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][s.seasonEff.indexOf(1)]} (share of all records of the month); this month ${pct(season(s, MON))}% of the peak in the simulation` : 'no season from the records';
      ctx.showCard(`<h2>${esc(s.name)}</h2><p class="small"><i>${esc(s.sci)}</i> · simulated animal</p>` +
        `<table><tr><td>Doing</td><td>${esc(DOING[a.st] || a.st)}</td></tr><tr><td>Habitat</td><td>${esc(hab)}</td></tr>` +
        `<tr><td>Size</td><td>${P.b === 'fox' ? 'about 1 m nose to tail tip' : `${P.L} m long, wingspan ${P.W} m`}</td></tr>` +
        `<tr><td>Open records in the model box</td><td>${s.records} (NBN Atlas ${s.nbn}, GBIF ${s.gbif}${s.years[0] ? `; ${s.years[0]} to ${s.years[1]}` : ''})</td></tr>` +
        `<tr><td>Located to 100 m</td><td>${s.located}${hrec ? ` (${esc(hrec)})` : ''}</td></tr><tr><td>Season</td><td>${esc(se)}</td></tr>` +
        `<tr><td>Basis</td><td>${esc(s.basis)}</td></tr></table><p class="small">${esc(s.ecology)}</p>` +
        `<p class="small">The animal and its position are simulated, not observed. Weights from open records: NBN Atlas (OGL, CC BY, CC0 records; data partners: BTO/JNCC/RSPB, Birdex, iRecord, Mammal Society and others) and GBIF.org (iNaturalist CC0 and CC BY observations, naturgucker, TIPU), blended with general ecology. Not used: eBird, CC BY-NC records, GiGL. Records by licence: ${esc(lic)}. Built ${esc(D.built)} by <a href="https://github.com/danbri/londat/blob/main/cwplans/tools/fetch-wildlife.mjs" target="_blank" rel="noopener">fetch-wildlife.mjs</a>.</p>`);
    }
    ctx.addPick(ray => {
      if (!visible) return null; let best = null; const o = ray.ray.origin, d = ray.ray.direction, sc = SIZE;
      for (const a of drawn) { const L = (a.P.L || 1) * sc, cy = a.y + L * .15, t = (a.x - o.x) * d.x + (cy - o.y) * d.y + (a.z - o.z) * d.z; if (t <= 0) continue;
        const px = o.x + d.x * t - a.x, py = o.y + d.y * t - cy, pz = o.z + d.z * t - a.z, r = Math.max(L * .8, t * .01);
        if (px * px + py * py + pz * pz < r * r && (!best || t < best.distance)) best = { distance: t - r, open: () => card(a) }; }
      return best;
    });

    // ---------- the menu
    ctx.ui.section('Wildlife (simulated)');
    const setVisible = v => { visible = v; group.visible = v; if (!v) { MB.mesh.geometry.instanceCount = MF.mesh.geometry.instanceCount = 0; } ctx.draw(); };
    ctx.ui.toggle('Birds and foxes (simulated from open records)', on, setVisible);
    const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
    const repopulate = () => { CELLS.clear(); animals = []; foxes = 0; lastCellsT = 0; ctx.draw(); };
    const aL = n => `More animals: x${n.toLocaleString('en-GB')} (not real numbers)`, sL = n => `Size: x${n} (to see them from far)`;
    ctx.ui.slider(aL(ABUND), 0, STEPS.length - 1, 1, Math.max(0, STEPS.findIndex(v => v >= ABUND)), (v, t) => { ABUND = STEPS[Math.round(v)]; t.textContent = aL(ABUND); repopulate(); });
    ctx.ui.slider(sL(SIZE), 1, 20, 1, SIZE, (v, t) => { SIZE = v; t.textContent = sL(SIZE); ctx.draw(); });
    const ecoOnly = SP.filter(s => /^ecology/.test(s.basis)).map(s => s.name), habEco = SP.filter(s => /habitat from ecology/.test(s.basis)).map(s => s.name);
    const note = ctx.ui.note('');
    function status() {
      const byS = {}; for (const a of drawn) byS[a.s.name] = (byS[a.s.name] || 0) + 1;
      const top = Object.entries(byS).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ');
      note.innerHTML = esc(`${drawn.length} animals within ${Math.round(R_DRAW)} m of the camera${ABUND > 1 ? ` (x${ABUND.toLocaleString('en-GB')} the simulated numbers)` : ''}${top ? ` (${top})` : ''}; ${PH || ''}, ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][MON ?? 0]}. ` +
        `Simulated: species, numbers and places are weighted by ${(D.totals.nbn + D.totals.gbif).toLocaleString('en-GB')} open records (${D.totals.located.toLocaleString('en-GB')} located to 100 m) and general ecology; positions are not observations. ` +
        `${habEco.length ? `Habitat from general ecology only (too few located records): ${habEco.join(', ')}. ` : ''}${ecoOnly.length ? `General ecology only: ${ecoOnly.join(', ')}. ` : ''}Real sizes: come close (under 150 m) to see them${SIZE > 1 ? ` (drawn ${SIZE} times larger than life)` : ''}. Tap one for its card. `) +
        'Sources: <a href="https://nbnatlas.org/" target="_blank" rel="noopener">NBN Atlas</a> (OGL, CC BY, CC0 records) and <a href="https://www.gbif.org/" target="_blank" rel="noopener">GBIF.org</a> (CC0, CC BY); habitats from © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> and OS Open Greenspace (OGL).';
      ctx.stats.wildlife = { animals: animals.length, drawn: drawn.length, birds: nB, foxes: nF, cells: CELLS.size, phase: PH, month: MON, updateMs: +msAvg.toFixed(3), ...(() => { const v = [...SAMP].filter(x => x === x).sort((a, b) => a - b); return v.length ? { frameMsMedian: +v[v.length >> 1].toFixed(3), frameMsP95: +v[Math.floor(v.length * .95)].toFixed(3), frameMsMax: +v.at(-1).toFixed(3), samples: v.length } : {}; })(), simMs: +simAvg.toFixed(3), cellMsMax: +cellMax.toFixed(2), pending: PENDING, loadMs: Math.round(loadMs) };
    }
    const loadMs = performance.now() - t0;
    // without the animation loop: draw every 2 s while animals are in view, so that they move
    let tick = 0; setInterval(() => { tick++; if (visible) status(); const anim = document.getElementById('animate'); if (visible && drawn.length && (!anim || !anim.checked) && tick % 2 === 0) ctx.draw(); }, 1000);
    group.visible = on;
    return { object: group, setVisible, ownUi: true, get animals() { return drawn.map(a => ({ id: a.s.id, st: a.st, x: a.x, y: a.y, z: a.z })); }, get stats() { return ctx.stats.wildlife; } };
  },
};
