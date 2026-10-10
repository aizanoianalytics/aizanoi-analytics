#!/usr/bin/env python3
"""Light-source tileset builder for the dungeon.

The decor atlas ships hand-authored props (urns, columns, chests) and is left
untouched. What it does NOT ship is fire: the only light-ish frame on the
effects sheet is a purple player halo, so a brazier built from it reads as a
floating magic orb rather than a bowl of flame.

This builder produces a dedicated 32px-per-frame light sheet:

    frame 0..3  brazier flame (a 4-frame flicker cycle)
    frame 4..6  wall sconce flame (a 3-frame flicker cycle)

Frames are authored at 2x and box-downsampled to one hard pixel per 2x2 block,
matching build-tilesets.py. That keeps every edge stepped and clean instead of
the anti-aliased, fuzzy look a raw 32px gradient produces, and makes the rebuild
byte-identical so QA frames never drift between runs.

Load site: BootScene registers this as 'tiles-lights' with 32px frames.
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

# Fire ramp, hot core to cool tip. A small fixed ramp per zone is what keeps
# the flame readable instead of noisy: the eye should read core -> mid -> tip,
# not a gradient of a hundred arbitrary values.
FIRE = {
    "tip": (168, 52, 22),
    "hot": (232, 122, 40),
    "core": (250, 196, 96),
    "white": (255, 246, 214),
}
# The brazier bowl: dark bronze, lit from inside so the rim stays readable.
BOWL = {
    "key": (38, 26, 18),
    "shade": (82, 54, 30),
    "mid": (128, 84, 44),
    "lite": (188, 138, 76),
}
FLOOR_POOL = (214, 128, 52)


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


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def flame(t, sway):
    """One flame frame.

    `t` is the frame's phase (0..1) and `sway` biases the lean direction, so the
    four frames loop as a credible flicker: the tip bends, narrows and lifts
    rather than wobbling in place. The shape is a teardrop built from a signed
    distance, which gives a clean rim instead of scattered noise pixels.
    """
    img = Image.new("RGBA", (AUTHOR, AUTHOR), (0, 0, 0, 0))
    cx = AUTHOR / 2 - 1 + sway
    base_y = AUTHOR - 10
    height = AUTHOR * (0.52 + 0.10 * (1 - abs(t * 2 - 1)))
    half_w = AUTHOR * (0.20 + 0.03 * (1 - abs(t * 2 - 1)))

    for y in range(AUTHOR):
        for x in range(AUTHOR):
            dx = x - cx
            dy = base_y - y
            if dy < 0 or dy > height:
                continue
            # Taper toward the tip and lean as the flame rises.
            taper = (1 - dy / height) ** 0.75
            lean = (1 - dy / height) * sway * 1.6
            half = max(0.5, half_w * taper)
            adx = abs(dx - lean)
            if adx > half:
                continue

            # Distance to the rim decides colour: white core, hot, tip.
            edge = adx / max(half, 0.001)
            rise = dy / max(height, 0.001)
            if adx < half * 0.30 and rise < 0.55:
                c = FIRE["white"]
            elif adx < half * 0.55:
                c = lerp(FIRE["core"], FIRE["hot"], edge)
            elif rise > 0.72:
                c = lerp(FIRE["hot"], FIRE["tip"], (rise - 0.72) / 0.28)
            else:
                c = lerp(FIRE["hot"], FIRE["tip"], edge * 0.7)
            img.putpixel((x, y), c + (255,))

    return downsample(img)


def bowl(kind):
    """The brazier bowl, lit from inside.

    A bowl is what separates 'flame on the floor' from 'a flame': the dark rim
    under the fire gives the fire somewhere to come FROM. The sconce variant is
    a bracket instead of a bowl.
    """
    img = Image.new("RGBA", (AUTHOR, AUTHOR), (0, 0, 0, 0))
    cx = AUTHOR / 2 - 1
    rim_y = AUTHOR - 12

    for y in range(AUTHOR):
        for x in range(AUTHOR):
            if kind == "bowl":
                dy = y - rim_y
                if dy < 0:
                    continue
                half = AUTHOR * (0.30 + 0.10 * (dy / (AUTHOR - rim_y)))
                adx = abs(x - cx)
                # An ellipse arc reads as a bowl; a flat rectangle reads as a
                # grey block.
                if dy < 2 and adx < half:
                    c = BOWL["lite"]
                elif dy < 6 and adx < half:
                    c = BOWL["mid"]
                elif adx < half and dy < (AUTHOR - rim_y) * 0.7:
                    c = BOWL["shade"]
                else:
                    continue
                # The inner pool is the brightest point: fire sits in there.
                if dy >= 2 and adx < half * 0.55:
                    c = BOWL["shade"]
                img.putpixel((x, y), c + (255,))
            else:
                # Wall bracket: a short vertical bar with a small cup on top.
                adx = abs(x - cx)
                cup_y = rim_y - 4
                if adx < 3 and cup_y <= y < cup_y + 5:
                    c = BOWL["lite"]
                elif adx < 7 and cup_y + 5 <= y < AUTHOR - 2:
                    c = BOWL["mid"]
                elif adx < 3 and y >= cup_y + 5:
                    c = BOWL["shade"]
                else:
                    continue
                img.putpixel((x, y), c + (255,))

    return downsample(img)


def compose(flame_img, bowl_img):
    """Flame sitting in the bowl, with the bowl's inner pool glowing through."""
    out = flame_img.copy()
    for y in range(TILE):
        for x in range(TILE):
            r, g, b, a = bowl_img.getpixel((x, y))
            if a == 0:
                continue
            fr, fg, fb, fa = out.getpixel((x, y))
            if fa > 0:
                # Flame wins where it overlaps; the pool tints it from below.
                out.putpixel((x, y), (min(255, fr + r // 5), min(255, fg + g // 5), min(255, fb + b // 5), 255))
            else:
                out.putpixel((x, y), (r, g, b, 255))
    return out


def build():
    os.makedirs(OUT_DIR, exist_ok=True)
    sheet = Image.new("RGBA", SHEET, (0, 0, 0, 0))

    # Four-frame brazier flicker.
    sway = [-1, 0, 1, 0]
    for i in range(4):
        sheet.paste(compose(flame(i / 4, sway[i]), bowl("bowl")), (i * TILE, 0))

    # Three-frame sconce flicker (tighter, taller flicker: a wall flame has no
    # bowl weight under it).
    sway2 = [0, 1, -1]
    for i in range(3):
        sheet.paste(compose(flame(i / 3, sway2[i]), bowl("sconce")), (i * TILE, TILE))

    path = os.path.join(OUT_DIR, "aizanoi-lights.png")
    sheet.save(path)
    print(f"wrote {path} {sheet.size}")


if __name__ == "__main__":
    build()
