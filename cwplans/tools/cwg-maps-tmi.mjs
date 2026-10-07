#!/usr/bin/env node
// OCR and normalise the Canary Wharf Group maps and guides in danbri/londat third_party/cwg/maps/ into
// third_party/cwg/_TMI/ (store guide: render with pdf.js, OCR with tesseract.js; the other PDFs: pdf.js text layer).
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/cwg-maps-tmi.mjs              # all four files
//   ... --only=store|access|trail|art  one file;  --png, --debug  keep list tiles / ordered list lines in data/raw/cwg-maps-tmi/
// Needs the npm devDependencies pdfjs-dist, @napi-rs/canvas, tesseract.js. eng.traineddata (tesseract.js 4.0.0_best_int)
// is downloaded once into data/raw/cwg-maps-tmi/ (not committed). LONDAT_DIR as in londat.mjs.
// Skill: cwplans-web-harvest, "Mall plans".
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename } from 'node:path';
import { createRequire } from 'node:module';
import { CW, LONDAT_DIR } from './londat.mjs';

const require = createRequire(import.meta.url);
const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
const { createCanvas } = require('@napi-rs/canvas');
const { createWorker } = require('tesseract.js');

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const MAPS = join(LONDAT_DIR, 'third_party/cwg/maps');
const OUT = join(LONDAT_DIR, 'third_party/cwg/_TMI');
const RAW = join(CW, 'data/raw/cwg-maps-tmi');
const LANG_URL = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz';
mkdirSync(OUT, { recursive: true }); mkdirSync(RAW, { recursive: true });

const FILES = {
  store: '260720_store_guide_JULY_composite_v85_vec.pdf',
  access: 'AccesibilityMap_MAY-2025_v2.pdf',
  trail: 'JUNE-2025-Childrens-Art-Trail_Map_Online_AW.pdf',
  art: 'Art-Brochure_Whale-cover.pdf',
};
const r1 = v => Math.round(v * 10) / 10;
const bboxOf = b => [r1(b[0]), r1(b[1]), r1(b[2]), r1(b[3])];
const sha256 = buf => createHash('sha256').update(buf).digest('hex');
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const clean = s => s.replace(/\s+/g, ' ').trim();
const writeJSON = (f, o) => writeFileSync(join(OUT, f), JSON.stringify(o, null, 1) + '\n');

async function openPdf(name) {
  const data = readFileSync(join(MAPS, name));
  const doc = await getDocument({ data: new Uint8Array(data), verbosity: 0, useSystemFonts: false }).promise;
  return { doc, sha256: sha256(data), bytes: data.length, name };
}

// ---------- rendering and OCR ----------
// region [x0, y0, x1, y1] in PDF points, origin top left of the page, y down (the convention of every bbox written here)
async function renderRegion(page, region, dpi) {
  const s = dpi / 72, [x0, y0, x1, y1] = region;
  const vp = page.getViewport({ scale: s, offsetX: -x0 * s, offsetY: -y0 * s });
  const c = createCanvas(Math.ceil((x1 - x0) * s), Math.ceil((y1 - y0) * s));
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp, canvas: c }).promise;
  return c;
}

let worker = null;
async function getWorker() {
  if (worker) return worker;
  const gz = join(RAW, 'eng.traineddata.gz');
  if (!existsSync(gz)) {
    console.log('downloading', LANG_URL);
    const res = await fetch(LANG_URL);
    if (!res.ok) throw new Error(`traineddata: HTTP ${res.status} (set NODE_USE_ENV_PROXY=1 behind a proxy)`);
    writeFileSync(gz, Buffer.from(await res.arrayBuffer()));
  }
  worker = await createWorker('eng', 1, { langPath: RAW, cacheMethod: 'none', gzip: true });
  worker.modelSha256 = sha256(readFileSync(gz));
  return worker;
}

// OCR a region in tiles; a line is kept by the tile whose core holds its centre (tiles overlap by `overlap` px)
async function ocrRegion(page, region, { dpi = 400, psm = '3', tileW = 8000, tileH = 3200, overlap = 240, whitelist = '', tag = '', keepPng = false } = {}) {
  const w = await getWorker();
  await w.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1', user_defined_dpi: String(dpi), tessedit_char_whitelist: whitelist });
  const s = dpi / 72, [X0, Y0, X1, Y1] = region;
  const ovPt = overlap / s, twPt = tileW / s, thPt = tileH / s;
  const nx = Math.max(1, Math.ceil((X1 - X0 - ovPt) / (twPt - ovPt))), ny = Math.max(1, Math.ceil((Y1 - Y0 - ovPt) / (thPt - ovPt)));
  const stepX = (X1 - X0 - ovPt) / nx, stepY = (Y1 - Y0 - ovPt) / ny;
  const lines = [];
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const tx0 = X0 + ix * stepX, ty0 = Y0 + iy * stepY, tile = [tx0, ty0, tx0 + stepX + ovPt, ty0 + stepY + ovPt];
    const core = [ix ? tx0 + ovPt / 2 : -1e9, iy ? ty0 + ovPt / 2 : -1e9, ix < nx - 1 ? tile[2] - ovPt / 2 : 1e9, iy < ny - 1 ? tile[3] - ovPt / 2 : 1e9];
    const canvas = await renderRegion(page, tile, dpi);
    const png = canvas.toBuffer('image/png');
    if (keepPng) writeFileSync(join(RAW, `${tag}-t${iy}-${ix}.png`), png);
    const { data } = await w.recognize(png, {}, { blocks: true });
    const toPt = b => [tile[0] + b.x0 / s, tile[1] + b.y0 / s, tile[0] + b.x1 / s, tile[1] + b.y1 / s];
    let bi = 0;
    for (const blk of data.blocks || []) {
      bi++;
      for (const par of blk.paragraphs) for (const ln of par.lines) {
        const bb = toPt(ln.bbox), cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
        if (cx < core[0] || cx >= core[2] || cy < core[1] || cy >= core[3]) continue;
        const words = ln.words.filter(wd => wd.text.trim()).map(wd => ({ text: wd.text, conf: Math.round(wd.confidence), bbox: bboxOf(toPt(wd.bbox)) }));
        if (!words.length) continue;
        lines.push({ text: clean(words.map(x => x.text).join(' ')), conf: Math.round(words.reduce((a, x) => a + x.conf, 0) / words.length), bbox: bboxOf(bb), rowHeight: r1(ln.rowAttributes.rowHeight / s), words, tile: `${iy}-${ix}`, block: bi, tag });
      }
    }
  }
  return lines;
}

