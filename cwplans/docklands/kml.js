// KML 2.2 / KMZ reader and KML writer for the Docklands 3D page (kml-layer.js) and the atlas (../atlas/kml-atlas.js).
// An ES module with no dependencies: XML through DOMParser (never regular expressions on the markup), KMZ through a small
// zip reader over the central directory and the browser's DecompressionStream('deflate-raw'), descriptions turned into
// plain text in an inert HTML document (scripts do not run, images do not load). Nothing here touches the network.
//
//   import { readKml, parseKml, writeKml, toGeoJSON, placemarksFromGeoJSON, kmlColor } from './kml.js';
//   const doc = await readKml(fileOrArrayBuffer, name);   // .kml or .kmz (detected by the zip signature, not the name)
//
// The supported subset, what is left out, and the lessons: skill docklands-3d-page, section "KML".

const KMLNS = 'http://www.opengis.net/kml/2.2', GXNS = 'http://www.google.com/kml/ext/2.2';
const kids = (el, n) => el ? [...el.children].filter(c => c.localName === n) : [];
const kid = (el, n) => el ? [...el.children].find(c => c.localName === n) || null : null;
const txt = (el, n) => { const k = kid(el, n); return k ? k.textContent.trim() : null; };
const num = (el, n) => { const t = txt(el, n); if (t == null || t === '') return null; const v = Number(t); return Number.isFinite(v) ? v : null; };
const bool = (el, n, d) => { const t = txt(el, n); return t == null ? d : !(t === '0' || t.toLowerCase() === 'false'); };

// ---------- colours: KML writes aabbggrr (alpha, blue, green, red), hex
export function kmlColor(s, fallback = null) {
  const t = String(s || '').trim().replace(/^#/, '');
  if (t.length !== 8 || !/^[0-9a-fA-F]{8}$/.test(t)) return fallback;
  const b = i => parseInt(t.slice(i, i + 2), 16) / 255;
  return [b(6), b(4), b(2), b(0)];   // [r, g, b, a], 0 to 1
}
export function toKmlColor([r, g, b, a = 1]) {
  const h = v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return h(a) + h(b) + h(g) + h(r);
}
export const cssColor = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

// ---------- descriptions: KML allows HTML (often in CDATA). It becomes plain text here; callers show it with textContent.
const BLOCK = new Set(['p', 'div', 'br', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'ul', 'ol', 'dt', 'dd', 'hr', 'pre']);
export function plainText(s) {
  if (s == null) return '';
  s = String(s); if (!s.includes('<')) return s.trim();   // no markup: already plain (XML entities were decoded by the parser)
  const d = new DOMParser().parseFromString(s, 'text/html');   // an inert document: no script runs, nothing loads
  for (const el of d.querySelectorAll('script,style,template,noscript,iframe,object,embed')) el.remove();
  let out = '';
  const walk = n => {
    if (n.nodeType === 3) { out += n.nodeValue.replace(/\s+/g, ' '); return; }
    if (n.nodeType !== 1) return; const t = n.localName;
    if (t === 'br') { out += '\n'; return; }
    for (const c of n.childNodes) walk(c);
    if (t === 'a') { const h = n.getAttribute('href') || ''; if (/^https?:\/\//i.test(h) && !n.textContent.includes(h)) out += ` (${h})`; }
    if (t === 'td' || t === 'th') out += ' ';
    if (BLOCK.has(t)) out += '\n';
  };
  walk(d.body);
  return out.split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- coordinates: "lon,lat[,alt]" tuples separated by white space
function coords(el) {
  const c = kid(el, 'coordinates'); if (!c) return [];
  const out = [];
  for (const t of c.textContent.trim().replace(/\s*,\s*/g, ',').split(/\s+/)) {
    if (!t) continue; const p = t.split(',').map(Number);
    if (p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[1]) <= 90) out.push([p[0], p[1], Number.isFinite(p[2]) ? p[2] : 0]);
  }
  return out;
}
const altMode = el => txt(el, 'altitudeMode') || null;   // kml:altitudeMode and gx:altitudeMode share the local name

// ---------- geometry: Point, LineString, LinearRing, Polygon (outer + inner rings), MultiGeometry, gx:Track, gx:MultiTrack
function geometries(el, out, skipped) {
  for (const g of el.children) {
    const n = g.localName, base = { altitudeMode: altMode(g), extrude: bool(g, 'extrude', false) };
    if (n === 'Point') { const c = coords(g); if (c.length) out.push({ type: 'Point', coords: c[0], ...base }); }
    else if (n === 'LineString' || n === 'LinearRing') { const c = coords(g); if (c.length >= 2) out.push({ type: 'LineString', coords: c, ...base, tessellate: bool(g, 'tessellate', false) }); }
    else if (n === 'Polygon') {
      const ring = b => coords(kid(b, 'LinearRing'));
      const outer = kids(g, 'outerBoundaryIs').map(ring)[0] || [];
      const inner = kids(g, 'innerBoundaryIs').flatMap(b => kids(b, 'LinearRing').map(r => coords(r))).filter(r => r.length >= 3);
      if (outer.length >= 3) out.push({ type: 'Polygon', rings: [outer, ...inner], ...base });
    }
    else if (n === 'MultiGeometry') geometries(g, out, skipped);
    else if (n === 'Track') {   // gx:Track: a line through its gx:coord points ("lon lat alt")
      const c = kids(g, 'coord').map(k => k.textContent.trim().split(/\s+/).map(Number)).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1])).map(p => [p[0], p[1], Number.isFinite(p[2]) ? p[2] : 0]);
      if (c.length >= 2) out.push({ type: 'LineString', coords: c, ...base, track: true }); else if (c.length === 1) out.push({ type: 'Point', coords: c[0], ...base });
    }
    else if (n === 'MultiTrack') geometries(g, out, skipped);
    else if (n === 'Model') skipped.Model = (skipped.Model || 0) + 1;
  }
  return out;
}

