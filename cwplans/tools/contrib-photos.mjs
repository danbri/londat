// Contributed photos in danbri/londat data/images/contrib/<set>/ (photos + a hand-made photos.json) as three logged
// operations (kgx-ops Flow; log in londat kgx/log):
//  1. rectify-facade-patches: the photos (by SHA-256) and the patch regions of photos.json -> rectified patches
//     (rect/<id>.jpg beside the photos) with periods and colours, by registry/sources/facades/tools/facade.py and
//     measure.py (OpenCV) -> graph version facade-patches-<set>;
//  2. lift-contrib-photos: photos.json + the photos + that version -> graph version photos-<set> (photographs, what
//     each depicts, the buildings with their evidence, judged facade notes and model heights);
//  3. cut-facade-tiles: photos.json `tiles` + the rectified patches -> 256 px tiles (tiles/<id>.png; a vector pattern
//     also as tiles/<id>.svg) by tools/facade-tile.py -> graph version facade-tiles-<set>, which
//     tools/compose-facade-atlas.mjs puts into the 3D page's facade atlas.
// All three are named in kgx/external-heads.json, so build-kgx.mjs packs them.
//   FACADE_PY=<python with numpy, opencv-python-headless, scikit-learn> node cwplans/tools/contrib-photos.mjs <set>
// Skills: docklands-data-curation ("Contributed photos"), cwplans-dataflow, photo-view-reconstruction.
import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { join } from 'path';
import { tmpdir } from 'os';
import { dataFactory as F } from '@factoidal/core';
import { TOOLS } from './lib.mjs';
import { LONDAT_DIR } from './londat.mjs';
import { Flow } from './kgx-ops.mjs';
import { kid, VOCAB } from './kgx-ids.mjs';

const set = process.argv[2];
if (!set) { console.error('usage: contrib-photos.mjs <set>   (a folder in londat data/images/contrib/)'); process.exit(2); }
const DIR = join(LONDAT_DIR, 'data', 'images', 'contrib', set), RAWURL = `https://raw.githubusercontent.com/danbri/londat/main/data/images/contrib/${set}/`;
const PY = process.env.FACADE_PY || 'python3', FT = join(TOOLS, '..', 'registry', 'sources', 'facades', 'tools');
const spec = JSON.parse(readFileSync(join(DIR, 'photos.json'), 'utf8'));
const sha = b => createHash('sha256').update(b).digest('hex');
const V = VOCAB, S = 'https://schema.org/', XSD = 'http://www.w3.org/2001/XMLSchema#';
// a line `<patch> cwk:building <building>` of the facade-patches version
const BUILDING_LINE = new RegExp('^<([^>]+)> <' + (V + 'building').replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '> <([^>]+)>');
const T = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const N = F.namedNode;
function G() { const quads = [];
  const add = (s, p, o) => { if (s && p && o != null && o !== '') quads.push(F.quad(N(s), N(p), typeof o === 'string' ? N(o) : o, F.defaultGraph())); };
  const lit = (s, p, v, dt) => { if (v == null || v === '') return; add(s, p, F.literal(String(v), dt ? N(XSD + dt) : typeof v === 'number' ? N(XSD + (Number.isInteger(v) ? 'integer' : 'decimal')) : undefined)); };
  return { quads, add, lit }; }
// IDs (kgx-ids.mjs): photo<sha16>, building osmw<id> / osmr<id> or <set><key>, patch<set><id>, tile<set><id>
const photoKey = file => sha(readFileSync(join(DIR, file))).slice(0, 16), photoIri = file => kid('photo', photoKey(file));
const buildingIri = key => { const b = spec.buildings[key]; const m = b?.osm?.match(/\/(way|relation)\/(\d+)$/); return m ? kid('building', `osm-${m[1][0]}${m[2]}`) : kid('building', `${set}-${key}`); };

const flow = new Flow(join(LONDAT_DIR, 'kgx'));
const photoFiles = spec.photos.map(p => flow.file(join(DIR, p.file), `danbri/londat data/images/contrib/${set}/${p.file}`));
const specFile = flow.file(join(DIR, 'photos.json'), `danbri/londat data/images/contrib/${set}/photos.json`);
const facadeTools = ['facade.py', 'measure.py'].map(f => flow.file(join(FT, f), 'cwplans/registry/sources/facades/tools/' + f));

