#!/usr/bin/env node
// drone-capture.mjs: render the drone flight (drone-flight.mjs) in the Docklands 3D page and write a Gaussian-splat
// training set: images, nerfstudio transforms.json, an initial point cloud (sparse_pc.ply), a COLMAP text model,
// per-frame building visibility (coverage.json), a pose check, preview.mp4 and a contact sheet.
//
//   python3 -m http.server 8765 --bind 127.0.0.1          # from the repo root, in another shell
//   node magpie/cwplans/tools/drone-capture.mjs --run trial --frames 480
//
// Options: --run NAME (folder under magpie/cwplans/data/raw/drone/), --frames N (default 480), --every K (take every
// K-th frame of the 30 fps path; default spreads N frames over the whole path), --size 960x540, --fov 60 (vertical,
// degrees), --ground rgb2008|night2012|intensity2020|s2|none, --points 200000, --path path.json (from drone-flight.mjs
// --out; default: plan it now), --url (page), --quality 0.92, --no-video, --redo (ignore frames already written).
// Resumable: frames already in images/ and frames.jsonl are skipped. Needs ffmpeg for the MP4 and the contact sheet.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { CW, D2R, R2D, ESTATE, ESTATE_POLY, inEstate, NEAR, loadModel, loadRegistry, buildPath, pathJSON, svgPlan, pickFrames, intrinsics, c2w, project, inPoly, dec } from './drone-flight.mjs';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; }, flag = k => argv.includes('--' + k);
const RUN = opt('run', 'run-' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')), OUT = path.join(CW, 'data/raw/drone', RUN);
const NFR = +opt('frames', 480), EVERY = opt('every') ? +opt('every') : null, [W, H] = opt('size', '960x540').split('x').map(Number), FOV = +opt('fov', 60) * D2R;
const GROUND = opt('ground', 'rgb2008'), NPTS = +opt('points', 200000), Q = +opt('quality', .92), URL = opt('url', 'http://127.0.0.1:8765/magpie/cwplans/docklands/?capture');
const MIN_PX = 30;   // a building counts as seen in a frame when at least this many of its pixels are visible
const pad = n => String(n).padStart(5, '0');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

fs.mkdirSync(path.join(OUT, 'images'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'sparse/0'), { recursive: true });
const M = loadModel(), AT = loadRegistry();

// ---------- path and frame choice
let P;
if (opt('path')) { const j = JSON.parse(fs.readFileSync(opt('path'), 'utf8')); P = { fps: j.fps, stats: j.stats, frames: j.frames.map(f => ({ t: f.t, e: f.eye, target: f.target, tag: f.part })) }; }
else { P = buildPath(); if (!fs.existsSync(path.join(OUT, 'path.json')) || flag('redo')) { fs.writeFileSync(path.join(OUT, 'path.json'), JSON.stringify(pathJSON(P))); fs.writeFileSync(path.join(OUT, 'plan.svg'), svgPlan(M, P)); } }
const idx = pickFrames(P, NFR, EVERY);
const cfg = { size: [W, H], fovY: FOV, ground: GROUND, frames: idx.length, every: EVERY || (idx[1] - idx[0]) || 1, pathFrames: P.frames.length, pathLength_m: P.stats.length_m, fps: P.fps };
const cfgFile = path.join(OUT, 'run.json');
if (fs.existsSync(cfgFile) && !flag('redo')) { const old = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); for (const k of ['size', 'fovY', 'ground', 'every', 'pathFrames']) if (JSON.stringify(old[k]) !== JSON.stringify(cfg[k])) { console.error(`run ${RUN} was made with ${k} = ${JSON.stringify(old[k])}, not ${JSON.stringify(cfg[k])}; use another --run or --redo`); process.exit(1); } }
fs.writeFileSync(cfgFile, JSON.stringify({ ...cfg, url: URL, path_stats: P.stats, started: new Date().toISOString() }, null, 1));
log(`run ${RUN}: ${idx.length} frames of ${P.frames.length} (every ${cfg.every}), ${W}x${H}, fov ${opt('fov', 60)} deg, ground ${GROUND} -> ${OUT}`);

