// Pure functions of the londat dashboard (dashboard/index.html) for the OKR key results KR5.1 (hourly cache runs per UTC
// day) and KR5.2 (gaps over 15 minutes in the 5-minute live feed): no DOM, no fetch, so that Node tests them
// (cwplans/tools/test/dashboard-metrics.test.mjs, in npm test) and the page uses the same code. A classic script: the page
// gets window.DashMetrics; Node gets module.exports. Skill: cwplans-londat-cache, "The dashboard: KR5.1 and KR5.2".
(function (root) {
  'use strict';
  const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const GAP = 15 * MIN;   // KR5.2: a gap is more than 15 minutes without a sample

  // the time of an hourly cache run, from a run file path ("2026-10-21/live-2026-10-21T0139Z.json.gz") or a commit
  // message ("cache: live state 2026-10-21T01:39Z"); NaN when the text has no such time
  function runTime(s) {
    const m = /live-(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})Z/.exec(s) || /(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})Z/.exec(s);
    return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`) : NaN;
  }
  const utcDay = t => new Date(t).toISOString().slice(0, 10);

  // KR5.1: runs per UTC day for the last `days` days, today included (partial). times: run times (ms). Returns
  // { days: [{ day, n, partial, hours }], target, full, met, min, mean } where full counts the whole days only.
  function runsPerDay(times, { now = Date.now(), days = 14, target = 20 } = {}) {
    const today = Date.parse(utcDay(now) + 'T00:00:00Z'), out = [];
    for (let k = days - 1; k >= 0; k--) { const a = today - k * DAY; out.push({ day: utcDay(a), a, n: 0, partial: k === 0, hours: k === 0 ? (now - a) / HOUR : 24 }); }
    const at = new Map(out.map(d => [d.day, d]));
    for (const t of new Set(times)) { if (!isFinite(t)) continue; const d = at.get(utcDay(t)); if (d && t <= now) d.n++; }
    const full = out.filter(d => !d.partial), met = full.filter(d => d.n >= target).length;
    return { days: out.map(({ a, ...d }) => d), target, full: full.length, met,
      min: full.length ? Math.min(...full.map(d => d.n)) : null,
      mean: full.length ? Math.round(10 * full.reduce((s, d) => s + d.n, 0) / full.length) / 10 : null };
  }
  // run times from a git tree listing of cwplans/cache/runs (the GitHub API trees answer, recursive)
  const runTimesFromTree = tree => (tree || []).filter(e => e.type === 'blob' || e.type == null).map(e => runTime(e.path)).filter(isFinite);
  // run times from commits on main (the hourly cache commits only)
  const runTimesFromCommits = list => (list || []).filter(c => /^cache: live state/.test(c.msg || c.message || '')).map(c => runTime(c.msg || c.message)).filter(isFinite);

  // KR5.2: the gaps of more than `max` ms between sample times inside [from, to]; the time before the first sample in the
  // window and after the last (to `to`, which is now: the open gap) count too. Returns { gaps: [{ a, b, ms, open, start }],
  // gapMs, pct (0 to 100, one decimal), samples, median step }.
  function gaps(times, { from, to, max = GAP } = {}) {
    const ts = [...new Set(times.filter(isFinite))].sort((x, y) => x - y), inWin = ts.filter(t => t >= from && t <= to);
    const before = ts.filter(t => t < from).pop();   // a sample just before the window starts the first interval
    const pts = [before != null ? before : from, ...inWin, to], out = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (b - a > max) out.push({ a: Math.max(a, from), b, ms: b - Math.max(a, from), open: i === pts.length - 1, start: i === 1 && before == null });
    }
    const gapMs = out.reduce((s, g) => s + g.ms, 0), span = Math.max(1, to - from);
    const steps = inWin.slice(1).map((t, i) => t - inWin[i]).sort((x, y) => x - y);
    return { gaps: out, gapMs, pct: Math.round(1000 * gapMs / span) / 10, samples: inWin.length,
      median: steps.length ? steps[Math.floor(steps.length / 2)] : null };
  }

  // one live-cache file (aircraft.json, ships.json: snaps[].t in ms; metar.json: obs[].t in s): its age and gaps
  function feedFile(name, j, now = Date.now()) {
    const generated = Date.parse(j && j.generated);
    const keep = (j && j.keep_s ? j.keep_s * 1000 : 0) || (name === 'metar' ? DAY : HOUR);
    const age = isFinite(generated) ? now - generated : Infinity;
    if (name === 'metar') {   // reports every 30 min at London City; a gap of over 45 min is a report missing at the source
      const t = ((j && j.obs) || []).map(o => o.t * 1000);
      const g = gaps(t, { from: now - keep, to: now, max: 45 * MIN });
      return { name, generated, age, window: keep, samples: t.length, newest: t.length ? Math.max(...t) : null, sourceGaps: g.gaps.filter(x => !x.open && !x.start) };
    }
    const t = ((j && j.snaps) || []).map(s => s.t);
    return { name, generated, age, window: keep, newest: t.length ? Math.max(...t) : null, ...gaps(t, { from: now - keep, to: now }) };
  }

  // the time the live-cache job was running (GitHub Actions runs of live-cache.yml: started, ended or still running) and
  // the gaps of more than 15 min between runs, in [from, to]: an estimate over days (the files hold 1 to 2 hours only)
  function jobGaps(runs, { from, to, max = GAP } = {}) {
    const iv = (runs || []).map(r => [Date.parse(r.started || r.created), r.status === 'completed' ? Date.parse(r.updated) : to])
      .filter(([a, b]) => isFinite(a) && isFinite(b) && b > from && a < to).sort((x, y) => x[0] - y[0]);
    const out = []; let cur = from;
    for (const [a, b] of iv) { if (a - cur > max) out.push({ a: cur, b: a, ms: a - cur, start: cur === from }); cur = Math.max(cur, b); }
    if (to - cur > max) out.push({ a: cur, b: to, ms: to - cur, open: true });
    const gapMs = out.reduce((s, g) => s + g.ms, 0);
    return { gaps: out, gapMs, pct: Math.round(1000 * gapMs / Math.max(1, to - from)) / 10, runs: iv.length };
  }

  const api = { MIN, HOUR, DAY, GAP, runTime, utcDay, runsPerDay, runTimesFromTree, runTimesFromCommits, gaps, feedFile, jobGaps };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DashMetrics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
