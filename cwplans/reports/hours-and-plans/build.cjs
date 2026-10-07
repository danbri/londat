// The deep-dive report on site search, opening hours by mall and mall plans (2026-10-06).
const fs = require('fs'), path = require('path');
// Builds reports/hours-and-plans/index.html from template.html and the committed JSON files; no network.
//   node cwplans/reports/hours-and-plans/build.cjs
// Skill: cwplans-web-harvest, "Reports".
const here = __dirname, root = path.join(here, '..', '..', '..'), outFile = path.join(here, 'index.html');
const R = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const G = 'https://github.com/danbri/londat/blob/main/';
const probe = R('third_party/cwplans-structured-data/search/probe.json');
const hours = R('cwplans/registry/sources/web/hours-by-place.json');
const mall = R('cwplans/registry/sources/brands/mall-plan-evidence.json');
const cwgH = R('cwplans/registry/sources/brands/cwg-hours.json');
const pct = (a, b) => Math.round(100 * a / b) + '%';

// search
const sites = probe.sites, c = probe.meta.counts;
const wp = sites.filter(s => s.platform === 'wordpress ?s=').length;
const finder = sites.filter(s => /restaurants\/search|branch|store|locat/i.test(s.template || '')).map(s => s.site);
const hits = sites.filter(s => s.class === 'finds-branch').map(s => ({ site: s.site, template: s.template, new: (s.hits_new || []).length,
  example: (s.hits_new || [])[0] || (s.hits_harvested || [])[0] || null })).sort((a, b) => b.new - a.new);
const search = { counts: c, hits,
  kinds: [`${wp} of ${sites.length} are the WordPress site search (<code>?s={search_term_string}</code>), written by an SEO plugin for every WordPress site. They search posts and pages, not branches.`,
    `${sites.length - wp - 1} are shop or site search (<code>/search?q=</code>): products, menus, articles. One (${finder.join(', ') || 'none'}) points at a restaurant finder, and it answered 403.`,
    `${c['robots-disallowed']} sites disallow their search path in robots.txt (most large retailers: M&amp;S, Office, JD Sports, Hobbs, Space NK). ${c.blocked} answered 403 or a bot challenge; ${c['script-rendered']} draw results with script, so a plain fetch sees none.`],
  use: [`As a page finder, not a store finder: for ${c['finds-branch']} sites the place query found a Canary Wharf branch, location or menu page. ${probe.meta.hits_new} of the ${probe.meta.hits_new + probe.meta.hits_harvested} pages it found are not in the harvest yet.`,
    'As seeds for the next crawl: the new pages are listed per site in <code>search/probe.json</code> (<code>hits_new</code>). About a third are blog or news posts, not branch pages.',
    'Not for structured search of branches: no template takes a postcode or a location, and the results carry no branch markup (SearchResultsPage and BreadcrumbList only).',
    (() => { let more = 0, less = 0, eq = 0; for (const s of sites) { const r = s.results || [], a = r.find(x => x.query === 'Canary Wharf'), b = r.find(x => x.query === 'E14 5AB'); if (!a || !b || a.added_links == null || b.added_links == null) continue; if (b.added_links > a.added_links) more++; else if (b.added_links < a.added_links) less++; else eq++; }
      return `The postcode "E14 5AB" found fewer new links than "Canary Wharf" on ${less} sites, the same on ${eq} and more on ${more}: pages name the place in text, seldom the postcode.`; })()] };

// hours
const T = hours.tests;
const order = ['Cabot Place', 'Canada Place', 'Jubilee Place', 'Crossrail Place', 'One Canada Square', 'Canary Wharf estate, street level', 'Wood Wharf',
  ...[...new Set(hours.records.map(r => r.area))].filter(a => a.startsWith('postcode sector')).sort()];
