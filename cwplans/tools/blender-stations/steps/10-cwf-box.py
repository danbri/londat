st = "canary-wharf"
L = [l["pts"] for l in OSM["stations"][st]["lines"] if l["k"] == "subway" and len(l["pts"]) > 30 and l["pts"][0][0] > -20]
c, u = axis_fit([[p for p in l if -20 <= p[0] <= 320] for l in L])
S0, S1 = -165.0, -165.0 + V(st, "box_length")
top = V(st, "box_top"); base = top - V(st, "box_depth")
o = obox("CWF.box.station", c, u, 0, V(st, "box_width"), base, top, S0, S1)
finish(o, st, "box", "published size; placed along the OSM track axis with the west end 4 m beyond the OSM Plaza canopy (judged)",
       "architect: 313.85 m long, 35 m wide, 27 m deep; axis = OSM Jubilee line tracks", base, {"top_m_od": top})
g = prism("CWF.ground.street_reference", rect(c, u, 0, 140, S0 - 40, S1 + 40), V(st, "street") - 0.05, V(st, "street"))
finish(g, st, "ground", "sheet depth (23.0 m below street) + TfL rail level", "street reference plane at 8.4 m OD", V(st, "street"))
rail = V(st, "jl_rail")
for i, l in enumerate(L):
    name = ["EB", "WB"][i] if sv(c, u, l[len(l)//2])[1] < 0 else ["WB", "EB"][i]
    inside = clip_s(l, c, u, S0, S1)
    tk = tube_path(f"CWF.track.{i+1}", [(p[0], p[1], rail + 0.1) for p in inside], 0.75, segs=4)
    finish(tk, st, "track", "plan from OSM; level TfL FOI rail level", "OSM railway=subway Jubilee Line (tunnel), clipped to the box", rail)
    west = [p for p in l if S0 - 90 <= sv(c, u, p)[0] <= S0 + 1]
    east = [p for p in l if S1 - 1 <= sv(c, u, p)[0] <= S1 + 90]
    for side, seg in (("west", west), ("east", east)):
        if len(seg) < 2: continue
        seg.sort(key=lambda p: sv(c, u, p)[0])
        t = tube_path(f"CWF.tunnel.{i+1}.{side}", [(p[0], p[1], rail + 2.0) for p in seg], 4.35 / 2)
        finish(t, st, "tunnel", "plan from OSM; level held at the TfL rail level near the station (judged)", "OSM tunnel chain; JLE running tunnel diameter 4.35 m (Wikipedia)", rail)
frame_view(b3(*at(c, u, -10), -2), 430, 32, -28)
print("box", round(S0,1), round(S1,1), "c", c, "u", u)