// ---------- store guide ----------
const GRIDS = {
  1: { cols: 'ABCDEFGHJKLMNPQ', rows: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16] },
  2: { cols: 'ABCDEFGHJ', rows: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23] },
};
const STORE = {
  1: { lists: [110, 300, 1500, 985], key: [1500, 300, 1842, 985], map: [110, 985, 1730, 2700], title: [100, 40, 1842, 300], footer: [100, 2700, 1842, 2806],
    colStrip: [110, 990, 1740, 1040], rowStrip: [60, 1000, 150, 2700] },
  2: { lists: [1150, 320, 1842, 2740], map: [100, 300, 1080, 2740], title: [100, 40, 1842, 250], footer: [100, 2740, 1842, 2806],
    colStrip: [110, 300, 1080, 345], rowStrip: [60, 340, 145, 2700] },
};
const HEADERS = {
  'shopping mall retail': { group: 'shopping-malls' }, 'street retail': { group: 'street-retail' },
  'shops': { section: 'shops' }, 'restaurants': { section: 'restaurants' }, 'cafes bars': { section: 'cafes-bars' },
  'services': { section: 'services' }, 'entertainment activities': { section: 'entertainment' },
  'estate residential': { group: 'estate', section: 'residential' }, 'offices tenants': { group: 'estate', section: 'offices-tenants' },
  'the estate': { group: 'estate', section: 'office-tenants' }, 'estate buildings by postal address no': { group: 'estate', section: 'estate-buildings' },
  'key to symbols': { group: 'legend', section: 'legend' },
};
const normKey = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
function lev(a, b) {
  if (a === b) return 0; const m = a.length, n = b.length; if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
function matchHeader(text) {
  const k = normKey(text); if (HEADERS[k]) return HEADERS[k];
  for (const [h, v] of Object.entries(HEADERS)) if (Math.abs(h.length - k.length) <= 2 && lev(h, k) <= Math.min(2, Math.floor(h.length / 5))) return v;
  return null;
}

// grid references: "10C", OCR confusions fixed only inside the trailing run of references
const DIGIT_FIX = { S: '5', $: '5', O: '0', o: '0', I: '1', l: '1', '|': '1', '!': '1' };
const COL_FIX = { ')': 'J', ']': 'J', '}': 'J' };
function refOf(tok, grid, { fix }) {
  const m = tok.match(/^([0-9SOoIl|$!]{1,2})([A-Z)\]}])$/); if (!m) return null;
  const strict = /^\d{1,2}[A-Z]$/.test(tok);
  if (!strict && !fix) return null;
  const row = +m[1].split('').map(c => DIGIT_FIX[c] ?? c).join(''), col = COL_FIX[m[2]] ?? m[2];
  if (!grid.rows.includes(row) && !(row >= 1 && row <= grid.rows.at(-1))) return null;
  if (!grid.cols.includes(col)) return null;
  return { row, col, ...(strict ? {} : { ocr_fixed_from: tok }) };
}
function splitRefs(text, grid) {
  const toks = text.split(' ');
  const glued = toks.at(-1).match(/^(.*[A-Za-z’'.])(\d{1,2}[A-Z])$/); if (glued && toks.length >= 1) toks.splice(-1, 1, glued[1], glued[2]);
  const trailing = [];
  while (toks.length > 1) {
    let t = toks.at(-1).replace(/[,.;]+$/, '');
    if (t.endsWith(')') && toks.slice(0, -1).join(' ').includes('(') && /\d[A-Z]\)$/.test(t)) t = t.slice(0, -1);
    const r = refOf(t, grid, { fix: true }); if (!r) break;
    trailing.unshift(r); toks.pop();
  }
  const mid = []; let firstMid = -1;
  toks.forEach((t, i) => { const r = refOf(t.replace(/[,.;)]+$/, ''), grid, { fix: false }); if (r) { mid.push(r); if (firstMid < 0) firstMid = i; } });
  const body = toks.join(' ').replace(/[,\s]+$/, '');
  const head = firstMid >= 0 ? toks.slice(0, firstMid).join(' ').replace(/[,\s]+$/, '') : body;
  const tail = firstMid >= 0 ? toks.slice(firstMid).join(' ') : '';
  return { refs: [...mid, ...trailing], head, tail, body, trailingText: trailing.map(r => `${r.row}${r.col}`).join(', ') };
}
const ADDR = /(?:Cargo,\s*)?(?:\d{1,3}|One|Two|Three)\s+(?:[A-Z][A-Za-z’']+\s+){0,3}?(?:Street|Place|Square|Colonnade|Circus|Lane|Courtyard|Drive|Quay|Walk|Avenue|Road)\b/g;

// directory of known CWG names (registry/sources/brands/cwg-directory.json, field title)
const dirNorm = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’‘`]/g, "'").replace(/&/g, ' and ')
  .replace(/^the /, '').replace(/[^a-z0-9]+/g, ' ').trim();
let DIRECTORY = null;
function directory() {
  if (DIRECTORY) return DIRECTORY;
  const d = JSON.parse(readFileSync(join(CW, 'registry/sources/brands/cwg-directory.json'), 'utf8')).directory;
  DIRECTORY = d.filter(e => e.title).map(e => ({ slug: e.slug, kind: e.kind, title: e.title, n: dirNorm(e.title) }));
  return DIRECTORY;
}
function matchDirectory(name) {
  const n = dirNorm(name); if (n.length < 2) return null;
  let best = null;
  for (const e of directory()) {
    if (Math.abs(e.n.length - n.length) > 3) continue;
    const d = lev(n, e.n); if (!best || d < best.d) best = { d, e };
    if (d === 0) break;
  }
  if (!best) return null;
  const tol = Math.min(3, Math.max(1, Math.floor(n.length * 0.12)));
  if (best.d > tol) return null;
  return { slug: best.e.slug, title: best.e.title, kind: best.e.kind, distance: best.d };
}

// columns: left edges of list lines cluster; an indented line continues the line above
function columnsOf(lines) {
  const xs = lines.map(l => l.bbox[0]).sort((a, b) => a - b);
  const clusters = []; for (const x of xs) { const c = clusters.at(-1); if (c && x - c.at(-1) < 12) c.push(x); else clusters.push([x]); }
  return clusters.filter(c => c.length >= 3).map(c => median(c));
}
function orderLines(lines) {
  const cols = columnsOf(lines);
  for (const l of lines) {
    let best = -1; cols.forEach((x, i) => { if (x <= l.bbox[0] + 3) best = i; });
    l.col = Math.max(0, best); l.colX = cols[l.col] ?? l.bbox[0]; l.indent = r1(l.bbox[0] - l.colX);
  }
  return lines.sort((a, b) => a.col - b.col || a.bbox[1] - b.bbox[1]);
}

function parseLists(lines, pageNo, grid, ctx) {
  const entries = [], med = median(lines.map(l => l.rowHeight));
  let group = pageNo === 1 ? 'shopping-malls' : 'street-retail', section = null, sub = null, building = null;
  const prevBottom = {};
  for (let i = 0; i < lines.length; i++) {
    let L = lines[i];
    const h = matchHeader(L.text);
    if (h && (L.rowHeight > med * 1.2 || normKey(L.text).length > 6)) {
      if (h.group) group = h.group; if (h.section) section = h.section; sub = null; building = null; prevBottom[L.col] = L.bbox[3]; continue;
    }
    if (!section) continue;
    if (L.indent >= 25 && section !== 'legend') continue; // text of the key's symbols, beside a list
    // join continuation lines (indented, same column, directly below)
    const parts = [L];
    while (lines[i + 1] && lines[i + 1].col === L.col && ((lines[i + 1].indent > 2.5 && lines[i + 1].indent < 25) || /^[(a-z]/.test(lines[i + 1].text)) && lines[i + 1].conf >= 60 && lines[i + 1].bbox[1] - parts.at(-1).bbox[3] < med
      && !splitRefs(parts.map(p => p.text).join(' '), grid).refs.length) parts.push(lines[++i]);
    // a list ends at a wide gap (the key's symbols sit under the last list on page 2)
    if (prevBottom[L.col] !== undefined && L.bbox[1] - prevBottom[L.col] > med * 3 && section === 'offices-tenants') { section = null; prevBottom[L.col] = L.bbox[3]; continue; }
    prevBottom[L.col] = parts.at(-1).bbox[3];
    const rawText = clean(parts.map(p => p.text).join(' '));
    const text = rawText.replace(/^\|/, 'I').replace(/(\s)\|(?=[a-z])/g, '$1I').replace(/(^|[\s(])l(?=[tpvdsmnc][a-z])/g, '$1I');
    const words = parts.flatMap(p => p.words);
    const reread = parts.some(p => p.reread);
    const conf = Math.round(words.reduce((a, w) => a + w.conf, 0) / words.length);
    const bbox = [Math.min(...parts.map(p => p.bbox[0])), parts[0].bbox[1], Math.max(...parts.map(p => p.bbox[2])), parts.at(-1).bbox[3]].map(r1);
    const base = { source: ctx.file, page: pageNo, group, section, ...(sub ? { subsection: sub } : {}) };
    if (section === 'legend') {
      const lr = [...text.matchAll(/\b(\d{1,2})([A-Z])\b/g)].map(m => refOf(m[0], grid, { fix: false })).filter(Boolean);
      if (conf >= 70 && (text.match(/[A-Za-z]/g) || []).length >= 3) entries.push({ ...base, name: text, grid_refs: lr, ocr_text: rawText, ocr_confidence: conf, bbox });
      continue;
    }
    const { refs, head, tail, body, trailingText } = splitRefs(text, grid);
    if (section === 'office-tenants') {
      const addrs = [...text.matchAll(ADDR)];
      const name = addrs.length ? text.slice(0, addrs[0].index).replace(/[,\s]+$/, '') : head;
      const buildings = addrs.map((m, k) => {
        const after = text.slice(m.index + m[0].length, addrs[k + 1]?.index ?? text.length).trim().replace(/^[,\s]+|[,\s]+$/g, '');
        const r = after.split(/[\s,]+/).map(t => refOf(t, grid, { fix: true })).find(Boolean) || null;
        return { address: m[0].replace(/^Cargo,\s*/, 'Cargo, '), grid_ref: r };
      });
      entries.push({ ...base, name, buildings, grid_refs: refs.map(({ row, col, ocr_fixed_from }) => ({ row, col, ...(ocr_fixed_from ? { ocr_fixed_from } : {}) })), ocr_text: rawText, ocr_confidence: conf, bbox });
      continue;
    }
    if (!refs.length) {
      if (section === 'offices-tenants' && building) { if (conf < 60 || !/[A-Za-z]{2}/.test(text)) continue; entries.push({ ...base, name: text, building: building.name, grid_refs: building.grid_refs, grid_refs_from: 'building heading', ocr_text: rawText, ocr_confidence: conf, bbox }); continue; }
      if (conf >= 60 && L.indent < 2.5 && text.length < 40 && !/[,]/.test(text)) { sub = text; continue; }
      const bad = text.match(/\b\d{1,2}[A-Z]\b(?=[^A-Za-z]*$)/);
      entries.push({ ...base, name: text, grid_refs: [], ocr_text: rawText, ocr_confidence: conf, bbox, note: bad ? `grid reference ${bad[0]} is outside this page's grid (printed so)` : 'no grid reference read' });
      continue;
    }
    let name = head;
    const see = head.indexOf(' (see ');
    if (see > 0) name = head.slice(0, see);
    const comma = name.indexOf(', ');
    if (comma > 0 && section !== 'estate-buildings') {
      const whole = matchDirectory(name), first = matchDirectory(name.slice(0, comma));
      if (!(whole && (!first || whole.distance <= first.distance))) name = name.slice(0, comma);
    }
    let extra = clean(body.slice(name.length).replace(/^[,\s]+/, ''));
    if (extra && trailingText) extra += ' ' + trailingText;
    const e = { ...base, name, grid_refs: refs };
    if (text !== rawText) e.name_ocr_fixed = true;
    const lvl = text.match(/level\s*(-?\s?\d+)/i); if (lvl) e.level = +lvl[1].replace(/\s/g, '');
    if (extra) e.extra = extra;
    if (section === 'offices-tenants') { building = { name, grid_refs: refs }; e.role = 'building heading'; }
    const m = section === 'estate-buildings' || section === 'residential' || e.role ? null : matchDirectory(name);
    if (m) e.name_matched = m;
    Object.assign(e, { ocr_text: rawText, ocr_confidence: conf, bbox, ...(reread ? { ocr_reread: true } : {}) });
    entries.push(e);
  }
  return entries;
}

