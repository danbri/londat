#!/usr/bin/env node
// Pull facts out of the structured data that tools/render-structured-data.mjs stored in
// third_party/cwplans-structured-data/pages/*.jsonl, with Factoidal (npm @factoidal/core): opening hours, telephone,
// address, geo, events and a few more, per entity the registry tracks. No network.
//   node cwplans/tools/extract-structured-data.mjs
// Steps: (1) clean each JSON-LD block (jsonld-clean.mjs; every repair counted by class), (2) JSON-LD to RDF with
// Factoidal's jsonldToRdf, microdata JSON to RDF here (schema.org vocabulary), RDFa N-Triples parsed by Factoidal,
// (3) one named graph per page (graph IRI = the page URL) written to third_party/cwplans-structured-data/all.nq,
// (4) SPARQL over that dataset with Factoidal, (5) attribution: a node is the Canary Wharf branch only when its
// postcode or position matches the entity (an E14/E20 postcode, or within 300 m of the building) or the page is the
// branch's own store page; a node with no address on a chain's general page is scope "chain".
// Out: registry/sources/web/structured-facts.json. Method and lessons: skills/docklands-data-curation/SKILL.md,
// "Structured data from rendered pages".
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { jsonldToRdf, parse, query } from '@factoidal/core';
import { cleanJsonLd } from './jsonld-clean.mjs';

const CW = join(dirname(fileURLToPath(import.meta.url)), '..');
const TP = join(CW, '../third_party/cwplans-structured-data');
const readJSON = p => JSON.parse(readFileSync(join(CW, p), 'utf8'));
const T0 = Date.now();
const S = 'https://schema.org/', RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const short = s => createHash('sha1').update(s).digest('hex').slice(0, 10);

// ---------------------------------------------------------------- 1. pages
const pages = [];
for (const f of readdirSync(join(TP, 'pages')).filter(f => f.endsWith('.jsonl')).sort())
  for (const line of readFileSync(join(TP, 'pages', f), 'utf8').split('\n')) if (line.trim()) pages.push(JSON.parse(line));

