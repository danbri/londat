// Docklands 3D: "My KML" (Menu > Layers > My KML). Open a .kml or .kmz from the file picker, a drop on the page or ?kml=<url>
// (same origin or CORS); draw its Placemarks with the page's geo() and groundAt(); a record card per feature; remove; go to a
// KML Camera or LookAt; and "Export view as KML" (the camera as a KML Camera, plus the selected building's outline, the
// visible works-in-progress sites and river items, and your own KML) as a download. Nothing is uploaded or stored.
// An ES module loaded after the page script; index.html gives it its helpers in globalThis.DocklandsKMLctx and draws
// OV.kml (opaque) and OV.kmlA (see-through). Parser and writer: kml.js (shared with the atlas).
// Supported subset, limits and lessons: skill docklands-3d-page, section "KML".
import { readKml, writeKml, download, isKmlName, isKmlType, cssColor } from './kml.js';

const C = globalThis.DocklandsKMLctx;
const $ = id => document.getElementById(id);
const S = { files: [], seq: 0, hits: [], polys: [], pins: [], names: [], cl: new Map(), vis: {}, n: {}, lines: null, fly: 0 };
const R2D = 180 / Math.PI, D2R = Math.PI / 180;
const DEF = { line: [1, .8, 0, 1], poly: [1, .8, 0, .4], icon: [1, .8, 0, 1] };   // no style in the file: yellow, as a pin in Google Earth

// ---------- coordinates: geo() is the page's WGS84 -> model transform; its inverse by Newton steps (for the export)
function lonLatOf(x, z) {
  const G = C.A.meta.geo; let lon = G.lon0 + (x - G.x[0]) / G.x[1], lat = G.lat0 + (z - G.z[0]) / G.z[2];
  for (let k = 0; k < 8; k++) {
    const [fx, fz] = C.geo(lon, lat), e = 1e-5, [ax, az] = C.geo(lon + e, lat), [bx, bz] = C.geo(lon, lat + e);
    const j00 = (ax - fx) / e, j01 = (bx - fx) / e, j10 = (az - fz) / e, j11 = (bz - fz) / e, det = j00 * j11 - j01 * j10, rx = x - fx, rz = z - fz;
    lon += (j11 * rx - j01 * rz) / det; lat += (-j10 * rx + j00 * rz) / det; if (Math.hypot(rx, rz) < 1e-4) break;
  }
  return [lon, lat];
}
const heightAt = (x, z, alt, mode, lift) => mode === 'absolute' ? alt : /^relativeTo/.test(mode || '') ? C.groundAt(x, z) + (alt || 0) : C.groundAt(x, z) + lift;

// ---------- drawing
// Lines and outlines are screen-space ribbons (drawGL): at least LINE_PX CSS px wide at any zoom with a dark halo, and as wide
// as the KML width (2 m per KML pixel) when that is wider; pins, clusters and names are drawn on a 2D canvas over the city
// (after). Fills, walls and extrusions stay in the 3D meshes OV.kmlA. Rules and measurements: skill docklands-3d-page, "KML".
const LINE_PX = 2.5, HALO_PX = 1.25, PIN = 24, CLUSTER_PX = 48;
const quadA = (M, p, col, a) => { const s = C.shade(col, 0, 1, 0), i = M.v(...p[0], s, a), j = M.v(...p[1], s, a), k = M.v(...p[2], s, a), l = M.v(...p[3], s, a); M.tri(i, j, k); M.tri(i, k, l); };
function vivid(c) {   // keep the file's hue, lift a dark colour until it reads on the dark map (relative luminance >= 0.42)
  let [r, g, b] = c; const Y = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
  for (let k = 0; k < 12 && Y(r, g, b) < .42; k++) { r += (1 - r) * .12; g += (1 - g) * .12; b += (1 - b) * .12; }
  return [r, g, b, c[3] == null ? 1 : c[3]];
}
function pointIn(ring, x, z) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }
function clipSeg(a, b) {   // Liang-Barsky: the part of a segment inside the model box, or null
  const E = C.A.meta.extent, d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; let t0 = 0, t1 = 1;
  for (const [p, q] of [[-d[0], a[0] - E.x0], [d[0], E.x1 - a[0]], [-d[2], a[2] - E.z0], [d[2], E.z1 - a[2]]]) {
    if (p === 0) { if (q < 0) return null; continue; } const r = q / p; if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; } }
  const at = t => [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t]; return t1 - t0 > 1e-9 ? [at(t0), at(t1)] : null;
}
// one segment = 6 vertices of [x y z | other end x y z | side | metres wide | rgba bytes] (36 bytes)
function segOut(L, a, b, wm, col) {
  const f = L.f, u = L.u, put = (p, o, s) => { const i = L.n * 9; f[i] = p[0]; f[i + 1] = p[1]; f[i + 2] = p[2]; f[i + 3] = o[0]; f[i + 4] = o[1]; f[i + 5] = o[2]; f[i + 6] = s; f[i + 7] = wm; u.set(col, i * 4 + 32); L.n++; };
  if ((L.n + 6) * 9 > f.length) { const g = new Float32Array(f.length * 2); g.set(f); L.f = g; L.u = new Uint8Array(g.buffer); return segOut(L, a, b, wm, col); }
  put(a, b, 1); put(a, b, -1); put(b, a, -1); put(a, b, 1); put(b, a, -1); put(b, a, 1);
}
function wallOut(Wl, a, b, col) {   // a wall quad under an outline, [x y z top | rgba]: its top rises only while Show runs
  if ((Wl.n + 6) * 5 > Wl.f.length) { const g = new Float32Array(Wl.f.length * 2); g.set(Wl.f); Wl.f = g; Wl.u = new Uint8Array(g.buffer); }
  const put = (p, k) => { const i = Wl.n * 5; Wl.f[i] = p[0]; Wl.f[i + 1] = p[1]; Wl.f[i + 2] = p[2]; Wl.f[i + 3] = k; Wl.u.set(col, i * 4 + 16); Wl.n++; };
  put(a, 0); put(b, 0); put(b, 1); put(a, 0); put(b, 1); put(a, 1);
}
function lineOn(L, pts, wm, col, clamp, st, wall) {   // pts: [x, y, z]; a clamped line follows the ground every 30 m
  const cb = vivid(col).map(v => Math.round(Math.max(0, Math.min(1, v)) * 255)); cb[3] = 255;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1], b = pts[i]; if (!C.inBox(a[0], a[2]) || !C.inBox(b[0], b[2])) { const c = clipSeg(a, b); st.clipped = true; if (!c) continue; [a, b] = c; }
    const Ln = Math.hypot(b[0] - a[0], b[2] - a[2]), n = clamp ? Math.max(1, Math.ceil(Ln / 30)) : 1; let p = clamp ? [a[0], C.groundAt(a[0], a[2]) + 1, a[2]] : a;
    for (let k = 1; k <= n; k++) { const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t, q = [x, clamp ? C.groundAt(x, z) + 1 : a[1] + (b[1] - a[1]) * t, z];
      segOut(L, p, q, wm, cb); if (wall) wallOut(L.w, p, q, cb); st.box(p[0], p[2]); p = q; }
    st.box(b[0], b[2]); st.drawn = true;
  }
}
function featureMesh(f, LS, MA, st) {
  const sty = f.style, set = sty.set || {};
  const lineCol = set.line ? sty.line : DEF.line, polyCol = set.poly ? sty.poly : DEF.poly, iconCol = set.icon ? sty.icon : DEF.icon;
  const w = Math.max(2.5, Math.min(30, (sty.width || 1) * 2));   // metres: the width when the camera is close
  for (const g of f.geoms) {
    const mode = g.altitudeMode || 'clampToGround', clamp = !/^(absolute|relativeTo)/.test(mode);
    if (g.type === 'Point') {   // a pin of constant screen size (after); the tip at the point, on the ground or at its altitude
      const [x, z] = C.geo(g.coords[0], g.coords[1]); if (!C.inBox(x, z)) { st.clipped = true; continue; }
      const gy = C.groundAt(x, z), y = clamp ? gy : heightAt(x, z, g.coords[2], mode, 0);
      st.pins.push({ x, y, z, gy, col: vivid(iconCol), sc: Math.max(.8, Math.min(1.4, sty.scale || 1)) }); st.box(x, z);
      st.drawn = true; st.anchor = st.anchor || [x, y, z];
    } else if (g.type === 'LineString') {
      const pts = g.coords.map(c => { const [x, z] = C.geo(c[0], c[1]); return [x, heightAt(x, z, c[2], mode, 1), z]; });
      lineOn(LS, pts, w, lineCol.slice(0, 3), clamp, st);
      if (g.extrude && !clamp) for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if (!C.inBox(a[0], a[2]) || !C.inBox(b[0], b[2])) continue;
        quadA(MA, [[a[0], C.groundAt(a[0], a[2]), a[2]], [b[0], C.groundAt(b[0], b[2]), b[2]], [b[0], b[1], b[2]], [a[0], a[1], a[2]]], lineCol, .35); }
      const m = pts[pts.length >> 1]; if (C.inBox(m[0], m[2])) st.anchor = st.anchor || [m[0], m[1] + 4, m[2]];
    } else if (g.type === 'Polygon') {
      const rings = g.rings.map(r => r.map(c => { const [x, z] = C.geo(c[0], c[1]); return [x, z, c[2]]; }));
      const outer = rings[0], holes = rings.slice(1), inAll = rings.every(r => r.every(p => C.inBox(p[0], p[1])));
      if (!outer.some(p => C.inBox(p[0], p[1]))) { st.clipped = true; continue; }
      if (!inAll) st.clipped = true;
      const bb = outer.reduce((b, [x, z]) => [Math.min(b[0], x), Math.min(b[1], z), Math.max(b[2], x), Math.max(b[3], z)], [1e9, 1e9, -1e9, -1e9]);
      const r2 = r => r.map(p => [p[0], p[1]]), fc = [...polyCol.slice(0, 3), Math.max(.15, Math.min(.35, polyCol[3]))];
      if (sty.fill !== false) {
        if (clamp) {   // drape the fill over the ground: every terrain cell whose centre is inside (holes out); small shapes by earcut
          const T = C.A.terrain, i0 = Math.max(0, Math.floor((bb[0] - T.x0) / T.cell)), i1 = Math.min(T.nx - 2, Math.ceil((bb[2] - T.x0) / T.cell)),
            j0 = Math.max(0, Math.floor((bb[1] - T.z0) / T.cell)), j1 = Math.min(T.nz - 2, Math.ceil((bb[3] - T.z0) / T.cell)); let cells = 0;
          const H = (i, j) => T.dm[j * T.nx + i] / 10 + .8, P = (i, j) => [T.x0 + i * T.cell, H(i, j), T.z0 + j * T.cell];
          const R0 = r2(outer), RH = holes.map(r2);
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const cx = T.x0 + (i + .5) * T.cell, cz = T.z0 + (j + .5) * T.cell;
            if (!pointIn(R0, cx, cz) || RH.some(h => pointIn(h, cx, cz))) continue; quadA(MA, [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)], fc, fc[3]); cells++; }
          if (!cells) earcutFill(MA, rings, (x, z) => C.groundAt(x, z) + .8, fc);
        } else earcutFill(MA, rings, (x, z, a) => heightAt(x, z, a, mode, 0), fc);
      }
      if (sty.outline !== false || sty.fill === false) for (const r of rings) {
        const pts = r.map(([x, z, a]) => [x, clamp ? C.groundAt(x, z) + 1 : heightAt(x, z, a, mode, 0), z]); if (pts.length > 1) pts.push(pts[0]);
        lineOn(LS, pts, Math.max(2, w * .7), lineCol.slice(0, 3), clamp, st, true);
      }
      if (g.extrude && !clamp) for (const r of rings) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; if (!C.inBox(a[0], a[1]) || !C.inBox(b[0], b[1])) continue;
        quadA(MA, [[a[0], C.groundAt(a[0], a[1]), a[1]], [b[0], C.groundAt(b[0], b[1]), b[1]], [b[0], heightAt(b[0], b[1], b[2], mode, 0), b[1]], [a[0], heightAt(a[0], a[1], a[2], mode, 0), a[1]]], polyCol, Math.max(.25, polyCol[3])); }
      st.drawn = true; for (const p of outer) if (C.inBox(p[0], p[1])) st.box(p[0], p[1]);
      const c = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], cy = clamp ? C.groundAt(c[0], c[1]) : heightAt(c[0], c[1], outer[0][2], mode, 0);
      if (C.inBox(c[0], c[1])) st.anchor = st.anchor || [c[0], cy + 3, c[1]];
      st.polys.push({ ring: r2(outer), holes: holes.map(r2), bb });
    }
  }
}
function earcutFill(M, rings, yOf, col) {
  const flat = [], holes = [], ys = [];
  for (const r of rings) { if (flat.length) holes.push(flat.length / 2); for (const [x, z, a] of r) { flat.push(x, z); ys.push(yOf(x, z, a)); } }
  const t = C.earcut(flat, holes.length ? holes : undefined, 2), s = C.shade(col, 0, 1, 0), base = M.n;
  for (let i = 0; i < ys.length; i++) M.v(flat[2 * i], ys[i], flat[2 * i + 1], s, col[3]);
  for (let k = 0; k < t.length; k += 3) M.tri(base + t[k], base + t[k + 1], base + t[k + 2]);
}

