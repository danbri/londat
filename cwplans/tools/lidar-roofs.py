#!/usr/bin/env python3
# Roof shape of every low model building from the Environment Agency 1 m LiDAR: the first-return DSM minus the building's
# model ground (area.js b), sampled at the 1 m cells whose centres lie inside the outline and at least --inset metres from
# its edges, then roof models fitted by robust least squares in the outline's minimum-area rectangle: flat, gable with
# the ridge along the long side, gable with the ridge along the short side (each with the ridge offset searched within 30 %
# of the span), hipped (equal pitch on all four sides; a square outline gives a pyramid), and one inclined plane (a
# skillion). An outline that is not a rectangle (an L, a T, wings, a house with a rear outrigger) is also cut into parts
# with chords from its reflex corners (the extension of an edge to the first edge it meets), each part fitted the same
# way; the cuts are given as (piece, edge, fraction, edge, fraction) on the page's ring (x, z in metres), so that
# docklands/roofs-layer.js makes the same pieces. Writes one JSON with the measurement of each building (shape, ridge
# bearing, centre, spans, eave and ridge above the model ground, the fit errors, the parts). Called by
# tools/build-roofs.mjs (logged operation build-roofs).
#   python3 cwplans/tools/lidar-roofs.py <area.js> --dsm <zip> ... --dtm <zip> ... --out <file.json> [--hmax 25] [--inset 0.75]
#     [--only i,j,k] (only those model indices: for checks)
# Tiles: EA survey download service, 5 km zips (lidar_composite_first_return_dsm/2022/1, lidar_composite_dtm/2022/1), read
# from the zips as they were downloaded (OGL v3.0). Needs numpy and tifffile (pip install tifffile imagecodecs).
# Skill: docklands-3d-page, "Roof shapes".
import sys, json, zipfile, io, warnings, logging
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
ONLY = set(int(x) for x in opt('--only', '').split(',') if x)
dsms, dtms = many('--dsm'), many('--dtm')
# the cut rules (also in the output, 'cut_rules')
CUT = {'rect_ok': 0.9, 'min_area': 10.0, 'min_width': 2.0, 'reflex_deg': 20.0, 'snap_m': 0.3, 'max_parts': 10, 'inset_cut': 0.4,
       'tie_m2': 2.0, 'tie_share': 0.05, 'tie_max': 4, 'min_cells': 8, 'long_edge_m': 3.0, 'parallel_deg': 12.0}

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

def ring_xz(p):
    """the page ring: x, z in metres (area.js: delta-coded decimetres)"""
    acc = [0, 0]; pts = []
    for k, q in enumerate(p):
        acc[k % 2] += q
        if k % 2: pts.append((acc[0] / 10, acc[1] / 10))
    return pts
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
def area_of(P):
    x, y = np.array(P)[:, 0], np.array(P)[:, 1]; return float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y) / 2)
def inside(X, Y, R, flags=None):
    """even-odd test, distance to the nearest outer edge and to the nearest cut edge (flags True), for a closed ring R (n x 2)"""
    x0, y0 = R[:, 0][None, :], R[:, 1][None, :]; x1, y1 = np.roll(R[:, 0], -1)[None, :], np.roll(R[:, 1], -1)[None, :]
    Xc, Yc = X[:, None], Y[:, None]
    cross = ((y0 > Yc) != (y1 > Yc)) & (Xc < (x1 - x0) * (Yc - y0) / np.where(y1 == y0, 1e-12, y1 - y0) + x0)
    ins = cross.sum(1) % 2 == 1
    dx, dy = x1 - x0, y1 - y0; L2 = np.maximum(dx * dx + dy * dy, 1e-12)
    t = np.clip(((Xc - x0) * dx + (Yc - y0) * dy) / L2, 0, 1); D = np.hypot(Xc - x0 - t * dx, Yc - y0 - t * dy)
    f = np.zeros(R.shape[0], bool) if flags is None else np.array(flags, bool)
    big = np.full(len(X), 1e9)
    return ins, (D[:, ~f].min(1) if (~f).any() else big), (D[:, f].min(1) if f.any() else big)
