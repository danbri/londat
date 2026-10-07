# Blender 4.0 from Debian is built without USD; dump evaluated meshes (world space, Z-up) for a pxr script outside Blender.
dg = bpy.context.evaluated_depsgraph_get(); out = []
for o in bpy.data.objects:
    if o.type != "MESH": continue
    e = o.evaluated_get(dg); me = e.to_mesh(); mw = o.matrix_world
    out.append({"name": o.name, "collection": o.users_collection[0].name, "cls": o["element_class"],
                "props": {k: (v if isinstance(v, (int, float, str)) else str(v)) for k, v in o.items()},
                "color": list(o.active_material.diffuse_color) if o.active_material else [0.5,0.5,0.5,1],
                "points": [list(mw @ v.co) for v in me.vertices], "counts": [len(p.vertices) for p in me.polygons],
                "idx": [i for p in me.polygons for i in p.vertices]})
    e.to_mesh_clear()
json.dump({"scene": {k: v for k, v in bpy.context.scene.items() if isinstance(v, (int, float, str))}, "meshes": out}, open(WORK + "/usd-dump.json", "w"))
print("dumped", len(out))
