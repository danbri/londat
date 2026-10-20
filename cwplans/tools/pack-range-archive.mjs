#!/usr/bin/env node
// Pack a folder of many small files into one ZIP archive that a browser reads entry by entry with HTTP range requests
// (reader: docklands/geo/range-archive.js). Prototype of the hosting study
// https://github.com/danbri/londat/blob/main/docs/hosting-options.md (owner, 2026-10-20: "we need to work on scaling ...
// consider our options, eg http range reqs?"). Skill: docklands-3d-page, "Hosting: range reads and one-file archives".
//
//   node cwplans/tools/pack-range-archive.mjs <folder> <out.zip> [--last manifest.json] [--store] [--exclude <regex>]
//   e.g. node cwplans/tools/pack-range-archive.mjs cwplans/docklands/data/uk docklands/test/out/archive/uk.zip --last manifest.json
//
// - Deterministic: the same input files give the same bytes (fixed date 1980-01-01, fixed order, zlib level 9), so the
//   archive is named by its SHA-256 like any other graph or file version (skill cwplans-dataflow). Packing changes no
//   content: it is a container step, and every entry is the input file byte for byte (CRC-32 in the archive).
// - Entries are deflated (method 8) unless that does not make them smaller (stored, method 0). Reason: a range read
//   is sent with `Accept-Encoding: identity` by the browser (Chromium does this, measured 2026-10-20), so the host's
//   gzip does not apply; the archive must carry its own compression.
// - Order: by folder, then, inside a folder, files named `<x>-<y>.<ext>` or `<z>-<x>-<y>.<ext>` (quadtree cells, place
//   tiles) by Morton (Z-order) code of x, y, so the cells of one view sit close together and one range covers them;
//   other files by name. `--last <name>` puts that entry last, just before the central directory, so that the reader's
//   first request (the end of the file) brings it too (the skeleton's manifest.json).
// - Limits: no ZIP64 (under 4 GB and 65,535 entries); names in UTF-8 (flag bit 11).
// - Use a .zip name on GitHub Pages: Pages gzips application/octet-stream (an unknown extension such as .3tz or .pmtiles)
//   when the client accepts gzip, and a range is then cut from the gzip stream for clients that do not send identity.
// Output: the archive and a JSON line on stdout (files, bytes in, bytes out, entries deflated, SHA-256).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';

export function morton(x, y) { let m = 0n; const X = BigInt(x), Y = BigInt(y); for (let i = 0n; i < 32n; i++) m |= ((X >> i) & 1n) << (2n * i) | ((Y >> i) & 1n) << (2n * i + 1n); return m; }
const cellKey = name => { const m = /^(?:(\d+)-)?(\d+)-(\d+)\.[A-Za-z0-9]+$/.exec(name); return m ? morton(+m[2], +m[3]) : null; };

// order: folder by folder (the folder's path), cells by Morton code, other files by name; `last` at the end
export function orderPaths(paths, last = null) {
  const key = p => { const i = p.lastIndexOf('/'); return [i < 0 ? '' : p.slice(0, i), p.slice(i + 1)]; };
  const out = paths.filter(p => p !== last).sort((a, b) => {
    const [da, na] = key(a), [db, nb] = key(b); if (da !== db) return da < db ? -1 : 1;
    const ca = cellKey(na), cb = cellKey(nb);
    if (ca != null && cb != null && ca !== cb) return ca < cb ? -1 : 1;
    if ((ca == null) !== (cb == null)) return ca == null ? 1 : -1;
    return na < nb ? -1 : na > nb ? 1 : 0;
  });
  if (last && paths.includes(last)) out.push(last);
  return out;
}

// files: [{ name, data: Uint8Array }] in archive order -> Buffer (a ZIP)
export function zipFiles(files, { store = false, level = 9 } = {}) {
  const parts = [], cen = []; let off = 0, deflated = 0;
  const DOS_TIME = 0, DOS_DATE = (0 << 9) | (1 << 5) | 1;   // 1980-01-01 00:00, fixed for a deterministic archive
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'), data = Buffer.from(f.data), crc = crc32(data);
    let method = 0, body = data;
    if (!store) { const z = deflateRawSync(data, { level }); if (z.length < data.length) { method = 8; body = z; deflated++; } }
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x0800, 6); loc.writeUInt16LE(method, 8);
    loc.writeUInt16LE(DOS_TIME, 10); loc.writeUInt16LE(DOS_DATE, 12); loc.writeUInt32LE(crc, 14);
    loc.writeUInt32LE(body.length, 18); loc.writeUInt32LE(data.length, 22); loc.writeUInt16LE(name.length, 26); loc.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(method, 10);
    c.writeUInt16LE(DOS_TIME, 12); c.writeUInt16LE(DOS_DATE, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20);
    c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    cen.push(c, name); parts.push(loc, name, body); off += 30 + name.length + body.length;
    if (off > 0xfffffff0) throw new Error('pack-range-archive: over 4 GB (ZIP64 not written)');
  }
  if (files.length > 0xfffe) throw new Error('pack-range-archive: over 65,534 entries (ZIP64 not written)');
  const cd = Buffer.concat(cen), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return { zip: Buffer.concat([...parts, cd, e]), deflated, cdBytes: cd.length };
}

export function packFolder(dir, { last = null, store = false, exclude = null } = {}) {
  const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
  const paths = walk(dir).map(p => relative(dir, p).split(sep).join('/')).filter(p => !(exclude && exclude.test(p)));
  const ordered = orderPaths(paths, last);
  const files = ordered.map(name => ({ name, data: readFileSync(join(dir, name)) }));
  const { zip, deflated, cdBytes } = zipFiles(files, { store });
  return { zip, report: { folder: dir, files: files.length, bytes_in: files.reduce((s, f) => s + f.data.length, 0), bytes_out: zip.length, central_directory_bytes: cdBytes, deflated, sha256: createHash('sha256').update(zip).digest('hex') } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); if (i < 0) return null; const v = a[i + 1]; a.splice(i, 2); return v; };
  const last = opt('--last'), ex = opt('--exclude'), store = a.includes('--store'); if (store) a.splice(a.indexOf('--store'), 1);
  const [dir, out] = a;
  if (!dir || !out || !statSync(dir).isDirectory()) { console.error('usage: pack-range-archive.mjs <folder> <out.zip> [--last name] [--store] [--exclude regex]'); process.exit(2); }
  const { zip, report } = packFolder(dir, { last, store, exclude: ex ? new RegExp(ex) : null });
  mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, zip);
  console.log(JSON.stringify({ out, ...report }));
}
