#!/usr/bin/env python3
"""Erzeugt die PNG-App-Icons (icons/) nach dem Motiv von icon.svg."""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
GREEN, LIGHT = (47, 125, 79), (227, 241, 232)


def bezier(p0, p1, p2, p3, n=40):
    return [tuple((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d
                  for a, b, c, d in zip(p0, p1, p2, p3)) for t in (i / n for i in range(n + 1))]


def leaf():
    # Blattform aus icon.svg (64er-Raster): Spitze oben, runder Bauch unten
    pts = bezier((32, 12), (23, 20), (18, 29), (18, 37))
    pts += bezier((18, 37), (18, 44.7), (24.3, 51), (32, 51))
    pts += bezier((32, 51), (39.7, 51), (46, 44.7), (46, 37))
    pts += bezier((46, 37), (46, 29), (41, 20), (32, 12))
    return pts


def draw(size, maskable):
    s = 8  # Supersampling
    S = size * s
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, S, S], fill=GREEN)
        scale, off = S / 64 * 0.72, S * 0.14  # Motiv in der sicheren Zone (80 %)
    else:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 14 / 64, fill=GREEN)
        scale, off = S / 64, 0
    tr = lambda p: (off + p[0] * scale, off + p[1] * scale)
    d.polygon([tr(p) for p in leaf()], fill=LIGHT)
    w = int(3.5 * scale)
    for a, b in (((32, 22), (32, 52)), ((32, 34), (25, 28)), ((32, 42), (40, 35))):
        d.line([tr(a), tr(b)], fill=GREEN, width=w)
        for p in (a, b):
            x, y = tr(p)
            d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=GREEN)
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
for size in (192, 512):
    draw(size, False).save(OUT / f"icon-{size}.png", optimize=True)
    draw(size, True).save(OUT / f"maskable-{size}.png", optimize=True)
draw(180, True).save(OUT / "apple-touch-icon.png", optimize=True)
print("Icons geschrieben:", *sorted(p.name for p in OUT.iterdir()))
