# Station box models: Canada Water and Canary Wharf (am3d/models)

Low-poly 3D models of the underground station boxes at Canada Water (Jubilee and East London / Windrush lines) and
Canary Wharf (Jubilee line), made in Blender 4.0.2 through the blender-mcp MCP server on 2026-10-05.
They are a scoping and prototyping model for magpie/cwplans (danbri/glitchcan-minigam). They are not survey data.

## Basis and licence

- **Contains OpenStreetMap-derived geometry, ODbL 1.0. © OpenStreetMap contributors.** Platform outlines, the
  ticket hall outlines, track centrelines, escalator and stair positions and directions, lift and entrance positions,
  canopy footprints and the drum centre come from OSM (Greater London extract of 2026-10-02, as built into the
  Docklands 3D page data `magpie/cwplans/docklands/data/under.js`, `area.js`, `indoor.js`). As a derived database
  that uses OSM, these files are under ODbL share-alike terms; keep the attribution.
- **TfL axonometric sheets** (`../stations/*/`, 2015 FOI release, rights Transport for London, RPSI re-use, use
  approved by the owner danbri on 2026-10-05 for the scoping phase): used as a layout guide only (which levels, how
  many escalators in a bank, which entrances, lifts and stairs, numbering). Nothing is traced from them; they are not
  to scale. Review before any use outside the scoping phase.
- Published sizes and levels (each cited with a quote in `magpie/cwplans/docklands/facts.json` and
  `magpie/cwplans/data/sourced-levels.json`): TfL FOI-0493-2223 rail levels, Wikipedia (Canada Water box, slot,
  drum, ELL depth), the architect's figures for Canary Wharf (box and ticket hall). Ground from EA LiDAR (OGL).

## Frame and units

Metres. The model frame of the Docklands 3D page: E0 = 537550, N0 = 180300 (EPSG:27700), heights in m OD (ODN).

| file | axes |
|---|---|
| `.blend`, `.usdc`, `.stl` | Z up: X = E - E0, Y = N - N0, Z = m OD |
| `.glb`, `.obj`, `.fbx` | Y up (exporter default): x = E - E0, y = m OD, z = -(N - N0) — the 3D page frame exactly |

Object origins are at each object's bounding-box centre; world positions are georeferenced, so the files can be
dropped into the page frame with no transform. Axis empties (in the .blend): `CWF.origin.axis` E 537700.78
N 180131.46 bearing 98.8 deg; `CW.origin.jubilee_axis` E 535472.61 N 179468.26 bearing 81.7 deg;
`CW.origin.ell_axis` E 535455.48 N 179465.76 bearing 162.1 deg.

## Conventions

- One collection per station: `Canary Wharf` (objects `CWF.*`), `Canada Water` (objects `CW.*`).
- Names: `<station>.<class>.<what>`, for example `CWF.escalator.ESC9`, `CW.platform.JL_WB_1`.
- Materials by element class: `M_platform`, `M_escalator`, `M_stair`, `M_lift`, `M_hall`, `M_canopy`,
  `M_tunnel`, `M_track`, `M_box` (structure, 12 % opaque), `M_ground` (street reference plane), `M_entrance`,
  `M_label`.
- Custom properties on every object (glTF `extras`, USD customData, FBX user properties): `station`,
  `element_class`, `uncertainty` (what is from OSM, from the sheet, published, or judged), `basis`, `level_m_od`,
  and for escalators and lifts `from_level_m_od`, `to_level_m_od`. Each collection has `params` (JSON): every level
  with its alternatives and the reason for the choice.
- Escalators and stairs are stepped (sawtooth) solids at 30 deg (stairs 33 deg or the OSM slope); the incline is
  centred on the OSM line, with flat landings.

## Levels chosen (m OD) and why

| station | item | chosen | alternatives | reason |
|---|---|---|---|---|
| Canary Wharf | JL rail | -15.6 | sheet 23.0 m below street | TfL FOI-0493-2223 (asset owner, datum stated); the sheet agrees when the street is 8.4 m OD |
| Canary Wharf | JL platforms | -14.6 | | rail + 1.0 m (judged) |
| Canary Wharf | street reference | 8.4 | LiDAR 6.9 (West Entrance) to 9.8 (East Entrance) | platform + the sheet's 23.0 m |
| Canary Wharf | ticket hall floor | -3.1 | | judged: park roof 9.2 - 1.5 m slab - published hall height 10.8 m |
| Canary Wharf | mezzanine | 3.0 | | judged |
| Canary Wharf | box | -17.8 to 9.2 | Wikipedia pit 24 m (no reference level) | architect: 35 x 27 x 313.85 m |
| Canada Water | JL rail | -13.3 | sheet 15.0 m below street (-10.6 rail); Wikipedia 22 m below ground (-17.6) | TfL FOI-0493-2223; the 3D page uses it and superseded the 22 m (audit AT-5) |
| Canada Water | JL platforms | -12.3 | | rail + 1.0 m (judged) |
| Canada Water | ELL platforms | -5.6 | sheet 8.0 m below street (-2.6) | Wikipedia 11 m below ground: the 3D page's ELL control, and consistent with the 13 m slot |
| Canada Water | ticket hall floor | 0.9 | | judged: four OSM flights from level -1 to the street, about 4.5 m |
| Canada Water | street | 5.4 | | LiDAR at the OSM station node |
| Canada Water | drum | 5.4 to 13.0, 25 m across | | Wikipedia diameter; centre fitted to the OSM level-0 arc (fit radius 11.6 m); height judged |

## Files

| file | bytes | what |
|---|---|---|
| `stations-blend.zip` | 1,842,599 | `stations.blend` (both collections, materials, custom properties, axis empties) |
| `stations-exports.zip` | 8,858,154 | `stations.glb`, `canary-wharf.glb`, `canada-water.glb`, `stations.obj` + `stations.mtl`, `stations.fbx`, `canary-wharf.stl`, `canada-water.stl`, `stations.usdc` |
| `making_of.zip` | 8,317,012 | 10-second screen captures, `timelapse.mp4`, `contact-sheet.jpg`, stills, OSM plan plots, build scripts, `MAKING-OF.md` |

USD: the Debian Blender 4.0.2 build has no USD support (`bpy.app.build_options.usd` is False), so `stations.usdc`
was written with usd-core 26.8 (pxr) from the evaluated Blender meshes (Z up, metres, displayColor and
displayOpacity by class, the custom properties as customData). STL has no materials or properties.

## Known limits

- Everything inside is simplified: no walls between rooms, no plant rooms, no track-level detail, no platform-edge
  doors. Box outlines are published sizes placed on the OSM axis, not surveyed outlines.
- Judged items are marked in `uncertainty`; the main ones are in MAKING-OF.md in the making-of zip.