// ---------- browser
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(URL);
await page.waitForFunction(() => window.__docklands && window.__docklands.AT && window.__docklands.L.pick, null, { timeout: 180000 });
await page.evaluate(() => window.__docklands.captureMode(true));
if (GROUND !== 'none') { await page.evaluate(g => window.__docklands.setGround(g), GROUND); await page.waitForFunction(g => window.__docklands.ground === g, GROUND, { timeout: 120000 }); }
// The page has no hook for an id (pick) image of the whole frame, so this one draws its pick layer (L.pick: registry index + 1
// as RGB per building, terrain in black) into an own framebuffer with the program and matrix the page has just used.
await page.evaluate(() => {
  const D = window.__docklands, cv = document.getElementById('c'), gl = cv.getContext('webgl');
  window.__dronePick = () => {
    const w = cv.width, h = cv.height, pr = gl.getParameter(gl.CURRENT_PROGRAM), U = n => gl.getUniformLocation(pr, n), aP = gl.getAttribLocation(pr, 'p'), aC = gl.getAttribLocation(pr, 'c');
    // the page has several programs (main, facades, splats); render() ends on the main one, which has 'mono' and no 'u'
    if (!U('mono') || gl.getAttribLocation(pr, 'u') !== -1) throw new Error('the current WebGL program is not the main one; the page changed, see drone-capture.mjs __dronePick');
    let F = window.__droneFB;
    if (!F || F.w !== w || F.h !== h) { F = { w, h, fb: gl.createFramebuffer(), tex: gl.createTexture(), rb: gl.createRenderbuffer() };
      gl.bindTexture(gl.TEXTURE_2D, F.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.bindRenderbuffer(gl.RENDERBUFFER, F.rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, F.fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, F.tex, 0); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, F.rb); window.__droneFB = F; }
    const draw = Mh => { if (!Mh || !Mh.count) return; gl.bindBuffer(gl.ARRAY_BUFFER, Mh.vb); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 16, 0); gl.vertexAttribPointer(aC, 4, gl.UNSIGNED_BYTE, true, 16, 12); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, Mh.ib); gl.uniform1f(U('a'), 1); gl.drawElements(gl.TRIANGLES, Mh.count, gl.UNSIGNED_INT, 0); };
    gl.bindFramebuffer(gl.FRAMEBUFFER, F.fb); gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(true);
    gl.uniform1f(U('cut'), 1e9); gl.uniform1f(U('dim'), 1); if (U('glow')) gl.uniform1f(U('glow'), 0); gl.uniform1f(U('useTex'), 0); gl.uniform1f(U('mono'), 1); draw(D.L.terrain); gl.uniform1f(U('mono'), 0); draw(D.L.pick);
    const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
    return { w, h, px };
  };
  window.__droneFrame = (eye, target, fov, q, wantIds) => {
    D.setEye(eye, target, fov); D.renderNow();
    const url = cv.toDataURL('image/jpeg', q), cam = D.CAM, { w, h, px } = window.__dronePick(), vis = new Map();
    for (let row = 0; row < h; row++) for (let x = 0; x < w; x++) { const o = 4 * (row * w + x), id = (px[o] | (px[o + 1] << 8) | (px[o + 2] << 16)) - 1; if (id < 0) continue; const y = h - 1 - row;
      let v = vis.get(id); if (!v) vis.set(id, v = [id, 0, x, y, x, y]); v[1]++; if (x < v[2]) v[2] = x; if (y < v[3]) v[3] = y; if (x > v[4]) v[4] = x; if (y > v[5]) v[5] = y; }
    let ids = null; if (wantIds) { const a = new Int32Array(w * h); for (let row = 0; row < h; row++) for (let x = 0; x < w; x++) { const o = 4 * (row * w + x); a[(h - 1 - row) * w + x] = (px[o] | (px[o + 1] << 8) | (px[o + 2] << 16)) - 1; } ids = Array.from(a); }
    return { url, cam: { eye: cam.eye, target: cam.target, fovY: cam.fovY, aspect: cam.aspect, w: cam.w, h: cam.h }, vis: [...vis.values()], ids };
  };
});

