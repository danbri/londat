// Layer "trees" of the Three.js port (docklands/): the open tree data of the WebGL page (data/trees.json, built by
// cwplans/tools/build-trees.mjs: GLA Public Realm Trees, TPO points, OSM, Forest Research TOW; all OGL v3.0 but OSM, ODbL)
// with a species profile per tree (data/tree-species.json, cwplans/tools/build-tree-species.mjs: the tree's taxon, its OSM
// leaf tags, or a mix inferred from its setting; profiles in tree-species.js). Per tree: a tapered trunk, a low-poly
// crown of its shape class (broad, conical, columnar, weeping, small, birch) and, for deciduous trees, a twig crown (3
// crossed alpha-tested quads with a branch pattern) that shows in leaf-fall and winter. One InstancedMesh per shape class,
// one for the trunks, one for the twigs (the full trees), one instanced mesh for the far form and one for the specks:
// 10 draw calls (and the shadow passes of the full trees) for any number of trees.
// Level of detail (LOD step 3, 2026-10-20; the rule of main.js ctx.lod: an object that covers fewer than 32 CSS px shows
// its stand-in): the trees are kept in cells of CELL m (192 cells in the model box), each cell a contiguous block of the
// tree store (trees within 900 m of the estate first, for ?trees=near). Every frame each cell gets a level from its
// distance to the camera (nearest point of its box) and the frustum: hidden (out of the view, or its trees under
// PX_HIDE px), specks (a 2-triangle disc facing the camera, coloured and lit as the crown, under PX_FAR px), far forms
// (10 triangles, a triangular antiprism with an apex) or near. In a near cell each tree is full (crown, trunk, twigs,
// shadow) while its height covers LOD.px (at most NEAR_MAX trees, the nearest), else a far form. The far forms of whole
// cells and the specks are copied cell by cell into their instance buffers only when a cell needs a better form than it
// has (the copy takes the cells of a frustum widened by WIDE, so turning the view rarely copies); the near cells' trees
// are re-selected when the camera has moved RESELECT_M or the near cells change. ?lod=0: every tree full (the NEAR_MAX
// nearest) or a far form, no culling.
// Memory: the store is one compact record a tree (position, size, profile, seeds: 46 bytes); the instance data of each
// form are written from it on a copy, and data/trees.json is not kept after the build.
// Size: height h = height_m, or a default by shape, +-15 %; crown spread = crown_m, or h x the profile's width ratio,
// +-15 %, clamped to 1.5 to 20 m; crown base at the profile's ratio of h; trees over 35 m are skipped (probably a crane or
// a structure the LiDAR took for a tree). Default: every tree of the file (?trees=near: the trees within 900 m of the estate).
// Seasons (no rebuild: per-instance attributes and one uniform, the day of the year of the page clock in London):
// leaf-out, young green, full green, the profile's autumn colour, leaf-fall (the crown shrinks and opens: noise holes,
// discarded fragments), bare (crown collapsed, twigs); blossom around the profile's bloom day (the whole crown when it
// comes before the leaves, patches in leaf); evergreens unchanged. STATS.trees: counts (trees, drawn, species known), and
// .season / .seasonAt(day): leaf fraction, autumn-colour share, bloom share, for all, evergreen, deciduous and by profile.
// Wind: the crowns sway in the vertex stage, in proportion to WU.windSpeed towards WU.windDir (water.js), while frames run.
// Skill: docklands-3d-page, "Three.js port" (Trees) and "Three.js port: trees by cell, JS heap (2026-10-20)".
import { Fn, If, Discard, positionWorld, positionGeometry, positionLocal, vec2, vec3, vec4, float, uniform, instancedBufferAttribute, attribute, smoothstep,
  mix, max, abs, sin, cos, time, uv, mx_noise_float, mx_noise_vec3, clamp, length, dot, select, normalize, sqrt, cameraPosition, cameraViewMatrix } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { A, surfaceAt } from '../build.js';
import { WU } from '../water.js';
import { PROFILES, PROFILE, SHAPES, B64, profileOf, hash01 } from '../tree-species.js';

export const uDay = uniform(180);   // day of the year (1 = 1 January), fractional, London time
export const DEFAULT_H = { broad: 10, conical: 11, columnar: 12, weeping: 9, small: 6, birch: 9 };

// unit geometries: crowns in x, z -0.5..0.5, y 0..1
export function shapes(THREE) {
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
  // speck: a quad, corners (u, v) in -1..1 (the vertex stage turns it to the camera)
  const speck = new THREE.BufferGeometry(); speck.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); speck.setIndex([0, 1, 2, 0, 2, 3]);
  return { crowns: g, twigs, trunk, far, speck };
}
export const CELL = 500, NEAR_MAX = 9000, RESELECT_M = 25, PX_FAR = 8, PX_HIDE = 2, WIDE = 1.5, MARGIN_NEAR = 80;
const tris = g => (g.index ? g.index.count : g.attributes.position.count) / 3;

