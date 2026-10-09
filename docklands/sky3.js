// Sky of the Three.js port of the Docklands 3D page: the sun and the moon from Astronomy Engine (vendor/astronomy.browser.min.js,
// as sky.js uses it) for the page clock, three.js SkyMesh (TSL atmosphere scattering) by day, the Yale Bright Star
// Catalogue (data/sky/stars.json) as instanced sprites by night, the moon as a disc with its phase, and the light rig
// (sun, moon, sky fill). Directions use true north at the observer (area.js meta.geo: about 1.5 degrees west of grid north,
// as sky.js setObserver). The weather layer (layers/weather.js) calls setWeather: cloud on the SkyMesh, sun and moon dimmed
// by the cloud, stars hidden by it, haze (scene.fogNode) from the visibility, the night background lit by the city under
// cloud. The clock is ?t=YYYY-MM-DDTHH:MM (London wall clock, as sky.js) or now. Check: docklands/test/clock-check.mjs.
// Skill: docklands-sky (the WebGL page's sky: much more there; "Three.js port clock" for the port).
import * as THREE from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { instancedBufferAttribute, uniform, vec3, vec4, float, uv, smoothstep, length, cameraPosition, positionGeometry, positionView, fog, exp, dot, sqrt, max, mix } from 'three/tsl';
import { A } from './build.js';

const AE = globalThis.Astronomy;
const lon0 = A.meta.geo.lon0 + 0.07, lat0 = A.meta.geo.lat0 + 0.03;   // about the middle of the model (Canary Wharf)
const OBS = AE ? new AE.Observer(lat0, lon0, 10) : null;

// London wall clock -> ms UTC (sky.js fromLondon). In the hour that repeats when the clocks go back (last Sunday of
// October, 01:00 to 01:59) the first one (BST) is taken; a time in the hour that is skipped in March moves one hour on.
const offset = u => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(u)).reduce((o, x) => (o[x.type] = x.value, o), {});
  return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(u / 1000) * 1000; };
export function fromLondon(s) {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d))?)?$/.exec(String(s).trim()); if (!m) return NaN;
  const u = Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0));
  const bst = u - 36e5; if (bst + offset(bst) === u) return bst;   // summer time (or the first of a repeated hour)
  return u - offset(u - offset(u));
}
// true north and east at the observer in the model frame (x east of grid, y up, z south of grid): the derivatives of the
// area.js geo fit, as sky.js setObserver. GRID_CONV: the grid bearing of true north (degrees, + east; about -1.5)
const G = A.meta.geo, geoXZ = (lon, lat) => { const a = lon - G.lon0, b = lat - G.lat0, t = [1, a, b, a * b, a * a, b * b]; return [t.reduce((s, v, i) => s + v * G.x[i], 0), t.reduce((s, v, i) => s + v * G.z[i], 0)]; };
const [gx0, gz0] = geoXZ(lon0, lat0), [gxn, gzn] = geoXZ(lon0, lat0 + 1e-4);
const NORTH = new THREE.Vector3(gxn - gx0, 0, gzn - gz0).normalize(), UP = new THREE.Vector3(0, 1, 0), EAST = new THREE.Vector3().crossVectors(NORTH, UP).normalize();
export const GRID_CONV = Math.atan2(NORTH.x, -NORTH.z) * 180 / Math.PI;
// azimuth (true, degrees from north, clockwise) and altitude -> unit vector in the model frame
export const dirOf = (az, alt) => { const a = az * Math.PI / 180, e = alt * Math.PI / 180, c = Math.cos(e);
  return new THREE.Vector3().addScaledVector(NORTH, c * Math.cos(a)).addScaledVector(EAST, c * Math.sin(a)).addScaledVector(UP, Math.sin(e)); };
// alt: apparent (refraction 'normal'); altGeo: without refraction (twilight is defined on it: Astronomy Engine's 'normal'
// refraction adds about 0.6 degrees even far below the horizon)
function horizon(body, t) { const d = new Date(t), q = AE.Equator(body, d, OBS, true, true), h = AE.Horizon(d, OBS, q.ra, q.dec, 'normal'), g = AE.Horizon(d, OBS, q.ra, q.dec);
  return { az: h.azimuth, alt: h.altitude, altGeo: g.altitude, dist: q.dist }; }
const sstep = THREE.MathUtils.smoothstep, clamp01 = v => Math.max(0, Math.min(1, v));
const MOON_R = 14000, MOON_MIN = 0.3;   // the disc's distance (m, inside the far plane) and its least angular radius (degrees: about 5 px on a 800 px tall view)

