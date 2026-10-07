// Checks cwplans/data-register.json against the committed files, and writes DATA-REGISTER.md.
//
//   node cwplans/tools/check-data-register.mjs           # check only; exit 1 on a problem
//   node cwplans/tools/check-data-register.mjs --write   # check, then write DATA-REGISTER.md, METHODS.md and pipeline.jsonld
//
// Provenance (pipeline.json, hand-kept): every tool is an activity that used files, local raw data or external
// sources and generated files. Checked here: each tool exists and is listed (or listed as a library or test); each
// committed input and output exists; each register entry made by a tool has an activity that generates it; every
// "after" names an activity; every activity and hand step (manual_activities) has a method, rules, a known area and
// fault ids that the fault register in the curation skill has. --write exports pipeline.jsonld (W3C PROV-O, DCAT,
// Dublin Core) for a knowledge graph and writes METHODS.md (methods-intro.md + pipeline.json + the fault register).
//
// Checks: every committed or staged data file in cwplans has an entry; every entry's file exists;
// every source and OSM extract named is defined; every page that loads OSM-derived data shows the
// "© OpenStreetMap contributors" notice with a link to https://www.openstreetmap.org/copyright.
// Data file = any tracked file except code (.mjs, .py, .c, .html), .gitignore, vendor/ directories (third-party code) and
// skills/ directories (at any depth: docklands/skills/ too).
// Why the register exists: CLAUDE.md, Data ethics, the cwplans exception.
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kid } from './kgx-ids.mjs';
const CW = join(dirname(fileURLToPath(import.meta.url)), '..');
const reg = JSON.parse(readFileSync(join(CW, 'data-register.json'), 'utf8'));
const problems = [];

const tracked = execFileSync('git', ['ls-files', '--cached', '--', '.'], { cwd: CW, encoding: 'utf8' })
  .split('\n').filter(Boolean);
const isData = p => !/\.(mjs|py|c|sh|html)$/.test(p) && !p.endsWith('.gitignore') && !p.includes('vendor/') && !/(^|\/)skills\//.test(p)
  && !['data-register.json', 'DATA-REGISTER.md'].includes(p);
const byPath = new Map(reg.files.map(f => [f.path, f]));
// Until 2026-10-07 the bulk folders were in danbri/londat and the rest in danbri/glitchcan-minigam, and entries for the
// bulk files had "hosted": "londat". Since the move every file is in this repository and no entry has "hosted".
const loc = p => join(CW, p);
// An entry may name a family of files with a * (cache/live-*.sqlite: one SQLite per month; cache/runs/*/live-*.json.gz: one
// file per hourly run), added by the cache workflow with no edit here. It covers every such file in that folder; at least
// one must exist unless the entry has "may_be_empty": true (the monthly SQLite before the first month is closed).
const isPattern = p => p.includes('*');
const patRe = p => new RegExp('^' + p.split('*').map(x => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
const patterns = reg.files.filter(f => isPattern(f.path)).map(f => [patRe(f.path), f]);
const entryOf = p => byPath.get(p) || (patterns.find(([re]) => re.test(p)) || [])[1];
const filesOf = p => { if (!isPattern(p)) return existsSync(loc(p)) ? [loc(p)] : [];   // a * may stand in a folder name too (cache/runs/*/live-*.json.gz)
  const base = p.slice(0, p.indexOf('*')).replace(/[^/]*$/, ''), re = patRe(p), dir = join(CW, base);
  const walk = (d, rel) => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name), rel + e.name + '/') : [rel + e.name]);
  return existsSync(dir) ? walk(dir, base).filter(r => re.test(r)).map(r => join(CW, r)) : []; };