// ---------- frames (resumable)
const jl = path.join(OUT, 'frames.jsonl'), done = new Map();
if (fs.existsSync(jl) && !flag('redo')) for (const line of fs.readFileSync(jl, 'utf8').split('\n')) if (line.trim()) { const r = JSON.parse(line); if (fs.existsSync(path.join(OUT, r.file))) done.set(r.n, r); }
if (flag('redo')) fs.writeFileSync(jl, '');
log(`${done.size} frames already written`);
const times = [];
for (let n = 1; n <= idx.length; n++) {
  if (done.has(n)) continue;
  const f = P.frames[idx[n - 1]], t0 = Date.now();
  const r = await page.evaluate(([e, t, fov, q]) => window.__droneFrame(e, t, fov, q, false), [f.e, f.target, FOV, Q]);
  if (r.cam.w !== W || r.cam.h !== H) throw new Error(`canvas is ${r.cam.w}x${r.cam.h}, not ${W}x${H}`);
  const file = `images/frame_${pad(n)}.jpg`; fs.writeFileSync(path.join(OUT, file), Buffer.from(r.url.slice(r.url.indexOf(',') + 1), 'base64'));
  const rec = { n, file, src: idx[n - 1], t: f.t, part: f.tag, eye: r.cam.eye, target: r.cam.target, fovY: r.cam.fovY, w: r.cam.w, h: r.cam.h, vis: r.vis.filter(v => v[1] >= 4) };
  fs.appendFileSync(jl, JSON.stringify(rec) + '\n'); done.set(n, rec); times.push(Date.now() - t0);
  if (n % 20 === 0 || n === idx.length) log(`frame ${n}/${idx.length}, ${(times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(2)} s a frame (render, JPEG, pick pass)`);
}
const recs = [...done.values()].sort((a, b) => a.n - b.n);
const K = intrinsics(W, H, recs[0].fovY);

// ---------- transforms.json (nerfstudio) and COLMAP text model
const r6 = v => +v.toFixed(6);
const transforms = {
  camera_model: 'OPENCV', fl_x: r6(K.fl_x), fl_y: r6(K.fl_y), cx: K.cx, cy: K.cy, w: W, h: H, k1: 0, k2: 0, p1: 0, p2: 0,
  ply_file_path: 'sparse_pc.ply',
  frames: recs.map(r => ({ file_path: r.file, transform_matrix: c2w(r.eye, r.target).map(row => row.map(r6)), colmap_im_id: r.n })),
  // not read by nerfstudio: where the data came from
  generator: 'magpie/cwplans/tools/drone-capture.mjs', world: 'model metres: x = E - 537550 (east), y = m above OD (up), z = -(N - 180300) (south); camera-to-world, OpenGL camera (x right, y up, looks along -z)',
  ground: GROUND, fovY_deg: +(recs[0].fovY * R2D).toFixed(4),
};
fs.writeFileSync(path.join(OUT, 'transforms.json'), JSON.stringify(transforms, null, 1));
function quat(m) {   // rotation matrix (rows) -> [w, x, y, z]
  const t = m[0][0] + m[1][1] + m[2][2]; let w, x, y, z;
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; w = s / 4; x = (m[2][1] - m[1][2]) / s; y = (m[0][2] - m[2][0]) / s; z = (m[1][0] - m[0][1]) / s; }
  else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2; w = (m[2][1] - m[1][2]) / s; x = s / 4; y = (m[0][1] + m[1][0]) / s; z = (m[0][2] + m[2][0]) / s; }
  else if (m[1][1] > m[2][2]) { const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2; w = (m[0][2] - m[2][0]) / s; x = (m[0][1] + m[1][0]) / s; y = s / 4; z = (m[1][2] + m[2][1]) / s; }
  else { const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2; w = (m[1][0] - m[0][1]) / s; x = (m[0][2] + m[2][0]) / s; y = (m[1][2] + m[2][1]) / s; z = s / 4; }
  return w < 0 ? [-w, -x, -y, -z] : [w, x, y, z];
}
{ const lines = ['# Image list with two lines of data per image:', '#   IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME', '#   POINTS2D[] as (X, Y, POINT3D_ID)', `# Number of images: ${recs.length}, written by drone-capture.mjs (world = model metres, y up; camera = OpenCV)`];
  for (const r of recs) { const T = c2w(r.eye, r.target), Rcv = [0, 1, 2].map(i => [T[i][0], -T[i][1], -T[i][2]]), Rw2c = [0, 1, 2].map(i => [0, 1, 2].map(j => Rcv[j][i])), e = r.eye, t = Rw2c.map(row => -(row[0] * e[0] + row[1] * e[1] + row[2] * e[2]));
    lines.push([r.n, ...quat(Rw2c).map(v => v.toFixed(9)), ...t.map(v => v.toFixed(6)), 1, path.basename(r.file)].join(' '), ''); }
  fs.writeFileSync(path.join(OUT, 'sparse/0/images.txt'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'sparse/0/cameras.txt'), `# Camera list with one line of data per camera:\n#   CAMERA_ID, MODEL, WIDTH, HEIGHT, PARAMS[]\n# Number of cameras: 1\n1 PINHOLE ${W} ${H} ${K.fl_x.toFixed(6)} ${K.fl_y.toFixed(6)} ${K.cx} ${K.cy}\n`); }

