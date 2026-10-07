// Fields of a Canary Wharf Group directory entry, read from its address lines; and the name keys used to join an
// entry to an occupant from another source. Used by fetch-cwg.mjs (fields) and tools/build-registry.mjs (join).
// Tests: cwplans/tools/test/cwg-fields.test.mjs. Why the rules are strict: skill docklands-data-curation,
// fault register (CWG level, mall and postcode parse).

// Places CWG names in its addresses: malls, squares, streets. The first in this order wins, but never a name inside a
// longer name that also appears ("55 Upper Bank Street" is Upper Bank Street, not Bank Street).
export const CWG_PLACES = ['Jubilee Place', 'The Park Pavilion', 'West Wintergarden', 'East Wintergarden', 'Frobisher Passage', 'Fisherman’s Walk', 'Canada Place', 'Cabot Place', 'Churchill Place', 'Crossrail Place', 'Wood Wharf', 'One Canada Square', 'Canada Square', 'Cabot Square', 'Westferry Circus', 'Columbus Courtyard', 'Mackenzie Walk', 'Water Street', 'Harbord Square', 'Park Drive', 'Bank Street', 'Heron Quays', 'Montgomery Square', 'Chancellor Passage', 'Reuters Plaza', 'West India Quay', 'Hertsmere Road', 'Canary Riverside', 'Union Square', 'Charter Street', 'Crossrail Place Roof Garden', 'Newfoundland', 'Wren Landing', 'Middle Dock', 'South Colonnade', 'North Colonnade', 'Upper Bank Street', 'Canary Wharf Pier', 'George Street', 'Brannan Street', 'West Lane'];
// Named retail complexes (malls), as in build-branches.mjs MALLS without the Wood Wharf district: an occupant's mall is
// one of these; any other CWG place is a street, square or district. Two different malls are never the same place.
export const CWG_MALLS = new Set(['Jubilee Place', 'Canada Place', 'Cabot Place', 'Churchill Place', 'Crossrail Place', 'One Canada Square', 'The Park Pavilion', 'West Wintergarden', 'East Wintergarden', 'Columbus Courtyard']);
// names that are one place: "Cabot Place Mall" is Cabot Place; "S Colonnade" is South Colonnade
const PLACE_ALIAS = [[/\bCabot Place Mall\b/i, 'Cabot Place'], [/\bChurchill Place Mall\b/i, 'Churchill Place'], [/\bS Colonnade\b/, 'South Colonnade'], [/\bWater St\b/, 'Water Street']];

// A level line names a level: "Mall Level -1", "Lower Mall -2", "Upper Level 1", "Street Level 0", "Mezzanine",
// "Level –2", "- 1 Level". Not "55 Upper Bank Street" (upper) and not "United Kingdom" (unit): the first parser
// matched those as levels.
const LEVEL_LINE = /\b(level|floor|mezzanine|podium|kiosk)\b|^(lower|upper) mall\b|^unit\b/i;
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
// lines that are no address: a CMS template field name ("field_692d85e5bb6ad"), the country
const NOT_ADDRESS = /^field_[0-9a-f]+$|^United Kingdom$/i;

export function cwgFields(lines) {
  const ls = (lines || []).filter(l => !NOT_ADDRESS.test(l.trim()));
  let joined = ls.join(' | ');
  for (const [re, to] of PLACE_ALIAS) joined = joined.replace(re, to);
  const low = joined.toLowerCase();
  const hits = CWG_PLACES.filter(m => low.includes(m.toLowerCase()));
  const mall = hits.filter(m => !hits.some(o => o !== m && o.toLowerCase().includes(m.toLowerCase())))[0] || null;
  const level = ls.find(l => LEVEL_LINE.test(l)) || null;
  const pm = joined.match(POSTCODE);
  const postcode = pm ? `${pm[1].toUpperCase()} ${pm[2].toUpperCase()}` : null;
  const district = postcode ? postcode.split(' ')[0] : (joined.match(/\b(E\d{1,2})\b/) || [])[1] || null;
  // "40 Bank Street", "16-19 Canada Square", "2a Reuters Plaza", "One Cabot Square": a street address line
  const street = ls.find(l => /^(\d+[a-z]?(\s*[-–&]\s*\d+[a-z]?)?|one|two|three)\s+\S/i.test(l.trim()) && !LEVEL_LINE.test(l)) || null;
  const flags = [];
  if ((lines || []).some(l => /^field_[0-9a-f]+$/i.test(l.trim()))) flags.push('template field in address');
  if (/throughout/i.test(joined)) flags.push('estate-wide');
  if (/car park/i.test(joined)) flags.push('car park');
  return { mall, level, postcode, district, street, flags };
}

// Level number from a CWG level label ("Mall Level -1" -> -1, "Street Level 0" -> 0, "Mezzanine" -> null).
export const cwgLevelNum = s => { const m = /(-|–)?\s*(\d+)/.exec(String(s || '')); return m ? (m[1] ? -1 : 1) * +m[2] : /street|ground/i.test(s || '') ? 0 : null; };

// Name keys: lower case, no accents, "&" and "+" as "and", no punctuation, no leading "the"; plus variants without a
// branch suffix naming a place ("Café Brera – Cabot Place", "Badiani Gelato At Cabot Place", "Hawksmoor Wood Wharf",
// "Qube East – Canary Wharf"). Two names join only when a key is equal; the place rule is the caller's.
const PLACE_WORDS = [...CWG_PLACES, 'Canary Wharf', 'Wharf Kitchen', 'Isle of Dogs'].map(p => p.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ''));
const clean = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '').replace(/[&+]/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^the /, '');
export function nameKeys(name) {
  const raw = String(name || '').trim(); if (!raw) return [];
  const keys = new Set([clean(raw)]);
  const dash = raw.split(/\s*,\s*|\s+[–—-]\s+/);
  if (dash.length > 1 && PLACE_WORDS.includes(clean(dash.slice(1).join(' ')))) keys.add(clean(dash[0]));
  for (const k of [...keys]) {
    for (const p of PLACE_WORDS.map(clean)) {
      for (const re of [new RegExp(`^(.+?) (at|of|in) ${p}$`), new RegExp(`^(.+?) ${p}$`)]) { const m = k.match(re); if (m && m[1].length >= 3) keys.add(m[1]); }
    }
  }
  return [...keys].filter(k => k.length >= 2);
}