// ---------------------------------------------------------------- 2. to RDF, one named graph per page
const repairs = {}, failures = {}, perPage = new Map();
const fail = (cls, url, msg) => { const f = failures[cls] ||= { count: 0, examples: [] }; f.count++; if (f.examples.length < 5) f.examples.push({ url, error: String(msg).slice(0, 160) }); };
const iriN = s => s.replace(/^http:\/\/schema\.org\//, S);
const ntIri = s => '<' + iriN(s).replace(/[\u0000-\u0020<>"{}|^`\\]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')) + '>';
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const termNT = t => t.termType === 'NamedNode' ? ntIri(t.value) : t.termType === 'BlankNode' ? '_:' + t.value
  : '"' + esc(t.value) + '"' + (t.language ? '@' + t.language : t.datatype && t.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string' ? '^^' + ntIri(t.datatype.value) : '');
// relabel blank nodes per page and block so that graphs merged into one file never share a node
const quadsOf = (ds, g, tag) => [...ds].map(q => [q.subject, q.predicate, q.object].map(t => t.termType === 'BlankNode' ? { termType: 'BlankNode', value: `${tag}_${t.value.replace(/[^A-Za-z0-9]/g, '')}` } : t).map(termNT).join(' ') + ` ${ntIri(g)} .`);
// microdata JSON (WHATWG item shape) to RDF, schema.org vocabulary; URL-valued properties become IRIs
const URL_PROPS = new Set(['url', 'sameAs', 'image', 'logo', 'hasMap', 'menu', 'hasMenu', 'mainEntityOfPage', 'additionalType', 'availability', 'dayOfWeek', 'eventStatus', 'eventAttendanceMode', 'itemCondition', 'photo', 'contentUrl', 'thumbnailUrl']);
function microdataQuads(items, base, tag) {
  const out = []; let n = 0;
  const node = (it) => {
    const s = it.id ? ntIri(it.id) : `_:${tag}_m${n++}`;
    const types = (it.type || []).map(iriN);
    const vocab = types[0] ? (types[0].startsWith(S) ? S : types[0].replace(/[^/#]*$/, '')) : S;
    for (const t of types) out.push(`${s} <${RDF_TYPE}> ${ntIri(t)}`);
    for (const [p, vals] of Object.entries(it.properties || {})) {
      const pi = /^https?:\/\//.test(p) ? ntIri(p) : ntIri(vocab + p);
      for (const v of vals) {
        if (v && typeof v === 'object') { if (v.error) continue; out.push(`${s} ${pi} ${node(v)}`); }
        else if (typeof v === 'string' && URL_PROPS.has(p.replace(/^.*[/#]/, '')) && /^https?:\/\/\S+$/.test(v)) out.push(`${s} ${pi} ${ntIri(v)}`);
        else if (typeof v === 'string' && v !== '') out.push(`${s} ${pi} "${esc(v)}"`);
      }
    }
    return s;
  };
  for (const it of items) node(it);
  return out;
}
const allQuads = [];
let blocksIn = 0, blocksOk = 0, mdItems = 0, rdfaPages = 0;
for (const p of pages) {
  const g = p.url, ph = short(p.url), base = p.base_url || p.final_url || p.url, st = { jsonld_blocks: 0, jsonld_ok: 0, quads: 0 };
  perPage.set(g, st);
  for (const [i, raw] of (p.jsonld_raw || []).entries()) {
    blocksIn++; st.jsonld_blocks++;
    const { docs, repairs: rep, error } = cleanJsonLd(raw);
    for (const [k, v] of Object.entries(rep)) { const r = repairs[k] ||= { blocks: 0, repairs: 0, pages: new Set() }; r.blocks++; r.repairs += v; r.pages.add(g); }
    if (error) { fail('JSON-LD not parseable after cleaning', g, error); continue; }
    let ok = true;
    for (const [j, d] of docs.entries()) {
      try { const ds = await jsonldToRdf(JSON.stringify(d), { base }); const q = quadsOf(ds, g, `p${ph}j${i}d${j}`); allQuads.push(...q); st.quads += q.length; }
      catch (e) { ok = false; fail('Factoidal jsonldToRdf error', g, e.message || e); }
    }
    if (ok) { blocksOk++; st.jsonld_ok++; }
  }
  if (p.microdata?.length) {
    mdItems += p.microdata.length;
    const lines = microdataQuads(p.microdata.map(it => ({ ...it, type: it.type })), base, `p${ph}`);
    try { const ds = await parse(lines.map(l => l + ' .').join('\n'), { format: 'ntriples' }); const q = quadsOf(ds, g, `p${ph}md`); allQuads.push(...q); st.quads += q.length; }
    catch (e) { fail('Factoidal N-Triples parse error (microdata)', g, e.message || e); }
  }
  if (p.rdfa_ntriples) {
    rdfaPages++;
    try { const ds = await parse(p.rdfa_ntriples, { format: 'ntriples', baseIRI: base }); const q = quadsOf(ds, g, `p${ph}ra`); allQuads.push(...q); st.quads += q.length; }
    catch (e) {   // one bad line should not lose the page: parse line by line
      let bad = 0; for (const l of p.rdfa_ntriples.split('\n')) { try { const ds = await parse(l, { format: 'ntriples' }); const q = quadsOf(ds, g, `p${ph}ra`); allQuads.push(...q); st.quads += q.length; } catch { bad++; } }
      fail('Factoidal N-Triples parse error (RDFa), lines dropped', g, `${bad} lines: ${e.message || e}`);
    }
  }
}
const uniq = [...new Set(allQuads)];
writeFileSync(join(TP, 'all.nq'), uniq.join('\n') + '\n');
writeFileSync(join(TP, 'all.nq.gz'), gzipSync(Buffer.from(uniq.join('\n') + '\n'), { level: 9 }));   // committed copy; all.nq itself is gitignored (12 MB)
console.log(`${pages.length} pages, ${uniq.length} quads, ${((Date.now() - T0) / 1000).toFixed(1)} s`);

// ---------------------------------------------------------------- 3. SPARQL with Factoidal
const ds = await parse(uniq.join('\n'), { format: 'nquads' });
const P = `PREFIX schema: <${S}>\n`;
const rows = async (q) => (await query(ds, P + q)).map(b => Object.fromEntries([...b].map(([k, v]) => [k, v.termType === 'Literal' ? v.value : v.termType === 'BlankNode' ? '_:' + v.value : v.value])));
const qt = Date.now();
const NOT_ENTITY = ['PostalAddress', 'GeoCoordinates', 'OpeningHoursSpecification', 'ContactPoint', 'ImageObject', 'WebPage', 'WebSite', 'BreadcrumbList', 'ListItem', 'SearchAction', 'EntryPoint', 'ReadAction', 'Offer', 'AggregateRating', 'Rating', 'Review', 'Person', 'Country', 'PropertyValue'].map(t => `schema:${t}`).join(', ');
const R = {
  entities: await rows(`SELECT DISTINCT ?g ?s ?type WHERE { GRAPH ?g { ?s a ?type .
      { ?s schema:telephone ?x } UNION { ?s schema:address ?x } UNION { ?s schema:openingHours ?x } UNION { ?s schema:openingHoursSpecification ?x }
      UNION { ?s schema:specialOpeningHoursSpecification ?x } UNION { ?s schema:geo ?x }
      FILTER (?type NOT IN (${NOT_ENTITY})) } }`),
  simple: await rows(`SELECT ?g ?s ?p ?o WHERE { GRAPH ?g { ?s ?p ?o .
      VALUES ?p { schema:name schema:telephone schema:openingHours schema:url schema:sameAs schema:priceRange schema:servesCuisine schema:menu schema:hasMenu schema:hasMap } } }`),
  hours: await rows(`SELECT ?g ?s ?kind ?h ?day ?opens ?closes ?from ?thru WHERE { GRAPH ?g { ?s ?kind ?h .
      VALUES ?kind { schema:openingHoursSpecification schema:specialOpeningHoursSpecification }
      OPTIONAL { ?h schema:dayOfWeek ?day } OPTIONAL { ?h schema:opens ?opens } OPTIONAL { ?h schema:closes ?closes }
      OPTIONAL { ?h schema:validFrom ?from } OPTIONAL { ?h schema:validThrough ?thru } } }`),
  address: await rows(`SELECT ?g ?s ?a ?street ?pc ?loc WHERE { GRAPH ?g { ?s schema:address ?a .
      OPTIONAL { ?a schema:streetAddress ?street } OPTIONAL { ?a schema:postalCode ?pc } OPTIONAL { ?a schema:addressLocality ?loc } } }`),
  geo: await rows(`SELECT ?g ?s ?lat ?lon WHERE { GRAPH ?g { { ?s schema:geo ?geo . ?geo schema:latitude ?lat ; schema:longitude ?lon } UNION { ?s schema:latitude ?lat ; schema:longitude ?lon } } }`),
  events: await rows(`SELECT ?g ?e ?type ?name ?start ?end ?url ?locname ?locpc ?locstreet WHERE { GRAPH ?g { ?e a ?type . FILTER (STRENDS(STR(?type), "Event"))
      OPTIONAL { ?e schema:name ?name } OPTIONAL { ?e schema:startDate ?start } OPTIONAL { ?e schema:endDate ?end } OPTIONAL { ?e schema:url ?url }
      OPTIONAL { ?e schema:location ?l . OPTIONAL { ?l schema:name ?locname } OPTIONAL { ?l schema:address ?la . OPTIONAL { ?la schema:postalCode ?locpc } OPTIONAL { ?la schema:streetAddress ?locstreet } } } } }`),
};
console.log('SPARQL', Object.fromEntries(Object.entries(R).map(([k, v]) => [k, v.length])), `${((Date.now() - qt) / 1000).toFixed(1)} s`);

// ---------------------------------------------------------------- 4. nodes per page
const nodes = new Map();      // g|s -> node
const N = (g, s) => { const k = g + '|' + s; return nodes.get(k) || nodes.set(k, { g, s, types: new Set(), props: {}, hours: new Map(), address: [], geo: null }).get(k); };
const loc = s => s.replace(/^https?:\/\/schema\.org\//, '');
for (const r of R.entities) N(r.g, r.s).types.add(loc(r.type));
for (const r of R.simple) { const k = r.g + '|' + r.s; if (!nodes.has(k)) continue; const n = nodes.get(k); (n.props[loc(r.p)] ||= new Set()).add(r.o.trim()); }
for (const r of R.hours) { const k = r.g + '|' + r.s; if (!nodes.has(k)) continue; const n = nodes.get(k); const h = n.hours.get(r.h) || n.hours.set(r.h, { special: /special/.test(r.kind), days: new Set() }).get(r.h); if (r.day) h.days.add(r.day); for (const f of ['opens', 'closes', 'from', 'thru']) if (r[f]) h[f] = r[f]; }
for (const r of R.address) { const k = r.g + '|' + r.s; if (!nodes.has(k)) continue; const n = nodes.get(k); const a = r.a.startsWith('_:') || /^https?:/.test(r.a) ? { street: r.street, postcode: r.pc, locality: r.loc } : { text: r.a }; if (!n.address.some(x => JSON.stringify(x) === JSON.stringify(a))) n.address.push(a); }
for (const r of R.geo) { const k = r.g + '|' + r.s; if (!nodes.has(k)) continue; const lat = parseFloat(r.lat), lon = parseFloat(r.lon); if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) nodes.get(k).geo = { lat, lon }; }
const eventsBy = new Map();
for (const r of R.events) { const l = eventsBy.get(r.g) || eventsBy.set(r.g, new Map()).get(r.g); const e = l.get(r.e) || l.set(r.e, { type: loc(r.type) }).get(r.e); for (const f of ['name', 'start', 'end', 'url', 'locname', 'locpc', 'locstreet']) if (r[f] && !e[f]) e[f] = r[f].trim(); }

// ---------------------------------------------------------------- 5. opening hours to OSM opening_hours syntax
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAYMAP = { monday: 'Mo', tuesday: 'Tu', wednesday: 'We', thursday: 'Th', friday: 'Fr', saturday: 'Sa', sunday: 'Su', mon: 'Mo', tue: 'Tu', tues: 'Tu', wed: 'We', thu: 'Th', thur: 'Th', thurs: 'Th', fri: 'Fr', sat: 'Sa', sun: 'Su', mo: 'Mo', tu: 'Tu', we: 'We', th: 'Th', fr: 'Fr', sa: 'Sa', su: 'Su', publicholidays: 'PH' };
const dayOf = d => DAYMAP[String(d).replace(/^.*[/#]/, '').toLowerCase().replace(/[^a-z]/g, '')] || null;
const hhmm = t => { const m = /^(\d{1,2})(?::|\.)?(\d{2})?(?::\d{2})?(?:\.\d+)?\s*(am|pm)?\s*(?:Z|[+-]\d{2}:?\d{2})?$/i.exec(String(t).trim()); if (!m) return null; let h = +m[1]; const mi = m[2] || '00'; if (m[3]) { if (/pm/i.test(m[3]) && h < 12) h += 12; if (/am/i.test(m[3]) && h === 12) h = 0; } return h > 24 || +mi > 59 ? null : String(h).padStart(2, '0') + ':' + mi; };
const range = (o, c) => { const a = hhmm(o), b = hhmm(c); if (!a || !b) return null; if (a === '00:00' && b === '00:00') return 'off'; return a + '-' + (b === '23:59' || (b === '00:00' && a !== '00:00') ? '24:00' : b); };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const osmDate = d => {         // ISO dates, "26 Nov 2026" and "26/11/2026" (UK order) seen in the data
  d = String(d || '').trim(); let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d))) return `${m[1]} ${MON[+m[2] - 1]} ${m[3]}`;
  if ((m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(d))) { const i = MON.findIndex(x => x.toLowerCase() === m[2].toLowerCase()); return i >= 0 ? `${m[3]} ${MON[i]} ${m[1].padStart(2, '0')}` : null; }
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d)) && +m[2] <= 12) return `${m[3]} ${MON[+m[2] - 1]} ${m[1].padStart(2, '0')}`;
  return null;
};
function groupDays(byDay) {        // {Mo: '09:00-17:00', ...} -> "Mo-Fr 09:00-17:00; Sa 10:00-16:00"
  const out = []; let i = 0;
  while (i < 7) {
    if (!byDay[DAYS[i]]) { i++; continue; }
    let j = i; while (j + 1 < 7 && byDay[DAYS[j + 1]] === byDay[DAYS[i]]) j++;
    out.push({ days: j > i ? (j === i + 1 ? `${DAYS[i]},${DAYS[j]}` : `${DAYS[i]}-${DAYS[j]}`) : DAYS[i], v: byDay[DAYS[i]] }); i = j + 1;
  }
  const merged = []; for (const r of out) { const m = merged.find(x => x.v === r.v); if (m) m.days += ',' + r.days; else merged.push({ ...r }); }
  const rules = merged.map(r => `${r.days} ${r.v}`);
  if (byDay.PH) rules.push(`PH ${byDay.PH}`);
  return rules;
}
function osmFromSpecs(specs) {
  const regular = {}, dated = [], problems = [];
  for (const h of specs) {
    const r = range(h.opens, h.closes);
    if (!r) { problems.push(`times ${h.opens}-${h.closes}`); continue; }
    const days = [...h.days].map(dayOf);
    if (days.some(d => !d)) problems.push('day ' + [...h.days].join(','));
    const from = osmDate(h.from), thru = osmDate(h.thru);
    if (h.special || from || thru) {
      if (!from && !thru) { problems.push('special hours without dates'); continue; }
      const dr = from && thru ? (from === thru ? from : `${from}-${thru}`) : (from || thru);
      dated.push(`${dr}${days.filter(Boolean).length && !h.special ? ' ' + days.filter(Boolean).join(',') : ''} ${r}`);
      continue;
    }
    for (const d of days.filter(Boolean)) regular[d] = regular[d] && regular[d] !== r && r !== 'off' && regular[d] !== 'off' ? regular[d] + ',' + r : r;
  }
  const rules = [...groupDays(regular), ...dated];
  return { osm: rules.length ? rules.join('; ') : null, problems };
}
const DAYTOK = '(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|Mon(?:day)?|Tue(?:s|sday)?|Wed(?:nesday)?|Thu(?:rs?|rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)';
function osmFromText(list) {
  const byDay = {}, problems = [];
  for (const raw of list) for (const part of raw.split(new RegExp(`\\s*[;\\n]\\s*|,\\s+(?=${DAYTOK}(?:\\s*[-,–]\\s*${DAYTOK})*\\s*:?\\s+\\d)`))) {
    const t = part.trim().replace(/^["'\s]+|["'\s,]+$/g, ''); if (!t) continue;
    if (/^(Mo-Su|Mon-Sun|Monday-Sunday)?\s*(00:00-24:00|00:00-23:59|24\/7)$/i.test(t)) { for (const d of DAYS) byDay[d] = '00:00-24:00'; continue; }
    const m = new RegExp(`^(${DAYTOK}(?:\\s*[-,–]\\s*${DAYTOK})*)\\s*:?\\s*(\\d.*|closed|off)$`, 'i').exec(t);
    if (!m) { problems.push(t.slice(0, 60)); continue; }
    const days = new Set();
    for (const seg of m[1].split(/\s*,\s*/)) {
      const [a, b] = seg.split(/\s*[-–]\s*/).map(dayOf);
      if (!a) continue; if (!b) { days.add(a); continue; }
      let i = DAYS.indexOf(a); const j = DAYS.indexOf(b); if (i < 0 || j < 0) continue;
      for (;; i = (i + 1) % 7) { days.add(DAYS[i]); if (i === j) break; }
    }
    const times = m[2].trim();
    let v;
    if (/^(closed|off)$/i.test(times)) v = 'off';
    else { const rs = times.split(/\s*,\s*/).map(x => { const mm = /^(.+?)\s*[-–]\s*(.+)$/.exec(x); return mm ? range(mm[1], mm[2]) : null; }); if (rs.some(x => !x)) { problems.push(t.slice(0, 60)); continue; } v = rs.join(','); }
    for (const d of days) byDay[d] = v;
  }
  const rules = groupDays(byDay);
  return { osm: rules.length ? rules.join('; ') : null, problems };
}

// ---------------------------------------------------------------- 6. entity places and attribution
const B = readJSON('registry/buildings.json').buildings, BR = readJSON('registry/sources/brands/branches.json').branches;
const SL = readJSON('registry/sources/brands/storelocator.json').checked, CWG = readJSON('registry/sources/brands/cwg-directory.json').directory;
const CHAR = readJSON('registry/sources/registers/charities.json').records;
const pcN = s => (s || '').toUpperCase().replace(/\s+/g, '').replace(/^(.+)(\d[A-Z]{2})$/, '$1 $2');
const places = new Map();      // key -> { postcodes:Set, lat, lon, name }
const placeOf = (k, name, pcs, lat, lon) => { const e = places.get(k) || places.set(k, { name, postcodes: new Set(), lat: null, lon: null }).get(k); for (const p of [].concat(pcs || [])) if (p) for (const x of String(p).split(';')) e.postcodes.add(pcN(x)); if (lat != null && e.lat == null) { e.lat = lat; e.lon = lon; } return e; };
const cwgBuilding = new Map();
for (const b of B) for (const o of b.occupants || []) {
  placeOf(`${b.id}|${o.name}`, o.name, [o.postcode, ...(o.postcode ? [] : b.postcodes || [])], b.lat, b.lon);
  if (o.cwg_url) cwgBuilding.set(o.cwg_url, b);
}
const branchRef = x => x.osm_id || (x.fhrs_id && 'fhrs/' + x.fhrs_id) || (x.cwg_url && 'cwg/' + x.cwg_url.split('/').filter(Boolean).pop()) || x.wikidata_item || x.name;
const brByRef = new Map();
for (const x of BR) { const k = `branch:${x.brand_wikidata || x.brand}@${branchRef(x)}`; placeOf(k, x.name || x.brand, x.postcode, x.lat, x.lon); brByRef.set(`${x.brand_wikidata}@${x.osm_id}`, x); }
for (const x of SL) { const b = brByRef.get(`${x.brand_wikidata}@${x.branch_ref}`); placeOf(`branch:${x.brand_wikidata}@${x.branch_ref}`, x.branch_name || x.brand, x.postcode, b?.lat ?? null, b?.lon ?? null); }
for (const d of CWG) { const b = cwgBuilding.get(d.cwg_url); placeOf(`cwg:${d.slug}`, d.title, d.postcode, b?.lat ?? null, b?.lon ?? null); }
for (const r of CHAR) placeOf(r.id, r.name, r.postcode, r.lat ?? null, r.lon ?? null);
const metres = (a, b) => { const R0 = 6371000, toR = Math.PI / 180, dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2; return 2 * R0 * Math.asin(Math.sqrt(h)); };
const LOCAL_PC = /^E(14|20)\s?\d[A-Z]{2}$/;
function judge(n, place, storePage, chainKey) {
  const pcs = n.address.map(a => pcN(a.postcode || (/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/i.exec(a.text || '') || [])[0])).filter(Boolean);
  const d = n.geo && place?.lat != null ? Math.round(metres(n.geo, place)) : null;
  if (pcs.some(p => place?.postcodes.has(p))) return { scope: 'branch', confidence: 'high', match_by: 'postcode equal', distance_m: d };
  if (d != null && d <= 300) return { scope: 'branch', confidence: 'high', match_by: 'geo within 300 m', distance_m: d };
  if (pcs.some(p => LOCAL_PC.test(p)) && (d == null || d <= 1500)) return { scope: 'branch', confidence: 'low', match_by: 'E14/E20 postcode, not the entity\'s own', distance_m: d };
  if (pcs.length || d != null) return { scope: 'elsewhere', match_by: pcs.length ? 'postcode ' + pcs[0] : 'geo ' + d + ' m', distance_m: d };
  if (storePage) return { scope: 'branch', confidence: 'medium', match_by: storePage + ' (node gives no address)', distance_m: null };
  if (chainKey) return { scope: 'chain', match_by: 'no address on a general page of a chain', distance_m: null };
  return { scope: 'organisation', match_by: 'no address, on the organisation\'s own site', distance_m: null };
}

const pageByUrl = new Map(pages.map(p => [p.url, p]));
const entities = [], elsewhere = [];
const hoursText = n => [...(n.props.openingHours || [])].filter(t => !/^[\s,;]*$/.test(t));   // empty strings and bare comma lists are no hours
for (const p of pages) {
  // the branch's own page: a store_url field, a store-finder result, or a deep page whose URL names the place
  let path = ''; try { path = decodeURIComponent(new URL(p.final_url || p.url).pathname).toLowerCase(); } catch {}
  const storePage = p.via ? 'store-finder result' : (p.sources || []).some(s => /store_url/.test(s)) ? 'store page'
    : /canary[-_ ]?wharf|isle[-_ ]of[-_ ]dogs|crossrail[-_ ]place|jubilee[-_ ]place|cabot[-_ ]place|canada[-_ ]place|canada[-_ ]square|wood[-_ ]wharf|south[-_ ]quay|westferry|marsh[-_ ]wall|bank[-_ ]street|churchill[-_ ]place|limehouse|poplar|e14/.test(path) ? 'page URL names the place' : null;
  const pn = [...nodes.values()].filter(n => n.g === p.url);
  const evs = [...(eventsBy.get(p.url)?.values() || [])].map(e => Object.fromEntries(Object.entries({ type: e.type, name: e.name, start: e.start, end: e.end, url: e.url, location: [e.locname, e.locstreet, e.locpc].filter(Boolean).join(', ') || undefined, location_postcode: e.locpc ? pcN(e.locpc) : undefined }).filter(([, v]) => v)));
  for (const key of p.entity_keys || []) {
    const place = places.get(key);
    const chainKey = key.startsWith('branch:') || (p.entity_keys || []).some(k => k.startsWith('branch:'));
    const scored = pn.map(n => ({ n, j: judge(n, place, storePage, chainKey) }));
    for (const s of scored.filter(s => s.j.scope === 'elsewhere')) elsewhere.push(s);
    const rank = s => (s.j.scope === 'branch' ? 100 + ({ high: 20, medium: 10 }[s.j.confidence] || 0) : s.j.scope === 'elsewhere' ? 0 : 50) + (s.n.hours.size || hoursText(s.n).length ? 10 : 0) + (s.n.props.telephone ? 3 : 0) + (s.n.address.length ? 2 : 0) + (/Organization|WebSite/.test([...s.n.types].join()) ? 0 : 1);
    const best = scored.filter(s => s.j.scope !== 'elsewhere').sort((a, b) => rank(b) - rank(a))[0];
    if (!best && !evs.length) continue;
    const rec = { key, url: p.url, final_url: p.final_url !== p.url ? p.final_url : undefined, source_graph: p.url, fetched: p.fetched, via: p.via || undefined };
    if (best) {
      const n = best.n, specs = [...n.hours.values()];
      const fromSpecs = specs.length ? osmFromSpecs(specs) : null, fromText = hoursText(n).length ? osmFromText(hoursText(n)) : null;
      const osm = fromSpecs?.osm || fromText?.osm || null;
      Object.assign(rec, {
        node: n.s.startsWith('_:') ? undefined : n.s, types: [...n.types].sort(), name: [...(n.props.name || [])][0], scope: best.j.scope, confidence: best.j.confidence, match_by: best.j.match_by, distance_m: best.j.distance_m ?? undefined,
        opening_hours: specs.length || fromText ? Object.fromEntries(Object.entries({
          osm, raw_text: hoursText(n).length ? hoursText(n) : undefined,
          specification: specs.filter(h => !h.special).map(h => Object.fromEntries(Object.entries({ days: [...h.days].map(d => d.replace(/^https?:\/\/schema\.org\//, '')), opens: h.opens, closes: h.closes, valid_from: h.from, valid_through: h.thru }).filter(([, v]) => v != null))),
          special: specs.filter(h => h.special).map(h => Object.fromEntries(Object.entries({ days: [...h.days].map(d => d.replace(/^https?:\/\/schema\.org\//, '')), opens: h.opens, closes: h.closes, valid_from: h.from, valid_through: h.thru }).filter(([, v]) => v != null))),
          problems: [...new Set([...(fromSpecs?.problems || []), ...(fromText?.problems || [])])],
        }).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length))) : undefined,
        phone: [...(n.props.telephone || [])][0], address: n.address[0], geo: n.geo || undefined,
        url_stated: [...(n.props.url || [])][0], same_as: n.props.sameAs ? [...n.props.sameAs].slice(0, 10) : undefined, price_range: [...(n.props.priceRange || [])][0],
        serves_cuisine: n.props.servesCuisine ? [...n.props.servesCuisine] : undefined, menu: [...(n.props.hasMenu || n.props.menu || [])][0], has_map: [...(n.props.hasMap || [])][0],
      });
    } else rec.scope = 'events only';
    if (evs.length) rec.events = evs.slice(0, 50), rec.events_total = evs.length > 50 ? evs.length : undefined;
    entities.push(JSON.parse(JSON.stringify(rec)));
  }
}

// ---------------------------------------------------------------- 7. out
const cnt = (f) => entities.filter(f).length;
const keysWith = (f) => new Set(entities.filter(f).map(e => e.key)).size;
const index = JSON.parse(readFileSync(join(TP, 'index.json'), 'utf8'));
const meta = {
  generated: new Date().toISOString(), tool: 'tools/extract-structured-data.mjs', engine: '@factoidal/core ' + JSON.parse(readFileSync(join(CW, '../node_modules/@factoidal/core/package.json'), 'utf8')).version,
  input: 'third_party/cwplans-structured-data/pages/*.jsonl (tools/render-structured-data.mjs)', dataset: 'third_party/cwplans-structured-data/all.nq.gz (gzipped N-Quads; one named graph per page; graph IRI = page URL)',
  rule: 'A node is attributed to a Canary Wharf entity (scope "branch") only when its postcode equals the entity\'s or its geo is within 300 m of the building (confidence high), it has no address and the page is the branch\'s own page: a store_url field, a store-finder result or a URL that names the place (medium), or its postcode is another E14/E20 postcode with any geo within 1.5 km (low: may be a sibling branch). A node with no address on a general page is scope "chain" when the entity is a chain branch (chain-wide facts, not branch facts), else "organisation" (the organisation\'s own site, which may be its only place). Nodes with an address or position elsewhere are not attributed (counted as elsewhere).',
  render: index.counts,
  counts: {
    pages: pages.length, quads: uniq.length, jsonld_blocks: blocksIn, jsonld_blocks_loaded: blocksOk, microdata_items: mdItems, rdfa_pages: rdfaPages,
    entity_records: entities.length, entity_keys: new Set(entities.map(e => e.key)).size,
    by_scope: entities.reduce((o, e) => (o[e.scope] = (o[e.scope] || 0) + 1, o), {}),
    keys_with_hours_branch: keysWith(e => e.opening_hours && e.scope === 'branch'), keys_with_hours_branch_high: keysWith(e => e.opening_hours && e.scope === 'branch' && e.confidence === 'high'),
    branch_by_confidence: entities.filter(e => e.scope === 'branch').reduce((o, e) => (o[e.confidence] = (o[e.confidence] || 0) + 1, o), {}), keys_with_hours_chain: keysWith(e => e.opening_hours && e.scope === 'chain'), keys_with_hours_organisation: keysWith(e => e.opening_hours && e.scope === 'organisation'),
    keys_with_hours_osm_branch: keysWith(e => e.opening_hours?.osm && e.scope === 'branch'),
    keys_with_phone_branch: keysWith(e => e.phone && e.scope === 'branch'), keys_with_phone_chain: keysWith(e => e.phone && e.scope === 'chain'),
    keys_with_events: keysWith(e => e.events?.length), events: entities.reduce((a, e) => a + (e.events?.length || 0), 0),
    records_with_special_hours: cnt(e => e.opening_hours?.special?.length), nodes_elsewhere_not_attributed: elsewhere.length,
    seconds: Math.round((Date.now() - T0) / 1000),
  },
  repairs_by_class: Object.fromEntries(Object.entries(repairs).sort((a, b) => b[1].blocks - a[1].blocks).map(([k, v]) => [k, { blocks: v.blocks, repairs: v.repairs, pages: v.pages.size }])),
  failures_by_class: failures,
};
writeFileSync(join(CW, 'registry/sources/web/structured-facts.json'), JSON.stringify({ meta, entities: entities.sort((a, b) => a.key.localeCompare(b.key) || a.url.localeCompare(b.url)) }, null, 1));
console.log(JSON.stringify(meta.counts, null, 1), JSON.stringify(meta.repairs_by_class), JSON.stringify(Object.fromEntries(Object.entries(failures).map(([k, v]) => [k, v.count]))));
