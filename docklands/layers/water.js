// Layer "water" of the Three.js port (docklands/): the reflections on the river and the docks.
// - The mirror: one TSL reflector (`reflector()` from three/tsl, ReflectorNode: the scene drawn again from the mirrored
//   camera into a target at 0.35 of the screen size (softer, cheaper), clipped at the plane), in one horizontal plane at
//   the level of the water body nearest to the eye (water.js mirrorBody, re-chosen when the eye has moved 10 m): the tidal
//   Thames, Deptford Creek and the Lea at the tide now (WU.tideLevel, the tide layer), a dock at its own level (area.js
//   w.level: 3.3 to 4.2 m OD). The other bodies in view reflect from the same plane, out by twice the difference of the
//   levels (up to about 6 m at a low spring tide); the nearer the water, the more that shows, so the nearest body is right.
//   The water material (materials.js waterMaterial) mixes it in by fresnel; at night the lit windows, lamps and aviation
//   lights (layers/nightlights.js) come back in it, streaked (and feed the bloom on WebGPU).
//   On by default on both backends since 2026-10-09 (it was off on WebGL 2: the WebGL page shows reflections there;
//   measured cost in docklands/README.md "Water"); ?water=0 or Look > Water mirror turns it off (sky colour by fresnel).
// - Vertical exaggeration (main.js setVz, ?vz=): the view matrix is V x diag(1, vz, 1). The mirror of that view in the
//   plane y = h is the rigid camera mirrored in the plane y = h x vz of the exaggerated space, then the same y scale
//   (S Rf_h = Rf_(vz h) S). ReflectorBaseNode.updateBefore builds its virtual camera from camera.matrixWorld and the
//   target's matrixWorld: they are made rigid and exaggerated for the call, and the virtual camera's second
//   updateMatrixWorld (the one inside renderer.render; the first one is used for the oblique clip plane) takes the scale.
// - The moon's glitter path (index.html moonGlitter, the lights' glitter-path shader with refl = 1): by night with the
//   moon up, a streak on the water along the moon's azimuth, from where the depression below the horizon is 0.32 (tan)
//   less than the moon's altitude (wave slopes up to about 9 degrees) to 0.16 more, brightest at the moon's mirror
//   image, rippled along the screen's y; brightness sqrt(lit fraction) x extinction x altitude x cloud, as there. Drawn
//   on the water only (the depth map of water.js), on both backends, while the mirror is off: with the mirror on, the
//   moon disc in the mirror, streaked by the ripples, and the moon light's specular already make the path (checked
//   headless 2026-10-09: both together were a white blob).
// Also refreshes the depth map once data/under.js (the North Dock bed) has loaded.
// Skill: docklands-3d-page, "Three.js port".
import * as THREE from 'three/webgpu';
import { reflector, uniform, vec2, vec3, float, positionWorld, cameraPosition, screenCoordinate, time, texture, sin, exp, abs, min, max, mix, clamp, smoothstep, step, length, dot, select } from 'three/tsl';
import { waterDepth, mirrorLevel, mirrorBody, WU } from '../water.js';

