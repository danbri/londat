#!/usr/bin/env node
// Regulatory and public registers for the Canary Wharf box and E14: schools, childcare, care and NHS sites,
// charities, gambling premises, sports sites, pubs and bars. One file per source.
//   NODE_USE_ENV_PROXY=1 node magpie/cwplans/tools/fetch-registers.mjs [source ...] [--refresh]
//   sources: gias cqc ods charities ofsted-childcare gambling active-places fsa-pubs (default: all)
// out: registry/sources/registers/<source>.json  {meta, records}; raw downloads in data/raw/registers/ (not committed).
// A raw file fetched earlier is reused unless --refresh is given. Kept: postcode in E14, or a source coordinate
// inside the registry box. Licences, fields dropped and gaps: registry/sources/registers/README.md.
// Network: one request at a time per host, at least 1 s apart, backoff on 429 and 5xx.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { gunzipSync } from 'zlib';
import { spawnSync } from 'child_process';
import proj4 from 'proj4';
import { RAW, UA, bngProjector } from './lib.mjs';
import { ROOT, CW_BOX, normPc, inBox } from './registry-lib.mjs';

const RAWDIR = join(RAW, 'registers');
const OUTDIR = join(ROOT, 'registry', 'sources', 'registers');
mkdirSync(RAWDIR, { recursive: true }); mkdirSync(OUTDIR, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const args = process.argv.slice(2), REFRESH = args.includes('--refresh');
if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) console.warn('warning: HTTPS_PROXY is set but NODE_USE_ENV_PROXY is not; Node fetch will not use the proxy');

// ---- polite fetch: a queue per host, >= 1 s between requests, retry with growing pauses on 429 and 5xx
const hostQ = new Map();
function politeFetch(url, { minGapMs = 1000, tries = 6, ...opts } = {}) {
  const host = new URL(url).host;
  const q = hostQ.get(host) || { chain: Promise.resolve(), last: 0 };
  hostQ.set(host, q);
  const run = async () => {
    for (let k = 1; ; k++) {
      const wait = q.last + minGapMs - Date.now(); if (wait > 0) await sleep(wait);
      q.last = Date.now();
      let r, err;
      try { r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } }); } catch (e) { err = e; }
      if (r && r.ok) { const b = Buffer.from(await r.arrayBuffer()); q.last = Date.now(); return b; }
      const retry = err || r.status === 429 || r.status >= 500;
      if (!retry || k >= tries) throw new Error(`${err ? err.message : r.status} ${url}`);
      const ra = r && +r.headers.get('retry-after');
      await sleep(ra ? ra * 1000 : minGapMs * 2 ** k);
    }
  };
  const p = q.chain.then(run, run); q.chain = p.catch(() => {}); return p;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJson = async (url, o) => JSON.parse((await politeFetch(url, o)).toString('utf8'));
// raw file cache: reuse unless --refresh
async function rawFile(name, url, o) {
  const f = join(RAWDIR, name);
  if (!REFRESH && existsSync(f) && statSync(f).size > 0) return { file: f, fetched: statSync(f).mtime.toISOString().slice(0, 10), reused: true };
  writeFileSync(f, await politeFetch(url, o));
  return { file: f, fetched: today, reused: false };
}

// ---- RFC 4180 CSV over a whole string (quoted fields may hold commas and newlines)
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const objects = (rows, headerIdx) => { const h = rows[headerIdx].map(s => s.replace(/^﻿/, '').trim()); return rows.slice(headerIdx + 1).filter(r => r.length > 1).map(r => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()]))); };
const clean = s => (s ?? '').replace(/\s+/g, ' ').trim() || null;
const joinAddr = (...xs) => xs.map(clean).filter(Boolean).join(', ') || null;
const dmy = s => { const m = /^(\d{1,2})[/-](\d{1,2}|[A-Za-z]{3})[/-](\d{4})/.exec(s || ''); if (!m) return clean(s); const mon = isNaN(+m[2]) ? 'JanFebMarAprMayJunJulAugSepOctNovDec'.indexOf(m[2].slice(0, 1).toUpperCase() + m[2].slice(1, 3).toLowerCase()) / 3 + 1 : +m[2]; return `${m[3]}-${String(mon).padStart(2, '0')}-${m[1].padStart(2, '0')}`; };
const epoch = v => v == null ? null : new Date(v).toISOString().slice(0, 10);
const num = v => v === '' || v == null || isNaN(+v) ? null : +v;

