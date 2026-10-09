// Layer "trees" of the Three.js port (docklands/): the open tree data of the WebGL page (data/trees.json, built by
// cwplans/tools/build-trees.mjs: GLA Public Realm Trees, TPO points, OSM, Forest Research TOW; all OGL v3.0 but OSM, ODbL)
// as index.html buildTreesN(): a trunk (0.8 m square, 0.4 h tall) and a box crown (crown spread c, 0.65 h tall, from
// 0.35 h) per tree, on the LiDAR ground; height h = height_m or 9 m; c = crown_m or 0.55 h, clamped to 3 to 16 m; trees
// over 35 m are skipped (probably a crane or a structure the LiDAR took for a tree); crowns in two greens (every third
// tree the lighter one). Default: the trees within 900 m of the estate (A.meta.focus), as the WebGL page; the box "All
// trees in the model box" (or ?trees=all) shows every tree of the file. Two InstancedMesh (crowns, trunks): two draw
// calls (and their shadow passes) for any number of trees. Lit by the scene lights, so night dims them as the buildings.
// Not ported: the trees up-lit by the river-walk lamps at night (needs the night lamps), the pixel-art trees.
// Skill: docklands-3d-page, "Three.js port".
import { Fn, If, Discard, positionWorld, vec4 } from 'three/tsl';
import { A, groundAt } from '../build.js';

const TR = [.36, .30, .24], G1 = [.28, .46, .25], G2 = [.36, .52, .28];   // index.html buildTreesN colours (sRGB)

export default {
  id: 'trees', label: 'Trees', on: true,
  async init(ctx) {
    const { THREE, U } = ctx, t0 = performance.now();
    const D = await ctx.loadJSON(ctx.DATA + 'trees.json'), tLoad = performance.now() - t0;
    const F = A.meta.focus, B = [F.x0 - 900, F.x1 + 900, F.z0 - 900, F.z1 + 900];
    const list = D.trees.filter(t => !(t[2] > 35));   // the file's rows [x, z, h|null, c|null, species, source]
    const near = t => t[0] >= B[0] && t[0] <= B[1] && t[1] >= B[2] && t[1] <= B[3];
    // near trees first: "within 900 m" is then a count of the first instances, not a second buffer
    list.sort((a, b) => near(b) - near(a)); const nNear = list.filter(near).length;

    const mat = () => { const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, flatShading: true });
      m.colorNode = Fn(() => { If(positionWorld.y.greaterThan(U.cut), () => { Discard(); }); return vec4(1, 1, 1, 1); })();   // the colour is the instance colour
      return m; };
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);   // unit box standing on y = 0
    const N = list.length, crowns = new THREE.InstancedMesh(box, mat(), N), trunks = new THREE.InstancedMesh(box, mat(), N);
    const cm = crowns.instanceMatrix.array, tm = trunks.instanceMatrix.array, cc = new Float32Array(N * 3), tc = new Float32Array(N * 3), col = new THREE.Color();
    const lin = (a, rgb, k) => { col.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace); a[3 * k] = col.r; a[3 * k + 1] = col.g; a[3 * k + 2] = col.b; };
    const put = (a, k, sx, sy, sz, x, y, z) => { const o = 16 * k; a.fill(0, o, o + 16); a[o] = sx; a[o + 5] = sy; a[o + 10] = sz; a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1; };
    list.forEach(([x, z, h0, c0], k) => {
      const h = h0 || 9, c = Math.max(3, Math.min(16, c0 || h * .55)), g = groundAt(x, z);
      put(tm, k, .8, h * .4, .8, x, g, z); put(cm, k, c, h * .65, c, x, g + h * .35, z);
      lin(tc, TR, k); lin(cc, k % 3 ? G1 : G2, k);
    });
    crowns.instanceColor = new THREE.InstancedBufferAttribute(cc, 3); trunks.instanceColor = new THREE.InstancedBufferAttribute(tc, 3);
    const group = new THREE.Group(); group.name = 'trees';
    for (const m of [crowns, trunks]) { m.castShadow = m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; group.add(m); }
    const stats = { file: D.trees.length, over35: D.trees.length - N, near900: nNear, instances: 0, triangles: 0, loadMs: Math.round(tLoad), buildMs: 0 };
    function setAll(all) {
      const n = all ? N : nNear;
      for (const m of [crowns, trunks]) { m.count = n; m.computeBoundingSphere(); m.computeBoundingBox?.(); }
      Object.assign(stats, { all, instances: n, triangles: 2 * n * 12 });
      ctx.draw();
    }
    setAll(ctx.qs.get('trees') !== 'near');   // all trees by default (owner, 2026-10-09: "Default to all trees"); ?trees=near: within 900 m
    stats.buildMs = Math.round(performance.now() - t0 - tLoad);
    ctx.ui.toggle(`All trees in the model box (${N.toLocaleString('en-GB')}, not only the ${nNear.toLocaleString('en-GB')} within 900 m of the estate)`, stats.all, setAll);
    ctx.ui.note('Trees: GLA, Forest Research, OS, planning.data (OGL v3.0); OpenStreetMap (ODbL)');
    return { object: group, stats, setVisible(on) { group.visible = on; } };
  },
};
