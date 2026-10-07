import os
OUT = WORK + "/out"
bpy.context.scene["deliverable"] = "stations.blend: Canada Water and Canary Wharf station boxes; see README.md"
bpy.ops.wm.save_as_mainfile(filepath=OUT + "/stations.blend", compress=True)
def select_coll(names):
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.data.objects:
        if any(c.name in names for c in o.users_collection) and o.type == "MESH": o.select_set(True)
res = {}
both = ("Canary Wharf", "Canada Water")
select_coll(both)
bpy.ops.export_scene.gltf(filepath=OUT + "/stations.glb", export_format="GLB", use_selection=True, export_extras=True, export_apply=True, export_yup=True)
for cn, fn in (("Canary Wharf", "canary-wharf"), ("Canada Water", "canada-water")):
    select_coll((cn,))
    bpy.ops.export_scene.gltf(filepath=f"{OUT}/{fn}.glb", export_format="GLB", use_selection=True, export_extras=True, export_apply=True, export_yup=True)
    bpy.ops.export_mesh.stl(filepath=f"{OUT}/{fn}.stl", use_selection=True, use_mesh_modifiers=True, ascii=False)
select_coll(both)
bpy.ops.wm.obj_export(filepath=OUT + "/stations.obj", export_selected_objects=True, apply_modifiers=True, export_materials=True, export_triangulated_mesh=False)
bpy.ops.export_scene.fbx(filepath=OUT + "/stations.fbx", use_selection=True, use_mesh_modifiers=True, use_custom_props=True, apply_unit_scale=True, apply_scale_options="FBX_SCALE_UNITS")
for f in sorted(os.listdir(OUT)): print(f, os.path.getsize(OUT + "/" + f))