export default {
  id: 'water', label: 'Water mirror (reflections)', on: true,
  async init(ctx) {
    const { scene, meshes, qs, flag, GPU, stats, draw, camera, U, sky } = ctx, mesh = meshes.water, m = mesh && mesh.material;
    if (!m || !m.setReflector) return {};
    const D = waterDepth(true);   // under.js (layer "under") may have loaded since the material was made
    const level = +mirrorLevel().toFixed(2), on0 = qs.has('water') ? flag('water', true) : true;
    const vzNow = () => ctx.vzNow ? ctx.vzNow() : 1;
    let refl = null, planeY = level;
    const BODY = { at: null, tidal: true, level, d: null };   // the body the plane follows
    const S = new THREE.Matrix4(), M0 = new THREE.Matrix4(), T0 = new THREE.Matrix4();
    function wrapVz(R) {   // vertical exaggeration in the mirror (see the header)
      const base = R.reflector, ub = base.updateBefore;
      base.updateBefore = function (frame) {
        const vz = vzNow(), cam = frame && frame.camera; if (vz === 1 || !cam || !ctx.SINV) return ub.call(this, frame);
        const vc = this.getVirtualCamera(cam);
        if (!vc.userData.vzWrap) { const w = vc.userData.vzWrap = { on: false, n: 0 }, umw = vc.updateMatrixWorld;
          vc.updateMatrixWorld = function (f) { umw.call(this, f); if (w.on && w.n++ > 0) { this.matrixWorld.premultiply(ctx.SINV); this.matrixWorldInverse.copy(this.matrixWorld).invert(); } }; }
        const w = vc.userData.vzWrap, t = this.target;
        M0.copy(cam.matrixWorld); cam.matrixWorld.premultiply(S.makeScale(1, vz, 1));   // the rigid camera of the exaggerated space
        T0.copy(t.matrixWorld); t.matrixWorld.elements[13] *= vz;   // the plane at h x vz there
        w.on = true; w.n = 0;
        try { return ub.call(this, frame); } finally { w.on = false; cam.matrixWorld.copy(M0); t.matrixWorld.copy(T0); }
      };
    }
    const set = on => {
      if (on && !refl) { refl = reflector({ resolutionScale: 0.35, bounces: false }); refl.target.rotateX(-Math.PI / 2); refl.target.position.y = planeY + 0.1; refl.target.updateMatrixWorld(); scene.add(refl.target); wrapVz(refl); }
      m.setReflector(on ? refl : null); draw();
    };
    set(on0);
    // the plane: the level of the body nearest to the eye (re-chosen when the eye has moved 10 m), the tidal water at the
    // tide now; moved when the level changes by 5 cm or more
    const eye = new THREE.Vector3(), lastEye = new THREE.Vector3(1e9, 0, 0);
    const bodyLevel = () => BODY.tidal ? WU.tideLevel.value : BODY.level;
    ctx.onFrame(() => {
      eye.setFromMatrixPosition(camera.matrixWorld);
      if (Math.hypot(eye.x - lastEye.x, eye.z - lastEye.z) >= 10) { lastEye.copy(eye); const b = mirrorBody(eye.x, eye.z); if (b) Object.assign(BODY, { at: [Math.round(eye.x), Math.round(eye.z)], tidal: b.tidal, level: b.level, d: Math.round(b.d) }); }
      const y = bodyLevel();
      if (refl && Math.abs(y - planeY) >= 0.05) { planeY = y; refl.target.position.y = y + 0.1; refl.target.updateMatrixWorld(); }
      glitterFrame(y);
    });

    // ---------- the moon's glitter path (see the header): a quad on the water along the moon's azimuth from the eye
    const LAYER = { on: flag('glitter', true) };   // ?glitter=0: no glitter path
    const G = { on: uniform(0), eye: uniform(new THREE.Vector3()), he: uniform(10), ta: uniform(0.3), dir: uniform(new THREE.Vector2(0, -1)), col: uniform(new THREE.Color(0, 0, 0)), vz: uniform(1) };
    const gMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    gMat.polygonOffset = true; gMat.polygonOffsetFactor = -2; gMat.polygonOffsetUnits = -8;
    {
      const rel = positionWorld.xz.sub(G.eye.xz), xf = max(dot(rel, G.dir), 0.5), yl = dot(rel, vec2(G.dir.y.negate(), G.dir.x));
      const u = G.he.div(xf).sub(G.ta);   // depression (tan) minus the moon's altitude (tan): 0 at the mirror image
      const along = select(u.lessThan(0), mix(float(0.3), float(1), clamp(u.add(0.32).div(0.32), 0, 1)).mul(step(-0.32, u)), exp(u.mul(-5.5 / 0.16)));
      const t = clamp(u.add(0.32).div(0.48), 0, 1), y = screenCoordinate.y, fr = mix(float(1), float(0.3), t);   // ripples look bigger nearer the viewer
      const wob = sin(y.mul(fr).mul(0.23).add(time.mul(1.7))).mul(0.6).add(sin(y.mul(fr).mul(0.061).sub(time.mul(0.8))).mul(0.4));
      const hw = float(0.012).add(t.mul(0.006)), dx = yl.div(xf).div(hw).sub(wob.mul(0.3));   // lateral angle in half-widths (about 0.02 rad: the WebGL page's sprite, 0.03 D / 1.3 x 1.3 wide, plus 2.5 px)
      const rip = sin(y.mul(fr).add(time.mul(3.1))).mul(sin(y.mul(fr).mul(0.29).sub(time.mul(1.7)))).mul(0.5).add(0.5);
      const uv = positionWorld.xz.sub(vec2(D.x0, D.z0)).div(vec2(D.w, D.h)), wet = smoothstep(0.004, 0.02, texture(D.tex, uv).x);   // water cells only (land 0 in the depth map)
      const I = along.mul(exp(dx.mul(dx).mul(-0.9))).mul(rip.mul(rip)).mul(smoothstep(0, 0.02, t)).mul(wet).mul(G.on);
      gMat.colorNode = G.col.mul(I); gMat.opacityNode = float(1);
    }
    const gGeo = new THREE.PlaneGeometry(1, 1); gGeo.rotateX(-Math.PI / 2); gGeo.translate(0, 0, -0.5);   // local: x across, -z ahead, 0 to 1
    const glitter = new THREE.Mesh(gGeo, gMat); glitter.name = 'water:moon-glitter'; glitter.frustumCulled = false; glitter.renderOrder = 3; glitter.visible = false; scene.add(glitter);
    const GS = { on: false, i: 0, D: 0 };
    function glitterFrame(wl) {
      const st = sky && sky.state, md = sky && sky.base && sky.base.md, night = U.night.value;
      const alt = st ? st.moon.alt : -90, vz = vzNow(), he = (eye.y - wl - 0.1) * vz;   // the eye above the water in the view's space (index.html: CAM.eye[1] - wl x VZ)
      const want = LAYER.on && WU.reflect.value !== 1 && night > 0.02 && alt > 0.3 && he > 0.3 && md && !(ctx.U.cut && ctx.U.cut.value < 250);
      if (!want) { if (glitter.visible) { glitter.visible = false; G.on.value = 0; } GS.on = false; return; }
      const ta = Math.tan(alt * Math.PI / 180), Dfar = Math.min(5000, he / Math.max(0.002, ta - 0.32)), Dnear = he / (ta + 0.16), hl = Math.hypot(md.x, md.z) || 1;
      const cover = sky.wx ? Math.max(0, Math.min(1, sky.wx.cover ?? 0)) : 0, sA = Math.max(Math.sin(alt * Math.PI / 180), 0), X = 1 / (sA + 0.025 * Math.exp(-11 * sA)), ext = Math.exp(-0.25 * (X - 1));
      const i = Math.min(1, 3.2 * Math.sqrt(st.moonPhase) * (0.4 + 0.6 * ext) * Math.min(1, alt / 2) * Math.max(0.05, 1 - 0.95 * cover)) * night;
      G.on.value = 1; G.eye.value.copy(eye); G.he.value = he; G.ta.value = ta; G.dir.value.set(md.x / hl, md.z / hl); G.vz.value = vz;
      G.col.value.setRGB(0.86, 0.9, 1).multiplyScalar(i * 0.8);
      // the quad: from 0.6 x the near end to 1.2 x the far end, 0.08 x the far end either side; on the water at the plane's level
      const L = Math.min(6000, Dfar * 1.2), W = Math.max(40, L * 0.16), n0 = Math.min(Dnear * 0.6, L * 0.5);
      glitter.position.set(eye.x + md.x / hl * n0, wl + 0.12, eye.z + md.z / hl * n0); glitter.rotation.set(0, Math.atan2(-md.x / hl, -md.z / hl), 0); glitter.scale.set(W, 1, L - n0);
      glitter.visible = true; Object.assign(GS, { on: true, i: +i.toFixed(3), D: Math.round(Dfar), near: Math.round(Dnear) });
    }

    const box = ctx.ui.toggle('Water mirror (reflections)', on0, v => set(v));
    stats.water = { vertices: mesh.geometry.attributes.position.count, triangles: mesh.geometry.index.count / 3, depth: D.stats, mirror: on0, mirrorLevel: level };
    Object.defineProperty(stats.water, 'mirrorLevel', { get: () => +planeY.toFixed(2), enumerable: true });
    Object.defineProperty(stats.water, 'mirror', { get: () => WU.reflect.value === 1, enumerable: true });
    Object.defineProperty(stats.water, 'mirrorBody', { get: () => ({ ...BODY }), enumerable: true });
    Object.defineProperty(stats.water, 'moonGlitter', { get: () => ({ ...GS }), enumerable: true });
    return { ownUi: true, setVisible: v => { box.checked = v; set(v); }, get glitter() { return { ...GS }; }, get body() { return { ...BODY }; } };
  },
};
