// planning.data.gov.uk adapter for walk-portals.mjs (MHCLG Planning Data platform; every dataset OGL v3 with its own
// attribution text). Rules and reasons: skills/cwplans-open-portals/SKILL.md, "planning.data.gov.uk".
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { clipRing } from '../lib.mjs';
import { getJson, rawJson, RAWP, OUT, today, ZONE, ZONE_TEXT, CW_BOX, meets, wholeIn, roundGeom, DROP_FIELD, writeLines, writeGeojson, licenceClass , outExists, writeOut } from '../walk-portals.mjs';

const BASE = 'https://www.planning.data.gov.uk';
const WKT = `POLYGON((${ZONE[0]} ${ZONE[1]},${ZONE[2]} ${ZONE[1]},${ZONE[2]} ${ZONE[3]},${ZONE[0]} ${ZONE[3]},${ZONE[0]} ${ZONE[1]}))`;
const zoneQ = (ds, extra = '') => `${BASE}/entity.json?dataset=${ds}&geometry=${encodeURIComponent(WKT)}&geometry_relation=intersects${extra}`;
// the planning organisations of the zone (organisation-entity numbers on the platform)
export const ZONE_ORGS = { 144: 'Greater London Authority', 150: 'Royal Borough of Greenwich', 198: 'London Borough of Lewisham', 203: 'City of London Corporation', 246: 'London Borough of Newham', 329: 'London Borough of Southwark', 350: 'London Borough of Tower Hamlets' };
const CAT = join(OUT, 'pdg', 'catalogue.json');

export async function walk() {
  const { json: ds, fetched } = await rawJson('pdg/dataset.json', `${BASE}/dataset.json`);
  const rows = [];
  for (const d of ds.datasets) {
    const r = { dataset: d.dataset, name: d.name, typology: d.typology, phase: d.phase || null, realm: d.realm || null, collection: d.collection || null, themes: d.themes || [],
      entities: d['entity-count'] || 0, licence: d.licence, attribution: (d['attribution-text'] || '').replace(/\s+/g, ' ').trim().slice(0, 500), consideration: d.consideration || null,
      replacement: d['replacement-dataset'] || null, start: d['start-date'] || null, end: d['end-date'] || null };
    if (r.entities > 0 && !r.end) {
      if (r.typology === 'geography') {
        const j = await getJson(zoneQ(d.dataset, '&limit=1'));
        r.zone = j.count;
      } else {
        r.zone_by_org = {};
        for (const o of Object.keys(ZONE_ORGS)) { const j = await getJson(`${BASE}/entity.json?dataset=${d.dataset}&organisation_entity=${o}&limit=1`); if (j.count) r.zone_by_org[o] = j.count; }
        r.zone = Object.values(r.zone_by_org).reduce((a, b) => a + b, 0);
      }
      process.stdout.write(`\r${d.dataset} ${r.zone}                    `);
    }
    rows.push(r);
  }
  writeLines(CAT, { portal: 'planning.data.gov.uk', api: `${BASE}/dataset.json; ${BASE}/entity.json?dataset=<d>&geometry=<zone polygon>&geometry_relation=intersects (count); non-geography datasets: entity.json?dataset=<d>&organisation_entity=<zone planning organisation>`, walked: today, dataset_list_fetched: fetched,
    zone: ZONE_TEXT, zone_orgs: ZONE_ORGS, rule: 'every dataset in dataset.json; zone = entities whose geometry intersects the zone box (geography), or entities published by a zone planning organisation (other typologies); ended datasets and empty ones are not counted' }, 'datasets', rows);
  console.log(`\n${rows.length} datasets`);
}

