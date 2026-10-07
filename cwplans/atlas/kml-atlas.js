// Atlas map: KML and KMZ in and out (the Layers box: "Open KML/KMZ", a drop on the page, and "Export layer as KML").
// Uses the same parser and writer as the 3D page (../docklands/kml.js). Your files are read in this browser only; the
// export is a download (Blob). Popups are built with textContent: nothing from a file is run or loaded.
// Supported subset and lessons: skill docklands-3d-page, section "KML".
import { readKml, toGeoJSON, writeKml, placemarksFromGeoJSON, download, isKmlName, isKmlType, cssColor, plainText } from '../docklands/kml.js';

const $ = id => document.getElementById(id);
const S = { files: [], seq: 0 };
const OSM_CREDIT = '© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)';
const OSM_LAYERS = new Set(['buildings']);   // building outlines are OSM; the river layer's moorings, houseboats and ships are OSM points
const E = (tag, props = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(props)) if (k === 'text') e.textContent = v; else if (k === 'on') e.onclick = v; else e.setAttribute(k, v); for (const c of kids) if (c) e.append(c); return e; };
const mapReady = async () => { if (!(window.__atlas && __atlas.map)) { location.hash = 'map'; for (let i = 0; i < 100 && !(window.__atlas && __atlas.map); i++) await new Promise(r => setTimeout(r, 100)); } return window.__atlas && __atlas.map; };

