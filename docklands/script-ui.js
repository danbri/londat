// The script setting in the page (owner, 2026-10-22: names in Latin script only, on by default; "Better no labels than
// that"): the box "Names in Latin script only" (Menu > Look, #latinNames; the no-3D page has its own), and two safety nets
// over what the page shows: a card (#card) has its words in other scripts left out, and a label element (#labels, the
// globe's #globeLabels, any host given) whose text is in another script is hidden (class scriptHidden), while the setting
// is on. The data readers pick Latin names first (geo/script.js pickName); these nets catch what a layer shows by itself.
// A change re-creates every label (event 'docklands-script-pref': globe/labels.js refresh, this module's rescan).
// Skill: docklands-3d-page, "Names: Latin script preferred".
import { latinPreferred, setLatinPreferred, isLatin, scrubDom } from './geo/script.js';

const $ = id => document.getElementById(id);
// box: the checkbox; note: the text under it; langNote(): a sentence when the page language gives way (?lang= in another script)
export function initScriptUi({ box = $('latinNames'), note = $('latinNote'), hosts = ['labels', 'globeLabels'], card = $('card'), langNote = () => '' } = {}) {
  const base = note ? note.innerHTML : '';
  const sync = () => { if (box) box.checked = latinPreferred(); if (note) { const s = langNote(); note.innerHTML = base + (s ? ' ' + s : ''); } };
  if (box) box.addEventListener('change', () => setLatinPreferred(box.checked));
  // labels: hide an element whose text is in another script (it keeps its place in its layer's own show / hide logic)
  const mark = el => { if (el && el.nodeType === 1 && el.classList) el.classList.toggle('scriptHidden', latinPreferred() && !isLatin(el.textContent)); };
  const topOf = (n, host) => { while (n && n.parentNode !== host) n = n.parentNode; return n; };
  const watched = new Set();
  const watch = host => { if (!host || watched.has(host)) return; watched.add(host); for (const el of host.children) mark(el);
    new MutationObserver(ms => { const seen = new Set(); for (const m of ms) { for (const n of m.addedNodes) seen.add(topOf(n, host)); if (m.type === 'characterData' || m.target !== host) seen.add(topOf(m.target, host)); } for (const el of seen) mark(el); })
      .observe(host, { childList: true, subtree: true, characterData: true }); };
  const rescan = () => { for (const id of hosts) { const h = typeof id === 'string' ? $(id) : id; if (h) { watch(h); for (const el of h.children) mark(el); } } };
  rescan(); setTimeout(rescan, 3000);   // (the globe's label host is made later)
  // cards: words in other scripts left out (a card made again after a change shows the data's names again)
  if (card) new MutationObserver(() => { if (!card.hidden) scrubDom(card); }).observe(card, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  addEventListener('docklands-script-pref', () => { sync(); rescan(); if (card && !card.hidden) scrubDom(card); });
  sync();
  return { sync, rescan };
}
