// Tree species profiles of the Three.js port (docklands/): the crown shape, colours and leaf calendar of each kind of
// tree, and the map from a taxon (scientific and common name, as data/trees.json gives them) to a profile. Shared by the
// trees layer (layers/trees.js) and the build tool (cwplans/tools/build-tree-species.mjs, which writes
// data/tree-species.json: one profile per tree, and how it was found). No three.js here: Node imports it.
// Days are days of the year (1 = 1 January; 91 = 1 April, 121 = 1 May, 274 = 1 October, 305 = 1 November,
// 335 = 1 December) for London, typical of the 2010s and 2020s; colours are sRGB 0..1. These are stated typical values
// (UK phenology and nursery descriptions), not measurements of these trees.
// Skill: docklands-3d-page, "Three.js port" (Trees).

// crown shape classes: one instanced mesh each in layers/trees.js
export const SHAPES = ['broad', 'conical', 'columnar', 'weeping', 'small', 'birch'];
const [BROAD, CONICAL, COLUMNAR, WEEPING, SMALL, BIRCH] = SHAPES.keys();

// bark pattern: 0 plain, 1 plane (mottled patches), 2 birch (white with dark bands), 3 cherry (red-brown, banded)
// p: { shape, ever: 1 evergreen | 0 deciduous, leaf, aut (autumn colour), bark, pat, out (leaf-out begins), col (autumn
//      colour begins), bare (all leaves down), bloom: [r, g, b, day] or null, cw: crown width / height (when the data
//      has no crown spread), cb: crown base / height, airy: 0..1 (gaps in the crown in full leaf) }
const D = { shape: BROAD, ever: 0, leaf: [.30, .45, .20], aut: [.72, .58, .22], bark: [.36, .32, .27], pat: 0, out: 105, col: 285, bare: 322, bloom: null, cw: .6, cb: .3, airy: 0 };
const P = (id, label, o) => ({ id, label, ...D, ...o });
export const PROFILES = [
  P('plane', 'London plane', { leaf: [.32, .47, .21], aut: [.64, .52, .26], bark: [.62, .60, .47], pat: 1, out: 112, col: 292, bare: 338, cw: .65 }),
  P('oak', 'Oak', { leaf: [.27, .40, .17], aut: [.52, .37, .16], bark: [.33, .29, .24], out: 113, col: 300, bare: 345, cw: .75 }),
  P('oak-evergreen', 'Evergreen oak', { ever: 1, leaf: [.19, .28, .15], bark: [.25, .23, .21], cw: .8 }),
  P('lime', 'Lime', { leaf: [.36, .52, .22], aut: [.80, .70, .26], bark: [.38, .35, .30], out: 100, col: 280, bare: 318, cw: .55 }),
  P('horse-chestnut', 'Horse chestnut', { leaf: [.26, .42, .17], aut: [.64, .40, .16], out: 88, col: 258, bare: 305, cw: .75, bloom: [.96, .94, .88, 128] }),
  P('maple', 'Maple', { leaf: [.30, .47, .20], aut: [.88, .66, .17], out: 100, col: 283, bare: 318 }),
  P('sycamore', 'Sycamore', { leaf: [.28, .43, .19], aut: [.62, .53, .22], out: 98, col: 285, bare: 320, cw: .7 }),
  P('maple-red', 'Red or silver maple', { leaf: [.40, .52, .32], aut: [.86, .36, .14], out: 95, col: 280, bare: 315 }),
  P('sweetgum', 'Sweet gum', { shape: CONICAL, leaf: [.27, .44, .20], aut: [.58, .13, .16], out: 110, col: 292, bare: 330, cw: .5 }),
  P('ash', 'Ash', { leaf: [.32, .46, .21], aut: [.60, .60, .27], out: 125, col: 280, bare: 305, airy: .25 }),
  P('hornbeam', 'Hornbeam', { leaf: [.29, .45, .19], aut: [.82, .67, .25], out: 105, col: 290, bare: 328 }),
  P('hornbeam-fastigiate', 'Upright hornbeam', { shape: COLUMNAR, leaf: [.29, .45, .19], aut: [.82, .67, .25], out: 105, col: 290, bare: 328, cw: .4 }),
  P('beech', 'Beech', { leaf: [.33, .48, .18], aut: [.72, .43, .15], out: 110, col: 290, bare: 330, cw: .7 }),
  P('beech-copper', 'Copper beech', { leaf: [.33, .17, .17], aut: [.55, .30, .14], out: 110, col: 290, bare: 330, cw: .7 }),
  P('locust', 'False acacia, honey locust', { leaf: [.44, .57, .22], aut: [.90, .80, .30], out: 125, col: 285, bare: 315, airy: .3 }),
  P('chestnut', 'Sweet chestnut', { leaf: [.29, .42, .17], aut: [.68, .53, .20], out: 115, col: 292, bare: 325, cw: .7 }),
  P('broadleaf', 'Other broadleaf', {}),
  P('ginkgo', 'Maidenhair tree', { shape: CONICAL, leaf: [.38, .52, .22], aut: [.96, .80, .14], out: 110, col: 300, bare: 322, cw: .5, airy: .2 }),
  P('cherry', 'Ornamental cherry', { shape: SMALL, leaf: [.30, .44, .20], aut: [.76, .26, .14], bark: [.40, .24, .21], pat: 3, out: 102, col: 275, bare: 312, cw: .9, bloom: [.98, .80, .86, 106] }),
  P('cherry-wild', 'Wild or bird cherry', { shape: SMALL, leaf: [.30, .45, .20], aut: [.82, .38, .15], bark: [.42, .25, .22], pat: 3, out: 100, col: 275, bare: 312, cw: .75, bloom: [.98, .97, .94, 108] }),
  P('cherry-plum', 'Cherry plum', { shape: SMALL, leaf: [.30, .45, .20], aut: [.70, .50, .20], bark: [.30, .25, .22], out: 95, col: 285, bare: 318, cw: .9, bloom: [.98, .95, .95, 78] }),
  P('plum-purple', 'Purple-leaved plum', { shape: SMALL, leaf: [.34, .17, .19], aut: [.48, .20, .17], bark: [.30, .25, .22], out: 95, col: 285, bare: 318, cw: .9, bloom: [.98, .86, .90, 80] }),
  P('apple', 'Apple, crab apple', { shape: SMALL, leaf: [.33, .47, .21], aut: [.78, .63, .22], out: 105, col: 285, bare: 320, cw: .95, bloom: [.98, .88, .90, 118] }),
  P('pear', 'Pear', { shape: SMALL, leaf: [.27, .43, .19], aut: [.64, .18, .16], out: 95, col: 292, bare: 330, cw: .6, bloom: [.97, .97, .95, 96] }),
  P('hawthorn', 'Hawthorn', { shape: SMALL, leaf: [.28, .43, .18], aut: [.70, .36, .16], out: 95, col: 282, bare: 318, cw: 1, bloom: [.97, .96, .92, 130] }),
  P('rowan', 'Rowan', { shape: SMALL, leaf: [.33, .48, .20], aut: [.86, .36, .12], out: 100, col: 268, bare: 305, cw: .7, airy: .2, bloom: [.96, .94, .86, 136] }),
  P('whitebeam', 'Whitebeam', { shape: SMALL, leaf: [.46, .53, .38], aut: [.60, .49, .26], out: 105, col: 285, bare: 318, cw: .7, bloom: [.96, .95, .90, 130] }),
  P('serviceberry', 'Juneberry', { shape: SMALL, leaf: [.32, .44, .22], aut: [.86, .32, .15], out: 100, col: 280, bare: 315, cw: .9, bloom: [.98, .98, .96, 100] }),
  P('magnolia', 'Magnolia', { shape: SMALL, leaf: [.30, .45, .20], aut: [.62, .52, .26], out: 105, col: 290, bare: 322, cw: .9, bloom: [.97, .85, .90, 90] }),
  P('small', 'Other small tree', { shape: SMALL, leaf: [.32, .46, .21], aut: [.80, .68, .26], cw: .9 }),
  P('holly', 'Holly, small evergreen', { shape: SMALL, ever: 1, leaf: [.14, .25, .13], bark: [.42, .42, .38], cw: .7 }),
  P('palm', 'Palm, cabbage palm', { shape: SMALL, ever: 1, leaf: [.26, .40, .20], bark: [.36, .30, .22], cw: .8, cb: .6, airy: .3 }),
  P('birch', 'Birch', { shape: BIRCH, leaf: [.42, .57, .22], aut: [.92, .80, .24], bark: [.88, .87, .83], pat: 2, out: 98, col: 280, bare: 312, cw: .45, airy: .35 }),
  P('aspen', 'Aspen, poplar', { shape: BIRCH, leaf: [.38, .52, .22], aut: [.92, .80, .26], bark: [.60, .60, .55], out: 100, col: 285, bare: 318, cw: .5, airy: .25 }),
  P('willow', 'Willow', { shape: WEEPING, leaf: [.50, .60, .31], aut: [.82, .77, .32], bark: [.40, .35, .27], out: 88, col: 295, bare: 330, cw: .9, cb: .12, airy: .15 }),
  P('willow-small', 'Goat or grey willow', { shape: SMALL, leaf: [.36, .46, .26], aut: [.72, .66, .28], out: 90, col: 290, bare: 322, cw: .9 }),
  P('alder', 'Alder', { shape: CONICAL, leaf: [.22, .36, .16], aut: [.34, .37, .18], bark: [.30, .28, .26], out: 100, col: 300, bare: 332, cw: .5 }),
  P('poplar', 'Poplar', { leaf: [.33, .48, .22], aut: [.90, .80, .27], bark: [.50, .49, .44], out: 102, col: 285, bare: 318, cw: .6 }),
  P('poplar-lombardy', 'Lombardy poplar', { shape: COLUMNAR, leaf: [.33, .48, .22], aut: [.90, .80, .27], bark: [.42, .40, .35], out: 102, col: 285, bare: 318, cw: .22, cb: .12 }),
  P('conifer', 'Cypress, spruce, fir, cedar', { shape: CONICAL, ever: 1, leaf: [.15, .28, .17], bark: [.34, .27, .22], cw: .45, cb: .12 }),
  P('pine', 'Pine', { shape: CONICAL, ever: 1, leaf: [.20, .31, .18], bark: [.42, .30, .22], cw: .5, cb: .4 }),
  P('conifer-deciduous', 'Dawn redwood, larch', { shape: CONICAL, leaf: [.32, .48, .22], aut: [.76, .42, .16], bark: [.45, .30, .22], out: 105, col: 295, bare: 325, cw: .4, cb: .1 }),
  P('evergreen', 'Other evergreen broadleaf', { ever: 1, leaf: [.22, .34, .19], bark: [.40, .36, .30] }),
  P('cypress-columnar', 'Columnar cypress, yew', { shape: COLUMNAR, ever: 1, leaf: [.14, .26, .15], bark: [.34, .27, .22], cw: .3, cb: .05 }),
];
export const PROFILE = Object.fromEntries(PROFILES.map((p, i) => [p.id, i]));

