// Skyline by year (measured) for the Three.js port (docklands/): the WebGL page's skyline-year slider (index.html heightOf,
// notFlown, setSkyYear). ../cwplans/docklands/data/skyline.json gives, for each model building on the estate and 300 m round
// it, its height in decimetres in each Environment Agency LiDAR survey (null: that survey did not fly it; 0: not there).
// For a past year the buildings are rebuilt with those heights (ctx.buildOpts.heightOf); a building that survey did not
// cover keeps today's height in slate blue (colourOf); the measured towers, roof shapes, the Realistic look and the detailed
// glTF models are off, as on the WebGL page. "today" removes the options and rebuilds. ?year=YYYY opens on the survey of
// that year (or the latest survey before it). Skill: docklands-3d-page, "Three.js port".
const SLATE = [.36, .42, .52];

export default {
  id: 'skyline', label: 'Skyline by year', on: true,
  async init(ctx) {
    const SKY = await ctx.loadJSON(ctx.DATA + 'skyline.json'), Y = SKY.years, n = Y.length, nb = Object.keys(SKY.buildings).length;
    const H = SKY.buildings, O = ctx.buildOpts, stats = { builds: [] };
    const models = () => ctx.scene.children.find(o => o.isGroup && o.children.some(c => c.userData.model != null));   // main.js `models` (glTF)
    let idx = -1;
    function setYear(k, rebuild = true) {
      idx = k >= n || k < 0 ? -1 : k; ui.input.value = idx < 0 ? n : idx;
      if (idx < 0) { for (const key of ['heightOf', 'colourOf', 'towers', 'look', 'skip']) delete O[key]; }
      else Object.assign(O, {
        heightOf: (b, i) => { const v = H[i]; return !v || v[idx] == null ? b.h : v[idx] / 10; },
        colourOf: (b, i) => { const v = H[i]; return v && v[idx] == null ? SLATE : null; },
        towers: null, look: null, skip: new Set(),   // the tower tiers, the look and the glTF models are today's
      });
      const mg = models(); if (mg) mg.visible = idx < 0;
      if (rebuild) { const t0 = performance.now(); ctx.rebuildBuildings(); stats.builds.push({ year: idx < 0 ? 'today' : Y[idx], ms: Math.round(performance.now() - t0) }); }
      stats.year = idx < 0 ? 'today' : Y[idx];
      ui.label.textContent = `Skyline by year (measured): ${idx < 0 ? 'today' : Y[idx]}`;
      const sv = idx < 0 ? null : SKY.surveys[idx];
      note.textContent = sv
        ? `${sv.year}: EA LiDAR surface model (${sv.product.replace(/_/g, ' ')}, ${sv.res_m} m); ${Object.values(H).filter(v => v[idx] > 0).length} of ${nb} buildings on the estate standing (over 3 m and a quarter of today's height), ${sv.buildings_flown} with data; the others keep today's height in slate blue. Today's OSM outlines; demolished buildings do not appear.`
        : `Heights of the buildings on the estate and 300 m round it in each Environment Agency LiDAR survey (${Y[0]} to ${Y[n - 1]}). Today's OSM outlines are used, so buildings demolished before today do not appear.`;
      ctx.draw();
    }
    ctx.ui.section('Skyline by year');
    const ui = ctx.ui.slider('Skyline by year (measured): today', 0, n, 1, n, k => setYear(k));
    ui.input.setAttribute('aria-label', 'Survey year');
    const play = document.createElement('button'); play.type = 'button'; play.textContent = '▶ Play the years'; play.setAttribute('aria-label', 'Play the years');
    let timer = 0;
    play.onclick = () => {
      if (timer) { clearInterval(timer); timer = 0; play.textContent = '▶ Play the years'; return; }
      let k = 0; setYear(0); play.textContent = '❚❚ Stop';
      timer = setInterval(() => { k++; setYear(k); if (k >= n) { clearInterval(timer); timer = 0; play.textContent = '▶ Play the years'; } }, 1400);
    };
    ctx.ui.host().appendChild(play);
    const note = ctx.ui.note('');
    ctx.ui.note(`${ctx.esc(SKY.attribution)}; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>.`);

    // ?year=YYYY: that survey, or the latest one before it ('today' or a year after the last survey: today)
    const q = ctx.qs.get('year');
    if (q && /^\d{4}$/.test(q)) { let k = -1; for (let j = 0; j < n; j++) if (Y[j] <= +q) k = j; setYear(k < 0 ? 0 : +q > Y[n - 1] ? n : k); }
    else setYear(n, false);   // today: the page has built it already
    return { ownUi: true, setYear, stats };   // stats.year: the year shown; stats.builds: rebuild times
  },
};
