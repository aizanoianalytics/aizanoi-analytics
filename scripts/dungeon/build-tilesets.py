#!/usr/bin/env python3
"""Dungeon tileset builder.

Builds the floor and wall tiles at 64px and downsamples every 2x2 block to one
flat pixel. That produces the hard, stepped value breaks hand-placed pixel art
uses (a commercial tile reads as 1px highlight / 1px mid / 1px shadow / keyline)
without anyone placing four thousand pixels by hand. Any anti-aliasing the
painter introduced is averaged away by the downsample instead of surviving as
the soft gradient that makes a 32px tile look blurry.

Tile geometry stays compatible with the engine:

    BootScene loads these as 32px frames
    GameScene.renderMap reads:
        floor 0,1,2  -> floor variants (`(x + y) % 3`)
        floor 5      -> altar / base floor
        floor 8      -> portal floor
        wall 0       -> wall body

Light source is one fixed direction (upper-left) everywhere, so a floor and a
wall sitting next to each other agree on which way the light comes from.

Rebuilds are deterministic: the same hash inputs always produce byte-identical
tiles, so a rebuilt tileset cannot change a captured QA frame.
"""

import math
import os

from PIL import Image

# Authored at 2x, sampled down to TILE. Doubles the detail budget per authored
# pixel while the shipped texture stays a true 32px tile.
AUTHOR = 64
TILE = 32
COLS = 5
SHEET = (TILE * COLS, TILE * COLS)

OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "frontend", "js", "v3", "apps", "dungeon", "assets", "tilesets",
)

# ── Palette ────────────────────────────────────────────────────────────────
# A small, deliberate ramp per material. Nothing outside these values, so the
# tiles can never develop the salt-and-pepper clustering that random noise
# produces.
#
# Value separation is the load-bearing rule here: the floor must be clearly
# LIGHTER than the wall body. The chapter palette multiplies both at runtime, so
# whatever light/dark relationship is baked into the texture survives every
# chapter tint. A floor that starts level with the wall collapses into one dark
# mass the moment any dark chapter is applied - which is exactly the "muddy,
# everything is black" failure this module had.
MARBLE = {
    "key": (40, 38, 36),
    "shade": (132, 126, 118),
    "mid": (178, 172, 163),
    "base": (224, 220, 213),
    "lite": (242, 239, 233),
    "glint": (252, 250, 246),
}
MARBLE_ALT = {
    "key": (44, 42, 39),
    "shade": (138, 132, 123),
    "mid": (184, 177, 167),
    "base": (216, 211, 203),
    "lite": (236, 232, 225),
    "glint": (250, 248, 242),
}
MARBLE_PALE = {
    "key": (48, 46, 43),
    "shade": (142, 136, 127),
    "mid": (188, 181, 171),
    "base": (232, 228, 220),
    "lite": (246, 243, 237),
    "glint": (254, 252, 248),
}
# Wall stone: mid-dark, so a floor of 224 reads clearly brighter than a wall of
# 150 without either one clipping to black or white under the chapter tint.
STONE = {
    "key": (24, 23, 22),
    "shade": (82, 79, 76),
    "mid": (124, 120, 115),
    "base": (168, 163, 155),
    "lite": (206, 202, 195),
    "glint": (236, 233, 227),
}
BRASS = {
    "key": (74, 52, 26),
    "shade": (140, 100, 48),
    "mid": (186, 142, 74),
    "base": (222, 178, 104),
    "lite": (244, 212, 148),
}
GLOW = {
    "key": (22, 34, 44),
    "shade": (44, 74, 96),
    "mid": (86, 138, 168),
    "base": (150, 202, 226),
    "lite": (206, 238, 250),
}


def hash01(x, y, salt):
    """Deterministic 0..1 hash. No global RNG state, so tile order is stable."""
    n = (x * 374761393 + y * 668265263 + salt * 2246822519) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    n = (n ^ (n >> 16)) & 0xFFFFFFFF
    return n / 4294967296.0


def edge_distance(x, y, tile=AUTHOR):
    """Distance in authored pixels to the nearest tile edge (0 at the edge)."""
    return min(x, y, tile - 1 - x, tile - 1 - y)


