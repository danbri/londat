// Shared code of the tide tools (fit-tide-harmonics.mjs, build-tide-history.mjs): the three EA tide gauges round the 3D
// model, the cached fetch of one EA daily archive file (readings-YYYY-MM-DD.csv: every station in England, about 60 MB,
// OGL v3.0), streamed and filtered to the three 15-minute tidal level measures, and the reader of the cached lines.
// Cache: data/raw/river/tide/archive-YYYY-MM-DD.csv (gitignored); an empty file means "the EA has no file for that day".
// Skill: docklands-sky, "Tide prediction" and "Tide history".
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'fs';
import { join } from 'path';
import { TOOLS, UA } from './lib.mjs';

export const RAWD = join(TOOLS, '..', 'data', 'raw', 'river', 'tide');
export const STATIONS = { '0007': 'Tower Pier', '0003': 'Charlton', '0001': 'Silvertown' };
export const MEASURE = id => `http://environment.data.gov.uk/flood-monitoring/id/measures/${id}-level-tidal_level-i-15_min-mAOD`;
export const API = 'https://environment.data.gov.uk/flood-monitoring';
export const ARCHIVE_URL = d => `${API}/archive/readings-${d}.csv`;
export const archiveFile = d => join(RAWD, `archive-${d}.csv`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
mkdirSync(RAWD, { recursive: true });

// GET with the repository's User-Agent; 404 -> null; other errors retried (3, 6, 9 ... s; `tries` attempts)
export async function getRetry(u, stream = false, tries = 4) {
  for (let k = 0; ; k++) {
    try { const r = await fetch(u, { headers: { 'User-Agent': UA } }); if (r.status === 404) return null; if (!r.ok) throw new Error(`${r.status} ${u}`); return stream ? r : Buffer.from(await r.arrayBuffer()); }
    catch (e) { if (k >= tries - 1 || /^4\d\d /.test(e.message)) throw e; await sleep(3000 * (k + 1)); }
  }
}
// one archive day: stream the CSV, keep the lines of the three measures; not fetched again when cached. The whole stream is
// retried when it breaks (the file is written only when complete). Returns 'cached', 'none' or the number of lines kept.
export async function fetchArchive(d, tries = 4) {
  const f = archiveFile(d); if (existsSync(f)) return 'cached';
  const keep = Object.keys(STATIONS).map(m => MEASURE(m) + ',');
  for (let k = 0; ; k++) {
    try {
      const r = await getRetry(ARCHIVE_URL(d), true, tries); if (!r) { writeFileSync(f, ''); return 'none'; }
      const dec = new TextDecoder(), lines = []; let buf = '';
      const take = L => { if (keep.some(m => L.includes(m))) lines.push(L.trim()); };
      for await (const chunk of r.body) { buf += dec.decode(chunk, { stream: true }); const parts = buf.split('\n'); buf = parts.pop(); for (const L of parts) take(L); }
      buf += dec.decode(); if (buf) take(buf);
      writeFileSync(f + '.part', lines.join('\n') + '\n'); renameSync(f + '.part', f); return lines.length;
    } catch (e) { if (k >= tries - 1) throw e; await sleep(2000 * 2 ** k); }
  }
}
// the cached lines of one day: { text, readings: { id: [[t ms, v m AOD], ...] } } (null when not cached)
export function readArchive(d) {
  const f = archiveFile(d); if (!existsSync(f)) return null;
  const text = readFileSync(f, 'utf8'), readings = {};
  for (const L of text.split('\n')) { const [t, m, v] = L.split(','); if (!m) continue; const id = m.match(/measures\/(\d{4})-/)?.[1], x = parseFloat(v); if (id && STATIONS[id] && isFinite(x)) (readings[id] ||= []).push([Date.parse(t), x]); }
  return { text, readings };
}
