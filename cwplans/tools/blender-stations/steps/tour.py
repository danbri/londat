import os
VIEWS = {
 "cwf-overview": ("canary-wharf", 0, -3, 330, 22, -30), "cwf-west-plaza": ("canary-wharf", -135, -2, 90, 18, -50),
 "cwf-escalators": ("canary-wharf", -10, -8, 120, 12, -20), "cwf-east-B-B1": ("canary-wharf", 0, 2, 110, 25, 30),
 "cwf-below": ("canary-wharf", -10, -8, 260, -12, -25),
 "cw-overview": ("canada-water", 0, -3, 230, 25, -35), "cw-crossing": ("canada-water", -17, -6, 90, 14, -60),
 "cw-drum": ("canada-water", 2, 4, 75, 28, 20), "cw-below": ("canada-water", 0, -5, 200, -15, -40),
}
name = os.environ.get("TOUR_VIEW") or TOUR_VIEW
stn, s, y, d, el, az = VIEWS[name]
if stn == "canary-wharf":
    exec(open(WORK + "/steps/cwf_axis.py").read()); p = at(c, u, s)
else:
    exec(open(WORK + "/steps/cw_axis.py").read()); p = at(c, u, s)
frame_view(b3(p[0], p[1], y), d, el, az)
for win in bpy.context.window_manager.windows:
    for area in win.screen.areas:
        if area.type == "VIEW_3D":
            sp = area.spaces[0]; sp.shading.background_type = "VIEWPORT"; sp.shading.background_color = (0.80, 0.82, 0.85)
            sp.overlay.show_overlays = True
