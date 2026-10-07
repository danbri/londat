// Build the cwplans knowledge graph in danbri/londat kgx/ as a dataflow of logged operations (kgx-ops.mjs): lift
// operations turn input files (identified by SHA-256) into immutable graph versions (identified by their RDFC-1.0 hash);
// pure operations then partition each version by subject (small Shardborough blocks), describe the versions, lift the
// activity log and the earlier pipeline provenance, and pack the store. An activity already in the log is not run again.
// All RDF work with @factoidal/core. No blank nodes in lifted graphs (the pipeline graph is skolemized).
//   node cwplans/tools/build-kgx.mjs [--no-store]
//   out: $LONDAT_DIR/kgx/  graphs/<name>/<hash16>.nq.gz, log/, shardborough/, current.nq.gz, heads.json, manifest.json
// Skills: cwplans-kgx (graphs, store, page), cwplans-dataflow (operations, versions, log).
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync, statSync } from 'fs';
import { gzipSync, gunzipSync } from 'zlib';
import { createHash } from 'crypto';
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { join, relative } from 'path';
import { parse, jsonldToRdf, dataFactory as F } from '@factoidal/core';
import { TOOLS } from './lib.mjs';
import { LONDAT_DIR } from './londat.mjs';
import { Flow, OPS, KG, partitionLines } from './kgx-ops.mjs';

const CW = join(TOOLS, '..'), ROOT = join(CW, '..'), OUT = join(LONDAT_DIR, 'kgx');
const ID = KG + 'id/', V = KG + 'vocab#';
const NS = { s: 'https://schema.org/', rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#', owl: 'http://www.w3.org/2002/07/owl#', geo: 'http://www.opengis.net/ont/geosparql#',
  dct: 'http://purl.org/dc/terms/', prov: 'http://www.w3.org/ns/prov#', void: 'http://rdfs.org/ns/void#', wd: 'http://www.wikidata.org/entity/', cwk: V };
const OH = createRequire(import.meta.url)(join(CW, 'docklands', 'opening-hours.js'));
const sha = s => createHash('sha1').update(s).digest('hex').slice(0, 12);
const slug = s => String(s || '').normalize('NFKD').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'x';
const iri = (p, l) => F.namedNode(NS[p] + l), N = u => F.namedNode(u);
const lit = (v, dt) => v == null || v === '' ? null : typeof v === 'number' ? F.literal(String(v), iri('xsd', Number.isInteger(v) ? 'integer' : 'decimal')) : dt ? F.literal(String(v), iri('xsd', dt)) : F.literal(String(v));
const TYPE = iri('rdf', 'type');
const TP = join(ROOT, 'third_party', 'cwplans-structured-data'), CWG = join(LONDAT_DIR, 'third_party', 'cwg');
const bIri = id => ID + 'building/' + id;

// a quad collector for one graph (default graph: the runtime names the version)
function G() { const quads = [];
  const add = (s, p, o) => { if (s && p && o != null) quads.push(F.quad(typeof s === 'string' ? N(s) : s, p, typeof o === 'string' ? N(o) : o, F.defaultGraph())); };
  return { quads, add, lit: (s, p, v, dt) => { const l = lit(v, dt); if (l) add(s, p, l); } }; }

const flow = new Flow(OUT);
const rel = p => relative(ROOT, p).startsWith('..') ? 'danbri/londat ' + relative(LONDAT_DIR, p) : relative(ROOT, p);
const file = p => flow.file(p, rel(p));
const LIFT = (id, about) => ({ id, version: 1, skill: 'cwplans-kgx', tool: 'cwplans/tools/build-kgx.mjs', about });
const versions = {};

// ---- lift operations: input files -> one graph version each
{ const inF = file(join(CW, 'docklands/facts.json'));
  Object.assign(versions, await flow.run(LIFT('lift-cited-facts', 'docklands/facts.json -> cwk:CitedFact nodes about Wikidata items: property, value, unit, reference level, citation, quote, date'), [inF], null, async () => {
    const g = G();
    for (const x of JSON.parse(readFileSync(join(CW, 'docklands/facts.json'), 'utf8')).facts) {
      const id = ID + 'fact/' + sha(JSON.stringify([x.subject, x.property, x.value, x.source_url])), subj = x.wikidata ? NS.wd + x.wikidata : ID + 'thing/' + slug(x.subject);
      g.add(id, TYPE, iri('cwk', 'CitedFact')); g.add(id, iri('cwk', 'about'), subj); g.lit(subj, iri('rdfs', 'label'), x.subject);
      g.lit(id, iri('s', 'propertyID'), x.property); g.lit(id, iri('s', 'value'), x.value); g.lit(id, iri('s', 'unitText'), x.unit);
      g.lit(id, iri('cwk', 'referenceLevel'), x.reference_level); if (x.source_url) g.add(id, iri('s', 'citation'), x.source_url);
      g.lit(id, iri('cwk', 'quote'), x.quote); g.lit(id, iri('dct', 'date'), x.retrieved, 'date'); g.lit(id, iri('rdfs', 'comment'), x.note);
    }
    return { facts: { quads: g.quads, about: { title: 'Cited facts about Canary Wharf and the Docklands structures', licence: 'facts with short quotes from cited pages (crawl rule of 2026-10-03, scoping); each fact names its source URL' } } };
  })); }

