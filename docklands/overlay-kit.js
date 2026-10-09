// Shared parts of the data overlay layers of the Three.js port (layers/overlays.js, river.js, kml.js, locate.js): the
// WebGL page's overlay geometry (index.html beam, ovRibbon, ovFence, prism) in an rgba mesh builder; three TSL materials
// (solid: lit, a little self-light so it reads by night; glass: see-through, no depth write, dimmed to 0.5 by night;
// flat: ground ribbons lit like the ground); the tap rules of index.html (ovTapPoint: a point within 22 CSS px on screen
// wins; ovTapGround: the tap's ray meets the ground, then point in ring, holes out, by priority); HTML labels; a toast;
// geo() and its inverse. Skill: docklands-3d-page, "Three.js port" (overlays) and "Crown halo by date and overlays".
import * as THREE from 'three/webgpu';
import { attribute, vec3, float, sRGBTransferEOTF } from 'three/tsl';
import { U } from './materials.js';

export const FT2M = .3048;
export function geoOf(A) { const G = A.meta.geo; return (lon, lat) => { const a = lon - G.lon0, b = lat - G.lat0, t = [1, a, b, a * b, a * a, b * b]; return [t.reduce((s, v, i) => s + v * G.x[i], 0), t.reduce((s, v, i) => s + v * G.z[i], 0)]; }; }
export function lonLatOf(A, geo, x, z) {   // the inverse of geo() by Newton steps (kml-layer.js lonLatOf)
  const G = A.meta.geo; let lon = G.lon0 + (x - G.x[0]) / G.x[1], lat = G.lat0 + (z - G.z[0]) / G.z[2];
  for (let k = 0; k < 8; k++) { const [fx, fz] = geo(lon, lat), e = 1e-5, [ax, az] = geo(lon + e, lat), [bx, bz] = geo(lon, lat + e);
    const j00 = (ax - fx) / e, j01 = (bx - fx) / e, j10 = (az - fz) / e, j11 = (bz - fz) / e, det = j00 * j11 - j01 * j10, rx = x - fx, rz = z - fz;
    lon += (j11 * rx - j01 * rz) / det; lat += (-j10 * rx + j00 * rz) / det; if (Math.hypot(rx, rz) < 1e-4) break; }
  return [lon, lat];
}
export const inBoxOf = A => (x, z, m = 0) => { const E = A.meta.extent; return x >= E.x0 - m && x <= E.x1 + m && z >= E.z0 - m && z <= E.z1 + m; };
export const pointIn = (ring, x, z) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
export const bboxOf = ring => ring.reduce((b, [x, z]) => [Math.min(b[0], x), Math.min(b[1], z), Math.max(b[2], x), Math.max(b[3], z)], [1e9, 1e9, -1e9, -1e9]);
export const londonTime = iso => { try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; } };

