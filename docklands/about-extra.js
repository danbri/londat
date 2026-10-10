// Menu > About texts of the Three.js port (docklands/) that the WebGL page has in its About pane (cwplans/docklands/index.html):
// the Live data box (loadLive: tide, weather, air quality, lines, storm overflows, traffic cameras; the londat hourly cache
// first through ../cwplans/live-cache.js CwLive.pick, each source's open API when "Live" is ticked or the cached theme is
// older than an hour; air quality always from the London Air Quality Network) and "Canary Wharf below ground (text)"
// (textTables: OSM features below level 0 in the Canary Wharf box by level, and the basements, from data/under.js). Nothing
// is fetched from a third party before the visitor presses "Load live data". Traffic cameras: "cam" markers over the model
// from page load (the committed snapshot cwplans/feeds/live/jamcams.json; HTML, projected in an onFrame hook of main.js
// ctx; ?cams=0 off), a tap asks TfL for the latest still and opens it in the record card. "Tidal Thames at the Tower Pier
// level": see tideToggle.
// Skill: docklands-3d-page, "Three.js port".
const $ = id => document.getElementById(id);
const A = globalThis.DOCKLANDS_AREA, WEBGL = '../cwplans/docklands/';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const G = A.meta.geo, geo = (lon, lat) => { const a = lon - G.lon0, b = lat - G.lat0, t = [1, a, b, a * b, a * a, b * b]; return [t.reduce((s, v, i) => s + v * G.x[i], 0), t.reduce((s, v, i) => s + v * G.z[i], 0)]; };
const getJSON = async (url, ms = 20000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); } };
const when = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }); };
const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error(src + ' did not load')); document.head.appendChild(s); });
const dec = (q, stride = 2) => { const o = new Float32Array(q.length), acc = new Array(stride).fill(0); for (let i = 0; i < q.length; i++) { acc[i % stride] += q[i]; o[i] = acc[i % stride] / 10; } return o; };   // build.js dec
const storey = () => { const v = parseFloat(new URLSearchParams(location.search).get('storey')); return isFinite(v) ? Math.max(2.5, Math.min(6, v)) : 4; };   // as layers/under.js

// ---------- Canary Wharf below ground (text): index.html textTables
async function textTables() {
  const out = $('ugText'); if (!out || out.dataset.done) return; out.textContent = 'Loading the below-ground data…';
  try { if (!globalThis.DOCKLANDS_UNDER) await loadScript(WEBGL + 'data/under.js'); } catch (e) { out.textContent = e.message; return; }
  const U = globalThis.DOCKLANDS_UNDER || { basements: [], indoor: [], pois: [] }, st = storey(), F = A.meta.focus, inF = (x, z) => x >= F.x0 && x <= F.x1 && z >= F.z0 && z <= F.z1;
  const byLevel = new Map(), add = (lv, name, kind) => { const k = byLevel.get(lv) || { n: 0, names: new Set(), kinds: {} }; k.n++; if (name) k.names.add(name); k.kinds[kind] = (k.kinds[kind] || 0) + 1; byLevel.set(lv, k); };
  for (const o of U.indoor) { const f = o.p ? dec(o.p) : dec(o.line); if (!inF(f[0], f[1])) continue; for (const lv of o.lv) if (lv < 0) add(lv, o.name, o.kind); }
  for (const p of U.pois) if (p.lv && inF(p.x, p.z)) for (const lv of p.lv) if (lv < 0) add(lv, null, p.what || p.kind);
  const rows = [...byLevel.entries()].sort((a, b) => b[0] - a[0]).map(([lv, k]) => `<tr><td>${lv}</td><td class="n">≈ ${(-lv * st).toFixed(0)} m below</td><td class="n">${k.n}</td><td>${esc(Object.entries(k.kinds).map(([a, b]) => `${a} ${b}`).join(', '))}</td><td>${esc([...k.names].slice(0, 8).join(', '))}</td></tr>`).join('');
  const bas = U.basements.filter(b => { const f = dec(b.p); return inF(f[0], f[1]); }).sort((a, b) => b.n - a.n)
    .map(b => `<tr><td>${esc(b.name || 'unnamed building')}</td><td class="n">${b.n}</td><td class="n">≈ ${(b.n * st).toFixed(0)} m below</td><td>${b.src === 'wikidata' ? `Wikidata <a href="https://www.wikidata.org/wiki/${esc(b.wd)}">${esc(b.wd)}</a> (floors below ground)` : 'OSM building:levels:underground'}</td></tr>`).join('');
  out.innerHTML = `<p>OSM features with a level below 0 in the Canary Wharf box, by level. Depth is level × the storey height (${st} m; Layers > Below ground), not a measurement.</p>` +
    `<table><tr><th>Level</th><th>Depth</th><th>Features</th><th>Kinds</th><th>Names</th></tr>${rows}</table>` +
    `<p>Basements in the box (storeys from OSM or Wikidata).</p><table><tr><th>Building</th><th>Storeys below</th><th>Depth</th><th>Source</th></tr>${bas || '<tr><td colspan="4">none recorded</td></tr>'}</table>`;
  out.dataset.done = '1';
}

