// Weekly opening hours from the Canary Wharf Group directory pages (Internet Archive copies cached by fetch-cwg.mjs):
// the seven-row hours table ("mon: 9am - 8pm", "Closed", "Open 24hrs", "Coming Soon") as OSM opening_hours text,
// with the mall, level and postcode the page gives.
//   in:  registry/sources/brands/cwg-directory.json; data/raw/registry/cwg/pages/<kind>__<slug>.html (not committed)
//   out: registry/sources/brands/cwg-hours.json
//   node magpie/cwplans/tools/cwg-hours.mjs
// Skill: cwplans-web-harvest, "Opening hours".
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { TOOLS, RAW } from './lib.mjs';

const CW = join(TOOLS, '..'), PAGES = join(RAW, 'registry', 'cwg', 'pages');
const dir = JSON.parse(readFileSync(join(CW, 'registry/sources/brands/cwg-directory.json'), 'utf8'));
const DAY = { mon: 'Mo', tue: 'Tu', wed: 'We', thu: 'Th', fri: 'Fr', sat: 'Sa', sun: 'Su' }, ORDER = Object.values(DAY);
// "9am", "7.30am", "7:30am", "12noon", "12 noon", "Midnight", "12midnight", "12am", "10PM", "7.30pm*" -> minutes; null if not a time
function minutes(s, closing) {
  const t = s.toLowerCase().replace(/[*\s]/g, '');
  if (/^(12)?midnight$/.test(t)) return closing ? 1440 : 0;
  if (/^12noon$|^noon$/.test(t)) return 720;
  const m = /^(\d{1,2})(?:[.:](\d\d))?(am|pm)$/.exec(t); if (!m || +m[1] > 12 || +m[1] < 1) return null;
  let h = +m[1] % 12; if (m[3] === 'pm') h += 12; const v = h * 60 + (+m[2] || 0);
  return closing && v === 0 ? 1440 : v;
}
const hm = v => `${String(Math.floor(v / 60) % 24).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;

const out = [], forms = {};
for (const e of dir.directory) {
  const f = join(PAGES, `${e.kind}__${e.slug}.html`);
  const rec = { slug: e.slug, kind: e.kind, name: e.title, mall: e.mall || null, level: e.level ?? null, postcode: e.postcode || null, archived_on: e.archived_on || null };
  if (!existsSync(f)) { out.push({ ...rec, state: 'no-page' }); continue; }
  const html = readFileSync(f, 'utf8').replace(/[\t\r\n]+/g, ' ');
  const rows = [...html.matchAll(/<th scope="row">\s*(mon|tue|wed|thu|fri|sat|sun):<\/th>((?:\s*<td[^>]*>[^<]*<\/td>)+)/g)]
    .map(m => ({ day: DAY[m[1]], cells: [...m[2].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(c => c[1].trim()).filter(c => c !== '-') }));
  if (!rows.length) { out.push({ ...rec, state: 'no-table' }); continue; }
  const spec = {}, problems = [];
  for (const { day, cells } of rows) {
    const [a = '', b = ''] = cells, k = `${a} - ${b}`.toLowerCase(); forms[k.replace(/\d+([.:]\d\d)?/g, 'N')] = (forms[k.replace(/\d+([.:]\d\d)?/g, 'N')] || 0) + 1;
    if (/^closed$/i.test(a)) spec[day] = 'off';
    else if (/^open$/i.test(a) && /^24/.test(b)) spec[day] = '00:00-24:00';
    else if (/^coming$/i.test(a)) spec[day] = 'soon';
    else { const o = minutes(a, false), c = minutes(b, true); if (o == null || c == null) { problems.push(`${day}: "${a}" - "${b}"`); spec[day] = null; } else spec[day] = `${hm(o)}-${c === 1440 ? '24:00' : hm(c)}`; }
  }
  if (Object.values(spec).every(v => v === 'soon')) { out.push({ ...rec, state: 'coming-soon' }); continue; }
  // group consecutive days with the same text: "Mo-Fr 09:00-20:00; Sa,Su 10:00-18:00"
  const parts = []; let i = 0;
  while (i < 7) { const v = spec[ORDER[i]]; let j = i; while (j + 1 < 7 && spec[ORDER[j + 1]] === v) j++; if (v != null && v !== 'soon') parts.push(`${ORDER[i]}${j > i ? (j === i + 1 ? ',' : '-') + ORDER[j] : ''} ${v}`); i = j + 1; }
  const text = Object.values(spec).every(v => v === '00:00-24:00') ? '24/7' : parts.join('; ');
  out.push({ ...rec, state: problems.length ? 'partly-read' : 'read', opening_hours: text, problems: problems.length ? problems : undefined });
}
const counts = out.reduce((m, r) => (m[r.state] = (m[r.state] || 0) + 1, m), {});
writeFileSync(join(CW, 'registry/sources/brands/cwg-hours.json'), JSON.stringify({ source: 'Canary Wharf Group directory pages as archived by the Internet Archive (crawl for scoping, owner rule of 2026-10-03)',
  generated: new Date().toISOString(), tool: 'magpie/cwplans/tools/cwg-hours.mjs',
  note: 'Hours as the page showed them on its archive date (archived_on). opening_hours is OSM syntax; a closing time at or before the opening time runs past midnight. Rows that are not a time are listed in problems and left out.',
  counts, entries: out }, null, 1) + '\n');
console.log(counts); console.log(Object.entries(forms).sort((a, b) => b[1] - a[1]).slice(0, 12));
for (const r of out.filter(r => r.problems)) console.log(r.slug, r.problems.join('; '));