const regF = file(join(CW, 'registry/buildings.json')), atlasF = file(join(CW, 'atlas/data/atlas.json'));
const B = () => JSON.parse(readFileSync(join(CW, 'registry/buildings.json'), 'utf8')).buildings;
Object.assign(versions, await flow.run(LIFT('lift-registry-buildings', 'registry/buildings.json + atlas outlines -> cwk:Building places: name, position, WKT outline, levels, height, postcodes, OSM/Wikidata links'), [regF, atlasF], null, async () => {
  const g = G(), atlasG = new Map(JSON.parse(readFileSync(join(CW, 'atlas/data/atlas.json'), 'utf8')).buildings.map(b => [b.id, b.g]));
  for (const b of B()) {
    const s = bIri(b.id); g.add(s, TYPE, iri('s', 'Place')); g.add(s, TYPE, iri('cwk', 'Building')); g.lit(s, iri('s', 'identifier'), b.id);
    g.lit(s, iri('s', 'name'), b.name); if (b.osm_name && b.osm_name !== b.name) g.lit(s, iri('s', 'alternateName'), b.osm_name); g.lit(s, iri('cwk', 'houseName'), b.housename);
    g.lit(s, iri('s', 'latitude'), b.lat); g.lit(s, iri('s', 'longitude'), b.lon); g.lit(s, iri('cwk', 'levels'), b.levels); g.lit(s, iri('cwk', 'levelsUnderground'), b.levels_underground);
    g.lit(s, iri('cwk', 'heightMetres'), b.height); g.lit(s, iri('cwk', 'footprintAreaM2'), b.area_m2); g.lit(s, iri('cwk', 'buildingTag'), b.building);
    if (typeof b.uprns === 'number') g.lit(s, iri('cwk', 'uprnCount'), b.uprns);
    for (const pc of b.postcodes || []) g.lit(s, iri('s', 'postalCode'), pc);
    for (const o of b.osm || []) g.add(s, iri('s', 'sameAs'), 'https://www.openstreetmap.org/' + o);
    if (b.wikidata) g.add(s, iri('owl', 'sameAs'), NS.wd + b.wikidata);
    for (const t of b.toids || []) g.lit(s, iri('cwk', 'toid'), t);
    const rings = atlasG.get(b.id);
    if (rings?.length) { const geom = s + '/geometry';
      const wkt = 'POLYGON(' + rings.map(q => { const pts = []; let la = 0, lo = 0; for (let i = 0; i < q.length; i += 2) { la += q[i]; lo += q[i + 1]; pts.push(`${(lo / 1e6).toFixed(6)} ${(la / 1e6).toFixed(6)}`); } if (pts[0] !== pts.at(-1)) pts.push(pts[0]); return '(' + pts.join(', ') + ')'; }).join(', ') + ')';
      g.add(s, iri('geo', 'hasGeometry'), geom); g.add(geom, TYPE, iri('geo', 'Geometry')); g.add(geom, iri('geo', 'asWKT'), F.literal(wkt, iri('geo', 'wktLiteral'))); }
  }
  return { buildings: { quads: g.quads, about: { title: 'Registry buildings of the Canary Wharf box (cwb- ids): names, positions, outlines, levels, height, postcodes, identifiers', licence: 'derived from OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0), Wikidata (CC0), OS Open UPRN/USRN/TOID ids (OGL)', osm: true } } };
}));

