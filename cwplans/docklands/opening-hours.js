// Is it open now? A small reader for the OSM opening_hours forms the registry holds (from OSM tags and from the
// schema.org data on the entities' own pages): day lists and ranges, times and time lists, "off", "24/7", times that
// run past midnight, rules joined by "," or ";", a later rule for the same day replacing an earlier one, and dated rules
// ("2026 Nov 26 16:00-02:00"). "PH" (public holidays) is read but not applied: UK holidays are not looked up here.
// openState(text, date) -> { open: true | false, until?, from? } or null when the text has a form this reader does not know.
(function (root) {
  const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const tmin = s => { const m = /^(\d{1,2}):(\d\d)$/.exec(s); return m ? +m[1] * 60 + +m[2] : NaN; };
  function parse(text) {
    const t = String(text).trim().replace(/\s*-\s*/g, '-').replace(/;\s*/g, '; ');
    if (t === '24/7') return { week: DAYS.map(() => [[0, 1440]]), dated: {} };
    const week = DAYS.map(() => null), dated = {};
    // split into rules: ";" always; "," only after a time or "off" and before a day or a date (an additional rule),
    // never between two days ("Th,Fr") or two time spans
    const rules = t.split('; ').flatMap(r => r.split(/(?<=\d|off),\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|\d{4} )\b)/).map((x, i) => ({ x: x.trim(), add: i > 0 })));
    for (const { x, add } of rules) {
      if (!x) continue;
      let m = /^(\d{4}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d\d) (.+)$/.exec(x);
      if (m) { const spans = spansOf(m[4]); if (!spans) return null; dated[`${m[1]}-${String(MON.indexOf(m[2]) + 1).padStart(2, '0')}-${m[3]}`] = spans; continue; }
      m = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?,?)+)\s+(.+)$/.exec(x);
      let days, rest;
      if (m) { days = []; for (const part of m[1].split(',').filter(Boolean)) { if (part === 'PH') continue; const [a, b] = part.split('-'); const i = DAYS.indexOf(a), j = b ? DAYS.indexOf(b) : i; if (i < 0 || j < 0) return null; for (let k = i; ; k = (k + 1) % 7) { days.push(k); if (k === j) break; } } rest = m[2]; }
      else { days = [0, 1, 2, 3, 4, 5, 6]; rest = x; }
      const spans = spansOf(rest); if (!spans) return null;
      for (const d of days) week[d] = add && week[d] ? week[d].concat(spans) : spans;
    }
    return { week, dated };
  }
  function spansOf(s) {
    if (s === 'off' || s === 'closed') return [];
    const out = [];
    for (const p of s.split(',')) { const [a, b] = p.trim().split('-'); const o = tmin(a), c = tmin(b); if (isNaN(o) || isNaN(c)) return null; out.push([o, c <= o ? c + 1440 : c]); }
    return out;
  }
  // local time in London, whatever the viewer's own time zone
  function london(date) {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const g = k => f.find(p => p.type === k).value;
    return { day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(g('weekday')), iso: `${g('year')}-${g('month')}-${g('day')}`, min: +g('hour') * 60 + +g('minute') };
  }
  const hm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  function openState(text, date = new Date()) {
    let P; try { P = parse(text); } catch (e) { return null; } if (!P) return null;
    const now = london(date), prev = new Date(date.getTime() - 864e5), pl = london(prev);
    const today = P.dated[now.iso] || P.week[now.day], yday = P.dated[pl.iso] || P.week[pl.day];
    for (const [o, c] of today || []) if (now.min >= o && now.min < c) return { open: true, until: o === 0 && c === 1440 ? null : hm(c) };
    for (const [o, c] of yday || []) if (c > 1440 && now.min < c - 1440) return { open: true, until: hm(c) };   // still open from last night
    const next = (today || []).filter(([o]) => o > now.min).sort((p, q) => p[0] - q[0])[0];
    return { open: false, from: next ? hm(next[0]) : null };
  }
  root.OpeningHours = { openState, parse };
  if (typeof module !== 'undefined') module.exports = root.OpeningHours;
})(typeof window !== 'undefined' ? window : globalThis);
