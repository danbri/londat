// Layer "trees" of the Three.js port (docklands/): the open tree data of the WebGL page (data/trees.json, built by
// cwplans/tools/build-trees.mjs: GLA Public Realm Trees, TPO points, OSM, Forest Research TOW; all OGL v3.0 but OSM, ODbL)
// with a species profile per tree (data/tree-species.json, cwplans/tools/build-tree-species.mjs: the tree's taxon, its OSM
// leaf tags, or a mix inferred from its setting; profiles in tree-species.js). Per tree: a tapered trunk, a low-poly
// crown of its shape class (broad, conical, columnar, weeping, small, birch) and, for deciduous trees, a twig crown (3
// crossed alpha-tested quads with a branch pattern) that shows in leaf-fall and winter. One InstancedMesh per shape class,
// one for the trunks, one for the twigs, one for the far form: 9 draw calls (and their shadow passes) for any number of trees.
// Level of detail (camera distance, 3D): the full tree within NEAR_M (at most NEAR_MAX trees, the nearest); beyond it, to
// FAR_M, one 10-triangle far form (a triangular antiprism with an apex) with the same colours, season and sway, no trunk, no shadow;
// none beyond FAR_M. The instances are re-selected when the camera has moved RESELECT_M, into preallocated buffers
// (mesh.count, update ranges); at most ~0.75 M triangles a frame before shadows.
// Size: height h = height_m, or a default by shape, +-15 %; crown spread = crown_m, or h x the profile's width ratio,
// +-15 %, clamped to 1.5 to 20 m; crown base at the profile's ratio of h; trees over 35 m are skipped (probably a crane or
// a structure the LiDAR took for a tree). Default: every tree of the file (?trees=near: the trees within 900 m of the estate).
// Seasons (no rebuild: per-instance attributes and one uniform, the day of the year of the page clock in London):
// leaf-out, young green, full green, the profile's autumn colour, leaf-fall (the crown shrinks and opens: noise holes,
// discarded fragments), bare (crown collapsed, twigs); blossom around the profile's bloom day (the whole crown when it
// comes before the leaves, patches in leaf); evergreens unchanged. STATS.trees: counts (trees, drawn, species known), and
// .season / .seasonAt(day): leaf fraction, autumn-colour share, bloom share, for all, evergreen, deciduous and by profile.
// Wind: the crowns sway in the vertex stage, in proportion to WU.windSpeed towards WU.windDir (water.js), while frames run.
// Skill: docklands-3d-page, "Three.js port" (Trees).
import { Fn, If, Discard, positionWorld, positionGeometry, positionLocal, vec2, vec3, vec4, float, uniform, instancedBufferAttribute, smoothstep,
  mix, max, abs, sin, cos, time, uv, mx_noise_float, clamp, length, dot, select } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { A, groundAt } from '../build.js';
import { WU } from '../water.js';
import { PROFILES, PROFILE, SHAPES, B64, profileOf, hash01 } from '../tree-species.js';

const uDay = uniform(180);   // day of the year (1 = 1 January), fractional, London time
const DEFAULT_H = { broad: 10, conical: 11, columnar: 12, weeping: 9, small: 6, birch: 9 };