// ---------- initial point cloud: terrain coloured from the ground image, water, building roofs and walls
const pcFile = path.join(OUT, 'sparse_pc.ply');
if (!fs.existsSync(pcFile) || flag('redo')) {
  const ex = recs.reduce((b, r) => ({ x0: Math.min(b.x0, r.eye[0]), x1: Math.max(b.x1, r.eye[0]), z0: Math.min(b.z0, r.eye[2]), z1: Math.max(b.z1, r.eye[2]) }), { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 });
  const OB = { x0: Math.min(ex.x0, NEAR.x0) - 500, x1: Math.max(ex.x1, NEAR.x1) + 500, z0: Math.min(ex.z0, NEAR.z0) - 500, z1: Math.max(ex.z1, NEAR.z1) + 500 };
  // capture mode switches the page to its photo style (photoColour per building, water left to the ground image); the
  // colours below copy index.html (PHOTO_BLD, photoColour) and need updating if the page's palette changes
  const photo = await page.evaluate(() => !document.getElementById('showWalls').checked && !document.getElementById('showUnder').checked);
  const PHOTO_BLD = [[.74, .75, .76], [.62, .66, .70], [.80, .78, .74], [.55, .60, .66], [.70, .68, .64], [.66, .70, .72]];
  const photoColour = i => { const h = ((i * 2654435761) >>> 0) / 4294967296, c = PHOTO_BLD[Math.floor(h * PHOTO_BLD.length)], v = .92 + .16 * (((i * 40503) >>> 0) % 100) / 100; return c.map(x => Math.min(1, x * v)); };
  const cols = await page.evaluate(() => { const g = n => { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16) / 255); }; return { bld: g('--bld'), bldlv: g('--bldlv'), water: g('--water') }; });
  const Lt = (() => { const l = [-.45, .8, -.35], n = Math.hypot(...l); return l.map(v => v / n); })();
  const shade = (c, n) => { const l = Math.hypot(...n) || 1, k = .5 + .5 * Math.max(0, (n[0] * Lt[0] + n[1] * Lt[1] + n[2] * Lt[2]) / l); return c.map(v => v * k); };
  const X = [], C = [], push = (x, y, z, c) => { X.push(x, y, z); C.push(...c.map(v => Math.max(0, Math.min(255, Math.round(v * 255))))); };
  // buildings in the box: area of roofs and walls decides the spacing for about 55% of the budget
  const inBox = b => b.x1 >= OB.x0 && b.x0 <= OB.x1 && b.z1 >= OB.z0 && b.z0 <= OB.z1, near = b => b.x1 >= NEAR.x0 - 200 && b.x0 <= NEAR.x1 + 200 && b.z1 >= NEAR.z0 - 200 && b.z0 <= NEAR.z1 + 200;
  const BL = M.bld.filter(inBox); let area = 0;
  const ringArea = b => { let a = 0; for (let k = 0, m = b.starts[1] - 1; k < b.starts[1]; m = k++) a += b.f[2 * m] * b.f[2 * k + 1] - b.f[2 * k] * b.f[2 * m + 1]; return a / 2; };
  for (const b of BL) { const w = near(b) ? 1 : .2; let per = 0; for (let k = 0, m = b.starts[1] - 1; k < b.starts[1]; m = k++) per += Math.hypot(b.f[2 * k] - b.f[2 * m], b.f[2 * k + 1] - b.f[2 * m + 1]); area += w * (Math.abs(ringArea(b)) + per * (b.y1 - b.y0)); }
  const sp = Math.sqrt(area / (NPTS * .55));
  for (const b of BL) {
    const s = near(b) ? sp : sp / Math.sqrt(.2), col = photo ? photoColour(b.i) : b.s === 1 || b.s === 4 ? cols.bldlv : cols.bld, roof = shade(col.map(c => Math.min(1, c * 1.05)), [0, 1, 0]), sgn = Math.sign(ringArea(b)) || 1;
    const ox = (Math.random() * s), oz = (Math.random() * s);
    for (let x = b.x0 + ox; x <= b.x1; x += s) for (let z = b.z0 + oz; z <= b.z1; z += s) if (inPoly(b, x, z)) push(x, b.y1, z, roof);
    for (let r = 0; r < b.starts.length - 1; r++) for (let k = b.starts[r], m = b.starts[r + 1] - 1; k < b.starts[r + 1]; m = k++) {
      const x0 = b.f[2 * m], z0 = b.f[2 * m + 1], x1 = b.f[2 * k], z1 = b.f[2 * k + 1], l = Math.hypot(x1 - x0, z1 - z0); if (l < .01) continue;
      const wc = shade(col, [z1 - z0, 0, -(x1 - x0)]).map(c => c * .9);
      for (let a = Math.random() * s; a < l; a += s) for (let y = b.y0 + Math.random() * s; y < b.y1; y += s) push(x0 + (x1 - x0) * a / l, y, z0 + (z1 - z0) * a / l, wc);
    }
  }
  const nb = X.length / 3;
  // water polygons (docks at their level, the river at its LiDAR level), then terrain on a grid outside water and buildings
  const WT = M.A.water.map(w => { const f = dec(w.p), nv = f.length / 2; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let k = 0; k < nv; k++) { x0 = Math.min(x0, f[2 * k]); x1 = Math.max(x1, f[2 * k]); z0 = Math.min(z0, f[2 * k + 1]); z1 = Math.max(z1, f[2 * k + 1]); } return { f, nv, starts: [0, ...(w.holes || []), nv], x0, x1, z0, z1, level: w.level }; }).filter(inBox);
  const nearArea = (NEAR.x1 - NEAR.x0 + 400) * (NEAR.z1 - NEAR.z0 + 400), outArea = (OB.x1 - OB.x0) * (OB.z1 - OB.z0) - nearArea, gs = Math.sqrt((nearArea + outArea * .15) / (NPTS * .45));
  const cells = [], waterAt = (x, z) => { for (const w of WT) if (x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1 && inPoly(w, x, z)) return w; return null; }, bldAt = (x, z) => { for (const b of M.near(x, z, 0)) if (inPoly(b, x, z)) return true; return false; };
  for (let z = OB.z0; z <= OB.z1; z += gs) for (let x = OB.x0; x <= OB.x1; x += gs) {
    const inner = x >= NEAR.x0 - 200 && x <= NEAR.x1 + 200 && z >= NEAR.z0 - 200 && z <= NEAR.z1 + 200; if (!inner && Math.random() > .15) continue;
    const jx = x + (Math.random() - .5) * gs, jz = z + (Math.random() - .5) * gs; if (bldAt(jx, jz)) continue;
    const w = photo ? null : waterAt(jx, jz); if (w) { push(jx, w.level + .1, jz, shade(cols.water, [0, 1, 0])); continue; }
    cells.push([jx, M.groundAt(jx, jz), jz]);
  }
  let rgb = null;
  if (['rgb2008', 'night2012', 'intensity2020'].includes(GROUND)) {
    const TX = JSON.parse(fs.readFileSync(path.join(CW, 'docklands/data/tex/textures.json'), 'utf8')), B = TX.box;
    const uv = cells.map(c => [(c[0] - B.x0) / (B.x1 - B.x0), (c[2] - B.z0) / (B.z1 - B.z0)]);
    rgb = await page.evaluate(async ([file, uv]) => { const img = new Image(); img.src = 'data/tex/' + file; await img.decode(); const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; const g = cv.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, cv.width, cv.height).data;
      const out = new Array(uv.length * 3); uv.forEach(([u, v], i) => { const x = Math.max(0, Math.min(cv.width - 1, Math.floor(u * cv.width))), y = Math.max(0, Math.min(cv.height - 1, Math.floor(v * cv.height))), o = 4 * (y * cv.width + x); out[3 * i] = d[o]; out[3 * i + 1] = d[o + 1]; out[3 * i + 2] = d[o + 2]; }); return out; }, [TX.textures[GROUND].file, uv]);
  }
  cells.forEach((c, i) => push(c[0], c[1], c[2], rgb ? [0, 1, 2].map(k => Math.min(1, rgb[3 * i + k] / 255 * 1.35)) : [.38, .41, .40]));
  const n = X.length / 3, head = `ply\nformat binary_little_endian 1.0\ncomment drone-capture.mjs: model surfaces (area.js buildings, LiDAR terrain, water) in model metres, y up\nelement vertex ${n}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n`;
  const buf = Buffer.alloc(n * 15); for (let i = 0; i < n; i++) { buf.writeFloatLE(X[3 * i], 15 * i); buf.writeFloatLE(X[3 * i + 1], 15 * i + 4); buf.writeFloatLE(X[3 * i + 2], 15 * i + 8); buf[15 * i + 12] = C[3 * i]; buf[15 * i + 13] = C[3 * i + 1]; buf[15 * i + 14] = C[3 * i + 2]; }
  fs.writeFileSync(pcFile, Buffer.concat([Buffer.from(head), buf]));
  const pl = ['# 3D point list with one line of data per point:', '#   POINT3D_ID, X, Y, Z, R, G, B, ERROR, TRACK[] as (IMAGE_ID, POINT2D_IDX)', `# Number of points: ${n}, sampled from the model surfaces (no tracks)`];
  for (let i = 0; i < n; i++) pl.push(`${i + 1} ${X[3 * i].toFixed(3)} ${X[3 * i + 1].toFixed(3)} ${X[3 * i + 2].toFixed(3)} ${C[3 * i]} ${C[3 * i + 1]} ${C[3 * i + 2]} 0`);
  fs.writeFileSync(path.join(OUT, 'sparse/0/points3D.txt'), pl.join('\n') + '\n');
  log(`point cloud (${photo ? 'photo style' : 'map colours'}): ${n} points (${nb} on buildings, ${n - nb} terrain and water; spacing ${sp.toFixed(2)} m on buildings near the estate, ${gs.toFixed(2)} m on the ground) in x ${OB.x0.toFixed(0)}..${OB.x1.toFixed(0)}, z ${OB.z0.toFixed(0)}..${OB.z1.toFixed(0)}`);
}