// grid label centres from the margin strips (letters along the top, numbers down the left)
async function readGrid(page, pageNo, cfg) {
  const g = GRIDS[pageNo];
  const top = await ocrRegion(page, cfg.colStrip, { dpi: 300, psm: '11', whitelist: g.cols, tag: `p${pageNo}-cols` });
  const left = await ocrRegion(page, cfg.rowStrip, { dpi: 300, psm: '11', whitelist: '0123456789', tag: `p${pageNo}-rows`, tileH: 4000 });
  const cols = top.flatMap(l => l.words).filter(w => g.cols.includes(w.text) && w.conf > 40).map(w => ({ label: w.text, x: r1((w.bbox[0] + w.bbox[2]) / 2) }));
  const rows = left.flatMap(l => l.words).filter(w => g.rows.includes(+w.text) && w.conf > 40).map(w => ({ label: +w.text, y: r1((w.bbox[1] + w.bbox[3]) / 2) }));
  const byLabel = (a, k) => Object.entries(a.reduce((o, v) => ((o[v.label] ??= []).push(v[k]), o), {})).map(([label, v]) => ({ label: isNaN(+label) ? label : +label, [k]: r1(median(v)) }));
  // the labels are evenly spaced: fit position = a + b * index over the labels read, then place every label
  const fit = (read, expected, k) => {
    const pts = read.map(r => [expected.indexOf(r.label), r[k]]).filter(p => p[0] >= 0);
    if (pts.length < 2) return { fitted: null, read };
    const n = pts.length, sx = pts.reduce((a, p) => a + p[0], 0), sy = pts.reduce((a, p) => a + p[1], 0), sxx = pts.reduce((a, p) => a + p[0] ** 2, 0), sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
    const rms = Math.sqrt(pts.reduce((acc, p) => acc + (a + b * p[0] - p[1]) ** 2, 0) / n);
    return { fitted: expected.map((label, i) => ({ label, [k]: r1(a + b * i) })), pitch_pt: r1(b), rms_residual_pt: r1(rms), labels_read: n };
  };
  const cf = fit(byLabel(cols, 'x'), g.cols.split(''), 'x'), rf = fit(byLabel(rows, 'y'), g.rows, 'y');
  return { columns: cf.fitted || [], rows: rf.fitted || [], fit: { columns: { pitch_pt: cf.pitch_pt, rms_residual_pt: cf.rms_residual_pt, labels_read: cf.labels_read }, rows: { pitch_pt: rf.pitch_pt, rms_residual_pt: rf.rms_residual_pt, labels_read: rf.labels_read } }, note: 'label centres fitted to the margin labels that OCR read; a cell spans half a pitch either side of its centre; there is no row 13' };
}
function cellAt(grid, x, y) {
  const near = (arr, v, k) => arr.reduce((b, c) => (!b || Math.abs(c[k] - v) < Math.abs(b[k] - v) ? c : b), null);
  const c = near(grid.columns, x, 'x'), r = near(grid.rows, y, 'y');
  return c && r ? { row: r.label, col: c.label } : null;
}