// by hand: held already, or the same data held from another source (with the file), or judged for another reason
const JUDGED = {
  'title-boundary': ['held', 'HM Land Registry INSPIRE Index Polygons are held (source hmlr-inspire, tools/registry-inspire.mjs); the platform re-serves them'],
  tree: ['held', 'held: docklands/data/trees.json (source planning-data-tree, tools/build-trees.mjs)'],
  'transport-access-node': ['held', 'NaPTAN is held (source naptan, tools/fetch-works.mjs)'],
  'educational-establishment': ['held', 'DfE GIAS is held (source dfe-gias, tools/fetch-registers.mjs)'],
  'scheduled-monument': ['held', 'held: registry/sources/museums/records-open.json (Historic England NHLE scheduled monuments, 61 in the box)'],
  'archaeological-priority-area': ['held', 'held: registry/sources/museums/apa_greater_london.geojson'],
  'conservation-area': ['held', 'held from the GLA: feeds/london-datastore/conservation-areas/ (London Datastore emqwg); the platform copy is from the same boroughs'],
  'brownfield-land': ['held', 'held from the GLA: feeds/london-datastore/brownfield-register/ (London Datastore 2og9g)'],
  'brownfield-site': ['held', 'held from the GLA: feeds/london-datastore/brownfield-register/ (London Datastore 2og9g)'],
  'central-activities-zone': ['held', 'held from the GLA: feeds/london-datastore/central-activities-zone/'],
  ward: ['held', 'held: feeds/london-datastore/statistical-boundaries/ and postcodes/ (ONS wards)'],
  'local-authority-district': ['not-relevant', 'borough outlines: held as codes; coarser than the zone'],
  region: ['not-relevant', 'coarser than the zone'],
  'local-planning-authority': ['not-relevant', 'borough outlines; coarser than the zone'],
  'local-resilience-forum-boundary': ['not-relevant', 'coarser than the zone (all London)'],
  'local-plan-boundary': ['not-relevant', 'borough outlines; coarser than the zone'],
  'waste-plan-boundary': ['not-relevant', 'borough outlines; coarser than the zone'],
  'minerals-plan-boundary': ['not-relevant', 'borough outlines; coarser than the zone'],
  border: ['not-relevant', 'the border of England; coarser than the zone'],
  'local-authority': ['not-relevant', 'the organisation records of the zone authorities (names, codes, websites): held as codes'],
  'built-up-area': ['not-relevant', 'one Greater London built-up area; coarser than the zone'],
};
const NON_GEO_HARVEST = ['developer-agreement', 'developer-agreement-transaction', 'developer-agreement-contribution', 'local-plan', 'design-code', 'design-code-rule', 'infrastructure-funding-statement', 'conservation-area-document', 'development-plan-document', 'article-4-direction', 'tree-preservation-order', 'planning-condition', 'planning-application-condition', 'plan-timetable', 'local-area-requirements', 'community-infrastructure-levy-schedule'];
export async function triage() {
  const cat = readJson(CAT);
  const H = new Set(Object.keys(HARVEST));
  const rows = cat.datasets.map(d => {
    const lic = licenceClass(d.licence, d.attribution);
    let state, rule, why;
    const harvested = H.has(d.dataset) && outExists(join(OUT, 'pdg', d.dataset, `${d.dataset}.${HARVEST[d.dataset].fmt === 'table' ? 'json' : 'geojson'}`));
    if (harvested) { state = 'harvested'; rule = 'P1'; why = `feeds/portals/pdg/${d.dataset}/`; }
    else if (JUDGED[d.dataset]) { [state, why] = JUDGED[d.dataset]; rule = 'P0'; }
    else if (d.end) { state = 'unavailable'; rule = 'P2'; why = `dataset ended ${d.end}${d.replacement ? `; replaced by ${d.replacement}` : ''}`; }
    else if (!['ogl', 'cc-by', 'odc-by', 'public-domain'].includes(lic)) { state = 'not-open'; rule = 'P3'; why = `licence ${d.licence}`; }
    else if (!d.entities) { state = 'unavailable'; rule = 'P4'; why = 'no entities on the platform'; }
    else if (['category', 'pipeline', 'entity', 'value'].includes(d.typology)) { state = 'not-relevant'; rule = 'P5'; why = `${d.typology}: a code list, not data about places`; }
    else if (!d.zone) { state = 'not-relevant'; rule = 'P6'; why = d.typology === 'geography' ? 'no entity meets the zone' : 'no entity from a zone planning organisation'; }
    else if (d.typology === 'geography' || NON_GEO_HARVEST.includes(d.dataset)) { state = 'listed-for-harvest'; rule = 'P7'; why = `${d.zone} zone entities`; }
    else { state = 'deferred'; rule = 'P8'; why = `${d.typology}: ${d.zone} entities from zone organisations; not yet judged`; }
    return { dataset: d.dataset, name: d.name, typology: d.typology, phase: d.phase, entities: d.entities, zone: d.zone ?? null, licence: lic, state, rule, reason: why };
  });
  const counts = {}; for (const r of rows) counts[r.state] = (counts[r.state] || 0) + 1;
  writeLines(join(OUT, 'pdg', 'triage.json'), { portal: 'planning.data.gov.uk', triaged: today, counts, rules: ['P0 by hand (JUDGED: held from another source, or coarser than the zone)', 'P1 harvested', 'P2 unavailable: the dataset has an end date', 'P3 not-open', 'P4 unavailable: no entities', 'P5 not-relevant: a category, pipeline or value list', 'P6 not-relevant: nothing in the zone', 'P7 listed-for-harvest: entities in the zone (geography) or from zone planning organisations (documents, agreements, plans)', 'P8 deferred: other typologies with zone entities'] }, 'datasets', rows);
  console.log(counts);
}

