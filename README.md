# adsb-cache: recorded aircraft for the Docklands 3D page

This orphan branch of danbri/londat holds only the last 7 days and has one commit, replaced every day by `cwplans/tools/fetch-adsb-cache.mjs` (workflow `.github/workflows/adsb-cache.yml` on main).

**Data: © adsb.lol contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)** (derived from the adsb.lol daily history, https://github.com/adsblol; feeder data CC0). This extract is a derived database under the ODbL: keep this notice.

Area: 25 nm round 51.505 N, 0.02 W. Files: `index.json` (the days held), `adsb/<date>/day.json`, `adsb/<date>/<HH>.json.gz` (UTC hour). Each leg: `k` key, `c` callsign (operator flights only), `ty` ICAO type, `cat` category, `p` delta-coded points [t s from t0, lat 1e-5, lon 1e-5, alt in 25 ft above the WGS84 ellipsoid, q (0 GNSS, 1 pressure altitude + the hour's correction corr_ft, 2 ground), ground speed kt, track deg].

Used by https://danbri.github.io/londat/docklands/ (layer Aircraft). Not for navigation.
