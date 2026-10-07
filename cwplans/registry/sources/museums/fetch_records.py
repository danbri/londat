#!/usr/bin/env python3
"""Fetch geocoded museum and archaeological records inside the Docklands box.

Run from the repository root:
    python3 magpie/cwplans/registry/sources/museums/fetch_records.py

Needs curl, pyproj (BNG -> WGS84) and GDAL's ogr2ogr. Raw responses go to
magpie/cwplans/data/raw/registry/museums/ (not committed). Output: records.json and
apa_greater_london.geojson next to this script. Sources, licences and precision: README.md.

Personal data: no finder, landowner, donor or author names are kept. Records whose
object is human remains are left out.
"""
import json, os, re, subprocess, sys, time, urllib.parse
from pyproj import Transformer

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.normpath(os.path.join(HERE, '../../../data/raw/registry/museums'))
UA = 'glitchcan-cwplans/0.1 (https://github.com/danbri/glitchcan-minigam)'
W, S, E, N = -0.0950, 51.4740, 0.0150, 51.5220
QLEVER = 'https://qlever.dev/api/wikidata'
HE = 'https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/arcgis/rest/services/'
ADS = 'https://archaeologydataservice.ac.uk/data-catalogue-api/api/search'
BNG = Transformer.from_crs(27700, 4326, always_xy=True)  # Helmert, about 2 m; no OSTN15 grid
HUMAN_TYPES = {'human', 'human remains', 'skeleton', 'mummy', 'bog body'}
NOT_OBJECTS = {'coin type'}  # abstract types (e.g. 832 Roman coin types of the London mint), not physical objects
SENSITIVE = re.compile(r'\b(burials?|buried|cemeter(y|ies)|graves?|graveyard|tombs?|memorials?|human remains|skeletons?|churchyard|charnel|crypt|inhumations?|cremations?)\b')


def inbox(lon, lat):
    return lon is not None and lat is not None and W <= lon <= E and S <= lat <= N


