"""Trace a two-tone combadge picture into a one-color vector emblem.

The picture is a silver delta in front of a gold backing with a slot through
it, on a transparent background. The result is one SVG path: the delta, and
the backing with a gap cut around the delta, so the two parts still read as
two when the whole emblem is filled with a single color.

    python tools/trace_badge.py badge.png                   # writes lcars/insignia.svg and lcars/insignia.js
    python tools/trace_badge.py badge.png --gap 14          # a wider gap (in source pixels)
    python tools/trace_badge.py badge.png --preview out.png # also draw the traced path, to check it

How it works:

- The picture is split into the delta (the largest grey part) and the
  backing (everything else that's opaque).
- The delta is traced as it is, measured row by row (its outer edges) and
  column by column (the arch under it, which is off-centre, as on the real
  badge).
- The backing's outline is found by casting rays in from outside, averaged
  with its mirror image, centred on the middle of the delta's outer edges,
  and closed behind the delta (its convex hull). The
  slots are measured and redrawn as clean bars with round ends.
- The backing has the slots and a gap around the delta cut from it.
- Smooth cubic Bezier curves are fitted to each outline (Schneider's
  algorithm, keeping sharp corners sharp). The backing's left wing is
  fitted and mirrored for the right, so the wings match exactly.

Needs numpy, scipy, opencv-python, shapely and Pillow.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.signal import savgol_filter
from shapely.geometry import LineString, MultiPoint, Polygon

ROOT = Path(__file__).resolve().parent.parent


# --------------------------------------------------------------------------
# Masks
# --------------------------------------------------------------------------

def load_masks(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """The delta and the backing, as boolean masks."""
    im = np.array(Image.open(path).convert("RGBA"))
    opaque = im[..., 3] > 128
    sat = cv2.cvtColor(im[..., :3], cv2.COLOR_RGB2HSV)[..., 1]
    delta = largest(opaque & (sat <= 60))
    # The backing's pale highlights are grey too, so it's whatever isn't the delta.
    return delta, opaque & ~delta


def largest(mask: np.ndarray) -> np.ndarray:
    """The largest connected part of a mask."""
    labels, n = ndimage.label(mask)
    if n <= 1:
        return mask
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    return labels == int(np.argmax(sizes)) + 1


# --------------------------------------------------------------------------
# The delta: traced as it is (its arch is off-centre, as on the real badge)
# --------------------------------------------------------------------------

def smooth(v: np.ndarray, window: int = 31) -> np.ndarray:
    window = min(window, len(v) - (1 - len(v) % 2))
    return savgol_filter(v, window, 3) if window > 4 else v


def fit_open(pts: np.ndarray, tol: float, t1=None, t2=None) -> list[np.ndarray]:
    t1 = unit(pts[min(4, len(pts) - 1)] - pts[0]) if t1 is None else t1
    t2 = unit(pts[max(-5, -len(pts))] - pts[-1]) if t2 is None else t2
    return fit(pts, t1, t2, tol)


def meet(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Where the straight lines best fitting two runs of points cross."""
    def line(pts):
        c = pts.mean(axis=0)
        return c, np.linalg.svd(pts - c)[2][0]
    (p, u), (q, v) = line(a), line(b)
    t = np.linalg.solve(np.c_[u, -v], q - p)[0]
    return p + t * u


