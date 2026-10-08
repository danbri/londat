// Layer "riverbed" of the Three.js port (docklands/): the Thames bed from UKHO soundings converted to m OD (A.riverbed of
// area.js), as in index.html "Thames riverbed": one square of the survey spacing per sounding at its depth, coloured from
// shallow (light, -16 m + 20 m and above) to deep (dark). On by default as in the WebGL page ("Riverbed" box); it lies
// under the water and under the ground, which the port sinks 1.5 m below each water polygon (build.js waterSink), so it
// is seen only when they are not drawn (the below-ground view, U.cut). Skill: docklands-3d-page, "Three.js port".
import { A, Mesh, dec } from '../build.js';

export default {
  id: 'riverbed', label: 'Riverbed (UKHO soundings)', on: true,
  async init(ctx) {
    const { THREE } = ctx, M = new Mesh();
    let n = 0;
    for (const r of A.riverbed || []) { const q = dec(r.q, 3), h = r.spacing / 2;
      for (let i = 0; i < q.length; i += 3) { const y = q[i + 2], t = Math.max(0, Math.min(1, (y + 16) / 20)), col = [.10 + .45 * t, .22 + .40 * t, .38 + .30 * t];
        // counter-clockwise from above (three.js front face up)
        const a = M.v(q[i] - h, y, q[i + 1] - h, col), b = M.v(q[i] + h, y, q[i + 1] - h, col), c = M.v(q[i] + h, y, q[i + 1] + h, col), d = M.v(q[i] - h, y, q[i + 1] + h, col);
        M.tri(a, c, b); M.tri(a, d, c); n++; } }
    if (!M.n) return {};
    const mesh = new THREE.Mesh(M.geometry(), ctx.materials.vertexColourMaterial());
    mesh.receiveShadow = true; mesh.name = 'riverbed';
    mesh.userData.stats = { soundings: n, triangles: M.idx.length / 3 };
    return { object: mesh, setVisible(on) { mesh.visible = on; } };
  },
};
