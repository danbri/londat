// The kgx dataflow runtime: every step is an operation (a tool or task named in a skill) applied to immutable inputs
// (graph versions, or files identified by SHA-256) with parameters, giving immutable graph versions. A graph version is
// named by its content: the RDFC-1.0 SHA-256 (@factoidal/core fn.hash; for graphs without blank nodes the SHA-256 of
// the sorted unique N-Triples lines, which is the same value). Each run of an operation is a prov:Activity whose IRI is
// the hash of (operation, operation version, input identities, parameters), so an activity already in the log is not
// run again and the same inputs always name the same outputs. Every IRI here is an ID under https://kgx.foaf.tv/id/
// (kgx-ids.mjs kid): input files sha256<hash>, graph versions graph<name><hash16>, activities act<hash16>. Operation
// map-legacy-ids (mapLegacyVersion) gives a version written with names of the old namespaces again with the IDs.
// Library; used by build-kgx.mjs and the tools that write graph versions. Skills: cwplans-dataflow, cwplans-kgx.
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { gzipSync, gunzipSync } from 'zlib';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { serialize, Dataset, dataFactory as F } from '@factoidal/core';
import * as fn from '@factoidal/core/fn';
import { kid, mapLegacy } from './kgx-ids.mjs';

const sha256 = b => createHash('sha256').update(b).digest('hex');
const short = h => h.slice(0, 16);

export class Flow {
  constructor(out) {
    this.out = out; this.logFile = join(out, 'log', 'activities.jsonl'); mkdirSync(dirname(this.logFile), { recursive: true });
    this.log = new Map(); this.files = new Map(); this.versions = new Map(); this.fileOf = new Map(); this.heads = new Map(); this.used = []; this.ran = [];
    if (existsSync(this.logFile)) for (const l of readFileSync(this.logFile, 'utf8').split('\n')) if (l.trim()) { const a = JSON.parse(l); this.log.set(a.id, a); }
    const vf = join(out, 'log', 'versions.jsonl');
    if (existsSync(vf)) for (const l of readFileSync(vf, 'utf8').split('\n')) if (l.trim()) { const v = JSON.parse(l); this.versions.set(v.iri, v); if (!this.fileOf.has(v.file)) this.fileOf.set(v.file, v.iri); }
  }
  // a file input: identified by the SHA-256 of its bytes
  file(path, label = path) {
    if (this.files.has(path)) return this.files.get(path);
    const b = readFileSync(path), h = sha256(b);
    const f = { kind: 'file', iri: kid('artifact', 'sha256', h), sha256: h, bytes: b.length, label }; this.files.set(path, f); return f;
  }
  // canonical N-Triples lines of a quad list (graph term dropped), unique and sorted, and their RDFC-1.0 hash
  async canonical(quads) {
    const ds = new Dataset(quads.map(q => F.quad(q.subject, q.predicate, q.object, F.defaultGraph())));
    const text = await serialize(ds, { format: 'nquads' });
    const lines = [...new Set(text.split('\n').filter(Boolean))].sort();
    if (lines.length !== new Set(quads.map(q => [q.subject.termType, q.subject.value, q.predicate.value, q.object.termType, q.object.value, q.object.datatype?.value, q.object.language].join('\u0001'))).size)
      throw new Error('serialize() lost or merged quads');
    const blank = quads.some(q => q.subject.termType === 'BlankNode' || q.object.termType === 'BlankNode');
    const hash = blank ? await fn.hash(await fn.parse(lines.join('\n') + '\n', { format: 'nquads' })) : sha256(lines.join('\n') + '\n');
    return { lines, hash };
  }
  // write one graph version (immutable file under graphs/<name>/<hash16>.nq.gz) and return its record
  async version(name, quads, about) { const { lines, hash } = await this.canonical(quads); return this.write(name, lines, hash, about); }
  // canonical lines given (already sorted and unique, graph term dropped): a subset of a version's lines is canonical
  async versionLines(name, lines, about) {
    const blank = lines.some(l => l.startsWith('_:') || / _:\S+ \.$/.test(l));
    const hash = blank ? await fn.hash(await fn.parse(lines.join('\n') + '\n', { format: 'nquads' })) : sha256(lines.join('\n') + '\n');
    return this.write(name, lines, hash, about);
  }
  write(name, lines, hash, about) {
    const iri = kid('graph', name, short(hash)), known = this.versions.get(iri);
    // every line of a version file carries the version IRI as its graph term. A file written before 2026-10-07 under a
    // name of the old namespace keeps that name, so a new version of the same content gets its own file (-id)
    let rel = known ? known.file : `graphs/${name}/${short(hash)}.nq.gz`;
    if (!known && this.fileOf.has(rel) && this.fileOf.get(rel) !== iri) rel = `graphs/${name}/${short(hash)}-id.nq.gz`;
    const path = join(this.out, rel);
    if (!existsSync(path)) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, gzipSync(lines.map(l => l.replace(/ \.$/, ` <${iri}> .`)).join('\n') + '\n')); }
    const blank = lines.some(l => l.startsWith('_:') || / _:\S+ \.$/.test(l));
    const v = { kind: 'graph', name, iri, rdfc10_sha256: hash, triples: lines.length, file: rel, ...(blank ? { blank } : {}), ...about };
    if (!known) { this.versions.set(iri, v); this.fileOf.set(rel, iri); appendFileSync(join(this.out, 'log', 'versions.jsonl'), JSON.stringify(v) + '\n'); }
    return v;
  }
  // read a graph version back as quads in its own named graph
  read(v) { return gunzipSync(readFileSync(join(this.out, v.file))).toString(); }
  // run an operation: op = { id, version, skill, tool, about }; inputs = graph versions or files; body returns
  // { <outputName>: { quads, about } } or [quads, about] for one output named op.output
  async run(op, inputs, params, body) {
    const id = kid('activity', short(sha256(JSON.stringify([op.id, op.version, inputs.map(i => i.iri), params ?? null]))));
    const known = this.log.get(id);
    if (known && known.outputs.every(o => this.versions.has(o) && existsSync(join(this.out, this.versions.get(o).file)))) {
      this.used.push(id); return Object.fromEntries(known.outputs.map(o => [this.versions.get(o).name, this.versions.get(o)]));
    }
    const started = new Date().toISOString(), res = await body(params);
    const outs = {};
    for (const [name, { quads, lines, about }] of Object.entries(res)) outs[name] = lines ? await this.versionLines(name, lines, about) : await this.version(name, quads, about);
    const a = { id, operation: op.id, operation_version: op.version, skill: op.skill, tool: op.tool, about: op.about, inputs: inputs.map(i => i.iri),
      params: params ?? null, outputs: Object.values(outs).map(o => o.iri), started, ended: new Date().toISOString() };
    this.log.set(id, a); appendFileSync(this.logFile, JSON.stringify(a) + '\n'); this.used.push(id); this.ran.push(id);
    return outs;
  }
  setHead(name, v) { this.heads.set(name, v.iri); }
}

