# Planet architecture: frames, tiles, adapters (OKR O1 and O2)

Written 2026-10-11 for OKR O1 (any locale worldwide, https://github.com/danbri/londat/issues/6) and O2 (a planet model,
https://github.com/danbri/londat/issues/7). Owner, 2026-10-11: "Growing the codebase to work for any locale worldwide is
mission Critical. As is sphericalish planet model cf google earth. And some maps and data worldwide. It is ok to be
challenged by getting super rich dense data everywhere but we should architect for scaling this."

This note is the design. It does not build the globe. What exists now:

| part | file | state |
|---|---|---|
| geodesy core: WGS84, ECEF, ENU at any origin, normal, radii, curvature drop | https://github.com/danbri/londat/blob/main/docklands/geo/ellipsoid.js | done, tested |
| Region object | https://github.com/danbri/londat/blob/main/docklands/geo/region.js | done, tested |
| page clock in any IANA time zone | https://github.com/danbri/londat/blob/main/docklands/geo/clock.js | done; the port uses it (`sky3.js`, `carousel.js`, `main.js`) |
| region configs: Docklands, and the KR1.2 places Sarajevo, León, Leiden | https://github.com/danbri/londat/tree/main/docklands/geo/regions | done |
| UK adapter (BNG, OSTN15, ODN, the model frame) | https://github.com/danbri/londat/blob/main/docklands/geo/adapters/uk-os.js | the model frame and heights; the tools still call `lib.mjs bngProjector` |
| locale check (KR1.1) | https://github.com/danbri/londat/blob/main/tools/check-locale.mjs , list: https://github.com/danbri/londat/blob/main/docs/locale-inventory.md | in `npm run check` |
| tests | https://github.com/danbri/londat/tree/main/docklands/geo/test | in `npm test` |
| the globe in the port (2026-10-13): own quadtree of ellipsoid patches in TSL, floating frame at the eye, logarithmic depth per material, hand-over to and from the model, world skeleton (Natural Earth, ETOPO 2022, EGM96), the UK skeleton drawn by view cell | https://github.com/danbri/londat/tree/main/docklands/globe , data https://github.com/danbri/londat/tree/main/cwplans/docklands/data/world | first step of KR2.1; KR2.2 and KR2.7; skill docklands-3d-page, "Three.js port: globe and world skeleton (2026-10-13)" |

## 1. Frames

Four frames. Each has one job. All conversions are in double precision on the CPU; the GPU sees only small numbers.

1. **WGS84 geodetic** (lon, lat in degrees, h in metres above the ellipsoid). The exchange frame: every adapter gives
   positions in it, every API (JS, WebMCP, MCP) speaks it. Heights in a local datum (ODN, NAVD88, ...) are an
   adapter's business; the region's `heightDatum` names the one its data use.
2. **ECEF** (earth-centred, earth-fixed, metres). The globe frame: the tile tree and the camera when it is far out.
   `geodeticToEcef`, `ecefToGeodetic` (round trip below 1 micrometre in height and 1e-10 degrees, sea floor to
   geostationary orbit, tested).
3. **ENU** (east, north, up, metres) at an origin. Every tile and every region has one: `enuFrame({lon, lat, h})`;
   `matrix()` gives the ENU -> ECEF 4x4 that a 3D Tiles `transform` or a three.js `Matrix4` takes. Content is
   authored in its tile's ENU (Z up in glTF terms after the usual Y-up rotation).
4. **Camera-relative floating origin.** The renderer subtracts the camera's ECEF position (in doubles) from each tile's
   matrix every frame, so the GPU sees positions within a few km of zero. float32 has 24 bits: at 35 km the step is
   3.9 mm; at the earth's radius (6,371 km) it is 0.5 m, which is why ECEF never goes to the GPU raw. With the
   floating origin, street level keeps millimetres anywhere. Depth: reversed-Z (WebGPU supports it; three.js r186
   `reversedDepthBuffer`), or a logarithmic depth buffer on WebGL 2, so that one frame holds 0.5 m to 20,000 km.

**Curvature.** The ellipsoid falls below a tangent plane by d^2 / 2R: measured with `curvatureDrop` at the Docklands
origin (exact on the ellipsoid; sphere of the normal section radius in brackets):

| distance | north | east |
|---|---|---|
| 1 km | 0.0784 m | 0.0782 m |
| 10 km | 7.844 m | 7.823 m |
| 40 km | 125.50 m | 125.17 m |

The flat model leaves this out. In the box (far corner 6.3 km from the origin) the drop is up to 3.08 m; at the edge of
Greater London (about 25 km) it is about 49 m. So flat tiles must stay small (one ENU per tile) and the camera must
look across tiles in ECEF.

### The Docklands model frame as a fixed transform of ENU

Today's model frame: x = E - 537550, z = -(N - 180300) (BNG metres, north is -z), y = metres above ODN. Region origin =
the model origin: 51.504902222 N, 0.019497988 W (the inverse of the area.js fit at x = z = 0), h = 45.448 m (the OSGM15
geoid height there, so u = 0 is ODN 0 at the origin).

Fixed transform (parameters in the region config, `adapters[uk-os].modelFrame`):

    x  = a e - b n + tx        a = 0.99947021167, b = 0.02705486219
    -z = b e + a n + tn        tx = 0.0091 m, tn = 0.0039 m
    y  = u + ty                ty = 0

That is a scale of 0.9998363 (the BNG point scale factor here: Transverse Mercator, central meridian 2 W) and a
rotation of 1.5506 degrees (grid convergence: true north is 1.55 degrees west of grid north, as `sky3.js GRID_CONV`).

Error, measured by `fitModelFrame()` (test `docklands/geo/test/geo.test.mjs`) against the area.js fit (which holds
OSTN15 to 0.03 m), on a 61 x 61 grid over the box (3,721 points, ground level):

| what | value |
|---|---|
| horizontal, max | **0.086 m** (at the SE corner, 0.015 E 51.474 N) |
| horizontal, rms | 0.028 m |
| against OSTN15 (adds the area.js fit error) | at most about 0.12 m |
| vertical: curvature drop left out by the flat model | up to 3.08 m (far corner) |
| vertical: change of the geoid over the box | about +-0.07 m |
| lean of verticals: a point y m up at distance d | y d / R outwards (0.11 m for 235 m at 3 km) |

The horizontal residual is the change of the TM scale factor across the box (2.5e-5 from west to east), which a
similarity cannot hold. For KR2.1 ("street level within 1 cm of the flat model") the fixed transform is not enough;
use the exact path (`exactToModel`, `exactFromModel`: the area.js fit plus OSGM15) to place flat-model content on the
globe, or rebuild the content in per-tile ENU (the plan below does this). ETRS89 versus WGS84: OSTN15 works from
ETRS89; the core takes it as WGS84. They differ by about 0.9 m in 2026 (plate motion since 1989). That is below the
accuracy of the open data in use (OSM), but a globe that mixes UK survey data with global WGS84 data will see it.
The UK adapter must apply it (a time-dependent Helmert, ETRF2000 to ITRF2014) before survey-grade work.

## 2. The tile tree

**Format: 3D Tiles 1.1** (OGC Community Standard) with glTF 2.0 content (`EXT_meshopt_compression`, `KHR_mesh_quantization`;
`EXT_structural_metadata` for feature properties such as height source, use and the cwb- id). One `tileset.json` tree for
everything: terrain, buildings, trees, water, and later Gaussian splats (`KHR_gaussian_splatting`, a draft in 2026).
Reasons: open standard; three viewers read it (3d-tiles-renderer, CesiumJS, QGIS 3D); tiles carry their own transform
(ENU -> ECEF), so a tile is exact on the globe and flat inside; external tilesets let a region hang its own tree under a
worldwide one. Our own JSON tiles would be quicker to start but a dead end for the globe (as said in
https://github.com/danbri/londat/blob/main/docklands/SCALING-AND-OKRS.md).

**Cell scheme (worldwide base): recommended, a WGS84 geodetic quadtree** ("geographic" tiling: 2 root tiles of
180 x 180 degrees, then a quadtree; the scheme of quantized-mesh, Cesium World Terrain and the OGC 2D TMS
WorldCRS84Quad), expressed as **3D Tiles 1.1 implicit tiling** (`implicitTiling.subdivisionScheme: QUADTREE`,
bounding volume `region`, availability in `.subtree` files). Reasons:

- 3D Tiles 1.1 implicit tiling supports exactly this, with no extension. 3d-tiles-renderer has an
  `ImplicitTilingPlugin` and a `SUBTREELoader` (in its source, 2026-10-07), and a `QuantizedMeshPlugin` for terrain in
  the same scheme.
- S2 is better as an index (cells of near-equal area, good at the poles), but its 3D Tiles form needs the
  `3DTILES_bounding_volume_S2` extension; 3d-tiles-renderer has no S2 bounding volume (no match in its source,
  2026-10-07). H3 is hexagonal and has no 3D Tiles form. Keep S2 (or H3) for statistics such as the detail measure of
  KR2.4, not for the tile tree.
- A tile is a lon/lat rectangle: easy to clip OSM, Overture, Copernicus DEM and Natural Earth to it; easy to name
  (`z/x/y`); the same keys serve 2D raster and vector tiles (PMTiles in WorldCRS84Quad, or Web Mercator for MapLibre).
- Cell size at level L: 180 / 2^L degrees. Level 14: 0.011 degrees, about 1.22 km north-south and 0.76 km east-west at
  51.5 N. Level 13 is about 2.4 x 1.5 km. Use level 14 for building tiles in towns, coarser where data are thin.
- Weakness: cells shrink east-west towards the poles (by cos(lat)). Mitigation: stop subdividing when the cell's
  east-west size is below half of its north-south size (implicit tiling allows unavailable children).

**UK cells.** The UK adapter's cells are the BNG 1 km squares (the LiDAR tiles, E 532,000 to 540,000 for the box). They
stay as the adapter's build cells: each square is built in its own ENU (origin: the square's centre on the ellipsoid)
and published as a tile with its `transform`; a geodetic level-14 tile that contains squares points to them through an
external tileset. The tree is geodetic; the content may come in national cells.

## 3. Levels of detail

- **Worldwide base, everywhere** (KR2.2): Natural Earth coastlines, land, water and boundaries (public domain);
  terrain from Copernicus GLO-90 (or GLO-30 where wanted) or ETOPO 2022 (public domain) as quantized-mesh or glTF
  heightfields; place names from Natural Earth and OSM; OSM / Overture buildings with heights where tagged, extruded
  with a default height elsewhere (OSM is ODbL: share-alike, allowed now by the owner, and in the register).
- **Rich local layers, where open data exist**: UK EA LiDAR 1 m (OGL), borough registers, the Docklands detail (detail
  islands: photo views, facade tiles, station boxes, detailed models). Same tree, deeper levels or more content in
  the same tile (3D Tiles `ADD` refinement for overlays, `REPLACE` for better geometry).
- **Geometric error** per level from the cell size (about cell size / 64 for terrain, the max distance from a building
  to its simplified form for buildings). 3d-tiles-renderer picks tiles by screen-space error (`errorTarget`); quality
  tiers of KR3.1 set `errorTarget` and the content kinds, not new code.
- **Detail measure per tile** (KR2.4): buildings with a measured height, trees, water, live sources, splats; written in
  the tile's metadata and in a world index for the dashboard.

### 3a. The Docklands model as 3D Tiles: the plan (2026-10-21, after LOD step 4)

LOD step 4 cut the Docklands model into cells **in the page** (https://github.com/danbri/londat/blob/main/docklands/cells.js):
54 building cells of 1 km (build.js `TILE`), each with three levels (full; flat roofs without buildings under 8 m;
buildings of 20 m across or 30 m high with outlines simplified to 2.5 m), and the terrain, greens, roads and rail drawn by
cell and level from one index each. It was not written as a 3D Tiles tileset yet, because the page would lose features:

| feature | what it needs today | what a tile reader would need |
|---|---|---|
| tap names the building (cards, `id=osm:` links) | `userData.bi`: the model index of each vertex | `_FEATURE_ID_0` = model index (EXT_mesh_features), as the places do |
| skyline years, Colour by, piers / river / detailed models hiding their buildings, Roofs and Realistic look switches | `rebuildBuildings()` from area.js with options (heightOf, colourOf, skip, roofs, look) | a feature table on the GPU: per model index a height scale, a colour and a hide bit, read in the vertex and colour graphs; roof and look variants as separate content |
| facades, Night windows, Realistic look, pixel and line styles | vertex attributes `uw`, `col` (alpha byte = material code), `gk` (centre, base, night kind) | the same as glTF custom attributes `_UW`, `COLOR_0` (normalised u8 RGBA), `_GK` |
| tide, foreshore and dock walls | the terrain's 20 m grid, its cut squares and an index without the foreshore squares (layers/tide.js) | the terrain stays an in-page mesh (or carries its grid and squares as metadata) |
| label occluder, zoom stop, drone | CPU positions of the full buildings | keep the full level's positions on the CPU after parsing |
| vertical exaggeration, cut-away, shadows | camera matrix, `U.cut` in the graphs, mesh flags | nothing new |

Plan (about 3 to 4 agent-days, step 8 of the table below): (1) a GPU feature table (height scale, colour, hide) so that the
runtime options need no rebuild; (2) `cwplans/tools/build-docklands-tiles.mjs`: runs build.js `buildBuildings({ level,
tile })` in Node for each cell and level (roofs-layer.js and look-layer.js as globals), writes glb with the attributes above,
`_FEATURE_ID_0`, KHR_mesh_quantization, in the region ENU frame (the page frame is a fixed transform of ENU, section 1); a
`tileset.json` of the model box with the 54 cells, REPLACE refinement far -> simplified -> full, geometricError from the
level rules (far: 30 m, the highest building left out; simplified: the highest roof ridge flattened, about 8 m; full: 0);
data-register entries; 3d-tiles-validator 0 errors; (3) the reader: the places reader (globe/places.js) walk with the same
screen-space error rule, putting the cells into `ctx.meshes.buildings` with `userData.full`, so that cells.js picking and
the occluder keep working; terrain, greens, roads and rail as tiles later (the tide needs the terrain grid). Sizes:
today's full level is 1.13 M triangles; the simplified and far levels add about 60 % and 15 %.

## 4. Adapters

An adapter is a module plus a block in a region config. Contract:

| field | meaning |
|---|---|
| `id` | short name (`uk-os`, `osm-world`, `copernicus-dem`, ...) |
| `module` | the code that converts its data to WGS84 / ENU (or none for a pure source) |
| `area` | where it applies: a bbox or a list of cells, plus a sentence |
| `licence`, `licenceClass` | the licence and its class: `open` (OGL, CC BY, PD), `share-alike` (ODbL: owner's review), `review` (accepted for scoping only), `none` (metadata only) |
| `fallback` | what is used outside its area or when it fails (the worldwide base) |
| `crs` | the source CRS and datums, and the transformation used (with its error) |
| `cells` | the build cells (`bng-1km`, `geodetic-L14`) |

The data register gets a `region` (or `area`) and `adapter` column for each source (KR1.4). Live sources (aircraft,
ships, weather) are worldwide adapters with a position argument: the region config holds today's fixed points
(`services.weatherPoint`, `services.aircraft`, `services.metar`) until they follow the place in view (KR5.3).

## 4a. The three places of KR1.2 and their national open data

Owner, 2026-10-11: "Places: old city Sarajevo. City hall / Spain https://leon.es/en/what-to-see/monuments/plaza-mayor/ /
Leiden nl annies bar". Origins checked with Nominatim (OSM, ODbL) the same day; each is a region config next to the
Docklands one (https://github.com/danbri/londat/tree/main/docklands/geo/regions), tested in
`docklands/geo/test/regions.test.mjs` (ENU round trips at each origin, wall clock in each zone, Cyrillic dates for
`sr-Cyrl`). Heights of the origins are approximate (+-10 m) until the base builder sets them from Copernicus GLO-30 plus
EGM2008.

| region | origin | time zone | locales | national adapter (later) | licence, as checked 2026-10-11 |
|---|---|---|---|---|---|
| `sarajevo` | Vijećnica (City Hall), OSM way 23723663, 43.85917 N 18.43335 E | Europe/Sarajevo | bs, hr, sr-Latn, **sr-Cyrl** (the non-Latin script case) | `ba-fgu`: the national LiDAR (EU IPA II 2019 project: DSM and DTM, due about the end of 2025; Federal Geodetic Administration FGU, RGURS of Republika Srpska, Brčko District) and the FGU geoportal | **unknown**: no published open licence found; a catalogue entry for the FGU geoportal says "No License Provided". **Waived for the prototyping phase** (owner, 2026-10-11: "Waive this, put it against my name to pursue license while in prototype phase."): FGU / RGURS data may be fetched and used now; the owner pursues a licence (https://github.com/danbri/londat/issues/9); register it as "review"; re-check before the phase ends |
| `leon` | Plaza Mayor, OSM way 46344511, 42.59732 N 5.56654 W | Europe/Madrid | es-ES | `es-ign`: IGN / CNIG PNOA LiDAR, MDT and MDS models, PNOA orthophotos (Centro de Descargas; ETRS89 / UTM 30N, heights on the EGM08-REDNAP geoid) | **CC BY 4.0** (Orden FOM/2807/2015; credit "© Instituto Geográfico Nacional", for PNOA "PNOA cedido por © Instituto Geográfico Nacional"). Data made with other bodies can have other terms: check each product's page before use |
| | | | | `es-catastro`: Dirección General del Catastro INSPIRE buildings (BU), parcels (CP), addresses (AD) | **review, not open in our sense**: own licence (v1.0, July 2016; read from its PDF): public and commercial use only of data the user has transformed; "no se autoriza la difusión ... de la información original". So we may publish derived geometry (for example heights or LoD1 blocks we compute), never the original files. **Owner decision, 2026-10-11: "Catastro - yes"** on these terms (publish only data we have transformed; keep the original files out of the repository and out of Pages). Not for the Basque Country or Navarre (own cadastres) |
| `leiden` | Annie's, Hoogstraat 1A, OSM node 2917023856, 52.15948 N 4.49123 E | Europe/Amsterdam | nl-NL | `nl-pdok`: AHN LiDAR DTM and DSM 0.5 m; BAG buildings and addresses (Kadaster); 3DBAG (LoD 1.2 to 2.2 buildings from BAG and AHN; RD New EPSG:28992, NAP heights) | **AHN: CC0 1.0** (data.overheid.nl entries for the DTM and DSM); **BAG: CC0 1.0 / public domain** (Kadaster entries; Kadaster may charge private parties for some extract deliveries); **3DBAG: CC BY 4.0** (3D geoinformation group, TU Delft, and 3DGI; credit and link required) |

The Netherlands is the best case: CC0 terrain and buildings, plus ready 3D buildings under CC BY 4.0. Spain has open
terrain and imagery (CC BY 4.0); its buildings come from OSM (ODbL) or from transformed Catastro data (approved by the owner, 2026-10-11).
Bosnia and Herzegovina shows the fallback: the worldwide base alone, which is the case the architecture must handle
well. Sources: https://docs.3dbag.nl/en/copyright/ ,
https://data.overheid.nl/dataset/47567-actueel-hoogtebestand-nederland--ahn--dtm ,
https://data.overheid.nl/dataset/basisregistratie-adressen-en-gebouwen--bag- ,
https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf ,
https://www.catastro.hacienda.gob.es/webinspire/documentos/Licencia.pdf , https://projects.europa.ba/Project/Details/C_2000026 ,
https://www.fgu.com.ba/en/572.html . Each source gets a data register entry (with region and adapter) before any file of
it is committed.

## 5. Hosting off GitHub Pages

Pages has about 494 MB left of 950 MB. Greater London tiles are 150 to 250 MB in a first version; a world base is more.
Options, for the owner (KR2.5):

| host | for | against |
|---|---|---|
| Hugging Face dataset (the owner's account is linked) | free, versioned (git + LFS / Xet), large files, public URLs | CORS and range requests on `resolve/` URLs to be checked; rate limits not published |
| object storage (Cloudflare R2, S3, GCS) with a CDN | made for this; range requests; R2 has no egress fee | a bill and an account; not versioned by itself |
| a second GitHub repository with Pages | same tools as now | the same 1 GB limit; no fix for scale |

Recommended: Hugging Face for the first London and world-base tiles (cost 0, versioned like the rest), with the
`tileset.json` root on Pages and a base URL in the region config, so a move to object storage is one line. Test CORS,
range requests and cache headers on HF before the first upload.

## 6. Renderer: 3d-tiles-renderer with three.js r186 WebGPURenderer

3d-tiles-renderer (NASA-AMMOS, Apache-2.0; https://github.com/NASA-AMMOS/3DTilesRendererJS). Checked 2026-10-11 on its
CHANGELOG, README, package.json and source at commit 075b123 (2026-10-07):

Known:
- Latest release 0.5.3 (2026-09-18). Peer dependency `three >= 0.167`; developed against three ^0.185. r186 is in range.
- The changelog of 0.4.x and 0.5.x names no WebGPU support for the three.js path. WebGPU appears only in its
  Babylon.js tests (`babylonjs/fadingTiles.html?webgpu`).
- The core (traversal, LRU cache, download and parse queues, `ImplicitTilingPlugin`, `ReorientationPlugin`,
  `GlobeControls`, `EnvironmentControls`) works on plain `Object3D` and `Mesh` objects and reads the screen size with
  `renderer.getSize()`; nothing there needs WebGL.
- glTF content comes through three.js `GLTFLoader` with `MeshStandardMaterial`; WebGPURenderer draws these through its
  node material library. So the base case (tiles + glTF + standard materials) should run on WebGPURenderer.
- Plugins that patch GLSL (`onBeforeCompile` or `ShaderMaterial`) will not run on WebGPURenderer: `TilesFadePlugin`
  (fade), `ImageOverlayPlugin` (draped imagery), the terrain RGB materials, `BatchedTilesPlugin` (also calls
  `renderer.getContext()` for a WebGL array target), the point-cloud material and MVT glyphs; the
  `EXT_structural_metadata` texture reader makes its own `WebGLRenderer`.

Unknown (to test in step 1 below):
- Whether a full tileset streams and draws under WebGPURenderer (WebGPU and its WebGL 2 fallback) with no errors.
- The cost of material conversion per tile, and memory accounting in its LRU cache under WebGPU.
- Raycasting (it uses three-mesh-bvh): should be renderer-free; to confirm.

Plan for the port: use the core and `ImplicitTilingPlugin`, `ReorientationPlugin` (keeps the region's ENU as the
scene frame near the ground) and `GlobeControls`; write our own TSL versions of what we need from the GLSL plugins
(fade, draped overlay), in the style of the port's materials; replace each tile's materials with our TSL building and
terrain materials (as `build.js` does now). Keep CesiumJS rejected (loses TSL, WebGPU, WebXR).

## 7. Step plan (agent-days; one agent-day is one long session)

To **KR1.2** (three places outside the UK by the same pipeline) and **KR2.1** (globe in the port, street level within
1 cm of the flat model):

| step | what | effort | KR |
|---|---|---|---|
| 1 | Spike: 3d-tiles-renderer core under WebGPURenderer r186 (a public sample tileset, then one of ours): errors, frame time, memory; record in the skill. **Done 2026-10-13**: a 4-tile 3D Tiles 1.1 set of ours draws on both backends with no errors once an import-map shim gives the plugin bundle `WebGLRenderer`; the globe surface uses our own quadtree (no terrain tiles yet, GLSL-only plugins, no floating origin); 3d-tiles-renderer stays the plan for content tiles | 1 to 2 | KR2.1 |
| 2 | Region from the URL (`?region=`), `geo/current.js` chooses it; sky3 observer from the region origin; text and units from Intl with the region locale | 1 | KR1.2, KR1.3 |
| 3 | Tools take `--region` (one config instead of `fetch-docklands.mjs` BOX_BNG / ORIGIN; 21 importers); the UK adapter wraps `bngProjector` | 3 to 5 | KR1.1 |
| 4 | Tile writer: one geodetic level-14 (or BNG 1 km) cell to glTF in its ENU, with `transform`, meshopt, metadata; `tileset.json` with implicit tiling | 3 to 4 | KR2.3 |
| 5 | World-base builders: Natural Earth (2D, PMTiles), Copernicus GLO-90 terrain tiles for a region, OSM / Overture buildings for a region (extruded, default heights) | 4 to 6 | KR2.2, KR1.2 |
| 6 | The three places the owner chose (Sarajevo, León, Leiden: region configs done) built by steps 4 to 5, with the Dutch adapter (AHN, 3DBAG) and the Spanish IGN adapter; clock, sun and sky of each place. Note: all three are in Europe and the north, so KR1.2's "3 continents, one in the southern hemisphere" needs the owner to change the KR or add places; Sarajevo in `sr-Cyrl` covers the non-Latin script | 3 to 5 | KR1.2 |
| 7 | Globe in the port: ECEF scene, floating origin, reversed or log depth, `GlobeControls` from orbit to street, base tiles + the Docklands tiles; the flat page frame as the region ENU | 5 to 8 | KR2.1 |
| 8 | Docklands content as tiles (the 54 building cells of LOD step 4 with their three levels, terrain, trees, water) and a 1 cm check: positions in tiles against the flat model (exact path), test in `npm test`. **In-page cells done 2026-10-21** (cells.js); the tileset plan and what blocks it: section 3a | 3 to 4 | KR2.1, KR2.3 |
| 9 | Hosting (owner's choice), upload, cache headers; register entries per tile set | 1 to 2 | KR2.5 |

Totals: KR1.2 about 11 to 18 agent-days (steps 2 to 6); KR2.1 about 10 to 16 more (steps 1, 7, 8, 9); both about 24
to 37. This fits the earlier estimate of 45 to 65 days for an open globe with all of London at today's detail, because
London-wide detail (option C) is not in these steps.

## 8. Locale inventory: notes

The counts and every line are in https://github.com/danbri/londat/blob/main/docs/locale-inventory.md (generated by
`node tools/check-locale.mjs --baseline`). `npm run check` fails when a category's count goes up. When code moves into a
region config or an adapter, the count goes down: run `npm run check:locale:baseline` in the same commit to lock it in.

KR1.1 baseline (main at commit c6cc8ab, 2026-10-11, lines of code with comments removed): bng 168, ostn15 41, odn
142, origin 99, box 56, timezone 133, zone_latlon 116, uk_sources 368, ui_en_gb 92; 1,215 lines in 171 files. After
this change: timezone 129, ui_en_gb 91 (1,210 lines): the port's clock (`sky3.js`, `carousel.js`, 6 lines of `main.js`)
now takes the region's time zone.

Where each category goes:
- `bng`, `ostn15`, `odn`, `origin`, `box`: 758 of these lines are in `cwplans/tools/`. They go to the UK adapter and the
  region config through step 3 (`--region`). The model origin and box appear as literals in Python tools too
  (`build-aerial.py`, `build-towers.py`): they read the region config as JSON
  (`node -e "import('./docklands/geo/regions/docklands.js').then(m => console.log(JSON.stringify(m.default)))"`).
- `timezone`: 83 lines in the port, mostly labels ("London time") and `Intl` calls in layers (planes, river, piers,
  sky-extra, overlays, ships). Each layer takes `TZ` from `docklands/geo/current.js`; labels go to the message
  catalogue (KR1.3).
- `zone_latlon`: Open-Meteo, adsb.lol and METAR calls with 51.505 / -0.02 (`meteo.js`, `about-extra.js`,
  `layers/wind.js`, `planes-live.js`, `fetch-sky.mjs`, `fetch-live-cache.mjs`): read `REGION.services` now, the place in
  view later (KR5.3).
- `uk_sources`: hosts under `.uk` (TfL, EA, GLA, ONS, ...) and the EGLC METAR. They stay, as UK source adapters with an
  area and licence class (KR1.4); the count tracks that none are added to the core.
- `ui_en_gb`: hard-wired `'en-GB'` formats; they go to Intl with the visitor's locale (KR1.3).

Limits of the count: it matches text, so a few lines are false hits (a URL constant named `ORIGIN` in
`cwplans/feeds/check-events.mjs`; `E0` / `N0` as names of other boxes) and a constant written in a new form would be
missed. It is a ratchet, not a proof; code review still applies.

## To do: simple models from public imagery and open data

Owner, 2026-10-11: "Also note todos for creating simple models based on public imagery etc." The list (heights from
national LiDAR, open footprints and heights, shadows in open orthophotos, solved photos, facts from the Sarajevo 3D
Warehouse models; parametric models by OSM tags; roof and facade colour from open imagery; single landmarks; splats) is
tracked in https://github.com/danbri/londat/issues/10 .
