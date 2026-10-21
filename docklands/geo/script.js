// Script preference for names (owner, 2026-10-22): "for now we should system-wide have a checkbox expressing latin labels
// preferred over other scripts. Given the politics and recent wars I don't want accidental use of Cyrillic labels in
// non-RS Sarajevo and I have no confidence in data quality so far. Better no labels than that."
// Default: Latin preferred. A name in another script is replaced by a Latin alternative when the data has one, else the
// label is not shown (no automatic transliteration). Off with ?scripts=all, the menu box "Names in Latin script only"
// (Menu > Look), docklands.setScriptPreference('all') or setLatinPreferred(false); kept in this browser. Plain ES module
// (no DOM needed): the browser pages and node (tools, tests, the MCP server) import it; in node it is on.
// Skill: docklands-3d-page, "Names: Latin script preferred".
const KEY = 'docklands-latin-preferred';
let pref = null;
const urlParam = () => { try { return new URLSearchParams(globalThis.location.search).get('scripts'); } catch { return null; } };
export function latinPreferred() {
  if (pref != null) return pref;
  const q = urlParam();
  if (q === 'all') return (pref = false); if (q === 'latin') return (pref = true);
  try { const v = globalThis.localStorage.getItem(KEY); if (v === '0') return (pref = false); } catch { /* no storage */ }
  return (pref = true);
}
// on: true (Latin only) or false (every script). Kept in this browser; a ?scripts= in the address follows the change, so a
// reload or a share link keeps it. Fires 'docklands-script-pref' { latin } so pages re-create their labels.
export function setLatinPreferred(on) {
  const was = pref; pref = !!on; try { globalThis.localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* no storage */ }
  try { const q = urlParam(); if (q && q !== (pref ? 'latin' : 'all')) { const u = new URL(globalThis.location.href); u.searchParams.set('scripts', pref ? 'latin' : 'all'); globalThis.history.replaceState(globalThis.history.state, '', u); } } catch { /* no address bar */ }
  if (was !== pref && typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') globalThis.dispatchEvent(new CustomEvent('docklands-script-pref', { detail: { latin: pref } }));
  return pref;
}
// the machine interface: 'latin' or 'all'
export const getScriptPreference = () => latinPreferred() ? 'latin' : 'all';
export function setScriptPreference(v) {
  const s = String(v).toLowerCase(), on = v === true || s === 'latin' || s === 'on' || s === 'true' || s === '1';
  if (!on && !(v === false || s === 'all' || s === 'off' || s === 'false' || s === '0')) throw new Error(`Unknown script preference "${v}": use "latin" (names in Latin script only) or "all" (names in every script)`);
  setLatinPreferred(on); return getScriptPreference();
}
// tests only: forget the setting read (the next call reads the address and the storage again)
export const resetScriptPreference = () => { pref = null; };

// true when every letter is in the Latin script (digits, punctuation, spaces and combining marks are allowed)
const NL = '(?:(?=\\p{L})\\P{Script=Latin})', NONLATIN = new RegExp(NL, 'u');
export const isLatin = s => !s || !NONLATIN.test(String(s));
// the name to show: the first Latin candidate, or null (show nothing) when Latin is preferred; else the first candidate
export function pickName(...cands) {
  const c = cands.filter(x => x != null && String(x).trim());
  if (!latinPreferred()) return c[0] ?? null;
  return c.find(isLatin) ?? null;
}
// a sentence with its words in other scripts left out (not transliterated), and the punctuation tidied:
// "Sarajevo (Сарајево), Београд - Бар railway." -> "Sarajevo, railway."
const WORD = `[^\\s()\\[\\],;:.!?"«»]*${NL}[^\\s()\\[\\],;:.!?"«»]*`, RUN = new RegExp(`${WORD}(?:[\\s\\-–—/]+${WORD})*`, 'gu');
export function stripNonLatin(s) {
  if (s == null || isLatin(s)) return s;
  return String(s).replace(RUN, '').replace(/\s*\(\s*\)|\s*\[\s*\]|\s*"\s*"|\s*«\s*»/g, '').replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:])(\s*[,;])+/g, '$1').replace(/[,;:]+\s*(?=[.!?]|$)/g, '').replace(/^\s*[,;:\-–—/]+\s*/, '').replace(/\s*[\-–—/]+\s*(?=[,.;:!?]|$)/g, '').replace(/\s{2,}/g, ' ').trim();
}
export const scrubText = s => latinPreferred() ? stripNonLatin(s) : s;
// API answers (findPlaces, featuresAt, describeView, getView, search results, WebMCP): while Latin is preferred, a copy
// with every name in another script left out: a name field (name, local_name, title ...) in another script is removed, an
// item of a list whose name is in another script is dropped, a string in a list in another script is dropped, other text
// has its words in other scripts left out (stripNonLatin). Functions and class instances are kept as they are.
const NAME_KEYS = new Set(['name', 'local_name', 'name_alt', 'alt', 'title', 'alt_name', 'builtUp', 'nearest_name']);
const plain = o => { const p = Object.getPrototypeOf(o); return p === Object.prototype || p === null; };
export function latinOut(x) {
  if (!latinPreferred()) return x;
  const walk = (v, depth) => {
    if (typeof v === 'string') return stripNonLatin(v);
    if (!v || typeof v !== 'object' || depth > 12) return v;
    if (Array.isArray(v)) { const out = []; for (const e of v) { if (typeof e === 'string' && !isLatin(e)) continue; if (e && typeof e === 'object' && !Array.isArray(e) && typeof e.name === 'string' && e.name && !isLatin(e.name)) continue; out.push(walk(e, depth + 1)); } return out; }
    if (!plain(v)) return v;
    const out = {};
    for (const [k, e] of Object.entries(v)) { if (NAME_KEYS.has(k) && typeof e === 'string' && !isLatin(e)) continue; out[k] = walk(e, depth + 1); }
    return out;
  };
  return walk(x, 0);
}
// a DOM subtree (a card, a list): text nodes and title / aria-label attributes in another script left out
export function scrubDom(root) {
  if (!latinPreferred() || !root || typeof document === 'undefined') return 0;
  let n = 0; const w = document.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  for (let t = w.nextNode(); t; t = w.nextNode()) if (!isLatin(t.nodeValue)) { t.nodeValue = stripNonLatin(t.nodeValue); n++; }
  for (const el of root.querySelectorAll ? root.querySelectorAll('[title],[aria-label]') : []) for (const a of ['title', 'aria-label']) { const v = el.getAttribute(a); if (v && !isLatin(v)) { el.setAttribute(a, stripNonLatin(v)); n++; } }
  return n;
}