// unit geometries: crowns in x, z -0.5..0.5, y 0..1
function shapes(THREE) {
  const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const jitter = (g, k) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = Math.sin(x * 12.9 + y * 78.2 + z * 37.7) * 43758.5; p.setXYZ(i, x * (1 + k * (n - Math.floor(n) - .5)), y, z * (1 + k * (Math.sin(n) * .5))); } return g; };
  const ico = THREE.IcosahedronGeometry, dod = THREE.DodecahedronGeometry;
  const g = {
    broad: jitter(new dod(.5, 0).translate(0, .5, 0), .18),
    conical: mergeGeometries([new THREE.ConeGeometry(.5, .62, 7, 1).translate(0, .31, 0), new THREE.ConeGeometry(.36, .56, 7, 1, true).translate(0, .72, 0).rotateY(.45)]),
    columnar: lathe([[0, 0], [.42, .12], [.5, .5], [.3, .86], [0, 1]], 6),
    weeping: lathe([[.12, 0], [.42, .04], [.5, .38], [.46, .72], [.26, .93], [0, 1]], 7),
    small: jitter(new ico(.5, 0).translate(0, .5, 0), .15),
    birch: lathe([[0, 0], [.36, .18], [.5, .55], [.28, .88], [0, 1]], 5),
  };
  for (const k in g) { g[k].deleteAttribute('uv'); g[k] = g[k].index ? g[k].toNonIndexed() : g[k]; g[k].computeVertexNormals(); }
  const twigs = mergeGeometries([0, 1, 2].map(i => new THREE.PlaneGeometry(1, 1).translate(0, .5, 0).rotateY(i * Math.PI / 3)));
  const trunk = new THREE.CylinderGeometry(.32, .5, 1, 5, 1, true).translate(0, .5, 0); trunk.deleteAttribute('uv');
  // far form, 10 triangles: a triangle at y 0.25 (base), a triangle turned 60 degrees at y 0.72, an apex at y 1
  const ring = (r, y, a0) => [0, 1, 2].map(i => [r * Math.sin(a0 + i * 2.0944), y, r * Math.cos(a0 + i * 2.0944)]);
  const L = ring(.5, .25, 0), M = ring(.5, .72, 1.0472), T = [0, 1, 0], tri = [];
  tri.push([L[0], L[2], L[1]]);
  for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; tri.push([L[i], L[j], M[i]], [M[i], L[j], M[j]], [M[i], M[j], T]); }
  const far = new THREE.BufferGeometry(); far.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(2), 3)); far.computeVertexNormals();
  return { crowns: g, twigs, trunk, far };
}
const NEAR_M = 380, NEAR_MAX = 9000, FAR_M = 6500, RESELECT_M = 25;
const tris = g => (g.index ? g.index.count : g.attributes.position.count) / 3;

// the leaf state of a tree on uDay: cal = (leaf-out day, autumn colour day, bare day, evergreen 1 | 0), bloom.w = bloom day | 0
function season(cal, bloom) {
  const grow = smoothstep(cal.x.sub(12), cal.x.add(20), uDay), fall = smoothstep(cal.y.add(12), cal.z, uDay);
  const bl = select(bloom.w.greaterThan(0), smoothstep(4, 14, abs(uDay.sub(bloom.w))).oneMinus(), float(0));
  const dens = select(cal.w.greaterThan(.5), float(1), max(grow.mul(fall.oneMinus()), bl.mul(.9)));
  return { grow, dens, bl };
}

