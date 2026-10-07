// Clean one real-world JSON-LD block (the raw text of a <script type="application/ld+json">) before an RDF parser
// sees it. Returns { docs: [JSON-LD documents], repairs: { class: count }, error }. Every change is counted by class.
//   import { cleanJsonLd } from './jsonld-clean.mjs';
// Used by tools/extract-structured-data.mjs; tests in tools/test/jsonld-clean.test.mjs.
// The classes and why each exists: skills/docklands-data-curation/SKILL.md, "Structured data from rendered pages".
const S = 'https://schema.org/';
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', pound: '£', euro: '€', eacute: 'é', egrave: 'è', copy: '©', reg: '®', trade: '™', middot: '·', bull: '•', aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ouml: 'ö', auml: 'ä', ccedil: 'ç' };
const ENT_RE = /&(#x[\da-f]+|#\d+|[a-z]+);/gi;
const decodeEntities = s => s.replace(ENT_RE, (m, e) => e[0] === '#' ? (() => { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1); try { return String.fromCodePoint(n); } catch { return m; } })() : (ENT[e.toLowerCase()] ?? m));

// one pass over the text, aware of JSON strings: drop JS comments and trailing commas, escape raw control characters,
// fix invalid escapes, and split top-level values that follow one another ({...}{...})
function scan(text, rep) {
  const segs = []; let out = '', inStr = false, depth = 0, i = 0, lastSig = '';
  const bump = k => { rep[k] = (rep[k] || 0) + 1; };
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') {
        const d = text[i + 1];
        if (d !== undefined && '"\\/bfnrtu'.includes(d)) { if (d === 'u' && !/^[\da-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) { out += '\\\\'; bump('invalid_escape'); i++; continue; } out += c + d; i += 2; continue; }
        bump('invalid_escape'); if (d === "'") { out += "'"; i += 2; } else { out += '\\\\'; i++; } continue;
      }
      if (c === '"') { inStr = false; lastSig = '"'; out += c; i++; continue; }
      const code = c.charCodeAt(0);
      if (code < 0x20) { bump('control_char_in_string'); out += c === '\n' ? '\\n' : c === '\r' ? '\\r' : c === '\t' ? '\\t' : '\\u' + code.toString(16).padStart(4, '0'); i++; continue; }
      out += c; i++; continue;
    }
    if (c === '"') {                                       // a value followed by the next key or value with no comma between
      if (depth > 0 && (lastSig === '"' || lastSig === '}' || lastSig === ']' || /[\de]/.test(lastSig) || (lastSig === 'l' && /null$/.test(out.trimEnd())))) { out += ','; bump('missing_comma'); }
      inStr = true; out += c; i++; continue;
    }
    if (c === '/' && text[i + 1] === '/') { bump('js_comment'); while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { bump('js_comment'); const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === ',') {                                       // trailing comma: only whitespace or comments before } or ]
      let j = i + 1; for (;;) { while (j < n && /\s/.test(text[j])) j++; if (text[j] === '/' && text[j + 1] === '/') { while (j < n && text[j] !== '\n') j++; continue; } if (text[j] === '/' && text[j + 1] === '*') { const e = text.indexOf('*/', j + 2); j = e < 0 ? n : e + 2; continue; } break; }
      if (text[j] === '}' || text[j] === ']') { bump('trailing_comma'); i++; continue; }
      if (depth === 0) { bump('concatenated_values'); i++; continue; }   // "{...},{...}" at the top level
    }
    if (c === '{' || c === '[') { if (depth === 0 && out.trim()) { segs.push(out); out = ''; bump('concatenated_values'); } depth++; }
    if (c === '}' || c === ']') depth = Math.max(0, depth - 1);
    if (c === ';' && depth === 0) { bump('stray_semicolon'); i++; continue; }
    if (!/\s/.test(c)) lastSig = c;
    out += c; i++;
  }
  if (inStr) { out += '"'; bump('unterminated'); }
  if (depth > 0) { out += '}'.repeat(depth); bump('unclosed_brackets'); }      // closes with } only; ] mismatches stay errors
  if (out.trim()) segs.push(out);
  return segs;
}

