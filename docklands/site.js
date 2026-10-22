// The site of the view for the live layers of the Three.js port (wind, weather): which place's METAR, Open-Meteo point and
// water service apply (docklands/geo/services.js siteAt over the region configs; issue #12, KR1.5). DOM-free.
//   siteOf(view) -> site | null; view: { mode: 'model' } or { mode: 'globe', lon, lat, range } (GLOBE.orbit())
// main.js gives the layers ctx.site() (null until the globe has the view when the page starts away from the model).
// Skill: docklands-sky, "Live data of the place in view".
import { REGION } from './geo/current.js';
import { REGIONS } from './geo/regions/index.js';
import { siteAt } from './geo/services.js';
export const siteOf = view => siteAt(view, { regions: REGIONS, model: REGION });
export const MODEL_REGION = REGION;