for (const p of tracked.filter(isData)) if (!entryOf(p)) problems.push(`not in the register: ${p}`);
for (const f of reg.files) {
  if (f.hosted !== undefined) problems.push(`${f.path}: "hosted" is no longer used (every file is in this repository since 2026-10-07)`);
  if (!filesOf(f.path).length && !(isPattern(f.path) && f.may_be_empty)) problems.push(`register entry has no file: ${f.path}`);
  for (const s of f.sources) if (!reg.sources[s]) problems.push(`${f.path}: unknown source "${s}"`);
  if (!(f.osm?.use in reg.osm_use_values)) problems.push(`${f.path}: osm.use "${f.osm?.use}" is not one of ${Object.keys(reg.osm_use_values).join(', ')}`);
  if (f.osm?.extract && !reg.osm_extracts[f.osm.extract]) problems.push(`${f.path}: unknown OSM extract "${f.osm.extract}"`);
  if (f.osm?.use !== 'none' && !f.sources.includes('osm') && f.osm?.use !== 'notes') problems.push(`${f.path}: uses OSM but "osm" is not in its sources`);
  if (f.sources.includes('osm') && f.osm?.use === 'none') problems.push(`${f.path}: lists "osm" as a source but osm.use is none`);
}
// OSM use in the owner's other repository (danbri/glitchcan-minigam, not this project): checked when a checkout of it is
// next to this one (or at GLITCHCAN_DIR)
const GLITCHCAN = process.env.GLITCHCAN_DIR || join(CW, '..', '..', 'glitchcan-minigam');
if (existsSync(join(GLITCHCAN, '.git'))) for (const e of reg.osm_elsewhere_in_repo.paths)
  if (!existsSync(join(GLITCHCAN, e.path))) problems.push(`osm_elsewhere_in_repo: no file ${e.path} in ${GLITCHCAN}`);

const OSM_NOTICE = /href="https:\/\/www\.openstreetmap\.org\/copyright"[^>]*>© OpenStreetMap contributors</;
const odblFiles = new Set(reg.files.filter(f => ['raw', 'derived', 'counts'].includes(f.osm.use)).map(f => f.path));
for (const pg of reg.pages) {
  const html = readFileSync(join(CW, pg.path), 'utf8');
  const osmLoads = pg.loads.filter(l => odblFiles.has(l));
  if (osmLoads.length && !OSM_NOTICE.test(html)) problems.push(`${pg.path} shows OSM data (${osmLoads.join(', ')}) but has no visible © OpenStreetMap contributors notice`);
}

// ---- provenance: pipeline.json
const PIPE = join(CW, 'pipeline.json'), pipe = existsSync(PIPE) ? JSON.parse(readFileSync(PIPE, 'utf8')) : null;
// the fault register (F-numbers) is the table in the curation skill: | id | found | fault | class | status | evidence |
const SKILL_PATH = 'skills/docklands-data-curation/SKILL.md';
const FAULTS = readFileSync(join(CW, SKILL_PATH), 'utf8').split('\n').filter(l => /^\| F\d+ \|/.test(l)).map(l => {
  const c = l.split('|').slice(1, -1).map(s => s.trim());
  if (c.length !== 6) problems.push(`${SKILL_PATH}: cannot read fault row ${c[0]}`);
  return { id: c[0], found: c[1], fault: c[2], cls: c[3], status: c[4], evidence: c[5] };
});
if (pipe) {
  const acts = pipe.activities, ids = new Set(acts.map(a => a.id)), listed = new Set([...acts.map(a => a.tool), ...(pipe.libraries || []).map(l => l.tool), ...(pipe.tests || []).map(t => t.tool)]);
  const scripts = tracked.filter(p => /^(tools\/[^/]+|tools\/(native|test)\/[^/]+|registry\/sources\/[^/]+\/tools\/[^/]+|registry\/sources\/[^/]+\/[^/]+|feeds\/[^/]+)\.(mjs|py|sh|c)$/.test(p));
  for (const t of scripts) if (!listed.has(t)) problems.push(`pipeline.json: tool not listed: ${t}`);
  // every method is written down: a non-empty method and rules, a known area, fault ids that the fault register has
  const areaIds = new Set((pipe.areas || []).map(a => a.id)), faultIds = new Set(FAULTS.map(f => f.id)), seen = new Set();
  const manual = pipe.manual_activities || [];
  for (const [a, what] of [...acts.map(a => [a, 'activity']), ...manual.map(a => [a, 'manual activity'])]) {
    if (what === 'manual activity' && seen.has(a.id)) problems.push(`pipeline.json: id ${a.id} used twice`);
    seen.add(a.id);
    if (typeof a.method !== 'string' || !a.method.trim()) problems.push(`pipeline.json ${what} ${a.id}: method is empty`);
    if (!Array.isArray(a.rules) || !a.rules.length || a.rules.some(r => typeof r !== 'string' || !r.trim())) problems.push(`pipeline.json ${what} ${a.id}: rules are empty`);
    if (!areaIds.has(a.area)) problems.push(`pipeline.json ${what} ${a.id}: area "${a.area}" is not one of pipeline.json areas`);
    for (const f of a.faults || []) if (!faultIds.has(f)) problems.push(`pipeline.json ${what} ${a.id}: fault ${f} is not in the fault register (${SKILL_PATH})`);
  }
  for (const m of manual) for (const u of [...(m.used || []), ...(m.generated || [])]) {
    if (u.file && !(filesOf(u.file).length > 0 || !!byPath.get(u.file)?.may_be_empty)) problems.push(`pipeline.json manual activity ${m.id}: no committed file ${u.file}`);
    if (u.source && !reg.sources[u.source]) problems.push(`pipeline.json manual activity ${m.id}: unknown source ${u.source}`);
  }
  const made = new Set();
  for (const a of acts) {
    if (!existsSync(join(CW, a.tool))) problems.push(`pipeline.json ${a.id}: no tool ${a.tool}`);
    for (const d of a.after || []) if (!ids.has(d)) problems.push(`pipeline.json ${a.id}: after names unknown activity ${d}`);
    for (const u of [...(a.used || []), ...(a.generated || [])]) {
      if (u.file && !(filesOf(u.file).length > 0 || !!byPath.get(u.file)?.may_be_empty)) problems.push(`pipeline.json ${a.id}: no committed file ${u.file}`);
      if (u.source && !reg.sources[u.source]) problems.push(`pipeline.json ${a.id}: unknown source ${u.source}`);
    }
    for (const g of a.generated || []) if (g.file) made.add(g.file);
  }
  for (const f of reg.files) if (/tools\/[\w-]+\.(mjs|py|sh)/.test(f.produced_by || '') && !made.has(f.path)) problems.push(`pipeline.json: no activity generates ${f.path} (register: produced by ${f.produced_by})`);
}

