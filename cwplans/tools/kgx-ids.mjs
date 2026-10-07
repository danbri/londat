// Public IDs of the cwplans knowledge graph: https://kgx.foaf.tv/id/<local>, <local> lowercase alphanumeric [a-z0-9]+.
// kid(kind, ...parts) mints an ID from the parts of the old name: CODE[kind] + an(parts joined by '/'). mapLegacy(iri)
// gives the ID of a name of the old namespaces (https://danbri.github.io/londat/kgx/..., the register and web-harvest
// names under https://danbri.github.io/glitchcan-minigam/..., urn:cwplans:local:..., the CWG address and opening-hours
// nodes) and returns every other IRI unchanged; an old name of a kind with no code throws. Every ID minted in a run is
// registered (ID -> old name): two old names that give one ID throw. The vocabularies (cwk:, cwp:, the idioms ShEx
// namespace) are not IDs and do not change.
//   node cwplans/tools/kgx-ids.mjs --test     self-test: the examples, idempotence, the error cases
// Library; used by kgx-ops.mjs, build-kgx.mjs, check-data-register.mjs and the tools that write kgx graph versions.
// Skills: cwplans-kgx ("Graphs, IRIs, vocabulary": the scheme, the code table, the reasons), cwplans-dataflow.
import { pathToFileURL } from 'url';

export const ID_BASE = 'https://kgx.foaf.tv/id/';
export const LEGACY_KG = 'https://danbri.github.io/londat/kgx/';
export const VOCAB = LEGACY_KG + 'vocab#';                                         // cwk:, unchanged
const GL = 'https://danbri.github.io/glitchcan-minigam/';
export const REGISTER_VOCAB = GL + 'magpie/cwplans/data-register.json#vocab/';     // cwp:, unchanged
export const IDIOMS_VOCAB = GL + 'third_party/cwplans-structured-data/idioms/idioms.shex#';   // unchanged
const CWG_SITE = 'https://canarywharf.com/';

// alphanumeric form: accents dropped, lower case, every other character removed
export const an = s => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// things, old base https://danbri.github.io/londat/kgx/id/<kind>/<rest>
export const ID_CODES = { building: '', facility: 'lmf', unit: 'lmu', storeguide: 'sg', fact: 'fact', thing: 'thing', mall: 'mall',
  area: 'area', 'imagery-source': 'imagery', coverage: 'cov', oam: 'oam', photo: 'photo', 'facade-patch': 'patch',
  'facade-tile': 'tile', 'facade-atlas': 'atlas', model: 'model' };
// provenance and store, old base https://danbri.github.io/londat/kgx/<kind>/<rest> (vocab# is the cwk: vocabulary)
export const KG_CODES = { graph: 'graph', activity: 'act', artifact: '', operation: 'op', genid: 'genid', store: 'store' };
// names minted outside kgx and lifted into it: [old prefix, kind, code]
export const LIFTED = [
  [GL + 'magpie/cwplans/data-register.json#source/', 'source', 'src'],
  [GL + 'magpie/cwplans/data-register.json#activity/', 'tool', 'tool'],
  [GL + 'third_party/cwplans-structured-data/desc/', 'desc', 'desc'],
  [GL + 'third_party/cwplans-structured-data/.well-known/genid/', 'web-genid', 'genid'],
  [GL + 'third_party/cwplans-structured-data/idioms/node/', 'node', 'node'],
  ['urn:cwplans:local:', 'local', 'local'],                                        // local files in pipeline.jsonld
];
// nodes this project minted under a CWG entity's page: <page>#address (cwg-directory-typed.mjs) and
// <page>#entity-hours-<Day>-<k> (build-kgx lift-cwg-directory). The entity IRIs <page>#entity stay.
const CWG_NODE = /^https:\/\/canarywharf\.com\/(.+)\/#(?:(address)|entity-hours-([A-Za-z]+)-(\d+))$/;
export const CODE = { ...ID_CODES, ...KG_CODES, ...Object.fromEntries(LIFTED.map(([, k, c]) => [k, c])), address: 'addr', hours: 'hours' };
// namespaces in which an IRI with no code is an error (a new kind gets a code on purpose)
const OLD_SPACES = [LEGACY_KG, GL + 'magpie/cwplans/data-register.json#', GL + 'third_party/cwplans-structured-data/', 'urn:cwplans:'];

