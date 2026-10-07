// Paths of the cwplans project in danbri/londat. Since 2026-10-07 the whole project (pages, tools, skills and data) is in
// this repository: cwplans/ is the old magpie/cwplans/ of danbri/glitchcan-minigam, and the repository root holds kgx/,
// data/images/, third_party/ and tools/view-mcp/. Before the move these helpers found the bulk files in a second checkout;
// now every path is in this checkout. The exports keep their names so that the tools need no other change.
//
//   import { cwPath, LONDAT_DIR } from './londat.mjs';   cwPath('feeds/portals/index.json') -> the file on disk
//   LONDAT_DIR=/path/to/londat node cwplans/tools/<tool>.mjs   (default: the checkout that holds this file)
//
// Pages read the same files through ../data-base.js (CwData.url). History of the two-repository layout: skill
// docklands-data-curation, "Data hosted in danbri/londat".
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CW = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LONDAT_DIR = resolve(process.env.LONDAT_DIR || join(CW, '..'));
export const LONDAT_CW = join(LONDAT_DIR, 'cwplans');
export const londatPresent = () => existsSync(LONDAT_CW);
// the folders that were hosted in londat before the move (2026-10-05 to 2026-10-07); kept for the tools that name them
export const HOSTED_DIRS = ['feeds/london-datastore/', 'feeds/portals/', 'feeds/kml/', 'cache/', 'coverage/'];
export const isHostedPath = rel => HOSTED_DIRS.some(d => rel.startsWith(d)) && !/(^|\/)README\.md$|\.js$|^feeds\/kml\/catalogue\.json$/.test(rel);
// a path relative to cwplans/ -> the file on disk
export const cwPath = rel => join(isHostedPath(rel) ? LONDAT_CW : CW, rel);
let warned = false;
export function warnIfNoLondat() {
  if (!warned && !londatPresent()) { warned = true; console.warn(`warning: no cwplans folder at ${LONDAT_CW} (LONDAT_DIR=${LONDAT_DIR})`); }
}