def robust(Xm, h):
    """least squares, then once more without the cells off by more than max(0.3 m, 2.5 robust sigma)"""
    p = np.linalg.lstsq(Xm, h, rcond=None)[0]; r = h - Xm @ p
    s = max(.3, 2.5 * 1.4826 * np.median(np.abs(r - np.median(r))))
    keep = np.abs(r) <= s
    if keep.sum() >= Xm.shape[1] + 3: p = np.linalg.lstsq(Xm[keep], h[keep], rcond=None)[0]; r = h - Xm @ p
    return p, float(np.median(np.abs(r))), float(np.sqrt(np.mean(np.minimum(r * r, 4.0))))

# ---- pieces: the same split as roofs-layer.js (pieces(), splitRing()); points are page x, z
def split_ring(P, F, j1, t1, j2, t2):
    n = len(P)
    if j1 > j2: j1, t1, j2, t2 = j2, t2, j1, t1
    lerp = lambda j, t: (P[j][0] + (P[(j + 1) % n][0] - P[j][0]) * t, P[j][1] + (P[(j + 1) % n][1] - P[j][1]) * t)
    A_, B_ = lerp(j1, t1), lerp(j2, t2)
    p1 = [A_] + [P[k] for k in range(j1 + 1, j2 + 1)] + [B_]; f1 = [F[k] for k in range(j1, j2 + 1)] + [True]
    k2 = [(j2 + 1 + m) % n for m in range((j1 - j2) % n)]
    p2 = [B_] + [P[k] for k in k2] + [A_]; f2 = [F[j2]] + [F[k] for k in k2] + [True]
    return dedupe(p1, f1), dedupe(p2, f2)
def dedupe(P, F):
    """drop a vertex that is within 1 mm of the next one (its zero-length edge goes with it)"""
    P, F = list(P), list(F); k = 0
    while k < len(P) and len(P) > 2:
        q = P[(k + 1) % len(P)]
        if abs(P[k][0] - q[0]) < 1e-3 and abs(P[k][1] - q[1]) < 1e-3: del P[k]; del F[k]
        else: k += 1
    return P, F
def pieces_of(ring, cuts):
    out = [(list(ring), [False] * len(ring))]
    for k, j1, t1, j2, t2 in cuts:
        P, F = out[k]; a_, b_ = split_ring(P, F, j1, t1 / 1e4, j2, t2 / 1e4); out[k] = a_; out.append(b_)
    return out
def ray_hit(P, i, d):
    """first edge (index, fraction) that the ray from vertex i along d meets, edges at vertex i excluded"""
    n = len(P); o = np.array(P[i]); best = None
    for j in range(n):
        if j == i or (j + 1) % n == i: continue
        a_, b_ = np.array(P[j]), np.array(P[(j + 1) % n]); e = b_ - a_
        den = d[0] * (-e[1]) - d[1] * (-e[0])
        if abs(den) < 1e-12: continue
        w = a_ - o; s = (w[0] * (-e[1]) - w[1] * (-e[0])) / den; t = (d[0] * w[1] - d[1] * w[0]) / den
        if s > 0.05 and -1e-9 <= t <= 1 + 1e-9 and (best is None or s < best[0]): best = (s, j, t)
    return best
