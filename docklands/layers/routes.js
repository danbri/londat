// Routes on the walking network (layer "routes") of the Three.js port: the WebGL page's Route tab and press-and-hold,
// ported from index.html loadNet, vY, route (Dijkstra in seconds), describe, vertexEnd, vertexAt, openPress, setEnd,
// markEnds and doRoute. Network: ../cwplans/docklands/data/indoor.js (tools/build-indoor.mjs: OSM ways and TfL step-free
// topology); levels below ground inside the station boxes from data/stations.json (stations-layer.js levelY), while the
// station models layer is shown, as on the WebGL page. Press and hold 550 ms on the model (cancelled by a move of 8 px
// or a second finger): "Route from here" / "Route to here" at the nearest network point on screen (within 70 px, not
// cut away). The route: a bright beam over the network (3.2 m wide, 2 m above the walkway), unlit so it shows by night,
// drawn depth-tested and again faint on top of everything (the WebGL page draws it on top only); like the WebGL page
// it ignores the cut. A small panel opens with the route: ends, distance, minutes, levels, steps, step-free, clear.
// Go > "Show the walking network" (index.html buildWalk, #showWalk; ?walk=1): every link but streets as coloured beams.
// Test hook: __docklands3.layers.routes.api (route(a, b, opts), routeVertices, vertexAt, openPress, clear, last, setWalk, walk).
// Skill: docklands-3d-page, "Three.js port" and "Interface" (press and hold); network: cwplans/docklands/README.md,
// "Walking network and routes".
import { Mesh } from '../build.js';

const KINDS_WALK = /^(footway|street|platform|ramp|indoor)$/;
const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error(src + ' did not load')); document.head.appendChild(s); });
function beam(M, a, b, w, h, col) {   // index.html beam: a box from a to b, w wide and h high
  const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, ox = -dz / l * w / 2, oz = dx / l * w / 2, H = h / 2;
  const P = (q, sx, sy) => [q[0] + ox * sx, q[1] + H * sy, q[2] + oz * sx];
  const a00 = P(a, -1, -1), a10 = P(a, 1, -1), a11 = P(a, 1, 1), a01 = P(a, -1, 1), b00 = P(b, -1, -1), b10 = P(b, 1, -1), b11 = P(b, 1, 1), b01 = P(b, -1, 1);
  M.quad(a01, b01, b11, a11, col); M.quad(a00, a10, b10, b00, col); M.quad(a00, b00, b01, a01, col); M.quad(a10, a11, b11, b10, col);
}
const CSS = `
#rtPanel{position:fixed;left:10px;top:calc(62px + env(safe-area-inset-top,0px));width:min(380px,calc(100vw - 20px));max-height:min(60vh,520px);overflow:auto;background:rgba(16,20,24,.94);border-radius:10px;padding:10px 12px;z-index:5;font-size:13px;box-shadow:0 2px 10px #0008}
#rtPanel[hidden],#rtPress[hidden],#rtToast[hidden]{display:none}
#rtPanel .hd{display:flex;align-items:flex-start;gap:8px}
#rtPanel .hd b{flex:1;font-size:14px;line-height:1.3}
#rtPanel .sum{margin:4px 0;color:#e8ecef}
#rtPanel .acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
#rtPanel button,#rtPress button{min-height:40px;border:1px solid #33404a;background:#1b2229;color:#e8ecef;border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer}
#rtPanel .x{min-height:36px;min-width:36px;padding:0;border:0;background:none;font-size:22px;line-height:1}
#rtPanel ol{margin:6px 0 4px;padding-left:22px}
#rtPanel li{margin:2px 0}
#rtPanel label{display:flex;align-items:center;gap:6px;min-height:40px}
#rtPanel .warn{color:#ffb35c}
#rtPress{position:fixed;z-index:7;display:flex;flex-direction:column;gap:6px;background:rgba(16,20,24,.96);border-radius:10px;padding:8px;box-shadow:0 2px 10px #000a;font-size:12px;color:#9aa4ad}
#rtToast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(64px + env(safe-area-inset-bottom,0px));max-width:calc(100vw - 32px);background:rgba(16,20,24,.95);color:#e8ecef;border-radius:8px;padding:8px 12px;z-index:8;font-size:13px}
.rtEnd{position:absolute;left:0;top:0;padding:2px 7px;border-radius:5px;background:#59ff73;color:#06210c;font:600 12px system-ui,sans-serif;white-space:nowrap;will-change:transform}
@media (max-width:520px){#rtPanel{width:calc(100vw - 64px);max-height:42vh}}
`;

