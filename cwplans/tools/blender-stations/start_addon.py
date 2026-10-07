import bpy, addon_utils
addon_utils.enable("blender_mcp_addon", default_set=True, persistent=True)
print("MCP addon enabled:", addon_utils.check("blender_mcp_addon"))
