#!/usr/bin/env python3
"""Facade tiles for the 3D page (Pillow only). Called by tools/contrib-photos.mjs and tools/compose-facade-atlas.mjs.

  facade-tile.py tile '<spec json>' <out.png>
    {"method": "photo", "src": <rectified patch>, "crop": [x0, y0, x1, y1], "mirror_right_half": false}
    {"method": "pattern", "w_m": W, "h_m": H, "background": "#hex", "rects": [[x0, y0, x1, y1, "#hex"], ...],
     "svg": <out.svg>, "title": "...", "desc": "..."}     metres, x from the tile's left edge, y up from its bottom
    -> a 256 x 256 PNG; a pattern is also written as SVG (the vector source, in metres)
  facade-tile.py compose '<spec json>' <out.jpg>
    {"base": <atlas jpg>, "tiles": [[slot, <png>], ...]}  -> the atlas (8 x 4 slots of 256 px), JPEG quality 82

Skill: docklands-data-curation, "Contributed photos".
"""
import sys, json
from PIL import Image, ImageDraw

T = 256
mode, spec, out = sys.argv[1], json.loads(sys.argv[2]), sys.argv[3]
if mode == 'tile' and spec['method'] == 'photo':
    im = Image.open(spec['src']).convert('RGB').crop(tuple(spec['crop']))
    if spec.get('mirror_right_half'):   # a symmetric face of which the photo shows the left half cleanly
        w, h = im.size
        full = Image.new('RGB', (2 * w, h)); full.paste(im, (0, 0)); full.paste(im.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (w, 0)); im = full
    im.resize((T, T), Image.Resampling.LANCZOS).save(out)
elif mode == 'tile' and spec['method'] == 'pattern':
    W, H, S = spec['w_m'], spec['h_m'], 4   # drawn at 4 x, then reduced: soft edges, no stair steps
    im = Image.new('RGB', (T * S, T * S), spec['background']); d = ImageDraw.Draw(im)
    px = lambda x: round(x / W * T * S); py = lambda y: round((H - y) / H * T * S)
    for x0, y0, x1, y1, c in spec['rects']:
        d.rectangle([px(x0), py(y1), px(x1) - 1, py(y0) - 1], fill=c)
    im.resize((T, T), Image.Resampling.LANCZOS).save(out)
    if spec.get('svg'):
        f = lambda v: f'{v:.3f}'.rstrip('0').rstrip('.')
        rects = '\n'.join(f'  <rect x="{f(x0)}" y="{f(H - y1)}" width="{f(x1 - x0)}" height="{f(y1 - y0)}" fill="{c}"/>' for x0, y0, x1, y1, c in spec['rects'])
        esc = lambda s: s.replace('&', '&amp;').replace('<', '&lt;')
        open(spec['svg'], 'w').write(f'<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(W)} {f(H)}" width="{f(W * 100)}" height="{f(H * 100)}">\n'
                                     f'  <title>{esc(spec.get("title", ""))}</title>\n  <desc>{esc(spec.get("desc", ""))}</desc>\n'
                                     f'  <rect x="0" y="0" width="{f(W)}" height="{f(H)}" fill="{spec["background"]}"/>\n{rects}\n</svg>\n')
elif mode == 'compose':
    atlas = Image.open(spec['base']).convert('RGB')
    if atlas.size != (T * 8, T * 4): sys.exit(f'base atlas is {atlas.size}, not 2048 x 1024')
    for slot, png in spec['tiles']:
        if not 0 <= slot < 32: sys.exit(f'slot {slot} outside 0 to 31')
        atlas.paste(Image.open(png).convert('RGB').resize((T, T)), ((slot % 8) * T, (slot // 8) * T))
    atlas.save(out, quality=82, optimize=True)
else:
    sys.exit('usage: facade-tile.py tile|compose <spec json> <out>')
