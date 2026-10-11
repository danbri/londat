// The region the port shows (OKR O1). Today always the Docklands; a later step chooses it from the URL (?region=) or the
// place in view. Code of the port takes the place's time zone, origin and adapters from here, never from a literal.
import { region } from './region.js';
import docklands from './regions/docklands.js';
export const REGION = region(docklands);
export const TZ = REGION.timeZone;   // IANA time zone of the page clock ('Europe/London' for the Docklands)