// ---------- coverage: registry buildings in the estate and in the 300 m ring, from the pick pass
const sector = (b, e) => Math.floor((((Math.atan2(e[0] - b.x, -(e[2] - b.z)) * R2D) + 360 + 22.5) % 360) / 45);
const inside = (b, x) => b.x >= x.x0 && b.x <= x.x1 && b.z >= x.z0 && b.z <= x.z1;
const cov = AT.buildings.map((b, k) => ({ k, id: b.id, n: b.n, x: b.x, z: b.z, zone: inEstate(b.x, b.z) ? 'estate' : inside(b, NEAR) ? 'ring' : null, frames: 0, sectors: new Set(), maxPx: 0 })).filter(c => c.zone && AT.buildings[c.k].mi.length);
const byK = new Map(cov.map(c => [c.k, c]));
// The page gives each model building one pick id, its last registry record (regOf); 28 model buildings belong to two records
// (8 Canada Square's seven parts answer as cwb-0418), so a pick id credits every record that shares its model buildings.
const owners = new Map(), last = new Map(), alias = new Map();
AT.buildings.forEach((b, k) => b.mi.forEach(i => { if (!owners.has(i)) owners.set(i, []); owners.get(i).push(k); last.set(i, k); }));
for (const [i, k] of last) { if (!alias.has(k)) alias.set(k, new Set([k])); for (const o of owners.get(i)) alias.get(k).add(o); }
for (const r of recs) { const got = new Map(); for (const v of r.vis) if (v[1] >= MIN_PX) for (const k of alias.get(v[0]) || [v[0]]) got.set(k, Math.max(got.get(k) || 0, v[1]));
  for (const [k, px] of got) { const c = byK.get(k); if (!c) continue; c.frames++; c.sectors.add(sector(c, r.eye)); c.maxPx = Math.max(c.maxPx, px); } }
