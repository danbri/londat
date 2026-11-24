// Overrides on the "Realistic" look (data/materials.json, tools/build-materials.mjs) for buildings whose type or name the
// general rules get wrong, from building-keys.json (OSM building type, parent, name, Wikidata) and a short list of named
// buildings with the reason for each. Writes cwplans/docklands/data/materials-overrides.json: per model index a facade
// style and a wall colour, applied by look-layer.js after decoding materials.json (same model fingerprint).
// Why (2026-11-23, the owner's photos of the Tower of London, Tower Bridge and the City from the river,
// data/images/contrib/thames-2026-11-23/): the rules made every OSM building=castle a "civic" building with large windows in
// brick or concrete (castle is in their CIVIC list), so the White Tower and the other Tower of London buildings had office
// windows; the Northern and Shell Building, a stepped front of reflective glass, had punched windows.
// Rules, in order (the first that matches):
//   1. a named building of NAMED (by OSM key, its parts included): the style and wall given there;
//   2. OSM building=castle (or a part of one), barracks inside the Tower of London: masonry, Kentish ragstone;
// Styles: the page's eight (house ... civic) and masonry (index 8: stone, few small windows; docklands/materials.js).
//   node cwplans/tools/build-material-overrides.mjs        (MAT_DRY=1: write the file, no log entry)
// One logged operation (kgx-ops Flow). Skills: docklands-3d-page ("Realistic look"), cwplans-dataflow.
import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { dataFactory as F } from '@factoidal/core';
import { TOOLS } from './lib.mjs';
import { LONDAT_DIR } from './londat.mjs';
import { Flow } from './kgx-ops.mjs';
import { kid, VOCAB } from './kgx-ids.mjs';

const CW = join(TOOLS, '..'), DD = join(CW, 'docklands', 'data'), KEYS = join(DD, 'building-keys.json'), MAT = join(DD, 'materials.json');
const OUT = join(DD, 'materials-overrides.json'), K = join(LONDAT_DIR, 'kgx');
const STYLE = { house: 0, flats: 1, estate: 2, office: 3, ribbon: 4, curtain: 5, shed: 6, civic: 7, masonry: 8 };
// wall colours (sRGB 0..1), each with what it is and where the value comes from
const WALLS = {
  ragstone: { c: [.62, .58, .50], about: 'Kentish ragstone, grey-buff, with Caen and Portland dressings (Tower of London); judged from the owner\'s photo IMG_2340 of 2026-11-23, sunlit' },
  portland: { c: [.80, .78, .72], about: 'Portland stone, pale cream-grey' },
  glassRefl: { c: [.42, .52, .62], about: 'reflective glass, blue-silver (the Northern and Shell Building, photo IMG_2347 of 2026-11-23)' },
  stockYellow: { c: [.80, .70, .48], about: 'yellow brick with stone dressings (Old Billingsgate, photo IMG_2347)' },
};
// named buildings: OSM key -> [style, wall, reason]
const NAMED = {
  w369135772: ['masonry', 'ragstone', 'White Tower (Q1528473): Norman keep, few small windows'],
  w367652791: ['masonry', 'portland', 'Tower Bridge South Tower: stone-clad towers, few windows'],
  w367652787: ['masonry', 'portland', 'Tower Bridge North Tower: stone-clad towers, few windows'],
  r1924304: ['office', 'portland', 'Custom House (Q5196382): Portland stone front, punched windows'],
  w143415208: ['office', 'portland', "Fishmongers' Hall (Q17645554): Portland stone"],
  w145631777: ['office', 'portland', 'Adelaide House (Q4681735): Portland stone'],
  w145631775: ['civic', 'stockYellow', 'Old Billingsgate Market (Q15263739): yellow brick, stone dressings, large arched windows'],
  w142658103: ['curtain', 'glassRefl', 'Northern and Shell Building (Q321273), 10 Lower Thames Street: stepped front of reflective glass'],
  w717305094: ['curtain', 'glassRefl', 'Northern and Shell Building (Q321273): part'],
};
const sha = b => createHash('sha256').update(b).digest('hex');
const op = { id: 'build-material-overrides', version: 1, skill: 'docklands-3d-page', tool: 'cwplans/tools/build-material-overrides.mjs',
  about: 'building-keys.json (OSM type, parent, name) + materials.json (model fingerprint) + the named list of the tool -> a facade style and wall colour for the buildings the Realistic rules get wrong (docklands/data/materials-overrides.json)' };
