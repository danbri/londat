// One Open-Meteo forecast request per day for the wind layer (layers/wind.js), the weather layer (layers/weather.js) and
// the wind-in-3D layer (layers/windfield.js): all ask for the same day, so one fetch carries the cloud, rain and
// visibility hours, the 10 m wind hours (m/s) and the wind by height (H_VARS: 80, 120 and 180 m above the ground, and the
// pressure levels 1000 to 850 hPa with their geopotential heights, m above sea level). A second caller for the same day
// gets the same promise. If the API refuses the request (HTTP 400, e.g. a variable it does not know), it is asked again
// once without H_VARS, so the wind and weather layers keep their data; the wind-in-3D layer then uses its stated estimate.
// Days more than 85 days back are not shared: each layer keeps its own archive host. Skill: docklands-sky, "Three.js port
// clock"; docklands-3d-page, "Three.js port: wind in 3D".
const W_VARS = 'wind_speed_10m,wind_direction_10m,wind_gusts_10m';
export const LEVELS_HPA = [1000, 975, 950, 925, 900, 850];
const H_VARS = ['wind_speed_80m,wind_direction_80m,wind_speed_120m,wind_direction_120m,wind_speed_180m,wind_direction_180m',
  ...LEVELS_HPA.map(p => `wind_speed_${p}hPa,wind_direction_${p}hPa,geopotential_height_${p}hPa`)].join(',');
const C_VARS = 'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,precipitation,weather_code,temperature_2m,relative_humidity_2m';
const days = new Map();
// day: 'YYYY-MM-DD' (GMT); returns the parsed JSON (hourly with unixtime) or throws Error(reason)
export function forecastDay(day) {
  if (!days.has(day)) {
    const end = new Date(Date.parse(day + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
    const url = vars => `https://api.open-meteo.com/v1/forecast?latitude=51.505&longitude=-0.02&start_date=${day}&end_date=${end}&timeformat=unixtime&timezone=GMT&wind_speed_unit=ms&hourly=${vars}`;
    const get = async vars => { const r = await fetch(url(vars)); const J = await r.json(); if (!r.ok || J.error) { const e = new Error(J.reason || 'HTTP ' + r.status); e.status = r.status; throw e; } return J; };
    days.set(day, get(`${C_VARS},${W_VARS},${H_VARS}`).catch(e => { if (e.status === 400) { console.warn('Open-Meteo: wind by height refused, asked again without it:', e.message); return get(`${C_VARS},${W_VARS}`); } throw e; })
      .catch(e => { days.delete(day); throw e; }));   // a failed day may be asked again later
  }
  return days.get(day);
}