// ---------- views: Camera and LookAt (gx:horizFov kept when present)
function view(el) {
  const v = kid(el, 'Camera') || kid(el, 'LookAt'); if (!v) return null;
  const o = { type: v.localName, lon: num(v, 'longitude'), lat: num(v, 'latitude'), alt: num(v, 'altitude') || 0, heading: num(v, 'heading') || 0, tilt: num(v, 'tilt') || 0,
    roll: num(v, 'roll') || 0, range: num(v, 'range'), altitudeMode: altMode(v) || 'clampToGround', horizFov: num(v, 'horizFov') };
  return o.lon == null || o.lat == null ? null : o;
}

// ---------- styles: Style and StyleMap by id (normal pair), inline Style; Line, Poly, Icon and Label colours
const DEFAULT_STYLE = { line: [1, 1, 1, 1], width: 1, poly: [1, 1, 1, 1], fill: true, outline: true, icon: [1, 1, 1, 1], scale: 1, label: [1, 1, 1, 1], set: {} };
function readStyle(s, into) {
  const o = { ...into, set: { ...into.set } }, ls = kid(s, 'LineStyle'), ps = kid(s, 'PolyStyle'), is = kid(s, 'IconStyle'), lb = kid(s, 'LabelStyle');
  if (ls) { const c = kmlColor(txt(ls, 'color')); if (c) { o.line = c; o.set.line = true; } const w = num(ls, 'width'); if (w != null) o.width = w; }
  if (ps) { const c = kmlColor(txt(ps, 'color')); if (c) { o.poly = c; o.set.poly = true; } o.fill = bool(ps, 'fill', o.fill); o.outline = bool(ps, 'outline', o.outline); }
  if (is) { const c = kmlColor(txt(is, 'color')); if (c) { o.icon = c; o.set.icon = true; } const sc = num(is, 'scale'); if (sc != null) o.scale = sc; }
  if (lb) { const c = kmlColor(txt(lb, 'color')); if (c) o.label = c; }
  return o;
}
function styleResolver(doc) {
  const byId = new Map();
  for (const n of ['Style', 'StyleMap']) for (const el of doc.getElementsByTagNameNS('*', n)) { const id = el.getAttribute('id'); if (id && !byId.has(id)) byId.set(id, el); }
  const resolve = (url, base, depth = 0) => {
    if (!url || depth > 4) return base; const h = url.indexOf('#'); if (h < 0) return base;
    if (h > 0) return base;   // a style in another file: not fetched
    const el = byId.get(url.slice(1)); if (!el) return base;
    if (el.localName === 'Style') return readStyle(el, base);
    const pair = kids(el, 'Pair').find(p => (txt(p, 'key') || 'normal') === 'normal') || kids(el, 'Pair')[0]; if (!pair) return base;
    let o = resolve(txt(pair, 'styleUrl'), base, depth + 1); const inl = kid(pair, 'Style'); if (inl) o = readStyle(inl, o); return o;
  };
  return feat => { let o = resolve(txt(feat, 'styleUrl'), DEFAULT_STYLE); for (const s of kids(feat, 'Style')) o = readStyle(s, o); return o; };
}

