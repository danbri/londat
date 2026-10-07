#!/usr/bin/env python3
"""Facade texture atlas for the 3D page: one tile per tower, cut from its rectified open photo (CC BY / PD) so that it
holds whole floors and whole bays and repeats along the walls without a visible seam.

  python3 magpie/cwplans/tools/build-facade-atlas.py        (Pillow only)

in:  registry/sources/facades/work/results.json (periods of each patch), facades.json (floor and bay metres),
     photos.json (author, licence, page), data/raw/facades/<cwb-id>/rect-<key>.jpg (patches, not committed)
out: docklands/data/tex/facades-registry.jpg (8 x 4 tiles of 256 px, slots 0 to 15), facades-registry.json (slot, tile size in
     metres, source photo and attribution per building)
Then tools/compose-facade-atlas.mjs adds the contributed photo tiles and writes facades.jpg / facades.json (the page's).
Lessons: skills/docklands-data-curation/SKILL.md, "Trees and facades" and "Contributed photos".
"""
import json, re
from pathlib import Path
from PIL import Image

CW = Path(__file__).resolve().parent.parent
F = CW / 'registry/sources/facades'
OUT = CW / 'docklands/data/tex'
TILE, COLS, ROWS, MAX_M = 256, 8, 4, 25.0
# one patch per building: the cleanest regular view (judged from data/raw/facades/contact.jpg); Citigroup Centre left
# out: both its patches show a crane or a blur
PICK = ['ocs-a', 'hsbc-e', 'pinnacle-edge', 'hampton-sqp', 'newf-diagrid', 'wardian-a', 'amory', 'ocp',
        'novotel', 'opd', 'ubs10', 'harcourt', 'bank25', 'bank40', 'ch25', 'wiq1']

res = json.load(open(F / 'work/results.json'))
fac = json.load(open(F / 'facades.json'))['buildings']
photos = json.load(open(F / 'photos.json'))['images']

def photo_of(src):
    stem = Path(src).stem
    for p in photos:
        if p.get('file') and stem in p['file']: return p
        if p.get('url') and stem in p['url']: return p
    return None

atlas = Image.new('RGB', (TILE * COLS, TILE * ROWS), (128, 128, 128))
out, credits = {}, {}
for slot, key in enumerate(PICK):
    r = res[key]; cwb = r['building']; f = fac.get(cwb, {})
    img = Image.open(CW / r['rect_file']).convert('RGB'); W, H = img.size
    s = W / r['patch_px'][0]                                  # rect image px per patch px (rect files are capped at 2048 px)
    floor_m = r.get('floor_m_measured') or r.get('floor_m_assumed') or f.get('floor_m')
    floor_px = r['floor_px'] * r['aspect'] * s if r.get('floor_px') else None
    bay_px = r['bay_px'] * s if r.get('bay_px') else None
    if floor_px: ppm = floor_px / floor_m                     # metric aspect: the same px per metre both ways
    elif bay_px and f.get('bay_m'): ppm = bay_px / f['bay_m']
    else: raise SystemExit(f'{key}: no scale')
    if not floor_px: floor_px = floor_m * ppm
    # whole floors and bays, about 40% of the patch height, at most MAX_M metres
    nf = max(1, min(int(H * .4 / floor_px), int(MAX_M / floor_m)))
    th = round(nf * floor_px)
    if bay_px:
        nb = max(1, min(int(W * .9 / bay_px), int(MAX_M * ppm / bay_px), max(1, round(th / bay_px))))
        tw = round(nb * bay_px)
    else:
        tw = min(W, th, int(MAX_M * ppm))
    x0, y0 = (W - tw) // 2, (H - th) // 2
    tile = img.crop((x0, y0, x0 + tw, y0 + th)).resize((TILE, TILE), Image.LANCZOS)
    atlas.paste(tile, ((slot % COLS) * TILE, (slot // COLS) * TILE))
    p = photo_of(r['src'])
    out[cwb] = {'slot': slot, 'w_m': round(tw / ppm, 2), 'h_m': round(th / ppm, 2), 'patch': key,
                'photo': p and p['page'], 'author': p and p['author'], 'licence': p and p['licence']}
    if p: credits.setdefault((p['author'], p['licence']), []).append(f.get('name') or cwb)
    print(f'{slot:2d} {key:16s} {cwb} tile {tw}x{th} px = {tw / ppm:.1f} x {th / ppm:.1f} m  {p and p["licence"]}')
atlas.save(OUT / 'facades-registry.jpg', quality=82, optimize=True)
json.dump({'built': __import__('datetime').date.today().isoformat(), 'tile_px': TILE, 'cols': COLS, 'rows': ROWS,
           'about': 'facade tiles cut from open photos (CC BY 2.0/4.0, PD) of the towers; each tile holds whole floors and bays; w_m, h_m = tile size on the wall in metres',
           'attribution': '; '.join(f'{a} ({l}): ' + ', '.join(sorted(set(n))) for (a, l), n in sorted(credits.items())),
           'buildings': out}, open(OUT / 'facades-registry.json', 'w'), indent=1, ensure_ascii=False)
print('wrote', OUT / 'facades-registry.jpg', (OUT / 'facades-registry.jpg').stat().st_size, 'bytes')