const summary = zone => { const L = cov.filter(c => c.zone === zone), hist = {}; for (const c of L) hist[c.sectors.size] = (hist[c.sectors.size] || 0) + 1; const fr = L.map(c => c.frames).sort((a, b) => a - b);
  return { buildings: L.length, directions_histogram: hist, under_3_directions: L.filter(c => c.sectors.size < 3).length, never_seen: L.filter(c => !c.frames).length, frames_median: fr[fr.length >> 1] || 0, frames_min: fr[0] || 0 }; };
const coverage = { min_pixels: MIN_PX, direction_sectors: 8, estate_outline: ESTATE_POLY, ring_box: NEAR, estate: summary('estate'), ring: summary('ring'),
  weak: cov.filter(c => c.sectors.size < 3).map(c => ({ id: c.id, name: c.n, zone: c.zone, x: c.x, z: c.z, frames: c.frames, directions: c.sectors.size, max_px: c.maxPx })),
  buildings: cov.map(c => ({ id: c.id, zone: c.zone, frames: c.frames, directions: [...c.sectors].sort(), max_px: c.maxPx })) };
fs.writeFileSync(path.join(OUT, 'coverage.json'), JSON.stringify(coverage, null, 1));
log('coverage, estate:', JSON.stringify(coverage.estate)); log('coverage, ring:', JSON.stringify(coverage.ring));
for (const c of coverage.weak.filter(c => c.zone === 'estate')) log(`  weak (estate): ${c.id} ${c.name || '(no name)'} at ${c.x},${c.z}: ${c.frames} frames, ${c.directions} directions, max ${c.max_px} px`);

