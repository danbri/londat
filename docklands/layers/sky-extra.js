// Layer "sky-extra" of the Three.js port (docklands/): what the WebGL page's Menu > Sky has beyond the port's sun, moon and
// stars (sky3.js). Ported from cwplans/docklands/sky.js: compute (planets, Jupiter's moons, the EQJ and galactic rotations,
// the galactic centre), dayTimes (twilight, golden and blue hours), nelm (the faintest magnitude the sky shows), satRecs,
// satLook, satPoints and nextIss (CelesTrak GP data with satellite.js SGP4), the cloud mask (clmFor, clmLoad), labels (IAU
// star names and Messier objects), approaches (London City Airport), after (sun and moon azimuth lines from a viewpoint),
// the SKY_FS Milky Way band and the Sky panel rows. Data unchanged from ../cwplans/docklands/data/sky/:
// constellation-lines.json, star-names.json, messier.json, stars.json (magnitudes for the names), sats-2026-10-03.json,
// clm-20261003T2300Z.png, lcy-approach.json; vendor/satellite.min.js (satellite.js, MIT).
// Drawing: planets, Jupiter's moons and sunlit satellites as instanced point sprites (as sky3.js stars, dimmed by
// sky.starGain); constellation lines as LineSegments of J2000 unit vectors under one matrix (EQJ -> model, from Astronomy
// Engine, no refraction) at 15.2 km round the eye; the Milky Way band on a sphere round the eye (TSL, galactic latitude and
// longitude from a uniform matrix); names as HTML labels, hidden when a building or the ground is higher in that
// direction (a 25 m grid of building tops and terrain); the cloud mask as a cloud deck at 1 km over the 222 x 222 km box of
// the image, its cover from the weather layer's low cloud (sky.wx) moved by the mask; London City approach paths and the
// sun and moon azimuth lines as 3D lines. The observer is sky3.js's (the middle of the model).
// URL: ?sky-extra=0 off; ?skyfetch=1 fetches live CelesTrak and EUMETView data for other times; ?skydark=1 dark site.
// Test hook: __docklands3.layers['sky-extra'].api.state. Skill: docklands-sky (the WebGL page's sky) and docklands-3d-page,
// "Three.js port".
import * as THREE from 'three/webgpu';
import { uniform, vec2, vec3, vec4, float, uv, smoothstep, length, instancedBufferAttribute, positionWorld, cameraPosition, normalize, asin, atan, exp, abs, clamp, mx_noise_float, step, texture, sRGBTransferEOTF, floor, fract, mod, mix, dot } from 'three/tsl';
import { A, dec } from '../build.js';
import { dirOf, vzUndistort } from '../sky3.js';
import { WU } from '../water.js';

const AE = globalThis.Astronomy, D2R = Math.PI / 180, R2D = 180 / Math.PI;
const lon0 = A.meta.geo.lon0 + 0.07, lat0 = A.meta.geo.lat0 + 0.03;   // sky3.js observer
const OBS = AE ? new AE.Observer(lat0, lon0, 10) : null;
const G = A.meta.geo, geoXZ = (lon, lat) => { const a = lon - G.lon0, b = lat - G.lat0, t = [1, a, b, a * b, a * a, b * b]; return [t.reduce((s, v, i) => s + v * G.x[i], 0), t.reduce((s, v, i) => s + v * G.z[i], 0)]; };
const R_SKY = 15200;
const SNAP = { sats: Date.parse('2026-10-04T06:00Z'), clm: { t: Date.parse('2026-10-03T23:00Z'), url: 'sky/clm-20261003T2300Z.png' }, box: [50.5, -1.6, 52.5, 1.6] };
const PHOTO = '2026-10-03T23:56';   // sky.js PHOTO: the photo time solved from the moon in the owner's photos
const VPS = { greenland: { name: 'Greenland Pier', x: -830, z: 1158, y: 5.0 }, cwpier: { name: 'Canary Wharf Pier', x: -639, z: -16, y: 4.5 },
  masthouse: { name: 'Masthouse Terrace Pier', x: -134, z: 1940, y: 4.4 }, ocs: { name: 'One Canada Square', x: 0, z: 0, y: 240 }, camera: { name: 'the camera' } };
