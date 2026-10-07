// In-page extractor for schema.org structured data: JSON-LD (raw text), HTML microdata (WHATWG algorithm, as JSON)
// and RDFa 1.1 (Core + HTML+RDFa rules, as N-Triples with the document base). Used by tools/render-structured-data.mjs
// through Playwright's page.evaluate, so the function must stay self-contained (no imports, no closures).
//   const out = await page.evaluate(extractStructuredData);
// Why and what is left out: skills/docklands-data-curation/SKILL.md, "Structured data from rendered pages".
export function extractStructuredData() {
  const doc = document, base = doc.baseURI;
  const abs = (v) => { try { return new URL(v, doc.baseURI).href; } catch { return v; } };

  // ---------------------------------------------------------------- (a) JSON-LD, raw as found
  const jsonld = [...doc.querySelectorAll('script')].filter(s => /^\s*application\/ld\+json\s*(;.*)?$/i.test(s.type || '')).map(s => s.textContent);

  // ---------------------------------------------------------------- (b) microdata, WHATWG HTML "microdata" algorithm
  const propValue = (el, memory) => {
    if (el.hasAttribute('itemscope')) return memory.has(el) ? { error: 'cycle' } : item(el, new Set([...memory, el]));
    const t = el.localName;
    if (el.hasAttribute('content') && (t === 'meta' || el.hasAttribute('itemprop'))) return el.getAttribute('content');
    if (/^(audio|embed|iframe|img|source|track|video)$/.test(t)) return el.getAttribute('src') ? abs(el.getAttribute('src')) : '';
    if (/^(a|area|link)$/.test(t)) return el.getAttribute('href') ? abs(el.getAttribute('href')) : '';
    if (t === 'object') return el.getAttribute('data') ? abs(el.getAttribute('data')) : '';
    if (t === 'data' || t === 'meter') return el.getAttribute('value') ?? '';
    if (t === 'time') return el.getAttribute('datetime') ?? el.textContent.trim();
    return el.textContent.replace(/\s+/g, ' ').trim();
  };
  const propertiesOf = (root) => {           // "crawl the properties": children of the root plus itemref targets, not into nested items
    const results = [], pending = [...root.children], seen = new Set([root]);
    for (const id of (root.getAttribute('itemref') || '').split(/\s+/).filter(Boolean)) { const e = doc.getElementById(id); if (e) pending.push(e); }
    while (pending.length) {
      const c = pending.shift(); if (seen.has(c)) continue; seen.add(c);
      if (!c.hasAttribute('itemscope')) pending.push(...c.children);
      if (c.hasAttribute('itemprop') && c.getAttribute('itemprop').trim()) results.push(c);
    }
    return results.sort((a, b) => a === b ? 0 : (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  };
  function item(el, memory = new Set([el])) {
    const o = {};
    const types = (el.getAttribute('itemtype') || '').split(/\s+/).filter(Boolean);
    if (types.length) o.type = types;
    if (types.length && el.hasAttribute('itemid')) o.id = abs(el.getAttribute('itemid'));
    o.properties = {};
    for (const p of propertiesOf(el)) {
      const v = propValue(p, memory);
      for (const name of p.getAttribute('itemprop').split(/\s+/).filter(Boolean)) (o.properties[name] ||= []).push(v);
    }
    return o;
  }
  const microdata = [...doc.querySelectorAll('[itemscope]')].filter(e => !e.hasAttribute('itemprop')).map(e => item(e));

  // ---------------------------------------------------------------- (c) RDFa 1.1 (Core processing rules 7.5, HTML+RDFa)
  const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', XSD = 'http://www.w3.org/2001/XMLSchema#';
  const INITIAL = { as: 'https://www.w3.org/ns/activitystreams#', cc: 'http://creativecommons.org/ns#', ctag: 'http://commontag.org/ns#', dc: 'http://purl.org/dc/terms/', dc11: 'http://purl.org/dc/elements/1.1/', dcat: 'http://www.w3.org/ns/dcat#', dcterms: 'http://purl.org/dc/terms/', foaf: 'http://xmlns.com/foaf/0.1/', gr: 'http://purl.org/goodrelations/v1#', ical: 'http://www.w3.org/2002/12/cal/icaltzd#', og: 'http://ogp.me/ns#', org: 'http://www.w3.org/ns/org#', owl: 'http://www.w3.org/2002/07/owl#', prov: 'http://www.w3.org/ns/prov#', rdf: RDF, rdfa: 'http://www.w3.org/ns/rdfa#', rdfs: 'http://www.w3.org/2000/01/rdf-schema#', rev: 'http://purl.org/stuff/rev#', schema: 'http://schema.org/', sioc: 'http://rdfs.org/sioc/ns#', skos: 'http://www.w3.org/2004/02/skos/core#', time: 'http://www.w3.org/2006/time#', v: 'http://rdf.data-vocabulary.org/#', vcard: 'http://www.w3.org/2006/vcard/ns#', void: 'http://rdfs.org/ns/void#', xhv: 'http://www.w3.org/1999/xhtml/vocab#', xsd: XSD };
  const INITIAL_TERMS = { describedby: 'http://www.w3.org/2007/05/powder-s#describedby', license: 'http://www.w3.org/1999/xhtml/vocab#license', role: 'http://www.w3.org/1999/xhtml/vocab#role' };
  const triples = []; let bn = 0;
  const bnode = () => '_:b' + (bn++);
  const isAbsIri = s => /^[a-z][a-z0-9+.-]*:/i.test(s);
  const curie = (v, ctx, { termOk = true, bnodeOk = false } = {}) => {
    v = v.trim(); if (!v) return null;
    if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
    const i = v.indexOf(':');
    if (i >= 0) {
      const p = v.slice(0, i).toLowerCase(), ref = v.slice(i + 1);
      if (p === '_') return bnodeOk ? '_:r' + ref.replace(/[^A-Za-z0-9]/g, '') : null;
      if (ctx.prefixes[p] != null && !ref.startsWith('//')) return ctx.prefixes[p] + ref;
      if (isAbsIri(v)) return v;
      return null;
    }
    if (!termOk) return null;
    if (ctx.vocab) return ctx.vocab + v;
    return INITIAL_TERMS[v.toLowerCase()] || null;
  };
  const terms = (attr, ctx, opts) => (attr || '').split(/\s+/).filter(Boolean).map(v => curie(v, ctx, opts)).filter(Boolean);
  const safeCurieOrIri = (v, ctx) => {                     // @about/@resource: SafeCURIEorCURIEorIRI
    v = v.trim();
    if (v.startsWith('[') && v.endsWith(']')) return curie(v, ctx, { termOk: false, bnodeOk: true });
    if (v.startsWith('_:')) return '_:r' + v.slice(2).replace(/[^A-Za-z0-9]/g, '');
    const c = v.includes(':') ? curie(v, ctx, { termOk: false }) : null;
    return c && !isAbsIri(v) ? c : (c && ctx.prefixes[v.slice(0, v.indexOf(':')).toLowerCase()] != null ? c : abs(v));
  };
  const emit = (s, p, o) => triples.push([s, p, o]);
  const textLiteral = (el) => el.textContent;
  function walkRdfa(el, ctx) {
    const a = n => el.hasAttribute(n) ? el.getAttribute(n) : null;
    let skip = false, newSubject = null, currentObject = null, typedResource = null;
    const local = { ...ctx, prefixes: ctx.prefixes };
    if (a('vocab') !== null) local.vocab = a('vocab').trim() ? abs(a('vocab').trim()) : null;
    const pfx = a('prefix');
    if (pfx) { local.prefixes = { ...ctx.prefixes }; const re = /([A-Za-z_][\w.-]*):\s+(\S+)/g; let m; while ((m = re.exec(pfx))) local.prefixes[m[1].toLowerCase()] = m[2]; }
    for (const at of el.attributes) if (at.name.startsWith('xmlns:')) { if (local.prefixes === ctx.prefixes) local.prefixes = { ...ctx.prefixes }; local.prefixes[at.name.slice(6).toLowerCase()] = at.value; }
    const lang = a('lang') ?? a('xml:lang'); if (lang !== null) local.lang = lang;
    const about = a('about'), resource = a('resource'), href = a('href'), src = a('src'), typeOf = a('typeof'), property = a('property');
    const isRoot = el === doc.documentElement, isHeadBody = el.localName === 'head' || el.localName === 'body';
    let rel = a('rel'), rev = a('rev');
    // HTML+RDFa 3.1.7: with @property present, plain-term @rel/@rev values (HTML link types such as "stylesheet") are ignored
    if (property !== null) { const keep = v => v && v.split(/\s+/).filter(x => x.includes(':')).join(' '); rel = rel !== null ? keep(rel) || null : null; rev = rev !== null ? keep(rev) || null : null; }
    const resOf = () => resource !== null ? safeCurieOrIri(resource, local) : href !== null ? abs(href) : src !== null ? abs(src) : null;
    if (rel === null && rev === null) {
      if (property !== null && a('content') === null && a('datatype') === null) {
        newSubject = about !== null ? safeCurieOrIri(about, local) : isRoot ? base : ctx.parentObject;
        if (typeOf !== null) { typedResource = about !== null ? newSubject : (resOf() || bnode()); currentObject = typedResource; }
      } else {
        newSubject = about !== null ? safeCurieOrIri(about, local) : resOf();
        if (newSubject === null) {
          if (isRoot) newSubject = base;
          else if (typeOf !== null) newSubject = isHeadBody ? ctx.parentObject : bnode();
          else if (ctx.parentObject) { newSubject = ctx.parentObject; if (property === null) skip = true; }
        }
        if (typeOf !== null) typedResource = newSubject;
      }
    } else {
      newSubject = about !== null ? safeCurieOrIri(about, local) : isRoot ? base : null;
      if (newSubject !== null && typeOf !== null) typedResource = newSubject;
      if (newSubject === null) newSubject = (isHeadBody && typeOf !== null) ? ctx.parentObject : ctx.parentObject;
      currentObject = resOf();
      if (currentObject === null && typeOf !== null && about === null) currentObject = bnode();
      if (typeOf !== null && about === null) typedResource = currentObject;
    }
    if (typedResource) for (const t of terms(typeOf, local)) emit(typedResource, RDF + 'type', t);
    const incomplete = [];
    if (newSubject !== null) {
      const rels = terms(rel, local), revs = terms(rev, local);
      if (currentObject !== null) { for (const r of rels) emit(newSubject, r, currentObject); for (const r of revs) emit(currentObject, r, newSubject); }
      else if (rels.length || revs.length) { currentObject = bnode(); for (const r of rels) incomplete.push({ p: r, dir: 'f' }); for (const r of revs) incomplete.push({ p: r, dir: 'r' }); }
      if (property !== null) {
        const props = terms(property, local);
        const dt = a('datatype'), content = a('content'), datetime = el.localName === 'time' ? (a('datetime') ?? el.textContent.trim()) : null;
        let obj = null;
        if (dt !== null && dt.trim()) {
          const d = curie(dt, local);
          obj = { lit: content ?? (d === RDF + 'XMLLiteral' || d === RDF + 'HTML' ? el.innerHTML : textLiteral(el)), dt: d };
        } else if (dt !== null) obj = { lit: content ?? textLiteral(el), lang: local.lang };
        else if (content !== null) obj = { lit: content, lang: local.lang };
        else if (datetime !== null && el.localName === 'time') {
          const v = datetime; const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? XSD + 'date' : /^\d{4}-\d{2}-\d{2}T/.test(v) ? XSD + 'dateTime' : /^\d{2}:\d{2}/.test(v) ? XSD + 'time' : /^P/.test(v) ? XSD + 'duration' : null;
          obj = d ? { lit: v, dt: d } : { lit: v, lang: local.lang };
        } else if (rel === null && rev === null && (resource !== null || href !== null || src !== null)) obj = resOf();
        else if (typeOf !== null && about === null) obj = typedResource;
        else obj = { lit: textLiteral(el), lang: local.lang };
        if (obj !== null) for (const p of props) emit(newSubject, p, obj);
      }
    }
    if (!skip && newSubject !== null) for (const t of ctx.incomplete) t.dir === 'f' ? emit(ctx.parentSubject, t.p, newSubject) : emit(newSubject, t.p, ctx.parentSubject);
    const childCtx = skip
      ? { ...local, parentSubject: ctx.parentSubject, parentObject: ctx.parentObject, incomplete: ctx.incomplete }
      : { ...local, parentSubject: newSubject ?? ctx.parentSubject, parentObject: currentObject ?? newSubject ?? ctx.parentSubject, incomplete };
    for (const c of el.children) if (c.localName !== 'script' && c.localName !== 'style') walkRdfa(c, childCtx);
  }
  let rdfaErr = null;
  try { walkRdfa(doc.documentElement, { prefixes: INITIAL, vocab: null, lang: null, parentSubject: base, parentObject: base, incomplete: [] }); } catch (e) { rdfaErr = String(e).slice(0, 200); }
  const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const iri = s => s.startsWith('_:') ? s : '<' + s.replace(/[\u0000-\u0020<>"{}|^`\\]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')) + '>';
  const term = o => typeof o === 'string' ? iri(o) : '"' + esc(o.lit) + '"' + (o.dt ? '^^' + iri(o.dt) : o.lang ? '@' + o.lang.replace(/[^A-Za-z0-9-]/g, '') : '');
  const lines = new Set();
  for (const [s, p, o] of triples) if (s && p && o != null && !p.startsWith('_:') && isAbsIri(p) && (s.startsWith('_:') || isAbsIri(s)) && (typeof o !== 'string' || o.startsWith('_:') || isAbsIri(o))) lines.add(`${iri(s)} ${iri(p)} ${term(o)} .`);
  return {
    final_url: location.href, base, title: doc.title, lang: doc.documentElement.getAttribute('lang') || null,
    jsonld, microdata, rdfa_ntriples: [...lines].join('\n'), rdfa_triples: lines.size, rdfa_error: rdfaErr,
  };
}