def delta_curves(d: np.ndarray, tol: float):
    """
    The delta's outline as Bezier curves, and the middle of its outer edges
    (the axis the backing is centred on). Measured row by row (the outer
    edges) and column by column (the arch under it), each smoothed. Pixel
    centers are whole numbers, so an edge lies half a pixel outside the last
    pixel.
    """
    rows = np.nonzero(d.any(axis=1))[0]
    top = rows.min() - 0.5
    ys = np.arange(rows.min(), rows.max() + 1, dtype=float)
    left_x = np.array([np.nonzero(d[int(y)])[0].min() - 0.5 for y in ys])
    right_x = np.array([np.nonzero(d[int(y)])[0].max() + 0.5 for y in ys])
    body = (ys > top + 30) & (ys < ys.max() - 60)
    axis = float(np.median((left_x[body] + right_x[body]) / 2))
    def edge(xs: np.ndarray, side: slice) -> np.ndarray:
        """One outer edge, smoothed, from just under the tip to just above its foot."""
        yy, _ = np.nonzero(d[:, side])
        keep = (ys > top + 14) & (ys < yy.max() + 0.5 - 8)
        return np.c_[smooth(xs[keep], 41), ys[keep]]

    left, right = edge(left_x, slice(0, int(axis))), edge(right_x, slice(int(axis), None))

    # The arch: the lowest delta pixel in each column between the feet.
    cols = np.arange(left[-1, 0] + 3, right[-1, 0] - 3).round().astype(int)
    lows = smooth(np.array([np.nonzero(d[:, x])[0].max() + 0.5 for x in cols], float), 41)
    arch = np.c_[cols, lows]

    # The tip and the feet are sharp points: where the edges that meet there,
    # carried straight on, cross.
    tip = meet(left[:25], right[:25])
    left_foot = meet(left[-40:], arch[:12])
    right_foot = meet(right[-40:], arch[-12:])
    arch = arch[(np.linalg.norm(arch - left_foot, axis=1) > 4) & (np.linalg.norm(arch - right_foot, axis=1) > 4)]

    # Tip, down the left edge, along the arch to the right foot, up the right edge.
    curves = (fit_open(np.vstack([tip, left, left_foot]), tol)
              + fit_open(np.vstack([left_foot, arch, right_foot]), tol)
              + fit_open(np.vstack([right_foot, right[::-1], tip]), tol))
    return curves, axis


# --------------------------------------------------------------------------
# The backing
# --------------------------------------------------------------------------

