// The page clock in the time zone of the place shown (OKR O1, architecture rule 5): wall clock <-> UTC for any IANA time
// zone, through Intl only (no tables of rules). Locale-free: the zone comes from the region (docklands/geo/region.js).
// Plain ES module, browser and node. Tests: docklands/geo/test/clock.test.mjs; the port: docklands/test/clock-check.mjs.

const FMT = new Map();
const fmt = tz => { let f = FMT.get(tz); if (!f) FMT.set(tz, f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })); return f; };

// the wall clock of zone tz at the instant t (ms UTC): { year, month, day, hour, minute, second } as numbers
export function wallParts(t, tz) {
  const p = fmt(tz).formatToParts(new Date(t)).reduce((o, x) => (o[x.type] = x.value, o), {});
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour % 24, minute: +p.minute, second: +p.second };
}
// the zone's offset from UTC at the instant t, in ms (wall clock minus UTC; whole seconds)
export function offsetMs(t, tz) {
  const p = wallParts(t, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
}

// wall clock "YYYY-MM-DD[THH:MM[:SS]]" in zone tz -> ms UTC (NaN if the text does not parse). A date alone means 12:00.
// In an hour that repeats (clocks go back) the first one is taken; a time in an hour that is skipped (clocks go forward)
// moves on by the size of the gap. For Europe/London this is exactly the old sky3.js fromLondon (test: clock.test.mjs).
export function fromWall(s, tz) {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d))?)?$/.exec(String(s).trim()); if (!m) return NaN;
  const u = Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0));
  const before = offsetMs(u - 864e5, tz), after = offsetMs(u + 864e5, tz);
  const ok = [u - before, u - after].filter(t => t + offsetMs(t, tz) === u).sort((p, q) => p - q);
  return ok.length ? ok[0] : u - before;
}

// the instant t on the wall clock of zone tz, as "YYYY-MM-DD", "HH:MM" and "YYYY-MM-DDTHH:MM" (the ?t= form)
const p2 = n => String(n).padStart(2, '0');
export const wallDate = (t, tz) => { const p = wallParts(t, tz); return `${p.year}-${p2(p.month)}-${p2(p.day)}`; };
export const wallHM = (t, tz) => { const p = wallParts(t, tz); return `${p2(p.hour)}:${p2(p.minute)}`; };
export const wallString = (t, tz) => `${wallDate(t, tz)}T${wallHM(t, tz)}`;
// day of the year (1 to 366) on the wall clock of zone tz (for seasons: the trees' uDay)
export const wallDayOfYear = (t, tz) => { const p = wallParts(t, tz); return Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(p.year, 0, 1)) / 864e5) + 1; };

// a clock bound to one zone: clockFor(region.timeZone).fromWall('2026-10-11T22:00')
export function clockFor(tz) {
  new Intl.DateTimeFormat('en', { timeZone: tz });   // throws RangeError on an unknown zone
  return Object.freeze({ timeZone: tz, fromWall: s => fromWall(s, tz), wallParts: t => wallParts(t, tz), offsetMs: t => offsetMs(t, tz),
    wallDate: t => wallDate(t, tz), wallHM: t => wallHM(t, tz), wallString: t => wallString(t, tz), wallDayOfYear: t => wallDayOfYear(t, tz) });
}
