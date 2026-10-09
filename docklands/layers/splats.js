// Layer "splats" of the Three.js port (docklands/): Gaussian splats, ported from the WebGL page (cwplans/docklands/index.html,
// "Gaussian splats": SPL, svs/sfs, SORT_SRC, drawSplats, the "Splats only" depth pass). Off by default, as there.
// Sets: ../cwplans/docklands/data/splats/index.json (cw-synth 669,306 splats, cw-trained 167,073): standard 32-byte .splat
// records in model metres, gzipped; loaded and unpacked by ../splat-worker.js, which also sorts them far to near.
// Own renderer (no maintained three.js splat renderer works with WebGPURenderer in r186: Spark 2.3.1 and
// @mkkellogg/gaussian-splats-3d 0.4.7, both MIT, draw with RawShaderMaterial / ShaderMaterial and the WebGL context):
// one InstancedBufferGeometry quad, instanced attributes (one interleaved float buffer + one rgba byte buffer), the projected
// 2D covariance in the TSL vertex stage, Gaussian falloff in the fragment stage, premultiplied alpha blending, depth test,
// no depth write. One TSL graph for WebGPU and WebGL 2.
// Modes (?splats=off|with|only, ?splatset=cw-synth|cw-trained): "with the model" draws them over the model; "only" keeps
// the model in the depth buffer without colour (buildings, detailed models, terrain: a depth-only material with
// polygonOffset(2, 8), so splats that lie on a wall or the ground pass the test) and hides the water, greens, trees and the
// terrain ring, as the WebGL page does. Night dims them (x 0.16 at full night). Music (layer "music", MU): splats with a
// building stretch, turn and shake with its band, coloured green-yellow-red (the WebGL page's viz branch); in "only" with
// music the moving towers do not occlude (only the ground), as there. The water mirror does not draw the splats.
// Test hook: __docklands3.layers.splats.api (setMode, setSet, mode, stats). Skill: docklands-3d-page, "Three.js port".
import * as THREE from 'three/webgpu';
import { Fn, attribute, positionGeometry, cameraViewMatrix, cameraProjectionMatrix, uniform, float, int, vec2, vec3, vec4, clamp, max, min, sqrt, abs, dot, normalize, length, select, mix, exp, sin, cos, fract, time, varyingProperty, Discard, sRGBTransferEOTF } from 'three/tsl';
import { MU } from '../music.js';

const NB = 24;

