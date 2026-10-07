exec(open(WORK + "/steps/cw_axis.py").read())
hall = [f for f in osm(st, kind="area", lv=[-1], closed=True) if len(f["pts"]) > 100][0]
o = prism("CW.hall.floor_osm", hall["pts"], H - 0.5, H)
finish(o, st, "hall", "plan from OSM (indoor area, level -1); level judged", "OSM ticket hall area (level -1)", H)
o = prism("CW.hall.volume", hall["pts"], H, ST - 0.3)
finish(o, st, "box", "plan from OSM; height judged (hall floor to street)", "OSM ticket hall area", H)
# intermediate concourse at the ELL platform level (OSM level -2 corridors from the east JL escalator tops to the ELL)
s0 = sv(c, u, (-2092.0, 834.0))[0]; s1 = sv(c, u, (-2043.0, 827.0))[0]
tm = sv(c, u, (-2060.0, 829.5))[1]
o = obox("CW.concourse.ell_level", at(c, u, 0, tm), u, 0, 12.0, EP - 0.5, EP, s0, s1)
finish(o, st, "hall", "extent judged around OSM level -2 corridors; level = ELL platform level", "OSM corridors at level -2; sheet: central area", EP)
# glass drum: circle fitted to the OSM level-0 arc (outer points), diameter 25 m (Wikipedia)
arc = [f for f in osm(st, kind="area", lv=[0], closed=True) if len(f["pts"]) > 20][0]["pts"][4:22]
import itertools
best = None
for cx in [x * 0.25 for x in range(int(-2085 * 4), int(-2068 * 4))]:
    for cz in [z * 0.25 for z in range(int(818 * 4), int(832 * 4))]:
        ds = [math.hypot(p[0] - cx, p[1] - cz) for p in arc]; m = sum(ds) / len(ds); e = sum((d - m) ** 2 for d in ds)
        if best is None or e < best[0]: best = (e, cx, cz, m)
_, dx, dz, r = best
R = V(st, "drum_d") / 2
o = cyl("CW.canopy.glass_drum", (dx, dz), R, ST, V(st, "drum_top"), 40, cap=False)
o.modifiers.new("thickness", "SOLIDIFY").thickness = 0.2
finish(o, st, "canopy", f"centre fitted to the OSM level-0 arc (fit radius {r:.1f} m, rms ok); diameter 25 m Wikipedia; height judged",
       "OSM area at level 0 (arc); Wikipedia glass drum 25 m across", ST, {"centre_x": round(dx, 2), "centre_z": round(dz, 2), "fit_radius_m": round(r, 2)})
o = cyl("CW.canopy.drum_roof", (dx, dz), R + 1.5, V(st, "drum_top"), V(st, "drum_top") + 0.6, 40)
finish(o, st, "canopy", "judged: roof disc with a 1.5 m overhang", "sheet and photos", V(st, "drum_top"))
frame_view(b3(dx, dz, 2), 140, 25, -40)
print("drum fit", dx, dz, r)
