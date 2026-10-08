// "Realistic" look of the ordinary model buildings of the 3D page (Layers > Style > Realistic, ?look=real): for each
// building of area.js a facade style (window rhythm), a storey height class, a ground-floor shopfront flag, a wall
// colour, a pitched-roof colour and a flat-roof colour, a guessed use for Night, and the evidence of each. From the OSM
// tags of the building's element (building, building:material, building:colour, roof:material, roof:colour, levels:
// osmium on the Greater London extract, joined by building-keys.json), OSM shop and amenity points in or at the outline,
// the registry use (atlas.json), the model height and footprint, and the eave heights of roofs.json. Where no tag says,
// the material is a weighted guess by type and size (rules R below), picked by a hash of the OSM id so that neighbours
// differ. Writes the page file cwplans/docklands/data/materials.json. One logged operation (kgx-ops Flow; log in londat
// kgx/log), graph version materials (only the buildings with OSM evidence get triples), named in kgx/external-heads.json.
//   node cwplans/tools/build-materials.mjs
//   MAT_PBF=<greater_london-latest.osm.pbf> node cwplans/tools/build-materials.mjs
//   MAT_DRY=1: write materials.json, no log entry (tuning)
// Needs osmium and the OSTN15 grid (node cwplans/tools/fetch-raw.mjs grid). Skills: docklands-3d-page ("Realistic
// look"), cwplans-dataflow.
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import vm from 'vm';
import { dataFactory as F } from '@factoidal/core';
import { TOOLS, bngProjector, polyArea } from './lib.mjs';
import { LONDAT_DIR } from './londat.mjs';
import { Flow } from './kgx-ops.mjs';
import { kid, VOCAB } from './kgx-ids.mjs';

const CW = join(TOOLS, '..'), DD = join(CW, 'docklands', 'data'), AREA = join(DD, 'area.js'), KEYS = join(DD, 'building-keys.json'), ROOFS = join(DD, 'roofs.json');
const ATLAS = join(CW, 'atlas', 'data', 'atlas.json'), OUT = join(DD, 'materials.json');
const PBF = process.env.MAT_PBF || join(CW, 'data', 'raw', 'docklands', 'greater_london-latest.osm.pbf'), K = join(LONDAT_DIR, 'kgx');
const sha = b => createHash('sha256').update(b).digest('hex');

// facade styles (the shader's window patterns; index = style number in the code byte) and their storey tables:
// storey of class k = s0 + ds k (k 0 to 3), the same numbers as lookWall() in index.html
const STYLES = [
  { id: 'house', about: 'house: sash-proportion windows with frames, a door on some ground-floor bays', bay: 2.3, s0: 2.6, ds: .23 },
  { id: 'flats', about: 'low flats: punched windows', bay: 3.0, s0: 2.7, ds: .23 },
  { id: 'estate', about: 'slab or tower block: wide windows and spandrel bands', bay: 3.3, s0: 2.6, ds: .23 },
  { id: 'office', about: 'punched office windows, tall', bay: 1.6, s0: 3.3, ds: .33 },
  { id: 'ribbon', about: 'ribbon windows: a glass band along each floor', bay: 1.5, s0: 3.3, ds: .33 },
  { id: 'curtain', about: 'curtain wall: glass with mullions and a spandrel at each floor', bay: 1.5, s0: 3.5, ds: .33 },
  { id: 'shed', about: 'industrial or warehouse: cladding ribs, a plinth, few windows', bay: 1.0, s0: 4.0, ds: 1.3 },
  { id: 'civic', about: 'school, church, hall: large windows', bay: 3.4, s0: 3.3, ds: .43 },
];
const SI = Object.fromEntries(STYLES.map((s, i) => [s.id, i]));
// wall materials: base colour (linear 0 to 1 as the page draws it, before face shading)
const WALL = {
  stock: { about: 'London stock brick (yellow-buff, weathered)', c: [.66, .58, .43] }, red: { about: 'red brick', c: [.58, .31, .23] },
  brown: { about: 'brown brick', c: [.47, .35, .27] }, white: { about: 'render, white', c: [.86, .85, .81] },
  cream: { about: 'render, cream', c: [.86, .80, .66] }, pastel: { about: 'render, painted pastel', c: [.82, .76, .74] },
  concrete: { about: 'concrete or precast panels', c: [.62, .61, .57] }, stone: { about: 'stone (Portland-like)', c: [.80, .77, .68] },
  glassG: { about: 'glass, blue-green', c: [.33, .45, .50] }, glassS: { about: 'glass, grey', c: [.42, .47, .52] },
  glassD: { about: 'glass, dark', c: [.24, .29, .34] }, metal: { about: 'metal cladding, light', c: [.72, .74, .74] },
  metalC: { about: 'metal cladding, coloured', c: [.45, .53, .55] }, timber: { about: 'timber', c: [.55, .42, .30] },
};
const PASTELS = [[.84, .74, .72], [.74, .80, .82], [.78, .82, .72], [.86, .82, .66], [.80, .76, .84]], METALC = [[.42, .52, .46], [.40, .48, .58], [.55, .56, .57], [.62, .40, .32]];
const ROOFP = { slate: { about: 'slate', c: [.30, .32, .35] }, clay: { about: 'clay tiles', c: [.48, .30, .24] }, ctile: { about: 'concrete tiles, brown', c: [.43, .34, .30] },
  ctileG: { about: 'concrete tiles, grey', c: [.42, .42, .42] }, metal: { about: 'metal sheet', c: [.55, .57, .58] }, glass: { about: 'glass', c: [.36, .45, .50] } };