function popup(F, p) {
  const box = E('div', { class: 'kmlPop' });
  box.append(E('b', { text: p.name || '(no name)' }), E('div', { class: 'small', text: `My KML · ${F.name}${p.path && p.path.length ? ' · ' + p.path.join(' / ') : ''}` }));
  if (p.description) box.append(E('div', { class: 'small', style: 'white-space:pre-wrap;overflow-wrap:anywhere;margin-top:4px', text: p.description }));
  if (p.extended && p.extended.length) { const t = E('table', { class: 'small' }); for (const [k, v] of p.extended) t.append(E('tr', {}, E('th', { style: 'position:static', text: k }), E('td', { text: v }))); box.append(t); }
  if (p.view) box.append(E('button', { type: 'button', text: 'Go to view', on: () => goView(p.view) }));
  return box;
}
function goView(v) {   // a KML Camera or LookAt as a map centre and zoom (the ground width the view covers)
  const map = __atlas.map, W = map.getSize().x || 800, range = v.type === 'LookAt' ? (v.range || 1000) : Math.max(100, v.alt || 500);
  const tilt = Math.min(80, v.tilt || 0) * Math.PI / 180, width = 2 * range * Math.tan(Math.PI / 6) / Math.max(.2, Math.cos(tilt));
  let lat = v.lat, lon = v.lon;
  if (v.type === 'Camera' && v.tilt > 5) { const d = (v.alt || 0) * Math.tan(tilt), h = v.heading * Math.PI / 180; lat += d * Math.cos(h) / 111320; lon += d * Math.sin(h) / (111320 * Math.cos(v.lat * Math.PI / 180)); }   // look at the point the camera faces
  const z = Math.log2(156543.03 * Math.cos(lat * Math.PI / 180) * W / width);
  map.setView([lat, lon], Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), Math.round(z))));
}
async function open(src, name) {
  try {
    const doc = await readKml(src, name), map = await mapReady(); if (!map) throw new Error('the map did not open');
    const F = { id: ++S.seq, name: doc.name || name, file: name, doc };
    const gj = toGeoJSON(doc), canvas = L.canvas({ padding: .3 });
    F.layer = L.geoJSON(gj, { renderer: canvas, filter: f => f.properties.visible,
      style: f => { const s = f.properties.style, set = s.set || {}, line = set.line ? s.line : [1, .8, 0, 1], poly = set.poly ? s.poly : [1, .8, 0, .4];
        return { color: cssColor(line), opacity: line[3], weight: Math.max(1, s.width || 2), fillColor: cssColor(poly), fillOpacity: s.fill === false ? 0 : poly[3], stroke: s.outline !== false || f.geometry.type !== 'Polygon' }; },
      pointToLayer: (f, ll) => { const s = f.properties.style, c = s.set && s.set.icon ? s.icon : [1, .8, 0, 1]; return L.circleMarker(ll, { renderer: canvas, radius: 6 * Math.max(.6, Math.min(2, s.scale || 1)), color: '#222', weight: 1, fillColor: cssColor(c), fillOpacity: .95 }); },
      onEachFeature: (f, l) => { l.on('click', e => L.popup({ maxWidth: 340 }).setLatLng(e.latlng).setContent(popup(F, f.properties)).openOn(map)); if (f.properties.name) l.bindTooltip(f.properties.name); } });
    // bindTooltip with a string treats it as HTML: give it a text node instead
    F.layer.eachLayer(l => { const t = l.getTooltip && l.getTooltip(); if (t) t.setContent(document.createTextNode(l.feature.properties.name)); });
    F.layer.addTo(map); S.files.push(F); list(); const b = F.layer.getBounds(); if (doc.view) goView(doc.view); else if (b.isValid()) map.fitBounds(b, { maxZoom: 18, padding: [20, 20] });
    const sk = Object.entries(doc.skipped).map(([k, n]) => `${n} ${k}`).join(', ');
    note(`${F.name}: ${doc.features.length} features${doc.hidden ? ` (${doc.hidden} hidden in the file)` : ''}${sk ? `; not supported: ${sk}` : ''}.`);
    return F;
  } catch (e) { note(`${name}: not opened (${e.message})`); console.warn('KML', name, e); return null; }
}
function note(t) { const el = $('kmlNoteA'); if (el) el.textContent = t; }
function list() {
  const el = $('kmlListA'); el.textContent = '';
  for (const F of S.files) {
    const cb = E('input', { type: 'checkbox' }); cb.checked = true; cb.onchange = () => cb.checked ? F.layer.addTo(__atlas.map) : __atlas.map.removeLayer(F.layer);
    const row = E('div', {}, E('label', {}, cb, ' ', E('span', { text: `${F.name} (${F.doc.features.length})` })));
    const r = E('div', { class: 'small' });
    if (F.doc.view) r.append(E('button', { type: 'button', text: 'Go to view', on: () => goView(F.doc.view) }), ' ');
    r.append(E('button', { type: 'button', text: 'Remove', on: () => { __atlas.map.removeLayer(F.layer); S.files.splice(S.files.indexOf(F), 1); list(); } }));
    row.append(r); el.append(row);
  }
  options();
}
function options() {   // the layers that are on now, then your own KML layers
  const sel = $('kmlLayerA'); if (!sel) return; const keep = sel.value; sel.textContent = '';
  for (const cb of document.querySelectorAll('#layerList input[data-layer]:checked')) { const k = cb.dataset.layer; if (__atlas.layers && __atlas.layers[k]) sel.append(E('option', { value: 'L:' + k, text: cb.parentElement.textContent.trim() })); }
  for (const F of S.files) sel.append(E('option', { value: 'K:' + F.id, text: 'My KML: ' + F.name }));
  if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
}
const hexA = (c, a = 1) => { let m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(c || ''); if (!m) return null; const h = m[1].length === 3 ? [...m[1]].map(x => x + x).join('') : m[1], n = parseInt(h, 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, a]; };
function exportLayer() {
  const v = $('kmlLayerA').value; if (!v) return note('Turn on a layer first.');
  const map = __atlas.map, b = map.getBounds(), c = map.getCenter(), label = $('kmlLayerA').selectedOptions[0].textContent, now = new Date();
  const pms = [], credits = new Set(); let osm = false;
  if (v.startsWith('K:')) { const F = S.files.find(f => 'K:' + f.id === v);
    for (const f of F.doc.features) pms.push({ name: f.name, description: f.description, extended: f.extended, view: f.view, geoms: f.geoms, style: { line: f.style.line, width: f.style.width, poly: f.style.poly, fill: f.style.fill, outline: f.style.outline, icon: f.style.icon } });
    credits.add(`Your file "${F.file}", under its own terms.`); }
  else { const k = v.slice(2), lay = __atlas.layers[k]; osm = OSM_LAYERS.has(k);
    const leaf = l => { if (l instanceof L.LayerGroup) { l.eachLayer(leaf); return; }
      if (!l.toGeoJSON) return; const f = l.toGeoJSON(); if (!f.geometry) return;
      // only what is in the map window now
      const lb = l.getBounds ? l.getBounds() : l.getLatLng ? L.latLngBounds([l.getLatLng(), l.getLatLng()]) : null; if (lb && !b.intersects(lb)) return;
      const props = { ...(f.properties || {}) }; if (l._b) { props.id = l._b.id; props.name = l._b.n || l._b.id; }
      const t = l.getTooltip && l.getTooltip(); if (!props.name && t) { const tc = t.getContent(); props.name = typeof tc === 'string' ? plainText(tc) : tc && tc.textContent || ''; }
      const [p] = placemarksFromGeoJSON({ type: 'Feature', geometry: f.geometry, properties: props }); if (!p) return;
      const o = l.options || {}, line = hexA(o.color, o.opacity ?? 1), poly = hexA(o.fillColor || o.color, o.fillOpacity ?? .2);
      p.style = { line: line || [1, .8, 0, 1], width: o.weight || 2, poly: poly || [1, .8, 0, .3], icon: poly ? [poly[0], poly[1], poly[2], 1] : [1, .8, 0, 1] };
      if (osm) p.extended.push(['geometry licence', OSM_CREDIT]); pms.push(p); };
    lay.eachLayer(leaf);
    credits.add(`Layer "${label}" of the Canary Wharf and Docklands atlas: sources and licences of every file at https://danbri.github.io/londat/cwplans/atlas/#data and https://github.com/danbri/londat/blob/main/cwplans/DATA-REGISTER.md.`);
    if (osm) credits.add('Building outlines: ' + OSM_CREDIT + '.'); }
  const view = { type: 'LookAt', lon: c.lng, lat: c.lat, alt: 0, heading: 0, tilt: 0, range: Math.max(200, map.distance(b.getNorthWest(), b.getNorthEast()) / 1.15), altitudeMode: 'clampToGround' };
  const desc = `Exported from the atlas map (https://danbri.github.io/londat/cwplans/atlas/#map) on ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC: layer "${label}", ${pms.length} features in the map window.\n\nCredits and licences:\n- ${[...credits].join('\n- ')}\n- Basemap (not exported): ${OSM_CREDIT}.`;
  const text = writeKml({ name: `Atlas: ${label}`, description: desc, view, folders: [{ name: label, placemarks: pms }] });
  const fn = `atlas-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}-${now.toISOString().slice(0, 10)}.kml`;
  download(text, fn); note(`Exported ${pms.length} features as ${fn}.`); return { text, count: pms.length, filename: fn, osm };
}
async function openFiles(files) { for (const f of files) if (isKmlName(f.name) || isKmlType(f.type)) await open(f, f.name); }

