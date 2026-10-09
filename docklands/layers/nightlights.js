// Layer "nightlights" of the Three.js port (docklands/): the night light points of the WebGL page (index.html
// buildNightLights, README "Night"): aviation lights (UK Air Navigation Order 2016 art. 222: steady red at the top of
// structures of 150 m and more and at levels no more than 52 m apart; near London City Airport towers from about 100 m are
// lit too: the owner's photos show 2 to 4 a roof), the apex light of One Canada Square's pyramid, and riverside lamps
// (every 16 to 26 m along the EA flood walls by the tidal water, 3 m inland, and along footpaths within 15 m of it; low-pressure
// sodium orange or warm white LED). Same rules and seeds as the WebGL page. Drawn as instanced sprites (PointsNodeMaterial
// on a Sprite: WebGPU draws points 1 px only), a fixed size in pixels, additive, depth-tested, bright only by night
// (U.night), so the bloom picks them up. Also the generic lit signs of office towers of 150 m or more (bars, no names) and
// the crown halo colour by date (crown.js; the material draws it). Not ported: the reflection sprites (the WebGPU mirror
// reflects these points), the crown halo sprites (the bloom stands in). Skill: docklands-3d-page, "Three.js port".
import { instancedBufferAttribute, vec4, vec3, float, uv, smoothstep, length, uniform, viewportSize, step, positionWorld } from 'three/tsl';
import { initCrown } from '../crown.js';

const AVL = { min: 100, mid: 150, step: 52 };
const ringOf = (dec, o) => { const f = dec(o.p), n = o.holes && o.holes.length ? o.holes[0] : f.length / 2, r = []; for (let i = 0; i < n; i++) r.push([f[2 * i], f[2 * i + 1]]); return r; };
const centre = r => { let cx = 0, cz = 0, rad = 0; for (const p of r) { cx += p[0]; cz += p[1]; } cx /= r.length; cz /= r.length; for (const p of r) rad = Math.max(rad, Math.hypot(p[0] - cx, p[1] - cz)); return { cx, cz, rad }; };
function corners(ring) {   // index.html corners(): where the outline turns by more than 35 degrees, at most 4, pushed out 0.8 m
  const n = ring.length; let cx = 0, cz = 0; for (const p of ring) { cx += p[0]; cz += p[1]; } cx /= n; cz /= n;
  let c = ring.filter((p, i) => { const a = ring[(i + n - 1) % n], b = ring[(i + 1) % n], t1 = Math.atan2(p[1] - a[1], p[0] - a[0]), t2 = Math.atan2(b[1] - p[1], b[0] - p[0]); return Math.abs(((t2 - t1 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) > .6; });
  if (c.length > 4 || c.length < 3) { const src = c.length > 4 ? c : ring; c = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => src.reduce((m, p) => a * p[0] + b * p[1] > a * m[0] + b * m[1] ? p : m)); }
  const out = []; for (const p of c) if (!out.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 6)) out.push(p);
  return out.map(p => { const dx = p[0] - cx, dz = p[1] - cz, l = Math.hypot(dx, dz) || 1; return [p[0] + dx / l * .8, p[1] + dz / l * .8]; });
}
const opposite = cs => { if (cs.length <= 2) return cs; let best = cs.slice(0, 2), d = -1; for (const a of cs) for (const b of cs) { const e = Math.hypot(a[0] - b[0], a[1] - b[1]); if (e > d) { d = e; best = [a, b]; } } return best; };
const polyline = pts => { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return { pts, cum, len: cum.at(-1) }; };
function along(pl, s) { s = Math.max(0, Math.min(pl.len - .01, s)); let lo = 0, hi = pl.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pl.cum[m] <= s) lo = m; else hi = m; }
  const a = pl.pts[lo], b = pl.pts[hi], t = (s - pl.cum[lo]) / Math.max(.01, pl.cum[hi] - pl.cum[lo]), dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  return { x: a[0] + dx * t, z: a[1] + dz * t, y: (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * t, hx: dx / l, hz: dz / l }; }