const ROOFF = { felt: { about: 'bitumen felt', c: [.34, .34, .35] }, gravel: { about: 'gravel', c: [.47, .46, .43] }, membrane: { about: 'light membrane', c: [.58, .59, .58] },
  metal: { about: 'metal', c: [.58, .60, .61] }, glass: { about: 'glass', c: [.36, .45, .50] }, green: { about: 'green roof', c: [.33, .40, .27] }, concrete: { about: 'concrete', c: [.58, .57, .54] } };

// guess weights by style when no OSM tag says (rules R; parameters of the operation)
const R = {
  wall: { house: { stock: 45, red: 14, brown: 12, white: 15, cream: 8, pastel: 6 }, flats: { stock: 30, red: 15, brown: 25, white: 15, concrete: 10, cream: 5 },
    estate: { concrete: 40, brown: 20, stock: 15, white: 15, red: 10 }, office: { stone: 35, concrete: 30, red: 15, stock: 10, white: 10 },
    ribbon: { concrete: 45, stone: 20, metal: 20, white: 15 }, curtain: { glassG: 35, glassS: 35, glassD: 15, metal: 15 },
    shed: { metal: 40, metalC: 35, brown: 10, concrete: 15 }, civic: { red: 30, stock: 30, brown: 20, concrete: 20 }, church: { stone: 50, stock: 50 } },
  pitched: { house: { slate: 45, clay: 30, ctile: 25 }, other: { slate: 50, ctileG: 30, clay: 20 } },
  flat: { low: { felt: 40, gravel: 30, membrane: 30 }, tall: { membrane: 60, gravel: 25, felt: 15 } },
  house_max_area: 150, house_max_h: 12, shed_min_area: 1500, shed_max_h: 16, flats_max_h: 21, curtain_min_h_res: 60, curtain_min_h_office: 35,
  shop_edge_m: 2.5, shop_min_h: 4, storey_min: 2.4, storey_max: 9,
};
const P = { R, styles: STYLES.map(s => [s.id, s.bay, s.s0, s.ds]) };
const op = { id: 'build-materials', version: 1, skill: 'docklands-3d-page', tool: 'cwplans/tools/build-materials.mjs',
  about: 'area.js outlines and heights + OSM building, material, colour and level tags + OSM shop and amenity points + the registry use (atlas.json) + roofs.json eaves -> facade style, storey class, shopfront flag, wall and roof colours and guessed use of each model building (docklands/data/materials.json)' };