// ---------- an rgba mesh builder (index.html Mesh with a per-vertex alpha)
export class RMesh {
  constructor() { this.p = []; this.c = []; this.idx = []; this.n = 0; }
  v(x, y, z, c, a = 1) { this.p.push(x, y, z); this.c.push(c[0], c[1], c[2], a); return this.n++; }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(p0, p1, p2, p3, col, a = 1) { const i = this.v(...p0, col, a), j = this.v(...p1, col, a), k = this.v(...p2, col, a), l = this.v(...p3, col, a); this.tri(i, j, k); this.tri(i, k, l); }
  geometry() {
    const G = new THREE.BufferGeometry();
    G.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    G.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 4));
    G.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    G.computeVertexNormals(); G.computeBoundingSphere(); G.computeBoundingBox(); return G;
  }
}
export function beam(M, a, b, w, h, col) {   // index.html beam: a box from a to b, w wide and h high
  const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, ox = -dz / l * w / 2, oz = dx / l * w / 2, H = h / 2;
  const P = (q, sx, sy) => [q[0] + ox * sx, q[1] + H * sy, q[2] + oz * sx];
  const a00 = P(a, -1, -1), a10 = P(a, 1, -1), a11 = P(a, 1, 1), a01 = P(a, -1, 1), b00 = P(b, -1, -1), b10 = P(b, 1, -1), b11 = P(b, 1, 1), b01 = P(b, -1, 1);
  M.quad(a01, b01, b11, a11, col); M.quad(a00, a10, b10, b00, col); M.quad(a00, b00, b01, a01, col); M.quad(a10, a11, b11, b10, col);
  M.quad(a00, a01, a11, a10, col); M.quad(b00, b10, b11, b01, col);
}
export const stick = (M, x, z, y0, y1, w, col) => beam(M, [x, y0, z], [x + .01, y1, z], w, w, col);
// a polyline (closed or not) as flat quads at y(x, z), only the segments with both ends inside keep(x, z)
export function ribbon(M, pts, w, col, y, closed, keep) {
  const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) { const p = pts[i], q = pts[(i + 1) % n]; if (keep && (!keep(p[0], p[1]) || !keep(q[0], q[1]))) continue; const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz); if (l < .01) continue;
    const ox = -dz / l * w / 2, oz = dx / l * w / 2, yp = y(p[0], p[1]), yq = y(q[0], q[1]);
    M.quad([p[0] - ox, yp, p[1] - oz], [p[0] + ox, yp, p[1] + oz], [q[0] + ox, yq, q[1] + oz], [q[0] - ox, yq, q[1] - oz], col); }
}
// see-through walls along a ring from y0(x, z) to y1(x, z) (alpha a at the top, a0 at the foot) and a bright strip at the top
export function fence(G, ring, y0, y1, col, a, strip, a0 = a, keep = null) {
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; if (keep && !(keep(p[0], p[1]) && keep(q[0], q[1]))) continue; const b0 = y0(p[0], p[1]), b1 = y0(q[0], q[1]), t0 = y1(p[0], p[1]), t1 = y1(q[0], q[1]);
    const v = [G.v(p[0], b0, p[1], col, a0), G.v(q[0], b1, q[1], col, a0), G.v(q[0], t1, q[1], col, a), G.v(p[0], t0, p[1], col, a)]; G.tri(v[0], v[1], v[2]); G.tri(v[0], v[2], v[3]);
    if (strip) G.quad([p[0], t0 - strip, p[1]], [q[0], t1 - strip, q[1]], [q[0], t1, q[1]], [p[0], t0, p[1]], col, .9); }
}
export function prismRing(M, ring, y0, y1, col, earcut) {   // a prism over a ring (walls and a lid)
  const f = ring.flat(), t = earcut(f, undefined, 2), base = M.n;
  for (const [x, z] of ring) M.v(x, y1, z, col); for (let k = 0; k < t.length; k += 3) M.tri(base + t[k], base + t[k + 2], base + t[k + 1]);
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; M.quad([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], col); }
}

