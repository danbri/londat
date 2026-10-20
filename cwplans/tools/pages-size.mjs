#!/usr/bin/env node
// Size of the GitHub Pages site as .github/workflows/pages.yml stages it (the repository less .github, .claude, the hourly
// runs, the SQLite files and third_party/ except three.js), by top folder and by extension, with the deflated size
// (zlib level 6) of the compressible kinds: what packing into deflated archives would save of the 1 GB Pages limit.
// Hosting study: https://github.com/danbri/londat/blob/main/docs/hosting-options.md . Run from the repository root:
//   node cwplans/tools/pages-size.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
const files = execFileSync('git', ['ls-files'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean)
  .filter(p => !/^(\.github|\.claude|node_modules)\//.test(p) && !/^cwplans\/cache\/runs\//.test(p) && !/^cwplans\/cache\/[^/]*\.sqlite$/.test(p) && (!/^third_party\//.test(p) || /^third_party\/three\//.test(p)));
const T = {}, K = {}; let n = 0, raw = 0, def = 0;
for (const p of files) {
  let s; try { s = statSync(p).size; } catch { continue; }
  const ext = (p.match(/\.([a-z0-9]+)$/i) || [, 'none'])[1].toLowerCase();
  const compressible = /^(json|js|mjs|html|md|csv|txt|nq|ttl|geojson|svg|xml|tsv|jsonl|css|ics|kml|glb|merkle|lgi2|ibk5|gbi1|rq|sbm2|bin)$/.test(ext);
  const d = compressible && s > 0 ? deflateRawSync(readFileSync(p), { level: 6 }).length : s;
  const top = p.split('/').slice(0, p.startsWith('cwplans/') ? 2 : 1).join('/');
  for (const [M, k] of [[T, top], [K, ext]]) { const e = M[k] || (M[k] = { files: 0, mb: 0, deflated_mb: 0 }); e.files++; e.mb += s / 1e6; e.deflated_mb += d / 1e6; }
  n++; raw += s; def += d;
}
const show = M => Object.entries(M).sort((a, b) => b[1].mb - a[1].mb).slice(0, 14).map(([k, v]) => `${k.padEnd(28)} ${String(v.files).padStart(6)} ${v.mb.toFixed(1).padStart(8)} MB ${v.deflated_mb.toFixed(1).padStart(8)} MB`).join('\n');
console.log(`site: ${n} files, ${(raw / 1e6).toFixed(1)} MB, deflated ${(def / 1e6).toFixed(1)} MB\n\nby folder\n${show(T)}\n\nby extension\n${show(K)}`);
