#!/usr/bin/env node
// Populate the moglob tile repositories cell by cell: issue https://github.com/danbri/londat/issues/20 (owner, 2026-11-25:
// "please go ahead and set everything up and begin population with data as discussed").
//
//   node cwplans/tools/populate-cells.mjs [--repo moglob-1.1] [--limit <cells>] [--push-mb 150] [--dry]
//
// The tile index cwplans/docklands/data/cells/index.json lists every planned cell (key, repo, expected Overture records)
// and, once built, what it holds. For each cell in state "planned" (in index order, optionally of one repository) this
// tool runs build-cell-tiles.mjs into the clone of its repository (../../<repo>/data/cells/<key>/, beside londat), deletes
// the cell's raw Overture answer (the activity log keeps its SHA-256; a rebuild fetches it again), and writes the cell's
// counts and sizes into the index. The GHSL height zips are shared through cwplans/data/raw/ghsl/ (hard links), so each
// 10-degree tile is downloaded once. Every --push-mb of new data (and at the end) it commits and pushes the repository
// clone, then commits and pushes the index in londat. A cell whose build fails is marked "failed" with the exit code and
// the run goes on. Resumable: only cells in state "planned" are built.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, linkSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const CW = join(dirname(fileURLToPath(import.meta.url)), '..'), ROOT = join(CW, '..'), HOME = join(ROOT, '..');
const argv = process.argv.slice(2), argOf = k => { const i = argv.indexOf('--' + k); return i < 0 ? null : argv[i + 1]; };
// --roads: the roads layer (build-cell-roads.mjs) of each published cell that has none yet, into <repo>/data/roads/
const ROADS = argv.includes('--roads');
const ONLY = argOf('repo'), LIMIT = +(argOf('limit') || Infinity), PUSH_B = +(argOf('push-mb') || 150) * 1e6, DRY = argv.includes('--dry');
const IX = join(CW, 'docklands', 'data', 'cells', 'index.json'), GH = join(CW, 'data', 'raw', 'ghsl'); mkdirSync(GH, { recursive: true });
const ix = JSON.parse(readFileSync(IX, 'utf8')), save = () => writeFileSync(IX, JSON.stringify(ix, null, 1) + '\n');
// one driver at a time (2026-11-25: a queued run started while a run started by hand was going; the two built the same
// cells, deleted each other's raw files and left 78 failed cells): a lock file with the pid, refused while that pid lives
const LOCK = join(CW, 'data', 'raw', 'populate-cells.lock');
if (existsSync(LOCK)) { const pid = +readFileSync(LOCK, 'utf8'); let alive = false; try { process.kill(pid, 0); alive = true; } catch {}
  if (alive) { console.error(`populate-cells: another run is going (pid ${pid}, ${LOCK})`); process.exit(3); } }
if (!DRY) { writeFileSync(LOCK, String(process.pid)); process.on('exit', () => { try { if (+readFileSync(LOCK, 'utf8') === process.pid) unlinkSync(LOCK); } catch {} }); }
const dirSize = d => { let t = 0; for (const f of readdirSync(d, { withFileTypes: true })) t += f.isDirectory() ? dirSize(join(d, f.name)) : statSync(join(d, f.name)).size; return t; };
const git = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const MSG_TAIL = '\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01YA9gEQRX3FdshBiTi6QdLT';
function pushRepo(repo, keys) {
  const dir = join(HOME, repo); if (DRY || !keys.length) return;
  git(dir, 'add', '-A', ROADS ? 'data/roads' : 'data/cells'); if (!git(dir, 'status', '--porcelain').trim()) return;
  git(dir, 'commit', '-q', '-m', ROADS ? `Roads of cells ${keys.join(', ')} (build-cell-roads.mjs)` + MSG_TAIL : `Cells ${keys.join(', ')} (build-cell-tiles.mjs, tier london)` + MSG_TAIL);
  for (let k = 0; k < 4; k++) { try { git(dir, '-c', 'push.negotiate=true', 'push', '-q', 'origin', 'main'); break; } catch (e) { if (k === 3) throw e; execFileSync('sleep', [String(2 ** (k + 2))]); } }
  const head = git(dir, 'rev-parse', '--short', 'HEAD').trim();
  ix.cells.filter(c => keys.includes(c.key)).forEach(c => { if (ROADS) { c.roads.state = 'published'; c.roads.commit = head; } else { c.state = 'published'; c.commit = head; } }); save();
  git(ROOT, 'add', IX); git(ROOT, 'commit', '-q', '-m', `cells index: ${ROADS ? 'roads of ' : ''}${keys.length} cells published to moglob/${repo}` + MSG_TAIL);
  for (let k = 0; k < 4; k++) { try { git(ROOT, 'pull', '-q', '--rebase', 'origin', 'main'); git(ROOT, 'push', '-q', 'origin', 'HEAD:main'); break; } catch (e) { if (k === 3) throw e; execFileSync('sleep', [String(2 ** (k + 2))]); } }
}

