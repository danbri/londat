#!/usr/bin/env python3
# Count Overture buildings per country from the GeoParquet FOOTERS only (no row data): issue
# https://github.com/danbri/londat/issues/20 stage 1 (size estimate before any build). Record:
# https://github.com/danbri/londat/blob/main/docs/scale-estimate.md
#   python3 -I cwplans/tools/overture-building-counts.py <release> <out.json>
# Method: list the release's building files (bucket XML listing, as fetch-overture-theme.py), read each file's
# parquet_metadata (DuckDB httpfs: footer only), take each row group's row count and its bbox statistics
# (min bbox.xmin, max bbox.xmax, min bbox.ymin, max bbox.ymax), and give all rows of the row group to the Natural Earth
# country (cwplans/docklands/data/world/countries.json) that holds the centre of that box; a centre in the sea goes to
# the nearest country within 2 degrees, else to NONE. Overture sorts rows spatially, so a row group is small
# (2026-09-23.1: 82,688 row groups, median 34,108 rows, median box 0.15 x 0.19 degrees). Error: rows near a border can
# go to the neighbour. Check against a full count: UK 25,836,202 here, 25,905,918 by the per-record count of
# planet-architecture section 3b (-0.27 %).
import re, sys, json, urllib.request, urllib.parse, collections
from concurrent.futures import ThreadPoolExecutor
import duckdb
from shapely.geometry import Polygon, MultiPolygon, Point
from shapely.strtree import STRtree

rel, out = sys.argv[1], sys.argv[2]
base = 'https://overturemaps-us-west-2.s3.amazonaws.com/'
prefix = f'release/{rel}/theme=buildings/type=building/'
keys, token = [], None
while True:
    url = f'{base}?list-type=2&prefix={prefix}' + (f'&continuation-token={urllib.parse.quote(token)}' if token else '')
    x = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'glitchcan-cwplans/0.1 (https://github.com/danbri/londat)'})).read().decode()
    keys += re.findall(r'<Key>([^<]+\.parquet)</Key>', x)
    m = re.search(r'<NextContinuationToken>([^<]+)<', x)
    if not m: break
    token = m.group(1)

def footer(u):
    c = duckdb.connect(); c.sql('INSTALL httpfs; LOAD httpfs')
    return c.sql(f"""SELECT row_group_id, any_value(row_group_num_rows),
      min(CASE WHEN path_in_schema = 'bbox, xmin' THEN TRY_CAST(stats_min_value AS DOUBLE) END),
      max(CASE WHEN path_in_schema = 'bbox, xmax' THEN TRY_CAST(stats_max_value AS DOUBLE) END),
      min(CASE WHEN path_in_schema = 'bbox, ymin' THEN TRY_CAST(stats_min_value AS DOUBLE) END),
      max(CASE WHEN path_in_schema = 'bbox, ymax' THEN TRY_CAST(stats_max_value AS DOUBLE) END)
      FROM parquet_metadata('{u}') GROUP BY row_group_id""").fetchall()
with ThreadPoolExecutor(16) as ex: groups = [g for gs in ex.map(footer, [base + k for k in keys]) for g in gs]

C = json.load(open('cwplans/docklands/data/world/countries.json')); q = C['q']
def dec(a):
    x = y = 0; o = []
    for i in range(0, len(a), 2): x += a[i]; y += a[i + 1]; o.append((x / q, y / q))
    return o
geoms = [MultiPolygon([Polygon(dec(p[0]), [dec(r) for r in p[1:]]) for p in f['g']]).buffer(0) for f in C['features']]
props = [f['p'] for f in C['features']]
tree = STRtree(geoms)
count = collections.Counter(); near = 0
for rid, n, x0, x1, y0, y1 in groups:
    p = Point((x0 + x1) / 2, (y0 + y1) / 2)
    hit = [i for i in tree.query(p) if geoms[i].contains(p)]
    i = hit[0] if hit else tree.nearest(p)
    if not hit:
        if geoms[i].distance(p) > 2: i = None
        else: near += n
    count[props[i]['a3'] if i is not None else 'NONE'] += n
json.dump({'release': rel, 'files': len(keys), 'row_groups': len(groups), 'rows': sum(count.values()), 'rows_by_nearest': near,
           'count': dict(count.most_common()),
           'meta': {p['a3']: {'name': p['name'], 'cont': p['cont'], 'sub': p['sub']} for p in props}}, open(out, 'w'), indent=0)
print(len(keys), 'files', len(groups), 'row groups', sum(count.values()), 'rows')
