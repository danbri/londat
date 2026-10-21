// The world base tiles on the globe of the Three.js port (OKR KR2.2; owner, 2026-10-20: "pragmatic perf improvements, and
// improved worldwide coverage so that our detailed city testbeds are not lost in the void"): an imagery pyramid and a
// terrain-height pyramid in the cells of the terrain quadtree (cwplans/docklands/data/world-base/base.json, made by
// cwplans/tools/build-world-base.mjs). Worldwide imagery to level 3; round the testbeds imagery to level 11 (about 19 m a
// pixel) and heights to level 12 (Copernicus GLO-90 box means, 150 m between samples).
//  - Imagery: a terrain patch of cell L/x/y draws the deepest LOADED tile at or above its cell (its own when there is one),
//    and asks for its own (or the deepest that exists). One material per loaded tile (terrain.js terrainMaterial with img;
//    the tile's box is a uniform, so all tiles share one program). Requests go coarse first, at most REQ at once, and
//    a request that no drawn patch wants any more is dropped before it starts.
//  - Heights: a patch takes the heights of the deepest loaded height tile at or above its cell (level 7 or deeper): its
//    'dem' attribute (h, east and north gradient, flag 1); the CPU sampler (terrain.js S.demH) answers from the deepest
//    loaded tile, so vector lines, labels, the camera's clearance and the places' hand-over sit on the same ground.
//  - Freeing: when more than CAP imagery textures are held, those not drawn in the last frame go, oldest first (GPU
//    memory: 512 px with mipmaps is 1.4 MB a tile); with CAP textures all in use, a patch draws its loaded ancestor and
//    asks for nothing more. Height tiles are small (2.4 kB) and stay. G.baseRest() gives back every texture (the globe
//    rests in the model).
// Text interface: G.baseStats(), G.baseDetailAt(lon, lat) (how fine the base is there: the globe's height floor).
// ?base=0 leaves the base out (the world texture only, as before). Skill: docklands-3d-page, "World base tiles".
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { D2R, WGS84 } from '../geo/ellipsoid.js';

export const BASE_URL = '../cwplans/docklands/data/world-base/base.json';
const REQ = 6, CAP = 56, DEM_MIN = 7, GRID = 35;   // CAP: imagery textures held (512 px with mipmaps: 1.4 MB each)

