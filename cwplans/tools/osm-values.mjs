// Parsers for OSM tag values that are not single plain values. Meant for every tool that reads OSM tags (pipeline.json
// "libraries" lists which do so far; build-data, build-categories and the brands tools still read tags directly), so the
// rules live in one place and have fixture tests (tools/test/osm-values.test.mjs; run: node --test cwplans/tools/test/*.test.mjs).
// Why: faults F2 and F3 in the docklands-data-curation skill.

// A tag can hold several values separated by ";" ("E14 9DT;E14 9FQ", "0;1"). ";;" is an escaped ";" in OSM;
// it does not occur in the tags we read, so it is not handled.
export const osmList = v => v == null ? [] : String(v).split(';').map(s => s.trim()).filter(Boolean);

// addr:unit is free text: mappers write "14", "14a", "Unit 14", "Kiosk 3", "Units 5-6", "Lower Mall". Add the word
// "Unit" only to a bare designator (a number, a number with letters, or a short code such as "R12" or "LG06").
const DESIGNATOR = /^(?:[A-Z]{0,3}\d+[A-Z]?|\d+[A-Z]?\s*[-–]\s*\d+[A-Z]?)$/i;
export function unitLabel(u) {
  const s = String(u ?? '').replace(/\s+/g, ' ').trim(); if (!s) return null;
  return DESIGNATOR.test(s) ? `Unit ${s}` : s;
}

// level="0;1", "-1,0" (comma: a common mapping error with clear intent), "0-2" (a range: every whole level from 0 to 2),
// "0.5" (a mezzanine). Returns the sorted distinct levels; tokens that are not numbers ("G", "roof") are left out and
// listed by osmLevelsUnread, so the audit can count them (VA-2).
const LEVEL_TOKEN = /^\s*(-?\d+(?:\.\d+)?)\s*(?:-\s*(-?\d+(?:\.\d+)?))?\s*$/;
export function osmLevels(v) {
  if (v == null || v === '') return [];
  const out = [];
  for (const part of String(v).split(/[;,]/)) { const m = LEVEL_TOKEN.exec(part); if (!m) continue; const a = +m[1]; if (m[2] !== undefined && +m[2] > a) { for (let x = a; x <= +m[2]; x++) out.push(x); if (!Number.isInteger(+m[2])) out.push(+m[2]); } else out.push(a); }
  return [...new Set(out)].sort((a, b) => a - b);
}
export const osmLevelsUnread = v => v == null ? [] : String(v).split(/[;,]/).map(s => s.trim()).filter(s => s && !LEVEL_TOKEN.test(s));
