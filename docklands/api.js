// The page API of moglob (the Three.js port, docklands/; the app's name since 2026-10-23): window.docklands, a documented and versioned interface for scripts,
// assistive technology and agents (OKR O3, KR3.3 and KR3.4: https://github.com/danbri/londat/issues/8), the same
// functions as WebMCP tools where the browser offers them, the spoken description of the view (an ARIA live region), the
// keys V (describe) and T (text view), and the locale-free deep links ?ll=lat,lon[,range] and ?place=<name>.
// The interface speaks WGS84 longitude and latitude, metres, degrees from true north and ISO 8601 times; the model frame,
// the height datum and the time zone stay inside (adapters/uk.js). The descriptions come from describe.js, which the text
// view (textview.js) and the MCP server (tools/view-mcp/server.mjs) use too, so all three say the same.
// Loaded by main.js after the layers, with the test hook (__docklands3) as its handle on the page.
// Reference: https://github.com/danbri/londat/blob/main/docklands/README.md "Page API" and https://danbri.github.io/londat/llms.txt
// Skill: docklands-3d-page, "Three.js port: page API, WebMCP and non-visual access (2026-10-11)".
import { makeIndex, describeView as describeCore, featuresAt as featuresCore, findPlaces as findCore, viewGeo, timeOf, bearing, parseTime, DESCRIBE_VERSION } from './describe.js';
import { ukAdapter } from './adapters/uk.js';
import { parseZone } from './geo/zone.js';
import { VIEW_LABELS } from './views.js';
import { latinOut, scrubText, getScriptPreference, setScriptPreference } from './geo/script.js';
import { GOV, APP } from './governor.js';

import { makeSweep, eyeOf, targetOf, cameraFromPose } from './camera-sweep.js?pose=1';
import { createAutopilot } from './camera-autopilot.js';
import { bridgeToParent } from './frame-bridge.js';
import { createModelCityRouter } from './city-route-model.js';
import { sampleCityRoute } from './city-route.js';
import { cityCameraConflict, canRestoreFlightControls } from './city-camera-gate.js';
import { projectSubject, scoreComposition } from './cinematic-composition.js';

