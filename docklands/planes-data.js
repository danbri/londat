// Procedure and traffic parameters for the simulated aircraft of the Three.js port (docklands/layers/planes.js).
// Facts only, no charts or tables copied. NO LIVE AIRCRAFT: every ADS-B source is non-commercial, restricted or ODbL
// (skills docklands-sky "Aircraft" and cwplans-live-state "Helicopters"); this traffic is a SIMULATION on published
// procedures with an assumed hourly pattern, not a timetable and not a record of real flights.
// Sources (read 2026-10-09):
//  [AIP-EGLC] UK AIP, EGLC AD 2 (London City), AIRAC 2024-03-21, aurora.nats.co.uk eAIP (Crown copyright / NATS: facts
//    only; the later issues answer 404 from the container, as the cwplans-live-state skill says): AD 2.12 runway
//    thresholds and true bearings, AD 2.14 PAPI 5.5 degrees, AD 2.19 ILS glide path 5.5 degrees and reference datum
//    height 35 ft, AD 2.3 operational hours, AD 2.20 (fixed-wing only; standard missed approach altitude 2000 ft; all
//    SIDs stop at 3000 ft), AD 2.21 (climb straight ahead to at least 1000 ft above aerodrome level before turning;
//    visual approaches not below 1600 ft (RWY 09) and 1500 ft (RWY 27) until established on final).
//  [AIP-EGLL] UK AIP, EGLL AD 2.22 para 12 (helicopter route H4) and ENR 5.1 (EGR158, EGR159, EGR160), as extracted to
//    cwplans/feeds/live/helicopters.json by cwplans/tools/fetch-live.mjs (facts: points, heights).
//  [CAA] CAA airport data 2025, Table 19 (monthly air transport movements): London City 3,500 to 4,400 a month
//    (e.g. June 2025: 4,197; October 2025: 4,418), so about 140 a day on average, more on weekdays.
//  [DfT 2024] Government decision on the London City S73 appeal, August 2024: passenger cap 9 million, Saturday
//    afternoon extension (to 18:30) refused, so the Saturday 12:30 to Sunday 12:30 closure stays.
//  [LHR] Heathrow Airport, "Wind direction" (noise pages): westerly operations about 70 % of the year (arrivals over
//    London from the east), easterly about 30 % (switch when the easterly wind is over 5 kt). Heights of the arrival
//    streams over east London (about 4,000 to 7,000 ft) are an approximation from public descriptions, not from a chart.
//  [TYPES] Manufacturers' published dimensions (length, span, height) for the aircraft types below.
// Skills: docklands-3d-page ("Three.js port"), docklands-sky ("Aircraft"), cwplans-live-state ("Helicopters").

export const FT = 0.3048, KT = 0.514444;

// ---------- London City (EGLC): runway 09/27 [AIP-EGLC AD 2.12]
// THR 09: 51°30'20.05"N 0°02'39.47"E, true bearing 092.89°, elevation 19.4 ft; THR 27: 51°30'17.58"N 0°03'57.59"E,
// true bearing 272.91°, elevation 19.9 ft. Runway 1508 m x 30 m. Aerodrome elevation 6 m (cwplans lcy-approach.json).
const dms = (d, m, s) => d + m / 60 + s / 3600;
export const LCY = {
  thr09: { lat: dms(51, 30, 20.05), lon: dms(0, 2, 39.47), elev_ft: 19.4 },
  thr27: { lat: dms(51, 30, 17.58), lon: dms(0, 3, 57.59), elev_ft: 19.9 },
  length_m: 1508, width_m: 30,
  glide_deg: 5.5,           // [AIP-EGLC AD 2.14, 2.19]
  rdh_ft: 35,               // ILS reference datum height [AIP-EGLC AD 2.19]
  intercept_ft: 2000,       // simulated glide-path intercept height (the standard missed approach altitude is 2000 ft)
  turn_ft_aal: 1000,        // departures: straight ahead to at least 1000 ft AAL before turning [AIP-EGLC AD 2.21]
  sid_stop_ft: 3000,        // all SIDs stop at 3000 ft [AIP-EGLC AD 2.20]
  tdz_m: 475,               // touchdown zone end marked 475 to 477 m from the threshold [AIP-EGLC AD 2.20 para 6]
};

// Operational hours, London local time [AIP-EGLC AD 2.3 item 1: Mon-Fri 0630-2200, Sat 0630-1230, Sun 1230-2200,
// public holidays 0900-2200]; the ATC unit is open to 22:30 and delayed aircraft may use 30 minutes more (not
// simulated). Public holidays are not known to the simulation (it uses the weekday hours).
export const LCY_HOURS = { weekday: [6.5, 22], sat: [6.5, 12.5], sun: [12.5, 22] };

// Movements an hour (arrivals + departures), weekday, by London hour. ASSUMED shape (morning departure bank of the
// based fleet, evening arrival bank) scaled to about 160 movements a weekday [CAA]; weekends x0.75 in their open hours.
export const LCY_RATE = { 6: 8, 7: 15, 8: 15, 9: 12, 10: 9, 11: 8, 12: 8, 13: 8, 14: 8, 15: 9, 16: 10, 17: 13, 18: 13, 19: 11, 20: 9, 21: 7 };
// share of arrivals in each hour (the rest are departures): ASSUMED
export const LCY_ARR_SHARE = h => h < 9 ? 0.3 : h >= 17 ? 0.65 : 0.5;