function rebuild() {
  const OV = C.OV; for (const k of ['kml', 'kmlA']) if (OV[k]) { OV[k].free(); OV[k] = null; }
  S.hits = []; S.polys = []; S.pins = []; S.names = []; S.cl = new Map();
  for (const B of S.lines || []) { C.gl.deleteBuffer(B.b); if (B.wb) C.gl.deleteBuffer(B.wb); } S.lines = [];
  const MA = new C.Mesh(), n = { files: 0, features: 0, drawn: 0, clipped: 0, outside: 0, hidden: 0 };
  for (const F of S.files) { if (!F.on) continue; n.files++;
    const LS = { f: new Float32Array(9 * 6 * 256), n: 0, w: { f: new Float32Array(5 * 6 * 256), n: 0 } }; LS.u = new Uint8Array(LS.f.buffer); LS.w.u = new Uint8Array(LS.w.f.buffer);
    F.n = { drawn: 0, clipped: 0, outside: 0, hidden: 0 }; F.bb = [1e9, 1e9, -1e9, -1e9];
    F.doc.features.forEach((f, i) => {
      if (f.removed) return; n.features++; if (!f.visible) { F.n.hidden++; return; }
      const st = { drawn: false, clipped: false, anchor: null, polys: [], pins: [], bb: [1e9, 1e9, -1e9, -1e9] };
      st.box = (x, z) => { const b = st.bb; if (x < b[0]) b[0] = x; if (z < b[1]) b[1] = z; if (x > b[2]) b[2] = x; if (z > b[3]) b[3] = z; };
      featureMesh(f, LS, MA, st);
      if (!st.drawn) { F.n.outside++; return; } F.n.drawn++; if (st.clipped) F.n.clipped++;
      f.bb = st.bb; F.bb = [Math.min(F.bb[0], st.bb[0]), Math.min(F.bb[1], st.bb[1]), Math.max(F.bb[2], st.bb[2]), Math.max(F.bb[3], st.bb[3])];
      const card = () => featureCard(F, f);
      for (const p of st.pins) S.pins.push({ ...p, F, f, name: f.name ? String(f.name).slice(0, 48) : '' });
      if (st.anchor) S.hits.push({ x: st.anchor[0], y: st.anchor[1], z: st.anchor[2], kml: true, card: st.pins.length ? () => tapPin(F, f) : card });
      for (const p of st.polys) S.polys.push({ ...p, pri: -1, kml: true, card });
      if (f.name && st.anchor && !st.pins.length) S.names.push({ x: st.anchor[0], y: st.anchor[1], z: st.anchor[2], name: String(f.name).slice(0, 48) });
    });
    for (const k of ['drawn', 'clipped', 'outside', 'hidden']) n[k] += F.n[k];
    if (LS.n) { const gl = C.gl, up = a => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW); return b; };
      S.lines.push({ F, b: up(LS.f.subarray(0, LS.n * 9)), n: LS.n, wb: LS.w.n ? up(LS.w.f.subarray(0, LS.w.n * 5)) : null, wn: LS.w.n }); }
  }
  OV.kmlA = MA.n ? MA.upload() : null; S.n = n; sync(); list(); C.draw();
}
function sync() {   // buildOverlays() replaces OV.hits and OV.polys: put ours back (in front, so your own shapes answer a tap first)
  const OV = C.OV;
  if (S.hits.length ? !OV.hits.some(o => o.kml) || OV.hits.filter(o => o.kml).length !== S.hits.length : OV.hits.some(o => o.kml)) OV.hits = OV.hits.filter(o => !o.kml).concat(S.hits);
  if (S.polys.length ? !OV.polys.some(o => o.kml) || OV.polys.filter(o => o.kml).length !== S.polys.length : OV.polys.some(o => o.kml)) OV.polys = S.polys.concat(OV.polys.filter(o => !o.kml));
}

