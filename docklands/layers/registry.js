// The registry in 3D (layer "registry", no menu entry) of the Three.js port: the atlas index (../cwplans/atlas/data/atlas.json)
// maps each model building to its registry record (cwb- id; regOf); a tap on such a building opens the registry card
// (name, height, owner, homes, companies, occupants by level, opening hours, data quality, who is inside by kind, and the
// links: full record in the atlas, knowledge graph, OSM, Wikidata). The night windows take each building's use from the
// record (nightUse: homes, offices, hotel; One Canada Square and Newfoundland by id) through ctx.buildOpts.useOf.
// Port of index.html regOf, nightUse, selectBuilding. Records (../cwplans/registry/buildings.json), quality issues and
// categories load on the first card. Not ported: occupant labels at their floors, route buttons, London Datastore facts,
// the halo colour of the date. Skill: docklands-3d-page, "Interface" and "Three.js port".
const NIGHT_USE = { residential: 1, apartments: 1, house: 1, terrace: 1, houseboat: 1, 'yes;apartments': 1, hotel: 3, commercial: 2, office: 2, retail: 2, data_center: 2, service: 2, industrial: 2, warehouse: 2, college: 2, school: 2, train_station: 2, public: 2, clinic: 2 };
const levelOf = o => { for (const v of [o.level, o.level_cwg]) { const m = /(-?\d+)/.exec(String(v ?? '').split(';')[0]); if (m) return +m[1]; if (/street|ground/i.test(String(v || ''))) return 0; } return null; };
const ohOf = o => o.web && o.web.opening_hours && o.web.scope !== 'chain' ? { h: o.web.opening_hours, src: 'its web page', page: o.web.page } : o.opening_hours ? { h: o.opening_hours, src: 'OSM' } : o.web && o.web.opening_hours ? { h: o.web.opening_hours, src: 'the chain\'s web page (all branches)', page: o.web.page } : null;
const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error(src + ' did not load')); document.head.appendChild(s); });

