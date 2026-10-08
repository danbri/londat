#!/usr/bin/env python3
# Roof shape of every low model building from the Environment Agency 1 m LiDAR: the first-return DSM minus the building's
# model ground (area.js b), sampled at the 1 m cells whose centres lie inside the outline and at least --inset metres from
# its edges, then four roof models fitted by robust least squares in the outline's minimum-area rectangle: flat, gable with
# the ridge along the long side, gable with the ridge along the short side (each with the ridge offset searched within 30 %
# of the span, for a house with a rear extension), hipped (equal pitch on all four sides; a square
# outline gives a pyramid). Writes one JSON with the measurement of each building (shape, ridge bearing, centre, spans,
# eave and ridge above the model ground, the fit errors). Called by tools/build-roofs.mjs (logged operation build-roofs).
#   python3 cwplans/tools/lidar-roofs.py <area.js> --dsm <zip> ... --dtm <zip> ... --out <file.json> [--hmax 25] [--inset 0.75]
# Tiles: EA survey download service, 5 km zips (lidar_composite_first_return_dsm/2022/1, lidar_composite_dtm/2022/1), read
# from the zips as they were downloaded (OGL v3.0). Needs numpy and tifffile (pip install tifffile imagecodecs).
# Skill: docklands-3d-page, "Roof shapes".
import sys, json, zipfile, io, re, warnings, logging
import numpy as np, tifffile
warnings.filterwarnings('ignore'); logging.disable(logging.CRITICAL)

a = sys.argv[1:]
def opt(name, default=None):
    return a[a.index(name) + 1] if name in a else default
def many(name):
    out, on = [], False
    for x in a:
        if x.startswith('--'): on = x == name; continue
        if on: out.append(x)
    return out
area, out = a[0], opt('--out'); HMAX, INSET = float(opt('--hmax', 25)), float(opt('--inset', 0.75))
dsms, dtms = many('--dsm'), many('--dtm')

txt = open(area).read(); A = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])
E0, N0 = A['meta']['origin']['E0'], A['meta']['origin']['N0']

# ---- mosaic of the tiles (1 m cells; cell (r, c) centre at E = ME + c + 0.5, N = MN - r - 0.5)
def tiles(zips):
    out = []
    for z in zips:
        Z = zipfile.ZipFile(z); tif = [n for n in Z.namelist() if n.endswith('.tif')][0]; tfw = tif[:-4] + '.tfw'
        t = [float(v) for v in Z.read(tfw).decode().split()]
        assert t[0] == 1 and t[3] == -1, 'expects 1 m cells'
        out.append((tifffile.imread(io.BytesIO(Z.read(tif))).astype(np.float32), t[4] - .5, t[5] + .5))
    return out
def mosaic(zips):
    T = tiles(zips); e0 = min(t[1] for t in T); n1 = max(t[2] for t in T)
    e1 = max(t[1] + t[0].shape[1] for t in T); n0 = min(t[2] - t[0].shape[0] for t in T)
    M = np.full((int(n1 - n0), int(e1 - e0)), np.nan, np.float32)
    for g, e, n in T:
        r, c = int(n1 - n), int(e - e0); M[r:r + g.shape[0], c:c + g.shape[1]] = g
    M[M < -100] = np.nan
    return M, e0, n1
DSM, ME, MN = mosaic(dsms); DTM, ME2, MN2 = mosaic(dtms)
assert (ME, MN) == (ME2, MN2) and DSM.shape == DTM.shape, 'DSM and DTM tiles must cover the same cells'

def ring_of(p, start, end):
    acc = [0, 0]; pts = []
    for k, q in enumerate(p):
        acc[k % 2] += q
        if k % 2: pts.append((acc[0] / 10, acc[1] / 10))
    return pts[start:end]
def hull(P):
    P = sorted(set(P))
    if len(P) < 3: return P
    def half(seq):
        h = []
        for p in seq:
            while len(h) >= 2 and (h[-1][0] - h[-2][0]) * (p[1] - h[-2][1]) - (h[-1][1] - h[-2][1]) * (p[0] - h[-2][0]) <= 0: h.pop()
            h.append(p)
        return h
    lo, up = half(P), half(P[::-1]); return lo[:-1] + up[:-1]
def min_rect(EN):
    """minimum-area rectangle: (centre, unit long axis, long length, short length)"""
    H = np.array(hull([tuple(p) for p in EN])); best = None
    for i in range(len(H)):
        d = H[(i + 1) % len(H)] - H[i]; l = np.hypot(*d)
        if l < 1e-6: continue
        u = d / l; v = np.array([-u[1], u[0]]); s, t = H @ u, H @ v
        ar = (s.max() - s.min()) * (t.max() - t.min())
        if best is None or ar < best[0]: best = (ar, u, v, s.min(), s.max(), t.min(), t.max())
    _, u, v, s0, s1, t0, t1 = best
    c = u * (s0 + s1) / 2 + v * (t0 + t1) / 2; Ls, Lt = s1 - s0, t1 - t0
    if Lt > Ls: u, v, Ls, Lt = v, -u, Lt, Ls
    return c, u, Ls, Lt