// ---------- Show: emphasise one file for SHOW_MS (grow, hue cycle, float and jiggle, polygons rise as walls), then ease back.
// Time-based: every value comes from performance.now(), so 2 frames a second and 120 end the same; at the end the state is
// dropped and the features are drawn exactly as before. Reduced motion: a brief grow and brighten, no movement.
const SHOW_MS = 2200, SHOW_IN = 300, SHOW_OUT = 400;
function emph(F, now = performance.now()) {   // { e 0..1, grow, hue (rad), lift (m), jig (CSS px), white } or null
  const X = S.show; if (!X || X.F !== F) return null; const t = now - X.t0;
  if (t >= X.ms) return null;
  const sm = k => k * k * (3 - 2 * k), k = t < SHOW_IN ? sm(t / SHOW_IN) : t > X.ms - SHOW_OUT ? Math.pow((X.ms - t) / SHOW_OUT, 3) : 1;   // in, hold, ease-out back
  if (X.reduce) return { e: k, grow: 1 + .6 * k, hue: 0, lift: 0, jig: 0, white: .45 * k, t };
  return { e: k, grow: 1 + 1.6 * k, hue: k * t / 1000 * 2 * Math.PI * .9, lift: k * Math.max(60, Math.min(150, C.cam.dist * .012)), jig: k * 3 * Math.sin(t / 1000 * 2 * Math.PI * 3.5), white: 0, t };
}
function show(F) {
  if (!F || !F.on) return; const reduce = !!(matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  S.show = { F, t0: performance.now(), ms: reduce ? 1200 : SHOW_MS, reduce }; const id = S.show;
  const tick = () => { if (S.show !== id) return; if (performance.now() - id.t0 >= id.ms) { S.show = null; C.draw(); return; } C.draw(); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
function hueRot(c, a) {   // rotate a colour's hue about the grey axis (the same matrix as the shader)
  const k = 1 / Math.sqrt(3), co = Math.cos(a), si = Math.sin(a), d = (c[0] + c[1] + c[2]) * k * k * (1 - co);
  return [0, 1, 2].map(i => { const j = (i + 1) % 3, l = (i + 2) % 3; return Math.max(0, Math.min(1, c[i] * co + k * (c[l] - c[j]) * si + d)); });
}

// ---------- screen-space lines (WebGL, the page's context): drawn after the ground, depth-tested against the buildings
const HUE = `vec3 hue(vec3 c,float a){const float k=.57735;float co=cos(a),si=sin(a);return c*co+cross(vec3(k),c)*si+vec3(k)*dot(vec3(k),c)*(1.-co);}`;
const LVS = `attribute vec3 p;attribute vec3 o;attribute float s;attribute float wm;attribute vec4 c;
uniform mat4 m;uniform float vz;uniform vec2 vp;uniform vec3 eye;uniform float minPx,halo,pxm,lift,jig,hu,wh;uniform mediump float mode;varying vec4 vc;varying float vk,va;${HUE}
vec3 pull(vec3 q){vec3 t=eye-q;float d=length(t);return q+t/max(d,1e-3)*min(d*.5,.5+d*.004);}
void main(){vec4 a=m*vec4(pull(vec3(p.x,(p.y+lift)*vz,p.z)),1.),b=m*vec4(pull(vec3(o.x,(o.y+lift)*vz,o.z)),1.);const float E=.05;
if(a.w<E&&b.w<E){gl_Position=vec4(0.,0.,2.,1.);return;}
if(b.w<E)b=mix(a,b,(a.w-E)/(a.w-b.w));if(a.w<E)a=mix(b,a,(b.w-E)/(b.w-a.w));
vec2 sa=a.xy/a.w*vp*.5,sb=b.xy/b.w*vp*.5,d=sb-sa;float l=length(d);d=l>1e-4?d/l:vec2(1.,0.);vec2 n=vec2(-d.y,d.x);
float w=max(minPx,wm*pxm/a.w)*.5,h=w+(mode<.5?halo:0.);
gl_Position=a+vec4((n*s*h-d*h+vec2(0.,jig))/(vp*.5)*a.w,0.,0.);vc=vec4(mix(hu!=0.?clamp(hue(c.rgb,hu),0.,1.):c.rgb,vec3(1.),wh),1.);vk=s;va=w/h;}`;
const LFS = `precision mediump float;varying vec4 vc;varying float vk,va;uniform float mode;
void main(){if(mode<.5)gl_FragColor=vec4(.03,.04,.05,.82);else gl_FragColor=vc;}`;
const WVS = `attribute vec3 p;attribute float k;attribute vec4 c;uniform mat4 m;uniform float vz,lift,hu,al;varying vec4 vc;${HUE}
void main(){gl_Position=m*vec4(p.x,(p.y+k*lift)*vz,p.z,1.);vc=vec4(clamp(hue(c.rgb,hu),0.,1.),al*(.25+.55*k));}`;
const WFS = `precision mediump float;varying vec4 vc;void main(){gl_FragColor=vc;}`;
let LP = null, WP = null;
function prog(gl, vs, fs, attrs, unis) {
  const sh = (t, src) => { const x = gl.createShader(t); gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
  const pg = gl.createProgram(); gl.attachShader(pg, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs));
  attrs.forEach((a, i) => gl.bindAttribLocation(pg, i, a)); gl.linkProgram(pg);
  if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pg));
  const U = {}; for (const u of unis) U[u] = gl.getUniformLocation(pg, u); return { pg, U };
}
function drawGL(w, h) {   // called by render() after the ground and the splats; the page restores its own program afterwards
  if (!S.lines || !S.lines.length || !C.MVP || !C.CAM) return false; const gl = C.gl;
  try { LP = LP || prog(gl, LVS, LFS, ['p', 'o', 's', 'wm', 'c'], ['m', 'vz', 'vp', 'eye', 'minPx', 'halo', 'pxm', 'mode', 'lift', 'jig', 'hu', 'wh']);
    WP = WP || prog(gl, WVS, WFS, ['p', 'k', 'c'], ['m', 'vz', 'lift', 'hu', 'al']); } catch (e) { console.warn('KML lines', e); S.lines = []; return false; }
  const en = [0, 1, 2, 3, 4, 5].map(i => gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_ENABLED)), blend = gl.isEnabled(gl.BLEND), dm = gl.getParameter(gl.DEPTH_WRITEMASK);
  const dpx = w / Math.max(1, C.cv.clientWidth), K = C.CAM, now = performance.now();
  for (let i = 0; i < 5; i++) gl.enableVertexAttribArray(i);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.enable(gl.DEPTH_TEST);
  // Show: the walls under the outlines of the file being shown
  for (const B of S.lines) { const X = emph(B.F, now); if (!X || !B.wb || !X.lift) continue; const U = WP.U;
    gl.useProgram(WP.pg); gl.uniformMatrix4fv(U.m, false, C.MVP); gl.uniform1f(U.vz, C.VZ || 1); gl.uniform1f(U.lift, X.lift); gl.uniform1f(U.hu, X.hue); gl.uniform1f(U.al, X.e);
    gl.disableVertexAttribArray(3); gl.disableVertexAttribArray(4); gl.bindBuffer(gl.ARRAY_BUFFER, B.wb);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 12); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 20, 16);
    gl.drawArrays(gl.TRIANGLES, 0, B.wn); gl.enableVertexAttribArray(3); gl.enableVertexAttribArray(4); }
  const U = LP.U; gl.useProgram(LP.pg); gl.uniformMatrix4fv(U.m, false, C.MVP); gl.uniform1f(U.vz, C.VZ || 1); gl.uniform2f(U.vp, w, h); gl.uniform3f(U.eye, K.eye[0], K.eye[1], K.eye[2]);
  gl.uniform1f(U.halo, HALO_PX * dpx); gl.uniform1f(U.pxm, C.PROJ[5] * h / 2);
  for (const mode of [0, 1]) { gl.uniform1f(U.mode, mode);   // halos first, so a halo never covers another line
    for (const B of S.lines) { const X = emph(B.F, now);
      gl.uniform1f(U.minPx, LINE_PX * dpx * (X ? X.grow : 1)); gl.uniform1f(U.lift, X ? X.lift : 0); gl.uniform1f(U.jig, X ? X.jig * dpx : 0); gl.uniform1f(U.hu, X ? X.hue : 0); gl.uniform1f(U.wh, X ? X.white : 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, B.b);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 36, 24);
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 36, 28); gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, 36, 32);
      gl.drawArrays(gl.TRIANGLES, 0, B.n); } }
  en.forEach((on, i) => on ? gl.enableVertexAttribArray(i) : gl.disableVertexAttribArray(i)); if (!blend) gl.disable(gl.BLEND); gl.depthMask(dm);
  return true;
}

