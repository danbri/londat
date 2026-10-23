// Places on the globe drawn like the Docklands model (owner, 2026-10-22: "why do Leon and Sarajevo look so different to
// London?"): the model's building material (materials.js placeBuildingMaterial: the same facade program, Realistic look,
// Map window grid and Night windows by use and hour), the model's light rig and day sky (sky3.js lightRig, makeSkyMesh) for
// the place's own sun, moon and clock, the model's wave field on the place's water, the model's tree system (layers/trees.js
// shapes, species profiles and seasons; the same size-on-screen rule) on the place's trees, and the ground lit as the
// model's terrain near the camera. Everything is rendered live (CLAUDE.md, Architecture rule 6): the tiles hold geometry and
// attributes only; colours, windows, light, water and trees are made in the page for the time and the style.
//   - Buildings (core tiles): per vertex col (the Realistic colour: OSM building:colour / roof:colour where tagged, else a
//     generic material drawn by the region's weights, place.look, for the facade style; alpha 132 + style x 8 + shopfront x 4
//     + storey class, as the model's materials.json codes), mcol (the Map look: grey for a measured height, amber for one
//     from floors or a model, as the model's legend) and gk (centre, base, night use and top in the tile frame).
//     City blocks: the same per instance (boxes) or per vertex (outlines), style by height.
//   - Lights: a sun, a moon and a sky fill in the globe scene from lightRig for the nearest loaded place (its sun and moon
//     by Astronomy Engine), the day sky (SkyMesh) round the eye below 20 km; Night: windows by the place's local hour
//     (nightClock with its time zone), lit when its sun is more than 2 degrees down (as main.js U.night).
//   - Water and trees: places/greens.json lists the places with a greens file (cwplans/tools/build-place-greens.mjs): water
//     polygons and trees; each core tile takes the pieces inside its cell, on its own ground grid.
//   - Styles: the Realistic look follows Look > Realistic buildings (?look=0: the Map look); pixel art (styles.js) gives flat
//     colours with no windows and no night; Painted and the line styles are passes of the model scene and do not reach the
//     globe yet. Shadows (sun) near the camera when the model's shadows are on (Look > Shadows; WebGPU by default).
// Skill: docklands-3d-page, "Three.js port: places look like the model (2026-10-22)".
import * as THREE from 'three/webgpu';
import { Fn, If, Discard, attribute, uniform, uniformArray, float, vec2, vec3, vec4, normalize, dot, max, min, mix, smoothstep, clamp, exp, pow, sin, cos, abs, length, select, reflect, fwidth,
  positionLocal, positionWorld, positionView, positionGeometry, cameraPosition, cameraNear, cameraFar, cameraProjectionMatrix, cameraViewMatrix, modelWorldMatrix, viewZToLogarithmicDepth, depth,
  transformNormalToView, texture, uv, normalLocal, mx_noise_float, mx_noise_vec3, sRGBTransferEOTF } from 'three/tsl';
import { placeBuildingMaterial, nightClock, PLACE_OFF, band, BANDS, U as MU } from '../materials.js';
import { waveNoiseTex } from '../water.js';
import { horizonAt, moonPhase, lightRig, makeSkyMesh } from '../sky3.js';
import { shapes, season, DEFAULT_H, PX_HIDE } from '../layers/trees.js';
import { PROFILES, PROFILE, SHAPES, hash01 } from '../tree-species.js';
import { REGIONS } from '../geo/regions/index.js';
import { geodeticToEcef, enuBasis, D2R } from '../geo/ellipsoid.js';

const qs = new URLSearchParams(location.search);
const lin = c => sRGBTransferEOTF(c);
const clamp01 = v => Math.max(0, Math.min(1, v));
const GROUND_K = 0.3;   // (0.40 / 0.72) ^ 2.2: the place texture's beige ground to the model's ground brightness
// generic wall and roof materials (sRGB 0..1, before light): the region config's place.look weights pick among them
const WALLS = { renderWhite: [.86, .85, .81], renderCream: [.86, .80, .66], renderOchre: [.80, .65, .45], renderPastel: [.82, .76, .74], stone: [.80, .77, .68], stock: [.66, .58, .43],
  brickRed: [.58, .31, .23], brickBrown: [.47, .35, .27], concrete: [.62, .61, .57], glassS: [.42, .47, .52], glassG: [.33, .45, .50], glassD: [.24, .29, .34], metal: [.72, .74, .74], metalC: [.45, .53, .55], timber: [.55, .42, .30] };
const ROOFS = { clay: [.55, .32, .24], ctile: [.43, .34, .30], ctileG: [.42, .42, .42], slate: [.30, .32, .35], metal: [.55, .57, .58], glass: [.36, .45, .50], felt: [.34, .34, .35], gravel: [.47, .46, .43], membrane: [.58, .59, .58], concrete: [.58, .57, .54], green: [.33, .40, .27] };
// without a region look block: neutral weights (no locale in them)
const DEF_LOOK = { wall: { house: { renderWhite: 30, renderCream: 25, brickRed: 20, stone: 15, brickBrown: 10 }, flats: { renderCream: 25, renderWhite: 25, brickBrown: 20, concrete: 20, brickRed: 10 },
  estate: { concrete: 45, brickBrown: 25, renderWhite: 30 }, office: { concrete: 35, stone: 30, glassS: 20, renderWhite: 15 }, civic: { stone: 50, brickRed: 25, renderCream: 25 }, shed: { metal: 50, concrete: 30, brickBrown: 20 } },
  roof_pitched: { clay: 45, slate: 30, ctile: 25 }, roof_flat: { gravel: 40, membrane: 35, felt: 25 } };
const CURTAIN = { glassG: 35, glassS: 35, glassD: 15, metal: 15 };
const STYLE_IDS = ['house', 'flats', 'estate', 'office', 'ribbon', 'curtain', 'shed', 'civic'];
const LOOK_BAY = [[2.3, 2.6, .23], [3, 2.7, .23], [3.3, 2.6, .23], [1.6, 3.3, .33], [1.5, 3.3, .33], [1.5, 3.5, .33], [1, 4, 1.3], [3.4, 3.3, .43]];   // as materials.js (tools/build-materials.mjs STYLES): bay, storey, storey class step
const KIND = {
  house: ['house', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'cabin', 'farm'],
  flats: ['apartments', 'residential', 'dormitory'],
  office: ['office', 'commercial', 'government', 'bank'],
  shed: ['industrial', 'warehouse', 'garage', 'garages', 'shed', 'service', 'storage_tank', 'hangar', 'roof', 'construction', 'supermarket', 'carport', 'transformer_tower'],
  civic: ['church', 'cathedral', 'chapel', 'mosque', 'synagogue', 'monastery', 'convent', 'school', 'college', 'university', 'hospital', 'public', 'civic', 'train_station', 'transportation', 'palace', 'sports_hall', 'stadium', 'sports_centre', 'museum', 'castle', 'kindergarten', 'temple', 'townhall', 'library'],
};
const KIND_OF = new Map(Object.entries(KIND).flatMap(([s, ks]) => ks.map(k => [k, s])));
const HOME = new Set(['house', 'detached', 'semidetached_house', 'terrace', 'apartments', 'residential', 'dormitory', 'bungalow']), OFFICE = new Set(['office', 'commercial', 'government', 'bank']), HOTEL = new Set(['hotel']);
const NOT_SHOP = new Set(['suburb', 'artwork', 'memorial', 'bicycle_rental', 'atm', 'apartment', 'taxi', 'square', 'viewpoint', 'tomb', 'information', 'drinking_water', 'charging_station', 'attraction', 'bench', 'fountain', 'statue', 'monument', 'neighbourhood', 'quarter', 'locality', 'parking', 'bicycle_parking', 'post_box', 'waste_basket', 'recycling', 'toilets']);
const HOTEL_PT = new Set(['hotel', 'hostel', 'guest_house', 'motel', 'apartment']), OFFICE_PT = new Set(['company', 'insurance', 'government', 'diplomatic', 'estate_agent', 'association', 'union', 'lawyer', 'notary', 'office']);
const MEASURED = new Set(['osm-height', 'overture-height', 'ms', 'lidar', 'national-height', 'lod2']);   // lod2: an official LoD2 model's measured height (German places)
const MAP_BLD = [185, 190, 196], MAP_LV = [224, 178, 90];   // the model's Map look: --bld (measured height), --bldlv (height from floors or a model)
const TILE_WALL = [214, 203, 182], TILE_ROOF = [[168, 120, 96], [150, 146, 140]];   // build-place-tiles.mjs defaults (no OSM colour)
const pick = (w, u) => { const e = Object.entries(w), t = e.reduce((a, [, v]) => a + v, 0); let x = u * t; for (const [k, v] of e) { if ((x -= v) < 0) return k; } return e.at(-1)[0]; };
const same = (a, i, b) => a[i] === b[0] && a[i + 1] === b[1] && a[i + 2] === b[2];
const toByte = v => Math.max(0, Math.min(255, Math.round(v * 255)));

