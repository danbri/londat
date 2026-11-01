# Checked low city routes

The city-router increment uses existing detailed-model roads and building footprints. It does not fetch another copy of the model. The first curved-flight release is separate; city playback must use the explicit polyline sampler, not the cubic `eye_via` curve.

## Contract and scope

[The city router](https://github.com/danbri/londat/blob/main/docklands/city-route.js) is a pure module. `createCityRouter({roads,buildings}, options)` accepts roads as arrays of `[x,y,z]` model-metre points and static building prisms as `{rings,minY,maxY}`. Footprint rings contain `[x,z]`; the first is the exterior and following rings are holes. It builds a grade-aware graph and a building spatial grid once. A* checks road edges lazily. End connectors and every simplified final segment are checked too.

[The model adapter](https://github.com/danbri/londat/blob/main/docklands/city-route-model.js) adapts the existing `DOCKLANDS_AREA` object:

- Road `q` arrays accumulate decimetres in **x,z,y** order. Only `k:'road'` records without `tunnel` are used.
- Eye height is added to the recorded road height: default 8 m, allowed 3–40 m.
- Building footprints decode `p` in x,z order; extrusion is `b + mh` to `b + h`, as in the drone model.
- A bounded cache retains one option variant per model object. Replace the model object to rebuild after data changes.

`nearestRoadPoint(x,z,max_distance_m)` explicitly resolves a requested destination to a clear road-eye point. The preview must show that resolved point and snap distance. It must not silently replace the endpoint of a named-view camera. `plan(startEye,resolvedDestination.point)` preserves the physical start eye, checks a connector to the road and returns a route or an explicit failure. The default connector limit is 80 m in 3D; the entire connector must clear the known prisms. A high camera over a building can therefore fail even when the nearest road is close in plan view.

Success returns `policy:'city-exterior'`, `trajectory:'polyline'`, frozen `points` and `cumulative_m`, length, clearance scope and telemetry. Failure includes an error such as `endpoint-in-building-clearance`, `no-clear-start-road-connector`, `no-connected-clear-road-route`, `route-search-limit` or `route-waypoint-budget`. There is no direct-flight fallback.

## What clearance means

A route segment is tested continuously against the vertical interval of each relevant inflated building prism and the horizontal footprint boundaries. Holes and elevated building parts are retained. Boundary contact at the requested radius counts as blocked. The vertical/horizontal expansion is conservative around roof corners: it can reject a passage that a more exact rounded collision volume might accept. It does not turn an untested passage into a clear one.

Checks cover **known static building prisms and model bounds**. They do not establish clearance from terrain, bridge decks, trees, cranes, moving vehicles, aircraft, wires or unmapped structures. The centerline sits above the recorded road surface, but that is not a continuous terrain-mesh collision test. Interior/underground routes are a different policy; tunnels are excluded here.

Work is bounded: default maximum 100,000 road vertices, 100,000 expanded search nodes, 256 output route points and 100,000 spatial-grid cells per clearance query. Supported local model coordinates, including height, have absolute magnitude at most 10 million metres to prevent overflow in geometry arithmetic. Grid and junction indices must be safe integers; huge finite coordinates fail rather than stall increment loops. Oversized or unsupported geometry is never treated as clear.

## Exact path playback

`sampleCityRoute(route,progress)` uses each checked segment exactly, with per-segment quintic easing. Velocity and acceleration go to zero at corners. This avoids cubic overshoot through a building; it is deliberately stop-and-ease rather than a claim of constant-speed cornering. Small nearly collinear runs can be simplified only within the deviation limit (default 0.5 m) and after checking the replacement segment continuously. Playback must have zero added lift and bend.

The camera’s gaze can move independently and look up at a tower while the eye follows this path. Changing gaze does not change the checked eye geometry. Existing camera-state lens and vertical-scale conventions must be converted through physical eye/target helpers, not interpreted as literal eye coordinates.

## Reproducible model example

From the detailed-model page console, without moving the camera:

```js
const {createModelCityRouter} = await import('./city-route-model.js');
const {sampleCityRoute} = await import('./city-route.js');
const router = createModelCityRouter(globalThis.DOCKLANDS_AREA,
  {height_m:8, clearance_m:2});
const destination = router.nearestRoadPoint(-301.5,435.4);
const route = destination.ok
  ? router.plan([-188.1,17.7,-70.5],destination.point)
  : destination;
console.log(destination,route);
if (route.ok) console.log(sampleCityRoute(route,0.5));
```

On the 1 November 2026 model snapshot, this gives a roughly 979 m road route with 43 retained points. A local Node check built 48,024 graph nodes, 49,560 segments and 41,803 building prisms in about 387 ms including decode. Three test routes planned in about 60–83 ms; those are local observations, not browser or device guarantees. The longer examples retained 115 and 102 points, so the earlier 16-waypoint cubic limit is not suitable for city paths.

Tests cover a thin wall crossed between samples, radius grazing, vertical slab crossing, courtyard holes, elevated parts, a road detour, grade-separated disconnected roads, unsafe endpoints, missing connectors, budgets, coordinate decoding, tunnel exclusion, vertical approaches and huge finite coordinates. Real-model paths were also checked by the same continuous final-segment validator; sampled eyes remained on the checked route.


## Future sun/moon shot selection (not implemented)

Read-only investigation on 1 November 2026 found these constraints for a later opt-in sky-framing feature:

- Use the selected `H.clock` and `H.sky.state.sun` / `.moon` (`az`, `alt`, `altGeo`, `dist`), not the system time. `sky3.dirOf` maps true-north clockwise azimuth into the model basis.
- Sky rendering compensates vertical exaggeration with model direction `[dx,dy/VZ,dz]`. A framing target must use that compensated direction; astronomical angles remain unchanged.
- Vector CRT and Line drawing currently omit the sky. Report that limitation; do not switch style or clock silently to manufacture a shot.
- Label occlusion is not a planner oracle: it uses the current eye, skips some own structures and can have stale/unknown budgeted results. A future arbitrary-eye test can reuse the city prism grid and terrain grid, clip rays to known model coverage, and report blocked / clear-within-model / unknown-beyond-coverage. Do not reuse the current radius/bounds-based segment test as a sky-ray test without adaptation.
- A possible first interface is explicit `sky_body: off|auto|sun|moon`, preserving the already checked road route, with explicit gaze fixations taking priority. Rank a bounded set of road viewpoints and add a short independent gaze interval only when eligible. Record the selected clock and invalidate stale plans. This option does not exist in API1.7.
- Cloud cover, visibility and clear-air rendering overrides are separate appearance/confidence information, not proof that a body is visible. Missing weather remains unknown. The renderer's minimum moon radius and sun-disc shader threshold are display choices, not exact physical diameters.

This research does not implement an image-transformer aesthetic ranker, a precomputed image grid, automatic landmark choice or sky visibility guarantees. Current composition output is a geometric heuristic for a caller-selected subject.
