// solve — fit a camera to a points file (pixels <-> landmarks, shorelines, horizon) and print the camera, rms and residuals.
//   node tools/view-mcp/solve.mjs magpie/cwplans/docklands/reference/plane-2026-10/points.json [--k1] [--out solution.json]
// Points file format and method: the photo-view-reconstruction skill.
import { readFileSync, writeFileSync } from 'node:fs';
import { solveCamera } from './view-lib.mjs';
const a = process.argv.slice(2), P = JSON.parse(readFileSync(a[0], 'utf8'));
const free = P.free ? [...P.free] : undefined; if (a.includes('--k1') && free) free.push('k1');
let r = solveCamera({ width: P.width, height: P.height, correspondences: P.points, horizon: P.horizon || [], initial: P.initial, free });
r = solveCamera({ width: P.width, height: P.height, correspondences: P.points, horizon: P.horizon || [], initial: r.camera, free });   // restart from the result
const o = a.indexOf('--out'); if (o >= 0) writeFileSync(a[o + 1], JSON.stringify({ solved: new Date().toISOString().slice(0, 10), input: a[0], ...r }, null, 1) + '\n');
console.log(JSON.stringify(r, null, 1));