def backing_outline(back: np.ndarray, delta: np.ndarray, rays: int = 1440) -> tuple[Polygon, float, float]:
    """
    The backing's outline, symmetric and closed behind the delta, plus its
    axis and middle height. Rays are cast in from outside toward the middle;
    the first backing pixel each meets marks the outline (rays that meet the
    delta first are skipped).
    """
    cols = np.nonzero(back.any(axis=0))[0]
    rows = np.nonzero(back.any(axis=1))[0]
    cx = (cols.min() + cols.max()) / 2
    cy = (rows.min() + rows.max()) / 2
    g = cv2.GaussianBlur(back.astype(np.float32), (0, 0), 0.7)
    dl = cv2.GaussianBlur(delta.astype(np.float32), (0, 0), 0.7)
    reach = math.hypot(back.shape[0], back.shape[1]) / 2
    radii = np.arange(reach, 0, -0.1)
    theta = np.arange(rays) * 2 * math.pi / rays
    r = np.full(rays, np.nan)
    for i, t in enumerate(theta):
        xs, ys = cx + radii * math.cos(t), cy + radii * math.sin(t)
        gv = ndimage.map_coordinates(g, [ys, xs], order=1, cval=0)
        dv = ndimage.map_coordinates(dl, [ys, xs], order=1, cval=0)
        hit_g = np.argmax(gv > 0.5) if (gv > 0.5).any() else None
        hit_d = np.argmax(dv > 0.5) if (dv > 0.5).any() else None
        if hit_g is None or (hit_d is not None and hit_d <= hit_g + 3):
            continue
        j = hit_g
        # Where exactly the value crosses 0.5, between this sample and the one before.
        a, b = gv[j - 1], gv[j]
        r[i] = radii[j - 1] - (0.5 - a) / (b - a) * 0.1 if j else radii[j]
    # Average with the mirror image: theta -> pi - theta.
    mirror_idx = (rays // 2 - np.arange(rays)) % rays
    both = np.vstack([r, r[mirror_idx]])
    count = (~np.isnan(both)).sum(axis=0)
    ok = count > 0
    sym = np.where(ok, np.nansum(both, axis=0) / np.maximum(count, 1), np.nan)
    pts = np.c_[cx + sym[ok] * np.cos(theta[ok]), cy + sym[ok] * np.sin(theta[ok])]
    return MultiPoint(pts).convex_hull, cx, cy


def slot_bar(back: np.ndarray, delta: np.ndarray, hull: Polygon, cx: float) -> tuple[float, float, float] | None:
    """The slots, measured: (how far their round ends reach from the axis, middle height, half-height)."""
    hull_m = np.zeros(back.shape, np.uint8)
    cv2.fillPoly(hull_m, [np.round(np.array(hull.exterior.coords)).astype(np.int32)], 1)
    near_delta = ndimage.binary_dilation(delta, iterations=3)
    holes = (hull_m > 0) & ~back & ~near_delta
    labels, n = ndimage.label(holes)
    found = []
    for s in ndimage.find_objects(labels):
        h, w = s[0].stop - s[0].start, s[1].stop - s[1].start
        if 8 <= h <= 80 and w > 1.5 * h:
            far = max(abs(s[1].start - 0.5 - cx), abs(s[1].stop - 0.5 - cx))
            found.append((far, (s[0].start + s[0].stop - 1) / 2, h / 2))
    if not found:
        return None
    return tuple(float(np.mean([f[i] for f in found])) for i in range(3))


# --------------------------------------------------------------------------
# Curve fitting (Philip J. Schneider, "An Algorithm for Automatically
# Fitting Digitized Curves", Graphics Gems, 1990)
# --------------------------------------------------------------------------

def bezier(ctrl, t):
    t = np.asarray(t)[:, None]
    mt = 1 - t
    return mt ** 3 * ctrl[0] + 3 * mt ** 2 * t * ctrl[1] + 3 * mt * t ** 2 * ctrl[2] + t ** 3 * ctrl[3]


def bezier_d(ctrl, t):
    t = np.asarray(t)[:, None]
    mt = 1 - t
    return 3 * mt ** 2 * (ctrl[1] - ctrl[0]) + 6 * mt * t * (ctrl[2] - ctrl[1]) + 3 * t ** 2 * (ctrl[3] - ctrl[2])


def bezier_dd(ctrl, t):
    t = np.asarray(t)[:, None]
    return 6 * (1 - t) * (ctrl[2] - 2 * ctrl[1] + ctrl[0]) + 6 * t * (ctrl[3] - 2 * ctrl[2] + ctrl[1])


def unit(v):
    n = np.linalg.norm(v)
    return v / n if n else v


def generate(pts, u, t1, t2):
    p0, p3 = pts[0], pts[-1]
    a1, a2 = np.outer(3 * (1 - u) ** 2 * u, t1), np.outer(3 * (1 - u) * u ** 2, t2)
    c = np.array([[np.sum(a1 * a1), np.sum(a1 * a2)], [np.sum(a1 * a2), np.sum(a2 * a2)]])
    tmp = pts - bezier(np.array([p0, p0, p3, p3]), u)
    x = np.array([np.sum(a1 * tmp), np.sum(a2 * tmp)])
    det = c[0, 0] * c[1, 1] - c[0, 1] * c[1, 0]
    seg = np.linalg.norm(p3 - p0)
    if abs(det) > 1e-12:
        al = (x[0] * c[1, 1] - x[1] * c[0, 1]) / det
        ar = (c[0, 0] * x[1] - c[1, 0] * x[0]) / det
    else:
        al = ar = seg / 3
    if al < 1e-6 * seg or ar < 1e-6 * seg:
        al = ar = seg / 3
    return np.array([p0, p0 + t1 * al, p3 + t2 * ar, p3])


def reparam(ctrl, pts, u):
    d = bezier(ctrl, u) - pts
    d1, d2 = bezier_d(ctrl, u), bezier_dd(ctrl, u)
    num = np.sum(d * d1, axis=1)
    den = np.sum(d1 * d1 + d * d2, axis=1)
    with np.errstate(divide="ignore", invalid="ignore"):
        new = np.where(np.abs(den) > 1e-12, u - num / den, u)
    return np.clip(new, 0, 1)


def fit(pts, t1, t2, tol):
    """Cubic Beziers through pts, each a 4x2 array of control points."""
    if len(pts) <= 2:
        dist = np.linalg.norm(pts[-1] - pts[0]) / 3
        return [np.array([pts[0], pts[0] + t1 * dist, pts[-1] + t2 * dist, pts[-1]])]
    u = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    u /= u[-1]
    ctrl = generate(pts, u, t1, t2)
    for _ in range(30):
        err = np.sum((bezier(ctrl, u) - pts) ** 2, axis=1)
        if err.max() < tol ** 2 or err.max() > (tol * 6) ** 2:
            break
        u = reparam(ctrl, pts, u)
        ctrl = generate(pts, u, t1, t2)
    err = np.sum((bezier(ctrl, u) - pts) ** 2, axis=1)
    if err.max() < tol ** 2:
        return [ctrl]
    split = min(max(int(np.argmax(err)), 1), len(pts) - 2)
    tc = unit(pts[split - 1] - pts[split + 1])
    return fit(pts[: split + 1], t1, tc, tol) + fit(pts[split:], -tc, t2, tol)


def resample(ring: np.ndarray, step: float) -> np.ndarray:
    """A closed outline as evenly spaced points (not repeating the first)."""
    line = LineString(np.vstack([ring, ring[:1]]))
    n = max(12, int(line.length / step))
    return np.array([line.interpolate(i * line.length / n).coords[0] for i in range(n)])


def corners(pts: np.ndarray, window: int = 5, angle: float = 35) -> list[int]:
    """Indexes of sharp corners: where the outline turns by more than `angle` degrees."""
    n = len(pts)
    a = pts - np.roll(pts, window, axis=0)
    b = np.roll(pts, -window, axis=0) - pts
    cos = np.sum(a * b, axis=1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1))
    turn = np.degrees(np.arccos(np.clip(cos, -1, 1)))
    found = []
    for i in np.argsort(-turn):
        if turn[i] < angle:
            break
        if all(min(abs(i - j), n - abs(i - j)) > 2 * window for j in found):
            found.append(int(i))
    # Refine each corner to the sharpest point nearby, on a finer window.
    a1 = pts - np.roll(pts, 1, axis=0)
    b1 = np.roll(pts, -1, axis=0) - pts
    fine = np.degrees(np.arccos(np.clip(np.sum(a1 * b1, axis=1) /
                                        (np.linalg.norm(a1, axis=1) * np.linalg.norm(b1, axis=1)), -1, 1)))
    refined = []
    for i in found:
        near = [(i + m) % n for m in range(-window, window + 1)]
        refined.append(max(near, key=lambda j: fine[j]))
    return sorted(set(refined))