export const API_VERSION = '1.10.0';   // The page tools also go to the frame that holds the page, by postMessage (frame-bridge.js).
// 1.9.1: stateful acceleration nudges and independent gaze; existing checked sweeps remain separate.
// 1.4.0 (2026-10-23): the app is called moglob: getView().app and .quality, describeView().app, .quality and .memory (the memory governor's budget, use and tier; governor.js); memory()
// 1.3.0 (2026-10-22): getView().weather and describeView().weather: the live weather of the place in view only (wind, cloud, METAR station, a water current only where the place has one; issue #12)
// 1.2.0 (2026-10-22): names in Latin script only by default; getScriptPreference, setScriptPreference, ?scripts=, getView().scripts.
// 1.1.0 (2026-10-21): the page clock's zone follows the view; getTimeZone, setTimeZone, setTime(v, zone)
const D = Math.PI / 180, $ = id => document.getElementById(id);
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* no storage */ } } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function init(H) {
  const { THREE, camera, controls, ctx } = H, A = ctx.A, qs = new URLSearchParams(location.search);
  const adapter = ukAdapter(A);
  // the page clock's time zone follows the view (clockzone.js, KR1.2): time is the wall clock there, with its zone,
  // abbreviation, offset and where the zone came from (a region config, the nearest town, the nautical zone, ?tz=)
  const Z = H.zone, timeNow = () => ({ ...timeOf(H.clock, Z.tz), ...Z.describe(H.clock) });
  const I = makeIndex(A, { adapter, under: globalThis.DOCKLANDS_UNDER || null });
  // building names: the OSM keys (building-keys.json) and the registry index (atlas.json), loaded by the page anyway
  const extras = Promise.all([H.keys().then(K => { if (K) I.setKeys(K); }), (ctx.registry?.ready || Promise.resolve(null)).then(AT => { if (AT) I.setAtlas(AT); })]).catch(e => console.warn('api: extras', e));

  // ---------- the camera in model metres (the eye from matrixWorld, which holds the vertical exaggeration)
  function camOf() {
    camera.updateMatrixWorld(); const e = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld), d = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld);
    const dist = camera.position.distanceTo(controls.target), t = e.clone().addScaledVector(d, dist);
    return { eye: [e.x, e.y, e.z], target: [t.x, t.y, t.z], fovY: camera.fov * D, aspect: camera.aspect, yaw: H.camState().yaw };
  }
  const GL = () => H.globe || null, onGlobe = () => !!(H.globe && H.globe.mode === 'globe');   // the globe (globe/globe.js), when the page has it
  const shareLink = () => onGlobe() ? H.globe.shareLink() : location.origin + location.pathname + location.search + H.shareHash();
  const sunNow = () => { const s = H.sky.state && H.sky.state.sun; return s ? { alt: s.alt, az: s.az, altGeo: s.altGeo } : null; };
  function getView() {
    if (onGlobe()) { const v = H.globe.getView(), pt = H.globe.placeTime?.(v.target.lon, v.target.lat);   // over a place (globe/places.js): its own clock too
      return latinOut({ app: APP.name, api_version: API_VERSION, ...v, time: timeNow(), ...(pt ? { place_time: pt } : {}), weather: liveWeather(), view: 'globe', scripts: getScriptPreference(), quality: GOV.quality(), share: shareLink() }); }
    const G = viewGeo(I, camOf()); delete G.frame; delete G.elon; delete G.elat; const s = sunNow();
    return latinOut({ app: APP.name, api_version: API_VERSION, ...G, time: timeNow(), sun: s ? { altitude_deg: Math.round(s.alt * 10) / 10, azimuth_deg: Math.round(s.az * 10) / 10 } : null, night: H.night, weather: liveWeather(), view: H.viewName || null, scripts: getScriptPreference(), quality: GOV.quality(), share: shareLink() });
  }
  const listViews = () => Object.keys(H.VIEWS).map(id => ({ id, label: VIEW_LABELS[id] || id }));
  const settle = () => new Promise(ok => requestAnimationFrame(() => ok()));

  // ---------- goTo: a named view, a place name, or a WGS84 point { lon, lat, range_m?, alt_m?, heading_deg?, pitch_deg? }
  // (answers with names in Latin script only while that is preferred: geo/script.js latinOut)
  const goTo = async (t, o = {}) => latinOut(await goTo0(t, o));
  async function goTo0(t, o = {}) {
    stopAutopilot('interrupted'); stopSweep('interrupted'); clearSweepLine();
    let found = null;
    if (t && typeof t === 'object' && t.view) t = String(t.view);
    if (t && typeof t === 'object' && t.place) { o = { ...t, ...o }; t = String(t.place); }
    if (typeof t === 'string') {
      const s = t.trim(), sl = s.toLowerCase(), vk = Object.keys(H.VIEWS).find(k => k === sl || (VIEW_LABELS[k] || '').toLowerCase() === sl);
      if (vk && o.lon == null) { H.setView(vk); await settle(); return { ...getView(), found: { name: VIEW_LABELS[vk] || vk, kind: 'view' } }; }
      await extras; found = findCore(I, s, 1)[0];
      // not in the model: the world (countries, regions, seas, cities; region configs; later the UK skeleton) on the globe
      if (!found && GL()) { await GL().gazetteer(); const w = (await GL().searchAll(s, 3))[0];
        if (w) { await new Promise(ok => GL().flyToEntry(w, { ms: o.animate ? undefined : 0, done: ok })); await settle(); return { ...getView(), found: { name: w.name, kind: w.kind, country: w.country || undefined, lon: w.lon, lat: w.lat } }; } }
      if (!found) throw new Error(`No place called "${s}". Try findPlaces("${s.slice(0, 3)}") or listViews().`);
      t = { lon: found.lon, lat: found.lat, range_m: o.range_m ?? (found.kind === 'building' ? 600 : found.kind === 'water' ? 1200 : 900), heading_deg: o.heading_deg, pitch_deg: o.pitch_deg };
    }
    const lon = +t.lon, lat = +t.lat; if (!isFinite(lon) || !isFinite(lat)) throw new Error('goTo needs a place name, a view id, or { lon, lat } in WGS84 degrees');
    const [x, z] = adapter.fromLonLat(lon, lat);
    // anywhere else on earth, or high above the model (over 36 km): the globe
    const high = +(t.alt_m ?? t.alt ?? 0) > 36000 || +(t.range_m ?? t.range ?? 0) > 36000;
    if (GL() && (!adapter.inBox(x, z, 500) || high)) { await GL().goTo(t, { animate: !!o.animate }); await settle(); return { ...getView(), found: found ? { name: found.name, kind: found.kind } : undefined }; }
    if (!adapter.inBox(x, z, 500)) throw new Error(`(${lat}, ${lon}) is outside the model area (west ${adapter.bbox[0].toFixed(4)}, south ${adapter.bbox[1].toFixed(4)}, east ${adapter.bbox[2].toFixed(4)}, north ${adapter.bbox[3].toFixed(4)}). Other places are not modelled yet (OKR O1).`);
    const s0 = H.camState(), pitch = t.pitch_deg != null ? clamp(+t.pitch_deg, 2, 89.5) * D : clamp(s0.pitch, 0.2, 1.3);
    const range = clamp(+(t.range_m ?? t.range ?? (t.alt_m ?? t.alt) / Math.sin(Math.max(0.1, pitch))) || clamp(s0.dist, 250, 2000), 10, H.nav.NV.DMAX);
    let yaw = s0.yaw;
    if (t.heading_deg != null) {   // true heading of the view direction; the model's grid north differs from true north by the convergence
      const [l2, b2] = adapter.toLonLat(x, z - 100), conv = ((bearing(lon, lat, l2, b2) + 540) % 360) - 180; yaw = -((+t.heading_deg - conv) * D);
    }
    if (onGlobe()) { GL().stopFlight(); GL().enterModel(); }   // (the model view below)
    H.setCam({ tx: x, ty: I.ground(x, z), tz: z, dist: range, yaw, pitch, hfov: null, fov: null, roll: 0 });
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    if (found && found.mi != null) H.selectModel(found.mi);
    await settle();
    return { ...getView(), found: found ? { name: found.name, kind: found.kind } : undefined };
  }

  // A course is planned once; playback stays in this document between WebMCP calls.
  let sweepPlan = null, sweepLine = null, sweepSerial = 0, sweepFrame = 0;
  let sweepState = { status: 'idle', progress: 0 }, sweepControls = null;
  const sweepSummary = () => ({ ...sweepState, view: getView() });
  function clearSweepLine() {
    if (!sweepLine) return;
    H.scene.remove(sweepLine); sweepLine.geometry.dispose(); sweepLine.material.dispose(); sweepLine = null; H.draw();
  }
  const cityCameraIssue = () => cityCameraConflict({ styleMode: globalThis.__docklandsStyles?.mode, globe: onGlobe(), xrFrame: !!H.ctx?.xrFrame, xrPresenting: !!H.renderer?.xr?.isPresenting, drone: !!globalThis.DocklandsDrone?.on, locateMode: H.layers?.locate?.api?.state?.mode, autoRotate: controls.autoRotate, enableDamping: controls.enableDamping });
  function requireCityCamera() { const issue = cityCameraIssue(); if (issue) throw new Error('Checked city flights are unavailable while ' + issue + ' is active. Stop that mode first; the camera was not changed.'); }
  function stopSweep(reason = 'stopped', { restoreControls = true } = {}) {
    if (sweepFrame) cancelAnimationFrame(sweepFrame); sweepFrame = 0;
    if (sweepControls !== null) { if (restoreControls && canRestoreFlightControls({ checkedCity: !!sweepPlan?.city, cameraConflict: sweepPlan?.city ? cityCameraIssue() : null })) controls.enabled = sweepControls; sweepControls = null; }
    if (sweepState.status === 'playing') { sweepState.status = reason; sweepNotice(`Flight ${reason}.`); }
    return sweepSummary();
  }
  function sweepNotice(text) { const el = $('sweepStatus'); if (el) el.textContent = text; }
  const controlSnapshot = () => [controls.minDistance, controls.maxDistance, controls.minPolarAngle, controls.maxPolarAngle, controls.minAzimuthAngle, controls.maxAzimuthAngle, controls.minTargetRadius, controls.maxTargetRadius, controls.cursor?.x, controls.cursor?.y, controls.cursor?.z];
  const sameControls = saved => { const current = controlSnapshot(); return saved.every((v, i) => Object.is(v, current[i])); };
  function checkCityCamera(c, verticalScale) {
    const maxDistanceOK = Number.isFinite(controls.maxDistance) || controls.maxDistance === Infinity;
    const maxTargetOK = Number.isFinite(controls.maxTargetRadius) || controls.maxTargetRadius === Infinity;
    if (!Number.isFinite(controls.minDistance) || controls.minDistance < 0 || !maxDistanceOK || controls.maxDistance < Math.max(10, controls.minDistance) || !Number.isFinite(controls.minPolarAngle) || controls.minPolarAngle < 0 || controls.minPolarAngle > Math.PI - .05 || !Number.isFinite(controls.minTargetRadius) || controls.minTargetRadius < 0 || !maxTargetOK || controls.maxTargetRadius < controls.minTargetRadius || !controls.cursor || ![controls.cursor.x, controls.cursor.y, controls.cursor.z].every(v => Number.isFinite(v) && Math.abs(v) <= 1e7)) throw new Error('City flight camera-control limits are unsupported');
    if (!['tx', 'ty', 'tz', 'dist', 'yaw', 'pitch'].every(k => Number.isFinite(c[k]))) throw new Error('City camera calculation must remain finite');
    if (c.dist < Math.max(10, controls.minDistance) || c.dist > controls.maxDistance) throw new Error('City gaze exceeds the current camera distance limits');
    const polar = Math.PI / 2 - c.pitch;
    if (polar < Math.max(controls.minPolarAngle, 1e-5) || polar > Math.PI - .05) throw new Error('City gaze exceeds the current camera tilt limits');
    if (controls.minAzimuthAngle !== -Infinity || controls.maxAzimuthAngle !== Infinity) throw new Error('City flights need unrestricted azimuth controls');
    const target = targetOf(c, verticalScale), cursor = controls.cursor;
    if (cursor) { const radius = Math.hypot(target[0] - cursor.x, target[1] * verticalScale - cursor.y, target[2] - cursor.z);
      if (!Number.isFinite(radius) || radius < controls.minTargetRadius || radius > controls.maxTargetRadius) throw new Error('City gaze exceeds the current camera target limits'); }
  }
  async function planSweep(a = {}) {
    if (autopilot && ['playing', 'braking', 'paused'].includes(autopilot.state().status)) throw new Error('Stop the autopilot before planning a sweep.');
    if (onGlobe()) throw new Error('Camera sweeps currently run inside the detailed model. Choose a model view first.');
    if (sweepState.status === 'playing') throw new Error('Stop the current sweep before planning another.');
    const routing_policy = a.routing_policy ?? 'unconstrained';
    if (!['unconstrained', 'interior', 'underground', 'city'].includes(routing_policy)) throw new Error('routing_policy must be unconstrained, interior, underground or city');
    if (routing_policy === 'city') requireCityCamera();
    await extras;
    if (routing_policy === 'city') requireCityCamera();
    let end, name, view = a.view;
    if (view) { if (!H.VIEWS[view]) throw new Error('Unknown view: ' + view); end = { ...H.VIEWS[view] }; name = VIEW_LABELS[view] || view; }
    else {
      let lon = a.lon, lat = a.lat;
      if (a.place) { const p = findCore(I, a.place, 1)[0]; if (!p) throw new Error('No model place called ' + a.place); ({ lon, lat } = p); name = p.name; }
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw new Error('Choose a view, a model place, or lon and lat.');
      const [x, z] = adapter.fromLonLat(lon, lat);
      if (!adapter.inBox(x, z, 0)) throw new Error('The destination is outside the detailed model.');
      const s = H.camState(), pitch = (a.pitch_deg ?? 25) * D, dist = a.range_m ?? 900;
      if (!Number.isFinite(pitch) || pitch < -85 * D || pitch > 89.5 * D || !Number.isFinite(dist) || dist < 10 || dist > H.nav.NV.DMAX) throw new Error('Invalid pitch or range.');
      let yaw = s.yaw;
      if (a.heading_deg != null) { if (!Number.isFinite(a.heading_deg)) throw new Error('heading_deg must be finite'); const [l2, b2] = adapter.toLonLat(x, z - 100), conv = ((bearing(lon, lat, l2, b2) + 540) % 360) - 180; yaw = -(a.heading_deg - conv) * D; }
      end = { tx: x, ty: I.ground(x, z), tz: z, yaw, pitch, dist, hfov: null, fov: null, roll: 0 }; name ||= 'the chosen point';
    }
    const modelPoint = (p, label) => {
      if (!p || !Number.isFinite(p.lon) || !Number.isFinite(p.lat) || !Number.isFinite(p.height_m) || Math.abs(p.height_m) > 1e7) throw new Error(label + ' needs finite lon, lat and height_m');
      const [x, z] = adapter.fromLonLat(p.lon, p.lat);
      if (!adapter.inBox(x, z, 500)) throw new Error(label + ' is outside the detailed model');
      return [x, p.height_m, z];
    };
    if (a.eye_via != null && (!Array.isArray(a.eye_via) || a.eye_via.length > 16)) throw new Error('eye_via must be an array of at most 16 points');
    if (a.look_at != null && (!Array.isArray(a.look_at) || a.look_at.length > 16)) throw new Error('look_at must be an array of at most 16 fixations');
    const verticalScale = H.ctx?.vzNow?.() ?? H.vz ?? 1, start = H.camState();
    let duration_s = a.duration_s ?? 12, trajectory = a.trajectory ?? 'curved', eye_via = (a.eye_via || []).map(p => modelPoint(p, 'Eye waypoint'));
    let look_at = (a.look_at || []).map(p => ({ point: modelPoint(p, 'Gaze fixation'), at_s: p.at_s, hold_s: p.hold_s ?? 0 })), gaze_path = null, city = null;
    if (routing_policy === 'city') {
      if ((a.trajectory != null && a.trajectory !== 'polyline') || eye_via.length || (a.lift_m ?? 0) !== 0 || (a.bend_m ?? 0) !== 0) throw new Error('Checked city routes require the exact polyline with no eye_via, lift_m or bend_m overrides');
      const height_m = a.city_height_m ?? 8, clearance_m = a.city_clearance_m ?? 2, look_ahead_m = a.city_look_ahead_m ?? 80, look_up_deg = a.city_look_up_deg ?? 30;
      if (!Number.isFinite(look_ahead_m) || look_ahead_m < 20 || look_ahead_m > 200 || !Number.isFinite(look_up_deg) || look_up_deg < 5 || look_up_deg > 65) throw new Error('City attention needs look-ahead 20 to 200 metres and look-up 5 to 65 degrees');
      const router = createModelCityRouter(A, { height_m, clearance_m });
      const requestedPoint = view ? eyeOf(end, verticalScale) : [end.tx, end.ty, end.tz];
      const [requestedLon, requestedLat] = adapter.toLonLat(requestedPoint[0], requestedPoint[2]);
      const destination = router.nearestRoadPoint(requestedPoint[0], requestedPoint[2]);
      if (!destination.ok) throw new Error('No clear low road within 80 metres of this destination. Choose a nearby road point.');
      const route = router.plan(eyeOf(start, verticalScale), destination.point);
      if (!route.ok) throw new Error('City route refused: ' + route.error + '. Start near a clear road at low height; no camera relocation was made.');
      const minimum_s = Math.max(.25, route.length_m / 12, 1.875 * route.length_m / 20);
      duration_s = a.duration_s ?? Math.max(12, route.length_m / 8);
      if (!Number.isFinite(duration_s) || duration_s < minimum_s || duration_s > 600) throw new Error('City flight duration must be at least ' + Math.ceil(minimum_s) + ' seconds and at most 600 seconds (average ≤12 m/s; eased peak ≤20 m/s). Choose a closer destination if needed.');
      const last = route.points.at(-1), previous = route.points.at(-2), lastDX = last[0] - previous[0], lastDZ = last[2] - previous[2];
      const aim = u => {
        const eye = sampleCityRoute(route, u), ahead = sampleCityRoute(route, Math.min(1, u + look_ahead_m / route.length_m));
        let dx = ahead[0] - eye[0], dz = ahead[2] - eye[2], horizontal = Math.hypot(dx, dz);
        if (horizontal < 1e-6) { dx = lastDX; dz = lastDZ; horizontal = Math.hypot(dx, dz); }
        if (horizontal < 1e-6) { dx = -Math.sin(start.yaw); dz = -Math.cos(start.yaw); horizontal = 1; }
        return [eye[0] + dx / horizontal * look_ahead_m, eye[1] + Math.tan(look_up_deg * D) * look_ahead_m, eye[2] + dz / horizontal * look_ahead_m];
      };
      const target = aim(1), dx = last[0] - target[0], dy = (last[1] - target[1]) * verticalScale, dz = last[2] - target[2];
      end = { tx: target[0], ty: target[1], tz: target[2], dist: Math.hypot(dx, dy, dz), yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)), hfov: null, fov: camera.fov * D, roll: 0 };
      const startTarget = targetOf(start, verticalScale);
      if (!look_at.length) gaze_path = u => { const next = aim(u), f = Math.min(1, u / .12), blend = f * f * f * (f * (f * 6 - 15) + 10); return next.map((v, i) => startTarget[i] + (v - startTarget[i]) * blend); };
      eye_via = route.points.slice(1, -1).map(p => p.slice()); trajectory = 'polyline';
      const [lon, lat] = adapter.toLonLat(last[0], last[2]);
      city = { route, destination: { lon, lat, height_m: last[1], horizontal_offset_from_requested_m: destination.distance_horizontal_m, vertical_offset_from_requested_m: last[1] - requestedPoint[1], distance_from_requested_m: Math.hypot(destination.distance_horizontal_m, last[1] - requestedPoint[1]) }, requested: { kind: view ? 'named-view-eye' : 'place-or-point', view: view || null, name, lon: requestedLon, lat: requestedLat, height_m: requestedPoint[1] },
        model_source: { url: new URL(ctx.DATA + 'data/area.js', location.href).href, built: A.meta.built || null, origin: { ...A.meta.origin }, extent: { ...A.meta.extent }, credits: (A.meta.sources || []).map(source => ({ ...source })), derivation: 'Existing model road geometry and recorded heights; static extruded building footprints. Source-specific rights remain; no blanket plan licence is asserted.' },
        clearance: route.clearance, attention: look_at.length ? { method: 'explicit-gaze-fixations', visibility_checked: false } : { method: 'road-lookahead-up', look_ahead_m, look_up_deg, visibility_checked: false },
        speed: { average_m_s: route.length_m / duration_s, peak_m_s: 1.875 * route.length_m / duration_s, max_average_m_s: 12, max_peak_m_s: 20 } };
      name = 'the clear road near ' + name; view = null;
    }
    if (a.focus_destination !== false && trajectory === 'curved' && !look_at.length) look_at = [{ point: targetOf(end, verticalScale), at_s: duration_s * .45, hold_s: duration_s * .35 }];
    const subject = a.composition_subject ? modelPoint(a.composition_subject, 'Composition subject') : null;
    const course = makeSweep(start, end, { duration_s, steps: a.steps ?? 10, lift_m: a.lift_m ?? (routing_policy === 'unconstrained' && !eye_via.length && trajectory !== 'polyline' ? 150 : 0), bend_m: a.bend_m ?? 0, aspect: camera.aspect, verticalScale, trajectory, eye_via, look_at, gaze_path });
    // Certify the played segments, including reconstructed camera endpoints, not just the graph route.
    if (city) {
      for (let i = 0; i <= 1000; i++) checkCityCamera(course.sample(i / 1000), verticalScale);
      const played = [eyeOf(course.sample(0), verticalScale), ...eye_via, eyeOf(course.sample(1), verticalScale)];
      const validator = createModelCityRouter(A, { height_m: a.city_height_m ?? 8, clearance_m: a.city_clearance_m ?? 2 });
      if (played.some((p, i) => i && !validator.segmentClear(played[i - 1], p))) throw new Error('The exact played city route failed final building-clearance validation');
    }
    // Reject a course that leaves the model, rather than silently handing an animation to the globe.
    for (let i = 0; i <= 200; i++) { const e = eyeOf(course.sample(i / 200), verticalScale); if (!adapter.inBox(e[0], e[2], 500)) throw new Error('The course leaves the detailed model.'); }
    clearSweepLine();
    const preview = city ? city.route.points : Array.from({ length: 101 }, (_, i) => eyeOf(course.sample(i / 100), verticalScale));
    const points = preview.map(p => new THREE.Vector3(...p));
    sweepLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x55ddee, depthTest: false }));
    sweepLine.frustumCulled = false; sweepLine.renderOrder = 1000; H.scene.add(sweepLine); H.draw();
    const id = 'sweep-' + ++sweepSerial;
    sweepPlan = { id, course, start, end, view, name, routing_policy, aspect: camera.aspect, city, control_settings: city ? controlSnapshot() : null };
    sweepState = { id, status: 'planned', progress: 0, destination: name, duration_s: course.duration_s, steps: course.steps, trajectory, routing_policy, collision_checked: !!city, collision_scope: city ? 'static-model-building-prisms-and-model-bounds' : null, eye_path_length_m: course.length_m, ...(city ? { destination_resolved: city.destination, destination_requested: city.requested, clearance: city.clearance, model_source: city.model_source, attention: city.attention, speed: city.speed, route_points: city.route.points.length, stop_at_corners: true } : {}) };
    const text = `A ${course.duration_s} second ${trajectory} flight to ${name}, with ${city ? city.route.points.length - 1 : course.steps} ${city ? 'checked road segments' : 'course inspection segments'}${course.gaze.length > 2 ? city && gaze_path ? ' and independent upward road attention' : ' and independent gaze fixations' : ''}. Routing policy: ${routing_policy}. ${city ? `Static building-prism clearance checked at ${city.clearance.radius_m} metres; destination is a road ${city.destination.horizontal_offset_from_requested_m.toFixed(1)} metres horizontally and ${city.destination.vertical_offset_from_requested_m.toFixed(1)} metres vertically from the requested point. Stops gently at road corners. Other geometry and landmark visibility are not checked.` : 'Building clearance and landmark visibility are not checked.'}`;
    sweepNotice(text);
    return { ...sweepState, text, ...(city ? { city_route: { points: city.route.points.map(p => { const [lon, lat] = adapter.toLonLat(p[0], p[2]); return { lon, lat, height_m: p[1] }; }), telemetry: city.route.telemetry } } : {}), ...(gaze_path ? { gaze_samples: course.gaze.map(g => { const [lon, lat] = adapter.toLonLat(g.point[0], g.point[2]); return { time_s: g.time_s, lon, lat, height_m: g.point[1] }; }) } : { gaze_fixations: course.gaze.map(g => { const [lon, lat] = adapter.toLonLat(g.point[0], g.point[2]); return { time_s: g.time_s, lon, lat, height_m: g.point[1] }; }) }), composition_method: subject ? 'Geometric subject framing only; occlusion is unknown. Not an image aesthetic score.' : undefined,
      waypoints: course.waypoints.map(w => { const c = w.camera, e = eyeOf(c, verticalScale), [lon, lat] = adapter.toLonLat(e[0], e[2]), [tlon, tlat] = adapter.toLonLat(c.tx, c.tz), target = targetOf(c, verticalScale); const projection = subject ? projectSubject(c, subject, { aspect: camera.aspect, verticalScale }) : null;
        return { time_s: w.time_s, eye: { lon, lat, height_m: e[1] }, target: { lon: tlon, lat: tlat, height_m: target[1] }, ...(projection ? { composition: { subject: projection, ...scoreComposition({ subject: projection }) } } : {}) }; }) };
  }
  // Explicit independent eye/target poses use the same validated, cancellable sweep playback.
  async function startPoseSweep(a = {}) {
    if (onGlobe()) throw new Error('Pose sweeps require the detailed model.');
    if (autopilot && ['playing', 'braking', 'paused'].includes(autopilot.state().status)) throw new Error('Stop the autopilot before starting a pose sweep.');
    if (sweepState.status === 'playing') throw new Error('Stop the current sweep first.');
    await extras;
    if (onGlobe() || (autopilot && ['playing', 'braking', 'paused'].includes(autopilot.state().status)) || sweepState.status === 'playing') throw new Error('Camera state changed while preparing the pose sweep; try again.');
    requireAutopilotCamera();
    const start = H.camState(), verticalScale = H.ctx?.vzNow?.() ?? H.vz ?? 1;
    const eye = a.eye ? flightPoint(a.eye, 'Eye').point : eyeOf(start, verticalScale);
    const target = flightPoint(a.target, 'Gaze target').point;
    const currentEye = eyeOf(start, verticalScale);
    if (!adapter.inBox(currentEye[0], currentEye[2], 0) || !adapter.inBox(eye[0], eye[2], 0)) throw new Error('Both eye positions must be inside the detailed model.');
    const end = cameraFromPose(eye, target, verticalScale, { hfov: null, fov: camera.fov * D, roll: start.lens?.roll || 0 });
    if (a.eye_via != null && (!Array.isArray(a.eye_via) || a.eye_via.length > 16)) throw new Error('eye_via must contain at most 16 points');
    if (a.look_at != null && (!Array.isArray(a.look_at) || a.look_at.length > 16)) throw new Error('look_at must contain at most 16 fixations');
    const eye_via = (a.eye_via || []).map(p => flightPoint(p, 'Eye waypoint').point);
    const look_at = (a.look_at || []).map(p => ({ point: flightPoint(p, 'Gaze fixation').point, at_s: p.at_s, hold_s: p.hold_s ?? 0 }));
    const course = makeSweep(start, end, { duration_s: a.duration_s ?? 5, steps: 10, trajectory: 'curved', lift_m: 0, aspect: camera.aspect, verticalScale, eye_via, look_at });
    for (let i = 0; i <= 200; i++) { const c = course.sample(i / 200), e = eyeOf(c, verticalScale); if (!adapter.inBox(e[0], e[2], 0)) throw new Error('The pose course leaves the detailed model.'); checkCityCamera(c, verticalScale); }
    const id = 'sweep-' + ++sweepSerial;
    clearSweepLine();
    sweepPlan = { id, course, start, end, view: null, name: a.name || 'the requested pose', routing_policy: 'unconstrained', aspect: camera.aspect, city: null };
    sweepState = { id, status: 'planned', progress: 0, destination: sweepPlan.name, duration_s: course.duration_s, trajectory: 'curved', routing_policy: 'unconstrained', collision_checked: false, eye_path_length_m: course.length_m };
    return startSweep({ plan_id: id });
  }
  async function startSweep(a = {}) {
    stopAutopilot('replaced');
    stopSweep('replaced');
    if (a.plan_id) { if (sweepPlan?.id !== a.plan_id) throw new Error('This plan is no longer available. Plan the course again.'); }
    else await planSweep(a);
    const p = sweepPlan; if (p.city) requireCityCamera();
    const now = H.camState();
    if (p.city && !sameControls(p.control_settings)) throw new Error('Camera control limits changed since this city route was planned. Plan it again.');
    if (['tx', 'ty', 'tz', 'yaw', 'pitch', 'dist'].some(k => Math.abs(now[k] - p.start[k]) > .001) || ['hfov', 'fov', 'roll'].some(k => Math.abs((now[k] ?? now.lens?.[k] ?? 0) - (p.start[k] ?? p.start.lens?.[k] ?? 0)) > 1e-8) || Math.abs((H.ctx?.vzNow?.() ?? H.vz ?? 1) - p.course.verticalScale) > 1e-8 || Math.abs(camera.aspect - p.aspect) > 1e-8) throw new Error('The camera moved or its lens, viewport or height scale changed since this course was planned. Plan it again.');
    H.setViewName(null); H.nav.stop(); sweepControls = controls.enabled; controls.enabled = false;
    sweepState = { ...sweepState, status: 'playing', progress: 0 };
    clearSweepLine(); const started = performance.now(); let previousFrame = null;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    sweepNotice(`Flying to ${p.name}. Press Escape or use Stop flight to stop.`);
    const interruptForOwner = issue => { stopSweep('interrupted'); sweepState.reason = 'camera-owner-changed'; sweepState.camera_owner = issue; sweepNotice('City flight interrupted: ' + issue + ' now owns or changes the camera.'); };
    const tick = t => {
      const owner = p.city ? cityCameraIssue() : null; if (owner) { interruptForOwner(owner); return; }
      if (Math.abs((H.ctx?.vzNow?.() ?? H.vz ?? 1) - p.course.verticalScale) > 1e-8 || Math.abs(camera.aspect - p.aspect) > 1e-8) { stopSweep('interrupted'); sweepState.reason = 'view-settings-changed'; sweepNotice('Flight interrupted: viewport or height scale changed. Plan it again.'); return; }
      const u = reduced ? 1 : clamp((t - started) / (p.course.duration_s * 1000), 0, 1);
      const frameGap = previousFrame === null ? null : Math.max(0, t - previousFrame); previousFrame = t;
      sweepState.frames = (sweepState.frames || 0) + 1;
      sweepState.first_frame_delay_ms ??= Math.max(0, performance.now() - started);
      sweepState.max_frame_gap_ms = Math.max(sweepState.max_frame_gap_ms || 0, frameGap || 0);
      sweepState.elapsed_wall_ms = Math.max(0, t - started);
      try {
        if (p.city && !sameControls(p.control_settings)) throw new Error('Camera control limits changed during the checked city flight');
        const sample = p.course.sample(u); if (p.city) checkCityCamera(sample, p.course.verticalScale);
        H.setCam(sample);
      } catch (error) {
        stopSweep('failed'); sweepState.error = String(error.message || error); sweepNotice('Flight stopped: ' + sweepState.error); return;
      }
      const ownerAfter = p.city ? cityCameraIssue() : null; if (ownerAfter) { interruptForOwner(ownerAfter); return; }
      sweepState.progress = u;
      if (u < 1) sweepFrame = requestAnimationFrame(tick);
      else { H.setViewName(p.view || null); sweepState.status = 'completed'; sweepFrame = 0; controls.enabled = sweepControls; sweepControls = null; sweepNotice(`Flight complete: ${p.name}.`); if (describeOn) sayView(true); }
    };
    sweepFrame = requestAnimationFrame(tick);
    return { ...sweepState, text: 'Flight started. Use get_sweep for progress or stop_sweep to stop.' };
  }
  for (const event of ['pointerdown', 'wheel', 'keydown']) addEventListener(event, e => {
    if (sweepState.status === 'playing') stopSweep('interrupted');
  }, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopSweep('interrupted'); });

  // ---------- Stateful camera autopilot. Physics and attention advance in the browser, not in tool calls.
  let autopilot = null, autopilotFrame = 0, autopilotControls = null, autopilotEpoch = 0, autopilotRequest = 0;
  let autopilotMeta = { status: 'idle' };
  const flightActive = s => ['playing', 'braking'].includes(s);
  const flightPoint = (p, label, fallbackHeight) => {
    if (!p || typeof p !== 'object') throw new Error(label + ' needs a place or WGS84 point');
    let { lon, lat } = p, name = p.name || p.place || label;
    if (p.place) { const found = findCore(I, p.place, 1)[0]; if (!found) throw new Error('No model place called ' + p.place); ({ lon, lat } = found); name = found.name; }
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw new Error(label + ' needs finite longitude and latitude');
    const [x, z] = adapter.fromLonLat(lon, lat), y = p.height_m ?? fallbackHeight ?? (I.ground(x, z) + 40);
    if (!adapter.inBox(x, z, 0) || !Number.isFinite(y) || Math.abs(y) > 1e5) throw new Error(label + ' is outside the finite detailed model');
    return { point: [x, y, z], name };
  };
  const geographicPoint = point => { const [lon, lat] = adapter.toLonLat(point[0], point[2]); return { lon, lat, height_m: point[1] }; };
  function autopilotText(s) {
    if (!autopilot) return 'Autopilot is idle.';
    const status = autopilotMeta.reason ? autopilotMeta.status : s.status, reason = autopilotMeta.reason ?? s.reason;
    return `Autopilot ${status}${reason ? ' (' + reason + ')' : ''}. ${Math.round(flightActive(status) ? Math.hypot(...s.velocity) : 0)} metres per second. ${s.visited?.length || 0} of ${autopilotMeta.route?.length || 0} waypoints reached. Independent gaze; obstacle clearance is not checked.`;
  }
  function getAutopilot() {
    if (!autopilot) return { ...autopilotMeta, text: 'Autopilot is idle.' };
    const s = autopilot.state();
    return latinOut({ ...s, ...autopilotMeta, status: autopilotMeta.reason ? autopilotMeta.status : s.status, reason: autopilotMeta.reason ?? s.reason,
      position: geographicPoint(s.position), target: geographicPoint(s.target),
      velocity_model_m_s: s.velocity, acceleration_model_m_s2: s.acceleration,
      routing_policy: 'unconstrained', collision_checked: false, text: autopilotText(s) });
  }
  function autopilotNotice(text) { sweepNotice(text); const el = $('autopilotStatus'); if (el) el.textContent = text; }
  function releaseAutopilotControls() {
    if (autopilotControls !== null) { if (canRestoreFlightControls({ checkedCity: true, cameraConflict: cityCameraIssue() })) controls.enabled = autopilotControls; autopilotControls = null; }
  }
  function stopAutopilot(reason = 'stopped') {
    autopilotRequest++; autopilotEpoch++;
    if (autopilotFrame) cancelAnimationFrame(autopilotFrame); autopilotFrame = 0;
    if (autopilot) { autopilot.stop(); autopilotMeta = { ...autopilotMeta, status: reason === 'stopped' ? 'stopped' : 'interrupted', reason }; }
    releaseAutopilotControls();
    return getAutopilot();
  }
  function requireAutopilotCamera() { const issue = cityCameraIssue(); if (issue) throw new Error('Autopilot requires the base perspective camera; stop ' + issue + ' first.'); }
  function autopilotCamera(s, verticalScale, fov) {
    const d = s.position.map((v, i) => v - s.target[i]); d[1] *= verticalScale;
    const dist = Math.hypot(...d);
    const c = { tx: s.target[0], ty: s.target[1], tz: s.target[2], dist, yaw: Math.atan2(d[0], d[2]), pitch: Math.atan2(d[1], Math.hypot(d[0], d[2])), hfov: null, fov, roll: 0 };
    checkCityCamera(c, verticalScale); return c;
  }
  function runAutopilot() {
    requireAutopilotCamera();
    const verticalScale = H.ctx?.vzNow?.() ?? H.vz ?? 1, aspect = camera.aspect, fov = camera.fov * D, settings = controlSnapshot(), epoch = ++autopilotEpoch;
    // rAF timestamps describe the frame, not this task's performance.now().
    // Seed on the first callback, including resume, so its delta cannot be negative.
    let previous = null;
    if (autopilotControls === null) autopilotControls = controls.enabled;
    controls.enabled = false; H.nav.stop(); H.setViewName(null);
    const tick = now => {
      if (epoch !== autopilotEpoch) return;
      try {
        requireAutopilotCamera();
        const currentSettings = controlSnapshot(), names = ['minDistance','maxDistance','minPolarAngle','maxPolarAngle','minAzimuthAngle','maxAzimuthAngle','minTargetRadius','maxTargetRadius','cursor.x','cursor.y','cursor.z'];
        const changedControls = names.flatMap((name, i) => Object.is(settings[i], currentSettings[i]) ? [] : [{ name, expected: settings[i], actual: currentSettings[i] }]);
        const currentScale = H.ctx?.vzNow?.() ?? H.vz ?? 1;
        if (changedControls.length) { autopilotMeta.interruption_detail = { kind: 'control-limits', changed: changedControls }; throw new Error('camera-control-settings-changed: ' + changedControls.map(v => v.name).join(', ')); }
        if (Math.abs(currentScale - verticalScale) > 1e-8) { autopilotMeta.interruption_detail = { kind: 'height-scale', expected: verticalScale, actual: currentScale }; throw new Error('camera-height-scale-changed'); }
        if (Math.abs(camera.aspect - aspect) > 1e-8) { autopilotMeta.interruption_detail = { kind: 'viewport-aspect', expected: aspect, actual: camera.aspect }; throw new Error('camera-viewport-aspect-changed'); }
        if (Math.abs(camera.fov * D - fov) > 1e-8) { autopilotMeta.interruption_detail = { kind: 'field-of-view', expected_deg: fov / D, actual_deg: camera.fov }; throw new Error('camera-field-of-view-changed'); }
        const s = autopilot.step(previous === null ? 0 : (now - previous) / 1000); previous = now;
        if (!adapter.inBox(s.position[0], s.position[2], 0)) throw new Error('model-boundary');
        H.setCam(autopilotCamera(s, verticalScale, fov));
        if (flightActive(s.status)) autopilotFrame = requestAnimationFrame(tick);
        else { autopilotFrame = 0; releaseAutopilotControls(); autopilotNotice(autopilotText(s)); }
      } catch (error) { stopAutopilot(String(error.message || error)); autopilotNotice('Autopilot stopped: ' + String(error.message || error)); }
    };
    autopilotFrame = requestAnimationFrame(tick);
  }
  async function startAutopilot(a = {}) {
    const request = ++autopilotRequest;
    requireAutopilotCamera(); if (onGlobe()) throw new Error('Autopilot currently runs in the detailed model only.');
    if (a.routing_policy != null && a.routing_policy !== 'unconstrained') throw new Error('Nudge autopilot currently supports only unconstrained routing; use checked city sweeps for road clearance.');
    await extras; if (request !== autopilotRequest) throw new Error('Autopilot start was superseded.'); requireAutopilotCamera();
    if (a.via != null && (!Array.isArray(a.via) || a.via.length > 32)) throw new Error('via must contain at most 32 waypoints');
    const route = [...(a.via || []), a.destination || { place: a.place, lon: a.lon, lat: a.lat, height_m: a.height_m }].map((p, i) => {
      const result = flightPoint(p, 'Waypoint ' + (i + 1)); if (p.gaze) result.gaze = flightPoint(p.gaze, 'Waypoint gaze').point; return result;
    });
    const start = H.camState(), verticalScale = H.ctx?.vzNow?.() ?? H.vz ?? 1;
    const startEye = eyeOf(start, verticalScale); if (!adapter.inBox(startEye[0], startEye[2], 0)) throw new Error('The current eye is outside the detailed model; choose a model view first.');
    const candidate = createAutopilot({ position: eyeOf(start, verticalScale), target: targetOf(start, verticalScale), route, config: a.config || {}, segmentClear: (from, to) => adapter.inBox(to[0], to[2], 0) });
    autopilotCamera(candidate.state(), verticalScale, camera.fov * D);
    stopAutopilot('replaced'); stopSweep('replaced'); clearSweepLine(); autopilot = candidate;
    autopilotMeta = { route: route.map(p => ({ name: p.name, ...geographicPoint(p.point), ...(p.gaze ? { gaze: geographicPoint(p.gaze) } : {}) })), status: 'playing' };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { autopilot.pause(); autopilotMeta.status = 'paused'; }
    else runAutopilot();
    autopilotNotice(autopilotText(autopilot.state())); return getAutopilot();
  }
  function requireAutopilot() { if (!autopilot) throw new Error('Start an autopilot journey first.'); return autopilot; }
  function nudgeAutopilot(a = {}) { requireAutopilot().nudge(a); return getAutopilot(); }
  function gazeAutopilot(a = {}) { if (!autopilot || !flightActive(autopilot.state().status) || autopilotMeta.reason) throw new Error('Gaze needs a running autopilot; use start_pose_sweep for a stationary camera.'); const p = a.point === null ? null : flightPoint(a.point || a, 'Gaze target').point; requireAutopilot().lookAt({ point: p, hold_s: a.hold_s ?? 5 }); return getAutopilot(); }
  function configureAutopilot(a = {}) {
    const p = requireAutopilot(), current = p.state(); let route = null;
    if (a.via != null && !a.destination) throw new Error('Changing via points also needs a destination');
    if (a.destination) {
      if (!['playing', 'paused'].includes(current.status)) throw new Error('Only a playing or paused autopilot can change route');
      if (a.via != null && (!Array.isArray(a.via) || a.via.length > 32)) throw new Error('via must contain at most 32 waypoints');
      route = [...(a.via || []), a.destination].map((point, i) => { const entry = flightPoint(point, 'Waypoint ' + (i + 1)); if (point.gaze) entry.gaze = flightPoint(point.gaze, 'Waypoint gaze').point; return entry; });
    }
    // Validate all requested changes on a disposable controller before mutating the live one.
    createAutopilot({ position: current.position, target: current.target, route: route || [{ point: current.position }], config: { ...current.config, ...(a.config || {}) } });
    p.configure(a.config || {});
    if (route) { p.setRoute({ route }); autopilotMeta = { ...autopilotMeta, route: route.map(point => ({ name: point.name, ...geographicPoint(point.point), ...(point.gaze ? { gaze: geographicPoint(point.gaze) } : {}) })) }; }
    return getAutopilot();
  }
  function controlAutopilot(a = {}) {
    const p = requireAutopilot();
    if (a.action === 'stop') return stopAutopilot();
    if (a.action === 'pause') { p.pause(); if (autopilotFrame) cancelAnimationFrame(autopilotFrame); autopilotFrame = 0; autopilotEpoch++; releaseAutopilotControls(); }
    else if (a.action === 'resume') {
      requireAutopilotCamera(); const current = H.camState(), scale = H.ctx?.vzNow?.() ?? H.vz ?? 1, state = p.state();
      const changed = (actual, expected) => Math.hypot(...actual.map((v, i) => v - expected[i])) > .05;
      if (changed(eyeOf(current, scale), state.position) || changed(targetOf(current, scale), state.target)) throw new Error('The camera moved while paused. Start a new autopilot journey from the current eye.');
      p.resume(); delete autopilotMeta.reason; delete autopilotMeta.interruption_detail; if (!autopilotFrame && flightActive(p.state().status)) runAutopilot();
    }
    else if (a.action === 'brake') p.brake();
    else throw new Error('Autopilot action must be pause, resume, brake or stop');
    autopilotNotice(autopilotText(p.state())); return getAutopilot();
  }
  for (const event of ['pointerdown', 'wheel', 'keydown']) addEventListener(event, () => {
    if (autopilot && ['playing', 'braking', 'paused'].includes(autopilot.state().status)) stopAutopilot('manual-input');
  }, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden && autopilot) stopAutopilot('page-hidden'); });

  // ---------- time
  // setTime(v, zone?): a time without an offset is the wall clock of zone (an IANA name or UTC+n), else of the view's zone
  function setTime(v, zone) {
    const tz = zone ? parseZone(zone) : Z.tz; if (!tz) throw new Error(`Unknown time zone "${zone}": an IANA name such as Europe/Madrid, UTC, or UTC+2`);
    const t = parseTime(v, tz); if (!isFinite(t)) throw new Error('setTime needs an ISO 8601 time (with Z or an offset, or a wall-clock time of the place), a number of ms, or "now"');
    if (v == null || /^now$/i.test(String(v))) H.setClockUser(Date.now(), true); else H.setClockUser(t);
    const s = sunNow(); return { time: timeNow(), night: H.night, sun: s ? { altitude_deg: Math.round(s.alt * 10) / 10, azimuth_deg: Math.round(s.az * 10) / 10 } : null };
  }
  const zoneView = () => onGlobe() ? { mode: 'globe', ...H.globe.orbit(), zoneAt: H.globe.zoneAt } : { mode: 'model' };
  const getTimeZone = () => timeNow();
  // setTimeZone(zone): fix the page clock's zone (IANA name, UTC, UTC+n); null or "auto": follow the view again. The instant stays.
  function setTimeZone(zone) { Z.setZone(zone, zoneView()); return timeNow(); }

  // ---------- layers: the page settings with a switch, and the layer modules
  const BUILTIN = [['labels', 'Labels, notes and credits on the map', 'showLabels'], ['roads', 'Roads', 'showRoads'], ['shadows', 'Sun shadows', 'shadows'], ['bloom', 'Bloom by night', 'bloom']];
  function listLayers() {
    const out = BUILTIN.filter(b => $(b[2])).map(([id, label, el]) => ({ id, label, on: $(el).checked, kind: 'setting' }));
    for (const [id, L] of Object.entries(H.layers)) out.push({ id, label: L.mod.label || id, on: !!L.on, kind: 'layer', menu: L.mod.menu || null, switchable: !!(L.input || L.api.setVisible || L.api.object) });
    return out;
  }
  function setLayer(id, on) {
    on = on === undefined ? true : !!on && !/^(0|false|off|no)$/i.test(String(on));
    const b = BUILTIN.find(x => x[0] === id);
    if (b) { const el = $(b[2]); if (el && el.checked !== on) { el.checked = on; el.dispatchEvent(new Event('change')); } }
    else { const L = H.layers[id]; if (!L) throw new Error(`No layer "${id}". listLayers() gives the ids.`);
      if (L.input) { if (L.input.checked !== on) { L.input.checked = on; L.input.dispatchEvent(new Event('change')); } }
      else { if (L.api.setVisible) L.api.setVisible(on); else if (L.api.object) L.api.object.visible = on; else throw new Error(`Layer "${id}" has no switch`); L.on = on; } }
    H.draw(); return listLayers().find(l => l.id === id);
  }

  // ---------- what is at a point, or at the centre of the screen
  let REG = null;
  const reg = () => REG || (REG = ctx.loadJSON(ctx.WEBGL.replace(/docklands\/$/, '') + 'registry/buildings.json').then(d => new Map(d.buildings.map(b => [b.id, b]))).catch(() => new Map()));
  function centrePoint() {
    camera.updateMatrixWorld(); const r = new THREE.Raycaster(); r.setFromCamera(new THREE.Vector2(0, 0), camera);
    const o = r.ray.origin, d = r.ray.direction, gB = H.nav.groundB; let s = null;
    for (let k = 0.5; k <= 12000; k += k < 50 ? 0.5 : k < 400 ? 2 : 8) if (o.y + d.y * k <= gB(o.x + d.x * k, o.z + d.z * k)) { s = k; break; }
    const hit = r.intersectObjects([...ctx.meshes.buildings.children, ...ctx.meshes.models.children], true).find(h => ctx.U.cut.value >= 250 || h.point.y <= ctx.U.cut.value);
    if (hit && (s == null || hit.distance < s)) s = hit.distance;
    if (s == null) return null; const p = o.clone().addScaledVector(d, s); return { x: p.x, z: p.z, range: s, building: H.pickAt(innerWidth / 2, innerHeight / 2) };
  }
  async function featuresAt(lon, lat) {
    if (GL() && (onGlobe() && lon == null || lon != null && !adapter.inBox(...adapter.fromLonLat(+lon, +lat), 0))) {   // outside the model: the world's answer
      if (lon == null) { const g = GL().pick(innerWidth / 2, innerHeight / 2); if (!g) return { text: 'Only sky or space at the centre of the view.', sky: true }; lon = g.lon; lat = g.lat; }
      const r = await GL().featuresAt(+lon, +lat); r.text = [r.name, r.region, r.country].filter((v, i, a) => v && a.indexOf(v) === i).join(', ') + (r.nearest[0] ? `; nearest place ${r.nearest[0].name}, ${Math.round(r.nearest[0].dist_m / 1000)} km ${r.nearest[0].direction}` : '') + (r.more && r.more.text ? ' ' + r.more.text : ''); return latinOut(r); }
    await extras; let x, z, bi = -1, range = null;
    if (lon == null || lat == null) { const c = centrePoint(); if (!c) return { text: 'Only sky at the centre of the view.', sky: true }; ({ x, z, range } = c); bi = c.building; }
    else { if (!isFinite(+lon) || !isFinite(+lat)) throw new Error('featuresAt needs lon and lat in WGS84 degrees, or no arguments for the centre of the view'); [x, z] = adapter.fromLonLat(+lon, +lat); }
    const r = featuresCore(I, x, z, { building: bi });
    if (range != null) r.range_m = Math.round(range);
    r.scripts = getScriptPreference();
    const rg = r.building && r.building.registry;
    if (rg) { const b = (await reg()).get(rg.id); if (b) { rg.occupant_names = (b.occupants || []).map(o => o.name).filter(Boolean).slice(0, 30); rg.atlas = new URL(ctx.WEBGL.replace(/docklands\/$/, '') + 'atlas/#map/b/' + rg.id, location.href).href; } }
    return latinOut(r);
  }

  // ---------- the live weather of the place in view (issue #12): only what the wind and weather layers worked out for the
  // site that is in view now (ctx.site(): the model, or the place under the centre of the globe); null when there is no
  // site or the layers have nothing for it yet. Never the model's data for another place.
  function liveWeather() {
    const s = ctx.site ? ctx.site() : null, key = s ? s.key : null; if (!s) return null;
    const W = ctx.stats.weather && ctx.stats.weather.now, Wn = ctx.weather && ctx.weather.now, S = ctx.stats.surface, wi = S && S.wind;
    const okW = !!(W && W.site === key), okWi = !!(wi && wi.site === key);
    if (!okW && !okWi) return null;
    const cur = okWi && S.water && S.current != null ? S.current : null;
    return { place: s.region || null, cloud_pct: okW && W.cover != null ? Math.round(W.cover <= 1 && W.cover > 0 ? W.cover * 100 : W.cover) : null, visibility_m: okW ? W.vis ?? null : null,
      precipitation_mm: okW ? W.precip ?? null : null, temperature_c: okW && Wn && Wn.temp != null ? Math.round(Wn.temp * 10) / 10 : null, source: okW ? W.source || null : null,
      wind: okWi ? { speed_ms: wi.speed, from_deg: wi.dir, gust_ms: wi.gust || null, source: wi.source, station: wi.station || null } : null,
      water_current: cur != null ? { water: S.water, speed_ms: Math.abs(cur), direction: cur > 0.12 ? 'ebb, downstream' : cur < -0.02 ? 'flood, upstream' : 'slack' } : null };
  }
  const weatherText = w => w ? ` Live weather here: ${[w.wind ? `wind ${w.wind.speed_ms} m/s from ${w.wind.from_deg}° (${w.wind.source})` : '', w.cloud_pct != null ? `cloud ${w.cloud_pct} %` : '', w.temperature_c != null ? `${Math.round(w.temperature_c)} °C` : '',
    w.water_current ? `${w.water_current.water} current ${w.water_current.speed_ms.toFixed(2)} m/s (${w.water_current.direction})` : ''].filter(Boolean).join('; ')}.` : '';

  // ---------- what is in view
  // the memory governor's tier, when it is not full detail (governor.js): one sentence
  const qualityText = () => { const q = GOV.quality(); return q.tier ? ` Detail: ${q.text.split(':')[0]}, because ${q.reason || 'memory is short'} (budget ${q.budget_mb} MB; ${q.how_to_override} for full detail).` : ''; };
  async function describeView(o = {}) {
    if (onGlobe()) { const tn = timeNow(), d = await GL().describe({ maxItems: o.maxItems || 8, time: `${tn.local} ${tn.abbreviation === tn.utc_offset ? tn.utc_offset : tn.abbreviation + ', ' + tn.utc_offset} (${tn.time_zone}${tn.approximate ? ', approximate' : ''})` });
      const weather = liveWeather(); if (weather) d.text += weatherText(weather); d.text += qualityText();
      return latinOut({ app: APP.name, ...d, weather, time: tn, api_version: API_VERSION, scripts: getScriptPreference(), quality: GOV.quality(), memory: GOV.state(), share: shareLink() }); }
    await extras;
    const L = H.layers;
    const live = { aircraft: L.planes && L.planes.on ? L.planes.api.flights : null, ships: L.ships && L.ships.on ? L.ships.api.vessels : null };
    const weather = liveWeather();
    const occ = H.occ && H.occ();
    const dsc = describeCore(I, camOf(), { time: H.clock, timeZone: Z.tz, zoneInfo: Z.describe(H.clock), sun: sunNow(), weather, live, share: shareLink(), view: H.viewName || null, maxItems: o.maxItems || 8, maxDistance: o.maxDistance,
      occluded: occ ? (k, x, y, z) => occ.test(k, x, y, z) : null });
    // the wider place (a skeleton set's district, county, country) at the target, when the globe has one
    if (GL() && dsc.target) { try { const m = await GL().whereMore(dsc.target.lon, dsc.target.lat); if (m && (m.district || m.country)) { dsc.context = m;
      dsc.text += ` Area: ${[...new Set([m.district, m.county, m.region, m.country].filter(Boolean))].join(', ')} (${m.source}).`; } } catch (e) { console.warn('api: context', e); } }
    dsc.scripts = getScriptPreference(); dsc.app = APP.name; dsc.quality = GOV.quality(); dsc.memory = GOV.state(); dsc.text += qualityText(); if (autopilot) { dsc.autopilot = getAutopilot(); dsc.text += ' ' + dsc.autopilot.text; }
    return latinOut(dsc);
  }
  async function findPlaces(q, limit = 10) {
    await extras; const out = findCore(I, q, limit).map(({ name, kind, lon, lat, id }) => ({ name, kind, lon, lat, id }));
    if (GL() && out.length < limit) { await GL().gazetteer(); for (const w of await GL().searchAll(q, limit - out.length)) out.push({ name: w.name, kind: w.kind, lon: w.lon, lat: w.lat, id: w.id, country: w.country || undefined, region: w.region || undefined, local_name: w.local_name }); }
    return latinOut(out).slice(0, limit); }

  // ---------- the tools (one list: window.docklands.tools, WebMCP, and the MCP server's page_call)
  const P = (type, description, extra = {}) => ({ type, description, ...extra });
  const SWEEP = { view: P('string', 'A named model view', { enum: Object.keys(H.VIEWS) }), place: P('string', 'A place in the detailed model'), lon: P('number', 'Longitude, WGS84 degrees'), lat: P('number', 'Latitude, WGS84 degrees'), heading_deg: P('number', 'True heading, degrees'), pitch_deg: P('number', 'Look-down angle, -85 (look up) to 89.5 degrees'), range_m: P('number', 'Distance from eye to target, metres'), duration_s: P('number', 'Flight duration, 0.25 to 120 seconds (polyline/city up to600); city defaults to about8 m/s, other flights12 seconds'), steps: P('integer', 'Inspection sample intervals, 2 to100 (default10), not road segments or animation frames'), lift_m: P('number', 'Extra eye height in the middle of the course, 0 to 2000 metres (default 150; interior/underground default 0)'),
    trajectory: P('string', 'Curved eye trajectory, exact eased polyline segments, or legacy orbit interpolation', { enum: ['curved', 'polyline', 'orbit'] }),
    bend_m: P('number', 'Signed sideways curve offset, -2000 to 2000 metres; not building avoidance'),
    routing_policy: P('string', 'City follows low roads with checked static building-prism clearance, explicit road destination resolution and the base perspective camera only. Pixel, XR, drone/follow, auto-rotation and damping are unsupported. Other policies are unchecked intent.', { enum: ['unconstrained', 'interior', 'underground', 'city'] }),
    city_height_m: P('number', 'City eye height above modeled roads, 3 to40 metres (default8)'),
    city_clearance_m: P('number', 'Static building-prism clearance radius, 0 to20 metres (default2); not all scene geometry'),
    city_look_ahead_m: P('number', 'Default city gaze look-ahead, 20 to200 metres (default80)'),
    city_look_up_deg: P('number', 'Default city upward gaze angle, 5 to65 degrees (default30)'),
    focus_destination: P('boolean', 'Reach the destination gaze target early and hold it while moving (default true for curved flights without look_at)'),
    eye_via: P('array', 'Up to 16 WGS84 eye waypoints; lift_m/bend_m must be zero. Cubic curves can overshoot; inspect the preview.', { maxItems: 16, items: { type: 'object', required: ['lon', 'lat', 'height_m'], properties: { lon: { type: 'number' }, lat: { type: 'number' }, height_m: { type: 'number', description: 'Absolute height in the model height datum, metres' } } } }),
    look_at: P('array', 'Ordered gaze fixations strictly inside the flight; smooth transitions and optional holds independent of eye motion', { maxItems: 16, items: { type: 'object', required: ['lon', 'lat', 'height_m', 'at_s'], properties: { lon: { type: 'number' }, lat: { type: 'number' }, height_m: { type: 'number' }, at_s: { type: 'number' }, hold_s: { type: 'number' } } } }),
    composition_subject: P('object', 'Optional separate subject to inspect framing at sampled waypoints; no visibility or aesthetic guarantee', { required: ['lon', 'lat', 'height_m'], properties: { lon: { type: 'number' }, lat: { type: 'number' }, height_m: { type: 'number' } } }) };
  const AP_POINT = { type: 'object', properties: { place: P('string', 'Model place name, or use longitude and latitude'), name: P('string', 'Waypoint label'), lon: P('number', 'WGS84 longitude'), lat: P('number', 'WGS84 latitude'), height_m: P('number', 'Absolute model datum height; default 40m above ground') } };
  const AP_CONFIG = { type: 'object', additionalProperties: false, properties: Object.fromEntries(['speed_m_s','max_acceleration_m_s2','max_jerk_m_s3','mass_kg','drag_per_s','arrival_radius_m','gaze_turn_deg_s','gaze_distance_m'].map(k => [k, P('number', k.replaceAll('_', ' '))]).concat([['wind_acceleration', { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' }, description: 'Optional synthetic model-axis acceleration [x,y,z]; not a weather-derived wind simulation' }]])) };
  const AP_VECTOR = { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' } };
  const TOOLS = [
    { name: 'start_autopilot', description: 'Start a stateful camera-drone journey from the actual current eye. Ordered required flybys and independent waypoint gaze; browser advances bounded inertial motion each frame. Unconstrained detailed-model motion only: no obstacle clearance or automatic landmark/sky selection. Reduced motion starts paused.', readOnly: false, inputSchema: { type: 'object', properties: { destination: AP_POINT, via: { type: 'array', maxItems: 32, items: { ...AP_POINT, properties: { ...AP_POINT.properties, gaze: AP_POINT } } }, config: AP_CONFIG, routing_policy: { type: 'string', enum: ['unconstrained'] } }, required: ['destination'] }, run: startAutopilot },
    { name: 'nudge_autopilot', description: 'Add a bounded acceleration nudge, at most 5 seconds. Body axes are [right,up,forward]; world axes are model metres [x,y,z]. It expires automatically. Journey tracking remains active.', readOnly: false, inputSchema: { type: 'object', properties: { acceleration: AP_VECTOR, duration_s: P('number', 'Nudge lifetime in simulation seconds, at most5'), frame: { type: 'string', enum: ['world','body'] } }, required: ['acceleration'] }, run: nudgeAutopilot },
    { name: 'gaze_autopilot', description: 'Turn gaze toward a model place or WGS84 point independently of travel. Hold briefly then return to automatic waypoint attention. Pass point:null to release immediately.', readOnly: false, inputSchema: { type: 'object', properties: { point: { anyOf: [AP_POINT, { type: 'null' }] }, hold_s: P('number', 'Seconds of fixation, bounded by the autopilot') }, required: ['point'] }, run: gazeAutopilot },
    { name: 'configure_autopilot', description: 'Update bounded physical motion and gaze limits, or replace destination and ordered via points without resetting velocity. The whole request is validated before mutation. No automatic sightseeing.', readOnly: false, inputSchema: { type: 'object', properties: { config: AP_CONFIG, destination: AP_POINT, via: { type: 'array', maxItems: 32, items: { ...AP_POINT, properties: { ...AP_POINT.properties, gaze: AP_POINT } } } } }, run: configureAutopilot },
    { name: 'get_autopilot', description: 'Read autopilot motion, independent gaze, route, reached waypoints, finite nudges and stop reason without moving the camera.', readOnly: true, inputSchema: { type: 'object', properties: {} }, run: getAutopilot },
    { name: 'control_autopilot', description: 'Pause, resume, brake or stop the camera-drone. Manual pointer/key input and page hiding interrupt it. Resume is explicit.', readOnly: false, inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['pause','resume','brake','stop'] } }, required: ['action'] }, run: controlAutopilot },
    { name: 'start_pose_sweep', description: 'Smoothly interpolate from the current camera to an explicit eye and gaze target. Omit eye to rotate in place. Heights are absolute model datum metres. Does not check building or subject visibility.', readOnly: false, inputSchema: { type: 'object', properties: { eye: AP_POINT, target: AP_POINT, eye_via: { type: 'array', maxItems: 16, items: AP_POINT, description: 'Ordered eye waypoints in model bounds' }, look_at: { type: 'array', maxItems: 16, items: { ...AP_POINT, properties: { ...AP_POINT.properties, at_s: P('number', 'Time in seconds'), hold_s: P('number', 'Hold duration in seconds') }, required: ['at_s'] }, description: 'Timed independent gaze fixations' }, duration_s: P('number', 'Duration in seconds, 0.25 to 120'), name: P('string', 'Optional destination name') }, required: ['target'] }, run: startPoseSweep },
    { name: 'plan_sweep', description: 'Compute and draw a camera course from the current view to a named view, place or point in the detailed model. Does not move the camera. Returns a plan id, description, timed WGS84 eye/target waypoints and gaze metadata. Eye motion and gaze are independent. Optional subject framing scores are geometric; City policy checks the exact played road polyline against static building prisms and bounds; other policies are unchecked. Visibility is not checked.', readOnly: false, inputSchema: { type: 'object', properties: SWEEP }, run: planSweep },
    { name: 'start_sweep', description: 'Start a continuous cinematic camera flight in this page. Pass a plan_id, or a destination to plan and fly in one call. Returns immediately; the browser animates every frame without further tool calls. get_sweep reads progress; stop_sweep, Escape or manual input stops it. Reduced-motion preferences skip the animation.', readOnly: false, inputSchema: { type: 'object', properties: { ...SWEEP, plan_id: P('string', 'Id returned by plan_sweep; camera must still be at the planned start') } }, run: startSweep },
    { name: 'get_sweep', description: 'Current camera flight status and progress (0 to 1), destination and current view.', readOnly: true, inputSchema: { type: 'object', properties: {} }, run: sweepSummary },
    { name: 'stop_sweep', description: 'Stop the camera flight at its current position and remove its course preview.', readOnly: false, inputSchema: { type: 'object', properties: {} }, run: () => { const r = stopSweep(); clearSweepLine(); return r; } },
    { name: 'go_to', description: 'Move the 3D view to a place (a name such as "Greenland Dock", "One Canada Square", "Tokyo" or "France"), a named view (list_views), or a WGS84 point anywhere on Earth (outside the Docklands model or above 36 km the globe shows it). Returns the new view.', readOnly: false,
      inputSchema: { type: 'object', properties: { place: P('string', 'A place or building name, or a view id'), view: P('string', 'A named view id', { enum: Object.keys(H.VIEWS) }), lon: P('number', 'Longitude, WGS84 degrees'), lat: P('number', 'Latitude, WGS84 degrees'), range_m: P('number', 'Distance from the eye to the point, metres'), alt_m: P('number', 'Eye height above the point, metres (used when range_m is absent); up to 40,000 km on the globe'), heading_deg: P('number', 'View direction, degrees clockwise from true north'), pitch_deg: P('number', 'Look-down angle, degrees (2 to 89.5)') } },
      run: a => a.view ? goTo({ view: a.view }) : a.place ? goTo(a.place, a) : goTo(a) },
    { name: 'get_view', description: 'The current view: eye and target (lon, lat, height in metres), true heading, pitch, field of view, range, page time and time zone, sun, and the share link.', readOnly: true, inputSchema: { type: 'object', properties: {} }, run: () => getView() },
    { name: 'describe_view', description: 'Describe what is in view: a short paragraph (text) and structured lists of the tallest buildings, named places, water and parks with distance and direction, the time of day, sun, weather, aircraft and ships in view, and the share link. On the globe: the country, region, sea and nearest places at the centre, the countries, water and large places in view.', readOnly: true,
      inputSchema: { type: 'object', properties: { maxItems: P('number', 'Places named in the paragraph (default 8)') } }, run: a => describeView(a) },
    { name: 'features_at', description: 'What is at a WGS84 point (or at the centre of the view when lon and lat are absent): the building (name, OpenStreetMap id, height, registry record and occupants where known), water, park, ground height and the nearest named places.', readOnly: true,
      inputSchema: { type: 'object', properties: { lon: P('number', 'Longitude, WGS84 degrees'), lat: P('number', 'Latitude, WGS84 degrees') } }, run: a => featuresAt(a.lon, a.lat) },
    { name: 'set_time', description: 'Set the page clock (sun, sky, night lights, tide, recorded aircraft and ships). ISO 8601 with Z or an offset; a time without an offset is the wall-clock time of the place; "now" for live.', readOnly: false,
      inputSchema: { type: 'object', properties: { time: P('string', 'e.g. 2026-10-11T21:30 or 2026-10-11T20:30Z or now'), time_zone: P('string', 'Read a time without an offset in this zone (IANA name such as Europe/Madrid, or UTC+2); default: the zone of the view') }, required: ['time'] }, run: a => setTime(a.time, a.time_zone) },
    { name: 'get_time_zone', description: 'The page clock now: its time zone (it follows the view: the model\'s region, or on the globe the place or point in view), abbreviation, UTC offset, local wall-clock time, UTC time, where the zone comes from and whether it is approximate.', readOnly: true, inputSchema: { type: 'object', properties: {} }, run: () => getTimeZone() },
    { name: 'set_time_zone', description: 'Fix the time zone in which the page shows and reads the clock (the time wheels, the clock label, times without an offset); "auto" lets it follow the view again. The instant (UTC) does not change.', readOnly: false,
      inputSchema: { type: 'object', properties: { time_zone: P('string', 'An IANA name such as Europe/Madrid or America/New_York, UTC, UTC+2, or auto') }, required: ['time_zone'] }, run: a => setTimeZone(a.time_zone) },
    { name: 'list_layers', description: 'The layers and display settings with their ids and on/off state.', readOnly: true, inputSchema: { type: 'object', properties: {} }, run: () => listLayers() },
    { name: 'set_layer', description: 'Turn a layer or display setting on or off (ids from list_layers).', readOnly: false,
      inputSchema: { type: 'object', properties: { id: P('string', 'Layer id'), on: P('boolean', 'true for on') }, required: ['id', 'on'] }, run: a => setLayer(a.id, a.on) },
    { name: 'find_places', description: 'Search the named places, water and buildings of the model, then the world (countries, regions, seas, lakes, rivers, cities) by name; returns names, kinds and WGS84 positions.', readOnly: true,
      inputSchema: { type: 'object', properties: { query: P('string', 'Two or more letters'), limit: P('number', 'At most this many (default 10)') }, required: ['query'] }, run: a => findPlaces(a.query, a.limit || 10) },
    { name: 'list_views', description: 'The named views (Canary Wharf, Greenwich, the photo views ...) with their ids for go_to.', readOnly: true, inputSchema: { type: 'object', properties: {} }, run: () => listViews() },
    { name: 'get_script_preference', description: 'Which scripts names are shown in: "latin" (the default: names in Latin script only; a name in another script, such as Cyrillic, shows only where the data also has it in Latin script, else no name is shown; no transliteration) or "all".', readOnly: true, inputSchema: { type: 'object', properties: {} }, run: () => ({ scripts: getScriptPreference() }) },
    { name: 'set_script_preference', description: 'Show names in Latin script only ("latin", the default) or in every script ("all"). Applies to every label, card, search result and description at once, and is kept in this browser (Menu > Look > Names in Latin script only).', readOnly: false,
      inputSchema: { type: 'object', properties: { scripts: P('string', 'latin or all', { enum: ['latin', 'all'] }) }, required: ['scripts'] }, run: a => ({ scripts: setScriptPreference(a.scripts) }) },
    { name: 'share_link', description: 'A link that opens this page at the current view, time and selected building.', readOnly: true, inputSchema: { type: 'object', properties: {} }, run: () => ({ url: shareLink() }) },
  ];
  async function callTool(name, args) { const t = TOOLS.find(x => x.name === name); if (!t) throw new Error('unknown tool ' + name); return latinOut(await t.run(args || {})); }

  // ---------- WebMCP (W3C Web Machine Learning CG explainer, https://github.com/webmachinelearning/webmcp): the explainer of
  // October 2026 has document.modelContext.registerTool(tool, { signal }); earlier drafts and the MCP-B polyfill have
  // navigator.modelContext with registerTool or provideContext({ tools }). Feature-detected; nothing happens without it.
  const webmcp = { api: null, registered: [], errors: [] };
  function registerWebMCP() {
    const mc = (typeof document !== 'undefined' && document.modelContext) || navigator.modelContext; if (!mc) return;
    webmcp.api = document.modelContext ? 'document.modelContext' : 'navigator.modelContext';
    const tools = TOOLS.map(t => ({ name: t.name, description: t.description + ' (moglob page API ' + API_VERSION + ')', inputSchema: t.inputSchema, annotations: { readOnlyHint: t.readOnly, title: t.name.replace(/_/g, ' ') },
      execute: async input => { try { const r = latinOut(await t.run(input || {})); return { content: [{ type: 'text', text: JSON.stringify(r) }], structuredContent: Array.isArray(r) ? { items: r } : r }; } catch (e) { return { content: [{ type: 'text', text: 'Error: ' + (e && e.message || e) }], isError: true }; } } }));
    webmcp.controller = typeof AbortController === 'function' ? new AbortController() : null;
    try {
      if (typeof mc.registerTool === 'function') for (const t of tools) { try { const r = mc.registerTool(t, webmcp.controller ? { signal: webmcp.controller.signal } : undefined); if (r && typeof r.catch === 'function') r.catch(e => webmcp.errors.push(t.name + ': ' + e)); webmcp.registered.push(t.name); } catch (e) { webmcp.errors.push(t.name + ': ' + e); } }
      else if (typeof mc.provideContext === 'function') { mc.provideContext({ tools }); webmcp.registered = tools.map(t => t.name); }
    } catch (e) { webmcp.errors.push(String(e)); }
  }
  registerWebMCP();

  // ---------- the spoken view: a polite live region, spoken when the view or clock has settled (1.5 s), when the switch is on
  const css = document.createElement('style');
  css.textContent = `.srOnly{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important}
#view canvas:focus-visible{outline:3px solid var(--acc);outline-offset:-3px}`;
  document.head.appendChild(css);
  const live = document.createElement('div'); live.id = 'a11yLive'; live.className = 'srOnly'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true'); document.body.appendChild(live);
  const spoken = []; let sayTimer = 0;
  function speak(text) { text = scrubText(text); clearTimeout(sayTimer); live.textContent = ''; sayTimer = setTimeout(() => { live.textContent = text; spoken.push({ t: Date.now(), text }); if (spoken.length > 20) spoken.shift(); }, 60); }
  let describeOn = qs.has('describe') ? !/^(0|false|off|no)$/i.test(qs.get('describe')) : store.get('d3.describe') === '1';
  const SETTLE_MS = 1500; let sig = '', stableAt = 0, lastSaid = '';
  async function sayView(force) { try { const d = await describeView({ maxItems: 4 }); if (force || d.text !== lastSaid) { lastSaid = d.text; speak(d.text); } dispatchEvent(new CustomEvent('docklands-view-described', { detail: d })); } catch (e) { console.warn('api: describe', e); } }
  setInterval(() => {
    const c = H.camState(), k = [c.tx, c.tz, c.ty, c.dist, c.yaw * 100, c.pitch * 100].map(v => Math.round(v)).join() + '|' + Math.floor(H.clock / 60000);
    if (k !== sig) { sig = k; stableAt = performance.now(); return; }
    if (stableAt && performance.now() - stableAt > SETTLE_MS) { stableAt = 0; dispatchEvent(new CustomEvent('docklands-view-settled')); if (describeOn) sayView(false); }
  }, 250);

  // ---------- Menu > Views > Access: the switch, Describe now, Text view; the map canvas as a keyboard target
  const pane = $('paneViews'), anchor = $('shareMore');
  if (pane) {
    const box = document.createElement('div'); box.id = 'accessBox';
    box.innerHTML = `<h3 id="accessH">Access</h3><label class="row"><input type="checkbox" id="describeChk"> Describe the view (screen reader)</label>
<div class="btnrow"><button type="button" id="sayBtn">Describe now</button><button type="button" id="textBtn">Text view</button></div>
<p class="small">Keys: Tab to the map, then the arrow keys move, + and − zoom, V describes the view, T opens the text view, Escape closes the menu. Scripts and agents: <code>window.docklands</code> (page API ${API_VERSION}), WebMCP tools where the browser has them, and <a href="../llms.txt">llms.txt</a>.</p>`;
    if (anchor && anchor.parentNode === pane) anchor.after(box); else pane.prepend(box);
    const flight = document.createElement('div');
    flight.innerHTML = `<h3>Cinematic flight</h3><label for="sweepView">Destination</label><select id="sweepView">${listViews().map(v => `<option value="${v.id}">${v.label}</option>`).join('')}</select><label for="sweepTrajectory">Camera course</label><select id="sweepTrajectory"><option value="curved">Curved eye path, track destination</option><option value="orbit">Original orbit blend</option><option value="city">City roads, checked building clearance</option></select><div id="sweepCityDestination" hidden><label for="sweepPlace">City destination: place or latitude, longitude (optional)</label><input id="sweepPlace" type="text" placeholder="Place name or latitude, longitude"><p class="small">Start low near a clear road. The destination is resolved to a nearby low road and reported in the preview.</p></div><div class="btnrow"><button type="button" id="sweepPlan">Show course</button><button type="button" id="sweepStart">Fly there</button><button type="button" id="sweepStop">Stop flight</button></div><p id="sweepStatus" role="status" class="small">Choose a view. Curved flights track the destination while moving. Inspect the course: buildings are not avoided. Escape stops a flight.</p>`;
    box.appendChild(flight);
    $('sweepView').value = 'rotherhithe';
    $('sweepTrajectory').onchange = () => { $('sweepCityDestination').hidden = $('sweepTrajectory').value !== 'city'; };
    const flightAction = fn => {
      const city = $('sweepTrajectory').value === 'city', input = $('sweepPlace').value.trim(), pair = input.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
      const destination = city && input ? pair ? { lat: +pair[1], lon: +pair[2] } : { place: input } : { view: $('sweepView').value };
      return fn({ ...destination, ...(city ? { routing_policy: 'city' } : { trajectory: $('sweepTrajectory').value }) }).catch(e => sweepNotice(e.message));
    };
    $('sweepPlan').onclick = () => flightAction(planSweep);
    $('sweepStart').onclick = () => flightAction(startSweep);
    $('sweepStop').onclick = () => { stopSweep(); clearSweepLine(); };
    const chk = $('describeChk'); chk.checked = describeOn;
    chk.onchange = () => { describeOn = chk.checked; store.set('d3.describe', describeOn ? '1' : '0'); if (describeOn) sayView(true); else speak('View descriptions off.'); };
    $('sayBtn').onclick = () => sayView(true);
    $('textBtn').onclick = () => openText();
  }
  const cv = H.renderer.domElement;
  cv.tabIndex = 0; cv.setAttribute('role', 'application'); cv.setAttribute('aria-roledescription', '3D map');
  cv.setAttribute('aria-label', 'moglob 3D view. Arrow keys move, plus and minus zoom, V describes the view, T opens the text view. Menu: the button after this map.');
  const openText = () => import('./textview.js').then(m => m.openTextView()).catch(e => console.warn('textview', e));
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof Element && e.target.closest('input,select,textarea,[contenteditable],#textView'))) return;
    if (e.key === 'v' || e.key === 'V') { e.preventDefault(); sayView(true); }
    else if (e.key === 't' || e.key === 'T') { e.preventDefault(); openText(); }
  });
  // a record card that opens (a tap, a search, goTo a building) is spoken when the switch is on
  const card = $('card');
  if (card) { card.setAttribute('role', 'region'); card.setAttribute('aria-label', 'Record'); $('cardX')?.setAttribute('aria-label', 'Close the record');
    let lastCard = '';
    new MutationObserver(() => { if (card.hidden) { lastCard = ''; return; } if (!describeOn) return; const h = card.querySelector('h2'), t = 'Record: ' + card.querySelector('#cardBody').innerText.replace(/\s+/g, ' ').slice(0, 400); if (h && !/Loading/.test(card.textContent) && t !== lastCard) { lastCard = t; speak(t); } })
      .observe(card, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true }); }

  // ---------- the API object
  const api = {
    version: API_VERSION, describeVersion: DESCRIBE_VERSION, locale: { adapter: adapter.id, timeZone: adapter.timeZone, heightDatum: adapter.heightDatum, bbox: adapter.bbox },
    startAutopilot, nudgeAutopilot, gazeAutopilot, configureAutopilot, getAutopilot, controlAutopilot,
    startPoseSweep, planSweep, startSweep, getSweep: sweepSummary, stopSweep, goTo, getView, setTime, getTimeZone, setTimeZone, get timeZone() { return Z.tz; }, getScriptPreference, setScriptPreference, listLayers, setLayer, featuresAt, describeView, findPlaces, listViews, shareLink,
    tools: TOOLS.map(({ name, description, inputSchema, readOnly }) => ({ name, description, inputSchema, readOnly })), callTool,
    webmcp, speak, get describing() { return describeOn; }, set describing(v) { const c = $('describeChk'); if (c) { c.checked = !!v; c.onchange(); } else describeOn = !!v; },
    spoken, openTextView: openText, ready: extras.then(() => true),
    // frame times (perf.js, all styles; OKR KR3.1): median and 95th percentile over the last 2 s, frames a second, the style
    // and its tier (Painted: full, lite or low, auto or fixed, moving or still, the auto tier's last steps), and a sentence
    perf() { const P = H.perf; if (!P) return null; const s = P.stats(), St = globalThis.__docklandsStyles;
      if (St && St.mode === 'paint') s.paint = { tier: St.paintTier, mode: St.paintMode, moving: St.paintMoving, steps: St.paint.log.slice(-5) };
      return s; },
    // the memory governor (governor.js): budget, use (JS heap, GPU, canvas), tier, pools, crash recovery
    memory: () => GOV.state(), app: APP.name,
    help: 'moglob (Docklands 3D) page API: https://github.com/danbri/londat/blob/main/docklands/README.md#page-api',
  };
  globalThis.docklands = api;
  api.frame = bridgeToParent({ tools: api.tools, callTool, version: API_VERSION });   // null when the page is not in a frame
  dispatchEvent(new CustomEvent('docklands-api-ready', { detail: { version: API_VERSION } }));

  // ---------- locale-free deep links: ?ll=lat,lon[,range_m] and ?place=<name> (after the share hash and ?view= of main.js)
  const ll = (qs.get('ll') || '').split(',').map(Number);
  // ?ll=lat,lon[,alt]: alt is the eye's height above the point in metres (the globe above 36 km or outside the model);
  // &ht=heading,tilt (degrees; tilt from straight down) on the globe
  const ht = (qs.get('ht') || '').split(',').map(Number);
  // (then the start zone is known: ?t= without an offset is read again in it when it differs, main.js refineZone)
  const refine = () => H.refineZone?.().catch(e => console.warn('api: zone', e));
  if (ll.length >= 2 && ll.slice(0, 2).every(isFinite)) goTo({ lat: ll[0], lon: ll[1], alt_m: ll[2] || undefined, heading_deg: isFinite(ht[0]) ? ht[0] : undefined, tilt_deg: isFinite(ht[1]) && ht.length > 1 ? ht[1] : undefined }).then(refine).catch(e => console.warn('api: ?ll=', e.message));
  else if (qs.get('place')) goTo(qs.get('place')).then(refine).catch(e => console.warn('api: ?place=', e.message));
  return api;
}
