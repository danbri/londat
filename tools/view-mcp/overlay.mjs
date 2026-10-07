// overlay — draw the model (water outlines, tower tops, rail lines, landmark points) projected through a camera onto a
// photo, so a guess can be judged by eye and landmarks read off it. Headless Chromium draws on a <canvas>.
//   node tools/view-mcp/overlay.mjs <photo> <camera.json> <out.png> [points.json]
// Used by the view MCP's `overlay` tool. Skill: photo-view-reconstruction.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO, area, towers, dec, project, camAxes, landmarks } from './view-lib.mjs';

export function chromePath() {
  if (process.env.VIEW_MCP_CHROME) return process.env.VIEW_MCP_CHROME;
  const fs = createRequire(import.meta.url)('node:fs'), root = '/opt/pw-browsers';
  try { for (const d of fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort((a, b) => +b.split('-')[1] - +a.split('-')[1])) { const p = join(root, d, 'chrome-linux/chrome'); if (fs.existsSync(p)) return p; } } catch { }
  return undefined;
}
export function playwright() { return createRequire(join(REPO, 'package.json'))('@playwright/test').chromium; }

// polylines in pixels, clipped to points in front of the camera; a segment is split where a point is behind
function polyPx(cam, A, pts3, closed) {
  const out = []; let cur = [];
  const all = closed ? [...pts3, pts3[0]] : pts3;
  for (const p of all) { const q = project(cam, p, A); if (q && Math.abs(q[0]) < 2e4 && Math.abs(q[1]) < 2e4) cur.push(q.map(v => Math.round(v * 10) / 10)); else { if (cur.length > 1) out.push(cur); cur = []; } }
  if (cur.length > 1) out.push(cur); return out;
}
export function overlayData(cam, { points = [], showLandmarks = true } = {}) {
  const A = camAxes(cam), M = area(), layers = { water: [], rail: [], towers: [], box: [] };
  for (const w of M.water) { const p = dec(w.p), r = []; for (let i = 0; i < p.length; i += 2) r.push([p[i], w.level ?? 2.5, p[i + 1]]); layers.water.push(...polyPx(cam, A, r, true)); }
  for (const l of M.lines) if ((l.k === 'rail' || l.k === 'light_rail') && l.q && !l.tunnel) { const q = dec(l.q, 3), r = []; for (let i = 0; i < q.length; i += 3) r.push([q[i], q[i + 2], q[i + 1]]); layers.rail.push(...polyPx(cam, A, r, false)); }
  for (const t of Object.values(towers())) { const tr = t.tiers?.at(-1); if (!tr) continue; layers.towers.push(...polyPx(cam, A, tr.ring.map(([x, z]) => [x, tr.y1, z]), true), ...polyPx(cam, A, tr.ring.map(([x, z]) => [x, t.base_m_od ?? 5, z]), true)); }
  const E = M.meta.extent, bx = [[E.x0, 3, E.z0], [E.x1, 3, E.z0], [E.x1, 3, E.z1], [E.x0, 3, E.z1]], br = [];
  for (let i = 0; i < 4; i++) for (let k = 0; k < 40; k++) { const a = bx[i], b = bx[(i + 1) % 4]; br.push(a.map((v, j) => v + (b[j] - v) * k / 40)); }
  layers.box.push(...polyPx(cam, A, br, true));
  const marks = [];
  if (showLandmarks) for (const l of landmarks({ kinds: ['tower-top', 'point'] })) { const q = project(cam, l.xyz, A); if (q && q[0] > -50 && q[0] < cam.width + 50 && q[1] > -50 && q[1] < cam.height + 50) marks.push({ q, label: l.id.replace(/^x:/, ''), c: l.kind === 'tower-top' ? '#ff0' : '#0ff' }); }
  for (const p of points) { const q = p.xyz && project(cam, p.xyz, A); if (p.px) marks.push({ q: p.px, label: p.label || p.id || '', c: '#f0f', photo: true }); if (q) marks.push({ q, label: '', c: '#0f0', to: p.px }); }
  return { layers, marks };
}
export async function drawOverlay(photo, cam, out, opts = {}) {
  const data = overlayData(cam, opts), img = readFileSync(photo).toString('base64');
  const browser = await playwright().launch({ headless: true, executablePath: chromePath(), args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: cam.width, height: cam.height } });
    await page.setContent(`<body style="margin:0"><canvas id=c width=${cam.width} height=${cam.height}></canvas></body>`);
    await page.evaluate(async ({ img, data, mime }) => {
      const c = document.getElementById('c'), g = c.getContext('2d'), im = new Image(); im.src = `data:${mime};base64,` + img; await im.decode();
      g.drawImage(im, 0, 0, c.width, c.height); g.lineWidth = 1.2;
      const st = { water: '#39f', rail: '#f80', towers: '#ff0', box: '#f00' };
      for (const [k, ls] of Object.entries(data.layers)) { g.strokeStyle = st[k]; for (const l of ls) { g.beginPath(); l.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); } }
      g.font = '10px sans-serif';
      for (const m of data.marks) { g.fillStyle = m.c; g.strokeStyle = m.c; g.beginPath(); g.arc(m.q[0], m.q[1], m.photo ? 3 : 2, 0, 7); g.fill(); if (m.to) { g.beginPath(); g.moveTo(...m.q); g.lineTo(...m.to); g.stroke(); } if (m.label) g.fillText(m.label, m.q[0] + 4, m.q[1] - 3); }
    }, { img, data, mime: /\.png$/i.test(photo) ? 'image/png' : 'image/jpeg' });
    writeFileSync(out, await page.locator('#c').screenshot());
  } finally { await browser.close(); }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [photo, camF, out, ptsF] = process.argv.slice(2);
  const cam = JSON.parse(readFileSync(camF, 'utf8')), pts = ptsF ? JSON.parse(readFileSync(ptsF, 'utf8')) : [];
  await drawOverlay(photo, cam.camera || cam, out, { points: pts });
  console.log(out);
}
