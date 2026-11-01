// Camera courses in model metres. No page, renderer or locale dependencies.
const mix = (a, b, t) => a + (b - a) * t;
export const eyeOf = c => [c.tx + c.dist * Math.sin(c.yaw) * Math.cos(c.pitch), (c.ty || 0) + c.dist * Math.sin(c.pitch), c.tz + c.dist * Math.cos(c.yaw) * Math.cos(c.pitch)];
const angle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
export function makeSweep(start, end, { duration_s = 12, steps = 10, lift_m = 150, aspect = 1 } = {}) {
  if (!Number.isFinite(duration_s) || duration_s < .25 || duration_s > 120) throw new Error('duration_s must be 0.25 to 120 seconds');
  if (!Number.isInteger(steps) || steps < 2 || steps > 100) throw new Error('steps must be an integer from 2 to 100');
  if (!Number.isFinite(lift_m) || lift_m < 0 || lift_m > 2000) throw new Error('lift_m must be 0 to 2000 metres');
  for (const c of [start, end]) for (const k of ['tx', 'ty', 'tz', 'dist', 'yaw', 'pitch']) if (!Number.isFinite(c[k]) || c.dist <= 0) throw new Error('A finite camera state with a positive range is required');
  const lens = c => ({ hfov: c.hfov ?? c.lens?.hfov ?? null, fov: c.fov ?? c.lens?.fov ?? null, roll: c.roll ?? c.lens?.roll ?? 0 });
  const a = lens(start), b = lens(end);
  const vf = l => l.hfov ? 2 * Math.atan(Math.tan(l.hfov / 2) / aspect) : l.fov || 45.8 * Math.PI / 180;
  const sample = progress => {
    const u = Math.max(0, Math.min(1, progress));
    if (u === 0) return { ...start, ...a };
    if (u === 1) return { ...end, ...b };
    const t = u * u * (3 - 2 * u), c = {};
    for (const k of ['tx', 'ty', 'tz', 'pitch']) c[k] = mix(start[k], end[k], t);
    c.ty += lift_m * Math.sin(Math.PI * t) ** 2;
    c.yaw = angle(start.yaw, end.yaw, t);
    c.dist = Math.exp(mix(Math.log(start.dist), Math.log(end.dist), t));
    // Keep the actual vertical field when switching between horizontal and vertical lenses.
    c.hfov = null; c.fov = mix(vf(a), vf(b), t);
    c.roll = mix(a.roll, b.roll, t);
    return c;
  };
  return { duration_s, steps, lift_m, sample, waypoints: Array.from({ length: steps + 1 }, (_, i) => ({ time_s: duration_s * i / steps, camera: sample(i / steps) })) };
}
