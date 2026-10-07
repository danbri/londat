#!/usr/bin/env node
// Canary Wharf postcodes: actual (ONS Postcode Directory) vs possible (every valid unit code in the sectors),
// classified by the official ward, the model's estate box and OSM addresses; then postcode-keyed queries
// against open web sources.
//   node cwplans/tools/postcodes.mjs fetch    # ONSPD rows for the districts, ward names, ward boundary, OSM addresses
//   node cwplans/tools/postcodes.mjs osm      # only the OSM address tally (no network)
//   node cwplans/tools/postcodes.mjs build    # -> cwplans/postcodes/postcodes.json, .csv, canary-wharf-ward.geojson
//   node cwplans/tools/postcodes.mjs query    # -> cwplans/postcodes/queries.json (GOV.UK, Wikipedia, FSA, Wikidata)
// Method, definitions and limits: cwplans/postcodes/README.md.
import { readFileSync, writeFileSync, mkdirSync, existsSync, createReadStream } from 'fs';
import { gzipSync, gunzipSync } from 'zlib';
import { join } from 'path';
import { Writable } from 'stream';
import { createRequire } from 'module';
import { TOOLS, RAW, get, sparql } from './lib.mjs';
import { osmList } from './osm-values.mjs';
import { DIR as DOCK, ORIGIN } from './fetch-docklands.mjs';

