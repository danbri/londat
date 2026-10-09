// Data overlays (layer "overlays") of the Three.js port: the WebGL page's Layers > "Live state (snapshot)", "London
// Datastore (GLA)", "Works in progress" and "Colour by" (index.html OVL, buildOverlays, ldsCard, worksBuild, worksCard,
// MODES). Each part is its own group of meshes (overlay-kit.js: solid, see-through glass, ground ribbons, crane tips by
// night), built from its file when the visitor ticks it (no file is fetched before), and dropped with the reveal sheet:
//   bikes   Santander Cycles docks: a column 0.6 m a dock (red standard bikes, amber e-bikes, grey empty, dark broken), a ring red empty / white full
//   lifts   TfL lift outages: a red badge on a white stem
//   cranes  NOTAM obstacles: masts to the published height (ft AMSL x 0.3048), the tip lit by night where the NOTAM says lit
//   heli    route H4 as a see-through band from 1,000 to 2,000 ft along the Thames centreline; EGR159 as a prism to 1,400 ft (walls fade to the ground, no lid)
//   cons, dos, wharf  GLA outlines as 2.5 m ribbons 0.7 m above the ground; venues as gold markers
//   works   construction sites: footprint ribbons by status, frames (edges only) to the approved height, cranes, the height built so far
// A tap within 22 CSS px of a marker, or on the ground inside an outline, opens its card (snapshot date and the source's
// credit line). Colour by: height, occupants, homes, companies, floors below ground, quality issues, through
// ctx.buildOpts.colourOf (the registry layer's atlas index). In Menu > Layers > Who is inside (a group this layer makes):
//   Glow: who is inside (index.html GLOW, buildGlow, drawGlow): buildings whose registry record (atlas index cat, from
//     registry/categories.json) has an occupant of a ticked kind get an aura (the outline pushed out 4 m, from the ground
//     to 6 m above the roof) and lit edges (roof and base outline, corner posts), additive, pulsing; the edges also a faint
//     pass through nearer buildings (no depth test, 0.14), as the WebGL page.
//   Data on the model (index.html buildPins): heritage records (atlas heritage groups as violet sticks, 6 + 4 sqrt(n) m;
//     a label at 30 records or more), quality issues (a stick on the roof per building: red high, amber medium, grey low),
//     crime of the latest month (live from data.police.uk for the Canary Wharf box: a stick per anonymised point, 3 + 2.5 n m).
// URL: ?ov=bikes,works (parts on at load), ?colour=height, ?glow=finance,shop, ?pins=heritage,quality,crime.
// Skill: docklands-3d-page, "Crown halo by date and overlays", "Works in progress", "Three.js port".
import { FT2M, RMesh, beam, stick, ribbon, fence, prismRing, geoOf, inBoxOf, pointIn, bboxOf, londonTime, buildGroup, disposeGroup, addTaps, toast, revealPart, makeLabels } from '../overlay-kit.js';
import { attribute, float, sin, time, positionWorld, sRGBTransferEOTF } from 'three/tsl';

const PARTS = [
  ['bikes', 'Hire bike docks', 'live/bikes.json'], ['lifts', 'Station lift outages', 'live/lifts.json'], ['cranes', 'Cranes (NOTAMs)', 'live/notams.json'],
  ['heli', 'Helicopter route H4, area EGR159', 'live/helicopters.json'], ['cons', 'Conservation areas', 'london-datastore/conservation-areas/conservation-areas.geojson'],
  ['dos', 'Designated open space', 'london-datastore/designated-open-space/designated-open-space.geojson'], ['wharf', 'Safeguarded wharves', 'london-datastore/safeguarded-wharves/safeguarded-wharves.geojson'],
  ['venues', 'Cultural venues', 'london-datastore/cultural-infrastructure/cultural-infrastructure.geojson'], ['works', 'Construction sites', null],
];
const WCOL = { on_site: [1, .55, .12], approved_not_started: [.95, .86, .3], completed_recently: [.45, .86, .6], proposed: [.62, .72, .98], commenced_stale: [.6, .6, .62] };
const WNAME = { on_site: 'on site', approved_not_started: 'approved, not started', completed_recently: 'completed in the last two years', proposed: 'proposed (application or appeal undecided)', commenced_stale: 'commenced years ago, never marked complete' };
const LDS = { wharf: [[.25, .66, .96], 1], dos: [[.37, .82, .48], 2], cons: [[.72, .56, 1], 3] };
const LDSNAME = { cons: 'Conservation area', dos: 'Designated open space', wharf: 'Safeguarded wharf', venues: 'Cultural venue' };
const HT = b => b.wh || b.h || b.mh || 0;
const rampCol = t => { const S = [[59, 15, 112], [140, 41, 129], [222, 73, 104], [254, 159, 109], [252, 253, 191]]; t = Math.max(0, Math.min(1, t)) * 4; const i = Math.min(3, Math.floor(t)), f = t - i; return [0, 1, 2].map(c => (S[i][c] + (S[i + 1][c] - S[i][c]) * f) / 255); };
// Glow: who is inside (index.html GLOW, GLOW_ALSO and the chips' labels and order)
const GLOW = { finance: [1, .19, .19], shop: [.72, 1, .18], catering: [1, .63, .25], leisure: [.36, 1, .48], entertainment: [1, .31, .85], bar: [1, .83, 0], education: [1, .95, .42], health: [.97, .97, 1], sport: [.85, .6, .35], arts: [.7, .42, 1], charity: [.45, 1, .85] };
const GLOW_ALSO = { bar: ['alcohol'] };   // a chip that also lights a related category (pubs and bars: alcohol shops too)
const GLOW_NAME = { finance: 'Banks and finance', shop: 'Shops', catering: 'Food and drink', leisure: 'Leisure', entertainment: 'Entertainment', bar: 'Pubs, bars, alcohol', education: 'Schools and colleges', health: 'Health', sport: 'Sport', arts: 'Arts and music venues', charity: 'Charities' };
const PINS = [['heritage', 'Heritage records'], ['quality', 'Quality issues'], ['crime', 'Crime, latest month (live)']];
const MODES = { height: [b => HT(b), 200, 'height 0–200 m'], occupants: [b => b.o, 30, 'occupants 0–30'], homes: [b => Math.max(0, b.hm), 300, 'homes 0–300'], companies: [b => b.co, 200, 'registered companies 0–200'], below: [b => b.lu || 0, 5, 'floors below ground 0–5'], quality: [b => b.qc || 0, 6, 'quality issues 0–6'] };

