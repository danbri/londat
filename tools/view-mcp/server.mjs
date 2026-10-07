#!/usr/bin/env node
// view-mcp — an MCP server (stdio) for reconstructing photo views of the Docklands zone on the 3D page
// (magpie/cwplans/docklands). Registered in the repo's .mcp.json as "docklands-view".
//
//   node tools/view-mcp/server.mjs          (Claude Code starts it; it speaks JSON-RPC on stdin/stdout)
//   node tools/view-mcp/test.mjs            (drives it the way a client does, and checks every tool)
//
// Method, error budget and limits: the photo-view-reconstruction skill
// (magpie/cwplans/docklands/skills/photo-view-reconstruction/SKILL.md).
import path from 'node:path';
import { geo, lonlat, landmarks, landmarkById, project, groundPoint, groundAt, solveCamera, sunAt, timeFromSun, camAxes, hfov } from './view-lib.mjs';
import { drawOverlay } from './overlay.mjs';
import { renderView, compare, closeBrowser } from './render.mjs';

const log = (...a) => process.stderr.write(`[view-mcp] ${a.join(' ')}\n`);
const json = v => ({ content: [{ type: 'text', text: JSON.stringify(v, null, 1) }] });
const tmp = n => path.join(process.env.TMPDIR || '/tmp', `docklands-view-${Date.now()}-${n}.png`);

// a camera from the client: focal_px or hfov_deg; defaults for the rest
function cam(c) {
  if (!c || !Array.isArray(c.eye)) throw new Error('camera needs eye [x, y, z] (model metres)');
  const width = c.width || 1200, height = c.height || 800;
  const focal_px = c.focal_px || (c.hfov_deg ? width / 2 / Math.tan(c.hfov_deg * Math.PI / 360) : null);
  if (!focal_px) throw new Error('camera needs focal_px or hfov_deg');
  return { roll_deg: 0, k1: 0, ...c, width, height, focal_px, cx: c.cx ?? width / 2, cy: c.cy ?? height / 2 };
}
function point3(p) {
  if (p.xyz) return p.xyz;
  if (p.id) { const l = landmarkById(p.id); if (!l) throw new Error('unknown landmark ' + p.id); return l.xyz; }
  if (p.lonlat) { const [x, z] = geo(p.lonlat[0], p.lonlat[1]); return [x, p.lonlat[2] ?? groundAt(x, z), z]; }
  throw new Error('a point needs id, xyz or lonlat');
}
const CAMERA = { type: 'object', description: '{ eye:[x,y,z] model metres (x = E-537550, z = -(N-180300), y m OD), heading_deg (grid north, clockwise), pitch_deg (up +), roll_deg (+ = horizon falls to the right), focal_px or hfov_deg, k1?, width, height, cx?, cy? }' };
const POINTS = { type: 'array', items: { type: 'object' }, description: 'points: { id (cwb-xxxx | place:<name>) | xyz:[x,y,z] | lonlat:[lon,lat,alt?] }' };

