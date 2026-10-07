exec(open(WORK + "/steps/cw_axis.py").read())
feats = OSM["stations"][st]["indoor"]
def touching(pt, me):
    out = set()
    for f in feats:
        if f is me: continue
        for q in (f["pts"] if f["closed"] else (f["pts"][0], f["pts"][-1])):
            if math.hypot(q[0] - pt[0], q[1] - pt[1]) < 0.4: out.update(f["lv"])
    return out
log = []; esc_n = 0; st_n = 0
steps = [f for f in feats if f["kind"] == "steps" and len(f["lv"]) == 2]
for f in steps:
    a, b = f["lv"]; p0, p1 = f["pts"][0], f["pts"][-1]
    t0, t1 = touching(p0, f), touching(p1, f)
    if (a in t1 and b not in t1) or (b in t0 and a not in t0): p0, p1 = p1, p0; how = "adjacency"
    elif (a in t0) or (b in t1): how = "adjacency"
    else: how = "unresolved: first point taken as lower"
    lo, hi = min(a, b), max(a, b)
    if (a > b) != False and how.startswith("adjacency") and a > b: pass
    y0, y1 = LV(lo), LV(hi)
    D = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    is_esc = D > 12 and float(lo).is_integer() and float(hi).is_integer()
    if is_esc:
        # sheet: banks of three; OSM maps two lines per bank, so a pair gets a third escalator between (added once per pair)
        esc_n += 1
        o = flight(f"CW.escalator.{esc_n:02d}", p0, p1, y0, y1, 1.6)
        finish(o, st, "escalator", "position, length and direction from OSM (direction by the levels of adjoining ways); rise from the chosen levels",
               "OSM highway=steps (escalator) levels %s" % f["lv"], None, {"from_level_m_od": y0, "to_level_m_od": y1, "orientation": how})
    else:
        st_n += 1
        ang = max(15.0, min(38.0, math.degrees(math.atan2(y1 - y0, max(D - 0.4, 0.5)))))
        o = flight(f"CW.stair.{st_n:02d}", p0, p1, y0, y1, 2.0, riser=0.17, landing=0.2, angle=ang)
        finish(o, st, "stair", "plan from OSM; rise from the chosen levels (OSM fractional levels interpolated)", "OSM highway=steps levels %s" % f["lv"], None,
               {"from_level_m_od": round(y0, 2), "to_level_m_od": round(y1, 2), "orientation": how})
    log.append((o.name, f["lv"], how, [round(x, 1) for x in p0], [round(x, 1) for x in p1]))
# third escalator of each OSM pair (sheet: banks of three)
escs = [o for o in bpy.data.objects if o.name.startswith("CW.escalator.")]
print(len(escs), "escalators,", st_n, "stairs")
for r in log: print(r)
frame_view(b3(c[0], c[1], -3), 120, 20, -30)
