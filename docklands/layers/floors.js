// Layer "floors" of the Three.js port (docklands/): floor plates inside the buildings with a known floor count (b.fl in
// area.js, the Canary Wharf box), as in index.html "floor plates": fl - 1 levels evenly spaced from the base (b.b + b.mh)
// to the roof, each drawn as its outline rings in beams 0.5 m wide and 0.35 m high, colour [.98, .85, .45]. Off by
// default, as the WebGL page's "Floors" box. The WebGL page switches solid buildings to see-through (alpha 0.22) when
// Floors is ticked; the port has no building mode yet, so this layer makes the building material see-through while it is
// on and puts it back when it is off. The geometry (about 340,000 triangles) is built the first time the layer is on.
// Skill: docklands-3d-page, "Three.js port".
import { A, Mesh, dec } from '../build.js';

function beam(M, a, b, w, h, col) {   // index.html beam()
  const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, ox = -dz / l * w / 2, oz = dx / l * w / 2, H = h / 2;
  const P = (q, sx, sy) => [q[0] + ox * sx, q[1] + H * sy, q[2] + oz * sx];
  const a00 = P(a, -1, -1), a10 = P(a, 1, -1), a11 = P(a, 1, 1), a01 = P(a, -1, 1), b00 = P(b, -1, -1), b10 = P(b, 1, -1), b11 = P(b, 1, 1), b01 = P(b, -1, 1);
  M.quad(a01, b01, b11, a11, col); M.quad(a00, a10, b10, b00, col); M.quad(a00, b00, b01, a01, col); M.quad(a10, a11, b11, b10, col);
}

function build() {
  const M = new Mesh(), FC = [.98, .85, .45];
  let nb = 0;
  for (const b of A.buildings) if (b.fl) { nb++;
    const f = dec(b.p), starts = [0, ...(b.holes || []), f.length / 2], y0 = b.b + (b.mh || 0), step = (b.h - (b.mh || 0)) / b.fl;
    for (let k = 1; k < b.fl; k++) { const y = y0 + k * step;
      for (let r = 0; r < starts.length - 1; r++) for (let i = starts[r]; i < starts[r + 1]; i++) { const j = i + 1 < starts[r + 1] ? i + 1 : starts[r]; beam(M, [f[2 * i], y, f[2 * i + 1]], [f[2 * j], y, f[2 * j + 1]], .5, .35, FC); } }
  }
  return { M, nb };
}

export default {
  id: 'floors', label: 'Floors (see-through buildings)', on: false,
  async init(ctx, on) {
    const { THREE, scene } = ctx, mesh = new THREE.Mesh(new THREE.BufferGeometry(), ctx.materials.vertexColourMaterial());
    mesh.name = 'floors'; mesh.frustumCulled = false;
    let built = false, saved = null;
    const ensure = () => { if (built) return; built = true; const t0 = performance.now(), { M, nb } = build();
      mesh.geometry.dispose(); mesh.geometry = M.geometry(); mesh.frustumCulled = true;
      mesh.userData.stats = { buildings: nb, triangles: M.idx.length / 3, ms: Math.round(performance.now() - t0) }; };
    // the building material: the one on the building tiles (main.js userData.tile)
    const bmat = () => { let m = null; scene.traverse(o => { if (!m && o.userData && o.userData.tile && o.material) m = o.material; }); return m; };
    const ghost = g => { const m = bmat(); if (!m) return;
      if (g && !saved) { saved = { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite }; Object.assign(m, { transparent: true, opacity: .22, depthWrite: false }); m.needsUpdate = true; }
      else if (!g && saved) { Object.assign(m, saved); saved = null; m.needsUpdate = true; } };
    const setVisible = v => { if (v) ensure(); mesh.visible = v; ghost(v); ctx.draw(); };
    if (on) { ensure(); ghost(true); }   // the buildings are in the scene before the layers load
    return { object: mesh, setVisible };
  },
};
