#!/usr/bin/env node
// Locale check (OKR KR1.1, https://github.com/danbri/londat/issues/6): counts the locale constants in the code of this
// repository by category, and fails when a category's count goes up against docs/locale-baseline.json. So a new BNG
// call, a new "Europe/London", a new lat/lon literal of the zone or a new UK-only host cannot come into the core; the
// counts can only go down as code moves into the UK adapter.
//   node tools/check-locale.mjs               counts, compare with the baseline, exit 1 if a category went up
//   node tools/check-locale.mjs --baseline    write docs/locale-baseline.json and docs/locale-inventory.md (the list)
//   node tools/check-locale.mjs --list [cat]  print every counted line (file:line category text)
// Run from anywhere; it reads the files that git tracks (else it walks the tree).
//
// What is counted: one per line of code (comments removed by a simple rule: from " //" or a line that starts with "//",
// "/*", "*" or "#" in Python and YAML) that matches the category's pattern. A line can count in more than one category.
// Scope: tracked .js .mjs .cjs .html .py .sh .yml files, except third_party/, node_modules/, any data/ or vendor/
// folder, and the places where locale constants belong: the region configs and adapters (docklands/geo/regions/,
// docklands/geo/adapters/), the geo tests (docklands/geo/test/), this script and docs/.
// Design: https://github.com/danbri/londat/blob/main/docs/planet-architecture.md ; list: docs/locale-inventory.md .
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = join(ROOT, 'docs', 'locale-baseline.json'), INV = join(ROOT, 'docs', 'locale-inventory.md');

