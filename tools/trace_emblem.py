"""Trace a one-color emblem picture (a color on a light background) into an SVG.

For pictures like the UFP emblem: one color (blue) with light parts inside it
(stars, a ring), on white or a baked-in grey checkerboard. Everything that's
the emblem's color becomes one path, its light parts cut out as holes
(fill-rule evenodd), with smooth Bezier curves fitted to every outline. The
background is dropped, so the result is transparent around the emblem.

    python tools/trace_emblem.py lcars/UFP.png                 # writes lcars/ufp.svg
    python tools/trace_emblem.py lcars/UFP.png --out x.svg --preview check.png

The SVG keeps the picture's colors: the traced path in the emblem's color,
over a light fill of each enclosed part (the disc), so the stars stay white on
any background. --outer gives the outer parts (the leaves and the ring) a
color of their own and leaves the gap inside the ring clear:

    python tools/trace_emblem.py lcars/UFP.png --outer "#ACACAC" It also has the path alone in its own file (name-mono.svg,
fill="currentColor"), for one-color use like the insignia piece.

Needs numpy, opencv-python, shapely and Pillow (and tools/trace_badge.py, for its curve fitting).
"""
from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("trace_badge", HERE / "trace_badge.py")
badge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(badge)

UP = 4  # trace at 4x, from a smoothed mask, for sub-pixel outlines


def emblem_mask(path: Path) -> tuple[np.ndarray, str, str]:
    """How much each pixel is the emblem's color (0 to 1), and that color and the light color, as #RRGGBB."""
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(float)
    # The emblem's color is the most saturated; the background and the light parts are greys.
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    core = sat > sat.max() * 0.8
    color = np.median(rgb[core], axis=0)
    light = np.median(rgb[sat < 8], axis=0)
    # Share of the emblem's color in each pixel, along the line from light to it (anti-aliased edges in between).
    v = color - light
    share = np.clip(((rgb - light) @ v) / (v @ v), 0, 1)
    hexc = lambda c: "#" + "".join(f"{int(round(x)):02X}" for x in c)
    return share, hexc(color), hexc([255, 255, 255])


