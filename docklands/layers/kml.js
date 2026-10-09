// My KML (layer "kml") of the Three.js port: the WebGL page's kml-layer.js. Open a .kml or .kmz from the file picker, a
// drop on the page or ?kml=<url> (same origin or CORS), or from the KML sources list (../cwplans/feeds/kml/catalogue.json,
// fetched when the list is first opened); draw its Placemarks; a card per feature; go to a KML Camera or LookAt; fly to
// fit; Show; "Export view as KML" (a download). Nothing is uploaded or stored. Parser and writer: the WebGL page's own
// kml.js (unchanged, imported). Drawing: lines and outlines are screen-space lines (LineSegments2 with Line2NodeMaterial,
// 2.5 CSS px with a 1.25 px dark halo drawn first), depth-tested against the buildings and 1 m above the ground; a clamped
// polygon fill is draped over the terrain cells (fill alpha held to 0.15 to 0.35), polygons in the air by earcut, extrude as
// walls; points are pins on a 2D canvas over the city, clustered in 48 px cells, with names. Show: lines grow and brighten,
// the file floats up, pins grow and jiggle, then all goes back. Not ported: the selected building in the export.
// Supported subset, limits and lessons: skill docklands-3d-page, "KML" and "Three.js port".
import { readKml, writeKml, download, isKmlName, isKmlType } from '../../cwplans/docklands/kml.js';
import { LineSegments2 } from 'three/addons/lines/webgpu/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { uniform, vec3 } from 'three/tsl';
import { RMesh, geoOf, lonLatOf, inBoxOf, pointIn, addTaps, toast, glassMaterial } from '../overlay-kit.js';

const LINE_PX = 2.5, HALO_PX = 1.25, PIN = 24, CLUSTER_PX = 48, SHOW_MS = 2200, SHOW_IN = 300, SHOW_OUT = 400;
const DEF = { line: [1, .8, 0, 1], poly: [1, .8, 0, .4], icon: [1, .8, 0, 1] };   // no style in the file: yellow, as in Google Earth
const R2D = 180 / Math.PI, D2R = Math.PI / 180;
const OPEN_CLASSES = new Set(['ogl', 'cc-by', 'odc-by', 'public-domain', 'cc0']);
const README = 'https://github.com/danbri/londat/blob/main/cwplans/feeds/kml/README.md';
const OSM_CREDIT = '© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)';
const WC = { on_site: [1, .55, .12, 1], approved_not_started: [.95, .86, .3, 1], completed_recently: [.45, .86, .6, 1], proposed: [.62, .72, .98, 1], commenced_stale: [.6, .6, .62, 1] };
let DRAW2D = { segs: [], pins: [] };   // for the reveal sheet

function vivid(c) {   // keep the file's hue, lift a dark colour until it reads on the dark map (relative luminance >= 0.42)
  let [r, g, b] = c; const Y = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
  for (let k = 0; k < 12 && Y(r, g, b) < .42; k++) { r += (1 - r) * .12; g += (1 - g) * .12; b += (1 - b) * .12; }
  return [r, g, b, c[3] == null ? 1 : c[3]];
}
function hueRot(c, a) { const k = 1 / Math.sqrt(3), co = Math.cos(a), si = Math.sin(a), d = (c[0] + c[1] + c[2]) * k * k * (1 - co); return [0, 1, 2].map(i => { const j = (i + 1) % 3, l = (i + 2) % 3; return Math.max(0, Math.min(1, c[i] * co + k * (c[l] - c[j]) * si + d)); }); }
const rgba = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
function pinPath(g, x, y, s) { const r = s * .34, cy = y - s + r; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x - r * .25, y - r * .9, x - r, cy + r * .75, x - r, cy); g.arc(x, cy, r, Math.PI, 0); g.bezierCurveTo(x + r, cy + r * .75, x + r * .25, y - r * .9, x, y); g.closePath(); return cy; }
const E = (tag, props = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(props)) if (k === 'text') e.textContent = v; else if (k === 'on') e.onclick = v; else e.setAttribute(k, v); for (const c of kids) if (c) e.append(c); return e; };

