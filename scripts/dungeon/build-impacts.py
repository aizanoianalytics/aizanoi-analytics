#!/usr/bin/env python3
"""Impact-effect atlas builder for the dungeon.

The effects sheet's only warm frames (16..19) are tiny generic blobs. They read
as "something happened", but not as *impact*: there is no directional energy, no
sharp core, and nothing that separates a normal hit from a critical one at a
glance.

This builder produces a dedicated 32px-per-frame impact sheet:

    frame 0..3   impact burst (core spike -> star -> ring -> fade)
    frame 4..6   critical slash mark (a swept arc with a bright pocket)
    frame 7      ground crack shockwave ring

Frames are authored at 2x and box-downsampled one hard pixel per 2x2 block, the
same discipline as build-tilesets.py and build-lights.py: stepped edges stay
readable at 32px and the rebuild is byte-identical.

Load site: BootScene registers this as 'tiles-impacts' with 32px frames.
Consumed by: GameScene.createDamageSpark() and its critical path.
"""

import os

from PIL import Image

AUTHOR = 64
TILE = 32
COLS = 4
SHEET = (TILE * COLS, TILE * 2)

OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "frontend", "js", "v3", "apps", "dungeon", "assets", "tilesets",
)

# Impact ramp. A normal hit stays in the amber band so the player learns "amber
# = my hit connected"; a critical escalates to white/gold, which is the only
# colour change the game needs to communicate a crit.
SPARK = {
    "tip": (200, 74, 26),
    "hot": (243, 138, 42),
    "core": (250, 202, 108),
    "white": (255, 246, 214),
}
# Shockwave ring: cool so it never reads as the same event as the burst.
RING = {
    "edge": (46, 58, 84),
    "mid": (126, 142, 176),
    "lite": (198, 210, 232),
}