def ring_curves(ring: np.ndarray, tol: float, step: float = 0.5) -> list[np.ndarray]:
    """Bezier curves around one closed outline, broken at its sharp corners."""
    pts = resample(ring, step)
    cs = corners(pts)
    n = len(pts)
    if not cs:
        pts = np.vstack([pts, pts[:1]])
        t = unit(pts[1] - pts[-2])
        return fit(pts, t, -t, tol)
    curves = []
    for k, i in enumerate(cs):
        j = cs[(k + 1) % len(cs)]
        idx = [(i + m) % n for m in range(((j - i) % n or n) + 1)]
        curves += fit_open(pts[idx], tol)
    return curves


# --------------------------------------------------------------------------
# The emblem
# --------------------------------------------------------------------------

def flatten(curves: list[np.ndarray], per: int = 32) -> np.ndarray:
    pts = [curves[0][0]]
    for c in curves:
        pts += list(bezier(c, np.linspace(0, 1, per))[1:])
    return np.array(pts)


def build(src: Path, gap: float, tol: float) -> list[list[np.ndarray]]:
    """The emblem's parts, each a closed list of Bezier curves: the delta, then the backing's left and right wings."""
    delta_m, back_m = load_masks(src)
    delta, axis = delta_curves(delta_m, tol)
    delta_poly = Polygon(flatten(delta)).buffer(0)

    hull, cx, _ = backing_outline(back_m, delta_m)
    bar = slot_bar(back_m, delta_m, hull, cx)
    # Centre the backing on the delta.
    shift = axis - cx
    hull = Polygon(np.array(hull.exterior.coords) + [shift, 0])
    backing = hull
    if bar:
        reach, mid, r = bar
        line = LineString([(axis - reach + r, mid), (axis + reach - r, mid)])
        backing = backing.difference(line.buffer(r, 64))
    backing = backing.difference(delta_poly.buffer(gap, 64))
    wings = sorted((g for g in getattr(backing, "geoms", [backing]) if g.area > 30), key=lambda g: g.centroid.x)

    # Fit each wing on its own. The backing is symmetric, but the delta isn't, so each wing's cut follows
    # its own side of the delta; mirroring the left wing would leave the right gap uneven.
    left_curves, right_curves = (ring_curves(np.array(w.exterior.coords[:-1]), tol) for w in wings[:2])
    return [delta, left_curves, right_curves]


