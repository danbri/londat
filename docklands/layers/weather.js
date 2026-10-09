// Layer "weather" of the Three.js port (docklands/): the weather of the page clock on the sky and the light. From the hourly
// weather at the clock time (linear between hours; the weather code of the hour before):
// - cloud: SkyMesh cloud coverage = total cloud cover; the direct sun dimmed by the low, mid and high cover; stars, the moon
//   and moonlight hidden by it; the night background lit by the city under cloud (sky3.js setWeather, applyLight);
// - haze: scene fog 1 - exp(-3.912 d / visibility) (Koschmieder), at most 0.85 (sky3.js fogU); SkyMesh turbidity;
// - rain and snow: falling streaks in a 120 m box round the camera, as many as the rate (mm an hour) asks, slanted by the
//   wind (water.js WU.windSpeed, WU.windDir, from the wind layer).
// Sources, the first that covers the clock time: data/sky/weather-2026-10-03.json (Open-Meteo best match, hourly, 3 and 4
// October 2026, CC BY 4.0; the WebGL page's snapshot); the londat hourly cache (cache/latest.json theme weather, Open-Meteo,
// the latest hour, total cover only, within 90 minutes of it); with "Weather from Open-Meteo" ticked (or ?weather=meteo) the
// Open-Meteo API for the clock's day (forecast API, with visibility, back 85 days and 15 days ahead; archive API, ERA5,
// no visibility, before that). No request to Open-Meteo before the visitor asks (the WebGL page's rule). Else no weather:
// a fair sky is drawn and the menu says so. ?weather=0 turns the layer off.
// METAR: when the London City Airport METAR (EGLC; metar.json of the live-cache branch, NOAA AWC, public domain; loader
// getMetar of ./wind.js) is within 45 minutes of the clock, its cloud layers set the low and mid cover (FEW 1.5/8, SCT 3.5/8,
// BKN 6/8, OVC 8/8; base below 6,500 ft low, 6,500 to 20,000 ft mid; NSC, NCD, CLR, SKC, CAVOK: none) and the total cover
// is at least the largest layer; its visibility is used (9999 = "10 km or more": the Open-Meteo value when that is larger,
// else 10 km); rain, drizzle and snow in the report give a rate when Open-Meteo has none (RA 1, DZ 0.3, SN 1 mm/h,
// - light, + heavy x 0.4 or x 3); temperature and humidity from its temperature and dew point. With no Open-Meteo hour the
// METAR alone gives the weather. ?metar=0: not used.
// Not done: wet ground (the ground material is another file's), cloud placed by the satellite cloud mask (the WebGL page
// has it for 3 October), cloud at night (SkyMesh is not drawn by night; only the background and the stars show it).
// Skill: docklands-sky, "Three.js port clock".
import * as THREE from 'three/webgpu';
import { WU } from '../water.js';
import { fromLondon } from '../sky3.js';
import { forecastDay } from '../meteo.js';
import { getMetar, metarNear, hm } from './wind.js';