const TOOLS = [
  { name: 'list_landmarks', description: 'Named 3D points of the model: tower tops (cwb-xxxx, from the LiDAR tower fits) and places (place:<name>, OSM/Wikidata names at ground level). Filter by near [x,z] + radius (m), bbox [x0,z0,x1,z1], kinds (tower-top, place, point), query (name substring). Model metres: x = E-537550, z = -(N-180300), y = m OD.',
    inputSchema: { type: 'object', properties: { near: { type: 'array', items: { type: 'number' } }, near_lonlat: { type: 'array', items: { type: 'number' } }, radius: { type: 'number' }, bbox: { type: 'array', items: { type: 'number' } }, kinds: { type: 'array', items: { type: 'string' } }, query: { type: 'string' }, limit: { type: 'number' } } },
    run: async a => { let near = a.near; if (a.near_lonlat) near = geo(...a.near_lonlat); let L = landmarks({ near, radius: a.radius ?? 500, bbox: a.bbox, kinds: a.kinds }); if (a.query) L = L.filter(l => l.name.toLowerCase().includes(a.query.toLowerCase())); if (near) L.sort((p, q) => Math.hypot(p.xyz[0] - near[0], p.xyz[2] - near[1]) - Math.hypot(q.xyz[0] - near[0], q.xyz[2] - near[1])); return json({ count: L.length, landmarks: L.slice(0, a.limit || 100) }); } },
  { name: 'project', description: 'Project 3D points (landmark ids, xyz or lonlat) through a camera to pixels (null = behind the camera).',
    inputSchema: { type: 'object', properties: { camera: CAMERA, points: POINTS }, required: ['camera', 'points'] },
    run: async a => { const c = cam(a.camera), A = camAxes(c); return json({ hfov_deg: +hfov(c).toFixed(2), points: a.points.map(p => { const q = project(c, point3(p), A); return { ...p, px: q && q.map(v => +v.toFixed(1)), in_frame: !!q && q[0] >= 0 && q[0] <= c.width && q[1] >= 0 && q[1] <= c.height }; }) }); } },
  { name: 'ground_point', description: 'Back-project pixels through a camera to the ground (at height y, default the terrain under a first guess at 3 m OD) and list the named places near each: use it to name what a photo shows once a rough camera exists.',
    inputSchema: { type: 'object', properties: { camera: CAMERA, pixels: { type: 'array', items: { type: 'array', items: { type: 'number' } } }, y: { type: 'number' }, radius: { type: 'number' } }, required: ['camera', 'pixels'] },
    run: async a => { const c = cam(a.camera); return json(a.pixels.map(([u, v]) => { let g = groundPoint(c, u, v, a.y ?? 3); if (g && a.y == null) g = groundPoint(c, u, v, groundAt(g[0], g[2])) || g; if (!g) return { px: [u, v], ground: null, note: 'above the horizon' }; const [lon, lat] = lonlat(g[0], g[2]); return { px: [u, v], ground: g.map(x => +x.toFixed(1)), lonlat: [+lon.toFixed(5), +lat.toFixed(5)], places: landmarks({ near: [g[0], g[2]], radius: a.radius || 250, kinds: ['place', 'tower-top'] }).map(l => ({ id: l.id, d_m: Math.round(Math.hypot(l.xyz[0] - g[0], l.xyz[2] - g[2])) })).sort((p, q) => p.d_m - q.d_m).slice(0, 8) }; })); } },
  { name: 'solve_camera', description: 'Least-squares camera (Levenberg-Marquardt). correspondences: [{ px:[u,v] (v null = x only), id | xyz | lonlat | outline ("water:tidal", "water:<name>", "water:<index>": a pixel anywhere on that shoreline), w?, holdout? }]. horizon: [[u,v],...] pixels on the visible horizon (target: the sea-level dip). initial: a camera guess (eye, heading_deg, pitch_deg, roll_deg, focal_px). free: parameters to fit (default x,y,z,heading_deg,pitch_deg,roll_deg,focal_px; add k1, cx, cy). Returns camera, WGS84 eye, rms, formal sigma, residuals and hold-out residuals.',
    inputSchema: { type: 'object', properties: { image_size: { type: 'array', items: { type: 'number' } }, correspondences: { type: 'array', items: { type: 'object' } }, horizon: { type: 'array', items: { type: 'array', items: { type: 'number' } } }, initial: { type: 'object' }, free: { type: 'array', items: { type: 'string' } } }, required: ['image_size', 'correspondences', 'initial'] },
    run: async a => { const [width, height] = a.image_size, init = cam({ width, height, ...a.initial }); let r = solveCamera({ width, height, correspondences: a.correspondences, horizon: a.horizon || [], initial: init, free: a.free }); r = solveCamera({ width, height, correspondences: a.correspondences, horizon: a.horizon || [], initial: r.camera, free: a.free }); return json(r); } },
  { name: 'overlay', description: 'Draw the model (OSM water outlines blue, rail orange, tower tops and bases yellow, model box red, landmark points) projected through a camera onto a photo; returns the PNG path. The way to see whether a guess or a solve lines up.',
    inputSchema: { type: 'object', properties: { photo: { type: 'string' }, camera: CAMERA, points: { type: 'array', items: { type: 'object' } }, out: { type: 'string' } }, required: ['photo', 'camera'] },
    run: async a => { const c = cam(a.camera), pts = (a.points || []).map(p => ({ ...p, xyz: p.xyz || p.id || p.lonlat ? point3(p) : undefined })); return json({ png: await drawOverlay(a.photo, c, a.out || tmp('overlay'), { points: pts }) }); } },
  { name: 'render_view', description: 'Render the Docklands 3D page headless (SwiftShader WebGL) from a camera, or from a ?view= name (e.g. plane, greenlandday, rotherhithe); t = London time for the sky clock (e.g. 2026-10-05T17:40); style "night" turns Night on. base: the site root (default: this checkout on 127.0.0.1; or https://danbri.github.io/glitchcan-minigam for the live page). Returns the PNG path, console errors and the page projection of the given landmarks. 30 s to 2 min.',
    inputSchema: { type: 'object', properties: { camera: CAMERA, view: { type: 'string' }, t: { type: 'string' }, style: { type: 'string' }, width: { type: 'number' }, height: { type: 'number' }, dpr: { type: 'number' }, base: { type: 'string' }, landmarks: POINTS, out: { type: 'string' } } },
    run: async a => json(await renderView({ camera: a.camera ? cam(a.camera) : null, view: a.view, t: a.t, style: a.style, width: a.width, height: a.height, dpr: a.dpr, base: a.base, landmarks: a.landmarks || [], out: a.out || tmp('render') })) },
  { name: 'compare', description: 'Compare a photo with a render: side-by-side PNG, mean luma (whole, top third, lower two thirds; Rec. 709) and, for correspondences with px, the pixel error of the camera (and of the page projection from render_view when given).',
    inputSchema: { type: 'object', properties: { photo: { type: 'string' }, render: { type: 'string' }, camera: CAMERA, correspondences: { type: 'array', items: { type: 'object' } }, page_projection: { type: 'array', items: { type: 'object' } }, out: { type: 'string' } }, required: ['photo', 'render'] },
    run: async a => json(await compare({ photo: a.photo, render: a.render, camera: a.camera ? cam(a.camera) : null, correspondences: a.correspondences || [], page_projection: a.page_projection || [], out: a.out })) },
  { name: 'sun_at', description: 'Sun (or Moon) azimuth (true, degrees) and altitude at a UTC time (ISO), topocentric, refraction normal (astronomy-engine). Default observer: Canary Wharf.',
    inputSchema: { type: 'object', properties: { time: { type: 'string' }, lat: { type: 'number' }, lon: { type: 'number' }, height_m: { type: 'number' }, body: { type: 'string', enum: ['Sun', 'Moon'] } }, required: ['time'] },
    run: async a => json(sunAt(a.time, a.lat, a.lon, a.height_m, a.body || 'Sun')) },
  { name: 'time_from_sun', description: 'The UTC times on a date (YYYY-MM-DD) when the Sun (or Moon) had a given true azimuth and/or altitude (1-minute steps). Turn a pixel into a direction with project/ground tools first; true = grid + about 1.55 degrees in the zone.',
    inputSchema: { type: 'object', properties: { date: { type: 'string' }, azimuth_deg: { type: 'number' }, altitude_deg: { type: 'number' }, lat: { type: 'number' }, lon: { type: 'number' }, body: { type: 'string', enum: ['Sun', 'Moon'] } }, required: ['date'] },
    run: async a => json(timeFromSun(a)) },
  { name: 'geo', description: 'Convert lon/lat (WGS84) to model metres [x, z] (with the ground height), or model metres to lon/lat.',
    inputSchema: { type: 'object', properties: { lonlat: { type: 'array', items: { type: 'number' } }, xz: { type: 'array', items: { type: 'number' } } } },
    run: async a => { if (a.lonlat) { const [x, z] = geo(a.lonlat[0], a.lonlat[1]); return json({ x: +x.toFixed(1), z: +z.toFixed(1), ground_m_od: +groundAt(x, z).toFixed(1) }); } if (a.xz) { const [lon, lat] = lonlat(...a.xz); return json({ lon: +lon.toFixed(6), lat: +lat.toFixed(6) }); } throw new Error('give lonlat or xz'); } },
];

