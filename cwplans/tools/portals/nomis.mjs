// Nomis Census 2021 bulk downloads, for walk-portals.mjs. Nomis robots.txt disallows /api/v01/dataset/ (the API) and
// /query/: this adapter reads only the bulk page and the bulk zips under /output/census/2021/ (allowed). Rules and
// reasons: skills/cwplans-open-portals/SKILL.md, "Nomis".
import { readFileSync, existsSync, statSync, rmSync } from 'fs';
import { join } from 'path';
import { execFileSync, spawn } from 'child_process';
import { createInterface } from 'readline';
import { politeFetch, rawFile, RAWP, OUT, today, ZONE_TEXT, writeLines, zoneRefs , outExists, writeOut } from '../walk-portals.mjs';

const BASE = 'https://www.nomisweb.co.uk';
const PAGE = `${BASE}/sources/census_2021_bulk`;
const CAT = join(OUT, 'nomis', 'catalogue.json');
const readJson = f => JSON.parse(readFileSync(f, 'utf8'));
const LICENCE = 'Open Government Licence v3.0';
const ATTRIB = 'Source: Office for National Statistics licensed under the Open Government Licence v3.0 (Census 2021, via Nomis bulk downloads)';

export async function walk() {
  const { file } = await rawFile('nomis/census_2021_bulk.html', PAGE);
  const html = readFileSync(file, 'utf8');
  const rows = []; let topic = null;
  for (const tr of html.split(/<tr/i).slice(1)) {
    const h2 = /<h2>([^<]+)<\/h2>/.exec(tr); if (h2) { topic = h2[1].trim(); continue; }
    const code = /<strong>([A-Z]{2}\d{3}[A-Z]?)<\/strong>/.exec(tr); if (!code) continue;
    const title = [...tr.matchAll(/<td[^>]*nowrap>([^<]+)<\/td>/g)].map(m => m[1].trim()).find(t => t && t !== code[1]);
    const zips = [...tr.matchAll(/href="(\/output\/census\/2021\/[^"]+\.zip)"/g)].map(m => BASE + m[1]);
    rows.push({ table: code[1], title, topic, zips });
  }
  writeLines(CAT, { portal: 'Nomis Census 2021 bulk downloads', page: PAGE, walked: today, licence: LICENCE,
    robots: 'https://www.nomisweb.co.uk/robots.txt disallows /query/, /api/v01/dataset/, /api/v01/codelist/ and /api/v01/concept/ for every agent (read 2026-10-04): the Nomis API is not used; the bulk zips under /output/ are allowed',
    rule: 'every table row of the bulk page: table code, title, topic heading, zip links (main zip: output areas up to countries; -extra: other geographies)' }, 'tables', rows);
  console.log(`${rows.length} tables`);
}

// the curated harvest: topic summaries most useful for the zone, at output area (the finest; LSOA, MSOA and ward
// totals can be summed from OAs through the ONS lookup)
export const ALL = process.argv.includes('--all');
export const HARVEST = ['TS001', 'TS003', 'TS007A', 'TS011', 'TS017', 'TS021', 'TS030', 'TS037', 'TS038', 'TS044', 'TS045', 'TS050', 'TS054', 'TS058', 'TS061', 'TS062', 'TS066', 'TS067', 'TS004', 'TS029'];
// by hand, from the zips (2026-10-04)
const JUDGED = {
  TS009: ['not-relevant', 'published from local authority up only (no OA, LSOA or MSOA file in the zip)'],
  TS012: ['not-relevant', 'published from local authority up only'], TS024: ['not-relevant', 'published from local authority up only'],
  TS070: ['not-relevant', 'published from local authority up only'], TS076: ['not-relevant', 'published from local authority up only'],
  TS079: ['unavailable', 'census2021-ts079.zip is not a readable zip (End-of-central-directory signature not found), twice on 2026-10-04'],
};
export async function triage() {
  const cat = readJson(CAT);
  const rows = cat.tables.map(t => {
    const keys = ['oa', 'lsoa', 'msoa'].map(l => `census2021-${t.table.toLowerCase()}-${l}`), key = keys.find(k => outExists(join(OUT, 'nomis', k, `${k}.json`)));
    let state, rule, why;
    if (key) { state = 'harvested'; rule = 'N1'; why = `feeds/portals/nomis/${key}/ (zone ${key.endsWith('-oa') ? 'output areas' : key.endsWith('-lsoa') ? 'LSOAs: no OA file in the zip' : 'MSOAs: no OA or LSOA file in the zip'})`; }
    else if (JUDGED[t.table]) { [state, why] = JUDGED[t.table]; rule = 'N0'; }
    else if (!t.zips.length) { state = 'unavailable'; rule = 'N2'; why = 'no zip on the bulk page'; }
    else { state = 'listed-for-harvest'; rule = 'N3'; why = 'open (OGL), output-area rows for the zone; not in the curated first set'; }
    return { table: t.table, title: t.title, topic: t.topic, state, rule, reason: why };
  });
  const counts = {}; for (const r of rows) counts[r.state] = (counts[r.state] || 0) + 1;
  writeLines(join(OUT, 'nomis', 'triage.json'), { portal: 'Nomis Census 2021 bulk downloads', triaged: today, counts,
    rules: ['N0 by hand (JUDGED: levels read from the zips)', 'N1 harvested: the zone output-area rows of the main zip (zone LSOA or MSOA rows when the zip has no finer file)', 'N2 unavailable', 'N3 listed-for-harvest: open, zone rows available, not in the curated set'],
    held_elsewhere: 'the London Datastore walk holds GLA census workbooks by ward and LSOA (demography and migration, housing, labour market, qualifications and health: feeds/london-datastore/census2021-*); these OA rows are finer and come straight from the ONS release' }, 'tables', rows);
  console.log(counts);
}