// ---------- traffic camera markers (index.html loadLive "cams"): HTML buttons over the model
const cams = []; let camHook = false;
function camsOn() { const c = $('liveCams'); return !c || c.checked; }
function hookCams() {
  const D = globalThis.__docklands3; if (camHook || !D || !D.ctx) return; camHook = true;
  const { THREE, camera, groundAt } = D.ctx, v = new THREE.Vector3();
  D.ctx.onFrame(() => { const on = camsOn(), W = innerWidth, H = innerHeight; let n = 0; const used = []; camera.updateMatrixWorld();   // no two markers overlap; none over the time wheels (top 130 px); none behind a building or the ground (occlude.js; owner, 2026-10-10: "Cam label ignores depth / buildings in front")
    for (const c of cams) { let vis = false; if (on && n < 40) { v.set(c.x, groundAt(c.x, c.z) + 3, c.z).project(camera); const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H; vis = v.z < 1 && x > 0 && x < W && y > 130 && y < H && !used.some(q => Math.abs(q[0] - x) < 40 && Math.abs(q[1] - y) < 26) && camera.position.distanceTo(v.set(c.x, 0, c.z)) < 9000 && !D.ctx.occluded?.(c.el, c.x, groundAt(c.x, c.z) + 3, c.z); if (vis) { n++; used.push([x, y]); c.el.style.transform = `translate(${x | 0}px,${y | 0}px) translate(-50%,-100%)`; } }
      if (c.el.hidden === vis) c.el.hidden = !vis; } });
}

// camera positions: the committed snapshot (cwplans/feeds/live/jamcams.json, same site) at page load and unless "Live" is
// ticked; TfL's Place API with "Live"; the stills always come from TfL, only on a tap
async function loadCams(direct) {
  const places = direct ? (d => d.places || d)(await getJSON('https://api.tfl.gov.uk/Place?type=JamCam&lat=51.497&lon=-0.04&radius=4500'))
    : (await getJSON('../cwplans/feeds/live/jamcams.json')).items.map(i => ({ id: i.id, commonName: i.name, lat: i.position.lat, lon: i.position.lon, additionalProperties: [{ key: 'imageUrl', value: i.values.image_url }, { key: 'videoUrl', value: i.values.video_url }, { key: 'view', value: i.values.view }] }));
  for (const c of cams.splice(0)) c.el.remove();
  const host = $('labels') || document.body, X = A.meta.extent;
  for (const c of places) {
    const [x, z] = geo(c.lon, c.lat); if (x < X.x0 || x > X.x1 || z < X.z0 || z > X.z1) continue;
    const prop = k => (c.additionalProperties.find(p => p.key === k) || {}).value, img = prop('imageUrl'), video = prop('videoUrl'), view = prop('view');
    const el = document.createElement('button'); el.type = 'button'; el.className = 'lab camLab'; el.textContent = 'cam'; el.title = c.commonName; el.hidden = true;
    el.onclick = () => { const D = globalThis.__docklands3; const html = `<h2>${esc(c.commonName)}</h2><p class="small">TfL JamCam ${esc(c.id)}, ${esc(view || '')}. TfL refreshes the still every few minutes.</p><img src="${esc(img)}?t=${Date.now()}" alt="TfL traffic camera still: ${esc(c.commonName)}" style="max-width:100%;margin-top:6px;border-radius:6px"><p class="small"><a href="${esc(video)}">short video clip</a> · Powered by TfL Open Data</p>`; if (D && D.ctx) D.ctx.showCard(html); };
    host.appendChild(el); cams.push({ x, z, el });
  }
  hookCams(); globalThis.__docklands3?.draw?.(); return cams.length;
}

