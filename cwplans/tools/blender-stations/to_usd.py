import json, re, sys
from pxr import Usd, UsdGeom, Sdf, Gf, Vt
d = json.load(open(sys.argv[1])); out = sys.argv[2]
stage = Usd.Stage.CreateNew(out)
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z); UsdGeom.SetStageMetersPerUnit(stage, 1.0)
root = UsdGeom.Xform.Define(stage, "/Stations"); stage.SetDefaultPrim(root.GetPrim())
root.GetPrim().SetCustomData({k: v for k, v in d["scene"].items() if k != "blendermcp_server_running"})
safe = lambda s: re.sub(r"[^A-Za-z0-9_]", "_", s)
for m in d["meshes"]:
    path = f"/Stations/{safe(m['collection'])}/{safe(m['name'])}"
    UsdGeom.Xform.Define(stage, f"/Stations/{safe(m['collection'])}")
    g = UsdGeom.Mesh.Define(stage, path)
    g.CreatePointsAttr(Vt.Vec3fArray([Gf.Vec3f(*p) for p in m["points"]]))
    g.CreateFaceVertexCountsAttr(Vt.IntArray(m["counts"])); g.CreateFaceVertexIndicesAttr(Vt.IntArray(m["idx"]))
    g.CreateDisplayColorAttr(Vt.Vec3fArray([Gf.Vec3f(*m["color"][:3])])); g.CreateDisplayOpacityAttr(Vt.FloatArray([m["color"][3]]))
    g.CreateSubdivisionSchemeAttr("none")
    g.GetPrim().SetCustomData({k: v for k, v in m["props"].items()})
stage.GetRootLayer().Save(); print("usd prims", len(d["meshes"]))