Object.assign(versions, await flow.run(LIFT('lift-registry-occupants', 'registry/buildings.json occupants -> schema.org LocalBusiness/Store/FoodEstablishment: role, level, mall, hours, links to the building, OSM, CWG, brand'), [regF], null, async () => {
  const g = G();
  for (const b of B()) (b.occupants || []).forEach((o, i) => {
    const s = `${bIri(b.id)}/occupant/${slug(o.name)}-${sha(JSON.stringify([o.name, o.osm, o.source, i]))}`;
    g.add(s, TYPE, iri('s', /food/.test(o.role || '') ? 'FoodEstablishment' : /^shop/.test(o.role || '') ? 'Store' : 'LocalBusiness'));
    g.lit(s, iri('s', 'name'), o.name); g.lit(s, iri('cwk', 'role'), o.role); g.lit(s, iri('cwk', 'sourceKind'), o.source); g.add(s, iri('s', 'containedInPlace'), bIri(b.id));
    g.lit(s, iri('cwk', 'level'), o.level ?? o.level_cwg); g.lit(s, iri('cwk', 'mall'), o.mall); g.lit(s, iri('s', 'openingHours'), o.opening_hours);
    if (o.web?.opening_hours) g.lit(s, iri('cwk', 'webOpeningHours'), o.web.opening_hours);
    if (o.osm) g.add(s, iri('s', 'sameAs'), 'https://www.openstreetmap.org/' + o.osm);
    if (o.cwg_url) g.add(s, iri('s', 'sameAs'), o.cwg_url.replace(/\/?$/, '/') + '#entity');
    if (/^https?:\/\//.test(o.website || '')) g.add(s, iri('s', 'url'), o.website);
    if (o.brand_wikidata) g.add(s, iri('s', 'brand'), NS.wd + o.brand_wikidata); else g.lit(s, iri('cwk', 'brandName'), o.brand);
    g.lit(s, iri('cwk', 'odsCode'), o.ods_code); g.lit(s, iri('cwk', 'cqcLocationId'), o.cqc_location_id); g.lit(s, iri('s', 'servesCuisine'), o.cuisine);
  });
  return { occupants: { quads: g.quads, about: { title: 'Occupants of the registry buildings: shops, food and drink, services, offices, with role, level, opening hours and links', licence: 'joined from OSM (ODbL), FSA ratings (OGL), Canary Wharf Group directory (crawl rule, scoping), brand and register sources named per occupant in the registry', osm: true } } };
}));

{ const nqF = file(join(CW, 'registry/sources/brands/cwg-directory-typed.nq')), tyF = file(join(CW, 'registry/sources/brands/cwg-directory-typed.json')), hF = file(join(CW, 'registry/sources/brands/cwg-hours.json'));
  Object.assign(versions, await flow.run(LIFT('lift-cwg-directory', 'typed CWG directory quads (all page graphs merged) + typed list + archived hours -> entities with malls, levels, registry buildings and one OpeningHoursSpecification per day and span'), [nqF, tyF, hF], null, async () => {
    const g = G(), ds = await parse(readFileSync(join(CW, 'registry/sources/brands/cwg-directory-typed.nq'), 'utf8'), { format: 'nquads' });
    for (const q of ds.toArray()) g.add(q.subject, q.predicate, q.object);
    const typed = new Map(JSON.parse(readFileSync(join(CW, 'registry/sources/brands/cwg-directory-typed.json'), 'utf8')).entries.map(e => [e.slug, e]));
    const DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], hm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    for (const h of JSON.parse(readFileSync(join(CW, 'registry/sources/brands/cwg-hours.json'), 'utf8')).entries) {
      const t = typed.get(h.slug); if (!t) continue; const s = t.cwg_url.replace(/\/?$/, '/') + '#entity';
      if (h.mall) { const m = ID + 'mall/' + slug(h.mall); g.add(s, iri('s', 'containedInPlace'), m); g.add(m, TYPE, iri('s', ['Cabot Place', 'Canada Place', 'Jubilee Place', 'Crossrail Place', 'Churchill Place'].includes(h.mall) ? 'ShoppingCenter' : 'Place')); g.lit(m, iri('s', 'name'), h.mall); }
      g.lit(s, iri('cwk', 'levelText'), h.level); for (const b of t.registry_buildings || []) g.add(s, iri('cwk', 'registryBuilding'), bIri(b));
      if (!h.opening_hours) { if (h.state === 'coming-soon') g.lit(s, iri('cwk', 'status'), 'coming soon'); continue; }
      g.lit(s, iri('s', 'openingHours'), h.opening_hours); g.lit(s, iri('cwk', 'hoursAsOf'), h.archived_on ? `${h.archived_on.slice(0, 4)}-${h.archived_on.slice(4, 6)}-${h.archived_on.slice(6, 8)}` : null, 'date');
      const P = OH.parse(h.opening_hours); if (!P) continue;
      P.week.forEach((spans, d) => (spans || []).forEach(([o, c], k) => { const n = `${s}-hours-${DAY[d]}-${k}`; g.add(s, iri('s', 'openingHoursSpecification'), n); g.add(n, TYPE, iri('s', 'OpeningHoursSpecification'));
        g.add(n, iri('s', 'dayOfWeek'), iri('s', DAY[d])); g.lit(n, iri('s', 'opens'), hm(o)); g.lit(n, iri('s', 'closes'), hm(c)); g.lit(n, iri('cwk', 'opensMinute'), o); g.lit(n, iri('cwk', 'closesMinute'), c); }));
    }
    return { cwg: { quads: g.quads, about: { title: 'Canary Wharf Group directory: typed occupants, malls, levels, page dates and weekly opening hours', licence: 'Canary Wharf Group pages as archived by the Internet Archive; crawl rule of 2026-10-03, scoping only' } } };
  })); }