// operations shared by every pipeline: set algebra and the store partition, all value to value
export const OPS = {
  partition: { id: 'partition-by-subject-key', version: 4, skill: 'cwplans-dataflow', tool: 'cwplans/tools/kgx-ops.mjs',
    about: 'Split one graph version into parts of about params.target triples: subjects in Shardborough zone-key order (type byte, UTF-8 length as 4 bytes little-endian, UTF-8 text, first 64 bytes), a subject never split; each part canonical (sorted lines); the parts union to the input.' },
  mapLegacyIds: { id: 'map-legacy-ids', version: 1, skill: 'cwplans-dataflow', tool: 'cwplans/tools/kgx-ops.mjs (mapLegacy in cwplans/tools/kgx-ids.mjs)',
    about: 'One graph version -> the same triples with mapLegacy() applied to every IRI term: names of the old namespaces (https://danbri.github.io/londat/kgx/, the register and web-harvest names under https://danbri.github.io/glitchcan-minigam/, urn:cwplans:local:, CWG address and hours nodes) become IDs under https://kgx.foaf.tv/id/; literals, vocabulary terms and other IRIs unchanged.' },
};
// a quad with mapLegacy() applied to every IRI term, in the default graph (the runtime names the version)
const mapTerm = t => t.termType === 'NamedNode' ? F.namedNode(mapLegacy(t.value)) : t;
export const mapQuad = q => F.quad(mapTerm(q.subject), mapTerm(q.predicate), mapTerm(q.object), F.defaultGraph());
// the quads of N-Quads text, parsed by Factoidal a chunk of lines at a time: N-Quads has one statement per line, and one
// parse grows faster than the text (17,148 lines 15 s, 294,405 lines more than 10 minutes; 2,000 lines about 0.7 s).
// A blank node label holds only inside one parse: give text with blank nodes chunk = Infinity.
export async function quadsOf(text, chunk = 2000) {
  const lines = text.split('\n').filter(Boolean), out = [];
  for (let i = 0; i < lines.length; i += chunk) for (const q of (await fn.parse(lines.slice(i, i + chunk).join('\n') + '\n', { format: 'nquads' })).toArray()) out.push(q);
  return out;
}
// operation map-legacy-ids on one version (a version made by another tool before 2026-10-07, named in
// external-heads.json): the same name, title and licence; the content with IDs
export async function mapLegacyVersion(flow, v) {
  const outs = await flow.run(OPS.mapLegacyIds, [v], null, async () => ({
    [v.name]: { quads: (await quadsOf(flow.read(v), v.blank ? Infinity : 2000)).map(mapQuad), about: { title: v.title, licence: v.licence, ...(v.osm ? { osm: true } : {}) } } }));
  return outs[v.name];
}
// the Shardborough wire-version-10 zone key of an IRI (the manifest stores the first 64 bytes of the smallest and the
// largest key of each block; a query with a constant subject or object skips a block whose range cannot hold it)
export function zoneKey(iri) { const b = Buffer.from(iri, 'utf8'), h = Buffer.alloc(5); h.writeUInt32LE(b.length, 1); return Buffer.concat([h, b]).subarray(0, 64); }
// split canonical lines (graph term dropped) into parts: group by subject, order the groups by zone key, cut at
// `target` lines, sort each part (a sorted subset of canonical lines is canonical)
export function partitionLines(lines, target) {
  const groups = new Map();
  for (const l of lines) { const s = l.slice(1, l.indexOf('> ')); let g = groups.get(s); if (!g) groups.set(s, g = []); g.push(l); }
  const order = [...groups.keys()].map(s => [s, zoneKey(s)]).sort((a, b) => Buffer.compare(a[1], b[1]));
  const parts = []; let cur = [];
  for (const [s] of order) { if (cur.length >= target) { parts.push(cur.sort()); cur = []; } cur.push(...groups.get(s)); }
  if (cur.length) parts.push(cur.sort()); return parts;
}
