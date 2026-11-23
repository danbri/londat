// Layer "walls" of the Three.js port (docklands/): the Environment Agency tidal flood defences (A.defences of area.js),
// as in index.html "EA flood defences": for each segment a 0.8 m wide slab from the LiDAR ground (or 0.3 m under the crest,
// whichever is lower) up to the surveyed crest level d.c (m OD). On by default, as the WebGL page's "Flood walls" box.
// Colour: stone above WET m OD and a dark, weed-stained band below it, as the river walls look in the owner's photos of
// 2026-11-23 (data/images/contrib/thames-2026-11-23/: London Bridge, Old Billingsgate); until then the highlight orange
// #e07a3f of index.html, which drew every river wall as a salmon slab and coloured its reflection in the water.
// Skill: docklands-3d-page, "Three.js port".
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
    const { THREE } = ctx, M = new Mesh(), WC = [.70, .67, .60], WET = 3.2, WETC = [.30, .31, .24];   // stone, the tide band's top (m OD), the band
    let segs = 0;
    for (const d of A.defences || []) { const q = dec(d.q, 3);
      for (let i = 3; i < q.length; i += 3) { const g = Math.min(q[i - 1], q[i + 2], d.c - .3), w = Math.min(Math.max(WET, g), d.c);
        if (w > g) beam(M, [q[i - 3], (g + w) / 2, q[i - 2]], [q[i], (g + w) / 2, q[i + 1]], .8, w - g, WETC);
        if (d.c > w) beam(M, [q[i - 3], (w + d.c) / 2, q[i - 2]], [q[i], (w + d.c) / 2, q[i + 1]], .8, d.c - w, WC); segs++; } }
    if (!M.n) return {};
    const mesh = new THREE.Mesh(M.geometry(), ctx.materials.vertexColourMaterial());
    mesh.castShadow = mesh.receiveShadow = true; mesh.name = 'walls';
    mesh.userData.stats = { defences: (A.defences || []).length, segments: segs, triangles: M.idx.length / 3 };
    return { object: mesh, setVisible(on) { mesh.visible = on; } };
  },
};
