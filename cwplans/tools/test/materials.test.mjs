import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import vm from 'vm';

// docklands/data/materials.json (tools/build-materials.mjs) against area.js, and the page's painter (docklands/look-layer.js)
const CW = new URL('../../', import.meta.url).pathname;
const J = JSON.parse(readFileSync(CW + 'docklands/data/materials.json', 'utf8'));
const ctx = {}; vm.createContext(ctx); vm.runInContext(readFileSync(CW + 'docklands/data/area.js', 'utf8'), ctx); const A = ctx.DOCKLANDS_AREA;
const fp = `${A.buildings.length}:${Array.from(A.buildings[0].p.slice(0, 6)).join('.')}:${Array.from(A.buildings.at(-1).p.slice(0, 6)).join('.')}`;
const lctx = { console, location: { search: '' }, URLSearchParams, document: { getElementById: () => null } }; vm.createContext(lctx);
vm.runInContext(readFileSync(CW + 'docklands/look-layer.js', 'utf8'), lctx);
const L = lctx.DocklandsLook, T = L.decode(J, fp); L.attach(T);

test('materials.json is for this area.js and decodes, one row a building', () => {
  assert.equal(J.model.fp, fp);
  assert.ok(T, 'decoded');
  const n = A.buildings.length;
  assert.equal(T.n, n); assert.equal(J.c.length, 2 * n); assert.equal(J.w.length, 2 * n); assert.equal(J.p.length, 2 * n); assert.equal(J.f.length, 2 * n); assert.equal(J.e.length, 3 * n);
  assert.equal(L.decode({ ...J, model: { fp: 'other' } }, fp), null, 'another area.js');
});

test('codes in the shader range (style x 8 + shop x 4 + storey class), palettes in range, uses 0 to 3', () => {
  for (let i = 0; i < T.n; i++) {
    assert.ok(T.code[i] <= 63, `building ${i}: code ${T.code[i]}`);
    assert.ok(T.w[i] < T.wall.length && T.p[i] < T.roof.length && T.f[i] < T.roof.length, `building ${i}: palette`);
    assert.ok(T.use[i] <= 3, `building ${i}: use`);
  }
  for (const c of [...T.wall, ...T.roof]) assert.ok(c.every(v => v >= 0 && v <= 1));
  const st = J.counts.style; assert.equal(Object.values(st).reduce((a, b) => a + b, 0), T.n);
  assert.equal(J.styles.length, 8, 'the shader knows 8 styles');
});

test('the painter: walls take the wall colour, roofs the roof colour, times the shading; alpha 132 + code; Night use added once', () => {
  const i = T.code.findIndex((c, k) => T.use[k] === 1), sh = [.5, .9];
  const pack = k => { const q = Math.round(k * 255); return q | (q << 8) | (q << 16) | (255 << 24); };
  const M = { n: 3, f: [0, 0, 0, 5, pack(sh[1]), 0, 0, 0, 12, pack(sh[0]), 0, 0, 0, -9, pack(1)], g: [0, 0, 0, 7, 0, 0, 0, 7, 0, 0, 0, 2007] };
  L.paint(M, 0, i, true);
  for (let v = 0; v < 3; v++) { const P = M.f[5 * v + 4] >>> 0; assert.equal(P >>> 24, 132 + T.code[i], 'alpha code'); }
  const wall = T.wall[T.w[i]], g0 = (M.f[4] >>> 0) & 255; assert.ok(Math.abs(g0 / 255 - wall[0] * sh[1]) < .12, 'wall red channel near colour x shading');
  assert.equal(M.g[3], 1007); assert.equal(M.g[11], 2007, 'a registry use is kept');
});
