import json,subprocess,os,fnmatch,hashlib,gzip,csv,io,re
from pathlib import Path
from collections import Counter,defaultdict
import argparse,datetime
cli=argparse.ArgumentParser(description='Additive dataset catalogue; run from a clean Londat checkout. Does not edit existing datasets.')
cli.add_argument('--londat',type=Path,default=Path(__file__).resolve().parents[1]);cli.add_argument('--docklandia',type=Path,required=True);cli.add_argument('--output',type=Path,required=True);args=cli.parse_args()
R=args.londat.resolve();D=args.docklandia.resolve();O=args.output.resolve();O.mkdir(parents=True,exist_ok=True);DATE=datetime.date.today().isoformat()
reg=json.load(open(R/'cwplans/data-register.json')); index=json.load(open(R/'cwplans/docklands/data/places/index.json'))
# Ordered, mutually exclusive storage families; these are storage accounting, not independent source populations.
families=[]
def fam(i,name,repo,prefix,use,geo,time,change,serve,rights):
 families.append(dict(id=i,name=name,repo=repo,prefix=prefix,use=use,geo=geo,time=time,change=change,serve=serve,rights=rights))
for p in index['places']:
 u=p.get('tileBase','https://danbri.github.io/londat/cwplans/docklands/data/places/'+p['id']+'/'); repo='docklandia' if '/docklandia/' in u else 'londat'; prefix=u.split('/'+repo+'/')[-1]
 fam('place-'+p['id'],p['name'],repo,prefix,'Visual 3D tiles; features.json supports search, descriptions and building cards. Not automatically loaded into KGX.',p['name']+'; core, city and surroundings differ; see bounding boxes below.','Built '+str(p.get('built','not recorded'))+'; mixed source acquisition epochs, not a historical reconstruction.','Snapshot; manual tool rebuild. Upstream OSM changes continually; Overture uses dated releases.','Already optimized: 3D Tiles 1.1 / glTF quadtree, LOD, compact boxes; fetch visible tiles, retain feature IDs and attribution.','Mixed source terms; ODbL-derived buildings plus credited terrain/landcover/height sources. Check per-source terms and review notes.')
for i,n,p,g in [('world-base','Global terrain and base','world-base/','World'),('world','Global reference vectors','world/','World'),('world-detail','Global detail vectors and gazetteer','world-detail/','World'),('uk','UK skeleton','uk/','United Kingdom; OS layers Great Britain only; Census populations England and Wales only'),('es-nw','North-west Spain skeleton','es-nw/','North-west Spain'),('ba','Bosnia and Herzegovina skeleton','ba/','Bosnia and Herzegovina')]:
 fam(i,n,'londat','cwplans/docklands/data/'+p,'Globe terrain, map lines, labels and place cards; factual attributes available through readers, separate from KGX.',g,'Mixed epochs: terrain acquisition, land cover year, boundaries and gazetteer release differ.','Snapshot; rebuild with source manifests, no automatic refresh inferred.','Already partitioned spatially and by scale. Keep tiles/quantized vectors; avoid downloading country/world raw datasets at page startup.','Per-source terms: public domain, OGL, CC BY, Copernicus; regional OSM layers ODbL. No blanket grant.')
