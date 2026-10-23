// Caps of towers and domes, shared by the landmark sets (cwplans/tools/build-place-landmarks.mjs: Sarajevo's and Dublin's
// minarets, domes and towers, drawn by docklands/globe/landmarks.js) and the UK lite set's landmark parts (place-blocks.mjs
// blockTile; place-lite-tiles 6, issue #14: spires were straight columns). Pure data and functions.
//   capKind(roof_shape, part)  'pointed' (a pyramid or cone to an apex over the centroid: OSM roof:shape pyramidal, cone,
//                              conical, spire, or building:part=spire), 'dome', 'onion', or null (flat)
//   capProfile(kind)           [[f, k]]: from the eaves (f 0) to the top (f 1), the outline scaled about its centroid by k
//                              (k 0: the apex); the dome is a quarter circle in 5 steps, the onion bulges to 1.12
//   CAP_COLOURS                sRGB of each cap kind (lead grey; the stone of the walls is the set's colour)
// Skill: docklands-3d-page, "The UK lite set: spires and towers drawn by their shape (2026-10-23)".
export const POINTED = new Set(['pyramidal', 'cone', 'conical', 'spire']);
export const capKind = (roof, part) => part === 'spire' || POINTED.has(roof) ? 'pointed' : roof === 'dome' || roof === 'onion' ? roof : null;
const ONION = [[0, 1], [0.18, 1.12], [0.4, 1.06], [0.6, 0.72], [0.8, 0.3], [0.92, 0.1], [1, 0]];
const DOME = Array.from({ length: 6 }, (_, k) => [Math.sin(k / 5 * Math.PI / 2), Math.cos(k / 5 * Math.PI / 2)]);
export const capProfile = kind => kind === 'pointed' ? [[0, 1], [1, 0]] : kind === 'onion' ? ONION : kind === 'dome' ? DOME : [[0, 1]];
export const CAP_COLOURS = { pointed: [96, 106, 102], dome: [118, 126, 136], onion: [118, 126, 136] };
