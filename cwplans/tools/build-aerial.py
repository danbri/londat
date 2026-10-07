#!/usr/bin/env python3
# Ground textures for the Docklands 3D model from Environment Agency survey tiles (Open Government Licence):
# 2008 colour aerial photography (40 cm), 2012 night-time aerial photography (20 cm) and the 2020 National LiDAR
# Programme intensity (1 m). Each is cut to the model box and resampled to one JPEG at 3 m per pixel.
#
#   python3 magpie/cwplans/tools/build-aerial.py [rgb2008] [night2012] [intensity2020]
#
# in:  data/raw/imagery/*.zip, fetched from https://environment.data.gov.uk/tiles/collections/survey/<product>/<year>/<res>/<tile>
#      (tiles TQ3075, TQ3080, TQ3575, TQ3580; see docklands/README.md). The aerial photographs are ECW files; they are
#      decoded by tools/native/ecw2ppm (built against the ECW 3.3 SDK). How to build it and why it is native: the
#      docklands-data-curation skill, "Imagery".
# out: docklands/data/tex/<name>.jpg and docklands/data/tex/textures.json; data/raw/imagery/<name>.ppm (raw copy, local) (box in local metres, source, date, licence)
# Needs Pillow (no numpy).
import glob, json, os, subprocess, sys, tempfile, zipfile
from PIL import Image, ImageMath

CW = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RAW = os.path.join(CW, 'data/raw/imagery')
OUT = os.path.join(CW, 'docklands/data/tex')
E0, N0 = 537550, 180300                      # model origin (fetch-docklands.mjs): x = E - E0, z = -(N - N0)
X0, X1, Z0, Z1 = -5150, 2350, -2000, 3600     # model extent (area.js meta.extent)
RES = 3.0                                     # metres per output pixel
W, H = int((X1 - X0) / RES), int((Z1 - Z0) / RES)
EMIN, NMAX = E0 + X0, N0 - Z0                 # top-left corner of the output in BNG
DEC = os.environ.get('ECW2PPM', os.path.join(CW, 'tools/native/ecw2ppm'))
OGL = 'Open Government Licence v3.0'

PRODUCTS = {
  'rgb2008': dict(glob='vertical_aerial_photography_tiles_rgb-2008-0.4-*.zip', kind='ecw', step=5,
                  what='colour aerial photography, 40 cm, flown 25 August 2007 to 18 October 2008',
                  attribution='Aerial photography 2007-08 © Environment Agency, ' + OGL),
  'night2012': dict(glob='vertical_aerial_photography_tiles_night_time-2012-0.2-*.zip', kind='ecw', step=10,
                    what='night-time aerial photography, 20 cm, flown January to April 2012',
                    attribution='Night-time aerial photography 2012 © Environment Agency, ' + OGL),
  'intensity2020': dict(glob='national_lidar_programme_intensity-2020-1-*.zip', kind='tif',
                        what='LiDAR return intensity, 1 m, National LiDAR Programme, flown 2020',
                        attribution='LiDAR intensity 2020 © Environment Agency, ' + OGL),
}


def paste(canvas, img, e0, n0, dx):
  """Place an image whose top-left corner is (e0, n0) in BNG with pixel size dx metres onto the canvas."""
  w, h = img.size
  ox, oy = (e0 - EMIN) / RES, (NMAX - n0) / RES
  # integer start and end columns, plus one pixel of overlap, so neighbouring tiles leave no seam
  x0, y0 = round(ox), round(oy); tw, th = round(ox + w * dx / RES) - x0 + 1, round(oy + h * dx / RES) - y0 + 1
  if x0 + tw < 0 or y0 + th < 0 or x0 > W or y0 > H: return False
  small = img.resize((tw, th), Image.BOX)
  # ECW tiles carry black (0,0,0) outside the flown area; paste only the non-black part
  mask = small.convert('L').point(lambda v: 255 if v > 0 else 0) if small.mode == 'RGB' else None
  canvas.paste(small, (x0, y0), mask)
  return True