// ---- 1. rectify and measure the facade patches
const patches = spec.patches.map(p => ({ ...p, building_iri: buildingIri(p.building) }));
const op1 = { id: 'rectify-facade-patches', version: 3, skill: 'docklands-data-curation', tool: 'cwplans/tools/contrib-photos.mjs (facade.py, measure.py)',
  about: 'photos + facade regions -> affine-rectified patches (LSD segments, RANSAC vanishing points, homography), bay and floor periods (autocorrelation of gradient profiles) and three colours (k-means in Lab) per patch' };
const v1 = (await flow.run(op1, [...photoFiles, ...facadeTools], { set, patches }, async ({ set, patches }) => {
  const g = G(), tmp = mkdtempSync(join(tmpdir(), 'rect-')); mkdirSync(join(DIR, 'rect'), { recursive: true });
  for (const p of patches) {
    const info = JSON.parse(execFileSync(PY, ['facade.py', join(DIR, p.photo), join(tmp, p.id), ...p.roi.map(String)], { cwd: FT }).toString().trim().split('\n').pop());
    const out = join(DIR, 'rect', p.id + '.jpg');
    const m = JSON.parse(execFileSync(PY, ['measure.py', join(tmp, p.id + '-full.jpg'), ...p.box.map(String), out, '3'], { cwd: FT }).toString().trim().split('\n').pop());
    const s = kid('facade-patch', set, p.id);
    g.add(s, T, V + 'FacadePatch'); g.lit(s, LABEL, `${p.id} (${p.face} face)`); g.add(s, V + 'fromPhoto', photoIri(p.photo)); g.add(s, V + 'building', p.building_iri);
    g.lit(s, V + 'face', p.face); g.lit(s, V + 'roi', p.roi.join(' ')); g.lit(s, V + 'box', p.box.join(' ')); g.lit(s, 'http://www.w3.org/2000/01/rdf-schema#comment', p.note);
    g.lit(s, V + 'vanishingPointVertical', JSON.stringify(info.info.vp_vertical)); g.lit(s, V + 'vanishingPointHorizontal', JSON.stringify(info.info.vp_horizontal));
    g.lit(s, V + 'patchWidthPx', m.patch_px[0]); g.lit(s, V + 'patchHeightPx', m.patch_px[1]);
    for (const [k, p2] of [['bay_px', 'bayPeriodPx'], ['bay_ac', 'bayAutocorrelation'], ['floor_px', 'floorPeriodPx'], ['floor_ac', 'floorAutocorrelation']]) if (m[k] != null) g.lit(s, V + p2, Math.round(m[k] * 100) / 100);
    if (p.face_width_m) g.lit(s, V + 'faceWidthMetres', p.face_width_m);
    m.colours.forEach((c, i) => { const cs = kid('facade-patch', set, p.id, `colour-${i}`); g.add(s, V + 'colour', cs); g.lit(cs, V + 'hex', c.hex); g.lit(cs, V + 'share', c.share); g.lit(cs, V + 'lightness', c.L); g.lit(cs, V + 'rank', i); });
    const bytes = readFileSync(out); g.add(s, S + 'contentUrl', `${RAWURL}rect/${p.id}.jpg`); g.lit(s, V + 'sha256', sha(bytes)); g.add(s, S + 'license', spec.licence_url);
  }
  rmSync(tmp, { recursive: true });
  return { [`facade-patches-${set}`]: { quads: g.quads, about: { title: `Rectified facade patches from the contributed photos "${set}", with periods and colours`, licence: 'CC0 (patches cut from CC0 photos)' } } };
}))[`facade-patches-${set}`];

// ---- 2. the photos, what they depict and the buildings, from the hand-made photos.json
const op2 = { id: 'lift-contrib-photos', version: 4, skill: 'docklands-data-curation', tool: 'cwplans/tools/contrib-photos.mjs',
  about: 'photos.json (identifications, evidence, judged facade notes, model heights) + photos + facade patches -> schema.org Photograph per photo with what it depicts, and a building node per identified building' };
