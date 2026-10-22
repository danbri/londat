// Storey height by use: the height of a building from its number of storeys above ground and its use. A pure rule with no
// place constant in it, so that the same rule can serve the Docklands model (tools/model-heights.mjs, operation
// model-heights) and later the Greater London blocks (place-city-heights) and other cities. Fault F52 (skill
// docklands-data-curation).
//
//   height = base + typical x (storeys - 1 + plant storeys),   plant storeys = floor(storeys / plant_every)
//
// base is the ground storey plus the roof allowance (parapet, plant, a pitched roof's rise); typical is the floor-to-floor
// height of the upper storeys.
// PRIOR (used where too few measured buildings exist to fit): typical storeys and plant storeys from the CTBUH Height
// Calculator (Council on Tall Buildings and Urban Habitat, https://www.ctbuh.org/resource/height): office 3.9 m,
// residential 3.1 m, mixed use 3.5 m, one plant storey every 20, 30 and 25 storeys. Bases, retail, industrial,
// institutional and small kinds: assumed (the values below).
// FIT (fitStoreyRule): base and typical of each use fitted by least absolute deviations (grid search, base 2 to 9 m in
// 0.1 m steps, typical 2.4 to 5.5 m in 0.05 m steps) to the buildings of the same area that a survey measured (LiDAR) and
// that OSM gives storeys for; a use with fewer than min_samples such buildings keeps its prior. Deterministic.
// The old rule (build-docklands.mjs) was storeys x 3 m + 1 m for every use.
export const PRIOR = {
  residential:   { base: 4.5, typical: 3.1, plant_every: 30 },
  office:        { base: 7.0, typical: 3.9, plant_every: 20 },
  mixed:         { base: 6.0, typical: 3.5, plant_every: 25 },
  retail:        { base: 6.5, typical: 4.5, plant_every: 0 },
  industrial:    { base: 7.0, typical: 5.0, plant_every: 0 },
  institutional: { base: 6.0, typical: 3.9, plant_every: 0 },
  small:         { base: 3.5, typical: 3.0, plant_every: 0 },
};
export const FIT = { min_samples: 30, min_storeys_range: 2, base: [2, 9, 0.1], typical: [2.4, 5.5, 0.05] };
// OSM building (or building:part) values -> use class; anything else is "mixed" (building=yes and the rest)
const USE = {
  residential: 'apartments residential house terrace detached semidetached_house bungalow dormitory hotel flats houseboat static_caravan',
  office: 'office commercial government bank',
  retail: 'retail supermarket shop mall',
  industrial: 'industrial warehouse manufacture hangar service transportation train_station depot boathouse storage container containers fire_station',
  institutional: 'school college university hospital public civic church mosque synagogue temple chapel community_centre sports_centre sports_hall theatre museum library kindergarten',
  small: 'garage garages shed carport hut cabin kiosk toilets greenhouse pavilion sty farm_auxiliary gatehouse',
};
const USE_OF = new Map(Object.entries(USE).flatMap(([u, s]) => s.split(' ').map(v => [v, u])));
// values the rule leaves alone: not the storeys of a finished building (a site, a canopy, a bridge, a ship, a shaft, a lift)
export const SKIP = new Set('construction roof bridge ruins ship tunnel_shaft elevator proposed demolished'.split(' '));
const vals = v => String(v || '').replace(/^part:/, '').split(';').map(s => s.trim()).filter(Boolean);
export const useOf = v => USE_OF.get(vals(v).find(s => s !== 'yes') || 'yes') || 'mixed';
export const skipped = v => vals(v).some(s => SKIP.has(s));
export const storeysOf = v => { const m = String(v ?? '').match(/\d+(\.\d+)?/); const n = m ? Math.round(parseFloat(m[0])) : NaN; return n >= 1 && n <= 200 ? n : null; };
const plant = (n, u) => u.plant_every ? Math.floor(n / u.plant_every) : 0;
export function heightFromStoreys(n, use, uses = PRIOR) {
  const u = uses[use] || uses.mixed, k = Math.max(1, Math.round(n));
  return Math.round((u.base + u.typical * (k - 1 + plant(k, u))) * 10) / 10;
}
// samples: [{ use, n (storeys), h (measured height) }] -> { uses, fitted: { use: { n, base, typical, mean_abs_m, prior_mean_abs_m } } }
export function fitStoreyRule(samples, prior = PRIOR, fit = FIT) {
  const uses = JSON.parse(JSON.stringify(prior)), fitted = {};
  const steps = ([a, b, d]) => { const o = []; for (let k = 0; a + k * d <= b + 1e-9; k++) o.push(Math.round((a + k * d) * 100) / 100); return o; };
  const B = steps(fit.base), T = steps(fit.typical);
  for (const use of Object.keys(prior)) {
    const S = samples.filter(s => s.use === use), u = prior[use]; if (!S.length) continue;
    const ns = S.map(s => s.n), x = S.map(s => s.n - 1 + plant(s.n, u)), h = S.map(s => s.h);
    const err = (b, t) => { let e = 0; for (let i = 0; i < x.length; i++) e += Math.abs(h[i] - b - t * x[i]); return e; };
    const priorErr = err(u.base, u.typical) / S.length;
    if (S.length < fit.min_samples || Math.max(...ns) - Math.min(...ns) < fit.min_storeys_range) { fitted[use] = { n: S.length, kept: 'prior (too few measured buildings or storeys)', prior_mean_abs_m: +priorErr.toFixed(2) }; continue; }
    let best = null;
    for (const b of B) for (const t of T) { const e = err(b, t); if (!best || e < best[0] - 1e-9) best = [e, b, t]; }
    uses[use] = { ...u, base: best[1], typical: best[2] };
    fitted[use] = { n: S.length, base: best[1], typical: best[2], mean_abs_m: +(best[0] / S.length).toFixed(2), prior_mean_abs_m: +priorErr.toFixed(2) };
  }
  return { uses, fitted };
}