export default {
  id: 'overlays', label: 'Data overlays', on: true,
  async init(ctx) {
    const { A, esc, loadJSON, groundAt, draw, scene } = ctx, CW = ctx.WEBGL.replace(/docklands\/$/, ''), geo = geoOf(A), inBox = inBoxOf(A), earcut = globalThis.earcut && (globalThis.earcut.default || globalThis.earcut);
    const P = {}, data = {}, stats = {};
    for (const [k, label, file] of PARTS) P[k] = { k, label, file, on: false, group: null, hits: [], polys: [], n: 0 };
    const card = html => ctx.showCard(html);
    const credit = (m, extra) => `<div class="small" style="margin-top:6px">Snapshot ${esc(londonTime(m.fetched))} (London time; not live)${extra ? ' · ' + extra : ''}. ${esc(m.attribution || '')}. Licence: ${esc(m.licence || '')}.</div>`;
    const getData = async k => data[k] || (data[k] = (async () => { const p = P[k];
      const d = await loadJSON(p.file ? CW + 'feeds/' + p.file : CW + 'registry/sources/construction/sites.json');
      if (k === 'heli') d.river = await loadJSON(ctx.DATA + 'river.json'); return d; })().catch(e => { data[k] = null; throw e; }));

    // ---------- rings (index.html ovRing: EGR159's arc centres become clockwise arcs)
    function ovRing(lonlat, arcs) {   // lonlat: [lat, lon] pairs as the AIP file holds them
      const out = [], isC = p => (arcs || []).find(a => Math.abs(a.centre[0] - p[0]) < 1e-5 && Math.abs(a.centre[1] - p[1]) < 1e-5);
      for (let i = 0; i < lonlat.length; i++) { const p = lonlat[i], a = isC(p);
        if (!a || !i || i === lonlat.length - 1) { out.push(geo(p[1], p[0])); continue; }
        const [cx, cz] = geo(a.centre[1], a.centre[0]), [sx, sz] = out[out.length - 1], [ex, ez] = geo(lonlat[i + 1][1], lonlat[i + 1][0]);
        const brg = (x, z) => Math.atan2(x - cx, -(z - cz)), b0 = brg(sx, sz); let b1 = brg(ex, ez); while (b1 <= b0) b1 += 2 * Math.PI;
        const r = a.radius_nm * 1852, n = Math.max(4, Math.ceil((b1 - b0) / .08)); for (let k = 1; k < n; k++) { const b = b0 + (b1 - b0) * k / n; out.push([cx + r * Math.sin(b), cz - r * Math.cos(b)]); } }
      if (out.length > 1 && Math.hypot(out[0][0] - out.at(-1)[0], out[0][1] - out.at(-1)[1]) < .5) out.pop(); return out;
    }
    const onGround = h => (x, z) => groundAt(x, z) + h;

    // ---------- the builders: each fills { S, G, F, tips } and the part's hits and polys
    const B = {};
    B.bikes = (d, M, p) => {
      for (const it of d.items) { const [x, z] = geo(it.position.lon, it.position.lat); if (!inBox(x, z)) continue; const v = it.values, g = groundAt(x, z), u = .6, docks = Math.max(1, v.docks || 0), sb = v.standard_bikes ?? v.bikes, eb = v.e_bikes || 0;
        let y = g; const seg = (m, col) => { if (m > 0) { stick(M.S, x, z, y, y + m * u, 5, col); y += m * u; } };
        seg(sb, [.93, .1, .12]); seg(eb, [1, .72, .2]); seg(v.empty_docks || 0, [.42, .46, .5]); seg(Math.max(0, docks - sb - eb - (v.empty_docks || 0)), [.16, .17, .19]);
        const empty = !v.bikes, full = !v.empty_docks; if (empty || full) { const col = empty ? [1, .2, .2] : [.95, .95, 1]; for (let k = 0; k < 12; k++) { const a0 = k / 12 * 2 * Math.PI, a1 = (k + 1) / 12 * 2 * Math.PI; beam(M.S, [x + 7 * Math.cos(a0), g + .6, z + 7 * Math.sin(a0)], [x + 7 * Math.cos(a1), g + .6, z + 7 * Math.sin(a1)], 1.2, 1.2, col); } }
        p.n++; p.hits.push({ x, y: g + docks * u * .5, z, card: () => card(`<b>${esc(it.name)}</b> <span class="small">Santander Cycles dock · ${esc(it.id)}</span><div>${v.bikes} bikes (${sb} standard, ${eb} e-bikes) · ${v.empty_docks} empty docks · ${v.docks} docks${v.unavailable_docks ? ` · ${v.unavailable_docks} broken or blocked` : ''}${empty ? ' · <b>empty</b>' : full ? ' · <b>full</b>' : ''}${v.locked ? ' · locked' : ''}${v.temporary ? ' · temporary' : ''}</div><div class="small">Column: 0.6 m a dock; red standard bikes, amber e-bikes, grey empty docks, dark broken docks. Ring: red empty, white full. Dock updated ${esc(londonTime(it.time))}.</div>${credit(d.meta)}`) }); }
    };
    B.lifts = (d, M, p) => {
      for (const it of d.items) { const [x, z] = geo(it.position.lon, it.position.lat); if (!inBox(x, z)) continue; const g = groundAt(x, z);
        stick(M.S, x, z, g, g + 34, 1.2, [.92, .93, .95]); stick(M.S, x, z, g + 34, g + 44, 10, [.9, .12, .12]); beam(M.S, [x - 3.5, g + 39, z], [x + 3.5, g + 39, z], 2, 10.4, [1, 1, 1]);
        p.n++; p.hits.push({ x, y: g + 39, z, card: () => card(`<b>${esc(it.name)}</b> <span class="small">lift out of service · ${esc(it.id)}</span><div>${esc(it.values.message || '')}</div><div class="small">Lifts: ${esc((it.values.lifts_out || []).join(', '))}. No badge means no lift outage reported at the snapshot, for TfL-managed lifts only. <a href="${esc(it.url)}">Step-free access (TfL)</a></div>${credit(d.meta)}`) }); }
      if (!p.n) toast(`No lift outage reported at TfL stations in the model at ${esc(londonTime(d.meta.fetched))} (TfL-managed lifts only).`);
    };
    const crane = (M, x, z, g, top) => { stick(M.S, x, z, g, top, 1.6, [.95, .78, .2]); beam(M.S, [x - 9, top - 1, z], [x + 22, top - 1, z], 1.4, 1.4, [.95, .78, .2]); };
    B.cranes = (d, M, p) => {
      for (const it of d.items) { const v = it.values; if (it.kind !== 'obstacle' || it.position.alt_ft == null) continue; const [x, z] = geo(it.position.lon, it.position.lat); if (!inBox(x, z)) continue;
        const g = groundAt(x, z), top = it.position.alt_ft * FT2M; if (top <= g + 2) continue; crane(M, x, z, g, top); if (v.lit === true) M.tips.push([x, top + .6, z]);
        p.n++; p.hits.push({ x, y: top, z, card: () => card(`<b>${esc(it.name)}</b> <span class="small">NOTAM ${esc(it.id)} · obstacle${v.crane ? ', crane' : ''}</span><div>Top ${it.position.alt_ft} ft above mean sea level (${Math.round(top)} m)${v.height_agl_ft != null ? `, ${v.height_agl_ft} ft (${Math.round(v.height_agl_ft * FT2M)} m) above the ground` : ''} · lighting: ${v.lit === true ? 'lit' : 'not stated in the NOTAM'} · from ${esc(v.start || '')} to ${esc(v.end || '')} · position from ${esc(v.position_from || '')}</div><div class="small">Facts only (identifier, position, height, times); the NOTAM text is not copied. Pre-flight bulletin issued ${esc(londonTime(d.meta.pib_issued))}.</div>${credit(d.meta)}`) }); }
    };
    B.heli = (d, M, p) => {
      const hp = d.meta.h4_profile || {}, lo = (hp.suggested_min_ft || 1000) * FT2M, hi = (hp.vfr_max_ft || 2000) * FT2M, col = [.35, .85, 1];
      const pts = d.items.filter(i => i.kind === 'helicopter-reporting-point'), iod = pts.find(q => /Isle/.test(q.name)), C = d.river && d.river.thames;
      const h4 = () => card(`<b>Helicopter route H4</b> <span class="small">along the River Thames · UK AIP AD 2 EGLL 2.22</span><div>Single-engine helicopters keep to the river here. Altitudes: no lower than ${hp.suggested_min_ft} ft and at most ${hp.vfr_max_ft} ft above mean sea level (VFR); special VFR at most ${hp.svfr_max_ft} ft. Reporting points: ${pts.map(q => `${esc(q.name)} (${esc(q.values.reporting)})`).join(', ')}.</div><div class="small">Drawn along the river's centreline between ${Math.round(lo)} and ${Math.round(hi)} m; the route's precise line is on the 1:50 000 chart (not copied). No live helicopter positions: every ADS-B source checked is licensed against this use. AIP issue ${esc(d.meta.aip_issue || '')}. ${esc(hp.note || '')}</div>${credit(d.meta)}`);
      if (C && iod) { const [ix, iz] = geo(iod.position.lon, iod.position.lat); let end = 0, best = 1e18; C.forEach((q, i) => { const e = (q[0] - ix) ** 2 + (q[1] - iz) ** 2; if (e < best) { best = e; end = i; } });
        const line = C.slice(0, end + 1).filter((q, i) => i % 3 === 0 || i === end);
        for (let i = 0; i + 1 < line.length; i++) { const a = line[i], b = line[i + 1]; M.G.quad([a[0], lo, a[1]], [b[0], lo, b[1]], [b[0], hi, b[1]], [a[0], hi, a[1]], col, .1);
          beam(M.S, [a[0], lo, a[1]], [b[0], lo, b[1]], 3, 3, col); beam(M.S, [a[0], hi, a[1]], [b[0], hi, b[1]], 3, 3, col); if (i % 6 === 0) p.hits.push({ x: a[0], y: (lo + hi) / 2, z: a[1], card: h4 }); }
        p.n += line.length; }
      for (const q of pts) { const [x, z] = geo(q.position.lon, q.position.lat); if (!inBox(x, z)) continue; stick(M.S, x, z, lo, hi, 5, col); p.hits.push({ x, y: hi, z, card: () => card(`<b>H4 reporting point: ${esc(q.name)}</b> <span class="small">${esc(q.values.reporting)} · ${esc(q.values.grid_ref)}</span><div>${esc(q.values.description)}</div>${credit(d.meta)}`) }); }
      for (const it of d.items) { if (it.kind !== 'restricted-area' || it.id !== 'EGR159') continue; const v = it.values, ring = ovRing(v.vertices, v.arcs), top = 1400 * FT2M, c2 = [1, .3, .55];
        fence(M.G, ring, (x, z) => groundAt(x, z), () => top, c2, .09, 3, 0);   // walls fade out towards the ground; no lid (it tinted the whole island)
        const c = ring.reduce((s, q) => [s[0] + q[0] / ring.length, s[1] + q[1] / ring.length], [0, 0]);
        const rc = () => card(`<b>${esc(it.id)} ${esc(it.name)}</b> <span class="small">restricted area · UK AIP ENR 5.1</span><div>From the surface to ${esc(v.upper)} (${Math.round(top)} m). Flight permitted by: ${esc((v.permitted || []).join('; '))}.${v.legal_basis ? ` Legal basis: SI ${esc(v.legal_basis)}.` : ''}</div><div class="small">Boundary as published: ${v.vertices.length - (v.arcs || []).length - 1} points and ${(v.arcs || []).length} clockwise arcs (radius ${(v.arcs || []).map(a => a.radius_nm + ' NM').join(', ')}).</div>${credit(d.meta)}`);
        p.hits.push({ x: c[0], y: top, z: c[1], card: rc }); p.polys.push({ ring, bb: bboxOf(ring), card: rc, pri: 9 }); stats.egr159 = ring.length; }
    };
    function ldsCard(k, d, Pp) {
      const m = d.meta, num = v => v == null || v === '' ? null : +v >= 1 ? Math.round(+v * 10) / 10 : Math.round(+v * 100) / 100, rows = [];
      if (k === 'venues') { rows.push(esc(String(Pp.layer || '').replace(/^cultural_venues_CIM 2023 /, ''))); const ad = [Pp.address1, Pp.address2, Pp.address3].map(s => String(s || '').trim()).filter(Boolean).join(', '); if (ad) rows.push(esc(ad)); if (Pp.borough_name) rows.push(esc(Pp.borough_name)); }
      else { if (Pp.classification) rows.push(esc(Pp.classification)); if (Pp.status) rows.push(esc(Pp.status)); if (Pp.borough || Pp.planningauthority) rows.push(esc(Pp.borough || Pp.planningauthority)); if (num(Pp.hectares) != null) rows.push(`${num(Pp.hectares)} ha`); if (Pp.layerreference) rows.push(esc(Pp.layerreference)); }
      const link = Pp.website || (k === 'wharf' && Pp.source) || null;
      card(`<b>${esc(Pp.sitename || Pp.name || LDSNAME[k])}</b> <span class="small">${LDSNAME[k]}</span><div>${rows.join(' · ')}</div>${Pp.notes ? `<div class="small">${esc(Pp.notes)}</div>` : ''}${link ? `<div class="small"><a href="${esc(link)}" target="_blank" rel="noopener">${esc(String(link).replace(/^https?:\/\//, '').slice(0, 60))}</a></div>` : ''}` +
        `<div class="small" style="margin-top:6px">Source: <a href="${esc(m.page)}" target="_blank" rel="noopener">${esc(m.source)}</a>${m.dataset_modified ? `, dataset updated ${esc(String(m.dataset_modified).slice(0, 10))}` : ''}. ${esc(m.attribution)} Licence: <a href="${esc(m.licence_url)}">${esc(m.licence)}</a>.</div>`);
    }
    for (const [k, [col, pri]] of Object.entries(LDS)) B[k] = (d, M, p) => {   // outlines as ribbons 2.5 m wide, 0.7 m above the ground (not fences: from the photo views a wall washed the skyline green)
      for (const f of d.features) { const gm = f.geometry, Pp = f.properties; if (!gm) continue; const polysOf = gm.type === 'Polygon' ? [gm.coordinates] : gm.type === 'MultiPolygon' ? gm.coordinates : [];
        for (const poly of polysOf) { const rings = poly.map(r => { const o = r.map(([lo, la]) => geo(lo, la)); if (o.length > 1 && o[0][0] === o.at(-1)[0] && o[0][1] === o.at(-1)[1]) o.pop(); return o; }).filter(r => r.length > 2);
          if (!rings.length || !rings[0].some(([x, z]) => inBox(x, z, 300))) continue;
          for (const r of rings) ribbon(M.F, r, 2.5, col, onGround(.7), true, inBox);
          p.polys.push({ ring: rings[0], holes: rings.slice(1), bb: bboxOf(rings[0]), pri, card: () => ldsCard(k, d, Pp) }); p.n++; } }
    };
    B.venues = (d, M, p) => {
      for (const f of d.features) { if (!f.geometry || f.geometry.type !== 'Point') continue; const [lo, la] = f.geometry.coordinates, [x, z] = geo(lo, la); if (!inBox(x, z)) continue; const g = groundAt(x, z);
        stick(M.S, x, z, g, g + 14, 1, [.95, .82, .45]); stick(M.S, x, z, g + 14, g + 19, 5, [1, .78, .25]); p.n++; p.hits.push({ x, y: g + 16, z, card: () => ldsCard('venues', d, f.properties) }); }
    };
    // ---------- works in progress (index.html worksTop, worksRing, worksFrame, worksBuild, worksCard)
    function worksTop(s, g) {
      const a = s.approved || {}, w = a.web || {};
      if (a.max_height_m && a.max_height_m > g + 3) return { y: a.max_height_m, from: `${a.max_height_m} m (PLD max_height, ${esc(a.from || '')})` };
      if (a.storeys_max) return { y: g + a.storeys_max * 3.2, from: `${a.storeys_max} storeys x 3.2 m (PLD, ${esc(a.from || '')})` };
      if (w.height_m) return { y: g + w.height_m, from: `${w.height_m} m above the ground (${esc(w.height_meaning || 'developer or press')})` };
      if (w.storeys) return { y: g + w.storeys * 3.2, from: `${w.storeys} storeys x 3.2 m (developer or press)` };
      return null;
    }
    function worksRing(s) {
      if (s.footprint.ring_wgs84) { const r = s.footprint.ring_wgs84.map(([lo, la]) => geo(lo, la)); if (r.length > 1 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1]) r.pop(); return r; }
      const [cx, cz] = geo(s.position.lon, s.position.lat), rr = s.footprint.circle_local.r, o = []; for (let k = 0; k < 24; k++) o.push([cx + rr * Math.cos(k / 24 * 2 * Math.PI), cz + rr * Math.sin(k / 24 * 2 * Math.PI)]); return o;
    }
    function worksFrame(S, ring, top, col) {   // edges only: see-through walls over a skyline read as orange blocks from the photo views
      const w = 1.5, sh = col.map(v => v * .85);
      for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) > .5) beam(S, [a[0], top, a[1]], [b[0], top, b[1]], w, w, col); }
      const ex = [0, 1, 2, 3].map(k => ring.reduce((b, q) => ([q[0], q[1], -q[0], -q[1]][k] > [b[0], b[1], -b[0], -b[1]][k] ? q : b), ring[0]));
      for (const q of new Set(ex)) beam(S, [q[0], groundAt(q[0], q[1]), q[1]], [q[0] + .01, top, q[1]], w, w, sh);
    }
    function worksCard(s, m, g) {
      const a = s.approved || {}, w = a.web || {}, top = worksTop(s, g), L = [], li = h => L.push(`<li>${h}</li>`), d = s.dates || {}, link = (u, t) => u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t);
      li(`Status: <b>${esc(WNAME[s.status] || s.status)}</b> (rule ${esc((s.status_rule || '').split(':')[0])}, ${esc(s.status_confidence || '')} confidence)${s.status_note ? ` · ${esc(s.status_note)}` : ''}`);
      const dl = [d.decision && `approved ${esc(d.decision)}`, d.commenced && `commenced ${esc(d.commenced)}`, d.completed && `completed ${esc(d.completed)}`].filter(Boolean); if (dl.length) li(dl.join(' · ') + ` <span class="small">(${esc(d.from || '')})</span>`);
      const ap = [a.storeys_max && `${a.storeys_max} storeys`, a.max_height_m && `${a.max_height_m} m`, a.units && `${a.units} homes or rooms`, a.non_res_gia_gained_m2 && `${Math.round(a.non_res_gia_gained_m2).toLocaleString('en-GB')} m² other floor space`].filter(Boolean);
      if (ap.length) li('Approved (planning register): ' + ap.join(', '));
      if (w.storeys || w.height_m) li(`Developer or press: ${[w.storeys && `${w.storeys} storeys`, w.height_m && `${w.height_m} m`, w.homes && `${w.homes} homes`, w.rooms && `${w.rooms} rooms`, w.architect && `architect ${esc(w.architect)}`, (w.expected_opening || w.expected_completion) && `due ${esc(w.expected_opening || w.expected_completion)}`].filter(Boolean).join(', ')} (${(w.sources || []).map(u => link(u, u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0])).join(', ')})`);
      if (top && s.status === 'on_site') li(`Frame drawn to ${Math.round(top.y)} m OD: ${top.from}`);
      if (s.current) li(`Built by ${esc(s.current.date)}: ${esc(s.current.what)}; top about ${s.current.top_m_od} m OD (±${s.current.top_m_od_uncertainty} m)${s.current.built_storeys_min ? `, at least ${s.current.built_storeys_min} floors` : ''}. ${esc(s.current.source || '')}`);
      for (const k of ['developer', 'contractor']) if ((s[k] || []).length) li(`${k === 'developer' ? 'Developer' : 'Contractor'}: ` + s[k].map(x => `${esc(x.name)} (${esc(x.role)}; ${/^https?:/.test(x.source) ? link(x.source, x.source.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]) : esc(x.source)})`).join('; '));
      if ((s.cranes || []).length) li('Cranes (NOTAM): ' + s.cranes.map(c => `${esc(c.notam)} top ${c.top_amsl_ft} ft (${Math.round(c.top_m_od)} m), ${c.distance_m} m away, ${esc(c.confidence)}`).join('; '));
      if ((s.street_activities || []).length) li('Street Manager: ' + s.street_activities.slice(0, 4).map(x => `${esc(x.type.replace(/_/g, ' '))} on ${esc(x.street || '')} ${esc(x.start)} to ${esc(x.end)} (${x.distance_m} m, ${esc(x.confidence)})`).join('; '));
      if ((s.osm || []).length) li('OpenStreetMap: ' + s.osm.slice(0, 4).map(o => `<a href="https://www.openstreetmap.org/${esc(o.osm)}" target="_blank" rel="noopener">${esc(o.osm)}</a> ${esc(Object.entries(o.tags).filter(([k]) => /^(name|landuse|building|construction)$/.test(k)).map(([k, v]) => `${k}=${v}`).join(' '))}`).join('; '));
      const wdl = (s.wikidata || []).filter(x => x.confidence !== 'low').slice(0, 3); if (wdl.length) li('Wikidata: ' + wdl.map(x => `<a href="https://www.wikidata.org/wiki/${esc(x.qid)}" target="_blank" rel="noopener">${esc(x.label || x.qid)}</a> (${esc(x.confidence)}${(x.state || []).includes('Q12377751') ? ', marked under construction' : ''})`).join(', '));
      if ((s.brownfield || []).length) li('Brownfield register: ' + s.brownfield.map(b => `${esc(b.site_reference)} ${esc(b.planning_status || '')}`).join('; '));
      const pl = (s.planning || []).slice(0, 6).map(q => `${q.url ? link(q.url, q.lpa_app_no) : esc(q.lpa_app_no)} <span class="small">${esc(q.status || q.decision || '')}${q.decision_date ? ' ' + esc(q.decision_date) : ''}${q.role === 'lead' ? ', lead' : ''}</span>`);
      card(`<b>${esc(s.name)}</b> <span class="small">construction site · ${esc(s.borough || '')}</span><div class="small">${esc(s.address || '')}</div><ul class="small" style="margin:4px 0 0 1em;padding:0">${L.join('')}</ul>` +
        `<div class="small">Planning: ${pl.join(', ')}${s.planning_count > 6 ? ` and ${s.planning_count - 6} more` : ''}</div>${s.description ? `<div class="small">“${esc(s.description)}”</div>` : ''}<div class="small">Footprint: ${esc(s.footprint.from)}.</div>` +
        `<div class="small" style="margin-top:6px">Index built ${esc(String(m.built || '').slice(0, 10))}. Source: Planning London Datahub (GLA and the London boroughs), facts and links only. Index: <a href="https://github.com/danbri/londat/blob/main/cwplans/registry/sources/construction/README.md" target="_blank" rel="noopener">registry/sources/construction</a>.</div>`);
    }
    B.works = (d, M, p) => {
      stats.works = { frames: 0, cranes: 0, built: 0 };
      for (const s of d.sites) { const col = WCOL[s.status]; if (!col) continue;
        const ring = worksRing(s); if (ring.length < 3) continue;
        const c = ring.reduce((a, q) => [a[0] + q[0] / ring.length, a[1] + q[1] / ring.length], [0, 0]); if (!inBox(c[0], c[1])) continue;
        ribbon(M.F, ring, s.status === 'on_site' ? 3 : 2, col, onGround(.7), true, inBox); p.n++;
        const g = groundAt(c[0], c[1]), area = Math.abs(ring.reduce((a, q, i) => { const r = ring[(i + 1) % ring.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0) / 2), top = worksTop(s, g);
        let ty = g + 14;
        if (s.status === 'on_site' && top) { ty = top.y;
          if (area <= 6000) worksFrame(M.S, ring, top.y, col); else { stick(M.S, c[0], c[1], g, top.y, 1.5, col); beam(M.S, [c[0] - 8, top.y, c[1]], [c[0] + 8, top.y, c[1]], 1.5, 1.5, col); }
          stats.works.frames++; }
        if (s.current && s.current.top_m_od > g + 3 && earcut) { const sc = /core/.test(s.current.what || '') ? .45 : 1, rr = ring.map(([x, z]) => [c[0] + (x - c[0]) * sc, c[1] + (z - c[1]) * sc]);
          prismRing(M.F, rr, g, s.current.top_m_od, [.66, .64, .6], earcut); stats.works.built++; ty = Math.max(ty, s.current.top_m_od); }
        for (const cr of s.cranes || []) { const [x, z] = geo(cr.lon, cr.lat), gg = groundAt(x, z), t = cr.top_m_od; if (!t || t <= gg + 2 || !inBox(x, z)) continue; crane(M, x, z, gg, t); stats.works.cranes++; if (cr.lit) M.tips.push([x, t + .6, z]); }
        const cd = () => worksCard(s, d.meta, g); p.hits.push({ x: c[0], y: ty, z: c[1], card: cd }); p.polys.push({ ring, bb: bboxOf(ring), pri: 0, card: cd }); }
    };

    // ---------- build, show, hide
    const root = new ctx.THREE.Group(); root.name = 'overlays'; scene.add(root);
    async function setPart(k, on, quiet) {
      const p = P[k]; p.on = on; syncUi();
      if (!on) { if (p.group) p.group.visible = false; draw(); return; }
      if (!p.group) {
        let d; try { d = await getData(k); } catch (e) { toast(`${esc(p.label)}: the file did not load (${esc(e.message)}).`); p.on = false; syncUi(); return; }
        if (!p.on) return; p.d = d;
        const M = { S: new RMesh(), G: new RMesh(), F: new RMesh(), tips: [] }; p.hits = []; p.polys = []; p.n = 0;
        const t0 = performance.now(); B[k](d, M, p); p.ms = Math.round(performance.now() - t0);
        p.group = buildGroup(M, 'overlays:' + k); p.group.visible = false; root.add(p.group);
        p.tris = { solid: M.S.idx.length / 3, glass: M.G.idx.length / 3, flat: M.F.idx.length / 3, tips: M.tips.length };
      }
      if (quiet) { p.group.visible = true; draw(); return; }
      revealPart(ctx, p.group, p.label, null, () => p.on);
      draw();
    }
    addTaps(ctx, () => Object.values(P).filter(p => p.on && p.group && p.group.visible));
    ctx.onFrame(() => { const n = ctx.night; for (const p of Object.values(P)) if (p.group) for (const m of p.group.children) if (m.userData.nightOnly) m.visible = n; });

    // ---------- colour by (index.html MODES): the registry layer's atlas index; buildings without a record dark grey
    let colourMode = 'source', QC = null;
    async function setColour(mode) {
      const R = ctx.registry; if (mode !== 'source' && !R) { toast('Colour by needs the registry layer.'); mode = 'source'; }
      if (mode !== 'source' && !(await R.ready)) { toast('The atlas index did not load.'); mode = 'source'; }
      colourMode = mode; sel.value = mode;
      if (mode === 'quality' && !QC) { try { const q = await loadJSON(CW + 'quality/issues.json'); QC = new Map(); for (const i of q.issues) if (i.ent === 'b') QC.set(i.id, (QC.get(i.id) || 0) + 1); } catch (e) { QC = new Map(); toast('The quality issues did not load.'); } }
      const O = ctx.buildOpts;
      ctx.U.dataColour.value = mode === 'source' ? 0 : 1;   // materials.js: no lit windows in a data colour mode
      if (mode === 'source') { if (O.colourOf === colourOf) { if (prevColour) O.colourOf = prevColour; else delete O.colourOf; } if (O.look === null && lookWas !== undefined) { if (lookWas === '__none') delete O.look; else O.look = lookWas; } lookWas = undefined; key.innerHTML = ''; }
      else { if (O.colourOf !== colourOf) { prevColour = O.colourOf; O.colourOf = colourOf; } if (lookWas === undefined) { lookWas = 'look' in O ? O.look : '__none'; O.look = null; }   // the Realistic paint would cover the ramp
        key.innerHTML = `<span style="display:inline-block;width:100%;height:8px;border-radius:4px;background:linear-gradient(90deg,#3b0f70,#8c2981,#de4968,#fe9f6d,#fcfdbf)"></span>${MODES[mode][2]} (square-root scale) · light grey: none · dark grey: no registry record (outside the Canary Wharf box)`; }
      ctx.rebuildBuildings();
    }
    let prevColour, lookWas;
    function colourOf(b, i) {
      if (colourMode === 'source') return prevColour ? prevColour(b, i) : null;
      const R = ctx.registry, k = R.regOf[i]; if (k < 0) return [.30, .32, .35];
      const rec = R.AT.buildings[k], [f, max] = MODES[colourMode], v = colourMode === 'quality' ? (QC.get(rec.id) || 0) : f(rec);
      return v ? rampCol(Math.sqrt(v / max)) : [.55, .57, .60];
    }

    // ---------- UI: one compact block (the menus are to be reworked: owner, 2026-10-08)
    ctx.ui.section('Data overlays');
    const box = document.createElement('div'); box.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px 10px'; ctx.ui.host().appendChild(box);
    const boxes = {};
    for (const p of Object.values(P)) { const l = document.createElement('label'); l.className = 'row'; l.style.margin = '2px 0'; const i = document.createElement('input'); i.type = 'checkbox'; i.onchange = () => setPart(p.k, i.checked); l.append(i, ' ' + p.label); box.appendChild(l); boxes[p.k] = i; }
    const syncUi = () => { for (const p of Object.values(P)) boxes[p.k].checked = p.on; };
    ctx.ui.note('Dated snapshots, not live (Powered by TfL Open Data; UK AIS (NATS) facts; GLA, OGL v3.0: the GLA cannot warrant the quality or accuracy of the data; Planning London Datahub). Tap a marker or inside an outline for its record.');
    const prevTab = ctx.ui.tab ? ctx.ui.tab('look') : null;   // colour by goes to Menu > Look (menu.js)
    const row = document.createElement('label'); row.className = 'row'; row.textContent = 'Colour buildings by ';
    const sel = document.createElement('select'); sel.innerHTML = '<option value="source">height source</option>' + Object.entries(MODES).map(([k, m]) => `<option value="${k}">${esc(m[2].replace(/ \d.*$/, ''))}</option>`).join('');
    sel.onchange = () => setColour(sel.value); row.appendChild(sel); ctx.ui.host().appendChild(row);
    const key = ctx.ui.note('');
    // ---------- Layers > Who is inside (owner, 2026-10-09: "colour coded business/building types"): the WebGL page's chips
    // "Glow: who is inside" and "Data on the model" in one group of the Layers pane, made here (index.html has no such group)
    let gIn = document.querySelector('#paneLayers .grp[data-g="inside"] .gb');
    if (!gIn) { const g = document.createElement('div'); g.className = 'grp'; g.dataset.g = 'inside'; g.innerHTML = '<div class="gt">Who is inside</div><div class="gb"></div>';
      const ref = document.querySelector('#paneLayers .grp[data-g="overlays"]'); if (ref) ref.before(g); else document.getElementById('paneLayers')?.appendChild(g); gIn = g.querySelector('.gb'); }
    const chipBox = document.createElement('div'); chipBox.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px 10px'; chipBox.id = 'glowChips3'; gIn.appendChild(chipBox);
    const sw = c => { const i = document.createElement('i'); i.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 4px;background:rgb(${c.map(v => Math.round(v * 255)).join(',')})`; return i; };
    const chip = (c, text, onchange) => { const l = document.createElement('label'); l.className = 'row'; l.style.margin = '2px 0'; const i = document.createElement('input'); i.type = 'checkbox'; i.onchange = onchange; l.append(i, sw(c), text); chipBox.appendChild(l); return i; };
    const glowChk = {}, pinChk = {};
    for (const [k, c] of Object.entries(GLOW)) { glowChk[k] = chip(c, GLOW_NAME[k], () => setGlow(Object.keys(glowChk).filter(q => glowChk[q].checked))); glowChk[k].dataset.glow = k; }
    const PINCOL = { heritage: [.71, .55, 1], quality: [.95, .2, .2], crime: [.95, .35, .25] };
    for (const [k, t] of PINS) { pinChk[k] = chip(PINCOL[k], t, () => setPins(Object.keys(pinChk).filter(q => pinChk[q].checked))); pinChk[k].id = 'pin3-' + k; }
    const note = h => { const p = document.createElement('p'); p.className = 'small'; p.innerHTML = h; gIn.appendChild(p); return p; };
    note('Buildings glow when a source states that such an occupant is inside: OSM tags, Wikidata classes, the FSA business type or the Canary Wharf Group directory. Registered offices are not counted. Wikidata occupant links have no dates, so some are former tenants.');
    const pinNote = note('Tap a building at Canary Wharf for its record. Heritage: violet sticks, 6 m + 4 m × √records; quality issues: a stick on the roof (red high, amber medium, grey low); crime: a red stick at each anonymised point of the latest month, 3 m + 2.5 m a record (asks data.police.uk).');
    note('The orange buildings of the WebGL page are not occupants: in its Map look the default colour is the height source (orange #e0b25a: OSM levels, or a building newer than the LiDAR survey). Here: Look > Realistic buildings off, or Look > Colour buildings by.');
    if (prevTab) ctx.ui.tab(prevTab);

    // ---------- Glow: who is inside (index.html buildGlow, drawGlow). Vertex colour: rgb the kind's colour, alpha the
    // building's seed (the phase of the pulse). Pulse k = 0.55 + 0.45 sin(3.3 t + 0.09 y + 40 seed); colour x (1 + 0.6 k),
    // alpha k x pass alpha (aura 0.3, edges 1; the edges again with no depth test at 0.14), added (SRC_ALPHA, ONE).
    const glowRoot = new ctx.THREE.Group(); glowRoot.name = 'glow'; scene.add(glowRoot);
    const GM = {}, glowMat = (a, depth) => { const T = ctx.THREE, m = new T.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: depth, side: T.DoubleSide, blending: T.AdditiveBlending, fog: false });
      const c = attribute('color', 'vec4'), k = sin(time.mul(3.3).add(positionWorld.y.mul(0.09)).add(c.w.mul(40))).mul(0.45).add(0.55);
      m.colorNode = sRGBTransferEOTF(c.xyz).mul(k.mul(0.6).add(1)); m.opacityNode = k.mul(a); return m; };
    let glowOn = [];
    const glowStats = { buildings: 0, triangles: 0 };
    async function setGlow(list) {
      list = (list || []).filter(k => GLOW[k]); glowOn = list; for (const [k, i] of Object.entries(glowChk)) i.checked = list.includes(k);
      for (const m of [...glowRoot.children]) { m.geometry.dispose(); glowRoot.remove(m); } glowStats.buildings = glowStats.triangles = 0;
      if (!list.length) { draw(); return 0; }
      const R = ctx.registry; if (!R || !(await R.ready)) { toast('Glow needs the atlas index (registry layer); it did not load.'); for (const i of Object.values(glowChk)) i.checked = false; glowOn = []; return 0; }
      if (glowOn !== list) return 0;   // a newer choice while the index loaded
      const AT = R.AT, regOf = R.regOf, O = ctx.buildOpts, E = new RMesh(), Hm = new RMesh(); let n = 0;
      A.buildings.forEach((b, i) => {
        const k = regOf[i]; if (k < 0) return; const cat = AT.buildings[k].cat; if (!cat) return;
        const hit = list.filter(c => cat[c] || (GLOW_ALSO[c] || []).some(x => cat[x])); if (!hit.length) return; n++;
        const hh = O.heightOf ? O.heightOf(b, i) : b.h; if (!(hh > 0)) return;
        const col = GLOW[hit[0]], seed = ((k * 2654435761) >>> 0) / 4294967296, f = ctx.dec(b.p), y0 = b.b + (b.mh || 0), y1 = b.b + hh, nv = (b.holes && b.holes.length ? b.holes[0] : f.length / 2);
        const Es = { quad: (p0, p1, p2, p3, c) => E.quad(p0, p1, p2, p3, c, seed) };   // beam() with the seed in the alpha
        let cx = 0, cz = 0; for (let j = 0; j < nv; j++) { cx += f[2 * j]; cz += f[2 * j + 1]; } cx /= nv; cz /= nv;
        const out = j => { const dx = f[2 * j] - cx, dz = f[2 * j + 1] - cz, r = Math.hypot(dx, dz) || 1; return [f[2 * j] + dx / r * 4, f[2 * j + 1] + dz / r * 4]; };
        for (let j = 0; j < nv; j++) { const a = out(j), c = out((j + 1) % nv); Hm.quad([a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], y1 + 6, c[1]], [a[0], y1 + 6, a[1]], col, seed); }
        for (let j = 0; j < nv; j++) { const j2 = (j + 1) % nv, jp = (j + nv - 1) % nv, A0 = [f[2 * j], f[2 * j + 1]], A1 = [f[2 * j2], f[2 * j2 + 1]], Ap = [f[2 * jp], f[2 * jp + 1]];
          for (const y of [y0 + .5, y1 + .5]) beam(Es, [A0[0], y, A0[1]], [A1[0], y, A1[1]], 1.6, 1.6, col);
          const t1 = Math.atan2(A0[1] - Ap[1], A0[0] - Ap[0]), t2 = Math.atan2(A1[1] - A0[1], A1[0] - A0[0]), turn = Math.abs(((t2 - t1 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
          if (turn > .35) beam(Es, [A0[0], y0, A0[1]], [A0[0] + .01, y1 + .5, A0[1]], 1.6, 1.6, col); }
      });
      const add = (M, mk, a, depth, order) => { if (!M.n) return; const g = M.geometry(), m = new ctx.THREE.Mesh(g, GM[mk] || (GM[mk] = glowMat(a, depth))); m.name = 'glow:' + mk; m.renderOrder = order; m.frustumCulled = false; glowRoot.add(m); glowStats.triangles += M.idx.length / 3; };
      add(Hm, 'aura', .3, true, 20); add(E, 'edges', 1, true, 21); add(E, 'through', .14, false, 22);
      glowStats.buildings = n; toast(`${n} buildings: ${list.join(', ')}`); draw(); return n;
    }
    ctx.onFrame(() => { if (glowOn.length && glowRoot.children.length) draw(); });   // the pulse: keep drawing while a glow shows (index.html glowTick)

    // ---------- Data on the model (index.html buildPins): heritage, quality issues, crime (live, police.uk)
    const pinRoot = new ctx.THREE.Group(); pinRoot.name = 'pins'; scene.add(pinRoot);
    const pinLabels = makeLabels(ctx), pinSrc = { hits: [] }, pinStats = {};
    let crime = null, pinsOn = [];
    addTaps(ctx, () => pinRoot.visible && pinSrc.hits.length ? [pinSrc] : []);
    async function setPins(list) {
      list = (list || []).filter(k => pinChk[k]); pinsOn = list; for (const [k, i] of Object.entries(pinChk)) i.checked = list.includes(k);
      const R = ctx.registry, needAT = list.some(k => k !== 'crime');
      if (needAT && !(R && await R.ready)) { toast('Heritage and quality pins need the atlas index (registry layer); it did not load.'); list = list.filter(k => k === 'crime'); for (const k of ['heritage', 'quality']) pinChk[k].checked = false; }
      const M = { S: new RMesh() }, hits = [], AT = R && R.AT, st = (x, z, y0, hgt, w, col) => stick(M.S, x, z, y0, y0 + hgt, w, col);
      pinLabels.clear(); for (const k of Object.keys(pinStats)) delete pinStats[k];
      if (list.includes('heritage') && AT) { pinStats.heritage = 0;
        for (const g of AT.heritage) { const [x, z] = geo(g.lon, g.lat), y = groundAt(x, z), hgt = 6 + 4 * Math.sqrt(g.n); st(x, z, y, hgt, 3, [.71, .55, 1]); pinStats.heritage++;
          const cd = () => card(`<b>${esc(g.label || 'Heritage records')}</b><div class="small">${g.n} records · ${Object.entries(g.src).map(([s2, n]) => `${esc(s2)} ${n}`).join(', ')}<br>${g.types.map(t => `${esc(t[0])} ${t[1]}`).join(', ')}</div><div class="small"><a href="${CW}atlas/#heritage">heritage in the atlas</a></div>`);
          hits.push({ x, y: y + hgt, z, card: cd });
          if (g.n >= 30) pinLabels.add(`${g.label || 'records'}: ${g.n.toLocaleString('en-GB')}`, x, y + hgt, z, 2, cd, () => pinRoot.visible); } }
      if (list.includes('quality') && AT) {
        try { const q = await loadJSON(CW + 'quality/issues.json'), by = new Map(); pinStats.quality = 0;
          for (const i of q.issues) if (i.ent === 'b') { const s2 = by.get(i.id) || { n: 0, high: 0, med: 0 }; s2.n++; if (i.sev === 'high') s2.high++; else if (i.sev === 'medium') s2.med++; by.set(i.id, s2); }
          const ix = new Map(AT.buildings.map(b => [b.id, b]));
          for (const [id, s2] of by) { const b = ix.get(id); if (!b || !b.mi.length) continue; const top = Math.max(...b.mi.map(i => A.buildings[i].b + A.buildings[i].h)); st(b.x, b.z, top, 4 + 3 * s2.n, 2.5, s2.high ? [.95, .2, .2] : s2.med ? [1, .7, .2] : [.6, .65, .7]); pinStats.quality++;
            hits.push({ x: b.x, y: top + 4 + 3 * s2.n, z: b.z, card: () => card(`<b>${esc(b.n || id)}</b> <span class="small">${esc(id)}</span><div>${s2.n} data-quality issues (${s2.high} high, ${s2.med} medium)</div><div class="small">Tap the building for the list (registry card). <a href="${CW}quality/">quality report</a></div>`) }); } }
        catch (e) { toast('The quality issues did not load: ' + esc(e.message)); pinChk.quality.checked = false; } }
      if (list.includes('crime')) {
        if (!crime) { pinNote.textContent = 'Loading crime records from police.uk…'; try {
          const poly = '51.498,-0.030:51.510,-0.030:51.510,-0.005:51.498,-0.005';   // the Canary Wharf box (index.html)
          const get = async u => { const r = await fetch(u); if (!r.ok) throw new Error(u.split('?')[0] + ' ' + r.status); return r.json(); };
          const [upd, cl] = await Promise.all([get('https://data.police.uk/api/crime-last-updated'), get(`https://data.police.uk/api/crimes-street/all-crime?poly=${poly}`)]);
          crime = { month: cl[0]?.month || upd.date, list: cl }; } catch (e) { pinNote.textContent = 'police.uk did not answer: ' + e.message; pinChk.crime.checked = false; } }
        if (crime && pinChk.crime.checked) { const at = new Map(), cats = {}; for (const c of crime.list) { cats[c.category] = (cats[c.category] || 0) + 1; const k = c.location.latitude + ',' + c.location.longitude; at.set(k, (at.get(k) || 0) + 1); }
          for (const [k, n] of at) { const [la, lo] = k.split(',').map(Number), [x, z] = geo(lo, la), g = groundAt(x, z); st(x, z, g, 3 + 2.5 * n, 2.2, [.95, .35, .25]);
            hits.push({ x, y: g + 3 + 2.5 * n, z, card: () => card(`<b>${n} crime record${n > 1 ? 's' : ''}, ${esc(crime.month)}</b><div class="small">At one anonymised point (police.uk snaps each record to a nearby map point). ${esc(crime.list.filter(c => c.location.latitude + ',' + c.location.longitude === k).map(c => c.category.replace(/-/g, ' ')).join(', '))}. Source: data.police.uk, Open Government Licence v3.0.</div>`) }); }
          pinStats.crime = { month: crime.month, records: crime.list.length, points: at.size };
          pinNote.textContent = `Crime ${crime.month}: ${crime.list.length} records at ${at.size} anonymised points in the Canary Wharf box (police.uk, Open Government Licence). ` + Object.entries(cats).sort((p, q) => q[1] - p[1]).slice(0, 6).map(([c, n]) => `${c.replace(/-/g, ' ')} ${n}`).join(', '); }
      }
      for (const g of [...pinRoot.children]) disposeGroup(g);
      pinSrc.hits = hits; if (M.S.n) pinRoot.add(buildGroup(M, 'pins')); draw();
    }
    const qList = k => (ctx.qs.get(k) || '').split(',').filter(Boolean);

    // ---------- start: every part (or ?ov=a,b) and ?colour=
    for (const k of (ctx.qs.has('ov') ? ctx.qs.get('ov') : Object.keys(P).filter(k => k !== 'heli').join(',')).split(',').filter(k => P[k])) setPart(k, true, true);   // all on by default except the helicopter route (owner, 2026-10-09); ?ov= or ?ov=a,b to choose
    if (MODES[ctx.qs.get('colour')]) setColour(ctx.qs.get('colour'));
    if (qList('glow').length) setGlow(qList('glow'));
    if (qList('pins').length) setPins(qList('pins'));

    const api = { object: root, ownUi: true, setPart, setColour, setGlow, setPins, parts: P, data, stats, glowStats, pinStats, get glow() { return glowOn.slice(); }, get pins() { return pinsOn.slice(); },
      get state() { return { colour: colourMode, parts: Object.fromEntries(Object.values(P).map(p => [p.k, { on: p.on, n: p.n, hits: p.hits.length, polys: p.polys.length, tris: p.tris, ms: p.ms }])), ...stats }; } };
    ctx.overlays = api;
    return api;
  },
};