const size = p => { if (isPattern(p)) { const fs = filesOf(p), n = fs.reduce((a, f) => a + statSync(f).size, 0); return fs.length ? `${fs.length} files, ${n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.ceil(n / 1e3) + ' kB'}` : '0 files'; }
  if (!existsSync(loc(p))) return '(written below)'; const n = statSync(loc(p)).size; return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.ceil(n / 1e3)} kB`; };
const osmRows = reg.files.filter(f => f.osm.use !== 'none');
const reviews = reg.files.filter(f => f.review);
console.log(`${reg.files.length} files registered, ${tracked.filter(isData).length} data files tracked; ${osmRows.length} use OSM (${[...odblFiles].length} hold OSM data); ${reviews.length} marked for review.`);

if (process.argv.includes('--write')) {
  const esc = s => String(s).replace(/\|/g, '\\|');
  const lic = s => reg.sources[s] ? `${reg.sources[s].name.split(' (')[0]} (${reg.sources[s].licence})` : s;
  const out = [
    '# Data register: cwplans',
    '',
    `Generated from \`data-register.json\` by \`tools/check-data-register.mjs --write\` on ${new Date().toISOString().slice(0, 10)}. Edit the JSON, not this file.`,
    '',
    '## Policy',
    '',
    ...Object.entries(reg.policy).map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${v}`),
    '',
    '## OpenStreetMap (ODbL) use',
    '',
    'Attribution on every page that shows OSM data: "© OpenStreetMap contributors", linked to https://www.openstreetmap.org/copyright.',
    '',
    '| extract | OSM data as of | fetched | committed |',
    '|---|---|---|---|',
    ...Object.entries(reg.osm_extracts).map(([k, e]) => `| ${k}: ${esc(e.url)} | ${esc(e.osm_data_as_of || '(API, live)')} | ${e.fetched} | ${e.committed ? 'yes' : 'no (' + e.local_path + ')'} |`),
    '',
    '| file | size | use | what OSM data | extract | shown on |',
    '|---|---|---|---|---|---|',
    ...osmRows.map(f => `| \`${f.path}\` | ${size(f.path)} | ${f.osm.use} | ${esc(f.osm.what || '')} | ${f.osm.extract || ''} | ${(f.shown_on || []).join(', ')} |`),
    '',
    'Use values: ' + Object.entries(reg.osm_use_values).map(([k, v]) => `**${k}**: ${v}`).join('; ') + '.',
    '',
    '### OSM in danbri/glitchcan-minigam (not this project)',
    '',
    reg.osm_elsewhere_in_repo.note,
    '',
    ...reg.osm_elsewhere_in_repo.paths.map(e => `- \`${e.path}\`: ${e.use}, ${e.what}`),
    '',
    '## Marked for review',
    '',
    ...reviews.map(f => `- \`${f.path}\`: ${f.review}`),
    '',
    '## All registered files',
    '',
    '| file | size | what | sources (licence) |',
    '|---|---|---|---|',
    ...reg.files.map(f => `| \`${f.path}\` | ${size(f.path)} | ${esc(f.what)} | ${esc(f.sources.map(lic).join('; '))} |`),
    '',
    '## Sources',
    '',
    '| key | source | licence | attribution or note |',
    '|---|---|---|---|',
    ...Object.entries(reg.sources).map(([k, s]) => `| ${k} | ${esc(s.name)} | ${esc(s.licence)} | ${esc([s.attribution, s.note].filter(Boolean).join(' '))} |`),
    '',
  ].join('\n');
  writeFileSync(join(CW, 'DATA-REGISTER.md'), out);
  console.log('wrote DATA-REGISTER.md');
  if (pipe) {   // JSON-LD for a knowledge graph: activities, the files they used and made, and the external sources
    // committed files by their GitHub URL; sources, tool activities and local files by their knowledge-graph IDs
    // (https://kgx.foaf.tv/id/src<key>, tool<id>, local<path>; kgx-ids.mjs); the cwp: vocabulary keeps its namespace
    const BASE = 'https://github.com/danbri/londat/blob/main/cwplans/', REG = 'https://danbri.github.io/glitchcan-minigam/magpie/cwplans/data-register.json#';
    const fileId = p => BASE + p, srcId = k => kid('source', k), actId = id => kid('tool', id), localId = p => kid('local', p);
    // a local path with a placeholder (<run>, <E>_<N>) is a pattern, not one file: a blank node with the pattern
    const ref = u => u.file ? { '@id': fileId(u.file) } : u.local ? (/[<>]/.test(u.local) ? { 'cwp:pathPattern': u.local } : { '@id': localId(u.local) }) : { '@id': srcId(u.source), ...(u.endpoint ? { 'dcat:accessURL': u.endpoint } : {}), ...(u.request ? { 'dct:description': u.request } : {}) };
    const graph = [];
    for (const a of pipe.activities) graph.push({ '@id': actId(a.id), '@type': 'prov:Activity', 'rdfs:label': a.id, 'dct:description': a.method, 'prov:used': (a.used || []).map(ref), 'prov:generated': (a.generated || []).map(ref),
      'cwp:tool': { '@id': fileId(a.tool) }, 'cwp:command': a.command, 'cwp:kind': a.kind, 'cwp:rule': a.rules || [], 'cwp:network': !!a.network, 'cwp:deterministic': a.deterministic !== false, 'cwp:after': (a.after || []).map(d => ({ '@id': actId(d) })),
      'cwp:area': a.area, 'cwp:fault': a.faults || [], ...(a.judgement ? { 'cwp:judgement': a.judgement } : {}) });
    for (const m of pipe.manual_activities || []) graph.push({ '@id': actId(m.id), '@type': 'prov:Activity', 'rdfs:label': m.what, 'dct:description': m.method, 'prov:used': (m.used || []).map(ref), 'prov:generated': (m.generated || []).map(ref),
      'cwp:kind': 'hand', 'cwp:rule': m.rules, 'cwp:area': m.area, 'cwp:fault': m.faults || [], 'cwp:by': m.by, 'cwp:date': m.date, 'cwp:decisionsRecordedIn': m.decisions_recorded_in || [], ...(m.gap ? { 'cwp:gap': m.gap } : {}) });
    const by = new Map(); for (const a of [...(pipe.manual_activities || []), ...pipe.activities]) for (const g of a.generated || []) if (g.file) by.set(g.file, actId(a.id));
    for (const f of reg.files) graph.push({ '@id': fileId(f.path), '@type': ['prov:Entity', 'dcat:Distribution'], 'dct:title': f.what, 'prov:wasDerivedFrom': f.sources.map(k => ({ '@id': srcId(k) })), ...(by.has(f.path) ? { 'prov:wasGeneratedBy': { '@id': by.get(f.path) } } : {}), 'cwp:osmUse': f.osm.use, ...(f.review ? { 'cwp:review': f.review } : {}) });
    for (const [k, v] of Object.entries(reg.sources)) graph.push({ '@id': srcId(k), '@type': ['prov:Entity', 'dcat:Dataset'], 'dct:title': v.name, 'dct:license': v.licence, ...(v.url ? { 'dcat:landingPage': v.url } : {}), ...(v.attribution ? { 'cwp:attribution': v.attribution } : {}) });
    writeFileSync(join(CW, 'pipeline.jsonld'), JSON.stringify({ '@context': { prov: 'http://www.w3.org/ns/prov#', dct: 'http://purl.org/dc/terms/', dcat: 'http://www.w3.org/ns/dcat#', rdfs: 'http://www.w3.org/2000/01/rdf-schema#', cwp: REG + 'vocab/' }, '@graph': graph }, null, 1));
    console.log(`wrote pipeline.jsonld: ${pipe.activities.length} activities, ${(pipe.manual_activities || []).length} manual activities, ${reg.files.length} files, ${Object.keys(reg.sources).length} sources`);
    writeMethods(esc);
  }
}

