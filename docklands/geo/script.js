// Script preference for names (owner, 2026-10-22): "for now we should system-wide have a checkbox expressing latin labels
// preferred over other scripts. Given the politics and recent wars I don't want accidental use of Cyrillic labels in
// non-RS Sarajevo and I have no confidence in data quality so far. Better no labels than that."
// Default: Latin preferred. A name in another script is replaced by a Latin alternative when the data has one, else the
// label is not shown (no automatic transliteration). Off with ?scripts=all or setLatinPreferred(false) (kept in this
// browser). Skill: docklands-3d-page, "Names: Latin script preferred".
const KEY = 'docklands-latin-preferred';
let pref = null;
export function latinPreferred() {
  if (pref != null) return pref;
  let q = null; try { q = new URLSearchParams(location.search).get('scripts'); } catch { /* no location */ }
  if (q === 'all') return (pref = false); if (q === 'latin') return (pref = true);
  try { const v = localStorage.getItem(KEY); if (v === '0') return (pref = false); } catch { /* no storage */ }
  return (pref = true);
}
export function setLatinPreferred(on) {
  pref = !!on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* no storage */ }
  dispatchEvent(new CustomEvent('docklands-script-pref', { detail: { latin: pref } }));
}
// true when every letter is in the Latin script (digits, punctuation, spaces and marks are allowed)
const NONLATIN = /(?=\p{L})\P{Script=Latin}/u;
export const isLatin = s => !s || !NONLATIN.test(String(s));
// the name to show: the first Latin candidate, or null (show nothing) when Latin is preferred
export function pickName(...cands) {
  const c = cands.filter(x => x != null && String(x).trim());
  if (!latinPreferred()) return c[0] ?? null;
  return c.find(isLatin) ?? null;
}
