# live-cache: near-live aircraft and ships for the Docklands 3D page

This orphan branch of danbri/londat has one commit, replaced every 5 minutes (when GitHub runs the schedule; it may delay
or skip runs under load) by `cwplans/tools/fetch-live-cache.mjs` (workflow `.github/workflows/live-cache.yml` on main).
Used by https://danbri.github.io/londat/docklands/ (layers Aircraft and Ships). Not for navigation.

## aircraft.json: the last 60 minutes

**Data: © adsb.lol contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)** (from the adsb.lol live API,
https://api.adsb.lol, `/v2/point/51.505/-0.02/25`; feeder data CC0). This extract is a derived database under the ODbL:
keep this notice. Area: 25 nm round 51.505 N, 0.02 W. `now` (ms, the newest answer), `t0` (s), `snaps` (one per
answer), `ac`: `k` key, `c` callsign (operator flights only), `ty` ICAO type, `cat` category, `P` reports
[t s from t0, lat 1e-5, lon 1e-5, alt in 25 ft above the WGS84 ellipsoid, q (0 GNSS, 1 pressure altitude + corr_ft of its
snapshot, 2 ground), ground speed kt, track deg, vertical rate fpm, turn rate 0.01 deg/s]. Callsigns only for operator
flights not on LADD/PIA; every other aircraft has an anonymous key and its type only.

## ships.json: the last 2 hours

**Data: Open Waters AIS (https://openwaters.io/ais/)**, per event from its source: CC0 1.0 (volunteer receptions), NLOD 2.0
(Norwegian Coastal Administration), CC BY 4.0 (Fintraffic / digitraffic.fi), AISHub (https://www.aishub.net) and
aisstream.io (scoping use, owner decision of 2026-10-04; review before scaling). Each vessel carries its own
`attribution`. Envelope 51.474-51.528 N, 0.095 W-0.085 E. `vessels`: static fields, `P` positions [t s from t0, lat 1e-5,
lon 1e-5, sog 0.1 kn, cog deg, heading deg, nav_status]. Small private craft are counted (`snaps[].private_not_listed`),
never listed. A vessel still listed by Open Waters (moored ones up to 7 days) keeps its newest position even when it is older
than 2 hours.

## metar.json: the last 24 hours

London City Airport (EGLC) METAR reports from the NOAA Aviation Weather Center data API
(https://aviationweather.gov/data/api/; NWS: "public domain, unless specifically noted otherwise"). The reports are made by
the UK Met Office and exchanged through the WMO. Wind direction in degrees true, speeds in knots, cloud bases in feet above
the aerodrome, visibility in metres (from the report text).