// METHODS.md: the hand-written front section (methods-intro.md), then every activity of pipeline.json by subject area in
// rebuild order, the hand-judgement steps, the fault register summary and the rebuild order. Edit pipeline.json and
// methods-intro.md, not METHODS.md.
function writeMethods(esc) {
  const acts = pipe.activities, manual = pipe.manual_activities || [], areas = pipe.areas || [];
  // rebuild order: topological over "after" (ties keep file order); activities in a cycle follow in file order
  const ix = new Map(acts.map((a, i) => [a.id, i])), done = new Set(), order = [];
  while (order.length < acts.length) {
    const next = acts.find(a => !done.has(a.id) && (a.after || []).every(d => done.has(d) || !ix.has(d)));
    const pick = next || acts.find(a => !done.has(a.id));
    done.add(pick.id); order.push(pick);
  }
  const rank = new Map(order.map((a, i) => [a.id, i + 1]));
  const SKILL_URL = 'https://github.com/danbri/londat/blob/main/cwplans/' + SKILL_PATH;
  const lnk = p => `[${p}](${p})`;
  const ref = u => u.file ? lnk(u.file)
    : u.local ? `\`${u.local}\` (local, not committed)`
    : `**${u.source}** (${reg.sources[u.source] ? `${reg.sources[u.source].name.split(' (')[0]}, ${reg.sources[u.source].licence}` : 'unknown source'})${u.endpoint ? `: ${u.endpoint}` : ''}${u.request ? `; ${u.request}` : ''}${u.access ? ` [${u.access}]` : ''}`;
  const faultLink = f => `[${f}](${SKILL_URL}#fault-register)`;
  const block = (a, hand) => [
    `#### ${hand ? 'Hand step' : `${rank.get(a.id)}.`} \`${a.id}\`${hand ? `: ${a.what}` : ` (${a.tool})`}`,
    '',
    ...(hand ? [`- By: ${a.by}; date: ${a.date}`] : [`- Command: \`${a.command}\``]),
    `- Method: ${a.method}`,
    '- Rules:',
    ...a.rules.map(r => `  - ${r}`),
    `- Inputs:${(a.used || []).length ? '' : ' none'}`,
    ...(a.used || []).map(u => `  - ${ref(u)}`),
    `- Outputs:${(a.generated || []).length ? '' : ' none (prints only)'}`,
    ...(a.generated || []).map(u => `  - ${ref(u)}`),
    ...(hand ? [] : [`- Network: ${a.network ? 'yes' : 'no'}; deterministic: ${a.deterministic === false ? 'no' : 'yes'}; kind: ${a.kind}; after: ${(a.after || []).length ? a.after.map(d => `\`${d}\``).join(', ') : 'nothing'}`]),
    ...(a.judgement ? [`- Hand judgement: ${a.judgement}`] : []),
    ...(a.decisions_recorded_in ? [`- Decisions recorded in: ${a.decisions_recorded_in.join('; ')}`] : []),
    ...(a.gap ? [`- Not committed as code: ${a.gap}`] : []),
    ...(a.faults ? [`- Faults: ${a.faults.map(faultLink).join(', ')}`] : []),
    ...(a.note ? [`- Note: ${a.note}`] : []),
    '',
  ];
  const quality = existsSync(join(CW, 'quality/issues.json')) ? JSON.parse(readFileSync(join(CW, 'quality/issues.json'), 'utf8')) : null;
  const citing = f => [...acts, ...manual].filter(a => (a.faults || []).includes(f)).map(a => `\`${a.id}\``).join(', ');
  const intro = existsSync(join(CW, 'methods-intro.md')) ? readFileSync(join(CW, 'methods-intro.md'), 'utf8').trim() : '(methods-intro.md is missing)';
  const out = [
    '# Methods: cwplans',
    '',
    `Generated by \`tools/check-data-register.mjs --write\` on ${new Date().toISOString().slice(0, 10)} from \`methods-intro.md\` (hand-written), \`pipeline.json\` (one activity per tool, ${acts.length} activities, and ${manual.length} hand steps), the fault register in \`${SKILL_PATH}\` and \`quality/issues.json\`. Edit those files, not this one.`,
    '',
    'Contents: policy and owner rules; methods by subject area, in rebuild order; hand-judgement steps; fault register; rebuild order; libraries and tests.',
    '',
    intro,
    '',
    '## Methods by subject area',
    '',
    'Each tool activity gives its command, method, rules, inputs, outputs, network and determinism, and the activities that must run before it. The number is its place in the rebuild order. A hand step is a method that is not a tool. "local" files are not committed (raw downloads, caches, excluded outputs).',
    '',
    ...areas.flatMap((ar, k) => {
      const as = acts.filter(a => a.area === ar.id).sort((x, y) => rank.get(x.id) - rank.get(y.id)), ms = manual.filter(m => m.area === ar.id);
      if (!as.length && !ms.length) return [];
      const extra = ar.id === 'quality' && quality ? [
        `The checks (${quality.checks.length}, run ${quality.generated}; counts and examples in [quality/CATALOGUE.md](quality/CATALOGUE.md)):`,
        '',
        '| check | class | title | method | issues |',
        '|---|---|---|---|---:|',
        ...quality.checks.map(c => `| ${c.id} | ${esc(c.cls)} | ${esc(c.title)} | ${esc(c.method)} | ${c.issues} |`),
        '',
      ] : [];
      return [`### ${k + 1}. ${ar.title}`, '', ...as.flatMap(a => block(a, false)), ...ms.flatMap(m => block(m, true)), ...extra];
    }),
    '## Hand-judgement steps',
    '',
    'Where a person (or an agent working by hand) decides, and where the decision is written down.',
    '',
    '| step | area | what is judged | where it is recorded |',
    '|---|---|---|---|',
    ...acts.filter(a => a.judgement).sort((x, y) => rank.get(x.id) - rank.get(y.id)).map(a => `| \`${a.id}\` (tool) | ${a.area} | ${esc(a.judgement)} | ${esc(a.decisions_recorded_in ? a.decisions_recorded_in.join('; ') : a.tool)} |`),
    ...manual.map(m => `| \`${m.id}\` (hand step) | ${m.area} | ${esc(m.what)}${m.gap ? ` (${esc(m.gap)})` : ''} | ${esc((m.decisions_recorded_in || []).join('; '))} |`),
    '',
    '## Fault register',
    '',
    `Faults found in this project's joins and tools (F-numbers). Evidence and audit counts: [the curation skill, Fault register](${SKILL_URL}#fault-register) ([local copy](${SKILL_PATH})). Add a new fault there with the next number, and name it in the "faults" of the activities it touches.`,
    '',
    '| id | found | class | status | fault | activities |',
    '|---|---|---|---|---|---|',
    ...FAULTS.map(f => `| ${f.id} | ${esc(f.found)} | ${esc(f.cls)} | ${esc(f.status)} | ${esc(f.fault)} | ${citing(f.id) || '-'} |`),
    '',
    '## Rebuild order',
    '',
    'All tool activities in an order that satisfies every "after" (the brands merge and the store-page check depend on each other: build-branches runs again after storelocator). Commands run from the repository root. Network steps need `NODE_USE_ENV_PROXY=1` behind the proxy.',
    '',
    ...order.map((a, i) => `${i + 1}. \`${a.id}\` (${a.area}${a.network ? ', network' : ''}): \`${a.command}\``),
    '',
    '## Libraries and tests',
    '',
    ...(pipe.libraries || []).map(l => `- ${lnk(l.tool)}: ${l.provides}`),
    ...(pipe.tests || []).map(t => `- ${lnk(t.tool)} (test): ${t.what}`),
    '',
  ].join('\n');
  writeFileSync(join(CW, 'METHODS.md'), out);
  console.log(`wrote METHODS.md: ${acts.length} activities and ${manual.length} hand steps in ${areas.length} areas, ${FAULTS.length} faults`);
}

if (problems.length) { console.error(problems.map(p => '  ' + p).join('\n')); process.exit(1); }