// ---------- materials (TSL; colours are sRGB like the WebGL page's)
const rgb = () => sRGBTransferEOTF(attribute('color', 'vec4').xyz);
export function solidMaterial() {   // opaque: lit, with a little self-light so that the data stay readable by night
  const m = new THREE.MeshStandardNodeMaterial({ roughness: .75, metalness: 0, side: THREE.DoubleSide });
  m.colorNode = rgb(); m.emissiveNode = rgb().mul(float(.12).add(U.night.mul(.3))); return m;
}
export function glassMaterial() {   // see-through, no depth write, dimmed by night (index.html OV.glass: 0.5; here also the colour of the faint parts: an unlit tint over the dark night scene washed the Isle of Dogs pink)
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.colorNode = rgb().mul(float(1).sub(U.night.mul(.85).mul(float(1).sub(attribute('color', 'vec4').w))));   // faint walls fade most by night; the bright top strip (alpha 0.9) stays m.opacityNode = attribute('color', 'vec4').w.mul(float(1).sub(U.night.mul(.5))); return m;
}
export function flatMaterial() {   // ground ribbons, lit like the ground (index.html OV.flat)
  const m = new THREE.MeshStandardNodeMaterial({ roughness: .95, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 });
  m.colorNode = rgb(); m.emissiveNode = rgb().mul(U.night.mul(.05)); return m;   // 0.18 gave bright green bands (sRGB 54,109,66) at a night eye height of 7 m (2026-10-09)
}
export function tipMaterial() {   // the red lit tip of a crane (only by night)
  const m = new THREE.MeshBasicNodeMaterial(); m.colorNode = vec3(1, .1, .06).mul(float(1.5)); return m;
}
const MATS = {};
const mat = k => MATS[k] || (MATS[k] = { solid: solidMaterial, glass: glassMaterial, flat: flatMaterial, tips: tipMaterial }[k]());
// the builders of one data layer -> a Group (solid, glass, flat, tips); tips: [x, y, z] points, drawn by night only
export function buildGroup({ S, G, F, tips }, name) {
  const g = new THREE.Group(); g.name = name;
  const add = (M, k, order) => { if (!M || !M.n) return; const m = new THREE.Mesh(M.geometry(), mat(k)); m.name = name + ':' + k; if (order) m.renderOrder = order; m.castShadow = k === 'solid'; m.receiveShadow = k !== 'glass'; g.add(m); };
  add(S, 'solid'); add(F, 'flat'); add(G, 'glass', 12);
  if (tips && tips.length) { const T = new RMesh(); for (const [x, y, z] of tips) beam(T, [x - .9, y, z], [x + .9, y, z], 1.8, 1.8, [1, .1, .06]); const m = new THREE.Mesh(T.geometry(), mat('tips')); m.name = name + ':tips'; m.userData.nightOnly = true; g.add(m); }
  return g;
}
export function disposeGroup(g) { if (!g) return; g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); if (g.parent) g.parent.remove(g); }

// ---------- taps: index.html ovTapPoint (points within 22 CSS px win, as there they run before the building pick) and
// ovTapGround (the ground under the tap, polygons by priority; the building in front wins)
export function addTaps(ctx, sources) {   // sources(): [{ hits: [{ x, y, z, card }], polys: [{ ring, holes, bb, pri, card }] }] of the shown layers
  const { camera, renderer, groundAt } = ctx, v = new THREE.Vector3();
  const scr = p => { v.copy(p).project(camera); if (v.z > 1) return null; const c = renderer.domElement; return [(v.x + 1) / 2 * c.clientWidth, (1 - v.y) / 2 * c.clientHeight]; };
  ctx.addPick(rc => {
    const S = sources(); if (!S.length) return null; const R = rc.ray, tp = scr(R.origin.clone().addScaledVector(R.direction, 10)); if (!tp) return null;
    let best = null, bd = 22 * 22;
    for (const s of S) for (const o of s.hits || []) { v.set(o.x, o.y, o.z); const q = scr(v); if (!q) continue; const e = (q[0] - tp[0]) ** 2 + (q[1] - tp[1]) ** 2; if (e < bd) { bd = e; best = o; } }
    if (best) return { distance: 1e-3, open: best.card };
    const polys = S.flatMap(s => s.polys || []); if (!polys.length) return null;
    let g = 2, hit = null; const o = R.origin, d = R.direction;
    for (let k = 0; k < 3; k++) { if (Math.abs(d.y) < 1e-6) return null; const t = (g - o.y) / d.y; if (t <= 0) return null; hit = [o.x + d.x * t, o.z + d.z * t, t]; g = groundAt(hit[0], hit[1]); }
    const p = polys.slice().sort((a, b) => a.pri - b.pri).find(q => (!q.bb || (hit[0] >= q.bb[0] && hit[0] <= q.bb[2] && hit[1] >= q.bb[1] && hit[1] <= q.bb[3])) && pointIn(q.ring, hit[0], hit[1]) && !(q.holes || []).some(h => pointIn(h, hit[0], hit[1])));
    return p ? { distance: hit[2], open: p.card } : null;
  });
}