// harvest: every geography dataset listed by triage, plus named non-geography ones (by zone organisation)
export const HARVEST = {
  'listed-building': { why: 'NHLE listed buildings (points) with grade; Historic England layer not taken before' },
  'listed-building-outline': { why: 'listed building outlines where the borough drew them' },
  'heritage-at-risk': { why: 'Heritage at Risk register entries' },
  'locally-listed-building': { why: 'locally listed buildings from the boroughs' },
  'park-and-garden': { why: 'registered parks and gardens' },
  'world-heritage-site': { why: 'World Heritage Sites (Maritime Greenwich, Tower of London)' },
  'world-heritage-site-buffer-zone': { why: 'World Heritage Site buffer zones' },
  'certificate-of-immunity': { why: 'certificates of immunity from listing' },
  'building-preservation-notice': { why: 'building preservation notices' },
  'protected-wreck-site': { why: 'protected wreck sites' },
  'article-4-direction-area': { why: 'all Article 4 direction areas (the GLA file held only office-to-residential)' },
  'tree-preservation-zone': { why: 'area Tree Preservation Orders (trees as points are held)' },
  'flood-risk-zone': { why: 'EA Flood Map for Planning zones 2 and 3', simplify: true, clip: true },
  'flood-storage-area': { why: 'EA flood storage areas' },
  'air-quality-management-area': { why: 'AQMAs' },
  'local-nature-reserve': { why: 'local nature reserves' },
  'site-of-special-scientific-interest': { why: 'SSSIs' },
  'green-belt': { why: 'green belt' },
  'asset-of-community-value': { why: 'assets of community value' },
  'development-corporation-boundary': { why: 'development corporation boundaries (LDDC, LTGDC, LLDC)' },
  'infrastructure-project': { why: 'nationally significant infrastructure projects (Thames Tideway, Silvertown Tunnel)' },
  'planning-application': { why: 'planning applications from the boroughs that publish to the platform' },
  'design-code-area': { why: 'design code areas' },
  'parish': { why: 'parishes (Queen\'s Park only in London)' },
  'agricultural-land-classification': { why: 'ALC grades (urban)' },
  'ancient-woodland': { why: 'ancient woodland' },
  'national-nature-reserve': { why: 'NNRs' }, 'ramsar': { why: 'Ramsar' }, 'special-protection-area': { why: 'SPA' }, 'special-area-of-conservation': { why: 'SAC' },
  'nature-improvement-area': { why: 'NIA' }, 'heritage-coast': { why: '' }, 'battlefield': { why: '' }, 'area-of-outstanding-natural-beauty': { why: '' }, 'national-park': { why: '' },
  'nutrient-neutrality-catchment': { why: '' },
  'developer-agreement-contribution': { fmt: 'table', why: 'section 106 contributions (amounts, purposes) by zone authority' },
  'developer-agreement': { fmt: 'table', why: 'section 106 agreements by zone authority' },
  'developer-agreement-transaction': { fmt: 'table', why: 'section 106 money received and spent' },
  'conservation-area-document': { fmt: 'table', why: 'appraisals and management plans (links) for zone conservation areas' },
  'article-4-direction': { fmt: 'table', why: 'Article 4 directions (the legal instruments) of zone authorities' },
  'tree-preservation-order': { fmt: 'table', why: 'TPO instruments of zone authorities' },
  'local-plan': { fmt: 'table', why: 'local plans of zone authorities' },
  'development-plan-document': { fmt: 'table', why: 'development plan documents (links)' },
  'infrastructure-funding-statement': { fmt: 'table', why: 'infrastructure funding statements (links)' },
  'community-infrastructure-levy-schedule': { fmt: 'table', why: 'CIL charging schedules (links)' },
  'design-code': { fmt: 'table', why: 'design codes' },
  'design-code-rule': { fmt: 'table', why: 'design code rules' },
  'planning-application-condition': { fmt: 'table', why: 'planning conditions' }, 'planning-condition': { fmt: 'table', why: 'planning conditions' },
  'local-area-requirements': { fmt: 'table', why: 'validation requirements' }, 'plan-timetable': { fmt: 'table', why: 'plan timetables' },
};
const readJson = f => JSON.parse(readFileSync(f, 'utf8'));
function simplifyLine(pts, tol) {          // Douglas-Peucker in degrees; keeps the ends
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1; const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) { const [x, y] = pts[i]; let t = L ? ((x - x1) * dx + (y - y1) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); const ex = x1 + t * dx - x, ey = y1 + t * dy - y, d = ex * ex + ey * ey; if (d > md) { md = d; mi = i; } }
    if (md > tol * tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const simplifyGeom = (g, tol) => g.type === 'Polygon' ? { type: g.type, coordinates: g.coordinates.map(r => simplifyLine(r, tol)).filter(r => r.length >= 4) }
  : g.type === 'MultiPolygon' ? { type: g.type, coordinates: g.coordinates.map(p => p.map(r => simplifyLine(r, tol)).filter(r => r.length >= 4)).filter(p => p.length) } : g;

export async function harvest(keys) {
  const cat = readJson(CAT), byId = Object.fromEntries(cat.datasets.map(d => [d.dataset, d]));
  const todo = keys.length ? keys : Object.keys(HARVEST).filter(k => byId[k]?.zone);
  const sizes = {};
  for (const k of todo) {
    const H = HARVEST[k], d = byId[k]; if (!H || !d) { console.warn(`skip ${k}`); continue; }
    if (!d.zone) { console.log(`${k}: nothing in the zone`); continue; }
    const feats = [], rows = []; let offset = 0, pages = 0;
    if (H.fmt === 'table') {
      for (const o of Object.keys(d.zone_by_org || {})) {
        for (offset = 0; ; offset += 500) {
          const j = await getJson(`${BASE}/entity.json?dataset=${k}&organisation_entity=${o}&limit=500&offset=${offset}`); pages++;
          for (const e of j.entities) { const p = {}; for (const [a, v] of Object.entries(e)) if (v !== '' && v != null && !DROP_FIELD.test(a) && a !== 'geometry' && a !== 'point') p[a] = v; p.organisation = ZONE_ORGS[o]; rows.push(p); }
          if (j.entities.length < 500) break;
        }
      }
    } else {
      for (offset = 0; ; offset += 500) {
        const j = await getJson(`${BASE}/entity.geojson?dataset=${k}&geometry=${encodeURIComponent(WKT)}&geometry_relation=intersects&limit=500&offset=${offset}`, { timeout: 600000 }); pages++;
        for (const f of j.features) {
          if (!f.geometry) continue;
          let g = roundGeom(f.geometry, 6); if (H.simplify) g = simplifyGeom(g, 0.000005);
          const p = {}; for (const [a, v] of Object.entries(f.properties || {})) if (v !== '' && v != null && !DROP_FIELD.test(a)) p[a] = v;
          if (H.clip && !wholeIn(g) && /Polygon/.test(g.type)) {          // cut at the box: these polygons run far beyond the zone
            const B = { x0: ZONE[0], x1: ZONE[2], z0: ZONE[1], z1: ZONE[3] }, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
            const out = polys.map(pl => pl.map(r => clipRing(r.slice(0, -1), B)).filter(Boolean).map(r => roundGeom({ type: 'LineString', coordinates: [...r, r[0]] }).coordinates)).filter(pl => pl.length);
            if (!out.length) continue;
            g = { type: 'MultiPolygon', coordinates: out }; p.clipped_to_zone = true;
          }
          p.in_zone = meets(g); p.whole_in_zone = wholeIn(g); p.in_cw = meets(g, CW_BOX); if (p.organisation_entity || p['organisation-entity']) p.organisation = ZONE_ORGS[p['organisation-entity']] || undefined;
          feats.push({ type: 'Feature', geometry: g, properties: p });
        }
        process.stdout.write(`\r${k} ${feats.length}   `);
        if (j.features.length < 500) break;
      }
    }
    const meta = {
      source: `planning.data.gov.uk: ${d.name} (${k})`, dataset: k, page: `${BASE}/dataset/${k}`, typology: d.typology, phase: d.phase,
      api: H.fmt === 'table' ? `${BASE}/entity.json?dataset=${k}&organisation_entity=<${Object.keys(d.zone_by_org || {}).join('|')}>&limit=500&offset=<n>` : `${BASE}/entity.geojson?dataset=${k}&geometry=<zone polygon WKT>&geometry_relation=intersects&limit=500&offset=<n>`,
      fetched: today, licence: 'Open Government Licence v3.0', licence_url: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/', attribution: d.attribution || 'Contains public sector information licensed under the Open Government Licence v3.0 (planning.data.gov.uk)',
      why: H.why, zone: ZONE_TEXT,
      method: H.fmt === 'table' ? `walk-portals.mjs pdg harvest ${k}: every entity published by a zone planning organisation (${Object.entries(d.zone_by_org || {}).map(([o, n]) => `${ZONE_ORGS[o]} ${n}`).join(', ')}); fields kept as published except empty ones and fields matching ${DROP_FIELD}` :
        `walk-portals.mjs pdg harvest ${k}: the platform's spatial query (geometry intersects the zone box) in pages of 500; whole geometries kept (not cut), rounded to 6 decimals${H.simplify ? ', simplified (Douglas-Peucker, 0.000005 degrees, about 0.5 m) to keep the file small' : ''}${H.clip ? '; polygons that cross the box edge are cut at the box (clipped_to_zone: true; a hole that crosses the edge is cut as a ring, so a cut polygon is for display, not for area sums)' : ''}; in_zone, whole_in_zone, in_cw (Canary Wharf registry box ${CW_BOX.join(', ')}); fields kept as published except empty ones and fields matching ${DROP_FIELD}`,
      counts: H.fmt === 'table' ? { rows: rows.length, by_org: d.zone_by_org, pages } : { features: feats.length, zone_count_at_walk: d.zone, whole_in_zone: feats.filter(f => f.properties.whole_in_zone).length, in_cw: feats.filter(f => f.properties.in_cw).length, pages },
    };
    const file = join(OUT, 'pdg', k, `${k}.${H.fmt === 'table' ? 'json' : 'geojson'}`);
    const n = H.fmt === 'table' ? writeLines(file, meta, 'rows', rows) : writeGeojson(file, meta, feats);
    sizes[k] = n; console.log(`\n${k}: ${H.fmt === 'table' ? rows.length + ' rows' : feats.length + ' features'}, ${(n / 1e3).toFixed(0)} kB`);
  }
  console.log(sizes);
}
