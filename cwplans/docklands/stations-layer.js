// Station models layer of the Docklands 3D page (Layers > Underground > "Station models"): the Blender station box models
// of Canary Wharf and Canada Water from data/stations.json (tools/build-station-mesh.mjs), drawn with the page's own
// program and Mesh format. index.html calls DocklandsStations.init(ctx) and DocklandsStations.draw(0 | 1) in render().
// Skill: blender-station-models, "On the 3D page".
(() => {
let C = null;
const $ = id => document.getElementById(id), on = () => { const e = $('showStations'); return !!e && e.checked; };
const S = { doc: null, solid: null, glass: null, hits: [], loading: null, error: null };
// colour and opacity by element class; opaque classes go to S.solid, the rest to S.glass (drawn blended, no depth write)
const STYLE = {
  platform: ['--plat', 1], escalator: ['#ffd23f', 1], stair: ['#f2dcb0', 1], lift: ['#ececec', 1], entrance: ['#ff6a5c', 1],
  track: ['#4a4f57', 1], tunnel: ['--jub', 1], hall: ['#cbbfae', .32], canopy: ['#e6e6e6', .35], box: ['#e8ecf0', .1]
};
const NAME = { box: 'Station box (structure)', track: 'Track', tunnel: 'Tunnel', platform: 'Platform', hall: 'Ticket hall / concourse',
  escalator: 'Escalator', stair: 'Stairs', lift: 'Lift', canopy: 'Canopy', entrance: 'Entrance' };
const STN = { 'canary-wharf': 'Canary Wharf', 'canada-water': 'Canada Water' };
const rgb = s => { if (s.startsWith('--')) s = getComputedStyle(document.documentElement).getPropertyValue(s).trim(); const n = parseInt(s.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

function build() {
  const solid = new C.Mesh(), glass = new C.Mesh(); S.hits = [];
  for (const o of S.doc.objects) {
    if (o.cls === 'tunnel') continue;   // the page's own tunnels run up to the box faces (better levels than the level stubs)
    const [hex, alpha] = STYLE[o.cls] || ['#cccccc', 1], col = rgb(hex), M = alpha < 1 ? glass : solid, t = o.t, p = o.p;
    const P = k => [t[0] + p[3 * k] / 100, t[1] + p[3 * k + 1] / 100, t[2] + p[3 * k + 2] / 100];
    let top = -1e9, sx = 0, sz = 0;
    for (let k = 0; k < p.length / 3; k++) { const q = P(k); top = Math.max(top, q[1]); sx += q[0]; sz += q[2]; }
    for (let k = 0; k < o.i.length; k += 3) {   // flat shading: one colour per triangle, lit as the page lights everything
      const a = P(o.i[k]), b = P(o.i[k + 1]), c = P(o.i[k + 2]), s = C.shade(col, ...C.norm3(a, b, c));
      M.tri(M.v(...a, s, alpha), M.v(...b, s, alpha), M.v(...c, s, alpha));
    }
    const n = p.length / 3; if (n) S.hits.push({ x: sx / n, y: o.cls === 'box' ? o.top_m_od ?? top : top, z: sz / n, stn: true, card: () => card(o) });
  }
  if (S.solid) S.solid.free(); if (S.glass) S.glass.free();
  S.solid = solid.n ? solid.upload() : null; S.glass = glass.n ? glass.upload() : null;
}
function sync() {
  const has = C.OV.hits.some(h => h.stn);
  if (on() && S.solid && !has) C.OV.hits = C.OV.hits.concat(S.hits);
  if (!on() && has) C.OV.hits = C.OV.hits.filter(h => !h.stn);
}
async function load() {
  if (S.doc || S.loading) return S.loading;
  S.loading = C.loadJSON('data/stations.json').then(d => { S.doc = d; build(); sync(); note(); C.rebuildUnder(); })
    .catch(e => { S.error = e.message; note(); });
  return S.loading;
}
function note() {
  const el = $('stationsNote'); if (!el) return;
  el.textContent = S.error ? `Station models did not load: ${S.error}` : !S.doc ? 'Loading station models…'
    : `Canary Wharf and Canada Water: ${S.doc.objects.length} parts, ${S.doc.meta.triangles.toLocaleString()} triangles. Tap a part for its source and how sure it is.`;
}
function card(o) {
  const rows = [], add = (k, v) => { if (v != null && v !== '') rows.push(`<tr><td>${k}</td><td>${C.esc(v)}</td></tr>`); }, m = v => `${v} m OD`;
  add('Station', STN[o.station] || o.station); add('Part', NAME[o.cls] || o.cls);
  if (o.from_level_m_od != null) add('From / to', `${m(o.from_level_m_od)} to ${m(o.to_level_m_od)}`); else add('Level', o.level_m_od != null ? m(o.level_m_od) : null);
  add('Top', o.top_m_od != null ? m(o.top_m_od) : null); add('How sure', o.uncertainty); add('Basis', o.basis);
  C.ovCard(`<b>${C.esc(o.name)}</b> <span class="small">station model</span><table>${rows.join('')}</table>` +
    `<div class="small" style="margin-top:6px">Model made in Blender on 2026-10-05 (scoping, not survey data). ${C.esc(S.doc.meta.licence)} ` +
    `Files: <a href="${S.doc.meta.source}">danbri/londat am3d/models</a>.</div>`);
}
// cut-outs: the page asks these while it builds its tunnels and OSM indoor floors (index.html buildTunnels, buildUnder)
const hideOn = () => on() && !!S.doc;
const local = (h, x, z) => { const dx = x - h.cx, dz = z - h.cz; return [dx * h.ux + dz * h.uz, -dx * h.uz + dz * h.ux]; };
function inside(x, z) { if (!hideOn()) return false; for (const h of S.doc.hide) { const [s, t] = local(h, x, z); if (Math.abs(s) < h.hl && Math.abs(t) < h.hw) return true; } return false; }
function outside(ax, az, bx, bz) {   // parts [t0, t1] of the segment a-b that lie outside every cut-out (Liang-Barsky in each box's frame)
  if (!hideOn()) return [[0, 1]]; const cut = [];
  for (const h of S.doc.hide) {
    const [sa, ta] = local(h, ax, az), [sb, tb] = local(h, bx, bz); let t0 = 0, t1 = 1, ok = true;
    for (const [p, q] of [[-(sb - sa), sa + h.hl], [sb - sa, h.hl - sa], [-(tb - ta), ta + h.hw], [tb - ta, h.hw - ta]]) {
      if (p === 0) { if (q < 0) { ok = false; break; } continue; }
      const r = q / p; if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    }
    if (ok && t0 < t1) cut.push([t0, t1]);
  }
  cut.sort((a, b) => a[0] - b[0]); const out = []; let s = 0;
  for (const [a, b] of cut) { if (a > s) out.push([s, a]); s = Math.max(s, b); }
  if (s < 1) out.push([s, 1]); return out;
}
const hideKey = () => hideOn() ? 'st' : '';
function stationAt(x, z) { if (!hideOn()) return null; for (const h of S.doc.hide) { const [s, t] = local(h, x, z); if (Math.abs(s) < h.hl && Math.abs(t) < h.hw) return h.station; } return null; }
// OSM level -> m OD inside a station box (the model's floors); level 0 is the page's ground g; fractions (ramps, escalator
// ends) interpolate; null outside the boxes, so the page keeps ground + level x storey there
function levelY(x, z, lv, g) {
  const st = stationAt(x, z), T = st && S.doc.levels[st]; if (!T) return null;
  const at = k => k === 0 ? g : T[k] ? T[k].m_od : null, lo = Math.floor(lv), hi = Math.ceil(lv), a = at(lo), b = at(hi);
  if (a == null || b == null) return null; return lo === hi ? a : a + (b - a) * (lv - lo);
}
function draw(pass) {
  if (!on() || !S.doc) return;
  if (pass === 0) C.drawMesh(S.solid, 1); else C.drawMesh(S.glass, 1);
}
function injectUi() {
  const u = $('showUnder'); if (!u) return;
  u.parentElement.insertAdjacentHTML('afterend', '<label><input type="checkbox" id="showStations" checked> Station models</label>');
  const box = u.closest('.chips') || u.parentElement.parentElement;
  box.insertAdjacentHTML('afterend', '<p class="small" id="stationsNote"></p>');
  $('showStations').onchange = () => { if (on()) load(); sync(); C.rebuildUnder(); };
  const mus = [...document.querySelectorAll('#credits h3')].find(h => /Music and software/.test(h.textContent));
  if (mus) mus.insertAdjacentHTML('beforebegin', `<h3>Station models</h3><ul class="small">
    <li>Canary Wharf and Canada Water station boxes, modelled in Blender (2026-10-05): positions of platforms, halls, escalators,
    stairs, lifts, canopies and tracks from <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> (ODbL);
    layout after TfL's station diagrams (2015 FOI release); levels from TfL FOI-0493-2223 and published sizes.
    <a href="https://github.com/danbri/londat/tree/main/third_party/tfl/am3d/models">Model files and method</a>.</li></ul>`);
}
function init(ctx) {
  C = ctx; injectUi(); note(); if (on()) load();
  setInterval(sync, 1000);   // buildOverlays() replaces OV.hits
}
globalThis.DocklandsStations = { init, draw, load, build, inside, outside, hideKey, levelY, get S() { return S; } };
})();
