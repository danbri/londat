exec(open(WORK + "/steps/cw_axis.py").read())
for f in osm(st, kind="platform"):
    nm = "CW.platform.JL_" + ("WB_1" if "Westbound" in f["name"] else "EB_2")
    o = prism(nm, f["pts"], PL - 1.0, PL)
    finish(o, st, "platform", "plan from OSM; level = TfL rail level -13.3 + 1.0 m (judged)", "OSM " + f["name"] + " (level -3)", PL, {"osm_name": f["name"], "length_m": 135.4})
jr = V(st, "jl_rail"); er = EP - 1.0
B0, B1 = SM - 75, SM + 75
for i, l in enumerate([l for l in OSM["stations"][st]["lines"] if l["k"] == "subway"]):
    pts = sorted(l["pts"], key=lambda p: sv(c, u, p)[0])
    ins = [p for p in pts if B0 <= sv(c, u, p)[0] <= B1]
    o = tube_path(f"CW.track.JL_{i+1}", [(p[0], p[1], jr + 0.1) for p in ins], 0.75, segs=4)
    finish(o, st, "track", "plan from OSM; TfL rail level", "OSM Jubilee Line", jr)
    for side, seg in (("west", [p for p in pts if B0 - 80 <= sv(c, u, p)[0] <= B0 + 1]), ("east", [p for p in pts if B1 - 1 <= sv(c, u, p)[0] <= B1 + 80])):
        if len(seg) > 1:
            o = tube_path(f"CW.tunnel.JL_{i+1}.{side}", [(p[0], p[1], jr + 2.0) for p in seg], 4.35 / 2)
            finish(o, st, "tunnel", "plan from OSM; level held at the rail level near the station (judged)", "OSM tunnel; JLE tunnel diameter 4.35 m", jr)
Ls = V(st, "ell_slot_len")
for i, l in enumerate([l for l in OSM["stations"][st]["lines"] if l["k"] == "rail"]):
    pts = sorted(l["pts"], key=lambda p: sv(X, ue, p)[0])
    ins = [p for p in pts if abs(sv(X, ue, p)[0]) <= Ls / 2]
    o = tube_path(f"CW.track.ELL_{i+1}", [(p[0], p[1], er + 0.1) for p in ins], 0.75, segs=4)
    finish(o, st, "track", "plan from OSM; rail = ELL platform level - 1.0 m (judged)", "OSM East London Line", er)
    for side, seg in (("north", [p for p in pts if -Ls/2 - 70 <= sv(X, ue, p)[0] <= -Ls/2 + 1]), ("south", [p for p in pts if Ls/2 - 1 <= sv(X, ue, p)[0] <= Ls/2 + 70])):
        if len(seg) > 1:
            o = tube_path(f"CW.tunnel.ELL_{i+1}.{side}", [(p[0], p[1], er + 2.4) for p in seg], 2.4)
            finish(o, st, "tunnel", "plan from OSM; level held (judged); diameter judged", "OSM East London Line tunnel", er)
# ELL platforms 3 and 4: side platforms either side of the two OSM tracks (judged width and length)
tr = sorted([sv(X, ue, p)[1] for l in OSM["stations"][st]["lines"] if l["k"] == "rail" for p in l["pts"] if abs(sv(X, ue, p)[0]) < 40])
half = (max(tr) - min(tr)) / 2 if tr else 1.8
Lp, Wp = V(st, "ell_platform_len"), V(st, "ell_platform_w")
for nm, sgn in (("ELL_3_northbound", -1), ("ELL_4_southbound", 1)):
    t0 = sgn * (half + 1.6); t1 = sgn * (half + 1.6 + Wp)
    ve = (-ue[1], ue[0])
    ring = [(X[0] + ue[0]*s + ve[0]*t, X[1] + ue[1]*s + ve[1]*t) for s, t in ((-Lp/2, t0), (Lp/2, t0), (Lp/2, t1), (-Lp/2, t1))]
    o = prism("CW.platform." + nm, ring, EP - 1.0, EP)
    finish(o, st, "platform", "judged: side platforms outside the OSM tracks; length and width judged; level Wikipedia 11 m below ground", "sheet: ELL platforms 3 & 4 (central area), crossing above the Jubilee platforms", EP, {"length_m": Lp})
frame_view(b3(c[0], c[1], -6), 260, 22, -50)
print("ELL half track spacing", half)