// taxon -> profile id: first match wins, on "<scientific> <common>" in lower case
const RULES = [
  [/fastigiat|frans fontaine/, s => /carpinus|hornbeam/.test(s) ? 'hornbeam-fastigiate' : null],
  [/italica|lombardy/, 'poplar-lombardy'],
  [/platan|plane\b|platinus/, 'plane'],
  [/quercus ilex|evergreen oak|holm oak|quercus suber/, 'oak-evergreen'],
  [/quercus|\boak\b/, 'oak'],
  [/tilia|\blime\b|linden/, 'lime'],
  [/aesculus|horse.?chestnut/, 'horse-chestnut'],
  [/acer rubrum|acer saccharinum|freemanii|silver maple|red maple/, 'maple-red'],
  [/acer pseudoplatanus|sycamore/, 'sycamore'],
  [/\bacer\b|maple/, 'maple'],
  [/liquidambar|sweet ?gum|nyssa|parrotia|persian ironwood/, 'sweetgum'],
  [/fraxinus|\bash\b/, 'ash'],
  [/carpinus|hornbeam|ostrya/, 'hornbeam'],
  [/fagus.*(purpur|atropunic|riversii|dawyck purple)|copper beech|purple beech/, 'beech-copper'],
  [/fagus|beech|nothofagus/, 'beech'],
  [/robinia|robina|gleditsia|false.?acacia|honey locust|styphnolobium|sophora|acacia|albizia/, 'locust'],
  [/castanea|sweet chestnut/, 'chestnut'],
  [/ginkgo|maidenhair/, 'ginkgo'],
  [/cerasifera|cherry plum|myrobalan/, s => /pissardii|nigra|purpur|crimson|atropurp/.test(s) ? 'plum-purple' : 'cherry-plum'],
  [/prunus.*(pissardii|nigra|purpur)|purple.?leaf/, 'plum-purple'],
  [/prunus avium|prunus padus|wild cherry|bird cherry|gean/, 'cherry-wild'],
  [/prunus lusitanica|prunus laurocerasus|laurel/, 'evergreen'],
  [/prunus|cherry|plum|apricot|almond/, 'cherry'],
  [/malus|apple|cydonia|quince|mespilus|medlar/, 'apple'],
  [/pyrus|\bpear\b|eriobotrya/, 'pear'],
  [/crataeg|hawthorn|thorn\b/, 'hawthorn'],
  [/aucuparia|rowan|mountain ash|hupehensis|vilmorinii|karpatiosorbus|torminalis/, 'rowan'],
  [/sorbus|sorbas|whitebeam|\baria\b/, 'whitebeam'],
  [/amelanchier|juneberry|serviceberry/, 'serviceberry'],
  [/magnolia grandiflora/, 'evergreen'],
  [/magnolia|cercis|judas|davidia|cornus|dogwood|laburnum|koelreuteria|lagerstroemia|syringa|lilac|cotoneaster|pyracantha|photinia/, s => /photinia|cotoneaster/.test(s) && !/cotoneaster frigidus|cornubia/.test(s) ? 'holly' : /magnolia/.test(s) ? 'magnolia' : 'small'],
  [/ilex|holly|ligustrum|privet|laurus|bay\b|olea|olive|arbutus|strawberry tree|osmanthus|rhododendron|viburnum|euonym|azara|pittosporum|luma|elaeagnus|ceanothus|garrya|mahonia|hedera|buddle/, s => /ligustrum|laurus|olea|arbutus/.test(s) ? 'evergreen' : /buddle/.test(s) ? 'small' : 'holly'],
  [/eucalyptus|umbellularia|quercus myrsinifolia|wollemia/, 'evergreen'],
  [/cordyline|trachycarpus|phoenix|arecac|arecales|palm|chamaerops|butia/, 'palm'],
  [/betula|birch/, 'birch'],
  [/populus tremula|aspen/, 'aspen'],
  [/populus|poplar/, 'poplar'],
  [/salix caprea|salix cinerea|goat willow|grey willow|sallow|salix purpurea|salix viminalis|osier/, 'willow-small'],
  [/salix|willow/, 'willow'],
  [/alnus|alder/, 'alder'],
  [/metasequoia|taxodium|larix|larch|dawn redwood|swamp cypress|pseudolarix/, 'conifer-deciduous'],
  [/taxus|yew|juniper|sempervirens|cupressus.*(stricta|totem)|thuja.*(smaragd)/, s => /taxus baccata(?!.*fastig)|\byew\b(?!.*irish)/.test(s) ? 'holly' : 'cypress-columnar'],
  [/pinus|\bpine\b/, 'pine'],
  [/chamaecyparis|cupress|cuprocyparis|xanthocyparis|calocedrus|thuja|picea|spruce|abies|\bfir\b|cedrus|cedar|sequoia|cryptomeria|araucaria|tsuga|pseudotsuga|pinaceae|cypress|redwood|wellingtonia|juniperus/, 'conifer'],
  [/corylus colurna|turkish hazel|celtis|zelkova|zelcova|ulmus|\belm\b|juglans|walnut|carya|pterocarya|wingnut|liriodendron|tulip|catalpa|chitalpa|paulownia|ailanthus|tree.of.heaven|morus|mulberry|cercidiphyllum|ficus|\bfig\b|euodia|tetradium|sassafras|platycarya|phellodendron/, 'broadleaf'],
  [/corylus|hazel|sambucus|elder|rhus|sumach|tamari|hippophae|sea.?buckthorn|cytisus|broom|wisteria|hibiscus|clerodendr|zizyphus|fallopia/, 'small'],
];
// genus-level and family-level names that still say something; "New tree pit", "Misc group", "Unplantable", "Vacant",
// "Mistaken", "unknown", "?" say nothing about the tree (null: the build tool infers a profile from the setting)
const NOT_A_TAXON = /new tree pit|misc group|unplantable|vacant|mistaken|unknown|uknown|stump|^\W*$|^dead\b|not known|^other\b|^false$|mixed species/;
export function profileOf(sci, common) {
  const s = `${sci || ''} ${common || ''}`.toLowerCase().trim();
  if (!s || NOT_A_TAXON.test(s)) return null;
  for (const [re, id] of RULES) if (re.test(s)) { const r = typeof id === 'function' ? id(s) : id; if (r) return r; }
  return 'broadleaf';   // a family or order name, or a genus not listed: a generic broadleaf
}

