// Layer "water" of the Three.js port (docklands/): the mirror on the river and the docks. One TSL reflector
// (`reflector()` from three/tsl, ReflectorNode: the scene drawn again from the mirrored camera into a target at 0.35 of the screen size (softer, cheaper),
// clipped at the plane) in one horizontal plane at the area-weighted mean level of the river and dock polygons
// (water.js mirrorLevel, about 2.7 m OD, until the tide layer sets WU.tideLevel: then the plane follows it; the Thames is at 2.6 to 2.8 m, the docks at 3.3 to 4.2 m: a reflected point
// is out by twice the difference, under 3 m, which does not show at these distances). The water material
// (materials.js waterMaterial) mixes it in by fresnel; at night the lit windows come back in it (and feed the bloom).
// On by default on WebGPU; off by default on WebGL 2 (the material shows the sky by fresnel there), where ?water=1 or the
// menu box turns it on. Also refreshes the depth map once data/under.js (the North Dock bed) has loaded.
// Skill: docklands-3d-page, "Three.js port".
import { reflector } from 'three/tsl';
import { waterDepth, mirrorLevel, WU } from '../water.js';

export default {
  id: 'water', label: 'Water mirror (reflections)', on: true,
  async init(ctx) {
    const { scene, meshes, qs, flag, GPU, stats, draw } = ctx, mesh = meshes.water, m = mesh && mesh.material;
    if (!m || !m.setReflector) return {};
    waterDepth(true);   // under.js (layer "under") may have loaded since the material was made
    const level = +mirrorLevel().toFixed(2), on0 = qs.has('water') ? flag('water', true) : GPU;
    let refl = null, planeY = level;
    const set = on => {
      if (on && !refl) { refl = reflector({ resolutionScale: 0.35, bounces: false }); refl.target.rotateX(-Math.PI / 2); refl.target.position.y = planeY + 0.1; refl.target.updateMatrixWorld(); scene.add(refl.target); }
      m.setReflector(on ? refl : null); draw();
    };
    set(on0);
    // the plane follows the Thames level (WU.tideLevel, the tide layer) when it moves 5 cm or more; the docks keep their own
    // level, so their reflection is out by the difference (under 3 m; not visible at these distances)
    ctx.onFrame(() => { const y = WU.tideLevel.value; if (refl && Math.abs(y - planeY) >= 0.05) { planeY = y; refl.target.position.y = y + 0.1; refl.target.updateMatrixWorld(); } });
    const box = ctx.ui.toggle('Water mirror (reflections)', on0, v => set(v));
    stats.water = { vertices: mesh.geometry.attributes.position.count, triangles: mesh.geometry.index.count / 3, depth: waterDepth().stats, mirror: on0, mirrorLevel: level };
    Object.defineProperty(stats.water, 'mirrorLevel', { get: () => +planeY.toFixed(2), enumerable: true });
    Object.defineProperty(stats.water, 'mirror', { get: () => WU.reflect.value === 1, enumerable: true });
    return { ownUi: true, setVisible: v => { box.checked = v; set(v); } };
  },
};
