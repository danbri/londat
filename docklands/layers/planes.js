// Layer "planes" of the Three.js port (docklands/): aircraft. By default RECORDED aircraft: the adsb.lol history of the
// last 7 days (ODbL 1.0; branch adsb-cache, cwplans/tools/fetch-adsb-cache.mjs) for the page clock's date when it is held,
// else for the held day with the same weekday, at the same London time (owner, 2026-10-09: "For today build a cache of
// last 7 days for our areas, and show equivalent data for the matching time and day of week."); index and hour files are
// read from raw.githubusercontent.com when the layer is on (never from adsb.lol). SIMULATED aircraft on published
// procedures when the cache cannot be read or holds no matching day, or the box is unticked (every card, label and note
// says "simulated"). Owner, 2026-10-09: "add realistic planes with suitable models and
// trajectory info". LIVE aircraft from adsb.lol (ODbL 1.0) after the visitor taps "Live aircraft" (owner decision
// 2026-10-09: "adsb.lol (ODbL) (Recommended)": fetched in the browser only after a tap, shown with the ODbL credit,
// nothing committed, simulated traffic stays as the fallback): polled every 8 s while the layer is on, the tab is visible
// and the page clock is now (within 5 minutes of the real time); with no answer, or another clock, the simulation shows.
// The request, the tracks between polls, the type table, the heights and the privacy rule: ../planes-live.js.
// 1. London City (EGLC) runway 09/27, 2.2 km east of the model box: arrivals on a 5.5 degree glide path from 2000 ft
//    (gear down, flare, touchdown in the touchdown zone, landing roll), departures (take-off roll, straight ahead to
//    1000 ft above the aerodrome, then a climbing turn north or south to the 3000 ft SID stop altitude). Runway by the
//    wind (WU.windDir, WU.windSpeed of ../water.js): 09 when the wind blows from the east half, else 27 (the usual case).
//    Hours of AD 2.3 (closed Saturday 12:30 to Sunday 12:30 and every night 22:00 to 06:30, London time). Movements by
//    an assumed hourly shape scaled to the CAA monthly totals. Fleet: E190, E195-E2, A220-100, Dash 8-400, ATR 72-600,
//    airline-neutral livery.
// 2. Heathrow arrival streams over east London (westbound, about 4,000 to 7,000 ft), lower detail; westerly or easterly
//    operations by the wind.
// 3. Helicopters on route H4 along the Thames (1000 to 1500 ft), leaving or joining at the Isle-of-Dogs point.
// Each aircraft is a low-poly model at true size (../planes-models.js) with navigation lights, beacons, strobes and, on
// approach and take-off, landing lights (emissive: the bloom picks them up at night). Positions are a function of the
// page clock (ctx.clock), running on in real time from the moment the clock was set; the same clock gives the same
// traffic. Parameters and sources: ../planes-data.js.
// URL: ?planes=0 starts with the layer off; ?planes=test: a fixed scene (runway 09 arrival on short final over the
// Isle of Dogs / Leamouth, a runway 09 departure lifting off, a Heathrow arrival, an H4 helicopter), frozen unless
// &planesrun=1; ?planes=test27: the same on runway 27 (the departure climbs west over the Royal Docks);
// &planecam=<n> puts the camera near aircraft n (test, recorded or live) and follows it (distance &planecamd=, metres;
// &planecamyaw=, &planecampitch=, radians), e.g. ?t=2026-10-08T18:00&layers=planes&planecam=3&planecamd=70&planecamyaw=0.
// Skills: docklands-3d-page ("Three.js port"), docklands-sky ("Aircraft"), cwplans-live-state ("Helicopters").
import { WU } from '../water.js';
import * as P from '../planes-data.js';
import { aircraftParts } from '../planes-models.js';
import { ADSB, feedUrl, startFeed, createTracks, identified, REC, recBase, createRecorded, londonParts } from '../planes-live.js';
import { vec3 } from 'three/tsl';

const { FT, KT } = P, deg = Math.PI / 180, G0 = 9.81;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (...a) => { let h = 2166136261 >>> 0; for (const v of a) { h ^= (v | 0) + 0x9e3779b9; h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; } return (h >>> 0) / 4294967296; };
const pick = (list, r) => { let s = 0; for (const t of list) { s += t.share; if (r < s) return t; } return list.at(-1); };
const LONDON = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const localOf = t => { const p = Object.fromEntries(LONDON.formatToParts(new Date(t)).map(x => [x.type, x.value])); return { wd: p.weekday, h: +p.hour + +p.minute / 60 }; };