const dry = !!process.env.MAT_DRY, flow = new Flow(K);
const inputs = dry ? [] : [flow.file(AREA, 'cwplans/docklands/data/area.js'), flow.file(KEYS, 'cwplans/docklands/data/building-keys.json'), flow.file(ROOFS, 'cwplans/docklands/data/roofs.json'),
  flow.file(ATLAS, 'cwplans/atlas/data/atlas.json'),
  flow.file(PBF, 'cwplans/data/raw/docklands/greater_london-latest.osm.pbf (local, not committed: the openstreetmap.fr Greater London extract of 2026-10-07, ODbL)')];

// OPL of osmium tags-filter: Map(type+id -> { tags, x, y }) (%hex% escapes decoded)
function opl(args) {
  const tmp = mkdtempSync(join(tmpdir(), 'mat-')), f = join(tmp, 'x.opl');
  execFileSync('osmium', ['tags-filter', PBF, ...args, '-R', '-f', 'opl', '-o', f]);
  const text = readFileSync(f, 'utf8'); rmSync(tmp, { recursive: true });
  const dec = s => s.replace(/%([0-9a-f]+)%/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))), out = new Map();
  for (const line of text.split('\n')) { const m = line.match(/^([nwr])(\d+) /); if (!m) continue; const fl = Object.fromEntries(line.split(' ').slice(1).map(t => [t[0], t.slice(1)]));
    const tags = Object.fromEntries(fl.T ? fl.T.split(',').map(kv => { const i = kv.indexOf('='); return [dec(kv.slice(0, i)), dec(kv.slice(i + 1))]; }) : []);
    out.set(m[1] + m[2], { tags, x: fl.x ? +fl.x : null, y: fl.y ? +fl.y : null }); }
  return out;
}
// OSM colour values -> page colours (named values toned to building materials; hex as given)
const NAMED = { white: [.86, .85, .81], brown: [.48, .36, .28], light_brown: [.66, .55, .42], lightbrown: [.66, .55, .42], grey: [.55, .55, .55], gray: [.55, .55, .55],
  lightgrey: [.72, .72, .71], lightgray: [.72, .72, .71], darkgrey: [.35, .35, .36], darkgray: [.35, .35, .36], yellow: [.72, .62, .42], black: [.18, .18, .19],
  blue: [.36, .45, .58], red: [.58, .30, .23], beige: [.80, .74, .62], cream: [.86, .80, .66], tan: [.70, .58, .44], orange: [.74, .46, .28], green: [.36, .46, .34],
  silver: [.72, .74, .76], maroon: [.45, .22, .20], pink: [.82, .66, .64], ivory: [.88, .86, .78], sandybrown: [.76, .60, .42], darkred: [.45, .20, .17], gold: [.74, .62, .36] };
function colourOf(v) {
  if (!v) return null; v = String(v).trim().toLowerCase().split(';')[0];
  let m = /^#?([0-9a-f]{6})$/.exec(v); if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255);
  m = /^#?([0-9a-f]{3})$/.exec(v); if (m) return [0, 1, 2].map(i => parseInt(m[1][i] + m[1][i], 16) / 255);
  return NAMED[v.replace(/[\s-]/g, '_')] || NAMED[v.replace(/[\s_-]/g, '')] || null;
}
const WALL_OF_MAT = { brick: null, glass: 'glassS', mirror: 'glassD', stone: 'stone', limestone: 'stone', sandstone: 'stone', concrete: 'concrete', cement_block: 'concrete',
  plaster: 'white', pebbledash: 'cream', render: 'white', metal: 'metal', steel: 'metal', copper: 'metalC', wood: 'timber', timber_framed: 'timber', timber_framing: 'timber', panels: 'concrete' };
