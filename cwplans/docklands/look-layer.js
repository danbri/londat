// "Realistic" look of the Docklands 3D page (Layers > Style > Realistic buildings, ?look=real): wall and roof colours
// by material and a window rhythm by facade style, storey height and shopfront for every ordinary building, from
// data/materials.json (tools/build-materials.mjs: OSM tags and points, the registry use, the model geometry, rules for
// the rest). index.html builds a look building white, then calls DocklandsLook.paint(M, first vertex, model index,
// pitched) from buildBld(): wall vertices get the wall colour, roof vertices (u < 0) the pitched or flat roof colour,
// each times the face shading already in the vertex; the alpha byte gets 132 + code (style x 8 + shopfront x 4 +
// storey class), which the facade shader (lookSet, lookWall) reads. Detailed models, photo facade tiles, pixel art,
// Photo style, data colourings and the skyline years keep their own colours.
// For other layers (the headset view): DocklandsLook.set(true | false) -> Promise of the state; DocklandsLook.on().
// Skill: docklands-3d-page, "Realistic look".
(() => {
let T = null, want = false, C = null, loading = null;
// materials.json -> typed arrays by model index; null when the file is for another area.js (fingerprint)
function decode(J, MFP) {
  if (!J || !J.model || J.model.fp !== MFP) { console.warn('materials.json is for another area.js: no realistic look'); return null; }
  const n = J.u.length, b36 = (s, w, A) => { const a = new A(n); for (let i = 0; i < n; i++) a[i] = parseInt(s.substr(i * w, w), 36); return a; };
  const rgb = h => [0, 2, 4].map(k => parseInt(h.substr(k, 2), 16) / 255);
  return { n, code: b36(J.c, 2, Uint8Array), w: b36(J.w, 2, Uint16Array), p: b36(J.p, 2, Uint16Array), f: b36(J.f, 2, Uint16Array), use: b36(J.u, 1, Uint8Array),
    wall: J.wall.map(rgb), roof: J.roof.map(rgb), counts: J.counts };
}
const jit = (i, s) => (((Math.imul(i + 1, 2654435761) ^ Math.imul(s, 40503)) >>> 0) % 1000) / 1000;
// the vertices M built for model building i from n0 on (built with colour [1, 1, 1]): colours, alpha code, night use
function paint(M, n0, i, pitched) {
  if (!T || i >= T.n) return; const f = M.f, g = M.g, al = 132 + T.code[i], u = T.use[i];
  const v1 = .93 + .14 * jit(i, 1), warm = (jit(i, 2) - .5) * .05, vr = .94 + .12 * jit(i, 3);   // small per-building variation: brightness and warmth
  const W = T.wall[T.w[i]].map((c, k) => c * v1 * (1 + (k === 0 ? warm : k === 2 ? -warm : 0))), Rf = T.roof[pitched ? T.p[i] : T.f[i]].map(c => c * vr);
  for (let v = n0; v < M.n; v++) {
    const P = f[5 * v + 4] >>> 0, s = (P & 255) / 255, c = f[5 * v + 3] >= 0 ? W : Rf, q = c.map(x => Math.max(0, Math.min(255, Math.round(x * s * 255))));
    f[5 * v + 4] = q[0] | (q[1] << 8) | (q[2] << 16) | (al << 24);
    if (u && g[4 * v + 3] < 1000) g[4 * v + 3] += 1000 * u;   // Night: the guessed use where the registry gives none
  }
}
const box = () => document.getElementById('lookReal');
async function load() {
  if (T) return T; if (!loading) loading = C.load('data/materials.json').then(J => (T = decode(J, C.MFP))).catch(e => { console.warn('materials.json', e); loading = null; return null; });
  return loading;
}
// turn the look on or off; resolves to the state in force
async function set(on) {
  want = !!on; const b = box(); if (b) b.checked = want;
  if (want) await load();
  if (C) C.rebuild(); return want && !!T;
}
function init(ctx) {
  C = ctx; const b = box(); if (b) b.onchange = () => set(b.checked);
  if (/^(real|realistic|1)$/i.test(new URLSearchParams(location.search).get('look') || '')) set(true);
}
globalThis.DocklandsLook = { init, set, decode, paint, on: () => want && !!T, get data() { return T; }, attach: t => (T = t) };   // attach: decoded data without the page (tests)
})();