// the old name that kid(kind, ...parts) stands for (the registry keeps it, so a collision names both)
function oldName(kind, parts) {
  if (Object.hasOwn(ID_CODES, kind)) return LEGACY_KG + 'id/' + kind + '/' + parts.join('/');
  if (Object.hasOwn(KG_CODES, kind)) return LEGACY_KG + kind + '/' + parts.join('/');
  if (kind === 'address') return `${CWG_SITE}${parts[0]}/#address`;
  if (kind === 'hours') return `${CWG_SITE}${parts[0]}/#entity-hours-${parts[1]}-${parts[2]}`;
  return LIFTED.find(l => l[1] === kind)[0] + parts.join('/');
}

const minted = new Map();                                                          // local name -> old name
export const mintedCount = () => minted.size;
export function kid(kind, ...parts) {
  if (!Object.hasOwn(CODE, kind)) throw new Error(`kgx-ids: no code for the kind "${kind}"`);
  const p = parts.map(String), rest = an(p.join('/')), local = CODE[kind] + rest;
  if (!rest || !/^[a-z0-9]+$/.test(local)) throw new Error(`kgx-ids: no alphanumeric local name for ${kind} ${JSON.stringify(p)} ("${local}")`);
  if ((kind === 'address' && p.length !== 1) || (kind === 'hours' && p.length !== 3)) throw new Error(`kgx-ids: ${kind} takes ${kind === 'hours' ? 'page path, day, index' : 'one page path'}`);
  const old = oldName(kind, p), prev = minted.get(local);
  if (prev === undefined) minted.set(local, old);
  else if (prev !== old) throw new Error(`kgx-ids: two names give the one ID ${ID_BASE}${local}: ${prev} and ${old}`);
  return ID_BASE + local;
}