// connected pixel groups that pass `test`, as boxes in pixels; a grid line drawn over a shape cuts it into pieces,
// so pieces whose boxes touch are joined while the joined box stays within maxW x maxH
function pixelBoxes({ data, width, height }, test, maxW, maxH) {
  const seen = new Uint8Array(width * height), parts = [];
  for (let p = 0; p < width * height; p++) {
    if (seen[p] || !test(p * 4)) continue;
    const st = [p]; seen[p] = 1; let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    while (st.length) {
      const q = st.pop(); n++; const x = q % width, y = (q / width) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const nb of [q - 1, q + 1, q - width, q + width]) if (nb >= 0 && nb < width * height && !seen[nb] && test(nb * 4)) { seen[nb] = 1; st.push(nb); }
    }
    if (x1 - x0 < maxW && y1 - y0 < maxH && n > 20) parts.push({ b: [x0, y0, x1 + 1, y1 + 1], n });
  }
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < parts.length && !merged; i++) for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i].b, b = parts[j].b;
      if (a[0] <= b[2] + 3 && b[0] <= a[2] + 3 && a[1] <= b[3] + 3 && b[1] <= a[3] + 3) {
        const u = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
        if (u[2] - u[0] > maxW || u[3] - u[1] > maxH) continue;
        parts[i] = { b: u, n: parts[i].n + parts[j].n }; parts.splice(j, 1); merged = true; break;
      }
    }
  }
  return parts;
}

// level badges: dark grey discs (#575856) with a white number; found as connected pixels of that colour
async function findBadges(page, pageNo, grid) {
  const dpi = 144, s = dpi / 72, [W, H] = [page.view[2] - page.view[0], page.view[3] - page.view[1]];
  const c = await renderRegion(page, [0, 0, W, H], dpi);
  const { data, width, height } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  const isBadge = i => Math.abs(data[i] - 87) < 10 && Math.abs(data[i + 1] - 88) < 10 && Math.abs(data[i + 2] - 86) < 10;
  const found = [], parts = pixelBoxes({ data, width, height }, isBadge, 46 * s, 46 * s);
  for (const { b, n } of parts) {
    const w = (b[2] - b[0]) / s, h = (b[3] - b[1]) / s;
    if (w >= 20 && w <= 44 && Math.abs(w - h) < 4 && n / ((b[2] - b[0]) * (b[3] - b[1])) > 0.4) found.push(b.map(v => v / s));
  }
  const wk = await getWorker();
  await wk.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '-0123456789', user_defined_dpi: '300' });
  const out = [];
  for (const b of found) {
    const cv = await renderRegion(page, b, 300), cx = cv.getContext('2d'), im = cx.getImageData(0, 0, cv.width, cv.height);
    const r = cv.width / 2; // white digit inside the disc -> black on white
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const i = (y * cv.width + x) * 4, inside = (x - r) ** 2 + (y - cv.height / 2) ** 2 < (r * 0.8) ** 2, light = im.data[i] > 170;
      const v = inside && light ? 0 : 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
    }
    cx.putImageData(im, 0, 0);
    // the minus sign: a separate flat dark component left of the digit in the mask
    const W2 = cv.width, H2 = cv.height, sn = new Uint8Array(W2 * H2), comps = [];
    for (let q = 0; q < W2 * H2; q++) {
      if (sn[q] || im.data[q * 4] !== 0) continue;
      const st = [q]; sn[q] = 1; let a0 = 1e9, b0 = 1e9, a1 = -1, b1 = -1, cnt = 0;
      while (st.length) { const t = st.pop(); cnt++; const x = t % W2, y = (t / W2) | 0; a0 = Math.min(a0, x); a1 = Math.max(a1, x); b0 = Math.min(b0, y); b1 = Math.max(b1, y);
        for (const nb of [t - 1, t + 1, t - W2, t + W2]) if (nb >= 0 && nb < W2 * H2 && !sn[nb] && im.data[nb * 4] === 0) { sn[nb] = 1; st.push(nb); } }
      if (cnt > 15) comps.push({ a0, a1, b0, b1 });
    }
    comps.sort((p, q) => p.a0 - q.a0);
    const flat = comps.find(c => (c.a1 - c.a0) > 2 * (c.b1 - c.b0) && Math.abs((c.b0 + c.b1) / 2 - H2 / 2) < H2 * 0.15);
    const minus = !!flat && comps.some(c => c !== flat && (c.a0 + c.a1) / 2 > (flat.a0 + flat.a1) / 2 + W2 * 0.1);
    const pad = createCanvas(cv.width * 3, cv.height * 2), pc = pad.getContext('2d'); pc.fillStyle = '#fff'; pc.fillRect(0, 0, pad.width, pad.height); pc.drawImage(cv, cv.width, cv.height / 2);
    const { data: d } = await wk.recognize(pad.toBuffer('image/png'));
    let txt = d.text.replace(/\s+/g, '').replace(/[—–]/g, '-');
    if (minus && /^\d$/.test(txt)) txt = '-' + txt;
    if (!minus && /^-\d$/.test(txt)) txt = txt.slice(1);
    const ccx = (b[0] + b[2]) / 2, ccy = (b[1] + b[3]) / 2;
    out.push({ page: pageNo, role: ccy < STORE[pageNo].map[1] ? 'colour key' : 'plan', minus_sign_seen: minus, level_text: txt, level: /^-?\d$/.test(txt) ? +txt : null, ocr_confidence: Math.round(d.confidence), bbox: bboxOf(b), grid_cell: cellAt(grid, ccx, ccy) });
  }
  return out;
}