def build_ecw(name, p):
  canvas, n = Image.new('RGB', (W, H)), 0
  meta = []
  with tempfile.TemporaryDirectory() as tmp:
    for z in sorted(glob.glob(os.path.join(RAW, p['glob']))):
      with zipfile.ZipFile(z) as zf:
        for ent in zf.namelist():
          if not ent.lower().endswith('.ecw'): continue
          src = zf.extract(ent, tmp); ppm = src + '.ppm'
          info = json.loads(subprocess.check_output([DEC, src, ppm, str(p['step'])], env={**os.environ, 'LD_LIBRARY_PATH': os.environ.get('LD_LIBRARY_PATH', '/opt/ecw/lib')}))
          if paste(canvas, Image.open(ppm), info['x0'], info['y0'], info['dx']): n += 1; meta.append(os.path.basename(ent))
          os.remove(src); os.remove(ppm)
  print(f'{name}: {n} ECW files inside the model box')
  return canvas, meta


def build_tif(name, p):
  canvas, meta, hist = Image.new('F', (W, H), 0.0), [], None
  with tempfile.TemporaryDirectory() as tmp:
    for z in sorted(glob.glob(os.path.join(RAW, p['glob']))):
      with zipfile.ZipFile(z) as zf:
        tif = next(e for e in zf.namelist() if e.lower().endswith('.tif')); tfw = tif[:-4] + '.tfw'
        img = Image.open(zf.extract(tif, tmp)); a, _, _, d, e0, n0 = [float(v) for v in zf.read(tfw).split()]
        img = ImageMath.lambda_eval(lambda m: m['max'](m['a'], 0.0), a=img) if hasattr(ImageMath, 'lambda_eval') else ImageMath.eval('max(a, 0.0)', a=img)
        if paste(canvas, img.convert('F'), e0 - a / 2, n0 - d / 2, a): meta.append(os.path.basename(tif))
  # stretch between the 1st and 99th percentile of the land and water pixels
  lo, hi = 0.0, 4096.0
  h = canvas.point(lambda v: v * 255 / hi).convert('L').histogram(); tot = sum(h[1:])
  acc, p1, p99 = 0, 1, 254
  for i in range(1, 256):
    acc += h[i]
    if acc < tot * 0.01: p1 = i
    if acc < tot * 0.99: p99 = i
  a0, a1 = p1 * hi / 255, p99 * hi / 255
  out = canvas.point(lambda v: (v - a0) * 255 / (a1 - a0)).convert('L').point([round(255 * (i / 255) ** 0.6) for i in range(256)])  # gamma 0.6: most land is dark
  print(f'{name}: {len(meta)} GeoTIFF tiles; stretch {a0:.0f}..{a1:.0f}')
  return out, meta


def main():
  os.makedirs(OUT, exist_ok=True)
  want = sys.argv[1:] or list(PRODUCTS)
  idx_path = os.path.join(OUT, 'textures.json')
  idx = json.load(open(idx_path)) if os.path.exists(idx_path) else {'box': None, 'textures': {}}
  idx['box'] = {'x0': X0, 'x1': X1, 'z0': Z0, 'z1': Z1, 'res': RES, 'w': W, 'h': H,
                'note': 'image row 0 is z0 (north), column 0 is x0 (west); local metres, x = E - 537550, z = -(N - 180300)'}
  for name in want:
    p = PRODUCTS[name]
    img, files = (build_ecw if p['kind'] == 'ecw' else build_tif)(name, p)
    path = os.path.join(OUT, name + '.jpg'); img.save(path, quality=80, optimize=True, progressive=True)
    img.convert('RGB').save(os.path.join(RAW, name + '.ppm'))   # uncompressed copy for tools/build-splats.mjs (not committed)
    idx['textures'][name] = {'file': name + '.jpg', 'what': p['what'], 'attribution': p['attribution'], 'licence': OGL,
                             'source': 'https://environment.data.gov.uk/survey', 'files': len(files),
                             'bytes': os.path.getsize(path)}
    print(f'  {path}: {W} x {H}, {os.path.getsize(path) / 1024:.0f} kB')
  json.dump(idx, open(idx_path, 'w'), indent=1)


if __name__ == '__main__':
  main()
