// render — draw the Docklands 3D page from a camera (headless Chromium, SwiftShader WebGL) and compare it with a photo.
//   node tools/view-mcp/render.mjs <camera.json> <out.png> [--t 2026-10-05T17:40] [--view plane] [--base URL]
// The page is served from this checkout on 127.0.0.1 (or --base, e.g. the live site). Used by the view MCP's render_view
// and compare tools. Skill: photo-view-reconstruction.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO, project, camAxes, landmarkById } from './view-lib.mjs';
import { chromePath, playwright } from './overlay.mjs';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ply': 'application/octet-stream', '.bin': 'application/octet-stream', '.gz': 'application/gzip' };
let site = null;
export function startSite() {
  return site ||= new Promise(ok => {
    const srv = http.createServer((req, res) => {
      const file = path.join(REPO, decodeURIComponent((req.url || '/').split('?')[0]));
      if (!file.startsWith(REPO)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, buf) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(buf); });
    });
    srv.listen(0, '127.0.0.1', () => { srv.unref(); ok(`http://127.0.0.1:${srv.address().port}`); });
  });
}

// the page's orbit camera for a fitted camera: the orbit centre 1.2 km along the line of sight (as eyeView), roll in degrees
export function pageCam(c, D = 1200) {
  const a = c.heading_deg * Math.PI / 180, p = c.pitch_deg * Math.PI / 180, E = c.eye;
  return { tx: E[0] + D * Math.sin(a) * Math.cos(p), ty: E[1] + D * Math.sin(p), tz: E[2] - D * Math.cos(a) * Math.cos(p), yaw: -a, pitch: -p, dist: D,
    hfov: 2 * Math.atan(c.width / 2 / c.focal_px), roll: c.roll_deg || 0 };
}

let B = null;
async function browser() { return B ||= await playwright().launch({ headless: true, executablePath: chromePath(), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); }
export async function closeBrowser() { if (B) { await B.close().catch(() => {}); B = null; } }

// render the page with `camera` (a fitted camera) or `view` (a ?view= name); t = London time for the sky clock
// returns { png path, errors, page_projection: landmark pixels by the page's own matrix }
export async function renderView({ camera, view, t, width, height, dpr = 1, out, base, style, landmarks: lm = [], timeoutMs = 240000 }) {
  width ||= camera?.width || 1195; height ||= camera?.height || 689;
  const root = base || await startSite(), q = new URLSearchParams();
  if (view) q.set('view', view); if (t) q.set('t', t); if (style === 'night') q.set('night', '');
  const url = `${root.replace(/\/$/, '')}/cwplans/docklands/index.html?${q.toString().replace(/=(&|$)/g, '$1')}`;
  const ctx = await (await browser()).newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto(url, { timeout: timeoutMs });
    await page.waitForFunction(() => window.__docklands?.AT && document.getElementById('c'), null, { timeout: timeoutMs, polling: 500 });
    await page.waitForTimeout(4000);   // facades, towers.json and the sky clock arrive after AT
    const pts = lm.map(l => ({ id: l.id || l.name, xyz: l.xyz || landmarkById(l.id)?.xyz })).filter(l => l.xyz);
    const r = await page.evaluate(({ pc, pts }) => {
      const D = window.__docklands;
      if (pc) { const c = D.cam; delete c.eye; delete c.target; delete c.fov; Object.assign(c, pc); }
      D.renderNow(); const png = document.getElementById('c').toDataURL('image/png');
      const M = D.MVP, cv = document.getElementById('c'), w = cv.clientWidth, h = cv.clientHeight, vz = 1;
      const proj = p => { const X = p[0], Y = p[1] * vz, Z = p[2], cw = M[3] * X + M[7] * Y + M[11] * Z + M[15]; return [((M[0] * X + M[4] * Y + M[8] * Z + M[12]) / cw * .5 + .5) * w, (1 - ((M[1] * X + M[5] * Y + M[9] * Z + M[13]) / cw * .5 + .5)) * h]; };
      return { png, proj: pts.map(p => ({ id: p.id, px: proj(p.xyz).map(v => +v.toFixed(1)) })), cam: { ...D.cam }, night: !!D.NIGHT?.on, sky: globalThis.DocklandsSky ? { t: DocklandsSky.t, day: DocklandsSky.day } : null };
    }, { pc: camera ? pageCam(camera) : null, pts });
    out ||= path.join(process.env.TMPDIR || '/tmp', `docklands-view-${Date.now()}.png`);
    fs.writeFileSync(out, Buffer.from(r.png.split(',')[1], 'base64'));
    return { png: out, url, width, height, dpr, errors, page_projection: r.proj, page_cam: r.cam, night: r.night, sky: r.sky };
  } finally { await ctx.close(); }
}

