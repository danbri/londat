# Stateful camera autopilot — page API 1.8.1

The camera-drone has position, velocity and acceleration. A bounded velocity servo follows ordered required waypoints. Nominal mass, drag, acceleration and jerk limits give motion inertia. Required waypoints are reached at low speed before the next point becomes active. Gaze moves independently with a maximum angular speed. The browser runs the loop between tool calls.

## Machine controls

| WebMCP tool | Page API | Input and result |
| --- | --- | --- |
| `start_autopilot` | `startAutopilot` | `{destination,via?,config?}`; starts from the current physical eye, without teleporting |
| `nudge_autopilot` | `nudgeAutopilot` | `{acceleration:[x,y,z],duration_s:1,frame:"body"}`; finite pulse, at most 5 seconds and 4 m/s² |
| `gaze_autopilot` | `gazeAutopilot` | `{point:{place:"HMS Belfast",height_m:25},hold_s:8}`; `point:null` releases |
| `configure_autopilot` | `configureAutopilot` | `{config:{speed_m_s:12}}`; validates the full patch before changing state |
| `get_autopilot` | `getAutopilot` | Current state, route, visited waypoints, motion, independent gaze and stop reason |
| `control_autopilot` | `controlAutopilot` | `{action:"pause"}`, `resume`, `brake` or `stop` |

Destination and via points accept either `{place,height_m?}` or `{lon,lat,height_m?}` in WGS84. A `name` labels an explicit point. Heights are absolute in the model datum (ODN in the UK model), not above-ground metres. Without a height, a point is 40 metres above the modeled ground. Via points can include `gaze:{place,height_m}` or `gaze:{lon,lat,height_m}`. There are at most 32 via points. They are visited in order and are not optional attractions.

`get_autopilot` returns geographic position and target, model-axis velocity and acceleration, visited waypoints and active nudge count. The model axis convention is in the page locale adapter, not geographic degrees: the UK model uses east/up/south metres. Body nudge axes are `[right,up,forward]` relative to horizontal travel direction, independent of gaze. A body pulse is converted when submitted. Nudges add to the automatic controller, then the total acceleration is limited; they are not unbounded overrides.

Configuration keys: `speed_m_s` (0.1–50), `max_acceleration_m_s2` (0.1–20), `max_jerk_m_s3` (0.1–100), `mass_kg` (0.1–1000), `drag_per_s` (0–5), `arrival_radius_m` (0.1–10), `gaze_turn_deg_s` (1–180), `gaze_distance_m` (10–1000), `wind_acceleration` (model-axis vector, norm at most 2 m/s²). Unknown keys and invalid values fail before changes are applied. The default mass is 1; mass affects automatic steering response, while a requested acceleration pulse keeps its stated acceleration units.

An explicit gaze hold is 0–120 seconds (strictly greater than zero). Expiry returns to current waypoint gaze, or travel attention when none is supplied. Route gaze is attached to the upcoming waypoint; explicit gaze takes precedence. Gaze does not steer the eye. `configure_autopilot` can replace `destination` and `via` in place while preserving position, velocity, acceleration and explicit gaze. This resets the reached-waypoint list for the new route. Supply the new destination whenever changing via points. Configuration changes alone preserve the existing route. Combined route and configuration updates validate fully before mutation; rerouting is supported while playing or paused.

## Ownership and interruptions

The autopilot requires the base perspective camera. Pixel orthographic, XR, drone mode, geolocation follow, automatic rotation and orbit damping are refused. Existing sweeps and autopilot cannot own the camera together. `goTo`, a new sweep, manual pointer/wheel/key input, page hiding, unsupported camera changes or model-boundary motion stop the autopilot. Pausing preserves inertia but clears pending nudges; braking slows toward rest and pauses; stopping is immediate. Resume is explicit and requires paused state.

Physics uses fixed substeps of at most 10 ms and integrates at most 0.25 seconds per rendered frame. Ordinary rendering stalls discard excess wall time and keep the journey running at reduced simulated speed, rather than jumping ahead. State reports cumulative discarded wall time as `discarded_time_s`. A frame gap of five seconds or more pauses the simulation with reason `frame-gap`, clears nudges and avoids a large jump. Nudges expire in simulation time and cannot persist through pause. Reduced-motion preference starts the journey paused. Lens, viewport, height scale, control limits and known camera-owner changes interrupt the loop. Controls are restored only when a new camera owner does not own them. State and stop reasons are also exposed in the existing flight status and view description.

## Scope and test journey

This first implementation is **unconstrained**. It enforces finite positions and the detailed model boundary, but does not certify clearance from buildings, terrain, bridges, vessels or other geometry. Stateful acceleration can depart from a nominal line. Use the separate city sweep when exact static building clearance is required; arbitrary nudges cannot inherit its clearance claim.

The London test journey starts at London Bridge, passes the north side of HMS Belfast while looking at it, then passes near the Tower of London while looking at the Tower, and continues along explicit Thames approach points to Canary Wharf. The fixture preserves required flybys and distinct gaze points. It does not silently teleport to London Bridge: the test places the initial camera explicitly, while ordinary starts use the current eye.

Automatic landmark selection, photo-style sun/moon framing, learned image ranking, live weather buffeting and time-stamped acceleration trajectory uploads are not implemented by these controls. Explicit waypoints, route gaze and finite acceleration pulses are supported now. `wind_acceleration` is an opt-in synthetic input rather than a physical weather model.


### First-frame timing (1.8.1)

Start and resume take their time baseline from the first animation callback. A frame timestamp can precede the performance.now() value from the task that starts a flight; mixing these values previously produced a negative first step and stopped the flight before any movement. The regression test now exercises the page scheduler as well as the pure dynamics.
