# Station box modelling helpers, run inside Blender (exec'd by each MCP execute_blender_code call).
# How to run, and why: skill cwplans/docklands/skills/blender-station-models/SKILL.md
# Frame: the Docklands 3D page model frame. x = E - E0, z = -(N - N0), y = m OD (ODN).
# Blender is Z-up, so a model point (x, z, y) is the Blender point (x, -z, y): Blender X = east, Y = north, Z = m OD.
import bpy, bmesh, json, math, os
from mathutils import Vector, Matrix

# WORK: the folder with osm-stations.json and steps/ (set BLENDER_STATIONS_WORK in the environment Blender was started from)
WORK = os.environ.get("BLENDER_STATIONS_WORK", os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else ".")
OSM = json.load(open(WORK + "/osm-stations.json"))
E0, N0 = 537550, 180300

# ---------------------------------------------------------------- parameters (levels in m OD)
# Every level is a parameter with its alternatives; the chosen value and the reason are in P[...]["why"].
P = {
  "canary-wharf": {
    "street": {"v": 8.4, "alt": {}, "why": "sheet: JL platforms 23.0 m below street; 23.0 + platform -14.6 = 8.4 m OD; LiDAR at the OSM station node 9.2, West Entrance 6.9"},
    "jl_rail": {"v": -15.6, "alt": {"sheet 23.0 m below street (8.4)": -14.6}, "why": "TfL FOI-0493-2223 rail level 84.4 m LUD = -15.6 m OD (asset owner, datum stated); used as the 3D page tunnel control"},
    "platform_above_rail": {"v": 1.0, "why": "judged: platform-train interface about 1 m above rail"},
    "box_top": {"v": 9.2, "why": "LiDAR ground at the OSM station node (Jubilee Park roof)"},
    "box_depth": {"v": 27.0, "alt": {"Wikipedia pit 24 m (no reference level)": 24.0}, "why": "architect figure 35 m wide x 27 m deep x 313.85 m long (facts.json)"},
    "box_length": {"v": 313.85, "why": "architect figure (facts.json)"},
    "box_width": {"v": 35.0, "why": "architect figure (facts.json)"},
    "hall_len": {"v": 222.79, "why": "architect figure: ticket hall 222.79 x 32.7 x 10.8 m (facts.json)"},
    "hall_width": {"v": 32.7, "why": "architect figure"},
    "hall_height": {"v": 10.8, "why": "architect figure"},
    "hall_floor": {"v": -3.1, "why": "judged: roof slab 1.5 m under the park surface (9.2 - 1.5 = 7.7) minus the published hall height 10.8 m"},
    "mezz_floor": {"v": 3.0, "why": "judged: between the hall floor and the street at the east entrances (sheet: ESC 15-17 hall to mezzanine, ESC 18-20 mezzanine to street)"},
  },
  "canada-water": {
    "street": {"v": 5.4, "why": "LiDAR ground at the OSM station node (node/5700149213)"},
    "jl_rail": {"v": -13.3, "alt": {"sheet 15.0 m below street": -10.6, "Wikipedia 22 m below ground": -17.6}, "why": "TfL FOI-0493-2223 rail level 86.7 m LUD = -13.3 m OD (asset owner, datum stated); the 3D page uses it as the tunnel control and has superseded the Wikipedia 22 m (audit AT-5)"},
    "platform_above_rail": {"v": 1.0, "why": "judged"},
    "ell_platform": {"v": -5.6, "alt": {"sheet 8.0 m below street": -2.6}, "why": "Wikipedia 11 m below ground = -5.6 m OD: the value of the 3D page's East London line control (sourced-levels.json cw-ell-platform), and it fits the published 13 m slot depth; the sheet says 8.0 m"},
    "hall_floor": {"v": 0.9, "why": "judged: OSM level -1, reached from the street by four flights of OSM steps (level -1 to 0), about 4.5 m"},
    "jl_box_len": {"v": 150.0, "why": "Wikipedia: void 150 m long, 23 m wide, 22 m deep (facts.json)"},
    "jl_box_width": {"v": 23.0, "why": "Wikipedia"},
    "jl_box_depth": {"v": 22.0, "why": "Wikipedia"},
    "ell_slot_len": {"v": 130.0, "why": "Wikipedia: slot at right angles, 130 m long, 13 m deep, tapering in width"},
    "ell_slot_depth": {"v": 13.0, "why": "Wikipedia"},
    "ell_slot_width": {"v": [22.0, 15.0], "why": "judged: 'tapering in width' (Wikipedia gives no width); widest at the ticket hall end"},
    "ell_platform_len": {"v": 120.0, "why": "judged: fits inside the 130 m slot"},
    "ell_platform_w": {"v": 4.0, "why": "judged"},
    "drum_d": {"v": 25.0, "why": "Wikipedia: glass drum 25 m across"},
    "drum_top": {"v": 13.0, "why": "judged: about 7.5 m above the street (photos and sheet: one tall glazed storey above the street)"},
  },
}
def V(st, k): return P[st][k]["v"]
for st in P:
    P[st]["jl_platform"] = {"v": V(st, "jl_rail") + V(st, "platform_above_rail"), "why": "rail level + platform height"}