def path_data(parts: list[list[np.ndarray]], origin, scale: float) -> str:
    def p(v):
        x, y = (v - origin) * scale
        return f"{round(x, 2):g} {round(y, 2):g}"

    out = []
    for curves in parts:
        d = f"M{p(curves[0][0])}"
        for c in curves:
            d += f"C{p(c[1])} {p(c[2])} {p(c[3])}"
        out.append(d + "Z")
    return "".join(out)


def preview(d: str, size: tuple[float, float], out: Path, scale: float) -> None:
    """Draw the path (white on black) by flattening its curves."""
    img = np.zeros((int(size[1] * scale) + 1, int(size[0] * scale) + 1), np.uint8)
    for sub in d.split("Z")[:-1]:
        nums = [float(v) for v in sub.replace("M", " ").replace("C", " ").split()]
        curves = [np.array([nums[:2], *np.array(nums[2:8]).reshape(3, 2)])]
        rest = np.array(nums[8:]).reshape(-1, 3, 2)
        for c in rest:
            curves.append(np.array([curves[-1][3], *c]))
        pts = flatten(curves)
        cv2.fillPoly(img, [np.round(pts * scale * 16).astype(np.int32)], 255, cv2.LINE_AA, shift=4)
    Image.fromarray(img).save(out)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("source", type=Path, help="the badge picture (PNG with transparency)")
    ap.add_argument("--gap", type=float, default=10, help="gap between delta and backing, in source pixels (default 10)")
    ap.add_argument("--tol", type=float, default=0.25, help="how closely curves follow the outline, in source pixels")
    ap.add_argument("--width", type=float, default=100, help="width of the SVG's viewBox (default 100)")
    ap.add_argument("--out", type=Path, default=ROOT / "lcars" / "insignia.svg")
    ap.add_argument("--preview", type=Path, help="also save a picture of the traced path")
    args = ap.parse_args()

    parts = build(args.source, args.gap, args.tol)
    allpts = np.vstack([flatten(c) for c in parts])
    (x0, y0), (x1, y1) = allpts.min(axis=0), allpts.max(axis=0)
    scale = args.width / (x1 - x0)
    w, h = args.width, round(float(y1 - y0) * scale, 2)
    d = path_data(parts, np.array([x0, y0]), scale)

    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" fill="currentColor">\n'
           f'  <title>Starfleet insignia</title>\n'
           f'  <path d="{d}"/>\n</svg>\n')
    args.out.write_text(svg, encoding="utf-8")
    js = args.out.with_suffix(".js")
    js.write_text(
        "/* The Starfleet insignia, one color. Generated by tools/trace_badge.py; don't edit by hand. */\n"
        f"window.LCARS_INSIGNIA = {json.dumps({'viewBox': f'0 0 {w:g} {h:g}', 'd': d})};\n",
        encoding="utf-8")
    print(f"wrote {args.out} and {js.name}: {len(parts)} parts, {d.count('C')} curves, viewBox 0 0 {w:g} {h:g}")
    if args.preview:
        preview(d, (w, h), args.preview, 1200 / w)


if __name__ == "__main__":
    main()
