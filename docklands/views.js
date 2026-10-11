// The named views of the Three.js port (Menu > Views > Places and Photo views, ?view=, the share hash vw=): the WebGL page's
// camera (target tx, ty, tz in model metres, yaw, pitch, dist; eye = target + dist (sin yaw cos pitch, sin pitch, cos yaw
// cos pitch)). Moved out of main.js on 2026-10-11 so that the text view (textview.js) and Node tools can read them without
// three.js. Labels: the names a person or an agent sees (api.js listViews). Skill: docklands-3d-page, "Three.js port".
export const VIEWS = {
  area: { tx: -1400, ty: 0, tz: 800, yaw: .35, pitch: .62, dist: 8200 },
  cw: { tx: 50, ty: 0, tz: 40, yaw: .7, pitch: .5, dist: 1500 },
  under: { tx: 40, ty: -10, tz: 20, yaw: .75, pitch: .42, dist: 750 },
  plan: { tx: -1400, ty: 0, tz: 800, yaw: 0, pitch: 1.55, dist: 9500 },
  // more places (owner, 2026-10-09: "under Places add a few other interesting camera positions"); BNG to model frame
  towerbridge: { tx: -3900, ty: 0, tz: 40, yaw: 2.2, pitch: .42, dist: 700 },      // Tower Bridge, E 533650 N 180260
  limehouse: { tx: -1150, ty: 0, tz: -600, yaw: 1.3, pitch: .55, dist: 650 },      // Limehouse Basin, E 536400 N 180900
  canadawater: { tx: -2250, ty: 0, tz: 700, yaw: -.6, pitch: .5, dist: 800 },      // Canada Water and Surrey Docks, E 535300 N 179600
  mudchute: { tx: 750, ty: 0, tz: 1600, yaw: .2, pitch: .45, dist: 700 },         // Mudchute Park and Farm, E 538300 N 178700
  greenwich: { tx: 750, ty: 0, tz: 2600, yaw: 3.0, pitch: .4, dist: 900 },         // Cutty Sark and the Old Royal Naval College, E 538300 N 177700
  o2: { tx: 1750, ty: 0, tz: 0, yaw: -.9, pitch: .45, dist: 1100 },                // the O2 and Blackwall, E 539300 N 180300
  rotherhithe: eyeView([-896, 6.9, 1150], 43.3, -1, 42),
  greenland: eyeView([-825, 5.3, 1160], 39.7, 3.5, 44),
  pier: eyeView([-740, 6, 140], 83.6, 11, 69),
  greenlandday: { ...eyeView([-830, 4.5, 1158], 51.9, 6.45, 99.9), night: false },
  plane: { ...eyeView([211, 802, -845], 223.84, -13.56, 56.9), roll: 9.18, night: false },
  // the owner's CC0 photo of 2026-10-11 12:45 BST from the west end wall of Greenland Dock (data/images/contrib/greenlanddock/);
  // solved with tools/view-mcp (focal fixed at 1785 px, the iPhone main lens): rms 13.5 px over 12 observations
  greenlanddock: { ...eyeView([-1679.2, 6.5, 1234.1], 85.65, -0.61, 71.6), roll: -1.59, night: false },
};
export function eyeView(E, az, lp, hfov, D = 1200) {   // index.html eyeView: a photo's camera, orbiting a point 1.2 km along the line of sight
  const a = az * Math.PI / 180, p = lp * Math.PI / 180;
  return { tx: E[0] + D * Math.sin(a) * Math.cos(p), ty: E[1] + D * Math.sin(p), tz: E[2] - D * Math.cos(a) * Math.cos(p), yaw: -a, pitch: -p, dist: D, hfov: hfov * Math.PI / 180, night: true };
}

export const VIEW_LABELS = { cw: 'Canary Wharf', area: 'Whole area', under: 'Underground', plan: 'Plan', towerbridge: 'Tower Bridge', limehouse: 'Limehouse Basin',
  canadawater: 'Canada Water', mudchute: 'Mudchute', greenwich: 'Greenwich', o2: 'The O2', rotherhithe: 'Rotherhithe, night (photo)', greenland: 'Greenland Pier, night (photo)',
  pier: 'Canary Wharf Pier, night (photo)', greenlandday: 'Greenland, day (photo)', plane: 'From a plane (photo)', greenlanddock: 'Greenland Dock, day (photo)' };