// category -> { re, adapter: where the constant belongs once O1 is done, what }
export const CATEGORIES = {
  bng: { re: /bng|27700|national grid/i, what: 'British National Grid (EPSG:27700) projection, names and calls',
    adapter: 'uk-os (UK adapter: BNG <-> WGS84 through OSTN15; core works in WGS84 / ECEF / ENU)' },
  ostn15: { re: /ostn|osgm/i, what: 'OSTN15 / OSGM15 grid transformation', adapter: 'uk-os' },
  odn: { re: /\bODN\b|Ordnance Datum|Newlyn|\bm OD\b|\bmOD\b/, what: 'Ordnance Datum Newlyn heights (m OD)',
    adapter: 'uk-os (heightDatum of the region; core heights are ellipsoidal or region datum by config)' },
  origin: { re: /537550|537[ _,]550|180300|180[ _,]300|\bORIGIN\b|\bE0\b|\bN0\b/, what: 'the model origin E 537,550 N 180,300 (One Canada Square) and its uses',
    adapter: 'region config docklands (origin {lon,lat,h}; the BNG model frame is a fixed transform of its ENU)' },
  box: { re: /BOX_BNG|BBOX_BNG|BOX_WGS84|532400|539900|176700|182300|fetch-docklands\.mjs['"]/, what: 'the model box and its importers',
    adapter: 'region config docklands (bbox; tools take --region)' },
  timezone: { re: /Europe\/London|\b(from|to)London\b|\blondon[A-Z]\w*|\bLDN\b|\bBST\b/, what: 'London time zone and London-time functions',
    adapter: 'region timeZone (docklands/geo/clock.js)' },
  zone_latlon: { re: /(?<![\w.])51\.[3-6]\d*/, what: 'latitude literals of the zone (51.3 to 51.6), e.g. Open-Meteo, adsb.lol, METAR calls',
    adapter: 'region origin / bbox, or the place in view (KR5.3)' },
  uk_sources: { re: /https?:\/\/[^\s'"`)]*\.uk\b|postcodes\.io|\bEGLC\b/i, what: 'UK-only sources hard-wired (hosts under .uk, postcodes.io, the EGLC METAR)',
    adapter: 'source adapters with area and licence class (KR1.4)' },
  ui_en_gb: { re: /['"]en-GB['"]/, what: "'en-GB' formats in the user interface", adapter: 'message catalogue and the visitor locale (Intl, KR1.3)' },
};

const EXT = /\.(m?js|cjs|html|py|sh|ya?ml)$/;
const SKIP = [/^third_party\//, /(^|\/)node_modules\//, /(^|\/)data\//, /(^|\/)vendor\//, /^docklands\/geo\/(regions|adapters|test)\//, /^tools\/check-locale\.mjs$/, /^docs\//];
const inScope = f => EXT.test(f) && !SKIP.some(r => r.test(f));

function trackedFiles() {
  try { return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n').filter(Boolean); }
  catch { const out = [], walk = d => { for (const n of readdirSync(d)) { if (n === '.git' || n === 'node_modules') continue; const p = join(d, n); statSync(p).isDirectory() ? walk(p) : out.push(relative(ROOT, p)); } }; walk(ROOT); return out; }
}

// code text of a line: the comment removed (simple rule, see the header)
export function codeOf(line, file) {
  const t = line.trimStart(), hash = /\.(py|sh|ya?ml)$/.test(file);
  if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || (hash && t.startsWith('#')) || t.startsWith('<!--')) return '';
  let s = line.replace(/(^|\s)\/\/.*$/, '$1');
  if (hash) s = s.replace(/(^|\s)#.*$/, '$1');
  return s;
}

export function scan() {
  const hits = [];
  for (const f of trackedFiles().filter(inScope).sort()) {
    const p = join(ROOT, f); if (!existsSync(p)) continue;
    const lines = readFileSync(p, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.length > 4000) return;   // minified or embedded data, not hand-written code
      const c = codeOf(line, f); if (!c.trim()) return;
      for (const [cat, { re }] of Object.entries(CATEGORIES)) if (re.test(c)) hits.push({ file: f, line: i + 1, cat, text: line.trim() });
    });
  }
  return hits;
}

export function count(hits) {
  const cats = Object.fromEntries(Object.keys(CATEGORIES).map(k => [k, { lines: 0, files: 0 }])), files = {};
  for (const h of hits) { cats[h.cat].lines++; ((files[h.cat] ||= {})[h.file] = (files[h.cat][h.file] || 0) + 1); }
  for (const k of Object.keys(cats)) cats[k].files = Object.keys(files[k] || {}).length;
  return { cats, files };
}

function inventoryMd(hits, c, sha) {
  const esc = s => s.replace(/\|/g, '\\|').replace(/</g, '&lt;');
  const short = s => esc(s.length > 110 ? s.slice(0, 107) + '...' : s);
  const out = [`# Locale inventory (OKR KR1.1)`, '',
    `Generated by \`node tools/check-locale.mjs --baseline\` (https://github.com/danbri/londat/blob/main/tools/check-locale.mjs) from the working tree on top of commit ${sha}. Do not edit by hand.`,
    'The hand-written notes (what each category means, which adapter takes it, the first moves) are in',
    'https://github.com/danbri/londat/blob/main/docs/planet-architecture.md , "Locale inventory: notes".', '',
    'Rule of counting: one per line of code (comments removed) that matches the category. A line can count in more than one',
    'category. The region configs, the adapters and their tests (`docklands/geo/regions/`, `docklands/geo/adapters/`,',
    '`docklands/geo/test/`) are where these constants belong and are not counted. `npm run check` fails when a count goes up.', '',
    '## Counts', '', '| category | what | lines | files | belongs in |', '|---|---|---|---|---|'];
  for (const [k, v] of Object.entries(CATEGORIES)) out.push(`| \`${k}\` | ${v.what} | ${c.cats[k].lines} | ${c.cats[k].files} | ${v.adapter} |`);
  out.push(`| all | | ${hits.length} | ${new Set(hits.map(h => h.file)).size} | |`, '');
  const AREAS = [['docklands/ (Three.js port)', /^docklands\//], ['cwplans/docklands/ (WebGL page)', /^cwplans\/docklands\//], ['cwplans/tools/ (data tools)', /^cwplans\/tools\//],
    ['cwplans/registry/ (registry tools)', /^cwplans\/registry\//], ['other pages and tools', /./]];
  const areaOf = f => AREAS.find(([, r]) => r.test(f))[0];
  out.push('## Counts by area', '', '| area | ' + Object.keys(CATEGORIES).join(' | ') + ' | all |', '|---|' + Object.keys(CATEGORIES).map(() => '---').join('|') + '|---|');
  for (const [name] of AREAS) { const hs = hits.filter(h => areaOf(h.file) === name); out.push(`| ${name} | ` + Object.keys(CATEGORIES).map(k => hs.filter(h => h.cat === k).length).join(' | ') + ` | ${hs.length} |`); }
  out.push('');
  out.push('## Files by count', '', '| file | ' + Object.keys(CATEGORIES).join(' | ') + ' |', '|---|' + Object.keys(CATEGORIES).map(() => '---').join('|') + '|');
  const byFile = {}; for (const h of hits) ((byFile[h.file] ||= {})[h.cat] = (byFile[h.file][h.cat] || 0) + 1);
  for (const f of Object.keys(byFile).sort()) out.push(`| [${f}](https://github.com/danbri/londat/blob/main/${f}) | ` + Object.keys(CATEGORIES).map(k => byFile[f][k] || '').join(' | ') + ' |');
  out.push('');
  for (const k of Object.keys(CATEGORIES)) {
    const hs = hits.filter(h => h.cat === k);
    out.push(`## \`${k}\`: ${CATEGORIES[k].what} (${hs.length})`, '', `Belongs in: ${CATEGORIES[k].adapter}.`, '', '| file:line | code |', '|---|---|');
    for (const h of hs) out.push(`| [${h.file}:${h.line}](https://github.com/danbri/londat/blob/main/${h.file}#L${h.line}) | \`${short(h.text).replace(/`/g, "'")}\` |`);
    out.push('');
  }
  return out.join('\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2), hits = scan(), c = count(hits);
  if (args[0] === '--list') { for (const h of hits) if (!args[1] || h.cat === args[1]) console.log(`${h.file}:${h.line}\t${h.cat}\t${h.text.slice(0, 160)}`); process.exit(0); }
  const sha = (() => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return '?'; } })();
  if (args[0] === '--baseline') {
    mkdirSync(dirname(BASE), { recursive: true });
    writeFileSync(BASE, JSON.stringify({ about: 'Locale constants by category (tools/check-locale.mjs). npm run check fails when a count goes up. Lower it with --baseline when code moves into an adapter.', written_at_commit: sha,
      counts: Object.fromEntries(Object.entries(c.cats).map(([k, v]) => [k, v.lines])), files: c.files }, null, 1) + '\n');
    writeFileSync(INV, inventoryMd(hits, c, sha) + '\n');
    console.log(`wrote ${relative(ROOT, BASE)} and ${relative(ROOT, INV)}`);
  }
  const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : null, bad = [];
  console.log('category      lines  files  baseline');
  for (const [k, v] of Object.entries(c.cats)) {
    const b = base?.counts?.[k]; if (b != null && v.lines > b) bad.push(k);
    console.log(`${k.padEnd(13)} ${String(v.lines).padStart(5)}  ${String(v.files).padStart(5)}  ${b ?? '-'}${b != null && v.lines > b ? '  UP' : b != null && v.lines < b ? '  down (run --baseline to lock it in)' : ''}`);
  }
  console.log(`all           ${String(hits.length).padStart(5)}  ${String(new Set(hits.map(h => h.file)).size).padStart(5)}`);
  if (!base) { console.log('no docs/locale-baseline.json: run with --baseline'); process.exit(1); }
  if (bad.length) {
    console.error(`\nFAIL: more locale constants than the baseline in ${bad.join(', ')}. New code must take the place from the region (docklands/geo/), not hard-wire it.`);
    for (const k of bad) for (const [f, n] of Object.entries(c.files[k] || {})) { const b = base.files?.[k]?.[f] || 0; if (n > b) console.error(`  ${k}: ${f} ${b} -> ${n}`); }
    process.exit(1);
  }
  console.log('locale check: OK');
}
