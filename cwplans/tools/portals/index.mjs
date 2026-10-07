// walk-portals.mjs index: feeds/portals/index.json, the counts per portal (datasets seen, final states, harvested files
// and their sizes). No network.
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { OUT, today, readOut } from '../walk-portals.mjs';

export default function index() {
  const portals = {};
  for (const p of readdirSync(OUT, { withFileTypes: true })) {
    if (!p.isDirectory()) continue;
    const dir = join(OUT, p.name), t = join(dir, 'triage.json');
    const meta = (existsSync(t) || existsSync(t + '.gz')) ? readOut(t).meta : {};
    const harvested = [];
    for (const k of readdirSync(dir, { withFileTypes: true })) {
      if (!k.isDirectory()) continue;
      for (const f of readdirSync(join(dir, k.name))) if (/\.(geo)?json(\.gz)?$/.test(f)) {
        const j = readOut(join(dir, k.name, f.replace(/\.gz$/, '')));
        harvested.push({ key: k.name, file: `${p.name}/${k.name}/${f}`, bytes: statSync(join(dir, k.name, f)).size, items: j.features ? j.features.length : j.rows ? j.rows.length : j.tables ? j.tables.reduce((a, x) => a + (x.rows || []).length, 0) : null, licence: j.meta?.licence || null });
      }
    }
    const own = readdirSync(dir).filter(f => /\.json(\.gz)?$/.test(f)).reduce((a, f) => a + statSync(join(dir, f)).size, 0);
    portals[p.name] = { portal: meta.portal || p.name, triaged: meta.triaged || null, datasets_seen: meta.datasets_on_portal ?? meta.datasets_seen ?? null, in_scope: meta.in_scope ?? null, counts: meta.counts || null,
      harvested_files: harvested.length, harvested_bytes: harvested.reduce((a, h) => a + h.bytes, 0), catalogue_bytes: own, harvested };
  }
  writeFileSync(join(OUT, 'index.json'), JSON.stringify({ meta: { made: today, tool: 'tools/walk-portals.mjs index', note: 'counts per portal from each triage.json meta; harvested files with size and item count' }, portals }, null, 1) + '\n');
  for (const [k, v] of Object.entries(portals)) console.log(k, v.counts, `${v.harvested_files} files, ${(v.harvested_bytes / 1e6).toFixed(2)} MB harvested, ${(v.catalogue_bytes / 1e6).toFixed(2)} MB catalogue/triage`);
}
