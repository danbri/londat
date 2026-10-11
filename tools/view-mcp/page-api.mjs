// page-api — the Three.js port's page API (docklands/api.js, describe.js) for the docklands-view MCP server, two ways:
//  * in Node, from the data alone (fast, no browser): describe a view, what is at a point, find places, the camera and
//    share link for a place, the sun at a time. The same code as the page (docklands/describe.js, adapters/uk.js,
//    views.js), so the words match.
//  * in the page, headless (pageCall): one Chromium page of https://danbri.github.io/londat/docklands/ (or this
//    checkout) kept open between calls, so go_to then describe_view work as in a browser; any tool of
//    window.docklands.tools by name.
// Skill: docklands-3d-page, "Three.js port: page API, WebMCP and non-visual access (2026-10-11)".
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { join } from 'node:path';
import { REPO, DOCK, area, sunAt } from './view-lib.mjs';
import { startSite } from './render.mjs';
import { chromePath, playwright } from './overlay.mjs';
import { makeIndex, describeView, featuresAt, findPlaces, viewGeo, timeOf, parseTime, bearing } from '../../docklands/describe.js';
import { ukAdapter } from '../../docklands/adapters/uk.js';
import { VIEWS, VIEW_LABELS } from '../../docklands/views.js';

export const LIVE = 'https://danbri.github.io/londat/docklands/';
let IX = null;
export function index() {
  if (IX) return IX;
  const A = area(), ctx = {}; createContext(ctx);
  try { runInContext(readFileSync(join(DOCK, 'data/under.js'), 'utf8').replace('globalThis.DOCKLANDS_UNDER', 'this.U'), ctx); } catch { /* no under.js */ }
  const keys = JSON.parse(readFileSync(join(DOCK, 'data/building-keys.json'), 'utf8')); keys.ids = keys.ids.split(',');
  const atlas = JSON.parse(readFileSync(join(REPO, 'cwplans/atlas/data/atlas.json'), 'utf8'));
  return (IX = makeIndex(A, { adapter: ukAdapter(A), under: ctx.U || null, keys, atlas }));
}
const D = Math.PI / 180;
// a page camera { tx, ty, tz, dist, yaw, pitch, hfov? } from: a view id, a place name, { lon, lat, range_m, heading_deg, pitch_deg }, or a share hash
export function cameraFor(a = {}) {
  const I = index(), ad = I.adapter; let c = null, found = null;
  if (a.share_hash || a.hash) { const h = {}; for (const p of String(a.share_hash || a.hash).replace(/^.*#/, '').split('&')) { const i = p.indexOf('='); if (i > 0) h[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1)); }
    const v = (h.c || '').split(',').map(Number); if (v.length >= 6 && v.every(isFinite)) c = { tx: v[0], tz: v[1], ty: v[2], dist: v[3], yaw: v[4], pitch: v[5], hfov: /^h[\d.]+$/.test(h.f || '') ? +h.f.slice(1) : null }; }
  if (!c && a.view) { c = VIEWS[a.view]; if (!c) throw new Error('unknown view ' + a.view + '; views: ' + Object.keys(VIEWS).join(', ')); }
  if (!c && a.place) { const v = Object.keys(VIEWS).find(k => k === a.place.toLowerCase() || (VIEW_LABELS[k] || '').toLowerCase() === a.place.toLowerCase());
    if (v) c = VIEWS[v]; else { found = findPlaces(I, a.place, 1)[0]; if (!found) throw new Error(`no place called "${a.place}"`); a = { ...a, lon: found.lon, lat: found.lat, range_m: a.range_m ?? (found.kind === 'building' ? 600 : 900) }; } }
  if (!c && a.lon != null && a.lat != null) {
    const [x, z] = ad.fromLonLat(+a.lon, +a.lat); if (!ad.inBox(x, z, 500)) throw new Error(`outside the model area ${JSON.stringify(ad.bbox)}`);
    const pitch = (a.pitch_deg ?? 30) * D; let yaw = 0.7;
    if (a.heading_deg != null) { const [l2, b2] = ad.toLonLat(x, z - 100), conv = ((bearing(+a.lon, +a.lat, l2, b2) + 540) % 360) - 180; yaw = -((+a.heading_deg - conv) * D); }
    c = { tx: x, tz: z, ty: I.ground(x, z), dist: a.range_m ?? (a.alt_m ? a.alt_m / Math.sin(pitch) : 900), yaw, pitch };
  }
  if (!c) c = VIEWS.cw;
  return { c, found };
}
export function camOf(c, aspect = 1.6) {
  const ce = Math.cos(c.pitch), eye = [c.tx + c.dist * Math.sin(c.yaw) * ce, (c.ty || 0) + c.dist * Math.sin(c.pitch), c.tz + c.dist * Math.cos(c.yaw) * ce];
  return { eye, target: [c.tx, c.ty || 0, c.tz], fovY: c.hfov ? 2 * Math.atan(Math.tan(c.hfov / 2) / aspect) : 45.8 * D, aspect, yaw: c.yaw };
}
export const shareHashOf = (c, t) => `#v=1&c=${[c.tx, c.tz, c.ty || 0].map(v => Math.round(v * 10) / 10).join(',')},${Math.round(c.dist)},${Math.round(c.yaw * 1e4) / 1e4},${Math.round(c.pitch * 1e4) / 1e4}${c.hfov ? '&f=h' + Math.round(c.hfov * 1e4) / 1e4 : ''}${t ? '&t=' + encodeURIComponent(t) : ''}`;
function timeAndSun(a, c) {
  const I = index(), t = a.time ? parseTime(a.time, I.adapter.timeZone) : Date.now(); if (!isFinite(t)) throw new Error('bad time ' + a.time);
  const [lon, lat] = I.adapter.toLonLat(c.tx, c.tz), s = sunAt(new Date(t).toISOString(), lat, lon, 10);
  return { t, sun: { alt: s.altitude_deg, az: s.azimuth_true_deg }, wall: new Intl.DateTimeFormat('sv-SE', { timeZone: I.adapter.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(t)).replace(' ', 'T') };
}
// describe_view / goto in Node: the view, what is in it, and the link that opens it on the live page
export function describeNode(a = {}) {
  const { c, found } = cameraFor(a), cam = camOf(c, (a.width || 1280) / (a.height || 800)), ts = timeAndSun(a, c);
  const link = LIVE + (a.view && !a.share_hash ? `?view=${a.view}${a.time ? '&t=' + encodeURIComponent(ts.wall) : ''}` : shareHashOf(c, a.time ? ts.wall : null));
  const d = describeView(index(), cam, { time: ts.t, sun: ts.sun, share: link, view: a.view || null, maxItems: a.maxItems || 8 });
  d.note = 'Computed from the data without a browser: no occlusion by buildings, no live aircraft or ships, no weather. page_call drives the page itself.';
  if (found) d.found = { name: found.name, kind: found.kind };
  return d;
}
export function featuresNode(a) { const [x, z] = index().adapter.fromLonLat(+a.lon, +a.lat); return featuresAt(index(), x, z); }
export function findNode(a) { return findPlaces(index(), a.query, a.limit || 10).map(({ name, kind, lon, lat, id }) => ({ name, kind, lon, lat, id })); }
export function timeNode(a) { const { c } = cameraFor(a), ts = timeAndSun(a, c); return { ...timeOf(ts.t, index().adapter.timeZone), sun: { altitude_deg: ts.sun.alt, azimuth_true_deg: ts.sun.az }, link: LIVE + `?t=${encodeURIComponent(ts.wall)}` + shareHashOf(c) }; }
export function viewNode(a) { const { c } = cameraFor(a), g = viewGeo(index(), camOf(c)); delete g.frame; delete g.elon; delete g.elat; return { ...g, link: LIVE + shareHashOf(c) }; }

// ---------- the page itself, headless (SwiftShader WebGL 2); one page kept open per (base, query)
let B = null, P = null, PKEY = '';
export async function pageCall({ tool, args = {}, base, query, reset = false, screenshot = null, timeoutMs = 300000 }) {
  const root = (base || await startSite()).replace(/\/$/, ''), q = query ?? 'view=cw&weather=0&layers=placenames,registry,keys,search,ships,planes,under', key = root + '|' + q;
  if (reset || !P || key !== PKEY) {
    if (P) await P.context().close().catch(() => {});
    B ||= await playwright().launch({ headless: true, executablePath: chromePath(), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const ctx = await B.newContext({ viewport: { width: 1280, height: 800 } }); P = await ctx.newPage(); PKEY = key; P.errors = [];
    P.on('pageerror', e => P.errors.push(e.message));
    await P.goto(`${root}/docklands/index.html?${q}&webgl&animate=0`, { timeout: timeoutMs });
    await P.waitForFunction(() => globalThis.docklands && globalThis.__docklands3?.ready, null, { timeout: timeoutMs, polling: 500 });
    await P.evaluate(() => docklands.ready);
  }
  const result = tool ? await P.evaluate(([n, a]) => docklands.callTool(n, a), [tool, args]) : await P.evaluate(() => docklands.tools.map(t => t.name));
  let png = null; if (screenshot) { await P.screenshot({ path: screenshot, timeout: 180000 }); png = screenshot; }
  return { result, page: P.url(), errors: P.errors.slice(-5), png };
}
export async function closePage() { if (B) { await B.close().catch(() => {}); B = null; P = null; PKEY = ''; } }
