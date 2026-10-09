// One Canada Square's halo (the lit band at the foot of the pyramid) in the colour of the page clock's evening, for the
// Three.js port (docklands/): index.html CROWN, crownFor, crownNow with the same rules. The evening is the London date of
// the clock minus 6 hours (01:00 belongs to the night before). A One Canada Square campaign whose dates include it
// (month-only dates cover the month; `days` limits it to those days), else a dated observation (one with a hex first;
// "pyramid faces" in what_lit lights the faces, "faces dark" or "not lit" does not), else a neutral warm white, "not
// known". Off: the old drawn pink-red with lit faces. Data: ../cwplans/registry/sources/lighting/crown-lighting.json
// (skill cwplans-crown-lighting), loaded once. Sets U.crown (sRGB values; the material converts), U.crownOn, U.crownPyr.
// The white apex light is another system (layers/nightlights.js). Skill: docklands-3d-page, "Crown halo by date".
const NEUTRAL = [.62, .58, .52], OLD = [.95, .30, .40];
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
export const eveningOf = t => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t - 6 * 3600e3));

export function crownFor(D, day) {
  const pad = (d, end) => d.length === 7 ? d + (end ? '-31' : '-01') : d;
  if (!D) return { c: NEUTRAL, pyr: false, lit: true, kind: 'unknown', text: 'not known (the lighting record has not loaded)' };
  const camp = D.campaigns.find(c => c.building === 'cwb-0413' && pad(c.from) <= day && day <= pad(c.to || c.from, true) && (!c.days || c.days.includes(day)));
  if (camp) return { c: camp.hex ? hexRgb(camp.hex) : NEUTRAL, pyr: false, lit: true, kind: 'campaign', text: `campaign: ${camp.reason} (${camp.colour}${camp.hex ? `, ${camp.hex} ${camp.hex_kind || ''}`.trimEnd() : '; colour not given, drawn neutral'}${camp.hours ? ', ' + camp.hours : ''})` };
  const obs = D.observations.filter(o => o.building === 'cwb-0413' && o.date === day).sort((a, b) => !!b.hex - !!a.hex)[0];
  if (obs) { const dark = !obs.hex && /not lit/i.test(obs.colour), photo = /photo/i.test(obs.evidence_kind || '');
    return { c: dark ? [0, 0, 0] : obs.hex ? hexRgb(obs.hex) : NEUTRAL, pyr: !dark && /pyramid faces/i.test(obs.what_lit) && !/faces dark/i.test(obs.what_lit), lit: !dark, kind: 'observed',
      text: `${photo ? 'observed in photo' : `observed (${obs.evidence_kind})`}: ${obs.colour}${obs.hex ? ' ' + obs.hex : ''}; ${obs.what_lit}${obs.time ? '; ' + obs.time : ''}` }; }
  return { c: NEUTRAL, pyr: false, lit: true, kind: 'unknown', text: 'not known: no campaign or dated observation for this evening (no public schedule exists); drawn a neutral warm white' };
}

// ctx: the page context of main.js (U, WEBGL, loadJSON, onFrame, clock, draw). Returns { cur, text(), setOn(on) }.
export function initCrown(ctx) {
  const S = { on: true, data: null, key: '', cur: null, onChange: null };
  ctx.loadJSON(ctx.WEBGL.replace(/docklands\/$/, '') + 'registry/sources/lighting/crown-lighting.json').then(d => { S.data = d; S.key = ''; update(); }).catch(e => console.warn('crown-lighting.json', e));
  function update() {
    const day = S.on ? eveningOf(ctx.clock) : '', key = S.on ? day + (S.data ? '+' : '-') : 'off'; if (key === S.key) return; S.key = key;
    S.cur = S.on ? { ...crownFor(S.data, day), day } : { c: OLD, pyr: true, lit: true, kind: 'off', day: '', text: 'colour by date is off: the drawn pink-red' };
    ctx.U.crown.value.setRGB(...S.cur.c); ctx.U.crownOn.value = S.cur.lit ? 1 : 0; ctx.U.crownPyr.value = S.cur.pyr ? 1 : 0;
    if (S.onChange) S.onChange(S.cur); ctx.draw();
  }
  ctx.onFrame(update);
  update();
  return { get cur() { return S.cur; }, text: () => S.cur.day ? `evening of ${S.cur.day}: ${S.cur.text}` : S.cur.text, setOn(on) { S.on = !!on; update(); }, set onChange(f) { S.onChange = f; if (f && S.cur) f(S.cur); } };
}