// index.html waterGrid(): 10 m cells, 1 water, 2 tidal water; chamfer distance to the water (any, or tidal)
function waterGrid(A, dec) {
  const E = A.meta.extent, G = 10, nx = Math.ceil((E.x1 - E.x0) / G), nz = Math.ceil((E.z1 - E.z0) / G), g = new Uint8Array(nx * nz);
  for (const w of A.water) { const f = dec(w.p), starts = [0, ...(w.holes || []), f.length / 2], rows = new Map(), v = w.tidal ? 2 : 1;
    for (let r = 0; r < starts.length - 1; r++) for (let i = starts[r]; i < starts[r + 1]; i++) { const j = i + 1 < starts[r + 1] ? i + 1 : starts[r], x0 = f[2 * i], z0 = f[2 * i + 1], x1 = f[2 * j], z1 = f[2 * j + 1];
      const ja = Math.ceil((Math.min(z0, z1) - E.z0) / G - .5), jb = Math.floor((Math.max(z0, z1) - E.z0) / G - .5);
      for (let jj = Math.max(0, ja); jj <= Math.min(nz - 1, jb); jj++) { const zc = E.z0 + (jj + .5) * G; if ((z0 > zc) === (z1 > zc)) continue; const x = x0 + (zc - z0) / (z1 - z0) * (x1 - x0); if (!rows.has(jj)) rows.set(jj, []); rows.get(jj).push(x); } }
    for (const [jj, xs] of rows) { xs.sort((a, b) => a - b); for (let k = 0; k + 1 < xs.length; k += 2) for (let ii = Math.max(0, Math.ceil((xs[k] - E.x0) / G - .5)); ii <= Math.min(nx - 1, Math.floor((xs[k + 1] - E.x0) / G - .5)); ii++) g[jj * nx + ii] = Math.max(g[jj * nx + ii], v); } }
  const chamfer = minV => { const d = new Float32Array(nx * nz); for (let i = 0; i < d.length; i++) d[i] = g[i] >= minV ? 0 : 1e9; const a = G, b = G * Math.SQRT2;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; let v = d[k]; if (i) v = Math.min(v, d[k - 1] + a); if (j) { v = Math.min(v, d[k - nx] + a); if (i) v = Math.min(v, d[k - nx - 1] + b); if (i < nx - 1) v = Math.min(v, d[k - nx + 1] + b); } d[k] = v; }
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; let v = d[k]; if (i < nx - 1) v = Math.min(v, d[k + 1] + a); if (j < nz - 1) { v = Math.min(v, d[k + nx] + a); if (i < nx - 1) v = Math.min(v, d[k + nx + 1] + b); if (i) v = Math.min(v, d[k + nx - 1] + b); } d[k] = v; }
    return d; };
  const dAll = chamfer(1), dTid = chamfer(2), cell = (x, z) => { const i = Math.floor((x - E.x0) / G), j = Math.floor((z - E.z0) / G); return i >= 0 && j >= 0 && i < nx && j < nz ? j * nx + i : -1; };
  return { at: (x, z) => { const k = cell(x, z); return k < 0 ? 0 : g[k]; }, dist: (x, z, tidal) => { const k = cell(x, z); return k < 0 ? 1e9 : (tidal ? dTid : dAll)[k]; } };
}