// ---------- ExtendedData: Data (name, displayName, value) and SchemaData/SimpleData (Schema SimpleField displayName)
function extended(el, schemas) {
  const ed = kid(el, 'ExtendedData'), rows = []; if (!ed) return rows;
  for (const d of kids(ed, 'Data')) rows.push([txt(d, 'displayName') ? plainText(txt(d, 'displayName')) : d.getAttribute('name') || '', txt(d, 'value') ?? '']);
  for (const sd of kids(ed, 'SchemaData')) { const sch = schemas.get((sd.getAttribute('schemaUrl') || '').replace(/^#/, '')) || new Map();
    for (const s of kids(sd, 'SimpleData')) { const k = s.getAttribute('name') || ''; rows.push([sch.get(k) || k, s.textContent.trim()]); } }
  return rows.slice(0, 300);
}

// ---------- the document
const UNSUPPORTED = ['GroundOverlay', 'ScreenOverlay', 'PhotoOverlay', 'Tour', 'NetworkLink'];
export function parseKml(text, name = 'KML') {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err || !doc.documentElement || doc.documentElement.localName !== 'kml') throw new Error(err ? 'not well-formed XML: ' + err.textContent.trim().split('\n')[0].slice(0, 160) : 'no <kml> root element');
  const style = styleResolver(doc), schemas = new Map(), skipped = {}, features = [], networkLinks = [], folders = { n: 0 };
  for (const s of doc.getElementsByTagNameNS('*', 'Schema')) { const m = new Map(); for (const f of kids(s, 'SimpleField')) m.set(f.getAttribute('name'), txt(f, 'displayName') || f.getAttribute('name')); schemas.set(s.getAttribute('id') || s.getAttribute('name') || '', m); }
  const root = doc.documentElement, top = kid(root, 'Document') || kid(root, 'Folder');
  const out = { name: (top && txt(top, 'name')) || name, description: top ? plainText(txt(top, 'description')) : '', view: top ? view(top) : null,
    features, folders, skipped, networkLinks, hidden: 0, version: root.namespaceURI === KMLNS ? '2.2' : root.namespaceURI || 'no namespace' };
  const walk = (el, path, visible) => {
    for (const c of el.children) {
      const n = c.localName, vis = visible && bool(c, 'visibility', true);
      if (n === 'Document' || n === 'Folder') { if (c !== top) folders.n++; walk(c, c === top ? path : [...path, txt(c, 'name') || n], vis); }
      else if (n === 'Placemark') {
        const g = geometries(c, [], skipped); if (!g.length) { skipped['Placemark with no geometry'] = (skipped['Placemark with no geometry'] || 0) + 1; continue; }
        if (!vis) out.hidden++;
        features.push({ id: c.getAttribute('id') || null, name: plainText(txt(c, 'name')) || '', description: plainText(txt(c, 'description')), snippet: plainText(txt(c, 'Snippet')),
          address: txt(c, 'address'), extended: extended(c, schemas), style: style(c), geoms: g, path, visible: vis, view: view(c) });
      }
      else if (UNSUPPORTED.includes(n)) { skipped[n] = (skipped[n] || 0) + 1; if (n === 'NetworkLink') { const l = kid(c, 'Link') || kid(c, 'Url'); networkLinks.push({ name: txt(c, 'name') || '', href: l ? txt(l, 'href') : null }); } }
    }
  };
  walk(root, [], true);
  return out;
}

// ---------- KMZ: a zip; the first .kml at the shallowest depth (doc.kml by convention) is the document
async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('this browser cannot unpack KMZ (no DecompressionStream); unzip it and open doc.kml');
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
export async function unzip(buf, want = n => true) {
  const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file (no end of central directory)');
  const count = dv.getUint16(eocd + 10, true), files = []; let p = dv.getUint32(eocd + 16, true);
  for (let k = 0; k < count && p + 46 <= u8.length; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip central directory is damaged');
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen)); files.push({ name, method, csize, off, flags: dv.getUint16(p + 8, true) }); p += 46 + nlen + xlen + clen;
  }
  const out = new Map();
  for (const f of files) {
    if (f.name.endsWith('/') || !want(f.name)) continue;
    if (f.flags & 1) throw new Error(`${f.name} is encrypted`);
    const lh = f.off; if (dv.getUint32(lh, true) !== 0x04034b50) throw new Error(`zip entry ${f.name} is damaged`);
    const start = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true), data = u8.subarray(start, start + f.csize);
    if (f.method === 0) out.set(f.name, data); else if (f.method === 8) out.set(f.name, await inflateRaw(data)); else throw new Error(`${f.name}: zip method ${f.method} not supported`);
  }
  return { names: files.map(f => f.name), files: out };
}
const isZip = u8 => u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 3 && u8[3] === 4;
export async function readKml(src, name = '') {
  const buf = src instanceof ArrayBuffer ? src : ArrayBuffer.isView(src) ? src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) : await src.arrayBuffer();
  name = name || src.name || 'KML';
  const u8 = new Uint8Array(buf);
  if (isZip(u8)) {
    const { names } = await unzip(buf, () => false);
    const kmls = names.filter(n => /\.kml$/i.test(n)).sort((a, b) => (a.split('/').length - b.split('/').length) || (b.toLowerCase().endsWith('doc.kml') - a.toLowerCase().endsWith('doc.kml')));
    if (!kmls.length) throw new Error('the KMZ holds no .kml file');
    const { files } = await unzip(buf, n => n === kmls[0]);
    const d = parseKml(new TextDecoder().decode(files.get(kmls[0])), name.replace(/\.kmz$/i, '')); d.kmz = { entry: kmls[0], files: names.length }; return d;
  }
  return parseKml(new TextDecoder().decode(u8), name.replace(/\.kml$/i, ''));
}
export const isKmlName = n => /\.(kml|kmz)$/i.test(n || '');
export const isKmlType = t => /google-earth\.km[lz]|^application\/(vnd\.)?km[lz]/i.test(t || '');