const MALLS = ['Cabot Place', 'Canada Place', 'Churchill Place', 'Crossrail Place', 'Jubilee Place', 'Waitrose & Partners', 'Park Pavilion', 'One Canada Square Lobby', 'Crossrail Place Roof Garden'];
async function mallLabels(page, pageNo, mapLines, grid) {
  const c = await renderRegion(page, [0, 0, page.view[2] - page.view[0], page.view[3] - page.view[1]], 72), ctx = c.getContext('2d');
  const out = [];
  for (const l of mapLines) {
    const k = normKey(l.text);
    for (const m of MALLS) {
      const mk = normKey(m);
      if (!(k === mk || (Math.abs(k.length - mk.length) <= 1 && lev(k, mk) <= 1))) continue;
      const [x0, y0, x1, y1] = l.bbox.map(Math.round), im = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
      const cnt = {}; for (let i = 0; i < im.length; i += 4) { const lum = im[i] + im[i + 1] + im[i + 2]; if (lum > 690 || lum < 60) continue; const key = [im[i], im[i + 1], im[i + 2]].map(v => v.toString(16).padStart(2, '0')).join(''); cnt[key] = (cnt[key] || 0) + 1; }
      const colour = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0];
      const rgb = colour ? [0, 2, 4].map(i => parseInt(colour.slice(i, i + 2), 16)) : [0, 0, 0];
      if (Math.max(...rgb) - Math.min(...rgb) < 60) continue; // plan text on grey, not a mall label
      out.push({ page: pageNo, name: m, ocr_text: l.text, ocr_confidence: l.conf, bbox: l.bbox, background: colour ? '#' + colour : null, grid_cell: cellAt(grid, (l.bbox[0] + l.bbox[2]) / 2, (l.bbox[1] + l.bbox[3]) / 2) });
    }
  }
  // second pass: the coloured name boxes themselves (white text on a mall colour), OCR'd inverted
  const palette = [...new Set([...out.map(o => o.background).filter(Boolean), ...(mallLabels.palette || [])])];
  mallLabels.palette = palette;
  const dpi = 144, sc = dpi / 72, W = page.view[2] - page.view[0], H = page.view[3] - page.view[1];
  const big = await renderRegion(page, [0, 0, W, H], dpi), { data, width, height } = big.getContext('2d').getImageData(0, 0, big.width, big.height);
  const wk = await getWorker();
  await wk.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '', user_defined_dpi: '300' });
  for (const hex of palette) {
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const near = i => Math.abs(data[i] - rgb[0]) < 24 && Math.abs(data[i + 1] - rgb[1]) < 24 && Math.abs(data[i + 2] - rgb[2]) < 24;
    for (const { b: [x0, y0, X1, Y1], n } of pixelBoxes({ data, width, height }, near, 260 * sc, 32 * sc)) {
      const x1 = X1 - 1, y1 = Y1 - 1;
      const bw = (x1 - x0 + 1) / sc, bh = (y1 - y0 + 1) / sc;
      if (bh < 10 || bh > 32 || bw < 50 || bw > 260 || bw / bh < 2.5 || n / ((x1 - x0 + 1) * (y1 - y0 + 1)) < 0.4) continue;
      const box = [x0 / sc, y0 / sc, (x1 + 1) / sc, (y1 + 1) / sc];
      if (out.some(o => o.bbox[0] < box[2] && o.bbox[2] > box[0] && o.bbox[1] < box[3] && o.bbox[3] > box[1])) continue;
      const cv = await renderRegion(page, box, 300), cx = cv.getContext('2d'), im = cx.getImageData(0, 0, cv.width, cv.height);
      for (let i = 0; i < im.data.length; i += 4) { const v = im.data[i] > 200 && im.data[i + 1] > 200 && im.data[i + 2] > 200 ? 0 : 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; }
      cx.putImageData(im, 0, 0);
      const { data: d } = await wk.recognize(cv.toBuffer('image/png'));
      const txt = clean(d.text).replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ''), k = normKey(txt);
      const m = MALLS.map(mm => ({ mm, dd: lev(k, normKey(mm)) })).sort((a, b) => a.dd - b.dd)[0];
      if (!txt || m.dd > 2) continue;
      out.push({ page: pageNo, name: m.mm, ocr_text: txt, ocr_confidence: Math.round(d.confidence), bbox: bboxOf(box), background: hex, grid_cell: cellAt(grid, (box[0] + box[2]) / 2, (box[1] + box[3]) / 2), found_by: 'colour box' });
    }
  }
  // the colour key (top left of page 1) stacks the mall names; mark it apart from labels on the plan
  for (const o of out) o.role = out.filter(p => p !== o && Math.abs(p.bbox[0] - o.bbox[0]) < 6 && Math.abs(p.bbox[1] - o.bbox[1]) < 140).length >= 3 ? 'colour key' : 'plan label';
  return out;
}

async function storeGuide() {
  const pdf = await openPdf(FILES.store), entries = [], tsv = [], meta = {}, labels = [], badges = [], grids = {};
  const tsvAdd = (pageNo, lines) => lines.forEach((l, li) => l.words.forEach((w, wi) => tsv.push([pageNo, l.tag, l.tile, l.block, li, wi, ...w.bbox, w.conf, w.text.replace(/\t/g, ' ')].join('\t'))));
  for (const pageNo of [1, 2]) {
    const page = await pdf.doc.getPage(pageNo), cfg = STORE[pageNo];
    console.log(`store guide p${pageNo}: grid`);
    grids[pageNo] = await readGrid(page, pageNo, cfg);
    console.log(`store guide p${pageNo}: lists`);
    let lines = await ocrRegion(page, cfg.lists, { tag: `p${pageNo}-lists`, keepPng: !!args.png });
    if (cfg.key) lines = lines.concat(await ocrRegion(page, cfg.key, { tag: `p${pageNo}-key` }).then(k => k.map(l => ({ ...l, text: l.text }))));
    tsvAdd(pageNo, lines.map(l => ({ ...l })));
    const weak = lines.filter(l => l.conf < 75 && l.tag.endsWith('lists'));
    for (const l of weak) { // a second reading of a weak line, alone and at 600 dpi
      const pad = 2, box = [l.bbox[0] - pad, l.bbox[1] - pad, l.bbox[2] + pad + 4, l.bbox[3] + pad];
      const again = await ocrRegion(page, box, { dpi: 600, psm: '7', tag: `p${pageNo}-reread` });
      const best = again.sort((a, b) => b.conf - a.conf)[0];
      if (best && best.conf > l.conf) { l.reread = { from: l.text, conf_before: l.conf }; Object.assign(l, { text: best.text, conf: best.conf, words: best.words }); }
    }
    tsvAdd(pageNo, weak.filter(l => l.reread).map(l => ({ ...l, tag: `p${pageNo}-reread` })));
    const dropped = lines.filter(l => l.conf < 40);
    meta[`page${pageNo}_dropped_lines`] = dropped.map(l => ({ text: l.text, conf: l.conf, bbox: l.bbox }));
    const ordered = orderLines(lines.filter(l => l.conf >= 40));
    if (pageNo === 1) { // the key is its own column on page 1 and carries its own header
      ordered.sort((a, b) => (a.tag === b.tag ? 0 : a.tag.endsWith('key') ? 1 : -1) || a.col - b.col || a.bbox[1] - b.bbox[1]);
    }
    if (args.debug) writeFileSync(join(RAW, `p${pageNo}-lines.txt`), ordered.map(l => [l.col, l.colX, l.indent, l.bbox.join(','), l.rowHeight, l.conf, l.text].join('\t')).join('\n'));
    entries.push(...parseLists(ordered, pageNo, GRIDS[pageNo], { file: FILES.store }));
    console.log(`store guide p${pageNo}: title, footer`);
    const tl = await ocrRegion(page, cfg.title, { dpi: 200, tag: `p${pageNo}-title` });
    const fl = await ocrRegion(page, cfg.footer, { dpi: 400, tag: `p${pageNo}-footer` });
    tsvAdd(pageNo, tl); tsvAdd(pageNo, fl);
    meta[`page${pageNo}`] = { title_text: tl.map(l => l.text), footer_text: fl.map(l => l.text), dropped_low_confidence_lines: meta[`page${pageNo}_dropped_lines`], reread_lines: weak.filter(l => l.reread).map(l => ({ before: l.reread.from, conf_before: l.reread.conf_before, after: l.text, conf_after: l.conf })) };
    delete meta[`page${pageNo}_dropped_lines`];
    console.log(`store guide p${pageNo}: plan`);
    const ml = await ocrRegion(page, cfg.map, { dpi: 300, tileW: 2600, tileH: 2600, overlap: 200, tag: `p${pageNo}-map` });
    tsvAdd(pageNo, ml);
    labels.push(...await mallLabels(page, pageNo, ml, grids[pageNo]));
    if (pageNo === 1) badges.push(...await findBadges(page, pageNo, grids[pageNo]));
    meta[`page${pageNo}`].plan_words = ml.reduce((a, l) => a + l.words.length, 0);
  }
  const ocrMeta = { engine: 'tesseract.js ' + require('tesseract.js/package.json').version, model: 'eng 4.0.0_best_int', model_sha256: (await getWorker()).modelSha256, renderer: 'pdfjs-dist ' + require('pdfjs-dist/package.json').version + ' + @napi-rs/canvas', dpi_lists: 400, dpi_plan: 300 };
  const out = {
    source: { file: `third_party/cwg/maps/${FILES.store}`, sha256: pdf.sha256, bytes: pdf.bytes, pages: pdf.doc.numPages, rights: 'Canary Wharf Group; design Paul Anthony, Ravenshaw Studios Limited. No open licence; scoping use only (see ../README.md).' },
    generated: new Date().toISOString(), tool: 'cwplans/tools/cwg-maps-tmi.mjs (danbri/londat)', ocr: ocrMeta,
    coordinates: 'bbox = [x0, y0, x1, y1] in PDF points, origin at the top left of the page, y down; grid_refs row = number, col = letter',
    pages: meta, grids,
    counts: { entries: entries.length, by_section: entries.reduce((o, e) => ((o[`${e.group}/${e.section}`] = (o[`${e.group}/${e.section}`] || 0) + 1), o), {}), name_matched: entries.filter(e => e.name_matched).length, ocr_fixed_refs: entries.flatMap(e => e.grid_refs).filter(r => r.ocr_fixed_from).length, mall_labels: labels.length, level_badges: badges.length },
    mall_colours: labels.filter(l => l.role === 'colour key').map(l => ({ mall: l.name, colour: l.background })),
    entries, mall_labels: labels, level_badges: badges,
  };
  writeJSON('store-guide-2026-07-20.json', out);
  writeFileSync(join(OUT, 'store-guide-2026-07-20.ocr.tsv'), ['page\tregion\ttile\tblock\tline\tword\tx0\ty0\tx1\ty1\tconf\ttext', ...tsv].join('\n') + '\n');
  console.log('store guide:', JSON.stringify(out.counts));
}