const OUT = join(TOOLS, '..', 'postcodes'), PRAW = join(RAW, 'postcodes');
const ONSPD = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/ONS_Postcode_Directory_(August_2026)_(Hosted_Table)/FeatureServer/0';
const WARDS = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/WD_MAY_2026_UK_BFE/FeatureServer/0';
const DISTRICTS = ['E14'];                       // postcode districts enumerated in full
const CW_WARD = 'E05009323';                     // Tower Hamlets ward "Canary Wharf" (ONS); One Canada Square, E14 5AB, is in it
// The 3D model's Canary Wharf box (Canary Wharf estate, Wood Wharf, Crossrail Place, Heron Quays): see osm-clip-docklands.mjs FOCUS
const BOX = [-0.0300, 51.4980, -0.0050, 51.5100];
// Unit letters: Royal Mail never uses C I K M O V in the inward code's last two letters.
const UNIT_LETTERS = 'ABDEFGHJLNPQRSTUWXYZ';
const norm = pc => pc.toUpperCase().replace(/\s+/g, '').replace(/^(.+)(\d[A-Z]{2})$/, '$1 $2');
const UA = { headers: { 'User-Agent': 'glitchcan-cwplans/0.1 (https://github.com/danbri/londat)' } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchAll() {
  mkdirSync(PRAW, { recursive: true });
  const fields = 'pcds,dointr,doterm,usrtypind,east1m,north1m,gridind,lat,long,wd26cd,lad26cd,oa21cd,lsoa21cd';
  const rows = [];
  // Two steps: the object ids for the district (one query), then the rows by id in batches. Filtering the
  // UK-wide table by pcds with many output fields times out (504 or a generic "invalid query parameters").
  for (const d of DISTRICTS) {
    const ids = JSON.parse(await get(`${ONSPD}/query?where=${encodeURIComponent(`pcds LIKE '${d} %'`)}&returnIdsOnly=true&f=json`)).objectIds;
    for (let i = 0; i < ids.length; i += 200) {
      for (let a = 1; ; a++) {
        try {
          const j = JSON.parse(await get(`${ONSPD}/query?objectIds=${ids.slice(i, i + 200).join(',')}&outFields=${fields}&f=json`));
          if (j.error) throw new Error(JSON.stringify(j.error));
          rows.push(...j.features.map(f => f.attributes)); break;
        } catch (e) { if (a >= 4) throw e; await sleep(4000 * a); }
      }
    }
  }
  writeFileSync(join(PRAW, 'onspd-aug2026.json.gz'), gzipSync(JSON.stringify({ source: ONSPD, fetched: new Date().toISOString().slice(0, 10), rows })));
  // ward names for every ward the rows touch; the Canary Wharf ward polygon (WGS84) for maps
  const wards = [...new Set(rows.map(r => r.wd26cd).filter(Boolean))];
  const names = JSON.parse(await get(`${WARDS}/query?where=${encodeURIComponent(`WD26CD IN (${wards.map(w => `'${w}'`).join(',')})`)}&outFields=WD26CD,WD26NM,LAD26NM&returnGeometry=false&f=json`));
  const poly = JSON.parse(await get(`${WARDS}/query?where=${encodeURIComponent(`WD26CD='${CW_WARD}'`)}&outFields=WD26CD,WD26NM&outSR=4326&f=geojson`));
  writeFileSync(join(PRAW, 'wards.json'), JSON.stringify({ names: names.features.map(f => f.attributes), canaryWharf: poly }));
  const osm = await osmAddresses();
  console.log(`ONSPD rows ${rows.length}; wards ${names.features.length}; OSM addressed postcodes ${Object.keys(osm).length}`);
}

// OSM addresses in the districts, from the Greater London extract if present (fetch-docklands.mjs osm). No network.
async function osmAddresses() {
  mkdirSync(PRAW, { recursive: true });
  const pbf = join(DOCK, 'greater_london-latest.osm.pbf'), osm = {};
  if (existsSync(pbf)) {
    const parse = createRequire(import.meta.url)('osm-pbf-parser');
    await new Promise((res, rej) => createReadStream(pbf).pipe(parse()).pipe(new Writable({
      objectMode: true,
      write(items, e, next) {
        for (const it of items) {
          for (const pc of osmList(it.tags?.['addr:postcode'])) {   // a ";" list counts the feature under each postcode (F2)
            const n = norm(pc); if (!DISTRICTS.some(d => n.startsWith(d + ' '))) continue;
            const o = (osm[n] ||= { features: 0, streets: {}, kinds: {} }); o.features++;
            if (it.tags['addr:street']) o.streets[it.tags['addr:street']] = (o.streets[it.tags['addr:street']] || 0) + 1;
            const k = it.tags.shop ? 'shop' : it.tags.amenity ? 'amenity:' + it.tags.amenity : it.tags.office ? 'office' : it.tags.building ? 'building' : it.tags.entrance ? 'entrance' : 'other';
            o.kinds[k] = (o.kinds[k] || 0) + 1;
          }
        }
        next();
      },
    })).on('finish', res).on('error', rej));
  }
  writeFileSync(join(PRAW, 'osm-addr-postcodes.json'), JSON.stringify(osm));
  return osm;
}

function build() {
  const { rows, fetched } = JSON.parse(gunzipSync(readFileSync(join(PRAW, 'onspd-aug2026.json.gz'))));
  const { names, canaryWharf } = JSON.parse(readFileSync(join(PRAW, 'wards.json'), 'utf8'));
  const osm = existsSync(join(PRAW, 'osm-addr-postcodes.json')) ? JSON.parse(readFileSync(join(PRAW, 'osm-addr-postcodes.json'), 'utf8')) : {};
  const wardName = Object.fromEntries(names.map(n => [n.WD26CD, n.WD26NM]));
  const byPc = new Map(rows.map(r => [norm(r.pcds), r]));
  // every sector in the districts that ONSPD knows, and every syntactically valid unit in those sectors
  const sectors = [...new Set(rows.map(r => norm(r.pcds).slice(0, -2)))].sort();
  const out = [];
  for (const sec of sectors) for (const a of UNIT_LETTERS) for (const b of UNIT_LETTERS) {
    const pc = sec + a + b, r = byPc.get(pc);
    const e = { pc, sector: sec.trim() };
    if (!r) { out.push({ ...e, status: 'never' }); continue; }
    const live = !r.doterm, lat = r.lat, lon = r.long, d = Math.round(Math.hypot(r.east1m - ORIGIN.E0, r.north1m - ORIGIN.N0));
    const inBox = lon >= BOX[0] && lon <= BOX[2] && lat >= BOX[1] && lat <= BOX[3];
    const o = osm[pc];
    out.push({
      ...e, status: live ? 'live' : 'terminated', introduced: r.dointr, terminated: r.doterm || null, large_user: r.usrtypind === 1,
      ward: r.wd26cd, ward_name: wardName[r.wd26cd] || null, in_cw_ward: r.wd26cd === CW_WARD, in_cw_box: inBox,
      lat, lon, e: r.east1m, n: r.north1m, grid_quality: r.gridind, m_from_one_canada_sq: d,
      ...(o ? { osm_features: o.features, osm_streets: Object.entries(o.streets).sort((x, y) => y[1] - x[1]).slice(0, 3).map(s => s[0]), osm_kinds: o.kinds } : {}),
    });
  }
  // tiers: what "a Canary Wharf postcode" can mean, strongest first
  for (const p of out) p.tier = p.status === 'never' ? 'possible-unallocated' : p.status === 'terminated' ? (p.in_cw_ward || p.in_cw_box ? 'terminated-cw' : 'terminated-other')
    : p.in_cw_box && p.in_cw_ward ? 'cw-core' : p.in_cw_ward ? 'cw-ward' : p.in_cw_box ? 'cw-box-other-ward' : 'e14-other';
  const count = f => out.filter(f).length, tiers = {};
  for (const p of out) tiers[p.tier] = (tiers[p.tier] || 0) + 1;
  const summary = {
    generated: new Date().toISOString().slice(0, 10), onspd: 'ONS Postcode Directory, August 2026 (hosted table), fetched ' + fetched, districts: DISTRICTS, sectors: sectors.map(s => s.trim()),
    candidates: out.length, live: count(p => p.status === 'live'), terminated: count(p => p.status === 'terminated'), never: count(p => p.status === 'never'),
    tiers, cw_ward: { code: CW_WARD, name: wardName[CW_WARD] }, box: BOX, large_user_live_cw: count(p => p.status === 'live' && p.large_user && (p.in_cw_ward || p.in_cw_box)),
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'postcodes.json'), JSON.stringify({ summary, postcodes: out }, null, 0).replace(/\},\{/g, '},\n{'));
  const cols = ['pc', 'sector', 'status', 'tier', 'introduced', 'terminated', 'large_user', 'ward', 'ward_name', 'in_cw_ward', 'in_cw_box', 'lat', 'lon', 'm_from_one_canada_sq', 'osm_features', 'osm_streets'];
  const csv = [cols.join(','), ...out.filter(p => p.status !== 'never').map(p => cols.map(c => { const v = Array.isArray(p[c]) ? p[c].join('; ') : p[c] ?? ''; return /[,"]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v; }).join(','))].join('\n');
  writeFileSync(join(OUT, 'postcodes.csv'), csv + '\n');
  writeFileSync(join(OUT, 'canary-wharf-ward.geojson'), JSON.stringify(canaryWharf));
  console.log(JSON.stringify(summary, null, 1));
}

// ---- postcode-keyed queries against open sources (sequential per host, about 1 request a second)
// GOV.UK: an allow-list of document types. Tribunal decisions are never requested: their titles name private people.
const GOVUK_FORMATS = ['news_story', 'press_release', 'notice', 'corporate_report', 'open_consultation', 'closed_consultation', 'consultation_outcome', 'guidance', 'raib_report', 'maib_report', 'aaib_report', 'cma_case', 'official_statistics', 'transparency', 'policy_paper', 'statutory_guidance'];
async function query(tiers) {
  const { postcodes } = JSON.parse(readFileSync(join(OUT, 'postcodes.json'), 'utf8'));
  const want = postcodes.filter(p => tiers.includes(p.tier));
  const res = {};
  const j = async (url, extra = {}) => { const r = await fetch(url, { ...UA, ...extra, headers: { ...UA.headers, ...(extra.headers || {}) } }); if (!r.ok) throw new Error(`${r.status}`); return r.json(); };
  const govuk = async pc => { const q = `${GOVUK_FORMATS.map(f => `filter_format[]=${f}`).join('&')}&q=${encodeURIComponent(`"${pc}"`)}&count=10&fields=title,link,public_timestamp,format`; const d = await j(`https://www.gov.uk/api/search.json?${q}`); return { total: d.total, items: d.results.map(r => ({ title: r.title, url: 'https://www.gov.uk' + r.link, date: (r.public_timestamp || '').slice(0, 10), format: r.format })) }; };
  const wiki = async pc => { const d = await j(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`"${pc}"`)}&format=json&srlimit=10`); return { total: d.query.searchinfo.totalhits, items: d.query.search.map(s => ({ title: s.title, url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(s.title.replace(/ /g, '_')) })) }; };
  // FSA: entries without address lines are home-based businesses (address withheld by FSA); they are skipped.
  const fsa = async pc => { const d = await j(`https://api.ratings.food.gov.uk/Establishments?address=${encodeURIComponent(pc)}&pageSize=200`, { headers: { 'x-api-version': '2' } }); return { total: d.meta.totalCount, items: d.establishments.filter(e => norm(e.PostCode || '') === pc && (e.AddressLine1 || e.AddressLine2)).map(e => ({ name: e.BusinessName, type: e.BusinessType, rating: e.RatingValue, rating_date: (e.RatingDate || '').slice(0, 10), new_rating_pending: e.NewRatingPending, fhrs_id: e.FHRSID, url: `https://ratings.food.gov.uk/business/${e.FHRSID}` })) }; };
  const hosts = { govuk, wiki, fsa };
  await Promise.all(Object.entries(hosts).map(async ([h, fn]) => {
    for (const p of want) {
      for (let a = 1; ; a++) { try { (res[p.pc] ||= {})[h] = await fn(p.pc); break; } catch (e) { if (a >= 3) { (res[p.pc] ||= {})[h] = { error: e.message }; break; } await sleep(3000 * a); } }
      await sleep(1000);
    }
  }));
  // Wikidata: items whose postal code (P281) is one of these postcodes, in batches
  for (let i = 0; i < want.length; i += 200) {
    const vals = want.slice(i, i + 200).map(p => `"${p.pc}"`).join(' ');
    const d = JSON.parse(await sparql(`SELECT ?i ?iLabel ?pc WHERE { VALUES ?pc { ${vals} } ?i wdt:P281 ?pc . SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`));
    for (const b of d.results.bindings) ((res[b.pc.value] ||= {}).wikidata ||= []).push({ item: b.i.value.split('/').pop(), label: b.iLabel.value });
  }
  // Web-search templates. Tested 2026-10-03: a bare postcode plus "events" returns noise ("E14" is also an MIT
  // building), and postcode plus "opening" returns opening-hours directories (useful as a list of occupiers,
  // not of openings). So every template pins the place, and openings use phrases that mean a change.
  const searchTerms = ['"Canary Wharf" event', '"Canary Wharf" "what\'s on"', '"Canary Wharf" "now open"', '"Canary Wharf" "opening soon"', '"Canary Wharf" "has closed"', '"Canary Wharf" "closing down"', '"Canary Wharf" pop-up', 'London exhibition', 'London concert', 'London market', 'London meetup', 'London "opening hours"'];
  const out = { generated: new Date().toISOString().slice(0, 10), tiers, postcodes: want.length, sources: { govuk: 'https://www.gov.uk/api/search.json (formats: ' + GOVUK_FORMATS.join(', ') + ')', wiki: 'https://en.wikipedia.org/w/api.php list=search', fsa: 'https://api.ratings.food.gov.uk/Establishments?address=', wikidata: 'P281 via https://query.wikidata.org/sparql' },
    search_engine_templates: searchTerms.map(t => `"{postcode}" ${t}`), results: res };
  writeFileSync(join(OUT, 'queries.json'), JSON.stringify(out, null, 1));
  const n = h => Object.values(res).filter(r => r[h] && !r[h].error && (r[h].total || r[h].length)).length;
  console.log(`queried ${want.length} postcodes: GOV.UK hits ${n('govuk')}, Wikipedia hits ${n('wiki')}, FSA hits ${n('fsa')}, Wikidata items ${Object.values(res).reduce((s, r) => s + (r.wikidata?.length || 0), 0)}`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'fetch') await fetchAll();
else if (cmd === 'osm') console.log(`OSM addressed postcodes ${Object.keys(await osmAddresses()).length}`);
else if (cmd === 'build') build();
else if (cmd === 'query') await query(rest.length ? rest : ['cw-core', 'cw-ward', 'cw-box-other-ward']);
else { console.error('usage: postcodes.mjs fetch | build | query [tier ...]'); process.exit(2); }