const PLANETS = [['Mercury', .9], ['Venus', .8], ['Mars', 1.4], ['Jupiter', .85], ['Saturn', 1.0]];
const nrm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); }, dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const eqjVec = (ra, de) => [Math.cos(de * D2R) * Math.cos(ra * D2R), Math.cos(de * D2R) * Math.sin(ra * D2R), Math.sin(de * D2R)];
const V3 = v => [v.x, v.y, v.z];
const LDN = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const hm = t => t == null || !isFinite(t) ? '—' : LDN.format(new Date(t));
const dayL = t => new Date(t).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' });
const tz = t => /GMT\+1|BST/.test(new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/London', timeZoneName: 'short' })) ? 'BST' : 'GMT';
const f1 = v => v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1), deg = v => `${Math.round(v)}°`;
const compass = a => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(((a % 360) + 360) % 360 / 22.5) % 16];
const phaseName = e => e < 6 || e > 354 ? 'new moon' : e < 84 ? 'waxing crescent' : e < 96 ? 'first quarter' : e < 174 ? 'waxing gibbous' : e < 186 ? 'full moon' : e < 264 ? 'waning gibbous' : e < 276 ? 'last quarter' : 'waning crescent';
const clockWord = a => ['top', 'upper right', 'right', 'lower right', 'bottom', 'lower left', 'left', 'upper left'][Math.round(a / 45) % 8];
const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error(src + ' did not load')); document.head.appendChild(s); });
const getJSON = async (u, ms = 20000) => { const c = new AbortController(), k = setTimeout(() => c.abort(), ms); try { const r = await fetch(u, { signal: c.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); } finally { clearTimeout(k); } };
const CSS = `.skx{position:absolute;left:0;top:0;font:500 11px system-ui,sans-serif;white-space:nowrap;text-shadow:0 0 3px #000,0 0 2px #000;pointer-events:none;will-change:transform}
.skx.st{color:rgba(214,224,240,.85)}.skx.m{color:rgba(226,196,255,.9)}.skx.sun{color:#ffd23f;font-weight:600}.skx.moon{color:#e8f0ff;font-weight:600}.skx.lcy{color:rgba(255,190,90,.95);font-weight:600}
.skx.st::before,.skx.m::before{content:'';position:absolute;left:-4px;top:100%;width:3px;height:3px}
#skxOut table{border-collapse:collapse;width:100%}#skxOut th{text-align:left;font-weight:600;vertical-align:top;padding:3px 6px 3px 0;width:38%}#skxOut td{padding:3px 0;vertical-align:top}#skxOut tr+tr{border-top:1px solid #2c353d}`;

export default {
  id: 'sky-extra', label: 'Planets, satellites, constellations, Milky Way', on: true, menu: 'time', reveal: false,
  async init(ctx, on) {
    if (!AE) return {};
    const { camera, renderer, scene, sky, qs, flag, ui, draw, DATA, WEBGL, esc } = ctx;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const S = { t: null, A: null, days: null, dark: flag('skydark', false), lines: true, names: true, mw: true, azl: true, lcy: false, fetch: flag('skyfetch', false), vp: 'greenland',
      satSet: null, satErr: null, satPts: [], iss: undefined, clm: null, labelled: { stars: [], messier: [] }, visible: on };
    const root = new THREE.Group(); root.name = 'sky-extra';

    // ---------- the frame: true north and east at the observer (sky3.js), Astronomy Engine HOR (x north, y west, z up) -> model
    const N = V3(dirOf(0, 0)), E = V3(dirOf(90, 0)), UP = [0, 1, 0];
    const horToModel = h => [0, 1, 2].map(i => h.x * N[i] - h.y * E[i] + h.z * UP[i]);
    const azOf = d => (Math.atan2(dot3(d, E), dot3(d, N)) * R2D + 360) % 360;
    const dirArr = (az, alt) => V3(dirOf(az, alt));

    // ---------- astronomy for the clock (sky.js compute)
    function compute(t) {
      const time = AE.MakeTime(new Date(t)), out = { t };
      const body = name => { const eq = AE.Equator(name, time, OBS, true, true), h = AE.Horizon(time, OBS, eq.ra, eq.dec, 'normal'); return { name, alt: h.altitude, az: h.azimuth, dist: eq.dist, dir: dirArr(h.azimuth, h.altitude) }; };
      out.sun = body('Sun'); out.moon = body('Moon');
      const il = AE.Illumination('Moon', time); Object.assign(out.moon, { frac: il.phase_fraction, phase: il.phase_angle, elong: AE.MoonPhase(time), diam: 2 * Math.atan(1737.4 / (out.moon.dist * 149597870.7)) * R2D });
      const m = out.moon.dir, sx = nrm(out.sun.dir.map((v, i) => v - m[i] * dot3(out.sun.dir, m))), up = nrm([0, 1, 0].map((v, i) => v - m[i] * m[1])), rt = nrm([-m[2], 0, m[0]]);   // m x up
      out.moon.limb = (Math.atan2(dot3(sx, rt), dot3(sx, up)) * R2D + 360) % 360;
      out.planets = PLANETS.map(([n, bv]) => Object.assign(body(n), { mag: AE.Illumination(n, time).mag, bv }));
      const R = AE.Rotation_EQJ_HOR(time, OBS), col = v => horToModel(AE.RotateVector(R, new AE.Vector(v[0], v[1], v[2], time)));
      const c0 = col([1, 0, 0]), c1 = col([0, 1, 0]), c2 = col([0, 0, 1]); out.C = [c0, c1, c2];
      const M3 = v => [0, 1, 2].map(i => c0[i] * v[0] + c1[i] * v[1] + c2[i] * v[2]), toEqj = d => [dot3(d, c0), dot3(d, c1), dot3(d, c2)];
      out.M3 = M3;
      const RG = AE.Rotation_EQJ_GAL(), gal = v => V3(AE.RotateVector(RG, new AE.Vector(v[0], v[1], v[2], time)));
      out.GM = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(e => gal(toEqj(e)));   // the galactic vector of each model axis
      const jup = out.planets[3], jv = AE.GeoVector('Jupiter', time, true), jm = AE.JupiterMoons(time), J = [jv.x, jv.y, jv.z], Mj = M3(nrm(J));
      out.jmoons = [['Io', jm.io, 5.0], ['Europa', jm.europa, 5.3], ['Ganymede', jm.ganymede, 4.6], ['Callisto', jm.callisto, 5.7]].map(([n, s, mag]) => {
        const d = M3(nrm([J[0] + s.x, J[1] + s.y, J[2] + s.z])); return { name: n, mag, alt: jup.alt, dir: nrm(jup.dir.map((v, i) => v + d[i] - Mj[i])), sep: Math.acos(Math.min(1, dot3(d, Mj))) * R2D * 60 };
      });
      const gc = M3(eqjVec(266.417, -29.008)); out.gc = { alt: Math.asin(gc[1]) * R2D, az: azOf(gc) };
      return out;
    }
    const sunAltAt = t => { const time = AE.MakeTime(new Date(t)), eq = AE.Equator('Sun', time, OBS, true, true); return AE.Horizon(time, OBS, eq.ra, eq.dec, null).altitude; };
    function dayTimes(t) {   // sky.js dayTimes: the London day of the clock
      const d0 = Date.parse(new Date(t).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) + 'T00:00Z') - (tz(t) === 'BST' ? 36e5 : 0), D = new Date(d0);
      const at = r => r ? r.date.getTime() : null, alt = (dir, a) => at(AE.SearchAltitude('Sun', OBS, dir, D, 1, a)), rs = (b, dir) => at(AE.SearchRiseSet(b, OBS, dir, D, 1));
      const r = { d0, moonrise: rs('Moon', +1), moonset: rs('Moon', -1), sunrise: rs('Sun', +1), sunset: rs('Sun', -1), dawn: [alt(+1, -18), alt(+1, -12), alt(+1, -6)], dusk: [alt(-1, -6), alt(-1, -12), alt(-1, -18)],
        goldenAm: [alt(+1, -4), alt(+1, 6)], goldenPm: [alt(-1, 6), alt(-1, -4)], blueAm: [alt(+1, -6), alt(+1, -4)], bluePm: [alt(-1, -4), alt(-1, -6)] };
      let best = null; const v = eqjVec(266.417, -29.008);
      for (let k = 0; k <= 144; k++) { const tt = d0 + 12 * 3600e3 + k * 600e3, time = AE.MakeTime(new Date(tt)); if (sunAltAt(tt) > -18) continue;
        const h = AE.RotateVector(AE.Rotation_EQJ_HOR(time, OBS), new AE.Vector(v[0], v[1], v[2], time)), a = Math.asin(h.z) * R2D; if (!best || a > best.alt) best = { t: tt, alt: a }; }
      r.gcBest = best; return r;
    }
    // the faintest star the sky shows (sky.js nelm): London sky glow (Bortle 8 to 9) or a dark site, less twilight, moonlight, haze
    function nelm() {
      const a = S.A; if (!a) return 0; const h = a.sun.alt, base = S.dark ? 6.3 : 4.2; let n = base;
      if (h > -18) n = h < -6 ? Math.min(base, 2.2 + (base - 2.2) * (-6 - h) / 12) : h < 0 ? 2.2 - 3.4 * (h + 6) / 6 : -4.5;
      n -= (S.dark ? 1.2 : .35) * a.moon.frac * Math.max(0, Math.min(1, (a.moon.alt + 2) / 12));
      const vis = sky.wx && sky.wx.visibility; if (vis != null) n -= Math.max(0, Math.min(1.2, (12000 - vis) / 8000));
      return n;
    }
    const cover = () => sky.wx ? Math.max(0, Math.min(1, sky.wx.cover ?? 0)) : 0;

    // ---------- points: planets, Jupiter's moons, satellites (instanced sprites, as sky3.js stars)
    const CAP = 512, pPos = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3), pSize = new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1), pCol = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    for (const a of [pPos, pSize, pCol]) a.setUsage(THREE.DynamicDrawUsage);
    const pMat = new THREE.PointsNodeMaterial({ sizeAttenuation: false, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, toneMapped: false });
    pMat.positionNode = instancedBufferAttribute(pPos).mul(vec3(1, sky.vzInv || float(1), 1)); pMat.sizeNode = instancedBufferAttribute(pSize);
    pMat.colorNode = vec4(instancedBufferAttribute(pCol).mul(sky.starGain || float(1)), float(1));
    pMat.opacityNode = smoothstep(0.5, 0.15, length(uv().sub(0.5)));
    const pts = new THREE.Sprite(pMat); pts.count = 1; pts.frustumCulled = false; pts.renderOrder = -1; pts.name = 'sky-extra:points'; root.add(pts);
    const bvCol = b => b < .4 ? [.72, .82, 1].map((c, i) => c + ([1, .98, .95][i] - c) * THREE.MathUtils.smoothstep(b, -.2, .4)) : [1, .98, .95].map((c, i) => c + ([1, .72, .48][i] - c) * THREE.MathUtils.smoothstep(b, .4, 1.7));
    function fillPoints() {
      const a = S.A; if (!a) return; const Nl = nelm(), ext = .28 + .5 * (1 - Math.min(1, (sky.wx?.visibility ?? 20000) / 30000)); let k = 0;
      const put = (dir, alt, mag, bv) => { if (k >= CAP || alt < -0.6) return;
        // sky.js PT_VS: extinction by airmass, faded out from 1 mag brighter than the limit to 0.3 fainter
        const s = Math.max(Math.sin(alt * D2R), 0), X = 1 / (s + .025 * Math.exp(-11 * s)), mg = mag + ext * (X - 1), v = 1 - THREE.MathUtils.smoothstep(mg, Nl - 1, Nl + .3); if (v <= 0) return;
        const I = Math.min(2, Math.max(0, .45 + .55 * Math.pow(10, -.4 * (mg - 1)))) * v, c = bvCol(bv);
        pPos.array.set([dir[0] * R_SKY, dir[1] * R_SKY, dir[2] * R_SKY], 3 * k); pSize.array[k] = Math.max(1.25, Math.min(6, 2.7 - .42 * mg)); pCol.array.set(c.map(x => x * I), 3 * k); k++; };
      for (const p of a.planets) put(p.dir, p.alt, p.mag, p.bv);
      for (const m of a.jmoons) put(m.dir, m.alt, m.mag, .9);
      for (const s of S.satPts) put(s.dir, s.alt, s.mag, .6);
      pts.count = Math.max(1, k); if (!k) { pPos.array.fill(0, 0, 3); pCol.array.fill(0, 0, 3); }
      for (const at of [pPos, pSize, pCol]) at.needsUpdate = true;
      S.drawnPoints = k;
    }

    // ---------- the celestial sphere (EQJ unit vectors): constellation lines under one matrix
    const cel = new THREE.Group(); cel.matrixAutoUpdate = false; cel.name = 'sky-extra:celestial'; root.add(cel);
    const lineK = uniform(0), lineMat = new THREE.LineBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, toneMapped: false });
    lineMat.colorNode = sRGBTransferEOTF(vec3(.45, .58, .8).mul(lineK));   // the WebGL page's colour is sRGB, added on the sky lineMat.opacityNode = step(cameraPosition.y, positionWorld.y);   // nothing below the horizon
    let lines = null;
    ctx.loadJSON(DATA + 'sky/constellation-lines.json').then(d => { const a = []; for (const [, ls] of d.lines) for (const L of ls) for (let i = 0; i + 3 < L.length; i += 2) a.push(...eqjVec(L[i], L[i + 1]), ...eqjVec(L[i + 2], L[i + 3]));
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); lines = new THREE.LineSegments(g, lineMat); lines.frustumCulled = false; lines.renderOrder = -2; lines.name = 'sky-extra:lines'; cel.add(lines); S.nLines = a.length / 6; draw(); }).catch(e => console.warn('sky-extra: lines', e));

    // ---------- the Milky Way band (sky.js SKY_FS): galactic latitude b, longitude l of the view direction
    const GMu = uniform(new THREE.Matrix3()), mwK = uniform(0);
    const mwMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, toneMapped: false });
    { const d = normalize(positionWorld.sub(cameraPosition)), g = GMu.mul(d), b = asin(clamp(g.z, -1, 1)), l = atan(g.y, g.x), b2 = b.mul(b), l2 = l.mul(l);
      let bd = exp(b2.div(-.03)).mul(float(.3).add(exp(l2.div(-1.4)).mul(.7))).add(exp(l2.add(b2.mul(4)).div(-.045)).mul(.9));
      bd = bd.mul(float(1).sub(exp(b2.div(-.0011)).mul(.6).mul(float(1).sub(smoothstep(.6, 1.7, abs(l))))));
      const n = mx_noise_float(vec3(l.mul(7), b.mul(9), 3)).mul(.35).add(mx_noise_float(vec3(l.mul(14), b.mul(18), 7)).mul(.18)).add(.5);
      bd = bd.mul(n.mul(.8).add(.6));
      mwMat.colorNode = sRGBTransferEOTF(vec3(.55, .6, .72).mul(bd).mul(mwK).mul(.12).mul(smoothstep(0, .12, d.y)).min(1)); }
    if (sky.vzInv) vzUndistort(mwMat, sky.vzInv);   // vertical exaggeration: the band at its true altitude (sky3.js vzUndistort)
    const mw = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mwMat); mw.scale.setScalar(R_SKY + 300); mw.frustumCulled = false; mw.renderOrder = -3; mw.name = 'sky-extra:milkyway'; root.add(mw);

    // ---------- the cloud mask (sky.js clmFor, clmLoad): EUMETSAT Meteosat Cloud Mask through EUMETView (CC BY 4.0)
    const clmUrl = t => `https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=msg_fes:clm&styles=&crs=EPSG:4326&bbox=${SNAP.box.join(',')}&width=256&height=256&format=image/png&time=${new Date(t).toISOString()}`;
    function clmFor(t) {
      if (Math.abs(t - SNAP.clm.t) <= 90 * 60e3) return { t: SNAP.clm.t, url: DATA + SNAP.clm.url, src: 'snapshot' };
      if (!S.fetch || t < Date.parse('2020-09-01T00:00Z')) return null;
      const slot = Math.floor(Math.min(t, Date.now() - 30 * 60e3) / 900e3) * 900e3; if (t - slot > 90 * 60e3) return null;
      return { t: slot, url: clmUrl(slot), src: 'EUMETView live' };
    }
    const clmCache = {};
    function clmLoad(c) {
      if (clmCache[c.url]) return clmCache[c.url]; const rec = clmCache[c.url] = { ...c, ready: false };
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => { try { const k = document.createElement('canvas'); k.width = k.height = 256; const g = k.getContext('2d'); g.drawImage(im, 0, 0, 256, 256); const px = g.getImageData(0, 0, 256, 256).data, a = new Uint8Array(256 * 256 * 4); let n = 0, m = 0;
          for (let i = 0; i < 65536; i++) { const v = px[4 * i] > 200 && px[4 * i + 1] > 200 && px[4 * i + 2] > 200 ? 255 : 0; a[4 * i] = a[4 * i + 1] = a[4 * i + 2] = v; a[4 * i + 3] = 255; const x = i % 256 - 128, y = (i >> 8) - 128; if (x * x + y * y < 70 * 70) { n++; m += v / 255; } }
          const tex = new THREE.DataTexture(a, 256, 256, THREE.RGBAFormat); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.flipY = false; tex.needsUpdate = true;
          rec.tex = tex; rec.mean = m / n; rec.ready = true; update(true); } catch (e) { rec.err = e.message; panel(); } };
      im.onerror = () => { rec.err = 'did not load'; panel(); }; im.src = c.url; return rec;
    }
    // the deck: a plane at 1 km over the image's box (local scale at the observer: 111.32 cos(lat) km a degree east, 110.57
    // north; grid convergence ignored, as on the WebGL page); cover = the low cloud of the weather layer (0 without it, as
    // the WebGL page) raised where the mask sees cloud and lowered where it sees clear sky (0.9 x mask - its mean)
    // The texture of the deck is the WebGL page's low cloud layer (sky.js SKY_FS layer(d, 1.0, 1.7, cv.x, wd.xy)): 5 octaves of
    // value noise (hs, vn, fbm: the same hash and constants) on a 1.7 km scale, thresholded at 1 - the local cover, tending to
    // the cover itself towards the horizon (view elevation 0.12 to 0.015). Both move with the wind (2.2 x the 10 m wind,
    // water.js WU.windSpeed and WU.windDir, as the WebGL page drift): the noise by the drift of the page clock's time of day
    // (mod 400 km, as there), the mask by the drift since the image's time (sky.js cmk.zw). The WebGL page adds its drift to
    // the noise coordinate, which moves its noise upwind; here the noise moves downwind with the mask.
    const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat); blank.needsUpdate = true;
    const kx = 111320 * Math.cos(lat0 * D2R), kz = 110570, [ox, oz] = geoXZ(lon0, lat0), b0 = SNAP.box;
    const x0 = ox + (b0[1] - lon0) * kx, x1 = ox + (b0[3] - lon0) * kx, zN = oz - (b0[2] - lat0) * kz, zS = oz - (b0[0] - lat0) * kz;
    const clmK = { cov: uniform(0), mean: uniform(0), use: uniform(0), col: uniform(new THREE.Color(0, 0, 0)),
      dr: uniform(new THREE.Vector2()), md: uniform(new THREE.Vector2()), ey: uniform(0) };   // noise drift (km), mask drift (m), the eye's height (m OD)
    const hs = p => { const pm = mod(p, 289), q0 = fract(vec3(pm.x, pm.y, pm.x).mul(.1031)), q = q0.add(dot(q0, q0.yzx.add(33.33))); return fract(q.x.add(q.y).mul(q.z)); };
    const vn = p => { const i = floor(p), f0 = fract(p), f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
      return mix(mix(hs(i), hs(i.add(vec2(1, 0))), f.x), mix(hs(i.add(vec2(0, 1))), hs(i.add(1)), f.x), f.y); };
    const fbm = p0 => { let s = null, p = p0, a = .5; for (let i = 0; i < 5; i++) { const v = vn(p).mul(a); s = s ? s.add(v) : v; p = p.mul(2.03).add(vec2(17.1, 9.2)); a *= .5; } return s.div(.97); };
    const q = positionWorld.xz, muv = q.sub(clmK.md).sub(vec2(x0, zN)).div(vec2(x1 - x0, zS - zN));
    const clmTex = texture(blank, muv), inBox = step(0, muv.x).mul(step(muv.x, 1)).mul(step(0, muv.y)).mul(step(muv.y, 1));
    const deckMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
    { const m = mix(clmK.mean, clmTex.r, inBox), a = clamp(clmK.cov.add(m.sub(clmK.mean).mul(.9)), 0, 1);   // sky.js layer(): cover + 0.9 (mask - its mean); no weather: cover 0, as there
      const f = fbm(q.div(1000).sub(clmK.dr).div(1.7)), th = float(1).sub(a), lo = smoothstep(th.sub(.13), th.add(.13), f.mul(1.08).sub(.04));
      const H = float(1000).sub(clmK.ey), e = H.div(length(vec3(q.x.sub(cameraPosition.x), H, q.y.sub(cameraPosition.z))));   // the view's elevation as the unscaled view shows it
      deckMat.colorNode = clmK.col; deckMat.opacityNode = mix(lo, a, smoothstep(.12, .015, e)).mul(.92).mul(step(clmK.ey, 1000)); }
    const deck = (() => {
      const g = new THREE.PlaneGeometry(x1 - x0, zS - zN, 1, 1); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 1000, (zN + zS) / 2);
      const m = new THREE.Mesh(g, deckMat); m.frustumCulled = false; m.renderOrder = 2; m.name = 'sky-extra:cloudmask'; m.visible = false; return m; })();
    scene.add(deck);   // fixed in the model, not round the eye
    const D_KM = 2.2 * 3.6 / 3600;   // km/s per m/s of 10 m wind (the WebGL page: km/h x 2.2 / 3600)
    function deckFrame(eye) {   // each frame while the deck shows: the drifts and, with vertical exaggeration, its height
      const wr = WU.windDir.value * D2R, dx = -Math.sin(wr), dz = Math.cos(wr), ws = Math.max(0, WU.windSpeed.value) * D_KM, t = ctx.clock, dt = (t % 864e5) / 1000;
      clmK.dr.value.set(dx * ws * dt % 400, dz * ws * dt % 400);
      const ms = S.clm && S.clm.t != null ? (t - S.clm.t) / 1000 * ws * 1000 : 0; clmK.md.value.set(dx * ms, dz * ms);
      // vertical exaggeration: the view scales y by vz; the WebGL page's layer is at 1 km in the unscaled view (sky.js layer(),
      // eye height ck.z = eye / VZ), so the deck sits at ey + (1000 - ey) / vz
      const vz = ctx.vzNow ? ctx.vzNow() : 1; clmK.ey.value = eye.y; deck.position.y = eye.y + (1000 - eye.y) / vz - 1000;
    }

    // ---------- 3D lines on the model: London City approach paths, sun and moon azimuth lines
    const lineOf = (pts, color, opacity = 1) => { const g = new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(...p)));
      const m = new THREE.Line(g, new THREE.LineBasicNodeMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, toneMapped: false })); m.frustumCulled = false; m.renderOrder = 18; return m; };
    const lcy = new THREE.Group(); lcy.name = 'sky-extra:lcy'; lcy.visible = false; scene.add(lcy); let LCY = null;
    const azGroup = new THREE.Group(); azGroup.name = 'sky-extra:azimuth'; scene.add(azGroup);

    // ---------- labels (HTML): star names, Messier objects, the azimuth lines and the approach paths
    const labHost = document.getElementById('labels') || document.body, labPool = [];
    const labEl = i => { if (!labPool[i]) { const e = document.createElement('div'); e.className = 'skx'; e.hidden = true; labHost.appendChild(e); labPool[i] = e; } return labPool[i]; };
    let names = null, starMag = null;
    const loadNames = () => names || (names = Promise.all([ctx.loadJSON(DATA + 'sky/star-names.json'), ctx.loadJSON(DATA + 'sky/messier.json'), ctx.loadJSON(DATA + 'sky/stars.json')])
      .then(([n, m, s]) => { starMag = new Map(s.stars.map(x => [x[0], x])); return { n, m }; }).catch(e => { console.warn('sky-extra: names', e); return null; }));
    let NAMES = null;
    // the skyline: building tops and the ground on a 25 m grid; a label shows when nothing is higher in its direction
    let HG = null;
    function heightGrid() {
      if (HG) return HG; const X = A.meta.extent, c = 25, nx = Math.ceil((X.x1 - X.x0) / c) + 1, nz = Math.ceil((X.z1 - X.z0) / c) + 1, g = new Float32Array(nx * nz).fill(-1e9);
      for (const b of A.buildings) { const f = dec(b.p), top = b.b + b.h; let a0 = Infinity, a1 = -Infinity, c0 = Infinity, c1 = -Infinity; for (let k = 0; k < f.length; k += 2) { a0 = Math.min(a0, f[k]); a1 = Math.max(a1, f[k]); c0 = Math.min(c0, f[k + 1]); c1 = Math.max(c1, f[k + 1]); }
        for (let i = Math.max(0, Math.floor((a0 - X.x0) / c)); i <= Math.min(nx - 1, Math.floor((a1 - X.x0) / c)); i++) for (let j = Math.max(0, Math.floor((c0 - X.z0) / c)); j <= Math.min(nz - 1, Math.floor((c1 - X.z0) / c)); j++) if (g[j * nx + i] < top) g[j * nx + i] = top; }
      return (HG = { g, nx, nz, c, X });
    }
    const topAt = (x, z) => { const H = HG, i = Math.floor((x - H.X.x0) / H.c), j = Math.floor((z - H.X.z0) / H.c); const b = i >= 0 && j >= 0 && i < H.nx && j < H.nz ? H.g[j * H.nx + i] : -1e9; return Math.max(b, ctx.groundAt(x, z)); };
    function clear(eye, d, alt) {   // nothing higher than the line of sight within 6 km in direction d (model unit vector)
      if (alt < 1) return false; const hz = Math.hypot(d[0], d[2]) || 1, ux = d[0] / hz, uz = d[2] / hz, tn = Math.tan(alt * D2R);
      for (let s = 15; s < 6000; s *= 1.06) if (topAt(eye.x + ux * s, eye.z + uz * s) - eye.y > s * tn) return false;
      return true;
    }
    const tv = new THREE.Vector3();
    const project = (x, y, z) => { tv.set(x, y, z).project(camera); return tv.z < 1 && tv.z > -1 ? [(tv.x + 1) / 2 * innerWidth, (1 - tv.y) / 2 * innerHeight] : null; };
    let labKey = '';
    function placeLabels() {
      const want = [], cam = camera.position, a = S.A;
      if (S.visible && a) {
        const Nl = nelm(), cov = cover();
        if (S.names && NAMES && starMag && Nl > 0 && cov < .85) {
          heightGrid(); const lim = Math.min(Nl - .5, 2.5), refr = h => h + 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * D2R) / 60;
          const dirEq = (ra, de) => { const m = a.M3(eqjVec(ra, de)), h = Math.asin(Math.max(-1, Math.min(1, m[1]))) * R2D, hz = Math.hypot(m[0], m[2]) || 1, h2 = refr(h) * D2R; return { d: [m[0] / hz * Math.cos(h2), Math.sin(h2), m[2] / hz * Math.cos(h2)], alt: h }; };
          let ns = 0;
          for (const [hr, name] of NAMES.sorted) { const s = starMag.get(hr); if (!s || s[3] > lim || ns >= 30) continue; const o = dirEq(s[1], s[2]); if (!clear(cam, o.d, o.alt)) continue; want.push({ cls: 'st', txt: name, d: o.d, kind: 'star' }); ns++; }
          for (const m of NAMES.m.objects) { if (!(m[4] <= Nl - 1.5)) continue; const o = dirEq(m[2], m[3]); if (!clear(cam, o.d, o.alt)) continue;
            const nm = m[7] && m[7].length < 34 && !/Id With|Asterism|Double Star|Localized/.test(m[7]) ? ` ${m[7].replace(/ = .*/, '')}` : ''; want.push({ cls: 'm', txt: `M ${m[0]}${nm}`, d: o.d, kind: 'messier', id: m[0] }); }
        }
        if (azGroup.visible) for (const l of azLabels) want.push(l);
        if (S.lcy && LCY) for (const l of LCY.labels) want.push(l);
      }
      camera.updateMatrixWorld();   // the hooks run before the render updates the camera's matrices (a moved camera projects stale otherwise)
      const boxes = [], out = { stars: [], messier: [] }; let k = 0;
      for (const w of want) {
        const p = w.at ? project(...w.at) : project(cam.x + w.d[0] * R_SKY, cam.y + w.d[1] * R_SKY, cam.z + w.d[2] * R_SKY); if (!p || p[0] < 0 || p[0] > innerWidth || p[1] < 40 || p[1] > innerHeight) continue;
        const bw = w.txt.length * 6 + 6, b = [p[0] + 5, p[1] - 15, bw, 13]; if (boxes.some(q => b[0] < q[0] + q[2] && q[0] < b[0] + b[2] && b[1] < q[1] + q[3] && q[1] < b[1] + b[3])) continue; boxes.push(b);
        const el = labEl(k++); if (el.textContent !== w.txt) el.textContent = w.txt; if (el.className !== 'skx ' + w.cls) el.className = 'skx ' + w.cls; el.style.transform = `translate(${(p[0] + 6) | 0}px,${(p[1] - 15) | 0}px)`; el.hidden = false;
        if (w.kind === 'star') out.stars.push(w.txt); else if (w.kind === 'messier') out.messier.push(w.id);
      }
      for (let i = k; i < labPool.length; i++) if (!labPool[i].hidden) labPool[i].hidden = true;
      const key = out.stars.join() + '|' + out.messier.join(); S.labelled = out; if (key !== labKey) { labKey = key; panelSoon(); }
    }

    // ---------- satellites (sky.js satRecs, rec, satLook, satPoints, nextIss)
    let SJ = globalThis.satellite, satSnap = null, satLive = null;
    const rec = o => { try { return { r: SJ.json2satrec(o), name: o.OBJECT_NAME, id: o.NORAD_CAT_ID, std: o.NORAD_CAT_ID === 25544 ? -1.3 : o.NORAD_CAT_ID === 48274 ? 0 : 4.0 }; } catch { return null; } };
    async function satRecs(t) {
      if (!SJ) { await loadScript(WEBGL + 'vendor/satellite.min.js'); SJ = globalThis.satellite; }
      if (Math.abs(t - SNAP.sats) / 864e5 < 7) { if (!satSnap) { const d = await ctx.loadJSON(DATA + 'sky/sats-2026-10-03.json'); satSnap = { src: 'snapshot ' + d.fetched.slice(0, 10), recs: d.sats.map(rec).filter(Boolean) }; } return satSnap; }
      if (!S.fetch) return null;
      if (!satLive) {
        let d = null; try { const c = JSON.parse(localStorage.getItem('dl-celestrak') || 'null'); if (c && Date.now() - c.at < 2 * 3600e3) d = c.d; } catch { /* storage blocked */ }
        if (!d) { d = []; for (const u of ['https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=json', 'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json']) d.push(...await getJSON(u)); try { localStorage.setItem('dl-celestrak', JSON.stringify({ at: Date.now(), d })); } catch { /* storage blocked */ } }
        const seen = new Set(); satLive = { src: 'CelesTrak live', recs: d.filter(o => !seen.has(o.NORAD_CAT_ID) && seen.add(o.NORAD_CAT_ID)).map(rec).filter(Boolean) };
      }
      return Math.abs(t - Date.now()) / 864e5 < 10 ? satLive : null;
    }
    const obsGd = { latitude: lat0 * D2R, longitude: lon0 * D2R, height: 0.01 };
    const sunEci = t => { const v = AE.GeoVector('Sun', AE.MakeTime(new Date(t)), true); return [v.x * 149597870.7, v.y * 149597870.7, v.z * 149597870.7]; };
    function satLook(s, t, sun) {
      const pv = SJ.propagate(s.r, new Date(t)); if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
      const p = pv.position, la = SJ.ecfToLookAngles(obsGd, SJ.eciToEcf(p, SJ.gstime(new Date(t)))), su = nrm(sun), pr = p.x * su[0] + p.y * su[1] + p.z * su[2], perp = Math.hypot(p.x - pr * su[0], p.y - pr * su[1], p.z - pr * su[2]);
      return { el: la.elevation * R2D, az: la.azimuth * R2D, range: la.rangeSat, lit: pr > 0 || perp > 6371 };
    }
    function satPoints() {
      const out = []; if (!S.satSet || !S.A || S.A.sun.alt > -6) return out; const sun = sunEci(S.t);
      for (const s of S.satSet.recs) { const L = satLook(s, S.t, sun); if (!L || L.el < 0 || !L.lit) continue; out.push({ name: s.name, id: s.id, alt: L.el, az: L.az, mag: s.std + 5 * Math.log10(L.range / 1000), dir: dirArr(L.az, L.el) }); }
      return out;
    }
    function nextIss(from) {   // the first pass above 10 degrees, sunlit, in a dark sky (sun below -6), within 3 days
      const s = S.satSet && S.satSet.recs.find(r => r.id === 25544); if (!s) return null;
      const sa = [], se = []; for (let k = 0; k <= 72 * 6; k++) { sa.push(sunAltAt(from + k * 600e3)); se.push(sunEci(from + k * 600e3)); }
      let pass = null;
      for (let t = from; t < from + 72 * 3600e3; t += 20e3) { const j = Math.round((t - from) / 600e3); if (sa[j] >= -6) { if (pass) return pass; continue; }
        const L = satLook(s, t, se[j]), ok = L && L.el > 10 && L.lit;
        if (ok) { if (!pass) pass = { t0: t, az0: L.az, max: L.el, tmax: t, azmax: L.az }; else if (L.el > pass.max) Object.assign(pass, { max: L.el, tmax: t, azmax: L.az }); pass.t1 = t; pass.az1 = L.az; }
        else if (pass) return pass; }
      return pass;
    }

    // ---------- the viewpoint lines (sky.js after): from the viewpoint along the ground to the sun's and the moon's azimuth,
    // 6 km; faint lines for sunrise, sunset, moonrise and moonset; not drawn while the camera is within 500 m of the viewpoint
    let azLabels = [];
    const hereOf = () => S.vp === 'camera' ? { x: camera.position.x, y: camera.position.y, z: camera.position.z, name: 'the camera' } : VPS[S.vp];
    function buildAz() {
      for (const c of [...azGroup.children]) { azGroup.remove(c); c.geometry.dispose(); c.material.dispose(); } azLabels = [];
      const a = S.A, h = hereOf(); if (!S.azl || !a || S.vp === 'camera') return;
      const line = (az, color, opacity, label) => { const d = dirArr(az, 0), p = []; for (let k = 0; k <= 48; k++) { const s = 6000 * (k / 48) ** 1.6; p.push([h.x + d[0] * s, h.y, h.z + d[2] * s]); } azGroup.add(lineOf(p, color, opacity)); if (label) azLabels.push({ cls: label[1], txt: label[0], at: p[48] }); };
      const T = S.days; if (T) { const at = (t, b, c) => { if (t == null) return; const tm = AE.MakeTime(new Date(t)), eq = AE.Equator(b, tm, OBS, true, true), hz = AE.Horizon(tm, OBS, eq.ra, eq.dec, 'normal'); line(hz.azimuth, c, .6); };
        at(T.sunrise, 'Sun', 0xffd27a); at(T.sunset, 'Sun', 0xff9a5a); at(T.moonrise, 'Moon', 0xbcd4ff); at(T.moonset, 'Moon', 0x8fa6d1); }
      line(a.sun.az, 0xffd23f, a.sun.alt > -.8 ? 1 : .5, [`Sun ${Math.round(a.sun.az)}° ${a.sun.alt > -.8 ? 'up' : 'down'}`, 'sun']);
      line(a.moon.az, 0xe8f0ff, a.moon.alt > -.8 ? 1 : .5, [`Moon ${Math.round(a.moon.az)}° ${a.moon.alt > -.8 ? 'up' : 'down'}`, 'moon']);
    }
    // London City Airport approach paths (sky.js approaches): the extended runway centreline from each landing threshold
    // (OpenStreetMap, ODbL), rising at the published 5.5 degree glide path from 15 m over the threshold, out to 12 km
    async function buildLcy() {
      if (LCY) return; const D = await ctx.loadJSON(DATA + 'sky/lcy-approach.json'), T = D.thresholds.map(t => geoXZ(t.lon, t.lat)), L = Math.hypot(T[1][0] - T[0][0], T[1][1] - T[0][1]), u = [(T[1][0] - T[0][0]) / L, (T[1][1] - T[0][1]) / L], tg = Math.tan(D.glide_path_deg * D2R), y0 = D.aerodrome_elevation_m + D.threshold_crossing_height_m;
      const labels = [];
      D.thresholds.forEach((t, k) => { const s = k === 0 ? -1 : 1, P = d => [T[k][0] + s * u[0] * d, y0 + d * tg, T[k][1] + s * u[1] * d], p = []; for (let d = 0; d <= 12000; d += 200) p.push(P(d));
        lcy.add(lineOf(p, 0xffbe5a, .8)); const dots = []; for (let d = 1000; d <= 12000; d += 1000) dots.push(new THREE.Vector3(...P(d)));
        const pm = new THREE.Points(new THREE.BufferGeometry().setFromPoints(dots), new THREE.PointsNodeMaterial({ color: 0xffbe5a, size: 3, sizeAttenuation: false, toneMapped: false })); pm.frustumCulled = false; lcy.add(pm);
        labels.push({ cls: 'lcy', txt: `London City runway ${t.rwy} approach, ${D.glide_path_deg}°`, at: P(6000) }); });
      LCY = { D, labels }; draw();
    }

    // ---------- the clock: everything that depends on the time
    let lastT = null, satBusy = 0, issT = 0, celVz = 1;
    function celMatrix() {   // EQJ -> model at R_SKY; with vertical exaggeration y / vz (the lines at their true altitude, as sky3.js vzUndistort)
      const a = S.A; if (!a) return; celVz = ctx.vzNow ? ctx.vzNow() : 1;
      cel.matrix.makeBasis(new THREE.Vector3(...a.C[0]), new THREE.Vector3(...a.C[1]), new THREE.Vector3(...a.C[2])).scale(new THREE.Vector3(R_SKY, R_SKY, R_SKY)).premultiply(new THREE.Matrix4().makeScale(1, 1 / celVz, 1));
      cel.matrixWorldNeedsUpdate = true;
    }
    function update(force) {
      const t = ctx.clock; if (!force && t === lastT) return; const changed = t !== lastT; lastT = t; S.t = t;
      S.A = compute(t); const a = S.A;
      if (changed) { S.days = dayTimes(t); buildAz(); refreshSats(t); }
      celMatrix();
      const g = a.GM; GMu.value.set(g[0][0], g[1][0], g[2][0], g[0][1], g[1][1], g[2][1], g[0][2], g[1][2], g[2][2]);
      const Nl = nelm(), cov = cover(), dayk = Math.max(0, Math.min(1, (a.sun.alt + 8) / 12)) ** 1.5;
      lineK.value = S.lines && Nl > 1.5 ? Math.min(1, (Nl - 1.5) / 2) * (S.dark ? .32 : .2) * (1 - .95 * cov) : 0; if (lines) lines.visible = lineK.value > 0.001;
      mwK.value = S.mw ? Math.max(0, Math.min(1, (Nl - 4.6) / 1.5)) * (1 - .95 * cov) : 0; mw.visible = mwK.value > 0.001;
      // the cloud mask
      const cl = clmFor(t), cr = cl && clmLoad(cl); S.clm = cr || null;
      if (cr && cr.ready && S.clmOn) { clmTex.value = cr.tex; clmK.mean.value = cr.mean; const w = sky.wx; clmK.use.value = w ? 1 : 0; clmK.cov.value = w ? Math.max(0, Math.min(1, w.low ?? w.cover ?? 0)) : 0;
        const night = new THREE.Color(.20, .155, .10).multiplyScalar(Math.max(.15, 1 - dayk)), dayc = new THREE.Color(.72, .73, .76); clmK.col.value.copy(night.lerp(dayc, dayk)).convertSRGBToLinear(); deck.visible = S.visible; }
      else deck.visible = false;
      fillPoints(); panelSoon(); draw();
    }
    async function refreshSats(t) {
      const k = ++satBusy; S.iss = undefined;
      try { const set = await satRecs(t); if (k !== satBusy) return; S.satSet = set; S.satErr = null; }
      catch (e) { if (k !== satBusy) return; S.satSet = null; S.satErr = e.message; }
      S.satPts = satPoints(); fillPoints(); draw(); panelSoon();
      clearTimeout(issT); if (S.satSet) issT = setTimeout(() => { if (k !== satBusy) return; S.iss = nextIss(S.t); panel(); }, 400);
    }

    // ---------- the menu: under the layer's own switch (Time tab)
    const opt = (label, key, cb) => ui.toggle(label, S[key], v => { S[key] = v; if (cb) cb(v); update(true); placeLabels(); });
    opt('Constellation lines', 'lines');
    opt('Star names and Messier objects (those the sky shows)', 'names', v => { if (v) loadNames().then(d => { NAMES = d && { ...d, sorted: d.n.names.map(x => [x[0], x[1]]).sort((p, q) => (starMag.get(p[0]) || [0, 0, 0, 9])[3] - (starMag.get(q[0]) || [0, 0, 0, 9])[3]) }; draw(); }); });
    opt('Milky Way', 'mw');
    S.clmOn = true; ui.toggle('Cloud from the satellite (cloud mask)', true, v => { S.clmOn = v; update(true); });
    opt('Sky as from a dark site', 'dark');
    opt('Sun and moon lines on the map', 'azl', () => buildAz());
    opt('London City Airport approach paths', 'lcy', v => { lcy.visible = v && S.visible; if (v) buildLcy().catch(e => console.warn('sky-extra: lcy', e)); });
    opt('Fetch satellites and the cloud mask for other times', 'fetch', () => { refreshSats(ctx.clock); });
    const host = ui.host();
    { const l = document.createElement('label'); l.className = 'row'; l.append('Viewpoint '); const s = document.createElement('select'); s.id = 'skxVp'; s.setAttribute('aria-label', 'Viewpoint for the sun and moon lines');
      s.innerHTML = Object.entries(VPS).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join(''); s.value = S.vp; s.onchange = () => { S.vp = s.value; buildAz(); placeLabels(); draw(); }; l.append(s); host.appendChild(l); }
    { const r = document.createElement('div'); r.className = 'btnrow';
      r.innerHTML = '<button type="button" data-k="moon">Look at the moon</button><button type="button" data-k="sun">Look at the sun</button><button type="button" data-k="photo">Photo time (3 Oct)</button>';
      r.onclick = e => { const b = e.target.closest('button'); if (!b) return; const D3 = globalThis.__docklands3; if (!D3) return;
        if (b.dataset.k === 'photo') { D3.setClockUser(D3.fromLondon(PHOTO)); S.vp = 'greenland'; document.getElementById('skxVp').value = 'greenland'; D3.setView('rotherhithe'); return; }
        const a = S.A; if (!a) return; const d = a[b.dataset.k].dir, h = hereOf(), ey = h.y + 1.6, dist = 1000;
        D3.setCam({ tx: h.x + d[0] * dist, ty: ey + d[1] * dist, tz: h.z + d[2] * dist, dist, yaw: Math.atan2(-d[0], -d[2]), pitch: Math.asin(-d[1]), fov: (b.dataset.k === 'moon' ? 12 : 40) * D2R }); };
      host.appendChild(r); }
    const det = document.createElement('details'); det.innerHTML = '<summary>Sky now: planets, satellites, twilight</summary><div id="skxOut" class="small" aria-live="polite"></div>'; host.appendChild(det);
    det.addEventListener('toggle', () => panel());
    ui.note('Planets and Jupiter\'s moons: <a href="https://github.com/cosinekitty/astronomy">Astronomy Engine</a> (MIT). Constellation lines: <a href="https://github.com/ofrohn/d3-celestial">d3-celestial</a> (Olaf Frohn, BSD-3-Clause). Star names: <a href="https://www.iau.org/public/themes/naming_stars/">IAU Working Group on Star Names</a> (CC BY). Messier objects: <a href="https://heasarc.gsfc.nasa.gov/W3Browse/all/messier.html">NASA HEASARC</a> (public domain). Satellites: <a href="https://celestrak.org/">CelesTrak</a> GP data (snapshot of 4 October 2026; live only after you tick "Fetch"), <a href="https://github.com/shashwatak/satellite-js">satellite.js</a> (MIT). Cloud mask: contains modified EUMETSAT Meteosat data 2026 (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>). Runway thresholds: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> (ODbL). Milky Way: a band computed from galactic coordinates.');

    let pT = 0; function panelSoon() { clearTimeout(pT); pT = setTimeout(panel, 250); }
    function panel() {
      const out = document.getElementById('skxOut'); if (!out || !det.open || !S.A) return;
      const a = S.A, T = S.days || {}, rng = (p, q) => `${hm(p)}–${hm(q)}`, Nl = nelm();
      const up = a.planets.filter(p => p.alt > 0).map(p => `${p.name} ${deg(p.az)} ${compass(p.az)}, ${f1(p.alt)}° up, mag ${f1(p.mag)}`);
      const jm = a.planets[3].alt > 0 ? ` Jupiter's moons (mag 4.6 to 5.7, only from a dark site or with binoculars): ${a.jmoons.map(m => `${m.name} ${f1(m.sep)}′`).join(', ')} from Jupiter.` : '';
      const iss = S.iss;
      const rows = [
        ['Golden hour', `${rng(T.goldenAm?.[0], T.goldenAm?.[1])} and ${rng(T.goldenPm?.[0], T.goldenPm?.[1])} (sun from −4° to +6°)`],
        ['Blue hour', `${rng(T.blueAm?.[0], T.blueAm?.[1])} and ${rng(T.bluePm?.[0], T.bluePm?.[1])} (sun −6° to −4°)`],
        ['Twilight ends (civil, nautical, astronomical)', T.dusk ? T.dusk.map(hm).join(', ') : '—'], ['Dawn begins (astronomical, nautical, civil)', T.dawn ? T.dawn.map(hm).join(', ') : '—'],
        ['Moon phase', `${phaseName(a.moon.elong)}, ${Math.round(a.moon.frac * 100)}% lit (phase angle ${f1(a.moon.phase)}°), ${(a.moon.diam * 60).toFixed(1)}′ across`],
        ['Bright limb', a.moon.alt > -2 ? `${deg(a.moon.limb)} from the top of the disc, clockwise (the ${clockWord(a.moon.limb)} side is lit)` : 'moon down'],
        ['Moonrise, moonset', `${hm(T.moonrise)}, ${hm(T.moonset)}`],
        ['Planets up', up.length ? up.join('; ') + '.' + jm : 'none above the horizon'],
        ['Milky Way core', `${f1(a.gc.alt)}° ${a.gc.alt > 0 ? 'up' : 'below the horizon'} now${T.gcBest ? `; highest in full darkness ${f1(T.gcBest.alt)}° at ${hm(T.gcBest.t)}` : '; no astronomical darkness this night'} (from London it never rises more than 9.5°)`],
        ['Stars and planets drawn', `to magnitude ${f1(Nl)} (${S.dark ? 'dark site' : 'London sky glow, Bortle 8 to 9'}, with twilight, moonlight and haze). The stars are the port's own (sky3.js, to magnitude 5); this limit sets the planets, satellites, names, lines and the Milky Way (shown from magnitude 4.6: tick "dark site").`],
        ['Names on the sky', !S.names ? 'off' : `${S.labelled.stars.length ? 'stars: ' + S.labelled.stars.map(esc).join(', ') : 'no named star bright enough and in view'}; ${S.labelled.messier.length ? 'Messier: ' + S.labelled.messier.map(m => 'M ' + m).join(', ') : 'no Messier object bright enough for this sky and in view'} (only what the star limit shows, not behind buildings)`],
        ['Satellites', S.satSet ? `${S.satPts.length} sunlit above the horizon now (${S.satSet.recs.length} bright satellites, ${esc(S.satSet.src)})` : S.fetch ? (S.satErr ? esc(S.satErr) : 'orbit data older than 10 days from that time') : 'tick "Fetch" for times more than 7 days from 4 October 2026'],
        ['Next ISS pass', iss ? `${dayL(iss.t0)} ${hm(iss.t0)}–${hm(iss.t1)}: from ${compass(iss.az0)} to ${compass(iss.az1)}, highest ${f1(iss.max)}° at ${hm(iss.tmax)} in the ${compass(iss.azmax)}` : iss === null ? 'none above 10° in a dark sky in the next 3 days' : S.satSet ? 'searching…' : '—'],
        ['Cloud from the satellite', S.clm ? (S.clm.ready ? `EUMETSAT Meteosat cloud mask at ${hm(S.clm.t)} ${tz(S.clm.t)} (${esc(S.clm.src)}): ${Math.round(S.clm.mean * 100)}% cloud within 60 km; drawn as a cloud deck at 1 km, moving with the wind${sky.wx ? ', its cover from the weather layer\'s low cloud, placed by the mask' : ' (no weather: the mask about its mean, as the WebGL page)'}` : S.clm.err ? 'cloud mask ' + esc(S.clm.err) : 'loading…') : S.fetch ? 'no cloud mask for that time (none before September 2020, none in the future)' : 'tick "Fetch" for the satellite cloud at times away from the photo evening (3 October 2026, 22:30 to 01:30 BST)'],
      ];
      out.innerHTML = `<p>${dayL(S.t)} ${hm(S.t)} ${tz(S.t)} · observer at Canary Wharf (${lat0.toFixed(3)}° N, ${(-lon0).toFixed(3)}° W)</p><table>${rows.map(([p, q]) => `<tr><th>${esc(p)}</th><td>${q}</td></tr>`).join('')}</table>`;
    }

    // ---------- each frame: follow the eye; the clock; the labels
    let camKey = '';
    ctx.onFrame(() => {
      if (!S.visible) return;
      update(false);
      const c = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld); root.position.copy(c); cel.matrixWorldNeedsUpdate = true;   // round the eye in model metres (camera.position is in the exaggerated space with ?vz=); cel is a child of root: its matrix has no translation
      if ((ctx.vzNow ? ctx.vzNow() : 1) !== celVz) celMatrix();
      if (deck.visible) deckFrame(c);
      const h = hereOf(); azGroup.visible = S.azl && S.vp !== 'camera' && Math.hypot(c.x - h.x, c.z - h.z) >= 500;
      const k = `${c.x.toFixed(1)},${c.y.toFixed(1)},${c.z.toFixed(1)},${camera.quaternion.x.toFixed(4)},${camera.quaternion.y.toFixed(4)},${camera.fov},${innerWidth},${lastT},${NAMES ? 1 : 0}`;
      if (k !== camKey) { camKey = k; placeLabels(); }
    });
    if (S.names) loadNames().then(d => { NAMES = d && { ...d, sorted: d.n.names.map(x => [x[0], x[1]]).sort((p, q) => (starMag.get(p[0]) || [0, 0, 0, 9])[3] - (starMag.get(q[0]) || [0, 0, 0, 9])[3]) }; camKey = ''; draw(); });
    root.visible = on; deck.visible = false; azGroup.visible = on;
    update(true);
    function setVisible(v) {
      S.visible = v; root.visible = v; lcy.visible = v && S.lcy; azGroup.visible = v && S.azl; if (!v) { deck.visible = false; for (const e of labPool) e.hidden = true; } else { camKey = ''; update(true); } draw();
    }
    return {
      object: root, setVisible,
      get state() { const a = S.A; return a && { t: S.t, nelm: +nelm().toFixed(2), planetsUp: a.planets.filter(p => p.alt > 0).map(p => p.name), pointsDrawn: S.drawnPoints, satellites: S.satPts.length, satSource: S.satSet && S.satSet.src, iss: S.iss, lines: S.nLines || 0, lineGain: +lineK.value.toFixed(3), milkyWay: +mwK.value.toFixed(3),
        cloudMask: S.clm && { ready: S.clm.ready, mean: S.clm.mean, shown: deck.visible }, labelled: S.labelled, lcy: !!LCY && lcy.visible, azimuth: azGroup.children.length }; },
      setOption(k, v) { S[k] = v; if (k === 'lcy') { lcy.visible = v; if (v) buildLcy(); } if (k === 'azl' || k === 'vp') buildAz(); if (k === 'clmOn') S.clmOn = v; update(true); camKey = ''; draw(); },
      openPanel() { det.open = true; panel(); }, panel: () => document.getElementById('skxOut')?.textContent || '',
    };
  },
};