export default {
  id: 'planes', label: 'Aircraft (simulated)', on: true,
  async init(ctx, on) {
    const { THREE, A, qs, esc } = ctx, MODE = qs.get('planes') || '', TEST = /^test/.test(MODE), RUN = qs.get('planesrun') === '1';
    const Gm = A.meta.geo, geo = (lon, lat) => { const a = lon - Gm.lon0, b = lat - Gm.lat0, t = [1, a, b, a * b, a * a, b * b]; return [t.reduce((s, v, i) => s + v * Gm.x[i], 0), t.reduce((s, v, i) => s + v * Gm.z[i], 0)]; };
    const conv = (() => { const [x0, z0] = geo(0, 51.5), [x1, z1] = geo(0, 51.501); return Math.atan2(x1 - x0, -(z1 - z0)); })();   // grid bearing of true north
    const E = A.meta.extent;

    // ---------- runway frame: thresholds from the AIP, e along the runway (09 to 27, eastwards), n to its left (north)
    const L = P.LCY, t09 = geo(L.thr09.lon, L.thr09.lat), t27 = geo(L.thr27.lon, L.thr27.lat);
    const len = Math.hypot(t27[0] - t09[0], t27[1] - t09[1]), e = [(t27[0] - t09[0]) / len, (t27[1] - t09[1]) / len], nv = [e[1], -e[0]];
    const elev09 = L.thr09.elev_ft * FT, elev27 = L.thr27.elev_ft * FT, tanG = Math.tan(L.glide_deg * deg), rdh = L.rdh_ft * FT;
    // a point `along` metres from threshold `thr` outwards (away from the runway), `north` metres to the left of e
    const RW = {
      '09': { thr: t09, out: -1, elev: elev09, hdg: 92.89, other: '27' },
      '27': { thr: t27, out: 1, elev: elev27, hdg: 272.91, other: '09' },
    };
    const at = (R, along, north) => [R.thr[0] + e[0] * along * R.out + nv[0] * north, R.thr[1] + e[1] * along * R.out + nv[1] * north];

    // ---------- procedures: control points [x, y m OD, z, kt, tag] -> a centripetal Catmull-Rom spline sampled every 15 m
    // with the speed (linear between control points) and the time at each sample
    function build(name, pts, meta) {
      const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal', 0.5);
      const lenC = curve.getLength(), n = Math.max(20, Math.ceil(lenC / 15)), S = curve.getSpacedPoints(n);
      // the sample nearest each control point (the spline passes through them)
      const ci = pts.map(p => { let b = 0, bd = 1e18; for (let i = 0; i < S.length; i++) { const d = (S[i].x - p[0]) ** 2 + (S[i].y - p[1]) ** 2 + (S[i].z - p[2]) ** 2; if (d < bd) { bd = d; b = i; } } return b; });
      for (let k = 1; k < ci.length; k++) ci[k] = Math.max(ci[k], ci[k - 1]);
      const v = new Float32Array(S.length), tag = new Array(S.length), t = new Float64Array(S.length);
      for (let k = 0; k < ci.length - 1; k++) for (let i = ci[k]; i <= ci[k + 1]; i++) { const f = ci[k + 1] > ci[k] ? (i - ci[k]) / (ci[k + 1] - ci[k]) : 0; v[i] = (pts[k][3] + (pts[k + 1][3] - pts[k][3]) * f) * KT; tag[i] = pts[k][4] || tag[i - 1]; }
      for (let i = ci.at(-1); i < S.length; i++) { v[i] = pts.at(-1)[3] * KT; tag[i] = pts.at(-1)[4] || tag[i - 1]; }
      if (meta.floor != null) for (const s of S) s.y = Math.max(s.y, meta.floor);
      for (let i = 1; i < S.length; i++) t[i] = t[i - 1] + S[i].distanceTo(S[i - 1]) / Math.max(1.5, (v[i] + v[i - 1]) / 2);
      return { name, S, v, tag, t, dur: t.at(-1), ...meta };
    }
    // sample state at time tau (s) along a procedure
    function sampleAt(Pr, tau) {
      const t = Pr.t; let lo = 0, hi = t.length - 1; tau = clamp(tau, 0, t[hi]);
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= tau) lo = m; else hi = m; }
      const f = t[hi] > t[lo] ? (tau - t[lo]) / (t[hi] - t[lo]) : 0, a = Pr.S[lo], b = Pr.S[hi];
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, v: Pr.v[lo] + (Pr.v[hi] - Pr.v[lo]) * f, tag: Pr.tag[lo], i: lo };
    }
    const glideY = (R, a) => R.elev + rdh + a * tanG;
    const PROC = {};
    for (const rw of ['09', '27']) {
      const R = RW[rw], ints = (L.intercept_ft * FT - R.elev - rdh) / tanG, ft = f => f * FT;
      for (const side of ['N', 'S']) {
        const s = side === 'N' ? 1 : -1, pt = (a, n, y, kt, tag) => { const [x, z] = at(R, a, n); return [x, y, z, kt, tag]; };
        // arrival: base leg from the north or south at 3000 to 2000 ft, level at 2000 ft, glide path from the intercept
        PROC[`arr${rw}${side}`] = build(`arr${rw}${side}`, [
          pt(17000, s * 8000, ft(3000), 210, 'base'), pt(13500, s * 4200, ft(2500), 190, 'base'), pt(10500, s * 700, ft(2000), 170, 'intermediate'), pt(8800, 0, ft(2000), 160, 'intermediate'),
          pt(ints, 0, glideY(R, ints), 155, 'final'), pt(4500, 0, glideY(R, 4500), 140, 'final'), pt(3000, 0, glideY(R, 3000), 130, 'final'), pt(1500, 0, glideY(R, 1500), 125, 'final'),
          pt(600, 0, glideY(R, 600), 125, 'final'), pt(150, 0, glideY(R, 150), 124, 'final'), pt(-60, 0, R.elev + 4.5, 120, 'flare'), pt(-300, 0, R.elev, 116, 'touchdown'),
          pt(-650, 0, R.elev, 60, 'roll'), pt(-1050, 0, R.elev, 18, 'roll'), pt(-1200, 0, R.elev, 10, 'vacate')],
          { kind: 'arr', rw, side, floor: R.elev, td: 0, label: `Runway ${rw} arrival, ILS ${L.glide_deg}° glide path`, src: 'lcy' });
        const Pa = PROC[`arr${rw}${side}`]; Pa.td = Pa.t[Pa.tag.indexOf('touchdown')] || Pa.dur * 0.8;
        // departure: take-off roll from the threshold, lift-off about 1050 m down the runway, straight ahead to 1000 ft
        // above the aerodrome, then the climbing turn to the 3000 ft stop altitude
        const r = s;   // N: right turn off 27 / left turn off 09
        PROC[`dep${rw}${side}`] = build(`dep${rw}${side}`, [
          pt(-10, 0, R.elev, 4, 'lineup'), pt(-250, 0, R.elev, 70, 'takeoff'), pt(-650, 0, R.elev, 110, 'takeoff'), pt(-1000, 0, R.elev, 128, 'rotate'),
          pt(-1100, 0, R.elev + 3, 132, 'climb'), pt(-1700, 0, R.elev + 60, 140, 'climb'), pt(-2700, 0, R.elev + 170, 150, 'climb'), pt(-4300, 0, R.elev + L.turn_ft_aal * FT + 15, 170, 'turn'),
          pt(-5600, r * 900, ft(1700), 185, 'turn'), pt(-6600, r * 3200, ft(2400), 200, 'turn'), pt(-7000, r * 6500, ft(L.sid_stop_ft), 210, 'sid'), pt(-7000, r * 16000, ft(L.sid_stop_ft), 220, 'sid')],
          { kind: 'dep', rw, side, floor: R.elev, label: `Runway ${rw} departure: straight ahead to ${L.turn_ft_aal} ft above the aerodrome, ${side === 'N' ? 'turning north' : 'turning south'}, SID stop altitude ${L.sid_stop_ft} ft`, src: 'lcy' });
      }
    }
    // H4: along the river (simulated centre line) to the Isle-of-Dogs point, then out south-east (both directions)
    const h4pts = [...P.H4.river, ...P.H4.exit_se].map(([lat, lon]) => geo(lon, lat));
    for (const dir of ['E', 'W']) for (const alt of [1100, 1400]) {
      const pts = h4pts.map(([x, z], i) => [x, alt * FT + (i >= P.H4.river.length ? (i - P.H4.river.length + 1) * 60 : 0), z, 105, i >= P.H4.river.length - 1 ? 'h4out' : 'h4']);
      PROC[`h4${dir}${alt}`] = build(`h4${dir}${alt}`, dir === 'E' ? pts : pts.reverse(), { kind: 'heli', label: `Helicopter route H4 along the Thames, ${dir === 'E' ? 'eastbound to the Isle-of-Dogs point' : 'westbound from the Isle-of-Dogs point'}, ${alt} ft`, src: 'h4' });
    }

    // ---------- the traffic at time T (ms): a deterministic list of flights { key, T: type, Pr | line, tau }
    const SLOT_LCY = 120e3, SLOT_LHR = 60e3, SLOT_H4 = 300e3, MAXD = 12 * 60e3;
    const localCache = new Map(), local = t => { const k = Math.floor(t / 60e3); let v = localCache.get(k); if (!v) { v = localOf(k * 60e3); localCache.set(k, v); if (localCache.size > 400) localCache.delete(localCache.keys().next().value); } return v; };
    const lcyOpen = t => { const { wd, h } = local(t), H = wd === 'Sat' ? P.LCY_HOURS.sat : wd === 'Sun' ? P.LCY_HOURS.sun : P.LCY_HOURS.weekday; return h >= H[0] && h < H[1]; };
    const lcyRate = t => { const { wd, h } = local(t); return (P.LCY_RATE[Math.floor(h)] || 0) * (wd === 'Sat' || wd === 'Sun' ? 0.75 : 1); };
    const wind = () => { const d = WU.windDir.value * deg, s = WU.windSpeed.value; return { d: WU.windDir.value, s, east: -Math.sin(d) * s }; };   // east: + when the wind comes from the east (component towards the west)
    const runway = () => { if (MODE === 'test') return '09'; if (MODE === 'test27') return '27'; const w = wind(); const head09 = Math.cos((w.d - 92.89) * deg) * w.s; return head09 > 0.5 ? '09' : '27'; };
    const lhrMode = () => { const w = wind(); return Math.cos((w.d - 90) * deg) * w.s > P.LHR.easterly_wind_kt * KT ? 'easterly' : 'westerly'; };

    function traffic(T) {
      const out = [], rw = runway();
      // London City
      for (let k = Math.floor((T - MAXD) / SLOT_LCY); k <= Math.floor((T + MAXD) / SLOT_LCY); k++) {
        const t0 = k * SLOT_LCY, rate = lcyRate(t0 + 30e3), { h } = local(t0 + 30e3), pa = rate * P.LCY_ARR_SHARE(h) / 30, pd = rate * (1 - P.LCY_ARR_SHARE(h)) / 30;
        if (hash(k, 1) < pa) { const tA = t0 + hash(k, 2) * 25e3; if (lcyOpen(tA)) { const Pr = PROC[`arr${rw}${hash(k, 3) < 0.5 ? 'N' : 'S'}`], tau = (T - tA) / 1000 + Pr.td; if (tau >= 0 && tau <= Pr.dur) out.push({ key: 'a' + k, T: pick(P.LCY_FLEET, hash(k, 4)), Pr, tau }); } }
        if (hash(k, 5) < pd) { const tD = t0 + 65e3 + hash(k, 6) * 20e3; if (lcyOpen(tD)) { const Pr = PROC[`dep${rw}${hash(k, 7) < 0.55 ? 'N' : 'S'}`], tau = (T - tD) / 1000; if (tau >= 0 && tau <= Pr.dur) out.push({ key: 'd' + k, T: pick(P.LCY_FLEET, hash(k, 8)), Pr, tau }); } }
      }
      // Heathrow streams: straight westbound lines across the area, 40 km long
      const M = P.LHR[lhrMode()];
      for (let k = Math.floor((T - 6 * 60e3) / SLOT_LHR); k <= Math.floor(T / SLOT_LHR); k++) {
        const t0 = k * SLOT_LHR + hash(k, 11) * 40e3, { h } = local(t0); if (hash(k, 12) >= P.LHR.per_hour(h) / 60) continue;
        const kt = M.kt[0] + (M.kt[1] - M.kt[0]) * hash(k, 13), tau = (T - t0) / 1000, d = tau * kt * KT; if (d > 40000) continue;
        const hdg = (M.hdg[0] + (M.hdg[1] - M.hdg[0]) * hash(k, 14)) * deg + conv, zc = E.z0 - 3000 + (E.z1 - E.z0 + 6000) * hash(k, 15), xs = E.x1 + 14000;
        const x0 = xs, z0 = zc + Math.cos(hdg) * 0;   // the line passes (E.x1 + 14 km, zc) going hdg; its centre crosses the box
        const ft0 = lhrMode() === 'westerly' ? M.ft[1] : M.ft[0] + (M.ft[1] - M.ft[0]) * hash(k, 16), ft1 = lhrMode() === 'westerly' ? M.ft[0] + 500 * hash(k, 16) : ft0;
        out.push({ key: 'h' + k, T: pick(P.LHR.fleet, hash(k, 17)), line: { x0, z0, hdg, kt, ft0, ft1, len: 40000, name: M.name, mode: lhrMode() }, tau });
      }
      // H4 helicopters
      for (let k = Math.floor((T - 15 * 60e3) / SLOT_H4); k <= Math.floor(T / SLOT_H4); k++) {
        const t0 = k * SLOT_H4 + hash(k, 21) * 200e3, { h } = local(t0); if (hash(k, 22) >= P.H4.per_hour(h) / 12) continue;
        const Pr = PROC[`h4${hash(k, 23) < 0.5 ? 'E' : 'W'}${hash(k, 24) < 0.5 ? 1100 : 1400}`], tau = (T - t0) / 1000;
        if (tau >= 0 && tau <= Pr.dur) out.push({ key: 'c' + k, T: pick(P.H4.fleet, hash(k, 25)), Pr, tau });
      }
      return out;
    }
    // the fixed test scene: the time on each procedure where the aircraft is nearest a point
    const tauNear = (Pr, x, z) => { let b = 0, bd = 1e18; Pr.S.forEach((s, i) => { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; b = i; } }); return Pr.t[b]; };
    let TESTSET = null;
    if (TEST) {
      const rw = runway(), R = RW[rw], arr = PROC[`arr${rw}N`], dep = PROC[`dep${rw}N`];
      const pa = at(R, rw === '09' ? 3500 : 2500, 0), pd = at(R, rw === '09' ? -1150 : -3000, 0), cw = geo(-0.0195, 51.5049), heli = PROC.h4W1100, hp = geo(-0.034, 51.5085);
      TESTSET = [
        { key: 'ta', T: P.LCY_FLEET[0], Pr: arr, tau: tauNear(arr, pa[0], pa[1]) },
        { key: 'td', T: P.LCY_FLEET[3], Pr: dep, tau: tauNear(dep, pd[0], pd[1]) },
        { key: 'th', T: P.LHR.fleet[2], line: { x0: cw[0] + 6000, z0: cw[1] - 300, hdg: 268 * deg + conv, kt: 200, ft0: 5000, ft1: 4500, len: 40000, name: P.LHR.westerly.name, mode: 'westerly' }, tau: 6000 / (200 * KT) },
        { key: 'tc', T: P.H4.fleet[0], Pr: heli, tau: tauNear(heli, hp[0], hp[1]) },
      ];
    }

    // ---------- drawing: one group per aircraft from a pool by type
    const group = new THREE.Group(); group.name = 'planes';
    const bodyMat = ctx.materials.vertexColourMaterial({ cut: false, roughness: 0.42, metalness: 0.15, flatShading: true });
    const discMat = new THREE.MeshBasicNodeMaterial({ color: 0x222428, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    const lampMat = (c, k = 9) => { const m = new THREE.MeshBasicNodeMaterial(); m.colorNode = vec3(...c).mul(k); return m; };
    const LM = { red: lampMat([1, 0.05, 0.03]), green: lampMat([0.1, 1, 0.3]), white: lampMat([1, 0.97, 0.9]), strobe: lampMat([1, 1, 1], 16), land: lampMat([1, 0.95, 0.82], 14), beacon: lampMat([1, 0.08, 0.04], 11) };
    const lampGeo = new THREE.OctahedronGeometry(0.5, 1);
    const pool = new Map(), live = new Map();
    function make(T) {
      const Pt = aircraftParts(T), g = new THREE.Group(), body = new THREE.Mesh(Pt.body, bodyMat), gear = new THREE.Mesh(Pt.gear, bodyMat);
      body.castShadow = gear.castShadow = true; g.add(body, gear);
      const o = { T, g, gear, rotors: [], props: [], lamps: [], Pt };
      for (const p of Pt.props) { const d = new THREE.Mesh(new THREE.CircleGeometry(p.R, 20), discMat); d.position.set(p.x, p.y, p.z); g.add(d); o.props.push(d); }
      if (Pt.rotor) { const r = new THREE.Mesh(Pt.rotor.geo, bodyMat); r.position.set(...Pt.rotor.at); r.castShadow = true; g.add(r); o.rotors.push([r, 'y', 6.5 * 2 * Math.PI]);
        const tr = new THREE.Mesh(Pt.trotor.geo, bodyMat); tr.position.set(...Pt.trotor.at); g.add(tr); o.rotors.push([tr, 'x', 30 * 2 * Math.PI]);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(T.R / 2, 24).rotateX(-Math.PI / 2), discMat); disc.position.set(...Pt.rotor.at); disc.position.y += 0.05; g.add(disc); }
      const lamp = (pos, mat, kind) => { const m = new THREE.Mesh(lampGeo, mat); m.position.set(...pos); m.userData.kind = kind; g.add(m); o.lamps.push(m); return m; };
      const Lp = Pt.lights; lamp(Lp.navR, LM.red, 'nav'); lamp(Lp.navG, LM.green, 'nav'); lamp(Lp.tail, LM.white, 'nav');
      lamp(Lp.beaconTop, LM.beacon, 'beacon'); lamp(Lp.beaconBot, LM.beacon, 'beacon2'); lamp(Lp.strobeL, LM.strobe, 'strobe'); lamp(Lp.strobeR, LM.strobe, 'strobe');
      for (const p of Lp.land) lamp(p, LM.land, 'land');
      group.add(g); return o;
    }
    const get = (key, T) => { let o = live.get(key); if (o && o.T.code === T.code) return o; if (o) release(key);
      const list = pool.get(T.code) || []; o = list.pop() || make(T); o.g.visible = true; live.set(key, o); return o; };
    function release(key) { const o = live.get(key); if (!o) return; o.g.visible = false; live.delete(key); if (!pool.has(o.T.code)) pool.set(o.T.code, []); pool.get(o.T.code).push(o); }

    // state of one flight at tau: position, heading, pitch, bank, speed, vertical speed, phase, gear
    function stateOf(F) {
      if (F.line) { const Ln = F.line, d = F.tau * Ln.kt * KT, k = d / Ln.len, y = (Ln.ft0 + (Ln.ft1 - Ln.ft0) * k) * FT;
        return { x: Ln.x0 + Math.sin(Ln.hdg) * d, y, z: Ln.z0 - Math.cos(Ln.hdg) * d, h: Ln.hdg, pitch: 2 * deg, bank: 0, v: Ln.kt * KT, vs: (Ln.ft1 - Ln.ft0) * FT / (Ln.len / (Ln.kt * KT)), phase: Ln.mode === 'westerly' ? 'descending towards the final approach' : 'downwind leg', gear: false, ground: false }; }
      const Pr = F.Pr, a = sampleAt(Pr, F.tau), b = sampleAt(Pr, F.tau + 1), c = sampleAt(Pr, F.tau - 1);
      const dx = b.x - c.x, dz = b.z - c.z, dy = b.y - c.y, hz = Math.hypot(dx, dz), h = Math.atan2(dx, -dz), gamma = Math.atan2(dy, Math.max(hz, 0.01));
      const h1 = Math.atan2(b.x - a.x, -(b.z - a.z)), h0 = Math.atan2(a.x - c.x, -(a.z - c.z)); let dh = h1 - h0; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const bank = Pr.kind === 'heli' || a.tag === 'roll' || a.tag === 'takeoff' || a.tag === 'lineup' ? clamp(Math.atan(a.v * dh / G0), -0.35, 0.35) : clamp(Math.atan(a.v * dh / G0), -0.5, 0.5);
      const ground = Pr.kind !== 'heli' && a.y <= Pr.floor + 0.2;
      let pitch = Pr.kind === 'heli' ? -3 * deg : gamma + (Pr.kind === 'arr' ? 4 * deg : 5 * deg);
      if (ground) pitch = Pr.kind === 'dep' && a.tag === 'rotate' ? clamp((a.v / KT - (F.T.vr - 6)) / 6, 0, 1) * 8 * deg : a.tag === 'touchdown' ? 3 * deg * clamp(1 - (F.tau - Pr.td) / 4, 0, 1) : 0;
      if (Pr.kind === 'arr' && a.tag === 'flare') pitch = Math.max(pitch, 5 * deg);
      const along = Pr.kind === 'heli' ? null : (() => { const R = RW[Pr.rw]; return ((a.x - R.thr[0]) * e[0] + (a.z - R.thr[1]) * e[1]) * R.out; })();
      const gear = Pr.kind === 'heli' ? true : Pr.kind === 'arr' ? along < 9500 : a.y < Pr.floor + 80;
      const PH = { base: 'base leg (simulated vectors)', intermediate: `level at ${L.intercept_ft} ft before the glide path`, final: `final approach, ${L.glide_deg}° glide path`, flare: 'flare', touchdown: 'touchdown', roll: 'landing roll', vacate: 'leaving the runway',
        lineup: 'lined up', takeoff: 'take-off roll', rotate: 'rotation', climb: `straight ahead to ${L.turn_ft_aal} ft above the aerodrome`, turn: 'climbing turn', sid: `SID, ${L.sid_stop_ft} ft stop altitude`, h4: 'route H4, along the river', h4out: 'Isle-of-Dogs point, joining or leaving H4' };
      return { x: a.x, y: a.y, z: a.z, h, pitch, bank, v: a.v, vs: dy / 2, phase: PH[a.tag] || a.tag, gear, ground, along, tag: a.tag };
    }

    // ground height (m OD) under a point: the model's terrain inside the box, 6 m outside it (London City, Heathrow)
    const groundY = (x, z) => { const g = ctx.groundAt && x > E.x0 && x < E.x1 && z > E.z0 && z < E.z1 ? ctx.groundAt(x, z) : NaN; return isFinite(g) ? g : 6; };
    // a recorded or live aircraft at a reported point: the lift (m) that keeps its wheels (Pt.ground below the centre) on
    // or above the ground; 0 when it flies higher (no ground look-up above 300 m OD)
    const liftOf = (x, y, z, Pt) => y > 300 ? 0 : Math.max(0, groundY(x, z) - Pt.ground - y);

    // ---------- clock: the page clock, running on in real time from when it was set (frozen in the test scene)
    let clockSeen = ctx.clock, p0 = performance.now();
    const simT = () => { if (ctx.clock !== clockSeen) { clockSeen = ctx.clock; p0 = performance.now(); } return clockSeen + (performance.now() - p0); };
    const tStart = performance.now();
    let drawn = [], camDone = false;
    const v3 = new THREE.Vector3();
    let lastFrameAt = 0;
    function frame() {
      lastFrameAt = performance.now(); if (reqAt) { const r0 = reqAt; reqAt = 0; requestAnimationFrame(() => requestAnimationFrame(() => { lag = performance.now() - r0; lastFrameAt = performance.now(); })); }
      if (!visible) return;
      const T = simT(), now = performance.now(), liveNow = showingLive(), LS = liveNow ? tracks.states(Date.now()) : [];
      const RS = !liveNow && recWanted() ? rec.states(T) : null; recNow = !!RS;
      const list = liveNow ? LS.map(({ k, r, S }) => ({ key: 'L' + k.hex, T: r.M, live: r, track: k, S }))
        : RS ? RS.map(s => ({ key: 'R' + s.L.k, T: s.L.M, rec: s, track: { trail: s.trail }, S: s.S }))
        : recWanted() && rec.state !== 'error' && (rec.state === 'loading' || rec.state === 'idle' || (rec.pick && rec.file(rec.pick.t).state === 'loading')) ? []
        : TEST ? TESTSET.map(F => ({ ...F, tau: F.tau + (RUN ? (now - tStart) / 1000 : 0) })) : traffic(T);
      const night = ctx.U.night.value > 0.02, cam = ctx.camera.position, keep = new Set(); drawn = [];
      for (const F of list) {
        if (F.Pr && F.tau > F.Pr.dur) continue;
        const S = F.live || F.rec ? F.S : stateOf(F), o = get(F.key, F.T); keep.add(F.key);
        // simulated: the procedure path is the height of the wheels; recorded and live: the reported position is the
        // aircraft itself (the trail ends there), so the model's centre is on it, lifted only where the wheels would be
        // under the ground (on the ground and in the last metres before touchdown)
        const lift = F.live || F.rec ? liftOf(S.x, S.y, S.z, o.Pt) : -o.Pt.ground;
        o.g.position.set(S.x, S.y + lift, S.z); o.g.rotation.set(S.pitch, -S.h, -S.bank, 'YXZ'); o.gear.visible = S.gear;
        const sec = now / 1000, dist = Math.hypot(cam.x - S.x, cam.y - S.y, cam.z - S.z), sz = clamp(dist * 0.006, 0.6, 80);
        for (const [r, ax, w] of o.rotors) r.rotation[ax] = (sec * w) % (2 * Math.PI);
        for (const d of o.props) d.visible = true;
        const landOn = F.live || F.rec ? S.landOn : F.T.kind === 'heli' ? S.y < 250 : (S.gear || (F.Pr && F.Pr.kind === 'dep' && S.y < F.Pr.floor + 760));
        for (const m of o.lamps) {
          const k = m.userData.kind; let on = night, s = sz;
          if (k === 'beacon' || k === 'beacon2') on = night && (sec + (k === 'beacon2' ? 0.5 : 0)) % 1 < 0.12;
          else if (k === 'strobe') { const p = (sec + hash(F.key.length, F.key.charCodeAt(1) || 0)) % 1.3; on = !S.ground || F.Pr?.kind === 'dep' || ((F.live || F.rec) && S.v > 30) ? (p < 0.05 || (p > 0.14 && p < 0.19)) && (night || dist < 4000) : false; s = sz * 1.4; }
          else if (k === 'land') { on = landOn; s = sz * (night ? 1.6 : 1.1); }
          m.visible = on; if (on) m.scale.setScalar(s);
        }
        drawn.push({ F, S, o, lift });
      }
      for (const k of [...live.keys()]) if (!keep.has(k)) release(k);
      if (qs.has('planecam')) planeCam();   // before the labels, which are placed with the camera of this frame
      drawTrails(liveNow || recNow ? drawn : []); showCredit(liveNow, recNow);
      placeLabels(); status();
    }
    // &planecam=<n>: the camera near aircraft n of the drawn list (test, recorded or live), then it follows that aircraft
    // (camera and target move with it, so the view can still be turned); &planecamd= distance (m), &planecamyaw=,
    // &planecampitch= (rad)
    let camKey = null, camAt = null;
    function planeCam() {
      if (!camDone) { const d = drawn[+qs.get('planecam')] || drawn[0]; if (!d) return; camDone = true; camKey = d.F.key; camAt = d.o.g.position.clone();
        const D = +(qs.get('planecamd') || 160), yaw = +(qs.get('planecamyaw') || 0.9), pt = +(qs.get('planecampitch') || 0.12), c = camAt;
        // vertical exaggeration (main.js setVz): the aircraft is in model metres, the orbit in the exaggerated space (y x vz)
        const vz = ctx.vzNow ? ctx.vzNow() : 1, cy = c.y * vz;
        ctx.controls.target.set(c.x, cy, c.z); ctx.controls.minDistance = 10; ctx.camera.position.set(c.x + D * Math.sin(yaw) * Math.cos(pt), cy + D * Math.sin(pt), c.z + D * Math.cos(yaw) * Math.cos(pt)); ctx.controls.update(); ctx.camera.updateMatrixWorld(); ctx.draw(); return; }
      const d = camKey && drawn.find(q => q.F.key === camKey); if (!d) return;
      const p = d.o.g.position; if (p.equals(camAt)) return;
      v3.subVectors(p, camAt); v3.y *= ctx.vzNow ? ctx.vzNow() : 1; ctx.camera.position.add(v3); ctx.controls.target.add(v3); camAt.copy(p); ctx.camera.updateMatrixWorld();
    }

    // ---------- the runway (it is outside the model box, so the landings have something to land on): strip, runway, marks
    {
      const quad = (a0, a1, w, y, col) => { const R = RW['09'], p = [], c = [], cs = [[a0, -w / 2], [a1, -w / 2], [a1, w / 2], [a0, w / 2]].map(([a, n]) => { const [x, z] = [t09[0] + e[0] * a + nv[0] * n, t09[1] + e[1] * a + nv[1] * n]; return [x, y, z]; });
        for (const i of [0, 2, 1, 0, 3, 2]) { p.push(...cs[i]); c.push(...col); } return { p, c }; };
      const parts = [quad(-60, len + 60, 150, elev09 - 0.4, [0.30, 0.36, 0.30]), quad(0, len, L.width_m, elev09 + 0.05, [0.22, 0.23, 0.25])];
      for (let a = 60; a < len - 60; a += 50) parts.push(quad(a, a + 30, 0.9, elev09 + 0.12, [0.95, 0.95, 0.95]));
      for (const a of [6, len - 36]) for (let k = -6; k <= 6; k++) if (k) { const q = quad(a, a + 30, 1.8, elev09 + 0.12, [0.95, 0.95, 0.95]); q.p = q.p.map((v, i) => i % 3 === 0 ? v + nv[0] * k * 2.2 : i % 3 === 2 ? v + nv[1] * k * 2.2 : v); parts.push(q); }
      for (const a of [400, len - 430]) for (const k of [-6, 6]) { const q = quad(a, a + 45, 6, elev09 + 0.12, [0.95, 0.95, 0.95]); q.p = q.p.map((v, i) => i % 3 === 0 ? v + nv[0] * k : i % 3 === 2 ? v + nv[1] * k : v); parts.push(q); }   // aiming points
      const Gr = new THREE.BufferGeometry(); Gr.setAttribute('position', new THREE.Float32BufferAttribute(parts.flatMap(q => q.p), 3)); Gr.setAttribute('color', new THREE.Float32BufferAttribute(parts.flatMap(q => q.c), 3)); Gr.computeVertexNormals();
      const rm = ctx.materials.vertexColourMaterial({ cut: false, roughness: 0.95 }); rm.polygonOffset = true; rm.polygonOffsetFactor = -1; rm.polygonOffsetUnits = -2;
      const runwayMesh = new THREE.Mesh(Gr, rm); runwayMesh.receiveShadow = true; runwayMesh.name = 'LCY runway'; group.add(runwayMesh);
    }

    // the bottom-left stack of notes (made by this layer or by layers/wind.js, whichever loads first): above the frame
    // line (#stat), clear of the round buttons on the right (#locBtns, #xrBtns: 54 px), wrapping on a narrow screen
    const cornerStack = () => { let el = document.getElementById('blNotes'); if (!el) { el = document.createElement('div'); el.id = 'blNotes';
      el.style.cssText = 'position:fixed;left:8px;bottom:calc(30px + env(safe-area-inset-bottom,0px));z-index:4;display:flex;flex-direction:column;align-items:flex-start;gap:3px;max-width:min(640px,calc(100vw - 70px));pointer-events:none'; document.body.appendChild(el); } return el; };
    // ---------- labels (aircraft within 9 km), tappable, all marked "SIM"
    const host = document.getElementById('labels'), LBL = new Map();
    if (!document.getElementById('planesCss')) { const st = document.createElement('style'); st.id = 'planesCss'; st.textContent = '.lab.plane{border:1px dashed #9fd3ff;color:#dff1ff;pointer-events:auto;cursor:pointer;font:inherit;font-size:11px}.lab.plane.live{border:1px solid #ffd36b;color:#fff3d6}' +
        // the aircraft note sits in the bottom-left stack (#blNotes, shared with the water note of layers/wind.js), lowest;
        // on a narrow screen it folds to two lines: what is shown, then the credit
        '#blNotes>*{pointer-events:auto}#adsbCredit{order:2;font-size:11px;line-height:1.35;color:#e8eaec;background:#0d1013d9;padding:2px 8px;border-radius:5px;overflow-wrap:anywhere}#adsbCredit a{color:#e8eaec}#adsbCredit[hidden]{display:none}' +
        '#adsbCredit .ln1:not(:empty)::after{content:" · "}@media (max-width:600px){#adsbCredit .ln1,#adsbCredit .ln2{display:block}#adsbCredit .ln1:not(:empty)::after{content:none}}'; document.head.appendChild(st); }
    function placeLabels() {
      const W = innerWidth, H = innerHeight, keep = new Set(), cam = ctx.camera.position;
      for (const d of drawn) { const { F, S } = d; if (Math.hypot(cam.x - S.x, cam.y - S.y, cam.z - S.z) > 9000 || !host) continue; keep.add(F.key);
        let el = LBL.get(F.key); if (!el || el.dataset.code !== F.T.code) { if (el) el.remove(); el = document.createElement('button'); el.type = 'button'; el.className = 'lab plane'; el.dataset.code = F.T.code; el.onclick = () => card(F.key); host.appendChild(el); LBL.set(F.key, el); }
        const ft = S.y / FT, alt = S.ground ? 'ground' : `${ft < 1000 ? Math.round(ft / 10) * 10 : (Math.round(ft / 100) * 100).toLocaleString('en-GB')} ft`;
        const txt = F.live ? `${identified(F.live.ac) ? F.live.ac.flight.trim() : (F.live.ac.t || F.T.code)} ${alt}` : F.rec ? `REC ${F.rec.L.c || F.rec.L.ty || F.T.code} ${alt}` : `SIM ${F.T.code} ${alt}`; if (el.textContent !== txt) el.textContent = txt;
        if (el.classList.contains('live') !== !!(F.live || F.rec)) el.classList.toggle('live', !!(F.live || F.rec));
        v3.set(S.x, S.y + (d.lift || 0) + (F.T.H || 5) * 0.7, S.z).project(ctx.camera); const x = (v3.x + 1) / 2 * W, y = (1 - v3.y) / 2 * H, vis = visible && v3.z < 1 && x > 0 && x < W && y > 40 && y < H;
        if (vis) el.style.transform = `translate(${x | 0}px,${y | 0}px) translate(-50%,calc(-100% - 10px))`; if (el.hidden === vis) el.hidden = !vis; }
      for (const [k, el] of LBL) if (!keep.has(k)) { el.remove(); LBL.delete(k); }
    }

    // ---------- record card
    function card(key) {
      const d = drawn.find(q => q.F.key === key); if (!d) return; const { F, S } = d, rows = [], add = (k, v) => { if (v != null && v !== '') rows.push(`<tr><td>${k}</td><td>${esc(v)}</td></tr>`); };
      if (F.live) return liveCard(F, S, rows, add);
      if (F.rec) return recCard(F, S, rows, add);
      const Pr = F.Pr, src = Pr ? P.SOURCES[Pr.src] : P.SOURCES.lhr, trueHdg = (((S.h - conv) / deg) % 360 + 360) % 360;
      add('Status', 'SIMULATED: not a real flight');
      add('Type', `${F.T.type} (${F.T.code}), airline-neutral livery`);
      add('Procedure', Pr ? Pr.label : F.line.name);
      add('Phase', S.phase);
      add('Altitude', `${Math.round(S.y / FT).toLocaleString()} ft (${S.y.toFixed(0)} m OD)`);
      add('Speed', `${Math.round(S.v / KT)} kt ground speed (no wind in the simulation)`);
      add('Vertical speed', Math.abs(S.vs) > 0.3 ? `${S.vs > 0 ? 'climbing' : 'descending'} ${Math.round(Math.abs(S.vs) / FT * 60)} ft/min` : 'level');
      add('Track', `${trueHdg.toFixed(0)}° true`);
      if (S.along != null) add('From the threshold', `${(S.along / 1000).toFixed(2)} km (runway ${Pr.rw})`);
      add('Size', F.T.kind === 'heli' ? `length ${F.T.L} m, rotor ${F.T.R} m` : `length ${F.T.L} m, span ${F.T.S} m`);
      ctx.showCard(`<h2>Simulated ${esc(F.T.code)}</h2><p class="small">Simulated traffic on a published procedure: there are no live aircraft positions on this page (ADS-B licences).</p><table>${rows.join('')}</table>` +
        `<p class="small">Procedure source: ${esc(src)}. ${Pr && Pr.src === 'lcy' ? `Runway in use from the page's wind (${Math.round(wind().d)}° at ${wind().s.toFixed(1)} m/s). ` : ''}Movements: ${esc(P.SOURCES.rate)}. Not for navigation.</p>`);
    }
    // a live aircraft: what adsb.lol reported (privacy rule: identified() in ../planes-live.js)
    function liveCard(F, S, rows, add) {
      const r = F.live, a = r.ac, id = identified(a), fmt = n => Math.round(n).toLocaleString('en-GB');
      const when = new Date(r.server), age = Math.max(0, (Date.now() - r.tp) / 1000);
      if (id) { add('Callsign', a.flight.trim()); add('Registration', a.r); }
      add('Type', `${a.t || 'not stated'}${a.desc ? ' (' + a.desc + ')' : ''}; drawn as ${F.T.type}${a.category ? ', category ' + a.category : ''}`);
      add('Altitude', r.ground ? 'on the ground' : `${typeof a.alt_baro === 'number' ? fmt(a.alt_baro) + ' ft pressure altitude' : ''}${typeof a.alt_geom === 'number' ? (typeof a.alt_baro === 'number' ? ', ' : '') + fmt(a.alt_geom) + ' ft GNSS' : ''}; drawn at ${fmt(S.y / FT)} ft = ${S.y.toFixed(0)} m OD`);
      add('Height used', r.alt.src);
      add('Ground speed', a.gs != null ? `${Math.round(a.gs)} kt` : null);
      const vr = a.geom_rate ?? a.baro_rate; add('Vertical rate', vr == null || r.ground ? null : Math.abs(vr) < 100 ? 'level' : `${vr > 0 ? 'climbing' : 'descending'} ${fmt(Math.abs(vr))} ft/min`);
      if (id) add('Squawk', a.squawk);
      add('Track', r.trkTrue != null ? `${Math.round(r.trkTrue)}° true` : null);
      add('Report', `${when.toLocaleTimeString('en-GB', { timeZone: 'Europe/London' })} London (${age.toFixed(0)} s ago${Array.isArray(a.mlat) && a.mlat.includes('lat') ? ', position by multilateration' : ''}); drawn by dead reckoning for at most ${ADSB.reckonMax} s`);
      ctx.showCard(`<h2>${esc(id ? a.flight.trim() : (a.t || 'Aircraft'))} <span class="small">live</span></h2>` +
        (id ? '' : '<p class="small">Shown by type only (privacy rule: no operator callsign, or a blocked or privacy address).</p>') +
        `<table>${rows.join('')}</table><p class="small">Source: <a href="${ADSB.site}" target="_blank" rel="noopener">adsb.lol</a>, <a href="${ADSB.licence}" target="_blank" rel="noopener">ODbL 1.0</a> (© adsb.lol contributors), fetched by your browser from api.adsb.lol; nothing is stored. Received from volunteer ADS-B receivers: positions can be late, wrong or missing. Not for navigation.</p>`);
    }
    // a recorded aircraft: what the adsb.lol history holds for this leg (privacy rule applied by the cache tool)
    function recCard(F, S, rows, add) {
      const s = F.rec, L = s.L, fmt = n => Math.round(n).toLocaleString('en-GB'), pk = rec.pick, i = s.i;
      const q = ['GNSS height', `pressure altitude + the hour's correction ${L.corr} ft`, 'on the ground'][L.q[i]];
      add('Status', `RECORDED: ${recLabel(pk)}`);
      if (L.c) add('Callsign', L.c);
      add('Type', `${L.ty || 'not stated'}; drawn as ${F.T.type}${L.cat ? ', category ' + L.cat : ''}`);
      add('Altitude', S.ground ? 'on the ground' : `${fmt(L.alt[i] + (L.alt[i + 1] - L.alt[i]) * s.f || L.alt[i])} ft above the WGS84 ellipsoid (${q}); drawn at ${fmt(S.y / FT)} ft = ${S.y.toFixed(0)} m OD (geoid OSGM15)`);
      add('Ground speed', `${Math.round(S.v / KT)} kt`);
      add('Vertical rate', S.ground ? null : Math.abs(S.vs) < 0.5 ? 'level' : `${S.vs > 0 ? 'climbing' : 'descending'} ${fmt(Math.abs(S.vs) / FT * 60)} ft/min`);
      add('Track', `${Math.round(s.trkTrue)}° true`);
      add('Recorded points', `${L.n} in this hour file; drawn between the points before and after (${((L.t[i + 1] - L.t[i]) / 1000 || 0).toFixed(0)} s apart)`);
      ctx.showCard(`<h2>${esc(L.c || L.ty || 'Aircraft')} <span class="small">recorded</span></h2>` +
        (L.c ? '' : '<p class="small">Shown by type only (privacy rule: no operator callsign, or a blocked or privacy address).</p>') +
        `<table>${rows.join('')}</table><p class="small">Source: <a href="${ADSB.site}" target="_blank" rel="noopener">adsb.lol</a> daily history, <a href="${ADSB.licence}" target="_blank" rel="noopener">ODbL 1.0</a> (© adsb.lol contributors), from the 7-day cache of danbri/londat (branch adsb-cache). Recorded by volunteer ADS-B receivers: positions can be late, wrong or missing. Not for navigation.</p>`);
    }
    ctx.addPick(ray => {
      if (!visible) return null; let best = null; const o = ray.ray.origin, dv = ray.ray.direction;
      for (const { F, S } of drawn) { const t = (S.x - o.x) * dv.x + (S.y - o.y) * dv.y + (S.z - o.z) * dv.z; if (t <= 0) continue;
        const px = o.x + dv.x * t - S.x, py = o.y + dv.y * t - S.y, pz = o.z + dv.z * t - S.z, r = Math.max((F.T.S || F.T.L) * 0.55, t * 0.012);
        if (px * px + py * py + pz * pz < r * r && (!best || t < best.distance)) best = { distance: t - r * 0.5, open: () => card(F.key) }; }
      return best;
    });

    // ---------- menu
    ctx.ui.section('Aircraft');
    let visible = on;
    const setVisible = v => { visible = v; group.visible = v; if (!v) { for (const k of [...live.keys()]) release(k); for (const el of LBL.values()) el.hidden = true; credit.hidden = true; } ctx.draw(); };
    ctx.ui.toggle(TEST ? 'Aircraft (simulated, test scene)' : 'Aircraft (recorded or simulated), live on request', on, setVisible);

    // ---------- live aircraft (adsb.lol, ODbL): only after the visitor ticks the box; nothing is asked before
    const tracks = createTracks({ geo, conv, groundAt: groundY });
    const LIVE = { want: false, feed: null, url: feedUrl(qs) };
    const clockNow = () => Math.abs(simT() - Date.now()) < 5 * 60e3;
    const mayAsk = () => LIVE.want && visible && document.visibilityState === 'visible' && clockNow();
    const showingLive = () => !TEST && LIVE.want && LIVE.feed && clockNow() && Date.now() - LIVE.feed.lastOk < ADSB.stale;
    const liveBox = ctx.ui.toggle('Live aircraft (adsb.lol, ODbL): asks adsb.lol from your browser', false, v => {
      LIVE.want = v;
      if (v) { if (!LIVE.feed) LIVE.feed = startFeed({ url: LIVE.url, run: mayAsk, onData: (j, at) => { tracks.ingest(j, at); ctx.draw(); }, onChange: () => status() }); LIVE.feed.now(); }
      else { if (LIVE.feed) LIVE.feed.stop(); LIVE.feed = null; tracks.clear(); }
      status(); ctx.draw();
    });
    liveBox.dataset.planesLive = '1';
    const credit = document.createElement('div'); credit.id = 'adsbCredit'; credit.hidden = true;
    const creditTxt = document.createElement('span'); creditTxt.className = 'ln1';
    credit.append(creditTxt); credit.insertAdjacentHTML('beforeend', `<span class="ln2">Aircraft: © <a href="${ADSB.site}" target="_blank" rel="noopener">adsb.lol</a> contributors, <a href="${ADSB.licence}" target="_blank" rel="noopener">ODbL</a></span>`);
    cornerStack().appendChild(credit);

    // ---------- recorded aircraft (the 7-day adsb.lol cache): read when the layer is on and the box is ticked (default)
    const rec = createRecorded({ geo, conv, groundAt: groundY, base: recBase(qs) });
    rec.onLoad = () => { status(); ctx.draw(); };
    let recNow = false, recOn = !TEST && qs.get('adsbrec') !== '0';
    const recWanted = () => { if (!recOn || TEST || !visible) return false; if (rec.state === 'idle') rec.loadIndex().then(() => { status(); ctx.draw(); }); return rec.state === 'ready' || rec.state === 'loading' || rec.state === 'idle'; };
    // "Recorded Fri 2026-10-02 18:00 (adsb.lol, ODbL), same weekday and time"
    const recLabel = pk => { if (!pk) return ''; const p = londonParts(pk.t); return `Recorded ${p.wd} ${p.date} ${p.hm} London (adsb.lol, ODbL)${pk.exact ? '' : ', same weekday and time'}`; };
    function showCredit(liveNow, recNowArg) {
      const txt = liveNow ? 'Live (adsb.lol)' : recNowArg ? recLabel(rec.pick).replace(' (adsb.lol, ODbL)', '').replace(' and time', '') : '';   // one line at 390 px
      if (creditTxt.textContent !== txt) creditTxt.textContent = txt;
      credit.hidden = !(liveNow || recNowArg) || !visible;
    }
    if (!TEST) ctx.ui.toggle('Recorded aircraft (adsb.lol history of the last 7 days, same weekday and time)', recOn, v => { recOn = v; status(); ctx.draw(); }).dataset.planesRec = '1';

    // ---------- trails of the live aircraft (last 2 minutes): thin lines, one draw call
    const TRAILMAX = 24000, trailPos = new Float32Array(TRAILMAX * 6), trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage)); trailGeo.setDrawRange(0, 0);
    const trailMat = new THREE.LineBasicNodeMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.8, depthWrite: false });
    const trailLines = new THREE.LineSegments(trailGeo, trailMat); trailLines.frustumCulled = false; trailLines.name = 'live aircraft trails'; group.add(trailLines);
    function drawTrails(list) {
      let n = 0; const put = (a, b) => { if (n >= TRAILMAX) return; trailPos.set(a, n * 6); trailPos.set(b, n * 6 + 3); n++; };
      // each point lifted as the model would be there (on the ground the trail runs at the height of the fuselage's centre);
      // the last point is the model's own position, so the line meets the aircraft
      for (const { F, o } of list) { if (!F.track) continue; const P = F.track.trail.map(p => [p[1], p[2] + liftOf(p[1], p[2], p[3], o.Pt), p[3]]); P.push(o.g.position.toArray());
        for (let i = 1; i < P.length; i++) put(P[i - 1], P[i]); }
      trailGeo.setDrawRange(0, n * 2); if (n) { trailGeo.attributes.position.needsUpdate = true; trailGeo.computeBoundingSphere(); }
      trailLines.visible = n > 0;
    }

    const note = document.createElement('p'); note.className = 'small'; ctx.ui.host().appendChild(note);
    let lastNote = '';
    const hms = t => new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Europe/London' });
    function status() {
      const n = { lcy: 0, lhr: 0, h4: 0, live: 0, rec: 0 }; for (const { F } of drawn) F.live ? n.live++ : F.rec ? n.rec++ : F.line ? n.lhr++ : F.Pr.kind === 'heli' ? n.h4++ : n.lcy++;
      const open = lcyOpen(simT()), w = wind(), fd = LIVE.feed, liveNow = showingLive();
      const creditHtml = `Aircraft: © <a href="${ADSB.site}" target="_blank" rel="noopener">adsb.lol</a> contributors, <a href="${ADSB.licence}" target="_blank" rel="noopener">ODbL 1.0</a>. `;
      let liveMsg = '';
      if (LIVE.want && !clockNow()) liveMsg = 'Live aircraft paused: the page clock is not now (set the clock to now). ';
      else if (LIVE.want && fd && !liveNow) liveMsg = fd.lastError ? `Live aircraft: adsb.lol did not answer: ${fd.lastError}; next try in ${Math.max(1, Math.round((fd.nextAt - Date.now()) / 1000))} s. ` : 'Live aircraft: waiting for adsb.lol. ';
      const pk = rec.pick, recMsg = !recOn || TEST ? '' : rec.state === 'error' ? `Recorded aircraft: the cache could not be read (${rec.error}). ` : rec.state === 'ready' && !pk ? 'Recorded aircraft: the cache holds no day with the same weekday as the page clock. ' : rec.state !== 'ready' ? 'Recorded aircraft: loading the cache. ' : '';
      const s = recNow && !liveNow
        ? `${liveMsg}RECORDED, not live: ${n.rec} aircraft within ${ADSB.nm} nm. ${recLabel(pk)}; page clock ${(p => `${p.wd} ${p.date} ${p.hm}`)(londonParts(simT()))} London. `
        : liveNow
        ? `LIVE: ${n.live} aircraft from adsb.lol within ${ADSB.nm} nm (answer at ${hms(fd.lastOk)} London, asked every ${ADSB.every / 1000} s while this box is ticked, the tab is visible and the clock is now). `
        : `${liveMsg}${recMsg}SIMULATED traffic, not live: ${n.lcy} London City, ${n.lhr} Heathrow, ${n.h4} H4 helicopter${n.h4 === 1 ? '' : 's'} now. London City ${open ? `open, runway ${runway()} in use (wind ${Math.round(w.d)}° ${w.s.toFixed(1)} m/s)` : 'closed (AD 2.3 hours: Mon-Fri 06:30-22:00, Sat 06:30-12:30, Sun 12:30-22:00)'}; Heathrow ${lhrMode()} operations. `;
      const key = s + (fd ? fd.state : '') + rec.state;
      if (key !== lastNote) { lastNote = key; note.innerHTML = esc(s) + (liveNow ? creditHtml + 'Positions between answers by dead reckoning; heights in m OD (geoid OSGM15); callsigns only for operator flights (privacy rule). '
        : recNow ? creditHtml + `Recorded tracks from the adsb.lol daily history (7-day cache, branch adsb-cache of danbri/londat, read from raw.githubusercontent.com), drawn between the recorded points; heights in m OD (geoid OSGM15); callsigns only for operator flights (privacy rule). ` : 'Procedures: UK AIP (Crown copyright / NATS, facts only); movements scaled to CAA airport data; hourly pattern, fleet mix and vectors assumed. ') +
        (liveNow || recNow ? '' : `Live aircraft come from adsb.lol (© adsb.lol contributors, <a href="${ADSB.licence}" target="_blank" rel="noopener">ODbL 1.0</a>) only after you tick the box. `) + (recNow && !liveNow ? '' : 'The browser asks api.adsb.lol directly and nothing is stored. ') + 'Tap an aircraft for its card.'; }
      ctx.stats.planes = { lcy: n.lcy, lhr: n.lhr, h4: n.h4, live: liveNow ? n.live : null, live_state: fd ? fd.state : 'off', rec: recNow ? n.rec : null, rec_state: recOn ? rec.state : 'off', rec_day: pk ? pk.date : null, rec_exact: pk ? pk.exact : null, runway: runway(), lhr_mode: lhrMode(), lcy_open: open, test: TEST ? MODE : null };
    }

    ctx.onFrame(frame);
    // without the animation loop, draw the moving aircraft every 3 s, or less often when a frame is slow (software
    // rendering): wait 4 times the time from the request to the second animation frame after it (the GPU work included),
    // so that the page is idle most of the time
    let reqAt = 0, lag = 0;
    setInterval(() => { const anim = document.getElementById('animate'), now = performance.now();
      if (reqAt || !visible || (anim && anim.checked) || !drawn.length || (TEST && !RUN) || now - lastFrameAt < Math.max(showingLive() || recNow ? 1000 : 3000, 4 * lag)) return;
      reqAt = now; ctx.draw(); }, 500);
    group.visible = on;
    return {
      object: group, setVisible, ownUi: true, PROC, traffic, stateOf,
      get flights() { return drawn.map(({ F, S }) => ({ key: F.key, code: F.T.code, proc: F.live ? 'live' : F.rec ? 'recorded' : F.Pr ? F.Pr.name : 'lhr-' + F.line.mode, phase: S.phase, x: S.x, y: S.y, z: S.z, alt_ft: Math.round(S.y / FT), kt: Math.round(S.v / KT), gear: S.gear, t: F.live ? F.live.ac.t : F.rec ? F.rec.L.ty : undefined, rec: F.rec ? F.rec.L.k : undefined, trail: F.track ? F.track.trail.length : undefined })); },
      get recorded() { return { on: recOn, state: rec.state, error: rec.error, base: rec.base, pick: rec.pick, label: recLabel(rec.pick), days: rec.index ? rec.index.days.map(d => d.date) : [], showing: recNow }; },
      get live() { const f = LIVE.feed; return { want: LIVE.want, showing: !!showingLive(), url: LIVE.url, state: f ? f.state : 'off', polls: f ? f.polls : 0, errors: f ? f.errors : 0, lastError: f ? f.lastError : null, tracks: tracks.T.size, corr: tracks.corr }; },
      geo,
      screenOf(key) { const d = drawn.find(q => q.F.key === key); if (!d) return null; v3.set(d.S.x, d.S.y, d.S.z).project(ctx.camera); return { x: (v3.x + 1) / 2 * innerWidth, y: (1 - v3.y) / 2 * innerHeight, z: v3.z }; },
      card,
    };
  },
};
