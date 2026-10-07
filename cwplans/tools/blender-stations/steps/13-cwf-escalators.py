exec(open(WORK + "/steps/cwf_axis.py").read())
W = 1.6   # escalator width with balustrades (judged)
SRC = "OSM highway=steps conveying, oriented by levels in data/indoor.js (bottom -> top)"
# ESC 1-9: platform (-3) -> ticket hall (-2); bottom, top from indoor.js
esc = [("ESC 1", (118.0,167.7),(75.8,161.0)), ("ESC 2", (118.7,159.5),(77.0,152.5)),
       ("ESC 3", (140.4,170.2),(113.5,166.3)), ("ESC 4", (141.1,162.8),(114.5,159.4)),
       ("ESC 5", (162.6,172.9),(137.6,168.5)), ("ESC 6", (163.8,166.6),(138.3,162.2)),
       ("ESC 7", (199.2,179.0),(166.1,173.5)), ("ESC 8", (200.5,172.1),(167.0,167.5)),
       ("ESC 9", (227.7,176.1),(194.2,171.5))]
for nm, a, b in esc:
    o = flight("CWF.escalator." + nm.replace(" ", ""), a, b, PL, H, W)
    finish(o, st, "escalator", "position and direction from OSM; numbering in pairs from the west (sheet: ESC 1,2 ... ESC 9 at the east end); rise from levels",
           SRC + "; sheet ESC 1-9", None, {"esc": nm, "from_level_m_od": PL, "to_level_m_od": H})
# ESC 10-14: ticket hall (-2) -> Plaza entrance (0). OSM maps 4 lines; the sheet numbers 5: five spread over the OSM span.
bots = [(25.0,140.9),(24.5,145.2),(23.7,150.6),(23.0,154.6)]; tops = [(0.0,137.7),(-0.7,141.9),(-1.4,147.4),(-2.1,151.3)]
for k in range(5):
    f = k / 4.0
    lerp = lambda A, B: (A[0][0] + (A[-1][0] - A[0][0]) * f, A[0][1] + (A[-1][1] - A[0][1]) * f)
    o = flight(f"CWF.escalator.ESC{10+k}", lerp(bots, None) if False else (bots[0][0]+(bots[-1][0]-bots[0][0])*f, bots[0][1]+(bots[-1][1]-bots[0][1])*f),
               (tops[0][0]+(tops[-1][0]-tops[0][0])*f, tops[0][1]+(tops[-1][1]-tops[0][1])*f), H, 6.9, W)
    finish(o, st, "escalator", "count from the sheet (ESC 10-14, five); span and direction from OSM (four lines); top at the LiDAR level of the OSM West Entrance (6.9 m OD)",
           SRC + "; sheet ESC 10-14", None, {"esc": f"ESC {10+k}", "from_level_m_od": H, "to_level_m_od": 6.9})
# ESC 15-17: ticket hall (-2) -> mezzanine (-1)
for nm, a, b in [("ESC 15",(148.0,164.0),(136.5,162.3)), ("ESC 16",(147.8,165.6),(136.2,163.7)), ("ESC 17",(147.3,168.8),(135.9,167.2))]:
    o = flight("CWF.escalator." + nm.replace(" ", ""), a, b, H, M, W)
    finish(o, st, "escalator", "from OSM (3 lines = sheet ESC 15-17); levels judged", SRC + "; sheet ESC 15-17", None, {"esc": nm, "from_level_m_od": H, "to_level_m_od": M})
# ESC 18, 19: mezzanine -> entrance B (OSM East Entrance, LiDAR 9.8 m OD); ESC 20 + public stair -> entrance B1 (OSM Fosterito Entrance, 9.7)
for nm, a, b, top in [("ESC 18",(122.5,165.7),(134.6,167.4),9.8), ("ESC 19",(123.2,159.9),(135.6,161.7),9.8), ("ESC 20",(170.6,176.3),(183.0,178.3),9.7)]:
    o = flight("CWF.escalator." + nm.replace(" ", ""), a, b, M, top, W)
    finish(o, st, "escalator", "from OSM; numbering from the sheet (ESC 16,19 label at B read as 18,19: judged); top at the LiDAR entrance level", SRC, None,
           {"esc": nm, "from_level_m_od": M, "to_level_m_od": top})
o = flight("CWF.stair.B1_public", (170.1,179.7), (182.9,181.5), M, 9.7, 2.0, riser=0.17, angle=33)
finish(o, st, "stair", "from OSM (highway=steps, levels -1 to 0); sheet: public stairs to mezzanine level at B1", "OSM steps", None, {"from_level_m_od": M, "to_level_m_od": 9.7})
frame_view(b3(*at(c, u, -20), H), 260, 28, -25)
print("escalators done")