# ---------------------------------------------------------------- materials by element class
CLASSES = {
  "platform": (0.92, 0.78, 0.18, 1.0), "escalator": (0.85, 0.36, 0.10, 1.0), "stair": (0.62, 0.48, 0.32, 1.0),
  "lift": (0.15, 0.55, 0.95, 0.65), "hall": (0.25, 0.70, 0.50, 0.55), "canopy": (0.55, 0.85, 0.98, 0.35),
  "tunnel": (0.38, 0.38, 0.44, 0.75), "track": (0.22, 0.18, 0.18, 1.0), "box": (0.55, 0.55, 0.62, 0.12),
  "ground": (0.42, 0.52, 0.36, 0.18), "label": (0.95, 0.95, 0.95, 1.0), "entrance": (0.85, 0.15, 0.15, 1.0),
}
def mat(cls):
    name = "M_" + cls
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    r, g, b, a = CLASSES[cls]
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1)
    bsdf.inputs["Alpha"].default_value = a
    bsdf.inputs["Roughness"].default_value = 0.15 if cls in ("canopy", "lift") else 0.6
    m.diffuse_color = (r, g, b, a)
    if a < 1: m.blend_method = "BLEND"; m.show_transparent_back = False
    m["element_class"] = cls
    return m

# ---------------------------------------------------------------- collections and objects
def coll(st):
    names = {"canada-water": "Canada Water", "canary-wharf": "Canary Wharf"}
    c = bpy.data.collections.get(names[st])
    if not c:
        c = bpy.data.collections.new(names[st]); bpy.context.scene.collection.children.link(c)
        c["station_id"] = st; c["crs"] = "EPSG:27700 (BNG) + ODN"; c["E0"] = E0; c["N0"] = N0
        c["frame"] = "Blender X = E - E0, Y = N - N0, Z = m OD; glTF (+Y up) = 3D page model frame x = E - E0, y = m OD, z = -(N - N0)"
        c["params"] = json.dumps(P[st])
    return c

def b3(x, z, y): return Vector((x, -z, y))   # model -> Blender

def finish(ob, st, cls, unc, basis, level=None, extra=None):
    for c in list(ob.users_collection): c.objects.unlink(ob)
    coll(st).objects.link(ob)
    if ob.type in ("MESH", "CURVE", "FONT"):
        ob.data.materials.clear(); ob.data.materials.append(mat(cls))
    ob["station"] = st; ob["element_class"] = cls; ob["uncertainty"] = unc; ob["basis"] = basis
    if level is not None: ob["level_m_od"] = round(level, 2)
    for k, v in (extra or {}).items(): ob[k] = v
    return ob

def new_mesh_obj(name, bm):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    return ob

def replace(name):
    ob = bpy.data.objects.get(name)
    if ob: bpy.data.objects.remove(ob, do_unlink=True)

