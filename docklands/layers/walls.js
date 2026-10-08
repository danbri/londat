// Layer "walls" of the Three.js port (docklands/): the Environment Agency tidal flood defences (A.defences of area.js),
// as in index.html "EA flood defences": for each segment a 0.8 m wide slab from the LiDAR ground (or 0.3 m under the crest,
// whichever is lower) up to the surveyed crest level d.c (m OD). Colour #e07a3f (index.html WC [.88, .48, .25]). On by
// default, as the WebGL page's "Flood walls" box. Skill: docklands-3d-page, "Three.js port".
import { A, Mesh, dec } from '../build.js';

// index.html beam(): a box of width w and height h centred on the line a-b (no end caps); three.js lights the faces
export function beam(M, a, b, w, h, col) {
  const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, ox = -dz / l * w / 2, oz = dx / l * w / 2, H = h / 2;
  const P = (q, sx, sy) => [q[0] + ox * sx, q[1] + H * sy, q[2] + oz * sx];
  const a00 = P(a, -1, -1), a10 = P(a, 1, -1), a11 = P(a, 1, 1), a01 = P(a, -1, 1), b00 = P(b, -1, -1), b10 = P(b, 1, -1), b11 = P(b, 1, 1), b01 = P(b, -1, 1);
  M.quad(a01, b01, b11, a11, col); M.quad(a00, a10, b10, b00, col); M.quad(a00, b00, b01, a01, col); M.quad(a10, a11, b11, b10, col);
}

export default {
  id: 'walls', label: 'Flood walls (EA, to crest level)', on: true,
  async init(ctx) {
    const { THREE } = ctx, M = new Mesh(), WC = [.88, .48, .25];
    let segs = 0;
    for (const d of A.defences || []) { const q = dec(d.q, 3);
      for (let i = 3; i < q.length; i += 3) { const g = Math.min(q[i - 1], q[i + 2], d.c - .3), h = d.c - g; beam(M, [q[i - 3], g + h / 2, q[i - 2]], [q[i], g + h / 2, q[i + 1]], .8, h, WC); segs++; } }
    if (!M.n) return {};
    const mesh = new THREE.Mesh(M.geometry(), ctx.materials.vertexColourMaterial());
    mesh.castShadow = mesh.receiveShadow = true; mesh.name = 'walls';
    mesh.userData.stats = { defences: (A.defences || []).length, segments: segs, triangles: M.idx.length / 3 };
    return { object: mesh, setVisible(on) { mesh.visible = on; } };
  },
};
