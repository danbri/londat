#!/usr/bin/env python3
"""splat-pose-test.py - synthetic pose-convention test for the 3DGS trainer.

Makes a nerfstudio dataset of coloured boxes on a chequered ground, rendered by
a small numpy ray caster with KNOWN OpenGL-convention camera-to-world matrices
(camera +x right, +y up, looks along -z; world y up; metres), the same format
the drone dataset uses. Then, after training, checks where the gaussians went.

  gen    OUT [--frames 80] [--init grey|true] [--flip opencv]
         writes OUT/images/*.jpg, OUT/transforms.json, OUT/sparse_pc.ply
         --init grey  : every sparse point is mid-grey, so box colours in the
                        result can only come from the images through the poses
         --flip opencv: NEGATIVE CONTROL - writes OpenCV-convention matrices
                        (y down, +z forward) instead, to show what a wrong
                        convention does
  points OUT N [grey|true]
                     rewrite OUT/sparse_pc.ply with about N points (for timing
                     runs at a given gaussian count; images untouched)
  check  PLY         reads a trained 3DGS .ply and reports, per box, how many
                     opaque gaussians lie inside it and their mean colour

Needs numpy + Pillow (the system numpy here is broken for python3.11):
  python3 -m venv /opt/splat-venv && /opt/splat-venv/bin/pip install numpy pillow
  /opt/splat-venv/bin/python cwplans/tools/splat-pose-test.py gen /path/out
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

W, H = 960, 540
FOV_X = math.radians(60)
FX = (W / 2) / math.tan(FOV_X / 2)
FY = FX
CX, CY = W / 2, H / 2
SS = 2  # supersampling factor per axis

# (name, min xyz, max xyz, rgb 0-1). Deliberately asymmetric so a mirrored or
# rotated reconstruction cannot match.
BOXES = [
    ("red",     (-150, 0, -60), (-90, 120, 0),    (0.85, 0.15, 0.12)),
    ("green",   (40, 0, 60),    (110, 60, 140),   (0.15, 0.75, 0.20)),
    ("blue",    (80, 0, -140),  (140, 200, -80),  (0.15, 0.25, 0.85)),
    ("yellow",  (-120, 0, 90),  (-40, 40, 160),   (0.90, 0.85, 0.15)),
    ("magenta", (-20, 0, -20),  (20, 90, 20),     (0.80, 0.20, 0.75)),
]
GROUND_HALF = 400.0
LIGHT = np.array([0.4, 1.0, 0.3]) / np.linalg.norm([0.4, 1.0, 0.3])


def look_at_gl(eye, target, up=(0, 1, 0)):
    """camera-to-world, OpenGL convention: columns right, up, -forward, eye."""
    eye, target, up = map(np.asarray, (eye, target, up))
    f = target - eye
    f = f / np.linalg.norm(f)
    r = np.cross(f, up)
    r = r / np.linalg.norm(r)
    u = np.cross(r, f)
    m = np.eye(4)
    m[:3, 0], m[:3, 1], m[:3, 2], m[:3, 3] = r, u, -f, eye
    return m


def cameras(n):
    """Drone-like: two orbits at different heights/radii looking at jittered
    points near the middle."""
    rng = np.random.default_rng(1)
    out = []
    for i in range(n):
        ring = i % 2
        a = 2 * math.pi * i / n + ring * 0.3
        rad = 330 if ring == 0 else 240
        hgt = 170 if ring == 0 else 260
        eye = (rad * math.cos(a), hgt, rad * math.sin(a))
        tgt = (rng.uniform(-60, 60), rng.uniform(0, 40), rng.uniform(-60, 60))
        out.append(look_at_gl(eye, tgt))
    return out


def texture(p, n):
    """Window-grid modulation so faces carry gradients for the photometric loss."""
    # pick the two in-plane axes from the normal
    ax = np.argmax(np.abs(n), axis=-1)
    a = np.where(ax[..., None] == 0, p[..., [1, 2]], np.where(ax[..., None] == 1, p[..., [0, 2]], p[..., [0, 1]]))
    g = (np.floor(a[..., 0] / 6) + np.floor(a[..., 1] / 8)) % 2
    return 0.78 + 0.22 * g


def render(c2w):
    w, h = W * SS, H * SS
    u, v = np.meshgrid(np.arange(w) + 0.5, np.arange(h) + 0.5)
    d_cam = np.stack([(u / SS - CX) / FX, -(v / SS - CY) / FY, -np.ones_like(u)], -1)
    R, o = c2w[:3, :3], c2w[:3, 3]
    d = d_cam @ R.T
    d = d / np.linalg.norm(d, axis=-1, keepdims=True)
    tbest = np.full(d.shape[:2], np.inf)
    col = np.zeros(d.shape)
    # sky
    sky_t = np.clip(d[..., 1], 0, 1)[..., None]
    col[:] = (1 - sky_t) * np.array([0.75, 0.82, 0.92]) + sky_t * np.array([0.35, 0.55, 0.85])
    # ground y=0
    with np.errstate(divide="ignore", invalid="ignore"):
        tg = -o[1] / d[..., 1]
    pg = o + tg[..., None] * d
    hitg = (d[..., 1] < 0) & (np.abs(pg[..., 0]) < GROUND_HALF) & (np.abs(pg[..., 2]) < GROUND_HALF)
    chk = (np.floor(pg[..., 0] / 25) + np.floor(pg[..., 2] / 25)) % 2
    gcol = np.where(chk[..., None] > 0, np.array([0.42, 0.50, 0.38]), np.array([0.62, 0.62, 0.58]))
    gcol = gcol * (0.6 + 0.4 * LIGHT[1])
    col = np.where(hitg[..., None], gcol, col)
    tbest = np.where(hitg, tg, tbest)
    for _, bmin, bmax, rgb in BOXES:
        bmin, bmax = np.array(bmin, float), np.array(bmax, float)
        with np.errstate(divide="ignore", invalid="ignore"):
            t1 = (bmin - o) / d
            t2 = (bmax - o) / d
        tmin = np.minimum(t1, t2)
        tmax = np.maximum(t1, t2)
        tn = tmin.max(-1)
        tf = tmax.min(-1)
        hit = (tn <= tf) & (tn > 0) & (tn < tbest)
        ax = tmin.argmax(-1)
        n = np.zeros(d.shape)
        np.put_along_axis(n, ax[..., None], 1.0, -1)
        n = n * -np.sign(np.take_along_axis(d, ax[..., None], -1))
        p = o + tn[..., None] * d
        shade = 0.45 + 0.55 * np.clip(n @ LIGHT, 0, 1)
        c = np.array(rgb) * (shade * texture(p, n))[..., None]
        col = np.where(hit[..., None], c, col)
        tbest = np.where(hit, tn, tbest)
    img = col.reshape(H, SS, W, SS, 3).mean((1, 3))
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)


def sample_points(init, n_total=None):
    rng = np.random.default_rng(2)
    pts, cols = [], []
    gstep = 8.0
    per_face = 300
    if n_total:  # half on the ground, half over the 25 box faces
        gstep = 600.0 / math.sqrt(n_total / 2)
        per_face = max(1, int(n_total / 2 / 25))
    gx, gz = np.meshgrid(np.arange(-300, 301, gstep), np.arange(-300, 301, gstep))
    g = np.stack([gx.ravel(), np.zeros(gx.size), gz.ravel()], -1)
    chk = (np.floor(g[:, 0] / 25) + np.floor(g[:, 2] / 25)) % 2
    pts.append(g)
    cols.append(np.where(chk[:, None] > 0, [0.42, 0.50, 0.38], [0.62, 0.62, 0.58]))
    for _, bmin, bmax, rgb in BOXES:
        bmin, bmax = np.array(bmin, float), np.array(bmax, float)
        for axis in range(3):
            for side in (0, 1):
                if axis == 1 and side == 0:
                    continue  # bottom face is on the ground
                p = rng.uniform(bmin, bmax, size=(per_face, 3))
                p[:, axis] = bmax[axis] if side else bmin[axis]
                pts.append(p)
                cols.append(np.tile(rgb, (per_face, 1)))
    pts = np.concatenate(pts)
    cols = np.concatenate(cols)
    if init == "grey":
        cols = np.full_like(cols, 0.5)
    return pts.astype(np.float32), (cols * 255).astype(np.uint8)


def write_ply(path, pts, cols):
    hdr = ("ply\nformat binary_little_endian 1.0\nelement vertex %d\n"
           "property float x\nproperty float y\nproperty float z\n"
           "property uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n" % len(pts))
    rec = np.zeros(len(pts), dtype=[("x", "<f4"), ("y", "<f4"), ("z", "<f4"), ("r", "u1"), ("g", "u1"), ("b", "u1")])
    rec["x"], rec["y"], rec["z"] = pts.T
    rec["r"], rec["g"], rec["b"] = cols.T
    with open(path, "wb") as f:
        f.write(hdr.encode())
        f.write(rec.tobytes())


def gen(out, frames=80, init="grey", flip=None):
    out = Path(out)
    (out / "images").mkdir(parents=True, exist_ok=True)
    fr = []
    for i, c2w in enumerate(cameras(frames)):
        name = "images/frame_%05d.jpg" % (i + 1)
        Image.fromarray(render(c2w)).save(out / name, quality=92)
        m = c2w.copy()
        if flip == "opencv":
            m[:3, :3] = m[:3, :3] @ np.diag([1, -1, -1])
        fr.append({"file_path": name, "transform_matrix": m.tolist()})
        print("rendered", name, flush=True)
    tj = {"camera_model": "OPENCV", "w": W, "h": H, "fl_x": FX, "fl_y": FY, "cx": CX, "cy": CY,
          "k1": 0, "k2": 0, "p1": 0, "p2": 0, "frames": fr, "ply_file_path": "sparse_pc.ply"}
    (out / "transforms.json").write_text(json.dumps(tj, indent=1))
    pts, cols = sample_points(init)
    write_ply(out / "sparse_pc.ply", pts, cols)
    print("wrote", out, len(fr), "frames,", len(pts), "points, init", init, "flip", flip)


def read_3dgs_ply(path):
    data = Path(path).read_bytes()
    end = data.index(b"end_header\n") + len(b"end_header\n")
    header = data[:end].decode().splitlines()
    n = int([l for l in header if l.startswith("element vertex")][0].split()[-1])
    props = [l.split()[-1] for l in header if l.startswith("property float")]
    arr = np.frombuffer(data[end:end + n * 4 * len(props)], dtype="<f4").reshape(n, len(props))
    return {p: arr[:, i] for i, p in enumerate(props)}


def check(path):
    g = read_3dgs_ply(path)
    xyz = np.stack([g["x"], g["y"], g["z"]], -1)
    C0 = 0.28209479177387814
    rgb = np.clip(0.5 + C0 * np.stack([g["f_dc_0"], g["f_dc_1"], g["f_dc_2"]], -1), 0, 1)
    op = 1 / (1 + np.exp(-g["opacity"]))
    keep = op > 0.5
    print("%s: %d gaussians, %d with opacity > 0.5" % (path, len(xyz), keep.sum()))
    print("centre bounds x %.1f..%.1f  y %.1f..%.1f  z %.1f..%.1f" % (
        *np.percentile(xyz[keep, 0], [1, 99]), *np.percentile(xyz[keep, 1], [1, 99]), *np.percentile(xyz[keep, 2], [1, 99])))
    ok = True
    for name, bmin, bmax, want in BOXES:
        bmin, bmax = np.array(bmin) - 2, np.array(bmax) + 2
        inside = keep & np.all((xyz >= bmin) & (xyz <= bmax), -1) & (xyz[:, 1] > 3)
        # also the mirror-image box (x -> -x) as a control
        mmin, mmax = np.array([-bmax[0], bmin[1], bmin[2]]), np.array([-bmin[0], bmax[1], bmax[2]])
        mirror = keep & np.all((xyz >= mmin) & (xyz <= mmax), -1) & (xyz[:, 1] > 3)
        mean = rgb[inside].mean(0) if inside.any() else np.array([np.nan] * 3)
        # brightest-channel test: is the dominant hue the box's hue?
        dist = np.linalg.norm(mean / max(mean.max(), 1e-6) - np.array(want) / max(want)) if inside.any() else 9
        good = inside.sum() > 50 and dist < 0.45
        ok &= bool(good)
        print("  %-8s inside=%5d mirror-box=%5d mean rgb=(%.2f %.2f %.2f) want=(%.2f %.2f %.2f) %s" % (
            name, inside.sum(), mirror.sum(), *mean, *want, "OK" if good else "WRONG"))
    print("RESULT:", "PASS" if ok else "FAIL")
    return ok


if __name__ == "__main__":
    a = sys.argv[1:]
    if a and a[0] == "points":
        pts, cols = sample_points(a[3] if len(a) > 3 else "true", int(float(a[2])))
        write_ply(Path(a[1]) / "sparse_pc.ply", pts, cols)
        print("wrote", len(pts), "points to", Path(a[1]) / "sparse_pc.ply")
        sys.exit(0)
    if not a or a[0] not in ("gen", "check"):
        print(__doc__)
        sys.exit(2)
    if a[0] == "gen":
        opts = {"frames": 80, "init": "grey", "flip": None}
        i = 2
        while i < len(a):
            k = a[i].lstrip("-")
            opts[k] = int(a[i + 1]) if k == "frames" else a[i + 1]
            i += 2
        gen(a[1], **opts)
    else:
        sys.exit(0 if check(a[1]) else 1)