{ const cF = file(join(TP, 'idioms', 'canonical.nq.gz'));
  Object.assign(versions, await flow.run(LIFT('lift-web-canonical', 'canonical schema.org layer (one graph per page) -> one graph, pages typed s:WebPage'), [cF], null, async () => {
    const g = G(), ds = await parse(gunzipSync(readFileSync(join(TP, 'idioms', 'canonical.nq.gz'))).toString(), { format: 'nquads' });
    for (const q of ds.toArray()) g.add(q.subject, q.predicate, q.object);
    for (const p of new Set(ds.toArray().map(q => q.graph.value))) g.add(p, TYPE, iri('s', 'WebPage'));
    return { web: { quads: g.quads, about: { title: 'Canonical schema.org layer from the web harvest (branch cards, weekly hours, organisation cards), all pages merged', licence: "the publishers' own markup; crawl rule of 2026-10-03, scoping only" } } };
  })); }

{ const sF = file(join(TP, 'coref', 'sameas.nq.gz')), dF = file(join(TP, 'coref', 'descriptions.json'));
  Object.assign(versions, await flow.run(LIFT('lift-coref', 'owl:sameAs links (one graph per key rule) + description names and pages -> one graph per key rule'), [sF, dF], null, async () => {
    const ds = await parse(gunzipSync(readFileSync(join(TP, 'coref', 'sameas.nq.gz'))).toString(), { format: 'nquads' });
    const desc = new Map(JSON.parse(readFileSync(join(TP, 'coref', 'descriptions.json'), 'utf8')).descriptions.map(d => [d.iri, d]));
    const byRule = new Map(); for (const q of ds.toArray()) { const r = q.graph.value.split('/').pop(); (byRule.get(r) || byRule.set(r, []).get(r)).push(q); }
    const out = {};
    for (const [rule, qs] of byRule) { const g = G();
      for (const q of qs) { g.add(q.subject, q.predicate, q.object); for (const t of [q.subject, q.object]) { const d = desc.get(t.value); if (d) { g.lit(t, iri('s', 'name'), d.name); if (/^https?:/.test(d.page)) g.add(t, iri('s', 'subjectOf'), d.page); g.lit(t, iri('cwk', 'descriptionKind'), d.kind); } } }
      out['coref-' + rule] = { quads: g.quads, about: { title: `Same-thing links by key rule "${rule}" between web descriptions (made by tools/web-coref.mjs)`, licence: 'derived from the web harvest (scoping)' } }; }
    return out;
  })); }