// the mixes for a tree with no taxon, by setting (stated assumptions, not data): street trees, parks and gardens,
// woods and tree groups, waterside (within 25 m of water). Evergreens: 4.5 % of the trees with a taxon from the source
// are evergreen (2,748 of 61,395 on 2026-10-09: conifer 846, holly 547, other evergreen 488, pine 461, evergreen oak 157,
// palm 157, columnar cypress 92); the park, wood and street mixes carry about that share (before 2026-10-09 they had
// none, so all 20,460 inferred trees were bare in winter). Takes effect when cwplans/tools/build-tree-species.mjs runs.
export const MIXES = {
  street: [['plane', 30], ['lime', 15], ['cherry', 14], ['maple', 9], ['pear', 8], ['hornbeam', 7], ['birch', 6], ['whitebeam', 5], ['apple', 3], ['locust', 3], ['evergreen', 2], ['holly', 1.5], ['conifer', 1]],
  park: [['oak', 18], ['horse-chestnut', 12], ['birch', 12], ['lime', 11], ['plane', 10], ['sycamore', 9], ['maple', 7], ['ash', 7], ['cherry', 5], ['hawthorn', 5], ['beech', 4], ['conifer', 2], ['holly', 1.5], ['pine', 1.5], ['oak-evergreen', 0.5]],
  wood: [['birch', 22], ['oak', 18], ['sycamore', 16], ['ash', 14], ['hawthorn', 10], ['willow-small', 8], ['alder', 6], ['small', 6], ['holly', 3], ['pine', 1.5], ['conifer', 0.5]],
  water: [['willow', 35], ['alder', 25], ['poplar', 15], ['birch', 10], ['plane', 10], ['willow-small', 5]],
};
export const pickMix = (mix, r) => { const tot = mix.reduce((s, m) => s + m[1], 0); let x = r * tot; for (const [id, w] of mix) { if ((x -= w) < 0) return id; } return mix[0][0]; };
// a stable 0..1 from a string (the tree's record id)
export function hash01(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; }

// how a tree's profile was found (data/tree-species.json "basis"): a letter per tree
export const BASIS = {
  S: 'taxon from the source (species or cultivar)',
  G: 'genus or family from the source',
  L: 'inferred: OSM leaf_type / leaf_cycle with the setting',
  T: 'inferred: street mix (no taxon)',
  P: 'inferred: park or garden mix (no taxon)',
  W: 'inferred: wood or tree-group mix (no taxon)',
  R: 'inferred: waterside mix (no taxon)',
};
// base-64 letters for the profile index string
export const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
