exec(open(WORK + "/steps/cwf_axis.py").read())
rail = V(st, "jl_rail"); n = 0
for l in OSM["stations"][st]["lines"]:
    if l["k"] != "subway": continue
    seg = [p for p in l["pts"] if S0 - 90 <= sv(c, u, p)[0] <= S0 + 2 and abs(sv(c, u, p)[1]) < 25]
    if len(seg) < 2: continue
    n += 1; seg.sort(key=lambda p: sv(c, u, p)[0])
    t = tube_path(f"CWF.tunnel.west.{n}", [(p[0], p[1], rail + 2.0) for p in seg], 4.35 / 2)
    finish(t, st, "tunnel", "plan from OSM; level held at the TfL rail level (judged)", "OSM tunnel chain west of the box (crossover); JLE tunnel diameter 4.35 m", rail)
for f in osm(st, kind="platform"):
    nm = "CWF.platform." + ("EB_2" if "Eastbound" in f["name"] else "WB_1")
    o = prism(nm, f["pts"], PL - 1.0, PL)
    finish(o, st, "platform", "plan from OSM (way/168226385, way/168226386); level = TfL rail level + 1.0 m (judged)", "OSM " + f["name"] + ", level -3", PL,
           {"osm_name": f["name"], "length_m": 174.9})
frame_view(b3(*at(c, u, 0), PL), 300, 25, -20)
print("west tunnels", n)