{ const TMI = join(CWG, '_TMI', 'mallmap');
  if (existsSync(join(TMI, 'summary.json'))) {
    const floorFiles = readdirSync(TMI).filter(f => /^indoor-floor-.*\.geojson$/.test(f)).sort();
    const wktOf = gm => { const ring = r => '(' + r.map(([lo, la]) => `${lo.toFixed(7)} ${la.toFixed(7)}`).join(', ') + ')';
      return gm.type === 'Point' ? `POINT(${gm.coordinates[0].toFixed(7)} ${gm.coordinates[1].toFixed(7)})` : gm.type === 'Polygon' ? 'POLYGON(' + gm.coordinates.map(ring).join(', ') + ')'
        : gm.type === 'MultiPolygon' ? 'MULTIPOLYGON(' + gm.coordinates.map(p => '(' + p.map(ring).join(', ') + ')').join(', ') + ')' : null; };
    const centreOf = gm => { const r = gm.type === 'Point' ? [gm.coordinates] : gm.type === 'Polygon' ? gm.coordinates[0] : gm.coordinates[0][0]; return [r.reduce((a, c) => a + c[0], 0) / r.length, r.reduce((a, c) => a + c[1], 0) / r.length]; };
    Object.assign(versions, await flow.run(LIFT('lift-mallmap', 'normalised Living Map GeoJSON per floor -> cwk:MallUnit (named polygons, WKT outline) and cwk:Facility (points other than direction arrows): class, type, mall, floor, opening text, centre'), floorFiles.map(f => file(join(TMI, f))), null, async () => {
      const g = G();
      for (const f of floorFiles) for (const { properties: p, geometry: gm } of JSON.parse(readFileSync(join(TMI, f), 'utf8')).features) {
        const poly = /Polygon/.test(gm.type), point = gm.type === 'Point'; if (!(poly && p.name) && !(point && p.type !== 'arrow')) continue;
        const s = ID + (poly ? 'unit/' : 'facility/') + p.uid; g.add(s, TYPE, iri('cwk', poly ? 'MallUnit' : 'Facility'));
        g.lit(s, iri('s', 'name'), p.name); g.lit(s, iri('cwk', 'unitClass'), p.class); g.lit(s, iri('cwk', 'unitType'), p.type);
        g.lit(s, iri('cwk', 'mall'), p.location_name); g.lit(s, iri('cwk', 'floorName'), p.floor_name); g.lit(s, iri('cwk', 'floorLevel'), Number(p.floor_level));
        g.lit(s, iri('cwk', 'openingTimesText'), p.opening_times); g.lit(s, iri('s', 'telephone'), p.tel_number); g.lit(s, iri('s', 'address'), p.street_address);
        if (/^https?:\/\//.test(p.url || '')) g.add(s, iri('s', 'url'), p.url);
        const wkt = wktOf(gm); if (wkt) { const geom = s + '/geometry'; g.add(s, iri('geo', 'hasGeometry'), geom); g.add(geom, TYPE, iri('geo', 'Geometry')); g.add(geom, iri('geo', 'asWKT'), F.literal(wkt, iri('geo', 'wktLiteral'))); }
        const [cx, cy] = centreOf(gm); g.lit(s, iri('s', 'longitude'), +cx.toFixed(7)); g.lit(s, iri('s', 'latitude'), +cy.toFixed(7));
      }
      return { mallmap: { quads: g.quads, about: { title: 'Mall units and facilities (lifts, escalators, ramps, stairs, entrances, toilets, defibrillators and more) from the Living Map data behind map.canarywharf.com', licence: "Canary Wharf Group / Living Map; archived at the owner's request 2026-10-06 for reference and accessibility design study, scoping only" } } };
    }));
  } }

{ const SG = join(CWG, '_TMI', 'store-guide-2026-07-20.json');
  if (existsSync(SG)) Object.assign(versions, await flow.run(LIFT('lift-store-guide', 'OCR store guide entries -> cwk:GuideEntry: name, section, grid squares, OCR text and confidence, s:sameAs CWG entity when matched'), [file(SG)], null, async () => {
    const g = G();
    for (const e of JSON.parse(readFileSync(SG, 'utf8')).entries) {
      if (e.section === 'legend' || !e.name) continue;
      const s = ID + 'storeguide/p' + e.page + '/' + slug(e.section) + '/' + slug(e.name) + '-' + sha(JSON.stringify([e.name, e.grid_refs, e.bbox]));
      g.add(s, TYPE, iri('cwk', 'GuideEntry')); g.lit(s, iri('s', 'name'), e.name); g.lit(s, iri('cwk', 'guideSection'), e.section); g.lit(s, iri('cwk', 'guideGroup'), e.group);
      g.lit(s, iri('cwk', 'guidePage'), e.page); for (const r of e.grid_refs || []) g.lit(s, iri('cwk', 'gridRef'), `${r.row}${r.col}`);
      g.lit(s, iri('cwk', 'levelText'), e.level); g.lit(s, iri('rdfs', 'comment'), e.extra); g.lit(s, iri('cwk', 'ocrText'), e.ocr_text); g.lit(s, iri('cwk', 'ocrConfidence'), e.ocr_confidence);
      for (const b of e.buildings || []) g.lit(s, iri('cwk', 'buildingText'), typeof b === 'string' ? b : JSON.stringify(b));
      const m = e.name_matched; if (m?.slug && m?.kind) g.add(s, iri('s', 'sameAs'), `https://canarywharf.com/${m.kind}/${m.slug}/#entity`);
    }
    return { storeguide: { quads: g.quads, about: { title: 'Canary Wharf Group store guide (20 July 2026): listed shops, restaurants, cafés, services and office tenants with section and grid squares, read by OCR (tools/cwg-maps-tmi.mjs)', licence: 'Canary Wharf Group; design © Ravenshaw Studios Limited and Paul & Linda Anthony 2026; facts only, scoping' } } };
  })); }

// ---- the earlier pipeline as provenance: pipeline.jsonld (every tool's activity, used and generated files) lifted,
// blank nodes skolemized, each file it names that exists here or in londat tied to its SHA-256 at this build
{ const pF = file(join(CW, 'pipeline.jsonld'));
  const pj = JSON.parse(readFileSync(join(CW, 'pipeline.jsonld'), 'utf8'));
  const fileIris = [...new Set(JSON.stringify(pj).match(/https:\/\/github\.com\/danbri\/(?:glitchcan-minigam|londat)\/blob\/(?:master|main)\/[^"\s]+/g) || [])].sort();
  const local = u => { const m = u.match(/^https:\/\/github\.com\/danbri\/(glitchcan-minigam|londat)\/blob\/(?:master|main)\/(.+)$/); if (!m) return null;
    const p = m[1] === 'londat' ? join(LONDAT_DIR, m[2]) : join(ROOT, m[2]); try { return statSync(p).isFile() ? p : null; } catch { return null; } };
  const present = fileIris.map(u => [u, local(u)]).filter(([, p]) => p);
  const arts = present.map(([u, p]) => [u, file(p)]);
  Object.assign(versions, await flow.run(LIFT('lift-pipeline-provenance', 'pipeline.jsonld (prov:Activity per tool, used and generated files) -> RDF, blank nodes skolemized; each named file present at build time -> cwk:contentAtBuild artifact with SHA-256'), [pF, ...arts.map(a => a[1])], null, async () => {
    const ds = await jsonldToRdf(readFileSync(join(CW, 'pipeline.jsonld'), 'utf8'));
    const sk = t => t.termType === 'BlankNode' ? N(KG + 'genid/pipeline/' + sha(pF.sha256 + '\t' + t.value)) : t;
    const g = G(); for (const q of ds.toArray()) g.add(sk(q.subject), q.predicate, sk(q.object));
    for (const [u, a] of arts) { g.add(u, iri('cwk', 'contentAtBuild'), a.iri); g.lit(a.iri, iri('cwk', 'sha256'), a.sha256); g.lit(a.iri, iri('cwk', 'bytes'), a.bytes); }
    return { pipeline: { quads: g.quads, about: { title: 'Provenance of the earlier cwplans pipeline: every tool as a prov:Activity with the files it used and made (pipeline.jsonld), each file tied to its content at this build', licence: 'CC0 (descriptions of tools and files)' } } };
  })); }

// ---- graph versions made by other tools' operations: kgx/external-heads.json maps a name to a version in the log, or
// to { iri, store: false } for a version that is a head and in meta and current.nq.gz but not in the browser store
// (too large for what a query there gains: model-building-keys)
const offStore = new Set();
{ const ehF = join(OUT, 'external-heads.json');
  if (existsSync(ehF)) for (const [name, e] of Object.entries(JSON.parse(readFileSync(ehF, 'utf8')))) {
    const iri = typeof e === 'string' ? e : e.iri, v = flow.versions.get(iri);
    if (!v || !existsSync(join(OUT, v.file))) throw new Error(`external head ${name}: ${iri} is not in log/versions.jsonl or its file is missing`);
    versions[name] = v; if (typeof e === 'object' && e.store === false) offStore.add(name);
  } }

// ---- partition every source version by subject key for the store (blocks with narrow, disjoint zone maps)
const PART = 3000, parts = {};
for (const v of Object.values(versions)) {
  if (offStore.has(v.name)) continue;
  // drop the graph term: it is the last term and an IRI has no space, so it starts at the last ' <' (a regex from the
  // first ' <' cut literals such as "layer < 0")
  const lines = flow.read(v).split('\n').filter(Boolean).map(l => l.slice(0, l.lastIndexOf(' <')) + ' .');
  if (!v.blank && createHash('sha256').update(lines.join('\n') + '\n').digest('hex') !== v.rdfc10_sha256) throw new Error(`${v.name}: lines read back do not hash to the version`);
  const chunks = partitionLines(lines, PART);
  const outs = await flow.run(OPS.partition, [v], { target: PART }, async () => Object.fromEntries(chunks.map((c, k) => [`${v.name}.p${String(k).padStart(2, '0')}`, { lines: c, about: { partOf: v.iri, part: k } }])));
  parts[v.name] = Object.values(outs);
}

// ---- describe the versions (meta), then lift the activity log (log): both pure functions of what they are given
const heads = Object.fromEntries(Object.values(versions).map(v => [v.name, v.iri]));
const genBy = {}; for (const a of flow.log.values()) for (const o of a.outputs) (genBy[o] ||= []).push(a.id);
const describedVersions = [...Object.values(versions), ...Object.values(parts).flat()];
const metaV = await flow.run({ id: 'describe-graph-versions', version: 1, skill: 'cwplans-dataflow', tool: 'cwplans/tools/build-kgx.mjs', about: 'graph versions -> void:Dataset per version (name, title, licence, RDFC-1.0 hash, triples, generating activity, parts) and the heads (graph name -> current version)' },
  describedVersions, { heads, genBy: Object.fromEntries(describedVersions.map(v => [v.iri, genBy[v.iri] || []])) }, async ({ heads, genBy }) => {
    const g = G();
    for (const v of describedVersions) { const s = v.iri;
      g.add(s, TYPE, iri('void', 'Dataset')); g.add(s, TYPE, iri('prov', 'Entity')); g.add(s, iri('cwk', 'graphName'), KG + 'graph/' + v.name);
      g.lit(s, iri('cwk', 'rdfc10Sha256'), v.rdfc10_sha256); g.lit(s, iri('void', 'triples'), v.triples); g.lit(s, iri('cwk', 'file'), v.file);
      for (const a of genBy[s] || []) g.add(s, iri('prov', 'wasGeneratedBy'), a);
      if (v.partOf) { g.add(s, iri('dct', 'isPartOf'), v.partOf); g.lit(s, iri('cwk', 'part'), v.part); continue; }
      g.lit(s, iri('dct', 'title'), v.title); g.lit(s, iri('dct', 'license'), v.licence);
      if (v.osm) g.lit(s, iri('dct', 'rights'), '© OpenStreetMap contributors, ODbL 1.0, https://www.openstreetmap.org/copyright');
    }
    for (const [name, vi] of Object.entries(heads)) { g.add(KG + 'graph/' + name, iri('cwk', 'current'), vi); g.add(KG + 'graph/' + name, TYPE, iri('cwk', 'GraphName')); }
    return { meta: { quads: g.quads, about: { title: 'Descriptions of the graph versions and the current version of each graph name', licence: 'CC0 (descriptions only)' } } };
  });
// the log as RDF: every activity except lifts of the log and packs of the store (the store holds this graph, so it
// cannot describe its own packing; those two stay in log/activities.jsonl and manifest.json). An unchanged pipeline
// then gives the same log version, the same store input and the same generation.
const logActs = [...flow.log.values()].filter(a => a.operation !== 'lift-activity-log' && a.operation !== 'pack-shardborough').sort((a, b) => a.id.localeCompare(b.id));
const logBlob = { kind: 'file', iri: KG + 'artifact/sha256/' + createHash('sha256').update(JSON.stringify(logActs)).digest('hex'), label: 'kgx/log/activities.jsonl (without lift-activity-log entries)' };
const logV = await flow.run({ id: 'lift-activity-log', version: 1, skill: 'cwplans-dataflow', tool: 'cwplans/tools/build-kgx.mjs', about: 'activity log -> prov:Activity per run: operation, version, skill, tool, inputs (prov:used), parameters, outputs (prov:generated), times' }, [logBlob], null, async () => {
  const g = G();
  for (const a of logActs) { const s = a.id;
    g.add(s, TYPE, iri('prov', 'Activity')); g.add(s, iri('cwk', 'operation'), KG + 'operation/' + a.operation); g.lit(s, iri('cwk', 'operationVersion'), a.operation_version);
    g.add(KG + 'operation/' + a.operation, TYPE, iri('cwk', 'Operation')); g.lit(KG + 'operation/' + a.operation, iri('rdfs', 'comment'), a.about);
    g.lit(KG + 'operation/' + a.operation, iri('cwk', 'skill'), a.skill); g.lit(KG + 'operation/' + a.operation, iri('cwk', 'tool'), a.tool);
    for (const i of a.inputs) g.add(s, iri('prov', 'used'), i); for (const o of a.outputs) g.add(s, iri('prov', 'generated'), o);
    if (a.params != null) g.lit(s, iri('cwk', 'params'), JSON.stringify(a.params).slice(0, 2000));
    g.lit(s, iri('prov', 'startedAtTime'), a.started, 'dateTime'); g.lit(s, iri('prov', 'endedAtTime'), a.ended, 'dateTime');
  }
  for (const f of flow.files.values()) { g.add(f.iri, TYPE, iri('cwk', 'Artifact')); g.lit(f.iri, iri('cwk', 'sha256'), f.sha256); g.lit(f.iri, iri('cwk', 'bytes'), f.bytes); g.lit(f.iri, iri('rdfs', 'label'), f.label); }
  return { log: { quads: g.quads, about: { title: 'The activity log: every operation run on the kgx graphs, its inputs, parameters and outputs', licence: 'CC0' } } };
});

// ---- outputs: heads, current.nq.gz (the current version of every graph), the store of all parts + meta + log
writeFileSync(join(OUT, 'heads.json'), JSON.stringify({ heads: { ...heads, meta: metaV.meta.iri, log: logV.log.iri } }, null, 1) + '\n');
const current = [...Object.values(versions), metaV.meta, logV.log];
writeFileSync(join(OUT, 'current.nq.gz'), gzipSync(current.map(v => flow.read(v)).join('')));
let store = null;
if (!process.argv.includes('--no-store')) {
  const members = [...Object.values(parts).flat(), metaV.meta, logV.log].sort((a, b) => a.iri.localeCompare(b.iri));
  const input = members.map(v => flow.read(v)).join('');                 // grouped by graph, subjects sorted inside each
  const genName = 'gen-' + createHash('sha256').update(input).digest('hex').slice(0, 16), sdir = join(OUT, 'shardborough');
  mkdirSync(sdir, { recursive: true });
  const inBlob = { kind: 'file', iri: KG + 'artifact/sha256/' + createHash('sha256').update(input).digest('hex'), label: 'store input: the part versions, meta and log, in graph order' };
  const op = { id: 'pack-shardborough', version: 1, skill: 'cwplans-kgx', tool: 'factoidal pack --layout ibk5 + factoidal activate', about: 'graph versions -> one Shardborough generation (wire version 10, zone maps), activated' };
  const actId = KG + 'activity/' + createHash('sha256').update(JSON.stringify([op.id, op.version, members.map(m => m.iri), { layout: 'ibk5' }])).digest('hex').slice(0, 16);
  if (!existsSync(join(sdir, genName, 'manifest.sbm2'))) {
    const tmp = join(OUT, '.store-input.nq'); writeFileSync(tmp, input); const bin = join(ROOT, 'node_modules', '.bin', 'factoidal');
    execFileSync(bin, ['pack', tmp, join(sdir, genName), '--layout', 'ibk5'], { stdio: 'inherit' }); rmSync(tmp);
  }
  execFileSync(join(ROOT, 'node_modules', '.bin', 'factoidal'), ['activate', sdir, genName], { stdio: 'inherit' });
  for (const d of readdirSync(sdir)) if (d.startsWith('gen-') && d !== genName) rmSync(join(sdir, d), { recursive: true });
  if (!flow.log.has(actId)) { const a = { id: actId, operation: op.id, operation_version: op.version, skill: op.skill, tool: op.tool, about: op.about, inputs: members.map(m => m.iri), params: { layout: 'ibk5' }, outputs: [KG + 'store/' + genName], started: new Date().toISOString(), ended: new Date().toISOString() };
    flow.log.set(actId, a); flow.ran.push(actId); writeFileSync(flow.logFile, readFileSync(flow.logFile, 'utf8') + JSON.stringify(a) + '\n'); }
  store = { generation: genName, members: members.length, files: readdirSync(join(sdir, genName)).length, bytes: readdirSync(join(sdir, genName)).reduce((a, f) => a + statSync(join(sdir, genName, f)).size, 0) };
}
for (const d of ['nq', 'cottas', 'hdt']) if (existsSync(join(OUT, d))) rmSync(join(OUT, d), { recursive: true });   // the first layout; in git history
const manifest = { about: 'cwplans knowledge graph: immutable graph versions made by logged operations. See README.md.', base: KG, built: new Date().toISOString(),
  tool: 'cwplans/tools/build-kgx.mjs', engine: '@factoidal/core ' + JSON.parse(readFileSync(join(ROOT, 'node_modules', '@factoidal', 'core', 'package.json'), 'utf8')).version,
  prefixes: NS, heads: { ...heads, meta: metaV.meta.iri, log: logV.log.iri },
  graphs: Object.fromEntries(current.map(v => [v.name, { version: v.iri, rdfc10_sha256: v.rdfc10_sha256, triples: v.triples, file: v.file, parts: (parts[v.name] || []).length, title: v.title, licence: v.licence }])),
  total_triples: current.reduce((a, v) => a + v.triples, 0), store, activities_this_run: flow.used.length, activities_run_new: flow.ran.length, activities_in_log: flow.log.size };
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(JSON.stringify({ graphs: Object.fromEntries(current.map(v => [v.name, v.triples])), total: manifest.total_triples, parts: Object.values(parts).flat().length, store, activities_this_run: flow.used.length, new: flow.ran.length, in_log: flow.log.size }));