export class Sky3 {
  constructor(scene) {
    this.scene = scene; this.t = Date.now(); this.wx = null; this.base = null;
    this.sky = new SkyMesh(); this.sky.scale.setScalar(10000); this.sky.material.depthTest = false; this.sky.material.depthWrite = false; this.sky.renderOrder = -10; this.sky.frustumCulled = false;   // drawn first, behind everything, inside the far plane (20 km at least)
    this.sky.turbidity.value = 4; this.sky.rayleigh.value = 1.6; this.sky.mieCoefficient.value = 0.004; this.sky.mieDirectionalG.value = 0.8;
    if (this.sky.cloudCoverage) this.sky.cloudCoverage.value = 0.25;
    scene.add(this.sky);
    this.sun = new THREE.DirectionalLight(0xfff4e5, 3); this.sun.castShadow = false; scene.add(this.sun, this.sun.target);
    this.moon = new THREE.DirectionalLight(0x9fb4d8, 0); scene.add(this.moon, this.moon.target);
    this.fill = new THREE.HemisphereLight(0xbfd4ff, 0x40372c, 1.0); scene.add(this.fill);
    this.starGain = uniform(0);
    this.stars = null;
    // haze from the visibility (setWeather): 1 - exp(-sigma d), sigma = 3.912 / visibility (Koschmieder), at most 0.85
    this.fogU = { sigma: uniform(0), color: uniform(new THREE.Color(0xc4ccd6)) };
    scene.fogNode = fog(this.fogU.color, float(1).sub(exp(positionView.z.mul(this.fogU.sigma))).min(0.85));
    this.makeMoon();
  }
  // the moon: a disc facing the eye at MOON_R from the camera (so the mirror pass sees it too), added to the sky (the dark
  // side adds nothing but earthshine by night), lit on the side towards the sun (a sphere's normal against the sun direction in the disc's frame: the phase and the bright limb follow); earthshine
  // on the dark side by night
  makeMoon() {
    const U = this.moonU = { c: uniform(new THREE.Vector3(0, 1e4, 0)), r: uniform(new THREE.Vector3(1, 0, 0)), u: uniform(new THREE.Vector3(0, 1, 0)), s: uniform(new THREE.Vector3(0, 0, 1)), gain: uniform(1), shine: uniform(0) };
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });   // added to the sky: brighter than the day sky behind it
    m.positionNode = cameraPosition.add(U.c).add(U.r.mul(positionGeometry.x)).add(U.u.mul(positionGeometry.y));
    const p = uv().mul(2).sub(1), r2 = dot(p, p), n = vec3(p.x, p.y, sqrt(max(float(0), float(1).sub(r2))));
    const lit = smoothstep(-0.04, 0.06, dot(n, U.s)), disc = smoothstep(1.0, 0.9, sqrt(r2));
    const lum = mix(U.shine, float(1), lit).mul(n.z.mul(0.25).add(0.75));   // a little limb darkening
    m.colorNode = vec4(vec3(1.0, 0.96, 0.88).mul(lum).mul(1.15), 1);
    m.opacityNode = disc.mul(U.gain);
    const g = new THREE.PlaneGeometry(2, 2), mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false; mesh.renderOrder = -5; mesh.name = 'moon'; mesh.visible = false;
    this.moonDisc = mesh; this.scene.add(mesh);
  }
  async loadStars(url) {
    if (!AE) return; const J = await (await fetch(url)).json(); this.starData = J.stars.filter(s => s[3] < 5);
    const n = this.starData.length, pos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), size = new THREE.InstancedBufferAttribute(new Float32Array(n), 1), col = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.starData.forEach((s, i) => { const m = s[3], bv = s[4], k = Math.pow(10, -0.4 * (m - 1)); size.array[i] = Math.max(1.2, Math.min(5, 2.2 + 1.5 * Math.sqrt(k)));
      const c = bv < 0 ? [0.75, 0.82, 1] : bv < 0.6 ? [1, 1, 1] : bv < 1.2 ? [1, 0.93, 0.8] : [1, 0.8, 0.62]; col.array.set(c.map(x => x * Math.min(1.4, 0.35 + k)), 3 * i); });
    const mat = new THREE.PointsNodeMaterial({ sizeAttenuation: false, transparent: true, depthWrite: false, fog: false });
    mat.positionNode = instancedBufferAttribute(pos); mat.sizeNode = instancedBufferAttribute(size);
    mat.colorNode = vec4(instancedBufferAttribute(col).mul(this.starGain), float(1));
    mat.opacityNode = smoothstep(0.5, 0.15, length(uv().sub(0.5)));   // a round, soft point (the sprite is a square)
    mat.blending = THREE.AdditiveBlending;
    const sp = new THREE.Sprite(mat); sp.count = n; sp.frustumCulled = false; sp.renderOrder = -1;
    this.stars = sp; this.starPos = pos; this.scene.add(sp); this.placeStars();
  }
  placeStars() {
    if (!this.stars) return; const d = new Date(this.t), R = 15000, a = this.starPos.array;
    this.starData.forEach((s, i) => { const h = AE.Horizon(d, OBS, s[1] / 15, s[2], null), v = dirOf(h.azimuth, h.altitude).multiplyScalar(R); a[3 * i] = v.x; a[3 * i + 1] = v.y; a[3 * i + 2] = v.z; });
    this.starPos.needsUpdate = true;
  }
  // the clock; returns { sun, moon, moonPhase, day, night } (night: the sun's centre more than 6 degrees below the horizon,
  // without refraction: the end of civil twilight)
  setTime(t, focus) {
    this.t = t; if (!AE) return { night: false };
    const S = horizon('Sun', t), M = horizon('Moon', t), sd = dirOf(S.az, S.alt), md = dirOf(M.az, M.alt), il = AE.Illumination('Moon', new Date(t)), ph = il.phase_fraction;
    this.sky.sunPosition.value.copy(sd);
    const day = sstep(S.alt, -6, 4), up = sstep(S.alt, -2, 15);
    this.sun.position.copy(sd).multiplyScalar(4000).add(focus); this.sun.target.position.copy(focus);
    this.moon.position.copy(md).multiplyScalar(4000).add(focus); this.moon.target.position.copy(focus);
    // the moon disc: its frame (right, up on the disc), the sun direction in it (z towards the eye), its size
    const semi = Math.max(MOON_MIN, Math.atan(1737.4 / (M.dist * 149597870.7)) * 180 / Math.PI), k = MOON_R * Math.tan(semi * Math.PI / 180);
    const right = new THREE.Vector3().crossVectors(md, UP); if (right.lengthSq() < 1e-8) right.set(1, 0, 0); right.normalize(); const upv = new THREE.Vector3().crossVectors(right, md).normalize();
    const MU = this.moonU; MU.c.value.copy(md).multiplyScalar(MOON_R); MU.r.value.copy(right).multiplyScalar(k); MU.u.value.copy(upv).multiplyScalar(k);
    MU.s.value.set(sd.dot(right), sd.dot(upv), -sd.dot(md)).normalize();
    // the bright limb: position angle of the sun direction across the disc from the top (zenith side), clockwise (sky.js limb)
    const limb = (Math.atan2(MU.s.value.x, MU.s.value.y) * 180 / Math.PI + 360) % 360;
    this.base = { S, M, sd, md, ph, day, up };
    if (this.stars) this.placeStars();
    this.state = { sun: S, moon: M, moonPhase: ph, moonPhaseAngle: il.phase_angle, moonLimb: limb, moonSemiDiameter: semi, day, night: S.altGeo < -6, gridConvergence: GRID_CONV };
    this.applyLight();
    return this.state;
  }
  // weather (layers/weather.js): { cover, low, mid, high (0 to 1), visibility (m) or null, precip (mm/h) } or null (none known)
  setWeather(w) { this.wx = w; this.applyLight(); }
  applyLight() {
    const B = this.base; if (!B) return; const { S, M, ph, day, up } = B, w = this.wx;
    const low = w ? clamp01(w.low ?? w.cover) : 0, mid = w ? clamp01(w.mid ?? 0) : 0, high = w ? clamp01(w.high ?? 0) : 0, cover = w ? clamp01(w.cover ?? Math.max(low, mid, high)) : 0;
    // direct sun through the cloud layers (stated factors, not measured: thick low cloud passes about 15%, mid 30%, high 70%)
    const tr = (1 - 0.85 * low) * (1 - 0.7 * mid) * (1 - 0.3 * high);
    this.sun.intensity = 3.2 * up * tr; this.sun.color.setHSL(0.08, 0.6 * (0.4 + 0.6 * tr), 0.55 + 0.4 * sstep(S.alt, 0, 25));
    this.moon.intensity = M.alt > 0 ? 0.25 * ph * (1 - day) * (1 - 0.85 * cover) : 0;
    this.fill.intensity = (0.18 + 1.0 * day) * (1 - 0.25 * cover); this.fill.color.setHSL(0.6, 0.5 * (1 - 0.7 * cover), 0.45 + 0.3 * day);
    this.sky.visible = day > 0.02; this.starGain.value = (1 - day) * (1 - 0.95 * cover);
    if (this.sky.cloudCoverage) { this.sky.cloudCoverage.value = w ? cover : 0.25; this.sky.cloudDensity.value = 0.35 + 0.5 * Math.max(low, mid); }
    const vis = w && w.visibility != null ? w.visibility : null;
    this.sky.turbidity.value = vis ? 2 + 8 * clamp01(1 - vis / 40000) : 4;
    // the moon disc: above the horizon (its lower edge), dimmer by day, hidden by cloud
    this.moonDisc.visible = M.alt > -0.6;
    this.moonU.gain.value = (1 - 0.45 * day) * (1 - 0.9 * cover); this.moonU.shine.value = 0.025 * (1 - day);
    // haze and the night background (the city lights the underside of the cloud)
    this.fogU.sigma.value = vis ? 3.912 / Math.max(200, vis) : 0;
    const night = new THREE.Color(0x1c1a1c).lerp(new THREE.Color(0x3a2f27), cover), dayc = new THREE.Color(0xc4ccd6).lerp(new THREE.Color(0x9ea3a8), cover);
    this.fogU.color.value.copy(night).lerp(dayc, day);
    this.scene.background = day < 0.02 ? new THREE.Color(0x07080c).lerp(new THREE.Color(0x2a231e), 0.85 * cover) : null;
    if (this.state) this.state.weather = w ? { cover, low, mid, high, visibility: vis, sunTransmission: +tr.toFixed(3) } : null;
  }
}
