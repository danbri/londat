// Wind layer of the Docklands 3D page (Layers > Show > "Wind", off by default): the modelled wind at three heights
// (10 m, 120 m and the 975 hPa level, about 300 m, over the towers) for the hour of the page clock (sky.js), as moving
// streaks along streamlines traced through a 5 x 4 grid of model points over the model box, coloured by speed, with a
// readout (speed, direction, gusts, temperature, cloud, rain, the model and its time).
// Data: Open-Meteo forecast API (CC BY 4.0), model DWD ICON-D2 (about 2 km), then DWD ICON seamless; asked by the browser
// only after the visitor ticks Wind; if that fails, the 10 m wind of the londat hourly cache (cache/latest.json, one point).
// index.html calls DocklandsWind.init(ctx) and DocklandsWind.drawGL() in render() (also for each WebXR eye).
// Skill: docklands-3d-page, "Wind (2026-10-08)".
(() => {
let C = null;
const $ = id => document.getElementById(id), on = () => { const e = $('showWind'); return !!e && e.checked; };
const NX = 5, NZ = 4, STEPS = 14, SEEDS = 140, D2R = Math.PI / 180;
const LV = [   // drawn levels: ICON-D2 has 10, 80, 120 and 180 m above ground and pressure levels
  { key: '10m', name: '10 m', agl: 10, alt: ['10m'] },
  { key: '120m', name: '120 m', agl: 120, alt: ['120m', '80m', '180m'] },
  { key: '975hPa', name: '975 hPa', agl: null, alt: ['975hPa'] },
];
const HV = ['temperature_2m', 'cloud_cover', 'precipitation', 'weather_code', 'wind_gusts_10m', 'geopotential_height_975hPa',
  ...['10m', '80m', '120m', '180m', '975hPa'].flatMap(l => [`wind_speed_${l}`, `wind_direction_${l}`])].join(',');
const MODELS = [
  ['icon_d2', 'DWD ICON-D2 (about 2 km)'],
  ['icon_seamless', 'DWD ICON seamless (ICON-D2 2 km, then ICON-EU 7 km, then global 11 km)'],
];
const S = { pts: null, data: null, err: null, busy: false, lastAsk: 0, field: null, key: '', seedKey: '', buf: null, ib: null, n: 0, lines: [],
  stats: { segments: 0, vertices: 0, builds: 0, buildMs: 0, frames: 0, drawMs: 0 }, loop: 0, P: null, from: '', T: [] };

// ---------- the grid of model points: page metres to longitude and latitude (Newton on area.js meta.geo)
function lonlatOf(x, z) {
  let lon = -0.02, lat = 51.505;
  for (let k = 0; k < 8; k++) {
    const [x0, z0] = C.geo(lon, lat), e = 1e-4, [xa, za] = C.geo(lon + e, lat), [xb, zb] = C.geo(lon, lat + e);
    const a = (xa - x0) / e, b = (xb - x0) / e, c = (za - z0) / e, d = (zb - z0) / e, det = a * d - b * c, dx = x - x0, dz = z - z0;
    lon += (d * dx - b * dz) / det; lat += (-c * dx + a * dz) / det;
  }
  return [lon, lat];
}
function grid() {
  if (S.pts) return S.pts; const E = C.A.meta.extent, P = [];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = E.x0 + (E.x1 - E.x0) * i / (NX - 1), z = E.z0 + (E.z1 - E.z0) * j / (NZ - 1), [lon, lat] = lonlatOf(x, z);
    // unit vectors of true east and true north in page metres (grid north is -z; true north differs by about 1.5 degrees)
    const [x0, z0] = C.geo(lon, lat), [xe, ze] = C.geo(lon + 1e-3, lat), [xn, zn] = C.geo(lon, lat + 1e-3), le = Math.hypot(xe - x0, ze - z0), ln = Math.hypot(xn - x0, zn - z0);
    P.push({ x, z, lon: +lon.toFixed(4), lat: +lat.toFixed(4), e: [(xe - x0) / le, (ze - z0) / le], n: [(xn - x0) / ln, (zn - z0) / ln] });
  }
  return (S.pts = P);
}

// ---------- the clock and the data
const clock = () => { const K = globalThis.DocklandsSky; const t = K && K.t; return isFinite(t) ? t : Date.now(); };
const hourIso = ms => new Date(ms).toISOString().slice(0, 16);
async function getJSON(u) {
  // the time limit covers the answer's headers only: on a slow device the body can arrive while a frame is drawn
  const c = new AbortController(), tm = setTimeout(() => c.abort(), 25000); let r;
  try { r = await fetch(u, { signal: c.signal }); } finally { clearTimeout(tm); }
  const d = await r.json().catch(e => ({ error: true, reason: `HTTP ${r.status}, not JSON (${e.message})` }));
  if (!r.ok || d.error) throw new Error(d.reason || `HTTP ${r.status}`); return d;
}
function parse(arr, model, label, u) {
  arr = Array.isArray(arr) ? arr : [arr]; const P = grid(); if (arr.length !== P.length) throw new Error('wrong number of points');
  const T = arr[0].hourly.time.map(s => s * 1000), H = arr.map(a => a.hourly), lv = LV.map(L => {
    const use = L.alt.find(k => H.every(h => h[`wind_speed_${k}`] && h[`wind_speed_${k}`].some(v => v != null)));
    if (!use) return null;
    // per hour and point: the vector in page metres a second (x, z), from speed and the direction it blows FROM (true)
    const U = T.map((_, k) => H.map((h, p) => { const s = h[`wind_speed_${use}`][k], d = h[`wind_direction_${use}`][k]; if (s == null || d == null) return null;
      const b = (d + 180) * D2R, ve = s * Math.sin(b), vn = s * Math.cos(b), q = P[p]; return [ve * q.e[0] + vn * q.n[0], ve * q.e[1] + vn * q.n[1]]; }));
    const zg = L.agl == null ? T.map((_, k) => mean(H.map(h => (h.geopotential_height_975hPa || [])[k]))) : null;
    return { ...L, use, U, zg };
  });
  const val = k => T.map((_, i) => mean(H.map(h => (h[k] || [])[i])));
  return { model, label, url: u, T, lv, gust: T.map((_, i) => H.map(h => (h.wind_gusts_10m || [])[i])), temp: val('temperature_2m'), cloud: val('cloud_cover'), rain: val('precipitation'),
    code: T.map((_, i) => H[Math.floor(H.length / 2)].weather_code ? H[Math.floor(H.length / 2)].weather_code[i] : null), fetched: Date.now() };
}
const mean = a => { const v = a.filter(x => x != null && isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
function covers(D, t) { if (!D || !D.T.length) return false; const k = D.T.findIndex(x => x > t); return k > 0 && D.lv[0] && D.lv[0].U[k - 1].every(Boolean) && D.lv[0].U[k].every(Boolean); }
async function load() {
  const t = clock(); if (S.busy || covers(S.data, t) || Date.now() - S.lastAsk < (S.err && Math.abs(t - S.errT) < 36e5 ? 6e5 : 2e4)) return;   // after a failure: again in 10 min, or when the clock moves an hour S.busy = true; S.lastAsk = Date.now(); note();
  const P = grid(), h0 = Math.floor(t / 36e5) * 36e5 - 2 * 36e5, h1 = h0 + 6 * 36e5, old = Date.now() - t > 85 * 864e5;
  const host = old ? 'historical-forecast-api.open-meteo.com' : 'api.open-meteo.com', errs = [];
  try {
    for (const [model, label] of MODELS) {
      const u = `https://${host}/v1/forecast?latitude=${P.map(p => p.lat)}&longitude=${P.map(p => p.lon)}&hourly=${HV}&models=${model}` +
        `&wind_speed_unit=ms&timeformat=unixtime&timezone=GMT&cell_selection=nearest&start_hour=${hourIso(h0)}&end_hour=${hourIso(h1)}`;
      try { const D = parse(await getJSON(u), model, label, u); if (covers(D, t)) { S.data = D; S.from = 'open-meteo'; S.err = null; S.tried = errs; return; } errs.push(`${model}: no wind for that hour`); }
      catch (e) { errs.push(`${model}: ${e.message}`); if (/limit|HTTP 4/.test(e.message) && !/no wind/.test(e.message)) break; }
    }
    // the londat hourly cache: the 10 m wind at one point (Canary Wharf), when the clock is within 90 minutes of its time
    try { const w = await globalThis.CwLive.theme('weather', 180), c = w.current, wt = Date.parse(w.time);
      if (!(Math.abs(t - wt) < 90 * 6e4) || c.wind_kmh == null) throw new Error('the cache has only the latest hour');
      const s = c.wind_kmh / 3.6, b = (c.wind_dir + 180) * D2R, U = P.map(q => [s * Math.sin(b) * q.e[0] + s * Math.cos(b) * q.n[0], s * Math.sin(b) * q.e[1] + s * Math.cos(b) * q.n[1]]);
      S.data = { model: 'cache', label: 'Open-Meteo best match at Canary Wharf, one point (londat hourly cache)', T: [wt - 36e5, wt + 36e5], lv: [{ ...LV[0], use: '10m', U: [U, U], zg: null }, null, null],
        gust: [P.map(() => c.gust_kmh / 3.6), P.map(() => c.gust_kmh / 3.6)], temp: [c.temp_c, c.temp_c], cloud: [c.cloud_pct, c.cloud_pct], rain: [c.precip_mm, c.precip_mm], code: [c.weather_code, c.weather_code], fetched: Date.parse(w.fetched) };
      S.from = 'cache'; S.err = errs.join('; '); }
    catch (e) { errs.push(`cache: ${e.message}`); S.err = errs.join('; '); S.errT = t; if (!covers(S.data, t)) S.data = null; }
  } finally { S.busy = false; S.key = ''; note(); C.draw(); }
}

// ---------- the field at the clock time: linear in time between hours, bilinear between the grid points
function fieldAt(t) {
  const D = S.data; if (!D) return null; let k = D.T.findIndex(x => x > t); if (k < 1) k = k === 0 ? 1 : D.T.length - 1;
  const f = Math.max(0, Math.min(1, (t - D.T[k - 1]) / (D.T[k] - D.T[k - 1])));
  const lv = D.lv.map(L => { if (!L) return null; const a = L.U[k - 1], b = L.U[k]; if (!a.every(Boolean) || !b.every(Boolean)) return null;
    const U = a.map((v, p) => [v[0] + (b[p][0] - v[0]) * f, v[1] + (b[p][1] - v[1]) * f]); const z = L.zg ? (L.zg[k - 1] ?? 320) + ((L.zg[k] ?? 320) - (L.zg[k - 1] ?? 320)) * f : null;
    const sp = U.map(v => Math.hypot(v[0], v[1])), mU = [mean(U.map(v => v[0])), mean(U.map(v => v[1]))];
    return { ...L, U, z, mean: mean(sp), max: Math.max(...sp), mU }; });
  const lin = A => A[k - 1] == null ? A[k] : A[k] == null ? A[k - 1] : A[k - 1] + (A[k] - A[k - 1]) * f;
  const g = D.gust[k - 1].map((v, p) => v == null ? D.gust[k][p] : D.gust[k][p] == null ? v : v + (D.gust[k][p] - v) * f);
  return { t, lv, gust: mean(g), temp: lin(D.temp), cloud: lin(D.cloud), rain: lin(D.rain), code: D.code[f < .5 ? k - 1 : k] };
}
function sample(L, x, z) {
  const E = C.A.meta.extent, fx = Math.max(0, Math.min(NX - 1.0001, (x - E.x0) / (E.x1 - E.x0) * (NX - 1))), fz = Math.max(0, Math.min(NZ - 1.0001, (z - E.z0) / (E.z1 - E.z0) * (NZ - 1)));
  const i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j, U = L.U, q = (ii, jj) => U[jj * NX + ii];
  const p00 = q(i, j), p10 = q(i + 1, j), p01 = q(i, j + 1), p11 = q(i + 1, j + 1);
  return [0, 1].map(c => (p00[c] * (1 - a) + p10[c] * a) * (1 - b) + (p01[c] * (1 - a) + p11[c] * a) * b);
}

// ---------- streamlines: seeds round the camera target (half) and over the whole box (half), traced forward (RK2)
function rng(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function viewBox() {
  const c = C.cam, E = C.A.meta.extent, side = Math.max(1200, Math.min(7000, (c.eye ? 1500 : c.dist) * 1.6)), cx = c.eye ? c.target[0] : c.tx, cz = c.eye ? c.target[2] : c.tz;
  return { x0: Math.max(E.x0, cx - side / 2), x1: Math.min(E.x1, cx + side / 2), z0: Math.max(E.z0, cz - side / 2), z1: Math.min(E.z1, cz + side / 2), side, cx, cz };
}
function build(F) {
  const t0 = performance.now(), gl = C.gl, E = C.A.meta.extent, B = viewBox(), R = rng(20261008), len = Math.max(250, Math.min(900, B.side * .14));
  const V = [], I = [];
  S.lines = []; S.T = [];
  F.lv.forEach((L, li) => {
    if (!L) { S.T.push(1); return; }
    const Tl = Math.max(20, Math.min(1500, len / Math.max(.3, L.mean))); S.T.push(Tl); const dt = Tl / STEPS;
    for (let s = 0; s < SEEDS; s++) {
      // even cover: the R2 low-discrepancy sequence, with a little jitter
      const box = s % 2 && B.x1 > B.x0 && B.z1 > B.z0 ? B : E, n = (s >> 1) + 1, u = (.5 + n * .7548776662 + (R() - .5) * .04) % 1, w = (.5 + n * .5698402910 + (R() - .5) * .04) % 1;
      let x = box.x0 + (box.x1 - box.x0) * u, z = box.z0 + (box.z1 - box.z0) * w;
      // start upstream by a random part of the line, so the lines do not all begin on the seed grid
      const back = R() * Tl * .5, inE = (x, z) => x >= E.x0 && x <= E.x1 && z >= E.z0 && z <= E.z1; { const v = sample(L, x, z), bx = x - v[0] * back, bz = z - v[1] * back; if (inE(bx, bz)) { x = bx; z = bz; } }
      const o = R(), pts = [];
      for (let k = 0; k <= STEPS; k++) {
        const v = sample(L, x, z); pts.push([x, z, v]);
        const m = sample(L, x + v[0] * dt / 2, z + v[1] * dt / 2), nx = x + m[0] * dt, nz = z + m[1] * dt; if (inE(nx, nz)) { x = nx; z = nz; }   // a line stops at the edge of the model box
      }
      const base = V.length / 10;
      pts.forEach(([x, z, v], k) => {
        const y = L.agl != null ? C.groundAt(x, z) + L.agl : Math.max(220, L.z || 320), sp = Math.hypot(v[0], v[1]), tx = sp > 1e-6 ? v[0] / sp : 1, tz = sp > 1e-6 ? v[1] / sp : 0;
        for (const side of [-1, 1]) V.push(x, y, z, tx, tz, side, k / STEPS, o, sp, li);
        if (k) { const a = base + 2 * (k - 1); I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      });
      S.lines.push(li);
    }
  });
  if (!S.buf) { S.buf = gl.createBuffer(); S.ib = gl.createBuffer(); }
  gl.bindBuffer(gl.ARRAY_BUFFER, S.buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, S.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.STATIC_DRAW);
  S.n = I.length; S.spd = (F.lv[0] ? S.T[0] : S.T.find(x => x > 1) || 60) / 3.2;   // animation: model seconds a real second; a 10 m streak runs its line in about 3 s
  Object.assign(S.stats, { segments: I.length / 6, vertices: V.length / 10, builds: S.stats.builds + 1, buildMs: +(performance.now() - t0).toFixed(1), bytes: V.length * 4 + I.length * 2 });
  S.seedKey = `${Math.round(B.cx / (B.side * .25))},${Math.round(B.cz / (B.side * .25))},${Math.round(Math.log(B.side) / Math.log(1.5))}`;
}

// ---------- the program: a ribbon a segment, its width in metres (grows with distance from the eye, clamped), facing the eye
const VS = `attribute vec3 p;attribute vec3 t;attribute vec4 q;uniform mat4 m;uniform float vz,wk,wmin,wmax,wm;uniform vec3 eye;
varying float vs,vo,vsp,vsd,vl;
void main(){vec3 P=vec3(p.x,p.y*vz,p.z);vec3 T=vec3(t.x,0.,t.y);vec3 V=eye-P;float d=max(length(V),.01);vec3 S=cross(T,V/d);float l=length(S);
S=l>.05?S/l:vec3(-T.z,0.,T.x);float w=clamp(d*wk,wmin,wmax)*wm;gl_Position=m*vec4(P+S*w*t.z,1.);vs=q.x;vo=q.y;vsp=q.z;vsd=t.z;vl=q.w;}`;
const FS = `precision mediump float;varying float vs,vo,vsp,vsd,vl;uniform vec3 ph;uniform float tail,glow,halo,al;
vec3 ramp(float s){vec3 c=mix(vec3(.30,.55,1.),vec3(.10,.85,.95),smoothstep(0.,3.,s));c=mix(c,vec3(.35,.95,.35),smoothstep(3.,6.,s));
c=mix(c,vec3(1.,.88,.2),smoothstep(6.,9.,s));c=mix(c,vec3(1.,.5,.12),smoothstep(9.,13.,s));c=mix(c,vec3(1.,.18,.3),smoothstep(13.,18.,s));return mix(c,vec3(.92,.35,1.),smoothstep(18.,25.,s));}
void main(){float f=vl<.5?ph.x:vl<1.5?ph.y:ph.z;float d=fract(f+vo-vs);float a=1.-d/tail;if(a<=0.)discard;
a*=a;a*=smoothstep(0.,.1,vs)*smoothstep(1.,.85,vs);float e=1.-abs(vsd);a*=halo>.5?e:smoothstep(0.,.5,e);
vec3 c=halo>.5?vec3(.02,.03,.04):ramp(vsp)*(1.+glow*.3*(1.-d/tail));gl_FragColor=vec4(c,a*al);}`;
let PG = null;
function prog(gl) {
  const sh = (k, src) => { const x = gl.createShader(k); gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
  const pg = gl.createProgram(); gl.attachShader(pg, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, FS));
  ['p', 't', 'q'].forEach((a, i) => gl.bindAttribLocation(pg, i, a)); gl.linkProgram(pg);
  if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pg));
  const U = {}; for (const u of ['m', 'vz', 'wk', 'wmin', 'wmax', 'wm', 'eye', 'ph', 'tail', 'glow', 'halo', 'al']) U[u] = gl.getUniformLocation(pg, u); return { pg, U };
}
// called by render() after the ground, the night lights and the glow; returns true when it changed the program
function drawGL() {
  if (!on() || !C || C.PIX().on) return false;
  const t = clock(), key = `${Math.round(t / 6e4)}|${S.data ? S.data.fetched : 0}`;
  if (key !== S.key) { S.key = key; S.field = fieldAt(t); S.seedKey = ''; if (!covers(S.data, t)) load(); note(); }
  if (!S.field) return false;
  const B = viewBox(), sk = `${Math.round(B.cx / (B.side * .25))},${Math.round(B.cz / (B.side * .25))},${Math.round(Math.log(B.side) / Math.log(1.5))}`;
  if (sk !== S.seedKey) { build(S.field); note(); }
  if (!S.n) return false;
  const gl = C.gl, t0 = performance.now(); try { PG = PG || prog(gl); } catch (e) { console.warn('wind program', e); S.err = 'shader: ' + e.message; return false; }
  const K = C.CAM(), U = PG.U, night = C.nightOn(), now = performance.now() / 1000;
  const en = [0, 1, 2].map(i => gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_ENABLED)), blend = gl.isEnabled(gl.BLEND), dm = gl.getParameter(gl.DEPTH_WRITEMASK);
  gl.useProgram(PG.pg); gl.uniformMatrix4fv(U.m, false, C.MVP()); gl.uniform1f(U.vz, C.VZ() || 1); gl.uniform3f(U.eye, K.eye[0], K.eye[1], K.eye[2]);
  gl.uniform3f(U.ph, ...[0, 1, 2].map(i => (now * S.spd / (S.T[i] || 1)) % 1)); gl.uniform1f(U.tail, .38); gl.uniform1f(U.glow, night ? 1 : 0);
  // width: 0.3 % of the distance from the eye (about 3 px on a 900 px high view), at least 0.6 m, at most 16 m
  gl.uniform1f(U.wk, .0032); gl.uniform1f(U.wmin, .6); gl.uniform1f(U.wmax, 16);
  gl.bindBuffer(gl.ARRAY_BUFFER, S.buf); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, S.ib);
  for (let i = 0; i < 3; i++) gl.enableVertexAttribArray(i);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24);
  gl.enable(gl.BLEND); gl.depthMask(false); gl.enable(gl.DEPTH_TEST);
  if (!night) { gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.uniform1f(U.halo, 1); gl.uniform1f(U.wm, 2.4); gl.uniform1f(U.al, .45); gl.drawElements(gl.TRIANGLES, S.n, gl.UNSIGNED_SHORT, 0); }   // day: a dark edge first
  gl.blendFunc(gl.SRC_ALPHA, night ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA); gl.uniform1f(U.halo, 0); gl.uniform1f(U.wm, 1); gl.uniform1f(U.al, night ? .9 : 1);
  gl.drawElements(gl.TRIANGLES, S.n, gl.UNSIGNED_SHORT, 0);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); if (!blend) gl.disable(gl.BLEND); gl.depthMask(dm);
  en.forEach((e, i) => e ? gl.enableVertexAttribArray(i) : gl.disableVertexAttribArray(i));
  S.stats.frames++; S.stats.drawMs = +(performance.now() - t0).toFixed(2);
  return true;
}