export default {
  id: 'nightlights', label: 'Night lights (aviation, riverside lamps)', on: true,
  async init(ctx) {
    const { THREE, A, dec, loadJSON, DATA, U, stats } = ctx, t0 = performance.now();
    const T = await loadJSON(DATA + 'towers.json').catch(() => null), TOWERS = T ? Object.values(T.buildings).filter(t => t.tiers && t.tiers.length && t.status === 'fitted') : [];
    const towerOf = new Map(); for (const t of TOWERS) for (const mi of t.model_buildings) towerOf.set(mi, t);
    const towerTop = t => Math.max(...t.tiers.filter((tr, k) => !(k === t.tiers.length - 1 && t.top && t.top.kind === 'pyramid' && t.top.apex)).map(tr => tr.y1));
    const W = waterGrid(A, dec), pts = []; let sd = 1; const rnd1 = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    let nRed = 0, nLamp = 0, nApex = 0;
    // aviation lights: one roof per tower (a lower part inside a taller tower's outline is not lit), merged within 5 m
    const cand = [];
    A.buildings.forEach((b, i) => { if (towerOf.has(i)) return; if (!(b.h >= AVL.min)) return; const r = ringOf(dec, b); cand.push({ ringAt: () => r, base: b.b, top: b.b + b.h, ...centre(r) }); });
    for (const t of TOWERS) { const top = towerTop(t), base = t.base_m_od ?? t.tiers[0].y0; if (top - base < AVL.min) continue;
      const tierAt = y => (t.tiers.find(tr => y >= tr.y0 - .01 && y <= tr.y1 + .01 && !(t.top && t.top.kind === 'pyramid' && tr === t.tiers.at(-1))) || t.tiers[0]).ring;
      cand.push({ ringAt: tierAt, base, top, ...centre(tierAt(top - 1)) });
      if (t.top && t.top.kind === 'pyramid' && t.top.apex) { const [ax, ay, az] = t.top.apex; pts.push([ax, ay + 1, az, 1, .85, .85, 4]); nApex++; } }
    cand.sort((a, b) => b.top - a.top); const kept = [], redAt = [];
    for (const c of cand) { if (kept.some(k => Math.hypot(k.cx - c.cx, k.cz - c.cz) < Math.max(20, k.rad * .8))) continue; kept.push(c); }
    const red = (x, y, z, size) => { if (redAt.some(q => Math.abs(q[0] - x) < 5 && Math.abs(q[2] - z) < 5 && Math.abs(q[1] - y) < 5)) return; redAt.push([x, y, z]); nRed++; pts.push([x, y, z, 1, .1, .06, size]); };
    for (const c of kept) { const h = c.top - c.base;
      for (const [x, z] of corners(c.ringAt(c.top - .5))) red(x, c.top + .8, z, 4.5);
      if (h >= AVL.mid) { const n = Math.ceil(h / AVL.step) - 1; for (let k = 1; k <= n; k++) { const y = c.base + h * k / (n + 1); for (const [x, z] of opposite(corners(c.ringAt(y)))) red(x, y, z, 3.5); } } }
    // riverside lamps (index.html: flood walls 3 m inland within 20 m of tidal water; footpaths within 15 m)
    const lampAt = new Map(), key = (x, z) => Math.floor(x / 12) + ',' + Math.floor(z / 12), runs = [];
    for (const d of A.defences || []) { const q = dec(d.q, 3), p = []; for (let i = 0; i < q.length; i += 3) p.push([q[i], q[i + 1], Math.max(q[i + 2], d.c - 1)]); runs.push([p, 3, 20]); }
    for (const l of A.lines) if (!l.tunnel && !l.bridge && l.k === 'foot') { const q = dec(l.q, 3), p = []; for (let i = 0; i < q.length; i += 3) p.push([q[i], q[i + 1], q[i + 2]]); runs.push([p, 0, 15]); }
    for (const [p3, off, reach] of runs) { if (p3.length < 2) continue; const pl = polyline(p3);
      for (let s = 6; s < pl.len; s += 16 + 10 * rnd1()) { const p0 = along(pl, s), side = W.at(p0.x - p0.hz * 6, p0.z + p0.hx * 6) ? -1 : 1, p = { ...p0, x: p0.x - p0.hz * off * side, z: p0.z + p0.hx * off * side };
        if (W.at(p.x, p.z) || W.dist(p.x, p.z, true) > reach) continue;
        let close = false; for (let a = -1; a <= 1 && !close; a++) for (let c = -1; c <= 1; c++) { const v = lampAt.get((Math.floor(p.x / 12) + a) + ',' + (Math.floor(p.z / 12) + c)); if (v && Math.hypot(v[0] - p.x, v[1] - p.z) < 13) { close = true; break; } }
        if (close) continue; lampAt.set(key(p.x, p.z), [p.x, p.z]); nLamp++;
        const led = rnd1() < .35, i = .75 + .25 * rnd1(), c = led ? [1, .86, .62] : [1, .6, .24]; pts.push([p.x, p.y + 4.5, p.z, c[0] * i, c[1] * i, c[2] * i, 3.5]); } }
    // instanced sprites: position, colour (linear, x 3 for the bloom), size in px
    const n = pts.length, P = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), Cc = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), S = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    const lin = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
    pts.forEach((q, k) => { P.array.set(q.slice(0, 3), 3 * k); Cc.array.set(q.slice(3, 6).map(v => lin(v) * 3), 3 * k); S.array[k] = q[6]; });
    const mat = new THREE.PointsNodeMaterial({ sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    mat.positionNode = instancedBufferAttribute(P); const canvasH = uniform(800); ctx.onFrame(() => { canvasH.value = ctx.renderer.domElement.height || 800; });
    // the size follows the target drawn into: the water mirror draws at 0.35 of the canvas, where a fixed pixel size looked 3x too big
    mat.sizeNode = instancedBufferAttribute(S).mul(window.devicePixelRatio > 1 ? 1.5 : 1).mul(viewportSize.y.div(canvasH));
    mat.colorNode = vec4(instancedBufferAttribute(Cc).mul(U.night), float(1));
    mat.opacityNode = smoothstep(0.5, 0.1, length(uv().sub(0.5))).mul(U.night);
    const sp = new THREE.Sprite(mat); sp.count = n; sp.frustumCulled = false; sp.renderOrder = 4; sp.name = 'nightlights';
    stats.nightlights = { aviation: nRed, apex: nApex, lamps: nLamp, signs: 0, ms: Math.round(performance.now() - t0) };
    const group = new THREE.Group(); group.name = 'nightlights'; group.add(sp);
    // generic lit signs near the top of office towers of 150 m or more (index.html buildNightLights): a short cool-white bar,
    // 30 % of the face, 6 m under the top, 0.7 m out, on the two longest faces. No names or logos: the real signs are
    // trademarks, and which face carries one is not in our data. Built when the registry gives the towers' use (registry.js
    // sets ctx.buildOpts.useOf); additive, so by day (U.night 0) it adds nothing.
    let signsDone = false;
    const buildSigns = useOf => {
      const p = [], idx = [];
      for (const t of TOWERS) { const top = towerTop(t), base = t.base_m_od ?? t.tiers[0].y0; if (top - base < 150 || useOf(t.model_buildings[0]) !== 2) continue;
        const ring = (t.tiers.find(tr => top - 6 >= tr.y0 - .01 && top - 6 <= tr.y1 + .01) || t.tiers.at(-1)).ring, { cx, cz } = centre(ring), m = ring.length;   // the tier at the sign's height (index.html takes the one at top - 1: on 8 Canada Square a rooftop plant tier, which put the bars inside the tower)
        const edges = ring.map((q, i) => [q, ring[(i + 1) % m]]).sort((a, b) => Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1]) - Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1])).slice(0, 2);
        for (const [a, b] of edges) { const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, l = Math.hypot(mx - cx, mz - cz) || 1, ox = (mx - cx) / l * .7, oz = (mz - cz) / l * .7, y = top - 6, k = p.length / 3;
          const P = f => [a[0] + (b[0] - a[0]) * f + ox, a[1] + (b[1] - a[1]) * f + oz];
          const [x0, z0] = P(.35), [x1, z1] = P(.65); p.push(x0, y - .5, z0, x1, y - .5, z1, x1, y + .5, z1, x0, y + .5, z0); idx.push(k, k + 1, k + 2, k, k + 2, k + 3); stats.nightlights.signs++; } }
      if (!idx.length) return;
      const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); G.setIndex(idx); G.computeBoundingSphere();
      const sm = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const lin = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
      sm.colorNode = vec4(vec3(lin(.88), lin(.94), 1).mul(.55 * 3).mul(U.night).mul(step(positionWorld.y, U.cut)), float(1));
      const mesh = new THREE.Mesh(G, sm); mesh.name = 'tower signs'; mesh.renderOrder = 4; group.add(mesh); ctx.draw();
    };
    ctx.onFrame(() => { if (!signsDone && ctx.buildOpts.useOf) { signsDone = true; buildSigns(ctx.buildOpts.useOf); } });
    // One Canada Square's halo in the colour of the evening (crown.js): a toggle and the note, as Layers > "Crown halo colour by date"
    const crown = initCrown(ctx);
    ctx.ui.toggle('Crown halo colour by date', true, v => crown.setOn(v));
    const note = ctx.ui.note(''); crown.onChange = () => { note.textContent = `One Canada Square's halo, ${crown.text()}.`; stats.nightlights.crown = crown.text(); };
    return { object: group, crown };
  },
};