export function makeLook(G, H, { scene, U, upF, globeLight }) {
  const V = { night: uniform(0), nP: uniform(new THREE.Vector4(0.36, 0.30, 0.48, 0.45)), nQ: uniform(new THREE.Vector4(0.9, 0.07, 0, 0)), win: MU.win, winGain: MU.winGain,
    look: uniform(/^(0|off|flat|no)$/i.test(qs.get('look') || '') ? 0 : 1), pix: uniform(0), pal: uniformArray(Array.from({ length: 33 }, () => new THREE.Vector3(0.6, 0.6, 0.6)), 'vec3'), day: uniform(1), tDay: uniform(180),
    windDir: uniform(240), windSpeed: uniform(3), skyZ: uniform(new THREE.Color(0.09, 0.22, 0.58)), skyH: uniform(new THREE.Color(0.42, 0.60, 0.86)) };
  const state = { place: null, t: NaN, light: null, sky: false, shadows: false, style: 'map', look: V.look.value };
  // Look > Realistic buildings (main.js #look): its state once the model's data are in (READY), and every change at once
  const lookBox = () => document.getElementById('look');
  lookBox()?.addEventListener('change', e => { V.look.value = e.target.checked ? 1 : 0; state.lookTouched = true; G.dirty = true; H.draw(); });
  // ---------- logarithmic depth as every globe material; the shadow pass (orthographic light camera) keeps its own depth
  const isOrtho = cameraProjectionMatrix.element(3).element(3).greaterThan(0.5), WATER_BIAS = 1.5;
  const logDepth = m => { m.depthNode = select(isOrtho, depth, viewZToLogarithmicDepth(positionView.z, cameraNear, cameraFar)); return m; };

  // ---------- lights and sky (the model's rig, for the place)
  const sun = new THREE.DirectionalLight(0xfff4e5, 0), moon = new THREE.DirectionalLight(0x9fb4d8, 0), fill = new THREE.HemisphereLight(0xbfd4ff, 0x40372c, 0);
  sun.name = 'place-sun'; moon.name = 'place-moon'; fill.name = 'place-fill';
  scene.add(sun, sun.target, moon, moon.target, fill);
  // the day sky: drawn after the opaque meshes with the depth test on (SkyMesh puts its vertices on the far plane), so its
  // scattering is computed only where no mesh is; the model draws it first over the whole frame (depth test off), which
  // in software rendering cost a full-screen pass (place-perf 6 km view: 1.2 -> 3.3 s a frame before this)
  const sky = makeSkyMesh(); sky.visible = false; sky.name = 'place-sky'; sky.material.depthTest = true; sky.renderOrder = 2; scene.add(sky);
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.5;
  const dirF = (az, alt, lon, lat) => { const b = enuBasis(lon, lat), a = az * D2R, e = alt * D2R, c = Math.cos(e), d = [0, 1, 2].map(k => b.north[k] * c * Math.cos(a) + b.east[k] * c * Math.sin(a) + b.up[k] * Math.sin(e)), R = G.frameState.R;
    return new THREE.Vector3(R[0][0] * d[0] + R[0][1] * d[1] + R[0][2] * d[2], R[1][0] * d[0] + R[1][1] * d[1] + R[1][2] * d[2], R[2][0] * d[0] + R[2][1] * d[1] + R[2][2] * d[2]); };
  const dayOfYear = (t, tz) => { try { const s = new Date(t).toLocaleString('en-CA', { timeZone: tz, hourCycle: 'h23' }), [y, m, d] = s.slice(0, 10).split('-').map(Number), hh = +s.slice(12, 14);
    return (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5 + 1 + hh / 24; } catch { return 180; } };
  function clockFor(p) {
    const t = H.clock(); if (t === state.t && p === state.place) return; state.t = t; state.place = p;
    const S = horizonAt('Sun', t, p.centre[0], p.centre[1]), M = horizonAt('Moon', t, p.centre[0], p.centre[1]); if (!S) return;
    const L = lightRig(S, M, moonPhase(t), null); state.light = { S, M, L };
    V.night.value = clamp01((-S.alt - 2) / 6); V.day.value = L.day;
    const r = nightClock(t, p.timeZone || 'UTC'); if (r) { V.nP.value.set(...r[0]); V.nQ.value.set(...r[1]); }
    V.tDay.value = dayOfYear(t, p.timeZone || 'UTC');
    sun.intensity = L.sun.i; sun.color.setHSL(...L.sun.hsl); moon.intensity = L.moon.i; fill.intensity = L.fill.i; fill.color.setHSL(...L.fill.hsl);
  }

  // ---------- materials
  // two of each: with the night windows and without (by day: place-look frame swaps them, see materials.js)
  const BMAT = logDepth(placeBuildingMaterial(V)), BMAT_DAY = logDepth(placeBuildingMaterial(V, null, false));
  // city blocks: boxes (InstancedMesh) and merged outlines carry col, mcol, gk and rcol (the flat top's colour), per instance
  // (InstancedBufferAttribute, read by name) or per vertex: one material for both
  const BA = { col: attribute('col', 'vec4'), mcol: attribute('mcol', 'vec4'), gk: attribute('gk', 'vec4'), rcol: attribute('rcol', 'vec4') };
  const BLOCK = logDepth(placeBuildingMaterial(V, BA)), BLOCK_DAY = logDepth(placeBuildingMaterial(V, BA, false));
  const nightMats = () => state.nightMats !== false;   // (true until the first frame decides)
  const bmat = () => nightMats() ? BMAT : BMAT_DAY, blkmat = () => nightMats() ? BLOCK : BLOCK_DAY;
  // the ground: the tile's texture lit as the model's terrain (MeshStandard, roughness 1) near the camera, the globe's own
  // light (as the world terrain round it) from 4 to 12 km, so the surroundings meet the world terrain as before
  function groundMat(map) {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
    const tn = map ? texture(map, uv()) : null, alb = tn ? tn.rgb : vec3(0.45, 0.42, 0.36).pow(2.2), far = smoothstep(4000, 12000, length(positionView));
    const nW = normalize(modelWorldMatrix.mul(vec4(normalLocal, 0)).xyz);
    // near: the albedo of the model's ground (materials.js terrainMaterial: sRGB 0.38 to 0.41 grey-green): the map-style
    // texture (beige ground 0.72, pale streets) toned down (x GROUND_K, linear) and the pale, grey street pixels turned to
    // asphalt as the model's roads; far: the texture as before under the globe's light
    const lum = dot(alb, vec3(0.2126, 0.7152, 0.0722)), sat = max(alb.r, max(alb.g, alb.b)).sub(min(alb.r, min(alb.g, alb.b))).div(max(lum, 0.01));
    const road = smoothstep(0.55, 0.75, lum).mul(smoothstep(0.25, 0.1, sat)), nearC = mix(alb.mul(GROUND_K), lin(vec3(0.36, 0.37, 0.38)).mul(0.9), road);
    m.colorNode = vec4(nearC.mul(far.oneMinus()), 1); m.emissiveNode = alb.mul(globeLight(nW)).mul(far);
    m.userData.tex = tn; return logDepth(m);
  }
  // water: the model's wave bands (materials.js band, BANDS: the tiling wave field moving downwind at the deep-water phase
  // speed), fresnel (Schlick, F0 0.02), the sun's glint from the light (low roughness), the sky by fresnel (no mirror on the
  // globe), the body colour of 2 m of water (as the model's depth ramp); wp: metres east and south of the place's centre, so
  // the field runs on across tiles
  const WMAT = (() => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.06, metalness: 0, side: THREE.DoubleSide });
    const NT = waveNoiseTex(), p = attribute('wp', 'vec2'), wr = V.windDir.mul(Math.PI / 180), dw = vec2(sin(wr).negate(), cos(wr)), Ws = max(V.windSpeed, 0);
    const sw = min(Ws.mul(0.013), 0.2).mul(0.8).add(0.006).div(2);
    const g = BANDS.reduce((s, [lam, rot, jit]) => s.add(band(NT, p, dw, lam, { rot, jit })), vec2(0, 0)).mul(sw);
    const N = normalize(vec3(g.x.negate(), 1, g.y.negate()));
    m.normalNode = transformNormalToView(N);
    const toCam = cameraPosition.sub(positionWorld), Vw = normalize(toCam), Nw = normalize(modelWorldMatrix.mul(vec4(N, 0)).xyz), fw = length(fwidth(p));
    m.roughnessNode = float(0.04).add(smoothstep(2, 30, fw).mul(0.18)).add(min(Ws.mul(0.012), 0.14).mul(smoothstep(0.3, 4, fw)));
    const F0 = float(0.02).add(float(0.98).mul(pow(float(1).sub(clamp(dot(Nw, Vw), 0, 1)), 5)));
    const body = lin(vec3(0.204, 0.315, 0.317));
    m.colorNode = vec4(body.mul(float(1).sub(F0)), 1);
    const R = reflect(Vw.negate(), Nw), ry = clamp(dot(R, upF), 0, 1);
    const skyc = mix(mix(vec3(V.skyH), vec3(V.skyZ), pow(ry, 0.6)), vec3(0.003, 0.004, 0.008), V.night);
    m.emissiveNode = skyc.mul(F0).mul(V.day.mul(0.85).add(0.15));
    logDepth(m); m.depthNode = select(isOrtho, depth, viewZToLogarithmicDepth(positionView.z.add(WATER_BIAS), cameraNear, cameraFar));   // drawn WATER_BIAS m nearer (waterMesh)
    return m;
  })();
  // trees: the model's crowns (layers/trees.js shapes, season, profiles) per core tile, with per-instance attributes
  const TG = shapes(THREE), PL = PROFILES.map(P => { const c = new THREE.Color(); const l = rgb => { c.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace); return [c.r, c.g, c.b]; }; return { leaf: l(P.leaf), aut: l(P.aut), bark: l(P.bark), bloom: P.bloom ? l(P.bloom) : null }; });
  const TA = { mid: attribute('mid', 'vec4'), leaf: attribute('leaf', 'vec4'), aut: attribute('aut', 'vec4'), cal: attribute('cal', 'vec4'), bloom: attribute('bloom', 'vec4') };
  const crownColour = (nd, p) => {
    const { grow, dens, bl } = season(nd.cal, nd.bloom, V.tDay), { leaf, aut, cal, bloom } = nd;
    const young = mix(leaf.xyz.mul(1.15).add(vec3(.035, .05, 0)), leaf.xyz, smoothstep(cal.x, cal.x.add(40), V.tDay));
    const t = smoothstep(cal.y.sub(8), cal.y.add(18), V.tDay), late = smoothstep(cal.y.add(18), cal.z, V.tDay);
    const autumn = mix(aut.xyz, aut.xyz.mul(.55).add(vec3(.05, .03, .01)), late.mul(.6));
    const c = select(cal.w.greaterThan(.5), leaf.xyz, mix(young, autumn, t)).toVar();
    const spot = mx_noise_float(p.mul(14).add(leaf.w.mul(7))).mul(.5).add(.5);
    c.assign(mix(c, bloom.xyz, bl.mul(mix(float(1), smoothstep(.3, .55, spot), grow)).mul(grow.mul(.35).oneMinus())));
    return { c, dens };
  };
  const crownN = nd => { const w = normalize(positionLocal.sub(nd.mid.xyz).add(vec3(0, nd.mid.w.mul(.12), 0)).add(mx_noise_vec3(positionLocal.mul(.45).add(nd.leaf.w.mul(9))).mul(.55)));
    return normalize(cameraViewMatrix.mul(modelWorldMatrix.mul(vec4(w, 0))).xyz); };
  const crownAO = (nd, p) => { const { dens } = season(nd.cal, nd.bloom, V.tDay); return mix(float(1), mix(float(.3), float(.75), smoothstep(.05, .95, p.y)), smoothstep(.1, .6, dens)); };
  const CROWN = (() => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: .92, metalness: 0, flatShading: true }), nd = TA;
    m.positionNode = Fn(() => { const { dens } = season(nd.cal, nd.bloom, V.tDay); const sc = select(dens.lessThan(.04), float(0), mix(float(.6), float(1), dens)); return mix(nd.mid.xyz, positionLocal, sc); })();
    m.colorNode = Fn(() => {
      const p = positionGeometry, { c, dens } = crownColour(nd, p);
      const n = mx_noise_float(p.mul(vec3(4.2, 3.6, 4.2)).add(nd.leaf.w.mul(31))).mul(.5).add(.5);
      If(n.greaterThan(dens.mul(nd.aut.w.mul(.45).oneMinus()).mul(1.15)), () => { Discard(); });
      const clump = mx_noise_float(positionLocal.mul(.55).add(nd.leaf.w.mul(5))).mul(.5).add(.5);
      return vec4(c.mul(n.mul(.25).add(.85)).mul(clump.mul(.6).add(.7)), 1);
    })();
    m.normalNode = crownN(nd); m.aoNode = crownAO(nd, positionGeometry);
    return logDepth(m);
  })();
  const TRUNK = (() => { const m = new THREE.MeshStandardNodeMaterial({ roughness: .95, metalness: 0, flatShading: true }), bark = attribute('bark', 'vec4');
    m.colorNode = vec4(bark.xyz.mul(mx_noise_float(positionGeometry.mul(vec3(5, 2.2, 5)).add(bark.w.fract().mul(40))).mul(.1).add(.95)), 1); return logDepth(m); })();
  const FAR = (() => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: .92, metalness: 0, flatShading: true }), nd = TA;
    m.colorNode = Fn(() => { const p = positionGeometry, { c, dens } = crownColour(nd, p); return vec4(mix(vec3(.06, .05, .04), c, smoothstep(0, .5, dens)), 1); })();
    m.normalNode = crownN(nd); m.aoNode = crownAO(nd, positionGeometry);
    return logDepth(m);
  })();
  const MATS = [BMAT, BMAT_DAY, BLOCK, BLOCK_DAY, WMAT, CROWN, TRUNK, FAR];

  // the capacity of an InstancedMesh: over the uniform-buffer limit, so three.js reads the instance matrices as vertex
  // attributes. Under it, three.js puts them in a uniform buffer sized by the count, so every count is another shader
  // program: each tile of trees or city blocks compiled its own (a second fly-in to a place: 9 + 9 programs, 3 s of
  // getProgramParameter in software rendering). Draw count = mesh.count.
  const instCap = k => { const lim = G.cull?.renderer?.backend?.capabilities?.getUniformBufferLimit?.() || 65536; return Math.max(k, Math.floor(lim / 64) + 1); };
  // ---------- per place: the look weights and the building facts (style, use, colours) by features.json row
  const looks = new Map();
  function lookOf(p) {
    if (looks.has(p.id)) return looks.get(p.id);
    const R = REGIONS[p.id], L = R?.place?.look || DEF_LOOK, F = p.feats, mLat = 110574, mLon = 111320 * Math.cos(p.centre[1] * D2R);
    // shop and hotel points by 0.0005 degree cells
    const pts = new Map(), key = (x, y) => Math.floor(x / 0.0005) * 1e6 + Math.floor(y / 0.0005);
    for (const q of F?.Pt || []) { if (NOT_SHOP.has(q.kind)) continue; const k = key(q.lon, q.lat); (pts.get(k) || pts.set(k, []).get(k)).push(q); }
    const near = (lon, lat, r) => { const out = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of pts.get(key(lon + a * 0.0005, lat + b * 0.0005)) || []) if (Math.hypot((q.lon - lon) * mLon, (q.lat - lat) * mLat) < r) out.push(q); return out; };
    const o = { L, near, info: new Map() };
    looks.set(p.id, o); return o;
  }
  // the facts of one building: style (0..7), shopfront, storey class, night use, Realistic wall and roof colours, Map colour
  function factsOf(p, b, area, hWall) {
    const o = lookOf(p); let f = o.info.get(b.i); if (f) return f;
    const k = b.kind || 'yes', h = b.height_m || hWall || 9, lv = +b.levels || 0, hs = b.height_source || '';
    const pts = o.near(b.lon, b.lat, Math.max(8, Math.sqrt(Math.max(area, 1)) * 0.5));
    let style = KIND_OF.get(k);
    if (style === 'house' && h > 12) style = 'flats';
    if (style === 'flats' && h > 21) style = 'estate';
    if (style === 'office' && h >= 35) style = 'curtain';
    if (!style) { if (k === 'retail' || k === 'store' || k === 'kiosk') style = area > 1500 && h <= 16 ? 'shed' : 'office'; else if (k === 'hotel') style = h > 21 ? 'estate' : 'flats'; else style = area < 150 && h <= 12 ? 'house' : h <= 21 ? 'flats' : h < 35 ? 'estate' : 'office'; }
    if (style !== 'shed' && style !== 'civic' && area > 1500 && h <= 10 && !HOME.has(k)) style = 'shed';
    const si = STYLE_IDS.indexOf(style), [, s0, ds] = LOOK_BAY[si];
    const storey = lv ? Math.max(2.4, Math.min(9, h / lv)) : s0 + (si >= 3 ? ds : 0), cls = Math.max(0, Math.min(3, Math.round((storey - s0) / ds)));
    const shop = si !== 0 && si !== 6 && si !== 7 && h >= 5.5 && (k === 'retail' || k === 'commercial' || pts.some(q => !HOTEL_PT.has(q.kind) && !OFFICE_PT.has(q.kind))) ? 1 : 0;
    const use = HOTEL.has(k) || pts.some(q => HOTEL_PT.has(q.kind)) ? 3 : OFFICE.has(k) || pts.some(q => OFFICE_PT.has(q.kind)) && !HOME.has(k) ? 2 : HOME.has(k) ? 1 : 0;
    const id = String(b.osm_id || b.i), j = s => hash01(id + s);
    const wW = style === 'curtain' ? CURTAIN : o.L.wall[style] || o.L.wall.flats || DEF_LOOK.wall.flats;
    const v1 = .93 + .14 * j('v'), warm = (j('w') - .5) * .05, vr = .94 + .12 * j('r');
    const wall = WALLS[pick(wW, j('m'))].map((c, i) => c * v1 * (1 + (i === 0 ? warm : i === 2 ? -warm : 0)));
    const pitched = b.roof && !/^flat/.test(b.roof), roof = ROOFS[pick(pitched ? o.L.roof_pitched || DEF_LOOK.roof_pitched : o.L.roof_flat || DEF_LOOK.roof_flat, j('f'))].map(c => c * vr);
    f = { style: si, code: si * 8 + shop * 4 + cls, use, wall: wall.map(toByte), roof: roof.map(toByte), map: MEASURED.has(hs) ? MAP_BLD : MAP_LV };
    o.info.set(b.i, f); return f;
  }
  // a city block: style by height and footprint, colours by the region's weights (no OSM tags in the tiles)
  function blockFacts(p, seed, h, area, src) {
    const o = lookOf(p), j = s => hash01(seed + s), style = area > 1500 && h <= 12 ? 'shed' : area < 200 && h <= 12 ? 'house' : h <= 21 ? 'flats' : h < 40 ? 'estate' : 'office';
    const si = STYLE_IDS.indexOf(style), wall = WALLS[pick(o.L.wall[style] || DEF_LOOK.wall[style], j('m'))].map(c => c * (.93 + .14 * j('v')));
    const roof = ROOFS[pick(o.L.roof_flat || DEF_LOOK.roof_flat, j('f'))];
    return { code: si * 8, use: style === 'house' || style === 'flats' || style === 'estate' ? 1 : 0, wall: wall.map(toByte), roof: roof.map(toByte), map: MEASURED.has(src) ? MAP_BLD : MAP_LV };
  }

  // ---------- core buildings: per-vertex attributes from the tile's vertices (fid -> features.json row)
  function buildingAttrs(g, q, p) {
    const pos = q.pos, nv = pos.length / 3, fid = q.fid, col = q.col.arr, cn = q.col.n, F = p.feats;
    const acc = new Map();   // fid -> [minx, maxx, miny, maxy, minz, maxz]
    for (let v = 0; v < nv; v++) { const f = Math.round(fid[v]); let a = acc.get(f); if (!a) acc.set(f, a = [1e9, -1e9, 1e9, -1e9, 1e9, -1e9]);
      const x = pos[3 * v], y = pos[3 * v + 1], z = pos[3 * v + 2]; if (x < a[0]) a[0] = x; if (x > a[1]) a[1] = x; if (y < a[2]) a[2] = y; if (y > a[3]) a[3] = y; if (z < a[4]) a[4] = z; if (z > a[5]) a[5] = z; }
    const facts = new Map();
    for (const [f, a] of acc) { const b = F?.byIndex.get(f) || { i: f, kind: 'yes' }, area = (a[1] - a[0]) * (a[5] - a[4]) * 0.75; facts.set(f, { b, a, F: factsOf(p, b, area, a[3] - a[2]) }); }
    const C = new Uint8Array(nv * 4), M = new Uint8Array(nv * 4), K = new Float32Array(nv * 4);
    for (let v = 0; v < nv; v++) {
      const { a, F: fa } = facts.get(Math.round(fid[v])), i = cn * v, o = 4 * v;
      const tagged = !same(col, i, TILE_WALL) && !TILE_ROOF.some(r => same(col, i, r)), roof = TILE_ROOF.some(r => same(col, i, r));
      const c = tagged ? [col[i], col[i + 1], col[i + 2]] : roof ? fa.roof : fa.wall;
      C[o] = c[0]; C[o + 1] = c[1]; C[o + 2] = c[2]; C[o + 3] = 132 + fa.code;
      M[o] = fa.map[0]; M[o + 1] = fa.map[1]; M[o + 2] = fa.map[2]; M[o + 3] = 0;
      const base = a[2] + PLACE_OFF, top = Math.min(999, a[3] + PLACE_OFF);
      K[o] = (a[0] + a[1]) / 2; K[o + 1] = (a[4] + a[5]) / 2; K[o + 2] = base; K[o + 3] = fa.use * 1000 + Math.max(0, top);
    }
    g.setAttribute('col', new THREE.BufferAttribute(C, 4, true)); g.setAttribute('mcol', new THREE.BufferAttribute(M, 4, true)); g.setAttribute('gk', new THREE.BufferAttribute(K, 4));
    g.deleteAttribute('color');
    return bmat();
  }
  // city blocks as instances: per-instance attributes (the material reads them by name)
  function blockInstAttrs(mesh, q, meta, p, key) {
    const k = q.inst.t.length / 3, T = q.inst.t, S = q.inst.s, L = meta?.boxes, HS = meta?.height_sources || [];
    const C = new Float32Array(k * 4), R = new Float32Array(k * 4), M = new Float32Array(k * 4), K = new Float32Array(k * 4);
    for (let i = 0; i < k; i++) {
      const hs = S[3 * i + 1], h = L?.h?.[i] != null ? L.h[i] / 10 : hs, area = S[3 * i] * S[3 * i + 2], src = L ? HS[L.s[i]] : '', f = blockFacts(p, key + ':' + i, h, area, src);   // (the facade style from the block's own height; the box also reaches drop_m into the ground)
      C.set([f.wall[0] / 255, f.wall[1] / 255, f.wall[2] / 255, (132 + f.code) / 255], 4 * i); R.set([f.roof[0] / 255, f.roof[1] / 255, f.roof[2] / 255, 0], 4 * i); M.set([f.map[0] / 255, f.map[1] / 255, f.map[2] / 255, 0], 4 * i);
      const base = T[3 * i + 1] + PLACE_OFF; K.set([T[3 * i], T[3 * i + 2], base, f.use * 1000 + Math.min(999, Math.max(0, base + hs))], 4 * i);
    }
    const g = mesh.geometry;
    g.setAttribute('col', new THREE.InstancedBufferAttribute(C, 4)); g.setAttribute('rcol', new THREE.InstancedBufferAttribute(R, 4)); g.setAttribute('mcol', new THREE.InstancedBufferAttribute(M, 4)); g.setAttribute('gk', new THREE.InstancedBufferAttribute(K, 4));
    return blkmat();
  }
  // city blocks as merged outlines: per vertex, by the block of the first triangle that uses the vertex
  function blockOutlineAttrs(g, q, meta, p, key) {
    const pos = q.pos, nv = pos.length / 3, idx = q.idx, L = meta?.outlines, HS = meta?.height_sources || [];
    const C = new Float32Array(nv * 4), R = new Float32Array(nv * 4), M = new Float32Array(nv * 4), K = new Float32Array(nv * 4), done = new Uint8Array(nv);
    const ntri = idx ? idx.length / 3 : nv / 3; let blk = 0;
    // each block: its vertices' box (base and top), then the attributes
    const ends = L?.tri_end || [ntri];
    for (let b = 0, t0 = 0; b < ends.length; b++) { const t1 = ends[b], vs = [];
      let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let t = t0; t < t1; t++) for (let c = 0; c < 3; c++) { const v = idx ? idx[3 * t + c] : 3 * t + c; vs.push(v); const x = pos[3 * v], y = pos[3 * v + 1], z = pos[3 * v + 2]; y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const h = L ? L.h[b] / 10 : y1 - y0, f = blockFacts(p, key + ':o' + b, h, (x1 - x0) * (z1 - z0) * 0.7, L ? HS[L.s[b]] : '');
      for (const v of vs) { if (done[v]) continue; done[v] = 1; const o = 4 * v;
        C.set([f.wall[0] / 255, f.wall[1] / 255, f.wall[2] / 255, (132 + f.code) / 255], o); R.set([f.roof[0] / 255, f.roof[1] / 255, f.roof[2] / 255, 0], o); M.set([f.map[0] / 255, f.map[1] / 255, f.map[2] / 255, 0], o);
        K.set([(x0 + x1) / 2, (z0 + z1) / 2, y0 + PLACE_OFF, f.use * 1000 + Math.min(999, Math.max(0, y1 + PLACE_OFF))], o); }
      t0 = t1; blk++; }
    g.setAttribute('col', new THREE.BufferAttribute(C, 4)); g.setAttribute('rcol', new THREE.BufferAttribute(R, 4)); g.setAttribute('mcol', new THREE.BufferAttribute(M, 4)); g.setAttribute('gk', new THREE.BufferAttribute(K, 4));
    return blkmat();
  }

  // ---------- greens (water and trees) of the places that have them
  const greensIx = fetch(new URL('../cwplans/docklands/data/places/greens.json', location.href)).then(r => r.ok ? r.json() : { places: {} }).catch(() => ({ places: {} }));
  const greensP = new Map();
  // a freed place (places.js) takes its look facts and greens with it (moglob, 2026-10-23: they stayed for the session)
  addEventListener('docklands-place-freed', e => { const id = e.detail?.id; looks.delete(id); greensP.delete(id); });
  function greensOf(p) {
    if (greensP.has(p.id)) return greensP.get(p.id);
    // a path beside the index, or an absolute URL (a place in another repository: tileBase; ?placebase= rebases it)
    const url = f => /^https?:/.test(f) ? (p.tileBase0 && f.startsWith(p.tileBase0) ? p.tileBase + f.slice(p.tileBase0.length) : f) : new URL('../cwplans/docklands/data/places/' + f, location.href);
    const pr = greensIx.then(ix => { const f = ix.places?.[p.id]; if (!f) return null; return fetch(url(f)).then(r => r.ok ? r.json() : null); })
      .then(g => { if (!g) return null; const tf = g.trees_fields, ix = k => tf.indexOf(k);
        const trees = g.trees.map(r => ({ lon: r[ix('lon')], lat: r[ix('lat')], h: r[ix('height_m')], c: r[ix('crown_m')], prof: PROFILE[r[ix('profile')]] ?? PROFILE.broadleaf, src: r[ix('source')] }));
        const water = g.water.map(r => { const rings = r[3]; let w = 180, s = 90, e = -180, n = -90; for (const [x, y] of rings[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); } return { id: r[0], kind: r[1], name: r[2], rings, b: [w, s, e, n] }; });
        p.greens = { trees, water, counts: g.counts, credit: g.credit }; return p.greens; })
      .catch(e => { console.warn('places: greens', p.id, e); return null; });
    greensP.set(p.id, pr); return pr;
  }
  // the ground grid of a core tile: its first (G+1)^2 vertices, row 0 north (build-place-tiles.mjs), in the tile frame
  const rectOf = key => { const [l, x, y] = key.split('-').map(Number), cs = 180 / 2 ** l; return [-180 + x * cs, -90 + y * cs, -180 + (x + 1) * cs, -90 + (y + 1) * cs]; };
  function groundGrid(q, key) { if (!q.uv || q.uv.length < 4) return null; const G = Math.round(1 / q.uv[2]); if (!(G > 1) || q.pos.length / 3 < (G + 1) ** 2) return null; return { G, pos: q.pos, rect: rectOf(key) }; }
  function at(gr, lon, lat) {
    const [w, s, e, n] = gr.rect, G = gr.G, u = Math.max(0, Math.min(G - 1e-6, (lon - w) / (e - w) * G)), v = Math.max(0, Math.min(G - 1e-6, (n - lat) / (n - s) * G)), i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, P = gr.pos;
    const o = (a, b) => 3 * (b * (G + 1) + a), A = o(i, j), B = o(i + 1, j), C = o(i, j + 1), D = o(i + 1, j + 1), out = [0, 0, 0];
    for (let c = 0; c < 3; c++) out[c] = (P[A + c] * (1 - fu) + P[B + c] * fu) * (1 - fv) + (P[C + c] * (1 - fu) + P[D + c] * fu) * fv;
    return out;
  }
  const clipRect = (r, [w, s, e, n]) => {
    const E = [[q => q[0] >= w, (a, b) => [w, a[1] + (w - a[0]) / (b[0] - a[0]) * (b[1] - a[1])]], [q => q[0] <= e, (a, b) => [e, a[1] + (e - a[0]) / (b[0] - a[0]) * (b[1] - a[1])]],
      [q => q[1] >= s, (a, b) => [a[0] + (s - a[1]) / (b[1] - a[1]) * (b[0] - a[0]), s]], [q => q[1] <= n, (a, b) => [a[0] + (n - a[1]) / (b[1] - a[1]) * (b[0] - a[0]), n]]];
    let out = r; for (const [ins, cut] of E) { const src = out; out = []; for (let i = 0; i < src.length; i++) { const a = src[i], b = src[(i + 1) % src.length], ia = ins(a), ib = ins(b); if (ia) out.push(a); if (ia !== ib) out.push(cut(a, b)); } if (!out.length) break; }
    return out;
  };
  // water pieces of one core tile: clipped to its cell, triangulated in the tile frame, then split until no edge is over
  // WATER_EDGE m, each vertex WATER_LIFT m over the tile's own ground (bilinear on its grid, as the ground mesh), so a river
  // follows the fall of the valley; drawn WATER_BIAS m nearer in depth than it is, so the ground's own triangles (the DEM
  // under the water surface) do not show through it
  const WATER_EDGE = 9, WATER_LIFT = 0.35;
  function waterMesh(gr, Gr, p) {
    const [w, s, e, n] = gr.rect, pos = [], wp = [], idx = [], mLat = 110574, mLon = 111320 * Math.cos(p.centre[1] * D2R);
    const vtx = (lo, la) => { const P = at(gr, lo, la); pos.push(P[0], P[1] + WATER_LIFT, P[2]); wp.push((lo - p.centre[0]) * mLon, (p.centre[1] - la) * mLat); return pos.length / 3 - 1; };
    const LL = [];   // lon, lat of each vertex (for the splits)
    const len2 = (a, b) => ((LL[a][0] - LL[b][0]) * mLon) ** 2 + ((LL[a][1] - LL[b][1]) * mLat) ** 2;
    const mids = new Map(), mid = (a, b) => { const k = a < b ? a + ',' + b : b + ',' + a; let m = mids.get(k); if (m == null) { const lo = (LL[a][0] + LL[b][0]) / 2, la = (LL[a][1] + LL[b][1]) / 2; m = vtx(lo, la); LL.push([lo, la]); mids.set(k, m); } return m; };
    // longest-edge bisection (shared midpoints keep the mesh closed): about area / (WATER_EDGE^2 / 2) triangles; a 4-way
    // split of a long thin river triangle made 4^8 pieces of it (seconds of main-thread work at a fly-in)
    const split = (a, b, c, d) => { const ab = len2(a, b), bc = len2(b, c), ca = len2(c, a), L = Math.max(ab, bc, ca);
      if (d > 24 || L <= WATER_EDGE * WATER_EDGE) { idx.push(a, c, b); return; }
      if (L === ab) { const m = mid(a, b); split(a, m, c, d + 1); split(m, b, c, d + 1); } else if (L === bc) { const m = mid(b, c); split(a, b, m, d + 1); split(a, m, c, d + 1); } else { const m = mid(c, a); split(a, b, m, d + 1); split(m, b, c, d + 1); } };
    for (const W of Gr.water) {
      if (W.b[2] < w || W.b[0] > e || W.b[3] < s || W.b[1] > n) continue;
      const rings = W.rings.map(r => clipRect(r, gr.rect)).filter(r => r.length >= 3); if (!rings.length) continue;
      const loc = rings.map(r => r.map(([lo, la]) => ({ lo, la, P: at(gr, lo, la) })));
      let tris; try { tris = THREE.ShapeUtils.triangulateShape(loc[0].map(q => new THREE.Vector2(q.P[0], q.P[2])), loc.slice(1).map(r => r.map(q => new THREE.Vector2(q.P[0], q.P[2])))); } catch { continue; }
      const ids = loc.flat().map(q => { LL.push([q.lo, q.la]); return vtx(q.lo, q.la); });
      for (const t of tris) split(ids[t[0]], ids[t[1]], ids[t[2]], 0);
    }
    if (!idx.length) return null;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('wp', new THREE.Float32BufferAttribute(wp, 2)); g.setIndex(idx); g.computeBoundingSphere();
    return { mesh: new THREE.Mesh(g, WMAT), tris: idx.length / 3 };
  }
  // trees of one core tile: InstancedMesh per crown shape (near), trunks (near), far forms (one mesh), as the model's
  function treeSet(gr, Gr) {
    const [w, s, e, n] = gr.rect, T = Gr.trees.filter(t => t.lon >= w && t.lon < e && t.lat >= s && t.lat < n); if (!T.length) return null;
    const recs = T.map((t, i) => { const P = PROFILES[t.prof], j = hash01(`${t.lon},${t.lat}`), h = Math.min(35, t.h || DEFAULT_H[SHAPES[P.shape]] * (.85 + .3 * j)), c = Math.max(1.5, Math.min(20, t.c || h * P.cw * (.85 + .3 * hash01('c' + j)))), g = at(gr, t.lon, t.lat);
      return { P, pi: t.prof, j, h, c, x: g[0], y: g[1], z: g[2] }; });
    const attrs = (list, mids) => { const k = list.length, A = { mid: new Float32Array(k * 4), leaf: new Float32Array(k * 4), aut: new Float32Array(k * 4), cal: new Float32Array(k * 4), bloom: new Float32Array(k * 4) };
      list.forEach((r, i) => { const L = PL[r.pi], P = r.P, t = Math.pow(.9 + .2 * hash01('t' + r.j), 2.2), dj = (r.j - .5) * 10, b = mids ? r.h * P.cb : r.h * Math.min(P.cb, .3);
        A.mid.set([r.x, r.y + b + .45 * (r.h - b), r.z, r.h - b], 4 * i); A.leaf.set([L.leaf[0] * t, L.leaf[1] * t, L.leaf[2] * t, r.j], 4 * i); A.aut.set([L.aut[0] * t, L.aut[1] * t, L.aut[2] * t, P.airy], 4 * i);
        A.cal.set([P.out + dj, P.col + dj, P.bare + dj, P.ever], 4 * i); A.bloom.set(L.bloom ? [...L.bloom, P.bloom[3] + dj * .6] : [0, 0, 0, 0], 4 * i); });
      return A; };
    const m4 = new THREE.Matrix4(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), qI = new THREE.Quaternion();
    // (each tile its own copy of the small unit geometry: a shared attribute would lose its GPU buffer when a tile is freed)
    const inst = (geo, mat, list, mtx, A) => { const g = geo.clone(); for (const [k, a] of Object.entries(A || {})) g.setAttribute(k, new THREE.InstancedBufferAttribute(a, 4));
      const m = new THREE.InstancedMesh(g, mat, instCap(list.length)); m.count = list.length; list.forEach((r, i) => { mtx(r, ps, sc); m.setMatrixAt(i, m4.compose(ps, qI, sc)); });
      m.computeBoundingSphere(); m.frustumCulled = false; return m; };
    const near = [];
    SHAPES.forEach((name, si) => { const L = recs.filter(r => r.P.shape === si); if (!L.length) return;
      near.push(inst(TG.crowns[name], CROWN, L, (r, p0, s0) => { const b = r.h * r.P.cb; p0.set(r.x, r.y + b, r.z); s0.set(r.c, r.h - b, r.c); }, attrs(L, true))); });
    const B = new Float32Array(recs.length * 4); recs.forEach((r, i) => { const L = PL[r.pi].bark, t = Math.pow(.9 + .2 * hash01('b' + r.j), 2.2); B.set([L[0] * t, L[1] * t, L[2] * t, r.P.pat + hash01('s' + r.j) * .5], 4 * i); });
    near.push(inst(TG.trunk, TRUNK, recs, (r, p0, s0) => { const d = Math.max(.25, Math.min(1.2, r.h * .045)); p0.set(r.x, r.y, r.z); s0.set(d, r.h * (r.P.ever && r.P.shape === 1 ? .35 : Math.max(.45, r.P.cb + .15)), d); }, { bark: B }));
    const far = inst(TG.far, FAR, recs, (r, p0, s0) => { const fb = r.h * Math.min(r.P.cb, .3); p0.set(r.x, r.y + fb, r.z); s0.set(r.c, r.h - fb, r.c); }, attrs(recs, false));
    const hs = recs.map(r => r.h).sort((a, b) => a - b);
    return { near, far, n: recs.length, hP: hs[Math.floor(.9 * (hs.length - 1))], tris: { near: near.reduce((a, m) => a + m.count * ((m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3), 0), far: recs.length * 10 } };
  }

  // ---------- a core tile's decoration (called by places.js activate with the ground primitive): water and trees
  // (queued: built a few a frame within DECOR_MS, nearest tiles first, as places.js activates its tiles)
  const decorQ = [], DECOR_MS = 8;
  async function decorate(n, q, mk) {
    const p = n.p, gr = groundGrid(q, n.key); if (!gr) return;
    const Gr = await greensOf(p); if (!Gr || n.state !== 'ready') return;
    decorQ.push({ n, gr, Gr, mk }); G.dirty = true; H.draw();
  }
  function decorStep() {
    if (!decorQ.length) return; decorQ.sort((a, b) => (b.n.pri || 0) - (a.n.pri || 0)); const t0 = performance.now();
    while (decorQ.length && performance.now() - t0 < DECOR_MS) { const { n, gr, Gr, mk } = decorQ.shift(); if (n.state !== 'ready' || n.decorated) continue; const p = n.p;
      const out = { water: null };
      const wm = waterMesh(gr, Gr, p); if (wm) { mk(n, wm.mesh, 'water', wm.tris); out.water = wm; }
      const ts = treeSet(gr, Gr); if (ts) { for (const m of ts.near) mk(n, m, 'trees-near', 0); mk(n, ts.far, 'trees-far', 0); n.trees = ts; }
      n.decorated = out; }
    if (decorQ.length || t0) { G.dirty = true; requestAnimationFrame(() => H.draw()); }   // (the new meshes show in the next frame)
  }
  // ---------- per frame (places.js G.onFrame, before the render): the nearest loaded place's clock, lights, sky, styles,
  // the trees' level by the size on screen of their tile's 90th-percentile tree (LOD.px near, PX_HIDE hidden)
  const LODPX = () => globalThis.__docklands3?.ctx?.lod?.px ?? 32;
  function frame(p, eye, drawn) {
    // (the lights stay visible: a light that comes and goes changes the lights of every lit program, so all would compile again)
    decorStep();
    if (!p) { sun.intensity = moon.intensity = fill.intensity = 0; sky.visible = false; if (state.shadows) { state.shadows = false; sun.castShadow = false; } state.place = null; return; }
    clockFor(p);
    const F = G.frameState, sd = U.sun.value;
    sun.position.copy(sd).multiplyScalar(4000); sun.target.position.set(0, 0, 0);
    const M = state.light?.M; if (M) { const md = dirF(M.az, M.alt, p.centre[0], p.centre[1]); moon.position.copy(md).multiplyScalar(4000); } moon.target.position.set(0, 0, 0);
    fill.position.copy(upF.value);
    // the day sky round the eye under 20 km (the model's SkyMesh, its sun in this frame); none by night (as Sky3)
    const alt = G.altT || 0, wantSky = alt < 20000 && V.day.value > 0.02 && qs.get('placesky') !== '0';
    sky.visible = wantSky; if (wantSky) { sky.sunPosition.value.copy(sd); sky.scale.setScalar(Math.max(10000, (G.cull?.camera?.near || 1) * 4)); sky.position.set(0, 0, 0); }
    // styles: Realistic (Look > Realistic buildings), pixel art
    const st = globalThis.__docklandsStyles?.mode || 'map', lk = lookBox(), ready = globalThis.__docklands3?.ready;
    V.pix.value = st === 'pixel' ? 1 : 0; if (st === 'pixel' && !state.palP) state.palP = loadPalette(); if ((ready || state.lookTouched) && lk) V.look.value = lk.checked ? 1 : 0; state.style = st; state.look = V.look.value;
    // shadows near the camera when the model's are on (WebGPU by default; Look > Shadows)
    const shOn = !!H.sky?.sun?.castShadow && alt < 6000 && V.day.value > 0.05 && qs.get('placeshadows') !== '0';
    if (shOn !== state.shadows) { state.shadows = shOn; sun.castShadow = shOn; }
    if (shOn) { const r = Math.max(400, Math.min(3000, alt * 1.6)), c = sun.shadow.camera; c.left = c.bottom = -r; c.right = c.top = r; c.near = 1; c.far = 12000; c.updateProjectionMatrix();
      const o = G.orbit?.(), Fs = G.frameState; let T = [0, 0, 0];
      if (o) { const P = geodeticToEcef(o.lon, o.lat, o.h || 0), d = [P[0] - Fs.O[0], P[1] - Fs.O[1], P[2] - Fs.O[2]], R = Fs.R; T = [0, 1, 2].map(r => R[r][0] * d[0] + R[r][1] * d[1] + R[r][2] * d[2]); }
      sun.target.position.set(...T); sun.position.copy(sd).multiplyScalar(5000).add(sun.target.position); }
    // the building materials with or without the night windows (both compiled at the warm-up)
    const nm = V.night.value > 0.001 && V.pix.value < 0.5;
    if (nm !== state.nightMats) { state.nightMats = nm; const a = nm ? [BMAT_DAY, BMAT, BLOCK_DAY, BLOCK] : [BMAT, BMAT_DAY, BLOCK, BLOCK_DAY];
      for (const pl of G.places || []) for (const nd of pl.nodes) for (const m of nd.meshes) { const i = a.indexOf(m.material); if (i === 0 || i === 2) m.material = a[i + 1]; } }
    // trees by tile
    const K = G.cull ? G.cull.K() : innerHeight, px = LODPX(); state.drawn = drawn;
    for (const nd of drawn) { const ts = nd.trees; if (!ts) continue;
      const d = Math.max(1, Math.hypot(eye[0] - nd.C[0], eye[1] - nd.C[1], eye[2] - nd.C[2]) - nd.rad), s = ts.hP * K / d, lvl = s >= px ? 2 : s >= PX_HIDE ? 1 : 0;
      for (const m of ts.near) m.visible = lvl === 2; ts.far.visible = lvl === 1; ts.level = lvl; }
  }
  // the pixel-art palette (styles.js reads the same file): 24 colours and 9 accents, sRGB
  async function loadPalette() {
    try { const j = await fetch(new URL('../cwplans/docklands/data/pixel-palette.json', location.href)).then(r => r.json()), L = [...j.colours, ...Object.values(j.accents)].slice(0, 33);
      L.forEach((h, i) => { const x = parseInt(String(h).replace('#', ''), 16); V.pal.array[i].set((x >> 16 & 255) / 255, (x >> 8 & 255) / 255, (x & 255) / 255); }); for (let i = L.length; i < 33; i++) V.pal.array[i].copy(V.pal.array[0]); G.dirty = true; H.draw(); } catch (e) { console.warn('places: pixel palette', e); }
  }
  // compile the new programs with the globe's lights (the lights are part of a program's key)
  function warmMeshes() {
    const P3 = () => new THREE.BufferAttribute(new Float32Array([0, 0, -10, 1, 0, -10, 0, 1, -10]), 3), V4 = (T = Float32Array) => new THREE.BufferAttribute(new T(12), 4, T === Uint8Array);
    const gb = new THREE.BufferGeometry(); gb.setAttribute('position', P3()); gb.setAttribute('col', V4(Uint8Array)); gb.setAttribute('mcol', V4(Uint8Array)); gb.setAttribute('gk', V4()); gb.setAttribute('_feature_id_0', new THREE.BufferAttribute(new Float32Array(3), 1));
    const go = new THREE.BufferGeometry(); go.setAttribute('position', P3()); for (const k of ['col', 'rcol', 'mcol', 'gk']) go.setAttribute(k, V4());
    const gw = new THREE.BufferGeometry(); gw.setAttribute('position', P3()); gw.setAttribute('wp', new THREE.BufferAttribute(new Float32Array(6), 2));
    const gi = new THREE.BoxGeometry(1, 1, 1); gi.deleteAttribute('normal'); gi.deleteAttribute('uv'); for (const k of ['col', 'rcol', 'mcol', 'gk']) gi.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(4), 4));
    const bi = new THREE.InstancedMesh(gi, BLOCK, instCap(1)); bi.count = 1; bi.setMatrixAt(0, new THREE.Matrix4());
    const mt = (geo, mat, A) => { const g = geo.clone(); for (const k of A) g.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(4), 4)); const m = new THREE.InstancedMesh(g, mat, instCap(1)); m.count = 1; m.setMatrixAt(0, new THREE.Matrix4()); return m; };
    const bi2 = new THREE.InstancedMesh(gi, BLOCK_DAY, instCap(1)); bi2.count = 1; bi2.setMatrixAt(0, new THREE.Matrix4());
    // (the shadow flags as the real meshes have them: receiveShadow is part of a program's key; places.js activate, addDecor)
    const fl = (m, c, r) => { m.castShadow = c; m.receiveShadow = r; return m; };
    return [fl(new THREE.Mesh(gb, BMAT), true, true), fl(new THREE.Mesh(gb, BMAT_DAY), true, true), fl(new THREE.Mesh(go, BLOCK), true, true), fl(new THREE.Mesh(go, BLOCK_DAY), true, true),
      new THREE.Mesh(gw, WMAT), fl(bi, true, true), fl(bi2, true, true), fl(mt(TG.crowns.broad, CROWN, ['mid', 'leaf', 'aut', 'cal', 'bloom']), true, true), fl(mt(TG.trunk, TRUNK, ['bark']), true, true), fl(mt(TG.far, FAR, ['mid', 'leaf', 'aut', 'cal', 'bloom']), false, true)];
  }
  // the state for the text and machine interface (G.placeLook, describeView): what the place is drawn with now
  function describe() {
    const p = state.place; if (!p) return null; const L = state.light, tiles = { near: 0, far: 0 }, trees = { near: 0, far: 0 }, water = new Set(); let wm = 0;
    for (const nd of state.drawn || []) { if (nd.p !== p) continue; const ts = nd.trees; if (ts && ts.level === 2) { tiles.near++; trees.near += ts.n; } else if (ts && ts.level === 1) { tiles.far++; trees.far += ts.n; }
      if (nd.decorated?.water) { wm++; for (const W of p.greens?.water || []) if (W.name) { const [w, s2, e, n] = rectOf(nd.key); if (!(W.b[2] < w || W.b[0] > e || W.b[3] < s2 || W.b[1] > n)) water.add(W.name); } } }
    return { place: p.id, sun_altitude_deg: L ? Math.round(L.S.alt * 10) / 10 : null, moon_altitude_deg: L?.M ? Math.round(L.M.alt * 10) / 10 : null, night: +V.night.value.toFixed(2),
      look: V.pix.value ? 'pixel art (flat colours, no windows)' : V.look.value ? 'Realistic (walls by facade style, windows)' : 'Map (colour by height source, window grid)', style: state.style,
      night_windows: V.night.value > 0.01 ? { home: +V.nP.value.x.toFixed(2), office: +V.nP.value.y.toFixed(2), hotel: +V.nP.value.z.toFixed(2), shopfront: +V.nP.value.w.toFixed(2) } : null,
      sky: sky.visible, shadows: state.shadows, lights: { sun: +sun.intensity.toFixed(2), moon: +moon.intensity.toFixed(3), fill: +fill.intensity.toFixed(2) },
      trees_drawn: trees, tree_tiles: tiles, water_tiles: wm, water_named: [...water].slice(0, 8), greens: p.greens ? { trees: p.greens.counts.trees, mapped: p.greens.counts.osm_tree + p.greens.counts.osm_tree_row, placed_by_rule: p.greens.counts.rule_wood + p.greens.counts.rule_park, water_polygons: p.greens.counts.water_polygons } : null };
  }
  return { V, state, BMAT, MATS, describe, instCap, groundMat, logDepth, buildingAttrs, blockInstAttrs, blockOutlineAttrs, decorate, frame, warmMeshes, greensOf, lights: { sun, moon, fill }, sky };
}