// "Tidal Thames at the Tower Pier level" (index.html #liveTide): the WebGL page puts the river at the latest Tower Pier
// reading. The port's river follows its tide layer (layers/tide.js, another file): this switch sets the clock to now and
// ticks that layer's "Measured tide levels from the EA API" (EA readings for the clock time); off unticks it.
function tideToggle(on) {
  const D = globalThis.__docklands3; if (!D) return;
  const ea = [...document.querySelectorAll('#drawer label.row')].find(l => /Measured tide levels from the EA API/.test(l.textContent))?.querySelector('input');
  if (on) D.setClockUser(Date.now(), true);
  if (ea && ea.checked !== on) ea.click();
  if (!ea) $('liveOut').insertAdjacentHTML('beforeend', '<p class="warn">The tide layer is not loaded: the river cannot follow the readings.</p>');
}

// ---------- the Live data box: index.html loadLive
async function loadLive() {
  const out = $('liveOut'), parts = {}, direct = $('liveDirect').checked; $('liveGo').disabled = true; out.textContent = 'Loading…';
  const show = () => { out.innerHTML = ['tide', 'weather', 'air', 'lines', 'overflows', 'cams'].map(k => parts[k] ? `<p>${parts[k]}</p>` : '').join(''); };
  const job = async (k, fn) => { try { parts[k] = await fn(); } catch (e) { parts[k] = `<span class="warn">${esc(k)}: ${esc(e.message || e)}</span>`; } show(); };
  try { if (!globalThis.CwData) await loadScript('../cwplans/data-base.js'); if (!globalThis.CwLive) await loadScript('../cwplans/live-cache.js'); } catch (e) { out.textContent = e.message; $('liveGo').disabled = false; return; }
  const CwLive = globalThis.CwLive;
  await Promise.all([
    job('tide', async () => {
      const crests = (A.defences || []).map(d => d.c).sort((a, b) => a - b), lo = crests[0], med = crests[crests.length >> 1];
      const say = (tp, sv) => `<b>Thames level</b> (Environment Agency tide gauges, m above Ordnance Datum): Tower Pier ${tp.value.toFixed(2)} m at ${when(tp.dateTime)}, Silvertown ${sv.value.toFixed(2)} m at ${when(sv.dateTime)}. ${crests.length ? `The EA tidal flood walls in the box have surveyed crests from ${lo.toFixed(2)} m (median ${med.toFixed(2)} m), so the water is ${(lo - tp.value).toFixed(2)} m below the lowest crest.` : ''} The river in the model follows the tide prediction for the clock (Time > Tide). <a href="https://environment.data.gov.uk/flood-monitoring/id/stations/0007">Tower Pier station record</a>`;
      $('liveTide').disabled = false;
      return (await CwLive.pick('tide', t => { const st = id => { const k = Object.keys(t.stations).find(x => x.startsWith(`ea-level:${id}-`)), l = k && t.stations[k].latest; if (!l) throw new Error('no reading'); return { value: l[1], dateTime: l[0] }; }; return say(st('0007'), st('0001')); },
        async () => { const g = async id => (await getJSON(`https://environment.data.gov.uk/flood-monitoring/id/stations/${id}/readings?latest`)).items[0]; const [tp, sv] = await Promise.all([g('0007'), g('0001')]); return say(tp, sv); }, direct)).html;
    }),
    job('weather', async () => {
      const say = c => `<b>Weather</b> at Canary Wharf (Open-Meteo model, ${esc(String(c.time).replace('T', ' '))}): ${c.temperature_2m} °C, wind ${c.wind_speed_10m} km/h from ${c.wind_direction_10m}°, cloud ${c.cloud_cover}%, precipitation ${c.precipitation} mm.`;
      return (await CwLive.pick('weather', t => say({ time: when(t.time) + ' London time', temperature_2m: t.current.temp_c, wind_speed_10m: t.current.wind_kmh, wind_direction_10m: t.current.wind_dir, cloud_cover: t.current.cloud_pct, precipitation: t.current.precip_mm }),
        async () => { const c = (await getJSON('https://api.open-meteo.com/v1/forecast?latitude=51.505&longitude=-0.02&current=temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover,precipitation&timezone=Europe/London')).current; return say({ ...c, time: c.time + ' London time' }); }, direct)).html;
    }),
    job('air', async () => {
      const d = await getJSON('https://api.erg.ic.ac.uk/AirQuality/Hourly/MonitoringIndex/SiteCode=TH4/Json'), site = d.HourlyAirQualityIndex.LocalAuthority.Site, sp = [].concat(site.species || []);
      return `<b>Air quality</b>, ${esc(site['@SiteName'])} (London Air Quality Network, ${esc(site['@BulletinDate'])}): ` + sp.map(x => `${esc(x['@SpeciesCode'])} ${x['@AirQualityBand'] === 'No data' ? 'no data' : `index ${esc(x['@AirQualityIndex'])} (${esc(x['@AirQualityBand'])})`}`).join(', ') + '.';
    }),
    job('lines', async () => {
      const ids = ['jubilee', 'dlr', 'elizabeth', 'windrush', 'london-cable-car'], NAME = { jubilee: 'Jubilee', dlr: 'DLR', elizabeth: 'Elizabeth line', windrush: 'Windrush', 'london-cable-car': 'London Cable Car' };
      return (await CwLive.pick('line_status', t => '<b>Lines</b> (TfL): ' + ids.map(id => { const st = CwLive.rowsOf(t).filter(r => r.line === id); if (!st.length) throw new Error(`no status for ${id}`); return `${esc(NAME[id])}: ${esc(st.map(r => r.status).join(' / '))}`; }).join(' · ') + '.',
        async () => '<b>Lines</b> (TfL): ' + (await getJSON('https://api.tfl.gov.uk/Line/jubilee,dlr,elizabeth,windrush,london-cable-car/Status')).map(l => `${esc(l.name)}: ${esc(l.lineStatuses.map(s => s.statusSeverityDescription).join(' / '))}`).join(' · ') + '.', direct)).html;
    }),
    job('overflows', async () => {
      const say = f => { const n = v => f.filter(a => a.Status === v).length, on = f.filter(a => a.Status === 1);
        return `<b>Storm overflows</b> in the box (Thames Water, Status 1 discharging, 0 not, -1 offline): ${f.length} monitored, ${n(1)} discharging, ${n(0)} not discharging, ${n(-1)} offline.` + (on.length ? ' Discharging now: ' + on.map(a => `${esc(a.Id)} into ${esc(a.ReceivingWaterCourse)}`).join('; ') + '.' : ''); };
      return (await CwLive.pick('overflows', t => say(CwLive.rowsOf(t).filter(r => r.lon <= 0.015 && r.lat >= 51.474 && r.lat <= 51.522 && r.lon >= -0.095).map(r => ({ Id: r.id, Status: r.status, ReceivingWaterCourse: r.receiving_water }))),
        async () => say((await getJSON("https://services2.arcgis.com/g6o32ZDQ33GpCIu3/arcgis/rest/services/Thames_Water_Storm_Overflow_Activity_(Production)_view/FeatureServer/0/query?geometry=-0.095%2C51.474%2C0.015%2C51.522&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=Id%2CStatus%2CReceivingWaterCourse%2CLatestEventStart%2CLatestEventEnd&returnGeometry=false&f=json")).features.map(x => x.attributes)), direct)).html;
    }),
    job('cams', async () => `<b>Traffic cameras</b> (TfL JamCams): ${await loadCams(direct)} in the box, shown as "cam" markers${$('liveCams').checked ? '' : ' (ticked off)'}. Tap one for its latest still.`),
  ]);
  $('liveGo').textContent = 'Reload live data'; $('liveGo').disabled = false;
}