def downsample(img):
    """2x2 box filter to one flat pixel: authored anti-aliasing is averaged away."""
    small = Image.new("RGBA", (TILE, TILE))
    for y in range(TILE):
        for x in range(TILE):
            r = g = b = a = 0
            for dy in range(2):
                for dx in range(2):
                    px = img.getpixel(((x * 2) + dx, (y * 2) + dy))
                    r += px[0]
                    g += px[1]
                    b += px[2]
                    a += px[3]
            small.putpixel((x, y), (r // 4, g // 4, b // 4, a // 4))
    return small


def clamp(v):
    return 0 if v < 0 else 255 if v > 255 else int(v)


def put(img, x, y, color, alpha=255):
    if 0 <= x < AUTHOR and 0 <= y < AUTHOR:
        img.putpixel((x, y), (clamp(color[0]), clamp(color[1]), clamp(color[2]), alpha))


def burst(phase):
    """Four-frame impact burst.

    0: a tight white-hot spike -- the instant of contact.
    1: a four-point star, still core-heavy.
    2: a thin expanding ring with a fading core.
    3: a broad dim ring, almost gone.
    """
    img = Image.new("RGBA", (AUTHOR, AUTHOR), (0, 0, 0, 0))
    cx = cy = AUTHOR / 2 - 0.5
    spread = 0.30 + 0.34 * phase

    for y in range(AUTHOR):
        for x in range(AUTHOR):
            dx = x - cx
            dy = y - cy
            dist = (dx * dx + dy * dy) ** 0.5
            if dist > spread * AUTHOR:
                continue
            # Four-point star: distance measured along the axes dominates the
            # diagonals, which is what gives the spikes.
            star = min(1.0, abs(dx) + abs(dy) * 0.25, abs(dy) + abs(dx) * 0.25)
            norm = dist / max(spread * AUTHOR, 0.001)
            core = 1 - norm

            if norm > 0.92:
                continue
            if phase >= 2:
                # Ring frames: hollow in the middle, bright at the rim.
                if norm > 0.62:
                    band = (norm - 0.62) / 0.30
                    if band < 0.5:
                        c = tuple(SPARK["core"][i] + (SPARK["white"][i] - SPARK["core"][i]) * (band / 0.5) for i in range(3))
                    else:
                        c = tuple(SPARK["hot"][i] + (SPARK["tip"][i] - SPARK["hot"][i]) * ((band - 0.5) / 0.5) for i in range(3))
                    put(img, x, y, c, clamp(255 * (1 - band * 0.7)))
                continue

            if norm < 0.24:
                c = SPARK["white"]
            elif norm < 0.44:
                c = tuple(SPARK["white"][i] + (SPARK["core"][i] - SPARK["white"][i]) * ((norm - 0.24) / 0.20) for i in range(3))
            else:
                c = tuple(SPARK["core"][i] + (SPARK["tip"][i] - SPARK["core"][i]) * ((norm - 0.44) / 0.56) for i in range(3))
            # The spikes stay bright; the diagonals fall off first.
            a = clamp(255 * (1 - norm * 0.35) * (0.45 + 0.55 * (1 - star * 0.5)))
            put(img, x, y, c, a)

    return downsample(img)


def slash(phase):
    """Three-frame critical slash: a swept arc with a bright leading pocket.

    `phase` advances the head of the sweep and thins the tail so the mark reads
    as a *motion*, not a crescent shape pasted on the screen.
    """
    img = Image.new("RGBA", (AUTHOR, AUTHOR), (0, 0, 0, 0))
    cx = cy = AUTHOR / 2 - 0.5
    radius = AUTHOR * 0.40
    # A 150-degree sweep, rotated by phase so the head travels.
    start = -1.15 + 0.9 * phase
    end = start + 2.55
    head = start + 2.55
    thickness = AUTHOR * (0.085 + 0.02 * (1 - phase))

    import math
    for y in range(AUTHOR):
        for x in range(AUTHOR):
            dx = x - cx
            dy = y - cy
            dist = (dx * dx + dy * dy) ** 0.5
            if dist > radius * 1.35:
                continue
            ang = math.atan2(dy, dx)
            if ang < start or ang > end:
                continue
            # Radial band, thicker near the outer edge like a real blade arc.
            band = 1 - abs(dist - radius) / thickness
            if band <= 0:
                continue
            along = (ang - start) / (end - start)
            # Brightness peaks just behind the head and fades into the tail.
            tail = max(0.0, 1.0 - (head - ang) / 2.4)
            heat = 0.30 + 0.70 * tail
            if along > 0.86:
                heat = 1.0
            if along < 0.22:
                heat *= along / 0.22
            if heat < 0.12:
                continue
            if heat > 0.78:
                c = SPARK["white"]
            elif heat > 0.45:
                c = tuple(SPARK["white"][i] + (SPARK["core"][i] - SPARK["white"][i]) * ((0.78 - heat) / 0.33) for i in range(3))
            else:
                c = tuple(SPARK["core"][i] + (SPARK["tip"][i] - SPARK["core"][i]) * ((0.45 - heat) / 0.33) for i in range(3))
            put(img, x, y, c, clamp(255 * band * heat))

    return downsample(img)


def shock(phase):
    """Ground shockwave ring. Two frames: snap and dissipate."""
    import math
    img = Image.new("RGBA", (AUTHOR, AUTHOR), (0, 0, 0, 0))
    cx = cy = AUTHOR / 2 - 0.5
    radius = AUTHOR * (0.16 + 0.26 * phase)
    thickness = AUTHOR * 0.055

    for y in range(AUTHOR):
        for x in range(AUTHOR):
            dx = x - cx
            dy = y - cy
            dist = (dx * dx + dy * dy) ** 0.5
            band = 1 - abs(dist - radius) / thickness
            if band <= 0:
                continue
            # A ring is not perfectly round: a subtle elliptical squash reads as
            # ground contact rather than a floating halo.
            squash = 1 - abs(dy) / (dist + 0.001) * 0.22
            band *= squash
            if band <= 0:
                continue
            if band > 0.75:
                c = RING["lite"]
            elif band > 0.4:
                c = tuple(RING["lite"][i] + (RING["mid"][i] - RING["lite"][i]) * ((0.75 - band) / 0.35) for i in range(3))
            else:
                c = tuple(RING["mid"][i] + (RING["edge"][i] - RING["mid"][i]) * ((0.4 - band) / 0.4) for i in range(3))
            alpha = clamp(255 * band * (1 - phase * 0.45))
            put(img, x, y, c, alpha)

    return downsample(img)


def build():
    os.makedirs(OUT_DIR, exist_ok=True)
    sheet = Image.new("RGBA", SHEET, (0, 0, 0, 0))

    for i in range(4):
        sheet.paste(burst(i / 3), (i * TILE, 0))
    for i in range(3):
        sheet.paste(slash(i / 2), (i * TILE, TILE))
    sheet.paste(shock(0.0), (3 * TILE, TILE))

    path = os.path.join(OUT_DIR, "aizanoi-impacts.png")
    sheet.save(path)
    print(f"wrote {path} {sheet.size}")


if __name__ == "__main__":
    build()
