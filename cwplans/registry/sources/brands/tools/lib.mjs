// Shared paths and loaders for the brands source. See ../README.md.
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
export const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT = join(HERE, '..');                                   // registry/sources/brands
export const CW = join(HERE, '../../../..');                           // magpie/cwplans
export const RAW = join(CW, 'data/raw/registry');                      // not committed
export const NSI_DIR = join(RAW, 'nsi');                               // npm install name-suggestion-index @rapideditor/location-conflation @rapideditor/country-coder
export const BOX = [-0.0300, 51.4980, -0.0050, 51.5100];               // W S E N, WGS84
export const ONE_CANADA_SQ = [-0.0195, 51.5049];                       // lon, lat
export const UA = 'glitchcan-cwplans/0.1 (https://github.com/danbri/glitchcan-minigam)';
export const inBox = (lon, lat) => lon >= BOX[0] && lon <= BOX[2] && lat >= BOX[1] && lat <= BOX[3];
export const nsiRequire = createRequire(join(NSI_DIR, 'package.json'));
export const nsiImport = async (spec) => import(nsiRequire.resolve(spec));
export const readJSON = p => JSON.parse(readFileSync(p, 'utf8'));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