// ---------- text-layer PDFs ----------
async function pageItems(page) {
  const H = page.view[3] - page.view[1], tc = await page.getTextContent();
  return tc.items.filter(it => it.str !== undefined).map(it => {
    const [a, b, , , e, f] = it.transform, size = Math.hypot(a, b), angle = Math.round(Math.atan2(b, a) * 180 / Math.PI);
    const x = e - page.view[0], yb = H - (f - page.view[1]);
    const bbox = angle === 0 ? [x, yb - size * 0.8, x + it.width, yb + size * 0.2] : [x - size, yb - it.width - size, x + size, yb + size];
    return { str: it.str, eol: it.hasEOL, size: r1(size), angle, font: it.fontName, x: r1(x), y: r1(yb), bbox: bboxOf(bbox), w: it.width };
  });
}
// items -> lines in stream order (a new line on EOL or a baseline jump)
function toLines(items) {
  const lines = []; let cur = null;
  for (const it of items) {
    if (it.str.trim() === '' && !it.eol && !cur) continue;
    if (cur && it.str.trim() && (Math.abs(it.y - cur.y) > Math.max(1.5, it.size * 0.3) || it.angle !== cur.angle || it.x < cur.bbox[2] - 1 - it.size || it.bbox[0] - cur.bbox[2] > it.size * 3)) { lines.push(cur); cur = null; }
    if (it.str.trim()) {
      if (!cur) cur = { text: '', x: it.x, y: it.y, size: it.size, angle: it.angle, fonts: new Set(), bbox: [...it.bbox] };
      const gap = it.bbox[0] - cur.bbox[2];
      cur.text += (cur.text && !cur.text.endsWith(' ') && !it.str.startsWith(' ') && gap > it.size * 0.06 ? ' ' : '') + it.str;
      cur.size = Math.max(cur.size, it.size); cur.fonts.add(it.font);
      cur.bbox = [Math.min(cur.bbox[0], it.bbox[0]), Math.min(cur.bbox[1], it.bbox[1]), Math.max(cur.bbox[2], it.bbox[2]), Math.max(cur.bbox[3], it.bbox[3])];
    }
    if (it.eol && cur) { lines.push(cur); cur = null; }
  }
  if (cur) lines.push(cur);
  return lines.map(l => ({ ...l, text: clean(l.text), fonts: [...l.fonts], bbox: bboxOf(l.bbox) })).filter(l => l.text);
}
async function cleanText(doc) {
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) pages.push({ page: p, lines: toLines(await pageItems(await doc.getPage(p))) });
  return pages;
}
const txtOut = (pages, header) => header + '\n\n' + pages.map(p => `=== page ${p.page} ===\n` + p.lines.map(l => l.text).join('\n')).join('\n\n') + '\n';