def candidates(P, F):
    """chords from the reflex corners of piece P: (j1, t1, j2, t2) with t as integers of 1/10000"""
    n = len(P); sg = np.sign(area_of(P)); out = []
    # directions of the long edges: a chord must run along one of them (else a short skewed edge of a notch cuts a slice)
    longs = [np.arctan2(*(np.array(P[(k + 1) % n]) - np.array(P[k]))[::-1]) for k in range(n) if np.hypot(*(np.array(P[(k + 1) % n]) - np.array(P[k]))) >= CUT['long_edge_m']]
    def along_long(d):
        a = np.arctan2(d[1], d[0])
        return any(abs((a - b + np.pi / 2) % np.pi - np.pi / 2) <= np.radians(CUT['parallel_deg']) for b in longs)
    for i in range(n):
        a_, b_, c_ = np.array(P[i - 1]), np.array(P[i]), np.array(P[(i + 1) % n])
        e1, e2 = b_ - a_, c_ - b_; l1, l2 = np.hypot(*e1), np.hypot(*e2)
        if l1 < 1e-6 or l2 < 1e-6: continue
        cr = e1[0] * e2[1] - e1[1] * e2[0]
        ang = np.degrees(np.arcsin(min(1, abs(cr) / (l1 * l2))))
        if np.sign(cr) == sg or ang < CUT['reflex_deg'] and (e1 @ e2) > 0: continue   # convex corner, or almost straight
        if max(l1, l2) < 1.0: continue
        for d in (e1 / l1, -e2 / l2):
            if not along_long(d): continue
            h = ray_hit(P, i, d)
            if not h: continue
            s, j, t = h; L = np.hypot(*(np.array(P[(j + 1) % n]) - np.array(P[j])))
            if t * L < CUT['snap_m']: t = 0.0
            elif (1 - t) * L < CUT['snap_m']: j, t = (j + 1) % n, 0.0
            if j == i: continue
            ti = int(round(min(max(t, 0), 1) * 1e4))
            if ti == 1e4: j, ti = (j + 1) % n, 0
            if j == i or (ti == 0 and (j == (i + 1) % n or j == (i - 1) % n)): continue
            out.append((i, 0, j, ti))
    return sorted(set(out))
def rect_stats(P):
    c, u, Ls, Lt = min_rect(np.array(P)); ar = abs(area_of(P)); return ar, Ls * Lt, Lt

# ---- one polygon: cells and fits (EN metres)
def fit_poly(Rx, F, base, inset, inset_cut):
    """Rx: ring in page x, z; F: cut flags of its edges. Returns the measurement record (or None outside the mosaic)."""
    R = np.array([(E0 + x, N0 - z) for x, z in Rx])
    e0, e1, n0, n1 = R[:, 0].min(), R[:, 0].max(), R[:, 1].min(), R[:, 1].max()
    c0, c1 = int(np.floor(e0 - ME)), int(np.ceil(e1 - ME)); r0, r1 = int(np.floor(MN - n1)), int(np.ceil(MN - n0))
    if c0 < 0 or r0 < 0 or c1 >= DSM.shape[1] or r1 >= DSM.shape[0]: return None
    cc, rr = np.meshgrid(np.arange(c0, c1 + 1), np.arange(r0, r1 + 1)); cc, rr = cc.ravel(), rr.ravel()
    X, Y = ME + cc + .5, MN - rr - .5
    ins, d, dc = inside(X, Y, R, F); sel = ins & (d >= inset) & (dc >= inset_cut)
    c, u, Ls, Lt = min_rect(R)
    if u[0] < 0 or (u[0] == 0 and u[1] < 0): u = -u   # bearing of u in [0, 180): the signed ridge offsets below are along this u
    v = np.array([-u[1], u[0]])
    rec = {'n': int(sel.sum()), 'c': [round(float(c[0]), 2), round(float(c[1]), 2)], 'bearing': round(float(np.degrees(np.arctan2(u[0], u[1]))), 3),
           'L': round(float(Ls), 2), 'W': round(float(Lt), 2), 'base': base}
    gr = DTM[rr[ins], cc[ins]]; rec['dtm_minus_base'] = round(float(np.nanmedian(gr) - base), 2) if np.isfinite(gr).any() else None
    h = DSM[rr[sel], cc[sel]] - base; ok = np.isfinite(h); h = h[ok]
    if h.size < CUT['min_cells']: rec['shape'] = 'nodata'; return rec
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
            'hipped': robust(np.stack([one, -np.maximum(np.abs(t), np.abs(s) - Lr)], 1), h),
            'plane': robust(np.stack([one, s, t], 1), h)}   # h = c + a s + b t (s along u, t along v)
    rec['fit'] = {k: {'p': [round(float(x), 3) for x in f[0]], 'mad': round(f[1], 3), 'rms': round(f[2], 3)} for k, f in fits.items()}
    rec['p90'] = round(float(np.percentile(h, 90)), 2); rec['p10'] = round(float(np.percentile(h, 10)), 2)
    rec['cost'] = round(float(min(f[1] for f in fits.values()) * h.size), 2)   # n x the best median absolute error: the score of a cut
    return rec