// ---------- pins, clusters and names: a 2D canvas over the city, redrawn after every frame
let OVC = null;
function overlay() {
  if (OVC) return OVC; const c = document.createElement('canvas'); c.id = 'kmlOv'; c.setAttribute('aria-hidden', 'true');
  C.cv.insertAdjacentElement('afterend', c); return (OVC = c);
}
const rgb = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
function pinPath(g, x, y, s) {   // a map pin: its tip at (x, y), the head 2s/3 across
  const r = s * .34, cy = y - s + r; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x - r * .25, y - r * .9, x - r, cy + r * .75, x - r, cy); g.arc(x, cy, r, Math.PI, 0); g.bezierCurveTo(x + r, cy + r * .75, x + r * .25, y - r * .9, x, y); g.closePath(); return cy;
}
function after(ctx) {
  const has = S.pins.length || S.names.length;
  if (!has || !ctx.MVP) { if (OVC && OVC.width) { OVC.width = 0; OVC.height = 0; } S.vis = { pins: 0, clusters: 0, names: 0, lines: 0 }; return; }
  const c = overlay(), dpr = devicePixelRatio || 1, W = ctx.cssW, H = ctx.cssH, M = ctx.MVP, VZ = ctx.VZ;
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const proj = (x, y, z) => { const w = M[3] * x + M[7] * y * VZ + M[11] * z + M[15]; if (w <= .5) return null; return [((M[0] * x + M[4] * y * VZ + M[8] * z + M[12]) / w * .5 + .5) * W, (1 - ((M[1] * x + M[5] * y * VZ + M[9] * z + M[13]) / w * .5 + .5)) * H]; };
  // bin the pins on screen; a bin with more than one pin of a file is a cluster at the mean position
  const bins = new Map(); S.cl = new Map(); let onScreen = 0;
  const now = performance.now(), EM = new Map(S.files.map(F => [F, emph(F, now)])), look = (p, X) => X ? { col: X.white ? p.col.map((v, i) => i < 3 ? v + (1 - v) * X.white : v) : [...hueRot(p.col, X.hue), 1], sc: p.sc * X.grow } : p;
  for (const p of S.pins) { const X = EM.get(p.F), q = proj(p.x, p.y + (X ? X.lift : 0), p.z); if (q && X) q[0] += X.jig; if (!q || q[0] < -20 || q[0] > W + 20 || q[1] < -4 || q[1] > H + PIN) continue; onScreen++;
    const k = p.F.id + ':' + Math.floor(q[0] / CLUSTER_PX) + ':' + Math.floor(q[1] / CLUSTER_PX); let b = bins.get(k); if (!b) bins.set(k, b = { m: [], sx: 0, sy: 0 }); b.m.push([p, q]); b.sx += q[0]; b.sy += q[1]; }
  const singles = [], clusters = [];
  for (const b of bins.values()) { if (b.m.length === 1) singles.push(b.m[0]); else { const X = EM.get(b.m[0][0].F), cl = { n: b.m.length, x: b.sx / b.m.length, y: b.sy / b.m.length, col: look(b.m[0][0], X).col, g: X ? X.grow : 1, m: b.m.map(e => e[0]) }; clusters.push(cl); for (const [p] of b.m) S.cl.set(p.f, cl); } }
  // stems for pins above the ground, then the pins and clusters
  g.lineJoin = 'round';
  for (const [p, q] of singles) { const X = EM.get(p.F); if (Math.abs(p.y + (X ? X.lift : 0) - p.gy) <= 2) continue; const q0 = proj(p.x, p.gy, p.z); if (!q0) continue; g.strokeStyle = '#ffffffb0'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q[0], q[1]); g.stroke(); }
  for (const [p0, q] of singles) { const p = look(p0, EM.get(p0.F)), s = PIN * p.sc, cy = pinPath(g, q[0], q[1], s);
    g.lineWidth = 3.5; g.strokeStyle = 'rgba(6,8,11,.85)'; g.stroke(); g.fillStyle = rgb(p.col); g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.stroke();
    g.beginPath(); g.arc(q[0], cy, s * .11, 0, 7); g.fillStyle = 'rgba(6,8,11,.8)'; g.fill(); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const cl of clusters) { const r = Math.min(16, 9 + 1.5 * Math.log2(cl.n)) * cl.g;
    g.beginPath(); g.arc(cl.x, cl.y, r + 1.75, 0, 7); g.fillStyle = 'rgba(6,8,11,.85)'; g.fill();
    g.beginPath(); g.arc(cl.x, cl.y, r, 0, 7); g.fillStyle = rgb(cl.col); g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
    const Y = .2126 * cl.col[0] + .7152 * cl.col[1] + .0722 * cl.col[2]; g.fillStyle = Y > .55 ? '#0b0e12' : '#fff'; g.font = `700 ${cl.n > 99 ? 10 : 11}px system-ui,sans-serif`; g.fillText(cl.n > 9999 ? '9k+' : String(cl.n), cl.x, cl.y + .5); }
  // names: unclustered pins when few are on screen, and the names of lines and areas; greedy, no overlaps
  let nn = 0; const labelsOn = !document.getElementById('showLabels') || document.getElementById('showLabels').checked;
  if (labelsOn) {
    const placed = clusters.map(cl => { const r = 22; return [cl.x - r, cl.y - r, cl.x + r, cl.y + r]; }).concat(singles.map(([p, q]) => [q[0] - 9, q[1] - PIN * p.sc, q[0] + 9, q[1]]));
    const free = r => r[0] > 2 && r[2] < W - 2 && r[1] > 60 && r[3] < H - 50 && !placed.some(o => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]);
    g.font = '600 12px system-ui,sans-serif'; g.textAlign = 'left'; g.lineWidth = 3; g.strokeStyle = 'rgba(6,8,11,.9)'; g.fillStyle = '#fff';
    const text = (t, x, y) => { g.strokeText(t, x, y); g.fillText(t, x, y); nn++; };
    if (singles.length <= 40) for (const [p, q] of singles) { if (!p.name) continue; const tw = g.measureText(p.name).width, r = [q[0] + 10, q[1] - PIN * p.sc * .7 - 8, q[0] + 14 + tw, q[1] - PIN * p.sc * .7 + 8];
      if (free(r)) { placed.push(r); text(p.name, r[0] + 2, (r[1] + r[3]) / 2); } }
    let ln = 0; g.textAlign = 'center';
    for (const l of S.names) { if (ln >= 40) break; const q = proj(l.x, l.y, l.z); if (!q) continue; const tw = g.measureText(l.name).width, r = [q[0] - tw / 2 - 3, q[1] - 9, q[0] + tw / 2 + 3, q[1] + 9];
      if (free(r)) { placed.push(r); text(l.name, q[0], q[1]); ln++; } }
  }
  S.vis = { pins: singles.length, clusters: clusters.length, onScreen, names: nn, lines: (S.lines || []).reduce((a, B) => a + B.n / 6, 0) };
}
function tapPin(F, f) {   // a pin opens its card; a cluster flies in (or lists its members when they share one spot)
  const cl = S.cl.get(f); if (!cl) return featureCard(F, f);
  const b = cl.m.reduce((b, p) => [Math.min(b[0], p.x), Math.min(b[1], p.z), Math.max(b[2], p.x), Math.max(b[3], p.z)], [1e9, 1e9, -1e9, -1e9]);
  if (Math.hypot(b[2] - b[0], b[3] - b[1]) > 25 && C.cam.dist > 200) return flyFit(b, { min: 120 });
  C.ovCard('<div id="kmlCard"></div>'); const box = $('kmlCard'); box.append(E('b', { text: `${cl.n} places here` }), ' ', E('span', { class: 'small', text: `My KML · ${F.name}` }));
  const ul = E('div', { class: 'chips' }); for (const p of cl.m.slice(0, 60)) ul.append(E('button', { type: 'button', text: p.name || '(no name)', on: () => featureCard(p.F, p.f) })); box.append(ul);
}

// ---------- record card: every text from the file goes in with textContent (a <script> in a description is text)
const E = (tag, props = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(props)) if (k === 'text') e.textContent = v; else if (k === 'on') e.onclick = v; else e.setAttribute(k, v); for (const c of kids) if (c) e.append(c); return e; };
function featureCard(F, f) {
  C.ovCard('<div id="kmlCard"></div>'); const box = $('kmlCard');
  box.append(E('b', { text: f.name || '(no name)' }), ' ', E('span', { class: 'small', text: `My KML · ${F.name}${f.path.length ? ' · ' + f.path.join(' / ') : ''}` }));
  if (f.snippet && f.snippet !== f.description) box.append(E('p', { class: 'small', text: f.snippet }));
  if (f.description) box.append(E('p', { class: 'small kmlDesc', text: f.description }));
  if (f.address) box.append(E('p', { class: 'small', text: 'Address: ' + f.address }));
  if (f.extended.length) { const t = E('table', { class: 'small' }); for (const [k, v] of f.extended) t.append(E('tr', {}, E('td', { text: k }), E('td', { text: v }))); box.append(t); }
  const kinds = f.geoms.map(g => g.type + (g.type === 'Polygon' && g.rings.length > 1 ? ` with ${g.rings.length - 1} hole${g.rings.length > 2 ? 's' : ''}` : '') + (g.altitudeMode && g.altitudeMode !== 'clampToGround' ? ` (${g.altitudeMode})` : '')).join(', ');
  box.append(E('p', { class: 'small', text: `${kinds}. From your file "${F.file}": shown only in this browser, not uploaded.` }));
  const row = E('div', { class: 'row' });
  if (f.view) row.append(E('button', { type: 'button', text: 'Go to view', on: () => goView(f.view) }));
  row.append(E('button', { type: 'button', text: 'Remove this feature', on: () => { f.removed = true; C.ovCard('<p class="small">Removed from My KML.</p>'); rebuild(); } }));
  box.append(row);
}

