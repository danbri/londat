// Layer "wind" of the Three.js port (docklands/): what moves the water surface (materials.js waterMaterial).
// - Wind: writes WU.windSpeed (m/s at 10 m) and WU.windDir (degrees FROM, meteorological; the data's true north is used as
//   grid north, 1.5 degrees out) for the page clock, from the first source that covers it:
//     ?wind=speed,dir (tests); data/sky/weather-2026-10-03.json (Open-Meteo best match, hourly, 3 and 4 October 2026, CC BY
//     4.0; the WebGL page's photo-time file); the londat hourly cache (cache/latest.json theme weather, Open-Meteo, the
//     latest hour only, when the clock is within 90 minutes of it; with gusts); ?wind=meteo asks the Open-Meteo API for the
//     clock's day (the browser asks api.open-meteo.com; on by default since 2026-10-09, ?weather=0 switches it off); else a stated
//     default, 4 m/s from 240 degrees (the prevailing south-west wind). The source is in a small note on screen.
//   SU.gust (cat's-paw contrast) = gust / speed - 1 (0.15 to 1; 0.5 when the source has no gusts). On a new direction the
//   fetch texture is remade (water.js setFetch, about 10 to 30 ms).
// - Current: SU.current (m/s along the flow field, + downstream) = -0.75 x WU.tideRate (m an hour, + rising, from the tide
//   layer; a stated factor: about 1.5 m/s at a spring rate of 2 m an hour) + 0.08 m/s river flow, -1.8 to 1.8;
//   ?current=m/s overrides. The flow field comes from data/river.json (water.js setRiver).
// - Floating debris (docklands/debris.js), Menu box "Floating debris (Thames)", ?debris=0.
// - ?wakes=test: three synthetic boats for the wake shader (a Thames Clipper 40 m at 12 m/s accelerating 0.6 m/s2 and a
//   small boat 8 m at 6 m/s by Canary Wharf Pier, a tug 25 m at 4 m/s by Greenland Pier), moving along the river, written
//   to setWakes after the ships layer.
// Skill: docklands-3d-page, "Three.js port" (Water surface).
import { WU, SU, setFetch, setRiver, surfaceData, setWakes } from '../water.js';
import { riverLine, makeDebris } from '../debris.js';
import { fromLondon } from '../sky3.js';
import { forecastDay } from '../meteo.js';

const D2R = Math.PI / 180;
const local = /^(127\.|localhost$|\[::1\]$)/.test(location.hostname);
const CACHE = local ? ['../cwplans/cache/latest.json'] : ['https://raw.githubusercontent.com/danbri/londat/main/cwplans/cache/latest.json', '../cwplans/cache/latest.json'];
const FILE = { from: fromLondon('2026-10-03T00:00'), to: fromLondon('2026-10-04T23:00'), url: 'sky/weather-2026-10-03.json' };
const hhmm = t => new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
// hourly rows [t, speed m/s, dir, gust m/s | null] -> the wind at t, by vector between the hours
function interp(rows, t) {
  let k = rows.findIndex(r => r[0] > t); if (k < 1) return null;
  const a = rows[k - 1], b = rows[k], f = (t - a[0]) / (b[0] - a[0]), va = [a[1] * Math.sin(a[2] * D2R), a[1] * Math.cos(a[2] * D2R)], vb = [b[1] * Math.sin(b[2] * D2R), b[1] * Math.cos(b[2] * D2R)];
  const x = va[0] + (vb[0] - va[0]) * f, y = va[1] + (vb[1] - va[1]) * f, sp = a[1] + (b[1] - a[1]) * f;
  return { speed: sp, dir: (Math.atan2(x, y) / D2R + 360) % 360, gust: a[3] != null && b[3] != null ? a[3] + (b[3] - a[3]) * f : null };
}

