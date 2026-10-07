// Adds the facts read from the entities' own web pages (opening hours, phone, events, menu, price range, cuisine) to the
// building occupants in the registry, as occupant.web, with the page, the scope and the confidence of the match.
//
//   node cwplans/tools/join-web-facts.mjs          (after build-registry, before build-categories and build-atlas)
//
// in:  registry/buildings.json, registry/sources/web/structured-facts.json (tools/extract-structured-data.mjs)
// out: registry/buildings.json (occupants[].web; summary.joins.web_facts)
// Keys: "cwb-NNNN|name" (occupant name in that building), "branch:<brand QID>@<element>" (the occupant's OSM element,
// the building's OSM way, fhrs/<FSA id> or a bare FSA id, cwg/<slug>), "charity:<number>",
// "cwg:<directory slug>". Lessons: skills/docklands-data-curation/SKILL.md, "Structured data from rendered pages".
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOOLS } from './lib.mjs';

const CW = join(TOOLS, '..'), REG = join(CW, 'registry/buildings.json');
const R = JSON.parse(readFileSync(REG, 'utf8')), F = JSON.parse(readFileSync(join(CW, 'registry/sources/web/structured-facts.json'), 'utf8'));
// rank: a branch's own page beats an organisation page beats chain-wide hours; then the confidence of the match
const SCOPE = { branch: 3, organisation: 2, chain: 1 }, CONF = { high: 3, medium: 2, low: 1 };
const rank = e => (SCOPE[e.scope] || 0) * 10 + (CONF[e.confidence] || 0);
const slug = u => (/canarywharf\.com\/[^/]+\/([^/?#]+)/.exec(u || '') || [])[1];
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// index the occupants by every key form
const idx = new Map(), add = (k, o) => { if (!k) return; (idx.get(k) || idx.set(k, []).get(k)).push(o); };
for (const b of R.buildings) for (const o of b.occupants) {
  delete o.web;
  // a branch key can name the brand's occupant through the building's own OSM way, an FSA id or a CWG slug
  if (o.brand_wikidata) { for (const w of b.osm || []) add(`branch:${o.brand_wikidata}@${w}`, o); if (o.fhrs_id) { add(`branch:${o.brand_wikidata}@fhrs/${o.fhrs_id}`, o); add(`branch:${o.brand_wikidata}@${o.fhrs_id}`, o); } const cs = slug(o.cwg_url); if (cs) add(`branch:${o.brand_wikidata}@cwg/${cs}`, o); }
  add(`${b.id}|${norm(o.name)}`, o);
  if (o.brand_wikidata && o.osm) add(`branch:${o.brand_wikidata}@${o.osm}`, o);
  if (o.charity_number) add(`charity:${o.charity_number}`, o);
  const s = slug(o.cwg_url); if (s) add(`cwg:${s}`, o);
}
const keyOf = k => { const m = /^(cwb-\d+)\|(.*)$/.exec(k); return m ? `${m[1]}|${norm(m[2])}` : k; };

// best fact record per occupant
const best = new Map(); let unmatched = 0;
for (const e of F.entities) {
  if (!e.opening_hours && !e.phone && !(e.events && e.events.length) && !e.menu && !e.price_range && !e.serves_cuisine) continue;
  const os = idx.get(keyOf(e.key)); if (!os) { unmatched++; continue; }
  for (const o of os) { const cur = best.get(o); if (!cur || rank(e) > rank(cur)) best.set(o, e); }
}
let hours = 0, branchHours = 0, phone = 0, events = 0;
for (const [o, e] of best) {
  const w = { page: e.final_url || e.url, fetched: String(e.fetched).slice(0, 10), scope: e.scope, confidence: e.confidence || null, match: e.match_by };
  if (e.opening_hours && e.opening_hours.osm) { w.opening_hours = e.opening_hours.osm; hours++; if (e.scope === 'branch') branchHours++; }
  if (e.phone) { w.phone = e.phone; phone++; }
  if (e.price_range) w.price_range = e.price_range;
  if (e.serves_cuisine) w.cuisine = e.serves_cuisine;
  if (typeof e.menu === 'string' && /^https?:/.test(e.menu)) w.menu = e.menu;
  if (e.events && e.events.length) { w.events = e.events.slice(0, 20); events++; }
  o.web = w;
}
R.summary.joins = { ...(R.summary.joins || {}), web_facts: { occupants: best.size, opening_hours: hours, opening_hours_branch_scope: branchHours, phone, with_events: events, fact_records_unmatched: unmatched } };
writeFileSync(REG, JSON.stringify(R));
console.log(`web facts: ${best.size} occupants (hours ${hours}, of which branch scope ${branchHours}; phone ${phone}; events ${events}); ${unmatched} fact records match no occupant`);