export default {
  id: 'registry', label: null,
  async init(ctx) {
    const { A, esc, loadJSON } = ctx, CW = ctx.WEBGL.replace(/docklands\/$/, '');   // ../cwplans/
    const regOf = new Int32Array(A.buildings.length).fill(-1);
    let AT = null, REG = null, QI = null, CATS = null;
    const stats = { atlas: 'loading' };
    const getReg = () => REG || (REG = loadJSON(CW + 'registry/buildings.json').then(d => new Map(d.buildings.map(b => [b.id, b]))));
    const getQI = () => QI || (QI = loadJSON(CW + 'quality/issues.json').then(q => { const by = new Map(); for (const i of q.issues) { const k = `${i.ent}/${i.id}`; if (!by.has(k)) by.set(k, []); by.get(k).push(i); } return by; }));
    const getCats = () => CATS || (CATS = loadJSON(CW + 'registry/categories.json'));
    if (!globalThis.OpeningHours) loadScript(ctx.WEBGL + 'opening-hours.js').catch(() => {});

    function nightUse(i) {
      const k = regOf[i]; if (k < 0 || !AT) return 0; const r = AT.buildings[k];
      if (r.id === 'cwb-0451') return 4; if (r.id === 'cwb-0413') return 5;
      if (r.hm > 0) return 1; return NIGHT_USE[r.t] ?? (r.o > 3 || r.co > 20 ? 2 : 0);
    }
    const ready = loadJSON(CW + 'atlas/data/atlas.json').then(d => {
      AT = d; d.buildings.forEach((b, k) => (b.mi || []).forEach(i => { if (i < regOf.length) regOf[i] = k; }));
      stats.atlas = d.buildings.length;
      ctx.buildOpts.useOf = nightUse; ctx.rebuildBuildings(); return AT;
    }).catch(e => { stats.atlas = 'failed: ' + e.message; console.warn('atlas', e); return null; });

    function ohMark(o) { const x = ohOf(o); if (!x || !globalThis.OpeningHours) return ''; const st = OpeningHours.openState(x.h); if (!st) return ''; return st.open ? ` <span class="small" style="color:#7dff9b">open${st.until ? ' to ' + esc(st.until) : ''}</span>` : ` <span class="small">closed${st.from ? ', opens ' + esc(st.from) : ''}</span>`; }
    function ohList(occ) {
      const rows = occ.map(o => [o, ohOf(o)]).filter(([, x]) => x); if (!rows.length) return '';
      return `<details style="margin-top:6px"><summary class="small">Opening hours (${rows.length})</summary><div class="small">${rows.map(([o, x]) => `<b>${esc(o.name)}</b>: ${esc(x.h)} <span class="small">${x.page ? `<a href="${esc(x.page)}" target="_blank" rel="noopener">${esc(x.src)}</a>` : esc(x.src)}</span>${o.web && o.web.phone ? ` · ${esc(o.web.phone)}` : ''}`).join('<br>')}</div><div class="small">Times are London time. Public holidays (PH) are not applied.</div></details>`;
    }

    // the registry card of record k (index.html selectBuilding, info.innerHTML)
    async function cardHtml(k) {
      const ab = AT.buildings[k];
      const [reg, qi, cats] = await Promise.all([getReg(), getQI().catch(() => null), getCats().catch(() => null)]);
      const b = reg.get(ab.id); if (!b) return null;
      const base = Math.min(...ab.mi.map(i => A.buildings[i].b)), storey = 4;
      const occ = b.occupants.map(o => ({ o, lv: levelOf(o) }));
      const byLv = new Map(); for (const x of occ) { const key = x.lv ?? 'no level'; if (!byLv.has(key)) byLv.set(key, []); byLv.get(key).push(x.o); }
      const levels = [...byLv.keys()].sort((p, q) => (typeof q === 'number' ? q : -99) - (typeof p === 'number' ? p : -99));
      const issues = qi ? qi.get(`b/${ab.id}`) || [] : [];
      const comp = Array.isArray(b.companies) ? `${b.companies.length} registered: ${b.companies.slice(0, 8).map(c => esc(c.name)).join(', ')}${b.companies.length > 8 ? ' …' : ''}` : b.companies ? `${esc(b.companies.count)} registered` : 'none matched';
      const use = ['unknown', 'homes', 'offices and other work', 'hotel', 'offices', 'offices'][nightUse(ab.mi[0])];
      const osm = (b.osm || [])[0];
      return `<h2>${esc(b.name || ab.id)}</h2><p class="small">${esc(ab.id)}${b.osm_name && b.osm_name !== b.name ? ` · OSM “${esc(b.osm_name)}”` : ''}${b.description ? ' · ' + esc(b.description) : ''}</p>
        <p class="small">Height: ${ab.wh ? `Wikidata ${ab.wh} m · ` : ''}${ab.h ? `OSM ${ab.h} m · ` : ''}${ab.mh ? `3D model ${ab.mh} m (${esc(ab.ms)})` : ''} · floors ${ab.lv ?? '—'} · below ground ${ab.lu ?? '—'} · ground ${base} m OD</p>
        <p class="small">Use: ${esc(ab.t || '—')} (night windows: ${use})</p>
        ${ab.id === 'cwb-0413' ? '<p class="small">Halo (the lit band at the foot of the pyramid). The white flashing light at the apex is an aviation light, not part of the display. <a href="https://github.com/danbri/londat/blob/main/cwplans/registry/sources/lighting/README.md">Lighting record</a> (a sample: no public schedule exists).</p>' : ''}
        ${b.owners.length ? `<p class="small">Owner: ${b.owners.map(o => esc(o.name)).join(', ')}</p>` : ''}
        <p class="small">Homes: ${b.homes ? esc(b.homes.count) : 0} · companies: ${comp} · postcodes: ${b.postcodes.map(esc).join(', ') || '—'}</p>
        ${occ.length ? `<table class="small">${levels.map(lv => `<tr><td style="vertical-align:top;padding-right:8px;white-space:nowrap">${typeof lv === 'number' ? (lv === 0 ? 'ground' : (lv > 0 ? '+' : '') + lv) : 'no level'}</td><td>${byLv.get(lv).map(o => esc(o.name) + ohMark(o)).join(' · ')}</td></tr>`).join('')}</table>${ohList(b.occupants)}<p class="small">Levels: OSM level or CWG mall level (a floor index, not a measured height).</p>` : '<p class="small">No occupants recorded.</p>'}
        ${issues.length ? `<p class="small"><b>Data quality (${issues.length})</b><br>${issues.slice(0, 12).map(i => `${esc(i.check)} (${esc(i.sev)}) ${esc(i.note)}`).join('<br>')}</p>` : ''}
        ${cats && cats.buildings[ab.id] ? `<p class="small"><b>Who is inside, by kind</b><br>${Object.entries(cats.buildings[ab.id]).map(([c, l]) => `${esc(c)}: ${l.slice(0, 10).map(o => `${esc(o.name)} (${esc(o.why)}${o.link ? ', ' + esc(o.link) + (o.start ? ' since ' + esc(o.start.slice(0, 4)) : '') : ''})`).join(' · ')}${l.length > 10 ? ' …' : ''}`).join('<br>')}</p>` : ''}
        <p class="small" style="margin-top:6px"><a href="${CW}atlas/#map/b/${esc(ab.id)}">full record in the atlas</a> · <a href="${CW}kg/#e=id:${esc(ab.id.replace(/-/g, '').toLowerCase())}">knowledge graph</a>${osm ? ` · <a href="https://www.openstreetmap.org/${esc(osm)}" target="_blank" rel="noopener">OSM</a>` : ''}${b.wikidata ? ` · <a href="https://www.wikidata.org/wiki/${esc(b.wikidata)}" target="_blank" rel="noopener">Wikidata</a>` : ''}</p>`;
    }
    // main.js selectModel asks each card hook first: a building with a registry record gets the registry card
    ctx.addCard?.(i => { const k = regOf[i]; return k >= 0 && AT && AT.buildings[k] ? cardHtml(k) : null; });

    const api = { regOf, nightUse, ready, cardHtml, stats, get AT() { return AT; } };
    ctx.registry = api;
    return api;
  },
};
