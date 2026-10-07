for ob in list(bpy.data.objects): bpy.data.objects.remove(ob, do_unlink=True)
sc = bpy.context.scene
sc.unit_settings.system = "METRIC"; sc.unit_settings.scale_length = 1.0
sc["frame"] = "Docklands 3D page model frame: Blender X = E - 537550, Y = N - 180300, Z = m OD (ODN). glTF export (+Y up) gives x = E - E0, y = m OD, z = -(N - N0)."
sc["E0"] = E0; sc["N0"] = N0; sc["crs"] = "EPSG:27700 + ODN heights"
for st in ("canary-wharf", "canada-water"): coll(st)
for c in CLASSES: mat(c)
frame_view(b3(100, 160, -3), 420, 30, -35)
print("setup ok", [c.name for c in bpy.data.collections])