// Typical London City fleet, by type, with an ASSUMED share. Public facts: BA CityFlyer (the largest operator) flies
// Embraer E190s; Swiss (Helvetic) A220-100 and E190-E2/E195-E2; Luxair Dash 8-400 and E195-E2; Aurigny ATR 72-600;
// KLM Cityhopper Embraer E-Jets. Liveries are airline-neutral: no airline is shown or implied.
// Dimensions (m) [TYPES]: L length, S span, H height, D fuselage diameter. vapp: final approach speed (kt), steep approach.
export const LCY_FLEET = [
  { type: 'Embraer E190', code: 'E190', share: 0.45, L: 36.2, S: 28.7, H: 10.6, D: 3.0, kind: 'jet', vapp: 125, vr: 130 },
  { type: 'Embraer E195-E2', code: 'E295', share: 0.12, L: 41.5, S: 35.1, H: 10.9, D: 3.0, kind: 'jet', vapp: 128, vr: 135 },
  { type: 'Airbus A220-100', code: 'BCS1', share: 0.13, L: 35.0, S: 35.1, H: 11.5, D: 3.7, kind: 'jet', vapp: 120, vr: 125 },
  { type: 'De Havilland Canada Dash 8-400', code: 'DH8D', share: 0.15, L: 32.8, S: 28.4, H: 8.3, D: 2.7, kind: 'turboprop', vapp: 120, vr: 115 },
  { type: 'ATR 72-600', code: 'AT76', share: 0.15, L: 27.2, S: 27.1, H: 7.65, D: 2.6, kind: 'turboprop', vapp: 110, vr: 105 },
];

// Heathrow arrival streams over east London [LHR]: lower detail. Rate: about 40 arrivals an hour; ASSUMED share
// passing over or near the model box. Heathrow is closed to scheduled movements roughly 23:30 to 04:30 (night quota);
// the first arrivals come from about 04:30.
export const LHR = {
  westerly: { name: 'Heathrow westerly operations: arrivals vectored towards the final approach (runways 27L/27R)', ft: [4000, 6000], hdg: [255, 285], kt: [190, 220] },
  easterly: { name: 'Heathrow easterly operations: arrivals on the westbound downwind leg (runways 09L/09R)', ft: [6000, 7000], hdg: [250, 270], kt: [210, 250] },
  easterly_wind_kt: 5,
  per_hour: h => (h >= 23.5 || h < 4.5) ? 0 : h < 6 ? 8 : 24,   // over the area (ASSUMED)
  fleet: [
    { type: 'Airbus A320neo', code: 'A20N', share: 0.35, L: 37.6, S: 35.8, H: 11.8, D: 3.95, kind: 'jet' },
    { type: 'Airbus A321neo', code: 'A21N', share: 0.15, L: 44.5, S: 35.8, H: 11.8, D: 3.95, kind: 'jet' },
    { type: 'Boeing 787-9', code: 'B789', share: 0.15, L: 62.8, S: 60.1, H: 17.0, D: 5.8, kind: 'wide' },
    { type: 'Boeing 777-300ER', code: 'B77W', share: 0.13, L: 73.9, S: 64.8, H: 18.5, D: 6.2, kind: 'wide' },
    { type: 'Airbus A350-1000', code: 'A35K', share: 0.12, L: 73.8, S: 64.75, H: 17.1, D: 6.0, kind: 'wide' },
    { type: 'Airbus A380-800', code: 'A388', share: 0.1, L: 72.7, S: 79.8, H: 24.1, D: 7.1, kind: 'wide4' },
  ],
};

// Helicopter route H4 [AIP-EGLL]: along the Thames; VFR max 2000 ft, suggested minimum 1000 ft, SVFR max 1500 ft;
// Isle-of-Dogs compulsory reporting point 51°29'02"N 0°00'42"W (north abeam Cutty Sark), London Bridge on request.
// The line between them follows the river (simulated waypoints on the river centre, not the 1:50 000 chart).
export const H4 = {
  ft: [1000, 1500], kt: [90, 120],
  iod: { lat: 51.483889, lon: -0.011667 },
  // river centre, west to east (simulated): the centroid of the tidal water within 350 m of a hand-picked point, from
  // the model's water polygons (area.js), checked inside the river; the last point is the AIP reporting point
  river: [[51.5080, -0.1000], [51.5078, -0.0876], [51.5056, -0.0755], [51.5028, -0.0650], [51.5063, -0.0489], [51.5084, -0.0392], [51.5054, -0.0307],
    [51.4995, -0.0290], [51.4936, -0.0285], [51.4872, -0.0224], [51.4847, -0.0140], [51.483889, -0.011667]],
  exit_se: [[51.4790, -0.0020], [51.4700, 0.0150]],   // leaving the CTR to the south-east, over Greenwich (simulated)
  per_hour: h => h >= 7 && h < 21 ? 2 : 0,   // ASSUMED (the CAA counts, CAP 1455, may not be reproduced)
  fleet: [
    { type: 'Leonardo AW169', code: 'A169', share: 0.4, L: 14.6, R: 12.1, H: 4.5, kind: 'heli' },
    { type: 'Airbus H145', code: 'EC45', share: 0.35, L: 13.6, R: 11.0, H: 4.0, kind: 'heli' },
    { type: 'Airbus H135', code: 'EC35', share: 0.25, L: 12.2, R: 10.2, H: 3.5, kind: 'heli' },
  ],
};

export const SOURCES = {
  lcy: 'UK AIP EGLC AD 2 (AIRAC 2024-03-21; Crown copyright / NATS, facts only): thresholds, 5.5° glide path, 35 ft reference height, 1000 ft AAL before turning, SIDs stop at 3000 ft, hours (AD 2.3)',
  lhr: 'Heathrow Airport noise pages (westerly about 70 %, easterly about 30 %); heights over east London approximate',
  h4: 'UK AIP EGLL AD 2.22 para 12, route H4 (facts: points and heights; line along the river simulated)',
  rate: 'CAA airport data 2025 (London City about 4,000 air transport movements a month); hourly shape assumed',
};