const v2 = (await flow.run(op2, [specFile, ...photoFiles, v1], { set }, async () => {
  const g = G(), patchLines = flow.read(v1).split('\n');
  for (const [key, b] of Object.entries(spec.buildings)) {
    const s = buildingIri(key);
    g.add(s, T, S + 'Place'); g.add(s, T, V + 'PhotoIdentifiedBuilding'); g.lit(s, S + 'name', b.name);
    if (b.osm) g.add(s, S + 'sameAs', b.osm); if (b.wikidata) g.add(s, S + 'sameAs', 'http://www.wikidata.org/entity/' + b.wikidata);
    g.lit(s, V + 'confidence', b.confidence); for (const e of b.identified_by || []) g.lit(s, V + 'evidence', e);
    for (const [k, v] of Object.entries(b.osm_tags || {})) g.lit(s, V + 'osmTag', `${k}=${v}`);
    if (b.footprint) g.lit(s, V + 'footprintNote', b.footprint); if (b.published) g.lit(s, V + 'publishedNote', b.published);
    if (b.model) { if (b.model.index != null) g.lit(s, V + 'modelIndex', b.model.index); g.lit(s, V + 'modelTopMetresOD', b.model.top_m_od); g.lit(s, V + 'modelHeightMetres', b.model.height_m); g.lit(s, V + 'modelBaseMetresOD', b.model.base_m_od); g.lit(s, V + 'modelHeightSource', b.model.height_source); g.lit(s, V + 'modelNote', b.model.note); g.lit(s, V + 'modelBuilt', '2026-10-03', 'date'); }
    for (const [k, v] of Object.entries(b.facade || {})) { if (k === 'how') continue; const t = typeof v === 'string' ? v : Object.entries(v).map(([a, c]) => `${a}: ${c}`).join('; '); g.lit(s, V + 'facadeNote', `${k}: ${t}`); }
    if (b.facade?.how) g.lit(s, V + 'facadeNoteHow', b.facade.how);
    for (const l of patchLines) { const m = l.match(BUILDING_LINE); if (m && m[2] === s) g.add(s, V + 'facadePatch', m[1]); }
  }
  for (const p of spec.photos) {
    const s = photoIri(p.file);
    g.add(s, T, S + 'Photograph'); g.lit(s, S + 'name', p.title); g.add(s, S + 'contentUrl', RAWURL + p.file); g.add(s, S + 'license', spec.licence_url);
    g.lit(s, S + 'creator', spec.creator); g.lit(s, S + 'dateCreated', spec.date, 'date'); g.lit(s, V + 'timeNote', spec.time); g.lit(s, V + 'cameraNote', p.camera);
    g.lit(s, S + 'width', p.size[0]); g.lit(s, S + 'height', p.size[1]); g.lit(s, V + 'sha256', sha(readFileSync(join(DIR, p.file))));
    p.depicts.forEach((d, i) => {
      if (d.building) { g.add(s, S + 'about', buildingIri(d.building)); const r = kid('photo', photoKey(p.file), `depicts-${i}`); g.add(s, V + 'depiction', r); g.add(r, V + 'thing', buildingIri(d.building)); g.lit(r, V + 'role', d.role); return; }
      const r = kid('photo', photoKey(p.file), `depicts-${i}`); g.add(s, V + 'depiction', r); g.lit(r, S + 'name', d.name); g.lit(r, V + 'role', d.role); if (d.osm) g.add(r, S + 'sameAs', d.osm);
    });
  }
  return { [`photos-${set}`]: { quads: g.quads, about: { title: `Contributed photos "${set}" (${spec.date}, ${spec.licence}): what each shows and how the buildings were identified`, licence: 'CC0 (photos and descriptions); OSM names and tags quoted are © OpenStreetMap contributors, ODbL 1.0', osm: true } } };
}))[`photos-${set}`];

// ---- 3. facade tiles for the 3D page: a cut of a rectified patch, or a vector pattern drawn from the sizes in photos.json
const tiles = spec.tiles || [], TOOL = join(TOOLS, 'facade-tile.py');
const op3 = { id: 'cut-facade-tiles', version: 3, skill: 'docklands-data-curation', tool: 'cwplans/tools/contrib-photos.mjs (facade-tile.py)',
  about: 'photos.json tiles + rectified patches -> 256 px facade tiles (photo cut, mirrored half for a symmetric face, or a vector pattern in metres with judged colours) with their size on the wall in metres, the buildings they are for and a point inside each' };