async function accessMap() {
  const pdf = await openPdf(FILES.access), page = await pdf.doc.getPage(1), lines = toLines(await pageItems(page));
  // lines -> labels: same size and angle, stacked (gap < 0.6 x size) and overlapping horizontally
  const frag = t => t.length <= 3 && !/\s/.test(t), joined = [];
  for (const l of lines) {
    const prev = joined.at(-1);
    if (prev && l.angle !== 0 && prev.angle !== 0 && prev.size === l.size && frag(l.text) && (prev.lastFrag || prev.angle === l.angle) && Math.hypot(l.bbox[0] - prev.lastBox[0], l.bbox[1] - prev.lastBox[1]) < l.size * 3) {
      if (prev.angle !== l.angle) prev.curved = true;
      prev.text += l.text; prev.lastFrag = true; prev.lastBox = l.bbox;
      prev.bbox = bboxOf([Math.min(prev.bbox[0], l.bbox[0]), Math.min(prev.bbox[1], l.bbox[1]), Math.max(prev.bbox[2], l.bbox[2]), Math.max(prev.bbox[3], l.bbox[3])]);
    } else joined.push({ ...l, lastFrag: frag(l.text), lastBox: l.bbox });
  }
  const used = new Set(), labels = [];
  const sorted = joined.map((l, i) => ({ ...l, i })).sort((a, b) => a.bbox[1] - b.bbox[1]);
  for (const l of sorted) {
    if (used.has(l.i)) continue; used.add(l.i);
    const g = [l];
    for (;;) {
      const last = g.at(-1);
      const nx = sorted.find(m => !used.has(m.i) && m.size === last.size && m.angle === last.angle && m.angle === 0 && m.bbox[1] - last.bbox[3] < last.size * 0.6 && m.bbox[1] >= last.bbox[1] && m.bbox[0] < last.bbox[2] && m.bbox[2] > last.bbox[0]);
      if (!nx) break; used.add(nx.i); g.push(nx);
    }
    labels.push({ text: g.map(x => x.text).join(' '), lines: g.map(x => x.text), bbox: bboxOf([Math.min(...g.map(x => x.bbox[0])), g[0].bbox[1], Math.max(...g.map(x => x.bbox[2])), g.at(-1).bbox[3]]), font_size: l.size, angle: l.angle, ...(l.curved ? { curved: true } : {}) });
  }
  const merged = labels;
  const lifts = merged.find(l => l.text === 'LIFTS');
  const inLegend = l => lifts && l.bbox[0] >= lifts.bbox[0] - 2 && l.bbox[1] >= lifts.bbox[1] - 4 && l.bbox[1] <= lifts.bbox[1] + 200;
  const legend = merged.filter(inLegend).map(({ text, bbox }) => ({ text, bbox }));
  const map = merged.filter(l => !inLegend(l)).map(l => ({ ...l, kind: /^[a-z]/.test(l.text) || /[a-z]/.test(l.text) && l.text.split(' ').length <= 4 && /(Street|Way|Walk|Road|Place|Avenue|Quay|Drive|Lane|Bridge|Footbridge|Steps|Colonnade)$/i.test(l.text) ? 'street or path' : 'place, building or station' }));
  const out = {
    source: { file: `third_party/cwg/maps/${FILES.access}`, sha256: pdf.sha256, bytes: pdf.bytes, pages: 1, page_size_pt: [r1(page.view[2] - page.view[0]), r1(page.view[3] - page.view[1])], rights: 'Canary Wharf Group. No open licence; scoping use only (see ../README.md).' },
    generated: new Date().toISOString(), tool: 'cwplans/tools/cwg-maps-tmi.mjs (danbri/londat)', method: 'pdf.js text layer (no OCR)',
    coordinates: 'bbox = [x0, y0, x1, y1] in PDF points, origin at the top left of the page, y down; angle in degrees (0 = horizontal)',
    counts: { labels: map.length, legend: legend.length },
    legend, labels: map,
    not_extracted: 'symbols (lifts, toilets, ramps, car parks) are vector drawings without text; their positions are not in this file',
  };
  writeJSON(basename(FILES.access, '.pdf') + '.json', out);
  writeFileSync(join(OUT, basename(FILES.access, '.pdf') + '.txt'), txtOut(await cleanText(pdf.doc), `${FILES.access}: text layer by page (pdf.js); rights Canary Wharf Group`));
  console.log('access map:', JSON.stringify(out.counts));
}

async function artTrail() {
  const pdf = await openPdf(FILES.trail), entries = [], markers = [];
  for (let p = 1; p <= pdf.doc.numPages; p++) {
    const page = await pdf.doc.getPage(p), lines = toLines(await pageItems(page));
    const used = new Set();
    lines.forEach((l, i) => {
      const m = l.text.match(/^(.*?)\s*\((\d{4}(?:\s*[-–]\s*\d{4})?)\)\s*by\s*(.*)$/); if (!m) return;
      let artist = m[3]; if (!artist && lines[i + 1]) { artist = lines[i + 1].text; used.add(i + 1); }
      let title = m[1].trim(), tl = [];
      if (!title) { tl = lines.filter(t => t.size >= 15 && t.size < 20 && Math.abs(t.bbox[0] - l.bbox[0]) < 4 && t.bbox[3] <= l.bbox[1] + 2 && l.bbox[1] - t.bbox[3] < 30); title = tl.map(t => t.text).join(' '); }
      const top = tl[0] || l;
      const num = lines.filter(n => /^\d{1,2}$/.test(n.text) && n.size >= 20 && Math.abs(n.bbox[1] - top.bbox[1]) < 30 && top.bbox[0] - n.bbox[0] < 40 && top.bbox[0] - n.bbox[0] >= -2).sort((a, b) => Math.abs(a.bbox[0] - top.bbox[0]) - Math.abs(b.bbox[0] - top.bbox[0]))[0];
      // body: lines of the same column below the by-line, until a gap or an activity word
      const body = [], act = []; let last = l, mode = 'body';
      for (const b of lines.filter(b => Math.abs(b.bbox[0] - l.bbox[0]) < 6 && b.bbox[1] > l.bbox[1] && b.size < 15).sort((a, b) => a.bbox[1] - b.bbox[1])) {
        if (b.bbox[1] - last.bbox[3] > 14) break;
        if (/^(LOOK|COUNT|IMAGINE|DRAW|FIND|LISTEN|TOUCH)\b/.test(b.text)) mode = 'act';
        (mode === 'body' ? body : act).push(b.text); last = b;
      }
      entries.push({ number: num ? +num.text : null, title, year: m[2].replace(/\s/g, ''), artist: clean(artist), description: clean(body.join(' ')) || null, activity: act.length ? clean(act.join(' ')) : null, page: p, bbox: top.bbox });
    });
    // map markers: small numbers inside the map frame on page 2
    if (p === 2) for (const l of lines) if (/^\d{1,2}$/.test(l.text) && l.size < 12 && l.bbox[1] > 230 && l.bbox[1] < 610) markers.push({ number: +l.text, page: p, bbox: l.bbox });
  }
  for (const e of entries) { const mk = markers.filter(m => m.number === e.number); if (mk.length) e.map_markers = mk.map(m => m.bbox); }
  for (const e of entries) { const loc = (e.description || '').match(/find this artwork on ([^.]*)/i) || (e.activity || '').match(/find this artwork on ([^.]*)/i); if (loc) e.location_text = loc[1]; }
  entries.sort((a, b) => (a.number ?? 99) - (b.number ?? 99));
  const out = {
    source: { file: `third_party/cwg/maps/${FILES.trail}`, sha256: pdf.sha256, bytes: pdf.bytes, pages: pdf.doc.numPages, rights: 'Canary Wharf Group (photographs and quotes credited in the file). No open licence; scoping use only.' },
    generated: new Date().toISOString(), tool: 'cwplans/tools/cwg-maps-tmi.mjs (danbri/londat)', method: 'pdf.js text layer (no OCR)',
    coordinates: 'bbox = [x0, y0, x1, y1] in PDF points, origin at the top left of the page, y down; map_markers = boxes of the numbered markers on the page 2 map with that number (a number can occur more than once)',
    counts: { artworks: entries.length, with_map_marker: entries.filter(e => e.map_markers).length },
    entries, map_markers: markers,
  };
  writeJSON(basename(FILES.trail, '.pdf') + '.json', out);
  writeFileSync(join(OUT, basename(FILES.trail, '.pdf') + '.txt'), txtOut(await cleanText(pdf.doc), `${FILES.trail}: text layer by page (pdf.js); rights Canary Wharf Group`));
  console.log('art trail:', JSON.stringify(out.counts));
}

