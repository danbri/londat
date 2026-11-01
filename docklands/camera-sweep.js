import { sampleCityRoute } from './city-route.js';
// Camera courses in model metres. No page, renderer or locale dependencies.
const mix = (a, b, t) => a + (b - a) * t;
const clamp = t => Math.max(0, Math.min(1, t));
const ease = t => t * t * t * (t * (t * 6 - 15) + 10);
const point = p => Array.isArray(p) && p.length === 3 && p.every(v => Number.isFinite(v) && Math.abs(v) <= 1e7);
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const lerp = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
export const eyeOf = (c, verticalScale = 1) => [c.tx + c.dist * Math.sin(c.yaw) * Math.cos(c.pitch), (c.ty || 0) + c.dist * Math.sin(c.pitch) / ((c.hfov ?? c.lens?.hfov) ? 1 : verticalScale), c.tz + c.dist * Math.cos(c.yaw) * Math.cos(c.pitch)];
export const targetOf = (c, verticalScale = 1) => [c.tx, c.ty + ((c.hfov ?? c.lens?.hfov) ? c.dist * Math.sin(c.pitch) * (1 - 1 / verticalScale) : 0), c.tz];
const angle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

// Piecewise cubic Hermite eye path. Reparameterization measures the path including its lift.
function eyeCurve(points, lift, bend) {
  const first = points[0], last = points.at(-1), dx = last[0] - first[0], dz = last[2] - first[2], span = Math.hypot(dx, dz);
  const raw = u => {
    const f = u * (points.length - 1), i = Math.min(points.length - 2, Math.floor(f)), t = f - i;
    const a = points[i], b = points[i + 1], before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 2)];
    const t2 = t * t, t3 = t2 * t;
    const p = a.map((v, k) => (2 * t3 - 3 * t2 + 1) * v + (t3 - 2 * t2 + t) * (b[k] - before[k]) / 2 + (-2 * t3 + 3 * t2) * b[k] + (t3 - t2) * (after[k] - v) / 2);
    const bulge = Math.sin(Math.PI * u) ** 2;
    p[1] += lift * bulge;
    if (span > 0) { p[0] += bend * dz / span * bulge; p[2] -= bend * dx / span * bulge; }
    return p;
  };
  const n = Math.max(512, points.length * 64), lengths = [0]; let previous = raw(0);
  for (let i = 1; i <= n; i++) { const p = raw(i / n); lengths.push(lengths.at(-1) + distance(previous, p)); previous = p; }
  const length_m = lengths.at(-1);
  return { length_m, sample: progress => {
    const d = clamp(progress) * length_m;
    if (!length_m) return first.slice();
    let lo = 0, hi = n;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (lengths[m] < d) lo = m; else hi = m; }
    const share = lengths[hi] === lengths[lo] ? 0 : (d - lengths[lo]) / (lengths[hi] - lengths[lo]);
    return raw((lo + share) / n);
  } };
}
// Exact straight segments, with zero velocity and acceleration at every corner.
function eyePolyline(points) {
  const cumulative_m = [0];
  for (let i = 1; i < points.length; i++) cumulative_m.push(cumulative_m.at(-1) + distance(points[i - 1], points[i]));
  const route = { ok: true, points, cumulative_m };
  return { length_m: cumulative_m.at(-1), sample: u => sampleCityRoute(route, u) };
}
export function makeSweep(start, end, { duration_s = 12, steps = 10, lift_m = 150, aspect = 1, trajectory = 'orbit', eye_via = [], look_at = [], bend_m = 0, verticalScale = 1, gaze_path = null } = {}) {
  if (!Number.isFinite(duration_s) || duration_s < .25 || duration_s > (trajectory === 'polyline' ? 600 : 120)) throw new Error('duration_s must be 0.25 to 120 seconds (600 for polyline routes)');
  if (!Number.isInteger(steps) || steps < 2 || steps > 100) throw new Error('steps must be an integer from 2 to 100');
  if (!Number.isFinite(lift_m) || lift_m < 0 || lift_m > 2000) throw new Error('lift_m must be 0 to 2000 metres');
  if (!Number.isFinite(bend_m) || Math.abs(bend_m) > 2000) throw new Error('bend_m must be -2000 to 2000 metres');
  if (!Number.isFinite(verticalScale) || verticalScale <= 0) throw new Error('verticalScale must be positive');
  if (!Number.isFinite(aspect) || aspect <= 0) throw new Error('aspect must be positive');
  if (!['orbit', 'curved', 'polyline'].includes(trajectory)) throw new Error('trajectory must be orbit, curved or polyline');
  if (!Array.isArray(eye_via) || eye_via.length > (trajectory === 'polyline' ? 1022 : 16) || !eye_via.every(point)) throw new Error('eye_via exceeds the trajectory budget or contains non-finite model points');
  if ((eye_via.length || trajectory === 'polyline') && (lift_m || bend_m)) throw new Error('Explicit eye waypoints require lift_m and bend_m zero; set their heights directly');
  if (gaze_path != null && (typeof gaze_path !== 'function' || trajectory !== 'polyline')) throw new Error('A moving gaze path requires a polyline trajectory');
  if (!Array.isArray(look_at) || look_at.length > 16) throw new Error('look_at must contain at most 16 timed fixations');
  if (gaze_path && look_at.length) throw new Error('Choose moving attention or timed gaze fixations, not both');
  if (trajectory === 'orbit' && (eye_via.length || look_at.length || bend_m)) throw new Error('Independent eye paths and gaze targets require a curved or polyline trajectory');
  for (const c of [start, end]) for (const k of ['tx', 'ty', 'tz', 'dist', 'yaw', 'pitch']) if (!Number.isFinite(c[k]) || c.dist <= 0) throw new Error('A finite camera state with a positive range is required');
  for (const c of [start, end]) if (!point(eyeOf(c, verticalScale)) || !point(targetOf(c, verticalScale))) throw new Error('Camera endpoints exceed the supported finite model domain');
  const lens = c => ({ hfov: c.hfov ?? c.lens?.hfov ?? null, fov: c.fov ?? c.lens?.fov ?? null, roll: c.roll ?? c.lens?.roll ?? 0 });
  const a = lens(start), b = lens(end);
  const vf = l => l.hfov ? 2 * Math.atan(Math.tan(l.hfov / 2) / aspect) : l.fov || 45.8 * Math.PI / 180;
  const gaze = [{ time_s: 0, point: targetOf(start, verticalScale) }];
  for (const fix of look_at) {
    if (!fix || !point(fix.point) || !Number.isFinite(fix.at_s) || !Number.isFinite(fix.hold_s ?? 0) || fix.hold_s < 0 || fix.at_s <= gaze.at(-1).time_s || fix.at_s + (fix.hold_s || 0) >= duration_s) throw new Error('Fixations need finite points, increasing non-overlapping at_s/hold_s strictly inside the flight');
    gaze.push({ time_s: fix.at_s, point: fix.point.slice() });
    if (fix.hold_s) gaze.push({ time_s: fix.at_s + fix.hold_s, point: fix.point.slice() });
  }
  gaze.push({ time_s: duration_s, point: targetOf(end, verticalScale) });
  const points = [eyeOf(start, verticalScale), ...eye_via.map(p => p.slice()), eyeOf(end, verticalScale)];
  const curve = trajectory === 'curved' ? eyeCurve(points, lift_m, bend_m) : trajectory === 'polyline' ? eyePolyline(points) : null;
  const sample = progress => {
    if (!Number.isFinite(progress)) throw new Error('progress must be finite');
    const u = clamp(progress);
    if (u === 0) return { ...start, ...a };
    if (u === 1) return { ...end, ...b };
    const t = ease(u); let c;
    if (curve) {
      const eye = curve.sample(trajectory === 'polyline' ? u : t), seconds = u * duration_s;
      if (!point(eye)) throw new Error('The eye path exceeded the supported finite model domain');
      const j = gaze.findIndex((v, i) => i > 0 && v.time_s >= seconds), left = gaze[j - 1], right = gaze[j];
      const target = gaze_path ? gaze_path(u) : lerp(left.point, right.point, ease((seconds - left.time_s) / (right.time_s - left.time_s)));
      if (!point(target)) throw new Error('The moving gaze path must return a finite model point');
      const dx = eye[0] - target[0], dy = (eye[1] - target[1]) * verticalScale, dz = eye[2] - target[2], dist = Math.hypot(dx, dy, dz);
      if (!Number.isFinite(dist) || !Number.isFinite(dy)) throw new Error('The camera calculation overflowed');
      if (dist < 10) throw new Error('The eye path comes within 10 metres of its gaze target; change the path or fixation');
      const pitch = Math.atan2(dy, Math.hypot(dx, dz));
      if (pitch < -Math.PI / 2 + .05) throw new Error('The gaze exceeds the camera look-up limit; move the fixation away from directly overhead');
      c = { tx: target[0], ty: target[1], tz: target[2], dist, yaw: Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dx, dz) : start.yaw, pitch };
    } else {
      c = {};
      for (const k of ['tx', 'ty', 'tz', 'pitch']) c[k] = mix(start[k], end[k], t);
      c.ty += lift_m * Math.sin(Math.PI * t) ** 2;
      c.yaw = angle(start.yaw, end.yaw, t);
      c.dist = Math.exp(mix(Math.log(start.dist), Math.log(end.dist), t));
    }
    c.hfov = null; c.fov = mix(vf(a), vf(b), t); c.roll = mix(a.roll, b.roll, t);
    if (!['tx', 'ty', 'tz', 'dist', 'yaw', 'pitch', 'fov', 'roll'].every(k => Number.isFinite(c[k]))) throw new Error('The sampled camera must remain finite');
    return c;
  };
  // Detect invalid focus/path combinations before playback, not midway through a flight.
  if (curve) for (let i = 1; i < 1000; i++) sample(i / 1000);
  return { duration_s, steps, lift_m, bend_m, trajectory, length_m: curve?.length_m ?? null, verticalScale, gaze: gaze_path ? Array.from({ length: steps + 1 }, (_, i) => ({ time_s: duration_s * i / steps, point: i === 0 ? targetOf(start, verticalScale) : i === steps ? targetOf(end, verticalScale) : gaze_path(i / steps) })) : gaze.map(g => ({ ...g, point: g.point.slice() })), sample, waypoints: Array.from({ length: steps + 1 }, (_, i) => ({ time_s: duration_s * i / steps, camera: sample(i / steps) })) };
}
