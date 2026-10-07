exec(open(WORK + "/steps/cw_axis.py").read())
pairs = [("01","02",PL,EP), ("03","04",PL,EP), ("05","06",EP,H), ("07","08",EP,H)]
lines = {"01":((-2028.9,826.7),(-2045.4,829.3)), "02":((-2029.6,822.3),(-2046.1,825.0)), "03":((-2094.2,836.8),(-2110.8,839.4)), "04":((-2094.9,832.4),(-2111.5,835.1)),
         "05":((-2114.9,810.2),(-2109.6,825.5)), "06":((-2112.7,809.5),(-2107.5,824.7)), "07":((-2061.0,826.4),(-2077.0,829.0)), "08":((-2060.0,832.4),(-2076.0,835.0))}
for a, b, y0, y1 in pairs:
    (a0, a1), (b0, b1) = lines[a], lines[b]
    m0 = ((a0[0]+b0[0])/2, (a0[1]+b0[1])/2); m1 = ((a1[0]+b1[0])/2, (a1[1]+b1[1])/2)
    o = flight(f"CW.escalator.{a}{b}_middle", m0, m1, y0, y1, 1.6)
    finish(o, st, "escalator", "judged: the sheet draws banks of three; OSM maps the two outer lines, so the third is placed between them", "sheet (bank of 3) + OSM pair", None,
           {"from_level_m_od": y0, "to_level_m_od": y1})
# lifts 1-4 (sheet); positions judged against OSM features
ex, ez = OSM["stations"][st]["pois"][0]["x"], 0
drum = bpy.data.objects["CW.canopy.glass_drum"]; dx, dz = drum["centre_x"], drum["centre_z"]
for nm, p, y0, y1, why in [
    ("lift_1", at(c, u, sv(c, u, (-2068.0, 830.0))[0], sv(c, u, (-2068.0, 830.0))[1]), PL, H, "sheet: Lift 1 mobility impaired passenger lift, JL platforms to the ticket hall, between the central escalator banks"),
    ("lift_2", (-2086.0, 846.0), EP, ST, "sheet: Lift 2, a tall shaft at the ticket hall central area near Exit 2, ELL level to the street"),
    ("lift_3", at(c, u, SM + 70, 9.0), PL, ST, "sheet: lift 3 with escape stair 3 at the Jubilee east end"),
    ("lift_4", (dx + 6.0, dz - 6.0), H, ST + 1.0, "sheet: Lift 4 mobility impaired lift in the drum, street to the ticket hall")]:
    o = obox("CW.lift." + nm, p, u, 2.6, 2.6, y0, y1)
    finish(o, st, "lift", "judged: position read from the sheet and fitted to OSM features; shaft size judged", why, y0, {"from_level_m_od": y0, "to_level_m_od": y1})
obs = stair_tower("CW.stair.escape_3", at(c, u, SM + 71, 2.0), u, PL, ST)
for o in obs: finish(o, st, "stair", "judged: sheet 'Escape stair 3' at the Jubilee platforms east end", "sheet", None)
for p in OSM["stations"][st]["pois"]:
    if p["kind"] == "entrance":
        nm = {"node/2450024729": "Exit_2_south", "node/2450024730": "Exit_3_north", "node/5466529278": "drum"}.get(p["osm"], p["osm"].replace("/", "_"))
        o = cyl("CW.entrance." + nm, (p["x"], p["z"]), 0.8, p["g"], p["g"] + 3.0, 12)
        finish(o, st, "entrance", "from OSM (entrance node, LiDAR ground); exit numbers matched to the sheet by compass (judged)", "OSM " + p["osm"], p["g"], {"osm": p["osm"]})
deg = math.degrees(math.atan2(-u[1], u[0]))
for nm, txt, s, t, y, sz in [("title", "CANADA WATER (Jubilee + Windrush lines)", 20, -20, ST + 14, 6),
                             ("hall", f"Ticket hall {H:+.1f} m OD", 0, 18, H + 1, 2.5),
                             ("ell", f"ELL platforms 3 & 4 {EP:+.1f}", -17, -20, EP + 1.5, 2.5),
                             ("jl", f"JL platforms 1 & 2 {PL:+.1f} (rail {V(st,'jl_rail'):+.1f})", 55, -13, PL + 1, 2.5),
                             ("drum", "glass drum 25 m", 2, 4, V(st, "drum_top") + 1.5, 2.5),
                             ("esc3", "Escape stair 3 / lift 3", SM + 70, -6, ST + 2, 2.2)]:
    o = label("CW.label." + nm, txt, at(c, u, s, t), y, sz, deg)
    finish(o, st, "label", "label", "text", y)
frame_view(b3(c[0], c[1], -3), 230, 18, -25)
