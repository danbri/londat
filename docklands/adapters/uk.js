// The UK locale adapter of the Three.js port (docklands/): everything locale-specific that the page API (api.js), the
// view description (describe.js) and the text view (textview.js) need, in one place (OKRS.md "Architecture rules" 1 and
// 3: the core speaks WGS84 longitude and latitude, metres and ISO times; the British National Grid model frame, ODN
// heights and the London time zone stay here). Pure: no DOM, no three.js, so Node (tools/view-mcp) imports it too.
// Model frame: x = E - 537550, z = -(N - 180300) (north is -z), y = metres above ODN. WGS84 to model metres is the data's
// own quadratic fit (area.js meta.geo, max error 0.03 m in the box); the inverse is by Newton steps.
// Skill: docklands-3d-page, "Three.js port: page API, WebMCP and non-visual access (2026-10-11)".
export function ukAdapter(A) {
  const G = A.meta.geo, E = A.meta.extent;
  const fromLonLat = (lon, lat) => { const a = lon - G.lon0, b = lat - G.lat0, t = [1, a, b, a * b, a * a, b * b]; return [t.reduce((s, v, i) => s + v * G.x[i], 0), t.reduce((s, v, i) => s + v * G.z[i], 0)]; };
  function toLonLat(x, z) {
    let lon = G.lon0 + 0.075, lat = G.lat0 + 0.03;
    for (let k = 0; k < 8; k++) {
      const [x0, z0] = fromLonLat(lon, lat), [x1, z1] = fromLonLat(lon + 1e-5, lat), [x2, z2] = fromLonLat(lon, lat + 1e-5);
      const a = (x1 - x0) / 1e-5, b = (x2 - x0) / 1e-5, c = (z1 - z0) / 1e-5, d = (z2 - z0) / 1e-5, det = a * d - b * c, ex = x - x0, ez = z - z0;
      lon += (d * ex - b * ez) / det; lat += (-c * ex + a * ez) / det;
    }
    return [lon, lat];
  }
  return {
    id: 'uk', name: 'United Kingdom (Docklands model box)',
    timeZone: 'Europe/London',
    heightDatum: 'ODN (Ordnance Datum Newlyn, about mean sea level)',
    // names the data has no polygon name for: unnamed tidal water in this box is the tidal Thames
    tidalWaterName: 'River Thames',
    // the model box in WGS84 (west, south, east, north)
    bbox: (() => { const c = [toLonLat(E.x0, E.z1), toLonLat(E.x1, E.z0)]; return [c[0][0], c[0][1], c[1][0], c[1][1]]; })(),
    inBox: (x, z, m = 0) => x >= E.x0 - m && x <= E.x1 + m && z >= E.z0 - m && z <= E.z1 + m,
    fromLonLat, toLonLat,
  };
}