export default {
  id: 'routes', label: null, on: true,
  async init(ctx) {
    const { THREE, camera, renderer, controls, U, qs, draw } = ctx, esc = ctx.esc || (s => String(s));
    const num = (k, d, lo, hi) => { const v = parseFloat(qs.get(k)); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
    const storey = () => num('storey', 4, 2.5, 6);   // index.html par().storey: 4 m (layers/under.js reads the same ?storey=)

    // ---------- the network (index.html loadNet)
    let NET = null, netLoading = null;
    const loadNet = () => netLoading || (netLoading = (async () => {
      if (!globalThis.DOCKLANDS_INDOOR) await loadScript(ctx.WEBGL + 'data/indoor.js');
      const D = globalThis.DOCKLANDS_INDOOR, n = D.nodes.length / 4, adj = Array.from({ length: n }, () => []);
      for (let i = 0; i < D.edges.length; i += 3) { const a = D.edges[i], b = D.edges[i + 1], k = D.meta.kinds[D.edges[i + 2]], ei = i / 3; adj[a].push([b, k, ei]); adj[b].push([a, k, ei]); }
      const liftOf = new Map((D.tfl_lifts || []).map(([ei, id]) => [ei, id]));
      NET = { D, n, adj, liftOf, P: D.places.map((p, i) => ({ i, name: p[0], kind: p[1], lv: p[2], v: p[3], osm: p[4], d: p[5], same: p[6], label: `${p[0]} (${p[1]}, level ${p[2]})` })) };
      return NET;
    })().catch(e => { netLoading = null; throw e; }));

    // ---------- station floors (stations-layer.js stationAt, levelY), used while the station models layer is shown
    let SD = null;
    ctx.loadJSON(ctx.DATA + 'stations.json').then(d => { SD = d; }).catch(e => console.warn('routes: stations.json', e));
    const stationsOn = () => { const L = globalThis.__docklands3?.layers?.stations; return !!(SD && L && L.api && (L.api.object ? L.api.object.visible : L.on)); };
    const local = (h, x, z) => { const dx = x - h.cx, dz = z - h.cz; return [dx * h.ux + dz * h.uz, -dx * h.uz + dz * h.ux]; };
    function levelY(x, z, lv, g) {
      if (!stationsOn()) return null; let st = null;
      for (const h of SD.hide) { const [s, t] = local(h, x, z); if (Math.abs(s) < h.hl && Math.abs(t) < h.hw) { st = h.station; break; } }
      const T = st && SD.levels[st]; if (!T) return null;
      const at = k => k === 0 ? g : T[k] ? T[k].m_od : null, lo = Math.floor(lv), hi = Math.ceil(lv), a = at(lo), b = at(hi);
      if (a == null || b == null) return null; return lo === hi ? a : a + (b - a) * (lv - lo);
    }
    const vX = i => NET.D.nodes[4 * i], vZ = i => NET.D.nodes[4 * i + 1], vL = i => NET.D.nodes[4 * i + 2];
    const vY = (i, st) => { const N = NET.D.nodes, lv = N[4 * i + 2], g = N[4 * i + 3], y = lv < 0 ? levelY(N[4 * i], N[4 * i + 1], lv, g) : null; return y ?? g + lv * st; };

    // ---------- TfL live lift faults (index.html loadLiftFaults): lifts out of service are not used
    let liftFaults = null, liftAt = 0;
    async function loadLiftFaults() {
      if (liftFaults && Date.now() - liftAt < 300000) return liftFaults;
      try { const r = await fetch('https://api.tfl.gov.uk/Disruptions/Lifts/v2'); if (!r.ok) throw new Error('HTTP ' + r.status); const d = await r.json(); liftFaults = new Map(); for (const x of d) for (const id of x.disruptedLiftUniqueIds || []) liftFaults.set(id, x.message); liftAt = Date.now(); }
      catch (e) { liftFaults = liftFaults || new Map(); liftAt = Date.now(); console.warn('routes: TfL lift status did not load: ' + e.message); }
      return liftFaults;
    }

    // ---------- the search: Dijkstra in seconds (index.html route, same weights). Walking 1.3 m/s; stairs 0.5 m/s along
    // the slope; escalators 0.75 m/s; lifts 25 s wait + 4 s a level
    function route(from, to, stepFree, faults) {
      const st = storey(), n = NET.n, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), pk = new Array(n), pe = new Int32Array(n).fill(-1);
      const heap = [[0, from]]; dist[from] = 0;
      const push = x => { heap.push(x); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
      while (heap.length) { const [d, u] = pop(); if (d > dist[u]) continue; if (u === to) break;
        for (const [v, k, ei] of NET.adj[u]) { if (stepFree && (k === 'steps' || k === 'escalator')) continue; if (k === 'lift' && faults && faults.has(NET.liftOf.get(ei))) continue;
          const h = Math.hypot(vX(v) - vX(u), vZ(v) - vZ(u)), dy = Math.abs(vY(v, st) - vY(u, st)), len = Math.hypot(h, dy);
          const c = k === 'lift' ? 25 + 4 * Math.abs(vL(v) - vL(u)) : k === 'steps' ? len / .5 : k === 'escalator' ? len / .75 : len / 1.3;
          if (d + c < dist[v]) { dist[v] = d + c; prev[v] = u; pk[v] = k; pe[v] = ei; push([d + c, v]); } } }
      if (!isFinite(dist[to])) return null;
      const path = []; for (let v = to; v !== -1; v = prev[v]) path.push(v); path.reverse();
      return { path, kinds: path.map(v => pk[v]), eis: path.map(v => pe[v]), secs: dist[to] };
    }
    function describe(r) {   // index.html describe, unchanged
      const out = []; let cur = null;
      for (let j = 1; j < r.path.length; j++) { const a = r.path[j - 1], b = r.path[j], kk = r.kinds[j], k = kk === 'ramp' && Math.round(vL(a)) !== Math.round(vL(b)) ? 'jump' : KINDS_WALK.test(kk) ? 'walk' : kk;
        const m = Math.hypot(vX(b) - vX(a), vZ(b) - vZ(a)), lift = k === 'lift' ? NET.liftOf.get(r.eis[j]) : null;
        if (cur && cur.k === k && (k !== 'walk' || Math.round(vL(b)) === cur.lv) && cur.lift === lift) { cur.m += m; cur.to = vL(b); }
        else { if (cur) out.push(cur); cur = { k, m, from: vL(a), to: vL(b), lv: Math.round(vL(b)), lift }; } }
      if (cur) out.push(cur);
      const lvName = l => `level ${l}`, conn = { lift: 'Lift', escalator: 'Escalator', steps: 'Stairs' };
      return out.filter(s => s.m > 2 || s.k !== 'walk').map(s => s.k === 'walk' ? `Walk ${Math.round(s.m)} m on ${lvName(s.lv)}`
        : s.k === 'jump' ? `Change from ${lvName(Math.round(s.from))} to ${lvName(Math.round(s.to))} (OSM joins the two levels here without mapping stairs, a lift or a ramp)`
        : Math.round(s.from) === Math.round(s.to) ? `${conn[s.k]}${s.lift ? ' ' + s.lift.replace(/^[A-Z0-9]+-Lift-/, '') + ' (TfL)' : ''} (${Math.round(s.m)} m; ${s.lift ? 'TfL gives both ends the same level' : 'OSM gives no level change'})` : `${conn[s.k]}${s.lift ? ' ' + s.lift.replace(/^[A-Z0-9]+-Lift-/, '') + ' (TfL)' : ''} from ${lvName(Math.round(s.from))} to ${lvName(Math.round(s.to))}`);
    }
    const findPlace = (q, near) => { q = String(q).trim().toLowerCase(); if (!q) return null; const exact = NET.P.find(p => p.label.toLowerCase() === q); if (exact) return exact;
      let m = NET.P.filter(p => p.name.toLowerCase() === q); if (!m.length) m = NET.P.filter(p => p.name.toLowerCase().includes(q)); if (!m.length) return null;
      if (near) m.sort((a, b) => Math.hypot(vX(a.v) - vX(near.v), vZ(a.v) - vZ(near.v)) - Math.hypot(vX(b.v) - vX(near.v), vZ(b.v) - vZ(near.v))); return m[0]; };
    // the name of a network point: the nearest named place on the same level within 40 m (index.html vertexEnd)
    function vertexEnd(v) {
      let best = null, bd = 40; for (const p of NET.P) { if (Math.round(p.lv) !== Math.round(vL(v))) continue; const d = Math.hypot(vX(p.v) - vX(v), vZ(p.v) - vZ(v)); if (d < bd) { bd = d; best = p; } }
      const lv = Math.round(vL(v)), name = best ? (bd < 8 ? best.name : `near ${best.name}`) : `walkway on level ${lv}`;
      return { v, name, kind: 'point', lv, same: true, d: 0, label: `${name} (level ${lv}, picked on the model)` };
    }
    const placeEnd = p => ({ v: p.v, name: p.name, kind: p.kind, lv: p.lv, same: p.same, d: p.d, label: p.label });
    // the nearest network point to a screen point (CSS px in the canvas), among those not cut away, within 70 px
    const tv = new THREE.Vector3();
    function vertexAt(cx, cy) {
      const el = renderer.domElement, w = el.clientWidth, h = el.clientHeight, st = storey(), cut = U.cut.value, N = NET.D.nodes; let best = -1, bd = 70 * 70;
      camera.updateMatrixWorld();
      for (let i = 0; i < NET.n; i++) { const y = vY(i, st); if (y > cut) continue;
        tv.set(N[4 * i], y, N[4 * i + 1]).applyMatrix4(camera.matrixWorldInverse); if (tv.z >= 0) continue; tv.applyMatrix4(camera.projectionMatrix);
        const sx = (tv.x * .5 + .5) * w - cx, sy = (1 - (tv.y * .5 + .5)) * h - cy, d = sx * sx + sy * sy; if (d < bd) { bd = d; best = i; } }
      return best;
    }
    // the nearest point on a level (or any level) to x, z: for the test hook and typed coordinates
    function vertexNear(x, z, lv) { let best = -1, bd = Infinity; for (let i = 0; i < NET.n; i++) { if (lv != null && Math.round(vL(i)) !== Math.round(lv)) continue; const d = Math.hypot(vX(i) - x, vZ(i) - z); if (d < bd) { bd = d; best = i; } } return best; }

    // ---------- drawing: one geometry, two materials (depth-tested, and faint on top so the part below ground shows)
    const col = new THREE.Color().setRGB(.35, 1, .45, THREE.SRGBColorSpace);
    const matA = new THREE.MeshBasicNodeMaterial({ color: col, transparent: true, opacity: .95, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const matB = new THREE.MeshBasicNodeMaterial({ color: col, transparent: true, opacity: .4, side: THREE.DoubleSide, toneMapped: false, depthTest: false, depthWrite: false });
    const group = new THREE.Group(); group.name = 'routes';
    // new meshes for each route: a mesh first drawn with an empty geometry keeps a render object with no "position" in
    // WebGPURenderer (r186), and a geometry swapped in later is not drawn
    let meshA = null, meshB = null;
    function setGeometry(G) {
      if (meshA) { group.remove(meshA, meshB); meshA.geometry.dispose(); meshA = meshB = null; }
      if (G) { meshA = new THREE.Mesh(G, matA); meshB = new THREE.Mesh(G, matB); meshA.renderOrder = 20; meshB.renderOrder = 21; meshA.name = 'routes:ribbon'; meshB.name = 'routes:xray'; group.add(meshA, meshB); }
      draw();
    }

    // ---------- UI: panel, press menu, toast, end labels
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    const panel = document.createElement('section'); panel.id = 'rtPanel'; panel.hidden = true; panel.setAttribute('aria-label', 'Route'); panel.setAttribute('aria-live', 'polite');
    const press = document.createElement('div'); press.id = 'rtPress'; press.hidden = true; press.setAttribute('role', 'menu');
    const toastEl = document.createElement('div'); toastEl.id = 'rtToast'; toastEl.hidden = true; toastEl.setAttribute('role', 'status');
    document.body.append(panel, press, toastEl);
    const labHost = document.getElementById('labels') || document.body;
    const endEls = ['A', 'B'].map(t => { const e = document.createElement('div'); e.className = 'rtEnd'; e.hidden = true; e.dataset.end = t; labHost.appendChild(e); return e; });
    let toastT = 0; const toast = t => { toastEl.textContent = t; toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, 3500); };

    const ends = { from: null, to: null }; let stepFree = false, last = null, steps = false;
    function placeEnds() {   // each frame: the A and B labels over their points
      const W = innerWidth, H = innerHeight, st = NET ? storey() : 4;
      [ends.from, ends.to].forEach((e, k) => { const el = endEls[k]; if (!e || !NET) { el.hidden = true; return; }
        tv.set(vX(e.v), vY(e.v, st) + 3, vZ(e.v)).project(camera); const x = (tv.x + 1) / 2 * W, y = (1 - tv.y) / 2 * H, vis = tv.z < 1 && x > -50 && x < W + 50 && y > 0 && y < H;
        el.hidden = !vis; if (vis) { el.textContent = `${k ? 'B' : 'A'} ${e.name}`; el.style.transform = `translate(${x | 0}px,${y | 0}px) translate(-50%,-100%)`; } });
    }
    ctx.onFrame(placeEnds);

    function render() {
      if (!ends.from && !ends.to) { panel.hidden = true; return; }
      panel.hidden = false;
      const hd = (t) => `<div class="hd"><b>${t}</b><button type="button" class="x" data-a="clear" aria-label="Clear the route">&times;</button></div>`;
      const sf = `<label><input type="checkbox" data-a="sf"${stepFree ? ' checked' : ''}> Step-free (lifts and ramps only)</label>`;
      if (!last) {
        const one = ends.from || ends.to;
        panel.innerHTML = hd(`${ends.from ? 'From' : 'To'}: ${esc(one.name)}`) + `<div class="small">${ends.from ? 'Now press and hold where you want to go.' : 'Now press and hold where you start.'} Level ${esc(one.lv)}.</div>` + sf;
      } else if (!last.r) {
        panel.innerHTML = hd(`No route`) + `<div class="small">From ${esc(ends.from.label)} to ${esc(ends.to.label)}${stepFree ? ' without stairs or escalators' : ''}: the mapped network has no link. The OSM network has gaps below ground.${[ends.from, ends.to].some(p => p.kind === 'station point') ? ' TfL station points are reached only through TfL\'s step-free lifts and paths; for stairs or escalators, choose an OSM platform.' : ''}</div>` + sf + `<div class="acts"><button type="button" data-a="swap">Swap ends</button></div>`;
      } else {
        const L = last, under = L.lowY < L.groundAtLow - 3 && globalThis.__docklands3?.layers?.under?.api?.setCut;
        const warn = [ends.from, ends.to].filter(p => !p.same).map(p => `${esc(p.name)} has no mapped corridor on level ${esc(p.lv)}; the route uses the nearest mapped point (${esc(p.d)} m away).`);
        const near = L.faults.length ? `<div class="small warn">Lifts out of service now (TfL live feed), not used: ${L.faults.map(([id, m]) => `${esc(id)}: ${esc(m)}`).join(' · ')}</div>` : '';
        panel.innerHTML = hd(`${esc(ends.from.name)} → ${esc(ends.to.name)}`) +
          `<div class="sum">${Math.round(L.metres)} m · about ${L.minutes} min · levels ${L.levels.join(' → ')}${stepFree ? ' · step-free' : ''}</div>` +
          `<div class="acts"><button type="button" data-a="steps" aria-expanded="${steps}">${steps ? 'Hide' : 'Show'} ${L.steps.length} steps</button><button type="button" data-a="fit">Show all</button>${under ? '<button type="button" data-a="under">Look below ground</button>' : ''}<button type="button" data-a="swap">Swap</button></div>` +
          (steps ? `<ol>${L.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : '') + sf +
          (warn.length ? `<div class="small warn">${warn.join(' ')}</div>` : '') + near +
          (!steps ? '' : `<div class="small">OpenStreetMap walking network (ODbL); station lifts and levels: TfL step-free topology (Powered by TfL Open Data). Times: walking 1.3 m/s, stairs 0.5 m/s, escalators 0.75 m/s, lifts 25 s wait + 4 s a level. Heights are approximate (ground + level × ${storey()} m; station floors from the station models).</div>`);
      }
    }
    panel.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
      if (a === 'clear') clear();
      else if (a === 'steps') { steps = !steps; render(); }
      else if (a === 'fit' && last && last.r) fit(last.r.path);
      else if (a === 'swap') { [ends.from, ends.to] = [ends.to, ends.from]; run(); }
      else if (a === 'under' && last) { const api = globalThis.__docklands3.layers.under.api; api.setCut(Math.round(last.lowY + storey() + 2)); api.showGauge(true); }
    });
    panel.addEventListener('change', e => { if (e.target.dataset.a === 'sf') { stepFree = e.target.checked; run(); } });

    function fit(path) {   // index.html doRoute: centre on the route, distance 1.6 x its extent (250 m at least), same yaw and pitch
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const v of path) { x0 = Math.min(x0, vX(v)); x1 = Math.max(x1, vX(v)); z0 = Math.min(z0, vZ(v)); z1 = Math.max(z1, vZ(v)); }
      const dir = camera.position.clone().sub(controls.target).normalize(), dist = Math.max(250, 1.6 * Math.hypot(x1 - x0, z1 - z0));
      controls.target.set((x0 + x1) / 2, 0, (z0 + z1) / 2); camera.position.copy(controls.target).addScaledVector(dir, dist); controls.update(); draw();
    }
    function clear() { ends.from = ends.to = null; last = null; setGeometry(null); render(); placeEnds(); draw(); }

    // ---------- find and draw (index.html doRoute)
    async function run(opts = {}) {
      if (!ends.from || !ends.to) { last = null; setGeometry(null); render(); draw(); return null; }
      await loadNet(); const faults = opts.faults !== undefined ? opts.faults : await loadLiftFaults();
      const r = route(ends.from.v, ends.to.v, stepFree, faults), st = storey();
      const ours = new Set(NET.liftOf.values()), fl = faults ? [...faults.entries()].filter(([id]) => ours.has(id)) : [];
      if (!r) { last = { r: null, faults: fl }; setGeometry(null); render(); draw(); return last; }
      const M = new Mesh(), c = [.35, 1, .45];
      for (let j = 1; j < r.path.length; j++) { const a = r.path[j - 1], b = r.path[j]; beam(M, [vX(a), vY(a, st) + 2, vZ(a)], [vX(b) + .01, vY(b, st) + 2, vZ(b)], 3.2, 1.6, c); }
      setGeometry(M.geometry());
      const metres = r.path.slice(1).reduce((s, v, j) => s + Math.hypot(vX(v) - vX(r.path[j]), vZ(v) - vZ(r.path[j])), 0);
      const levels = []; for (const v of r.path) { const l = Math.round(vL(v)); if (levels.at(-1) !== l) levels.push(l); }
      let lowY = Infinity, lowV = r.path[0]; for (const v of r.path) { const y = vY(v, st); if (y < lowY) { lowY = y; lowV = v; } }
      last = { r, metres, secs: r.secs, minutes: Math.max(1, Math.round(r.secs / 60)), steps: describe(r), levels, faults: fl, lowY, groundAtLow: ctx.groundAt(vX(lowV), vZ(lowV)), from: ends.from, to: ends.to, stepFree };
      if (opts.fit !== false) fit(r.path);
      render(); draw(); return last;
    }
    function setEnd(which, e) { ends[which] = e; last = null; if (ends.from && ends.to) return run(); render(); placeEnds(); draw(); toast(which === 'from' ? 'Start set. Now press and hold where you want to go.' : 'End set. Now press and hold where you start.'); return null; }

    // ---------- press and hold on the model: 550 ms, cancelled by a move of 8 px or a second finger. The page's tap
    // (main.js) needs a release within 500 ms, so the release of a hold opens no record card.
    // A busy main thread (a slow GPU, software rendering) can run the timer before the queued moves: a move of more than
    // 8 px while the same finger is still down also closes a menu that has opened, and a cancelled hold opens none.
    const el = renderer.domElement, ptrs = new Set(); let holdT = 0, holdAt = null, holdN = 0;
    const hidePress = () => { press.hidden = true; };
    const cancelHold = () => { clearTimeout(holdT); if (holdAt) { holdAt = null; holdN++; } };
    el.addEventListener('pointerdown', e => { hidePress(); cancelHold(); ptrs.add(e.pointerId); if (ptrs.size > 1 || e.button > 0) return; const at = holdAt = [e.clientX, e.clientY], n = ++holdN; holdT = setTimeout(() => { if (holdAt === at) openPress(at[0], at[1], () => n === holdN); }, 550); });
    el.addEventListener('pointermove', e => { if (holdAt && Math.hypot(e.clientX - holdAt[0], e.clientY - holdAt[1]) > 8) { cancelHold(); hidePress(); } });
    for (const t of ['pointerup', 'pointercancel']) el.addEventListener(t, e => { ptrs.delete(e.pointerId); if (holdAt && Math.hypot(e.clientX - holdAt[0], e.clientY - holdAt[1]) > 8) hidePress(); clearTimeout(holdT); holdAt = null; });
    el.addEventListener('contextmenu', e => { if (e.pointerType !== 'mouse') e.preventDefault(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hidePress(); });
    async function openPress(px, py, still = () => true) {
      try { await loadNet(); } catch (e) { toast(e.message); return null; } if (!still()) return null;
      const r = el.getBoundingClientRect(), v = vertexAt(px - r.left, py - r.top);
      if (v < 0) { toast('No mapped walkway near that point. Zoom in, or open the depth gauge to look below ground.'); return null; }
      const e = vertexEnd(v); if (navigator.vibrate) try { navigator.vibrate(15); } catch { /* not allowed */ }
      press.innerHTML = `<div style="padding:2px 6px">${esc(e.name)}, level ${e.lv}</div><button type="button" role="menuitem" data-k="from">Route from here</button><button type="button" role="menuitem" data-k="to">Route to here</button>`;
      press.querySelectorAll('button').forEach(b => b.onclick = () => { hidePress(); setEnd(b.dataset.k, e); });
      press.hidden = false; const mw = press.offsetWidth, mh = press.offsetHeight;
      press.style.left = Math.max(8, Math.min(innerWidth - mw - 8, px - mw / 2)) + 'px'; press.style.top = Math.max(8, Math.min(innerHeight - mh - 70, py - mh - 16)) + 'px';
      return e;
    }

    // ---------- test hook: an end is a vertex index, a place name (findPlace), or [x, z] / [x, z, level] (nearest point)
    async function resolve(a, near) {
      await loadNet();
      if (typeof a === 'number') return vertexEnd(a);
      if (typeof a === 'string') { const p = findPlace(a, near); return p ? placeEnd(p) : null; }
      if (Array.isArray(a)) { const v = vertexNear(a[0], a[1], a[2]); return v < 0 ? null : vertexEnd(v); }
      return a && a.v != null ? a : null;
    }
    // ---------- "Show the walking network" (index.html buildWalk and the showWalk checkbox): every link but streets as a
    // beam 0.6 m above its points (lifts 2.5 m square, footways 1 m wide, others 1.6 m; 0.5 m high), coloured by kind
    // (index.html KCOL), lifts out of service now (TfL live feed) red and 4 m; heights from vY (station floors while the
    // station models layer is shown, else ground + level x storey). Unlit, so it shows by night; cut away above U.cut like
    // the model. Rebuilt when the storey height, the station models or the lift faults change. ?walk=1 shows it at load.
    const KCOL = { street: [.42, .45, .48], footway: [.75, .78, .80], indoor: [1, .37, .64], steps: [1, .6, .2], escalator: [1, .85, .2], lift: [.9, .9, .92], platform: [1, .54, .24], ramp: [.7, .5, 1] };
    const { Fn, If, Discard, attribute, positionWorld, sRGBTransferEOTF } = await import('three/tsl');
    const walkMat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, toneMapped: false });
    walkMat.colorNode = Fn(() => { If(positionWorld.y.greaterThan(U.cut), () => { Discard(); }); return sRGBTransferEOTF(attribute('color', 'vec3')); })();
    let walkOn = ctx.flag('walk', false), walkMesh = null, walkKey = '', walkBusy = false;
    const walkNote = ctx.ui.note('Walking network: tick to load it (OpenStreetMap, ODbL; TfL step-free topology).', { tab: 'go' });
    function buildWalk() {
      const st = storey(), key = `${walkOn}|${st}|${stationsOn()}|${liftFaults ? liftFaults.size : -1}`; if (key === walkKey || !NET) return; walkKey = key;
      if (walkMesh) { group.remove(walkMesh); walkMesh.geometry.dispose(); walkMesh = null; }
      if (!walkOn) { draw(); return; }
      const M = new Mesh(), E = NET.D.edges, K = NET.D.meta.kinds; let broken = 0;
      for (let i = 0; i < E.length; i += 3) { const a = E[i], b = E[i + 1], k = K[E[i + 2]]; if (k === 'street') continue;
        const bad = k === 'lift' && liftFaults && liftFaults.has(NET.liftOf.get(i / 3)), c = bad ? [1, .15, .15] : KCOL[k]; if (bad) broken++;
        const w = k === 'lift' ? (bad ? 4 : 2.5) : k === 'footway' ? 1 : 1.6; beam(M, [vX(a), vY(a, st) + .6, vZ(a)], [vX(b) + (k === 'lift' ? .01 : 0), vY(b, st) + .6, vZ(b)], w, k === 'lift' ? w : .5, c); }
      walkMesh = new THREE.Mesh(M.geometry(), walkMat); walkMesh.name = 'routes:walk'; walkMesh.renderOrder = 19; group.add(walkMesh);
      const m = NET.D.meta;
      walkNote.textContent = `Walking network (OSM): ${m.counts.vertices.toLocaleString('en-GB')} points, ${m.counts.by_kind.steps} stair, ${m.counts.by_kind.escalator} escalator and ${m.counts.by_kind.lift} lift links on levels ${m.counts.levels.join(', ')}; ${m.islands.count} unconnected parts (largest ${m.islands.largest.toLocaleString('en-GB')} points). Colours: grey footways, pink indoor, orange stairs and platforms, yellow escalators, white lifts, violet ramps, red lifts out of service now (TfL${liftFaults && liftAt ? '' : ', not loaded'}: ${broken}). Streets are not drawn.`;
      draw();
    }
    async function setWalk(v) {
      walkOn = v; if (walkCb) walkCb.checked = v; if (!v) { buildWalk(); return; }
      if (walkBusy) return; walkBusy = true; walkNote.textContent = 'Loading the walking network…';
      try { await loadNet(); await loadLiftFaults(); } catch (e) { walkNote.textContent = 'The walking network did not load: ' + e.message; walkOn = false; if (walkCb) walkCb.checked = false; walkBusy = false; return; }
      walkBusy = false; walkKey = ''; buildWalk();
    }
    const walkCb = ctx.ui.toggle('Show the walking network', walkOn, setWalk, { tab: 'go' });
    walkNote.parentNode.insertBefore(walkCb.parentNode, walkNote);
    ctx.onFrame(() => { if (walkOn && NET && !walkBusy) buildWalk(); });   // station models shown or hidden, storey changed
    if (walkOn) setWalk(true);

    const summary = L => L && (L.r ? { metres: Math.round(L.metres), secs: Math.round(L.secs), minutes: L.minutes, steps: L.steps, levels: L.levels, path: L.r.path.length, from: L.from.label, to: L.to.label, stepFree: L.stepFree, triangles: meshA ? meshA.geometry.index.count / 3 : 0 } : { none: true });
    return {
      object: group, ownUi: true,
      async route(a, b, opts = {}) { const A0 = await resolve(a), B0 = await resolve(b, A0); if (!A0 || !B0) return null; ends.from = A0; ends.to = B0; stepFree = !!opts.stepFree; return summary(await run(opts)); },
      async routeVertices(a, b, sf = false, faults = null) { await loadNet(); const r = route(a, b, sf, faults); return r && { secs: r.secs, path: r.path, steps: describe(r) }; },
      loadNet, vertexAt: (x, y) => NET ? vertexAt(x, y) : -1, vertexEnd: v => vertexEnd(v), openPress, setEnd, clear,
      get last() { return summary(last); }, get NET() { return NET; }, get stationFloors() { return stationsOn(); },
      setWalk, get walk() { return walkMesh ? { on: true, triangles: walkMesh.geometry.index.count / 3 } : { on: walkOn, triangles: 0 }; },
      setVisible(v) { group.visible = v; draw(); },
    };
  },
};
