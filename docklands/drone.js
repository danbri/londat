// Drone (layer "drone") of the Three.js port: a first-person "virtual drone" with six vehicles (copter, plane, boat,
// tube, walk, under), ported from the WebGL page's drone.js. The physics, autopilots, input rules and the share value are
// the same code (fixed 1/120 s steps, autopilot back 3 s after the last input); what changed is the page interface: the
// drone takes the three.js camera from OrbitControls while it flies (controls disabled, the camera set in an onFrame
// hook), the cut-away is layers/under.js (setCut, showGauge), the walking network and its routes are layers/routes.js,
// the tunnel levels are under.js's tunnel model (copied below: under.js does not export it), the tide is water.js
// WU.tideLevel while the tide layer is on. URL: ?drone=copter|plane|boat|tube|walk|under; the share hash gets
// dr=mode,x,y,z,heading,look-pitch while it flies. Test hook: globalThis.DocklandsDrone (the WebGL page's API).
// Skill: docklands-3d-page, "Drone" and "Three.js port".
import { WU } from './water.js';

const A = globalThis.DOCKLANDS_AREA;
const DT = 1 / 120, FRAME_MAX = 1, IDLE = 3, RAMP = 1, BOOST_T = 2, CAP = 300, G = 9.81;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), mix = (a, b, w) => a + (b - a) * w;
const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const ease = (dt, tau) => 1 - Math.exp(-dt / tau);
const VEH = {
  copter: { k: '1', name: 'Copter', vmax: 30, fov: 75, near: .5, lever: 'lift' },
  plane: { k: '2', name: 'Plane', vmax: 80, vmin: 22, fov: 80, near: 2, lever: 'speed' },
  boat: { k: '3', name: 'Boat', vmax: 10, fov: 70, near: 1, lever: 'speed' },
  tube: { k: '4', name: 'Tube', vmax: 25, fov: 85, near: .3, lever: 'speed' },
  walk: { k: '5', name: 'Walk', vmax: 3, fov: 75, near: .25, lever: 'speed' },
  under: { k: '6', name: 'Under', vmax: 30, fov: 80, near: .3, lever: 'lift' },
};
const MODES = Object.keys(VEH);