// ── MCP over stdio: newline-delimited JSON-RPC 2.0 (the pattern of tools/game-mcp/server.mjs) ─────────────
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return;
  try {
    if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : VERSIONS[0], capabilities: { tools: {} }, serverInfo: { name: 'docklands-view', version: '1.0.0' },
      instructions: 'Reconstruct a photo of the Docklands zone on the 3D page: list_landmarks, a rough camera, overlay to check it, ground_point to name things, solve_camera with points, shorelines and the horizon, render_view and compare. Method: the photo-view-reconstruction skill.' } });
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } });
    if (method === 'tools/call') {
      const tool = TOOLS.find(t => t.name === params?.name);
      if (!tool) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `unknown tool: ${params?.name}` } });
      try { return send({ jsonrpc: '2.0', id, result: await tool.run(params.arguments || {}) }); }
      catch (e) { return send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: String(e?.message || e).slice(0, 2000) }] } }); }
    }
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
  } catch (e) { send({ jsonrpc: '2.0', id, error: { code: -32603, message: String(e?.message || e) } }); }
}
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buf += chunk; let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); continue; }
    handle(msg);
  }
});
const quit = async () => { await closeBrowser(); process.exit(0); };
process.stdin.on('end', quit);
process.on('SIGTERM', quit);
log('ready');
