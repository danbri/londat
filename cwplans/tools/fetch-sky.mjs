// Fetch the sky, weather and tide data for the 3D page's Sky panel (docklands/sky.js) and write small snapshots to
// docklands/data/sky/. Method and rules: pipeline.json activity "fetch-sky"; lessons: docklands/README.md
// "Sky, time, weather and tide".
//
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/fetch-sky.mjs [stars] [lines] [sats] [weather] [tide] [names] [messier] [clouds [2026-10-03T23:00Z]] [lcy] [--date 2026-10-03]
//
// With no part named, all nine run. --date picks the evening of the weather and tide snapshots (London date; the
// snapshot covers that day and the next, so the hours after midnight are in it). Satellites are always the current
// CelesTrak elements (CelesTrak keeps no history), so run "sats" within a day or two of the date.
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { gunzipSync } from 'zlib';
import { TOOLS, get } from './lib.mjs';

const OUT = join(TOOLS, '..', 'docklands', 'data', 'sky');
const args = process.argv.slice(2), di = args.indexOf('--date'), DATE = di >= 0 ? args[di + 1] : '2026-10-03';
const parts = args.filter((a, i) => !a.startsWith('--') && !(di >= 0 && i === di + 1));
const want = p => !parts.length || parts.includes(p);
const next = d => new Date(Date.parse(d + 'T12:00Z') + 864e5).toISOString().slice(0, 10);
const today = new Date().toISOString().slice(0, 10);
mkdirSync(OUT, { recursive: true });
const save = (f, o) => { const s = JSON.stringify(o); writeFileSync(join(OUT, f), s + '\n'); console.log(`wrote docklands/data/sky/${f} (${(s.length / 1024).toFixed(1)} KB)`); };
// the agent proxy and some hosts time out now and then: three more tries, 3, 6 and 9 s apart; a 4xx is not retried
const fetchRetry = async u => { for (let k = 0; ; k++) try { return await get(u); } catch (e) { if (k >= 3 || /^4\d\d /.test(e.message)) throw e; await new Promise(r => setTimeout(r, 3000 * (k + 1))); } };
const json = async u => JSON.parse((await fetchRetry(u)).toString('utf8'));

// 1. Yale Bright Star Catalogue, 5th revised edition (CDS V/50), stars to V 5.5: J2000 position, V, B-V.
// Fixed columns from the CDS ReadMe (1-based): HR 1-4, RAh 76-77, RAm 78-79, RAs 80-83, DE- 84, DEd 85-86,
// DEm 87-88, DEs 89-90, Vmag 103-107, B-V 110-114. Rows with no J2000 position (the 14 novae and galaxies) are dropped.
if (want('stars')) {
  const txt = gunzipSync(await fetchRetry('https://cdsarc.cds.unistra.fr/ftp/V/50/catalog.gz')).toString('latin1'), rows = [];
  for (const l of txt.split('\n')) {
    const c = (a, b) => l.slice(a - 1, b).trim(), v = +c(103, 107);
    if (!c(76, 77) || !c(103, 107) || !(v <= 5.5)) continue;
    const ra = (+c(76, 77) + +c(78, 79) / 60 + +c(80, 83) / 3600) * 15, de = (c(84, 84) === '-' ? -1 : 1) * (+c(85, 86) + +c(87, 88) / 60 + +c(89, 90) / 3600);
    const bv = c(110, 114) === '' ? 0.6 : +c(110, 114);
    rows.push([+c(1, 4), Math.round(ra * 1000) / 1000, Math.round(de * 1000) / 1000, Math.round(v * 100) / 100, Math.round(bv * 100) / 100]);
  }
  rows.sort((a, b) => a[3] - b[3]);
  save('stars.json', { source: 'Yale Bright Star Catalogue, 5th revised ed. (Hoffleit & Warren 1991), CDS V/50 catalog.gz', url: 'https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50', fetched: today,
    licence: 'public domain (NASA ADC); CDS asks that the catalogue be cited', fields: ['hr', 'ra_deg_j2000', 'dec_deg_j2000', 'vmag', 'b_v'], limit_vmag: 5.5, note: 'B-V missing: 0.6 assumed', stars: rows });
}