const ag = hours.agreement;
const pcPure = hours.postcode_to_mall.filter(r => r.entries >= 3);
const pcMallOk = pcPure.filter(r => r.share >= .8 && ['Cabot Place', 'Canada Place', 'Jubilee Place', 'Crossrail Place', 'One Canada Square'].includes(r.mall));
const H = { records: hours.records.map(r => ({ name: r.name, source: r.source, area: r.area, kind: r.kind, level: r.level, opening_hours: r.opening_hours, grid: r.grid })),
  areaOrder: order, fine: hours.fine_kinds,
  tests: [
    { value: T.closes_weekday_by_mall_within_fine_kind.share_of_within_kind_variance * 100 | 0, label: `% of the spread in weekday closing time that the mall explains, inside one kind of place (p = ${T.closes_weekday_by_mall_within_fine_kind.p}, ${T.closes_weekday_by_mall_within_fine_kind.permutations} permutations)` },
    { value: T.hours_week_by_mall_within_fine_kind.share_of_within_kind_variance * 100 | 0, label: `% of the spread in hours per week that the mall explains (p = ${T.hours_week_by_mall_within_fine_kind.p}: not clear)` },
    { value: T.mall_vs_street_hours_week_within_fine_kind.share_of_within_kind_variance * 100 | 0, label: `% that "in a mall or at street level" explains (p = ${T.mall_vs_street_hours_week_within_fine_kind.p}): small` },
    { value: cwgH.counts.read + cwgH.counts['partly-read'], label: `CWG directory pages with an hours table read (of ${cwgH.entries.length}); ${cwgH.counts['coming-soon']} "coming soon", ${cwgH.counts['no-table']} with no table` }],
  agreeNote: `Same place, two sources, share of open half-hours in common. CWG and OSM: ${ag['cwg-osm'].pairs} pairs, ${ag['cwg-osm'].same} the same, median ${ag['cwg-osm'].median}. CWG and web: ${ag['cwg-web'].pairs}, ${ag['cwg-web'].same}, ${ag['cwg-web'].median}. OSM and web: ${ag['osm-web'].pairs}, ${ag['osm-web'].same}, ${ag['osm-web'].median}. Five sites publish exactly "Mo-Su 09:00-17:00" for places that open in the evening (fault F47).`,
  worst: ag.worst.slice(0, 10),
  pcNote: `Postcode units from the CWG list (${hours.postcode_to_mall.length} units). ${pcMallOk.length} units with 3 or more entries point at one mall in 80% or more of their entries, so a parsed postcode places a web branch in a mall. ${hours.counts.web_branches_with_postcode_and_hours} web branches have a parsed postcode and hours; ${hours.counts.in_zone} are in E14 or E16, ${hours.counts.placed_in_mall_by_postcode} of those get a CWG location from the postcode, ${hours.web_branches.filter(w => ['Cabot Place', 'Canada Place', 'Jubilee Place', 'Crossrail Place', 'One Canada Square'].includes(w.mall_by_postcode)).length} of them one of the five malls. Example: the two Nando's pages go to Jubilee Place (E14 5NY) and Cabot Place (E14 4QT).`,
  pc: pcPure.slice(0, 14) };

// plans
const S = mall.summary, names = Object.keys(mall.malls);
const plans = { malls: names.map(n => { const m = mall.malls[n]; return { name: n, ...S[n], unplaced: m.unplaced.length,
    points: m.placed_points.map(p => ({ name: p.name, level: p.level, cwg_level: p.cwg_level, osm_level: p.osm_level, osm_level_ref: p.osm_level_ref, osm_unit: p.osm_unit, xy: p.xy })),
    ways: m.ways.map(w => ({ level: w.level, level_ref: w.level_ref, xy: w.xy })) }; }) };