const D2R = Math.PI / 180;
const local = /^(127\.|localhost$|\[::1\]$)/.test(location.hostname);
const CACHE = local ? ['../cwplans/cache/latest.json'] : ['https://raw.githubusercontent.com/danbri/londat/main/cwplans/cache/latest.json', '../cwplans/cache/latest.json'];
const SNAP = { from: fromLondon('2026-10-03T00:00'), to: fromLondon('2026-10-04T23:00'), url: 'sky/weather-2026-10-03.json' };
const VARS = 'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,precipitation,weather_code,temperature_2m,relative_humidity_2m';
const RAIN = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]), SNOW = new Set([71, 73, 75, 77, 85, 86]);
const hhmm = t => new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', year: 'numeric' });
// Open-Meteo hourly block -> rows { t, cover, low, mid, high, vis, precip, code, temp, rh } (t ms UTC)
function rowsOf(H, tOf) {
  return H.time.map((s, i) => ({ t: tOf(s), cover: H.cloud_cover?.[i], low: H.cloud_cover_low?.[i], mid: H.cloud_cover_mid?.[i], high: H.cloud_cover_high?.[i], vis: H.visibility?.[i] ?? null,
    precip: H.precipitation?.[i] ?? 0, code: H.weather_code?.[i], temp: H.temperature_2m?.[i], rh: H.relative_humidity_2m?.[i] })).filter(r => r.cover != null);
}
// the weather at t: linear between the hours either side (at most 2 h apart), the code of the hour before
// a METAR applied to the weather w (or alone): low and mid cover from its layers, visibility, precipitation
const OKTA = { FEW: 1.5 / 8, SCT: 3.5 / 8, BKN: 6 / 8, OVC: 1, VV: 1 };
function withMetar(w, m) {
  const low = [], mid = [];
  for (const c of m.clouds || []) { const f = OKTA[c.cover]; if (f == null || c.base_ft == null) continue; (c.base_ft < 6500 ? low : c.base_ft <= 20000 ? mid : []).push(f * 100); }
  const clear = /\b(NSC|NCD|CLR|SKC|CAVOK)\b/.test(m.raw), lo = low.length ? Math.max(...low) : clear ? 0 : null, mi = mid.length ? Math.max(...mid) : clear ? 0 : null;
  const o = w ? { ...w } : { cover: 0, low: null, mid: null, high: null, vis: null, precip: 0, code: 0, temp: null, rh: null };
  if (lo != null) o.low = lo; if (mi != null) o.mid = mi;
  const top = Math.max(lo || 0, mi || 0); o.cover = w ? Math.max(o.cover || 0, top) : top;
  if (m.vis_m != null) o.vis = m.vis_m >= 10000 ? Math.max(10000, w && w.vis || 0) : m.vis_m;
  const wx = /(?:^|\s)([-+]?)(?:VC)?(?:SH|TS|FZ)?(RA|DZ|SN)/.exec(m.raw.replace(/\sRE\w+/g, ''));
  if (wx && !(o.precip > 0)) { o.precip = { RA: 1, DZ: 0.3, SN: 1 }[wx[2]] * (wx[1] === '-' ? 0.4 : wx[1] === '+' ? 3 : 1); o.code = wx[2] === 'SN' ? 73 : wx[2] === 'DZ' ? 53 : 63; }
  if (m.temp_c != null) o.temp = m.temp_c;
  if (m.temp_c != null && m.dewp_c != null) { const es = T => Math.exp(17.625 * T / (243.04 + T)); o.rh = 100 * es(m.dewp_c) / es(m.temp_c); }
  o.metar = m.raw; o.src = (w ? w.src + ' + ' : '') + `London City Airport METAR ${hm(m.t)} (cloud layers, visibility; NOAA AWC, public domain)`;
  return o;
}
function interp(rows, t) {
  const k = rows.findIndex(r => r.t > t); if (k < 1) return null; const a = rows[k - 1], b = rows[k]; if (b.t - a.t > 2 * 36e5) return null;
  const f = (t - a.t) / (b.t - a.t), L = (p, q) => p == null ? null : q == null ? p : p + (q - p) * f;
  return { cover: L(a.cover, b.cover), low: L(a.low, b.low), mid: L(a.mid, b.mid), high: L(a.high, b.high), vis: L(a.vis, b.vis), precip: L(a.precip, b.precip), code: a.code, temp: L(a.temp, b.temp), rh: L(a.rh, b.rh) };
}

