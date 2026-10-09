// Building keys (layer "keys", no menu entry) of the Three.js port: the WebGL page's building-keys.js card for a building
// with no registry record. data/building-keys.json (tools/key-model-buildings.mjs; loaded on the first tap on such a
// building) gives every model building its OSM way or relation. The card: the name (OSM name, else house name, else the
// parent's for a part, else the address, else the type), OSM type and id, address, the model height and its source,
// roof and ground in m OD, OSM levels, "No registry record", and the links (OSM, knowledge graph, Wikidata). A part stands
// for its parent: every part of the building is outlined. main.js asks the card hooks in layer order, so the registry
// card (layers/registry.js) comes first. Skill: docklands-3d-page, "Building keys" and "Three.js port".
const SRC = ['LiDAR (EA, 2022)', 'OSM levels', 'OSM height or Wikidata', 'a guess', 'OSM levels (newer than the LiDAR)'];

export default {
  id: 'keys', label: null, on: true,
  async init(ctx) {
    const { THREE, A, esc, dec, loadJSON, scene, draw } = ctx, CW = ctx.WEBGL.replace(/docklands\/$/, '');
    const MFP = `${A.buildings.length}:${Array.from(A.buildings[0].p.slice(0, 6)).join('.')}:${Array.from(A.buildings.at(-1).p.slice(0, 6)).join('.')}`;
    const K = { data: null, ids: null, by: null, parts: null, ok: false, loading: null };
    const load = () => K.loading || (K.loading = loadJSON(ctx.DATA + 'building-keys.json').then(d => {
      K.data = d; K.ids = d.ids.split(','); K.ok = !!d.model && d.model.fp === MFP && K.ids.length === A.buildings.length; K.by = new Map(); K.parts = new Map();
      K.ids.forEach((id, i) => { if (!id) return; if (!K.by.has(id)) K.by.set(id, []); K.by.get(id).push(i); const p = d.osm[id]?.p; if (p) { if (!K.parts.has(p)) K.parts.set(p, []); K.parts.get(p).push(i); } });
      return K; }).catch(e => { K.loading = null; throw e; }));
    const facts = id => (K.data && K.data.osm[id]) || {};
    const osmUrl = id => `https://www.openstreetmap.org/${id[0] === 'r' ? 'relation' : 'way'}/${id.slice(1)}`;
    const nameOf = id => { const f = facts(id); return f.n && f.h && f.n !== f.h ? `${f.n} (${f.h})` : f.n || f.h || ''; };
    const typeOf = b => b ? b.replace(/^part:/, '').replace(/_/g, ' ') : '';
    const groupOf = id => { const p = facts(id).p; return p && K.parts.get(p) ? [p, K.parts.get(p)] : [id, K.by.get(id) || []]; };

    // every part of the building outlined (main.js outlines the tapped part only)
    const mat = new THREE.MeshBasicNodeMaterial({ color: 0xff40a6, transparent: true, opacity: .28, depthWrite: false, side: THREE.DoubleSide });
    const hi = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); hi.visible = false; hi.renderOrder = 3; scene.add(hi);
    function outline(idx) {
      const pos = [], ind = [];
      for (const j of idx) { const b = A.buildings[j], f = dec(b.p), n = b.holes && b.holes.length ? b.holes[0] : f.length / 2, y0 = b.b + (b.mh || 0) - .3, y1 = b.b + b.h + .5;
        for (let k = 0; k < n; k++) { const k2 = (k + 1) % n, o = pos.length / 3; pos.push(f[2 * k], y0, f[2 * k + 1], f[2 * k2], y0, f[2 * k2 + 1], f[2 * k2], y1, f[2 * k2 + 1], f[2 * k], y1, f[2 * k + 1]); ind.push(o, o + 1, o + 2, o, o + 2, o + 3); } }
      const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); G.setIndex(ind); G.computeBoundingSphere();
      hi.geometry.dispose(); hi.geometry = G; hi.visible = true; draw();
    }
    const card = document.getElementById('card');
    if (card) new MutationObserver(() => { if (card.hidden && hi.visible) { hi.visible = false; draw(); } }).observe(card, { attributes: true, attributeFilter: ['hidden'] });

    async function cardHtml(i) {
      try { await load(); } catch (e) { return null; }
      if (!K.ok) return null;
      const id0 = K.ids[i]; if (!id0) return null;
      const [id, idx] = groupOf(id0), f = facts(id), b = A.buildings[i];
      if (idx.length > 1) outline(idx); else { hi.visible = false; }
      const top = Math.max(...idx.map(j => A.buildings[j].b + A.buildings[j].h)), ground = Math.min(...idx.map(j => A.buildings[j].b));
      const name = nameOf(id) || f.a || (typeOf(f.b) ? typeOf(f.b)[0].toUpperCase() + typeOf(f.b).slice(1) : 'Building');
      return `<h2>${esc(name)}</h2><p class="small">OSM ${id[0] === 'r' ? 'relation' : 'way'} ${esc(id.slice(1))}${typeOf(f.b) ? ' · ' + esc(typeOf(f.b)) : ''}${idx.length > 1 ? ` · ${idx.length} parts in the model` : ''}</p>
        ${f.a || f.pc ? `<p class="small">Address: ${esc([f.a, f.pc].filter(Boolean).join(', '))}</p>` : ''}
        <p class="small">Height: 3D model ${Math.round((top - ground) * 10) / 10} m above the ground (${esc(SRC[b.s] || 'unknown')}) · roof ${Math.round(top)} m OD · ground ${ground} m OD${f.l ? ` · ${esc(f.l)} levels (OSM)` : ''}</p>
        <p class="small">No registry record: the registry covers the Canary Wharf box. Facts from OpenStreetMap (© OpenStreetMap contributors, ODbL). Model index ${i}.</p>
        <p class="small"><a href="${osmUrl(id)}" target="_blank" rel="noopener">OSM</a> · <a href="${CW}kg/#e=id:osm${esc(id)}">knowledge graph</a>${f.wd ? ` · <a href="https://www.wikidata.org/wiki/${esc(f.wd)}" target="_blank" rel="noopener">Wikidata</a>` : ''} · <a href="${ctx.WEBGL}#v=1&id=osm:${esc(id)}">open in the WebGL page</a></p>`;
    }
    ctx.addCard(i => (ctx.registry && ctx.registry.regOf[i] >= 0) ? null : cardHtml(i));
    const api = { load, cardHtml, get state() { return { ok: K.ok, n: K.ids ? K.ids.length : 0 }; }, idOf: i => (K.ids ? K.ids[i] : null), indexOf: id => (K.by && (K.by.get(id) || K.parts.get(id))) || null };
    ctx.keys = api;
    return api;
  },
};