const tot = k => names.reduce((a, n) => a + S[n][k], 0);
plans.lede = `Partly. The CWG directory gives the mall and the level for ${tot('entries_with_level')} of ${tot('entries')} mall occupants, but no unit number and no position. OSM places ${tot('placed')} of them (${pct(tot('placed'), tot('entries'))}) as points, with a level for ${tot('placed_with_osm_level')}, and has ${tot('indoor_ways_with_level')} levelled footways and indoor ways around the malls. Together that is a draft plan per level: the corridors and about half of the shops as dots. There are no unit outlines.`;
plans.needs = [
  `Unit outlines: OSM has ${tot('placed_with_osm_unit')} unit numbers (<code>addr:unit</code>) and only 3 <code>indoor=room</code> ways in the whole area. Shop footprints are not mapped.`,
  `The other ${tot('entries') - tot('placed')} occupants: no OSM point with a matching name within 250 m. Many are newer than the OSM edits, or OSM uses another name.`,
  'The CWG maps page (<a href="https://canarywharf.com/maps/">canarywharf.com/maps</a>) is linked from every directory page. Its Internet Archive copy could not be fetched today: web.archive.org and Common Crawl reset every connection from this container. It may hold the mall plans as images or as data. Try again first.',
  'Levels: read <code>level:ref</code> before <code>level</code> (fault F48). With that rule, ' + tot('level_agree') + ' of ' + (tot('level_agree') + tot('level_disagree')) + ' placed occupants agree with the CWG level.',
  'A next step that needs no new source: snap each placed point to the nearest corridor on its level and order the shops along each corridor. That gives a schematic plan (which shop is next to which), not a measured one.'];

// findings
const findings = [
  `Site search is a page finder, not a branch finder. ${c['finds-branch']} of ${sites.length} sites returned a Canary Wharf branch, location or menu page for "Canary Wharf". ${probe.meta.hits_new} pages it found are not in the harvest. ${wp} templates are the WordPress default search; ${c['robots-disallowed']} sites forbid search in robots.txt.`,
  `Opening hours are now known for ${cwgH.counts.read + cwgH.counts['partly-read']} CWG directory occupants (new: read from the hours table on each archived page) plus ${hours.counts.by_source.osm} OSM and ${hours.counts.by_source.web} web places outside the CWG list.`,
  `Malls close earlier than the street. Within the same kind of place, the mall explains about ${T.closes_weekday_by_mall_within_fine_kind.share_of_within_kind_variance * 100 | 0}% of the spread in closing time (p = ${T.closes_weekday_by_mall_within_fine_kind.p}). Shops in Cabot Place and Canada Place close at 20:00, in Jubilee Place at 19:00. Restaurants in Canada Place close at 20:00; at street level, in Wood Wharf and in Crossrail Place, at 22:00 to 22:30.`,
  `Cafes in Cabot Place and Jubilee Place open at 07:00 and keep about 85 hours a week; in Canada Place they open at 08:30 and keep 66. Sunday opening is 88% to 96% for mall shops and 43% for street-level services.`,
  `Sources mostly agree on hours (median overlap 0.9 or more), but five sites publish the same "Mo-Su 09:00-17:00" for places that open in the evening (F47).`,
  `Mall plans: a draft per level is possible now (OSM corridors plus about half the shops as dots, levels checked against CWG). Unit outlines are not in any source we hold.`,
  'The Factoidal fault is wider than first reported: the BNODE() labels are not valid N-Quads, and parse() of that output also drops lines silently. Factoidal also renames the data\'s blank nodes per query, which broke the links between the branch and hours rewrites; the canonical layer is now skolemized and rebuilt. The issue text is below; it was not filed.'];

const files = [['probe.json', G + 'third_party/cwplans-structured-data/search/probe.json'], ['cwg-hours.json', G + 'cwplans/registry/sources/brands/cwg-hours.json'],
  ['hours-by-place.json', G + 'cwplans/registry/sources/web/hours-by-place.json'], ['mall-plan-evidence.json', G + 'cwplans/registry/sources/brands/mall-plan-evidence.json'],
  ['probe-site-search.mjs', G + 'cwplans/tools/probe-site-search.mjs'], ['hours-by-place.mjs', G + 'cwplans/tools/hours-by-place.mjs'], ['mall-plan-evidence.mjs', G + 'cwplans/tools/mall-plan-evidence.mjs']];
const issue = fs.readFileSync(path.join(root, 'cwplans/skills/cwplans-web-harvest/factoidal-issue-2026-10-06.md'), 'utf8');
const data = JSON.stringify({ findings, search, hours: H, plans, issue, files }).replace(/</g, '\\u003c');
const SKEL = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n</head>\n<body>\n';
fs.writeFileSync(outFile, SKEL + fs.readFileSync(path.join(here, 'template.html'), 'utf8').replace('/*DATA*/', () => data) + '\n</body>\n</html>\n');
console.log('wrote', outFile, fs.statSync(outFile).size, 'bytes');