function splatMaterial(U, S) {
  const vC = varyingProperty('vec4', 'vSplatC'), vQ = varyingProperty('vec2', 'vSplatQ');
  const hs = p => fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
  const m = new THREE.NodeMaterial();
  m.vertexNode = Fn(() => {
    const ctr = attribute('ctr', 'vec3'), ca = attribute('ca', 'vec3'), cb = attribute('cb', 'vec3'), g0 = attribute('g0', 'vec3'), g1 = attribute('g1', 'vec2');
    const corner = positionGeometry.xy, P = ctr.toVar(), sy = float(1).toVar();
    const col = attribute('col', 'vec4'), C = vec4(sRGBTransferEOTF(col.rgb).mul(S.dim), col.a).toVar();
    // music: stretch each building up from its base with its band, turn it about its own axis, shake it, light it
    const on = MU.viz.greaterThan(0.5).and(g0.x.greaterThanEqual(0));
    const lv = MU.bands.element(int(clamp(g0.x, 0, NB - 1))).mul(select(on, 1, 0));
    const rel = clamp(P.y.sub(g0.y).div(max(1, g0.z.sub(g0.y))), 0, 1);
    sy.assign(select(on, max(0.15, float(1).add(MU.k.x.mul(lv.mul(1.7).sub(0.35)))), 1));
    P.y.assign(g0.y.add(P.y.sub(g0.y).mul(sy)));
    const an = MU.k.z.mul(lv.mul(2.2).mul(rel).add(sin(time.mul(0.7).add(g0.x)).mul(0.25))).mul(select(on, 1, 0));
    const d0 = P.xz.sub(g1), cs = cos(an), sn = sin(an);
    P.xz.assign(select(on, g1.add(vec2(cs.mul(d0.x).sub(sn.mul(d0.y)), sn.mul(d0.x).add(cs.mul(d0.y)))), P.xz));
    const h = vec3(hs(ctr.add(time)), hs(ctr.zxy.sub(time)), hs(ctr.yzx.add(time.mul(1.3)))).sub(0.5);
    P.addAssign(h.mul(MU.k.y).mul(lv).mul(lv).mul(14));
    const e = rel.mul(lv), sp = select(e.lessThan(0.5), mix(vec3(0.1, 0.95, 0.25), vec3(1, 0.92, 0.1), e.mul(2)), mix(vec3(1, 0.92, 0.1), vec3(1, 0.15, 0.1), e.mul(2).sub(1)));
    C.rgb.assign(select(on, min(vec3(1), mix(C.rgb, sRGBTransferEOTF(sp).mul(S.dim), lv.mul(lv).mul(0.6).add(0.25))), C.rgb));
    // the projected 2D covariance (the WebGL page's svs): J W Sigma W^T J^T, a 0.3 px low pass, eigenvectors for the quad
    const V = cameraViewMatrix, cam = V.mul(vec4(P, 1)), d = cam.z.negate();
    const clip = cameraProjectionMatrix.mul(cam), ndc = clip.xyz.div(clip.w);
    const c0 = V.element(0), c1 = V.element(1), c2 = V.element(2), w0 = vec3(c0.x, c1.x, c2.x), w1 = vec3(c0.y, c1.y, c2.y), w2 = vec3(c0.z, c1.z, c2.z);
    const fx = cameraProjectionMatrix.element(0).x.mul(S.vp.x).mul(0.5), fy = cameraProjectionMatrix.element(1).y.mul(S.vp.y).mul(0.5);
    const r0 = w0.mul(fx.div(d)).add(w2.mul(fx.mul(cam.x).div(d.mul(d)))), r1 = w1.mul(fy.div(d)).add(w2.mul(fy.mul(cam.y).div(d.mul(d))));
    const row0 = vec3(ca.x, ca.y.mul(sy), ca.z), row1 = vec3(ca.y.mul(sy), cb.x.mul(sy).mul(sy), cb.y.mul(sy)), row2 = vec3(ca.z, cb.y.mul(sy), cb.z);
    const Vr0 = vec3(dot(row0, r0), dot(row1, r0), dot(row2, r0)), Vr1 = vec3(dot(row0, r1), dot(row1, r1), dot(row2, r1));
    const a = dot(r0, Vr0).add(0.3), b = dot(r0, Vr1), c = dot(r1, Vr1).add(0.3), mid = a.add(c).mul(0.5), rad = length(vec2(a.sub(c).mul(0.5), b));
    const l1 = mid.add(rad), l2 = max(mid.sub(rad), 0.1);
    const dv = select(abs(b).lessThan(1e-6), select(a.greaterThanEqual(c), vec2(1, 0), vec2(0, 1)), normalize(vec2(b, l1.sub(a))));
    const mj = dv.mul(min(sqrt(l1.mul(2)), 1024)), mn = vec2(dv.y, dv.x.negate()).mul(min(sqrt(l2.mul(2)), 1024));
    const cull = ctr.y.greaterThan(U.cut).or(d.lessThan(1)).or(abs(ndc.x).greaterThan(1.3)).or(abs(ndc.y).greaterThan(1.3));
    vQ.assign(corner); vC.assign(C);
    return select(cull, vec4(0, 0, 2, 1), vec4(ndc.xy.add(mj.mul(corner.x).add(mn.mul(corner.y)).mul(2).div(S.vp)), ndc.z, 1));
  })();
  m.fragmentNode = Fn(() => {
    const A = dot(vQ, vQ).negate(); Discard(A.lessThan(-4));
    const B = exp(A).mul(vC.a); return vec4(vC.rgb.mul(B), B);
  })();
  Object.assign(m, { transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  return m;
}

export default {
  id: 'splats', label: 'Gaussian splats', on: false, reveal: false,
  async init(ctx, on) {
    const { scene, camera, renderer, qs, ui, DATA, U, meshes, stats, draw } = ctx;
    const S = { vp: uniform(new THREE.Vector2(1, 1)), dim: uniform(1) };
    const ix = await ctx.loadJSON(DATA + 'splats/index.json').catch(() => ({ sets: [] }));
    const q = (qs.get('splats') || '').toLowerCase();
    let mode = !on ? 'off' : q === 'only' ? 'only' : 'with', setName = qs.get('splatset') || (ix.sets[0] && ix.sets[0].name) || 'cw-synth';
    // geometry: a quad (corners at +-2 sigma) and the instance buffers; a new geometry for each set loaded (the mesh is
    // hidden until the first one is there: r186 never draws a mesh first drawn with an empty geometry)
    const quad = () => { const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-2, -2, 0, 2, -2, 0, -2, 2, 0, 2, 2, 0]), 3)); g.setIndex([0, 1, 2, 2, 1, 3]); g.instanceCount = 0; return g; };
    const mat = splatMaterial(U, S), mesh = new THREE.Mesh(quad(), mat);
    Object.assign(mesh, { frustumCulled: false, renderOrder: 5, castShadow: false, receiveShadow: false, name: 'splats' }); mesh.raycast = () => {};
    let N = 0;
    // only the main camera draws them (the water mirror's camera would draw them a second time, in the wrong order)
    mesh.onBeforeRender = (r, s, cam) => { mesh.geometry.instanceCount = cam === camera ? N : 0; };
    const st = stats.splats = { set: null, n: 0, grouped: 0, fetchMs: 0, buildMs: 0, sorts: 0, sortMs: 0, uploadMs: 0, mode };

    // the worker: load, then sort when the view has moved enough (one sort at a time; the buffers go back and forth)
    let worker = null, pending = false, lastKey = '', loading = null, back = null;
    const attrs = n => {
      const geo = quad(), ib = new THREE.InstancedInterleavedBuffer(new Float32Array(n * 14), 14, 1).setUsage(THREE.DynamicDrawUsage);
      const cAttr = new THREE.InstancedBufferAttribute(new Uint8Array(n * 4), 4, true).setUsage(THREE.DynamicDrawUsage);
      for (const [k, s, o] of [['ctr', 3, 0], ['ca', 3, 3], ['cb', 3, 6], ['g0', 3, 9], ['g1', 2, 12]]) geo.setAttribute(k, new THREE.InterleavedBufferAttribute(ib, s, o));
      geo.setAttribute('col', cAttr); const old = mesh.geometry; mesh.geometry = geo; old.dispose(); return { ib, cAttr };
    };
    let A = null;
    const put = (f, c) => { const t0 = performance.now(); A.ib.array.set(new Float32Array(f)); A.ib.needsUpdate = true; A.cAttr.array.set(new Uint8Array(c)); A.cAttr.needsUpdate = true; st.uploadMs = +(performance.now() - t0).toFixed(1); };
    function load(name) {
      if (loading && loading.name === name) return loading.p;
      if (worker) worker.terminate();
      worker = new Worker(new URL('../splat-worker.js', import.meta.url)); pending = false; lastKey = ''; back = null; N = 0;
      const p = (async () => {
        const meta = await ctx.loadJSON(DATA + 'splats/' + name + '.json'), F = ctx.A.meta.focus, full = u => new URL(DATA + 'splats/' + u, location.href).href;
        return new Promise((res, rej) => {
          worker.onmessage = e => {
            const m = e.data;
            if (m.error) { rej(new Error(m.error)); return; }
            if (m.loaded) {
              A = attrs(m.n); put(m.f, m.c); N = m.n;
              Object.assign(st, { set: name, n: m.n, grouped: m.grouped, fetchMs: m.fetchMs, buildMs: m.buildMs, groups: m.grouped > 0 });
              note.textContent = `${m.n.toLocaleString('en-GB')} splats. ${meta.method || ''}`; res(); draw(); return;
            }
            if (m.sorted) { put(m.f, m.c); back = { f: m.f, c: m.c }; pending = false; st.sorts++; st.sortMs = +m.ms.toFixed(1); draw(); }
          };
          worker.postMessage({ load: { url: full(meta.file), groupsUrl: meta.groups_file ? full(meta.groups_file) : null, groups: meta.groups || null, box: [F.x0 - 150, F.x1 + 150] } });
        });
      })();
      loading = { name, p }; p.catch(() => { loading = null; }); return p;
    }
    function sort() {   // ask for a new order when the view has moved enough
      if (!worker || pending || !N) return;
      const e = camera.position, dir = new THREE.Vector3(); camera.getWorldDirection(dir);
      const key = [e.x / 4, e.y / 4, e.z / 4, dir.x * 40, dir.y * 40, dir.z * 40].map(Math.round).join(',');
      if (key === lastKey) return; lastKey = key; pending = true;
      const msg = { sort: { eye: [e.x, e.y, e.z], dir: [dir.x, dir.y, dir.z], key, f: back && back.f, c: back && back.c } };
      worker.postMessage(msg, back ? [back.f, back.c] : []); back = null;
    }

    // "Splats only": the model in the depth buffer without colour; water, greens, trees and the ring hidden
    const depthMat = new THREE.MeshBasicNodeMaterial({ colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 });
    const noDepth = new THREE.MeshBasicNodeMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
    const saved = new Map();   // mesh -> its own material while overridden
    const hidden = new Map();  // object -> its visibility before "only"
    const layerObj = id => { const L = globalThis.__docklands3 && __docklands3.layers[id]; return L && L.api && L.api.object; };
    function override(o, m) { o.traverse(x => { if (x.isMesh && x !== mesh) { if (!saved.has(x)) saved.set(x, x.material); if (x.material !== m) x.material = m; } }); }
    function onlyFrame() {
      const viz = MU.viz.value > 0.5;   // music: the towers move, so only the ground occludes (as the WebGL page)
      override(meshes.buildings, viz ? noDepth : depthMat); if (meshes.models) override(meshes.models, viz ? noDepth : depthMat); override(meshes.terrain, depthMat);
      for (const o of [meshes.water, meshes.greens, layerObj('trees'), layerObj('ring')]) if (o) { if (!hidden.has(o)) hidden.set(o, o.visible); o.visible = false; }
    }
    function restore() {
      for (const [x, m] of saved) x.material = m; saved.clear();
      for (const [o, v] of hidden) o.visible = v; hidden.clear();
    }

    ctx.onFrame(() => {
      if (mode === 'off' || !N) return;
      const sz = renderer.getDrawingBufferSize(new THREE.Vector2()); S.vp.value.copy(sz);
      S.dim.value = Math.pow(1 - 0.84 * U.night.value, 2.2);   // the WebGL page dims by 0.16 in sRGB; the node pipeline works in linear
      if (mode === 'only') onlyFrame();
      sort();
    });

    async function setMode(m) {
      m = m === 'mix' ? 'with' : m; if (!['off', 'with', 'only'].includes(m)) m = 'off';
      try { if (m !== 'off' && st.set !== setName) { note.textContent = 'Loading splats...'; await load(setName); } }
      catch (e) { console.warn('splats', e); note.textContent = 'Splats did not load: ' + e.message; m = 'off'; }
      mode = st.mode = m; sel.value = m; mesh.visible = m !== 'off'; if (m !== 'only') restore(); else onlyFrame(); draw();
    }
    async function setSet(name) { setName = name; setSel.value = name; if (mode !== 'off') { const m = mode; await load(name); await setMode(m); } }

    // menu: minimal (owner: menus to be reworked)
    ui.section('Gaussian splats');
    const row = (label, el) => { const l = document.createElement('label'); l.className = 'row'; l.append(label + ' ', el); ui.host().appendChild(l); return el; };
    const sel = row('Splats', document.createElement('select'));
    sel.innerHTML = '<option value="off">Off</option><option value="with">With the model</option><option value="only">Splats only</option>';
    sel.onchange = () => setMode(sel.value);
    const setSel = row('Set', document.createElement('select'));
    setSel.innerHTML = (ix.sets.length ? ix.sets : [{ name: setName, title: setName, count: 0 }]).map(x => `<option value="${ctx.esc(x.name)}">${ctx.esc(x.title)}${x.count ? ` (${x.count.toLocaleString('en-GB')})` : ''}</option>`).join('');
    setSel.value = setName; setSel.onchange = () => setSet(setSel.value);
    const note = ui.note('Sorted back to front and tested against the model\'s depth. "Splats only" keeps the model in the depth buffer without drawing it.');
    mesh.visible = false; scene.add(mesh);
    if (mode !== 'off') setMode(mode);   // loads in the background
    return { object: null, ownUi: true, setVisible: v => setMode(v ? (mode === 'off' ? 'with' : mode) : 'off'), setMode, setSet, get mode() { return mode; }, stats: st, mesh, load: () => loading && loading.p };
  },
};
