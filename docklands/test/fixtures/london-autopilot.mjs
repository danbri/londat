// Explicit, unchecked cinematic test route. WGS84 and model height datum (ODN here).
// This is not a road route or a navigation/obstacle-clearance guarantee.
export const LONDON_AUTOPILOT_JOURNEY = {
  name: 'London Bridge via HMS Belfast and the Tower to Canary Wharf',
  start: { lon: -.0865, lat: 51.5072, height_m: 35 },
  destination: { lon: -.0212, lat: 51.505, height_m: 150 },
  via: [
    { name: 'HMS Belfast flyby', lon: -.081389, lat: 51.5075, height_m: 25,
      gaze: { lon: -.081389, lat: 51.506667, height_m: 15 } },
    { name: 'Tower of London flyby', lon: -.0758, lat: 51.507, height_m: 35,
      gaze: { lon: -.0761, lat: 51.5081, height_m: 30 } },
    { name: 'Wapping reach', lon: -.060, lat: 51.503, height_m: 45 },
    { name: 'Limehouse reach', lon: -.037, lat: 51.504, height_m: 65 },
  ],
  config: { speed_m_s: 18, max_acceleration_m_s2: 4, max_jerk_m_s3: 8,
    mass_kg: 1, drag_per_s: .2, arrival_radius_m: 3,
    gaze_turn_deg_s: 45, gaze_distance_m: 100 },
};
