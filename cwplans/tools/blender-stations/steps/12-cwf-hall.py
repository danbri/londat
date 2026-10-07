exec(open(WORK + "/steps/cwf_axis.py").read())
for i, f in enumerate(osm(st, kind="area", lv=[-2])):
    o = prism(f"CWF.hall.floor_osm_{i+1}", f["pts"], H - 0.5, H)
    finish(o, st, "hall", "plan from OSM (level -2 area); level judged", "OSM indoor area at level -2 (ticket hall)", H)
h0 = -158.0; h1 = h0 + V(st, "hall_len")
o = obox("CWF.hall.volume", c, u, 0, V(st, "hall_width"), H, H + V(st, "hall_height"), h0, h1)
finish(o, st, "box", "published size (222.79 x 32.7 x 10.8 m); placed from the west end of the OSM hall to beyond the top of ESC 9 (judged)",
       "architect figures; sheet: ticket hall level west end to east end", H, {"length_m": 222.79, "width_m": 32.7, "height_m": 10.8})
# floor slab for the published hall beyond the OSM area
o = obox("CWF.hall.floor_published", c, u, 0, V(st, "hall_width") - 1, H - 0.4, H - 0.05, h0, h1)
finish(o, st, "hall", "published size, placement judged", "ticket hall floor (published length and width)", H)
# mezzanine: a gallery inside the double-height hall, reached by ESC 15-17, with ESC 18-20 and stairs to entrances B and B1
o = obox("CWF.mezzanine", c, u, 0, 20.0, M - 0.5, M, -32.0, 24.0)
finish(o, st, "hall", "judged extent around the OSM escalator ends (levels -1); level judged", "sheet: mezzanine level; OSM: escalators to level -1", M)
frame_view(b3(*at(c, u, -40), H), 300, 30, -30)
