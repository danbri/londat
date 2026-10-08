import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import vm from 'vm';

// docklands/data/roofs.json (tools/build-roofs.mjs) against area.js, and the page's roof builder (docklands/roofs-layer.js)
const CW = new URL('../../', import.meta.url).pathname;
const R = JSON.parse(readFileSync(CW + 'docklands/data/roofs.json', 'utf8'));
const ctx = {}; vm.createContext(ctx); vm.runInContext(readFileSync(CW + 'docklands/data/area.js', 'utf8'), ctx); const A = ctx.DOCKLANDS_AREA;
const fp = `${A.buildings.length}:${Array.from(A.buildings[0].p.slice(0, 6)).join('.')}:${Array.from(A.buildings.at(-1).p.slice(0, 6)).join('.')}`;
const lctx = { console }; vm.createContext(lctx); vm.runInContext(readFileSync(CW + 'docklands/roofs-layer.js', 'utf8'), lctx);
const L = lctx.DocklandsRoofs, roofs = L.decode(R, fp);
const ring = b => { const a = [0, 0], r = []; b.p.forEach((q, k) => { a[k % 2] += q; if (k % 2) r.push([a[0] / 10, a[1] / 10]); }); return r; };

test('roofs.json is for this area.js and decodes', () => {
  assert.equal(R.model.fp, fp);
  assert.ok(roofs && roofs.size > 1000, 'rows');
  assert.equal(R.r.length, 8 * R.s.split(',').length);
});

test('each roof: a low building with no holes, eave below ridge, ridge line near the outline', () => {
  for (const [i, f] of roofs) {
    const b = A.buildings[i]; assert.ok(b, 'index ' + i);
    assert.ok(b.h <= R.rules.hmax && !b.mh && !(b.holes && b.holes.length), `building ${i} should not have a roof shape`);
    if (f.shape === 'parts') continue;
    assert.ok(/^([ghp]o?|k)$/.test(f.shape), f.shape);
    assert.ok(f.eave >= 1 && f.eave < f.ridge && f.ridge < 40, `building ${i}: eave ${f.eave} ridge ${f.ridge}`);
    assert.ok(f.hs > 0.5, `building ${i}: half span ${f.hs}`);
    const r = ring(b), xs = r.map(p => p[0]), zs = r.map(p => p[1]);
    assert.ok(f.x > Math.min(...xs) - 2 && f.x < Math.max(...xs) + 2 && f.z > Math.min(...zs) - 2 && f.z < Math.max(...zs) + 2, `building ${i}: ridge centre outside the outline box`);
  }
});

test('buildings in parts: the cuts give one piece a part, each piece inside the outline, the parts cover the outline', () => {
  let n = 0, valleys = 0;
  for (const [i, f] of roofs) {
    if (f.shape !== 'parts') continue; n++;
    const b = A.buildings[i], r = ring(b), PC = L.pieces(r, f.cuts), ar = P => { let s = 0; P.forEach((p, k) => { const q = P[(k + 1) % P.length]; s += p[0] * q[1] - q[0] * p[1]; }); return s / 2; };
    assert.equal(PC.length, f.parts.length, `building ${i}: pieces`);
    const sum = PC.reduce((a, [P]) => a + Math.abs(ar(P)), 0), whole = Math.abs(ar(r));
    assert.ok(Math.abs(sum - whole) < 0.01 * whole + 0.05, `building ${i}: pieces ${sum.toFixed(2)} m2, outline ${whole.toFixed(2)} m2`);
    for (const p of f.parts) {
      assert.ok(/^[fghpk]$/.test(p.shape), p.shape);
      assert.ok(p.eave >= 1 && p.eave <= p.ridge + 1e-9 && p.ridge < 40, `building ${i}: eave ${p.eave} ridge ${p.ridge}`);
      if (p.shape !== 'f') assert.ok(p.eave < p.ridge && p.hs > 0.5, `building ${i}: pitched part`);
      assert.ok(p.e0 >= 0 && p.e1 >= 0 && (p.shape === 'g' || p.e0 + p.e1 === 0), `building ${i}: runs on only from a gable`);
      if (p.e0 + p.e1 > 0) valleys++;
    }
  }
  assert.ok(n > 500, 'buildings in parts: ' + n); assert.ok(valleys > 50, 'gables that run into a crossing wing: ' + valleys);
});

test('the page builder: walls from the ground, roof between eave and ridge, inside the outline box, no NaN', () => {
  const dec = q => { const o = [], a = [0, 0]; q.forEach((v, k) => { a[k % 2] += v; o.push(a[k % 2] / 10); }); return o; };
  const earcut = f => { const n = f.length / 2, t = []; for (let k = 1; k + 1 < n; k++) t.push(0, k, k + 1); return t; };   // a fan: enough for the bounds checked here
  let n = 0;
  for (const [i, f] of roofs) {
    if (n++ % 97) continue;
    const b = A.buildings[i], V = [], M = { n: 0, hold: false, cur: null, v(x, y, z, u) { V.push([x, y, z, u]); return this.n++; }, tri() {} };
    L.prism(M, b, f, [.8, .8, .8], 1, { dec, shade: c => c, earcut });
    const r = ring(b), xs = r.map(p => p[0]), zs = r.map(p => p[1]);
    for (const [x, y, z, u] of V) {
      assert.ok([x, y, z, u].every(Number.isFinite), `building ${i}: NaN vertex`);
      assert.ok(x >= Math.min(...xs) - .01 && x <= Math.max(...xs) + .01 && z >= Math.min(...zs) - .01 && z <= Math.max(...zs) + .01, `building ${i}: vertex outside`);
      assert.ok(y >= b.b - 1e-6 && y <= b.b + f.ridge + 1e-6, `building ${i}: height ${y - b.b}`);
      if (u < 0) assert.ok(y >= b.b + f.eave - 1e-6, `building ${i}: roof vertex below the eave`);
    }
  }
});