// photo vs render: side-by-side PNG, mean luma of each (Rec. 709, frames scaled to the photo's size), and per-landmark pixel
// errors (photo pixel against the camera's projection, and against the page's own projection when given)
export async function compare({ photo, render, camera, correspondences = [], out, page_projection = [] }) {
  const b = await browser(), page = await b.newPage();
  try {
    const im = f => `data:${/\.png$/i.test(f) ? 'image/png' : 'image/jpeg'};base64,` + fs.readFileSync(f).toString('base64');
    const r = await page.evaluate(async ({ a, b }) => {
      const load = async s => { const i = new Image(); i.src = s; await i.decode(); return i; };
      const A = await load(a), Bm = await load(b), w = A.naturalWidth, h = A.naturalHeight;
      const luma = img => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h); const d = g.getImageData(0, 0, w, h).data; let s = 0, top = 0, bot = 0; for (let i = 0; i < d.length; i += 4) { const y = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; s += y; if (i / 4 / w < h / 3) top += y; else bot += y; } const n = d.length / 4; return { mean: +(s / n).toFixed(3), top_third: +(top / (n / 3)).toFixed(3), lower_two_thirds: +(bot / (n * 2 / 3)).toFixed(3) }; };
      const c = document.createElement('canvas'); c.width = w * 2 + 8; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.drawImage(A, 0, 0, w, h); g.drawImage(Bm, w + 8, 0, w, h);
      return { lp: luma(A), lr: luma(Bm), side: c.toDataURL('image/png'), w, h };
    }, { a: im(photo), b: im(render) });
    out ||= render.replace(/\.png$/, '') + '-side.png';
    fs.writeFileSync(out, Buffer.from(r.side.split(',')[1], 'base64'));
    const A = camera && camAxes(camera), pp = new Map(page_projection.map(p => [p.id, p.px]));
    const rows = correspondences.filter(c => c.px && (c.xyz || c.id)).map(c => {
      const xyz = c.xyz || landmarkById(c.id)?.xyz, m = camera && xyz && project(camera, xyz, A), pg = pp.get(c.id || c.name);
      return { id: c.id || null, name: c.name || null, photo: c.px, camera_model: m && m.map(v => +v.toFixed(1)), err_px: m ? +Math.hypot(m[0] - c.px[0], c.px[1] == null ? 0 : m[1] - c.px[1]).toFixed(1) : null, page: pg || null, page_err_px: pg ? +Math.hypot(pg[0] - c.px[0], c.px[1] == null ? 0 : pg[1] - c.px[1]).toFixed(1) : null };
    });
    return { side_by_side: out, luma: { photo: r.lp, render: r.lr }, landmarks: rows };
  } finally { await page.close(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), opt = k => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : undefined; };
  const cam = a[0] && !a[0].startsWith('--') && a[0] !== '-' ? JSON.parse(fs.readFileSync(a[0], 'utf8')) : null;
  const r = await renderView({ camera: cam?.camera || cam, view: opt('view'), t: opt('t'), base: opt('base'), out: a[1], width: +opt('width') || undefined, height: +opt('height') || undefined, dpr: +opt('dpr') || 1 });
  console.log(JSON.stringify(r, null, 1)); await closeBrowser();
}