// 2. Constellation lines from d3-celestial (Olaf Frohn, BSD-3-Clause; lines after the IAU constellation charts).
// Kept: the 3-letter id and the line strings, coordinates rounded to 0.01 degree, longitude as RA in degrees 0-360.
if (want('lines')) {
  const d = await json('https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json');
  const lines = d.features.map(f => [f.id, f.geometry.coordinates.map(ls => ls.flatMap(([lo, la]) => [Math.round(((lo + 360) % 360) * 100) / 100, Math.round(la * 100) / 100]))]);
  save('constellation-lines.json', { source: 'd3-celestial data/constellations.lines.json (Olaf Frohn)', url: 'https://github.com/ofrohn/d3-celestial', fetched: today, licence: 'BSD-3-Clause (repository licence, Copyright (c) 2015, Olaf Frohn); lines after the IAU constellation charts',
    fields: 'per constellation: [IAU abbreviation, [[ra, dec, ra, dec, ...] per line string]] in J2000 degrees', lines });
}

// 3. Satellites: CelesTrak GP data (OMM JSON) for the ISS, the Chinese space station and the "visual" group
// (about 150 bright satellites). One request per group, once; CelesTrak asks for no more than one download per two hours.
if (want('sats')) {
  const groups = [['stations-iss', 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=json'], ['css', 'https://celestrak.org/NORAD/elements/gp.php?CATNR=48274&FORMAT=json'],
    ['visual', 'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json']], seen = new Set(), sats = [];
  for (const [, u] of groups) for (const o of await json(u)) if (!seen.has(o.NORAD_CAT_ID)) { seen.add(o.NORAD_CAT_ID); sats.push(o); }
  save(`sats-${DATE}.json`, { source: 'CelesTrak GP data (OMM JSON), from 18 SDS / Space-Track', url: 'https://celestrak.org/NORAD/elements/', fetched: new Date().toISOString(), requests: groups.map(g => g[1]),
    licence: 'no licence stated; US Government GP data republished by CelesTrak; credit CelesTrak; usage policy: at most one download per 2 hours', count: sats.length, sats });
}

// 4. Weather: Open-Meteo hourly for Canary Wharf (51.5050, -0.0200), the date and the next day, London time.
// The forecast API keeps recent past days with the high-resolution models (visibility included); the archive API
// (ERA5) has no visibility. Model: best_match (for London the UK Met Office 2 km UKV first).
if (want('weather')) {
  const H = 'temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,wind_speed_10m,wind_direction_10m';
  const u = `https://api.open-meteo.com/v1/forecast?latitude=51.505&longitude=-0.02&start_date=${DATE}&end_date=${next(DATE)}&hourly=${H}&timezone=Europe%2FLondon`;
  const d = await json(u);
  save(`weather-${DATE}.json`, { source: 'Open-Meteo forecast API (best_match model), past hours', url: u, fetched: new Date().toISOString(), licence: 'CC BY 4.0', attribution: 'Weather data by Open-Meteo.com',
    latitude: d.latitude, longitude: d.longitude, timezone: d.timezone, units: d.hourly_units, hourly: d.hourly });
}

// 5. Tide: Environment Agency flood-monitoring readings (15-minute, m AOD) at the tidal Thames gauges round the
// Isle of Dogs: Tower Pier (0007) upstream, Charlton (0003) and Silvertown (0001) downstream. Times in UTC.
if (want('tide')) {
  const st = { '0007': 'Tower Pier', '0003': 'Charlton', '0001': 'Silvertown' }, out = {};
  for (const [id, name] of Object.entries(st)) {
    const s = (await json(`https://environment.data.gov.uk/flood-monitoring/id/stations/${id}`)).items;
    const u = `https://environment.data.gov.uk/flood-monitoring/id/measures/${id}-level-tidal_level-i-15_min-mAOD/readings?startdate=${DATE}&enddate=${next(next(DATE))}&_sorted&_limit=1000`;
    const r = (await json(u)).items.map(x => [x.dateTime.replace(':00Z', 'Z'), x.value]).sort((a, b) => a[0] < b[0] ? -1 : 1);
    out[id] = { name, lat: s.lat, lon: s.long, url: u, readings: r };
  }
  save(`tide-${DATE}.json`, { source: 'Environment Agency real-time flood-monitoring API, tidal level readings', url: 'https://environment.data.gov.uk/flood-monitoring/doc/reference', fetched: new Date().toISOString(), licence: 'OGL v3.0',
    attribution: 'This uses Environment Agency flood and river level data from the real-time data API (Beta)', units: 'm AOD (Ordnance Datum Newlyn), 15-minute instantaneous readings, UTC', stations: out });
}

// 6. Star names: the IAU Catalog of Star Names (WGSN), the plain-text edition kept by the WGSN secretary (E. Mamajek).
// IAU products are under CC BY ("free to use ... as long as the source is mentioned"); the names are facts. Kept: the
// names of stars in our Bright Star Catalogue extract (joined by HR number), with the constellation; columns are read
// by the positions of the header's column titles (names can hold spaces).
if (want('names')) {
  const u = 'https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt', txt = (await fetchRetry(u)).toString('utf8'), L = txt.split('\n');
  const head = L.find(l => l.startsWith('#Name/ASCII')), at = k => head.indexOf(k), cut = (l, a, b) => l.slice(at(a), b ? at(b) : undefined).trim();
  const stars = new Set(JSON.parse((await import('fs')).readFileSync(join(OUT, 'stars.json'), 'utf8')).stars.map(s => s[0])), names = [];
  for (const l of L) { if (!l.trim() || l.startsWith('#') || l.startsWith('$')) continue; const des = cut(l, 'Designation', 'ID'), m = /^HR (\d+)$/.exec(des); if (!m || !stars.has(+m[1])) continue;
    names.push([+m[1], cut(l, 'Name/Diacritics', 'Designation'), l.slice(at('Con'), at('Con') + 3).trim()]); }
  names.sort((a, b) => a[0] - b[0]);
  save('star-names.json', { source: 'IAU Catalog of Star Names (IAU-CSN), IAU Division C Working Group on Star Names (WGSN)', url: u, official: 'https://www.iau.org/public/themes/naming_stars/', fetched: today,
    licence: 'CC BY (IAU products: "free to use ... as long as the source is mentioned"); credit the IAU WGSN', fields: ['hr', 'name', 'constellation'], count: names.length, names });
}

// 7. Messier objects: the HEASARC MESSIER table (NASA GSFC; 109 objects, M 102 left out as a duplicate of M 101),
// compiled from Sky Catalog 2000.0 vol. 2 (Hirshfeld & Sinnott 1985). Positions J2000. A US Government (NASA) service:
// no copyright claimed. Not OpenNGC (CC BY-SA). Kept: number, NGC, RA, Dec, V, the largest dimension (arcmin), type, name.
if (want('messier')) {
  const u = 'https://heasarc.gsfc.nasa.gov/db-perl/W3Browse/w3query.pl?tablehead=name%3Dheasarc_messier&Action=Query&ResultMax=0&displaymode=BatchDisplay&Fields=All&Coordinates=Equatorial&Equinox=2000';
  const L = (await fetchRetry(u)).toString('utf8').split('\n'), head = L.find(l => l.startsWith('|name')).split('|').map(s => s.trim()), objs = [];
  for (const l of L) { if (!/^\|M /.test(l)) continue; const c = l.split('|').map(s => s.trim()), g = k => c[head.indexOf(k)];
    const [rh, rm, rs] = g('ra').split(/\s+/).map(Number), dd = g('dec'), sg = dd.startsWith('-') ? -1 : 1, [d, dm, ds] = dd.replace('-', '').split(/\s+/).map(Number);
    const dim = Math.max(...g('dimension').split(/X/i).map(Number).filter(isFinite));
    objs.push([+g('name').slice(2), g('alt_name'), Math.round((rh + rm / 60 + rs / 3600) * 15 * 1000) / 1000, Math.round(sg * (d + dm / 60 + ds / 3600) * 1000) / 1000, +g('vmag'), dim || null, g('object_type'), g('notes').toLowerCase().replace(/\b\w/g, x => x.toUpperCase()).replace(/(?!^)\b(Or|And|Of|The|In)\b/g, w => w.toLowerCase())]); }
  objs.sort((a, b) => a[0] - b[0]);
  save('messier.json', { source: 'HEASARC MESSIER table (NASA GSFC), compiled from Sky Catalog 2000.0 vol. 2 (Hirshfeld & Sinnott 1985)', url: 'https://heasarc.gsfc.nasa.gov/W3Browse/all/messier.html', request: u, fetched: today,
    licence: 'NASA HEASARC service, US Government work: no copyright claimed (public domain); positions and magnitudes are facts', fields: ['m', 'ngc', 'ra_deg_j2000', 'dec_deg_j2000', 'vmag', 'size_arcmin', 'type (OC open cluster, GB globular, DI diffuse nebula, PL planetary, S spiral, E elliptical, IR irregular)', 'name'], count: objs.length, objects: objs });
}

// 8. Cloud mask: EUMETSAT Meteosat (MSG, 0 degree) Cloud Mask (CLM), a Derived Product, so "Core" data under CC BY 4.0
// (EUMETSAT Data Policy, Articles 4 to 6). Rendered by EUMETView (WMS 1.3.0, colours: white cloud, green clear land,
// blue clear water) for a box 50.5-52.5 N, 1.6 W-1.6 E (about 220 x 220 km round London), 256 x 256 px, at the
// 15-minute slot nearest the owner's photo time (22:56 UTC on DATE: 23:00Z). Kept as the PNG the server sends.
// Attribution: "Contains modified EUMETSAT Meteosat data 2026". The page fetches other times itself (sky.js).
if (want('clouds')) {
  const slot = (args.find(a => /^\d{4}-\d\d-\d\dT\d\d:\d\dZ$/.test(a)) || `${DATE}T23:00Z`), box = [50.5, -1.6, 52.5, 1.6];
  const u = `https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=msg_fes:clm&styles=&crs=EPSG:4326&bbox=${box.join(',')}&width=256&height=256&format=image/png&time=${slot.replace('Z', ':00.000Z')}`;
  const png = await fetchRetry(u), f = `clm-${slot.replace(/[-:]/g, '')}.png`;
  writeFileSync(join(OUT, f), png); console.log(`wrote docklands/data/sky/${f} (${(png.length / 1024).toFixed(1)} KB) from ${u}`);
}

// 9. London City Airport runway 09/27 thresholds from OpenStreetMap (ODbL, tracked: way 340355375 and its two
// displaced-threshold ways), read from the local Greater London extract with osmium (no network), for the approach
// paths drawn on the 3D page. The 5.5 degree glide path is a published fact (UK AIP EGLC AD 2.24 charts; the AIP itself
// is not copied); 15 m threshold crossing height assumed (50 ft, the usual figure).
if (want('lcy')) {
  const { execFileSync } = await import('child_process'), { tmpdir } = await import('os'), T = join(tmpdir(), 'lcy-' + process.pid), PBF = join(TOOLS, '..', 'data', 'raw', 'docklands', 'greater_london-latest.osm.pbf');
  execFileSync('osmium', ['extract', '-b', '0.03,51.495,0.08,51.51', PBF, '-o', T + '.pbf', '--overwrite']);
  execFileSync('osmium', ['tags-filter', T + '.pbf', 'w/aeroway=runway', '-o', T + '-rw.pbf', '--overwrite']);
  execFileSync('osmium', ['export', T + '-rw.pbf', '-f', 'geojson', '-o', T + '.geojson', '--overwrite', '--add-unique-id=type_id']);
  const g = JSON.parse((await import('fs')).readFileSync(T + '.geojson', 'utf8')), rw = g.features.find(f => f.properties.ref === '09/27' && f.geometry.type === 'LineString');
  const c = rw.geometry.coordinates, w = c[0][0] < c[c.length - 1][0] ? c[0] : c[c.length - 1], e = c[0][0] < c[c.length - 1][0] ? c[c.length - 1] : c[0];
  save('lcy-approach.json', { source: 'OpenStreetMap, Greater London extract (openstreetmap.fr), runway way ' + rw.id, licence: 'ODbL 1.0, © OpenStreetMap contributors', fetched: today,
    note: 'landing thresholds = the ends of the main runway way (the displaced-threshold ways are left out); glide path and crossing height are published figures, not OSM',
    runway: { ref: '09/27', osm: rw.id, length_m: +rw.properties.length || null, heading_tag: rw.properties.heading || null },
    thresholds: [{ rwy: '09', lon: w[0], lat: w[1], approach_from: 'west' }, { rwy: '27', lon: e[0], lat: e[1], approach_from: 'east' }], aerodrome_elevation_m: 6, glide_path_deg: 5.5, threshold_crossing_height_m: 15 });
}