export async function harvest(keys) {
  const cat = readJson(CAT), refs = zoneRefs();
  const zoneOA = new Set([...refs.code].filter(([, k]) => k === 'oa21').map(([c]) => c)), zoneLSOA = new Set([...refs.code].filter(([, k]) => k === 'lsoa21').map(([c]) => c)), zoneMSOA = new Set([...refs.code].filter(([, k]) => k === 'msoa21').map(([c]) => c));
  const sizes = {};
  for (const code of (keys.length ? keys.map(k => k.toUpperCase()) : ALL ? cat.tables.map(t => t.table) : HARVEST)) {
    const t = cat.tables.find(x => x.table === code); if (!t) { console.warn(`no table ${code}`); continue; }
    const zip = t.zips.find(z => !/-extra\.zip$/.test(z)); const name = zip.split('/').pop();
    const { file, fetched } = await rawFile(`nomis/${name}`, zip);
    let entries; try { entries = execFileSync('unzip', ['-Z1', file]).toString().split('\n'); } catch (e) { console.warn(`${code}: zip not readable (${String(e.message).slice(0, 60)})`); rmSync(file); continue; }
    // output areas where the table has them; else LSOA (some tables are published only from LSOA up)
    const sizes = Object.fromEntries(execFileSync('unzip', ['-l', file]).toString().split('\n').map(l => /^\s*(\d+)\s+\S+\s+\S+\s+(\S+)$/.exec(l)).filter(Boolean).map(m => [m[2], +m[1]]));
    // an empty CSV in the zip is skipped (TS010 has 0-byte OA and LSOA files: fault F45)
    const level = ['oa', 'lsoa', 'msoa'].find(l => entries.some(e => new RegExp(`-${l}\\.csv$`).test(e) && sizes[e] > 0)) || null;
    const emptyFiles = entries.filter(e => /\.csv$/.test(e) && sizes[e] === 0);
    const entry = level && entries.find(e => new RegExp(`-${level}\\.csv$`).test(e)); if (!entry) { console.warn(`${code}: no OA, LSOA or MSOA file`); continue; }
    const zoneSet = level === 'oa' ? zoneOA : level === 'lsoa' ? zoneLSOA : zoneMSOA;
    const meta_txt = entries.find(e => /^metadata\//.test(e));
    let header = null, keepIdx = []; const rows = [];
    const p = spawn('unzip', ['-p', file, entry]);
    for await (const line of createInterface({ input: p.stdout })) {
      const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map(c => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
      if (!header) { header = cells; keepIdx = header.map((h, i) => i).filter(i => i >= 3 && header[i].trim()); continue; }
      if (zoneSet.has(cells[2])) rows.push([cells[2], ...keepIdx.map(i => cells[i] === '' ? null : +cells[i])]);
    }
    if (!process.argv.includes('--keep-raw')) rmSync(file);      // disk: a zip is 2-60 MB and the zone rows are all that is used
    const key = `census2021-${code.toLowerCase()}-${level}`;
    const columns = [`${level}21`, ...keepIdx.map(i => header[i].replace(/; measures: Value$/, ''))];
    const meta = { source: `Census 2021 ${code}: ${t.title} (ONS, Nomis bulk download)`, table: code, topic: t.topic, page: PAGE, file: zip, entry, metadata_entry: meta_txt || null, fetched,
      licence: LICENCE, licence_url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/', attribution: ATTRIB,
      zone: ZONE_TEXT, method: `walk-portals.mjs nomis harvest ${code}: the output-area CSV of the bulk zip, streamed; rows kept whose ${level.toUpperCase()} 2021 code is a zone code (feeds/london-datastore/zone-codes.json ${level}21: an ONSPD postcode in the box carries it, ${zoneSet.size} areas; tables without an OA file are read at the next level the zip has: LSOA, then MSOA); values as published (counts; percentages where the table has them). Join to LSOA/MSOA/ward through the ONS OA lookup (feeds/portals/onsgeo/)`,
      empty_files_in_zip: emptyFiles.length ? emptyFiles : undefined, what: `${t.title} by ${level === 'oa' ? 'output area' : level.toUpperCase()}: ${columns.length - 1} columns`, counts: { rows: rows.length, zone_areas: zoneSet.size, level, columns: columns.length } };
    const n = writeLines(join(OUT, 'nomis', key, `${key}.json`), { ...meta, columns }, 'rows', rows);
    sizes[key] = n; console.log(`${key}: ${rows.length} rows x ${columns.length}, ${(n / 1e3).toFixed(0)} kB`);
  }
  console.log((Object.values(sizes).reduce((a, b) => a + b, 0) / 1e6).toFixed(2), 'MB');
}
