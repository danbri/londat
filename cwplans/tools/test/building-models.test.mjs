import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import vm from 'vm';

const CW = new URL('../../', import.meta.url).pathname;
const BM = JSON.parse(readFileSync(CW + 'docklands/data/building-models.json', 'utf8'));
const ctx = {}; vm.createContext(ctx); vm.runInContext(readFileSync(CW + 'docklands/data/area.js', 'utf8'), ctx); const A = ctx.DOCKLANDS_AREA;
const fp = `${A.buildings.length}:${Array.from(A.buildings[0].p.slice(0, 6)).join('.')}:${Array.from(A.buildings.at(-1).p.slice(0, 6)).join('.')}`;
const ring = b => { const a = [0, 0], r = []; b.p.forEach((q, k) => { a[k % 2] += q; if (k % 2) r.push([a[0] / 10, a[1] / 10]); }); return r; };

test('building models are for this area.js', () => {
  assert.equal(BM.model.fp, fp);
  for (const m of Object.values(BM.models)) assert.equal(m.model_fp, fp);
});

test('each model: indices in range, triangles counted, inside the outline box, heights near the LiDAR roof', () => {
  for (const [key, m] of Object.entries(BM.models)) {
    let tris = 0, top = -1e9; const r = ring(A.buildings[m.mi[0]]), xs = r.map(p => p[0]), zs = r.map(p => p[1]);
    for (const p of m.parts) {
      assert.equal(p.i.length % 3, 0, key + ' ' + p.name); assert.match(p.col, /^#[0-9a-f]{6}$/);
      for (const i of p.i) assert.ok(i >= 0 && i < p.p.length / 3, `${key} ${p.name}: index ${i}`);
      tris += p.i.length / 3;
      for (let k = 0; k < p.p.length; k += 3) {
        const x = m.t[0] + p.p[k] / 1000, y = m.t[1] + p.p[k + 1] / 1000, z = m.t[2] + p.p[k + 2] / 1000; top = Math.max(top, y);
        assert.ok(x > Math.min(...xs) - 3 && x < Math.max(...xs) + 3 && z > Math.min(...zs) - 3 && z < Math.max(...zs) + 3, `${key} ${p.name}: a vertex ${x},${z} far outside the outline`);
        assert.ok(y >= m.base_m_od - .01, `${key} ${p.name}: below the ground`);
      }
    }
    assert.equal(tris, m.triangles); assert.ok(Math.abs(top - m.top_m_od) < .01);
    const b = A.buildings[m.mi[0]]; assert.ok(Math.abs(m.top_m_od - (b.b + b.h)) < 2, `${key}: top ${m.top_m_od} m OD against the model roof ${b.b + b.h}`);
  }
});

test('the glTF file is the one the page file names', () => {
  for (const m of Object.values(BM.models)) {
    const g = readFileSync(CW + '../' + m.source.glb);
    assert.equal(createHash('sha256').update(g).digest('hex'), m.source.glb_sha256);
    assert.equal(g.readUInt32LE(0), 0x46546C67); assert.equal(g.readUInt32LE(8), g.length);
  }
});