async function artBrochure() {
  const pdf = await openPdf(FILES.art), entries = [], zones = {};
  for (let p = 1; p <= pdf.doc.numPages; p++) {
    const page = await pdf.doc.getPage(p), lines = toLines(await pageItems(page));
    // zone names: the contents page sets each big zone letter under its name
    for (const z of lines.filter(l => l.size > 100 && /^[A-E]$/.test(l.text))) {
      const lab = lines.filter(l => l.angle === 0 && l.size >= 9 && l.size <= 11 && l.bbox[1] < z.bbox[1] + 5 && /[a-z]/.test(l.text) && l.text !== 'Zone')
        .sort((a, b) => Math.hypot(a.bbox[0] - z.bbox[0], a.bbox[3] - z.bbox[1]) - Math.hypot(b.bbox[0] - z.bbox[0], b.bbox[3] - z.bbox[1]))[0];
      if (lab && !zones[z.text]) zones[z.text] = lab.text;
    }
    const all = lines.map(l => l.text).join(' ');
    const pageKind = /HIDDEN GEMS/.test(all) ? 'hidden gem' : /LOOKING FOR OTHER/.test(all) ? 'programme' : 'artwork';
    // headings: 15 pt lines, a wrapped heading continues 14 pt below at the same x
    const hs = [];
    for (const l of lines.filter(l => l.size >= 14.5 && l.size <= 16.5)) {
      const prev = hs.find(h => Math.abs(h.bbox[0] - l.bbox[0]) < 2 && l.bbox[1] - h.bbox[3] < 6 && l.bbox[1] > h.bbox[1]);
      if (prev) { prev.text += ' ' + l.text; prev.bbox = bboxOf([prev.bbox[0], prev.bbox[1], Math.max(prev.bbox[2], l.bbox[2]), l.bbox[3]]); }
      else hs.push({ text: l.text, bbox: [...l.bbox] });
    }
    for (const h of hs) {
      // the column starts at the first body line under the heading (a figure number can share the heading's baseline)
      const first = lines.filter(b => b.size < 9 && b.bbox[1] > h.bbox[3] - 1 && b.bbox[1] - h.bbox[3] < 15 && b.bbox[0] < h.bbox[2] && b.bbox[2] > h.bbox[0]).sort((a, b) => a.bbox[1] - b.bbox[1])[0];
      const colX = first ? first.bbox[0] : h.bbox[0];
      const below = hs.filter(o => o !== h && o.bbox[1] > h.bbox[1] && o.bbox[0] < colX + 40 && o.bbox[2] > colX).map(o => o.bbox[1]);
      const stop = below.length ? Math.min(...below) : 1e9;
      const body = lines.filter(b => b.size < 9 && Math.abs(b.bbox[0] - colX) < 4 && b.bbox[1] > h.bbox[3] - 1 && b.bbox[1] < stop).sort((a, b) => a.bbox[1] - b.bbox[1]);
      // the fact block (artist and year, medium, location) ends at the first wider line gap
      const facts = []; let k = 0;
      for (; k < body.length; k++) { if (k && body[k].bbox[1] - body[k - 1].bbox[1] > body[0].size * 1.35) break; facts.push(body[k].text); }
      const desc = clean(body.slice(k).map(b => b.text).join(' ').replace(/(\w)- (\w)/g, '$1-$2'));
      const cm = h.text.match(/^(?:\d+\s+)?([A-E])(\d+)(?:\s*[-–]\s*(?:[A-E])?(\d+))?\s+(.*)$/), nm = h.text.match(/^(\d+)\s+(.*)$/);
      if (!cm && !body.length) continue; // a map label set in the heading size
      const e = { page: p, kind: pageKind, heading: h.text, bbox: h.bbox };
      if (cm) {
        const code = cm[3] ? `${cm[1]}${cm[2]}-${cm[3]}` : `${cm[1]}${cm[2]}`, seen = entries.find(x => x.code === code);
        Object.assign(e, { code, zone: cm[1], number: +cm[2], ...(cm[3] ? { number_to: +cm[3] } : {}), title: cm[4], ...(seen ? { repeat_of_page: seen.page } : {}) });
      } else if (nm && pageKind !== 'artwork') Object.assign(e, { number: +nm[1], title: nm[2] });
      else { const parent = entries.filter(x => x.code && x.page === p).at(-1); Object.assign(e, { kind: parent ? 'artwork part' : pageKind, title: h.text, part_of: parent?.code ?? null, zone: parent?.zone ?? null }); }
      const yearIn = (e.title || '').match(/^(.*?)\s+((?:19|20)\d{2})$/); if (yearIn) { e.title = yearIn[1]; e.year_in_heading = +yearIn[2]; }
      const YEAR = /^(.*?),\s*((?:c\.\s*)?(?:19|20)\d{2}(?:\s*(?:[-–]|and)\s*\d{2,4})?)\s*$/;
      if (facts.length > 1 && !YEAR.test(facts[0]) && YEAR.test(facts[1]) && facts[0] === facts[0].toUpperCase()) facts.splice(0, 2, facts[0] + ' ' + facts[1]);
      if (pageKind === 'programme') { e.description = clean(body.map(b => b.text).join(' ')); entries.push(e); continue; }
      if (facts.length) {
        const am = facts[0].match(YEAR);
        if (am) { e.artist = am[1]; e.year = am[2]; } else e.artist_line = facts[0];
        const rest = facts.slice(1), isUpper = s => s === s.toUpperCase() && /[A-Z]/.test(s);
        const loc = rest.filter(isUpper), med = rest.filter(s => !isUpper(s));
        if (med.length) e.medium = med.join(' ');
        if (loc.length) e.location = loc.join(' ').replace(/,\s*$/, '');
      }
      if (e.repeat_of_page) e.kind = 'spotlight repeat';
      if (/located indoors/i.test(desc) || /^INSIDE\b|\bLOBBY\b|\bMALL\b|LOWER LEVEL|GROUND LEVEL/.test(e.location || '')) e.indoors = true;
      const timed = desc.match(/[^.]*timed to come on[^.]*$/i) || desc.match(/[^.]*is timed to come on at dusk[^.]*/i); if (timed) e.lighting_note = clean(timed[0]);
      e.description = desc || null;
      entries.push(e);
    }
  }
  for (const e of entries) if (e.zone && zones[e.zone]) e.zone_name = zones[e.zone];
  const out = {
    source: { file: `third_party/cwg/maps/${FILES.art}`, sha256: pdf.sha256, bytes: pdf.bytes, pages: pdf.doc.numPages, rights: 'Canary Wharf Group; artworks and photographs by their artists and photographers. No open licence; scoping use only.' },
    generated: new Date().toISOString(), tool: 'cwplans/tools/cwg-maps-tmi.mjs (danbri/londat)', method: 'pdf.js text layer (no OCR)',
    coordinates: 'bbox = the heading, [x0, y0, x1, y1] in PDF points, origin at the top left of the page, y down',
    zones, counts: { entries: entries.length, by_kind: entries.reduce((o, e) => ((o[e.kind] = (o[e.kind] || 0) + 1), o), {}), with_code: entries.filter(e => e.code).length, with_artist_year: entries.filter(e => e.year).length, with_location: entries.filter(e => e.location).length },
    entries,
  };
  writeJSON(basename(FILES.art, '.pdf') + '.json', out);
  writeFileSync(join(OUT, basename(FILES.art, '.pdf') + '.txt'), txtOut(await cleanText(pdf.doc), `${FILES.art}: text layer by page (pdf.js); rights Canary Wharf Group and the artists`));
  console.log('art brochure:', JSON.stringify(out.counts));
}

const jobs = { store: storeGuide, access: accessMap, trail: artTrail, art: artBrochure };
for (const [k, fn] of Object.entries(jobs)) if (!args.only || args.only === k) await fn();
if (worker) await worker.terminate();
