#!/usr/bin/env python3
# One Overture Maps theme / type in a bounding box, for cwplans/tools/build-place-tiles.mjs (fetch of the city and the
# surroundings of a place: buildings of the city box, road and rail segments, water, localities, peaks; skill
# docklands-3d-page, "Three.js port: places, city and surroundings by level of detail (2026-10-20)"). As
# fetch-overture-buildings.py: the bucket's XML listing gives the GeoParquet files of the release (the s3:// glob answers
# 403 through the agent proxy), DuckDB reads them over HTTPS with a filter on the bbox struct columns, so it reads only the
# footers and the row groups whose statistics meet the box.
#   python3 -I fetch-overture-theme.py <release> <theme> <type> <west> <south> <east> <north> <out.json> <columns> [<where>]
# columns: comma-separated SQL expressions (each is written as JSON with to_json, so structs and lists keep their shape);
# where: an extra SQL condition (e.g. "subtype IN ('road','rail')"). geometry (GeoJSON) and sources are always written.
# Output: {release, theme, type, bbox, files_listed, files_read, rows: [{id, <columns>, sources, geometry}]}.
# An output name ending in .ndjson streams instead (for areas of millions of rows, e.g. the buildings of Greater London:
# one JSON array of 1.5 M rows is larger than a Node string can hold): one row a line, ordered by id (DuckDB sorts out
# of core), and the header object (the keys above but rows) in <out>.meta.json.
# Needs the duckdb Python package (pip install duckdb; httpfs and spatial are installed on first use).
import json, sys, re, urllib.request, urllib.parse
import duckdb

rel, theme, typ = sys.argv[1:4]
w, s, e, n = map(float, sys.argv[4:8])
out, cols = sys.argv[8], [c for c in sys.argv[9].split(',') if c]
where = sys.argv[10] if len(sys.argv) > 10 and sys.argv[10] else 'TRUE'
base = 'https://overturemaps-us-west-2.s3.amazonaws.com/'
prefix = f'release/{rel}/theme={theme}/type={typ}/'
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
sel = ', '.join(f'to_json({x}) AS c{i}' for i, x in enumerate(cols))
q = f"""SELECT id, {sel + ',' if sel else ''} to_json(sources) AS sources, ST_AsGeoJSON(geometry) AS g, filename
FROM read_parquet({urls!r}, filename = true)
WHERE bbox.xmin < {e} AND bbox.xmax > {w} AND bbox.ymin < {n} AND bbox.ymax > {s} AND ({where})"""
ndjson = out.endswith('.ndjson')
if ndjson: q += ' ORDER BY id'
rows, files, nrows = [], set(), 0
def r7(v): return round(v, 7)
def rnd(g):
    if isinstance(g, list): return [rnd(x) for x in g] if g and isinstance(g[0], list) else [r7(v) for v in g]
    return g
def records():
    r = c.execute(q)
    while True:
        part = r.fetchmany(20000)
        if not part: return
        yield from part
fo = open(out, 'w') if ndjson else None
for rec in records():
    files.add(rec[-1].rsplit('/', 1)[-1])
    o = {'id': rec[0]}
    for i, x in enumerate(cols):
        name = re.sub(r'\W+', '_', x.split(' AS ')[-1] if ' AS ' in x else x).strip('_')
        v = rec[1 + i]; o[name] = json.loads(v) if v is not None else None
    o['sources'] = json.loads(rec[1 + len(cols)]) if rec[1 + len(cols)] else []
    geo = json.loads(rec[2 + len(cols)]); geo['coordinates'] = rnd(geo['coordinates']); o['geometry'] = geo
    nrows += 1
    if ndjson: fo.write(json.dumps(o, separators=(',', ':')) + '\n')
    else: rows.append(o)
head = {'release': rel, 'theme': theme, 'type': typ, 'bbox': [w, s, e, n], 'columns': cols, 'where': where, 'files_listed': len(urls), 'files_read': sorted(files)}
if ndjson: fo.close(); json.dump({**head, 'rows_count': nrows, 'rows_file': out.rsplit('/', 1)[-1], 'order': 'id'}, open(out + '.meta.json', 'w'))
else: rows.sort(key=lambda r: r['id']); json.dump({**head, 'rows': rows}, open(out, 'w'))
print(f'overture {rel} {theme}/{typ}: {nrows} rows from {len(files)} of {len(urls)} files')
