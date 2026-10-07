bpy.ops.object.select_all(action="DESELECT")
for o in bpy.data.objects:
    if o.type == "MESH": o.select_set(True)
bpy.context.view_layer.objects.active = bpy.data.objects["CWF.box.station"]
bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
bpy.ops.object.select_all(action="DESELECT")
m = bpy.data.materials["M_label"]; m.diffuse_color = (0.08, 0.08, 0.1, 1); m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.08, 0.08, 0.1, 1)
exec(open(WORK + "/steps/cwf_axis.py").read())
pts = {"canary-wharf": [("CWF.origin.axis", at(c, u, 0), u, V("canary-wharf", "jl_platform"), "Jubilee line station axis (OSM tracks)")]}
exec(open(WORK + "/steps/cw_axis.py").read())
pts["canada-water"] = [("CW.origin.jubilee_axis", c, u, V(st, "jl_platform"), "Jubilee line axis (OSM tracks)"), ("CW.origin.ell_axis", X, ue, V(st, "ell_platform"), "East London line axis (OSM tracks), at the crossing")]
for stn, lst in pts.items():
    for nm, p, uu, y, desc in lst:
        replace(nm)
        e = bpy.data.objects.new(nm, None); e.empty_display_type = "ARROWS"; e.empty_display_size = 10
        e.location = b3(p[0], p[1], y); e.rotation_euler = (0, 0, math.atan2(-uu[1], uu[0]))
        bpy.context.scene.collection.objects.link(e)
        finish(e, stn, "label", "from OSM", desc, y, {"E_bng": round(E0 + p[0], 2), "N_bng": round(N0 - p[1], 2), "bearing_deg": round(math.degrees(math.atan2(uu[0], -uu[1])) % 360, 2)})
        print(nm, e["E_bng"], e["N_bng"], e["bearing_deg"])
for win in bpy.context.window_manager.windows:
    for area in win.screen.areas:
        if area.type == "VIEW_3D":
            sp = area.spaces[0]; sp.shading.background_type = "VIEWPORT"; sp.shading.background_color = (0.80, 0.82, 0.85)
            sp.shading.light = "STUDIO"; sp.shading.show_cavity = False
