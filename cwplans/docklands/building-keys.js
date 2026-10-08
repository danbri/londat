// The OpenStreetMap key of every building of the 3D model: the record card of a building with no registry record,
// search by OSM name, house name or address, and share links with id=osm:<w|r><id>. Data: data/building-keys.json
// (tools/key-model-buildings.mjs), loaded on the first tap on such a building, the first search, or a shared link.
// It reaches the page only through globalThis.DocklandsKeysCtx (set before window.__docklands).
// Skill: docklands-3d-page, "Building keys".
(() => {
  const C = () => globalThis.DocklandsKeysCtx;
  const K = { data: null, ids: null, by: null, parts: null, ok: false, sel: null, loading: null };
  const SRC = ['LiDAR (EA, 2022)', 'OSM levels', 'OSM height or Wikidata', 'a guess', 'OSM levels (newer than the LiDAR)'];
  function load() {
    return K.loading ||= fetch('data/building-keys.json').then(r => { if (!r.ok) throw new Error('building-keys.json ' + r.status); return r.json(); }).then(d => {
      const c = C(); K.data = d; K.ids = d.ids.split(','); K.ok = !!d.model && d.model.fp === c.MFP && K.ids.length === c.A.buildings.length;
      K.by = new Map(); K.parts = new Map();
      K.ids.forEach((id, i) => { if (!id) return; if (!K.by.has(id)) K.by.set(id, []); K.by.get(id).push(i); const p = d.osm[id]?.p; if (p) { if (!K.parts.has(p)) K.parts.set(p, []); K.parts.get(p).push(i); } });
      if (!K.ok) console.warn('building-keys.json was made for another area.js; run tools/key-model-buildings.mjs again');
      return K;
    }).catch(e => { K.loading = null; throw e; });
  }
  const facts = id => (K.data && K.data.osm[id]) || {};
  const osmUrl = id => `https://www.openstreetmap.org/${id[0] === 'r' ? 'relation' : 'way'}/${id.slice(1)}`;
  const nameOf = id => { const f = facts(id); return f.n && f.h && f.n !== f.h ? `${f.n} (${f.h})` : f.n || f.h || ''; };
  const typeOf = b => b ? b.replace(/^part:/, '').replace(/_/g, ' ') : '';
  // the building a tap or a link means: a part stands for its parent (all its parts are drawn), else the element itself
  const groupOf = id => { const p = facts(id).p; return p && K.parts.get(p) ? [p, K.parts.get(p)] : [id, K.by.get(id) || []]; };
  function centre(idx) { const c = C(); let sx = 0, sz = 0, n = 0; for (const i of idx) { const f = c.dec(c.A.buildings[i].p); for (let j = 0; j < f.length; j += 2) { sx += f[j]; sz += f[j + 1]; n++; } } return n ? [sx / n, sz / n] : [0, 0]; }
  async function select(i) {
    const c = C();
    try { await load(); } catch (e) { c.toast('The building keys could not be loaded: ' + e.message); return; }
    if (!K.ok) { c.toast('The building keys are out of date for this model (no OSM record yet).'); return; }
    const id0 = K.ids[i]; if (!id0) return;
    const [id, idx] = groupOf(id0), f = facts(id), esc = c.esc;
    c.clearSelection(); K.sel = id;
    const M = new c.Mesh(); for (const j of idx) { const b = c.A.buildings[j]; c.outline(M, b, b.b + (b.mh || 0), b.b + c.heightOf(b, j) + .5, [1, .25, .65]); }
    c.L.hi = M.upload();
    const b = c.A.buildings[i], top = Math.max(...idx.map(j => c.A.buildings[j].b + c.heightOf(c.A.buildings[j], j))), ground = Math.min(...idx.map(j => c.A.buildings[j].b));
    const [x, z] = centre(idx), name = nameOf(id) || f.a || (typeOf(f.b) ? typeOf(f.b)[0].toUpperCase() + typeOf(f.b).slice(1) : 'Building');
    const parts = idx.length > 1 ? `${idx.length} parts in the model` : '', fac = c.facadeOf(idx), dm = c.modelOf ? c.modelOf(idx) : null;
    c.info.innerHTML = `<b>${esc(name)}</b> <span class="small">OSM ${id[0] === 'r' ? 'relation' : 'way'} ${esc(id.slice(1))}${typeOf(f.b) ? ' · ' + esc(typeOf(f.b)) : ''}${parts ? ' · ' + parts : ''}</span>
      ${f.a || f.pc ? `<div class="small">Address: ${esc([f.a, f.pc].filter(Boolean).join(', '))}</div>` : ''}
      <div class="small">Height: 3D model ${Math.round((top - ground) * 10) / 10} m above the ground (${esc(SRC[b.s] || 'unknown')}) · roof ${Math.round(top)} m OD · ground ${ground} m OD${f.l ? ` · ${esc(f.l)} levels (OSM)` : ''}</div>
      ${dm ? `<div class="small">Detailed model: ${dm.parts.length} parts, ${dm.triangles.toLocaleString()} triangles, top ${dm.top_m_od} m OD, made ${esc(dm.made)} from a contributed photo and the LiDAR (<a href="https://github.com/danbri/londat/blob/main/${esc(dm.source.description)}" target="_blank" rel="noopener">evidence</a> · <a href="https://github.com/danbri/londat/blob/main/${esc(dm.source.glb)}" target="_blank" rel="noopener">glTF file</a>). Layers &gt; Show &gt; Detailed models.</div>` : ''}
      ${fac ? `<div class="small">Facade: ${esc(fac.what || 'a tile from a photo')}${fac.page ? ` (<a href="${esc(fac.page)}" target="_blank" rel="noopener">photos</a>)` : ''}</div>` : ''}
      <div class="small">No registry record: the registry covers the Canary Wharf box. Facts from OpenStreetMap (© OpenStreetMap contributors, ODbL).</div>
      ${c.routeBtns(Math.round(x), Math.round(z), name)}
      <div class="small" style="margin-top:6px"><a href="${osmUrl(id)}" target="_blank" rel="noopener">OSM</a> · <a href="../kg/#e=id:osm${esc(id)}">knowledge graph</a>${f.wd ? ` · <a href="https://www.wikidata.org/wiki/${esc(f.wd)}" target="_blank" rel="noopener">Wikidata</a>` : ''} · <a href="#" id="unselect">clear</a></div>`;
    c.openPane('paneInfo');
    const u = document.getElementById('unselect'); if (u) u.onclick = e => { e.preventDefault(); c.clearSelection(); c.resetInfo(); c.draw(); };
    c.draw();
  }
  async function selectId(id) { await load(); if (!K.ok) return false; const idx = K.by.get(id) || K.parts.get(id); if (!idx) return false; await select(idx[0]); return true; }
  // search items for the page's search box: OSM name, house name or address of buildings with no registry record
  function search(q, has) {
    if (!K.ok) return [];
    const c = C(), out = [];
    for (const [id, f] of Object.entries(K.data.osm)) {
      const t = nameOf(id) || f.a; if (!t || !(has(f.n) || has(f.h) || has(f.a))) continue;
      const idx = K.by.get(id) || K.parts.get(id); if (!idx || idx.some(i => c.regOf[i] >= 0)) continue;   // registry buildings are found by the registry
      out.push({ t, k: f.n || f.h ? 'building (OSM)' : 'address (OSM)', go: () => { select(idx[0]); const [x, z] = centre(idx); c.flyTo(x, z, Math.max(350, Math.min(c.cam.dist, 900))); } });
      if (out.length >= 40) break;
    }
    return out;
  }
  globalThis.DocklandsKeys = { load, select, selectId, search, get sel() { return K.sel; }, set sel(v) { K.sel = v; }, get state() { return { ok: K.ok, n: K.ids ? K.ids.length : 0, sel: K.sel, fp: K.data && K.data.model && K.data.model.fp }; }, idOf: i => (K.ids ? K.ids[i] : null) };
})();
