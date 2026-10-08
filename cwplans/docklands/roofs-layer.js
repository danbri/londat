// Roof shapes of the Docklands 3D page (Layers > Show > "Roof shapes"): gabled, hipped and pyramidal roofs for the low
// model buildings in data/roofs.json (tools/build-roofs.mjs: EA LiDAR fits and OSM roof tags), drawn into the building
// mesh in place of the flat prism top. index.html calls DocklandsRoofs.decode(json, MFP) once the file is loaded and
// DocklandsRoofs.prism(M, b, roof, col, al, C) from buildBld() for each building that has a roof; the pick pass, Line
// drawing, the plotter and Drone keep the extruded outline. Skill: docklands-3d-page, "Roof shapes".
(() => {
// roofs.json -> Map(model index -> roof); null when the file is for another area.js (fingerprint)
function decode(T, MFP) {
  if (!T || !T.model || T.model.fp !== MFP) { console.warn('roofs.json is for another area.js: no roof shapes'); return null; }
  const s = T.s.split(','), r = T.r, out = new Map(); let i = 0;
  for (let k = 0; k < s.length; k++) { const q = r.slice(8 * k, 8 * k + 8); i += q[0];
    out.set(i, { shape: s[k], x: q[1] / 10, z: q[2] / 10, bearing: q[3] / 10, eave: q[4] / 100, ridge: q[5] / 100, hs: q[6] / 10, hl: q[7] < 0 ? null : q[7] / 10 }); }
  return out;
}
// the roof planes as height above the base: y = a x + b z + c (page metres); the roof is their lower envelope, never below the eave
function planes(R) {
  const t = R.bearing * Math.PI / 180, d = [Math.sin(t), -Math.cos(t)], n = [-d[1], d[0]], k = (R.ridge - R.eave) / R.hs, out = [];
  const pl = (ax, az, dist0) => ({ a: -k * ax, b: -k * az, c: R.ridge + k * (ax * R.x + az * R.z + dist0) });   // R.ridge - k (p.axis - c.axis - dist0)
  out.push(pl(n[0], n[1], 0), pl(-n[0], -n[1], 0));
  if (R.hl != null) out.push(pl(d[0], d[1], R.hl), pl(-d[0], -d[1], R.hl));
  return out;
}
const at = (P, x, z) => P.a * x + P.b * z + P.c;
// Sutherland-Hodgman: the part of polygon pts (x, z pairs) where f(x, z) <= 0, f linear
function clip(pts, f) {
  const out = [];
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length], fp = f(p[0], p[1]), fq = f(q[0], q[1]);
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); } }
  return out;
}
// walls up to the roof (gable ends come out as the walls' sloped tops) and one face a plane; u as prismF: metres along the
// ring on walls, -(1 + height) on the roof, so the shader treats the faces as roof (window grid off, ground image on)
function prism(M, b, R, col, al, C) {
  const f = C.dec(b.p), nv = f.length / 2, y0 = b.b, P = planes(R), ru = -(1 + R.ridge);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < nv; i++) { x0 = Math.min(x0, f[2 * i]); x1 = Math.max(x1, f[2 * i]); z0 = Math.min(z0, f[2 * i + 1]); z1 = Math.max(z1, f[2 * i + 1]); }
  if (!M.hold) M.cur = [(x0 + x1) / 2, (z0 + z1) / 2, y0];
  const H = (x, z) => { let h = Infinity; for (const p of P) h = Math.min(h, at(p, x, z)); return Math.max(R.eave, Math.min(R.ridge, h)); };
  // walls: each edge split where the lower envelope changes plane or meets the eave
  let along = 0;
  for (let k = 0; k < nv; k++) {
    const k2 = (k + 1) % nv, ax = f[2 * k], az = f[2 * k + 1], bx = f[2 * k2], bz = f[2 * k2 + 1], len = Math.hypot(bx - ax, bz - az), ts = [0, 1];
    const lin = p => [at(p, ax, az), at(p, bx, bz)];
    for (let i = 0; i < P.length; i++) { const [pa, pb] = lin(P[i]);
      if ((pa - R.eave) * (pb - R.eave) < 0) ts.push((pa - R.eave) / (pa - pb));
      for (let j = i + 1; j < P.length; j++) { const [qa, qb] = lin(P[j]), da = pa - qa, db = pb - qb; if (da * db < 0) ts.push(da / (da - db)); } }
    ts.sort((p, q) => p - q);
    const s = C.shade(col, bz - az, 0, -(bx - ax)).map(c => c * .9);
    for (let m = 0; m + 1 < ts.length; m++) { const ta = ts[m], tb = ts[m + 1]; if (tb - ta < 1e-6) continue;
      const xa = ax + (bx - ax) * ta, za = az + (bz - az) * ta, xb = ax + (bx - ax) * tb, zb = az + (bz - az) * tb, ua = along + len * ta, ub = along + len * tb;
      const i = M.v(xa, y0, za, ua, s, al), j = M.v(xb, y0, zb, ub, s, al), kk = M.v(xb, y0 + H(xb, zb), zb, ub, s, al), l = M.v(xa, y0 + H(xa, za), za, ua, s, al);
      M.tri(i, j, kk); M.tri(i, kk, l); }
    along += len;
  }
  // roof: the outline clipped to the region where each plane is the lowest, triangulated, lifted onto the plane
  const ring = []; for (let i = 0; i < nv; i++) ring.push([f[2 * i], f[2 * i + 1]]);
  const top = col.map(c => Math.min(1, c * 1.05));
  for (let i = 0; i < P.length; i++) {
    let poly = ring;
    for (let j = 0; j < P.length && poly.length >= 3; j++) if (j !== i) { const A = P[i], B = P[j]; poly = clip(poly, (x, z) => at(A, x, z) - at(B, x, z)); }
    if (poly.length < 3) continue;
    const flat = poly.flat(), tris = C.earcut(flat, undefined, 2), s = C.shade(top, -P[i].a, 1, -P[i].b), base = M.n;
    for (const [x, z] of poly) M.v(x, y0 + H(x, z), z, ru, s, al);
    for (let k = 0; k < tris.length; k += 3) M.tri(base + tris[k], base + tris[k + 1], base + tris[k + 2]);
  }
}
globalThis.DocklandsRoofs = { decode, prism, planes };
})();