// ---------- camera: KML Camera / LookAt to the page camera and back
function goView(v) {
  S.fly++; if (globalThis.DocklandsNav) DocklandsNav.stop();
  const cam = C.cam, VZ = C.VZ || 1, [x, z] = C.geo(v.lon, v.lat);
  const alt = v.altitudeMode === 'absolute' ? v.alt : /^relativeTo/.test(v.altitudeMode) ? C.groundAt(x, z) + v.alt : C.groundAt(x, z) + (v.type === 'Camera' ? Math.max(1.6, v.alt || 0) : 0);
  delete cam.eye; delete cam.target; delete cam.fov; delete cam.hfov;
  if (v.type === 'LookAt') {
    const p = Math.max(.02, Math.min(1.5695, (90 - v.tilt) * D2R));
    Object.assign(cam, { tx: x, ty: alt, tz: z, yaw: -v.heading * D2R, pitch: p, dist: Math.max(80, Math.min(16000, v.range || 1000)) });
  } else {   // Camera: the eye, the heading and the tilt (0 straight down, 90 level); roll is not used
    const a = v.heading * D2R, p = (v.tilt - 90) * D2R, D = 1200;
    Object.assign(cam, { tx: x + D * Math.sin(a) * Math.cos(p), ty: alt + D * Math.sin(p) / VZ, tz: z - D * Math.cos(a) * Math.cos(p), yaw: -a, pitch: Math.max(-1.5695, Math.min(1.5695, -p)), dist: D });
  }
  if (Number.isFinite(v.horizFov) && v.horizFov > 1 && v.horizFov < 170) cam.hfov = v.horizFov * D2R;
  else if (v.type === 'Camera') cam.hfov = 60 * D2R;   // no gx:horizFov: Google Earth's default horizontal field, the same on a phone and a desktop
  C.unview(); C.draw();
}
function currentView() {   // the camera as drawn (CAM): eye in m OD, heading from north, tilt from straight down, horizontal field
  const K = C.CAM; if (!K) return null; const VZ = C.VZ || 1;
  const e = [K.eye[0], K.eye[1] / VZ, K.eye[2]], t = [K.target[0], K.target[1] / VZ, K.target[2]], d = [t[0] - e[0], t[1] - e[1], t[2] - e[2]];
  const [lon, lat] = lonLatOf(e[0], e[2]), heading = ((Math.atan2(d[0], -d[2]) * R2D) % 360 + 360) % 360, tilt = 90 + Math.atan2(d[1], Math.hypot(d[0], d[2])) * R2D;
  return { type: 'Camera', lon, lat, alt: e[1], heading, tilt, roll: 0, altitudeMode: 'absolute', horizFov: 2 * Math.atan(Math.tan(K.fovY / 2) * K.aspect) * R2D };
}
// fly to fit: a camera that shows a box of the model (x0, z0, x1, z1) inside the screen, clear of the top bar and the bottom
// controls; keeps the turn, tilts to look down more on a tall screen; the momentum is stopped first (nav.js)
function fitCam(b, o = {}) {   // the turn that needs the least distance of: as now, and a quarter turn either way (a wide box on a tall screen)
  if (o.yaw == null) { const y0 = C.cam.yaw, c = [0, Math.PI / 2, -Math.PI / 2].map(d => fitCam(b, { ...o, yaw: y0 + d })); let best = c[0]; for (const k of c.slice(1)) if (k.need < best.need * .85) best = k; return best; }
  const cv = C.cv, W = cv.clientWidth || innerWidth, H = cv.clientHeight || innerHeight, asp = W / H, VZ = C.VZ || 1, cam = C.cam, t = Math.tan(.4);
  const yaw = o.yaw, pitch = Math.max(asp < .8 ? .95 : .72, Math.min(1.25, cam.eye ? .8 : cam.pitch));
  const pad = [16, Math.min(90, H * .12), 16, Math.min(100, H * .13)];   // left, top, right, bottom (CSS px)
  const xs = [b[0], b[2]], zs = [b[1], b[3]], pts = []; for (const x of xs) for (const z of zs) pts.push([x, C.groundAt(x, z), z]);
  pts.push([(b[0] + b[2]) / 2, C.groundAt((b[0] + b[2]) / 2, (b[1] + b[3]) / 2), (b[1] + b[3]) / 2]);
  let tx = (b[0] + b[2]) / 2, tz = (b[1] + b[3]) / 2, dist = 1000;
  const shot = (tx, tz, d) => { const ty = C.groundAt(tx, tz), T = [tx, ty * VZ, tz], ce = Math.cos(pitch), e = [T[0] + d * Math.sin(yaw) * ce, T[1] + d * Math.sin(pitch), T[2] + d * Math.cos(yaw) * ce];
    const f = [T[0] - e[0], T[1] - e[1], T[2] - e[2]], fl = Math.hypot(...f); f.forEach((v, i) => f[i] = v / fl);
    let r = [-f[2], 0, f[0]]; const rl = Math.hypot(...r); r = r.map(v => v / rl); const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    return pts.map(([x, y, z]) => { const v = [x - e[0], y * VZ - e[1], z - e[2]], zc = v[0] * f[0] + v[1] * f[1] + v[2] * f[2]; if (zc <= 1) return null;
      return [((v[0] * r[0] + v[1] * r[1] + v[2] * r[2]) / (zc * t * asp) * .5 + .5) * W, (1 - ((v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / (zc * t) * .5 + .5)) * H]; }); };
  const fits = (tx, tz, d) => shot(tx, tz, d).every(q => q && q[0] >= pad[0] && q[0] <= W - pad[2] && q[1] >= pad[1] && q[1] <= H - pad[3]);
  const lo0 = o.min || 150;
  for (let it = 0; it < 4; it++) {
    let lo = lo0, hi = 40000; if (fits(tx, tz, lo)) hi = lo; else { for (let k = 0; k < 24; k++) { const m = Math.sqrt(lo * hi); if (fits(tx, tz, m)) hi = m; else lo = m; } }
    dist = hi; const q = shot(tx, tz, dist).filter(Boolean); if (!q.length) break;
    const cx = (Math.min(...q.map(v => v[0])) + Math.max(...q.map(v => v[0]))) / 2, cy = (Math.min(...q.map(v => v[1])) + Math.max(...q.map(v => v[1]))) / 2;
    const ox = cx - (pad[0] + W - pad[2]) / 2, oy = cy - (pad[1] + H - pad[3]) / 2, mpp = 2 * dist * t / H;   // metres per CSS px at the target
    if (Math.abs(ox) < 3 && Math.abs(oy) < 3) break;
    const dx = ox * mpp, dy = oy * mpp / Math.max(.3, Math.sin(pitch)), c = Math.cos(yaw), s = Math.sin(yaw);
    tx += c * dx + s * dy; tz += -s * dx + c * dy;   // screen right is (cos yaw, -sin yaw); screen down (towards the eye) is (sin yaw, cos yaw)
  }
  const need = dist; dist = Math.max(lo0, Math.min(16000, dist)); return { tx, ty: C.groundAt(tx, tz), tz, yaw, pitch, dist, need };   // need: the distance that fits (the page stops at 16 km)
}
function flyCam(to, ms = 900, done) {   // the page camera from where it is to `to`, eased; a touch, a wheel or another view ends it
  const cam = C.cam; if (globalThis.DocklandsNav) DocklandsNav.stop();
  delete cam.eye; delete cam.target; delete cam.fov; delete cam.hfov; delete cam.roll; C.unview();
  const s0 = { tx: cam.tx, ty: cam.ty, tz: cam.tz, yaw: cam.yaw, pitch: cam.pitch, ld: Math.log(cam.dist) }, t0 = performance.now(), id = ++S.fly;
  let dy = to.yaw - s0.yaw; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
  const reduce = matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const step = now => { if (S.fly !== id) return; const t = reduce ? 1 : Math.min(1, (now - t0) / ms), k = t * t * (3 - 2 * t);
    Object.assign(cam, { tx: s0.tx + (to.tx - s0.tx) * k, ty: s0.ty + (to.ty - s0.ty) * k, tz: s0.tz + (to.tz - s0.tz) * k, yaw: s0.yaw + dy * k, pitch: s0.pitch + (to.pitch - s0.pitch) * k, dist: Math.exp(s0.ld + (Math.log(to.dist) - s0.ld) * k) });
    C.draw(); if (t < 1) requestAnimationFrame(step); else { S.fly++; if (done) done(); } };
  requestAnimationFrame(step); return to;
}
addEventListener('pointerdown', () => { S.fly++; }, true); addEventListener('wheel', () => { S.fly++; }, { capture: true, passive: true });
function flyFit(b, o, done) { if (!b || b[0] > b[2]) return false; const m = 20; return flyCam(fitCam([b[0] - m, b[1] - m, b[2] + m, b[3] + m], o), 900, done); }
function frame(F, done) {   // fly to a file's drawn features, then done()
  if (!F.bb || F.bb[0] > F.bb[2]) return false;
  if (globalThis.__docklands && __docklands.PIX && __docklands.PIX.on) { const b = F.bb, cam = C.cam, cx = (b[0] + b[2]) / 2, cz = (b[1] + b[3]) / 2;
    Object.assign(cam, { tx: cx, ty: C.groundAt(cx, cz), tz: cz, dist: Math.max(300, Math.min(16000, 1.2 * Math.hypot(b[2] - b[0], b[3] - b[1]) + 200)) }); C.unview(); C.draw(); if (done) done(); return true; }
  return flyFit(F.bb, { min: F.n && F.n.drawn === 1 && F.bb[2] - F.bb[0] < 50 ? 400 : 150 }, done);
}

// ---------- import
async function open(src, name, how) {
  try {
    const doc = await readKml(src, name); const F = { id: ++S.seq, name: doc.name || name, file: name, doc, on: true, how };
    S.files.push(F); rebuild();
    const v = doc.view || (doc.features.length === 1 && doc.features[0].view); if (v) { goView(v); show(F); } else frame(F, () => show(F));
    const short = F.name.length > 34 ? F.name.slice(0, 32).replace(/\s+\S*$/, '') + '…' : F.name, d = F.n.drawn, out = doc.features.length - d - F.n.hidden;
    C.toast(d ? `${short}: ${d.toLocaleString('en-GB')} shown${out > 0 ? `, ${out.toLocaleString('en-GB')} outside the model` : ''}${v ? ' (the file’s own view)' : ''}.` : `${short}: nothing inside the model.`);
    const tb = $('toast'); if (d && tb) tb.append(' ', E('button', { type: 'button', class: 'kmlShow', text: 'Show', on: () => showOrFly(F) }));
    return F;
  } catch (e) { C.toast(`${name}: not opened (${e.message})`); console.warn('KML', name, e); return null; }
}
function list() {
  const el = $('kmlList'); if (!el) return; el.textContent = '';
  for (const F of S.files) {
    const d = F.doc, n = F.n || {}, live = d.features.filter(f => !f.removed).length;
    const row = E('div', { class: 'kmlFile' });
    const cb = E('input', { type: 'checkbox' }); cb.checked = F.on; cb.onchange = () => { F.on = cb.checked; rebuild(); };
    row.append(E('label', {}, cb, ' ', E('b', { text: F.name })));
    const sk = Object.entries(d.skipped).map(([k, c]) => `${c} ${k}`).join(', ');
    row.append(E('div', { class: 'small', text: `${live} features: ${n.drawn || 0} drawn${n.outside ? `, ${n.outside} outside the model box (not drawn)` : ''}${n.clipped ? `, ${n.clipped} partly outside (cut at the edge)` : ''}${n.hidden ? `, ${n.hidden} hidden in the file (visibility 0)` : ''}${d.folders.n ? `; ${d.folders.n} folders` : ''}${d.kmz ? `; KMZ (${d.kmz.entry})` : ''}${sk ? `; not supported: ${sk}` : ''}.` }));
    if (d.description) row.append(E('div', { class: 'small kmlDesc', text: d.description.slice(0, 400) }));
    const r = E('div', { class: 'row' });
    r.append(E('button', { type: 'button', text: 'Show', title: 'Make this file’s features jump out for two seconds', on: () => { closeOnPhone(); showOrFly(F); } }));
    r.append(E('button', { type: 'button', text: 'Fit', title: 'Fly to fit this file’s features', on: () => { closeOnPhone(); frame(F) || C.toast('Nothing of this file is inside the model.'); } }));
    if (d.view) r.append(E('button', { type: 'button', text: 'Go to view', on: () => goView(d.view) }));
    r.append(E('button', { type: 'button', text: 'Remove', on: () => { S.files.splice(S.files.indexOf(F), 1); rebuild(); } }));
    row.append(r); el.append(row);
  }
}
const closeOnPhone = () => { if (innerWidth < 900 && $('drawerX') && $('drawer') && $('drawer').classList.contains('open')) $('drawerX').click(); };
function onScreen(F) {   // is any of the file's box (corners, centre) on the screen now?
  const M = C.MVP, b = F.bb; if (!M || !b || b[0] > b[2]) return false; const VZ = C.VZ || 1;
  return [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]], [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]].some(([x, z]) => { const y = C.groundAt(x, z) * VZ, w = M[3] * x + M[7] * y + M[11] * z + M[15]; if (w <= .5) return false;
    const X = (M[0] * x + M[4] * y + M[8] * z + M[12]) / w, Y = (M[1] * x + M[5] * y + M[9] * z + M[13]) / w; return Math.abs(X) < 1 && Math.abs(Y) < 1; });
}
function showOrFly(F) { if (!F.on) { F.on = true; rebuild(); } if (onScreen(F)) show(F); else frame(F, () => show(F)) || C.toast('Nothing of this file is inside the model.'); }
async function openFiles(files, how) { const out = []; for (const f of files) if (isKmlName(f.name) || isKmlType(f.type)) out.push(await open(f, f.name, how)); return out; }

