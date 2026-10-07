exec(open(WORK + "/steps/cwf_axis.py").read())
deg = math.degrees(math.atan2(-u[1], u[0]))
for nm, txt, s, t, y, sz in [("title", "CANARY WHARF (Jubilee line)", -5, -19, ST + 14, 7),
                             ("hall", "Ticket hall " + f"{H:+.1f} m OD", -100, -17, H + 1, 3),
                             ("mezz", "Mezzanine " + f"{M:+.1f}", -4, -11, M + 1, 2.5),
                             ("platforms", "JL platforms " + f"{PL:+.1f} (rail {V(st,'jl_rail'):+.1f})", 10, -17.5, PL + 1, 3),
                             ("A", "A  Plaza entrance (west)", -147, -16, 15, 3), ("B", "B  East / Fosterito", -28, -16, 15, 3),
                             ("B1", "B1  Fosterito Entrance (OSM)", 30, -10, 14, 3), ("D", "D  east stairs", 135, 2, ST + 2, 3),
                             ("esc1_9", "ESC 1-9", 0, -2, PL + 6, 2.5), ("esc10_14", "ESC 10-14", -142, 3, H + 7, 2.5)]:
    o = label("CWF.label." + nm, txt, at(c, u, s, t), y, sz, deg)
    finish(o, st, "label", "label", "text", y)
frame_view(b3(*at(c, u, -20), -2), 260, 12, -15)