// the leaf state of a tree on uDay: cal = (leaf-out day, autumn colour day, bare day, evergreen 1 | 0), bloom.w = bloom day | 0
export function season(cal, bloom, day = uDay) {   // day: the day-of-year uniform (a place on the globe has its own: globe/place-look.js)
  const grow = smoothstep(cal.x.sub(12), cal.x.add(20), day), fall = smoothstep(cal.y.add(12), cal.z, day);
  const bl = select(bloom.w.greaterThan(0), smoothstep(4, 14, abs(day.sub(bloom.w))).oneMinus(), float(0));
  const dens = select(cal.w.greaterThan(.5), float(1), max(grow.mul(fall.oneMinus()), bl.mul(.9)));
  return { grow, dens, bl };
}

export default {
  id: 'trees', label: 'Trees', on: true,
  async init(ctx) {
    const { THREE, U, camera } = ctx, t0 = performance.now();
    let [D, S] = await Promise.all([ctx.loadJSON(ctx.DATA + 'trees.json'), ctx.loadJSON(ctx.DATA + 'tree-species.json').catch(() => null)]);
    const tLoad = performance.now() - t0;
    let sp = S && S.n === D.trees.length ? S : null;   // a profile file for another trees.json is not used: profiles from the taxon only
    const spProf = D.species.map(([a, b]) => { const id = profileOf(a, b); return id ? PROFILE[id] : -1; });
    const F = A.meta.focus, B = [F.x0 - 900, F.x1 + 900, F.z0 - 900, F.z1 + 900];
    const nFile = D.trees.length;

    // ---- the store, in cell order (trees within 900 m of the estate first in each cell): one compact record a tree
    let keep = [];
    D.trees.forEach((t, k) => { if (t[2] > 35) return; keep.push(k); });
    const N = keep.length; let cellKey = new Int32Array(N), estOf = new Uint8Array(N);
    keep.forEach((k, i) => { const t = D.trees[k]; cellKey[i] = (Math.floor(t[0] / CELL) + 1000) * 4096 + Math.floor(t[1] / CELL) + 1000;
      estOf[i] = t[0] >= B[0] && t[0] <= B[1] && t[1] >= B[2] && t[1] <= B[3] ? 1 : 0; });
    let ord = Array.from(keep.keys()).sort((a, b) => cellKey[a] - cellKey[b] || estOf[b] - estOf[a] || a - b);
    // per tree: X, Z, GY (ground), HH (height), CC (crown spread), J (seed), TONE and BK (leaf and bark tone, linear),
    // DJ (+-5 days), BS (bark pattern seed); PR (profile), SH (shape), EV (evergreen), EST (within 900 m of the estate),
    // INF (species inferred), SPC (species level)
    const X = new Float32Array(N), Z = new Float32Array(N), GY = new Float32Array(N), HH = new Float32Array(N), CC = new Float32Array(N), J = new Float32Array(N),
      TONE = new Float32Array(N), BK = new Float32Array(N), DJ = new Float32Array(N), BS = new Float32Array(N);
    const PR = new Uint8Array(N), SH = new Uint8Array(N), EV = new Uint8Array(N), EST = new Uint8Array(N), INF = new Uint8Array(N), SPC = new Uint8Array(N);
    // sRGB to linear of (c x f) is taken as linear(c) x f^2.2 (f 0.9 to 1.1: under 1 % from THREE.Color's exact curve)
    const col = new THREE.Color(), lin = rgb => { col.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace); return [col.r, col.g, col.b]; };
    const PL = PROFILES.map(P => ({ leaf: lin(P.leaf), aut: lin(P.aut), bark: lin(P.bark), bloom: P.bloom ? lin(P.bloom) : null }));
    ord.forEach((s, i) => {
      const k = keep[s], t = D.trees[k], prof = sp ? B64.indexOf(sp.p[k]) : t[4] >= 0 && spProf[t[4]] >= 0 ? spProf[t[4]] : PROFILE.broadleaf;
      const P = PROFILES[prof], j = hash01(D.ids[k] || String(k)), [x, z, h0, c0] = t;
      const h = h0 || DEFAULT_H[SHAPES[P.shape]] * (.85 + .3 * j), c = Math.max(1.5, Math.min(20, c0 || h * P.cw * (.85 + .3 * hash01('c' + k))));
      X[i] = x; Z[i] = z; GY[i] = surfaceAt(x, z); HH[i] = h; CC[i] = c; J[i] = j;
      TONE[i] = Math.pow(.9 + .2 * hash01('t' + k), 2.2); BK[i] = Math.pow(.9 + .2 * hash01('b' + k), 2.2); DJ[i] = (j - .5) * 10; BS[i] = hash01('s' + k);
      PR[i] = prof; SH[i] = P.shape; EV[i] = P.ever; EST[i] = estOf[s];
      INF[i] = sp ? (/[SG]/.test(sp.b[k]) ? 0 : 1) : (t[4] >= 0 && spProf[t[4]] >= 0 ? 0 : 1); SPC[i] = sp && sp.b[k] === 'S' ? 1 : 0;
    });
    const hasSp = !!sp; D = S = sp = null;   // the parsed files are not kept (the store holds what the page draws)
    const nEst = EST.reduce((n, v) => n + v, 0);
    // the cells: a block [i0, i1) of the store, [i0, iE) within 900 m of the estate; the box (x, y, z); hP: the 90th
    // percentile height (far form and speck distances), hMax (near distance)
    const cells = [];
    for (let i = 0; i < N;) { const key = cellKey[ord[i]]; let i1 = i; while (i1 < N && cellKey[ord[i1]] === key) i1++;
      let iE = i; while (iE < i1 && EST[iE]) iE++;
      const c = { i0: i, iE, i1, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9, hP: 0, hMax: 0, want: 0, has: 0 }, hs = [];
      for (let m = i; m < i1; m++) { const r = CC[m] / 2; c.x0 = Math.min(c.x0, X[m] - r); c.x1 = Math.max(c.x1, X[m] + r); c.z0 = Math.min(c.z0, Z[m] - r); c.z1 = Math.max(c.z1, Z[m] + r);
        c.y0 = Math.min(c.y0, GY[m]); c.y1 = Math.max(c.y1, GY[m] + HH[m]); hs.push(HH[m]); }
      hs.sort((a, b) => a - b); c.hP = hs[Math.floor(.9 * (hs.length - 1))]; c.hMax = hs[hs.length - 1];
      cells.push(c); i = i1; }
    keep = ord = cellKey = estOf = null;   // (build-time arrays: the inner functions would keep them alive)
    const nDec = EV.reduce((n, v) => n + !v, 0);

    // ---- instance data of one tree, written from the store (o: the offset of slot s in a 4- or 16-float array)
    const put = (a, s, sx, sy, sz, x, y, z) => { const o = 16 * s; a.fill(0, o, o + 16); a[o] = sx; a[o + 5] = sy; a[o + 10] = sz; a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1; };
    const v4 = (a, s, p, q, r, w) => { const o = 4 * s; a[o] = p; a[o + 1] = q; a[o + 2] = r; a[o + 3] = w; };
    const W = {
      CM: (a, s, i) => { const P = PROFILES[PR[i]], h = HH[i], b = h * P.cb; put(a, s, CC[i], h - b, CC[i], X[i], GY[i] + b, Z[i]); },
      TM: (a, s, i) => { const P = PROFILES[PR[i]], h = HH[i], d = Math.max(.25, Math.min(1.2, h * .045)); put(a, s, d, h * (P.ever && P.shape === 1 ? .35 : Math.max(.45, P.cb + .15)), d, X[i], GY[i], Z[i]); },
      WM: (a, s, i) => { const P = PROFILES[PR[i]], h = HH[i], y0 = h * Math.min(.3, P.cb * .8 + .08); put(a, s, CC[i] * .95, h - y0, CC[i] * .95, X[i], GY[i] + y0, Z[i]); },
      mid: (a, s, i) => { const h = HH[i], b = h * PROFILES[PR[i]].cb; v4(a, s, X[i], GY[i] + b + .45 * (h - b), Z[i], h - b); },
      fmid: (a, s, i) => { const h = HH[i], fb = h * Math.min(PROFILES[PR[i]].cb, .3); v4(a, s, X[i], GY[i] + fb + .45 * (h - fb), Z[i], h - fb); },
      fc: (a, s, i) => { a[s] = CC[i]; },
      leaf: (a, s, i) => { const L = PL[PR[i]].leaf, t = TONE[i]; v4(a, s, L[0] * t, L[1] * t, L[2] * t, J[i]); },
      aut: (a, s, i) => { const L = PL[PR[i]].aut, t = TONE[i]; v4(a, s, L[0] * t, L[1] * t, L[2] * t, PROFILES[PR[i]].airy); },
      cal: (a, s, i) => { const P = PROFILES[PR[i]], d = DJ[i]; v4(a, s, P.out + d, P.col + d, P.bare + d, P.ever); },
      bloom: (a, s, i) => { const P = PROFILES[PR[i]], L = PL[PR[i]].bloom; if (L) v4(a, s, L[0], L[1], L[2], P.bloom[3] + DJ[i] * .6); else v4(a, s, 0, 0, 0, 0); },
      bark: (a, s, i) => { const L = PL[PR[i]].bark, t = BK[i]; v4(a, s, L[0] * t, L[1] * t, L[2] * t, PROFILES[PR[i]].pat + BS[i] * .5); },
    };

    // ---- the full trees: meshes with preallocated instance buffers; attrs: the attribute names written by W
    const G = shapes(THREE);
    const group = new THREE.Group(); group.name = 'trees';
    const cutOk = () => { If(positionWorld.y.greaterThan(U.cut), () => { Discard(); }); };
    const windTo = () => { const a = WU.windDir.mul(Math.PI / 180); return vec2(sin(a).negate(), cos(a)); };
    const meshes = [];
    function makeMesh(name, geom, cap, matrix, attrs, shadow) {
      const A4 = {}, nodes = {};
      for (const [k, src] of Object.entries(attrs)) { A4[k] = { attr: new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4), w: W[src] }; A4[k].attr.setUsage(THREE.DynamicDrawUsage); nodes[k] = instancedBufferAttribute(A4[k].attr); }
      const mat = new THREE.MeshStandardNodeMaterial({ roughness: .92, metalness: 0, flatShading: true });
      const mesh = new THREE.InstancedMesh(geom, mat, cap); mesh.name = name; mesh.count = 0; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.castShadow = shadow; mesh.receiveShadow = true;
      const rec = { name, mesh, mat, nodes, A4, wm: W[matrix], n: 0, tris: tris(geom) };
      meshes.push(rec); group.add(mesh); return rec;
    }
    // crown colour and leaf density (shared by the crowns, the far form and the specks)
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
    // the crown shades itself from the sky: occlusion of the indirect light (the hemisphere fill; the sun is direct) from 0.3
    // at the crown base to 0.75 at the top, none on a bare tree. Owner's photo of Greenland Dock (2026-10-11, 12:45): the
    // planes seen from their shaded side were luma 0.13, the render 0.36 with no occlusion (docklands/test/photo-tones.mjs)
    // round crowns (owner, 2026-10-11, on the Painted style: "close up we reveal underlying low poly models eg trees"): the light
    // comes from the direction from the crown centre (a sphere round mid.xyz, a little up) with leaf clumps of about 2 m
    // from 3D noise, not from the polyhedron's flat faces; the facets and their edges go. World space: the trees group has no
    // transform, and positionWorld is after the sway
    const crownN = nd => normalize(positionWorld.sub(nd.mid.xyz).add(vec3(0, nd.mid.w.mul(.12), 0)));
    const crownNormalView = nd => { const w = normalize(crownN(nd).add(mx_noise_vec3(positionWorld.mul(.45).add(nd.leaf.w.mul(9))).mul(.55)));
      return normalize(cameraViewMatrix.mul(vec4(w, 0)).xyz); };
    const crownAO = (nd, p) => { const { dens } = season(nd.cal, nd.bloom); return mix(float(1), mix(float(.3), float(.75), smoothstep(.05, .95, p.y)), smoothstep(.1, .6, dens)); };
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
        // a ragged leafy outline in place of the polygon's edge: where the round crown turns away from the eye, holes by 3D noise
        // in metres (clumps of about 1.5 m) eat the rim; the inside of the crown stays whole
        const e = float(1).sub(abs(dot(normalize(positionWorld.sub(nd.mid.xyz)), normalize(cameraPosition.sub(positionWorld)))));
        If(e.greaterThan(mx_noise_float(positionWorld.mul(.9).add(nd.leaf.w.mul(17))).mul(.28).add(mx_noise_float(positionWorld.mul(2.6)).mul(.14)).add(.5)), () => { Discard(); });
        const clump = mx_noise_float(positionWorld.mul(.55).add(nd.leaf.w.mul(5))).mul(.5).add(.5);
        return vec4(c.mul(n.mul(.25).add(.85)).mul(clump.mul(.6).add(.7)), 1);
      })();
      R.mat.normalNode = crownNormalView(nd);
      R.mat.aoNode = crownAO(nd, positionGeometry);
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

    // ---- far forms and specks: a Mesh each over an InstancedBufferGeometry whose per-instance attributes the material reads
    // by name (attribute()), so a buffer can grow (a new geometry) without new nodes. The vertex stage places the instance
    // itself: fmid = (crown centre x, y, z; crown height), fc = crown spread. Far: a 10-triangle blob over the crown; bare
    // deciduous trees show as a thin twig-coloured haze. Speck: a disc facing the camera, lit as a sphere
    const ATT = { fmid: 4, fc: 1, leaf: 4, aut: 4, cal: 4, bloom: 4 };   // 21 floats an instance; buffers: position, normal + 6 (WebGPU allows 8)
    const fnd = { mid: attribute('fmid', 'vec4'), fc: attribute('fc', 'float'), leaf: attribute('leaf', 'vec4'), aut: attribute('aut', 'vec4'), cal: attribute('cal', 'vec4'), bloom: attribute('bloom', 'vec4') };
    function makeInst(name, base, mat) {
      const mesh = new THREE.Mesh(new THREE.InstancedBufferGeometry(), mat); mesh.name = name; mesh.frustumCulled = false; mesh.visible = false;
      const rec = { name, mesh, mat, base, cap: 0, n: 0, tris: tris(base), arr: {} };
      rec.grow = need => { if (need <= rec.cap) return false;
        const cap = Math.ceil(Math.min(N, Math.max(need * 1.25, 1024))), g = new THREE.InstancedBufferGeometry(), old = mesh.geometry;
        for (const [k, v] of Object.entries(base.attributes)) g.setAttribute(k, v); if (base.index) g.setIndex(base.index);
        for (const [k, w] of Object.entries(ATT)) { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * w), w); if (rec.arr[k]) a.array.set(rec.arr[k].subarray(0, Math.min(rec.arr[k].length, cap * w))); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); rec.arr[k] = a.array; }
        g.instanceCount = 0; g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
        mesh.geometry = g; rec.cap = cap; if (old) old.dispose(); return true; };
      rec.write = (s, i) => { for (const k in ATT) W[k](rec.arr[k], s, i); };
      // the instance count, and the range [from, to) written since the last upload (none before the first grow)
      rec.upload = (from, to) => { const g = mesh.geometry; mesh.visible = rec.n > 0; if (!rec.cap) return; g.instanceCount = rec.n;
        for (const [k, w] of Object.entries(ATT)) { const a = g.attributes[k]; a.clearUpdateRanges(); if (to > from) { a.addUpdateRange(from * w, (to - from) * w); a.needsUpdate = true; } } };
      group.add(mesh); return rec;
    }
    const farMat = new THREE.MeshStandardNodeMaterial({ roughness: .92, metalness: 0, flatShading: true });
    const far = makeInst('far', G.far, farMat);
    { const nd = fnd;
      farMat.positionNode = Fn(() => {
        const { dens } = season(nd.cal, nd.bloom), p = positionGeometry, H = nd.mid.w, base = nd.mid.y.sub(H.mul(.45));
        const q = vec3(nd.mid.x.add(p.x.mul(nd.fc)), base.add(p.y.mul(H)), nd.mid.z.add(p.z.mul(nd.fc)));   // the instance (scale c, H, c) in model metres
        return swayed(nd, mix(nd.mid.xyz, q, mix(float(.8), float(1), dens)), p);
      })();
      farMat.colorNode = Fn(() => {
        cutOk();
        const p = positionGeometry, { c, dens } = crownColour(nd, p);
        const n = mx_noise_float(p.mul(5).add(nd.leaf.w.mul(31))).mul(.5).add(.5);
        If(n.greaterThan(max(dens, .45).mul(1.15)), () => { Discard(); });
        return vec4(mix(vec3(.06, .05, .04), c, smoothstep(0, .5, dens)).mul(n.mul(.25).add(.85)), 1);   // bare: a dark twig tone (linear)
      })();
      farMat.aoNode = crownAO(nd, positionGeometry);
      farMat.normalNode = crownNormalView(nd);
    }
    far.mesh.receiveShadow = true;
    // specks: the camera's right, up and back (unit, model metres) from the frame hook
    const uR = uniform(new THREE.Vector3(1, 0, 0)), uUp = uniform(new THREE.Vector3(0, 1, 0)), uBk = uniform(new THREE.Vector3(0, 0, 1));
    const speckMat = new THREE.MeshStandardNodeMaterial({ roughness: .95, metalness: 0 });
    const speck = makeInst('specks', G.speck, speckMat);
    { const nd = fnd;
      speckMat.positionNode = Fn(() => {
        const { dens } = season(nd.cal, nd.bloom), p = positionGeometry, r = nd.fc.add(nd.mid.w).mul(.27).mul(mix(float(.75), float(1), dens));
        return nd.mid.xyz.add(uR.mul(p.x.mul(r))).add(uUp.mul(p.y.mul(r)));
      })();
      speckMat.colorNode = Fn(() => {
        cutOk();
        const p = positionGeometry, d2 = dot(p.xy, p.xy);
        If(d2.greaterThan(1), () => { Discard(); });
        const { c, dens } = crownColour(nd, p.mul(.5).add(.5));
        return vec4(mix(vec3(.06, .05, .04), c, smoothstep(0, .5, dens)), 1);
      })();
      speckMat.normalNode = Fn(() => { const p = positionGeometry, z = sqrt(max(float(0), float(1).sub(dot(p.xy, p.xy))));
        return normalize(cameraViewMatrix.mul(vec4(normalize(uR.mul(p.x).add(uUp.mul(p.y)).add(uBk.mul(z))), 0)).xyz); })();
      speckMat.aoNode = Fn(() => { const { dens } = season(nd.cal, nd.bloom); return mix(float(1), float(.55), smoothstep(.1, .6, dens)); })();
    }

    // ---- level of detail: cells each frame, the near trees on a move
    let ALL = ctx.qs.get('trees') !== 'near', last = null, lastK = 0, dirty = true;
    const LOD = ctx.lod, eye = new THREE.Vector3(), fr = new THREE.Frustum(), frW = new THREE.Frustum(), pm = new THREE.Matrix4(), pw = new THREE.Matrix4(), box = new THREE.Box3();
    const nearDist = h => LOD.dist(h, LOD.px);   // the tree's height covers LOD.px CSS px
    const blk = c => ALL ? c.i1 : c.iE;          // the end of a cell's block (?trees=near: only the trees near the estate)
    const boxD = c => { const dx = Math.max(c.x0 - eye.x, 0, eye.x - c.x1), dy = Math.max(c.y0 - eye.y, 0, eye.y - c.y1), dz = Math.max(c.z0 - eye.z, 0, eye.z - c.z1); return Math.hypot(dx, dy, dz); };
    const inF = (f, c, m) => { box.min.set(c.x0 - m, c.y0 - m, c.z0 - m); box.max.set(c.x1 + m, c.y1 + m, c.z1 + m); return f.intersectsBox(box); };
    // the level a cell wants: 0 hidden, 1 specks, 2 far forms, 3 near (f: the frustum, fw: the widened one, or null for
    // none). A near cell stays near to 1.15 x its distance and in the widened frustum (no copy at each small move or turn
    // on its edge); near cells keep a margin (their shadows)
    const levelOf = (c, f, fw) => { if (blk(c) === c.i0) return 0; const d = boxD(c), was = c.has === 3;
      if (d < nearDist(c.hMax) * (was ? 1.15 : 1)) return !f || inF(was ? fw : f, c, MARGIN_NEAR) ? 3 : 0;
      if (d > LOD.dist(c.hP, PX_HIDE) || (f && !inF(f, c, 0))) return 0;
      return d > LOD.dist(c.hP, PX_FAR) ? 1 : 2; };
    let nearCells = [], farN0 = 0;   // the near cells of the last re-select; far.n0: the far forms of whole cells (the near cells' far forms follow)
    function refill(fw) {   // whole cells into the far and speck buffers, by the widened frustum fw (null: no culling)
      const t = performance.now(); let nf = 0, ns = 0;
      for (const c of cells) { c.has = c.want = levelOf(c, fw, fw); const n = blk(c) - c.i0; if (c.has === 2) nf += n; else if (c.has === 1) ns += n; }
      far.grow(nf + nearCap()); speck.grow(ns);
      far.n = 0; speck.n = 0;
      for (const c of cells) { const R = c.has === 2 ? far : c.has === 1 ? speck : null; if (!R) continue; for (let i = c.i0, e = blk(c); i < e; i++) R.write(R.n++, i); }
      farN0 = far.n; speck.upload(0, speck.n); stats.refills++; stats.refillMs = Math.round((performance.now() - t) * 10) / 10;
      reselect(true);
    }
    let nearCapV = 0; const nearCap = () => nearCapV, D2 = new Float32Array(N), NEAR = new Uint8Array(N);
    function reselect(full) {   // the near cells' trees: full trees (the NEAR_MAX nearest within their distance) and far forms
      const t = performance.now();
      for (const R of meshes) if (R) R.n = 0;
      nearCells = cells.filter(c => c.has === 3);
      let n = 0; for (const c of nearCells) n += blk(c) - c.i0;
      if (n > nearCapV) nearCapV = n;
      const grown = far.grow(farN0 + n);   // (a new buffer keeps the copied cells: grow() copies the arrays; the whole range is uploaded)
      const cand = [];
      for (const c of nearCells) for (let i = c.i0, e = blk(c); i < e; i++) { const h = HH[i], dx = X[i] - eye.x, dy = GY[i] + .6 * h - eye.y, dz = Z[i] - eye.z, d = dx * dx + dy * dy + dz * dz, nd = nearDist(h);
        if (d <= nd * nd) { cand.push(i); D2[i] = d; } }
      if (cand.length > NEAR_MAX) { cand.sort((a, b) => D2[a] - D2[b]); cand.length = NEAR_MAX; }
      for (const i of cand) { const R = crowns[SH[i]]; copy(R, R.n++, i); copy(trunks, trunks.n++, i); if (!EV[i]) copy(twigs, twigs.n++, i); NEAR[i] = 1; }
      far.n = farN0;
      for (const c of nearCells) for (let i = c.i0, e = blk(c); i < e; i++) if (!NEAR[i]) far.write(far.n++, i);
      for (const i of cand) NEAR[i] = 0;
      far.upload(full || grown ? 0 : farN0, far.n);
      let tri = far.n * far.tris + speck.n * speck.tris;
      for (const R of meshes) { if (!R) continue; R.mesh.count = R.n; tri += R.n * R.tris; upload(R); }
      last = eye.clone(); lastK = LOD.dist(1, 1);
      const lv = [0, 0, 0, 0]; for (const c of cells) lv[c.has]++;
      Object.assign(stats, { near: cand.length, far: far.n, specks: speck.n, triangles: tri, cells: { total: cells.length, near: lv[3], far: lv[2], specks: lv[1], hidden: lv[0] },
        reselectMs: Math.round((performance.now() - t) * 10) / 10, reselects: stats.reselects + 1 });
    }
    const copy = (R, slot, i) => { R.wm(R.mesh.instanceMatrix.array, slot, i); for (const k in R.A4) R.A4[k].w(R.A4[k].attr.array, slot, i); };
    const upload = R => { const m = R.mesh, n = R.n;
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, n * 16); m.instanceMatrix.needsUpdate = true;
      for (const k in R.A4) { const a = R.A4[k].attr; a.clearUpdateRanges(); a.addUpdateRange(0, n * 4); a.needsUpdate = true; } };
    // each frame: the cells' levels by the true frustum; copy only when a cell needs a better form than it has, or when
    // more than half of what is copied is no longer wanted
    function update() {
      camera.updateMatrixWorld(); eye.setFromMatrixPosition(camera.matrixWorld);   // model metres (matrixWorld holds the 1 / vz scale)
      const cull = LOD.on && !ctx.xrFrame;
      if (cull) { pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); fr.setFromProjectionMatrix(pm, camera.coordinateSystem, camera.reversedDepth);
        const P = pw.copy(camera.projectionMatrix); P.elements[0] /= WIDE; P.elements[5] /= WIDE; pm.multiplyMatrices(P, camera.matrixWorldInverse); frW.setFromProjectionMatrix(pm, camera.coordinateSystem, camera.reversedDepth); }
      const f = cull ? fr : null; let need = dirty, waste = 0, used = 0;
      if (!need) for (const c of cells) { const w = levelOf(c, f, frW), n = blk(c) - c.i0; c.want = w;
        if (w === c.has) { if (w) used += n; continue; }
        if (w === 3 || c.has === 3 || w > c.has) { need = true; break; }   // into or out of near, or a better form wanted
        if (w === 0) waste += n; else used += n; }
      if (!need && waste > 2000 && waste > used) need = true;
      if (need) { dirty = false; refill(cull ? frW : null); return; }
      if (!last || last.distanceTo(eye) > RESELECT_M || Math.abs(LOD.dist(1, 1) / lastK - 1) > .03) reselect(false);
    }

    // ---- the season follows the page clock
    const dayOf = t => { const d = new Date(t), s = d.toLocaleString('en-CA', { timeZone: 'Europe/London', hourCycle: 'h23' });   // "2026-07-15, 13:00:00"
      const [y, mo, da] = s.slice(0, 10).split('-').map(Number), hh = +s.slice(12, 14), mm = +s.slice(15, 17);
      return (Date.UTC(y, mo - 1, da) - Date.UTC(y, 0, 1)) / 864e5 + 1 + (hh + mm / 60) / 24; };
    let lastClock = NaN;
    const byProfile = {}; for (let i = 0; i < N; i++) byProfile[PROFILES[PR[i]].id] = (byProfile[PROFILES[PR[i]].id] || 0) + 1;
    const inferred = INF.reduce((n, v) => n + v, 0);
    const stats = { file: nFile, over35: nFile - N, near900: nEst, instances: 0, near: 0, far: 0, specks: 0, triangles: 0, drawCalls: meshes.filter(Boolean).length + 2,
      lod: { cellM: CELL, nearPx: LOD.px, farPx: PX_FAR, hidePx: PX_HIDE, nearMax: NEAR_MAX, reselectM: RESELECT_M, wide: WIDE }, cells: null, refills: 0, refillMs: 0,
      deciduous: nDec, inferred, speciesFile: hasSp, day: 0, reselects: 0, reselectMs: 0, loadMs: Math.round(tLoad), buildMs: 0 };
    // STATS.trees.season: the leaf state of the shown trees on the clock's day, computed on the CPU with the shader's formulas
    // (season(), crownColour()): leaf = foliage density (0 bare, 1 full), autumn = the autumn-colour mix t, bloom = blossom
    // strength. leafFraction: mean leaf; autumnShare: the share of the foliage (leaf-weighted) whose colour is more than half
    // autumn; bloomShare: the share of trees with blossom above 0.5; byProfile: the same per profile (the 12 most common).
    const ss = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
    const leafState = (i, day) => { const P = PROFILES[PR[i]], d = DJ[i], ever = P.ever > .5, out = P.out + d, ac = P.col + d, bare = P.bare + d, bw = P.bloom ? P.bloom[3] + d * .6 : 0;
      const grow = ss(out - 12, out + 20, day), fall = ss(ac + 12, bare, day), bl = bw > 0 ? 1 - ss(4, 14, Math.abs(day - bw)) : 0;
      return { ever, leaf: ever ? 1 : grow * (1 - fall), aut: ever ? 0 : ss(ac - 8, ac + 18, day), bl }; };
    const topProfiles = Object.entries(byProfile).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id]) => PROFILE[id]);
    let seasonCache = null;
    function seasonStats(day) {
      if (seasonCache && seasonCache.day === day && seasonCache.all === ALL) return seasonCache.v;
      const acc = () => ({ n: 0, leaf: 0, autLeaf: 0, bloom: 0 }), all = acc(), ev = acc(), de = acc(), bp = {};
      for (let i = 0; i < N; i++) { if (!ALL && !EST[i]) continue; const s = leafState(i, day), a = s.aut > .5 ? s.leaf : 0, b = s.bl > .5 ? 1 : 0;
        for (const q of [all, s.ever ? ev : de, bp[PR[i]] ||= acc()]) { q.n++; q.leaf += s.leaf; q.autLeaf += a; q.bloom += b; } }
      const out = q => q.n ? { trees: q.n, leafFraction: +(q.leaf / q.n).toFixed(3), autumnShare: q.leaf > 1e-6 ? +(q.autLeaf / q.leaf).toFixed(3) : 0, bloomShare: +(q.bloom / q.n).toFixed(3) } : null;
      const v = { day: Math.round(day * 10) / 10, ...out(all), evergreen: out(ev), deciduous: out(de),
        byProfile: Object.fromEntries(topProfiles.filter(k => bp[k]).map(k => [PROFILES[k].id, out(bp[k])])) };
      seasonCache = { day, all: ALL, v }; return v;
    }
    const nSpecies = SPC.reduce((n, v) => n + v, 0);
    Object.assign(stats, { trees: N, speciesKnown: N - inferred, speciesKnownShare: +((N - inferred) / N).toFixed(3), speciesLevel: nSpecies, speciesLevelShare: +(nSpecies / N).toFixed(3),
      evergreen: N - nDec, byProfile });
    Object.defineProperty(stats, 'drawn', { enumerable: true, get: () => ({ full: stats.near, farForms: stats.far, specks: stats.specks, total: stats.near + stats.far + stats.specks }) });
    Object.defineProperty(stats, 'season', { enumerable: true, get: () => seasonStats(uDay.value) });
    stats.seasonAt = day => seasonStats(day);   // tests: the season stats of any day of the year without a render
    ctx.stats.trees = stats;
    ctx.onFrame(() => {
      if (ctx.clock !== lastClock) { lastClock = ctx.clock; uDay.value = dayOf(lastClock); stats.day = Math.round(uDay.value * 10) / 10; }
      if (!group.visible) return;
      const m = camera.matrixWorld; uR.value.setFromMatrixColumn(m, 0).normalize(); uUp.value.setFromMatrixColumn(m, 1).normalize(); uBk.value.setFromMatrixColumn(m, 2).normalize();
      update();
    });
    function setAll(all) { ALL = all; Object.assign(stats, { all, instances: all ? N : nEst }); dirty = true; last = null; ctx.draw(); }
    setAll(ALL);   // all trees by default (owner, 2026-10-09: "Default to all trees"); ?trees=near: within 900 m of the estate
    stats.buildMs = Math.round(performance.now() - t0 - tLoad);
    ctx.ui.toggle(`All trees in the model box (${N.toLocaleString('en-GB')}, not only the ${nEst.toLocaleString('en-GB')} within 900 m of the estate)`, stats.all, setAll);
    ctx.ui.note(`Trees: GLA, Forest Research, OS, planning.data (OGL v3.0); OpenStreetMap (ODbL). Species from the data for ${(N - inferred).toLocaleString('en-GB')} trees; ${inferred.toLocaleString('en-GB')} inferred from the setting (street, park, wood, waterside). Leaves and blossom follow the clock's date. Full trees near the camera, simpler forms and then dots further away.`);
    return { object: group, stats, setVisible(on) { group.visible = on; if (on) { dirty = true; last = null; } ctx.draw(); }, reselect: () => { dirty = true; update(); } };
  },
};