// ---------- export
const WC = { on_site: [1, .55, .12, 1], approved_not_started: [.95, .86, .3, 1], completed_recently: [.45, .86, .6, 1], proposed: [.62, .72, .98, 1], commenced_stale: [.6, .6, .62, 1] };   // the page's WCOL
const OSM_CREDIT = '© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)';
const RIVER = { rbus: [['bus', i => i.kind === 'pier']], rlocks: [['locks', () => true]], rpla: [['pla', () => true]], rswim: [['eden', () => true], ['royal', () => true]],
  rmoor: [['osm', i => /^(mooring|houseboat)$/.test(i.kind)], ['moor', () => true]], rships: [['wd', () => true], ['osm', i => i.kind === 'ship']] };
function exportView(opts = {}) {
  const v = currentView(); if (!v) throw new Error('the model is not drawn yet');
  const credits = new Set(), folders = [], now = new Date(), osm = { used: false };
  const want = k => opts[k] ?? (($('kx_' + k) || {}).checked ?? true);
  // the selected building: its OSM outline at the LiDAR roof height
  const ab = C.sel && C.sel();
  if (ab && want('sel')) {
    const pms = ab.mi.map(i => { const b = C.A.buildings[i], f = C.dec(b.p), ring = []; for (let k = 0; k < f.length; k += 2) { const [lon, lat] = lonLatOf(f[k], f[k + 1]); ring.push([lon, lat, b.b + b.h]); }
      return { type: 'Polygon', rings: [ring], altitudeMode: 'absolute', extrude: true }; });
    folders.push({ name: 'Selected building', placemarks: [{ name: ab.n || ab.id, description: `Registry record ${ab.id}. Outline ${OSM_CREDIT}; roof height (m above Ordnance Datum Newlyn, about mean sea level) from Environment Agency LiDAR, OGL v3.0.`,
      extended: [['registry id', ab.id], ['roof m OD', +(Math.max(...ab.mi.map(i => C.A.buildings[i].b + C.A.buildings[i].h))).toFixed(1)], ['outline licence', OSM_CREDIT], ['atlas', `https://danbri.github.io/londat/cwplans/atlas/#map/b/${ab.id}`]],
      style: { line: [1, .25, .65, 1], width: 3, poly: [1, .25, .65, .35] }, geoms: pms }] });
    osm.used = true; credits.add('Selected building outline: ' + OSM_CREDIT + '. Roof height: Environment Agency LiDAR DSM 1 m, © Environment Agency copyright and/or database right, OGL v3.0.');
  }
  // works in progress (when the layer is on)
  const wd = C.ovOn('works') && C.OV.data.works;
  if (wd && want('works')) {
    const pms = [];
    for (const s of wd.sites) { const fp = s.footprint, ring = fp && fp.ring_wgs84; if (!WC[s.status] || !ring || ring.length < 3) continue; const [cx, cz] = C.geo(s.position.lon, s.position.lat); if (!C.inBox(cx, cz)) continue;
      const fromOsm = /\bOSM\b|OpenStreetMap/i.test(fp.from || ''); if (fromOsm) osm.used = true;
      pms.push({ name: s.name || s.id, style: { line: WC[s.status] || [.6, .6, .6, 1], width: 2, poly: [...(WC[s.status] || [.6, .6, .6]).slice(0, 3), .3] },
        extended: [['id', s.id], ['status', s.status], ['status rule', s.status_rule], ['status confidence', s.status_confidence], ['address', s.address], ['borough', s.borough],
          ['decision', s.dates && s.dates.decision], ['commenced', s.dates && s.dates.commenced], ['completed', s.dates && s.dates.completed], ['dates from', s.dates && s.dates.from],
          ['storeys (approved, max)', s.approved && s.approved.storeys_max], ['footprint from', fp.from], ['footprint licence', fromOsm ? OSM_CREDIT : 'Planning London Datahub: facts and links only']],
        geoms: [{ type: 'Polygon', rings: [ring.map(c => [c[0], c[1], 0])] }] });
    }
    folders.push({ name: 'Works in progress', description: 'Construction sites in the model box, by status (orange on site, yellow approved and not started, green completed in the last two years, blue proposed, grey commenced years ago and never closed).', placemarks: pms });
    for (const src of Object.values((wd.meta && wd.meta.sources) || {})) if (src.attribution) credits.add(`Works in progress: ${src.attribution}${src.licence ? ` (${src.licence})` : ''}`);
  }
  // river items (the river layers that are on)
  const RV = globalThis.DocklandsRiver && DocklandsRiver.RV;
  if (RV && want('river')) {
    const pms = [], seen = new Set();
    for (const [k, parts] of Object.entries(RIVER)) { if (!C.ovOn(k)) continue;
      for (const [file, keep] of parts) { const d = RV.data[file]; if (!d || !d.items) continue;
        for (const i of d.items) { if (!keep(i) || !i.position || i.position.lat == null || seen.has(i.id)) continue; const [x, z] = C.geo(i.position.lon, i.position.lat); if (!C.inBox(x, z)) continue; seen.add(i.id);
          const fromOsm = /OpenStreetMap|\bOSM\b/i.test(`${(d.meta && d.meta.attribution) || ''} ${i.position.precision || ''}`) && (file === 'osm' || /OSM/.test(i.position.precision || '')); if (fromOsm) osm.used = true;
          const vals = Object.entries(i.values || {}).filter(([, v]) => v != null && v !== '' && typeof v !== 'object').slice(0, 20);
          pms.push({ name: i.name || i.title || (i.values && i.values.name) || i.id, style: { icon: [.2, .6, 1, 1] },
            extended: [['id', i.id], ['kind', i.kind], ['url', i.url], ['position from', i.position.precision], ...vals, ['source', d.meta && d.meta.attribution], ...(fromOsm ? [['position licence', OSM_CREDIT]] : [])],
            geoms: [{ type: 'Point', coords: [i.position.lon, i.position.lat, 0] }] });
          if (d.meta && d.meta.attribution) credits.add(`River: ${d.meta.attribution}${d.meta.licence ? ` (licence: ${String(d.meta.licence).slice(0, 160)})` : ''}`); } } }
    if (pms.length) folders.push({ name: 'River', description: 'River layers that were on: piers, locks, harbour notices, swim water, moorings and houseboats, historic ships (positions as points; facts only).', placemarks: pms });
  }
  // your own KML, as drawn now
  if (want('mine')) for (const F of S.files) { if (!F.on) continue;
    const pms = F.doc.features.filter(f => !f.removed).map(f => ({ name: f.name, description: f.description, extended: f.extended, view: f.view, geoms: f.geoms,
      style: { line: f.style.line, width: f.style.width, poly: f.style.poly, fill: f.style.fill, outline: f.style.outline, icon: f.style.icon } }));
    if (pms.length) folders.push({ name: `My KML: ${F.name}`, description: F.doc.description, placemarks: pms }); credits.add(`My KML "${F.file}": your own file, under its own terms.`);
  }
  if (osm.used) credits.add('Map data: ' + OSM_CREDIT + '. Geometry marked with it is OpenStreetMap-derived.');
  const page = 'https://danbri.github.io/londat/cwplans/docklands/';
  const desc = `View exported from the Docklands 3D page (${page}) on ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC. Camera: eye at ${v.alt.toFixed(1)} m above Ordnance Datum Newlyn (about mean sea level; KML absolute altitude), heading ${v.heading.toFixed(1)}°, tilt ${v.tilt.toFixed(1)}°, horizontal field ${v.horizFov.toFixed(1)}° (gx:horizFov).\n\nCredits and licences:\n- ${[...credits].join('\n- ') || 'camera only'}\n\nFull credits: ${page} (Menu > About > Credits). Not for navigation.`;
  const name = `Docklands view ${now.toISOString().slice(0, 10)}`;
  const text = writeKml({ name, description: desc, view: v, folders });
  return { text, view: v, count: folders.reduce((s, f) => s + f.placemarks.length, 0), folders: folders.map(f => [f.name, f.placemarks.length]), osm: osm.used, filename: `docklands-view-${now.toISOString().slice(0, 16).replace(/[-:T]/g, '')}.kml` };
}

