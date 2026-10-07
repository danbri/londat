#!/usr/bin/env node
// Drives tools/view-mcp/server.mjs over stdio the way an MCP client does, and checks every tool's answer against the
// owner's aircraft photo (docklands/reference/plane-2026-10). About 2 minutes (two headless renders).
//   node tools/view-mcp/test.mjs
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), REF = path.join(here, '../../cwplans/docklands/reference/plane-2026-10');
const srv = spawn(process.execPath, [path.join(here, 'server.mjs')], { stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '', nextId = 1; const waiting = new Map();
srv.stdout.setEncoding('utf8');
srv.stdout.on('data', d => { buf += d; let nl; while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl); buf = buf.slice(nl + 1); if (!line.trim()) continue; const m = JSON.parse(line); waiting.get(m.id)?.(m); waiting.delete(m.id); } });
const rpc = (method, params) => new Promise(ok => { const id = nextId++; waiting.set(id, ok); srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const call = async (name, args = {}) => { const r = await rpc('tools/call', { name, arguments: args }); if (r.error) throw new Error(`${name}: ${r.error.message}`); const t = r.result.content[0].text; if (r.result.isError) throw new Error(`${name}: ${t}`); return JSON.parse(t); };
let failures = 0; const check = (ok, msg) => { console.log((ok ? '✔ ' : '✖ ') + msg); if (!ok) failures++; };

try {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  check(init.result?.serverInfo?.name === 'docklands-view', 'initialize');
  const list = await rpc('tools/list', {}); const names = list.result.tools.map(t => t.name);
  check(['list_landmarks', 'project', 'ground_point', 'solve_camera', 'overlay', 'render_view', 'compare', 'sun_at', 'time_from_sun', 'geo'].every(n => names.includes(n)), `tools/list: ${names.join(', ')}`);

  const lm = await call('list_landmarks', { query: 'Newfoundland', kinds: ['tower-top'] });
  check(lm.landmarks[0]?.id === 'cwb-0451' && lm.landmarks[0].height_m_od > 200, `list_landmarks: Newfoundland top ${lm.landmarks[0]?.height_m_od} m OD`);
  const near = await call('list_landmarks', { near_lonlat: [-0.0335, 51.4936], radius: 300, kinds: ['place'] });
  check(near.landmarks.some(l => l.name === 'Greenland Pier'), `list_landmarks near Greenland Pier: ${near.count} places`);

  const P = JSON.parse(readFileSync(path.join(REF, 'points.json'), 'utf8'));
  const sol = await call('solve_camera', { image_size: [P.width, P.height], correspondences: P.points, horizon: P.horizon, initial: P.initial, free: P.free });
  check(sol.rms_px < 6 && Math.abs(sol.camera.eye[1] - 800) < 60 && Math.abs(sol.camera.heading_deg - 223.8) < 1.5, `solve_camera: rms ${sol.rms_px} px, eye ${sol.camera.eye}, heading ${sol.camera.heading_deg}, roll ${sol.camera.roll_deg}`);
  check(sol.holdout.length === 2 && sol.holdout.every(h => h.err_px != null), `solve_camera: hold-outs ${sol.holdout.map(h => h.err_px).join(', ')} px`);
  const cam = sol.camera;

  const pr = await call('project', { camera: cam, points: [{ id: 'cwb-0451' }, { lonlat: [-0.0335, 51.4936] }, { xyz: [0, 0, 5000] }] });
  check(Math.abs(pr.points[0].px[0] - 363) < 12 && Math.abs(pr.points[0].px[1] - 600) < 12, `project: Newfoundland at ${pr.points[0].px} (photo 363, 600)`);
  check(pr.points[1].in_frame, `project: Greenland Pier at ${pr.points[1].px}`);

  const gp = await call('ground_point', { camera: cam, pixels: [[280, 421], [600, 50]] });
  check(gp[0].places.some(p => p.id === 'place:Greenland Pier'), `ground_point: the jetty pixel lands ${gp[0].places[0]?.d_m} m from ${gp[0].places[0]?.id}`);

  const ov = await call('overlay', { photo: path.join(REF, 'evening-thames-from-plane.jpg'), camera: cam, points: [{ id: 'cwb-0451', px: [363, 600] }] });
  check(existsSync(ov.png), `overlay: ${ov.png}`);

  const rv = await call('render_view', { view: 'plane', t: '2026-10-05T17:40', width: P.width, height: P.height, landmarks: [{ id: 'cwb-0451' }, { id: 'cwb-0577' }] });
  check(existsSync(rv.png) && rv.errors.length === 0 && rv.sky?.day === true, `render_view ?view=plane: ${rv.png}, ${rv.errors.length} console errors, day sky ${rv.sky?.day}`);
  const nf = rv.page_projection[0].px; check(Math.abs(nf[0] - 356) < 3 && Math.abs(nf[1] - 596) < 3, `render_view: the page puts Newfoundland at ${nf} (solver about 356, 596)`);
  const rc = await call('render_view', { camera: cam, width: 600, height: 346 });
  check(existsSync(rc.png) && rc.errors.length === 0, `render_view from a camera: ${rc.png}`);

  const cp = await call('compare', { photo: path.join(REF, 'evening-thames-from-plane.jpg'), render: rv.png, camera: cam, correspondences: P.points.filter(p => !p.outline), page_projection: rv.page_projection });
  check(existsSync(cp.side_by_side) && cp.luma.photo.mean > 0.3 && cp.luma.render.mean > 0.3, `compare: luma photo ${cp.luma.photo.mean}, render ${cp.luma.render.mean}; Newfoundland ${cp.landmarks[0].err_px} px`);

  const s = await call('sun_at', { time: '2026-10-05T16:45:00Z' });
  check(s.azimuth_true_deg > 250 && s.azimuth_true_deg < 260 && s.altitude_deg > 3, `sun_at 17:45 BST: az ${s.azimuth_true_deg}, alt ${s.altitude_deg}`);
  const tf = await call('time_from_sun', { date: '2026-10-05', azimuth_deg: 255 });
  check(tf.some(t => t.utc.startsWith('2026-10-05T16:4')), `time_from_sun az 255: ${tf.map(t => t.utc.slice(11, 16)).join(', ')} UTC`);
  const g = await call('geo', { lonlat: [-0.0335, 51.4936] }), g2 = await call('geo', { xz: [g.x, g.z] });
  check(Math.abs(g.x + 900) < 150 && Math.abs(g.z - 1200) < 150 && Math.abs(g2.lon + 0.0335) < 1e-5, `geo: 51.4936 N 0.0335 W (by Greenland Pier) at x ${g.x}, z ${g.z}; back ${g2.lon}, ${g2.lat}`);
} catch (e) { failures++; console.log('✖ ' + e.message); }
srv.stdin.end();
console.log(failures ? `${failures} failed` : 'all passed');
process.exitCode = failures ? 1 : 0;