def downsample(img):
    """2x2 box filter to 32px. Averages any authored anti-aliasing away."""
    small = Image.new("RGBA", (TILE, TILE))
    for y in range(TILE):
        for x in range(TILE):
            r = g = b = 0
            for dy in range(2):
                for dx in range(2):
                    px = img.getpixel(((x * 2) + dx, (y * 2) + dy))
                    r += px[0]
                    g += px[1]
                    b += px[2]
            small.putpixel((x, y), (r // 4, g // 4, b // 4, 255))
    return small


# ── Floor ──────────────────────────────────────────────────────────────────

def marble_floor(pal, variant=0):
    """One marble slab: stepped bevel, a running vein, coarse mineral flecks.

    Authored at 2x then downsampled, so every authored ring becomes one
    shipped pixel with a hard edge - the 1px highlight / 1px mid / 1px shadow
    structure a commercial tile is made of.
    """
    img = Image.new("RGBA", (AUTHOR, AUTHOR))
    vein_phase = variant * 1.9
    fleck_salt = 1000 + variant * 37

    for y in range(AUTHOR):
        for x in range(AUTHOR):
            d = edge_distance(x, y)

            if d < 0:
                c = pal["key"]
            elif d < 2:
                c = pal["shade"]
            elif d < 4:
                # Corner-aware bevel: the upper-left catches the light first.
                corner = (x + y) < (AUTHOR / 2)
                c = pal["lite"] if corner else pal["shade"]
            else:
                c = pal["base"]

                # Surface detail. Every pattern is a per-tile fragment that
                # RESETS at the slab edge: a band that runs across neighbouring
                # tiles reads as a diagonal ribbon over the whole floor, which
                # destroys the sense of discrete stones and produces moire when
                # the camera pans. Sine bands over absolute tile coordinates
                # are therefore never used here.

                # A chisel strike: one short hard-edged line per slab, anchored
                # to the upper-left quadrant.
                sx = (x - 6) % (AUTHOR - 8)
                sy = (y - 5) % (AUTHOR - 8)
                if 0 <= sx < 7 and sy == 0:
                    c = pal["lite"]
                elif 0 <= sx < 5 and sy == 1:
                    c = pal["shade"]
                # Coarse mineral flecks, placed by a stable hash.
                elif hash01(x, y, fleck_salt) < 0.022:
                    c = pal["shade"]
                elif hash01(y, x, fleck_salt + 7) < 0.020:
                    c = pal["lite"]

            img.putpixel((x, y), c + (255,))

    return downsample(img)


def base_floor(pal):
    """The Zeus altar tile: marble with a brass inlay ring and four studs."""
    img = Image.new("RGBA", (AUTHOR, AUTHOR))
    cx = cy = AUTHOR / 2 - 1
    half = AUTHOR * 0.19
    ring = AUTHOR * 0.30

    for y in range(AUTHOR):
        for x in range(AUTHOR):
            d = edge_distance(x, y)
            if d < 0:
                c = pal["key"]
            elif d < 2:
                c = pal["shade"]
            elif d < 4:
                corner = (x + y) < (AUTHOR / 2)
                c = pal["lite"] if corner else pal["shade"]
            else:
                c = pal["base"]

            ax = abs(x - cx)
            ay = abs(y - cy)
            if ax <= ring and ay <= ring:
                # Ring border, then the raised face, then the shoulder.
                if ax >= ring - 3 or ay >= ring - 3:
                    c = BRASS["key"] if (ax + ay) % 7 < 1 else BRASS["shade"]
                elif ax <= half and ay <= half:
                    # A single highlight block on the upper-left face.
                    c = BRASS["lite"] if (ax < 4 and ay < 4) else BRASS["base"]
                else:
                    c = BRASS["mid"] if hash01(x, y, 9) < 0.5 else BRASS["shade"]
            elif (ring + 5 < ax < ring + 9) and (ring + 5 < ay < ring + 9):
                # Four corner studs: the mason's layout marks.
                c = BRASS["shade"]
            elif math.sin((x * 0.40 + y * 0.26) * math.pi * 2 / AUTHOR) > 0.95:
                c = pal["shade"]

            img.putpixel((x, y), c + (255,))

    return downsample(img)


def portal_floor():
    """The portal floor: darker stone slab with a carved four-point star."""
    img = Image.new("RGBA", (AUTHOR, AUTHOR))
    dark = {
        "key": (18, 20, 26),
        "shade": (38, 42, 54),
        "mid": (58, 64, 80),
        "base": (78, 85, 104),
        "lite": (108, 116, 140),
    }
    cx = cy = AUTHOR / 2 - 1

    for y in range(AUTHOR):
        for x in range(AUTHOR):
            d = edge_distance(x, y)
            if d < 0:
                c = dark["key"]
            elif d < 2:
                c = dark["shade"]
            elif d < 4:
                corner = (x + y) < (AUTHOR / 2)
                c = dark["lite"] if corner else dark["shade"]
            else:
                c = dark["base"]

            # Carved star: the incision is the key colour, and one glint on
            # the upper-left arm sells it as cut into the stone.
            dx = x - cx
            dy = y - cy
            md = abs(dx) + abs(dy)
            diag = abs(abs(dx) - abs(dy))
            if md < AUTHOR * 0.30 and diag < 2:
                c = dark["key"]
            elif md < AUTHOR * 0.30 and diag == 2:
                c = GLOW["lite"] if (dx + dy) < 0 else dark["key"]
            elif md < AUTHOR * 0.16:
                c = GLOW["shade"]
            elif md < AUTHOR * 0.20:
                c = dark["mid"]
            elif md < AUTHOR * 0.42 and hash01(x, y, 5) < 0.14:
                # A faint glow bleed, so the tile reads as active.
                c = GLOW["shade"]

            img.putpixel((x, y), c + (255,))

    return downsample(img)


# ── Wall ───────────────────────────────────────────────────────────────────

def wall_tile(pal, variant=0):
    """A temple ashlar block: two staggered courses, hard mortar, SDF bevel.

    The tile holds two 16px block rows. Each block gets a keyline and a
    highlight from the single upper-left light source, and the lower course
    falls off into the room so a wall reads as a solid volume rather than a
    flat slab.
    """
    img = Image.new("RGBA", (AUTHOR, AUTHOR))
    seam_y = AUTHOR // 2
    joint_top = 17 if variant == 0 else 35
    joint_bottom = joint_top + 15

    for y in range(AUTHOR):
        for x in range(AUTHOR):
            d = edge_distance(x, y)
            in_top = y < seam_y
            joint = in_top and (
                abs(x - joint_top) < 1.5 or abs(x - (joint_top + AUTHOR / 2)) < 1.5
            )
            else_joint = (not in_top) and abs(x - joint_bottom) < 1.5

            if in_top and abs(y - seam_y) < 1.5:
                c = pal["key"]
            elif joint or else_joint:
                c = pal["key"]
            elif in_top and abs(y - seam_y) < 3:
                c = pal["shade"]
            elif d < 0:
                # The top row of the tile is mortar against the course above.
                c = pal["key"]
            elif d < 2:
                c = pal["shade"]
            elif d < 4:
                corner = x < AUTHOR / 2 or y < AUTHOR / 2
                c = pal["lite"] if corner else pal["shade"]
            else:
                c = pal["base"]

                if in_top:
                    # The upper course catches the light.
                    if (
                        x < AUTHOR * 0.45
                        and y < AUTHOR * 0.45
                        and hash01(x, y, 11) < 0.12
                    ):
                        c = pal["lite"]
                else:
                    # The lower course recedes, and its base falls into the room.
                    depth = (y - seam_y) / (AUTHOR - seam_y)
                    if depth > 0.72:
                        c = pal["shade"]
                    elif depth > 0.40 and hash01(x, y, 13) < 0.5:
                        c = pal["mid"]

                    # A chisel mark: two bright pixels, the only high-frequency
                    # detail, so the block face is not perfectly uniform.
                    if 7 <= y <= 9 and (x * 5 + variant) % 23 < 2:
                        c = pal["lite"]

                # Wear: a few pixels knocked down to shade, placed by a stable
                # hash rather than global noise.
                if hash01(x, y, variant * 31 + 3) < 0.012:
                    c = pal["shade"]

            img.putpixel((x, y), c + (255,))

    return downsample(img)


def build():
    os.makedirs(OUT_DIR, exist_ok=True)

    floor = Image.new("RGBA", SHEET, (0, 0, 0, 0))
    wall = Image.new("RGBA", SHEET, (0, 0, 0, 0))

    floor_tiles = {
        0: marble_floor(MARBLE, 0),
        1: marble_floor(MARBLE_ALT, 1),
        2: marble_floor(MARBLE_PALE, 2),
        5: base_floor(MARBLE),
        8: portal_floor(),
    }
    wall_tiles = {
        0: wall_tile(STONE, 0),
        1: wall_tile(STONE, 1),
    }

    def paste(sheet, index, tile):
        sheet.paste(tile, ((index % COLS) * TILE, (index // COLS) * TILE))

    for index, tile in floor_tiles.items():
        paste(floor, index, tile)
    for index, tile in wall_tiles.items():
        paste(wall, index, tile)

    floor_path = os.path.join(OUT_DIR, "aizanoi-floor.png")
    wall_path = os.path.join(OUT_DIR, "aizanoi-walls.png")
    floor.save(floor_path)
    wall.save(wall_path)
    print(f"wrote {floor_path} {floor.size}")
    print(f"wrote {wall_path} {wall.size}")


if __name__ == "__main__":
    build()
