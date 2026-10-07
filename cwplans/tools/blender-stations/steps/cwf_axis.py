st = "canary-wharf"
_L = [l["pts"] for l in OSM["stations"][st]["lines"] if l["k"] == "subway" and len(l["pts"]) > 30 and l["pts"][0][0] > -20]
c, u = axis_fit([[p for p in _l if -20 <= p[0] <= 320] for _l in _L])
S0, S1 = -165.0, -165.0 + V(st, "box_length")
LV = lvmap(st); PL = V(st, "jl_platform"); H = V(st, "hall_floor"); M = V(st, "mezz_floor"); ST = V(st, "street")