export default {
  id: 'trees', label: 'Trees', on: true,
  async init(ctx) {
    const { THREE, U, camera } = ctx, t0 = performance.now();
    const [D, S] = await Promise.all([ctx.loadJSON(ctx.DATA + 'trees.json'), ctx.loadJSON(ctx.DATA + 'tree-species.json').catch(() => null)]);
    const tLoad = performance.now() - t0;
    const sp = S && S.n === D.trees.length ? S : null;   // a profile file for another trees.json is not used: profiles from the taxon only
    const spProf = D.species.map(([a, b]) => { const id = profileOf(a, b); return id ? PROFILE[id] : -1; });
    const F = A.meta.focus, B = [F.x0 - 900, F.x1 + 900, F.z0 - 900, F.z1 + 900];
    const rows = [];
    D.trees.forEach((t, k) => { if (t[2] > 35) return;
      const prof = sp ? B64.indexOf(sp.p[k]) : t[4] >= 0 && spProf[t[4]] >= 0 ? spProf[t[4]] : PROFILE.broadleaf;
      rows.push({ t, k, prof, est: t[0] >= B[0] && t[0] <= B[1] && t[1] >= B[2] && t[1] <= B[3], inferred: sp ? !/[SG]/.test(sp.b[k]) : !(t[4] >= 0 && spProf[t[4]] >= 0), species: sp ? sp.b[k] === 'S' : false }); });
    const N = rows.length, nEst = rows.filter(r => r.est).length;

    // ---- one store of every tree's instance data (matrices and attributes), copied into the meshes' slots on re-select
    const G = shapes(THREE), col = new THREE.Color();
    const lin = (rgb, f = 1) => { col.setRGB(rgb[0] * f, rgb[1] * f, rgb[2] * f, THREE.SRGBColorSpace); return [col.r, col.g, col.b]; };
    const put = (a, k, sx, sy, sz, x, y, z) => { const o = 16 * k; a[o] = sx; a[o + 5] = sy; a[o + 10] = sz; a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1; };
    const ST = { CM: new Float32Array(N * 16), TM: new Float32Array(N * 16), WM: new Float32Array(N * 16), FM: new Float32Array(N * 16) };
    for (const k of ['mid', 'fmid', 'leaf', 'aut', 'cal', 'bloom', 'bark']) ST[k] = new Float32Array(N * 4);
    const SH = new Uint8Array(N), EV = new Uint8Array(N), X = new Float32Array(N), Y = new Float32Array(N), Z = new Float32Array(N);
    rows.forEach((r, i) => {
      const P = PROFILES[r.prof], [x, z, h0, c0] = r.t, j = hash01(D.ids[r.k] || String(r.k));
      const h = h0 || DEFAULT_H[SHAPES[P.shape]] * (.85 + .3 * j), c = Math.max(1.5, Math.min(20, c0 || h * P.cw * (.85 + .3 * hash01('c' + r.k))));
      const g = groundAt(x, z), base = h * P.cb, dj = (j - .5) * 10, tone = .9 + .2 * hash01('t' + r.k);   // +-5 days a tree
      SH[i] = P.shape; EV[i] = P.ever; X[i] = x; Z[i] = z;
      put(ST.CM, i, c, h - base, c, x, g + base, z); ST.mid.set([x, g + base + .45 * (h - base), z, h - base], 4 * i);
      const d = Math.max(.25, Math.min(1.2, h * .045));
      put(ST.TM, i, d, h * (P.ever && P.shape === 1 ? .35 : Math.max(.45, P.cb + .15)), d, x, g, z);
      const y0 = h * Math.min(.3, P.cb * .8 + .08); put(ST.WM, i, c * .95, h - y0, c * .95, x, g + y0, z);
      const fb = h * Math.min(P.cb, .3); put(ST.FM, i, c, h - fb, c, x, g + fb, z); ST.fmid.set([x, g + fb + .45 * (h - fb), z, h - fb], 4 * i); Y[i] = g + fb + .45 * (h - fb);   // LOD distance: to the far form's centre
      ST.leaf.set([...lin(P.leaf, tone), j], 4 * i); ST.aut.set([...lin(P.aut, tone), P.airy], 4 * i);
      ST.cal.set([P.out + dj, P.col + dj, P.bare + dj, P.ever], 4 * i);
      ST.bloom.set(P.bloom ? [...lin(P.bloom), P.bloom[3] + dj * .6] : [0, 0, 0, 0], 4 * i);
      ST.bark.set([...lin(P.bark, .9 + .2 * hash01('b' + r.k)), P.pat + hash01('s' + r.k) * .5], 4 * i);
    });

    // ---- meshes with preallocated instance buffers; attrs maps an attribute name to its store array
    const group = new THREE.Group(); group.name = 'trees';
    const cutOk = () => { If(positionWorld.y.greaterThan(U.cut), () => { Discard(); }); };
    const windTo = () => { const a = WU.windDir.mul(Math.PI / 180); return vec2(sin(a).negate(), cos(a)); };
    const meshes = [];
    function makeMesh(name, geom, cap, matrix, attrs, shadow) {
      const A4 = {}, nodes = {};
      for (const [k, src] of Object.entries(attrs)) { A4[k] = { attr: new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4), src: ST[src] }; A4[k].attr.setUsage(THREE.DynamicDrawUsage); nodes[k] = instancedBufferAttribute(A4[k].attr); }
      const mat = new THREE.MeshStandardNodeMaterial({ roughness: .92, metalness: 0, flatShading: true });
      const mesh = new THREE.InstancedMesh(geom, mat, cap); mesh.name = name; mesh.count = 0; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.castShadow = shadow; mesh.receiveShadow = true;
      const rec = { name, mesh, mat, nodes, A4, M: ST[matrix], n: 0, tris: tris(geom) };
      meshes.push(rec); group.add(mesh); return rec;
    }
    // crown colour and leaf density (shared by the crowns and the far form)
    const crownColour = (nd, p) => {
      const { grow, dens, bl } = season(nd.cal, nd.bloom), { leaf, aut, cal, bloom } = nd;
      const young = mix(leaf.xyz.mul(1.15).add(vec3(.035, .05, 0)), leaf.xyz, smoothstep(cal.x, cal.x.add(40), uDay));
      const t = smoothstep(cal.y.sub(8), cal.y.add(18), uDay), late = smoothstep(cal.y.add(18), cal.z, uDay);
      const autumn = mix(aut.xyz, aut.xyz.mul(.55).add(vec3(.05, .03, .01)), late.mul(.6));
      const c = select(cal.w.greaterThan(.5), leaf.xyz, mix(young, autumn, t)).toVar();
      const spot = mx_noise_float(p.mul(14).add(leaf.w.mul(7))).mul(.5).add(.5);
      // blossom: before the leaves the whole crown is flower (no green on a bare tree: cherry plum, magnolia); in leaf, patches
      c.assign(mix(c, bloom.xyz, bl.mul(mix(float(1), smoothstep(.3, .55, spot), grow)).mul(grow.mul(.35).oneMinus())));
      return { c, dens };
    };
    const swayed = (nd, q, p) => {
      const sway = WU.windSpeed.mul(.003).mul(nd.mid.w).mul(sin(time.mul(float(1.1).add(nd.leaf.w.mul(.6))).add(nd.leaf.w.mul(6.283))).mul(.5).add(.75)).mul(p.y.mul(p.y));
      const w = windTo(); return vec3(q.x.add(w.x.mul(sway)), q.y, q.z.add(w.y.mul(sway)));
    };
    const crownAttrs = { mid: 'mid', leaf: 'leaf', aut: 'aut', cal: 'cal', bloom: 'bloom' };
    const crowns = SHAPES.map((name, s) => {
      const cap = Math.min(NEAR_MAX, SH.reduce((n, v) => n + (v === s), 0)); if (!cap) return null;
      const R = makeMesh('crowns-' + name, G.crowns[name], cap, 'CM', crownAttrs, true), nd = R.nodes;
      // positionLocal is after the instance matrix (model metres): mid = (crown centre x, y, z; crown height)
      R.mat.positionNode = Fn(() => {
        const { dens } = season(nd.cal, nd.bloom);
        const sc = select(dens.lessThan(.04), float(0), mix(float(.6), float(1), dens));   // bare: the crown collapses
        return swayed(nd, mix(nd.mid.xyz, positionLocal, sc), positionGeometry);
      })();
      R.mat.colorNode = Fn(() => {
        cutOk();
        const p = positionGeometry, { c, dens } = crownColour(nd, p);
        const n = mx_noise_float(p.mul(vec3(4.2, 3.6, 4.2)).add(nd.leaf.w.mul(31))).mul(.5).add(.5);
        If(n.greaterThan(dens.mul(nd.aut.w.mul(.45).oneMinus()).mul(1.15)), () => { Discard(); });   // leaf-fall and airy crowns: holes
        return vec4(c.mul(n.mul(.25).add(.85)), 1);
      })();
      return R;
    });

    const barkColour = (bark, p) => {
      const pat = bark.w.floor(), seed = bark.w.fract().mul(40);
      const n = mx_noise_float(p.mul(vec3(5, 2.2, 5)).add(seed)).mul(.5).add(.5);
      const plane = mix(bark.xyz, vec3(.20, .21, .13), smoothstep(.48, .56, n).mul(.65));   // plane: olive and cream patches
      const band = mx_noise_float(p.mul(vec3(2, 26, 2)).add(seed)).mul(.5).add(.5);
      const birch = mix(bark.xyz, vec3(.05, .05, .05), smoothstep(.62, .7, band));          // birch: white with dark bands
      const cherry = bark.xyz.mul(smoothstep(.55, .62, band).mul(.3).oneMinus());             // cherry: banded lenticels
      return select(pat.equal(1), plane, select(pat.equal(2), birch, select(pat.equal(3), cherry, bark.xyz.mul(n.mul(.2).add(.9)))));
    };
    const twigTone = bark => mix(bark.xyz, vec3(.09, .075, .065), .55);   // twigs are darker than the trunk bark

    const trunks = makeMesh('trunks', G.trunk, Math.min(N, NEAR_MAX), 'TM', { bark: 'bark' }, true);
    trunks.mat.roughness = .95;
    trunks.mat.colorNode = Fn(() => { cutOk(); return vec4(barkColour(trunks.nodes.bark, positionGeometry), 1); })();

    const nDec = EV.reduce((n, v) => n + !v, 0);
    const twigs = makeMesh('twigs', G.twigs, Math.min(nDec, NEAR_MAX), 'WM', { cal: 'cal', aut: 'aut', bloom: 'bloom', bark: 'bark' }, false);
    twigs.mat.flatShading = false; twigs.mat.side = THREE.DoubleSide; twigs.mat.roughness = .95;
    { const nd = twigs.nodes;
      twigs.mat.positionNode = Fn(() => {   // only once most leaves are gone: the twig quads are full size, the crown in leaf-fall
        // shrinks to 60 to 100 %, so twigs shown earlier stuck out of a green crown (owner, 2026-10-09: "a big green tree with
        // weird twigs sticking out freakishly")
        const { dens } = season(nd.cal, nd.bloom);
        return select(dens.greaterThan(.55), vec3(0, -1e4, 0), positionLocal);
      })();
      // a branch pattern on each quad: a stem, eight branches, and a haze of fine twigs inside the crown outline
      const SEG = [[.5, 0, .5, .97, .05], [.5, .1, .1, .55, .03], [.5, .18, .9, .6, .03], [.5, .32, .18, .8, .026], [.5, .4, .84, .84, .026],
        [.5, .55, .3, .97, .02], [.5, .6, .72, .98, .02], [.3, .33, .04, .48, .015], [.72, .4, .97, .52, .015]];
      twigs.mat.colorNode = Fn(() => {
        cutOk();
        const q = uv(), seed = nd.bark.w.fract().mul(40);
        let keep = float(-1);
        for (const [x0, y0, x1, y1, wd] of SEG) {
          const a = vec2(x0, y0), ba = vec2(x1 - x0, y1 - y0), pa = q.sub(a);
          const d = length(pa.sub(ba.mul(clamp(dot(pa, ba).div(dot(ba, ba)), 0, 1))));
          keep = max(keep, float(wd).mul(q.y.mul(.5).oneMinus()).sub(d));
        }
        const e = length(q.sub(vec2(.5, .62)).div(vec2(.47, .38)));
        const fine = mx_noise_float(vec3(q.mul(46), seed)).mul(.5).add(.5);
        If(keep.lessThan(0).and(e.greaterThan(1).or(fine.lessThan(.66))), () => { Discard(); });
        return vec4(twigTone(nd.bark), 1);
      })();
    }

    // far form: a 10-triangle blob over the crown; bare deciduous trees show as a thin twig-coloured haze
    // It holds every tree, written once (and again on the All switch); the vertex stage hides it within the near radius of
    // the last re-select (uSel, uNearR2: the near trees are drawn in full there) and beyond FAR_M, so a re-select copies only
    // the near trees.
    const far = makeMesh('far', G.far, N, 'FM', { mid: 'fmid', leaf: 'leaf', aut: 'aut', cal: 'cal', bloom: 'bloom' }, false);   // 5 attributes: WebGPU allows 8 vertex buffers (position, normal, matrix + 5)
    const uSel = uniform(new THREE.Vector3(0, 1e6, 0)), uNearR2 = uniform(NEAR_M * NEAR_M);
    { const nd = far.nodes;
      far.mat.positionNode = Fn(() => {
        const { dens } = season(nd.cal, nd.bloom), dv = nd.mid.xyz.sub(uSel), dd = dot(dv, dv);
        const q = swayed(nd, mix(nd.mid.xyz, positionLocal, mix(float(.8), float(1), dens)), positionGeometry);
        return select(dd.lessThanEqual(uNearR2).or(dd.greaterThan(FAR_M * FAR_M)), vec3(0, -1e4, 0), q);
      })();
      far.mat.colorNode = Fn(() => {
        cutOk();
        const p = positionGeometry, { c, dens } = crownColour(nd, p);
        const n = mx_noise_float(p.mul(5).add(nd.leaf.w.mul(31))).mul(.5).add(.5);
        If(n.greaterThan(max(dens, .45).mul(1.15)), () => { Discard(); });
        return vec4(mix(vec3(.06, .05, .04), c, smoothstep(0, .5, dens)).mul(n.mul(.25).add(.85)), 1);   // bare: a dark twig tone (linear)
      })();
    }

    // ---- level of detail: re-select when the camera has moved RESELECT_M
    let ALL = ctx.qs.get('trees') !== 'near', last = null;
    const d2 = new Float32Array(N), cand = [];
    const copy = (R, slot, i) => { R.mesh.instanceMatrix.array.set(R.M.subarray(16 * i, 16 * i + 16), 16 * slot); for (const k in R.A4) R.A4[k].attr.array.set(R.A4[k].src.subarray(4 * i, 4 * i + 4), 4 * slot); };
    const upload = (R, all) => { const m = R.mesh, n = all ? m.instanceMatrix.count : R.n;
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, n * 16); m.instanceMatrix.needsUpdate = true;
      for (const k in R.A4) { const a = R.A4[k].attr; a.clearUpdateRanges(); a.addUpdateRange(0, n * 4); a.needsUpdate = true; } };
    function fillFar() {   // every tree shown (All switch), once
      far.n = 0; for (let i = 0; i < N; i++) if (ALL || rows[i].est) copy(far, far.n++, i);
      far.mesh.count = far.n; upload(far);
    }
    function reselect() {
      const t = performance.now(), cp = camera.position; let nearR2 = NEAR_M * NEAR_M;
      for (const R of meshes) if (R && R !== far) R.n = 0;
      cand.length = 0;
      for (let i = 0; i < N; i++) {
        if (!ALL && !rows[i].est) { d2[i] = Infinity; continue; }
        const dx = X[i] - cp.x, dy = Y[i] - cp.y, dz = Z[i] - cp.z; d2[i] = dx * dx + dy * dy + dz * dz;
        if (d2[i] <= nearR2) cand.push(i);
      }
      if (cand.length > NEAR_MAX) { cand.sort((a, b) => d2[a] - d2[b]); cand.length = NEAR_MAX; nearR2 = d2[cand[NEAR_MAX - 1]]; }
      for (const i of cand) { const R = crowns[SH[i]]; copy(R, R.n++, i); copy(trunks, trunks.n++, i); if (!EV[i]) copy(twigs, twigs.n++, i); }
      let tri = 0, nFar = 0;
      for (let i = 0; i < N; i++) if (d2[i] > nearR2 && d2[i] <= FAR_M * FAR_M) nFar++;
      // triangles submitted: the far forms hidden in the vertex stage count too
      for (const R of meshes) { if (R === far) { tri += far.n * R.tris; continue; } R.mesh.count = R.n; tri += R.n * R.tris; upload(R); }
      uSel.value.copy(cp); uNearR2.value = nearR2;
      last = cp.clone();
      Object.assign(stats, { near: cand.length, far: nFar, farDrawn: far.n, triangles: tri, reselectMs: Math.round((performance.now() - t) * 10) / 10, reselects: stats.reselects + 1 });
    }

    // ---- the season follows the page clock
    const dayOf = t => { const d = new Date(t), s = d.toLocaleString('en-CA', { timeZone: 'Europe/London', hourCycle: 'h23' });   // "2026-07-15, 13:00:00"
      const [y, mo, da] = s.slice(0, 10).split('-').map(Number), hh = +s.slice(12, 14), mm = +s.slice(15, 17);
      return (Date.UTC(y, mo - 1, da) - Date.UTC(y, 0, 1)) / 864e5 + 1 + (hh + mm / 60) / 24; };
    let lastClock = NaN;
    const byProfile = {}; for (const r of rows) byProfile[PROFILES[r.prof].id] = (byProfile[PROFILES[r.prof].id] || 0) + 1;
    const inferred = rows.filter(r => r.inferred).length;
    const stats = { file: D.trees.length, over35: D.trees.length - N, near900: nEst, instances: 0, near: 0, far: 0, triangles: 0, drawCalls: meshes.filter(Boolean).length,
      lod: { nearM: NEAR_M, nearMax: NEAR_MAX, farM: FAR_M, reselectM: RESELECT_M }, deciduous: nDec, inferred, speciesFile: !!sp, day: 0, reselects: 0, reselectMs: 0, loadMs: Math.round(tLoad), buildMs: 0 };
    // STATS.trees.season: the leaf state of the shown trees on the clock's day, computed on the CPU with the shader's formulas
    // (season(), crownColour()): leaf = foliage density (0 bare, 1 full), autumn = the autumn-colour mix t, bloom = blossom
    // strength. leafFraction: mean leaf; autumnShare: the share of the foliage (leaf-weighted) whose colour is more than half
    // autumn; bloomShare: the share of trees with blossom above 0.5; byProfile: the same per profile (the 12 most common).
    const ss = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
    const leafState = (i, day) => { const o = 4 * i, c = ST.cal, bw = ST.bloom[o + 3], ever = c[o + 3] > .5;
      const grow = ss(c[o] - 12, c[o] + 20, day), fall = ss(c[o + 1] + 12, c[o + 2], day), bl = bw > 0 ? 1 - ss(4, 14, Math.abs(day - bw)) : 0;
      return { ever, leaf: ever ? 1 : grow * (1 - fall), aut: ever ? 0 : ss(c[o + 1] - 8, c[o + 1] + 18, day), bl }; };
    const topProfiles = Object.entries(rows.reduce((o, r) => ((o[r.prof] = (o[r.prof] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k]) => +k);
    let seasonCache = null;
    function seasonStats(day) {
      if (seasonCache && seasonCache.day === day && seasonCache.all === ALL) return seasonCache.v;
      const acc = () => ({ n: 0, leaf: 0, autLeaf: 0, bloom: 0 }), all = acc(), ev = acc(), de = acc(), bp = {};
      for (let i = 0; i < N; i++) { if (!ALL && !rows[i].est) continue; const s = leafState(i, day), a = s.aut > .5 ? s.leaf : 0, b = s.bl > .5 ? 1 : 0;
        for (const q of [all, s.ever ? ev : de, bp[rows[i].prof] ||= acc()]) { q.n++; q.leaf += s.leaf; q.autLeaf += a; q.bloom += b; } }
      const out = q => q.n ? { trees: q.n, leafFraction: +(q.leaf / q.n).toFixed(3), autumnShare: q.leaf > 1e-6 ? +(q.autLeaf / q.leaf).toFixed(3) : 0, bloomShare: +(q.bloom / q.n).toFixed(3) } : null;
      const v = { day: Math.round(day * 10) / 10, ...out(all), evergreen: out(ev), deciduous: out(de),
        byProfile: Object.fromEntries(topProfiles.filter(k => bp[k]).map(k => [PROFILES[k].id, out(bp[k])])) };
      seasonCache = { day, all: ALL, v }; return v;
    }
    const nSpecies = rows.filter(r => r.species).length;
    Object.assign(stats, { trees: N, speciesKnown: N - inferred, speciesKnownShare: +((N - inferred) / N).toFixed(3), speciesLevel: nSpecies, speciesLevelShare: +(nSpecies / N).toFixed(3),
      evergreen: N - nDec, byProfile });
    Object.defineProperty(stats, 'drawn', { enumerable: true, get: () => ({ full: stats.near, farForms: stats.far, total: stats.near + stats.far }) });
    Object.defineProperty(stats, 'season', { enumerable: true, get: () => seasonStats(uDay.value) });
    stats.seasonAt = day => seasonStats(day);   // tests: the season stats of any day of the year without a render
    ctx.stats.trees = stats;
    ctx.onFrame(() => {
      if (ctx.clock !== lastClock) { lastClock = ctx.clock; uDay.value = dayOf(lastClock); stats.day = Math.round(uDay.value * 10) / 10; }
      if (group.visible && (!last || last.distanceTo(camera.position) > RESELECT_M)) reselect();
    });
    function setAll(all) { ALL = all; fillFar(); Object.assign(stats, { all, instances: all ? N : nEst }); last = null; ctx.draw(); }
    setAll(ALL);   // all trees by default (owner, 2026-10-09: "Default to all trees"); ?trees=near: within 900 m of the estate
    stats.buildMs = Math.round(performance.now() - t0 - tLoad);
    ctx.ui.toggle(`All trees in the model box (${N.toLocaleString('en-GB')}, not only the ${nEst.toLocaleString('en-GB')} within 900 m of the estate)`, stats.all, setAll);
    ctx.ui.note(`Trees: GLA, Forest Research, OS, planning.data (OGL v3.0); OpenStreetMap (ODbL). Species from the data for ${(N - inferred).toLocaleString('en-GB')} trees; ${inferred.toLocaleString('en-GB')} inferred from the setting (street, park, wood, waterside). Leaves and blossom follow the clock's date. Full trees within ${NEAR_M} m of the camera, a simple form to ${FAR_M / 1000} km.`);
    return { object: group, stats, setVisible(on) { group.visible = on; if (on) last = null; ctx.draw(); }, reselect };
  },
};