// ---------- the page's side
{
  const box = $('layers');
  if (box) {
    box.insertAdjacentHTML('beforeend', `<div id="kmlBoxA" style="border-top:1px solid var(--line);margin-top:8px;padding-top:6px">
      <b class="small">KML</b> <button type="button" id="kmlOpenA">Open KML/KMZ</button>
      <input type="file" id="kmlFileA" accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" multiple hidden>
      <div id="kmlListA"></div>
      <div class="small" style="margin-top:4px"><label>Export <select id="kmlLayerA" style="max-width:150px"></select></label> <button type="button" id="kmlExportA">as KML</button></div>
      <p class="small" id="kmlNoteA">Open or drop a KML or KMZ file: it stays in this browser. Export writes the features of a layer in the map window, with their credits.</p></div>`);
    const inp = $('kmlFileA'); $('kmlOpenA').onclick = () => inp.click();
    inp.onchange = async () => { const fs = [...inp.files]; inp.value = ''; await openFiles(fs); };
    $('kmlExportA').onclick = () => { try { exportLayer(); } catch (e) { note('Export failed: ' + e.message); } };
    $('kmlLayerA').onfocus = $('kmlLayerA').onpointerdown = options;
    document.addEventListener('change', e => { if (e.target.closest && e.target.closest('#layerList')) setTimeout(options, 300); });
  }
  // the window lock in index.html refuses drops; a .kml or .kmz is taken here (registered later, so this dropEffect wins)
  addEventListener('dragover', e => { const it = [...((e.dataTransfer && e.dataTransfer.items) || [])]; if (it.some(i => i.kind === 'file' && (isKmlType(i.type) || !i.type || /xml|zip/.test(i.type)))) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  addEventListener('drop', e => { const fs = [...((e.dataTransfer && e.dataTransfer.files) || [])].filter(f => isKmlName(f.name) || isKmlType(f.type)); if (!fs.length) return; e.preventDefault(); openFiles(fs); });
  globalThis.AtlasKML = { open, exportLayer, goView, options, get S() { return S; } };
}
