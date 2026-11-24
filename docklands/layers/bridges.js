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
import { Mesh, A, dec } from '../build.js';

// London Bridge's deck (not in the model before 2026-11-24): on the line through the two pier centres, from bank to bank
// (the terrain rises above 3.5 m OD at z -330 and z -85 there), 32 m wide (https://en.wikipedia.org/wiki/London_Bridge),
// the road at 14.0 m OD (the OSM road on the bridge in area.js: 13.3 to 14.1 m), a polished granite parapet 1.1 m high
// (https://illuminatedriver.london/bridges/london-bridge); the underside haunched: 7.8 m OD at the piers, 12.4 m at the
// middle of the centre span (8.9 m clearance above high water at about 3.5 m OD), 11 m at the middle of the side spans and
// 9.5 m at the banks (judged); fascia of abrasive-blasted concrete with a grey granite aggregate (Grace's Guide), light grey.
// The underside colour is lighter than the fascia (0.80) because the page has no light from below: in IMG_2354 the
// underside is lit by the light that the water reflects, and at 0.52 it rendered almost black.
const LB = { n: [-4721, -330], s: [-4766, -85], pn: [-4731, -275], ps: [-4750, -173], W: 32, ROAD: 14.0, PAR: 1.1 };
const FASCIA = [.66, .65, .62], SOFFIT = [.80, .80, .77], PARAPET = [.60, .60, .58], ROADC = [.24, .24, .25];
// Tower Bridge's high-level walkways: the OSM parts between the towers (w367652753, w367653917) are extruded from the deck
// at 3 m OD to 48.1 m in the model, a solid block 45 m high where the photo IMG_2337 of 2026-11-23 shows sky under the
// walkways. This layer hides them and draws each outline from 42.5 to 48.1 m OD (the walkways' lattice girders, judged 5.6
// m deep) in the bridge's light blue-grey. Found by place: parts over 40 m tall whose centre lies between the towers.
const TB_BOX = [-3900, 10, -3855, 66], WALK = [42.5, 48.1], WALKC = [.55, .64, .70];

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
    // London Bridge deck: stations along the axis from the north bank to the south bank
    { const [nx, nz] = LB.n, [sx, sz] = LB.s, len = Math.hypot(sx - nx, sz - nz), ax = (sx - nx) / len, az = (sz - nz) / len, px = -az, pz = ax, h = LB.W / 2;
      const sOf = q => (q[0] - nx) * ax + (q[1] - nz) * az, s1 = sOf(LB.pn), s2 = sOf(LB.ps);
      const arch = (s, a, b, ya, yb, ym) => { const t = (s - a) / (b - a), base = ya + (yb - ya) * t; return base + (ym - (ya + yb) / 2) * 4 * t * (1 - t); };
      const soffit = s => s <= s1 ? arch(s, 0, s1, 9.5, 7.8, 11) : s <= s2 ? arch(s, s1, s2, 7.8, 7.8, 12.4) : arch(s, s2, len, 7.8, 9.5, 11);
      const P = (s, o, y) => [nx + ax * s + px * o, y, nz + az * s + pz * o], N = 40;
      for (let i = 0; i < N; i++) { const a = len * i / N, b = len * (i + 1) / N, ya = soffit(a), yb = soffit(b);
        for (const o of [-h, h]) { M.quad(P(a, o, ya), P(b, o, yb), P(b, o, LB.ROAD), P(a, o, LB.ROAD), FASCIA);   // the two fascias
          M.quad(P(a, o, LB.ROAD), P(b, o, LB.ROAD), P(b, o, LB.ROAD + LB.PAR), P(a, o, LB.ROAD + LB.PAR), PARAPET); }
        M.quad(P(a, -h, ya), P(a, h, ya), P(b, h, yb), P(b, -h, yb), SOFFIT);   // underside
        M.quad(P(a, -h, LB.ROAD), P(b, -h, LB.ROAD), P(b, h, LB.ROAD), P(a, h, LB.ROAD), ROADC); } }
    // Tower Bridge walkways: hide the solid parts, draw their outlines at the walkway level
    const walk = new Set();
    (A.buildings || []).forEach((b, i) => { if (b.h < 40) return; const q = dec(b.p); let x = 0, z = 0, n = q.length / 2; for (let k = 0; k < q.length; k += 2) { x += q[k]; z += q[k + 1]; } x /= n; z /= n;
      if (x > TB_BOX[0] && x < TB_BOX[2] && z > TB_BOX[1] && z < TB_BOX[3] && b.b + b.h < 50) { walk.add(i); const r = []; for (let k = 0; k < q.length; k += 2) r.push([q[k], q[k + 1]]); band(r, WALK[0], WALK[1], WALKC); cap(r, WALK[1], WALKC); cap(r.slice().reverse(), WALK[0], WALKC); } });
    if (walk.size) { const prev = ctx.buildOpts.skip; ctx.buildOpts.skip = { has: i => walk.has(i) || !!(prev && prev.has(i)), get size() { return walk.size + (prev ? prev.size : 0); } }; ctx.rebuildBuildings(); }
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
    group.userData.stats = { piers: PIERS.length, walkways_hidden: walk.size, triangles: M.idx.length / 3 };
    return { object: group, setVisible(on) { group.visible = on; } };
  },
};
