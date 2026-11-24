// Layer "bridges" of the Three.js port (docklands/): the river piers of London Bridge (1973), which the model did not have.
// Plan: the two holes in the OSM Thames polygon at the bridge (area.js water; read 2026-11-23): north pier x -4746 to -4715,
// z -278 to -272; south pier x -4766 to -4734, z -176 to -170 (model metres), 102 m apart (the centre span is 103.6 m:
// https://thames.me.uk/s00049e.htm), with pointed cutwaters (3 m, judged). Heights from the owner's photo IMG_2354 of
// 2026-11-23 (eye at its GPS fix, 80 m from the north pier's west end, focal 6639 px: 0.012 m a pixel; camera fitted to the
// obelisk top): pier top 7.8 m OD, the granite obelisk at each end to 13.6 m OD. Material: Cornish granite facing (https://www.gracesguide.co.uk/London_Bridge;
// a light grey granite, probably Merrivale), drawn light grey with a dark weed band below 3.5 m OD (the photo's tide band).
// "LONDON BRIDGE" is carved on the south face of the north pier, letters about 0.5 m high, about 4.0 m above the water at
// 1.7 m OD (the photo; no written source found for the inscription). The deck is not drawn here. Data:
// data/images/contrib/thames-2026-11-23/README.md. Skill: docklands-3d-page, "Three.js port".
import { Mesh } from '../build.js';

const PIERS = [
  { name: 'London Bridge, north pier', x0: -4746, x1: -4715, z0: -278, z1: -272, text: 'south' },
  { name: 'London Bridge, south pier', x0: -4766, x1: -4734, z0: -176, z1: -170 },
];
const BED = -4, TOP = 7.8, WET = 3.5, OB_TOP = 13.6, OB_W = 1.2, CUT = 3;
const GRANITE = [.66, .64, .60], WETC = [.34, .36, .29], CAP = [.72, .70, .66];

export default {
  id: 'bridges', label: 'Bridge piers (London Bridge)', on: true,
  async init(ctx) {
    const { THREE } = ctx, M = new Mesh(), group = new THREE.Group(); group.name = 'bridges';
    // a vertical band of the outline between heights a and b
    const band = (ring, a, b, col) => { for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length];
      M.quad([p[0], a, p[1]], [q[0], a, q[1]], [q[0], b, q[1]], [p[0], b, p[1]], col); } };
    const cap = (ring, y, col) => { const c = ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0]);
      for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; M.quad([c[0], y, c[1]], [q[0], y, q[1]], [p[0], y, p[1]], [c[0], y, c[1]], col); } };
    const box = (x, z, w, a, b, col) => { const h = w / 2, r = [[x - h, z - h], [x + h, z - h], [x + h, z + h], [x - h, z + h]]; band(r, a, b, col); cap(r, b, col); };
    for (const P of PIERS) {
      const zc = (P.z0 + P.z1) / 2, ring = [[P.x0, zc], [P.x0 + CUT, P.z0], [P.x1 - CUT, P.z0], [P.x1, zc], [P.x1 - CUT, P.z1], [P.x0 + CUT, P.z1]];
      band(ring, BED, WET, WETC); band(ring, WET, TOP, GRANITE); cap(ring, TOP, CAP);
      box(P.x0 + 1.2, zc, OB_W, TOP, OB_TOP, GRANITE); box(P.x1 - 1.2, zc, OB_W, TOP, OB_TOP, GRANITE);   // the obelisks at the ends
    }
    const mesh = new THREE.Mesh(M.geometry(), ctx.materials.vertexColourMaterial()); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    // the inscription: carved letters (a darker fill with a light lower edge) on a plane 3 cm off the face
    for (const P of PIERS) if (P.text) {
      const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 192; const g = cv.getContext('2d');
      g.font = '600 150px "Gill Sans", "Gill Sans MT", Calibri, "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillText('LONDON   BRIDGE', 1024, 100);   // lit lower edge of the cut
      g.fillStyle = 'rgba(40,38,34,0.85)'; g.fillText('LONDON   BRIDGE', 1024, 96);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: .9, polygonOffset: true, polygonOffsetFactor: -2 });
      const L = 7.2, H = L * 192 / 2048, pl = new THREE.Mesh(new THREE.PlaneGeometry(L, H), mat);
      pl.position.set(P.x0 + CUT + 6.5, 1.7 + 4.0, P.z1 + .03); pl.name = 'inscription: LONDON BRIDGE'; group.add(pl);   // the south face (+z)
    }
    group.userData.stats = { piers: PIERS.length, triangles: M.idx.length / 3 };
    return { object: group, setVisible(on) { group.visible = on; } };
  },
};
