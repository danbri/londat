#!/usr/bin/env python3
# Overture Maps buildings in a bounding box, for cwplans/tools/build-place-tiles.mjs (fetch, adapter kind
# "overture-buildings"; skill docklands-3d-page, "Three.js port: places as 3D Tiles"). DuckDB reads the GeoParquet files
# of one release from the public bucket over HTTPS (the s3:// listing answered 403 through the agent proxy, so the file
# list comes from the bucket's XML listing), with a filter on the bbox struct columns: DuckDB then reads only the footer
# of each file and the row groups whose statistics meet the box (about 2 minutes, 512 files, 2026-10-20).
#   python3 fetch-overture-buildings.py <release> <west> <south> <east> <north> <out.json>
# Needs the duckdb Python package (pip install duckdb; extensions httpfs and spatial are installed on first use).
# Output: {release, bbox, files_read, rows: [{id, height, num_floors, roof_shape, roof_height, roof_direction,
# roof_orientation, sources, ring}]}; ring = outer ring of the (first) polygon, lon/lat to 1e-7.
import json, sys, re, urllib.request, urllib.parse
import duckdb

rel, w, s, e, n, out = sys.argv[1], *map(float, sys.argv[2:6]), sys.argv[6]
base = 'https://overturemaps-us-west-2.s3.amazonaws.com/'
prefix = f'release/{rel}/theme=buildings/type=building/'
keys, token = [], None
while True:   # the bucket listing, 1,000 keys a page
    url = f'{base}?list-type=2&prefix={prefix}' + (f'&continuation-token={urllib.parse.quote(token)}' if token else '')
    x = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'glitchcan-cwplans/0.1 (https://github.com/danbri/londat)'})).read().decode()
    keys += re.findall(r'<Key>([^<]+\.parquet)</Key>', x)
    m = re.search(r'<NextContinuationToken>([^<]+)<', x)
    if not m: break
    token = m.group(1)
urls = [base + k for k in keys]
c = duckdb.connect()
c.sql("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial")
q = f"""SELECT id, height, num_floors, roof_shape, roof_height, roof_direction, roof_orientation, to_json(sources) AS sources,
  ST_AsGeoJSON(geometry) AS g, filename
FROM read_parquet({urls!r}, filename = true)
WHERE bbox.xmin < {e} AND bbox.xmax > {w} AND bbox.ymin < {n} AND bbox.ymax > {s}"""
rows, files = [], set()
for (i, h, f, rs, rh, rd, ro, src, g, fn) in c.sql(q).fetchall():
    files.add(fn.rsplit('/', 1)[-1])
    geo = json.loads(g); poly = geo['coordinates'] if geo['type'] == 'Polygon' else geo['coordinates'][0]
    ring = [[round(p[0], 7), round(p[1], 7)] for p in poly[0]]
    rows.append({'id': i, 'height': h, 'num_floors': f, 'roof_shape': rs, 'roof_height': rh, 'roof_direction': rd, 'roof_orientation': ro, 'sources': json.loads(src), 'ring': ring})
rows.sort(key=lambda r: r['id'])
json.dump({'release': rel, 'bbox': [w, s, e, n], 'files_listed': len(urls), 'files_read': sorted(files), 'rows': rows}, open(out, 'w'))
print(f'overture {rel}: {len(rows)} buildings from {len(files)} of {len(urls)} files')