export default {
  id: 'kml', label: 'My KML', on: true,
  draw2d(cx, toPx) {   // the reveal sheet: the file's lines, then its pins
    cx.lineCap = cx.lineJoin = 'round';
    for (const s of DRAW2D.segs) { cx.strokeStyle = s.css; cx.lineWidth = 4; cx.beginPath(); const a = toPx(s.a[0], s.a[2]), b = toPx(s.b[0], s.b[2]); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.stroke(); }
    for (const p of DRAW2D.pins) { const [x, y] = toPx(p.x, p.z); cx.fillStyle = rgba(p.col); cx.beginPath(); cx.arc(x, y, 7, 0, 7); cx.fill(); }
  },
  async init(ctx) {
    const { THREE, A, camera, controls, renderer, groundAt, draw, scene, esc } = ctx, geo = geoOf(A), inBox = inBoxOf(A), earcut = globalThis.earcut && (globalThis.earcut.default || globalThis.earcut);
    const CW = ctx.WEBGL.replace(/docklands\/$/, ''), D3 = () => globalThis.__docklands3;
    let revealed = false, rootOn = true;
    const S = { files: [], seq: 0, hits: [], polys: [], pins: [], names: [], cl: new Map(), vis: {}, n: {}, fly: 0, show: null };
    const root = new THREE.Group(); root.name = 'kml'; scene.add(root);
    const uGrow = uniform(1), uBright = uniform(1);
    const heightAt = (x, z, alt, mode, lift) => mode === 'absolute' ? alt : /^relativeTo/.test(mode || '') ? groundAt(x, z) + (alt || 0) : groundAt(x, z) + lift;
    function clipSeg(a, b) {   // Liang-Barsky: the part of a segment inside the model box, or null
      const Ex = A.meta.extent, d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; let t0 = 0, t1 = 1;
      for (const [p, q] of [[-d[0], a[0] - Ex.x0], [d[0], Ex.x1 - a[0]], [-d[2], a[2] - Ex.z0], [d[2], Ex.z1 - a[2]]]) {
        if (p === 0) { if (q < 0) return null; continue; } const r = q / p; if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; } }
      const at = t => [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t]; return t1 - t0 > 1e-9 ? [at(t0), at(t1)] : null;
    }
    // ---------- geometry of one feature (kml-layer.js featureMesh): segments into L, fills and walls into MA
    function lineOn(L, pts, col, clamp, st) {
      const c = vivid(col), lin = [0, 1, 2].map(i => c[i] <= .04045 ? c[i] / 12.92 : ((c[i] + .055) / 1.055) ** 2.4);   // Line2 takes linear colours
      for (let i = 1; i < pts.length; i++) {
        let a = pts[i - 1], b = pts[i]; if (!inBox(a[0], a[2]) || !inBox(b[0], b[2])) { const cc = clipSeg(a, b); st.clipped = true; if (!cc) continue; [a, b] = cc; }
        const Ln = Math.hypot(b[0] - a[0], b[2] - a[2]), n = clamp ? Math.max(1, Math.ceil(Ln / 30)) : 1; let p = clamp ? [a[0], groundAt(a[0], a[2]) + 1, a[2]] : a;
        for (let k = 1; k <= n; k++) { const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t, q = [x, clamp ? groundAt(x, z) + 1 : a[1] + (b[1] - a[1]) * t, z];
          L.pos.push(...p, ...q); L.col.push(lin[0], lin[1], lin[2], lin[0], lin[1], lin[2]); L.srgb.push(c); st.box(p[0], p[2]); p = q; }
        st.box(b[0], b[2]); st.drawn = true;
      }
    }
    function earcutFill(M, rings, yOf, col) {
      const flat = [], holes = [], ys = [];
      for (const r of rings) { if (flat.length) holes.push(flat.length / 2); for (const [x, z, a] of r) { flat.push(x, z); ys.push(yOf(x, z, a)); } }
      const t = earcut(flat, holes.length ? holes : undefined, 2), base = M.n;
      for (let i = 0; i < ys.length; i++) M.v(flat[2 * i], ys[i], flat[2 * i + 1], col, col[3]);
      for (let k = 0; k < t.length; k += 3) M.tri(base + t[k], base + t[k + 1], base + t[k + 2]);
    }
    function featureMesh(f, L, MA, st) {
      const sty = f.style, set = sty.set || {}, lineCol = set.line ? sty.line : DEF.line, polyCol = set.poly ? sty.poly : DEF.poly, iconCol = set.icon ? sty.icon : DEF.icon;
      for (const g of f.geoms) {
        const mode = g.altitudeMode || 'clampToGround', clamp = !/^(absolute|relativeTo)/.test(mode);
        if (g.type === 'Point') {
          const [x, z] = geo(g.coords[0], g.coords[1]); if (!inBox(x, z)) { st.clipped = true; continue; }
          const gy = groundAt(x, z), y = clamp ? gy : heightAt(x, z, g.coords[2], mode, 0);
          st.pins.push({ x, y, z, gy, col: vivid(iconCol), sc: Math.max(.8, Math.min(1.4, sty.scale || 1)) }); st.box(x, z); st.drawn = true; st.anchor = st.anchor || [x, y, z];
        } else if (g.type === 'LineString') {
          const pts = g.coords.map(c => { const [x, z] = geo(c[0], c[1]); return [x, heightAt(x, z, c[2], mode, 1), z]; });
          lineOn(L, pts, lineCol.slice(0, 3), clamp, st);
          if (g.extrude && !clamp) for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if (!inBox(a[0], a[2]) || !inBox(b[0], b[2])) continue;
            MA.quad([a[0], groundAt(a[0], a[2]), a[2]], [b[0], groundAt(b[0], b[2]), b[2]], b, a, lineCol, .35); }
          const m = pts[pts.length >> 1]; if (inBox(m[0], m[2])) st.anchor = st.anchor || [m[0], m[1] + 4, m[2]];
        } else if (g.type === 'Polygon') {
          const rings = g.rings.map(r => r.map(c => { const [x, z] = geo(c[0], c[1]); return [x, z, c[2]]; })), outer = rings[0], holes = rings.slice(1);
          if (!outer.some(p => inBox(p[0], p[1]))) { st.clipped = true; continue; }
          if (!rings.every(r => r.every(p => inBox(p[0], p[1])))) st.clipped = true;
          const bb = outer.reduce((b, [x, z]) => [Math.min(b[0], x), Math.min(b[1], z), Math.max(b[2], x), Math.max(b[3], z)], [1e9, 1e9, -1e9, -1e9]);
          const r2 = r => r.map(p => [p[0], p[1]]), fc = [...polyCol.slice(0, 3), Math.max(.15, Math.min(.35, polyCol[3]))];
          if (sty.fill !== false) {
            if (clamp) {   // draped: every terrain cell whose centre is inside (holes out); a shape smaller than a cell by earcut
              const T = A.terrain, i0 = Math.max(0, Math.floor((bb[0] - T.x0) / T.cell)), i1 = Math.min(T.nx - 2, Math.ceil((bb[2] - T.x0) / T.cell)), j0 = Math.max(0, Math.floor((bb[1] - T.z0) / T.cell)), j1 = Math.min(T.nz - 2, Math.ceil((bb[3] - T.z0) / T.cell)); let cells = 0;
              const H = (i, j) => T.dm[j * T.nx + i] / 10 + .8, P = (i, j) => [T.x0 + i * T.cell, H(i, j), T.z0 + j * T.cell], R0 = r2(outer), RH = holes.map(r2);
              for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const cx = T.x0 + (i + .5) * T.cell, cz = T.z0 + (j + .5) * T.cell;
                if (!pointIn(R0, cx, cz) || RH.some(h => pointIn(h, cx, cz))) continue; MA.quad(P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j), fc, fc[3]); cells++; }
              if (!cells) earcutFill(MA, rings, (x, z) => groundAt(x, z) + .8, fc);
            } else earcutFill(MA, rings, (x, z, a) => heightAt(x, z, a, mode, 0), fc);
          }
          if (sty.outline !== false || sty.fill === false) for (const r of rings) { const pts = r.map(([x, z, a]) => [x, clamp ? groundAt(x, z) + 1 : heightAt(x, z, a, mode, 0), z]); if (pts.length > 1) pts.push(pts[0]); lineOn(L, pts, lineCol.slice(0, 3), clamp, st); }
          if (g.extrude && !clamp) for (const r of rings) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; if (!inBox(a[0], a[1]) || !inBox(b[0], b[1])) continue;
            MA.quad([a[0], groundAt(a[0], a[1]), a[1]], [b[0], groundAt(b[0], b[1]), b[1]], [b[0], heightAt(b[0], b[1], b[2], mode, 0), b[1]], [a[0], heightAt(a[0], a[1], a[2], mode, 0), a[1]], polyCol, Math.max(.25, polyCol[3])); }
          st.drawn = true; for (const p of outer) if (inBox(p[0], p[1])) st.box(p[0], p[1]);
          const c = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], cy = clamp ? groundAt(c[0], c[1]) : heightAt(c[0], c[1], outer[0][2], mode, 0);
          if (inBox(c[0], c[1])) st.anchor = st.anchor || [c[0], cy + 3, c[1]];
          st.polys.push({ ring: r2(outer), holes: holes.map(r2), bb });
        }
      }
    }
    // ---------- materials: screen-space lines (halo first, then the core), see-through fills
    const pr = () => renderer.getPixelRatio();
    const lineMat = halo => { const m = new THREE.Line2NodeMaterial({ vertexColors: !halo, linewidth: 1, worldUnits: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
      m.colorNode = halo ? vec3(.03, .04, .05) : vec3(1, 1, 1).mul(uBright); return m; };
    const coreMat = lineMat(false), haloMat = lineMat(true), fillMat = glassMaterial();
    ctx.onFrame(() => { const k = pr() * uGrow.value; coreMat.linewidth = LINE_PX * k; haloMat.linewidth = (LINE_PX + 2 * HALO_PX) * k; });

    function rebuild() {
      for (const o of [...root.children]) { o.geometry.dispose(); root.remove(o); }
      S.hits = []; S.polys = []; S.pins = []; S.names = []; S.cl = new Map(); DRAW2D = { segs: [], pins: [] };
      const n = { files: 0, features: 0, drawn: 0, clipped: 0, outside: 0, hidden: 0, segments: 0 };
      for (const F of S.files) { if (!F.on) continue; n.files++;
        const L = { pos: [], col: [], srgb: [] }, MA = new RMesh(); F.n = { drawn: 0, clipped: 0, outside: 0, hidden: 0 }; F.bb = [1e9, 1e9, -1e9, -1e9];
        F.doc.features.forEach(f => {
          if (f.removed) return; n.features++; if (!f.visible) { F.n.hidden++; return; }
          const st = { drawn: false, clipped: false, anchor: null, polys: [], pins: [], bb: [1e9, 1e9, -1e9, -1e9] };
          st.box = (x, z) => { const b = st.bb; if (x < b[0]) b[0] = x; if (z < b[1]) b[1] = z; if (x > b[2]) b[2] = x; if (z > b[3]) b[3] = z; };
          featureMesh(f, L, MA, st);
          if (!st.drawn) { F.n.outside++; return; } F.n.drawn++; if (st.clipped) F.n.clipped++;
          f.bb = st.bb; F.bb = [Math.min(F.bb[0], st.bb[0]), Math.min(F.bb[1], st.bb[1]), Math.max(F.bb[2], st.bb[2]), Math.max(F.bb[3], st.bb[3])];
          const cd = () => featureCard(F, f);
          for (const p of st.pins) S.pins.push({ ...p, F, f, name: f.name ? String(f.name).slice(0, 48) : '' });
          if (st.anchor) S.hits.push({ x: st.anchor[0], y: st.anchor[1], z: st.anchor[2], card: st.pins.length ? () => tapPin(F, f) : cd });
          for (const p of st.polys) S.polys.push({ ...p, pri: -1, card: cd });
          if (f.name && st.anchor && !st.pins.length) S.names.push({ x: st.anchor[0], y: st.anchor[1], z: st.anchor[2], name: String(f.name).slice(0, 48), F });
        });
        for (const k of ['drawn', 'clipped', 'outside', 'hidden']) n[k] += F.n[k];
        const g = new THREE.Group(); g.userData.F = F; F.group = g;
        if (L.pos.length) { n.segments += L.pos.length / 6;
          for (let i = 0; i < L.pos.length; i += 6) DRAW2D.segs.push({ a: L.pos.slice(i, i + 3), b: L.pos.slice(i + 3, i + 6), css: rgba(L.srgb[i / 6]) });
          const G = new LineSegmentsGeometry(); G.setPositions(L.pos); G.setColors(L.col);
          const h = new LineSegments2(G, haloMat), c = new LineSegments2(G, coreMat); h.renderOrder = 14; c.renderOrder = 15; h.frustumCulled = c.frustumCulled = false; g.add(h, c); }
        if (MA.n) { const m = new THREE.Mesh(MA.geometry(), fillMat); m.renderOrder = 13; g.add(m); }
        root.add(g);
      }
      for (const p of S.pins) DRAW2D.pins.push(p);
      S.n = n; list(); draw();
    }

    // ---------- Show (kml-layer.js emph): time-based, ends exactly as before
    function emph(F, now = performance.now()) {
      const X = S.show; if (!X || X.F !== F) return null; const t = now - X.t0; if (t >= X.ms) return null;
      const sm = k => k * k * (3 - 2 * k), k = t < SHOW_IN ? sm(t / SHOW_IN) : t > X.ms - SHOW_OUT ? Math.pow((X.ms - t) / SHOW_OUT, 3) : 1;
      if (X.reduce) return { e: k, grow: 1 + .6 * k, hue: 0, lift: 0, jig: 0, white: .45 * k };
      return { e: k, grow: 1 + 1.6 * k, hue: k * t / 1000 * 2 * Math.PI * .9, lift: k * Math.max(60, Math.min(150, camera.position.distanceTo(controls.target) * .012)), jig: k * 3 * Math.sin(t / 1000 * 2 * Math.PI * 3.5), white: 0 };
    }
    function show(F) {
      if (!F || !F.on) return; const reduce = !!(globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
      S.show = { F, t0: performance.now(), ms: reduce ? 1200 : SHOW_MS, reduce }; const id = S.show;
      const tick = () => { if (S.show !== id) return; if (performance.now() - id.t0 >= id.ms) { S.show = null; for (const g of root.children) g.position.y = 0; uGrow.value = 1; uBright.value = 1; draw(); return; } draw(); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }
    ctx.onFrame(() => {   // Show on the 3D parts: one file at a time; the lines of the others keep their width (uGrow is shared, so it is applied only while a file is shown)
      const X = S.show && emph(S.show.F); for (const g of root.children) g.position.y = X && g.userData.F === S.show.F ? X.lift : 0;
      uGrow.value = X ? X.grow : 1; uBright.value = X ? 1 + (X.white || .25 * X.e) * 1.5 : 1;
    });

    // ---------- pins, clusters and names on a 2D canvas over the city
    const ov = document.createElement('canvas'); ov.id = 'kmlOv'; ov.setAttribute('aria-hidden', 'true'); ov.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';
    document.getElementById('view').after(ov);
    const v3 = new THREE.Vector3();
    ctx.onFrame(() => {
      const has = rootOn && (S.pins.length || S.names.length);
      if (!has) { if (ov.width) { ov.width = 0; ov.height = 0; } S.vis = { pins: 0, clusters: 0, names: 0 }; return; }
      camera.updateMatrixWorld();
      const dpr = devicePixelRatio || 1, W = innerWidth, H = innerHeight;
      if (ov.width !== Math.round(W * dpr) || ov.height !== Math.round(H * dpr)) { ov.width = Math.round(W * dpr); ov.height = Math.round(H * dpr); }
      const g = ov.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      const proj = (x, y, z) => { v3.set(x, y, z).project(camera); if (v3.z > 1 || v3.z < -1) return null; return [(v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H]; };
      const bins = new Map(); S.cl = new Map(); let onScreen = 0; const now = performance.now(), EM = new Map(S.files.map(F => [F, emph(F, now)]));
      const look = (p, X) => X ? { col: X.white ? p.col.map((v, i) => i < 3 ? v + (1 - v) * X.white : v) : [...hueRot(p.col, X.hue), 1], sc: p.sc * X.grow } : p;
      for (const p of S.pins) { const X = EM.get(p.F), q = proj(p.x, p.y + (X ? X.lift : 0), p.z); if (q && X) q[0] += X.jig; if (!q || q[0] < -20 || q[0] > W + 20 || q[1] < -4 || q[1] > H + PIN) continue; onScreen++;
        const k = p.F.id + ':' + Math.floor(q[0] / CLUSTER_PX) + ':' + Math.floor(q[1] / CLUSTER_PX); let b = bins.get(k); if (!b) bins.set(k, b = { m: [], sx: 0, sy: 0 }); b.m.push([p, q]); b.sx += q[0]; b.sy += q[1]; }
      const singles = [], clusters = [];
      for (const b of bins.values()) { if (b.m.length === 1) singles.push(b.m[0]); else { const X = EM.get(b.m[0][0].F), cl = { n: b.m.length, x: b.sx / b.m.length, y: b.sy / b.m.length, col: look(b.m[0][0], X).col, g: X ? X.grow : 1, m: b.m.map(e => e[0]) }; clusters.push(cl); for (const [p] of b.m) S.cl.set(p.f, cl); } }
      g.lineJoin = 'round';
      for (const [p, q] of singles) { const X = EM.get(p.F); if (Math.abs(p.y + (X ? X.lift : 0) - p.gy) <= 2) continue; const q0 = proj(p.x, p.gy, p.z); if (!q0) continue; g.strokeStyle = '#ffffffb0'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q[0], q[1]); g.stroke(); }
      for (const [p0, q] of singles) { const p = look(p0, EM.get(p0.F)), s = PIN * p.sc, cy = pinPath(g, q[0], q[1], s);
        g.lineWidth = 3.5; g.strokeStyle = 'rgba(6,8,11,.85)'; g.stroke(); g.fillStyle = rgba(p.col); g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.stroke();
        g.beginPath(); g.arc(q[0], cy, s * .11, 0, 7); g.fillStyle = 'rgba(6,8,11,.8)'; g.fill(); }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const cl of clusters) { const r = Math.min(16, 9 + 1.5 * Math.log2(cl.n)) * cl.g;
        g.beginPath(); g.arc(cl.x, cl.y, r + 1.75, 0, 7); g.fillStyle = 'rgba(6,8,11,.85)'; g.fill();
        g.beginPath(); g.arc(cl.x, cl.y, r, 0, 7); g.fillStyle = rgba(cl.col); g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
        const Y = .2126 * cl.col[0] + .7152 * cl.col[1] + .0722 * cl.col[2]; g.fillStyle = Y > .55 ? '#0b0e12' : '#fff'; g.font = `700 ${cl.n > 99 ? 10 : 11}px system-ui,sans-serif`; g.fillText(cl.n > 9999 ? '9k+' : String(cl.n), cl.x, cl.y + .5); }
      let nn = 0; const lab = document.getElementById('showLabels');
      if (!lab || lab.checked) {
        const placed = clusters.map(cl => [cl.x - 22, cl.y - 22, cl.x + 22, cl.y + 22]).concat(singles.map(([p, q]) => [q[0] - 9, q[1] - PIN * p.sc, q[0] + 9, q[1]]));
        const free = r => r[0] > 2 && r[2] < W - 2 && r[1] > 60 && r[3] < H - 50 && !placed.some(o => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]);
        g.font = '600 12px system-ui,sans-serif'; g.textAlign = 'left'; g.lineWidth = 3; g.strokeStyle = 'rgba(6,8,11,.9)'; g.fillStyle = '#fff';
        const text = (t, x, y) => { g.strokeText(t, x, y); g.fillText(t, x, y); nn++; };
        if (singles.length <= 40) for (const [p, q] of singles) { if (!p.name) continue; const tw = g.measureText(p.name).width, r = [q[0] + 10, q[1] - PIN * p.sc * .7 - 8, q[0] + 14 + tw, q[1] - PIN * p.sc * .7 + 8]; if (free(r)) { placed.push(r); text(p.name, r[0] + 2, (r[1] + r[3]) / 2); } }
        let ln = 0; g.textAlign = 'center';
        for (const l of S.names) { if (ln >= 40) break; const X = EM.get(l.F), q = proj(l.x, l.y + (X ? X.lift : 0), l.z); if (!q) continue; const tw = g.measureText(l.name).width, r = [q[0] - tw / 2 - 3, q[1] - 9, q[0] + tw / 2 + 3, q[1] + 9]; if (free(r)) { placed.push(r); text(l.name, q[0], q[1]); ln++; } }
      }
      S.vis = { pins: singles.length, clusters: clusters.length, onScreen, names: nn };
    });
    addTaps(ctx, () => rootOn && S.files.some(F => F.on) ? [{ hits: S.hits, polys: S.polys }] : []);

    // ---------- cards (every text from the file goes in with textContent)
    function cardBox() { ctx.showCard('<div id="kmlCard"></div>'); return document.getElementById('kmlCard'); }
    function featureCard(F, f) {
      const box = cardBox();
      box.append(E('h2', { text: f.name || '(no name)' }), E('p', { class: 'small', text: `My KML · ${F.name}${f.path.length ? ' · ' + f.path.join(' / ') : ''}` }));
      if (f.snippet && f.snippet !== f.description) box.append(E('p', { class: 'small', text: f.snippet }));
      if (f.description) box.append(E('p', { class: 'small', style: 'white-space:pre-wrap;overflow-wrap:anywhere', text: f.description }));
      if (f.address) box.append(E('p', { class: 'small', text: 'Address: ' + f.address }));
      if (f.extended.length) { const t = E('table', { class: 'small' }); for (const [k, v] of f.extended) t.append(E('tr', {}, E('td', { text: k, style: 'vertical-align:top;padding-right:8px;color:#aab' }), E('td', { text: v, style: 'overflow-wrap:anywhere' }))); box.append(t); }
      const kinds = f.geoms.map(g => g.type + (g.type === 'Polygon' && g.rings.length > 1 ? ` with ${g.rings.length - 1} hole${g.rings.length > 2 ? 's' : ''}` : '') + (g.altitudeMode && g.altitudeMode !== 'clampToGround' ? ` (${g.altitudeMode})` : '')).join(', ');
      box.append(E('p', { class: 'small', text: `${kinds}. From your file "${F.file}": shown only in this browser, not uploaded.` }));
      const row = E('p', {});
      if (f.view) row.append(E('button', { type: 'button', text: 'Go to view', on: () => goView(f.view) }), ' ');
      row.append(E('button', { type: 'button', text: 'Remove this feature', on: () => { f.removed = true; ctx.showCard('<p class="small">Removed from My KML.</p>'); rebuild(); } }));
      box.append(row);
    }
    function tapPin(F, f) {
      const cl = S.cl.get(f); if (!cl) return featureCard(F, f);
      const b = cl.m.reduce((b, p) => [Math.min(b[0], p.x), Math.min(b[1], p.z), Math.max(b[2], p.x), Math.max(b[3], p.z)], [1e9, 1e9, -1e9, -1e9]);
      if (Math.hypot(b[2] - b[0], b[3] - b[1]) > 25 && camera.position.distanceTo(controls.target) > 200) return flyFit(b, { min: 120 });
      const box = cardBox(); box.append(E('h2', { text: `${cl.n} places here` }), E('p', { class: 'small', text: `My KML · ${F.name}` }));
      const ul = E('p', {}); for (const p of cl.m.slice(0, 60)) ul.append(E('button', { type: 'button', style: 'margin:2px', text: p.name || '(no name)', on: () => featureCard(p.F, p.f) })); box.append(ul);
    }

    // ---------- camera: the page's (target, yaw, pitch, dist); KML Camera / LookAt to it and back
    const camNow = () => { const c = D3().camState(); return c; };
    // vertical exaggeration (main.js setVz): c.ty is in model metres; the orbit is in the exaggerated space (ty x vz), as
    // main.js setCam and the WebGL page's T = (tx, ty x VZ, tz)
    const VZ = () => ctx.vzNow ? ctx.vzNow() : 1;
    function applyCam(c) {   // as main.js setCam, without the resize (used every frame of a flight)
      const ce = Math.cos(c.pitch), ty = (c.ty || 0) * VZ(); controls.target.set(c.tx, ty, c.tz);
      camera.position.set(c.tx + c.dist * Math.sin(c.yaw) * ce, ty + c.dist * Math.sin(c.pitch), c.tz + c.dist * Math.cos(c.yaw) * ce); controls.update(); draw();
    }
    function goView(v) {
      S.fly++; const [x, z] = geo(v.lon, v.lat);
      const alt = v.altitudeMode === 'absolute' ? v.alt : /^relativeTo/.test(v.altitudeMode) ? groundAt(x, z) + v.alt : groundAt(x, z) + (v.type === 'Camera' ? Math.max(1.6, v.alt || 0) : 0);
      let c;
      if (v.type === 'LookAt') c = { tx: x, ty: alt, tz: z, yaw: -v.heading * D2R, pitch: Math.max(.02, Math.min(1.5695, (90 - v.tilt) * D2R)), dist: Math.max(80, Math.min(16000, v.range || 1000)) };
      else { const a = v.heading * D2R, p = (v.tilt - 90) * D2R, D = 1200; c = { tx: x + D * Math.sin(a) * Math.cos(p), ty: alt + D * Math.sin(p) / VZ(), tz: z - D * Math.cos(a) * Math.cos(p), yaw: -a, pitch: Math.max(-1.5695, Math.min(1.5695, -p)), dist: D }; }
      if (Number.isFinite(v.horizFov) && v.horizFov > 1 && v.horizFov < 170) c.hfov = v.horizFov * D2R; else if (v.type === 'Camera') c.hfov = 60 * D2R;
      D3().setCam(c);
    }
    function currentView() {   // the camera as drawn: eye in m OD, heading from north, tilt from straight down, horizontal field
      const v = VZ(), e = { x: camera.position.x, y: camera.position.y / v, z: camera.position.z }, t = controls.target, d = [t.x - e.x, t.y / v - e.y, t.z - e.z], [lon, lat] = lonLatOf(A, geo, e.x, e.z);   // model metres (kml-layer.js currentView: K.eye / VZ)
      const heading = ((Math.atan2(d[0], -d[2]) * R2D) % 360 + 360) % 360, tilt = 90 + Math.atan2(d[1], Math.hypot(d[0], d[2])) * R2D;
      return { type: 'Camera', lon, lat, alt: e.y, heading, tilt, roll: 0, altitudeMode: 'absolute', horizFov: 2 * Math.atan(Math.tan(camera.fov * D2R / 2) * camera.aspect) * R2D };
    }
    function fitCam(b, o = {}) {   // a camera that shows a box (x0, z0, x1, z1) inside the screen (pads: 16 px sides, 12 % top, 13 % bottom); pitch .95 on a tall screen, .72 on a wide one
      const W = innerWidth, H = innerHeight, asp = W / H, c0 = camNow(), yaw = o.yaw ?? c0.yaw, pitch = Math.max(asp < .8 ? .95 : .72, Math.min(1.25, c0.pitch));
      const pad = [16, Math.min(90, H * .12), 16, Math.min(100, H * .13)], pts = [];
      const v = VZ();   // the clone has no vz wrapper: shoot in the exaggerated space (kml-layer.js fitCam: T = (tx, ty x VZ, tz))
      for (const x of [b[0], b[2]]) for (const z of [b[1], b[3]]) pts.push(new THREE.Vector3(x, groundAt(x, z) * v, z));
      const cam = camera.clone(); cam.aspect = asp; cam.updateProjectionMatrix();
      let tx = (b[0] + b[2]) / 2, tz = (b[1] + b[3]) / 2;
      const shot = (d) => { const ty = groundAt(tx, tz) * v, ce = Math.cos(pitch); cam.position.set(tx + d * Math.sin(yaw) * ce, ty + d * Math.sin(pitch), tz + d * Math.cos(yaw) * ce); cam.up.set(0, 1, 0); cam.lookAt(tx, ty, tz); cam.updateMatrixWorld();
        return pts.map(p => { const q = p.clone().project(cam); return q.z > 1 ? null : [(q.x + 1) / 2 * W, (1 - q.y) / 2 * H]; }); };
      const fits = d => shot(d).every(q => q && q[0] >= pad[0] && q[0] <= W - pad[2] && q[1] >= pad[1] && q[1] <= H - pad[3]);
      const lo0 = o.min || 150; let lo = lo0, hi = 40000; if (fits(lo)) hi = lo; else for (let k = 0; k < 24; k++) { const m = Math.sqrt(lo * hi); if (fits(m)) hi = m; else lo = m; }
      return { tx, ty: groundAt(tx, tz), tz, yaw, pitch, dist: Math.max(lo0, Math.min(16000, hi)), need: hi };
    }
    function flyCam(to, ms = 900, done) {
      const s0 = camNow(), t0 = performance.now(), id = ++S.fly; let dy = to.yaw - s0.yaw; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
      const reduce = globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches, ld = Math.log(s0.dist);
      const step = now => { if (S.fly !== id) return; const t = reduce ? 1 : Math.min(1, (now - t0) / ms), k = t * t * (3 - 2 * t);
        applyCam({ tx: s0.tx + (to.tx - s0.tx) * k, ty: s0.ty + (to.ty - s0.ty) * k, tz: s0.tz + (to.tz - s0.tz) * k, yaw: s0.yaw + dy * k, pitch: s0.pitch + (to.pitch - s0.pitch) * k, dist: Math.exp(ld + (Math.log(to.dist) - ld) * k) });
        if (t < 1) requestAnimationFrame(step); else { S.fly++; if (done) done(); } };
      requestAnimationFrame(step); return to;
    }
    renderer.domElement.addEventListener('pointerdown', () => { S.fly++; }, true); renderer.domElement.addEventListener('wheel', () => { S.fly++; }, { capture: true, passive: true });
    function flyFit(b, o, done) { if (!b || b[0] > b[2]) return false; const m = 20; return flyCam(fitCam([b[0] - m, b[1] - m, b[2] + m, b[3] + m], o), 900, done); }
    function frame(F, done) { if (!F.bb || F.bb[0] > F.bb[2]) return false; return flyFit(F.bb, { min: F.n && F.n.drawn === 1 && F.bb[2] - F.bb[0] < 50 ? 400 : 150 }, done); }
    function onScreen(F) { const b = F.bb; if (!b || b[0] > b[2]) return false; camera.updateMatrixWorld();
      return [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]], [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]].some(([x, z]) => { v3.set(x, groundAt(x, z), z).project(camera); return v3.z < 1 && Math.abs(v3.x) < 1 && Math.abs(v3.y) < 1; }); }
    function showOrFly(F) { if (!F.on) { F.on = true; rebuild(); } if (onScreen(F)) show(F); else frame(F, () => show(F)) || toast('Nothing of this file is inside the model.'); }

    // ---------- import
    async function open(src, name, how) {
      try {
        const doc = await readKml(src, name), F = { id: ++S.seq, name: doc.name || name, file: name, doc, on: true, how };
        S.files.push(F); rebuild();
        const v = doc.view || (doc.features.length === 1 && doc.features[0].view);
        const first = !revealed; revealed = true;
        if (v) { goView(v); show(F); } else frame(F, () => show(F));
        if (first && F.group) import('../reveal.js').then(R => R.reveal(ctx, { object: root, label: 'My KML', draw2d: mod.draw2d, alive: () => rootOn && S.files.some(F2 => F2.on) })).catch(() => {});
        const short = F.name.length > 34 ? F.name.slice(0, 32).replace(/\s+\S*$/, '') + '…' : F.name, d = F.n.drawn, out = doc.features.length - d - F.n.hidden;
        const t = toast(esc(d ? `${short}: ${d.toLocaleString('en-GB')} shown${out > 0 ? `, ${out.toLocaleString('en-GB')} outside the model` : ''}${v ? ' (the file’s own view)' : ''}.` : `${short}: nothing inside the model.`));
        if (d) t.append(' ', E('button', { type: 'button', text: 'Show', on: () => showOrFly(F) }));
        return F;
      } catch (e) { toast(esc(`${name}: not opened (${e.message})`)); console.warn('KML', name, e); return null; }
    }
    async function openFiles(files, how) { const out = []; for (const f of files) if (isKmlName(f.name) || isKmlType(f.type)) out.push(await open(f, f.name, how)); return out; }
    async function loadUrl(u) {
      try { const url = new URL(u, location.href); if (!/^https?:$/.test(url.protocol)) throw new Error('only http(s) addresses');
        const r = await fetch(url, { credentials: 'omit' }); if (!r.ok) throw new Error('HTTP ' + r.status);
        return await open(await r.arrayBuffer(), decodeURIComponent(url.pathname.split('/').pop() || 'KML'), 'url'); }
      catch (e) { toast(esc(`The KML link did not load (${e.message}). The server must allow this site to read it (CORS).`)); return null; }
    }

    // ---------- export (kml-layer.js exportView; the selected building is not exported here)
    const RIVER = { rbus: [['bus', i => i.kind === 'pier']], rlocks: [['locks', () => true]], rpla: [['pla', () => true]], rswim: [['eden', () => true], ['royal', () => true]],
      rmoor: [['osm', i => /^(mooring|houseboat)$/.test(i.kind)], ['moor', () => true]], rships: [['wd', () => true], ['osm', i => i.kind === 'ship']] };
    function exportView() {
      const v = currentView(), credits = new Set(), folders = [], now = new Date(), osm = { used: false };
      const O = ctx.overlays, works = O && O.parts.works.on ? O.parts.works.d : null;
      if (works) {
        const pms = [];
        for (const s of works.sites) { const fp = s.footprint, ring = fp && fp.ring_wgs84; if (!WC[s.status] || !ring || ring.length < 3) continue; const [cx, cz] = geo(s.position.lon, s.position.lat); if (!inBox(cx, cz)) continue;
          const fromOsm = /\bOSM\b|OpenStreetMap/i.test(fp.from || ''); if (fromOsm) osm.used = true;
          pms.push({ name: s.name || s.id, style: { line: WC[s.status], width: 2, poly: [...WC[s.status].slice(0, 3), .3] },
            extended: [['id', s.id], ['status', s.status], ['status rule', s.status_rule], ['status confidence', s.status_confidence], ['address', s.address], ['borough', s.borough],
              ['decision', s.dates && s.dates.decision], ['commenced', s.dates && s.dates.commenced], ['completed', s.dates && s.dates.completed], ['dates from', s.dates && s.dates.from],
              ['storeys (approved, max)', s.approved && s.approved.storeys_max], ['footprint from', fp.from], ['footprint licence', fromOsm ? OSM_CREDIT : 'Planning London Datahub: facts and links only']],
            geoms: [{ type: 'Polygon', rings: [ring.map(c => [c[0], c[1], 0])] }] }); }
        folders.push({ name: 'Works in progress', description: 'Construction sites in the model box, by status (orange on site, yellow approved and not started, green completed in the last two years, blue proposed, grey commenced years ago and never closed).', placemarks: pms });
        for (const src of Object.values((works.meta && works.meta.sources) || {})) if (src.attribution) credits.add(`Works in progress: ${src.attribution}${src.licence ? ` (${src.licence})` : ''}`);
      }
      const RV = ctx.river && ctx.river.RV;
      if (RV) { const pms = [], seen = new Set();
        for (const [k, parts] of Object.entries(RIVER)) { if (!ctx.river.on[k]) continue;
          for (const [file, keep] of parts) { const d = RV.data[file]; if (!d || !d.items) continue;
            for (const i of d.items) { if (!keep(i) || !i.position || i.position.lat == null || seen.has(i.id)) continue; const [x, z] = geo(i.position.lon, i.position.lat); if (!inBox(x, z)) continue; seen.add(i.id);
              const fromOsm = /OpenStreetMap|\bOSM\b/i.test(`${(d.meta && d.meta.attribution) || ''} ${i.position.precision || ''}`) && (file === 'osm' || /OSM/.test(i.position.precision || '')); if (fromOsm) osm.used = true;
              const vals = Object.entries(i.values || {}).filter(([, x2]) => x2 != null && x2 !== '' && typeof x2 !== 'object').slice(0, 20);
              pms.push({ name: i.name || i.title || (i.values && i.values.name) || i.id, style: { icon: [.2, .6, 1, 1] }, extended: [['id', i.id], ['kind', i.kind], ['url', i.url], ['position from', i.position.precision], ...vals, ['source', d.meta && d.meta.attribution], ...(fromOsm ? [['position licence', OSM_CREDIT]] : [])], geoms: [{ type: 'Point', coords: [i.position.lon, i.position.lat, 0] }] });
              if (d.meta && d.meta.attribution) credits.add(`River: ${d.meta.attribution}${d.meta.licence ? ` (licence: ${String(d.meta.licence).slice(0, 160)})` : ''}`); } } }
        if (pms.length) folders.push({ name: 'River', description: 'River layers that were on (positions as points; facts only).', placemarks: pms }); }
      for (const F of S.files) { if (!F.on) continue;
        const pms = F.doc.features.filter(f => !f.removed).map(f => ({ name: f.name, description: f.description, extended: f.extended, view: f.view, geoms: f.geoms, style: { line: f.style.line, width: f.style.width, poly: f.style.poly, fill: f.style.fill, outline: f.style.outline, icon: f.style.icon } }));
        if (pms.length) folders.push({ name: `My KML: ${F.name}`, description: F.doc.description, placemarks: pms }); credits.add(`My KML "${F.file}": your own file, under its own terms.`); }
      if (osm.used) credits.add('Map data: ' + OSM_CREDIT + '. Geometry marked with it is OpenStreetMap-derived.');
      const page = 'https://danbri.github.io/londat/docklands/';
      const desc = `View exported from the Docklands 3D page, Three.js port (${page}) on ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC. Camera: eye at ${v.alt.toFixed(1)} m above Ordnance Datum Newlyn (about mean sea level; KML absolute altitude), heading ${v.heading.toFixed(1)}°, tilt ${v.tilt.toFixed(1)}°, horizontal field ${v.horizFov.toFixed(1)}° (gx:horizFov).\n\nCredits and licences:\n- ${[...credits].join('\n- ') || 'camera only'}\n\nNot for navigation.`;
      const text = writeKml({ name: `Docklands view ${now.toISOString().slice(0, 10)}`, description: desc, view: v, folders });
      return { text, view: v, count: folders.reduce((s, f) => s + f.placemarks.length, 0), folders: folders.map(f => [f.name, f.placemarks.length]), osm: osm.used, filename: `docklands-view-${now.toISOString().slice(0, 16).replace(/[-:T]/g, '')}.kml` };
    }

    // ---------- UI: buttons, the file list, the KML sources list
    ctx.ui.section('My KML');
    const host = ctx.ui.host(), bar = E('p', {}), inp = E('input', { type: 'file', accept: '.kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz', multiple: '', hidden: '' });
    bar.append(E('button', { type: 'button', text: 'Open KML/KMZ', on: () => inp.click() }), ' ', E('button', { type: 'button', text: 'Export view as KML', on: () => { try { const r = exportView(); download(r.text, r.filename); toast(esc(`Exported the view${r.count ? ` and ${r.count} placemarks` : ''} as ${r.filename}.`)); } catch (e) { toast('Export failed: ' + esc(e.message)); } } }), inp);
    inp.onchange = async () => { const fs = [...inp.files]; inp.value = ''; await openFiles(fs, 'picker'); };
    const listEl = E('div', {}), srcD = E('details', {}), srcBody = E('div', {}, E('p', { class: 'small', text: 'Loading the catalogue…' }));
    srcD.append(E('summary', { class: 'small', text: 'KML sources (open data for the zone)' }), srcBody);
    host.append(bar, listEl, srcD, E('p', { class: 'small', text: 'Points, lines and polygons (with holes), folders, styles, descriptions (as text) and data tables; a KML Camera or LookAt gives "Go to view". Drop a file on the city. The file stays in this browser: nothing is uploaded or stored.' }));
    function list() {
      listEl.textContent = '';
      for (const F of S.files) {
        const d = F.doc, n = F.n || {}, live = d.features.filter(f => !f.removed).length, row = E('div', { style: 'border-top:1px solid #ffffff22;padding:4px 0' });
        const cb = E('input', { type: 'checkbox' }); cb.checked = F.on; cb.onchange = () => { F.on = cb.checked; rebuild(); };
        row.append(E('label', { class: 'row' }, cb, ' ', E('b', { text: F.name })));
        const sk = Object.entries(d.skipped).map(([k, c]) => `${c} ${k}`).join(', ');
        row.append(E('div', { class: 'small', text: `${live} features: ${n.drawn || 0} drawn${n.outside ? `, ${n.outside} outside the model box (not drawn)` : ''}${n.clipped ? `, ${n.clipped} partly outside (cut at the edge)` : ''}${n.hidden ? `, ${n.hidden} hidden in the file (visibility 0)` : ''}${d.folders.n ? `; ${d.folders.n} folders` : ''}${d.kmz ? `; KMZ (${d.kmz.entry})` : ''}${sk ? `; not supported: ${sk}` : ''}.` }));
        const r = E('div', {});
        r.append(E('button', { type: 'button', text: 'Show', on: () => showOrFly(F) }), ' ', E('button', { type: 'button', text: 'Fit', on: () => { frame(F) || toast('Nothing of this file is inside the model.'); } }), ' ');
        if (d.view) r.append(E('button', { type: 'button', text: 'Go to view', on: () => goView(d.view) }), ' ');
        r.append(E('button', { type: 'button', text: 'Remove', on: () => { S.files.splice(S.files.indexOf(F), 1); rebuild(); } }));
        row.append(r); listEl.append(row);
      }
    }
    const KS = { rows: [], loaded: false };
    function srcAction(e) {
      const cls = String(e.licence_class || 'none').toLowerCase();
      if (e.url && e.open_link && e.cors === 'yes' && OPEN_CLASSES.has(cls)) return { kind: 'open' };
      if (cls === 'share-alike') return { kind: 'link', href: e.page || e.url, why: 'Share-alike licence: opens the publisher’s page; not loaded into this page (project rule).' };
      const why = e.reason || (e.cors && e.cors !== 'yes' ? `the server does not let this page read it (${e.cors})` : !OPEN_CLASSES.has(cls) ? `licence: ${e.licence || cls}` : 'not readable here');
      return { kind: 'no', href: e.page || (/^https?:/.test(e.url || '') && !/[<>]/.test(e.url) ? e.url : null), why };
    }
    async function sources() {
      if (KS.loaded) return; KS.loaded = true;
      try { const cat = await ctx.loadJSON(CW + 'feeds/kml/catalogue.json'), rank = { open: 0, link: 1, no: 2 };
        KS.rows = (cat.resources || []).map(e => ({ e, a: srcAction(e) })).sort((x, y) => rank[x.a.kind] - rank[y.a.kind] || (y.e.zone_features ?? -1) - (x.e.zone_features ?? -1) || String(x.e.title).localeCompare(y.e.title));
        const n = k => KS.rows.filter(r => r.a.kind === k).length, m = cat.meta || {}; srcBody.textContent = '';
        srcBody.append(E('p', { class: 'small', text: `${KS.rows.length} resources checked on ${m.probed || '?'}: ${n('open')} open here, ${n('link')} by link only, ${n('no')} not usable. ` }, E('a', { href: README, target: '_blank', rel: 'noopener', text: 'Method and licences (README)' })));
        for (const { e, a } of KS.rows) {
          const info = E('div', { style: 'flex:1;min-width:0' }, E('b', { text: e.title, style: 'font-size:13px;overflow-wrap:anywhere' }), E('span', { class: 'small', style: 'display:block', text: `${e.licence_class || 'none'} · ${e.publisher || ''}${e.zone_features != null ? ` · ${e.zone_features} in zone, ${e.model_box_features ?? 0} in the model` : ''}` }));
          if (a.why) info.append(E('span', { class: 'small', style: 'display:block;color:#c9a9ad', text: a.why.length > 220 ? a.why.slice(0, 218) + '…' : a.why }));
          const row = E('div', { style: 'display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid #ffffff14' }, info);
          if (a.kind === 'open') row.append(E('button', { type: 'button', text: 'Open', on: () => openSource(e) }));
          else if (a.href) row.append(E('a', { href: a.href, target: '_blank', rel: 'noopener', class: 'small', text: a.kind === 'link' ? 'Link only ↗' : 'Not usable ↗' }));
          srcBody.append(row); }
      } catch (err) { KS.loaded = false; srcBody.textContent = ''; srcBody.append(E('p', { class: 'small', text: `The catalogue did not load (${err.message}).` })); }
    }
    srcD.addEventListener('toggle', () => { if (srcD.open) sources(); });
    async function openSource(e) {
      const F0 = S.files.find(F => F.src === e.url); if (F0) return showOrFly(F0);
      if (innerWidth < 700) { const d = document.getElementById('drawer'); if (d) d.hidden = true; }
      const F = await loadUrl(e.url); if (F) F.src = e.url;
    }
    // a dropped .kml or .kmz
    addEventListener('dragover', e => { const it = [...((e.dataTransfer && e.dataTransfer.items) || [])]; if (it.some(i => i.kind === 'file' && (isKmlType(i.type) || !i.type || /xml|zip/.test(i.type)))) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    addEventListener('drop', e => { const fs = [...((e.dataTransfer && e.dataTransfer.files) || [])].filter(f => isKmlName(f.name) || isKmlType(f.type)); if (!fs.length) return; e.preventDefault(); openFiles(fs, 'drop'); });
    const mod = this || { draw2d: null };
    const m0 = /[?&]kml=([^&#]+)/.exec(location.search); if (m0) loadUrl(decodeURIComponent(m0[1].replace(/\+/g, ' ')));

    const api = { object: root, ownUi: true, open, openFiles, loadUrl, rebuild, exportView, currentView, goView, fitCam, frame, show, sources, KS,
      setVisible(v) { rootOn = v; root.visible = v; draw(); }, get S() { return S; }, goView, currentView, applyCam, get state() { return { files: S.files.length, n: S.n, vis: S.vis, hits: S.hits.length, polys: S.polys.length }; } };
    ctx.kml = api;
    return api;
  },
};
