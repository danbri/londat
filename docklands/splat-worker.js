// Gaussian splats of the Three.js port (layers/splats.js): the worker that loads a set and sorts it far to near.
// Load: fetches the set's .splat(.gz) (standard 32-byte records: x y z, scale x y z, rgba, quaternion w x y z as bytes) and
// its groups file, unpacks gzip with DecompressionStream, and makes the instance records: 14 floats a splat (centre 3,
// covariance upper triangle 6 = (R S)(R S)^T, band, base, top, axis x, axis z; band -1 = no building) and one rgba word.
// Sort: the WebGL page's worker (cwplans/docklands/index.html SORT_SRC): depth along the view direction, a 16-bit counting
// sort, the records copied far to near into the two buffers it is given back (or new ones).
// Skill: docklands-3d-page, "Three.js port" (Gaussian splats).
const W = 14, NB = 24;
let F = null, C = null, n = 0;
async function bytes(url) {
  const r = await fetch(url); if (!r.ok) throw new Error(url.split('/').pop() + ': HTTP ' + r.status);
  let ab = await r.arrayBuffer(); const u8 = new Uint8Array(ab, 0, 2);
  if (u8[0] === 0x1f && u8[1] === 0x8b) ab = await new Response(new Blob([ab]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return ab;
}
async function load({ url, groupsUrl, groups, box }) {
  const t0 = performance.now(), ab = await bytes(url), t1 = performance.now();
  n = ab.byteLength / 32 | 0; const dv = new DataView(ab), src = new Uint8Array(ab);
  F = new Float32Array(n * W); C = new Uint32Array(n); const C8 = new Uint8Array(C.buffer);
  for (let i = 0; i < n; i++) {
    const o = 32 * i, x = dv.getFloat32(o, true), y = dv.getFloat32(o + 4, true), z = dv.getFloat32(o + 8, true), sx = dv.getFloat32(o + 12, true), sy = dv.getFloat32(o + 16, true), sz = dv.getFloat32(o + 20, true);
    let w = (src[o + 28] - 128) / 128, qx = (src[o + 29] - 128) / 128, qy = (src[o + 30] - 128) / 128, qz = (src[o + 31] - 128) / 128; const l = Math.hypot(w, qx, qy, qz) || 1; w /= l; qx /= l; qy /= l; qz /= l;
    const R0 = 1 - 2 * (qy * qy + qz * qz), R1 = 2 * (qx * qy - w * qz), R2 = 2 * (qx * qz + w * qy), R3 = 2 * (qx * qy + w * qz), R4 = 1 - 2 * (qx * qx + qz * qz), R5 = 2 * (qy * qz - w * qx), R6 = 2 * (qx * qz - w * qy), R7 = 2 * (qy * qz + w * qx), R8 = 1 - 2 * (qx * qx + qy * qy);
    const M0 = R0 * sx, M1 = R1 * sy, M2 = R2 * sz, M3 = R3 * sx, M4 = R4 * sy, M5 = R5 * sz, M6 = R6 * sx, M7 = R7 * sy, M8 = R8 * sz;   // R S
    const q = W * i; F[q] = x; F[q + 1] = y; F[q + 2] = z;
    F[q + 3] = M0 * M0 + M1 * M1 + M2 * M2; F[q + 4] = M0 * M3 + M1 * M4 + M2 * M5; F[q + 5] = M0 * M6 + M1 * M7 + M2 * M8;
    F[q + 6] = M3 * M3 + M4 * M4 + M5 * M5; F[q + 7] = M3 * M6 + M4 * M7 + M5 * M8; F[q + 8] = M6 * M6 + M7 * M7 + M8 * M8;
    F[q + 9] = -1; C8.set(src.subarray(o + 24, o + 28), 4 * i);
  }
  let grouped = 0;
  if (groupsUrl && groups) try {   // the building of each splat: its band across the estate (west to east), base, top and axis
    const gid = new Uint16Array(await bytes(groupsUrl)), [x0, x1] = box;
    for (let i = 0; i < n && i < gid.length; i++) { const k = gid[i], g = groups[k]; if (k === 65535 || !g) continue; const q = W * i;
      F[q + 9] = Math.max(0, Math.min(NB - 1, Math.floor((g[0] - x0) / (x1 - x0) * NB))); F[q + 10] = g[2]; F[q + 11] = g[3]; F[q + 12] = g[0]; F[q + 13] = g[1]; grouped++; }
  } catch (e) { grouped = -1; }
  postMessage({ loaded: true, n, f: F.slice().buffer, c: C.slice().buffer, grouped, fetchMs: Math.round(t1 - t0), buildMs: Math.round(performance.now() - t1) });
}
function sort({ eye, dir, key, f, c }) {
  const t0 = performance.now(), [ex, ey, ez] = eye, [dx, dy, dz] = dir, dep = new Float32Array(n); let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { const o = W * i, d = (F[o] - ex) * dx + (F[o + 1] - ey) * dy + (F[o + 2] - ez) * dz; dep[i] = d; if (d < lo) lo = d; if (d > hi) hi = d; }
  const B = 65536, k = (B - 1) / Math.max(1e-6, hi - lo), cnt = new Uint32Array(B), keyOf = new Uint16Array(n);
  for (let i = 0; i < n; i++) { const q = (hi - dep[i]) * k | 0; keyOf[i] = q; cnt[q]++; }
  for (let i = 1; i < B; i++) cnt[i] += cnt[i - 1];
  const of = f && f.byteLength === n * W * 4 ? new Float32Array(f) : new Float32Array(n * W), oc = c && c.byteLength === n * 4 ? new Uint32Array(c) : new Uint32Array(n);
  for (let i = n - 1; i >= 0; i--) { const j = --cnt[keyOf[i]]; of.set(F.subarray(W * i, W * i + W), W * j); oc[j] = C[i]; }
  postMessage({ sorted: true, key, f: of.buffer, c: oc.buffer, ms: performance.now() - t0 }, [of.buffer, oc.buffer]);
}
onmessage = e => {
  const m = e.data;
  if (m.load) load(m.load).catch(err => postMessage({ error: String(err && err.message || err) }));
  else if (m.sort && F) sort(m.sort);
};
