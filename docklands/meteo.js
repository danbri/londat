// One Open-Meteo forecast request per day for the wind layer (layers/wind.js), the weather layer (layers/weather.js) and
// the wind-in-3D layer (layers/windfield.js): all ask for the same day, so one fetch carries the cloud, rain and
// visibility hours, the 10 m wind hours (m/s) and the wind by height (H_VARS: 80, 120 and 180 m above the ground, and the
// pressure levels 1000 to 850 hPa with their geopotential heights, m above sea level). A second caller for the same day
// gets the same promise. If the API refuses the request (HTTP 400, e.g. a variable it does not know), it is asked again
// once without H_VARS, so the wind and weather layers keep their data; the wind-in-3D layer then uses its stated estimate.
// Days more than 85 days back are not shared: each layer keeps its own archive host. Skill: docklands-sky, "Three.js port
// clock"; docklands-3d-page, "Three.js port: wind in 3D".
// The place asked for: the model origin (x 0, z 0) of the area file, from its geo fit (A.meta.geo, Newton steps of the
// inverse), rounded to 0.001 degrees (Open-Meteo's grid is coarser); no latitude or longitude literal here (OKRS.md,
// architecture rule 1). A new area file gives a new place with no code change. Also used by layers/wind.js and
// layers/weather.js for their archive hosts.
export const METEO_PLACE = (() => {
  const G = globalThis.DOCKLANDS_AREA.meta.geo, f = (lon, lat) => { const a = lon - G.lon0, b = lat - G.lat0, t = [1, a, b, a * b, a * a, b * b]; return [t.reduce((s, v, i) => s + v * G.x[i], 0), t.reduce((s, v, i) => s + v * G.z[i], 0)]; };
  let lon = G.lon0 - G.x[0] / G.x[1], lat = G.lat0 - G.z[0] / G.z[2];
  for (let k = 0; k < 8; k++) { const [fx, fz] = f(lon, lat), e = 1e-5, [ax, az] = f(lon + e, lat), [bx, bz] = f(lon, lat + e);
    const j00 = (ax - fx) / e, j01 = (bx - fx) / e, j10 = (az - fz) / e, j11 = (bz - fz) / e, det = j00 * j11 - j01 * j10;
    lon += (j11 * -fx - j01 * -fz) / det; lat += (-j10 * -fx + j00 * -fz) / det; }
  return { lat: +lat.toFixed(3), lon: +lon.toFixed(3) };
})();
export const METEO_Q = `latitude=${METEO_PLACE.lat}&longitude=${METEO_PLACE.lon}`;
const W_VARS = 'wind_speed_10m,wind_direction_10m,wind_gusts_10m';
export const LEVELS_HPA = [1000, 975, 950, 925, 900, 850];
const H_VARS = ['wind_speed_80m,wind_direction_80m,wind_speed_120m,wind_direction_120m,wind_speed_180m,wind_direction_180m',
  ...LEVELS_HPA.map(p => `wind_speed_${p}hPa,wind_direction_${p}hPa,geopotential_height_${p}hPa`)].join(',');
const C_VARS = 'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,precipitation,weather_code,temperature_2m,relative_humidity_2m';
// the query for another point (the place in view: geo/services.js siteAt, issue #12), to 0.01 degree; the model's point
// when none is given
export const meteoQ = p => p && isFinite(p.lat) && isFinite(p.lon) ? `latitude=${(+p.lat).toFixed(2)}&longitude=${(+p.lon).toFixed(2)}` : METEO_Q;
const days = new Map();
// day: 'YYYY-MM-DD' (GMT); point: { lon, lat } (default: the model's point); returns the parsed JSON (hourly with
// unixtime) or throws Error(reason). One promise per day and point.
export function forecastDay(day, point) {
  const Q = meteoQ(point), key = day + '|' + Q;
  if (!days.has(key)) {
    const end = new Date(Date.parse(day + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
    const url = vars => `https://api.open-meteo.com/v1/forecast?${Q}&start_date=${day}&end_date=${end}&timeformat=unixtime&timezone=GMT&wind_speed_unit=ms&hourly=${vars}`;
    const get = async vars => { const r = await fetch(url(vars)); const J = await r.json(); if (!r.ok || J.error) { const e = new Error(J.reason || 'HTTP ' + r.status); e.status = r.status; throw e; } return J; };
    days.set(key, get(`${C_VARS},${W_VARS},${H_VARS}`).catch(e => { if (e.status === 400) { console.warn('Open-Meteo: wind by height refused, asked again without it:', e.message); return get(`${C_VARS},${W_VARS}`); } throw e; })
      .catch(e => { days.delete(key); throw e; }));   // a failed day may be asked again later
  }
  return days.get(key);
}