const SCHEMA_CTX = /^https?:\/\/(www\.)?schema\.org(\/(docs\/jsonldcontext\.json(ld)?)?)?\/?$/i;
const HTTP_SCHEMA = /^http:\/\/schema\.org\//i;
function fixContext(c, rep) {
  const bump = k => { rep[k] = (rep[k] || 0) + 1; };
  if (typeof c === 'string') {
    if (SCHEMA_CTX.test(c.trim())) { bump('remote_context_schema_org_inlined'); return { '@vocab': S }; }
    bump('remote_context_other_dropped'); return null;
  }
  if (Array.isArray(c)) { const a = c.map(x => fixContext(x, rep)).filter(x => x != null); return a.length === 1 ? a[0] : a.length ? a : { '@vocab': S }; }
  if (c && typeof c === 'object') {
    const o = { ...c };
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' && /^https?:\/\/(www\.)?schema\.org\/?$/i.test(v.trim()) && v !== S) { o[k] = S; bump('context_schema_org_iri_normalised'); }
      else if (k === '@vocab' && typeof v === 'string' && HTTP_SCHEMA.test(v)) { o[k] = v.replace(HTTP_SCHEMA, S); bump('context_schema_org_iri_normalised'); }
    }
    if (o['@vocab'] == null && !Object.keys(o).length) o['@vocab'] = S;
    return o;
  }
  return { '@vocab': S };
}
// walk a parsed document: contexts, http://schema.org/ IRIs, entities left in strings
function walk(x, rep, top = false) {
  const bump = k => { rep[k] = (rep[k] || 0) + 1; };
  if (typeof x === 'string') {
    let s = x;
    if (HTTP_SCHEMA.test(s)) { s = s.replace(HTTP_SCHEMA, S); bump('http_schema_org_iri'); }
    if (ENT_RE.test(s)) { ENT_RE.lastIndex = 0; const d = decodeEntities(s); if (d !== s) { s = d; bump('html_entity_in_string'); } }
    ENT_RE.lastIndex = 0;
    return s;
  }
  if (Array.isArray(x)) return x.map(v => walk(v, rep));
  if (x && typeof x === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(x)) {
      if (k === '@context') { const c = fixContext(v, rep); if (c != null) o[k] = c; continue; }
      o[HTTP_SCHEMA.test(k) ? k.replace(HTTP_SCHEMA, S) : k] = walk(v, rep);
    }
    return o;
  }
  return x;
}

export function cleanJsonLd(raw) {
  const rep = {}, bump = k => { rep[k] = (rep[k] || 0) + 1; };
  let t = String(raw ?? '');
  if (/^\s*<!--/.test(t) || /-->\s*$/.test(t)) { t = t.replace(/^\s*<!--/, '').replace(/-->\s*$/, ''); bump('html_comment_wrapper'); }
  if (/<!\[CDATA\[/.test(t)) { t = t.replace(/^\s*(\/\/|\/\*)?\s*<!\[CDATA\[\s*(\*\/)?/, '').replace(/(\/\/|\/\*)?\s*\]\]>\s*(\*\/)?\s*$/, ''); bump('cdata_wrapper'); }
  if (t.charCodeAt(0) === 0xfeff) { t = t.slice(1); bump('byte_order_mark'); }
  if (!t.trim()) { bump('empty_block'); return { docs: [], repairs: rep }; }
  let values = null;
  try { values = [JSON.parse(t)]; } catch {}
  if (!values) {
    const tryScan = (s) => { const r2 = {}; const segs = scan(s, r2); try { const v = segs.map(x => JSON.parse(x)); for (const [k, c] of Object.entries(r2)) rep[k] = (rep[k] || 0) + c; return v; } catch { return null; } };
    values = tryScan(t);
    if (!values && /&(quot|#34|#x22|amp|lt|gt);/.test(t)) { const d = decodeEntities(t); values = tryScan(d); if (values) bump('html_entities_in_markup'); }
    if (!values) { let err; try { JSON.parse(scan(t, {}).join('')); } catch (e) { err = e.message; } return { docs: [], repairs: rep, error: err || 'not JSON' }; }
  }
  const docs = [];
  const push = (d, ctx) => {
    if (!d || typeof d !== 'object') return;
    if (Array.isArray(d)) { bump('top_level_array_split'); for (const x of d) push(x, ctx); return; }
    let o = walk(d, rep, true);
    if (o['@context'] == null) { if (ctx) o = { '@context': ctx, ...o }; else { o = { '@context': { '@vocab': S }, ...o }; bump('missing_context_added'); } }
    // a top-level @graph beside other keys would make a NAMED graph (named by that node) inside our page graph:
    // unwrap so every node lands in the page's own graph
    if (Array.isArray(o['@graph']) || (o['@graph'] && typeof o['@graph'] === 'object')) {
      const { '@graph': g, '@context': c, ...rest } = o;
      bump('graph_unwrapped');
      if (Object.keys(rest).length) docs.push({ '@context': c, ...rest });
      for (const n of [].concat(g)) if (n && typeof n === 'object') docs.push(n['@context'] ? n : { '@context': c, ...n });
      return;
    }
    docs.push(o);
  };
  for (const v of values) push(v, null);
  return { docs, repairs: rep };
}
