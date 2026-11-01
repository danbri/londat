import assert from 'node:assert/strict';
const packages=process.argv[2];if(!packages)throw Error('Pass directory containing factoidal-old and factoidal-new aliases');
const nq=`<urn:place:a> <https://schema.org/openingHoursSpecification> <urn:hours:a> <urn:part:1> .
<urn:hours:a> <https://schema.org/opens> "09:00" <urn:part:2> .
<urn:place:b> <https://schema.org/openingHoursSpecification> <urn:hours:b> <urn:part:1> .
<urn:hours:b> <https://schema.org/opens> "10:00" <urn:part:1> .`;
for(const alias of ['factoidal-old','factoidal-new']){
const {parse}=await import(packages+'/'+alias+'/index.mjs');const d=await parse(nq,{format:'nquads'});
const prefix='PREFIX s:<https://schema.org/> ';
const queries={sameGraph:'SELECT ?place ?opens WHERE { GRAPH ?g { ?place s:openingHoursSpecification ?hours . ?hours s:opens ?opens } }',splitGraphs:'SELECT ?place ?opens WHERE { GRAPH ?g1 { ?place s:openingHoursSpecification ?hours } GRAPH ?g2 { ?hours s:opens ?opens } }',defaultGraph:'SELECT * WHERE { ?s ?p ?o }'};
const results={};for(const [name,q] of Object.entries(queries)){const rows=await d.query(prefix+q);results[name]=rows.map(r=>Object.fromEntries([...r].map(([k,v])=>[k,v.value])));}
assert.equal(results.sameGraph.length,1);assert.equal(results.splitGraphs.length,2);assert.equal(results.defaultGraph.length,0);console.log(JSON.stringify({alias,results}));}