// ---- postcodes: E14 from ONSPD (postcodes/postcodes.json): centre and whether the centre lies in the box
const PC = new Map(JSON.parse(readFileSync(join(ROOT, 'postcodes', 'postcodes.json'), 'utf8')).postcodes.map(p => [p.pc, p]));
// Place a record: source coordinates first, else the postcode centre. Decide box and E14 membership.
function place(rec, lat, lon) {
  rec.postcode = normPc(rec.postcode) || clean(rec.postcode);
  const p = PC.get(rec.postcode);
  if (lat != null && lon != null && !isNaN(lat) && !isNaN(lon) && lat !== 0) { rec.lat = +(+lat).toFixed(6); rec.lon = +(+lon).toFixed(6); rec.position = 'source'; }
  else if (p && p.lat) { rec.lat = +p.lat; rec.lon = +p.lon; rec.position = 'postcode centre (ONSPD)'; }
  else { rec.lat = rec.lon = null; rec.position = null; }
  rec.in_e14 = /^E14 /.test(rec.postcode || '');
  rec.in_box = rec.position === 'source' ? inBox(rec.lon, rec.lat, CW_BOX) : !!(p && p.in_cw_box);
  rec.postcode_status = p ? p.status : null;
  return rec;
}
const keep = r => r.in_e14 || r.in_box;
function tally(records, key) { const c = {}; for (const r of records) { const k = r[key] ?? '(none)'; c[k] = (c[k] || 0) + 1; } return Object.fromEntries(Object.entries(c).sort((a, b) => b[1] - a[1])); }
function write(name, meta, records) {
  records.sort((a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
  meta.counts = { ...(meta.counts || {}), kept: records.length, e14: records.filter(r => r.in_e14).length, in_box: records.filter(r => r.in_box).length,
    in_box_by_source_coordinate: records.filter(r => r.in_box && r.position === 'source').length, without_position: records.filter(r => r.lat == null).length,
    by_kind: tally(records, 'kind'), by_status: tally(records, 'status') };
  meta.box = CW_BOX; meta.generated = today; meta.produced_by = 'tools/fetch-registers.mjs';
  meta.membership = 'in_box: the source coordinate lies in the box, or (no source coordinate) the ONSPD centre of the postcode does; in_e14: postcode district E14. Kept: either.';
  writeFileSync(join(OUTDIR, `${name}.json`), JSON.stringify({ meta, records }, null, 1) + '\n');
  console.log(`${name}: ${records.length} kept (${meta.counts.in_box} in the box, ${meta.counts.e14} in E14)`);
}

// =====================================================================================================
const SOURCES = {
  // DfE Get Information About Schools: every establishment in England, open and closed (OGL v3).
  async gias() {
    let got, url;
    const cached = readdirSync(RAWDIR).filter(f => /^edubasealldata\d{8}\.csv$/.test(f)).sort().at(-1);
    const urlFor = ds => `https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata${ds}.csv`;
    if (cached && !REFRESH) { url = urlFor(cached.slice(14, 22)); got = { file: join(RAWDIR, cached), fetched: statSync(join(RAWDIR, cached)).mtime.toISOString().slice(0, 10) }; }
    for (let d = 0; d < 10 && !got; d++) {
      const ds = new Date(Date.now() - d * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
      url = urlFor(ds);
      try { got = await rawFile(`edubasealldata${ds}.csv`, url); } catch (e) { if (!/^404/.test(e.message)) throw e; }
    }
    const text = new TextDecoder('windows-1252').decode(readFileSync(got.file));
    const all = objects(parseCsv(text), 0);
    await bngProjector(); const toWgs = proj4('EPSG:4326', 'BNG');
    const recs = [];
    for (const e of all) {
      if (!/^E14/i.test(e.Postcode || '') && !(+e.Easting > 536000 && +e.Easting < 539000 && +e.Northing > 179000 && +e.Northing < 181500)) continue;
      const [lon, lat] = +e.Easting ? toWgs.inverse([+e.Easting, +e.Northing]) : [null, null];
      const corr = /Overseas/i.test(e['LA (name)'] || '') || /^C\/O\b/i.test(e.Street || '');
      const r = place({
        id: `urn:${e.URN}`, urn: e.URN, name: clean(e.EstablishmentName), kind: clean(e['TypeOfEstablishment (name)']), group: clean(e['EstablishmentTypeGroup (name)']),
        phase: clean(e['PhaseOfEducation (name)']), address: joinAddr(e.Street, e.Locality, e.Address3, e.Town), postcode: e.Postcode,
        status: clean(e['EstablishmentStatus (name)']), opened: dmy(e.OpenDate), closed: dmy(e.CloseDate), close_reason: clean(e['ReasonEstablishmentClosed (name)']),
        ages: e.StatutoryLowAge ? `${e.StatutoryLowAge}-${e.StatutoryHighAge}` : null, pupils: num(e.NumberOfPupils), capacity: num(e.SchoolCapacity),
        trust: clean(e['Trusts (name)']), la: clean(e['LA (name)']), ukprn: clean(e.UKPRN), uprn: clean(e.UPRN),
        e: num(e.Easting), n: num(e.Northing), last_changed: dmy(e.LastChangedDate),
        address_role: corr ? 'correspondence address: the establishment is not here (overseas school administered from this address, or a c/o address)' : null,
        url: `https://get-information-schools.service.gov.uk/Establishments/Establishment/Details/${e.URN}`,
      }, lat, lon);
      if (keep(r)) recs.push(r);
    }
    write('gias', {
      source: 'DfE Get Information About Schools (GIAS), all establishments download', source_url: url, landing: 'https://get-information-schools.service.gov.uk/Downloads',
      fetched: got.fetched, licence: 'Open Government Licence v3.0', licence_url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
      licence_checked: 'footer of https://get-information-schools.service.gov.uk/Downloads, 2026-10-03: "Open Government Licence v3.0"', attribution: 'Contains public sector information licensed under the Open Government Licence v3.0 (DfE).',
      method: 'Daily CSV (windows-1252) of every establishment, open and closed; kept: E14 postcode, or Easting/Northing in the box. lat/lon converted from GIAS Easting/Northing (BNG) with OSTN15 (tools/lib.mjs bngProjector).',
      counts: { in_file: all.length, correspondence_addresses: recs.filter(r => r.address_role).length },
      fields_dropped: ['head teacher title, first name, last name and preferred job title', 'telephone', 'website', 'SEN, gender, religious character, admissions and other policy fields', 'Ofsted rating fields (Ofsted is the source for those)', 'census and FSM counts except NumberOfPupils'],
      note: 'GIAS Easting/Northing kept as e, n. "Fieldwork Overseas Establishments" (schools abroad; counts.correspondence_addresses) and other c/o rows give a correspondence address at 30 Skylines Village, E14 9TS: address_role marks them; they are not schools in E14 (same class as registered offices, SE-1).',
    }, recs);
  },

  // CQC care directory: every registered location (OGL v3).
  async cqc() {
    const page = (await politeFetch('https://www.cqc.org.uk/about-us/transparency/using-cqc-data')).toString('utf8');
    const url = (page.match(/https:\/\/www\.cqc\.org\.uk\/system\/files\/[^"]+_CQC_directory\.csv/i) || [])[0];
    if (!url) throw new Error('CQC directory CSV link not found on the using-cqc-data page');
    const got = await rawFile('cqc-directory.csv', url);
    const rows = parseCsv(readFileSync(got.file, 'utf8'));
    const hi = rows.findIndex(r => r[0] === 'Name' && r.includes('Postcode'));
    const produced = (rows.slice(0, hi).flat().join(' ').match(/produced on ([^,]+)/) || [])[1] || null;
    const all = objects(rows, hi), recs = [];
    for (const e of all) {
      const r = place({
        id: e['CQC Location ID (for office use only)'], name: clean(e.Name), also_known_as: clean(e['Also known as']), kind: [...new Set((e['Service types'] || '').split('|').map(x => x.trim()).filter(Boolean))].join('; ') || null,
        services: clean(e['Specialisms/services']), address: clean(e.Address), postcode: e.Postcode, status: 'registered',
        latest_check: dmy(e['Date of latest check']), provider: clean(e['Provider name']), provider_id: clean(e['CQC Provider ID (for office use only)']),
        la: clean(e['Local authority']), url: clean(e['Location URL']),
      });
      if (keep(r)) recs.push(r);
    }
    write('cqc', {
      source: 'CQC care directory (registered locations), CSV', source_url: url, landing: 'https://www.cqc.org.uk/about-us/transparency/using-cqc-data', edition: produced,
      fetched: got.fetched, licence: 'Open Government Licence v3.0', licence_url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
      licence_checked: 'https://www.cqc.org.uk/about-us/transparency/using-cqc-data, 2026-10-03: "Our data is made available under the Open Government Licence"; CQC asks users to acknowledge that they use CQC information',
      attribution: 'Contains CQC information, licensed under the Open Government Licence v3.0.',
      method: 'Monthly directory CSV of registered locations, filtered to E14 postcodes. No coordinates in this file: positions are ONSPD postcode centres.',
      counts: { in_file: all.length },
      fields_dropped: ['phone number', "service's website", 'region'],
      note: 'The ODS "HSCA Active Locations" file on the same page has registration dates, coordinates and registered manager names; not used (ODS spreadsheet, and manager names are personal).',
    }, recs);
  },

  // NHS Organisation Data Service, ORD API: organisations with an E14 postcode (OGL v3).
  async ods() {
    const base = 'https://directory.spineservices.nhs.uk/ORD/2-0-0/organisations';
    const listUrl = `${base}?PostCode=E14&Limit=1000`;
    const listFile = join(RAWDIR, 'ods-e14-list.json');
    let list;
    if (!REFRESH && existsSync(listFile)) list = JSON.parse(readFileSync(listFile, 'utf8'));
    else { list = (await getJson(listUrl)).Organisations; writeFileSync(listFile, JSON.stringify(list)); }
    list = list.filter(o => /^E14 /.test(normPc(o.PostCode) || ''));
    const detFile = join(RAWDIR, 'ods-e14-details.json');
    const det = !REFRESH && existsSync(detFile) ? JSON.parse(readFileSync(detFile, 'utf8')) : {};
    const roles = Object.fromEntries((await getJson('https://directory.spineservices.nhs.uk/ORD/2-0-0/roles')).Roles.map(r => [r.id, r.displayName]));
    let n = 0;
    for (const o of list) {
      if (det[o.OrgId]) continue;
      det[o.OrgId] = (await getJson(`${base}/${o.OrgId}`)).Organisation;
      if (++n % 25 === 0) { writeFileSync(detFile, JSON.stringify(det)); console.log(`ods: ${n} details`); }
    }
    writeFileSync(detFile, JSON.stringify(det));
    const title = s => s ? s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()) : s;
    const recs = list.map(o => {
      const d = det[o.OrgId] || {}, loc = d.GeoLoc?.Location || {}, op = (d.Date || []).find(x => x.Type === 'Operational') || {};
      const rl = d.Roles?.Role || [];
      return place({
        id: `ods:${o.OrgId}`, ods_code: o.OrgId, name: clean(o.Name), kind: title(o.PrimaryRoleDescription), primary_role: o.PrimaryRoleId,
        other_roles: rl.filter(r => !r.primaryRole).map(r => ({ id: r.id, name: roles[r.id] || null, status: r.Status, start: (r.Date || [])[0]?.Start || null, end: (r.Date || [])[0]?.End || null })),
        address: joinAddr(loc.AddrLn1, loc.AddrLn2, loc.AddrLn3, loc.Town), postcode: loc.PostCode || o.PostCode, uprn: loc.UPRN ? String(loc.UPRN) : null,
        status: o.Status, opened: op.Start || null, closed: op.End || null, last_changed: o.LastChangeDate, record_class: o.OrgRecordClass,
        url: `${base}/${o.OrgId}`,
      });
    }).filter(keep);
    write('ods', {
      source: 'NHS Organisation Data Service, ORD API 2-0-0 (organisations with a postcode starting E14)', source_url: listUrl, landing: 'https://digital.nhs.uk/services/organisation-data-service',
      fetched: statSync(listFile).mtime.toISOString().slice(0, 10), licence: 'Open Government Licence v3.0', licence_url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
      licence_checked: 'feeds/feeds.json entry nhs-ods-ord (OGL v3, 2026-10-03); the digital.nhs.uk page is behind a Cloudflare challenge for this client, so the statement was not re-read today',
      attribution: 'Contains NHS Organisation Data Service data, licensed under the Open Government Licence v3.0.',
      method: 'One list query (PostCode=E14, Limit=1000, active and inactive), then one detail request per organisation for address, UPRN, operational dates and roles. GP practices are "Prescribing Cost Centre" with the non-primary role RO76 (GP PRACTICE). No coordinates: positions are ONSPD postcode centres.',
      counts: { in_list: list.length, detail_requests_this_run: n },
      fields_dropped: ['telephone and other contacts', 'relationships (commissioner, ICB, PCN links)', 'succession records', 'County, Country'],
    }, recs);
  },

  // Charity Commission register of charities, full extract (OGL v3).
  async charities() {
    const url = 'https://ccewuksprdoneregsadata1.blob.core.windows.net/data/txt/publicextract.charity.zip';
    const got = await rawFile('publicextract.charity.zip', url);
    const out = spawnSync('unzip', ['-p', got.file], { maxBuffer: 1 << 30 });
    if (out.status !== 0) throw new Error('unzip failed: ' + out.stderr);
    const lines = out.stdout.toString('utf8').replace(/^﻿/, '').split(/\r\n/);
    const h = lines[0].split('\t');
    const recs = []; let inFile = 0;
    for (const line of lines.slice(1)) {
      if (!line) continue; inFile++;
      if (!/\tE14 ?\d|\tE14\t/i.test(line)) continue;
      const v = line.split('\t'), e = Object.fromEntries(h.map((k, i) => [k, v[i] ?? '']));
      const linked = e.linked_charity_number && e.linked_charity_number !== '0' ? e.linked_charity_number : null;
      const r = place({
        id: `charity:${e.registered_charity_number}${linked ? '-' + linked : ''}`, charity_number: e.registered_charity_number, linked_charity_number: linked,
        organisation_number: e.organisation_number, name: clean(e.charity_name), kind: clean(e.charity_type) || 'charity',
        address: joinAddr(e.charity_contact_address1, e.charity_contact_address2, e.charity_contact_address3, e.charity_contact_address4, e.charity_contact_address5),
        postcode: e.charity_contact_postcode, status: e.charity_registration_status === 'Registered' ? 'registered' : (e.charity_registration_status || '').toLowerCase() || null,
        registered: (e.date_of_registration || '').slice(0, 10) || null, removed: (e.date_of_removal || '').slice(0, 10) || null,
        latest_income: num(e.latest_income), latest_expenditure: num(e.latest_expenditure), company_number: clean(e.charity_company_registration_number),
        is_cio: e.charity_is_cio === 'True', website: clean(e.charity_contact_web),
        url: `https://register-of-charities.charitycommission.gov.uk/en/charity-search/-/charity-details/${e.organisation_number}`,
      });
      if (keep(r)) recs.push(r);
    }
    write('charities', {
      source: 'Charity Commission for England and Wales, register of charities full extract (publicextract.charity, tab-separated)', source_url: url,
      landing: 'https://register-of-charities.charitycommission.gov.uk/en/register/full-register-download', fetched: got.fetched,
      licence: 'Open Government Licence v3.0', licence_url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
      licence_checked: 'footer of the full-register-download page, 2026-10-03: "All content is available under the Open Government Licence v3.0, except where otherwise stated"',
      attribution: 'Contains Charity Commission data, licensed under the Open Government Licence v3.0.',
      method: 'Daily extract; rows whose contact postcode is in E14 (main charities and linked subsidiaries, registered and removed). No coordinates: positions are ONSPD postcode centres.',
      counts: { in_file: inFile },
      fields_dropped: ['contact phone', 'contact email', 'activities text', 'reporting status, accounting periods', 'gift aid, land, insolvency and administration flags'],
      caution: 'The address is the contact address the charity gives, not where it works. For small charities it is often a trustee\'s home or an accountant: do not read it as an occupant (same lesson as SE-1, registered offices).',
    }, recs);
  },

  // Ofsted management information: registered childcare providers (OGL v3). Childminders are REDACTED by Ofsted.
  async 'ofsted-childcare'() {
    const api = 'https://www.gov.uk/api/content/government/statistical-data-sets/childcare-providers-and-inspections-management-information';
    const atts = (await getJson(api)).details.attachments || [];
    const att = atts.filter(a => /\.csv$/i.test(a.url || '') && /(childcare provider(s)? data|most recent inspections data) (-\s*)?as at/i.test(a.title || '')).at(-1);
    if (!att) throw new Error('Ofsted childcare provider CSV not found');
    const asAt = (att.title.match(/as at (.+)$/i) || [])[1]?.trim() || null;
    const got = await rawFile(`ofsted-childcare-${(asAt || 'latest').replace(/\s+/g, '-')}.csv`, att.url);
    const rows = parseCsv(readFileSync(got.file, 'utf8'));
    const hi = rows.findIndex(r => r.includes('Provider URN'));
    const all = objects(rows, hi), recs = []; let redacted = 0, personDropped = 0;
    const ORGLIKE = /\b(ltd|limited|llp|plc|cic|c\.i\.c|trust|school|schools|charity|council|association|group|services|nursery|nurseries|academy|church|college|university|club|centre|center|foundation|partnership|society|company|kids|care)\b/i;
    for (const e of all) {
      if (!e['Provider URN']) continue;
      if (e['Provider postcode'] === 'REDACTED') { if (/^E14/.test(e['Provider postcode'])) redacted++; continue; }
      const rp = clean(e['Registered person name']);
      const keepRp = rp && ORGLIKE.test(rp);
      if (rp && !keepRp && /^E14/i.test(e['Provider postcode'])) personDropped++;
      const r = place({
        id: `ofsted:${e['Provider URN']}`, urn: e['Provider URN'], name: clean(e['Provider name']), kind: clean(e['Provider type']), subtype: clean(e['Provider subtype']),
        address: joinAddr(e['Provider address line 1'], e['Provider address line 2'], e['Provider address line 3'], e['Provider town']), postcode: e['Provider postcode'],
        status: clean(e['Provider status']), registered: dmy(e['Registration date']), registers: clean(e['Individual register combinations']), places: num(e.Places),
        registered_person: keepRp ? rp : null,
        latest_inspection: dmy(e['EYR REIF: Most recent: Inspection date']) || dmy(e['EYR OEIF: Most recent: Full inspection date']) || dmy(e['CR: Most recent: Inspection date']),
        overall_effectiveness: clean(e['EYR OEIF/CIF: Most recent: Overall effectiveness']),
        url: `https://reports.ofsted.gov.uk/provider/16/${e['Provider URN']}`,
      });
      if (keep(r)) recs.push(r);
    }
    write('ofsted-childcare', {
      source: `Ofsted management information: childcare providers and inspections, provider-level CSV (${att.title})`, source_url: att.url, landing: 'https://www.gov.uk/government/statistical-data-sets/childcare-providers-and-inspections-management-information',
      edition: asAt, fetched: got.fetched, licence: 'Open Government Licence v3.0', licence_url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
      licence_checked: 'GOV.UK publication (all content on GOV.UK is OGL v3 unless stated otherwise), 2026-10-03', attribution: 'Contains Ofsted data, licensed under the Open Government Licence v3.0.',
      method: 'Latest provider-level CSV from the GOV.UK publication (attachment list read through the GOV.UK Content API), filtered to E14 postcodes. Rows that Ofsted redacts (childminders and home childcarers: name, address and postcode all "REDACTED") cannot be placed and are not kept. No coordinates: positions are ONSPD postcode centres.',
      counts: { in_file: all.length, redacted_rows_in_file: all.filter(e => e['Provider postcode'] === 'REDACTED').length, e14_registered_person_dropped: personDropped },
      fields_dropped: ['registered person URN', 'registered person name unless it looks like an organisation (Ltd, trust, school, ...)', 'constituency, region, deprivation band', 'inspection judgement sub-fields and inspection numbers'],
      note: 'The provider URL pattern reports.ofsted.gov.uk/provider/16/<URN> was checked for one E14 nursery (EY372099, HTTP 200, 2026-10-03).',
    }, recs);
  },

  // Gambling Commission register of gambling premises.
  async gambling() {
    const url = 'https://www.gamblingcommission.gov.uk/downloads/premises-licence-register.csv';
    const got = await rawFile('gambling-premises.csv', url);
    const all = objects(parseCsv(readFileSync(got.file, 'utf8')), 0), recs = [], seen = {};
    for (const e of all) {
      const pc = normPc(e.Postcode);
      if (!/^E14 /.test(pc || '')) continue;
      const base = `gc:${e['Account Number']}:${pc.replace(' ', '')}`; seen[base] = (seen[base] || 0) + 1;
      const r = place({
        id: `${base}:${seen[base]}`, name: clean(e['Address Line 1'])?.split(',')[0] || null, kind: clean(e['Premises Activity']),
        operator: clean(e['Account Name']), operator_account: e['Account Number'], address: joinAddr(e['Address Line 1'], e['Address Line 2'], e.City), postcode: pc,
        status: 'licensed', la: clean(e['Local Authority']),
        url: `https://www.gamblingcommission.gov.uk/public-register/business/detail/${e['Account Number']}`,
      });
      if (keep(r)) recs.push(r);
    }
    write('gambling', {
      source: 'Gambling Commission register of gambling premises (CSV download)', source_url: url, landing: 'https://www.gamblingcommission.gov.uk/public-register/premises/download',
      fetched: got.fetched, licence: 'Open Government Licence (as stated on the Commission\'s data.gov.uk record "Licensed gambling premises"; the download page itself states no licence)',
      licence_url: 'https://www.data.gov.uk/dataset/8dc9bef0-ad46-497b-9a74-30a6ce9d2f98/licensed-gambling-premises',
      licence_checked: 'data.gov.uk CKAN package_show 8dc9bef0-ad46-497b-9a74-30a6ce9d2f98, 2026-10-03: license_id uk-ogl, publisher Gambling Commission. Re-check with the Commission before production.',
      attribution: 'Contains Gambling Commission data, licensed under the Open Government Licence.',
      method: 'Whole register CSV, rows with an E14 postcode. The register has no premises id: id = gc:<operator account>:<postcode>:<n>. name = the first part of address line 1 (usually the trading name). The url is the operator\'s register page, not the premises. No dates, no coordinates (ONSPD postcode centres).',
      counts: { in_file: all.length },
      fields_dropped: [],
      note: 'The Commission says it cannot assure completeness or accuracy. Premises licences themselves are issued by the council (Tower Hamlets).',
    }, recs);
  },

  // Sport England Active Places: sites and their facilities (CC BY 4.0).
  async 'active-places'() {
    const B = 'https://services-eu1.arcgis.com/s9MgJChYyPlPX2Nk/arcgis/rest/services';
    const SF = 'siteid,sitename,sitealias,buildingname,buildingnumber,subbuildingname,thoroughfarename,dependentthoroughfare,dependentlocality,posttown,postcode,uprn,toid,easting,northing,lat,long,ownertypestr,managementtypestr,educationphase,recenddate,closurereason,recentrydate,reclastchkddate,startdate,localauthorityname';
    const q = (svc, layer, params) => `${B}/${svc}/FeatureServer/${layer}/query?` + new URLSearchParams({ outFields: SF, returnGeometry: 'false', f: 'json', ...params });
    const byPc = await getJson(q('GIS_Active_Places_Power_Sites', 0, { where: "postcode LIKE 'E14%'" }));
    const byBox = await getJson(q('GIS_Active_Places_Power_Sites', 0, { where: '1=1', geometry: CW_BOX.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' }));
    const sites = new Map(); for (const f of [...byPc.features, ...byBox.features]) sites.set(f.attributes.siteid, f.attributes);
    const ids = [...sites.keys()], facs = [];
    for (let i = 0; i < ids.length; i += 100) {
      for (let off = 0; ; off += 1000) {
        const r = await getJson(`${B}/GIS_Active_Places_Power_Facility/FeatureServer/1/query?` + new URLSearchParams({ where: `siteid IN (${ids.slice(i, i + 100).join(',')})`, outFields: 'siteid,facilityid,facilitytype,facilitysubtype,facstatus,accessibilitytypestr,accessibilitygroupstr,yearbuilt,yearrefurbished,closurereason,recupdateddate', returnGeometry: 'false', f: 'json', resultOffset: off, resultRecordCount: 1000 }));
        facs.push(...r.features.map(f => f.attributes));
        if (!r.exceededTransferLimit) break;
      }
    }
    writeFileSync(join(RAWDIR, 'active-places-e14.json'), JSON.stringify({ fetched: today, sites: [...sites.values()], facilities: facs }));
    const fBy = new Map(); for (const f of facs) (fBy.get(f.siteid) || fBy.set(f.siteid, []).get(f.siteid)).push(f);
    const recs = [...sites.values()].map(s => place({
      id: `ap:${s.siteid}`, site_id: s.siteid, name: clean(s.sitename), alias: clean(s.sitealias),
      kind: [...new Set((fBy.get(s.siteid) || []).map(f => f.facilitytype))].sort().join('; ') || 'sports site',
      address: joinAddr([s.buildingnumber, s.subbuildingname, s.buildingname].filter(Boolean).join(' '), s.dependentthoroughfare, s.thoroughfarename, s.dependentlocality, s.posttown), postcode: s.postcode,
      uprn: s.uprn && s.uprn !== '0' ? String(s.uprn) : null, toid: clean(s.toid), e: num(s.easting), n: num(s.northing),
      status: s.recenddate ? 'closed' : 'open', closed: epoch(s.recenddate), first_recorded: epoch(s.recentrydate), last_checked: epoch(s.reclastchkddate),
      owner_type: clean(s.ownertypestr), management: clean(s.managementtypestr),
      facilities: (fBy.get(s.siteid) || []).map(f => ({ id: f.facilityid, type: f.facilitytype, subtype: f.facilitysubtype, status: f.facstatus, access: f.accessibilitygroupstr, access_type: f.accessibilitytypestr, year_built: f.yearbuilt || null, year_refurbished: f.yearrefurbished || null })),
      url: `${B}/GIS_Active_Places_Power_Sites/FeatureServer/0/query?where=siteid%3D${s.siteid}&outFields=*&f=json`,
    }, s.lat, s.long)).filter(keep);
    write('active-places', {
      source: 'Sport England Active Places (ArcGIS feature services GIS_Active_Places_Power_Sites and GIS_Active_Places_Power_Facility)', source_url: `${B}/GIS_Active_Places_Power_Sites/FeatureServer/0`,
      landing: 'https://www.activeplacespower.com/opendata', fetched: today, licence: 'CC BY 4.0', licence_url: 'https://creativecommons.org/licenses/by/4.0/',
      licence_checked: 'licenseInfo of the Active Places Power site and of each feature service, 2026-10-03: "Use of data made available through Sport England\'s Active Places ... is licensed under CC BY 4.0"; personal data is excluded from the licence',
      attribution: 'Contains Data © Sport England',
      method: 'Two site queries (postcode LIKE \'E14%\'; envelope = the registry box), then the facilities of those sites in batches of 100 site ids. lat/long, easting/northing, UPRN and TOID come from the source.',
      counts: { sites_by_postcode: byPc.features.length, sites_by_box: byBox.features.length, facilities: facs.length },
      fields_dropped: ['title, first name, surname, job title (site contact person)', 'email, telephone, website, facebook, twitter', 'disability and amenity flags', 'statistical geography codes'],
    }, recs);
  },

  // FSA food hygiene ratings: premises typed "Pub/bar/nightclub" (OGL v3), from the snapshot registry-fhrs.mjs keeps.
  async 'fsa-pubs'() {
    const dir = join(RAW, 'registry', 'fhrs');
    const f = existsSync(dir) && readdirSync(dir).filter(x => /^FHRS530-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(x)).sort().at(-1);
    if (!f) throw new Error('no FHRS snapshot: run node magpie/cwplans/tools/registry-fhrs.mjs first');
    const snap = JSON.parse(gunzipSync(readFileSync(join(dir, f))));
    const recs = snap.establishments.filter(e => e.type === 'Pub/bar/nightclub').map(e => place({
      id: `fhrs:${e.id}`, name: e.name, kind: e.type, address: e.address, postcode: e.postcode, status: 'registered food business',
      rating: e.rating, rating_date: e.rating_date || null, url: `https://ratings.food.gov.uk/business/${e.id}`,
    }, e.lat, e.lon)).filter(keep);
    write('fsa-pubs', {
      source: 'Food Standards Agency food hygiene ratings, Tower Hamlets open-data file FHRS530, business type "Pub/bar/nightclub"', source_url: snap.source,
      landing: 'https://ratings.food.gov.uk/open-data', fetched: snap.fetched, licence: 'Open Government Licence v3.0', licence_url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
      licence_checked: 'data-register.json source "fsa" (OGL v3)', attribution: 'Contains FSA food hygiene rating data, licensed under the Open Government Licence v3.0.',
      method: `Read from the committed snapshot data/raw/registry/fhrs/${f} (written by tools/registry-fhrs.mjs); no network. A stand-in for the alcohol premises licence register, which could not be reached. FSA positions are often postcode centres (fault F7).`,
      counts: { e14_premises_in_snapshot: snap.establishments.length },
      fields_dropped: ['other business types (in registry/sources and the FHRS snapshot already)'],
    }, recs);
  },
};

const want = args.filter(a => !a.startsWith('--'));
const names = want.length ? want : Object.keys(SOURCES);
for (const n of names) {
  if (!SOURCES[n]) { console.error(`unknown source ${n}; known: ${Object.keys(SOURCES).join(' ')}`); process.exitCode = 1; continue; }
  try { await SOURCES[n](); } catch (e) { console.error(`${n}: FAILED ${e.message}`); process.exitCode = 1; }
}
