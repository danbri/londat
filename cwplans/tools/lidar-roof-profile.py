#!/usr/bin/env python3
# Roof profile of one model building from the Environment Agency 1 m LiDAR (DSM minus DTM), in the frame of each wall
# face given: rows t (metres along the face from its first corner), columns o (metres into the building from the face),
# values in metres above the DTM ground, bilinear. Writes JSON with the grids and the corners in the frame.
#   python3 cwplans/tools/lidar-roof-profile.py <area.js> <model index> <dsm.tif> [<dsm2.tif> ...] --dtm <dtm.tif> \
#     --face <name>:<ring vertex a>:<ring vertex b>:<ring vertex inside> ... --out <file.json>
# Tiles: tools/fetch-dsm.sh fetches the EA survey tiles (OGL v3.0); 1 m grids with a .tfw beside each .tif.
# Needs numpy and tifffile (pip install tifffile imagecodecs). Skill: docklands-3d-page, "Detailed building models".
import sys, json, re, hashlib, warnings, logging
import numpy as np, tifffile
warnings.filterwarnings('ignore'); logging.disable(logging.CRITICAL)
a = sys.argv[1:]; out = a[a.index('--out') + 1]; dtmp = a[a.index('--dtm') + 1]
faces = [a[i + 1] for i, x in enumerate(a) if x == '--face']
pos = [x for i, x in enumerate(a) if not x.startswith('--') and (i == 0 or a[i - 1] not in ('--out', '--dtm', '--face'))]
area, mi, dsms = pos[0], int(pos[1]), pos[2:]
txt = open(area).read(); A = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])
b = A['buildings'][mi]; acc = [0, 0]; ring = []
for k, q in enumerate(b['p']):
    acc[k % 2] += q
    if k % 2: ring.append((acc[0] / 10, acc[1] / 10))
E0, N0 = A['meta']['origin']['E0'], A['meta']['origin']['N0']
EN = [(E0 + x, N0 - z) for x, z in ring]                       # x = E - E0, z = -(N - N0)
def grid(p):
    g = tifffile.imread(p); t = [float(v) for v in open(re.sub(r'\.tif$', '.tfw', p)).read().split()]
    return g, t[4], t[5]                                         # 1 m pixels: centre of the top-left pixel
def val(G, E, N):
    g, ex, ny = G; c = E - ex; r = ny - N; c0, r0 = int(np.floor(c)), int(np.floor(r)); fc, fr = c - c0, r - r0
    return float(g[r0, c0] * (1 - fc) * (1 - fr) + g[r0, c0 + 1] * fc * (1 - fr) + g[r0 + 1, c0] * (1 - fc) * fr + g[r0 + 1, c0 + 1] * fc * fr)
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
DTM = grid(dtmp); res = {'model_index': mi, 'ground_m_od': b['b'], 'model_height_m': b['h'], 'ring_local_m': ring,
       'tiles': {p.split('/')[-1]: sha(p) for p in [*dsms, dtmp]}, 'dtm_at_corners_m_od': [round(val(DTM, *p), 2) for p in EN], 'faces': {}}
for f in faces:
    name, ia, ib, ii = f.split(':'); P1, P2, Q = (np.array(EN[int(i)]) for i in (ia, ib, ii))
    ax = (P2 - P1) / np.linalg.norm(P2 - P1); n = np.array([-ax[1], ax[0]])
    if np.dot(Q - P1, n) < 0: n = -n
    L = float(np.linalg.norm(P2 - P1)); ts = np.arange(-3, np.ceil(L) + 3.5, 1.0); os_ = np.arange(-3, 16.5, 1.0)
    F = {'corners': [ia, ib], 'inside': ii, 'length_m': round(L, 2), 'bearing_deg': round(float(np.degrees(np.arctan2(ax[0], ax[1])) % 360), 1),
         'corners_in_frame': {str(k): [round(float(np.dot(np.array(p) - P1, ax)), 2), round(float(np.dot(np.array(p) - P1, n)), 2)] for k, p in enumerate(EN)},
         't': ts.tolist(), 'o': os_.tolist(), 'grids': {}}
    for p in dsms:
        D = grid(p); F['grids'][p.split('/')[-1]] = [[round(val(D, *(P1 + ax * t + n * o)) - val(DTM, *(P1 + ax * t + n * o)), 2) for o in os_] for t in ts]
    res['faces'][name] = F
json.dump(res, open(out, 'w'), indent=None, separators=(',', ':')); print(json.dumps({'out': out, 'faces': list(res['faces'])}))
