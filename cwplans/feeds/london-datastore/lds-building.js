// London Datastore facts for a registry building (cwb- id), for the record cards of the atlas and the 3D page.
// Data: registry/sources/lds/building-links.json and area-context.json (tools/join-lds.mjs; skill
// cwplans-london-datastore, "Joins to the building registry"). Each link shows its key and confidence; each source its
// dataset page, licence and the GLA's warning. Use: await LdsBuilding.load(baseUrlOfCwplans); LdsBuilding.html(id, esc).
(function () {
  const S = { links: null, ctx: null, p: null };
  const n0 = v => v == null ? '—' : Math.round(v).toLocaleString('en-GB');
  const pct = (a, b) => a == null || !b ? '—' : Math.round(100 * a / b) + '%';
  function load(base) {
    if (!S.p) S.p = Promise.all(['registry/sources/lds/building-links.json', 'registry/sources/lds/area-context.json'].map(f => fetch(base + f).then(r => { if (!r.ok) throw new Error(f + ': HTTP ' + r.status); return r.json(); })))
      .then(([l, c]) => { S.links = l; S.ctx = c; return S; }).catch(e => { S.p = null; throw e; });
    return S.p;
  }
  const conf = (l, esc, kind) => { const p = ((S.links.meta.precision || {})[kind] || {})[l.key] || ''; return `<span class="small" title="${esc(p + (l.how ? '; ' + l.how : ''))}">(${esc(l.key)}${l.how ? ', ' + esc(l.how) : ''}, ${esc(l.confidence)}${l.fault ? '; ' + esc(l.fault) : ''})</span>`; };
  // heat, solar, area, venues, brownfield, points: a short block each; sources at the end
  function html(id, esc) {
    if (!S.links) return '';
    const L = S.links.buildings[id]; if (!L) return '';
    const M = S.links.meta, used = new Set(), out = [];
    if (L.heat) { used.add('heat-demand'); const kwh = L.heat.reduce((a, h) => a + (h.kwh_year || 0), 0), pk = L.heat.reduce((a, h) => a + (h.peak_kw || 0), 0), m = [...new Set(L.heat.map(h => h.method))];
      out.push(`<div><b>Heat demand</b> ${n0(kwh / 1000)} MWh a year, peak ${n0(pk)} kW <span class="small">(London Heat Map 2024, ${L.heat.length} TOID${L.heat.length > 1 ? 's' : ''}; ${esc(m.join(', '))})</span> ${conf(L.heat[0], esc, 'heat')}</div>`); }
    if (L.solar) { used.add('solar-opportunity'); const v = L.solar.reduce((a, s) => a + (s.avg_potential_m2_viable || 0), 0), t = L.solar.reduce((a, s) => a + (s.sum_total_potential || 0), 0), yr = [...new Set(L.solar.map(s => s.lidar_date))];
      out.push(`<div><b>Solar potential</b> ${n0(v)} m² viable roof, total potential ${n0(t)} <span class="small">(London Solar Opportunity Map 2025, units as published; roofs rated from LiDAR of ${esc(yr.join(', '))}${yr.some(y => +y <= 2012) ? ': a building finished later is not rated (F30)' : ''})</span> ${conf(L.solar[0], esc, 'solar')}</div>`); }
    const a = L.area && L.area[0];
    if (a) { used.add('statistical-boundaries'); const c = S.ctx && S.ctx.lsoa21[a.lsoa21];
      let t = `<div><b>Area</b> LSOA ${esc(c && c.name ? c.name + ' ' : '')}<code>${esc(a.lsoa21 || '—')}</code>${a.ward2018 ? `, ward <code>${esc(a.ward2018)}</code>` : ''} ${conf(a, esc, 'area')}</div>`;
      if (c) { used.add('census2021-lsoa-demography-migration'); used.add('census2021-lsoa-housing');
        const own = (c.owned_outright || 0) + (c.owned_mortgage || 0) + (c.shared_ownership || 0), soc = (c.social_la || 0) + (c.social_other || 0), priv = (c.private_rented || 0) + (c.private_other || 0);
        t += `<div class="small">2021 Census, this LSOA: ${n0(c.residents)} residents${c.residents_change_2011 != null ? ` (${c.residents_change_2011 >= 0 ? '+' : ''}${n0(c.residents_change_2011)} since 2011)` : ''}; ${n0(c.households)} households: owned ${pct(own, c.households)}, social rent ${pct(soc, c.households)}, private rent ${pct(priv, c.households)}; no car ${pct(c.no_car, c.households_cars)}; born in the UK ${pct(c.born_uk, c.residents)}; not deprived in any dimension ${pct(c.not_deprived, c.households_dep)}.</div>`; }
      out.push(t); }
    if (L.venues) { used.add('cultural-infrastructure'); out.push(`<div><b>Cultural venues</b> ${L.venues.map(v => `${esc(v.name)} <span class="small">${esc(v.type)}</span> ${conf(v, esc, 'venues')}`).join('; ')}</div>`); }
    if (L.brownfield) { used.add('brownfield-register'); out.push(`<div><b>Brownfield register</b> ${L.brownfield.map(v => `${esc(v.name || v.ref || 'site')} ${conf(v, esc, 'brownfield')}`).join('; ')}</div>`); }
    if (L.points) { const by = {}; for (const p of L.points) (by[p.set] ||= []).push(p);
      out.push(`<div><b>Records placed in this building</b> <span class="small">(record point inside the outline, medium)</span><ul class="small" style="margin:2px 0 0 16px;padding:0">${Object.entries(by).map(([k, ps]) => { used.add(k); const s = M.sources[k] || {}; return `<li>${esc((s.title || k).replace(/^London Datastore: /, ''))}: ${ps.length}${ps.some(p => p.name) ? ' (' + ps.filter(p => p.name).slice(0, 3).map(p => esc(p.name)).join('; ') + (ps.length > 3 ? '…' : '') + ')' : ''}</li>`; }).join('')}</ul></div>`); }
    if (!out.length) return '';
    const cred = [...used].map(k => M.sources[k]).filter(Boolean).map(s => `<a href="${esc(s.page)}">${esc(s.title.replace(/^London Datastore: /, ''))}</a> (${esc(s.licence)})`).join('; ');
    return `<div class="lds-building">${out.join('')}<div class="small" style="margin-top:4px">London Datastore: ${cred}. The GLA cannot warrant the quality or accuracy of the data. Join keys and confidence: <a href="https://github.com/danbri/londat/blob/main/cwplans/skills/cwplans-london-datastore/SKILL.md">method</a>.</div></div>`;
  }
  window.LdsBuilding = { load, html, get state() { return { loaded: !!S.links, buildings: S.links ? Object.keys(S.links.buildings).length : 0 }; } };
})();