const dry = !!process.env.MAT_DRY, flow = new Flow(K);
const inputs = dry ? [] : [flow.file(KEYS, 'cwplans/docklands/data/building-keys.json'), flow.file(MAT, 'cwplans/docklands/data/materials.json')];

async function body() {
  const Kj = JSON.parse(readFileSync(KEYS, 'utf8')), M = JSON.parse(readFileSync(MAT, 'utf8')), ids = Kj.ids.split(','), osm = Kj.osm;
  const items = [], q = [], V = VOCAB, lit = (s, t) => F.literal(String(s), t ? F.namedNode('http://www.w3.org/2001/XMLSchema#' + t) : undefined);
  const add = (s, p, o) => q.push(F.quad(F.namedNode(s), F.namedNode(p), o));
  const counts = {};
  ids.forEach((id, i) => {
    const o = osm[id] || {}, par = o.p ? osm[o.p] || {} : {}, b = String(o.b || par.b || '').replace(/^part:/, '');
    let r = NAMED[id] || (o.p && NAMED[o.p]) || null, why = r ? r[2] : null;
    if (!r && b === 'castle') { r = ['masonry', 'ragstone']; why = 'OSM building=castle' + (o.p ? ' (part)' : ''); }
    if (!r && b === 'barracks' && /Waterloo Block/.test(o.n || par.n || '')) { r = ['masonry', 'ragstone']; why = 'Tower of London barracks'; }
    if (!r) return;
    const [st, wall] = r; items.push([i, STYLE[st], Object.keys(WALLS).indexOf(wall)]); counts[st + '/' + wall] = (counts[st + '/' + wall] || 0) + 1;
    const s = kid('building', 'osm-' + id); add(s, V + 'facadeStyle', lit(st)); add(s, V + 'wallMaterial', lit(WALLS[wall].about)); add(s, V + 'materialBasis', lit(why));
  });
  const out = { about: 'Overrides on the Realistic look (materials.json) by model index: [index, style, wall]; style: 0 house ... 7 civic, 8 masonry; wall: an index into walls (sRGB 0..1). Made by cwplans/tools/build-material-overrides.mjs (do not edit by hand) from building-keys.json and the tool\'s named list. Valid while model.fp matches materials.json.',
    model: { fp: M.model.fp }, inputs: { 'building-keys.json': sha(readFileSync(KEYS)), 'materials.json': sha(readFileSync(MAT)) },
    styles: Object.keys(STYLE), walls: Object.values(WALLS).map(w => w.c), wall_about: Object.fromEntries(Object.entries(WALLS).map(([k, w]) => [k, w.about])), counts, items };
  writeFileSync(OUT, JSON.stringify(out) + '\n');
  console.error(JSON.stringify({ counts, items: items.length }));
  return { 'material-overrides': { quads: q, about: { title: 'Facade style and wall material overrides for named and historic model buildings (the Realistic look of the 3D page)', licence: 'CC0 1.0 (contains OpenStreetMap data, ODbL 1.0)', osm: true } } };
}
if (dry) { await body(); process.exit(0); }
const res = await flow.run(op, inputs, {}, body);
const v = res['material-overrides'], ehF = join(K, 'external-heads.json'), eh = JSON.parse(readFileSync(ehF, 'utf8'));
eh['material-overrides'] = v.iri; writeFileSync(ehF, JSON.stringify(eh, null, 1) + '\n');
console.log(JSON.stringify({ version: v.iri, triples: v.triples, new: flow.ran.length }));