// ---------- to GeoJSON (for Leaflet): one Feature per Placemark; several geometries become a GeometryCollection
const gjGeom = g => g.type === 'Point' ? { type: 'Point', coordinates: g.coords } : g.type === 'LineString' ? { type: 'LineString', coordinates: g.coords }
  : { type: 'Polygon', coordinates: g.rings.map(r => { const c = r.slice(); const a = c[0], b = c[c.length - 1]; if (a[0] !== b[0] || a[1] !== b[1]) c.push(a); return c; }) };
export function toGeoJSON(d) {
  return { type: 'FeatureCollection', features: d.features.map((f, i) => ({ type: 'Feature', id: f.id || i,
    geometry: f.geoms.length === 1 ? gjGeom(f.geoms[0]) : { type: 'GeometryCollection', geometries: f.geoms.map(gjGeom) },
    properties: { name: f.name, description: f.description, extended: f.extended, style: f.style, path: f.path, visible: f.visible, view: f.view, index: i } })) };
}

// ---------- writing
const X = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const fx = (v, d) => Number.isFinite(v) ? +v.toFixed(d) : 0;
const tuple = c => `${fx(c[0], 7)},${fx(c[1], 7)},${fx(c[2] || 0, 2)}`;
function geomXml(g, ind) {
  const am = g.altitudeMode && g.altitudeMode !== 'clampToGround' ? `<altitudeMode>${X(g.altitudeMode)}</altitudeMode>` : '', ex = g.extrude ? '<extrude>1</extrude>' : '';
  if (g.type === 'Point') return `${ind}<Point>${ex}${am}<coordinates>${tuple(g.coords)}</coordinates></Point>`;
  if (g.type === 'LineString') return `${ind}<LineString>${ex}${g.tessellate !== false ? '<tessellate>1</tessellate>' : ''}${am}<coordinates>${g.coords.map(tuple).join(' ')}</coordinates></LineString>`;
  if (g.type === 'Polygon') { const ring = r => { const c = r.slice(); const a = c[0], b = c[c.length - 1]; if (a[0] !== b[0] || a[1] !== b[1] || (a[2] || 0) !== (b[2] || 0)) c.push(a); return `<LinearRing><coordinates>${c.map(tuple).join(' ')}</coordinates></LinearRing>`; };
    return `${ind}<Polygon>${ex}${g.extrude || g.altitudeMode === 'absolute' || g.altitudeMode === 'relativeToGround' ? '' : '<tessellate>1</tessellate>'}${am}<outerBoundaryIs>${ring(g.rings[0])}</outerBoundaryIs>${g.rings.slice(1).map(r => `<innerBoundaryIs>${ring(r)}</innerBoundaryIs>`).join('')}</Polygon>`; }
  return '';
}
export function viewXml(v, ind = '  ') {
  if (!v) return '';
  const common = `<longitude>${fx(v.lon, 7)}</longitude><latitude>${fx(v.lat, 7)}</latitude><altitude>${fx(v.alt, 2)}</altitude><heading>${fx(v.heading, 3)}</heading><tilt>${fx(v.tilt, 3)}</tilt>`;
  const fov = Number.isFinite(v.horizFov) ? `<gx:horizFov>${fx(v.horizFov, 3)}</gx:horizFov>` : '';
  if (v.type === 'LookAt') return `${ind}<LookAt>${fov}${common}<range>${fx(v.range, 1)}</range><altitudeMode>${X(v.altitudeMode || 'clampToGround')}</altitudeMode></LookAt>\n`;
  return `${ind}<Camera>${fov}${common}<roll>${fx(v.roll || 0, 3)}</roll><altitudeMode>${X(v.altitudeMode || 'absolute')}</altitudeMode></Camera>\n`;
}
function styleXml(id, s) {
  const p = [];
  if (s.icon) p.push(`<IconStyle><color>${toKmlColor(s.icon)}</color><scale>${fx(s.scale ?? 1, 2)}</scale></IconStyle>`);
  if (s.line) p.push(`<LineStyle><color>${toKmlColor(s.line)}</color><width>${fx(s.width ?? 2, 1)}</width></LineStyle>`);
  if (s.poly) p.push(`<PolyStyle><color>${toKmlColor(s.poly)}</color><fill>${s.fill === false ? 0 : 1}</fill><outline>${s.outline === false ? 0 : 1}</outline></PolyStyle>`);
  return `  <Style id="${X(id)}">${p.join('')}</Style>\n`;
}
function extXml(rows) {
  const r = Array.isArray(rows) ? rows : Object.entries(rows || {});
  const ok = r.filter(([k, v]) => k && v != null && v !== '');
  if (!ok.length) return '';
  return `<ExtendedData>${ok.map(([k, v]) => `<Data name="${X(String(k).replace(/\s+/g, '_').slice(0, 80))}"><displayName>${X(k)}</displayName><value>${X(typeof v === 'object' ? JSON.stringify(v) : v)}</value></Data>`).join('')}</ExtendedData>`;
}
// doc = { name, description, view, styles: { id: { line, width, poly, fill, outline, icon } }, folders: [{ name, description, placemarks: [...] }] }
// placemark = { name, description (plain text), extended (object or [[k, v]]), styleUrl or style, view, geoms: [{ type, coords | rings, altitudeMode, extrude }] }
export function writeKml(doc) {
  const styles = { ...(doc.styles || {}) }; let k = 0;
  const pm = (p, ind) => {
    let su = p.styleUrl || ''; if (!su && p.style) { const id = 's' + (++k); styles[id] = p.style; su = '#' + id; }
    const g = p.geoms || [], gx = g.length === 1 ? geomXml(g[0], '') : `<MultiGeometry>${g.map(x => geomXml(x, '')).join('')}</MultiGeometry>`;
    return `${ind}<Placemark><name>${X(p.name)}</name>${p.description ? `<description>${X(p.description)}</description>` : ''}${p.view ? viewXml(p.view, '').trim() : ''}${su ? `<styleUrl>${X(su)}</styleUrl>` : ''}${extXml(p.extended)}${gx}</Placemark>\n`;
  };
  const body = (doc.folders || []).map(f => `  <Folder><name>${X(f.name)}</name>${f.description ? `<description>${X(f.description)}</description>` : ''}\n${f.placemarks.map(p => pm(p, '    ')).join('')}  </Folder>\n`).join('')
    + (doc.placemarks || []).map(p => pm(p, '  ')).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="${KMLNS}" xmlns:gx="${GXNS}">\n<Document>\n  <name>${X(doc.name)}</name>\n  <open>1</open>\n`
    + (doc.description ? `  <description>${X(doc.description)}</description>\n` : '') + viewXml(doc.view)
    + Object.entries(styles).map(([id, s]) => styleXml(id, s)).join('') + body + '</Document>\n</kml>\n';
}
// GeoJSON features (Leaflet toGeoJSON, the registry's files) to placemarks
export function placemarksFromGeoJSON(fc, nameOf = p => p && (p.name || p.title || p.id) || '') {
  const conv = g => !g ? [] : g.type === 'Point' ? [{ type: 'Point', coords: g.coordinates }] : g.type === 'MultiPoint' ? g.coordinates.map(c => ({ type: 'Point', coords: c }))
    : g.type === 'LineString' ? [{ type: 'LineString', coords: g.coordinates }] : g.type === 'MultiLineString' ? g.coordinates.map(c => ({ type: 'LineString', coords: c }))
    : g.type === 'Polygon' ? [{ type: 'Polygon', rings: g.coordinates }] : g.type === 'MultiPolygon' ? g.coordinates.map(c => ({ type: 'Polygon', rings: c }))
    : g.type === 'GeometryCollection' ? g.geometries.flatMap(conv) : [];
  const feats = fc.type === 'FeatureCollection' ? fc.features : fc.type === 'Feature' ? [fc] : [{ type: 'Feature', geometry: fc, properties: {} }];
  return feats.map(f => ({ name: String(nameOf(f.properties || {}) || ''), extended: Object.entries(f.properties || {}).filter(([, v]) => v == null || typeof v !== 'object' || Array.isArray(v)).map(([k, v]) => [k, v]), geoms: conv(f.geometry) })).filter(p => p.geoms.length);
}
// a download (Blob; nothing leaves the browser)
export function download(text, filename) {
  const a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type: 'application/vnd.google-earth.kml+xml' }));
  a.href = url; a.download = filename; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