def decompose(ring, base):
    """cut a ring into near-rectangular pieces; returns (cuts, [(piece, flags, record)])"""
    cuts, P = [], [(list(ring), [False] * len(ring))]; memo = {}
    def fit(piece):
        key = tuple((round(x, 4), round(z, 4)) for x, z in piece[0])
        if key not in memo: memo[key] = fit_poly(piece[0], piece[1], base, INSET, CUT['inset_cut'])
        return memo[key]
    k = 0
    while k < len(P) and len(P) < CUT['max_parts']:
        pc, F = P[k]; ar, rar, _ = rect_stats(pc)
        if ar >= CUT['rect_ok'] * rar: k += 1; continue
        opts = []
        for j1, t1, j2, t2 in candidates(pc, F):
            a_, b_ = split_ring(pc, F, j1, t1 / 1e4, j2, t2 / 1e4)
            if len(a_[0]) < 3 or len(b_[0]) < 3: continue
            sa, sb = rect_stats(a_[0]), rect_stats(b_[0])
            if min(sa[0], sb[0]) < CUT['min_area'] or min(sa[2], sb[2]) < CUT['min_width']: continue
            if abs(sa[0] + sb[0] - ar) > 0.01 * ar + 0.05: continue    # not a chord inside the piece
            opts.append(((sa[1] - sa[0]) + (sb[1] - sb[0]), (j1, t1, j2, t2), a_, b_))
        if not opts: k += 1; continue
        opts.sort(key=lambda o: o[0]); w0 = opts[0][0]
        ties = [o for o in opts if o[0] <= w0 + max(CUT['tie_m2'], CUT['tie_share'] * ar)][:CUT['tie_max']]
        if len(ties) > 1:   # the LiDAR decides between cuts that are as good on the outline
            sc = []
            for o in ties:
                fa, fb = fit(o[2]), fit(o[3])
                sc.append(sum(f['cost'] if f and 'cost' in f else 1e6 for f in (fa, fb)))
            ties = [ties[int(np.argmin(sc))]]
        _, cut, a_, b_ = ties[0]
        cuts.append((k, *cut)); P[k] = a_; P.append(b_)
    return cuts, [(pc, F, fit((pc, F))) for pc, F in P]

res = {'hmax': HMAX, 'inset': INSET, 'cut_rules': CUT, 'mosaic': {'E0': ME, 'Ntop': MN, 'shape': list(DSM.shape)}, 'buildings': {}}
counts = {}
for i, b in enumerate(A['buildings']):
    if ONLY and i not in ONLY: continue
    if b['h'] > HMAX or b.get('mh') or b.get('holes'): continue
    ring = ring_xz(b['p'])
    rec = fit_poly(ring, None, b['b'], INSET, 0)
    if rec is None: counts['outside'] = counts.get('outside', 0) + 1; continue
    rec['model_h'] = b['h']
    if rec.get('shape') == 'nodata': res['buildings'][i] = rec; counts['nodata'] = counts.get('nodata', 0) + 1; continue
    counts['measured'] = counts.get('measured', 0) + 1
    ar, rar, _ = rect_stats(ring)
    if ar < CUT['rect_ok'] * rar:
        cuts, parts = decompose(ring, b['b'])
        if cuts:
            rec['cuts'] = [list(c) for c in cuts]
            rec['parts'] = [{'ring': [[round(x, 3), round(z, 3)] for x, z in pc], 'cut': [int(f) for f in F], **(r or {'shape': 'nodata'})} for pc, F, r in parts]
            counts['cut'] = counts.get('cut', 0) + 1
    res['buildings'][i] = rec
res['counts'] = counts
json.dump(res, open(out, 'w'), separators=(',', ':'))
print(json.dumps({'out': out, **counts}))