// ---------- the readout and the animation loop
const DIR = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const WORD = { N: 'north', E: 'east', S: 'south', W: 'west' };
function compass(deg) { const c = DIR[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]; return { c, w: c.length === 1 ? WORD[c] : c.length === 2 ? WORD[c[0]] + '-' + WORD[c[1]] : WORD[c[0]] + '-' + WORD[c[1]] + '-' + WORD[c[2]] }; }
// the direction the wind blows FROM, as a true bearing, from a page-metres vector (inverse of the grid-point frame)
function fromDeg(v) { const q = grid()[Math.floor(NX * NZ / 2)], ve = v[0] * q.e[0] + v[1] * q.e[1], vn = v[0] * q.n[0] + v[1] * q.n[1]; return (Math.atan2(ve, vn) / D2R + 180 + 360) % 360; }
const WMO = c => c == null ? null : c === 0 ? 'clear' : c <= 2 ? 'partly cloudy' : c === 3 ? 'overcast' : c <= 48 ? 'fog' : c <= 57 ? 'drizzle' : c <= 67 ? 'rain' : c <= 77 ? 'snow' : c <= 82 ? 'showers' : c <= 86 ? 'snow showers' : 'thunderstorm';
const kmh = s => Math.round(s * 3.6), f1 = v => v == null ? '?' : (Math.round(v * 10) / 10).toString();
function lonTime(t) { return new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', timeZoneName: 'short' }); }
function note() {
  const el = $('windKey'), nt = $('windNote'); if (!el) return;
  el.hidden = !on(); if (!on()) return;
  const F = S.field, D = S.data;
  if (!F) { el.innerHTML = `<b>Wind</b> ${S.busy ? 'loading…' : S.err ? 'did not load: ' + esc(S.err) : 'no data'}`; if (nt) nt.textContent = el.textContent; return; }
  const rows = F.lv.map(L => { if (!L) return ''; const d = fromDeg(L.mU), c = compass(d), h = L.agl != null ? L.name : `${L.name} (about ${Math.round(L.z)} m)`;
    return `<div><span class="wsw" style="background:${css(L.mean)}"></span>${h}: <b>${kmh(L.mean)} km/h</b> (${f1(L.mean)} m/s) from ${c.c} <span class="wdeg">${Math.round(d)}°</span>${L.use !== L.key ? ` <span class="wdeg">(${L.use})</span>` : ''}</div>`; }).join('');
  const g = F.gust != null && isFinite(F.gust) ? ` · gusts ${kmh(F.gust)} km/h at 10 m` : '';
  const wx = [F.temp != null ? `${f1(F.temp)} °C` : '', WMO(F.code), F.cloud != null ? `cloud ${Math.round(F.cloud)}%` : '', F.rain != null ? (F.rain > 0 ? `precipitation ${f1(F.rain)} mm/h` : 'no rain') : ''].filter(Boolean).join(', ');
  const c0 = F.lv[0] ? compass(fromDeg(F.lv[0].mU)) : null;
  el.innerHTML = `<b>Wind</b>${c0 ? ` from the ${c0.w}` : ''}${g}${rows}<div class="wsm">${esc(wx)}</div>` +
    `<div class="wsm"><span class="wramp"></span> 0 to 90 km/h · ${esc(D.label)}, ${lonTime(F.t)}${S.from === 'cache' ? ' (10 m only)' : ''} · streaks ${Math.round(S.spd || 0)}× real time · <a href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo.com</a></div>`;
  if (nt) nt.textContent = `${D.label}; ${S.stats.segments.toLocaleString('en-GB')} streak segments.${S.err ? ' ' + S.err : ''}`;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function css(s) {   // the shader's ramp at a speed (m/s), for the key
  const K = [[0, [.30, .55, 1]], [1.5, [.10, .85, .95]], [4.5, [.35, .95, .35]], [7.5, [1, .88, .2]], [11, [1, .5, .12]], [15.5, [1, .18, .3]], [21.5, [.92, .35, 1]]];
  let i = K.findIndex(k => k[0] > s); if (i < 0) i = K.length; const a = K[Math.max(0, i - 1)], b = K[Math.min(K.length - 1, i)], f = b[0] > a[0] ? (s - a[0]) / (b[0] - a[0]) : 0;
  return `rgb(${a[1].map((v, j) => Math.round(255 * (v + (b[1][j] - v) * f))).join(',')})`;
}
function tick() {
  if (!on() || document.hidden || (globalThis.DocklandsXR && DocklandsXR.active)) { S.loop = 0; return; }
  C.draw(); S.loop = setTimeout(() => requestAnimationFrame(tick), 40);   // about 25 frames a second while Wind is on
}
function start() { if (!S.loop && on() && !document.hidden) S.loop = requestAnimationFrame(tick); }
function injectUi() {
  const m = $('showModels'); if (!m) return;
  m.parentElement.insertAdjacentHTML('afterend', '<label><input type="checkbox" id="showWind"> Wind</label>');
  m.closest('.chips').insertAdjacentHTML('afterend', '<p class="small" id="windNote" hidden></p>');
  const top = $('top') || document.body;
  top.insertAdjacentHTML('beforeend', '<div id="windKey" hidden role="status" aria-live="polite"></div>');
  document.head.insertAdjacentHTML('beforeend', `<style>#windKey{align-self:flex-start;pointer-events:auto;background:#111d;padding:5px 9px;border-radius:8px;font-size:12px;line-height:1.35;max-width:min(560px,100%);color:#e8eaec}
#windKey a{color:#9cd2ff}#windKey .wsm{font-size:11px;color:#c3c8cf}#windKey .wdeg{color:#aab1ba;font-size:11px}#windKey .wsw{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px}
#windKey .wramp{display:inline-block;width:56px;height:7px;border-radius:2px;vertical-align:middle;background:linear-gradient(90deg,${[0, 3, 6, 9, 13, 18, 25].map(css).join(',')})}
#windKey.min > div{display:none}</style>`);
  $('windKey').onclick = e => { if (e.target.closest('a')) return; e.currentTarget.classList.toggle('min'); };
  $('showWind').onchange = () => { $('windNote').hidden = !on(); S.key = ''; note(); if (on()) { load(); start(); } C.draw(); };
  const sky = [...document.querySelectorAll('#credits h3')].find(h => /Sky, weather and tide/.test(h.textContent));
  if (sky) sky.nextElementSibling.insertAdjacentHTML('beforeend', `<li>Wind (Layers &gt; Show &gt; Wind): <a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a>
    (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>), model ICON-D2 and ICON, source: <a href="https://www.dwd.de/EN/service/legal_notice/legal_notice_node.html">Deutscher Wetterdienst</a> (CC BY 4.0); streamlines traced and animated by this page</li>`);
}
function init(ctx) {
  C = ctx; injectUi();
  if (/[?&]wind\b/.test(location.search)) { $('showWind').checked = true; $('windNote').hidden = false; setTimeout(() => { load(); start(); }, 0); }   // ?wind: on from the start
  document.addEventListener('visibilitychange', start);
  setInterval(() => { if (on()) { start(); const t = clock(); if (Math.round(t / 6e4) + '' !== S.key.split('|')[0]) C.draw(); } }, 2000);   // the page clock moved
}
globalThis.DocklandsWind = { init, drawGL, load, fieldAt, get S() { return S; } };
})();
