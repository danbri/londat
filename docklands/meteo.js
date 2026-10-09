// One Open-Meteo forecast request per day for the wind layer (layers/wind.js) and the weather layer (layers/weather.js):
// both ask for the same day, so one fetch carries the cloud, rain and visibility hours and the wind hours (m/s). A
// second caller for the same day gets the same promise. Days more than 85 days back are not shared: each layer keeps its
// own archive host. Skill: docklands-sky, "Three.js port clock".
const W_VARS = 'wind_speed_10m,wind_direction_10m,wind_gusts_10m';
const C_VARS = 'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,precipitation,weather_code,temperature_2m,relative_humidity_2m';
const days = new Map();
// day: 'YYYY-MM-DD' (GMT); returns the parsed JSON (hourly with unixtime) or throws Error(reason)
export function forecastDay(day) {
  if (!days.has(day)) {
    const end = new Date(Date.parse(day + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=51.505&longitude=-0.02&start_date=${day}&end_date=${end}&timeformat=unixtime&timezone=GMT&wind_speed_unit=ms&hourly=${C_VARS},${W_VARS}`;
    days.set(day, fetch(url).then(async r => { const J = await r.json(); if (!r.ok || J.error) throw new Error(J.reason || 'HTTP ' + r.status); return J; })
      .catch(e => { days.delete(day); throw e; }));   // a failed day may be asked again later
  }
  return days.get(day);
}