// ---------- HTML labels (the WebGL page's .lb buttons): placed each frame, nearest first, no overlaps
const LCSS = '.ovLab{position:absolute;left:0;top:0;padding:1px 6px;border-radius:4px;background:rgba(10,14,18,.72);color:#d8f3ff;border:1px solid #7fd6ff;font:12px system-ui,sans-serif;white-space:nowrap;pointer-events:auto;cursor:pointer;will-change:transform}';
export function makeLabels(ctx) {
  if (!document.getElementById('ovLabCss')) { const s = document.createElement('style'); s.id = 'ovLabCss'; s.textContent = LCSS; document.head.appendChild(s); }
  const host = document.getElementById('labels'), L = [], v = new THREE.Vector3();
  ctx.onFrame(() => {
    if (!L.length) return; const c = ctx.renderer.domElement, W = c.clientWidth, H = c.clientHeight, used = [], cam = ctx.camera.position;
    const on = !document.getElementById('showLabels') || document.getElementById('showLabels').checked;
    for (const l of L.slice().sort((a, b) => b.pri - a.pri || cam.distanceToSquared(a.v) - cam.distanceToSquared(b.v))) {
      v.copy(l.v).project(ctx.camera); const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H, w = l.el.offsetWidth || 80, r = [x - w / 2, y - 22, x + w / 2, y];
      const vis = on && l.shown() && v.z < 1 && x > 0 && x < W && y > 50 && y < H - 30 && !used.some(o => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]);
      if (vis) { used.push(r); l.el.style.transform = `translate(${x | 0}px,${y | 0}px) translate(-50%,-100%)`; }
      if (l.el.hidden === vis) l.el.hidden = !vis;
    }
  });
  return {
    add(name, x, y, z, pri, card, shown = () => true) { const el = document.createElement('button'); el.type = 'button'; el.className = 'ovLab'; el.textContent = String(name || '?'); el.onclick = card; el.hidden = true; host.appendChild(el); const l = { el, v: new THREE.Vector3(x, y, z), pri, shown }; L.push(l); return l; },
    clear(pred = () => true) { for (let i = L.length - 1; i >= 0; i--) if (pred(L[i])) { L[i].el.remove(); L.splice(i, 1); } },
    get n() { return L.length; },
  };
}

// ---------- a toast (bottom centre)
let toastEl = null, toastT = 0;
export function toast(html, ms = 4500) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.id = 'ovToast'; toastEl.setAttribute('role', 'status'); toastEl.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(64px + env(safe-area-inset-bottom,0px));max-width:min(460px,calc(100vw - 124px));background:rgba(16,20,24,.95);color:#e8ecef;border-radius:8px;padding:8px 12px;z-index:8;font-size:13px'; document.body.appendChild(toastEl); }
  toastEl.innerHTML = html; toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, ms); return toastEl;
}
// the falling sheet (reveal.js) for a part of a layer that has its own toggles (loadLayers calls it only for the menu row of a layer)
export function revealPart(ctx, object, label, draw2d, alive) { if (!object) return; import('./reveal.js').then(R => R.reveal(ctx, { object, label, draw2d, alive })).catch(e => console.warn('reveal', label, e)); }
// draw2d for the reveal sheet: the layer's ribbons and points from plain lists ([[x, z], ...] polylines with a CSS colour)
export function draw2dLines(list) {
  return (cx, toPx) => { cx.lineCap = 'round'; cx.lineJoin = 'round';
    for (const L of list) { if (L.pts.length < 2) { const [px, py] = toPx(L.pts[0][0], L.pts[0][1]); cx.fillStyle = L.col; cx.beginPath(); cx.arc(px, py, L.r || 5, 0, 7); cx.fill(); continue; }
      cx.strokeStyle = L.col; cx.lineWidth = L.w || 3; cx.beginPath(); L.pts.forEach(([x, z], i) => { const [px, py] = toPx(x, z); i ? cx.lineTo(px, py) : cx.moveTo(px, py); }); if (L.closed) cx.closePath(); cx.stroke(); } };
}
export const css3 = c => `rgb(${c.slice(0, 3).map(v => Math.round(Math.max(0, Math.min(1, v)) * 255)).join(',')})`;