// ---------- the page's side
function injectUi() {
  const css = document.createElement('style');
  css.textContent = '#kmlOv{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}body.capture #kmlOv{display:none!important}#toast .kmlShow{margin-left:6px;padding:3px 10px;font-size:12px}.lb.kml{border:1px solid #ffd000;border-radius:5px;background:#0d1013cc;color:#fff3b0;padding:0 3px}.kmlFile{border-top:1px solid #ffffff22;padding:6px 0}.kmlDesc{white-space:pre-wrap;overflow-wrap:anywhere}#kmlCard table td{vertical-align:top;overflow-wrap:anywhere}#kmlCard table td:first-child{color:#aab;padding-right:8px}#kmlSrc summary{cursor:pointer;padding:6px 0;font-size:13px}#kmlSrcList{border-top:1px solid #ffffff22}.ksRow{display:flex;gap:8px;align-items:flex-start;padding:7px 2px;border-bottom:1px solid #ffffff14}.ksRow>div{flex:1;min-width:0}.ksRow b{font-size:13px;font-weight:600;overflow-wrap:anywhere}.ksRow .small{display:block;overflow-wrap:anywhere}.ksRow button,.ksRow a.ksAct{flex:none;font-size:12px;padding:6px 10px;white-space:nowrap}.ksRow a.ksAct{border:1px solid #59616a;border-radius:8px;color:inherit;text-decoration:none}.ksB{display:inline-block;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;margin-right:4px;vertical-align:1px;background:#3d4650;color:#e8eaec}.ksB.open{background:#2f6b45}.ksB.sa{background:#7a5a1e}.ksB.no{background:#6b2f35}.ksWhy{color:#c9a9ad}#kmlSrcF{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}#kmlSrcF button{font-size:12px;padding:5px 10px;border-radius:14px}#kmlSrcF button[aria-pressed=true]{background:#3d5a48;border-color:var(--acc);color:#fff}#kmlSrcQ{width:100%;box-sizing:border-box;margin:2px 0 6px;padding:7px 9px;font-size:14px}';
  document.head.appendChild(css);
  const html = `<h3>My KML</h3>
    <div class="row"><button type="button" id="kmlOpen">Open KML/KMZ</button><button type="button" id="kmlExport">Export view as KML</button><button type="button" id="kmlSrcBtn">KML sources</button>
    <input type="file" id="kmlFile" accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" multiple hidden></div>
    <details><summary class="small">What the export holds</summary><div class="chips">
      <label><input type="checkbox" checked disabled> The camera (KML Camera)</label><label><input type="checkbox" id="kx_sel" checked> The selected building</label>
      <label><input type="checkbox" id="kx_works" checked> Works in progress (when on)</label><label><input type="checkbox" id="kx_river" checked> River items (layers on)</label>
      <label><input type="checkbox" id="kx_mine" checked> My KML</label></div></details>
    <div id="kmlList"></div>
    <details id="kmlSrc"><summary>KML sources <span class="small">(open data for the zone)</span></summary><div id="kmlSrcBody"><p class="small">Loading the catalogue…</p></div></details>
    <p class="small" id="kmlNote">Open a KML or KMZ file, or drop one on the city: points, lines and polygons (with holes), folders, styles, descriptions (as text) and data tables; a KML Camera or LookAt gives "Go to view". The file stays in this browser: nothing is uploaded or stored.</p>`;
  const pane = $('paneLayers'), first = pane && pane.querySelector('h3'); if (first) first.insertAdjacentHTML('beforebegin', html); else if (pane) pane.insertAdjacentHTML('afterbegin', html);
  const inp = $('kmlFile');
  $('kmlOpen').onclick = () => inp.click();
  inp.onchange = async () => { const fs = [...inp.files]; inp.value = ''; await openFiles(fs, 'picker'); };
  $('kmlExport').onclick = () => { try { const r = exportView(); download(r.text, r.filename); C.toast(`Exported the view${r.count ? ` and ${r.count} placemarks` : ''} as ${r.filename}.`); } catch (e) { C.toast('Export failed: ' + e.message); } };
  const mus = [...document.querySelectorAll('#credits h3')].find(h => /Music and software/.test(h.textContent));
  if (mus) mus.insertAdjacentHTML('beforebegin', '<h3>My KML</h3><ul class="small"><li>Your own KML and KMZ files are read in this browser and drawn only for you; they are not uploaded or stored. Their content is under their own terms.</li><li>"Export view as KML" writes the credits and licences of what it holds into the file (OpenStreetMap-derived outlines: © OpenStreetMap contributors, ODbL 1.0).</li></ul>');
  // a dropped .kml or .kmz goes to the importer (the window lock in index.html keeps the page from navigating; audio still goes to the player)
  addEventListener('dragover', e => { const it = [...((e.dataTransfer && e.dataTransfer.items) || [])]; if (it.some(i => i.kind === 'file' && (isKmlType(i.type) || !i.type || /xml|zip/.test(i.type)))) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  addEventListener('drop', e => { const fs = [...((e.dataTransfer && e.dataTransfer.files) || [])].filter(f => isKmlName(f.name) || isKmlType(f.type)); if (!fs.length) return; e.preventDefault(); openFiles(fs, 'drop'); });
}
// KML sources: the catalogue (feeds/kml/catalogue.json, made by tools/find-kml.mjs), fetched when the panel is first opened.
// One row per resource: Open (a file the page reads: open licence, CORS, at least one feature in the zone), Link only
// (share-alike: the publisher's page in a new tab, never loaded here), or Not usable with the reason.
const CATALOGUE = '../feeds/kml/catalogue.json', README = 'https://github.com/danbri/londat/blob/main/cwplans/feeds/kml/README.md';
const OPEN_CLASSES = new Set(['ogl', 'cc-by', 'odc-by', 'public-domain', 'cc0']);
const KS = { rows: [], cls: 'all', q: '' };
function srcAction(e) {
  const cls = String(e.licence_class || 'none').toLowerCase();
  if (e.url && e.open_link && e.cors === 'yes' && OPEN_CLASSES.has(cls)) return { kind: 'open' };
  if (cls === 'share-alike') return { kind: 'link', href: e.page || e.url, why: 'Share-alike licence: opens the publisher’s page; not loaded into this page (project rule).' };
  const why = e.reason || (e.cors && e.cors !== 'yes' ? `the server does not let this page read it (${e.cors})` : !OPEN_CLASSES.has(cls) ? `licence: ${e.licence || cls}` : 'not readable here');
  return { kind: 'no', href: e.page || (/^https?:/.test(e.url || '') && !/[<>]/.test(e.url) ? e.url : null), why };
}
const clsGroup = c => { c = String(c || 'none').toLowerCase(); return OPEN_CLASSES.has(c) ? 'open' : c === 'share-alike' ? 'share-alike' : c === 'none' ? 'none' : c === 'restricted' ? 'restricted' : 'other'; };
async function sources() {
  const body = $('kmlSrcBody'); if (!body || KS.loaded) return; KS.loaded = true;
  try { const r = await fetch(CATALOGUE, { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status); const cat = await r.json();
    const rank = { open: 0, link: 1, no: 2 };
    KS.rows = (cat.resources || []).map(e => ({ e, a: srcAction(e), g: clsGroup(e.licence_class) }))
      .sort((x, y) => rank[x.a.kind] - rank[y.a.kind] || (y.e.zone_features ?? -1) - (x.e.zone_features ?? -1) || String(x.e.title).localeCompare(y.e.title));
    const n = k => KS.rows.filter(r => r.a.kind === k).length, m = cat.meta || {};
    body.textContent = '';
    body.append(E('p', { class: 'small', text: `${KS.rows.length} resources checked on ${m.probed || '?'}: ${n('open')} open here, ${n('link')} by link only, ${n('no')} not usable. The page draws only inside the model box; “in zone” counts the wider zone (to the Royal Docks). ` }, E('a', { href: README, target: '_blank', rel: 'noopener', text: 'Method and licences (README)' })));
    const f = E('div', { id: 'kmlSrcF', role: 'group', 'aria-label': 'Filter by licence class' });
    for (const [k, t] of [['all', 'All'], ['open', 'Open licence'], ['share-alike', 'Share-alike'], ['none', 'No licence'], ['restricted', 'Restricted'], ['other', 'Other']]) {
      const c = KS.rows.filter(r => k === 'all' || r.g === k).length; if (!c) continue;
      const b = E('button', { type: 'button', 'aria-pressed': String(KS.cls === k), 'data-k': k, text: `${t} ${c}` }); b.onclick = () => { KS.cls = k; f.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); srcList(); }; f.append(b); }
    const q = E('input', { type: 'search', id: 'kmlSrcQ', placeholder: 'Filter: title, publisher, licence', 'aria-label': 'Filter KML sources', autocomplete: 'off' }); q.oninput = () => { KS.q = q.value.trim().toLowerCase(); srcList(); };
    body.append(f, q, E('div', { id: 'kmlSrcList' }));
    srcList();
  } catch (err) { KS.loaded = false; body.textContent = ''; body.append(E('p', { class: 'small', text: `The catalogue did not load (${err.message}). ` }, E('a', { href: README, target: '_blank', rel: 'noopener', text: 'KML sources (README)' }))); }
}
function srcList() {
  const el = $('kmlSrcList'); if (!el) return; el.textContent = ''; let shown = 0;
  for (const { e, a, g } of KS.rows) {
    if (KS.cls !== 'all' && g !== KS.cls) continue;
    if (KS.q && !`${e.title} ${e.publisher} ${e.licence} ${e.licence_class} ${e.note || ''}`.toLowerCase().includes(KS.q)) continue;
    const z = e.zone_features, mb = e.model_box_features, badge = E('span', { class: 'ksB ' + (g === 'open' ? 'open' : g === 'share-alike' ? 'sa' : g === 'none' || g === 'restricted' ? 'no' : ''), text: e.licence_class || 'none' });
    const info = E('div', {}, E('b', { text: e.title }), E('span', { class: 'small' }, badge, `${e.publisher || ''}${z != null ? ` · ${z.toLocaleString('en-GB')} in zone, ${(mb ?? 0).toLocaleString('en-GB')} in the model` : ''}${e.kind === 'copy' ? ' · our zone copy' : ''}`));
    if (a.why) info.append(E('span', { class: 'small ksWhy', text: a.why.length > 220 ? a.why.slice(0, 218) + '…' : a.why }));
    const row = E('div', { class: 'ksRow' }, info);
    if (a.kind === 'open') row.append(E('button', { type: 'button', text: 'Open', title: `Load ${e.title} into the page`, on: () => openSource(e) }));
    else if (a.kind === 'link' && a.href) row.append(E('a', { class: 'ksAct', href: a.href, target: '_blank', rel: 'noopener', text: 'Link only ↗' }));
    else row.append(a.href ? E('a', { class: 'ksAct', href: a.href, target: '_blank', rel: 'noopener', text: 'Not usable ↗', title: 'The resource page (not loaded here)' }) : E('span', { class: 'small', text: 'Not usable' }));
    el.append(row); shown++;
  }
  if (!shown) el.append(E('p', { class: 'small', text: 'No source matches.' }));
}
async function openSource(e) {
  const F0 = S.files.find(F => F.src === e.url || F.file === decodeURIComponent(new URL(e.url).pathname.split('/').pop()));
  if (innerWidth < 900 && $('drawerX') && $('drawer') && $('drawer').classList.contains('open')) $('drawerX').click();
  if (F0) { C.toast(`${e.title.slice(0, 40)} is open already: showing it.`); return showOrFly(F0); }
  const F = await loadUrl(e.url); if (F) F.src = e.url;
}
async function fromUrl() {
  const m = /[?&]kml=([^&#]+)/.exec(location.search); if (!m) return;
  return loadUrl(decodeURIComponent(m[1].replace(/\+/g, ' ')));
}
async function loadUrl(u) {
  try { const url = new URL(u, location.href); if (!/^https?:$/.test(url.protocol)) throw new Error('only http(s) addresses');
    const r = await fetch(url, { credentials: 'omit' }); if (!r.ok) throw new Error('HTTP ' + r.status);
    return await open(await r.arrayBuffer(), decodeURIComponent(url.pathname.split('/').pop() || 'KML'), 'url'); }
  catch (e) { C.toast(`The KML link did not load (${e.message}). The server must allow this site to read it (CORS).`); return null; }
}
if (C) {
  injectUi(); setInterval(sync, 1000); { const d = $('kmlSrc'); if (d) d.addEventListener('toggle', () => { if (d.open) sources(); }); }
  // the KML sources list from a button: in My KML and in the menu's views group (owner, 2026-10-05: "Button")
  { const showSrc = () => { const d = $('kmlSrc'); if (!d) return; if (globalThis.openDrawer) openDrawer(true); if (globalThis.openPane) openPane('paneLayers');
      d.open = true; requestAnimationFrame(() => d.scrollIntoView({ block: 'start', behavior: 'smooth' })); };
    const k = $('kmlSrcBtn'); if (k) k.onclick = showSrc;
    const sb = $('shareBtn'), m = document.createElement('button'); m.type = 'button'; m.id = 'kmlSrcMenu'; m.textContent = 'KML sources'; m.title = 'Open data for the zone as KML: open a file on the city'; m.onclick = showSrc;
    if (sb) sb.after(m); else if ($('dViews')) $('dViews').appendChild(m); }
  globalThis.DocklandsKML = { open, openFiles, rebuild, sources, openSource, KS, exportView, currentView, goView, lonLatOf, loadUrl, frame, fitCam, show, emph, drawGL, after, get S() { return S; } };
  fromUrl();
}