export default {
  id: 'weather', label: 'Weather (cloud, haze, rain)', on: true,
  async init(ctx, on) {
    const { THREE: T3, scene, camera, sky, qs, DATA, loadJSON, ui, stats, draw } = ctx;
    if (!sky || !sky.setWeather) return {};
    const src = { snap: null, cache: null, meteo: {}, err: null };
    const getSnap = () => src.snap || (src.snap = loadJSON(DATA + SNAP.url).then(J => rowsOf(J.hourly, s => fromLondon(s))).catch(e => { console.warn('weather snapshot', e); return []; }));
    const getCache = () => src.cache || (src.cache = (async () => { for (const u of CACHE) { try { const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) continue; const J = await r.json(), w = J.themes && J.themes.weather; if (w && w.current) return w; } catch { /* next */ } } return null; })());
    async function getMeteo(t) {
      const day = new Date(t).toISOString().slice(0, 10), age = (Date.now() - t) / 864e5; if (src.meteo[day]) return src.meteo[day];
      if (age < -15) return (src.meteo[day] = { why: 'Open-Meteo forecasts reach 16 days ahead' });
      const end = new Date(t + 864e5).toISOString().slice(0, 10), q = `latitude=51.505&longitude=-0.02&start_date=${day}&end_date=${end}&timeformat=unixtime&timezone=GMT`;
      const url = age > 85 ? `https://archive-api.open-meteo.com/v1/archive?${q}&hourly=${VARS.replace('visibility,', '')}` : `https://api.open-meteo.com/v1/forecast?${q}&hourly=${VARS}`;
      try { let J; if (age <= 85) J = await forecastDay(day);   // shared with the wind layer (../meteo.js)
        else { const r = await fetch(url); J = await r.json(); if (!r.ok || J.error) throw new Error(J.reason || 'HTTP ' + r.status); }
        return (src.meteo[day] = { rows: rowsOf(J.hourly, s => s * 1000), name: age > 85 ? 'Open-Meteo archive (ERA5 reanalysis, no visibility)' : age > 0 ? 'Open-Meteo forecast API, past hours' : 'Open-Meteo forecast' });
      } catch (e) { console.warn('weather: Open-Meteo', e); return { why: 'Open-Meteo did not answer: ' + e.message }; }
    }
    const metarOn = qs.get('metar') !== '0';
    let meteoOn = !/^(0|off|no)$/i.test(qs.get('weather') || ''), W = null, lastT = null, busy = false, again = false, visible = on;

    // ---------- rain and snow: streaks in a box round the camera
    const NMAX = 6000, BOX = 60, HGT = 80, pos = new Float32Array(NMAX * 6), seed = new Float32Array(NMAX * 3);
    for (let i = 0; i < NMAX; i++) { seed[3 * i] = (Math.random() * 2 - 1) * BOX; seed[3 * i + 1] = (Math.random() - 0.5) * HGT; seed[3 * i + 2] = (Math.random() * 2 - 1) * BOX; }
    const rg = new T3.BufferGeometry(); rg.setAttribute('position', new T3.BufferAttribute(pos, 3)); rg.setDrawRange(0, 0);
    const rmat = new T3.LineBasicNodeMaterial({ color: 0xb4bec8, transparent: true, opacity: 0.4, depthWrite: false, fog: false });
    const rain = new T3.LineSegments(rg, rmat); rain.frustumCulled = false; rain.name = 'rain'; rain.visible = false; scene.add(rain);
    let fall = 0, tPrev = performance.now();
    function stepRain() {
      const n = W && visible ? W.drops : 0; rain.visible = n > 0; if (!n) return;
      const now = performance.now(), dt = Math.min(0.1, (now - tPrev) / 1000); tPrev = now; fall += dt;
      const snow = W.snow, v = snow ? 1.2 : 7.5, len = snow ? 0.12 : 1.3, ws = WU.windSpeed.value, wd = (WU.windDir.value + 180) * D2R;   // wind blows towards dir + 180
      const wx = Math.sin(wd) * ws, wz = -Math.cos(wd) * ws, sx = wx / v, sz = wz / v;
      const wrap = (a, h) => ((a + h) % (2 * h) + 2 * h) % (2 * h) - h;
      for (let i = 0; i < n; i++) {
        const y = wrap(seed[3 * i + 1] - v * fall, HGT / 2), x = wrap(seed[3 * i] + wx * fall, BOX), z = wrap(seed[3 * i + 2] + wz * fall, BOX), o = 6 * i;
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; pos[o + 3] = x - sx * len; pos[o + 4] = y + len; pos[o + 5] = z - sz * len;
      }
      rg.attributes.position.needsUpdate = true; rg.setDrawRange(0, 2 * n); rain.position.copy(camera.position);
    }

    // ---------- the weather at the clock time
    async function evaluate() {
      if (busy) { again = true; return; } busy = true; const t = ctx.clock; lastT = t;
      try {
        let w = null, why = '';
        if (t >= SNAP.from - 36e5 && t <= SNAP.to + 36e5) { const v = interp(await getSnap(), t); if (v) w = { ...v, src: 'Open-Meteo best match, hourly (data/sky/weather-2026-10-03.json)' }; }
        if (!w) { const c = await getCache(), ct = c && Date.parse(c.time);
          if (c && Math.abs(t - ct) <= 90 * 6e4 && c.current.cloud_pct != null) w = { cover: c.current.cloud_pct, low: null, mid: null, high: null, vis: null, precip: c.current.precip_mm ?? 0, code: c.current.weather_code, temp: c.current.temp_c, rh: c.current.humidity_pct, src: `londat hourly cache, Open-Meteo at ${hhmm(ct)} (total cloud only)` }; }
        if (!w && meteoOn) { const M = await getMeteo(t), v = M && M.rows && interp(M.rows, t); if (v) w = { ...v, src: M.name }; else why = M && M.why || 'no Open-Meteo hour for that time'; }
        if (metarOn && Math.abs(t - Date.now()) < 26 * 3600e3) { const m = metarNear(await getMetar(qs.get('livecache')), t); if (m) w = withMetar(w, m); }
        if (w) { const code = w.code ?? 0, pr = w.precip || 0, wet = pr >= 0.05 || RAIN.has(code) || SNOW.has(code);
          w.snow = SNOW.has(code); w.drops = wet ? Math.round(Math.min(NMAX, 600 + 1800 * Math.max(pr, 0.2))) : 0; }
        W = w ? { ...w, why } : null; if (!W) src.err = why || null;
        apply(); showNote(); draw();
      } finally { busy = false; if (again) { again = false; evaluate(); } }
    }
    function apply() {
      if (!visible || !W) { sky.setWeather(null); return; }
      const p = v => v == null ? null : v / 100;
      sky.setWeather({ cover: p(W.cover), low: W.low == null ? p(W.cover) : p(W.low), mid: p(W.mid), high: p(W.high), visibility: W.vis, precip: W.precip });
    }
    // ---------- menu
    ui.section('Weather');
    const note = ui.note('');
    ui.toggle('Weather (cloud, haze, rain) for the clock time', on, v => { visible = v; apply(); showNote(); });
    ui.toggle('Weather from Open-Meteo for other times (asks open-meteo.com)', meteoOn, v => { meteoOn = v; evaluate(); });
    const cred = ui.note('<a href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo.com</a> (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>). Cloud dimming, haze and rain amounts are drawn with stated factors, not measured.');
    cred.style.opacity = '0.75';
    const f0 = v => v == null ? '?' : Math.round(v);
    function showNote() {
      const w = W; let h;
      if (!visible) h = 'Weather is off: a fair sky is drawn.';
      else if (!w) h = `No weather for ${hhmm(ctx.clock)}${src.err ? ' (' + ctx.esc(src.err) + ')' : ''}: a fair sky is drawn (light cloud, no haze, no rain). Tick "Weather from Open-Meteo" for other times.`;
      else h = `${ctx.esc(hhmm(ctx.clock))}: cloud ${f0(w.cover)}%${w.low != null ? ` (low ${f0(w.low)}, mid ${f0(w.mid)}, high ${f0(w.high)})` : ''}, visibility ${w.vis != null ? (w.vis / 1000).toFixed(0) + ' km' : 'not given'}, ${w.precip ? w.precip.toFixed(1) + ' mm/h ' + (w.snow ? 'snow' : 'rain') : 'dry'}${w.temp != null ? `, ${w.temp.toFixed(1)} °C` : ''}${w.rh != null ? `, humidity ${f0(w.rh)}%` : ''}. Source: ${ctx.esc(w.src)}.`;
      if (note.innerHTML !== h) note.innerHTML = h;
    }
    stats.weather = { get now() { return W && { cover: W.cover, low: W.low, mid: W.mid, high: W.high, vis: W.vis, precip: W.precip, code: W.code, drops: visible ? W.drops : 0, source: W.src, metar: W.metar || null }; }, get sky() { return sky.state && sky.state.weather; }, get meteo() { return meteoOn; }, get error() { return W ? null : src.err; } };
    ctx.weather = { evaluate, get now() { return W; } };
    ctx.onFrame(() => { if (lastT !== ctx.clock) evaluate(); stepRain(); });
    evaluate();   // not awaited: a slow source (METAR, Open-Meteo) must not hold up the layers that load after this one
    return { ownUi: true, object: null, setVisible: v => { visible = v; apply(); showNote(); } };
  },
};