for args in [
 ('textures','Aerial imagery and facade texture atlases','cwplans/docklands/data/tex/','Visual ground and facade textures; metadata links source photos and credits.','Docklands and contributed Canada Water facades','Aerial RGB 2007–08; night 2012; intensity 2020; facade photo dates vary.','Snapshot; rebuild atlas when inputs change.','Prebuilt image atlases; load relevant resolution, keep per-tile credit metadata.','EA OGL imagery; CC BY photo tiles require author, licence and modification credit; CC0 contributed tiles separate.'),
 ('splats','Synthetic and trained splats','cwplans/docklands/data/splats/','Experimental visual rendering derived from the 3D model; not measured photogrammetry.','Canary Wharf estate and roughly 300 m surroundings','Derived from model snapshot and source imagery epochs.','Manual regeneration.','Large binary splats already gzip compressed; lazy load; keep grouping and source metadata.','Model and imagery source obligations survive conversion; rendering format does not establish a new licence.'),
 ('sky','Sky and environmental snapshots','cwplans/docklands/data/sky/','Visual sky, satellites, weather and time-dependent context.','Model/globe, source-dependent','Forecast/observation times and orbital epochs; not interchangeable with download time.','Source-dependent snapshots and live fetches.','Small cached snapshots; preserve observation/forecast/expiry times.','Per-source licence, credit and API terms; inspect register.'),
 ('model','Docklands core model and factual sidecars','cwplans/docklands/data/','Detailed 3D terrain, buildings, water, roads, rail, tunnels, indoor paths, trees and feature keys; cited factual layers.','Docklands, Thames corridor, Canary Wharf and Canada Water','Mixed LiDAR surveys, OSM snapshot, cited completion/occupancy dates and historical skyline samples.','Manual builds; underlying sources change at different rates.','Existing compact JS/JSON model; layer-on-demand and spatial partitioning merit profiling for growth.','OSM ODbL-derived geometry; OGL LiDAR and other sources; cited facts/review material; source-by-source obligations.'),
 ('registry','Building registry, occupants and source joins','cwplans/registry/','Factual entity layer and main KGX inputs: buildings, companies, premises, brands, heritage, construction, water, facades and website facts.','Dense Canary Wharf / E14, with source-specific wider searches','Active/closed records, dates, former occupants, dated crawls; missing validity dates do not mean current.','Snapshot rebuilds; businesses, construction and hours can change daily.','Small indexes and entity cards; keep stable IDs, join confidence and source dates. KGX handles cross-source queries.','Mixed OGL/CC0/ODbL/CC BY, source conditions and website scoping reviews. Geometry joins do not erase rights.'),
 ('lds','London Datastore catalogue and extracts','cwplans/feeds/london-datastore/','Catalogue discovery plus selected spatial/statistical factual overlays; not every catalogue hit is harvested.','London source datasets; extracts often clipped to project zone','Dataset-specific planning years, surveys, Census periods and snapshots.','Varies by publisher/dataset; catalogue discovery date differs from resource update date.','Bulk directories mostly served from raw GitHub, not Pages; four map overlays retained on Pages. Spatially clip/index larger layers.','Per-dataset OGL v2/v3, CC BY, ODC-By or stated conditions; portal membership is not a licence.'),
 ('portals','Other portal catalogues and extracts','cwplans/feeds/portals/','data.gov.uk, planning.data.gov.uk, borough, Nomis, ONS and national discovery plus selected factual/spatial extracts.','UK/national discovery; selected zone subsets; coverage varies by resource','Census, boundary and survey editions coexist; preserve represented period.','Varies; discovery is not evidence that a resource is current or downloaded.','Bulk directories use raw GitHub. Keep catalogue separate from extracted layers; use GeoPackages for GIS and indexed subsets for browser.','Record-level terms retained; do not assign OGL simply because a public portal lists a dataset.'),
 ('feeds','Live, river, works, events, underground and KML records','cwplans/feeds/','Visual overlays, time-series/live panels, events, alerts, underground source evidence and KML discovery/copies.','Primarily London/Docklands; discovery can extend further','Publication/event/validity/observation intervals; failures and stale records possible.','Source-specific live updates; committed snapshots require refresh; RSS discovery is not a complete event archive.','Cache normalized small responses, use TTLs and backoff, disclose stale observations; large KML spatially clip.','Mixed open licences, source API terms and scoping-only sources; each KML/event source keeps its status.'),
 ('cache','Hourly live history and GIS exports','cwplans/cache/','Normalized live snapshots/history plus GeoPackage exports of core, Datastore and portal layers.','Docklands/zone; source-dependent','Hourly run deltas, latest 24 h series, closed-month SQLite; exports are snapshots.','Hourly history workflow; latest rewritten each run; GIS exports rebuild separately.','Latest JSON for browser; SQLite/month and delta archives for analysis; GeoPackage indexed GIS. History excluded from Pages.','Mixed layers retain their own licences; AIS scoping review. Export container is not a blanket relicensing.'),
 ('postcodes','Postcode framework','cwplans/postcodes/','E14 postcode status, ward, coordinate, company/sales aggregates and discovery evidence; registry join framework.','E14 and Canary Wharf ward','ONSPD August 2026, introduced/terminated dates and source-specific aggregates.','ONSPD editions periodically; local outputs rebuilt manually.','Small JSON/CSV; retain stable postcode keys and geocoding uncertainty.','OGL with required ONS, OS and Royal Mail notices; OSM-derived streets/counts tracked separately.'),
 ('atlas','Atlas extracts','cwplans/atlas/data/','Joined factual/spatial browser index, derived from registry/model/other inputs.','Canary Wharf/Docklands','Snapshot with mixed input dates.','Rebuilt with inputs.','Index first, entity details on demand; avoid treating duplicated export bytes as extra observations.','Mixed source rights, ODbL-derived outlines and joined review sources.'),
 ('raw','Committed raw/source snapshots','cwplans/data/','Raw source extracts, station control facts and original corridor model; excludes ignored downloads.','Corridor / E14 / Docklands','Per-source snapshot dates in register; raw timestamp differs from represented epoch.','Manual fetch snapshots.','Build inputs, not startup payload; ignored raw downloads are accounted separately where recorded.','Per-source rights; raw restricted originals may deliberately be absent.'),
 ('kgx','Knowledge graph, versions and browser store','kgx/','RDF factual layers, source evidence, named graph provenance, immutable versions, complete export and indexed browser subset.','Dense Canary Wharf/Docklands; selected contributed photos and model facts; not all national/world tiles.','Manifest build 2026-10-26; multiple immutable graph versions and historical inputs.','Rebuild operations create new versions; browser worker package update does not rebuild graph contents.','Shardborough indexed range-read store already used. Keep full export and browser subset distinct; benchmark joins and cold/warm reads before considering server database.','Per-graph mixed source licence text. Browser subset and full export have different membership; conversion to RDF does not remove obligations.'),
 ('cwg','CWG directory, mall map, guide and evidence','third_party/cwg/','Raw/parsed estate directory and indoor-map evidence; some factual extracts lifted to KGX.','Canary Wharf malls and estate','Dated crawls/archive copies, floorplans and store-guide editions.','Website snapshots; can become stale quickly.','Repository-only evidence excluded from Pages; do not expose raw material by adding download links to Pages.','No general open licence; scoping review, facts vs copied expression and database extraction must be distinguished.'),
 ('web','Rendered website structured-data harvest','third_party/cwplans-structured-data/','Page-scoped JSON-LD/microdata/RDFa, N-Quads, idiom/shape and rewrite analyses; canonical portions in KGX.','Selected local businesses/brands and linked websites','Crawl/render observations and dated checks; not proof facts remain true.','Snapshot, recrawl needed; source sites vary.','Evidence repository-only, gzip RDF; index normalized facts rather than load whole crawl into browser.','Public markup does not grant an open data licence; owner scoping permission is not publisher permission.'),
 ('tfl','TfL station models and source evidence','third_party/tfl/','Station 3D source models and plans for underground reconstruction/evidence.','Selected London stations','Source model/FOI dates vary; not guaranteed as-built/current.','Snapshot; manual updates.','Repository-only evidence excluded from Pages; derived model review separate.','FOI release and accessibility are not general reuse permission; check source-specific notices.'),
 ('photos','Contributed images and calibration','data/images/','Original contributed photos, annotations, camera/calibration and facade evidence.','Canada Water/Docklands walks','Dated photo sets; missing EXIF distinguished from owner-reported capture time.','Append-only contributed sets; annotations may be revised.','Image originals for evidence; use derived atlases/thumbs in rendering.','Owner contributions declared CC0 where README states; third-party subjects/marks and privacy decisions remain separate.'),
 ('documentation','Quality, coverage, reports and provenance','cwplans/','Data-quality findings, source-discovery coverage and pipeline metadata alongside software/documentation.','Project scope varies','Audit/build dates are metadata dates, not surveyed dates.','Changes when tools/audits are run.','Small reports/manifests; generated metadata can still grow; this residual family also contains software.','Project metadata lacks a clear blanket data grant; underlying quoted/source facts retain their provenance.')
]:
 i,n,p,u,g,t,c,s,l=args;fam(i,n,'londat',p,u,g,t,c,s,l)
