// Fixed geographic windows for the recorded KGX benchmark, not runtime locale defaults.
const prefix='PREFIX geo:<http://www.opengis.net/ont/geosparql#> PREFIX geof:<http://www.opengis.net/def/function/geosparql/> ';
const box='"POLYGON((-0.03 51.5,-0.02 51.5,-0.02 51.51,-0.03 51.51,-0.03 51.5))"^^geo:wktLiteral';
const far='"POLYGON((13 52,14 52,14 53,13 53,13 52))"^^geo:wktLiteral';
export const spatialQueries=[['intersects-local','sfIntersects',box],['within-local','sfWithin',box],['intersects-miss','sfIntersects',far],['disjoint-control','sfDisjoint',box]].map(([name,fn,b])=>({name,sparql:prefix+`SELECT ?geometry WHERE { GRAPH ?g { ?geometry geo:asWKT ?wkt FILTER(geof:${fn}(?wkt,${b})) } }`}));
