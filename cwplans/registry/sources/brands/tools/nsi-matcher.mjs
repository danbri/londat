// NSI Matcher (location-aware, brands/* tree only) plus the UK brand table from brands-uk.json.
import { join } from 'path';
import { NSI_DIR, OUT, ONE_CANADA_SQ, nsiRequire, readJSON } from './lib.mjs';
const { Matcher } = nsiRequire('name-suggestion-index');
const { LocationConflation } = nsiRequire('@rapideditor/location-conflation');
const dist = join(NSI_DIR, 'node_modules/name-suggestion-index/dist/json');
const nsi = readJSON(join(dist, 'nsi.json')).nsi;
const data = Object.fromEntries(Object.entries(nsi).filter(([p]) => p.startsWith('brands/')));
export const matcher = new Matcher();
matcher.buildMatchIndex(data);
matcher.buildLocationIndex(data, new LocationConflation(readJSON(join(dist, 'featureCollection.json'))));
export const brands = readJSON(join(OUT, 'brands-uk.json')).brands;
export const byId = new Map(brands.map(b => [b.id, b]));
export const byWd = new Map(); for (const b of brands) if (b.wd && !byWd.has(b.wd)) byWd.set(b.wd, b);
export const KVS = [...new Set(brands.map(b => b.kv))];
// all primary/alternate hits valid at Canary Wharf for name n under key/value k=v
export function hits(k, v, n, loc = ONE_CANADA_SQ) {
  const r = matcher.match(k, v, n, loc) || [];
  return r.filter(h => (h.match === 'primary' || h.match === 'alternate') && byId.has(h.itemID));
}

// Name variants for names that carry a branch suffix ("Pret A Manger - Canada Square", "Co-op Food - Isle of Dogs").
// Returns [{n, rule}] longest first. 'full' = the whole name; 'cut' = text before a separator;
// 'strip' = a trailing place/legal word removed; 'prefix' = leading words only (weakest; reviewed by hand).
const PLACE = /\b(canary wharf|cabot place|jubilee place|canada place|crossrail place|churchill place|wood wharf|one canada square|canada square|cabot square|westferry circus|south quay|isle of dogs|docklands|e14|london|cw|ltd|limited|plc|uk|\(.*\))\s*$/i;
export function nameVariants(name) {
  const out = [{ n: name.trim(), rule: 'full' }];
  const seen = new Set([out[0].n.toLowerCase()]);
  const add = (n, rule) => { n = n.replace(/[\s,.\-–—|:@]+$/, '').trim(); if (n.length >= 2 && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); out.push({ n, rule }); } };
  const cut = name.split(/\s+[-–—|@]\s+|\s*\(|\s*,\s*|\s+at\s+|\s*:\s+/i)[0];
  add(cut, 'cut');
  let s = cut; for (let i = 0; i < 3; i++) { const t = s.replace(PLACE, '').trim(); if (t === s) break; s = t; add(s, 'strip'); }
  const w = s.split(/\s+/);
  for (let i = w.length - 1; i >= 1; i--) add(w.slice(0, i).join(' '), 'prefix');
  return out;
}

// Match a free-text business name against every UK brand key=value. typeRe (optional) says which
// key=values fit what the source says the business is. Returns null or
// {brand, variant:{n,rule}, match:'primary'|'alternate', typeOk, others:[nsi ids]}.
export function matchAny(name, typeRe = null) {
  for (const v of nameVariants(name)) {
    const found = new Map();
    for (const kv of KVS) { const [k, val] = kv.split('='); for (const h of hits(k, val, v.n)) if (!found.has(h.itemID)) found.set(h.itemID, h); }
    if (!found.size) continue;
    const hs = [...found.values()].map(h => ({ ...h, brand: byId.get(h.itemID) }));
    const fit = b => (typeRe && typeRe.test(b.kv) ? 1 : 0);
    hs.sort((a, b) => (a.match === 'primary' ? 0 : 1) - (b.match === 'primary' ? 0 : 1) || fit(b.brand) - fit(a.brand) || (a.brand.scope === 'uk' ? -1 : 1));
    return { brand: hs[0].brand, variant: v, match: hs[0].match, typeOk: typeRe ? typeRe.test(hs[0].brand.kv) : null, others: hs.slice(1).map(h => h.brand.id) };
  }
  return null;
}
