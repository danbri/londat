st = "canada-water"
_lines = OSM["stations"][st]["lines"]
_J = [[p for p in l["pts"] if -2200 <= p[0] <= -1950] for l in _lines if l["k"] == "subway"]
c, u = axis_fit(_J)
_E = [[p for p in l["pts"] if abs(p[1] - 830) < 70] for l in _lines if l["k"] == "rail"]
ce, ue = axis_fit(_E)
# crossing of the ELL centreline with the JL axis
_v = (-u[1], u[0]); _den = ue[0] * _v[0] + ue[1] * _v[1]
_k = -((ce[0] - c[0]) * _v[0] + (ce[1] - c[1]) * _v[1]) / _den
X = (ce[0] + ue[0] * _k, ce[1] + ue[1] * _k)
_pl = [sv(c, u, p) for f in osm(st, kind="platform") for p in f["pts"]]
SM = (min(p[0] for p in _pl) + max(p[0] for p in _pl)) / 2      # mid of the OSM JL platforms along the axis
LV = lvmap(st); PL = V(st, "jl_platform"); EP = V(st, "ell_platform"); H = V(st, "hall_floor"); ST = V(st, "street")