def prism(name, ring, y0, y1):
    """Extrude a plan ring [(x, z), ...] (model frame) from y0 to y1 (m OD)."""
    replace(name)
    bm = bmesh.new()
    pts = [p for i, p in enumerate(ring) if i == 0 or (abs(p[0] - ring[i-1][0]) + abs(p[1] - ring[i-1][1])) > 1e-3]
    if abs(pts[0][0] - pts[-1][0]) + abs(pts[0][1] - pts[-1][1]) < 1e-3: pts = pts[:-1]
    vs = [bm.verts.new(b3(x, z, y0)) for x, z in pts]
    f = bm.faces.new(vs)
    bm.normal_update()
    if f.normal.z > 0: f.normal_flip()
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [e for e in r["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=top, vec=Vector((0, 0, y1 - y0)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_mesh_obj(name, bm)

def rect(c, u, L, W, s0=None, s1=None):
    """Plan rectangle around centre c along unit u (model x, z), length L, width W (or s0..s1 along u)."""
    v = (-u[1], u[0])
    if s0 is None: s0, s1 = -L / 2, L / 2
    w = W / 2
    return [(c[0] + u[0]*s + v[0]*t, c[1] + u[1]*s + v[1]*t) for s, t in ((s0, -w), (s1, -w), (s1, w), (s0, w))]

def obox(name, c, u, L, W, y0, y1, s0=None, s1=None):
    return prism(name, rect(c, u, L, W, s0, s1), y0, y1)

def flight(name, p0, p1, y0, y1, width, riser=0.25, landing=1.5, centred=True, angle=30.0):
    """Escalator or stair: a stepped (sawtooth) solid from (p0, y0) up to (p1, y1). p0, p1 model (x, z).
    The incline is rise / tan(angle) long, centred on the p0-p1 line (OSM lines often include the landings),
    with flat landings at both ends."""
    replace(name)
    dx, dz = p1[0] - p0[0], p1[1] - p0[1]; D = math.hypot(dx, dz) or 1.0
    u = (dx / D, dz / D); v = (-u[1], u[0])
    rise = y1 - y0; run = abs(rise) / math.tan(math.radians(angle))
    mid = D / 2 if centred else run / 2 + landing
    a = mid - run / 2                      # start of incline along u
    n = max(1, int(round(abs(rise) / riser))); dr = rise / n; dt = run / n
    prof = [(a - landing, y0)]
    for i in range(n):
        prof += [(a + i * dt, y0 + (i + 1) * dr), (a + (i + 1) * dt, y0 + (i + 1) * dr)]
    prof += [(a + run + landing, y1)]
    th = 0.6
    bottom = [(a + run + landing, y1 - th), (a + run, y1 - th), (a, y0 - th), (a - landing, y0 - th)]
    ring2d = prof + bottom                # (s along u, height)
    bm = bmesh.new()
    def P3(s, h, t): return b3(p0[0] + u[0]*s + v[0]*t, p0[1] + u[1]*s + v[1]*t, h)
    L = [bm.verts.new(P3(s, h, -width/2)) for s, h in ring2d]
    R = [bm.verts.new(P3(s, h, width/2)) for s, h in ring2d]
    bm.faces.new(L); bm.faces.new(list(reversed(R)))
    k = len(ring2d)
    for i in range(k):
        j = (i + 1) % k
        bm.faces.new([L[i], L[j], R[j], R[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_mesh_obj(name, bm)

def cyl(name, c, r, y0, y1, segs=32, cap=True):
    replace(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segs, radius1=r, radius2=r, depth=y1 - y0,
                          matrix=Matrix.Translation(b3(c[0], c[1], (y0 + y1) / 2)))
    return new_mesh_obj(name, bm)

def tube(name, a, b, r, segs=16):
    """Cylinder from model point a=(x,z,y) to b."""
    replace(name)
    A, B = b3(*a), b3(*b); d = B - A
    bm = bmesh.new()
    rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=segs, radius1=r, radius2=r, depth=d.length,
                          matrix=Matrix.Translation((A + B) / 2) @ rot)
    return new_mesh_obj(name, bm)

def shell(name, c, u, L, W, H, y0, cut=0.35, segs=24):
    """Foster-style glass canopy: half an ellipsoid over a plan L x W (along u), height H, opened by a vertical
    cut at +cut x L/2 along u (the side the escalators rise from). Simple low-poly shell."""
    replace(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs // 2, radius=1.0)
    for vert in bm.verts: vert.co.x *= L / 2; vert.co.y *= W / 2; vert.co.z *= H
    kill = [vt for vt in bm.verts if vt.co.z < -1e-4 or vt.co.x > cut * L / 2]
    bmesh.ops.delete(bm, geom=kill, context="VERTS")
    ang = math.atan2(-u[1], u[0])    # model u to Blender heading (Blender Y = -z)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(b3(c[0], c[1], y0)) @ Matrix.Rotation(ang, 4, 'Z'), verts=bm.verts)
    ob = new_mesh_obj(name, bm)
    sol = ob.modifiers.new("thickness", "SOLIDIFY"); sol.thickness = 0.15
    return ob

def label(name, text, c, y, size=4.0, facing_deg=0.0):
    """Upright text (converted to a mesh) at model (x, z), baseline at y m OD, facing south by default."""
    replace(name)
    cu = bpy.data.curves.new(name, "FONT"); cu.body = text; cu.size = size; cu.align_x = "CENTER"; cu.extrude = 0.05
    ob = bpy.data.objects.new(name, cu); bpy.context.scene.collection.objects.link(ob)
    ob.location = b3(c[0], c[1], y); ob.rotation_euler = (math.radians(90), 0, math.radians(facing_deg))
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.convert(target="MESH")
    ob = bpy.context.view_layer.objects.active
    ob.name = name; ob.data.name = name
    ob["label"] = text
    return ob

# ---------------------------------------------------------------- geometry helpers on OSM data
def axis_fit(lines):
    """Centreline of two parallel track polylines: (centre point, unit direction), model (x, z)."""
    pts = [p[:2] for l in lines for p in l]
    cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
    sxx = sum((p[0]-cx)**2 for p in pts); sxz = sum((p[0]-cx)*(p[1]-cz) for p in pts); szz = sum((p[1]-cz)**2 for p in pts)
    th = 0.5 * math.atan2(2 * sxz, sxx - szz)
    u = (math.cos(th), math.sin(th))
    if u[0] < 0: u = (-u[0], -u[1])
    return (cx, cz), u

def sv(c, u, p):
    """(s along u, t across) of model point p relative to c."""
    v = (-u[1], u[0]); dx, dz = p[0] - c[0], p[1] - c[1]
    return dx*u[0] + dz*u[1], dx*v[0] + dz*v[1]

def at(c, u, s, t=0.0):
    v = (-u[1], u[0]); return (c[0] + u[0]*s + v[0]*t, c[1] + u[1]*s + v[1]*t)

def lvmap(st):
    if st == "canary-wharf":
        m = {-3: V(st, "jl_platform"), -2: V(st, "hall_floor"), -1: V(st, "mezz_floor"), 0: V(st, "street")}
    else:
        m = {-3: V(st, "jl_platform"), -2: V(st, "ell_platform"), -1: V(st, "hall_floor"), 0: V(st, "street")}
    def f(l):
        lo = math.floor(l); hi = math.ceil(l)
        if lo == hi: return m[int(lo)]
        return m[lo] + (m[hi] - m[lo]) * (l - lo)
    return f

def osm(st, kind=None, lv=None, closed=None, name=None):
    out = []
    for f in OSM["stations"][st]["indoor"]:
        if kind and f["kind"] != kind: continue
        if lv is not None and f["lv"] != lv: continue
        if closed is not None and f["closed"] != closed: continue
        if name and name not in (f.get("name") or ""): continue
        out.append(f)
    return out

def frame_view(target, dist, elev=35.0, azim=-60.0, persp=True):
    """Point every 3D viewport at a Blender-space target (for the 10 s screenshots)."""
    for win in bpy.context.window_manager.windows:
        for area in win.screen.areas:
            if area.type != "VIEW_3D": continue
            for sp in area.spaces:
                if sp.type != "VIEW_3D": continue
                r3 = sp.region_3d
                r3.view_location = Vector(target); r3.view_distance = dist
                r3.view_perspective = "PERSP" if persp else "ORTHO"
                from mathutils import Euler
                r3.view_rotation = Euler((math.radians(90 - elev), 0, math.radians(azim)), "XYZ").to_quaternion()
                sp.shading.type = "SOLID"; sp.shading.color_type = "MATERIAL"
                sp.clip_start = 0.5; sp.clip_end = 20000
                sp.overlay.show_floor = False; sp.overlay.show_axis_x = False; sp.overlay.show_axis_y = False
            area.tag_redraw()

def tube_path(name, pts, r, segs=16):
    """One mesh of cylinder segments along model points [(x, z, y), ...] (a running tunnel)."""
    replace(name)
    bm = bmesh.new()
    for a, b in zip(pts, pts[1:]):
        A, B = b3(*a), b3(*b); d = B - A
        if d.length < 0.05: continue
        rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        bmesh.ops.create_cone(bm, cap_ends=False, segments=segs, radius1=r, radius2=r, depth=d.length,
                              matrix=Matrix.Translation((A + B) / 2) @ rot)
    return new_mesh_obj(name, bm)

def stair_tower(prefix, c, u, y0, y1, width=2.2, gap=0.6, max_rise=3.6, angle=33.0):
    """Switchback escape stair: flights alternating along +u and -u, side by side. Returns the flight objects."""
    n = max(1, math.ceil((y1 - y0) / max_rise)); h = (y1 - y0) / n
    run = h / math.tan(math.radians(angle)); obs = []
    for i in range(n):
        t = (width + gap) / 2 * (1 if i % 2 == 0 else -1)
        a = at(c, u, -run / 2, t); b = at(c, u, run / 2, t)
        if i % 2: a, b = b, a
        obs.append(flight(f"{prefix}.flight{i+1}", a, b, y0 + i * h, y0 + (i + 1) * h, width, riser=0.18, landing=1.4, angle=angle))
    return obs

def clip_s(pts, c, u, s0, s1):
    return [p for p in pts if s0 <= sv(c, u, p)[0] <= s1]