export default {
  id: 'wind', label: 'Wind, current and debris on the water', on: true,
  async init(ctx, on) {
    const { qs, flag, DATA, loadJSON, stats, camera, controls } = ctx, S = surfaceData();
    const qw = qs.get('wind') || '', fixed = /^\s*([\d.]+)\s*,\s*([\d.]+)/.exec(qw), qc = qs.has('current') ? +qs.get('current') : null;
    const src = { file: null, cache: null, meteo: null, meteoErr: null };
    // ---------- data
    const getFile = () => src.file || (src.file = loadJSON(DATA + FILE.url).then(J => J.hourly.time.map((s, i) => [fromLondon(s), J.hourly.wind_speed_10m[i] / 3.6, J.hourly.wind_direction_10m[i], null]).filter(r => r[1] != null && r[2] != null)).catch(e => { console.warn('wind file', e); return []; }));
    const getCache = () => src.cache || (src.cache = (async () => { for (const u of CACHE) { try { const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) continue; const J = await r.json(), w = J.themes && J.themes.weather; if (w && w.current) return w; } catch { /* next */ } } return null; })());
    async function getMeteo(t) {
      const day = new Date(t).toISOString().slice(0, 10), old = Date.now() - t > 85 * 864e5, host = old ? 'historical-forecast-api.open-meteo.com' : 'api.open-meteo.com';
      if (src.meteo && src.meteo.day === day) return src.meteo;
      try { let J; if (!old) J = await forecastDay(day);   // shared with the weather layer (../meteo.js)
        else { const r = await fetch(`https://${host}/v1/forecast?latitude=51.505&longitude=-0.02&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=ms&timeformat=unixtime&timezone=GMT&start_date=${day}&end_date=${new Date(t + 864e5).toISOString().slice(0, 10)}`);
          J = await r.json(); if (!r.ok || J.error) throw new Error(J.reason || 'HTTP ' + r.status); }
        src.meteo = { day, rows: J.hourly.time.map((s, i) => [s * 1000, J.hourly.wind_speed_10m[i], J.hourly.wind_direction_10m[i], J.hourly.wind_gusts_10m[i]]).filter(r => r[1] != null && r[2] != null) }; src.meteoErr = null;
      } catch (e) { src.meteoErr = e.message; console.warn('wind: Open-Meteo', e); }
      return src.meteo;
    }
    let W = null, lastT = null, busy = false;
    async function evaluate() {
      const t = ctx.clock; if (busy) return; busy = true; lastT = t;
      try {
        let w = null;
        if (fixed) w = { speed: +fixed[1], dir: +fixed[2], gust: null, src: 'URL ?wind=' };
        if (!w && t >= FILE.from - 36e5 && t <= FILE.to + 36e5) { const v = interp(await getFile(), t); if (v) w = { ...v, src: 'Open-Meteo best match, hourly (data/sky/weather-2026-10-03.json, CC BY 4.0)' }; }
        if (!w) { const c = await getCache(), wt = c && Date.parse(c.time);
          if (c && Math.abs(t - wt) <= 90 * 6e4 && c.current.wind_kmh != null) w = { speed: c.current.wind_kmh / 3.6, dir: c.current.wind_dir, gust: c.current.gust_kmh != null ? c.current.gust_kmh / 3.6 : null, src: `londat hourly cache, Open-Meteo at ${hhmm(wt)} (CC BY 4.0)` }; }
        if (!w && meteoOn) { const M = await getMeteo(t), v = M && interp(M.rows, t); if (v) w = { ...v, src: 'Open-Meteo forecast API, hourly (CC BY 4.0)' }; }
        if (!w) w = { speed: 4, dir: 240, gust: null, src: `default, no wind data for ${hhmm(t)}${meteoOn && src.meteoErr ? ' (Open-Meteo: ' + src.meteoErr + ')' : ''}` };
        W = w; WU.windSpeed.value = w.speed; WU.windDir.value = w.dir;
        SU.gust.value = w.gust != null && w.speed > 0.5 ? Math.max(0.15, Math.min(1, w.gust / w.speed - 1)) : 0.5;
        setFetch(w.dir); showNote(); ctx.draw();
      } finally { busy = false; }
    }
    // ---------- note on screen (bottom left, above the frame line, in the stack #blNotes shared with the aircraft note of
    // layers/planes.js, above it) and in the menu
    const note = document.createElement('div'); note.id = 'surfNote';
    Object.assign(note.style, { order: 1, fontSize: '11px', color: 'var(--mut)', background: 'var(--panel)', padding: '2px 8px', borderRadius: '5px', maxWidth: '100%' });
    let stack = document.getElementById('blNotes');
    if (!stack) { stack = document.createElement('div'); stack.id = 'blNotes'; stack.style.cssText = 'position:fixed;left:8px;bottom:calc(30px + env(safe-area-inset-bottom,0px));z-index:4;display:flex;flex-direction:column;align-items:flex-start;gap:3px;max-width:min(640px,calc(100vw - 70px));pointer-events:none'; document.body.appendChild(stack); }
    stack.appendChild(note);
    ctx.ui.section('Water surface');
    const menuNote = ctx.ui.note('');
    let meteoOn = qw === 'meteo' || (!fixed && !/^(0|off|no)$/i.test(ctx.qs.get('weather') || ''));   // on by default (owner, 2026-10-09: "all wind/weather"); ?weather=0 is the one switch for wind and weather
    ctx.ui.toggle('Wind from Open-Meteo for the clock time (asks api.open-meteo.com)', meteoOn, v => { meteoOn = v; evaluate(); });
    const curNow = () => qc != null && isFinite(qc) ? qc : Math.max(-1.8, Math.min(1.8, -0.75 * WU.tideRate.value + 0.08));
    function showNote() {
      if (!W) return; const c = SU.current.value, dir = c > 0.12 ? 'ebb, downstream' : c < -0.02 ? 'flood, upstream' : 'slack';
      const txt = `Wind ${W.speed.toFixed(1)} m/s from ${Math.round(W.dir)}°${W.gust != null ? `, gusts ${W.gust.toFixed(1)}` : ''} · ${W.src} · Thames current ${Math.abs(c).toFixed(2)} m/s (${dir}${qc != null ? ', URL ?current=' : ''})`;
      if (note.textContent !== txt) { note.textContent = txt; menuNote.textContent = txt; }
    }
    // ---------- river: flow field, debris, test wakes
    let line = null, debris = null, dOn = flag('debris', true);
    try { const R = await loadJSON(DATA + 'river.json'); setRiver(R); line = riverLine(R); } catch (e) { console.warn('wind: river.json', e); }
    if (line) { debris = makeDebris(line, 320); debris.mesh.visible = dOn; ctx.scene.add(debris.mesh); }
    ctx.ui.toggle('Floating debris (Thames)', dOn, v => { dOn = v; if (debris) debris.mesh.visible = v; });
    let test = null;
    if (qs.get('wakes') === 'test' && line) {
      const side = (px, pz, c) => { const g = line.at(c); return Math.sign((px - g.x) * -g.tz + (pz - g.z) * g.tx) || 1; };
      const cw = line.nearest(-638.9, -15.9).c, gp = line.nearest(-830.1, 1157.7).c, sCW = side(-638.9, -15.9, cw);
      test = [
        { name: 'Thames Clipper', c0: cw - 160, u: 0.35 * sCW, dirn: 1, speed: 12, len: 40, accel: 0.6 },
        { name: 'small boat', c0: cw + 120, u: -0.45 * sCW, dirn: -1, speed: 6, len: 8, accel: 0 },
        { name: 'tug', c0: gp + 60, u: 0, dirn: -1, speed: 4, len: 25, accel: 0 },
      ].map(b => ({ ...b, c: b.c0 }));
    }
    stats.surface = { get wind() { return W && { speed: +W.speed.toFixed(1), dir: Math.round(W.dir), gust: W.gust && +W.gust.toFixed(1), source: W.src }; }, get current() { return +SU.current.value.toFixed(2); },
      debris: debris ? debris.count : 0, wakes: test ? 'test' : 'ships layer', data: S.stats };
    // ---------- each frame
    let tPrev = performance.now();
    ctx.onFrame(() => {
      const now = performance.now(), dt = Math.min(0.1, (now - tPrev) / 1000); tPrev = now;
      if (lastT == null || Math.abs(ctx.clock - lastT) > 5 * 6e4) evaluate();
      SU.current.value = curNow(); showNote();
      if (debris && dOn) debris.update(dt, controls.target, camera.position.distanceTo(controls.target), SU.current.value, WU.windSpeed.value, WU.windDir.value, WU.tideLevel.value);
      if (test) {
        const list = test.map(b => { b.c += b.dirn * b.speed * dt; if (Math.abs(b.c - b.c0) > 350) b.c = b.c0; const g = line.at(b.c), tx = g.tx * b.dirn, tz = g.tz * b.dirn;
          return { x: g.x - g.tz * b.u * g.hw, z: g.z + g.tx * b.u * g.hw, heading: Math.atan2(tx, -tz), speed: b.speed, len: b.len, accel: b.accel }; });
        setWakes(list); stats.surface.testBoats = list.map((b, k) => ({ name: test[k].name, x: Math.round(b.x), z: Math.round(b.z), heading: +(b.heading / D2R).toFixed(0) }));
      }
    });
    await evaluate();
    return { ownUi: true, object: null, setVisible: v => { dOn = v; if (debris) debris.mesh.visible = v; note.hidden = !v; } };
  },
};
