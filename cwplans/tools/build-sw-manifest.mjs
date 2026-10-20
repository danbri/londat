#!/usr/bin/env node
// The hash manifest of the service worker of the 3D page (docklands/sw.js): one SHA-256 (first 16 hex digits) for each
// file the page may read from the site, so the worker serves a cached copy only while its hash is the deployed one, and
// never keeps bytes whose hash differs. Built in the Pages workflow on the staged site (.github/workflows/pages.yml), not
// committed (docklands/sw-manifest.json is in .gitignore). Owner, 2026-10-20: "any GH based Range request optimisation,
// or other perf work, would still be worthwhile as a stopgap". Skill: docklands-3d-page, "Load speed on Pages: the
// service worker".
//   node cwplans/tools/build-sw-manifest.mjs [--root .] [--out <root>/docklands/sw-manifest.json] [--version <commit>]
// - Folders: the app (docklands/), three.js (third_party/three/), the 3D data (cwplans/docklands/), and the few other
//   folders the page reads at start or from its layers (ROOTS below). A file outside them is not cached by the worker
//   (it is read from the network as without the worker): adding a folder here is the only change a new data folder needs.
// - Kinds: the extensions in KINDS; tests, notes and tools (docklands/test/, *.md, *.mjs, *.py) are left out.
// - version: GITHUB_SHA in the workflow (or --version), else "local". The worker prunes its cache when it changes.
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

export const ROOTS = ['docklands/', 'third_party/three/', 'cwplans/docklands/', 'cwplans/data-base.js', 'cwplans/atlas/data/',
  'cwplans/registry/', 'cwplans/feeds/river/', 'cwplans/feeds/live/', 'cwplans/feeds/works/', 'cwplans/feeds/kml/',
  'cwplans/feeds/london-datastore/lds-building.js', 'cwplans/feeds/london-datastore/conservation-areas/',
  'cwplans/feeds/london-datastore/designated-open-space/', 'cwplans/feeds/london-datastore/safeguarded-wharves/',
  'cwplans/feeds/london-datastore/cultural-infrastructure/'];
export const KINDS = /\.(js|json|geojson|glb|gltf|bin|jpg|jpeg|png|webp|svg|css|wasm|kml|gz|zip|html)$/i;
const SKIP = /(^|\/)(test|node_modules|\.git)\/|\.(md|mjs|py|sh)$|^docklands\/(sw\.js|sw-manifest\.json)$/;

export const hash16 = buf => createHash('sha256').update(buf).digest('hex').slice(0, 16);

export function buildManifest(root = '.', { version = process.env.GITHUB_SHA || 'local' } = {}) {
  const files = {};
  const walk = rel => {
    const abs = join(root, rel); if (!existsSync(abs)) return;
    const st = statSync(abs);
    if (st.isDirectory()) { for (const n of readdirSync(abs).sort()) walk(rel.replace(/\/?$/, '/') + n); return; }
    if (!KINDS.test(rel) || SKIP.test(rel)) return;
    files[rel] = hash16(readFileSync(abs));
  };
  for (const r of ROOTS) walk(r.replace(/\/$/, ''));
  return { about: 'Hash manifest of docklands/sw.js: path (from the site root) -> first 16 hex digits of the SHA-256 of the file. Made by cwplans/tools/build-sw-manifest.mjs.', version, built: new Date().toISOString(), files };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv, arg = (k, d) => { const i = a.indexOf(k); return i > 0 ? a[i + 1] : d; };
  const root = arg('--root', '.'), out = arg('--out', join(root, 'docklands/sw-manifest.json'));
  const m = buildManifest(root, { version: arg('--version', process.env.GITHUB_SHA || 'local') });
  const json = JSON.stringify(m);
  writeFileSync(out, json);
  console.log(`sw manifest: ${Object.keys(m.files).length} files, ${json.length} bytes -> ${relative('.', out) || out} (version ${m.version})`);
}
