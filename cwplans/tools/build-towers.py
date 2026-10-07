#!/usr/bin/env python3
"""Tiered geometry for the tallest Canary Wharf towers, measured from the EA LiDAR surface model.

  python3 -m venv /opt/towers-venv && /opt/towers-venv/bin/pip install numpy scipy scikit-learn scikit-image rasterio shapely pillow
  bash cwplans/tools/fetch-dsm.sh                     # the DSM ZIPs (data/raw/dsm/, not committed)
  /opt/towers-venv/bin/python cwplans/tools/build-towers.py [--only cwb-0413,...]

in:  data/raw/dsm/*.zip (2022 composite first-return DSM 1 m, 2020 and 2018 NLP DSM 1 m),
     docklands/data/area.js (model footprints, base levels), atlas/data/atlas.json (registry -> model link, heights),
     registry/buildings.json (OSM building:part heights); the hand corrections are JUDGEMENT below, each with its reason
out: docklands/data/towers.json; data/raw/towers/contact.png and one PNG per tower (not committed)

Targets: atlas buildings with max(Wikidata height, OSM height, model height) >= 100 m.
Method and limits: the "method" list written into towers.json (METHOD below). The lessons belong in
skills/docklands-data-curation/SKILL.md; a "Towers" section there is still to be written.
"""
import argparse, json, math, zipfile
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.transform import Affine
from rasterio.windows import from_bounds
from scipy import ndimage
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
from skimage import measure
from sklearn.mixture import GaussianMixture
from PIL import Image, ImageDraw

CW = Path(__file__).resolve().parent.parent
DSM = CW / 'data/raw/dsm'
OUT_IMG = CW / 'data/raw/towers'
E0, N0 = 537550, 180300
MARGIN = 3                # m round the footprint read and searched
CLIP = 2.5                # m: tiers stay within the (registered) OSM outline plus this
SHIFT = 4                 # m: largest shift of an OSM outline onto the LiDAR building
MIN_FEATURE = 16          # m2: plant, masts and crowns smaller than about 4 x 4 m are not kept as tiers
TIER_GAP = 3.0            # m: two roof levels closer than this are one tier
CLOSING = 3               # m: dropout fill (grey closing) window
MIN_HOLE = 60             # m2: a smaller opening in a roof region is filled (plant wells, dropouts)
CROWN = 12.0              # m: two or more roof levels this close to the top make a stepped top ("crown")
MIN_TIER = 8.0            # m above the base: lower levels are ground, kerbs and misregistered pavement

SURVEYS = {   # id -> zip files (product, year); the 2022 composite merges P_10768 (2017-12 to 2018-01) and P_12151 (2020-12-12)
    '2022c': ['lidar_composite_first_return_dsm-2022-1-TQ3575.zip', 'lidar_composite_first_return_dsm-2022-1-TQ3580.zip'],
    '2020': ['national_lidar_programme_dsm-2020-1-TQ3575.zip', 'national_lidar_programme_dsm-2020-1-TQ3580.zip'],
    '2018': ['national_lidar_programme_dsm-2018-1-TQ3575.zip', 'national_lidar_programme_dsm-2018-1-TQ3580.zip'],
}


# ---------------------------------------------------------------- inputs
def load_area():
    txt = (CW / 'docklands/data/area.js').read_text()
    body = txt[txt.index('=', txt.index('DOCKLANDS_AREA')) + 1:].strip().rstrip(';')
    return json.loads(body)


def dec(q, stride=2):
    acc = [0] * stride; out = []
    for i, v in enumerate(q):
        acc[i % stride] += v; out.append(acc[i % stride] / 10)
    return out


