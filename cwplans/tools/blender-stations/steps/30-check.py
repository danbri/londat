import collections
for cn in ("Canary Wharf", "Canada Water"):
    co = bpy.data.collections[cn]; cnt = collections.Counter(o["element_class"] for o in co.objects)
    miss = [o.name for o in co.objects if "uncertainty" not in o]
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in co.objects if o.type == "MESH")
    print(cn, len(co.objects), dict(cnt), "missing unc", miss, "tris", tris)
    for o in co.objects:
        if o["element_class"] in ("box", "platform", "canopy") :
            print("  ", o.name, [round(x, 1) for x in o.dimensions], o.get("level_m_od"))
stray = [o.name for o in bpy.data.objects if not any(c.name in ("Canary Wharf", "Canada Water") for c in o.users_collection)]
print("stray", stray)
