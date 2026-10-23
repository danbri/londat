// The memory governor of moglob (the app at https://danbri.github.io/londat/docklands/). Owner, 2026-10-23: "Perf: loading
// even on a modern macbook or iphone can be very heavy and the webapp sometimes just reboots (annoying, slow, amateurish
// feel)." A tab that "reboots" on iPhone Safari is a WebContent process ended for memory: the page holds one budget for
// all it can count (JS heap and GPU memory) and keeps under it by rule.
//  - Budget by device class: iOS phones are the strict case (a peak well under about 1 GB for the whole tab, GPU included);
//    navigator.deviceMemory (Chromium), the screen size and iOS detection choose it; ?mem=<MB> or a class name overrides.
//  - Pools register what they hold and what can go (places.js tiles and places, base-tiles.js imagery, search copies of
//    features). Each second (and when a pool asks) the governor counts: JS heap (performance.memory where the browser has
//    it, else the pools' CPU bytes plus the model's arrays and a fixed part) + GPU (renderer.info.memory.total) + the
//    canvas (drawing buffer x 40 bytes a pixel: front, back, 4x MSAA colour and depth). Above HIGH x budget it frees idle
//    items of all pools together, least recently used first, by bytes, down to LOW x budget. Nothing drawn in the last
//    frames is freed: everything loads again when the view needs it (architecture rule 6).
//  - Quality tiers only as a reaction to memory pressure (rule 6: no capability is dropped for speed): when the view
//    itself is over budget after the idle items are gone, tier 1 (coarser far tiles, fewer imagery textures held, pixel
//    ratio 1.5), then tier 2 (pixel ratio 1, coarser still). Stated on screen (#memNote, one line) and in getView and
//    describeView (quality). ?mem=full: no tiers, no budget (the owner's override); the LRU caps still hold.
//  - Crash recovery: a marker in sessionStorage (per tab; it survives the reload that follows a crash) is set while the
//    page runs and cleared on pagehide and when the tab is hidden. A start that finds it set follows a load that ended
//    without a clean unload: the budget is lower (x 0.7, then x 0.5) and the start tier higher, and one line says so. The
//    page never reloads itself, so this cannot loop.
// Skill: docklands-3d-page, "moglob: memory budget, governor and crash recovery (2026-10-23)".
export const APP = { name: 'moglob', title: 'moglob', about: 'moglob: the Docklands model, the places and the planet in 3D' };
const MB = 1048576, HIGH = 0.85, LOW = 0.7;
const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const store = { get(k) { try { return sessionStorage.getItem(k); } catch { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* none */ } }, del(k) { try { sessionStorage.removeItem(k); } catch { /* none */ } } };

// the device class and its budget (MB of JS heap + GPU + canvas that the page may hold)
const CLASSES = {
  'ios-phone': { budget: 640, places: 2, fetch: 4, label: 'iPhone' },
  'ios-tablet': { budget: 900, places: 3, fetch: 6, label: 'iPad' },
  'phone-low': { budget: 400, places: 1, fetch: 3, label: 'phone with 2 GB or less' },
  phone: { budget: 640, places: 2, fetch: 4, label: 'phone' },
  'desktop-low': { budget: 800, places: 3, fetch: 6, label: 'computer with 4 GB or less' },
  mac: { budget: 1100, places: 3, fetch: 8, label: 'Mac' },
  desktop: { budget: 1400, places: 4, fetch: 8, label: 'computer' },
};
export function deviceClass(nav = typeof navigator !== 'undefined' ? navigator : {}, scr = typeof screen !== 'undefined' ? screen : { width: 1280, height: 800 }) {
  const ua = nav.userAgent || '', touchMac = /Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1, iOS = /iPhone|iPad|iPod/.test(ua) || touchMac;
  const short = Math.min(scr.width || 0, scr.height || 0), dm = nav.deviceMemory || null;
  if (iOS) return short && short < 600 ? 'ios-phone' : 'ios-tablet';
  if (short && short < 600 || /Android.+Mobile|Mobile Safari/.test(ua)) return dm && dm <= 2 ? 'phone-low' : 'phone';
  if (dm && dm <= 4) return 'desktop-low';
  if (/Macintosh/.test(ua) && !/Chrome|Firefox/.test(ua)) return 'mac';   // Safari on a Mac: no deviceMemory, WebKit's own limits
  return 'desktop';
}