def model_rings(b):
    """Outer ring and holes of a model building, as lists of (x, z)."""
    f = dec(b['p']); pts = [(f[2 * i], f[2 * i + 1]) for i in range(len(f) // 2)]
    starts = [0] + list(b.get('holes') or []) + [len(pts)]
    rings = [pts[starts[k]:starts[k + 1]] for k in range(len(starts) - 1)]
    return rings[0], rings[1:]


def model_poly(b):
    outer, holes = model_rings(b)
    p = Polygon(outer, [h for h in holes if len(h) >= 3])
    return p if p.is_valid else p.buffer(0)


class Survey:
    """1 m DSM read through GDAL's zip support; returns a crop on the local grid (rows = z, cols = x)."""
    def __init__(self, sid):
        self.sid, self.ds = sid, []
        for z in SURVEYS[sid]:
            zp = DSM / z
            if not zp.exists(): continue
            names = [n for n in zipfile.ZipFile(zp).namelist() if n.lower().endswith('.tif')]
            for n in names: self.ds.append(rasterio.open(f'zip://{zp}!{n}'))

    def crop(self, x0, x1, z0, z1):
        """Integer local bounds; cell (r, c) covers x in [x0 + c, x0 + c + 1], z in [z0 + r, z0 + r + 1]."""
        w, h = x1 - x0, z1 - z0
        out = np.full((h, w), np.nan, np.float32)
        E_a, E_b, N_a, N_b = x0 + E0, x1 + E0, N0 - z1, N0 - z0
        for d in self.ds:
            b = d.bounds
            ea, eb, na, nb = max(E_a, b.left), min(E_b, b.right), max(N_a, b.bottom), min(N_b, b.top)
            if ea >= eb or na >= nb: continue
            win = from_bounds(ea, na, eb, nb, d.transform).round_offsets().round_lengths()
            a = d.read(1, window=win).astype(np.float32)
            nd = d.nodata
            a[(a < -100) | (a > 1000)] = np.nan
            if nd is not None: a[a == nd] = np.nan
            c0, r0 = int(round(ea - E_a)), int(round(N_b - nb))
            sub = out[r0:r0 + a.shape[0], c0:c0 + a.shape[1]]
            m = np.isnan(sub); sub[m] = a[:sub.shape[0], :sub.shape[1]][m]
        return out


# ---------------------------------------------------------------- geometry helpers
def dominant_angle(poly):
    """Length-weighted dominant edge direction (radians, in [0, pi/2)) of a footprint."""
    polys = poly.geoms if isinstance(poly, MultiPolygon) else [poly]
    s = c = 0.0
    for p in polys:
        xy = np.asarray(p.exterior.coords)
        d = np.diff(xy, axis=0); L = np.hypot(d[:, 0], d[:, 1]); th = np.arctan2(d[:, 1], d[:, 0])
        s += np.sum(L * np.sin(4 * th)); c += np.sum(L * np.cos(4 * th))
    return (math.atan2(s, c) / 4) % (math.pi / 2)


def _line_isect(p, d, q, e):
    den = d[0] * e[1] - d[1] * e[0]
    if abs(den) < 1e-9: return None
    t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den
    return (p[0] + t * d[0], p[1] + t * d[1])


def snap_ring(ring, dom, tol_deg=8.0):
    """Rotate edges within tol_deg of the dominant directions onto them, then re-intersect neighbouring edges."""
    pts = ring[:-1] if ring[0] == ring[-1] else list(ring)
    n = len(pts)
    if n < 3: return ring
    lines = []
    for i in range(n):
        a, b = np.array(pts[i]), np.array(pts[(i + 1) % n]); d = b - a; L = float(np.hypot(*d))
        if L < 1e-6: continue
        th = math.atan2(d[1], d[0]); rel = (th - dom) % (math.pi / 2)
        off = min(rel, math.pi / 2 - rel)
        if math.degrees(off) < tol_deg:
            k = round((th - dom) / (math.pi / 2)); th = dom + k * math.pi / 2
            d = np.array([math.cos(th), math.sin(th)]) * L; snapped = True
        else: snapped = False
        lines.append([(a + b) / 2, d / L, L, snapped])
    merged = []   # neighbouring snapped edges with the same direction become one edge
    for ln in lines:
        if merged and ln[3] and merged[-1][3] and abs(abs(np.dot(ln[1], merged[-1][1])) - 1) < 1e-6:
            m = merged[-1]; w = m[2] + ln[2]; m[0] = (m[0] * m[2] + ln[0] * ln[2]) / w; m[2] = w
        else: merged.append(ln)
    if len(merged) > 3 and merged[0][3] and merged[-1][3] and abs(abs(np.dot(merged[0][1], merged[-1][1])) - 1) < 1e-6:
        m, ln = merged[0], merged.pop(); w = m[2] + ln[2]; m[0] = (m[0] * m[2] + ln[0] * ln[2]) / w; m[2] = w
    out = []
    for i in range(len(merged)):
        p = _line_isect(merged[i - 1][0], merged[i - 1][1], merged[i][0], merged[i][1])
        if p is None: p = tuple(merged[i][0] - merged[i][1] * merged[i][2] / 2)
        out.append(p)
    return out + [out[0]] if out else ring


def regularise(poly, dom, dp=0.8):
    """Douglas-Peucker, then snap the outer ring to the dominant directions; keep the snapped ring only if it stays
    close. Holes (open roofs inside a screen or crown) are simplified and kept."""
    res = []
    for p in (poly.geoms if isinstance(poly, MultiPolygon) else [poly]):
        s = p.simplify(dp, preserve_topology=True)
        if s.is_empty or s.area < MIN_FEATURE: continue
        if isinstance(s, MultiPolygon): s = max(s.geoms, key=lambda g: g.area)
        try:
            q = Polygon(snap_ring(list(s.exterior.coords), dom))
            if not q.is_valid or abs(q.area - Polygon(s.exterior).area) > .12 * s.area or q.symmetric_difference(Polygon(s.exterior)).area > .2 * s.area:
                q = Polygon(s.exterior)
        except Exception: q = Polygon(s.exterior)
        holes = [h for h in s.interiors if Polygon(h).area >= MIN_HOLE and q.contains(Polygon(h))]
        res.append(Polygon(q.exterior.coords, [list(h.coords) for h in holes]))
    return res


def mask_to_polys(mask, X0, Z0):
    """Marching squares on a cleaned binary mask -> shapely polygons in local metres, with holes."""
    m = np.pad(mask.astype(float), 1)
    rings = []
    for c in measure.find_contours(ndimage.gaussian_filter(m, 0.6), 0.5):
        if len(c) < 4: continue
        p = Polygon([(X0 + col - 1 + .5, Z0 + row - 1 + .5) for row, col in c])
        if not p.is_valid: p = p.buffer(0)
        if isinstance(p, MultiPolygon): p = max(p.geoms, key=lambda g: g.area)
        if p.area >= MIN_FEATURE: rings.append(p)
    rings.sort(key=lambda p: -p.area)
    outers = []   # nesting depth: even = outer ring, odd = hole of the smallest ring around it
    for p in rings:
        cont = [o for o in rings if o is not p and o.area > p.area and o.contains(p.representative_point())]
        if len(cont) % 2 == 0: outers.append([p, []])
        else:
            host = min(cont, key=lambda o: o.area)
            for o in outers:
                if o[0] is host: o[1].append(p)
    return [Polygon(o.exterior.coords, [h.exterior.coords for h in hs]) if hs else o for o, hs in outers]


def clean_mask(m):
    m = ndimage.binary_opening(m, np.ones((3, 3)))
    m = ndimage.binary_closing(m, np.ones((3, 3)))
    filled = ndimage.binary_fill_holes(m)   # fill holes smaller than MIN_HOLE only
    lab, n = ndimage.label(filled & ~m)
    if n:
        sizes = ndimage.sum(filled & ~m, lab, range(1, n + 1))
        for k, sz in enumerate(sizes, 1):
            if sz < MIN_HOLE: m[lab == k] = True
    lab, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        for k, s in enumerate(sizes, 1):
            if s < MIN_FEATURE: m[lab == k] = False
    return m


# ---------------------------------------------------------------- roof levels
def roof_levels(v, kmax=7, seed=0, pen=2.0):
    """1-D Gaussian mixture over the roof heights inside the footprint, k chosen by BIC plus 2 k ln(n) (a new tier
    must earn its keep); then levels closer than TIER_GAP merge and levels with fewer than MIN_FEATURE cells go.
    Wall cells and spurious levels are removed later, by the region test in fit_building. Returns sorted levels
    (median height of each level's cells)."""
    v = v[np.isfinite(v)]; v = v[v > 3]
    if v.size < MIN_FEATURE: return []
    X = v.reshape(-1, 1); best = None
    for k in range(1, min(kmax, max(1, v.size // MIN_FEATURE)) + 1):
        g = GaussianMixture(k, random_state=seed, reg_covar=0.25).fit(X)
        bic = g.bic(X) + pen * k * math.log(v.size)
        if best is None or bic < best[0]: best = (bic, g)
    lab = best[1].predict(X)
    groups = sorted([v[lab == k] for k in np.unique(lab)], key=np.median)
    merged = []
    for g in groups:
        if merged and np.median(g) - np.median(merged[-1]) < TIER_GAP: merged[-1] = np.concatenate([merged[-1], g])
        else: merged.append(g)
    return [float(np.median(g)) for g in merged if g.size >= MIN_FEATURE]


# ---------------------------------------------------------------- pictures
def ramp(t):
    """Height colour ramp (dark blue -> teal -> yellow -> white), t in 0..1."""
    stops = np.array([[20, 30, 70], [30, 120, 150], [120, 190, 90], [240, 220, 80], [255, 255, 255]], float)
    t = np.clip(t, 0, 1) * (len(stops) - 1); i = np.minimum(t.astype(int), len(stops) - 2); f = (t - i)[..., None]
    return (stops[i] * (1 - f) + stops[i + 1] * f).astype(np.uint8)


def shaded(h, vmax, scale=4):
    """Hillshade (light from the north-west) times the height ramp; NaN shows as grey."""
    hh = np.nan_to_num(h, nan=0.0)
    gz, gx = np.gradient(hh)
    sh = np.clip(0.55 + 0.45 * (-(gx - gz) / np.sqrt(1 + gx * gx + gz * gz)) * 1.6, 0.25, 1.15)
    rgb = ramp(hh / max(vmax, 1)) * np.clip(sh, 0, 1.1)[..., None]
    rgb[np.isnan(h)] = (90, 90, 90)
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    return img.resize((img.width * scale, img.height * scale), Image.NEAREST)


# ---------------------------------------------------------------- the model surface
def gauge_rect(x, z, c, dom, hu, hv):
    """Pyramid gauge: 0 at the apex c, 1 on the rectangle with half-sides hu, hv along dom and dom + 90 degrees."""
    ca, sa = math.cos(dom), math.sin(dom)
    u = (x - c[0]) * ca + (z - c[1]) * sa; v = -(x - c[0]) * sa + (z - c[1]) * ca
    return np.maximum(np.abs(u) / hu, np.abs(v) / hv)


def model_surface(rec, X0, Z0, shape):
    """Rasterise a fitted record at 1 m (cell centres): heights in m OD, NaN where the model has no building."""
    out = np.full(shape, np.nan, np.float32)
    tr = Affine(1, 0, X0, 0, 1, Z0)
    zz, xx = np.mgrid[0:shape[0], 0:shape[1]]; xc, zc = X0 + xx + .5, Z0 + zz + .5
    for t in sorted(rec['tiers'], key=lambda t: t['y1']):
        m = rasterize([t['poly']], out_shape=shape, transform=tr).astype(bool)
        val = np.full(shape, t['y1'], np.float32)
        top = t.get('top')
        if top and top['kind'] == 'pyramid':
            g = gauge_rect(xc, zc, top['c'], top['dom'], top['hu'], top['hv'])
            val = (top['apex_y'] - (top['apex_y'] - t['y0']) * np.clip(g, 0, 1)).astype(np.float32)
        elif top and top['kind'] == 'cone':
            r = np.hypot(xc - top['c'][0], zc - top['c'][1]) / top['r']
            val = (top['apex_y'] - (top['apex_y'] - t['y0']) * np.clip(r, 0, 1)).astype(np.float32)
        elif top and top['kind'] == 'slope':
            a, bx, bz = top['plane']
            val = np.clip(a + bx * xc + bz * zc, t['y0'], t['y1']).astype(np.float32)
        out[m] = np.where(np.isnan(out[m]), val[m], np.maximum(out[m], val[m]))
    return out


# ---------------------------------------------------------------- fitting one building
def dropouts(r):
    """Cells more than 8 m under the 75th percentile of their 5 x 5 m neighbourhood: no-return cells filled from far
    below. The checks leave them out (and count them); they are neither filled nor scored."""
    f = fill_nan(r)
    return f < ndimage.percentile_filter(f, 75, size=5) - 8


def pit_fill(h, k):
    """LiDAR dropouts: on dark or glazed roofs many cells have no return and the gridding fills them from far below
    (Maine Tower: 45% of roof cells more than 15 m under the roof). A grey closing (dilate, then erode, k x k m) fills
    pits narrower than k and keeps step edges, planes and peaks. Returns the filled surface and the dropout mask."""
    f = fill_nan(h)
    c = ndimage.grey_closing(f, size=(k, k))
    c = ndimage.median_filter(c, size=3)
    return c, (f < c - 8) | np.isnan(h)


def composite_voids(c22, s20):
    """The 2022 composite fills cells the 2020 flight missed with values near the ground: One Canada Square has a
    10 m hole at the pyramid's apex that reads 9.9 m OD in the composite and NaN in 2020. A gap in 2020 whose rim is
    at least 8 m above its own composite values on 90% of the rim is such a hole in a roof: mark it as no data.
    Gaps beside walls (LiDAR shadow) keep the composite's ground values."""
    c = c22.copy()
    lab, n = ndimage.label(np.isnan(s20))
    for k in range(1, n + 1):
        hole = lab == k
        rim = ndimage.binary_dilation(hole, np.ones((3, 3))) & ~hole & np.isfinite(c22)
        if not rim.any(): continue
        if (c22[rim] > np.nanmedian(c22[hole]) + 8).mean() >= .9: c[hole] = np.nan
    return c


def fill_nan(a):
    bad = np.isnan(a)
    if not bad.any() or bad.all(): return a
    idx = ndimage.distance_transform_edt(bad, return_distances=False, return_indices=True)
    return a[tuple(idx)]


def iou(a, b):
    u = a.union(b).area
    return a.intersection(b).area / u if u else 0


def fit_top(H, cells, poly, dom, X0, Z0):
    """Fit a pyramid (apex searched within 4 m of the centre of the region's box along the dominant directions),
    a cone and a plane to the heights in `cells` under `poly`. Returns {kind: (kind, rmse, params, (low, high))}
    and the RMSE of a flat top."""
    zz, xx = np.nonzero(cells); h = H[zz, xx]; xc, zc = X0 + xx + .5, Z0 + zz + .5
    ca, sa = math.cos(dom), math.sin(dom)
    co = np.asarray(poly.exterior.coords); u = co[:, 0] * ca + co[:, 1] * sa; v = -co[:, 0] * sa + co[:, 1] * ca
    uc, vc = (u.min() + u.max()) / 2, (v.min() + v.max()) / 2; hu, hv = (u.max() - u.min()) / 2, (v.max() - v.min()) / 2
    fits = {}
    for du in np.arange(-4, 4.5, 1.0):
        for dv in np.arange(-4, 4.5, 1.0):
            c = ((uc + du) * ca - (vc + dv) * sa, (uc + du) * sa + (vc + dv) * ca)
            g = np.clip(gauge_rect(xc, zc, c, dom, hu, hv), 0, 1)
            Am = np.c_[np.ones_like(g), -g]; (A, sl), *_ = np.linalg.lstsq(Am, h, rcond=None)
            r = float(np.sqrt(np.mean((Am @ [A, sl] - h) ** 2)))
            if 'pyramid' not in fits or r < fits['pyramid'][1]:
                fits['pyramid'] = ('pyramid', r, dict(c=c, dom=dom, hu=hu, hv=hv), (A - sl, A))
    cen = poly.centroid; R = math.sqrt(poly.area / math.pi)
    for dx in np.arange(-4, 4.5, 1.0):
        for dz in np.arange(-4, 4.5, 1.0):
            c = (cen.x + dx, cen.y + dz); rr = np.clip(np.hypot(xc - c[0], zc - c[1]) / R, 0, 1)
            Am = np.c_[np.ones_like(rr), -rr]; (A2, s2), *_ = np.linalg.lstsq(Am, h, rcond=None)
            r = float(np.sqrt(np.mean((Am @ [A2, s2] - h) ** 2)))
            if 'cone' not in fits or r < fits['cone'][1]: fits['cone'] = ('cone', r, dict(c=c, r=R), (A2 - s2, A2))
    Am = np.c_[np.ones_like(xc), xc, zc]; pl, *_ = np.linalg.lstsq(Am, h, rcond=None); pred = Am @ pl
    lo, hi = np.percentile(pred, 1), np.percentile(pred, 99)
    fits['slope'] = ('slope', float(np.sqrt(np.mean((np.clip(pred, lo, hi) - h) ** 2))), dict(plane=[float(x) for x in pl]), (lo, hi))
    flat = float(np.sqrt(np.mean((h - np.median(h)) ** 2)))
    return fits, flat


def register(fp, H, top):
    """Shift (dx, dz) in whole metres, within SHIFT, that best lays the OSM outline over the DSM building (cells above
    half the roof). OSM outlines are traced from aerial photographs, where a tall building leans; the LiDAR is
    georeferenced to about 0.5 m."""
    hi = (H > .6 * top) & (H < 1.25 * top); best = (-1, 0, 0)
    zz, xx = np.nonzero(hi)
    if not zz.size: return 0, 0
    for dx in range(-SHIFT, SHIFT + 1):
        for dz in range(-SHIFT, SHIFT + 1):
            m = rasterize([shift(fp, dx, dz)], out_shape=H.shape, transform=Affine(1, 0, 0, 0, 1, 0)).astype(bool)
            j = (m & hi).sum() / (m | hi).sum()
            if j > best[0] + 1e-9 or (abs(j - best[0]) < 1e-9 and abs(dx) + abs(dz) < abs(best[1]) + abs(best[2])): best = (j, dx, dz)
    return best[1], best[2]


def shift(g, dx, dz):
    from shapely.affinity import translate
    return translate(g, dx, dz)


def fit_building(b, A, surveys, judge):
    J = judge.get(b['id'], {})
    mbs = [A['buildings'][i] for i in b['mi']]
    parts = [model_poly(m) for m in mbs]
    fp = unary_union(parts)
    big = max(range(len(mbs)), key=lambda k: parts[k].area)
    base = float(mbs[big]['b'])
    x0, z0, x1, z1 = fp.bounds
    pad = MARGIN + 9
    X0, Z0, X1, Z1 = int(math.floor(x0)) - pad, int(math.floor(z0)) - pad, int(math.ceil(x1)) + pad, int(math.ceil(z1)) + pad
    shp = (Z1 - Z0, X1 - X0); tr = Affine(1, 0, X0, 0, 1, Z0)
    raw = {sid: S.crop(X0, X1, Z0, Z1) for sid, S in surveys.items()}
    raw['2022c'] = composite_voids(raw['2022c'], raw['2020'])
    M_fp0 = rasterize([fp], out_shape=shp, transform=tr).astype(bool)
    # primary survey: the 2022 composite, or by judgement the 2018 flight where it saw the finished building with far
    # fewer dropouts (the 2020 flight speckled the glass towers by South Quay: Novotel 58% of roof cells, Dollar Bay 59%).
    # Dropouts fall on different cells in each flight, so a dropout cell of the primary takes the higher of the two.
    q = {k: np.nanpercentile(raw[k][M_fp0], [75, 90]) if np.isfinite(raw[k][M_fp0]).mean() > .8 else None for k in ('2022c', '2018')}
    same = q['2018'] is not None and abs(q['2022c'][1] - q['2018'][1]) < 3 and abs(q['2022c'][0] - q['2018'][0]) < 6
    dr = {k: float(dropouts(raw[k])[M_fp0].mean()) for k in ('2022c', '2018')}
    primary = J.get('primary', '2022c')   # an automatic switch picked Sirocco's 2018 roof, 35 m off 2020: judgement only
    other = '2018' if primary == '2022c' else '2022c'
    surface = raw[primary]; fused = False
    if same and J.get('fuse', dr[primary] > .15):   # NaN cells stay NaN: they are filled from their own neighbours
        surface = np.where(dropouts(raw[primary]) & np.isfinite(raw[primary]), np.fmax(raw[primary], raw[other]), raw[primary]); fused = True
    H, drop = pit_fill(surface - base, J.get('closing', CLOSING))
    expected = max(b.get('wh') or 0, b.get('h') or 0, b.get('mh') or 0)
    rec = dict(id=b['id'], name=b.get('n'), mi=b['mi'], base=base, ground=J.get('ground_m_od'), X0=X0, Z0=Z0, shape=shp,
               fused=fused, primary=primary)
    p90 = np.percentile(H[M_fp0], 90)
    if p90 < .5 * expected:
        # the survey (Dec 2020 at the latest) predates the building: extrude the OSM outline(s) at the model height
        rec['status'] = 'not_in_survey'
        rec['tiers'] = [dict(poly=p, y0=base + (m.get('mh') or 0), y1=base + m['h'], src='osm') for p, m in zip(parts, mbs)]
        rec['top'] = dict(kind='flat', note='not in the LiDAR (the latest flight in the 2022 composite is 12 Dec 2020): '
                          'the OSM outline at the model height, unmeasured')
        rec.update(raw=raw, H=H, M_fp=M_fp0, dropout=None, shift=None)
        return rec
    dx, dz = J.get('shift') or register(shift(fp, -X0, -Z0), H, p90)
    if dx or dz:
        parts = [shift(p, dx, dz) for p in parts]; fp = shift(fp, dx, dz)
    rec['shift'] = [dx, dz]
    M_fp = rasterize([fp], out_shape=shp, transform=tr).astype(bool)
    M_buf = rasterize([fp.buffer(CLIP)], out_shape=shp, transform=tr).astype(bool)
    core = ndimage.binary_erosion(M_fp, np.ones((3, 3)))
    if core.sum() < .5 * M_fp.sum(): core = M_fp
    dom = J.get('dom_deg'); dom = math.radians(dom) if dom is not None else dominant_angle(fp)
    rec.update(dom=dom, dropout=float(drop[M_fp].mean()))

    levels = [l for l in roof_levels(H[core & ~drop], pen=J.get('penalty', 2.0)) if l >= J.get('min_tier', MIN_TIER)]
    levels = sorted(levels + list(J.get('add_levels', [])))
    if J.get('levels'): levels = list(J['levels'])

    def regions_for(levels):
        out, prev = [], 0.0
        for L in levels:
            m = clean_mask((H >= (prev + L) / 2) & M_buf)
            lab, nl = ndimage.label(m)
            for q in range(1, nl + 1):
                comp = lab == q
                if (comp & M_fp).sum() < .5 * comp.sum(): m[comp] = False
            out.append(m); prev = L
        return out

    # prune levels that add no roof: a region the same as the next one up (only a wall between them), or one whose
    # own roof (cells not in the next region), opened 3 x 3, is smaller than 2 x MIN_FEATURE
    while True:
        regs = regions_for(levels); drop_k = None
        for k in range(len(levels) - 1):
            a, c = regs[k], regs[k + 1]
            own = ndimage.binary_opening(a & ~c, np.ones((3, 3))).sum()
            if (a & c).sum() / max(1, (a | c).sum()) > .92 or own < 2 * MIN_FEATURE: drop_k = k; break
        if drop_k is None: break
        levels.pop(drop_k)
    regs = [r for r in regs]
    tiers, prev = [], 0.0
    cands = parts + list(getattr(fp, 'geoms', [fp]))
    for k, L in enumerate(levels):
        polys = mask_to_polys(regs[k], X0, Z0)
        for p in (regularise(unary_union(polys), dom) if polys else []):
            src = 'dsm'
            if not p.interiors:
                best = max(cands, key=lambda q: iou(p, q))
                if iou(p, best) >= J.get('osm_iou', .95): p, src = Polygon(best.exterior.coords), 'osm'
            tiers.append(dict(poly=p, y0=base + prev, y1=base + L, src=src, k=k))
        prev = L
    rec['levels'] = levels

    # non-flat tops: try the region of each level from the top down; keep the largest region that a pyramid, cone
    # or plane explains clearly better than the steps do
    top = dict(kind='flat', note='flat roof' if len(levels) == 1 else f'{len(levels)} tiers, flat roofs')
    want = J.get('top'); best = None; dbg = []
    for j in range(len(levels) - 1, -1, -1):
        m = regs[j]
        polys = mask_to_polys(m, X0, Z0)
        if len(polys) != 1 or m.sum() < 40: continue
        p = polys[0]
        fits, flat = fit_top(H, m & ~drop, p, dom, X0, Z0)
        kind, rmse, prm, (lo, hi) = fits[want['kind']] if want else min(fits.values(), key=lambda f: f[1])
        steps = model_surface(dict(tiers=[t for t in tiers if t['k'] >= j]), X0, Z0, shp) - base
        sel = m & ~drop & np.isfinite(steps)
        step_rmse = float(np.sqrt(np.mean((steps[sel] - H[sel]) ** 2))) if sel.any() else flat
        dbg.append((j, round(levels[j], 1), {k: round(f[1], 2) for k, f in fits.items()}, round(flat, 2), round(step_rmse, 2), round(hi - lo, 1)))
        if want: ok = j == want.get('from', j)
        else: ok = hi - lo >= 6 and rmse < .6 * min(flat, step_rmse + 1) and rmse < 3
        if ok: best = (j, kind, rmse, prm, lo, hi, p, step_rmse)
    rec['dbg'] = dbg
    if best:
        j, kind, rmse, prm, lo, hi, p, step_rmse = best
        below = levels[j - 1] if j else 0.0
        poly = regularise(p, dom)[0]
        tiers = [t for t in tiers if t['k'] < j]
        eave = max(lo, below + .5)
        tiers.append(dict(poly=poly, y0=base + below, y1=base + eave, src='dsm', k=j))
        tt = dict(poly=poly, y0=base + eave, y1=base + hi, src='dsm', k=j + .5, top=dict(kind=kind))
        if kind in ('pyramid', 'cone'):
            tt['top'].update(prm, apex_y=base + hi)
            top = dict(kind=kind, apex=[r1(prm['c'][0]), r1(base + hi), r1(prm['c'][1])],
                       note=f'{kind} from {base + eave:.1f} to {base + hi:.1f} m OD over the last tier; fit RMSE {rmse:.1f} m, steps {step_rmse:.1f} m')
        else:
            a, bx, bz = prm['plane']
            tt['top']['plane'] = [a + base, bx, bz]
            az = math.degrees(math.atan2(bx, -bz)) % 360   # direction of the rise, clockwise from north (north is -z)
            top = dict(kind='slope', plane=[round(a + base, 2), round(bx, 4), round(bz, 4)],
                       note=f'last tier: y = a + b x + c z clipped to {base + eave:.1f}-{base + hi:.1f} m OD, rising towards {az:.0f} deg from north; '
                            f'fit RMSE {rmse:.1f} m, steps {step_rmse:.1f} m')
        tiers.append(tt)
    elif sum(l >= levels[-1] - CROWN for l in levels) >= 2:
        n = sum(l >= levels[-1] - CROWN for l in levels)
        top = dict(kind='crown', note=f'stepped top: {n} roof levels within {CROWN:.0f} m of the top, '
                                      f'{base + min(l for l in levels if l >= levels[-1] - CROWN):.1f} to {base + levels[-1]:.1f} m OD')
    if J.get('top_kind'): top['kind'] = J['top_kind']
    if J.get('top_note'): top['note'] = J['top_note']
    rec.update(status='fitted', tiers=tiers, top=top, raw=raw, H=H, M_fp=M_fp, drop=drop)
    return rec


def r1(v): return round(float(v), 1)


# ---------------------------------------------------------------- checks
def check(rec, b, reg):
    base, X0, Z0, shp, M_fp = rec['base'], rec['X0'], rec['Z0'], rec['shape'], rec['M_fp']
    surf = model_surface(rec, X0, Z0, shp)
    rec['surf'] = surf
    region = M_fp | np.isfinite(surf)
    model = np.where(np.isfinite(surf), surf, base)
    wall = lambda a: (ndimage.maximum_filter(a, 3) - ndimage.minimum_filter(a, 3)) > 3   # 1 m either side of a wall
    roof = region & ~wall(model) & ~wall(rec['H'])   # walls of the model and of the dropout-filled DSM
    bld = (rec['H'] >= MIN_TIER) & ndimage.binary_dilation(M_fp, np.ones((7, 7)))
    out_iou = float((bld & np.isfinite(surf)).sum() / max(1, (bld | np.isfinite(surf)).sum()))
    top_m = max(t['y1'] for t in rec['tiers']) - base
    out = {}
    pri = rec.get('primary') or '2022c'
    filled_q = lambda r: np.percentile(pit_fill(r - base, 5)[0][M_fp], [60, 90])
    q_p = filled_q(rec['raw'][pri])
    out['survey'] = pri
    keys = [(pri, 'rmse_m')] + [(k, n) for k, n in (('2022c', 'rmse_2022_m'), ('2020', 'rmse_2020_m'), ('2018', 'rmse_2018_m')) if k != pri]
    for sid, key in keys:
        r = rec['raw'][sid]
        if not np.isfinite(r[M_fp]).any(): out[key] = None; continue
        if sid != pri and np.any(filled_q(r) < .85 * q_p):
            out[key] = None; out.setdefault('surveys_before_completion', []).append(sid); continue   # not finished then
        drop = dropouts(r)
        sel = roof & np.isfinite(r) & ~drop
        e = model[sel] - r[sel]
        out[key] = round(float(np.sqrt(np.mean(e * e))), 1)
        if sid == pri:
            out['p95_m'] = round(float(np.percentile(np.abs(e), 95)), 1)
            sel = region & np.isfinite(r); e = model[sel] - r[sel]
            out['rmse_raw_m'] = round(float(np.sqrt(np.mean(e * e))), 1)
            out['dropout_pct'] = round(100 * float((drop | np.isnan(r))[roof].mean()))
            out['outline_iou'] = round(out_iou, 2)
    r = rec['raw']['2022c'][M_fp]
    if rec.get('fused'): out['dropouts_filled_from'] = '2018' if pri == '2022c' else '2022c'
    out['dsm_max_m'] = round(float(np.nanmax(r) - base), 1) if np.isfinite(r).any() else None
    out['model_top_m'] = round(top_m, 1)
    if rec.get('shift') is not None: out['shift_m'] = rec['shift']
    if rec.get('ground') is not None:
        out['ground_m_od'] = rec['ground']; out['model_top_above_ground_m'] = round(top_m + base - rec['ground'], 1)
    out['wikidata_height_m'] = b.get('wh')
    out['osm_height_m'] = b.get('h')
    # OSM building:part heights against the DSM inside the matching model building (matched by the part's height)
    parts = [p for p in (reg.get('parts') or []) if p.get('height')]
    rows = []
    tr = Affine(1, 0, X0, 0, 1, Z0)
    for p in parts:
        for i in b['mi']:
            mb = A_GLOBAL['buildings'][i]
            if abs(mb['h'] - p['height']) < .05 and abs((mb.get('mh') or 0) - (p.get('min_height') or 0)) < .05:
                m = rasterize([shift(model_poly(mb), *(rec.get('shift') or (0, 0)))], out_shape=shp, transform=tr).astype(bool)
                c = ndimage.binary_erosion(m, np.ones((3, 3)))
                if c.sum() < 4: c = m
                v = rec['raw']['2022c'][c & ~dropouts(rec['raw']['2022c'])]; v = v[np.isfinite(v)]
                if v.size: rows.append([p['osm'], p['height'], round(float(np.percentile(v, 90) - mb['b']), 1)])
                break
    if rows:
        out['osm_parts'] = rows
        out['osm_parts_agree'] = all(abs(r_[1] - r_[2]) <= 5 for r_ in rows)
    else: out['osm_parts_agree'] = None
    if rec['status'] == 'not_in_survey':
        for k in ('rmse_m', 'p95_m', 'rmse_raw_m', 'dropout_pct', 'outline_iou', 'rmse_2020_m', 'rmse_2018_m', 'rmse_2022_m', 'survey'): out.pop(k, None)
        out['surveys_before_completion'] = ['2022c', '2020', '2018']
    return out


def picture(rec, chk, scale_to=170):
    raw = rec['raw']['2022c'] - rec['base']; surf = rec['surf'] - rec['base']
    vmax = max(np.nanmax(raw) if np.isfinite(raw).any() else 1, np.nanmax(surf) if np.isfinite(surf).any() else 1)
    sc = max(1, int(scale_to / max(raw.shape)))
    a = shaded(raw, vmax, sc).convert('RGB'); bimg = shaded(np.where(np.isfinite(surf), surf, 0), vmax, sc).convert('RGB')
    W, Hh = a.width * 2 + 6, a.height + 26
    im = Image.new('RGB', (W, Hh), (0, 0, 0)); im.paste(a, (0, 26)); im.paste(bimg, (a.width + 6, 26))
    d = ImageDraw.Draw(im)
    cols = [(255, 80, 80), (80, 255, 255), (255, 80, 255), (255, 255, 80), (120, 255, 120), (255, 160, 60), (160, 160, 255)]
    for k, t in enumerate(sorted(rec['tiers'], key=lambda t: t['y1'])):
        for ring in [t['poly'].exterior] + list(t['poly'].interiors):
            pts = [((x - rec['X0']) * sc + a.width + 6, (z - rec['Z0']) * sc + 26) for x, z in ring.coords]
            d.line(pts, fill=cols[k % len(cols)], width=1)
            pts = [((x - rec['X0']) * sc, (z - rec['Z0']) * sc + 26) for x, z in ring.coords]
            d.line(pts, fill=cols[k % len(cols)], width=1)
    rm = chk.get('rmse_m')
    d.text((2, 1), f"{rec['id']} {(rec['name'] or '')[:22]}", fill=(255, 255, 255))
    d.text((2, 13), f"{rec['top']['kind']} {len(rec['tiers'])}t top {chk['model_top_m']} m  rmse {rm if rm is not None else '-'}", fill=(200, 200, 200))
    return im


# ---------------------------------------------------------------- judgement (hand corrections, each with its reason)
JUDGEMENT = {
    'cwb-0701': dict(primary='2018', why='Novotel: the 2020 flight has no return on 58% of the roof cells; the 2018 flight '
                     '(the hotel opened in 2017) has 39%, and its fit agrees with 2018 to 3.4 m RMSE against 7.9 m with 2020.'),
    'cwb-0737': dict(primary='2018', why='Dollar Bay: the 2020 flight speckles the faceted glass top (59% dropouts); the 2018 '
                     'flight (building finished 2017) gives a fit with 7.1 m RMSE against 15.3 m. Still the weakest fit here.'),
    'cwb-0801': dict(add_levels=[6.5, 21.5], why='Pan Peninsula: the mixture put the podium and the six-storey link '
                     '(DSM 6 to 22 m) in one cluster with the ground (median 7.8 m, under the 8 m floor), so the podium '
                     'was missing; levels 6.5 and 21.5 m read off the height histogram were added by hand.'),
    'cwb-0417': dict(ground_m_od=9.7, why='8 Canada Square: the model base (1.6 m OD) is the DTM interpolated under the '
                     'building from the dock edge; Canada Square plaza is 9.7 m OD (DTM round One Canada Square), so '
                     'the height check uses 9.7. The tiers keep the model base as their foot.'),
}
SKIP = {
    'cwb-0418': 'Same model buildings as cwb-0417 (8 Canada Square): OSM way/183242123, an untagged outline over the '
                'tower, joined to the same 3D parts. A registry identity fault, not a second tower; see cwb-0417.',
    'cwb-0523': 'Not a tower. OSM way/140235964 has three building:parts tagged 2 levels beside 25 Churchill Place; '
                'the model gives two thin parts 123.7 m and 77.1 m because their outlines lie over the tower wall in '
                'the LiDAR (90th percentile of the DSM). The DSM inside the outline is 11 m (median).',
}
REFERENCES = [   # massing and plan sources for the tallest ten, found 2026-10-03; listed for reference only, nothing copied
    {'buildings': ['cwb-0577'], 'title': 'GLA planning report PDU/2187b & 2188b, 21 March 2013, City Pride (now Landmark '
     'Pinnacle): 75-storey tower, 239 m AOD', 'url': 'https://www.london.gov.uk/sites/default/files/public://public://PAWS/media_id_117631///city_pride_and_island_point_westferry_road_report.pdf',
     'licence': '(c) Greater London Authority; no open licence stated in the report', 'checked': 'model top 238.6 m OD against 239 m AOD stated'},
    {'buildings': ['cwb-0451'], 'title': 'GLA planning report PDU/2110/02, 12 November 2008, Newfoundland (an earlier '
     'scheme; the built tower is Tower Hamlets PA/13/01455 and PA/13/01456, 2013)', 'url': 'https://www.london.gov.uk/sites/default/files/public://public://PAWS/media_id_108478///newfoundland_report.pdf',
     'licence': '(c) Greater London Authority; no open licence stated'},
    {'buildings': ['cwb-0590', 'cwb-0715', 'cwb-0712'], 'title': 'Tower Hamlets PA/13/02966, Wood Wharf outline consent '
     '(2014): parameter plans WWMP_PP_010 "Development plots & maximum heights", WWMP_PP_003 "Development zones", '
     'Design & Access Statement vol. 4 "Indicative scheme"; plot reserved matters for One Park Drive (A1) follow',
     'url': 'https://web.archive.org/web/20250219122927/https://development.towerhamlets.gov.uk/online-applications/applicationDetails.do?activeTab=documents&keyVal=DCAPR_108309',
     'licence': 'applicant copyright, published for planning consultation; not open', 'access': 'the council portal '
     'disallows all robots (robots.txt "Disallow: /"): not fetched; the document list was read from the Internet Archive copy of 2025-02-19'},
    {'buildings': ['cwb-0590', 'cwb-0715', 'cwb-0712'], 'title': 'GLA case 2208e, Wood Wharf, Prestons Road (Stage 2 report)',
     'url': 'https://www.london.gov.uk/what-we-do/planning/planning-applications-and-decisions/planning-application-search/wood-wharf-prestons-road-0',
     'licence': '(c) Greater London Authority; not fetched'},
    {'buildings': ['cwb-0645', 'cwb-0647'], 'title': 'Tower Hamlets Strategic Development Committee, Arrowhead Quay (Wardian), approved November 2014',
     'url': 'https://democracy.towerhamlets.gov.uk/mgAi.aspx?ID=9744', 'licence': 'council report; not open',
     'access': 'behind an Azure WAF JavaScript challenge: not bypassed, not fetched'},
    {'buildings': ['cwb-0737'], 'title': 'GLA planning report PDU/2318a/02, 27 March 2012, 1-18 Dollar Bay Court',
     'url': 'https://www.london.gov.uk/sites/default/files/public://public://PAWS/media_id_138176///1-18_dollar_bay_court_isle_of_dogs_report.pdf',
     'licence': '(c) Greater London Authority; no open licence stated'},
    {'buildings': ['cwb-0413', 'cwb-0417', 'cwb-0520', 'cwb-0813'], 'title': 'None found. One Canada Square (1991), 8 '
     'Canada Square (2002) and Citigroup Centre (2001) were consented under the LDDC Enterprise Zone regime and have no '
     'online planning file; Amory Tower (Tower Hamlets, Make Architects) has a committee report but no open drawings found.',
     'url': None},
]


# ---------------------------------------------------------------- main
def main():
    global A_GLOBAL
    ap = argparse.ArgumentParser(); ap.add_argument('--only'); ap.add_argument('--no-write', action='store_true')
    args = ap.parse_args()
    A = A_GLOBAL = load_area()
    atlas = json.loads((CW / 'atlas/data/atlas.json').read_text())
    reg = {r['id']: r for r in json.loads((CW / 'registry/buildings.json').read_text())['buildings']}
    surveys = {sid: Survey(sid) for sid in SURVEYS}
    targets = [b for b in atlas['buildings'] if max(b.get('wh') or 0, b.get('h') or 0, b.get('mh') or 0) >= 100]
    only = set(args.only.split(',')) if args.only else None
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    out, pics, skipped = {}, [], {}
    for b in targets:
        if only and b['id'] not in only: continue
        if b['id'] in SKIP: skipped[b['id']] = SKIP[b['id']]; continue
        rec = fit_building(b, A, surveys, JUDGEMENT)
        chk = check(rec, b, reg[b['id']])
        im = picture(rec, chk); im.save(OUT_IMG / f"{b['id']}.png"); pics.append(im)
        tiers = []
        for t in sorted(rec['tiers'], key=lambda t: (t['y0'], -t['poly'].area)):
            ring = lambda r: [[r1(x), r1(z)] for x, z in list(r.coords)[:-1]]
            e_t = dict(ring=ring(t['poly'].exterior), y0=r1(t['y0']), y1=r1(t['y1']), src=t['src'])
            if t['poly'].interiors: e_t['holes'] = [ring(h) for h in t['poly'].interiors]
            tiers.append(e_t)
        e = dict(name=rec['name'] or reg[b['id']].get('name'), model_buildings=b['mi'], base_m_od=r1(rec['base']),
                 status=rec['status'], tiers=tiers, top=rec['top'], checks=chk)
        if b['id'] in JUDGEMENT and JUDGEMENT[b['id']].get('why'): e['corrected_by_judgement'] = JUDGEMENT[b['id']]['why']
        out[b['id']] = e
        print(f"{b['id']} {str(e['name'])[:28]:28s} {rec['status']:13s} tiers {len(tiers)} top {rec['top']['kind']:7s} "
              f"model {chk['model_top_m']:6} dsm {chk['dsm_max_m']} wd {chk['wikidata_height_m']} osm {chk['osm_height_m']} "
              f"{chk.get('survey')} rmse {chk.get('rmse_m')} p95 {chk.get('p95_m')} raw {chk.get('rmse_raw_m')} drop {chk.get('dropout_pct')} r20 {chk.get('rmse_2020_m')} r18 {chk.get('rmse_2018_m')} r22 {chk.get('rmse_2022_m')} parts {chk.get('osm_parts')}", flush=True)
    if pics:
        cw = max(p.width for p in pics); ch = max(p.height for p in pics); n = 4
        sheet = Image.new('RGB', (n * cw, ((len(pics) + n - 1) // n) * ch), (0, 0, 0))
        for k, p in enumerate(pics): sheet.paste(p, ((k % n) * cw, (k // n) * ch))
        sheet.save(OUT_IMG / ('contact.png' if not only else 'contact-only.png'))
    if args.no_write or only: return
    doc = dict(
        about='Tiered geometry of the Canary Wharf towers of 100 m or more (registry buildings), measured from the '
              'Environment Agency 1 m first-return LiDAR surface model, to replace footprint extrusions in the 3D model. '
              'Built by cwplans/tools/build-towers.py; do not edit by hand.',
        coordinates='x = E - 537550, z = -(N - 180300) (north is -z), y = metres above Ordnance Datum Newlyn; rings in local metres, 0.1 m',
        method=METHOD, sources=SOURCES, references=REFERENCES, skipped=skipped, buildings=out)
    txt = json.dumps(doc, separators=(',', ':'), ensure_ascii=False)
    txt = txt.replace('},"cwb-', '},\n"cwb-')
    (CW / 'docklands/data/towers.json').write_text(txt + '\n')
    print('wrote docklands/data/towers.json', len(out), 'buildings', len(txt) // 1024, 'KB')


METHOD = [
    'Surface: EA LiDAR first-return DSM, 1 m. Primary survey: the 2022 composite (it merges the flights of 2017-12-07 to '
    '2018-01-24 and 2020-12-12; nothing newer), or the 2018 flight where judgement says so (corrected_by_judgement). '
    'Composite cells that 2020 left empty and the composite filled from near the ground (a gap whose rim is 8 m higher) '
    'are no data. Dropouts (cells 8 m under the 75th percentile of their 5 x 5 m) are filled by a 3 x 3 m grey closing; '
    'where the primary has a dropout and the other survey saw the same building, the higher value is used.',
    'Footprint: the union of the model buildings (OSM outlines and building:parts) of the registry building, shifted by '
    'whole metres (at most 4) onto the LiDAR building (checks.shift_m); tiers stay within it plus 2.5 m.',
    'Levels: a 1-D Gaussian mixture over the roof heights inside the footprint (dropouts out), k by BIC + 2 k ln n; '
    'levels closer than 3 m merge; levels under 8 m above the base are ground. A level whose region (cells above the '
    'midpoint to the level below) matches the next region up (IoU > 0.92), or adds under 32 m2 of roof, is dropped.',
    'Outlines: each region is opened and closed 3 x 3, holes under 60 m2 and pieces under 16 m2 (about 4 x 4 m: masts, '
    'plant, cranes) removed, traced by marching squares, simplified by Douglas-Peucker (0.8 m) and its edges snapped to '
    'the footprint\'s dominant direction (or at right angles) when within 8 degrees. A ring within IoU 0.95 of an OSM '
    'outline is replaced by that outline (src "osm"); others are src "dsm".',
    'Tiers are stacked prisms: ring from y0 to y1 (m OD). Larger openings in a roof region are kept as holes.',
    'Non-flat tops: for each level from the top down, a pyramid (apex searched within 4 m), a cone and a plane are fitted '
    'to the region above it; the largest region where the best fit rises 6 m or more and has under 60% of the RMSE of '
    'the steps (and under 3 m) replaces the tiers above it: a wall tier to the eave, then a last tier whose top is the '
    'pyramid (apex), cone (apex) or plane (y = a + b x + c z clipped to y0..y1). "crown": two or more roof levels within '
    '12 m of the top.',
    'Checks: the model rasterised at 1 m (cell centres) against each survey. rmse_m and p95_m (absolute error): roof '
    'cells only (no wall within 1 m in the model or in the filled DSM; dropouts left out) against the primary survey; '
    'rmse_raw_m: every cell of the footprint and model, walls and dropouts included; dropout_pct: share of roof cells '
    'with no good return; outline_iou: model plan against the LiDAR building (cells above 8 m) near the footprint. '
    'rmse_2020_m / rmse_2018_m / rmse_2022_m: the same roof RMSE against another survey, null when that survey shows the '
    'building unfinished (surveys_before_completion). The 2022 composite is largely the 2020 flight, so rmse_2020_m is '
    'not an independent check; rmse_2018_m is, for buildings finished by January 2018.',
    'dsm_max_m: the highest DSM cell in the footprint above the base, masts included; a spire or mast thinner than '
    '1 m is often missing at 1 m. model_top_m: the top of the last tier above the base. Heights above base_m_od, the '
    'model building\'s base (LiDAR DTM); where that is wrong, ground_m_od gives the street level used instead.',
    'status "not_in_survey": the building was not finished on 12 Dec 2020; its tiers are the OSM outlines at the model '
    'height, unmeasured.',
]
SOURCES = [
    {'id': 'lidar-dsm', 'text': 'Environment Agency LiDAR Composite First Return DSM 2022 (1 m) and National LiDAR '
     'Programme DSM 2018 and 2020 (1 m). (c) Environment Agency copyright and/or database right. Open Government '
     'Licence v3.0', 'url': 'https://environment.data.gov.uk/survey'},
    {'id': 'osm', 'text': '(c) OpenStreetMap contributors, ODbL 1.0: footprints and building:part heights (via the '
     '3D model, docklands/data/area.js, and the registry)', 'url': 'https://www.openstreetmap.org/copyright'},
    {'id': 'wikidata', 'text': 'Wikidata heights (CC0), via atlas/data/atlas.json', 'url': 'https://www.wikidata.org/'},
]


if __name__ == '__main__':
    main()
