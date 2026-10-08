// Sky of the Three.js port of the Docklands 3D page: the sun and the moon from Astronomy Engine (vendor/astronomy.browser.min.js,
// as sky.js uses it) for the page clock, three.js SkyMesh (TSL atmosphere scattering) by day, the Yale Bright Star
// Catalogue (data/sky/stars.json) as instanced sprites by night, and the light rig (sun, moon, sky fill). The clock is
// ?t=YYYY-MM-DDTHH:MM (London wall clock, as sky.js) or now. Skill: docklands-sky (the WebGL page's sky: much more there).
import * as THREE from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { instancedBufferAttribute, uniform, vec4, float, uv, smoothstep, length } from 'three/tsl';
import { A } from './build.js';

const AE = globalThis.Astronomy;
const lon0 = A.meta.geo.lon0 + 0.07, lat0 = A.meta.geo.lat0 + 0.03;   // about the middle of the model (Canary Wharf)
const OBS = AE ? new AE.Observer(lat0, lon0, 10) : null;

// London wall clock -> ms UTC (sky.js fromLondon)
const offset = u => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(u)).reduce((o, x) => (o[x.type] = x.value, o), {});
  return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(u / 1000) * 1000; };
export function fromLondon(s) {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d))?)?$/.exec(String(s).trim()); if (!m) return NaN;
  const u = Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0)); return u - offset(u - offset(u));
}
// azimuth (degrees from north, clockwise) and altitude -> unit vector in the model frame (x east, y up, z south)
export const dirOf = (az, alt) => { const a = az * Math.PI / 180, e = alt * Math.PI / 180; return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)); };
function horizon(body, t) { const d = new Date(t), q = AE.Equator(body, d, OBS, true, true), h = AE.Horizon(d, OBS, q.ra, q.dec, 'normal'); return { az: h.azimuth, alt: h.altitude }; }

export class Sky3 {
  constructor(scene) {
    this.scene = scene; this.t = Date.now();
    this.sky = new SkyMesh(); this.sky.scale.setScalar(10000); this.sky.material.depthTest = false; this.sky.material.depthWrite = false; this.sky.renderOrder = -10; this.sky.frustumCulled = false;   // drawn first, behind everything, inside the far plane (20 km at least)
    this.sky.turbidity.value = 4; this.sky.rayleigh.value = 1.6; this.sky.mieCoefficient.value = 0.004; this.sky.mieDirectionalG.value = 0.8;
    if (this.sky.cloudCoverage) this.sky.cloudCoverage.value = 0.25;
    scene.add(this.sky);
    this.sun = new THREE.DirectionalLight(0xfff4e5, 3); this.sun.castShadow = false; scene.add(this.sun, this.sun.target);
    this.moon = new THREE.DirectionalLight(0x9fb4d8, 0); scene.add(this.moon, this.moon.target);
    this.fill = new THREE.HemisphereLight(0xbfd4ff, 0x40372c, 1.0); scene.add(this.fill);
    this.starGain = uniform(0);
    this.stars = null;
  }
  async loadStars(url) {
    if (!AE) return; const J = await (await fetch(url)).json(); this.starData = J.stars.filter(s => s[3] < 5);
    const n = this.starData.length, pos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), size = new THREE.InstancedBufferAttribute(new Float32Array(n), 1), col = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.starData.forEach((s, i) => { const m = s[3], bv = s[4], k = Math.pow(10, -0.4 * (m - 1)); size.array[i] = Math.max(1.2, Math.min(5, 2.2 + 1.5 * Math.sqrt(k)));
      const c = bv < 0 ? [0.75, 0.82, 1] : bv < 0.6 ? [1, 1, 1] : bv < 1.2 ? [1, 0.93, 0.8] : [1, 0.8, 0.62]; col.array.set(c.map(x => x * Math.min(1.4, 0.35 + k)), 3 * i); });
    const mat = new THREE.PointsNodeMaterial({ sizeAttenuation: false, transparent: true, depthWrite: false });
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
  // the clock; returns { sun, moon, night } (night: the sun more than 6 degrees below the horizon)
  setTime(t, focus) {
    this.t = t; if (!AE) return { night: false };
    const S = horizon('Sun', t), M = horizon('Moon', t), sd = dirOf(S.az, S.alt), md = dirOf(M.az, M.alt), ph = AE.Illumination('Moon', new Date(t)).phase_fraction;
    this.sky.sunPosition.value.copy(sd);
    const day = THREE.MathUtils.smoothstep(S.alt, -6, 4), up = THREE.MathUtils.smoothstep(S.alt, -2, 15);
    this.sun.position.copy(sd).multiplyScalar(4000).add(focus); this.sun.target.position.copy(focus);
    this.sun.intensity = 3.2 * up; this.sun.color.setHSL(0.08, 0.6, 0.55 + 0.4 * THREE.MathUtils.smoothstep(S.alt, 0, 25));
    this.moon.position.copy(md).multiplyScalar(4000).add(focus); this.moon.target.position.copy(focus);
    this.moon.intensity = M.alt > 0 ? 0.25 * ph * (1 - day) : 0;
    this.fill.intensity = 0.18 + 1.0 * day; this.fill.color.setHSL(0.6, 0.5, 0.45 + 0.3 * day);
    this.sky.visible = day > 0.02; this.starGain.value = 1 - day;
    if (this.stars) this.placeStars();
    this.state = { sun: S, moon: M, moonPhase: ph, day, night: S.alt < -6 };
    return this.state;
  }
}