$('liveGo').onclick = () => loadLive();
$('liveTide').onchange = e => tideToggle(e.target.checked);
// cameras on by default, as the WebGL page's checkbox (owner, 2026-10-09, through the coordinator); ?cams=0 off
if (/^(0|off|no)$/i.test(new URLSearchParams(location.search).get('cams') || '')) $('liveCams').checked = false;
$('liveCams').disabled = false;
const camsStart = () => { if (globalThis.__docklands3?.ctx) loadCams(false).catch(e => console.warn('cams', e)); else setTimeout(camsStart, 1000); };
camsStart();
$('liveCams').onchange = () => { const m = $('camsLayer'); if (m) m.checked = $('liveCams').checked; globalThis.__docklands3?.draw?.(); };
// the same switch in Layers > Live, where a visitor looks for a map layer (the About box is closed by default)
{ const gb = document.querySelector('#paneLayers .grp[data-g="live"] .gb');
  if (gb) { const l = document.createElement('label'); l.className = 'row'; const i = document.createElement('input'); i.type = 'checkbox'; i.id = 'camsLayer'; i.checked = $('liveCams').checked;
    i.onchange = () => { $('liveCams').checked = i.checked; $('liveCams').onchange(); }; l.append(i, ' Traffic cameras (TfL JamCams)'); gb.appendChild(l); gb.closest('.grp').hidden = false; } }
$('ugBox').addEventListener('toggle', e => { if (e.target.open) textTables(); });
globalThis.__docklandsAbout = { loadLive, textTables, get cams() { return cams.length; } };