# Resolve nested subfolders before broader parents, preserving priority for specialized families.
families.sort(key=lambda f:-len(f['prefix']))
tracked={}; commits={}
for repo,root in [('londat',R),('docklandia',D)]:
 commits[repo]=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
 tracked[repo]=[x for x in subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0') if x]
rows=[]
for repo,root in [('londat',R),('docklandia',D)]:
 for path in tracked[repo]:
  if not (root/path).is_file():continue
  f=next((f for f in families if f['repo']==repo and path.startswith(f['prefix'])),None)
  if not f:continue
  data=(root/path).read_bytes();rows.append((repo,path,f['id'],len(data),hashlib.sha256(data).hexdigest()))
byfam=defaultdict(list)
for row in rows:byfam[row[2]].append(row)
byrepo={k:{p:(n,h) for rr,p,ff,n,h in rows if rr==k} for k in tracked}
# stable RDF syntax via JSON escaping, absolute safe minted IDs; do not copy structured fields as asserted legal conclusions.
def lit(v):return json.dumps(str(v),ensure_ascii=False)
def ident(k):return 'cat:'+re.sub('[^A-Za-z0-9_]','_',k)
lines=['@prefix schema: <https://schema.org/> .','@prefix dcat: <http://www.w3.org/ns/dcat#> .','@prefix dct: <http://purl.org/dc/terms/> .','@prefix prov: <http://www.w3.org/ns/prov#> .','@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .','@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .','@prefix cat: <https://danbri.github.io/londat/DATASET-CATALOGUE.trig#> .','']
def emit(s,p,o):lines.append('  '+s+' '+p+' '+o+' .')
def txt(s,p,v):
 if v is not None and v!='':emit(s,p,lit(v))
def link(s,p,v):
 if isinstance(v,str) and re.match(r'^https?://[^\s<>"{}|\\^`]+$',v):emit(s,p,'<'+v+'>')
lines.append('cat:recorded {')
emit('cat:catalogue','a','schema:DataCatalog, dcat:Catalog');txt('cat:catalogue','schema:name','Londat and Docklandia dataset accounting');txt('cat:catalogue','schema:description','Additive snapshot of source records, registered artifacts, regional map datasets, knowledge graph components and operational reviews across Londat and Docklandia.');txt('cat:catalogue','schema:dateModified',DATE)
link('cat:catalogue','dct:conformsTo','https://developers.google.com/search/docs/appearance/structured-data/dataset')
for repo,c in commits.items():txt('cat:catalogue','cat:'+repo+'Commit',c)
for term,desc in {'measuredBytes':'Sum of working-tree byte sizes of matching tracked files, compressed files counted as stored; not HTTP compressed size, unique facts, ignored raw downloads or Git history.','registeredMetadata':'Original source or artifact register object as JSON text; records reported assertions without turning them into a new grant.','sourcePeriodNote':'Recorded dates/period wording, not automatically schema:temporalCoverage.','changeRateAssessment':'Expected source/output change behaviour; inferred from workflow or source type, not measured churn.','servingAssessment':'Operational recommendation or current architecture, not a performance measurement.','rightsAssessment':'Reuse assessment; source-specific primary licence terms govern.','trackedFileCount':'Number of tracked files measured in storage family.','unmatchedPattern':'No matching tracked file at audited checkout; may be future, ignored, directory, obsolete or hosted elsewhere; not proof absent everywhere.'}.items():txt(ident(term),'rdfs:comment',desc)
for key,src in reg['sources'].items():
 s=ident('source_'+key);emit(s,'a','schema:Dataset');txt(s,'schema:identifier',key);txt(s,'schema:name',src['name']);txt(s,'schema:description',src['name']+'. Source listed by the project data register; listing alone does not prove acquisition or inclusion in all derived outputs.');emit(s,'schema:includedInDataCatalog','cat:catalogue');txt(s,'dct:rights',src['licence']);link(s,'cat:recordedLicenceUrl',src.get('licence_url'));
 if src.get('licence_url') and not any(x in src['licence'].lower() for x in ['not stated','no open','not confirmed']):link(s,'schema:license',src.get('licence_url'))
 link(s,'schema:url',src.get('url'));txt(s,'schema:creditText',src.get('attribution'));txt(s,'schema:publisher',src.get('publisher'));txt(s,'cat:registeredMetadata',json.dumps(src,ensure_ascii=False,sort_keys=True));txt(s,'cat:recordStatus','Referenced source; distribution/harvest extent must be established from artifact and manifest links.')
for f in families:
 s=ident(f['id']);emit(s,'a','schema:Dataset');txt(s,'schema:name',f['name']);txt(s,'schema:description',f['use']+' '+f['geo']);emit(s,'schema:includedInDataCatalog','cat:catalogue');txt(s,'cat:repository',f['repo']);txt(s,'cat:path',f['prefix']);txt(s,'schema:spatialCoverage',f['geo']);txt(s,'cat:sourcePeriodNote',f['time']);emit(s,'cat:measuredBytes',str(sum(r[3] for r in byfam[f['id']])));emit(s,'cat:trackedFileCount',str(len(byfam[f['id']])));link(s,'schema:url','https://github.com/danbri/'+f['repo']+'/tree/'+commits[f['repo']]+'/'+f['prefix']);txt(s,'cat:sizeScope','Storage family, mutually exclusive path assignment. Includes metadata and any software under path; see file inventory. Child datasets overlap family bytes and must not be added again.')
 # Regional geometry core vs wider extents explicitly distinct.
 if f['id'].startswith('place-'):
  p=next(p for p in index['places'] if 'place-'+p['id']==f['id'])
  for field,label in [('area','core'),('city','city'),('extent','surroundings')]:
   b=p.get(field)
   if b and len(b)==4:
    place=ident(f['id']+'_'+label);shape=ident(f['id']+'_'+label+'_shape');emit(s,'schema:spatialCoverage',place);emit(place,'a','schema:Place');txt(place,'schema:name',label+' extent of '+f['name']);emit(place,'schema:geo',shape);emit(shape,'a','schema:GeoShape');txt(shape,'schema:box',f'{b[1]} {b[0]} {b[3]} {b[2]}')
  txt(s,'schema:creditText',p.get('credit'));txt(s,'cat:buildTimestamp',p.get('built'))
  for k in ['buildings','city_buildings','buildings_lod2']:
   if k in p:emit(s,'cat:'+k,str(p[k]))
  dist=ident(f['id']+'_distribution');emit(s,'schema:distribution',dist);emit(dist,'a','schema:DataDownload');link(dist,'schema:contentUrl',(p['tileset'] if p['tileset'].startswith('https:') else 'https://danbri.github.io/londat/cwplans/docklands/data/places/'+p['tileset']));txt(dist,'schema:encodingFormat','application/json');txt(dist,'schema:description','3D Tiles 1.1 entry point referencing glTF tiles; entry-point bytes are not the whole dataset.')
# Source lineage of aggregate families, preserving per-source identity.
for f in families:
 keys=set()
 if f['repo']=='docklandia':
  for ext in reg['external']:
   if ext['path']==f['prefix']:keys.update(ext['sources'])
 else:
  for a in reg['files']:
   path=os.path.normpath('cwplans/'+a['path'])
   if path.startswith(f['prefix']):keys.update(a['sources'])
 for key in sorted(keys):emit(ident(f['id']),'schema:isBasedOn',ident('source_'+key))
# Individual national/regional/world vector layers are components, not additive byte totals.
for region in ['uk','es-nw','ba','world-detail']:
 manifest_path='cwplans/docklands/data/'+region+'/manifest.json';m=json.load(open(R/manifest_path))
 for key,source in m.get('sources',{}).items():
  if key not in reg['sources']:
   node=ident('source_'+key);emit(node,'a','schema:Dataset');txt(node,'schema:name',source.get('name',key));txt(node,'schema:description',source.get('name',key)+'. Source assertion from '+region+' vector manifest; outside the 528-entry register source list.');txt(node,'dct:rights',source.get('licence'));txt(node,'cat:registeredMetadata',json.dumps(source,sort_keys=True));link(node,'schema:url',source.get('url'));txt(node,'schema:creditText',source.get('attribution'))
 for layer in m.get('layers',[]):
  node=ident(region+'_layer_'+layer['id']);emit(node,'a','schema:Dataset');txt(node,'schema:name',m['name']+' / '+layer['title']);txt(node,'schema:description',layer['title']+' as spatially partitioned vector layers for map drawing, descriptions and place cards.');emit(node,'schema:isPartOf',ident(region));emit(ident(region),'schema:hasPart',node)
  for key in layer.get('sources',[]):emit(node,'schema:isBasedOn',ident('source_'+key))
  txt(node,'cat:registeredMetadata',json.dumps(layer,sort_keys=True,ensure_ascii=False));link(node,'prov:wasDerivedFrom','https://github.com/danbri/londat/blob/'+commits['londat']+'/'+manifest_path)

# Individual registered artifacts, including documentation/code honestly marked as CreativeWork.
missing=[];used=Counter()
for i,a in enumerate(reg['files']):
 s=ident('artifact_'+str(i+1));path=os.path.normpath('cwplans/'+a['path']);matches=[p for p in tracked['londat'] if p==path or p.startswith(path.rstrip('/')+'/') or fnmatch.fnmatchcase(p,path)];isdata=not (path.endswith(('.md','.mjs','.html','.py','.sh')) or (path.endswith('.js') and ('code, not data' in a['what'])))
 emit(s,'a','schema:Dataset' if isdata else 'schema:CreativeWork');txt(s,'schema:name',a['path']);txt(s,'schema:description',a['what']);emit(s,'schema:includedInDataCatalog','cat:catalogue');txt(s,'cat:path',path);txt(s,'cat:registeredMetadata',json.dumps(a,ensure_ascii=False,sort_keys=True));txt(s,'cat:sourcePeriodNote',a.get('fetched'));txt(s,'cat:osmUse',a['osm'].get('use'));emit(s,'cat:trackedFileCount',str(len(matches)));emit(s,'cat:measuredBytes',str(sum((R/p).stat().st_size for p in matches if (R/p).is_file())))
 for key in a['sources']:emit(s,'schema:isBasedOn',ident('source_'+key));used[key]+=1
 if matches:
  for f in families:
   if f['repo']=='londat' and any(p.startswith(f['prefix']) for p in matches):emit(ident(f['id']),'schema:hasPart',s)
 else:missing.append(path);emit(s,'cat:unmatchedPattern','true')
 link(s,'prov:wasDerivedFrom','https://github.com/danbri/londat/blob/'+commits['londat']+'/cwplans/data-register.json');txt(s,'cat:review',a.get('review'));txt(s,'cat:licenceNote',a.get('licence_note'))
# KGX current graph heads are datasets, with licence text, counts and version file URLs from manifest.
kg=json.load(open(R/'kgx/manifest.json'))
for name,g in kg['graphs'].items():
 s=ident('kgx_'+name);emit(s,'a','schema:Dataset');txt(s,'schema:name','KGX graph: '+name);txt(s,'schema:description',g.get('title',name));emit(s,'schema:isPartOf',ident('kgx'));emit(ident('kgx'),'schema:hasPart',s);txt(s,'dct:rights',g.get('licence'));txt(s,'cat:tripleCount',g.get('triples'));link(s,'schema:identifier',g.get('version'));txt(s,'cat:contentHash',g.get('rdfc10_sha256'));link(s,'prov:wasDerivedFrom','https://github.com/danbri/londat/blob/'+commits['londat']+'/kgx/manifest.json');dist=ident('kgx_'+name+'_download');emit(s,'schema:distribution',dist);emit(dist,'a','schema:DataDownload');link(dist,'schema:contentUrl','https://danbri.github.io/londat/kgx/'+g['file']);txt(dist,'schema:encodingFormat','application/n-quads+gzip')
for i,b in enumerate(reg['branches']):
 s=ident('branch_'+b['branch']);emit(s,'a','schema:Dataset');txt(s,'schema:name',b['branch']);txt(s,'schema:description',b['what']);txt(s,'cat:registeredMetadata',json.dumps(b,ensure_ascii=False,sort_keys=True));txt(s,'cat:sizeStatus','Not measured: separate branch not checked out; any sizes in description are register estimates.');txt(s,'cat:review',b.get('review'))
 for key in b['sources']:emit(s,'schema:isBasedOn',ident('source_'+key))
for k,v in reg['osm_extracts'].items():
 s=ident('extract_'+k);emit(s,'a','schema:Dataset');txt(s,'schema:name','Source extract: '+k);txt(s,'schema:description',v.get('url','')+'; acquisition evidence from register. Recorded raw bytes are historical, not current disk occupancy.');txt(s,'cat:registeredMetadata',json.dumps(v,ensure_ascii=False,sort_keys=True));txt(s,'cat:sourcePeriodNote',v.get('osm_data_as_of'));txt(s,'cat:fetchDate',v.get('fetched'));txt(s,'cat:recordedRawBytes',v.get('size_bytes'));txt(s,'cat:committed',v.get('committed'))
lines.append('}');lines.append('cat:assessment {')
for f in families:
 s=ident(f['id']);txt(s,'cat:changeRateAssessment',f['change']);txt(s,'cat:servingAssessment',f['serve']);txt(s,'cat:rightsAssessment',f['rights']);txt(s,'cat:usage',f['use'])
txt('cat:catalogue','cat:limitation','Source records and registered artifacts include discovery metadata, software and duplicate representations. Source counts are not counts of independently acquired datasets. Physical byte totals are not unique information volume. No new source licence grant is made here.');lines.append('}')
(O/'DATASET-CATALOGUE.trig').write_text('\n'.join(lines)+'\n')
out=io.StringIO();w=csv.writer(out,delimiter='\t',lineterminator='\n');w.writerow(['repository','path','family','bytes','sha256']);w.writerows(sorted(rows))
with gzip.GzipFile(filename=str(O/'dataset-catalogue-files.tsv.gz'),mode='wb',mtime=0) as z:z.write(out.getvalue().encode())
summary=dict(commits=commits,sources=len(reg['sources']),artifacts=len(reg['files']),unmatched=missing,sourceReferenceCounts=dict(used),families=[dict(f,files=len(byfam[f['id']]),bytes=sum(r[3] for r in byfam[f['id']])) for f in families],kgStore=kg['store'],kgTotal=kg['total_triples'],kgGraphs=len(kg['graphs']),inventoryRows=len(rows))
(O/'summary.json').write_text(json.dumps(summary,indent=2))
print(json.dumps({k:v for k,v in summary.items() if k not in ['families','sourceReferenceCounts','kgStore']},indent=2));print('store',str(kg['store'])[:2000])
