// Shared pieces for the registry-*.mjs tools (company-level and property-level open data for Canary Wharf postcodes).
// Output: cwplans/registry/sources/. Raw downloads: cwplans/data/raw/registry/ (not committed).
// Notes on each dataset: cwplans/registry/sources/SOURCES-companies-property.md.
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { TOOLS, RAW, UA, get } from './lib.mjs';

export { UA, get };
export const ROOT = join(TOOLS, '..');
export const OUT = join(ROOT, 'registry', 'sources');
export const RAWREG = join(RAW, 'registry');
mkdirSync(RAWREG, { recursive: true });

// Canary Wharf box (WGS84 lon/lat) and the wider Docklands box, as used by the model.
export const CW_BOX = [-0.0300, 51.4980, -0.0050, 51.5100];
export const DOCKLANDS_BOX = [-0.0950, 51.4740, 0.0150, 51.5220];
export const CW_TIERS = ['cw-core', 'cw-ward', 'cw-box-other-ward'];
export const HIST_TIERS = ['terminated-cw'];

export function cwPostcodes({ terminated = true } = {}) {
  const j = JSON.parse(readFileSync(join(ROOT, 'postcodes', 'postcodes.json'), 'utf8'));
  const tiers = new Set([...CW_TIERS, ...(terminated ? HIST_TIERS : [])]);
  return j.postcodes.filter(p => tiers.has(p.tier));
}

// "E14 5AB" whatever the input spacing/case; null when it does not look like a postcode.
export function normPc(s) {
  if (!s) return null;
  const t = String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (t.length < 5 || t.length > 7) return null;
  return `${t.slice(0, -3)} ${t.slice(-3)}`;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const inBox = (lon, lat, b) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];

// Minimal RFC 4180 CSV line splitter (quoted fields, doubled quotes). Lines must not contain raw newlines.
export function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