export async function attachBase(G, { terrain, sampler, U, tex, gtex, terrainMaterial, url = BASE_URL }) {
  const base = new URL(url, location.href), M = await fetch(base).then(r => { if (!r.ok) throw new Error('base ' + r.status); return r.json(); });
  const avail = sets => Object.fromEntries(Object.entries(sets || {}).map(([L, a]) => { const s = new Set(); for (let i = 0; i < a.length; i += 2) s.add(a[i] + ',' + a[i + 1]); return [L, s]; }));
  const IA = avail(M.imagery.tiles), DA = avail(M.dem.tiles), maxImg = Math.max(...Object.keys(IA).map(Number)), maxDem = Math.max(...Object.keys(DA).map(Number), 0);
  const has = (A, L, x, y) => !!(A[L] && A[L].has(x + ',' + y));
  const bounds = (L, x, y) => { const s = 180 / 2 ** L; return [-180 + x * s, 90 - (y + 1) * s, -180 + (x + 1) * s, 90 - y * s]; };
  const tileUrl = (t, L, x, y) => new URL(t.replace('{z}', L).replace('{x}', x).replace('{y}', y), base).href;
  const img = new Map(), dem = new Map(), queue = new Map(), inflight = new Set(); let active = 0, frame = 0;
  const tileMB = M.imagery.px * M.imagery.px * 4 * 4 / 3 / 1048576;   // one imagery texture with its mipmaps
  const st = { imgLoaded: 0, demLoaded: 0, imgFreed: 0, requests: 0, dropped: 0, failed: 0 };

  // ---------- requests: coarse levels first; a request goes only while some drawn patch still wants it
  function want(kind, L, x, y) {
    const k = kind + L + '/' + x + '/' + y, M2 = kind === 'i' ? img : dem;
    if (M2.has(k)) { M2.get(k).used = frame; return M2.get(k); }
    const q = queue.get(k); if (q) { q.used = frame; return null; } if (inflight.has(k)) return null;
    if (kind === 'i' && img.size >= CAP && !freeable()) return null;   // every texture held is in use: draw an ancestor
    queue.set(k, { k, kind, L, x, y, used: frame }); pump(); return null;
  }
  function pump() {
    while (active < REQ && queue.size) {
      let best = null; for (const q of queue.values()) { if (frame - q.used > 30) { queue.delete(q.k); st.dropped++; continue; } if (!best || q.L < best.L) best = q; }
      if (!best) return; queue.delete(best.k); inflight.add(best.k); active++; st.requests++;
      (best.kind === 'i' ? loadImg(best) : loadDem(best)).catch(e => { st.failed++; console.warn('base: tile', best.k, e.message); }).finally(() => { inflight.delete(best.k); active--; pump(); });
    }
  }
  const loader = new THREE.TextureLoader();
  async function loadImg(q) {
    const t = await loader.loadAsync(tileUrl(M.imagery.url, q.L, q.x, q.y));
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
    const [w, s, e, n] = bounds(q.L, q.x, q.y), mat = terrainMaterial(tex, gtex, U, { tex: t, box: uniform(new THREE.Vector4(w, s, e, n)) });
    img.set(q.k, { k: q.k, L: q.L, x: q.x, y: q.y, tex: t, mat, used: frame }); st.imgLoaded++;
    G.dirty = true;
  }
  let demArea = null, demT = 0;
  async function loadDem(q) {
    const r = await fetch(tileUrl(M.dem.url, q.L, q.x, q.y)); if (!r.ok) throw new Error(r.status);
    const h = new Int16Array(await r.arrayBuffer()); if (h.length !== GRID * GRID) throw new Error('bad height tile');
    const [w, s, e, n] = bounds(q.L, q.x, q.y); dem.set(q.k, { k: q.k, L: q.L, x: q.x, y: q.y, h, b: [w, s, e, n], used: frame }); st.demLoaded++;
    demArea = demArea ? [Math.min(demArea[0], w), Math.min(demArea[1], s), Math.max(demArea[2], e), Math.max(demArea[3], n)] : [w, s, e, n];
    clearTimeout(demT); demT = setTimeout(() => { const a = demArea; demArea = null; if (G.onBaseDem) G.onBaseDem(a); }, 1200);   // vector lines on the new ground (globe.js)
    G.dirty = true;
  }

  // ---------- heights from a tile: bilinear in its 35 x 35 grid (sample (i, j) at w + (i - 1) d, n - (j - 1) d)
  const at = (T, fx, fy) => { fx = Math.max(0, Math.min(GRID - 1.001, fx)); fy = Math.max(0, Math.min(GRID - 1.001, fy)); const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, h = T.h, o = j * GRID + i;
    return (h[o] * (1 - u) + h[o + 1] * u) * (1 - v) + (h[o + GRID] * (1 - u) + h[o + GRID + 1] * u) * v; };
  const fxy = (T, lon, lat) => { const d = (T.b[2] - T.b[0]) / 32; return [(lon - T.b[0]) / d + 1, (T.b[3] - lat) / d + 1, d]; };
  // the deepest loaded height tile holding a point (levels maxDem .. DEM_MIN)
  function demTileAt(lon, lat) {
    for (let L = maxDem; L >= DEM_MIN; L--) { const s = 180 / 2 ** L, x = Math.floor((lon + 180) / s), y = Math.floor((90 - lat) / s), T = dem.get('d' + L + '/' + x + '/' + y); if (T) return T; }
    return null;
  }
  sampler.demH = (lon, lat) => { const T = demTileAt(lon, lat); if (!T) return null; const [fx, fy] = fxy(T, lon, lat); return at(T, fx, fy); };

  // ---------- the terrain's hooks: may a cell split deeper than MAXL, and the per-frame patch update
  terrain.detail = {
    maxL(L, x, y) { if (L >= Math.max(maxImg, maxDem)) return L; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const X = 2 * x + dx, Y = 2 * y + dy; if (has(IA, L + 1, X, Y) || has(DA, L + 1, X, Y)) return L + 1; } return L; },
    patch(nd, mesh, f) {
      frame = f;
      // imagery: ask for the deepest tile that exists at or above the cell; draw the deepest loaded one
      let asked = false, mat = null;
      for (let L = Math.min(nd.L, maxImg); L >= 0; L--) { const sh = nd.L - L, x = nd.x >> sh, y = nd.y >> sh; if (!has(IA, L, x, y)) continue;
        const T = asked ? (img.get('i' + L + '/' + x + '/' + y) || null) : want('i', L, x, y); asked = true; if (T) { T.used = f; mat = T.mat; break; } }
      const m2 = mat || terrain.mat; if (mesh.material !== m2) mesh.material = m2;
      // heights: the deepest loaded tile at or above the cell (level 7 or deeper)
      let T = null; asked = false;
      for (let L = Math.min(nd.L, maxDem); L >= DEM_MIN; L--) { const sh = nd.L - L, x = nd.x >> sh, y = nd.y >> sh; if (!has(DA, L, x, y)) continue;
        const t = asked ? (dem.get('d' + L + '/' + x + '/' + y) || null) : want('d', L, x, y); asked = true; if (t) { T = t; break; } }
      if ((T ? T.k : null) !== (nd.demKey || null)) fillDem(nd, mesh, T);
    },
    selected(list, f) { frame = f; if (img.size > CAP * 0.9) freeSome(); },
  };
  // the patch's 'dem' attribute from tile T (null: back to the world texture)
  const A_ = WGS84.a;
  function fillDem(nd, mesh, T) {
    nd.demKey = T ? T.k : null; const geo = mesh.geometry.attributes.geo.array, att = mesh.geometry.attributes.dem, a = att.array, n = geo.length / 2;
    if (!T) a.fill(0);
    else { const d = (T.b[2] - T.b[0]) / 32, dy = d * D2R * A_;
      for (let k = 0; k < n; k++) { const lon = geo[2 * k], lat = geo[2 * k + 1], fx = (lon - T.b[0]) / d + 1, fy = (T.b[3] - lat) / d + 1, dx = dy * Math.max(0.02, Math.cos(lat * D2R));
        a[4 * k] = at(T, fx, fy); a[4 * k + 1] = (at(T, fx + 1, fy) - at(T, fx - 1, fy)) / (2 * dx); a[4 * k + 2] = (at(T, fx, fy - 1) - at(T, fx, fy + 1)) / (2 * dy); a[4 * k + 3] = 1; } }
    att.needsUpdate = true;
  }
  // (tiles not drawn in the frame before this one; levels 0 and 1 stay: 10 tiles, the whole globe from orbit)
  const freeable = () => { for (const t of img.values()) if (t.used < frame - 1 && t.L > 1) return true; return false; };
  function freeSome() {
    const old = [...img.values()].filter(t => t.used < frame - 1 && t.L > 1).sort((a, b) => a.used - b.used || b.L - a.L);
    for (const t of old.slice(0, img.size - Math.floor(CAP * 0.75))) { t.tex.dispose(); t.mat.dispose(); img.delete(t.k); st.imgFreed++;
      // patches still holding the material take the world one until their next frame picks a loaded tile
      for (const nd of terrain.cache.values()) if (nd.mesh && nd.mesh.material === t.mat) nd.mesh.material = terrain.mat; }
  }
  G.baseRest = () => { for (const t of img.values()) { t.tex.dispose(); t.mat.dispose(); } img.clear(); for (const nd of terrain.cache.values()) if (nd.mesh) nd.mesh.material = terrain.mat; };
  G.baseStats = () => ({ imagery: img.size, heights: dem.size, queued: queue.size, active, gpu_mb: Math.round(img.size * tileMB), ...st });
  // how fine the base is at a point: the deepest imagery level that exists there (0 to 11)
  G.baseDetailAt = (lon, lat) => { for (let L = maxImg; L > 3; L--) { const s = 180 / 2 ** L; if (has(IA, L, Math.floor((lon + 180) / s), Math.floor((90 - lat) / s))) return L; } return 0; };
  G.baseCredit = M.credit;
  // the credit on screen in globe mode (CC BY 4.0 asks for it where the imagery is seen)
  if (typeof document !== 'undefined' && !document.getElementById('globeCredit')) {
    const css = document.createElement('style');
    css.textContent = '#globeCredit{position:fixed;left:6px;bottom:calc(2px + var(--safe, 0px));z-index:4;font:9px/1.25 system-ui,sans-serif;color:#d8dde2;text-shadow:0 0 3px #000,0 0 2px #000;pointer-events:auto;max-width:calc(100vw - 64px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:none}#globeCredit a{color:inherit}body.globeMode #globeCredit{display:block}body.noLabels #globeCredit{opacity:.8}';
    document.head.appendChild(css);
    const el = document.createElement('div'); el.id = 'globeCredit'; el.title = M.credit + ' Natural Earth (public domain); GeoNames (CC BY 4.0); © OpenStreetMap contributors (ODbL).';
    el.innerHTML = 'Imagery: <a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless 2016 by EOX</a> (CC BY 4.0, modified Copernicus Sentinel data) · Terrain: Copernicus DEM GLO-90, ETOPO 2022 · Natural Earth · GeoNames · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';
    document.body.appendChild(el);
  }
  G.dirty = true;
  return { manifest: M, stats: G.baseStats };
}
