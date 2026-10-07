// The latest live state of the zone from the danbri/londat cache: cache/latest.json, written each hour by
// tools/cache-londat.mjs (a GitHub Actions workflow in londat). The pages read it first and ask a third-party service
// only when the visitor ticks "Live", or when the cached theme is older than an hour. Needs ../data-base.js (CwData).
// Schema, refresh and the numbers behind this choice: skill cwplans-londat-cache.
//   const t = await CwLive.theme('weather')        -> {fetched, ...} or throws (missing, or older than maxMin minutes)
//   await CwLive.pick('weather', fromCache, live, direct)  -> {html, from: 'cache' | 'live'}
(function () {
  let p = null;
  const latest = () => p || (p = fetch(CwData.url('cache/latest.json'), { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).catch(e => { p = null; throw e; }));
  const ageMin = iso => (Date.now() - Date.parse(iso)) / 60000;
  async function theme(name, maxMin = 60) {
    const d = await latest(), t = d.themes && d.themes[name];
    if (!t) throw new Error('not in the cache');
    const age = ageMin(t.fetched);
    if (!(age <= maxMin)) throw new Error(`cache ${Math.round(age)} min old`);
    return t;
  }
  const rowsOf = t => t.rows.map(r => Object.fromEntries(t.cols.map((c, i) => [c, r[i]])));
  const hhmm = iso => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
  // cache first (unless direct); on a miss or a stale theme, the live call, with the reason
  async function pick(name, fromCache, live, direct) {
    if (direct) return { html: await live() + ' <span class="small">(live from the source)</span>', from: 'live' };
    let why;
    try { const t = await theme(name); return { html: await fromCache(t) + ` <span class="small">(londat cache, fetched ${hhmm(t.fetched)})</span>`, from: 'cache', t }; }
    catch (e) { why = e.message; }
    return { html: await live() + ` <span class="small">(live from the source: ${why})</span>`, from: 'live' };
  }
  window.CwLive = { latest, theme, rowsOf, pick, hhmm, ageMin };
})();