def inside(X, Y, R):
    """even-odd test and distance to the nearest edge, for points X, Y and a closed ring R (n x 2)"""
    x0, y0 = R[:, 0][None, :], R[:, 1][None, :]; x1, y1 = np.roll(R[:, 0], -1)[None, :], np.roll(R[:, 1], -1)[None, :]
    Xc, Yc = X[:, None], Y[:, None]
    cross = ((y0 > Yc) != (y1 > Yc)) & (Xc < (x1 - x0) * (Yc - y0) / np.where(y1 == y0, 1e-12, y1 - y0) + x0)
    ins = cross.sum(1) % 2 == 1
    dx, dy = x1 - x0, y1 - y0; L2 = np.maximum(dx * dx + dy * dy, 1e-12)
    t = np.clip(((Xc - x0) * dx + (Yc - y0) * dy) / L2, 0, 1); d = np.hypot(Xc - x0 - t * dx, Yc - y0 - t * dy).min(1)
    return ins, d
def robust(Xm, h):
    """least squares, then once more without the cells off by more than max(0.3 m, 2.5 robust sigma)"""
    p = np.linalg.lstsq(Xm, h, rcond=None)[0]; r = h - Xm @ p
    s = max(.3, 2.5 * 1.4826 * np.median(np.abs(r - np.median(r))))
    keep = np.abs(r) <= s
    if keep.sum() >= Xm.shape[1] + 3: p = np.linalg.lstsq(Xm[keep], h[keep], rcond=None)[0]; r = h - Xm @ p
    return p, float(np.median(np.abs(r))), float(np.sqrt(np.mean(np.minimum(r * r, 4.0))))

res = {'hmax': HMAX, 'inset': INSET, 'mosaic': {'E0': ME, 'Ntop': MN, 'shape': list(DSM.shape)}, 'buildings': {}}
counts = {}
for i, b in enumerate(A['buildings']):
    if b['h'] > HMAX or b.get('mh') or b.get('holes'): continue
    R = np.array([(E0 + x, N0 - z) for x, z in ring_of(b['p'], 0, None)])
    e0, e1, n0, n1 = R[:, 0].min(), R[:, 0].max(), R[:, 1].min(), R[:, 1].max()
    c0, c1 = int(np.floor(e0 - ME)), int(np.ceil(e1 - ME)); r0, r1 = int(np.floor(MN - n1)), int(np.ceil(MN - n0))
    if c0 < 0 or r0 < 0 or c1 >= DSM.shape[1] or r1 >= DSM.shape[0]: counts['outside'] = counts.get('outside', 0) + 1; continue
    cc, rr = np.meshgrid(np.arange(c0, c1 + 1), np.arange(r0, r1 + 1)); cc, rr = cc.ravel(), rr.ravel()
    X, Y = ME + cc + .5, MN - rr - .5
    ins, d = inside(X, Y, R); sel = ins & (d >= INSET)
    c, u, Ls, Lt = min_rect(R)
    if u[0] < 0 or (u[0] == 0 and u[1] < 0): u = -u   # bearing of u in [0, 180): the signed ridge offsets below are along this u
    v = np.array([-u[1], u[0]])
    rec = {'n': int(sel.sum()), 'c': [round(float(c[0]), 2), round(float(c[1]), 2)], 'bearing': round(float(np.degrees(np.arctan2(u[0], u[1]))), 3),
           'L': round(float(Ls), 2), 'W': round(float(Lt), 2), 'base': b['b'], 'model_h': b['h']}
    gr = DTM[rr[ins], cc[ins]]; rec['dtm_minus_base'] = round(float(np.nanmedian(gr) - b['b']), 2) if np.isfinite(gr).any() else None
    h = DSM[rr[sel], cc[sel]] - b['b']; ok = np.isfinite(h); h = h[ok]
    if h.size < 8: rec['shape'] = 'nodata'; res['buildings'][i] = rec; counts['nodata'] = counts.get('nodata', 0) + 1; continue
    s = (X[sel][ok] - c[0]) * u[0] + (Y[sel][ok] - c[1]) * u[1]; t = (X[sel][ok] - c[0]) * v[0] + (Y[sel][ok] - c[1]) * v[1]
    one = np.ones_like(h); Lr = max(0., Ls - Lt) / 2
    def gable(w, span):   # ridge at offset o from the middle (searched in 0.5 m steps within 30 % of the span); p = [ridge, slope, o]
        best = None
        for o in np.arange(-np.floor(.3 * span / .5) * .5, .3 * span + 1e-9, .5):
            f = robust(np.stack([one, -np.abs(w - o)], 1), h)
            if best is None or f[1] < best[1] - 1e-9 or (abs(f[1] - best[1]) < 1e-9 and abs(o) < abs(best[0][2])): best = (np.append(f[0], o), f[1], f[2])
        return best
    fits = {'flat': robust(one[:, None], h),
            'gable_long': gable(t, Lt),       # ridge along the long axis, slopes across it
            'gable_short': gable(s, Ls),      # ridge along the short axis
            'hipped': robust(np.stack([one, -np.maximum(np.abs(t), np.abs(s) - Lr)], 1), h)}
    rec['fit'] = {k: {'p': [round(float(x), 3) for x in f[0]], 'mad': round(f[1], 3), 'rms': round(f[2], 3)} for k, f in fits.items()}
    rec['p90'] = round(float(np.percentile(h, 90)), 2); rec['p10'] = round(float(np.percentile(h, 10)), 2)
    res['buildings'][i] = rec; counts['measured'] = counts.get('measured', 0) + 1
res['counts'] = counts
json.dump(res, open(out, 'w'), separators=(',', ':'))
print(json.dumps({'out': out, **counts}))
