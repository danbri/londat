// Where the bulk open-data extracts of magpie/cwplans live: the danbri/londat repository (owner, 2026-10-05).
// The files keep their path relative to magpie/cwplans, under cwplans/ in londat (feeds/london-datastore/x/x.geojson is
// londat cwplans/feeds/london-datastore/x/x.geojson). Code (.js) and README.md files stay in this repository.
//
//   import { cwPath, LONDAT_DIR } from './londat.mjs';   cwPath('feeds/portals/index.json') -> the file on disk
//   LONDAT_DIR=/path/to/londat node magpie/cwplans/tools/<tool>.mjs   (default: a londat clone next to this repository)
//
// Pages read the same files through ../data-base.js (CwData.url). Rule, file list and the reasons: skill
// docklands-data-curation, "Data hosted in danbri/londat".
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CW = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LONDAT_DIR = resolve(process.env.LONDAT_DIR || join(CW, '..', '..', '..', 'londat'));
export const LONDAT_CW = join(LONDAT_DIR, 'cwplans');
export const londatPresent = () => existsSync(join(LONDAT_DIR, '.git')) || existsSync(LONDAT_CW);
// the hosted folders; inside them, code and READMEs stay here
// coverage/: open imagery coverage answers (tools/probe-imagery-coverage.mjs). cache/: the SQLite history of live state, latest.json and zone.gpkg (tools/cache-londat.mjs, build-zone-gpkg.mjs; skill cwplans-londat-cache)
export const HOSTED_DIRS = ['feeds/london-datastore/', 'feeds/portals/', 'feeds/kml/', 'cache/', 'coverage/'];
export const isHostedPath = rel => HOSTED_DIRS.some(d => rel.startsWith(d)) && !/(^|\/)README\.md$|\.js$|^feeds\/kml\/catalogue\.json$/.test(rel);
// a path relative to magpie/cwplans -> the file on disk (the londat checkout for a hosted path)
export const cwPath = rel => join(isHostedPath(rel) ? LONDAT_CW : CW, rel);
let warned = false;
export function warnIfNoLondat() {
  if (!warned && !londatPresent()) { warned = true; console.warn(`warning: no londat checkout at ${LONDAT_DIR} (set LONDAT_DIR); files under ${HOSTED_DIRS.join(', ')} are read and written there`); }
}