export function makeGovernor() {
  const mq = (qs.get('mem') || '').toLowerCase(), full = /^(full|off|0|no)$/.test(mq);
  const cls = CLASSES[mq] ? mq : mq === 'ios' ? 'ios-phone' : deviceClass(), C = CLASSES[cls];
  // ---------- crash recovery: the marker of the last load of this tab
  const KEY = 'moglob.run', prev = (() => { try { return JSON.parse(store.get(KEY) || 'null'); } catch { return null; } })();
  const crashed = !!(prev && !prev.clean && Date.now() - (prev.t || 0) < 6 * 3600e3), crashes = crashed ? Math.min(2, (prev.crashes || 0) + 1) : 0;
  const mark = () => store.set(KEY, JSON.stringify({ t: Date.now(), crashes, clean: false })), unmark = () => store.del(KEY);
  if (typeof addEventListener !== 'undefined') {
    mark();
    addEventListener('pagehide', unmark); addEventListener('pageshow', e => { if (e.persisted) mark(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') unmark(); else mark(); });
  }
  const mbArg = /^\d+$/.test(mq) ? +mq : null;
  const budget = full ? Infinity : (mbArg || C.budget) * (crashes ? [1, 0.7, 0.5][crashes] : 1);
  const S = { app: APP.name, device_class: cls, device_label: C.label, budget_mb: isFinite(budget) ? Math.round(budget) : null, override: full ? 'full' : mbArg ? 'mb' : CLASSES[mq] || mq === 'ios' ? 'class' : null,
    tier: full ? 0 : crashes, crashes, recovered: crashed, used_mb: 0, js_mb: 0, gpu_mb: 0, canvas_mb: 0, estimated: false, freed: 0, freed_mb: 0, evictions: 0, ticks: 0, peak_mb: 0,
    max_places: full ? 99 : Math.max(1, C.places - (crashes ? 1 : 0)), max_fetch: C.fetch, reason: crashed ? 'the last visit in this tab ended without a clean unload (most likely out of memory)' : null };
  const pools = [], tierHooks = [];
  let R = null, cpuExtra = () => 0, underT = 0, timer = 0, noteEl = null; const win = [];   // win: the last 5 counts (a tier needs the smallest of them over the budget: garbage of a build is not pressure)

  function canvasBytes() { const cv = R?.domElement; return cv ? cv.width * cv.height * 40 : 0; }
  function measure() {
    const gpu = R?.info?.memory?.total || 0, cnv = canvasBytes();
    let js = 0, est = false;
    const pm = typeof performance !== 'undefined' && performance.memory;
    if (pm && pm.usedJSHeapSize) js = pm.usedJSHeapSize;
    else { est = true; js = 120 * MB + cpuExtra(); for (const p of pools) js += p.cpuBytes ? p.cpuBytes() : 0; }
    S.js_mb = Math.round(js / MB); S.gpu_mb = Math.round(gpu / MB); S.canvas_mb = Math.round(cnv / MB); S.estimated = est;
    S.used_mb = Math.round((js + gpu + cnv) / MB); S.peak_mb = Math.max(S.peak_mb, S.used_mb);
    return js + gpu + cnv;
  }
  // free idle items of every pool, least recently used first, until `want` bytes are gone
  function evict(want) {
    const items = []; for (const p of pools) for (const it of p.idle()) items.push(it);
    items.sort((a, b) => a.used - b.used || b.bytes - a.bytes);
    let got = 0; for (const it of items) { if (got >= want) break; try { const b = it.free(); got += b ?? it.bytes; S.freed++; } catch (e) { console.warn('moglob: free', e); } }
    if (got) { S.freed_mb += Math.round(got / MB); S.evictions++; }
    return got;
  }
  function setTier(t, why) {
    t = Math.max(0, Math.min(2, t)); if (t === S.tier) return; S.tier = t; S.reason = why;
    for (const f of tierHooks) try { f(t); } catch (e) { console.warn('moglob: tier', e); }
    note();
  }
  const TIER_TEXT = ['full detail', 'lighter detail (tier 1 of 2): coarser far tiles, fewer images held, pixel ratio 1.5', 'light detail (tier 2 of 2): coarser tiles, pixel ratio 1'];
  function note() {
    if (typeof document === 'undefined') return;
    if (!noteEl) { noteEl = document.createElement('div'); noteEl.id = 'memNote'; noteEl.setAttribute('role', 'status');
      noteEl.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(34px + env(safe-area-inset-bottom,0px));z-index:4;max-width:calc(100vw - 24px);font:11px/1.3 system-ui,sans-serif;color:#d9dee3;background:#101418e6;padding:3px 9px;border-radius:6px;pointer-events:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      document.body.appendChild(noteEl); }
    const why = S.recovered && S.tier ? 'restarted after the last visit ran short of memory' : 'memory is short';
    noteEl.hidden = !S.tier; noteEl.title = `moglob memory: budget ${S.budget_mb} MB for a ${C.label}; ${TIER_TEXT[S.tier]}. Everything still loads as you come closer. Add ?mem=full to the address to turn this off.`;
    noteEl.innerHTML = S.tier ? `moglob: ${why}, so ${TIER_TEXT[S.tier].split(':')[0]}. <a href="${(() => { const q = new URLSearchParams(location.search); q.set('mem', 'full'); return location.pathname + '?' + q + location.hash; })()}" style="color:#9fd8ff">Full detail</a>` : '';
  }
  function tick() {
    S.ticks++; if (!isFinite(budget)) { measure(); return; }
    const B = budget * MB; let used = measure();
    if (used > B * HIGH) { evict(used - B * LOW); used = measure(); }
    win.push(used); if (win.length > 5) win.shift(); const low = Math.min(...win);
    if (win.length === 5 && low > B) { win.length = 0; underT = 0; setTier(S.tier + 1, `the view needed ${Math.round(low / MB)} MB, over the ${S.budget_mb} MB budget`); }
    else if (used < B * 0.78 && S.tier > (S.recovered ? 1 : 0)) { if (++underT >= 15) { underT = 0; win.length = 0; setTier(S.tier - 1, 'memory is back under the budget'); } }   // (15 s under 78 %: one step back; a step back adds at most the canvas's 40 MB)
    else underT = 0;
  }
  const G = {
    S, APP, budget: () => budget, full,
    attach(renderer, { cpu } = {}) { R = renderer; if (cpu) cpuExtra = cpu; if (!timer && typeof setInterval !== 'undefined') timer = setInterval(tick, 1000); if (S.tier) setTimeout(note, 0); },
    // a pool: { id, idle() -> [{ bytes, used (ms), free() -> bytes }], cpuBytes() }
    register(pool) { pools.push(pool); return pool; },
    onTier(f) { tierHooks.push(f); if (S.tier) f(S.tier); },
    // a pool that is about to add `bytes` asks for room first (frees idle items when the sum would pass HIGH x budget)
    room(bytes) { if (!isFinite(budget)) return true; const B = budget * MB, used = measure(); if (used + bytes > B * HIGH) evict(used + bytes - B * LOW); return true; },
    tick, measure, evict,
    // for the page API (getView, describeView) and the tests
    state() { return { app: S.app, device_class: S.device_class, budget_mb: S.budget_mb, used_mb: S.used_mb, js_mb: S.js_mb, gpu_mb: S.gpu_mb, canvas_mb: S.canvas_mb, estimated: S.estimated, peak_mb: S.peak_mb,
      tier: S.tier, tier_text: TIER_TEXT[S.tier], reason: S.reason, recovered_from_crash: S.recovered, override: S.override, max_places: S.max_places, freed_items: S.freed, freed_mb: S.freed_mb,
      pools: Object.fromEntries(pools.map(p => [p.id, p.stats ? p.stats() : null])), how_to_override: '?mem=full (no budget, no tiers) or ?mem=<MB>' }; },
    quality() { return { tier: S.tier, text: TIER_TEXT[S.tier], reason: S.tier ? S.reason : null, budget_mb: S.budget_mb, device_class: S.device_class, override: S.override, how_to_override: '?mem=full' }; },
  };
  return G;
}
// one governor for the page (main.js attaches the renderer; globe/places.js and globe/base-tiles.js register their pools)
export const GOV = makeGovernor();
if (typeof globalThis !== 'undefined') { globalThis.moglob = Object.assign(globalThis.moglob || {}, { name: APP.name, memory: GOV }); }