// ---------- pose check: project each building's prism with transform_matrix + intrinsics, compare with its pixels in the pick pass
{ const errs = [], rows = [], sel = recs.filter((_, i) => i % Math.max(1, Math.floor(recs.length / 40)) === 0);
  for (const r of sel) { const T = c2w(r.eye, r.target);
    for (const v of r.vis) { const rb = AT.buildings[v[0]]; if (!rb || v[1] < 1500 || rb.mi.length !== 1) continue;
      const b = M.bld[rb.mi[0]], P2 = []; let ok = true;
      for (let k = 0; k < b.starts[1] && ok; k++) for (const y of [b.y0, b.y1]) { const p = project(T, K, [b.f[2 * k], y, b.f[2 * k + 1]]); if (!p) { ok = false; break; } P2.push(p); }
      if (!ok) continue; const bx = [Math.min(...P2.map(p => p.u)), Math.min(...P2.map(p => p.v)), Math.max(...P2.map(p => p.u)), Math.max(...P2.map(p => p.v))];
      if (bx[0] < 3 || bx[1] < 3 || bx[2] > W - 3 || bx[3] > H - 3) continue;
      // pick bbox in pixel-edge coordinates: [x0, y0, x1+1, y1+1]; compare left, top and right (the base can sink into the 20 m terrain)
      const pk = [v[2], v[3], v[4] + 1, v[5] + 1], e = [pk[0] - bx[0], pk[1] - bx[1], pk[2] - bx[2]];
      errs.push(...e.map(Math.abs)); rows.push({ frame: r.n, id: rb.id, name: rb.n, err: e.map(x => +x.toFixed(2)) }); } }
  errs.sort((a, b) => a - b); const q = p => +(errs[Math.floor(errs.length * p)] || 0).toFixed(2);
  const pc = { buildings_checked: rows.length, edges: errs.length, median_px: q(.5), p75_px: q(.75), p90_px: q(.9), note: 'left, top and right edges of each building in the pick pass against the projection of its prism; buildings partly hidden behind others give the large errors', sample: rows.slice(0, 40) };
  fs.writeFileSync(path.join(OUT, 'posecheck.json'), JSON.stringify(pc, null, 1));
  log(`pose check: ${rows.length} buildings, ${errs.length} edges, median ${pc.median_px} px, 75% ${pc.p75_px} px, 90% ${pc.p90_px} px`);
  // overlays: roof outlines of the towers projected with the written poses, drawn on the frames, for a person to look at
  const towers = ['cwb-0413', 'cwb-0417', 'cwb-0424', 'cwb-0451', 'cwb-0577', 'cwb-0590', 'cwb-0582', 'cwb-0585', 'cwb-0658', 'cwb-0659'].map(id => AT.buildings.find(b => b.id === id)).filter(Boolean);
  const pickO = recs.filter(r => r.vis.some(v => v[1] > 4000 && towers.some(t => AT.buildings[v[0]] === t))); const chosen = [0, .25, .5, .75].map(p => pickO[Math.floor(p * (pickO.length - 1))]).filter(Boolean);
  for (const r of chosen) { const T = c2w(r.eye, r.target), polys = [];
    for (const t of towers) for (const mi of t.mi) { const b = M.bld[mi], pts = []; for (let k = 0; k < b.starts[1]; k++) { const p = project(T, K, [b.f[2 * k], b.y1, b.f[2 * k + 1]]); if (p) pts.push([p.u, p.v]); } if (pts.length > 2) polys.push({ name: t.n, pts }); }
    const img = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(OUT, r.file)).toString('base64');
    const url = await page.evaluate(async ([img, polys]) => { const im = new Image(); im.src = img; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); g.strokeStyle = '#ff2bd6'; g.lineWidth = 1.5; g.font = '12px sans-serif'; g.fillStyle = '#ff2bd6';
      for (const p of polys) { g.beginPath(); p.pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.stroke(); g.fillText(p.name, p.pts[0][0] + 3, p.pts[0][1] - 4); } return c.toDataURL('image/jpeg', .9); }, [img, polys]);
    fs.writeFileSync(path.join(OUT, `posecheck_${pad(r.n)}.jpg`), Buffer.from(url.split(',')[1], 'base64')); }
  log(`pose overlays: ${chosen.map(r => `posecheck_${pad(r.n)}.jpg`).join(', ')}`);
}
await browser.close();

// ---------- preview video and contact sheet (ffmpeg)
if (!flag('no-video')) {
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(OUT, 'images/frame_%05d.jpg'), '-frames:v', String(recs.length), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', path.join(OUT, 'preview.mp4')]);
    const k = Math.max(1, Math.floor(recs.length / 48)); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(OUT, 'images/frame_%05d.jpg'), '-vf', `select='not(mod(n\\,${k}))',scale=240:-1,tile=8x6:padding=2:color=black`, '-frames:v', '1', '-q:v', '3', path.join(OUT, 'contact.jpg')]);
    log('wrote preview.mp4 and contact.jpg');
  } catch (e) { log('ffmpeg failed or is missing (apt-get install -y ffmpeg):', e.message.split('\n')[0]); }
}
if (errors.length) log('page errors:', errors.slice(0, 5).join(' | '));
log(`done: ${OUT}`);
