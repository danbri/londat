exec(open(WORK + "/steps/cwf_axis.py").read())
# lifts (OSM highway=elevator nodes in data/indoor.js), shafts 2.6 m square (judged)
for nm, p, y0, y1, desc in [("lift_to_ticket_hall", (0.7,133.0), H, 6.9 + 3.5, "sheet A: lift to ticket hall (Plaza entrance)"),
                            ("lift_to_platform_level", (77.2,150.9), PL, H + 3.5, "sheet: lift to platform level")]:
    o = obox("CWF.lift." + nm, p, u, 2.6, 2.6, y0, y1)
    finish(o, st, "lift", "position from OSM (elevator node with levels); shaft size judged", "OSM elevator; " + desc, y0, {"from_level_m_od": y0, "to_level_m_od": y1})
# escape and public stairs from the sheet (no OSM geometry): judged positions
obs = stair_tower("CWF.stair.east_end_D", at(c, u, 135, 9), u, PL, ST)
for o in obs: finish(o, st, "stair", "judged: sheet D shows a multi-flight stair at the east end, platform level to street; position at the east end of the box", "sheet (east end, D)", None)
o = flight("CWF.stair.west_C", at(c, u, -128, -14.5), at(c, u, -160, -14.5), H, 6.9, 4.0, riser=0.17, angle=30)
finish(o, st, "stair", "judged: sheet C shows a wide stair beside ESC 10-14 from the ticket hall to the Plaza; placed on the north side of the OSM escalators", "sheet (west end, C)", None)
# canopies: Foster glass shells. A = OSM building over the Plaza entrance; B = OSM building over the East Entrance; B1 judged.
cwf_b = OSM["stations"][st]["buildings"]
def bfit(b):
    ss = [sv(c, u, p) for p in b["pts"]]; s0, s1 = min(x[0] for x in ss), max(x[0] for x in ss); t0, t1 = min(x[1] for x in ss), max(x[1] for x in ss)
    return at(c, u, (s0 + s1) / 2, (t0 + t1) / 2), s1 - s0, t1 - t0
A = [b for b in cwf_b if b["h"] == 7][0]; B = [b for b in cwf_b if b["h"] == 4 and b["b"] == 10][0]
ca, La, Wa = bfit(A); cb, Lb, Wb = bfit(B)
o = shell("CWF.canopy.A_plaza", ca, u, La, Wa, 7.0, 6.9)
finish(o, st, "canopy", "footprint and height from OSM (building, 7 m); shell shape and opening judged (opens east, over ESC 10-14)", "OSM building over the West Entrance; sheet: Plaza entrance (west end) A", 6.9, {"height_m": 7.0})
o = shell("CWF.canopy.B", cb, (-u[0], -u[1]), Lb, Wb, 4.0, 9.8)
finish(o, st, "canopy", "footprint and height from OSM (building, 4 m); shell shape judged (opens west, over ESC 18,19)", "OSM building over the East Entrance; sheet: Fosterito entrance (central area) B", 9.8, {"height_m": 4.0})
o = shell("CWF.canopy.B1", at(c, u, 30, 6), (-u[0], -u[1]), 16.0, 13.0, 3.5, 9.7)
finish(o, st, "canopy", "judged: no OSM footprint; size from the sheet relative to B", "sheet: B1 canopy (public stairs and ESC 20); OSM Fosterito Entrance node", 9.7)
# entrances
for p in OSM["stations"][st]["pois"]:
    if p["kind"] == "entrance" and p.get("name") in ("West Entrance", "East Entrance", "Fosterito Entrance"):
        o = cyl("CWF.entrance." + p["name"].replace(" ", "_"), (p["x"], p["z"]), 0.8, p["g"], p["g"] + 3.0, 12)
        finish(o, st, "entrance", "from OSM (entrance node; ground from LiDAR)", "OSM " + p["osm"], p["g"], {"osm": p["osm"], "osm_name": p["name"]})
frame_view(b3(*at(c, u, -60), 0), 300, 22, -35)
print("A", La, Wa, "B", Lb, Wb)