const PROOF_OF_MAT = { roof_tiles: 'clay', tiles: 'clay', tile: 'clay', slate: 'slate', metal: 'metal', metal_sheet: 'metal', copper: 'metal', glass: 'glass', concrete: 'ctileG', eternit: 'ctileG' };
const FROOF_OF_MAT = { tar_paper: 'felt', asphalt: 'felt', gravel: 'gravel', concrete: 'concrete', metal: 'metal', metal_sheet: 'metal', copper: 'metal', glass: 'glass', grass: 'green', plants: 'green', stone: 'concrete' };
const SHOP_AMENITY = new Set(['restaurant', 'cafe', 'fast_food', 'pub', 'bar', 'bank', 'pharmacy', 'post_office', 'bureau_de_change', 'ice_cream', 'veterinary', 'dentist', 'doctors', 'library', 'community_centre', 'nightclub', 'betting', 'money_transfer']);
// a hash of a string in [0, 1) (FNV-1a), salted
const hash = (s, salt) => { let h = 2166136261 ^ salt; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
const pick = (w, u) => { const t = Object.values(w).reduce((a, b) => a + b, 0); let x = u * t; for (const [k, v] of Object.entries(w)) { if ((x -= v) < 0) return k; } return Object.keys(w).at(-1); };
const hex = c => c.map(v => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0')).join('');

const body = async () => {
  const ctx = {}; vm.createContext(ctx); vm.runInContext(readFileSync(AREA, 'utf8'), ctx); const A = ctx.DOCKLANDS_AREA, E0 = A.meta.origin.E0, N0 = A.meta.origin.N0;
  const model_fp = `${A.buildings.length}:${Array.from(A.buildings[0].p.slice(0, 6)).join('.')}:${Array.from(A.buildings.at(-1).p.slice(0, 6)).join('.')}`;
  const keys = JSON.parse(readFileSync(KEYS, 'utf8')); if (keys.model.fp !== model_fp) throw new Error('building-keys.json is for another area.js: run key-model-buildings.mjs first');
  const ids = keys.ids.split(','), osm = keys.osm;
  // eaves of the pitched roofs (roofs.json), for the storey from the levels
  const RF = JSON.parse(readFileSync(ROOFS, 'utf8')), eave = new Map();
  if (RF.model.fp === model_fp) { let i = 0; const s = RF.s.split(','); for (let k = 0; k < s.length; k++) { i += RF.r[8 * k]; eave.set(i, RF.r[8 * k + 4] / 100); } }
  // registry use by model index (as the page's nightUse)
  const AT = JSON.parse(readFileSync(ATLAS, 'utf8')), reg = new Map();
  AT.buildings.forEach(r => (r.mi || []).forEach(i => reg.set(i, r)));
  if (!existsSync(PBF)) throw new Error('no OSM extract at ' + PBF);
  const tags = opl(['wr/building:material', 'wr/building:colour', 'wr/roof:colour', 'wr/roof:material', 'wr/shop', 'wr/amenity']);
  const pts = opl(['n/shop', 'n/amenity']);
  // shop and amenity points in or at an outline (within shop_edge_m of it): grid of outlines, 50 m cells
  const toBNG = await bngProjector(), rings = A.buildings.map(b => { const f = b.p, o = [], n = b.holes && b.holes.length ? b.holes[0] : f.length / 2; let x = 0, z = 0; for (let k = 0; k < f.length / 2; k++) { x += f[2 * k]; z += f[2 * k + 1]; if (k < n) o.push([x / 10, z / 10]); } return o; });
  const G = new Map(), cell = 50, key = (a, b) => a * 100003 + b;
  rings.forEach((r, i) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let a = Math.floor((x0 - 3) / cell); a <= Math.floor((x1 + 3) / cell); a++) for (let b = Math.floor((z0 - 3) / cell); b <= Math.floor((z1 + 3) / cell); b++) { const k = key(a, b); if (!G.has(k)) G.set(k, []); G.get(k).push(i); } });
  const segD = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l)) : 0; return Math.hypot(px - ax - t * dx, pz - az - t * dz); };
  const inRing = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const shopOf = new Map(); let shopPts = 0, shopHit = 0;
  for (const [id, p] of pts) { const t = p.tags; if (!(t.shop || SHOP_AMENITY.has(t.amenity)) || p.x == null) continue;
    const [e, n] = toBNG(p.x, p.y), x = e - E0, z = -(n - N0), cand = G.get(key(Math.floor(x / cell), Math.floor(z / cell))); if (!cand) continue; shopPts++;
    const inside = cand.filter(i => inRing(x, z, rings[i])); let hit = inside;
    if (!hit.length) { let best = -1, bd = R.shop_edge_m; for (const i of cand) { const r = rings[i]; for (let k = 0; k < r.length; k++) { const d = segD(x, z, ...r[k], ...r[(k + 1) % r.length]); if (d < bd) { bd = d; best = i; } } } hit = best >= 0 ? [best] : []; }
    if (hit.length) shopHit++;
    for (const i of hit) { if (!shopOf.has(i)) shopOf.set(i, []); shopOf.get(i).push(id); } }

  const wallPal = [], wallIdx = new Map(), roofPal = [], roofIdx = new Map();
  const palW = c => { const h = hex(c); if (!wallIdx.has(h)) { wallIdx.set(h, wallPal.length); wallPal.push(h); } return wallIdx.get(h); };
  const palR = c => { const h = hex(c); if (!roofIdx.has(h)) { roofIdx.set(h, roofPal.length); roofPal.push(h); } return roofIdx.get(h); };
  const counts = { style: {}, wall: {}, evidence: { material: 0, colour: 0, roof_material: 0, roof_colour: 0, shop_point: 0, shop_tag: 0, levels: 0, registry_use: 0 }, shop: 0 };
  const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
  const code = [], wcol = [], pcol = [], fcol = [], use = [], ev = [], q = [], N = F.namedNode, V = VOCAB, XSD = 'http://www.w3.org/2001/XMLSchema#';
  const lit = (x, dt) => F.literal(String(x), dt ? N(XSD + dt) : undefined), add = (s, p, o) => q.push(F.quad(N(s), N(p), o, F.defaultGraph()));
  A.buildings.forEach((b, i) => {
    const id = ids[i], o = osm[id] || {}, par = o.p ? osm[o.p] || {} : {}, T = (tags.get(id) || {}).tags || {}, PT = o.p ? (tags.get(o.p) || {}).tags || {} : {};
    let bt = String(o.b || par.b || 'yes').replace(/^part:/, ''), h = b.h, area = Math.abs(polyArea(rings[i])), r = reg.get(i), e = 0, notes = [];
    const lv = o.l != null ? parseFloat(o.l) : null, mat = (T['building:material'] || PT['building:material'] || '').toLowerCase(), col = colourOf(T['building:colour'] || PT['building:colour']);
    const rmat = (T['roof:material'] || PT['roof:material'] || '').toLowerCase(), rcol = colourOf(T['roof:colour'] || PT['roof:colour']);
    const shopTag = !!(T.shop || SHOP_AMENITY.has(T.amenity) || PT.shop), shopPt = shopOf.has(i);
    // registry use (as nightUse in the page: homes, offices, hotel)
    let regUse = 0; if (r) { regUse = r.hm > 0 ? 1 : ({ hotel: 3, office: 2, commercial: 2 })[r.t] || (r.o > 3 || r.co > 20 ? 2 : 0); if (regUse) e |= 128; }
    // style from type, size, height and use
    const RES = ['apartments', 'residential', 'dormitory', 'flats', 'hotel'], HOUSE = ['house', 'terrace', 'semidetached_house', 'detached', 'bungalow', 'houseboat', 'hut', 'cabin'];
    const SHED = ['industrial', 'warehouse', 'storage_tank', 'service', 'hangar', 'manufacture', 'garages', 'garage', 'shed', 'carport', 'roof', 'container', 'transformer_tower', 'construction', 'farm_auxiliary', 'boathouse', 'data_center', 'greenhouse', 'barn', 'kiosk', 'toilets', 'parking'];
    const CIVIC = ['school', 'college', 'university', 'hospital', 'public', 'civic', 'government', 'kindergarten', 'library', 'fire_station', 'community_centre', 'sports_centre', 'sports_hall', 'museum', 'castle', 'pavilion', 'grandstand'];
    const CHURCH = ['church', 'chapel', 'cathedral', 'mosque', 'temple', 'synagogue', 'religious'];
    let st, kind = bt;
    if (HOUSE.includes(bt)) st = 'house';
    else if (RES.includes(bt) || (bt === 'yes' && regUse === 1)) st = h <= R.flats_max_h ? (area < 90 && h < 11 ? 'house' : 'flats') : h <= R.curtain_min_h_res ? 'estate' : 'curtain';
    else if (['office', 'commercial', 'bank'].includes(bt) || (bt === 'yes' && (regUse === 2 || regUse === 3))) st = h >= R.curtain_min_h_office ? 'curtain' : hash(id, 5) < .5 ? 'ribbon' : 'office';
    else if (['retail', 'supermarket', 'shop'].includes(bt)) st = area > R.shed_min_area && h < R.shed_max_h ? 'shed' : 'flats';
    else if (['train_station', 'transportation', 'station'].includes(bt)) st = 'shed';
    else if (SHED.includes(bt)) st = 'shed';
    else if (CIVIC.includes(bt)) st = 'civic';
    else if (CHURCH.includes(bt)) { st = 'civic'; kind = 'church'; }
    else if (bt === 'pub') st = 'flats';
    else st = area < R.house_max_area && h <= R.house_max_h ? 'house' : h <= 7 && area > 400 ? 'shed' : h <= R.flats_max_h ? 'flats' : h <= 45 ? 'estate' : 'curtain';
    // the material: the OSM tag, else a guess by style
    let wm = WALL_OF_MAT[mat] !== undefined ? WALL_OF_MAT[mat] : null; if (mat) e |= 1;
    if (mat === 'brick' || (wm === null && mat)) wm = pick({ stock: 45, red: 30, brown: 25 }, hash(id, 11));
    if (mat === 'glass') wm = pick({ glassG: 40, glassS: 45, glassD: 15 }, hash(id, 13));
    if (!wm) wm = pick(R.wall[kind === 'church' ? 'church' : st], hash(id, 17));
    if (wm.startsWith('glass') && h >= 12 && st !== 'curtain' && st !== 'shed') st = h >= 25 ? 'curtain' : 'ribbon';
    if (st === 'curtain' && ['stock', 'red', 'brown', 'concrete', 'stone', 'white', 'cream'].includes(wm) && mat) st = h > 40 ? 'estate' : 'office';
    let wc = WALL[wm].c; if (wm === 'pastel') wc = PASTELS[Math.floor(hash(id, 19) * PASTELS.length)]; if (wm === 'metalC') wc = METALC[Math.floor(hash(id, 23) * METALC.length)];
    if (col) { e |= 2; wc = wm.startsWith('glass') ? col.map((c, k) => .55 * c + .45 * wc[k]) : col; }
    // shopfront: a shop or amenity point in or at the outline, or a shop tag on the building, on a building of 4 m or more
    let shop = (shopPt || shopTag) && h >= R.shop_min_h && st !== 'shed' && st !== 'civic'; if (shopPt) e |= 64; if (shopTag) e |= 32;
    if (shop && st === 'house') st = 'flats';
    if (shop) counts.shop++;
    // storey class from the levels (walls to the eave of a pitched roof), else a hash spread round the default
    const S = STYLES[SI[st]], wallTop = (eave.get(i) ?? h) - (b.mh || 0);
    let cls; if (lv > 0 && lv < 200) { const sto = wallTop / lv; if (sto >= R.storey_min && sto <= R.storey_max) { cls = Math.max(0, Math.min(3, Math.round((sto - S.s0) / S.ds))); e |= 256; } }
    if (cls == null) { const u = hash(id, 29); cls = u < .25 ? 0 : u < .75 ? 1 : 2; }
    // roofs: pitched (when roofs.json gives this building a shape) and flat
    let pm = PROOF_OF_MAT[rmat] || pick(st === 'house' ? R.pitched.house : R.pitched.other, hash(id, 31)), fm = FROOF_OF_MAT[rmat] || pick(h > 40 ? R.flat.tall : R.flat.low, hash(id, 37));
    if (rmat) e |= 4; let pc = ROOFP[pm].c, fc = ROOFF[fm].c; if (rcol) { e |= 8; pc = rcol; fc = rcol; }
    // the guessed use for Night (only where the registry gives none): homes for house, flats and estate; offices for office styles
    const gu = regUse || (['house', 'flats', 'estate'].includes(st) || (st === 'curtain' && RES.includes(bt)) ? 1 : ['office', 'ribbon', 'curtain'].includes(st) ? 2 : 0);
    code.push(SI[st] * 8 + (shop ? 4 : 0) + cls); wcol.push(palW(wc)); pcol.push(palR(pc)); fcol.push(palR(fc)); use.push(gu); ev.push(e);
    inc(counts.style, st); inc(counts.wall, wm);
    if (e & 1) counts.evidence.material++; if (e & 2) counts.evidence.colour++; if (e & 4) counts.evidence.roof_material++; if (e & 8) counts.evidence.roof_colour++;
    if (e & 64) counts.evidence.shop_point++; if (e & 32) counts.evidence.shop_tag++; if (e & 256) counts.evidence.levels++; if (e & 128) counts.evidence.registry_use++;
    if (e & (1 | 2 | 4 | 8 | 32 | 64)) { const s = kid('building', 'osm-' + id);
      add(s, V + 'facadeStyle', lit(st)); add(s, V + 'wallMaterial', lit(WALL[wm].about)); add(s, V + 'wallColour', lit('#' + hex(wc)));
      if (e & 64) add(s, V + 'shopfront', lit('true', 'boolean'));
      add(s, V + 'materialBasis', lit(['OSM building:material', 'OSM building:colour', 'OSM roof:material', 'OSM roof:colour', '', 'OSM shop/amenity tag on the building', 'OSM shop/amenity point in or at the outline'].filter((_, k) => e & (1 << k)).join(', '))); }
  });
  const b36 = (a, w) => a.map(v => v.toString(36).padStart(w, '0')).join('');
  if (wallPal.length > 1295 || roofPal.length > 1295) throw new Error(`palette too large: ${wallPal.length} walls, ${roofPal.length} roofs`);
  const out = { about: 'The "Realistic" look of the model buildings of the 3D page (Layers > Style > Realistic, ?look=real), made by tools/build-materials.mjs (do not edit by hand) from OSM tags and points, the registry use and the model geometry. Valid while model.fp matches the page (MFP). Per model index: c = code (2 base-36 digits: style x 8 + shopfront x 4 + storey class), w = wall colour (2 base-36 digits into wall), p and f = pitched and flat roof colour (2 base-36 digits into roof), u = use for Night (0 unknown, 1 homes, 2 offices, 3 hotel), e = evidence bits (3 base-36 digits: 1 building:material, 2 building:colour, 4 roof:material, 8 roof:colour, 32 shop tag, 64 shop point, 128 registry use, 256 storey from levels); everything without a bit is a guess by the rules.',
    model: { fp: model_fp, sha256: sha(readFileSync(AREA)) }, rules: P, styles: STYLES, walls: Object.fromEntries(Object.entries(WALL).map(([k, v]) => [k, v.about])),
    counts, wall: wallPal, roof: roofPal, c: b36(code, 2), w: b36(wcol, 2), p: b36(pcol, 2), f: b36(fcol, 2), u: use.join(''), e: b36(ev, 3), shop_points: { in_box: shopPts, matched: shopHit } };
  writeFileSync(OUT, JSON.stringify(out) + '\n');
  console.error(JSON.stringify({ counts, shopPts, shopHit, wallPal: wallPal.length, roofPal: roofPal.length, triples: q.length }));
  return { materials: { quads: q, about: { title: 'Facade style, wall material and colour and shopfronts of the model buildings with OSM evidence (the "Realistic" look of the 3D page)', licence: 'CC0 1.0 (contains OpenStreetMap data, ODbL 1.0)', osm: true } } };
};
if (dry) { const r = await body(); console.log(JSON.stringify({ dry: true, triples: r.materials.quads.length })); process.exit(0); }
const res = await flow.run(op, inputs, P, body);
const v = res.materials, ehF = join(K, 'external-heads.json'), eh = JSON.parse(readFileSync(ehF, 'utf8'));
eh.materials = v.iri; writeFileSync(ehF, JSON.stringify(eh, null, 1) + '\n');
console.log(JSON.stringify({ version: v.iri, triples: v.triples, new: flow.ran.length }));
