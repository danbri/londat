#!/usr/bin/env node
// Food Standards Agency hygiene ratings, Tower Hamlets open-data file (FHRS530), as dated E14 snapshots.
//   node magpie/cwplans/tools/registry-fhrs.mjs
// out: data/raw/registry/fhrs/FHRS530-<date>.json.gz (E14 premises) and, when an earlier snapshot exists,
//      registry/fhrs-changes.json: ids added (registrations, usually openings) and removed (closures, de-registrations)
// Premises without address lines are home-based businesses whose address the FSA withholds: not kept.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { gzipSync, gunzipSync } from 'zlib';
import { join } from 'path';
import { RAW, TOOLS, get } from './lib.mjs';

const URL = 'https://ratings.food.gov.uk/api/open-data-files/FHRS530en-GB.json';
const DIR = join(RAW, 'registry', 'fhrs'), today = new Date().toISOString().slice(0, 10);
mkdirSync(DIR, { recursive: true });
const raw = JSON.parse(await get(URL));
const list = raw.FHRSEstablishment?.EstablishmentCollection || raw.establishments || [];
const keep = list.filter(e => /^E14\s/i.test(e.PostCode || '') && (e.AddressLine1 || e.AddressLine2)).map(e => ({
  id: e.FHRSID, name: e.BusinessName, type: e.BusinessType, address: [e.AddressLine1, e.AddressLine2, e.AddressLine3, e.AddressLine4].filter(Boolean).join(', '), postcode: e.PostCode,
  rating: e.RatingValue, rating_date: (e.RatingDate || '').slice(0, 10), new_rating_pending: e.NewRatingPending === 'True' || e.NewRatingPending === true,
  lat: e.Geocode?.Latitude ? +e.Geocode.Latitude : null, lon: e.Geocode?.Longitude ? +e.Geocode.Longitude : null,
}));
writeFileSync(join(DIR, `FHRS530-${today}.json.gz`), gzipSync(JSON.stringify({ source: URL, fetched: today, total_in_file: list.length, establishments: keep })));
const snaps = readdirSync(DIR).filter(f => /^FHRS530-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).sort();
console.log(`FHRS530: ${list.length} in the file, ${keep.length} kept (E14 with an address), ${keep.filter(e => e.lat == null).length} without a position, ${keep.filter(e => /Awaiting/i.test(e.rating)).length} awaiting inspection`);
if (snaps.length >= 2) {
  const [a, b] = snaps.slice(-2).map(f => JSON.parse(gunzipSync(readFileSync(join(DIR, f)))));
  const ia = new Map(a.establishments.map(e => [e.id, e])), ib = new Map(b.establishments.map(e => [e.id, e]));
  const added = [...ib.values()].filter(e => !ia.has(e.id)), removed = [...ia.values()].filter(e => !ib.has(e.id));
  writeFileSync(join(TOOLS, '..', 'registry', 'fhrs-changes.json'), JSON.stringify({ from: a.fetched, to: b.fetched, added, removed }, null, 1));
  console.log(`changes ${a.fetched} -> ${b.fetched}: ${added.length} added, ${removed.length} removed`);
}