// ---------- the tunnel model of layers/under.js (index.html tunnelY): controls [s, level, kind] per tunnel chain
const CTL = new Map();
for (const l of A.lines) if (l.tunnel) {
  const c = []; if (l.ends[0] != null) c.push([0, l.ends[0], 'portal']);
  for (const p of l.pts) if (p[4] != null) c.push([p[3], p[4], 'cut']);
  if (l.ends[1] != null) c.push([l.len, l.ends[1], 'portal']);
  for (const s of l.src || []) c.push([s[0], s[1], 'src', s[2]]);
  c.sort((a, b) => a[0] - b[0]); CTL.set(l, c);
}
export function tunnelY(l, p, P) {
  if (p[4] != null) return p[4];
  const s = p[3], n = P.grad; let a = null, b = null;
  for (const c of CTL.get(l) || []) { if (c[0] <= s) a = c; else { b = c; break; } }
  if (!a && !b) return p[2] - (l.k === 'foot' || l.k === 'road' ? Math.min(P.ddeep, 15) : P.ddeep);
  const dip = l.k === 'road' || l.k === 'foot' ? Math.min(P.dmax, 12) : P.dmax;
  if (a && b) return a[1] + (b[1] - a[1]) * (s - a[0]) / Math.max(1, b[0] - a[0]) - Math.min(dip, (s - a[0]) / n, (b[0] - s) / n);
  const c = a || b;
  return c[2] === 'src' ? c[1] : c[1] - Math.min(P.ddeep, Math.abs(s - c[0]) / n);
}
// the tunnel parameters as under.js reads them (?storey, ?dmax, ?grad, ?ddeep)
export function parOf(qs) { const num = (k, d, lo, hi) => { const v = parseFloat(qs.get(k)); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
  return { storey: num('storey', 4, 2.5, 6), dmax: num('dmax', 10, 0, 30), grad: num('grad', 40, 20, 100), ddeep: num('ddeep', 25, 5, 45) }; }

const CSS = `#drone{position:fixed;inset:0;z-index:3;display:none;touch-action:none;-webkit-user-select:none;user-select:none}
body.drone #drone{display:block}
#drHud{position:absolute;left:8px;bottom:calc(var(--safe,0px) + 30px);font:600 11px/1.35 system-ui,sans-serif;color:#e8eaec;background:#0d1013b3;border-radius:7px;padding:3px 7px;pointer-events:none;white-space:nowrap;max-width:calc(100vw - 60px);overflow:hidden;text-overflow:ellipsis}
#drHud i{font-style:normal;opacity:.7}
#drBar{position:absolute;right:8px;top:calc(env(safe-area-inset-top,0px) + 60px);display:flex;gap:6px;align-items:center}
#drBar button,#drBar select{height:34px;border-radius:17px;border:1px solid #59616a99;background:#15191dcc;color:#e8eaec;font:600 12px system-ui,sans-serif;padding:0 11px;touch-action:manipulation;width:auto}
#drBar button[aria-pressed=true]{background:#2a6fd6cc;border-color:#4da3ff}
#drLever{position:absolute;right:10px;top:34%;width:40px;height:170px;border-radius:20px;background:#15191d99;border:1px solid #59616a88;touch-action:none}
#drone.gauge #drLever{right:110px}
#drLever b{position:absolute;left:4px;width:30px;height:30px;border-radius:50%;background:#e8eaecdd;top:calc(50% - 15px)}
#drLever span{position:absolute;left:0;right:0;bottom:-18px;text-align:center;font:600 10px system-ui,sans-serif;color:#e8eaec;text-shadow:0 1px 2px #000}
#drBoost{position:absolute;right:10px;bottom:calc(var(--safe,0px) + 40px);width:60px;height:60px;border-radius:50%;border:1px solid #59616a99;background:#15191dcc;color:#e8eaec;font:700 12px system-ui,sans-serif;touch-action:none}
#drBoost.on{background:#d6702acc;border-color:#ffb34d}
#drStick{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;border:2px solid #e8eaec66;background:#15191d55;pointer-events:none;display:none}
#drStick b{position:absolute;left:38px;top:38px;width:44px;height:44px;border-radius:50%;background:#e8eaecbb}
#drHint{position:absolute;left:50%;top:40%;transform:translateX(-50%);font:600 13px/1.3 system-ui,sans-serif;color:#e8eaec;background:#1b2128e6;border-radius:8px;padding:5px 9px;pointer-events:none;opacity:0;transition:opacity .3s;text-align:center;max-width:80vw}
#drHint.on{opacity:1}
@media (pointer:fine){#drLever,#drBoost{opacity:.75}}`;

export default {
  id: 'drone', label: null, on: true, reveal: false,
  async init(ctx) {
    const { THREE, camera, controls, renderer, qs, draw } = ctx, $ = id => document.getElementById(id);
    const P0 = parOf(qs), D3 = () => globalThis.__docklands3, layer = id => D3()?.layers?.[id];
    const UA = () => layer('under')?.api, RA = () => layer('routes')?.api;
    const S = {
      on: false, mode: 'copter', manual: false, t: 0, acc: 0, last: 0,
      p: [0, 0, 0], v: [0, 0, 0], h: 0, lp: 0, ly: 0, roll: 0, prev: null,
      auto: true, inT: -1e9, lookT: -1e9, target: null, b: 1, bUntil: -1, bHold: false, bMax: 1,
      lever: 0, set: .6, under: false, push: 0, passes: 0, saved: null, autoCut: false, msg: '',
      kb: new Set(), ti: null, pad: null, wheel: 0, lastEye: null, lastTgt: null, skip: 0, frames: 0, hashT: 0,
    };
    const fwd = h => [Math.sin(h), Math.cos(h)], right = h => [-Math.cos(h), Math.sin(h)];

    // ---------- the model: terrain (bilinear on the 20 m DTM), buildings (prisms in a 50 m grid), water (an 8 m raster)
    const T = A.terrain;
    function ground(x, z) {
      const fx = clamp((x - T.x0) / T.cell, 0, T.nx - 1.001), fz = clamp((z - T.z0) / T.cell, 0, T.nz - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, h = (a, b) => T.dm[b * T.nx + a] / 10;
      return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
    }
    const dec = (q, s = 2) => { const o = new Float64Array(q.length), a = new Array(s).fill(0); for (let i = 0; i < q.length; i++) { a[i % s] += q[i]; o[i] = a[i % s] / 10; } return o; };
    const rings = o => { const f = dec(o.p), n = f.length / 2, st = [0, ...(o.holes || []), n], out = []; for (let r = 0; r + 1 < st.length; r++) { const ring = []; for (let k = st[r]; k < st[r + 1]; k++) ring.push([f[2 * k], f[2 * k + 1]]); if (ring.length > 2) out.push(ring); } return out; };
    let BLD = null;
    function buildings() {
      if (BLD) return BLD;
      const GS = 50, grid = new Map(), key = (i, j) => i * 100003 + j, list = [];
      for (const b of A.buildings) {
        const rs = rings(b); if (!rs.length) continue; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
        for (const [x, z] of rs[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
        const o = { rs, y0: b.b + (b.mh || 0), y1: b.b + b.h, x0, x1, z0, z1 }; list.push(o);
        for (let i = Math.floor(x0 / GS); i <= Math.floor(x1 / GS); i++) for (let j = Math.floor(z0 / GS); j <= Math.floor(z1 / GS); j++) { const k = key(i, j); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(o); }
      }
      const near = (x, z, r) => { const out = new Set(); for (let i = Math.floor((x - r) / GS); i <= Math.floor((x + r) / GS); i++) for (let j = Math.floor((z - r) / GS); j <= Math.floor((z + r) / GS); j++) for (const o of grid.get(key(i, j)) || []) if (o.x0 - r <= x && o.x1 + r >= x && o.z0 - r <= z && o.z1 + r >= z) out.add(o); return out; };
      return (BLD = { list, near });
    }
    const inRing = (ring, x, z) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
    const inside = (o, x, z) => { if (!inRing(o.rs[0], x, z)) return false; for (let k = 1; k < o.rs.length; k++) if (inRing(o.rs[k], x, z)) return false; return true; };
    function wall(o, x, z) {
      let best = 1e9, nx = 0, nz = 0;
      for (const ring of o.rs) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, az] = ring[j], [bx, bz] = ring[i], ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1e-9, t = clamp(((x - ax) * ex + (z - az) * ez) / L2, 0, 1), px = ax + ex * t, pz = az + ez * t, d = Math.hypot(x - px, z - pz);
        if (d < best) { best = d; nx = x - px; nz = z - pz; }
      }
      const l = Math.hypot(nx, nz) || 1, ins = inside(o, x, z), s = ins ? -1 : 1;
      return { d: s * best, n: [s * nx / l, s * nz / l] };
    }
    const roofAt = (x, z, r = 0) => { let top = -1e9; for (const o of buildings().near(x, z, r)) if (o.y1 > top && (inside(o, x, z) || (r > 0 && wall(o, x, z).d < r))) top = o.y1; return top; };

    let WR = null;
    function water() {
      if (WR) return WR;
      const C = 8, E = A.meta.extent, x0 = E.x0, z0 = E.z0, nx = Math.ceil((E.x1 - E.x0) / C), nz = Math.ceil((E.z1 - E.z0) / C), N = nx * nz, id = new Int16Array(N).fill(-1);
      A.water.forEach((w, wi) => {
        const rs = rings(w); if (!rs.length) return; let zA = 1e9, zB = -1e9; for (const [, z] of rs[0]) { zA = Math.min(zA, z); zB = Math.max(zB, z); }
        for (let j = Math.max(0, Math.floor((zA - z0) / C)); j <= Math.min(nz - 1, Math.ceil((zB - z0) / C)); j++) {
          const zc = z0 + (j + .5) * C, xs = [];
          for (const ring of rs) for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) { const [xi, zi] = ring[i], [xk, zk] = ring[k]; if ((zi > zc) !== (zk > zc)) xs.push(xi + (zc - zi) * (xk - xi) / (zk - zi)); }
          xs.sort((a, b) => a - b);
          for (let q = 0; q + 1 < xs.length; q += 2) for (let i = Math.max(0, Math.ceil((xs[q] - x0) / C - .5)); i <= Math.min(nx - 1, Math.floor((xs[q + 1] - x0) / C - .5)); i++) id[j * nx + i] = wi;
        }
      });
      const cls = wi => A.water[wi].tidal ? -100 : A.water[wi].level, gate = new Uint8Array(N);
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = id[j * nx + i]; if (a < 0) continue;
        for (const [di, dj] of [[1, 0], [0, 1]]) { const ii = i + di, jj = j + dj; if (ii >= nx || jj >= nz) continue; const b = id[jj * nx + ii]; if (b < 0) continue; if (Math.abs(cls(a) - cls(b)) > .5) { gate[j * nx + i] = 1; gate[jj * nx + ii] = 1; } } }
      const d = new Float32Array(N), INF = 1e9, s2 = C * Math.SQRT2;
      for (let k = 0; k < N; k++) d[k] = id[k] >= 0 && !gate[k] ? INF : 0;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (!d[k]) continue; let m = d[k];
        if (i === 0 || j === 0 || i === nx - 1) m = Math.min(m, C / 2);
        if (i > 0) m = Math.min(m, d[k - 1] + C); if (j > 0) { m = Math.min(m, d[k - nx] + C); if (i > 0) m = Math.min(m, d[k - nx - 1] + s2); if (i < nx - 1) m = Math.min(m, d[k - nx + 1] + s2); } d[k] = m; }
      for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; if (!d[k]) continue; let m = d[k];
        if (i === nx - 1 || j === nz - 1) m = Math.min(m, C / 2);
        if (i < nx - 1) m = Math.min(m, d[k + 1] + C); if (j < nz - 1) { m = Math.min(m, d[k + nx] + C); if (i < nx - 1) m = Math.min(m, d[k + nx + 1] + s2); if (i > 0) m = Math.min(m, d[k + nx - 1] + s2); } d[k] = m; }
      const comp = new Int32Array(N).fill(-1), dmax = []; let nc = 0;
      for (let k0 = 0; k0 < N; k0++) { if (!d[k0] || comp[k0] >= 0) continue; const q = [k0]; comp[k0] = nc; let mx = 0;
        while (q.length) { const k = q.pop(); mx = Math.max(mx, d[k]); const i = k % nx, j = (k - i) / nx;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; const kk = jj * nx + ii; if (d[kk] && comp[kk] < 0) { comp[kk] = nc; q.push(kk); } } }
        dmax.push(mx); nc++; }
      return (WR = { C, x0, z0, nx, nz, id, d, comp, dmax });
    }
    const cellOf = (x, z) => { const W = water(), i = Math.floor((x - W.x0) / W.C), j = Math.floor((z - W.z0) / W.C); return i < 0 || j < 0 || i >= W.nx || j >= W.nz ? -1 : j * W.nx + i; };
    function wdist(x, z) {
      const W = water(), fx = clamp((x - W.x0) / W.C - .5, 0, W.nx - 1.001), fz = clamp((z - W.z0) / W.C - .5, 0, W.nz - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, g = (a, b) => W.d[b * W.nx + a];
      return (g(i, j) * (1 - u) + g(i + 1, j) * u) * (1 - v) + (g(i, j + 1) * (1 - u) + g(i + 1, j + 1) * u) * v;
    }
    const wgrad = (x, z) => { const e = 4, gx = (wdist(x + e, z) - wdist(x - e, z)) / (2 * e), gz = (wdist(x, z + e) - wdist(x, z - e)) / (2 * e), l = Math.hypot(gx, gz); return l > 1e-6 ? [gx / l, gz / l] : [0, 0]; };
    // the water surface: the tide layer's level (water.js WU.tideLevel) on tidal water while it is on, else the polygon level
    function surface(x, z) {
      const k = cellOf(x, z), wi = k >= 0 ? water().id[k] : -1; if (wi < 0) return null;
      const w = A.water[wi]; if (!w.tidal) return w.level;
      return (layer('tide')?.on ? WU.tideLevel.value : w.level) + .1;
    }

    // ---------- input
    const KEYS = { w: 'f', arrowup: 'f', s: 'b', arrowdown: 'b', a: 'l', d: 'r', arrowleft: 'tl', arrowright: 'tr', q: 'u', e: 'dn', ' ': 'brake', shift: 'boost' };
    function user() {
      const k = S.kb, ti = S.ti || {}, c = { mx: 0, my: 0, lift: 0, turn: 0, brake: false };
      const has = x => [...k].some(q => KEYS[q] === x);
      c.my = (has('f') ? 1 : 0) - (has('b') ? 1 : 0);
      const strafe = (has('r') ? 1 : 0) - (has('l') ? 1 : 0), turn = (has('tr') ? 1 : 0) - (has('tl') ? 1 : 0);
      if (S.mode === 'copter' || S.mode === 'under') { c.mx = strafe; c.turn = turn; } else c.mx = clamp(strafe + turn, -1, 1);
      c.lift = (has('u') ? 1 : 0) - (has('dn') ? 1 : 0); c.brake = has('brake');
      if (ti.stick) { c.mx = clamp(c.mx + ti.stick[0], -1, 1); c.my = clamp(c.my + ti.stick[1], -1, 1); }
      if (VEH[S.mode].lever === 'lift') { c.lift = clamp(c.lift + S.lever + S.wheel, -1, 1); }
      const p = S.pad; if (p) { c.mx = clamp(c.mx + p.mx, -1, 1); c.my = clamp(c.my + p.my, -1, 1); c.lift = clamp(c.lift + p.lift, -1, 1); if (p.brake) c.brake = true; }
      c.any = !!(c.mx || c.my || c.lift || c.turn || c.brake);
      return c;
    }
    const autoW = () => S.auto ? clamp((S.t - S.inT - IDLE) / RAMP, 0, 1) : 0;

    // ---------- vehicles (drone.js, unchanged but for the page interface)
    const V = {};
    function boostStep(dt) {
      const on = S.bHold || S.t < S.bUntil, tgt = on ? S.bMax : 1, red = reduced();
      S.b += (tgt - S.b) * ease(dt, on ? (red ? .8 : .4) : (red ? 1.2 : .7)); if (Math.abs(S.b - tgt) < 1e-4) S.b = tgt;
    }
    const vcap = vm => Math.min(CAP, vm * S.b);
    const R_EYE = 2, ZONE = 14;
    function avoid(p, v, dt) {
      const B = buildings();
      for (const o of B.near(p[0], p[2], R_EYE + ZONE)) {
        if (p[1] > o.y1 + R_EYE + ZONE || p[1] < o.y0 - R_EYE) continue;
        const w = wall(o, p[0], p[2]), above = p[1] - o.y1;
        if (w.d < 0 && above > -1) { if (v[1] < 0 && above < R_EYE + ZONE) { const lim = -Math.max(0, (above - R_EYE) / ZONE) * 30; if (v[1] < lim) v[1] = lim; } continue; }
        if (above > 0 && w.d < R_EYE) continue;
        const towards = -(v[0] * w.n[0] + v[2] * w.n[1]); if (towards <= 0) continue;
        const allow = Math.max(0, (w.d - R_EYE) / ZONE) * Math.max(5, Math.hypot(v[0], v[2]));
        if (towards > allow) { const k = towards - allow; v[0] += w.n[0] * k; v[2] += w.n[1] * k; }
      }
      const q = [p[0] + v[0] * dt, p[1] + v[1] * dt, p[2] + v[2] * dt];
      for (const o of B.near(q[0], q[2], R_EYE)) {
        if (q[1] > o.y1 + R_EYE || q[1] < o.y0 - R_EYE) continue;
        const w = wall(o, q[0], q[2]);
        if (w.d >= R_EYE) continue;
        if (p[1] >= o.y1 + R_EYE - .01 || (w.d < 0 && q[1] > o.y1 - 1)) { q[1] = Math.max(q[1], o.y1 + R_EYE); if (v[1] < 0) v[1] = 0; continue; }
        const k = R_EYE - w.d; q[0] += w.n[0] * k; q[2] += w.n[1] * k; const vn = v[0] * w.n[0] + v[2] * w.n[1]; if (vn < 0) { v[0] -= w.n[0] * vn; v[2] -= w.n[1] * vn; }
      }
      return q;
    }
    const CW = [50, 40], TOUR_R = 450;
    V.copter = {
      start(p) { S.v = [0, 0, 0]; S.p = p; S.under = S.mode === 'under'; S.home = [p[0], p[1], p[2]]; },
      step(dt, c, wa) {
        const red = reduced(), vm = vcap(VEH[S.mode].vmax), f = fwd(S.h), r = right(S.h), wu = 1 - wa;
        const mv = Math.min(1, Math.hypot(c.mx, c.my)), sc = mv > 0 ? Math.min(1, mv) / Math.hypot(c.mx, c.my) : 0;
        const uv = [(f[0] * c.my + r[0] * c.mx) * sc * vm, c.lift * Math.min(CAP, 8 * S.b), (f[1] * c.my + r[1] * c.mx) * sc * vm];
        if (c.turn) { S.h -= c.turn * 1.4 * dt; S.lookT = S.t; }
        let av = [0, 0, 0]; if (wa > 0) av = this.auto();
        const tv = [mix(av[0], uv[0], wu), mix(av[1], uv[1], wu), mix(av[2], uv[2], wu)];
        if (c.brake) { tv[0] = tv[1] = tv[2] = 0; }
        const tau = (red ? 1.6 : .8) / Math.sqrt(S.b), k = ease(dt, c.brake ? tau / 3 : tau);
        for (let i = 0; i < 3; i++) S.v[i] += (tv[i] - S.v[i]) * k;
        const hs = Math.hypot(S.v[0], S.v[2]); if (wa > 0 && hs > 2 && S.t - S.lookT > IDLE) S.h += angDiff(Math.atan2(S.v[0], S.v[2]), S.h) * ease(dt, 1.2) * wa;
        let q;
        if (!S.under) q = avoid(S.p, S.v, dt); else q = [S.p[0] + S.v[0] * dt, S.p[1] + S.v[1] * dt, S.p[2] + S.v[2] * dt];
        const g = ground(q[0], q[2]);
        if (!S.under) {
          const cl = q[1] - g, lim = 1.5;
          if (cl < lim + 6 && S.v[1] < 0) { const m = -Math.max(.3, (cl - lim) / 6) * 8 * S.b; if (S.v[1] < m && c.lift >= 0) S.v[1] = m; }
          if (q[1] < g + lim) { q[1] = g + lim; S.v[1] = Math.max(0, S.v[1]); if (c.lift < 0) { S.push += dt; if (S.push >= .6) passUnder(q, g); } else S.push = 0; } else S.push = 0;
        } else {
          const top = g - 1.5, floor = -60;
          if (q[1] > top) { q[1] = top; S.v[1] = Math.min(0, S.v[1]); if (c.lift > 0) { S.push += dt; if (S.push >= .6) passUp(q, g); } else S.push = 0; } else S.push = 0;
          if (q[1] < floor) { q[1] = floor; S.v[1] = Math.max(0, S.v[1]); }
        }
        S.p = q; S.roll = 0;
      },
      auto() {
        const p = S.p; let hx, hz, sp;
        if (S.target) { const dx = S.target[0] - p[0], dz = S.target[1] - p[1], dd = Math.hypot(dx, dz); sp = Math.min(vcap(S.under ? 12 : 25), Math.sqrt(2 * 3 * dd)); hx = dd > .5 ? dx / dd : 0; hz = dd > .5 ? dz / dd : 0; }
        else if (S.under) { const C = S.home || p, dx = p[0] - C[0], dz = p[2] - C[2], a = Math.atan2(dx, dz) - 40 / 150, ex = C[0] + 150 * Math.sin(a) - p[0], ez = C[2] + 150 * Math.cos(a) - p[2], el = Math.hypot(ex, ez) || 1; hx = ex / el; hz = ez / el; sp = vcap(8); }
        else { const dx = p[0] - CW[0], dz = p[2] - CW[1], a = Math.atan2(dx, dz) - 80 / TOUR_R, tx = CW[0] + TOUR_R * Math.sin(a), tz = CW[1] + TOUR_R * Math.cos(a), ex = tx - p[0], ez = tz - p[2], el = Math.hypot(ex, ez) || 1; hx = ex / el; hz = ez / el; sp = vcap(12); }
        let vy = 0;
        if (!S.under) {
          if (S.t >= (S.roofT || 0)) { S.roofT = S.t + .25; let top = -1e9; for (const s of [0, 40, 80, 130]) top = Math.max(top, roofAt(p[0] + hx * s, p[2] + hz * s, 25)); S.roof = top; }
          const tgtG = S.target ? ground(S.target[0], S.target[1]) + 40 : ground(p[0], p[2]) + 70, want = Math.max(tgtG, S.roof + 25);
          vy = clamp((want - p[1]) * .6, -5, 8);
        } else vy = clamp(((S.target ? Math.min(ground(S.target[0], S.target[1]) - 12, (S.home || p)[1]) : (S.home || p)[1]) - p[1]) * .5, -4, 4);
        return [hx * sp, vy, hz * sp];
      },
    };
    V.under = V.copter;
    // below ground: the cut-away of layers/under.js at street level - 1 m, its gauge shown
    function cutTo(v) { const U = UA(); if (!U) return; U.setCut(v); U.showGauge(true); }
    function cutOff() { const U = UA(); if (U) U.showGauge(false); }
    const cutOn = () => { const U = UA(); return !!U && U.cutLevel() < 250; };
    function passUnder(q, g) {
      S.push = 0; S.under = true; S.mode = 'under'; S.passes++; q[1] = g - 2;
      if (!cutOn()) { cutTo(clamp(Math.round(g) - 1, -40, 60)); S.autoCut = true; }
      try { navigator.vibrate && navigator.vibrate(15); } catch { /* not allowed */ }
      say('Below ground. Push up to come back.'); syncUi();
    }
    function passUp(q, g) {
      S.push = 0; S.under = false; S.mode = 'copter'; S.passes++; q[1] = g + 2;
      cutOff(); S.autoCut = false;
      try { navigator.vibrate && navigator.vibrate(15); } catch { /* not allowed */ }
      say('Above ground'); syncUi();
    }
    const LOOP = { c: [250, 1100], r: 1300, alt: 260 };
    V.plane = {
      start(p) { S.V = 45; S.gam = 0; S.phi = 0; S.p = [p[0], Math.max(p[1], ground(p[0], p[2]) + 120), p[2]]; S.set = .35; },
      step(dt, c, wa) {
        const red = reduced(), P = VEH.plane, wu = 1 - wa;
        let phiA = 0, gamA = 0;
        if (wa > 0) {
          const C = S.target ? S.target : LOOP.c, R = S.target ? 400 : LOOP.r, alt = S.target ? Math.max(ground(S.target[0], S.target[1]) + 150, 120) : LOOP.alt;
          const dx = S.p[0] - C[0], dz = S.p[2] - C[1], a = Math.atan2(dx, dz) + 300 / R, tx = C[0] + R * Math.sin(a), tz = C[1] + R * Math.cos(a);
          const hd = Math.atan2(tx - S.p[0], tz - S.p[2]); phiA = clamp(-angDiff(hd, S.h) * 1.2, -.5, .5); gamA = clamp((alt - S.p[1]) * .01, -.2, .2);
        }
        const phiU = c.mx * .75, gamU = c.my * .3 + c.lift * .3;
        let phiT = mix(phiA, phiU, wu), gamT = mix(gamA, gamU, wu);
        if (S.t >= (S.roofT || 0)) { S.roofT = S.t + .25; let top = -1e9; for (const s of [0, 100, 200, 320]) { const x = S.p[0] + Math.sin(S.h) * s, z = S.p[2] + Math.cos(S.h) * s; top = Math.max(top, roofAt(x, z, 30), ground(x, z)); } S.roof = top; }
        if (S.p[1] < S.roof + 40) gamT = Math.max(gamT, clamp((S.roof + 40 - S.p[1]) * .02, 0, .35));
        const vt = c.brake ? P.vmin : Math.min(CAP, (P.vmin + clamp(S.set, 0, 1) * (P.vmax - P.vmin)) * S.b);
        S.V += (vt - S.V) * ease(dt, (red ? 4 : 2.5) / Math.sqrt(S.b)); S.V = Math.max(P.vmin, S.V);
        S.phi += (phiT - S.phi) * ease(dt, red ? 1.2 : .6); S.gam += (gamT - S.gam) * ease(dt, red ? 1.6 : .9);
        S.h -= G * Math.tan(S.phi) / S.V * dt;
        S.v = [S.V * Math.cos(S.gam) * Math.sin(S.h), S.V * Math.sin(S.gam), S.V * Math.cos(S.gam) * Math.cos(S.h)];
        const q = avoid(S.p, S.v, dt), g = ground(q[0], q[2]); if (q[1] < g + 15) { q[1] = g + 15; S.gam = Math.max(S.gam, .1); }
        S.p = q; S.roll = red ? 0 : -S.phi * 180 / Math.PI;
      },
    };
    const HULL = 5;
    V.boat = {
      start(p) {
        const W = water(); let best = -1, bd = 1e18; const want = 30;
        for (let k = 0; k < W.d.length; k++) { if (W.d[k] < want) continue; const i = k % W.nx, j = (k - i) / W.nx, x = W.x0 + (i + .5) * W.C, z = W.z0 + (j + .5) * W.C, dd = (x - p[0]) ** 2 + (z - p[2]) ** 2; if (dd < bd) { bd = dd; best = k; } }
        if (best < 0) return false;
        const i = best % W.nx, j = (best - i) / W.nx; S.p = [W.x0 + (i + .5) * W.C, 0, W.z0 + (j + .5) * W.C]; S.u = 0; S.set = .6;
        const g = wgrad(S.p[0], S.p[2]); if (g[0] || g[1]) S.h = Math.atan2(-g[1], g[0]);
        S.p[1] = surface(S.p[0], S.p[2]) + 2; S.bodyW = W.dmax[W.comp[best]]; S.route = null;
        return true;
      },
      step(dt, c, wa) {
        const red = reduced(), P = VEH.boat, wu = 1 - wa, x = S.p[0], z = S.p[2];
        let rudA = 0, uA = 0;
        if (wa > 0) { const hd = this.course(x, z); if (hd != null) { rudA = clamp(-angDiff(hd, S.h) * 1.5, -1, 1); uA = vcap(S.target && this.left < 30 ? Math.max(.5, this.left / 6) : Math.min(6, S.bodyW / 4)); } }
        const uU = c.my ? c.my * (c.my > 0 ? 1 : .4) * vcap(P.vmax) : clamp(S.set, 0, 1) * vcap(P.vmax);
        const uT = c.brake ? 0 : mix(uA, uU, wu), rud = mix(rudA, c.mx, wu);
        S.u += (uT - S.u) * ease(dt, (red ? 3 : 1.6) / Math.sqrt(S.b));
        S.h -= rud * (red ? .35 : .5) * clamp(Math.abs(S.u) / 3, .35, 1) * Math.sign(S.u || 1) * dt;
        const f = fwd(S.h); let q = [x + f[0] * S.u * dt, 0, z + f[1] * S.u * dt];
        const ok = (a, b) => { const d = wdist(a, b); return d >= HULL || d > wdist(x, z) + 1e-6; };
        if (!ok(q[0], q[2])) {
          const g = wgrad(x, z), t = [-g[1], g[0]], s = (q[0] - x) * t[0] + (q[2] - z) * t[1]; q = [x + t[0] * s, 0, z + t[1] * s];
          if (!ok(q[0], q[2])) { q = [x, 0, z]; S.u = 0; } else S.u *= .98;
        }
        const sf = surface(q[0], q[2]); q[1] = (sf == null ? S.p[1] - 2 : sf) + 2;
        S.v = [(q[0] - x) / dt, (q[1] - S.p[1]) / dt, (q[2] - z) / dt]; S.p = q; S.roll = 0;
      },
      course(x, z) {
        if (S.target) {
          if (!S.route || S.route.key !== S.target.join()) S.route = this.field(S.target);
          const R = S.route; if (!R) { S.target = null; return null; }
          const k = cellOf(x, z); this.left = k >= 0 && R.f[k] < 1e9 ? R.f[k] : 0;
          if (this.left < 12) { S.target = null; S.route = null; say('Arrived'); return null; }
          const W = water(), i = k % W.nx, j = (k - i) / W.nx; let bx = 0, bz = 0, bv = R.f[k];
          for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W.nx || jj >= W.nz) continue; const v = R.f[jj * W.nx + ii]; if (v < bv) { bv = v; bx = di; bz = dj; } }
          return bx || bz ? Math.atan2(bx, bz) : null;
        }
        const d = wdist(x, z), g = wgrad(x, z); if (!g[0] && !g[1]) return null;
        const want = clamp(S.bodyW * .45, HULL + 2, 40), t = [-g[1], g[0]], e = clamp((d - want) / want, -1, 1) * .9;
        return Math.atan2(t[0] - g[0] * e, t[1] - g[1] * e);
      },
      field(tg) {
        const W = water(), N = W.d.length, f = new Float32Array(N).fill(1e9); let k0 = -1, bd = 1e18;
        const comp = W.comp[cellOf(S.p[0], S.p[2])];
        for (let k = 0; k < N; k++) { if (W.d[k] < HULL || W.comp[k] !== comp) continue; const i = k % W.nx, j = (k - i) / W.nx, dd = (W.x0 + (i + .5) * W.C - tg[0]) ** 2 + (W.z0 + (j + .5) * W.C - tg[1]) ** 2; if (dd < bd) { bd = dd; k0 = k; } }
        if (k0 < 0) return null;
        const q = [k0]; f[k0] = 0; let h = 0;
        while (h < q.length) { const k = q[h++], i = k % W.nx, j = (k - i) / W.nx;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W.nx || jj >= W.nz) continue; const kk = jj * W.nx + ii; if (f[kk] < 1e9 || W.d[kk] < HULL * .6) continue; f[kk] = f[k] + W.C; q.push(kk); } }
        return { key: tg.join(), f };
      },
    };
    let RG = null;
    function rails() {
      if (RG) return RG;
      const ch = [];
      for (const l of A.lines) {
        if (!/^(rail|subway|light_rail)$/.test(l.k)) continue; let pts = [];
        if (l.tunnel) pts = l.pts.map(p => [p[0], tunnelY(l, p, P0) + 3, p[1]]);
        else { const q = dec(l.q, 3); for (let i = 0; i < q.length; i += 3) pts.push([q[i], q[i + 2], q[i + 1]]); pts = pts.map((p, i) => { let s = 0, n = 0; for (let k = Math.max(0, i - 2); k <= Math.min(pts.length - 1, i + 2); k++) { s += pts[k][1]; n++; } return [p[0], s / n + 3.5, p[2]]; }); }
        if (pts.length < 2) continue; const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
        ch.push({ l, pts, cum, len: cum[cum.length - 1], tunnel: !!l.tunnel, name: l.name || l.k });
      }
      const GS = 20, grid = new Map(), key = (x, z) => Math.floor(x / GS) * 100003 + Math.floor(z / GS);
      ch.forEach((c, ci) => [0, 1].forEach(e => { const p = e ? c.pts[c.pts.length - 1] : c.pts[0], k = key(p[0], p[2]); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push([ci, e, p]); }));
      for (const c of ch) c.links = [0, 1].map(e => { const p = e ? c.pts[c.pts.length - 1] : c.pts[0], out = [], ci0 = ch.indexOf(c);
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const [ci, e2, q] of grid.get(key(p[0] + i * GS, p[2] + j * GS)) || []) if ((ci !== ci0 || e2 !== e) && Math.hypot(q[0] - p[0], q[2] - p[2]) < 12 && Math.abs(q[1] - p[1]) < 8) out.push([ci, e2]);
        return out; });
      return (RG = ch);
    }
    const along = (c, s) => { s = clamp(s, 0, c.len); let i = 1; while (i < c.cum.length - 1 && c.cum[i] < s) i++; const a = c.pts[i - 1], b = c.pts[i], k = (s - c.cum[i - 1]) / Math.max(1e-9, c.cum[i] - c.cum[i - 1]); return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; };
    V.tube = {
      start(p) {
        const ch = rails(), pref = /Jubilee/; let best = null, bd = 1e18;
        for (const pass of [0, 1]) { for (const c of ch) { if (!c.tunnel || (pass === 0 && !pref.test(c.name))) continue; for (let i = 0; i < c.pts.length; i++) { const q = c.pts[i], dd = (q[0] - p[0]) ** 2 + (q[2] - p[2]) ** 2; if (dd < bd) { bd = dd; best = [c, c.cum[i]]; } } } if (best && bd < 1500 * 1500) break; }
        if (!best) return false;
        S.ci = ch.indexOf(best[0]); S.s = best[1]; S.dir = 1; S.u = 0; S.set = .8; S.wait = 0; S.turnPref = 0; S.turnT = -1e9;
        const a = along(best[0], S.s - 5), b = along(best[0], S.s + 5); if (b[0] < a[0]) S.dir = -1;
        S.p = along(best[0], S.s); S.h = Math.atan2((b[0] - a[0]) * S.dir, (b[2] - a[2]) * S.dir); return true;
      },
      next(c, end) {
        const ch = rails(), d0 = (() => { const a = along(c, end ? c.len - 10 : 10), b = along(c, end ? c.len : 0); return Math.atan2(b[0] - a[0], b[2] - a[2]); })();
        let best = null, bv = 1e9;
        for (const [ci, e2] of c.links[end]) {
          const n = ch[ci], a = along(n, e2 ? n.len : 0), b = along(n, e2 ? n.len - 10 : 10), turn = angDiff(Math.atan2(b[0] - a[0], b[2] - a[2]), d0);
          if (Math.abs(turn) > 1.8) continue;
          let v = Math.abs(turn);
          if (S.t - S.turnT < 6 && S.turnPref) v = S.turnPref * turn;
          else if (S.target) { const far = along(n, e2 ? 0 : n.len); v = Math.hypot(far[0] - S.target[0], far[2] - S.target[1]); }
          if (v < bv) { bv = v; best = [ci, e2]; }
        }
        return best;
      },
      step(dt, c, wa) {
        const ch = rails(), P = VEH.tube, wu = 1 - wa, red = reduced();
        if (c.mx) { S.turnPref = Math.sign(c.mx); S.turnT = S.t; }
        if (c.my) S.set = clamp(S.set + c.my * .5 * dt, 0, 1);
        let cur = ch[S.ci];
        const remain = S.dir > 0 ? cur.len - S.s : S.s, nx = this.next(cur, S.dir > 0 ? 1 : 0);
        let vt = mix(.8, S.set, wu) * vcap(P.vmax);
        if (!nx) vt = Math.min(vt, Math.sqrt(2 * 1.1 * Math.max(0, remain - 3)));
        if (S.target) { const d = Math.hypot(S.p[0] - S.target[0], S.p[2] - S.target[1]); if (d < 40) { vt = 0; if (S.u < .2) { S.target = null; say('Arrived'); } } else if (d < 300) vt = Math.min(vt, Math.sqrt(2 * 1.1 * d)); }
        if (c.brake) vt = 0;
        const acc = (red ? .7 : 1.3) * S.b * S.b, brk = c.brake ? 3 : 1.4;
        S.u = S.u < vt ? Math.min(vt, S.u + acc * dt) : Math.max(vt, S.u - brk * S.b * dt);
        if (S.u < 1e-3 && !nx && remain < 4) { S.wait += dt; if (S.wait > 2 && wa > .99) { S.dir = -S.dir; S.wait = 0; say('Reversing'); } } else S.wait = 0;
        S.s += S.dir * S.u * dt;
        while (S.s > cur.len || S.s < 0) {
          const end = S.s > cur.len ? 1 : 0, over = end ? S.s - cur.len : -S.s, n = this.next(cur, end);
          if (!n) { S.s = clamp(S.s, 0, cur.len); S.u = 0; break; }
          S.ci = n[0]; cur = ch[S.ci]; S.dir = n[1] ? -1 : 1; S.s = n[1] ? cur.len - over : over;
        }
        const p = along(cur, S.s), a = along(cur, S.s - 8 * S.dir), b = along(cur, S.s + 8 * S.dir);
        S.v = [(p[0] - S.p[0]) / dt, (p[1] - S.p[1]) / dt, (p[2] - S.p[2]) / dt]; S.p = p;
        S.h += angDiff(Math.atan2(b[0] - a[0], b[2] - a[2]), S.h) * ease(dt, .25); S.lpPath = Math.atan2(b[1] - a[1], Math.hypot(b[0] - a[0], b[2] - a[2])); S.roll = 0;
      },
    };
    // walk: the walking network of layers/routes.js (data/indoor.js) at 1.6 m eye; levels at storey x level (the station
    // models' measured floors are not used here); routes by routes.js routeVertices (Dijkstra in seconds; async)
    const EYE = 1.6, SPEED = { steps: .6, escalator: .75, lift: 1.2 };
    const NV = () => RA()?.NET;
    const vpos = v => { const N = NV().D.nodes, lv = N[4 * v + 2], g = N[4 * v + 3]; return [N[4 * v], g + lv * P0.storey, N[4 * v + 1]]; };
    const findPlace = re => NV().P.find(p => re.test(p.name));
    let planId = 0;
    V.walk = {
      async prepare() { const R = RA(); if (!R) throw new Error('no routes layer'); await R.loadNet(); },
      start(p) {
        const N = NV(); if (!N) return false;
        let from = null, to = null;
        if (Math.hypot(p[0] - CW[0], p[2] - CW[1]) < 900 && !S.target) { from = findPlace(/^Westbound platform 1$/); to = findPlace(/^Rituals$/) || findPlace(/^Jubilee Place/); }
        const v0 = from ? from.v : this.nearest(p[0], p[1], p[2]);
        S.wa = v0; S.wb = v0; S.wt = 0; S.u = 0; S.path = null; S.dest = to ? to.v : null; S.home = v0; S.set = .5;
        if (S.target) { S.dest = this.nearest(S.target[0], null, S.target[1]); }
        else if (S.dest == null) { const q = N.P.filter(x => /platform|station point/.test(x.kind)).map(x => [x, Math.hypot(vpos(x.v)[0] - p[0], vpos(x.v)[2] - p[2])]).filter(a => a[1] > 60).sort((a, b) => a[1] - b[1])[0]; if (q) S.dest = q[0].v; }
        S.p = vpos(v0); S.p[1] += EYE; this.plan();
        return true;
      },
      nearest(x, y, z) { const N = NV(); let best = 0, bd = 1e18; for (let v = 0; v < N.n; v++) { if (!N.adj[v].length) continue; const q = vpos(v), dd = (q[0] - x) ** 2 + (q[2] - z) ** 2 + (y == null ? 0 : ((q[1] + EYE - y) * 3) ** 2); if (dd < bd) { bd = dd; best = v; } } return best; },
      edgeKind(a, b) { const e = NV().adj[a].find(x => x[0] === b); return e ? e[1] : 'footway'; },
      plan() {
        S.path = null; S.planT = S.t + 2; const from = S.wt > 0 ? S.wb : S.wa, dest = S.dest, id = ++planId; if (dest == null || dest === from) return;
        RA().routeVertices(from, dest, false, null).then(r => {
          if (!r || id !== planId || S.dest !== dest || S.mode !== 'walk') return;
          if (S.wt > 0) { if (S.wb !== from) return; S.path = r.path; }
          else { if (S.wa !== from) return; S.path = r.path.slice(1); if (!S.path.length) { S.path = null; return; } S.wb = S.path[0]; S.wt = 0; }
          if (S.path && S.path.length > 1 && S.u < .05) { const q = vpos(S.path[S.path[0] === S.wb ? 0 : 1] ?? S.path[0]); S.h = Math.atan2(q[0] - S.p[0], q[2] - S.p[2]) || S.h; }
        }).catch(e => console.warn('drone walk', e));
      },
      step(dt, c, wa) {
        const N = NV(), P = VEH.walk, wu = 1 - wa;
        if (wa > .99 && !S.path && S.dest != null && S.t >= (S.planT || 0)) {
          if (S.wt <= 0 && S.wa === S.dest) { S.arrT = (S.arrT || 0) + dt; if (S.arrT > 3) { S.arrT = 0; const h = S.home; S.home = S.dest; S.dest = h; this.plan(); } }
          else this.plan();
        }
        if (c.any && S.path) { S.path = null; planId++; }
        let len = Math.hypot(...vpos(S.wb).map((x, i) => x - vpos(S.wa)[i]));
        const base = (SPEED[this.edgeKind(S.wa, S.wb)] || 1.4) * S.b, uA = S.path ? Math.min(CAP, base) : 0;
        let uU = c.my * Math.min(CAP, (c.my > 0 ? Math.max(1.4, P.vmax * S.set) : 1.4) * S.b);
        if (uU < 0 && wu > .5) { [S.wa, S.wb] = [S.wb, S.wa]; S.wt = Math.max(0, len - S.wt); S.h += Math.PI; S.u = 0; uU = -uU; S.kb.delete('s'); S.kb.delete('arrowdown'); if (S.ti) S.ti.stick = null; }
        const uT = c.brake ? 0 : Math.max(0, mix(uA, uU, wu)); S.u += (uT - S.u) * ease(dt, .3);
        let t = S.wt + S.u * dt;
        for (let guard = 0; guard < 8 && t >= len; guard++) {
          const at = S.wb; let nb = null;
          if (S.path) { S.path.shift(); nb = S.path.length ? S.path[0] : null; if (nb == null) S.path = null; }
          else if (S.u > .05) { const dir = S.h + S.ly; let bv = 1e9; const p = vpos(at);
            for (const [v] of N.adj[at]) { if (v === S.wa && N.adj[at].length > 1) continue; const q = vpos(v), dd = Math.hypot(q[0] - p[0], q[2] - p[2]), ang = dd < .5 ? .3 : Math.abs(angDiff(Math.atan2(q[0] - p[0], q[2] - p[2]), dir)); if (ang < bv && ang < 1.6) { bv = ang; nb = v; } } }
          const over = t - len; S.wa = at;
          if (nb == null) { S.wb = at; t = 0; S.u = 0; len = 0; break; }
          S.wb = nb; t = over; len = Math.hypot(...vpos(S.wb).map((x, i) => x - vpos(S.wa)[i]));
        }
        S.wt = Math.max(0, t);
        const A0 = vpos(S.wa), B0 = vpos(S.wb), L0 = len || 1, kk = clamp(S.wt / L0, 0, 1);
        const p = [A0[0] + (B0[0] - A0[0]) * kk, A0[1] + (B0[1] - A0[1]) * kk + EYE, A0[2] + (B0[2] - A0[2]) * kk];
        S.v = [(p[0] - S.p[0]) / dt, (p[1] - S.p[1]) / dt, (p[2] - S.p[2]) / dt]; S.p = p;
        const hz = Math.hypot(B0[0] - A0[0], B0[2] - A0[2]); if (hz > .5 && S.u > .05) S.h += angDiff(Math.atan2(B0[0] - A0[0], B0[2] - A0[2]), S.h) * ease(dt, .5);
        if (c.mx && !S.path) { S.h -= c.mx * 1.2 * dt; S.lookT = S.t; }
        S.roll = 0;
      },
    };

    // ---------- the loop: fixed steps; the camera between the last two steps
    function step1() {
      const c = user(); if (c.any) S.inT = S.t;
      boostStep(DT);
      const wa = autoW(); S.prev = { p: S.p.slice(), h: S.h, lp: S.lp, ly: S.ly, roll: S.roll };
      V[S.mode].step(DT, c, wa);
      if (S.mode !== 'copter' && S.mode !== 'under' && S.t - S.lookT > IDLE) { const k = ease(DT, 1); S.ly -= S.ly * k; S.lp += ((S.lpPath || 0) * .5 - S.lp) * k; }
      if (S.wheel) { S.wheel *= Math.exp(-DT / .15); if (Math.abs(S.wheel) < .01) S.wheel = 0; }
      S.t += DT;
    }
    function advance(sec) { S.acc += sec; let n = 0; while (S.acc >= DT - 1e-12) { step1(); S.acc -= DT; n++; } return n; }
    const vT = new THREE.Vector3();
    // the three.js camera: eye, look direction, roll (plane), vertical field (x 1.25 on a portrait screen), near and far.
    // controls.target 100 m ahead (beyond OrbitControls' minimum distance), so the controls' own update leaves the eye put
    function applyCam() {
      const pr = S.prev || S, a = S.prev ? clamp(S.acc / DT, 0, 1) : 1, P = i => pr.p[i] + (S.p[i] - pr.p[i]) * a;
      const eye = [P(0), P(1), P(2)], h = pr.h + angDiff(S.h, pr.h) * a + S.ly, lp = clamp(pr.lp + (S.lp - pr.lp) * a + (S.mode === 'plane' ? S.gam : 0), -1.45, 1.45);
      const dir = [Math.sin(h) * Math.cos(lp), Math.sin(lp), Math.cos(h) * Math.cos(lp)];
      const port = innerHeight > innerWidth, F = VEH[S.mode].fov * (port ? 1.25 : 1);
      // vertical exaggeration (main.js setVz): the camera and the orbit are in the exaggerated space (y x vz), as index.html
      // render() puts a free camera's eye and target (cam.eye[1] x VZ); the drone itself flies in model metres
      const vz = ctx.vzNow ? ctx.vzNow() : 1;
      camera.position.set(eye[0], eye[1] * vz, eye[2]); camera.up.set(0, 1, 0);
      vT.set(eye[0] + dir[0] * 100, (eye[1] + dir[1] * 100) * vz, eye[2] + dir[2] * 100); controls.target.copy(vT); camera.lookAt(vT);
      if (S.roll) camera.rotateZ(-S.roll * Math.PI / 180);
      let near = VEH[S.mode].near; if (S.mode === 'copter' && !S.under) near = clamp((S.p[1] - ground(S.p[0], S.p[2])) / 6, .5, 4);
      camera.fov = Math.min(100, F); camera.near = near; camera.far = S.mode === 'tube' || S.mode === 'walk' || S.under ? 6000 : 20000; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      S.lastEye = camera.position.clone(); S.lastTgt = controls.target.clone(); autoCut(); hud();
    }
    function autoCut() {
      if (!(S.mode === 'tube' || S.mode === 'walk')) return;
      const g = ground(S.p[0], S.p[2]), below = S.p[1] < g - 1;
      if (below) { const v = clamp(Math.round(S.p[1] + (S.mode === 'tube' ? 1.5 : 2.6)), -40, 60), U = UA(); if (U && U.cutLevel() !== v) cutTo(v); S.autoCut = true; }
      else if (S.autoCut) { S.autoCut = false; cutOff(); }
    }
    ctx.onFrame(() => {
      if (!S.on) return;
      // another mover (a view button, a search fly-to, a shared link) took the camera: leave without moving it
      if (S.skip > 0) S.skip--;
      else if (S.lastEye && (camera.position.distanceTo(S.lastEye) > 1 || controls.target.distanceTo(S.lastTgt) > 1)) { stop(true); return; }
      const now = performance.now();
      if (!S.manual) { const sec = Math.min(FRAME_MAX, Math.max(0, (now - S.last) / 1000)); S.last = now; pollPad(); advance(sec); S.frames++; }
      applyCam(); draw();
      if (now - S.hashT > 500) { S.hashT = now; writeHash(); }
    });

    // ---------- start, stop, switch
    const saveControls = () => ({ enabled: controls.enabled, enableDamping: controls.enableDamping, minDistance: controls.minDistance, maxDistance: controls.maxDistance, minPolarAngle: controls.minPolarAngle, maxPolarAngle: controls.maxPolarAngle });
    async function start(mode = 'copter', pose = null) {
      if (!VEH[mode]) mode = 'copter';
      if (!S.on) { S.saved = { controls: saveControls(), cut: UA() ? UA().cutLevel() : 250 }; }
      let p, h;
      if (pose) { p = pose.p; h = pose.h; }
      else if (S.on) { p = S.p.slice(); h = S.h; }
      else {   // from the current orbit view: 300 m from the target along the view, over the roofs
        const tg = controls.target, off = camera.position.clone().sub(tg), dist = off.length(), k = Math.min(1, 300 / Math.max(1, dist));
        p = [tg.x + off.x * k, 0, tg.z + off.z * k]; p[1] = Math.max(ground(p[0], p[2]) + Math.min(120, 30 + dist * .05), roofAt(p[0], p[2], 60) + 25); h = Math.atan2(-off.x, -off.z);
      }
      if (mode === 'under' && p[1] > ground(p[0], p[2]) - 3) p[1] = ground(p[0], p[2]) - 12;
      if (V[mode].prepare) { say('Loading the walking network'); try { await V[mode].prepare(); } catch (e) { say('The walking network did not load'); return false; } }
      const old = S.mode; S.mode = mode; S.h = h ?? 0; S.ly = 0; S.lp = pose && pose.lp != null ? pose.lp : mode === 'plane' ? 0 : -.12; S.roll = 0; S.b = 1; S.bUntil = -1; S.lever = 0; S.target = S.on ? S.target : null; S.push = 0;
      if (mode === 'copter' || mode === 'under') { if (mode === 'under' || p[1] < ground(p[0], p[2])) { S.under = true; S.mode = 'under'; if (!cutOn()) cutTo(clamp(Math.round(ground(p[0], p[2])) - 1, -40, 60)); else UA()?.showGauge(true); } else S.under = false; }
      if (old && old !== S.mode && (old === 'tube' || old === 'walk') && S.autoCut) { S.autoCut = false; if (S.saved && S.saved.cut >= 250) cutOff(); }
      const ok = V[S.mode].start(p);
      if (ok === false) { S.mode = old; say(mode === 'boat' ? 'No water near here' : mode === 'tube' ? 'No rail tunnel near here' : 'Cannot start here'); if (!S.on) return false; }
      if (pose && pose.p && S.mode !== 'tube' && S.mode !== 'walk' && S.mode !== 'boat') { S.p = pose.p.slice(); if (V[S.mode] === V.copter) S.home = S.p.slice(); }
      if (pose && pose.p && S.mode === 'boat' && wdist(pose.p[0], pose.p[2]) >= HULL) { S.p = [pose.p[0], surface(pose.p[0], pose.p[2]) + 2, pose.p[2]]; S.h = pose.h; }
      S.v = S.v || [0, 0, 0]; S.prev = null; S.acc = 0; S.inT = -1e9; S.lookT = -1e9;
      if (!S.on) {
        S.on = true; document.body.classList.add('drone'); S.last = performance.now();
        // the drone owns the camera: OrbitControls off, its limits opened so its update() leaves the camera where it is
        Object.assign(controls, { enabled: false, enableDamping: false, minDistance: 0.01, maxDistance: Infinity, minPolarAngle: 0, maxPolarAngle: Math.PI });
        globalThis.__docklands3?.selectModel?.(-1);
      }
      S.skip = 3;
      try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch { /* nothing focused */ }
      applyCam(); syncUi(); draw();
      dispatchEvent(new CustomEvent('docklands-drone', { detail: { on: true, mode: S.mode } }));
      return true;
    }
    function stop(byOther) {
      if (!S.on) return; S.on = false; document.body.classList.remove('drone'); stick(null);
      const h = S.h, p = S.p, sv = S.saved && S.saved.controls;
      if (sv) Object.assign(controls, sv); controls.enabled = true;
      if (!byOther) {   // back to the orbit: looking at a point 150 m ahead from 350 m behind it
        const g = ground(p[0], p[2]), tx = p[0] + Math.sin(h) * 150, tz = p[2] + Math.cos(h) * 150, c = { tx, tz, ty: Math.max(0, g), yaw: h + Math.PI, pitch: .45, dist: 350 };
        const D = D3(); if (D && D.setCam) D.setCam(c); else { controls.target.set(tx, c.ty, tz); camera.position.set(tx + 350 * Math.sin(c.yaw) * Math.cos(.45), c.ty + 350 * Math.sin(.45), tz + 350 * Math.cos(c.yaw) * Math.cos(.45)); controls.update(); }
        if (S.saved && (S.autoCut || S.under)) { if (S.saved.cut >= 250) cutOff(); else UA()?.setCut(S.saved.cut); }
      }
      S.autoCut = false; S.under = false; S.lastEye = null; draw();
      try { const q = new URLSearchParams(location.search); q.delete('drone'); history.replaceState(null, '', location.pathname + (q.size ? '?' + q : '') + (D3()?.shareHash ? D3().shareHash() : location.hash.replace(/&dr=[^&]*/, ''))); } catch { /* history not allowed */ }
      dispatchEvent(new CustomEvent('docklands-drone', { detail: { on: false } }));
    }
    // the share hash: main.js writes its own (#v=1&c=...) on its changes; while the drone flies every such write gets dr=
    const rs = history.replaceState;
    history.replaceState = function (st, t, url) {
      if (S.on && typeof url === 'string' && /#v=1/.test(url)) { const v = shareValue(); url = url.replace(/&dr=[^&#]*/, '') + (v ? '&dr=' + v : ''); }
      return rs.call(this, st, t, url);
    };
    function writeHash() { const D = D3(); if (D && D.shareHash) try { history.replaceState(null, '', location.pathname + location.search + D.shareHash()); } catch { /* history not allowed */ } }

    // ---------- the touch controls, the HUD and the menu button
    const css = document.createElement('style'); css.textContent = CSS; document.head.appendChild(css);
    const ui = document.createElement('div'); ui.id = 'drone'; ui.setAttribute('aria-label', 'Drone controls');
    ui.innerHTML = `<div id="drStick"><b></b></div><div id="drHud" role="status" aria-live="off"></div><div id="drHint" role="status" aria-live="polite"></div>
<div id="drBar"><select id="drVeh" aria-label="Vehicle">${MODES.map(m => `<option value="${m}">${VEH[m].k} ${VEH[m].name}</option>`).join('')}</select><button type="button" id="drAuto" aria-pressed="true" title="Autopilot (P)">Auto</button><button type="button" id="drExit" aria-label="Leave the drone (Esc)">✕</button></div>
<div id="drLever" role="slider" aria-label="Up and down" aria-valuemin="-1" aria-valuemax="1" aria-valuenow="0" tabindex="-1"><b></b><span>↑↓</span></div>
<button type="button" id="drBoost" aria-label="Boost: ten times the speed for 2 s (Shift)">Boost</button>`;
    document.body.appendChild(ui);
    const hudEl = $('drHud'), hint = $('drHint'), stickEl = $('drStick'), lever = $('drLever'), knob = lever.querySelector('b');
    let hintT = 0; function say(t) { S.msg = t; hint.textContent = t; hint.classList.toggle('on', !!t); clearTimeout(hintT); if (t) hintT = setTimeout(() => hint.classList.remove('on'), 2400); }
    const fmt = (v, d = 0) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
    function info() {
      const g = ground(S.p[0], S.p[2]), sp = Math.hypot(...S.v), sf = S.mode === 'boat' ? surface(S.p[0], S.p[2]) : null, wa = autoW();
      return { mode: S.mode, speed: sp, agl: S.p[1] - g, depth: S.p[1] < g - 1 ? g - S.p[1] : 0, od: S.p[1], water: sf, auto: !S.auto ? 'manual' : wa > 0 ? 'auto' : S.t - S.inT < IDLE ? `you · auto in ${Math.ceil(IDLE - (S.t - S.inT))} s` : 'you', boost: S.b };
    }
    function hud() {
      const I = info(), parts = [VEH[S.mode].name, `<i>${I.auto}</i>`, `${fmt(I.speed, I.speed < 10 ? 1 : 0)} m/s`];
      if (S.mode === 'boat' && I.water != null) parts.push(`water ${fmt(I.water, 1)} m OD`);
      else if (I.depth > 0) parts.push(`${fmt(I.od, 0)} m OD · ${fmt(I.depth, 0)} m below street`);
      else parts.push(`${fmt(I.agl, 0)} m above ground`);
      if (S.b > 1.05) parts.push(`boost ×${S.b.toFixed(1)}`);
      const s = parts.join(' · '); if (hudEl._s !== s) { hudEl._s = s; hudEl.innerHTML = s; }
      ui.classList.toggle('gauge', cutOn());
    }
    function syncUi() {
      $('drVeh').value = S.mode; $('drAuto').setAttribute('aria-pressed', String(S.auto));
      const lv = VEH[S.mode].lever; lever.querySelector('span').textContent = lv === 'lift' ? '↑↓' : 'speed'; lever.setAttribute('aria-label', lv === 'lift' ? 'Up and down' : 'Speed');
      leverDraw();
    }
    function leverDraw() { const lv = VEH[S.mode].lever, v = lv === 'lift' ? S.lever : S.set * 2 - 1; knob.style.top = `calc(${(1 - (v + 1) / 2) * 100}% - ${15 + v * -11}px)`; lever.setAttribute('aria-valuenow', v.toFixed(2)); }
    $('drVeh').onchange = e => { start(e.target.value); e.target.blur(); };
    $('drAuto').onclick = () => { S.auto = !S.auto; if (S.auto) S.inT = -1e9; syncUi(); say(S.auto ? 'Autopilot on' : 'Autopilot off: the vehicle holds where it is when you let go'); };
    $('drExit').onclick = () => stop(false);
    const boostTap = () => { S.bMax = reduced() ? 4 : 10; S.bUntil = S.t + BOOST_T; };
    $('drBoost').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); boostTap(); $('drBoost').classList.add('on'); setTimeout(() => $('drBoost').classList.remove('on'), BOOST_T * 1000); });
    let leverId = null;
    { const at = e => { const r = lever.getBoundingClientRect(); return clamp(1 - 2 * (e.clientY - r.top) / r.height, -1, 1); };
      const move = e => { if (e.pointerId !== leverId) return; const v = at(e); if (VEH[S.mode].lever === 'lift') S.lever = Math.abs(v) < .08 ? 0 : v; else { S.set = (v + 1) / 2; S.inT = S.t; } leverDraw(); };
      lever.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); leverId = e.pointerId; lever.setPointerCapture(leverId); move(e); });
      lever.addEventListener('pointermove', move);
      for (const ty of ['pointerup', 'pointercancel']) lever.addEventListener(ty, e => { if (e.pointerId !== leverId) return; leverId = null; if (VEH[S.mode].lever === 'lift') S.lever = 0; leverDraw(); }); }
    const ptr = new Map(); let stickId = null;
    function stick(st) { if (!st) { stickEl.style.display = 'none'; stickId = null; if (S.ti) S.ti.stick = null; return; } stickEl.style.display = 'block'; stickEl.style.left = st.x0 + 'px'; stickEl.style.top = st.y0 + 'px'; stickEl.querySelector('b').style.transform = `translate(${st.dx}px,${st.dy}px)`; }
    ui.addEventListener('pointerdown', e => {
      if (e.target !== ui) return; e.preventDefault(); ui.setPointerCapture(e.pointerId);
      const r = ui.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const isStick = e.pointerType !== 'mouse' && stickId == null && x < r.width * .5 && y > r.height * .3;
      ptr.set(e.pointerId, { x, y, x0: x, y0: y, t0: e.timeStamp, kind: isStick ? 'stick' : 'look', moved: 0 });
      if (isStick) { stickId = e.pointerId; S.ti = S.ti || {}; S.ti.stick = [0, 0]; stick({ x0: x, y0: y, dx: 0, dy: 0 }); }
    });
    ui.addEventListener('pointermove', e => {
      const q = ptr.get(e.pointerId); if (!q) return; const r = ui.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, dx = x - q.x, dy = y - q.y; q.moved += Math.hypot(dx, dy); q.x = x; q.y = y;
      if (q.kind === 'stick') { let sx = x - q.x0, sy = y - q.y0; const l = Math.hypot(sx, sy), R = 50; if (l > R) { sx *= R / l; sy *= R / l; } S.ti.stick = [Math.abs(sx) < 6 ? 0 : sx / R, Math.abs(sy) < 6 ? 0 : -sy / R]; stick({ x0: q.x0, y0: q.y0, dx: sx, dy: sy }); return; }
      const looks = [...ptr.values()].filter(p => p.kind === 'look');
      if (looks.length >= 2) { const v = -dy / 120 / looks.length; if (VEH[S.mode].lever === 'lift') S.lever = clamp(S.lever + v * 2, -1, 1); else { S.set = clamp(S.set + v, 0, 1); } S.inT = S.t; leverDraw(); return; }
      look(dx, dy);
    });
    function look(dx, dy) { const k = 0.0055 * (VEH[S.mode].fov / 75); if (S.mode === 'copter' || S.mode === 'under') S.h -= dx * k; else S.ly -= dx * k; S.lp = clamp(S.lp - dy * k, -1.4, 1.4); S.lookT = S.t; }
    const up = e => { const q = ptr.get(e.pointerId); if (!q) return; ptr.delete(e.pointerId);
      if (q.kind === 'stick') { stick(null); return; }
      if (VEH[S.mode].lever === 'lift' && leverId == null && ![...ptr.values()].some(p => p.kind === 'look')) { S.lever = 0; leverDraw(); }
      if (e.type === 'pointerup' && q.moved < 8 && e.timeStamp - q.t0 < 300 && !ptr.size) tapGo(e.clientX, e.clientY); };
    ui.addEventListener('pointerup', up); ui.addEventListener('pointercancel', up);
    ui.addEventListener('wheel', e => { e.preventDefault(); const v = -Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 100); if (VEH[S.mode].lever === 'lift') S.wheel = clamp(S.wheel + v * .8, -1, 1); else { S.set = clamp(S.set + v * .08, 0, 1); leverDraw(); } S.inT = S.t; }, { passive: false });
    // a tap: the ground or roof under it is the autopilot's target (walk: the nearest network point on screen)
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    function groundUnder(x, y) {
      const r = renderer.domElement.getBoundingClientRect(); ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
      const M = ctx.meshes, hit = ray.intersectObjects([M.terrain, M.water, ...M.buildings.children], false)[0];
      return hit ? [hit.point.x, hit.point.z] : null;
    }
    function tapGo(x, y) {
      if (S.mode === 'walk') { const v = RA()?.vertexAt(x, y) ?? -1; if (v >= 0) { S.dest = v; S.path = null; S.target = null; S.inT = -1e9; say('Walking there'); } return; }
      const g = groundUnder(x, y); if (!g) return; goTo(g[0], g[1]);
    }
    function goTo(x, z, name) {
      S.target = [x, z]; S.route = null; S.inT = -1e9; S.auto = true; syncUi();
      if (S.mode === 'walk') { S.dest = V.walk.nearest(x, null, z); S.path = null; S.target = null; }
      say((name ? name + ': ' : '') + (S.mode === 'tube' ? 'the train stops nearest to it' : 'autopilot on its way'));
    }
    const typing = e => e.target instanceof Element && e.target.closest('input,select,textarea') && e.target.id !== 'drVeh';
    addEventListener('keydown', e => {
      if (!S.on || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return; const k = e.key.toLowerCase();
      if (k === 'escape') { stop(false); e.preventDefault(); return; }
      const m = MODES.find(x => VEH[x].k === k); if (m) { start(m); e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (k === 'p') { $('drAuto').click(); e.preventDefault(); return; }
      if (KEYS[k]) { S.kb.add(k); if (k === 'shift') { S.bMax = reduced() ? 4 : 10; S.bHold = true; } e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    addEventListener('keyup', e => { const k = e.key.toLowerCase(); S.kb.delete(k); if (k === 'shift') { S.bHold = false; S.bUntil = S.t; } });
    addEventListener('blur', () => { S.kb.clear(); S.bHold = false; });
    function pollPad() {
      S.pad = null; let gp = null; try { gp = navigator.getGamepads && [...navigator.getGamepads()].find(g => g && g.connected); } catch { return; } if (!gp) return;
      const ax = i => { const v = gp.axes[i] || 0; return Math.abs(v) < .15 ? 0 : v; }, bt = i => gp.buttons[i] ? gp.buttons[i].value : 0;
      S.pad = { mx: ax(0), my: -ax(1), lift: bt(7) - bt(6), brake: bt(1) > .5 };
      if (ax(2) || ax(3)) look(ax(2) * 12, ax(3) * 12);
      if (bt(0) > .5) boostTap();
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden) S.kb.clear(); S.last = performance.now(); });
    // a view button leaves the drone (the view moves the camera; the frame hook would also see it)
    document.addEventListener('click', e => { if (S.on && e.target.closest && e.target.closest('[data-view]')) stop(true); }, true);

    // the menu button: in the views group
    { const views = document.getElementById('goMove') || document.querySelector('#drawer .views'), b = document.createElement('button'); b.type = 'button'; b.id = 'droneBtn'; b.textContent = 'Drone';
      b.title = 'Fly a first-person drone: copter, plane, boat, tube, walk, under';
      b.onclick = () => { if (S.on) stop(false); else { start(S.mode && S.mode !== 'under' ? S.mode : 'copter'); if (innerWidth < 900 && $('drawer')) $('drawer').hidden = true; } };
      if (views) views.appendChild(b); }

    // share: dr=mode,x,y,z,heading,look pitch
    const r1 = x => Math.round(x * 10) / 10, r3 = x => Math.round(x * 1e3) / 1e3;
    const shareValue = () => S.on ? [S.mode, r1(S.p[0]), r1(S.p[1]), r1(S.p[2]), r3(((S.h % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)), r3(S.lp)].join(',') : null;
    function fromShare(v) {
      const a = String(v || '').split(','), m = a[0], n = a.slice(1).map(Number);
      if (!VEH[m]) return false;
      const pose = n.length >= 5 && n.every(isFinite) ? { p: n.slice(0, 3), h: n[3], lp: n[4] } : null;
      return start(m, pose);
    }
    // at load: dr= in the hash wins over ?drone=; started once main.js has finished (its test hook exists). main.js rewrites
    // the hash before this layer loads, so the address the page was opened with comes from the navigation entry
    { let url = location.href; try { url = performance.getEntriesByType('navigation')[0]?.name || url; } catch { /* no timing */ }
      const h = url.includes('#') ? url.slice(url.indexOf('#')) : '', dr = /(?:^#|&)dr=([^&]*)/.exec(h), m = /[?&]drone=(\w+)/.exec(url.split('#')[0]);
      if (dr || m) { const go = () => { if (!D3()?.ready) return setTimeout(go, 100); if (dr) fromShare(decodeURIComponent(dr[1])); else start(VEH[m[1]] ? m[1] : 'copter'); }; setTimeout(go, 0); } }

    const api = {
      start, stop: () => stop(false), goTo, fromShare, shareValue, boost: boostTap,
      get on() { return S.on; }, S,
      manual(on = true) { S.manual = on; S.last = performance.now(); },
      step(sec, fps = 60) { const n = Math.round(sec * fps); for (let i = 0; i < n; i++) advance(1 / fps); applyCam(); draw(); return this.state; },
      keys(list) { S.kb = new Set(list.map(k => k.toLowerCase())); if (S.kb.has('shift')) { S.bMax = reduced() ? 4 : 10; S.bHold = true; } else S.bHold = false; },
      stick(x, y) { S.ti = S.ti || {}; S.ti.stick = x || y ? [x, y] : null; }, look,
      get state() { const I = info(); return { mode: S.mode, t: +S.t.toFixed(4), p: S.p.map(x => +x.toFixed(3)), h: +S.h.toFixed(4), lp: +S.lp.toFixed(4), speed: +I.speed.toFixed(3), agl: +I.agl.toFixed(2), depth: +I.depth.toFixed(2), water: I.water, auto: S.auto, wa: +autoW().toFixed(3), b: +S.b.toFixed(3), target: S.target, under: S.under, passes: S.passes, ci: S.ci, s: S.s, dir: S.dir, wa_v: S.wa, wb_v: S.wb, dest: S.dest, path: S.path ? S.path.length : 0, roll: S.roll, msg: S.msg, cut: UA() ? UA().cutLevel() : null }; },
      ground, surface, wdist, rails, buildings, roofAt, inside,
    };
    globalThis.DocklandsDrone = api;
    return { ownUi: true, ...api, get on() { return S.on; }, get state() { return api.state; } };
  },
};