def outlines(share: np.ndarray, min_area: float) -> list[tuple[np.ndarray, int, int, int]]:
    """Every outline of the emblem: (points in source pixels, its index, its parent's index or -1, depth)."""
    big = cv2.resize(share.astype(np.float32), None, fx=UP, fy=UP, interpolation=cv2.INTER_CUBIC)
    big = cv2.GaussianBlur(big, (0, 0), UP * 0.6)
    mask = (big > 0.5).astype(np.uint8)
    contours, hier = cv2.findContours(mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_NONE)
    hier = hier[0]
    depth = []
    for i in range(len(contours)):
        d, p = 0, hier[i][3]
        while p >= 0:
            d, p = d + 1, hier[p][3]
        depth.append(d)
    out = []
    for i, c in enumerate(contours):
        pts = c[:, 0, :].astype(float) / UP
        if cv2.contourArea(c) / UP / UP >= min_area:
            out.append((pts, i, hier[i][3], depth[i]))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src", type=Path)
    ap.add_argument("--out", type=Path, help="the SVG to write (default: lowercase name beside the picture)")
    ap.add_argument("--tol", type=float, default=0.35, help="how closely curves follow the outline, in source pixels")
    ap.add_argument("--min-area", type=float, default=3, help="drop specks smaller than this (square source pixels)")
    ap.add_argument("--color", help="the emblem's color, #RRGGBB (default: sampled from the picture)")
    ap.add_argument("--outer", help="a color for the outer parts (outlines not inside a ring: the leaves and the ring), "
                    "#RRGGBB; the gap inside the ring is then left clear, and only what's inside it keeps --color")
    ap.add_argument("--preview", type=Path, help="also draw the traced SVG's path, to check it")
    args = ap.parse_args()
    out = args.out or args.src.with_name(args.src.stem.lower() + ".svg")

    share, color, light = emblem_mask(args.src)
    color = args.color or color
    rings = outlines(share, args.min_area)
    if not rings:
        raise SystemExit("no emblem found")
    allpts = np.vstack([r[0] for r in rings if r[3] == 0])
    lo, hi = allpts.min(axis=0), allpts.max(axis=0)
    size = hi - lo
    scale = 100 / size[0]  # 100 units wide, like the insignia
    pad = 0.5

    def path(selected):
        parts = [badge.ring_curves(r[0], args.tol, step=0.35) for r in selected]
        return badge.path_data(parts, lo - pad / scale, scale)

    d = path(rings)
    # Light parts inside the emblem (holes at depth 1, inside an outer outline): fill them light underneath,
    # by filling the outer outlines that have holes. The open background around the emblem stays clear.
    holders = {r[2] for r in rings if r[3] % 2 == 1}
    layers = []
    if args.outer:
        # Two colors: the outer parts (depth 0 and the ring's inside edge, depth 1) in --outer, the gap
        # between them and the inner part left clear, and the inner part (depth 2 on) as one emblem inside it.
        layers.append((args.outer, path([r for r in rings if r[3] <= 1])))
        inner = [r for r in rings if r[3] >= 2]
        filled = [r for r in inner if r[3] % 2 == 0 and r[1] in holders]
        if filled:
            layers.append((light, path(filled), False))
        layers.append((color, path(inner)))
    else:
        filled = [r for r in rings if r[3] % 2 == 0 and r[1] in holders]
        if filled:
            layers.append((light, path(filled), False))
        layers.append((color, d))

    w, h = round(size[0] * scale + 2 * pad, 2), round(size[1] * scale + 2 * pad, 2)
    box = f'viewBox="0 0 {w:g} {h:g}"'
    title = args.src.stem
    body = ""
    for fill, data, *opts in layers:
        rule = ' fill-rule="evenodd"' if not opts or opts[0] else ""
        body += f'  <path fill="{fill}"{rule} d="{data}"/>\n'
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" {box} role="img" aria-label="{title}">\n{body}</svg>\n'
    out.write_text(svg, encoding="utf-8", newline="\n")
    mono = out.with_name(out.stem + "-mono.svg")
    mono.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" {box} role="img" aria-label="{title}">\n'
                    f'  <path fill="currentColor" fill-rule="evenodd" d="{d}"/>\n</svg>\n', encoding="utf-8", newline="\n")
    print(f"{out}: {len(rings)} outlines, {' / '.join(l[0] for l in layers)}; {mono.name}: one color; {len(svg) // 1024} KB")
    if args.preview:
        render(out, args.preview)


def render(svg: Path, out: Path) -> None:
    """Draw the SVG at 4x on a dark grey background (to see what's transparent), by flattening its curves."""
    import re
    text = svg.read_text(encoding="utf-8")
    w, h = map(float, re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', text).groups())
    k = 860 * 2 / w
    img = np.full((int(h * k), int(w * k), 3), 40, np.uint8)
    for fill, d in re.findall(r'fill="([^"]+)"(?: fill-rule="evenodd")? d="([^"]+)"', text):
        rgb = tuple(int(fill[i:i + 2], 16) for i in (5, 3, 1))  # BGR
        polys = []
        for sub in re.findall(r"M[^M]+", d):
            nums = list(map(float, re.findall(r"-?[\d.]+", sub)))
            start = np.array(nums[:2])
            pts = [start]
            rest = nums[2:]
            for i in range(0, len(rest), 6):
                c = np.array([pts[-1], rest[i:i + 2], rest[i + 2:i + 4], rest[i + 4:i + 6]], float)
                pts += list(badge.bezier(c, np.linspace(0, 1, 16))[1:])
            polys.append((np.array(pts) * k * 8).astype(np.int32))
        layer = np.zeros(img.shape[:2], np.uint8)
        for poly in polys:  # even-odd: each outline flips what's inside it
            m = np.zeros_like(layer)
            cv2.fillPoly(m, [poly], 1, lineType=cv2.LINE_AA, shift=3)
            layer ^= m
        img[layer > 0] = rgb
    cv2.imwrite(str(out), img)


if __name__ == "__main__":
    main()