// the page path of a CWG directory URL or entity IRI: https://canarywharf.com/restaurant/640-east/#entity -> restaurant/640-east
export function cwgPath(u) {
  if (!u.startsWith(CWG_SITE)) throw new Error(`kgx-ids: not a canarywharf.com page: ${u}`);
  const p = u.slice(CWG_SITE.length).replace(/#.*$/, '').replace(/\/$/, '');
  if (!p) throw new Error(`kgx-ids: no page path in ${u}`);
  return p;
}

// old name -> ID; any other IRI unchanged (an ID, a vocabulary term, an external IRI)
export function mapLegacy(iri) {
  if (iri.startsWith(ID_BASE) || iri.startsWith(VOCAB) || iri.startsWith(REGISTER_VOCAB) || iri.startsWith(IDIOMS_VOCAB)) return iri;
  if (iri.startsWith(LEGACY_KG)) {
    const r = iri.slice(LEGACY_KG.length), isId = r.startsWith('id/'), [kind, ...rest] = (isId ? r.slice(3) : r).split('/');
    if (Object.hasOwn(isId ? ID_CODES : KG_CODES, kind) && rest.length) return kid(kind, ...rest);
  } else {
    for (const [prefix, kind] of LIFTED) if (iri.startsWith(prefix) && iri.length > prefix.length) return kid(kind, iri.slice(prefix.length));
    const m = iri.match(CWG_NODE);
    if (m) return m[2] ? kid('address', m[1]) : kid('hours', m[1], m[3], m[4]);
  }
  if (OLD_SPACES.some(s => iri.startsWith(s))) throw new Error(`kgx-ids: ${iri} is in an old namespace but its kind has no code (give it one on purpose in kgx-ids.mjs)`);
  return iri;
}

// the OSM key (w123, r456) of a building ID minted from "osm-w123" (key-model-buildings, contrib-photos), else null
export function osmKeyOf(iri) {
  const id = mapLegacy(iri), m = id.startsWith(ID_BASE + 'osm') ? id.slice(ID_BASE.length + 3).match(/^([wr]\d+)$/) : null;
  return m ? m[1] : null;
}

// ---- self-test
export function selfTest() {
  const K = LEGACY_KG, eq = (a, b, what) => { if (a !== b) throw new Error(`self-test: ${what}: got ${a}, expected ${b}`); };
  const throws = (f, what) => { try { f(); } catch { return; } throw new Error(`self-test: ${what} did not throw`); };
  const examples = [
    ['id/building/cwb-0413', 'cwb0413'], ['id/building/cwb-0413/geometry', 'cwb0413geometry'], ['id/building/osm-w204580680', 'osmw204580680'],
    ['id/facility/1000118219602', 'lmf1000118219602'], ['id/unit/1002803405427/geometry', 'lmu1002803405427geometry'],
    ['id/storeguide/p1/cafes-bars/640-east-95bce8d22f6a', 'sgp1cafesbars640east95bce8d22f6a'], ['id/fact/010e0b6ece9c', 'fact010e0b6ece9c'],
    ['id/thing/10-park-drive-wood-wharf', 'thing10parkdrivewoodwharf'], ['id/mall/cabot-place', 'mallcabotplace'],
    ['id/area/canary-wharf/geometry', 'areacanarywharfgeometry'], ['id/imagery-source/ea-survey', 'imageryeasurvey'],
    ['id/coverage/2026-10-06/ea-survey/canary-wharf/lidar_composite_dtm-1m-2022', 'cov20261006easurveycanarywharflidarcompositedtm1m2022'],
    ['id/oam/5f515554805b400005d7e598', 'oam5f515554805b400005d7e598'], ['id/photo/0b0d171940a878ba/depicts-0', 'photo0b0d171940a878badepicts0'],
    ['id/facade-patch/cwdock/brick-tower-sse/colour-0', 'patchcwdockbricktowerssecolour0'],
    ['id/facade-tile/cwdock/brick-tower-17/for/brick-tower-17', 'tilecwdockbricktower17forbricktower17'],
    ['id/facade-atlas/docklands', 'atlasdocklands'], ['id/model/docklands-area/29a3eb8727087095', 'modeldocklandsarea29a3eb8727087095'],
    ['graph/buildings.p00/3fa086f639aa1bdc', 'graphbuildingsp003fa086f639aa1bdc'], ['graph/facts', 'graphfacts'],
    ['activity/017eb7a9ea079a7a', 'act017eb7a9ea079a7a'],
    ['artifact/sha256/0046e7d2b9c4f1a83a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5fd553', 'sha2560046e7d2b9c4f1a83a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5fd553'],
    ['operation/compose-facade-atlas', 'opcomposefacadeatlas'], ['genid/pipeline/00e257ebfcd9', 'genidpipeline00e257ebfcd9'],
    ['store/gen-94788565be0fae62', 'storegen94788565be0fae62'],
  ].map(([o, n]) => [K + o, n]).concat([
    [GL + 'magpie/cwplans/data-register.json#source/gla-cim-arcgis', 'srcglacimarcgis'],
    [GL + 'magpie/cwplans/data-register.json#activity/amend-uprns', 'toolamenduprns'],
    [GL + 'third_party/cwplans-structured-data/desc/00f0e211be9b8f433fc7', 'desc00f0e211be9b8f433fc7'],
    [GL + 'third_party/cwplans-structured-data/.well-known/genid/b517e85c0c7ab5fa0bd1', 'genidb517e85c0c7ab5fa0bd1'],
    [GL + 'third_party/cwplans-structured-data/idioms/node/address-da39a3ee5e6b4b0d3255bfef95601890afd80709', 'nodeaddressda39a3ee5e6b4b0d3255bfef95601890afd80709'],
    ['urn:cwplans:local:data/raw/docklands/osm-clip.json.gz', 'localdatarawdocklandsosmclipjsongz'],
    ['https://canarywharf.com/restaurant/640-east/#address', 'addrrestaurant640east'],
    ['https://canarywharf.com/restaurant/640-east/#entity-hours-Friday-0', 'hoursrestaurant640eastfriday0'],
  ]);
  for (const [o, n] of examples) { const id = mapLegacy(o); eq(id, ID_BASE + n, o); eq(mapLegacy(id), id, 'idempotence of ' + id); eq(mapLegacy(o), id, 'repeat of ' + o); }
  // minting at the source gives the same IDs as the mapping
  eq(kid('building', 'cwb-0413', 'geometry'), ID_BASE + 'cwb0413geometry', 'kid building geometry');
  eq(kid('graph', 'buildings.p00', '3fa086f639aa1bdc'), ID_BASE + 'graphbuildingsp003fa086f639aa1bdc', 'kid graph version');
  eq(kid('hours', cwgPath('https://canarywharf.com/restaurant/640-east/'), 'Friday', 0), ID_BASE + 'hoursrestaurant640eastfriday0', 'kid hours');
  eq(kid('source', 'gla-cim-arcgis'), ID_BASE + 'srcglacimarcgis', 'kid source');
  // unchanged: vocabularies and external IRIs
  for (const u of [VOCAB + 'CitedFact', REGISTER_VOCAB + 'hoursText', IDIOMS_VOCAB + 'BranchCard', 'https://schema.org/name', 'http://www.wikidata.org/entity/Q1032006',
    'https://www.openstreetmap.org/way/190355868', 'https://canarywharf.com/restaurant/manhattan-grill/#entity', 'https://canarywharf.com/#/schema/logo/image/',
    'https://github.com/danbri/londat/blob/main/cwplans/pipeline.json', 'https://raw.githubusercontent.com/danbri/londat/main/data/images/contrib/cwdock/photos.json',
    'https://danbri.github.io/glitchcan-minigam/magpie/cwplans/docklands/']) eq(mapLegacy(u), u, 'unchanged ' + u);
  eq(osmKeyOf(K + 'id/building/osm-w204580680'), 'w204580680', 'osmKeyOf old'); eq(osmKeyOf(ID_BASE + 'osmr2643629'), 'r2643629', 'osmKeyOf new');
  eq(osmKeyOf(ID_BASE + 'cwb0413'), null, 'osmKeyOf cwb'); eq(osmKeyOf(ID_BASE + 'cwdockbricktower17'), null, 'osmKeyOf set key');
  eq(an('Café Nero & Co. 2'), 'cafeneroco2', 'an()');
  // errors: an old namespace with no code, an empty rest, an unknown kind, two names for one ID
  for (const u of [K + 'id/nosuch/x', K + 'nosuch/x', K + 'id/mall', K + 'vocab', GL + 'magpie/cwplans/data-register.json#other/x',
    GL + 'third_party/cwplans-structured-data/coref/rule/iri', 'urn:cwplans:other:x', GL + 'third_party/cwplans-structured-data/desc/']) throws(() => mapLegacy(u), 'mapLegacy ' + u);
  throws(() => kid('nosuch', 'x'), 'kid with an unknown kind'); throws(() => kid('mall', '--'), 'kid with no alphanumeric rest'); throws(() => kid('hours', 'shop/x'), 'kid hours with one part');
  throws(() => mapLegacy(K + 'id/building/cwb0413'), 'two names for cwb0413 (cwb-0413 and cwb0413)');
  throws(() => cwgPath('https://example.com/x/'), 'cwgPath of another site');
  return examples.length;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (process.argv.includes('--test')) { const n = selfTest(); console.log(`kgx-ids self-test: ${n} examples, idempotence, unchanged IRIs and the error cases: ok`); }
  else { console.error('usage: node cwplans/tools/kgx-ids.mjs --test'); process.exit(2); }
}