def curl(url, data=None, accept=None, pause=0.6):
    time.sleep(pause)
    cmd = ['curl', '-sS', '-L', '--max-time', '300', '-A', UA]
    if accept:
        cmd += ['-H', 'Accept: ' + accept]
    if data is not None:
        cmd += ['--data-urlencode', 'query=' + data]
    r = subprocess.run(cmd + [url], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError('curl failed %s: %s' % (url, r.stderr))
    return r.stdout


def save_raw(name, text):
    with open(os.path.join(RAW, name), 'w') as f:
        f.write(text)


# ---------------------------------------------------------------- Wikidata (QLever)
PFX = '''PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
'''
BOXF = 'FILTER(geof:longitude(%%s) >= %s && geof:longitude(%%s) <= %s && geof:latitude(%%s) >= %s && geof:latitude(%%s) <= %s)' % (W, E, S, N)
DETAILS = '''
  OPTIONAL { ?o rdfs:label ?ol FILTER(LANG(?ol) = "en") }
  OPTIONAL { ?o wdt:P31 ?t . ?t rdfs:label ?typel FILTER(LANG(?typel) = "en") }
  OPTIONAL { ?o wdt:P571 ?inc }
  OPTIONAL { ?o wdt:P217 ?inv }
  OPTIONAL { ?o wdt:P195 ?coll . OPTIONAL { ?coll rdfs:label ?colll FILTER(LANG(?colll) = "en") } }
'''
SEL = '(SAMPLE(?ol) AS ?label) (GROUP_CONCAT(DISTINCT ?typel; SEPARATOR="; ") AS ?type) (SAMPLE(?inc) AS ?date) (SAMPLE(?inv) AS ?inventory) (SAMPLE(?coll) AS ?collection) (SAMPLE(?colll) AS ?collLabel)'

# 1. objects in a collection whose location (P276) is a place in the box
Q_HELD = PFX + '''SELECT ?o ?place (SAMPLE(?placel) AS ?placeLabel) (SAMPLE(?pc) AS ?coord) %s WHERE {
  ?place wdt:P625 ?pc . %s
  ?o wdt:P276 ?place . ?o wdt:P195 ?c0 .
  OPTIONAL { ?place rdfs:label ?placel FILTER(LANG(?placel) = "en") } %s
} GROUP BY ?o ?place''' % (SEL, BOXF % ('?pc', '?pc', '?pc', '?pc'), DETAILS)

# 2. objects in a collection with their own coordinates (P625) in the box
Q_OWN = PFX + '''SELECT ?o (SAMPLE(?oc) AS ?coord) %s WHERE {
  ?o wdt:P625 ?oc . %s
  ?o wdt:P195 ?c0 . %s
} GROUP BY ?o''' % (SEL, BOXF % ('?oc', '?oc', '?oc', '?oc'), DETAILS)

# 3. objects whose place of discovery (P189) or creation (P1071) is in the box
#    (with or without a collection); the place must have coordinates in the box.
Q_MADE = PFX + '''SELECT ?o ?prop ?place (SAMPLE(?placel) AS ?placeLabel) (SAMPLE(?pc) AS ?coord) %s WHERE {
  { ?o wdt:P189 ?place . BIND("P189" AS ?prop) } UNION { ?o wdt:P1071 ?place . BIND("P1071" AS ?prop) }
  ?place wdt:P625 ?pc . %s
  OPTIONAL { ?place rdfs:label ?placel FILTER(LANG(?placel) = "en") } %s
} GROUP BY ?o ?prop ?place''' % (SEL, BOXF % ('?pc', '?pc', '?pc', '?pc'), DETAILS)


def wkt(p):
    lon, lat = p.replace('POINT(', '').rstrip(')').split()
    return float(lon), float(lat)


def qlever(name, q):
    for attempt in range(4):
        text = curl(QLEVER, data=q, accept='application/sparql-results+json', pause=10 + 20 * attempt)
        try:
            d = json.loads(text)
        except ValueError:
            continue
        if 'results' in d:
            save_raw('wikidata_%s.json' % name, text)
            return d['results']['bindings']
        print('QLever', name, d.get('exception', '')[:200])
    raise RuntimeError('QLever query failed: ' + name)


def wikidata_records():
    out = []
    v = lambda r, k: r.get(k, {}).get('value')
    for name, q, relation, precision in [
            ('held', Q_HELD, 'location (P276): where the object is kept', 'coordinate of the holding building or site'),
            ('own', Q_OWN, 'coordinate location (P625) of the object itself', 'object coordinate as given in Wikidata'),
            ('made_found', Q_MADE, None, 'coordinate of the place item (district, yard or building), not of a findspot')]:
        for r in qlever(name, q):
            types = {t.strip().lower() for t in (v(r, 'type') or '').split(';')}
            if types & HUMAN_TYPES or types & NOT_OBJECTS:
                continue  # human remains are not model material; coin types are not objects
            lon, lat = wkt(v(r, 'coord'))
            if not inbox(lon, lat):
                continue
            rel = relation or ('place of discovery (P189)' if v(r, 'prop') == 'P189' else 'place of creation (P1071)')
            qid = v(r, 'o').rsplit('/', 1)[1]
            out.append({
                'source': 'wikidata', 'id': qid, 'title': v(r, 'label'), 'date': (v(r, 'date') or '')[:10] or None,
                'object_type': v(r, 'type'), 'collection': v(r, 'collLabel'),
                'collection_id': (v(r, 'collection') or '').rsplit('/', 1)[-1] or None,
                'inventory_number': v(r, 'inventory'),
                'place': v(r, 'placeLabel'), 'place_id': (v(r, 'place') or '').rsplit('/', 1)[-1] or None,
                'relation': rel, 'lon': round(lon, 6), 'lat': round(lat, 6), 'precision': precision,
                'url': 'https://www.wikidata.org/wiki/' + qid, 'licence': 'CC0 1.0 (Wikidata)'})
        print('wikidata', name, len(out))
    return out


# ---------------------------------------------------------------- Historic England (ArcGIS, OGL)
def arcgis(layer, fields, out_sr=4326, geometry=True):
    q = {'where': '1=1', 'geometry': '%s,%s,%s,%s' % (W, S, E, N), 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326,
         'spatialRel': 'esriSpatialRelIntersects', 'outFields': fields, 'outSR': out_sr, 'returnGeometry': str(geometry).lower(),
         'f': 'json', 'resultRecordCount': 1000}
    text = curl(HE + layer + '/query?' + urllib.parse.urlencode(q))
    save_raw('he_%s.json' % layer.split('/')[0], text)
    return json.loads(text)['features']


def he_records():
    out = []
    for f in arcgis('National_Heritage_List_for_England_NHLE_v02_VIEW/FeatureServer/6',
                    'ListEntry,Name,SchedDate,CaptureScale,hyperlink,area_ha,NGR,Easting,Northing', geometry=False):
        a = f['attributes']
        lon, lat = BNG.transform(a['Easting'], a['Northing'])
        out.append({'source': 'historic-england-nhle-scheduled-monuments', 'id': str(a['ListEntry']), 'title': a['Name'],
                    'date': time.strftime('%Y-%m-%d', time.gmtime(a['SchedDate'] / 1000)) if a.get('SchedDate') else None,
                    'date_meaning': 'date scheduled', 'object_type': 'scheduled monument', 'collection': None,
                    'place': a.get('NGR'), 'relation': 'site', 'lon': round(lon, 6), 'lat': round(lat, 6),
                    'precision': 'list NGR point of a monument of %.2f ha (capture scale %s); lon/lat from BNG by Helmert, about 2 m' % (a.get('area_ha') or 0, a.get('CaptureScale')),
                    'url': a.get('hyperlink'), 'licence': 'OGL v3.0 (Historic England NHLE)'})
    for f in arcgis('2024_02_Scheduled_Wrecks_and_submerged_mons/FeatureServer/24', '*', geometry=False):
        a = f['attributes']
        out.append({'source': 'historic-england-scheduled-wrecks', 'id': str(a['List_Entry_Number']), 'title': a['Heritage_Asset_Name'],
                    'date': (a.get('Period_Name') or '').strip(', ') or None, 'date_meaning': 'period',
                    'object_type': (a.get('Monument_Type') or '').strip(', '), 'collection': None, 'place': a.get('NGR'),
                    'relation': 'site (submerged or foreshore)', 'lon': a['Longitude'], 'lat': a['Latitude'],
                    'precision': 'list NGR point', 'url': a.get('URL'), 'licence': 'OGL v3.0 (Historic England)'})
    for f in arcgis('Historic_England_Research_Spatial_Reports/FeatureServer/475',
                    'Report_Num,Report_title,Report_URL,Project_type,Simple_Report_type,Keyword,Year'):
        a, g = f['attributes'], f['geometry']
        out.append({'source': 'historic-england-research-reports', 'id': str(a['Report_Num']), 'title': a['Report_title'],
                    'date': str(a['Year']) if a.get('Year') else None, 'date_meaning': 'report year',
                    'object_type': 'research report: %s (%s)' % (a.get('Project_type'), a.get('Keyword')), 'collection': None,
                    'place': None, 'relation': 'report about a site', 'lon': round(g['x'], 6), 'lat': round(g['y'], 6),
                    'precision': 'site point given by Historic England for the report', 'url': a.get('Report_URL'),
                    'licence': 'OGL v3.0 (Historic England Open Data Hub)'})
    for f in arcgis('Heritage_Assets_Inventory1/FeatureServer/0', 'UID,Name,Mon_type,Place,Address,Summary'):
        a, g = f['attributes'], f['geometry']
        out.append({'source': 'historic-england-heritage-harbours-inventory', 'id': a['UID'], 'title': a['Name'],
                    'date': None, 'object_type': (a.get('Mon_type') or '').lower(), 'collection': None,
                    'place': ', '.join(x for x in [a.get('Address'), a.get('Place')] if x), 'relation': 'heritage asset',
                    'summary': a.get('Summary'), 'lon': round(g['x'], 6), 'lat': round(g['y'], 6),
                    'precision': 'point as given', 'url': None,
                    'licence': 'not stated on the item (Historic England ArcGIS, public)'})
    print('historic england', len(out))
    return out


def he_apas():
    raw = os.path.join(RAW, 'he_apas.geojson')
    q = {'where': '1=1', 'geometry': '%s,%s,%s,%s' % (W, S, E, N), 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326,
         'spatialRel': 'esriSpatialRelIntersects', 'outFields': '*', 'outSR': 4326, 'f': 'geojson'}
    curl_text = curl(HE + 'Greater_London_Archaeological_Priority_Areas__APAs_/FeatureServer/1/query?' + urllib.parse.urlencode(q))
    open(raw, 'w').write(curl_text)
    out = os.path.join(HERE, 'apa_greater_london.geojson')
    if os.path.exists(out):
        os.remove(out)
    subprocess.run(['ogr2ogr', '-f', 'GeoJSON', '-clipsrc', str(W), str(S), str(E), str(N), '-lco', 'RFC7946=YES',
                    '-lco', 'COORDINATE_PRECISION=6', out, raw], check=True)
    print('APAs', len(json.load(open(out))['features']))


# ---------------------------------------------------------------- ADS / ARIADNE catalogue
ADS_SAMPLES = [  # (label, filter, pages of 50)
    ('Portable Antiquities Scheme finds (publisher British Museum)', {'publisher': 'British Museum'}, 4),
    ('Museum of London Archaeology', {'contributor': 'Museum of London Archaeology'}, 4),
    ('fieldwork reports', {'ariadneSubject': 'Fieldwork report'}, 4),
    ('maritime', {'ariadneSubject': 'Maritime'}, 11),
    ('Historic England (publisher)', {'publisher': 'Historic England'}, 6),
    ('Historic England (contributor)', {'contributor': 'Historic England'}, 4),
]
ORGS_OK = {'Portable Antiquities Scheme', 'British Museum', 'Historic England', 'Archaeology Data Service', 'Museum of London Archaeology',
           'MOLA', 'MOLA (Museum of London Archaeology)', 'Pre-Construct Archaeology Limited', 'Compass Archaeology Ltd',
           'AOC Archaeology Ltd', 'Archaeology South-East', 'Wessex Archaeology', 'Oxford Archaeology', 'L - P : Archaeology'}


def ads_records():
    out, seen, totals = [], set(), {}
    bbox = '%s,%s,%s,%s' % (N, W, S, E)  # north-west corner, then south-east corner
    for label, flt, pages in ADS_SAMPLES:
        for page in range(1, pages + 1):
            q = dict(flt, bbox=bbox, size=50, page=page)
            text = curl(ADS + '?' + urllib.parse.urlencode(q))
            d = json.loads(text)
            if page == 1:
                save_raw('ads_%s.json' % list(flt.values())[0].replace(' ', '_'), text)
                totals[label] = d['total']['value']
            for h in d.get('hits', []):
                x = h['data']
                if x['identifier'] in seen:
                    continue
                seen.add(x['identifier'])
                pt, prec = None, None
                for sp in x.get('spatial') or []:
                    if sp.get('geopoint'):
                        pt, prec = (sp['geopoint']['lon'], sp['geopoint']['lat']), 'point as given by the record'
                        place = sp.get('placeName')
                        break
                    if sp.get('centroid') and not pt:
                        pt, place = (sp['centroid']['lon'], sp['centroid']['lat']), sp.get('placeName')
                        bb = sp.get('boundingbox', '')
                        try:
                            xs = [float(c.split()[0]) for c in bb.split('((')[1].split('))')[0].split(',')]
                            ys = [float(c.split()[1]) for c in bb.split('((')[1].split('))')[0].split(',')]
                            prec = 'centroid of a %.1f x %.1f km place box' % ((max(xs) - min(xs)) * 69.4, (max(ys) - min(ys)) * 111.2)
                        except (IndexError, ValueError):
                            prec = 'centroid of a place box'
                if not pt or not inbox(*pt):
                    continue
                t = (x.get('temporal') or [{}])[0] or {}
                owners = [o.get('name') for o in (x.get('owner') or []) + (x.get('responsible') or []) if o.get('name') in ORGS_OK]
                out.append({'source': 'ads-ariadne', 'sample': label, 'id': x.get('originalId'), 'title': (x.get('title') or {}).get('text'),
                            'date': '%s-%s' % (t.get('from'), t.get('until')) if t.get('from') else t.get('periodName'),
                            'date_meaning': 'date range of the object or site', 'period': t.get('periodName'),
                            'object_type': ', '.join(s.get('prefLabel', '') for s in (x.get('derivedSubject') or [])[:3]) or x.get('resourceType'),
                            'collection': owners[0] if owners else None, 'place': place, 'relation': 'findspot or site',
                            'lon': round(pt[0], 6), 'lat': round(pt[1], 6), 'precision': prec,
                            'url': x.get('landingPage') or 'https://archaeologydataservice.ac.uk/data-catalogue/resource/' + h['id'],
                            'catalogue_url': 'https://archaeologydataservice.ac.uk/data-catalogue/resource/' + h['id'],
                            'catalogue_id': x.get('identifier'),
                            'licence': x.get('accessRights')})
        print('ads', label, totals[label], 'kept so far', len(out))
    return out, totals


if __name__ == '__main__':
    os.makedirs(RAW, exist_ok=True)
    recs = wikidata_records()
    recs += he_records()
    he_apas()
    ads, ads_totals = ads_records()
    recs += ads
    from collections import Counter
    uniq, seen = [], set()
    for r in recs:
        key = (r['source'], r['id'], r.get('relation'), r.get('place_id'), r['lon'], r['lat'])
        if key in seen:
            continue
        seen.add(key)
        text = ' '.join(str(r.get(k) or '') for k in ('title', 'object_type', 'place', 'summary')).lower()
        if SENSITIVE.search(text):
            r['sensitive'] = 'burial or memorial context: leave out of game or story content'
        uniq.append(r)
    recs = uniq
    summary = Counter(r['source'] for r in recs)
    head = {'generated': time.strftime('%Y-%m-%d'), 'box_wgs84': [W, S, E, N],
            'note': 'See README.md for what each source is, its licence and what precision means. No personal data about private individuals is kept; human remains and abstract coin types are left out; burial or memorial records carry a sensitive flag.',
            'counts': dict(summary), 'ads_totals_in_box': ads_totals}
    with open(os.path.join(HERE, 'records.json'), 'w') as f:  # one record per line, so diffs stay readable
        f.write(json.dumps(head, ensure_ascii=False)[:-1] + ',\n"records":[\n')
        f.write(',\n'.join(json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in recs))
        f.write('\n]}\n')
    print(dict(summary), sum(1 for r in recs if r.get('sensitive')), 'flagged sensitive')