// --retry: cells in state failed are built again too
const todo = ix.cells.filter(c => (ROADS ? c.state === 'published' && (!c.roads || (argv.includes('--retry') && c.roads.state === 'failed')) : c.state === 'planned' || (argv.includes('--retry') && c.state === 'failed')) && (!ONLY || c.repo === ONLY)).slice(0, LIMIT);
console.log(`${todo.length} cells to build${ROADS ? ' (roads)' : ''}${ONLY ? ' in ' + ONLY : ''}`);
const pending = new Map();   // repo -> { keys, bytes }
const addPending = (c, bytes) => { const P = pending.get(c.repo) || pending.set(c.repo, { keys: [], bytes: 0 }).get(c.repo); P.keys.push(c.key); P.bytes += bytes; if (P.bytes >= PUSH_B) { pushRepo(c.repo, P.keys); pending.delete(c.repo); } };
if (ROADS) for (const c of todo) {
  const repoDir = join(HOME, c.repo), out = join(repoDir, 'data', 'roads'), raw = join(CW, 'data', 'raw', 'places', 'cell-' + c.key), t0 = Date.now();
  console.log(`== roads ${c.key} (${c.repo})`);
  const r = DRY ? { status: 0 } : spawnSync(process.execPath, [join(CW, 'tools', 'build-cell-roads.mjs'), '--cell', c.key, '--out', out], { stdio: 'inherit' });
  if (existsSync(raw)) for (const f of readdirSync(raw)) if (/^overture-roads-.*\.ndjson$/.test(f)) unlinkSync(join(raw, f));
  const sf = join(out, c.key + '.json');
  if (r.status !== 0 || !existsSync(sf)) { c.roads = { state: 'failed', error: `exit ${r.status}` }; save(); console.log(`   failed: exit ${r.status}`); continue; }
  const S = JSON.parse(readFileSync(sf, 'utf8'));
  c.roads = { state: 'built', files: S.files.length, segments: S.segments, points: S.points, km: Object.values(S.km_by_class).reduce((a, b) => a + b, 0), bytes: S.bytes, built: S.built, minutes: +((Date.now() - t0) / 60000).toFixed(1) }; save();
  console.log(`   ${c.roads.segments} segments, ${c.roads.files} files, ${(c.roads.bytes / 1e6).toFixed(2)} MB`); addPending(c, c.roads.bytes);
}
for (const c of ROADS ? [] : todo) {
  const repoDir = join(HOME, c.repo); if (!existsSync(join(repoDir, '.git'))) throw new Error(`no clone of moglob/${c.repo} at ${repoDir}`);
  const out = join(repoDir, 'data', 'cells', c.key), raw = join(CW, 'data', 'raw', 'places', 'cell-' + c.key); mkdirSync(raw, { recursive: true });
  for (const z of readdirSync(GH)) if (!existsSync(join(raw, z))) linkSync(join(GH, z), join(raw, z));
  const t0 = Date.now(); console.log(`== ${c.key} (${c.repo}, about ${c.est_records} records)`);
  const r = DRY ? { status: 0 } : spawnSync(process.execPath, [join(CW, 'tools', 'build-cell-tiles.mjs'), '--cell', c.key, '--out', out], { stdio: 'inherit' });
  // share a GHSL zip only when it is whole (2026-11-25: a 1.6 MB part of a 50 MB tile reached the cache)
  const whole = f => spawnSync('unzip', ['-tqq', f], { stdio: 'ignore' }).status === 0;
  for (const z of readdirSync(raw)) if (/^GHS_.*\.zip$/.test(z) && !existsSync(join(GH, z)) && whole(join(raw, z))) linkSync(join(raw, z), join(GH, z));
  for (const f of readdirSync(raw)) if (/^overture-.*\.ndjson$/.test(f)) unlinkSync(join(raw, f));   // the raw answer (its hash is in the log)
  if (r.status !== 0 || !existsSync(join(out, 'features.json'))) { c.state = 'failed'; c.error = `exit ${r.status}`; save(); console.log(`   failed: exit ${r.status}`); continue; }
  const fj = JSON.parse(readFileSync(join(out, 'features.json'), 'utf8')), bytes = dirSize(out);
  Object.assign(c, { state: 'built', buildings: fj.blocks.buildings, named: fj.blocks.named, tiles: readdirSync(join(out, 'tiles')).length, bytes, built: new Date().toISOString(), minutes: +((Date.now() - t0) / 60000).toFixed(1) });
  delete c.error; save(); console.log(`   ${c.buildings} buildings, ${c.tiles} tiles, ${(bytes / 1e6).toFixed(2)} MB, ${c.minutes} min`);
  addPending(c, bytes);
}
for (const [repo, P] of pending) pushRepo(repo, P.keys);
const st = {}; for (const c of ix.cells) st[c.state] = (st[c.state] || 0) + 1; console.log('states:', JSON.stringify(st));