const patchFiles = [...new Set(tiles.filter(t => t.patch).map(t => t.patch))].map(id => flow.file(join(DIR, 'rect', id + '.jpg'), `danbri/londat data/images/contrib/${set}/rect/${id}.jpg`));
const v3 = tiles.length ? (await flow.run(op3, [specFile, ...patchFiles, flow.file(TOOL, 'cwplans/tools/facade-tile.py')], { set }, async () => {
  const g = G(); mkdirSync(join(DIR, 'tiles'), { recursive: true });
  for (const t of tiles) {
    const png = join(DIR, 'tiles', t.id + '.png'), svg = t.method === 'pattern' ? join(DIR, 'tiles', t.id + '.svg') : null;
    const job = t.method === 'photo' ? { method: 'photo', src: join(DIR, 'rect', t.patch + '.jpg'), crop: t.crop, mirror_right_half: !!t.mirror_right_half }
      : { method: 'pattern', w_m: t.w_m, h_m: t.h_m, background: t.background, rects: t.rects, svg, title: t.what, desc: `${t.how} Licence: CC0 1.0.` };
    execFileSync(PY, [TOOL, 'tile', JSON.stringify(job), png]);
    const s = kid('facade-tile', set, t.id);
    g.add(s, T, V + 'FacadeTile'); g.lit(s, S + 'name', t.what); g.lit(s, 'http://www.w3.org/2000/01/rdf-schema#comment', t.how); g.lit(s, V + 'method', t.method);
    g.lit(s, V + 'widthMetres', t.w_m); g.lit(s, V + 'heightMetres', t.h_m); g.add(s, S + 'license', spec.licence_url);
    g.lit(s, V + 'file', `data/images/contrib/${set}/tiles/${t.id}.png`); g.add(s, S + 'contentUrl', `${RAWURL}tiles/${t.id}.png`); g.lit(s, V + 'sha256', sha(readFileSync(png)));
    if (svg) { g.add(s, V + 'vectorSource', `${RAWURL}tiles/${t.id}.svg`); g.lit(s, V + 'svgSha256', sha(readFileSync(svg))); }
    if (t.patch) { g.add(s, S + 'isBasedOn', kid('facade-patch', set, t.patch)); g.lit(s, V + 'crop', t.crop.join(' ')); if (t.mirror_right_half) g.lit(s, V + 'mirroredHalf', 'true', 'boolean'); }
    for (const [k, c] of Object.entries(t.colours?.judged || {})) g.lit(s, V + 'judgedColour', `${k} ${c}`);
    for (const [b, at] of Object.entries(t.at)) { const bi = buildingIri(b), r = kid('facade-tile', set, t.id, 'for', b); g.add(s, V + 'forBuilding', bi); g.add(s, V + 'placement', r); g.add(r, V + 'building', bi); g.lit(r, V + 'at', at.join(' ')); }
    g.lit(s, V + 'page', `https://github.com/danbri/londat/tree/main/data/images/contrib/${set}`);
  }
  return { [`facade-tiles-${set}`]: { quads: g.quads, about: { title: `Facade tiles from the contributed photos "${set}" (photo cuts and vector patterns, CC0) with their size on the wall`, licence: 'CC0' } } };
}))[`facade-tiles-${set}`] : null;

const ehF = join(LONDAT_DIR, 'kgx', 'external-heads.json'), eh = existsSync(ehF) ? JSON.parse(readFileSync(ehF, 'utf8')) : {};
eh[`facade-patches-${set}`] = v1.iri; eh[`photos-${set}`] = v2.iri; if (v3) eh[`facade-tiles-${set}`] = v3.iri; writeFileSync(ehF, JSON.stringify(eh, null, 1) + '\n');
console.log(JSON.stringify({ set, patches: v1.iri, patch_triples: v1.triples, photos: v2.iri, photo_triples: v2.triples, tiles: v3?.iri, tile_triples: v3?.triples, new: flow.ran.length }));
