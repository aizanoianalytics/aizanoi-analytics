"""Procedural pixel-art spritesheets for the 3 new dungeon enemy archetypes.

Matches the existing 64px / 8-col / RPG-Maker-ish style: dark outlines,
limited palette, 4-frame idle/walk rows. Generated with PIL only (no Blender
needed for 2D sheet work — Blender stays reserved for 3D assets).
"""
from PIL import Image
import math

FRAME = 64
COLS = 8
ROWS = 4

OUT = "/tmp/dungeon-mastery/frontend/js/v3/apps/dungeon/assets/sprites"


def new_sheet():
    img = Image.new("RGBA", (FRAME * COLS, FRAME * ROWS), (0, 0, 0, 0))
    return img


def P(img, x, y, color):
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((x, y), color)


def rect(img, x, y, w, h, color):
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            P(img, xx, yy, color)


def ellipse(img, cx, cy, rx, ry, color, outline=None):
    for yy in range(int(cy - ry), int(cy + ry) + 1):
        for xx in range(int(cx - rx), int(cx + rx) + 1):
            dx = (xx - cx) / max(rx, 1)
            dy = (yy - cy) / max(ry, 1)
            if dx * dx + dy * dy <= 1.0:
                if outline and (abs(dx * dx + dy * dy - 1.0) < 0.42 or abs(dx) > 0.86 or abs(dy) > 0.86):
                    P(img, xx, yy, outline)
                else:
                    P(img, xx, yy, color)


def line(img, x0, y0, x1, y1, color, thick=1):
    dx, dy = x1 - x0, y1 - y0
    steps = max(abs(dx), abs(dy), 1)
    for i in range(steps + 1):
        t = i / steps
        x = int(round(x0 + dx * t))
        y = int(round(y0 + dy * t))
        for ox in range(thick):
            for oy in range(thick):
                P(img, x + ox, y + oy, color)


# ---------- palettes (dark outline + 3 shades, consistent with enemies.png) ----
def shade(base, f):
    return (max(0, min(255, int(base[0] * f))),
            max(0, min(255, int(base[1] * f))),
            max(0, min(255, int(base[2] * f))),
            255)


# ============================ 1. CULT ACOLYTE (summoner) =====================
def draw_acolyte(img, ox, oy, phase):
    """Hooded priest, teal robe, glow rune orb floating at hand height."""
    robe = (0x1e, 0x7a, 0x6f, 255)
    robe_hi = shade(robe, 1.35)
    robe_lo = shade(robe, 0.6)
    skin = (0xd9, 0xc3, 0x9a, 255)
    bone = (0xe8, 0xec, 0xef, 255)
    gold = (0xc5, 0xa0, 0x59, 255)
    dark = (0x0b, 0x0d, 0x13, 255)
    glow = (0x7d, 0xf3, 0xe0, 255)
    glow_lo = (0x2a, 0x6e, 0x66, 255)

    bob = [0, -1, -2, -1][phase]
    cx = ox + 32
    top = oy + 18 + bob

    # Ground shadow ellipse
    ellipse(img, cx, oy + 58, 15, 5, (0, 0, 0, 70))

    # robe / body: tapering cone
    rect(img, cx - 9, top + 18, 18, 12, robe)
    rect(img, cx - 6, top + 18, 2, 12, robe_hi)
    for row in range(26):
        w = 16 - row * 0.5
        rect(img, int(cx - w // 2), top + 28 + row, int(w), 1, robe if row % 3 else robe_lo)
    # robe hem flare
    rect(img, cx - 12, top + 30, 24, 3, robe_lo)

    # shoulders/arms
    rect(img, cx - 15, top + 19, 6, 11, robe_lo)
    rect(img, cx + 9, top + 19, 6, 11, robe_lo)

    # hood
    ellipse(img, cx, top + 10, 10, 11, robe)
    ellipse(img, cx, top + 11, 7, 8, dark)
    line(img, cx - 8, top + 4, cx - 11, top + 12, robe_lo, 2)
    line(img, cx + 8, top + 4, cx + 11, top + 12, robe_lo, 2)

    # glowing eyes
    P(img, cx - 4, top + 10, glow)
    P(img, cx + 4, top + 10, glow)
    P(img, cx - 4, top + 11, glow_lo)
    P(img, cx + 4, top + 11, glow_lo)

    # gold robe trim
    for xx in range(cx - 8, cx + 9, 4):
        rect(img, xx, top + 34, 2, 2, gold)

    # summoning orb between hands — grows only slightly so the silhouette
    # (hood + robe) stays readable in every frame.
    orb_y = top + 25 + [0, 1, 0, -1][phase]
    orb_r = [4, 5, 5, 4][phase]
    for rr in range(orb_r + 2):
        a = 70 - rr * 24
        ellipse(img, cx, orb_y, orb_r + rr, orb_r + rr, (glow[0], glow[1], glow[2], max(0, a)))
    ellipse(img, cx, orb_y, orb_r, orb_r, glow)
    P(img, cx - 1, orb_y - 1, (0xff, 0xff, 0xff, 255))
    # hands cupping the orb keep the priest readable
    P(img, cx - orb_r - 1, orb_y, skin)
    P(img, cx + orb_r + 1, orb_y, skin)
    # rune sparks orbiting (persistent accent in every frame)
    for k in range(3):
        ang = phase * 1.5 + k * 2.09
        sx = cx + int(math.cos(ang) * (orb_r + 4))
        sy = orb_y + int(math.sin(ang) * (orb_r + 3)) - 2
        P(img, sx, sy, glow)
    P(img, cx, orb_y - orb_r - 3, gold)


# ============================ 2. STONE GOLEM (heavy tank) ====================
def draw_golem(img, ox, oy, phase):
    rock = (0x8a, 0x7c, 0x62, 255)
    rock_hi = shade(rock, 1.3)
    rock_lo = shade(rock, 0.62)
    moss = (0x5f, 0x7a, 0x3a, 255)
    core = (0xff, 0x8a, 0x3c, 255)
    dark = (0x1a, 0x16, 0x10, 255)
    eye = (0xff, 0xd7, 0x7f, 255)

    sway = [0, 0, 1, 0][phase]
    cx = ox + 32 + sway
    top = oy + 12

    ellipse(img, cx, oy + 60, 20, 6, (0, 0, 0, 70))

    # legs: two stubby slabs — one foot lifts fully so the step reads
    px = [cx - 10, cx + 10]
    lift = [[0, 0, -3, -1], [0, -3, 0, -1]]
    for i, x in enumerate(px):
        y = top + 40 + lift[i][phase]
        rect(img, x - 5, y, 10, 14, rock)
        rect(img, x - 6, y + 12, 12, 3, rock_lo)
        P(img, x - 2, y + 2, rock_lo)
        if lift[i][phase] < -1:
            # foot in the air: show a gap under the sole
            rect(img, x - 5, y + 15, 10, 2, (0, 0, 0, 0))
    # torso bob: a 1px vertical sway sells the weight without a full bounce
    tby = [0, 0, -1, 0][phase]
    # torso: big blocky chest
    rect(img, cx - 15, top + 16 + tby, 30, 26, rock)
    rect(img, cx - 15, top + 16 + tby, 30, 3, rock_hi)
    rect(img, cx - 13, top + 20 + tby, 3, 20, rock_hi)
    rect(img, cx + 10, top + 20 + tby, 3, 20, rock_lo)
    # cracked seams
    line(img, cx - 6, top + 22 + tby, cx - 2, top + 30 + tby, rock_lo, 2)
    line(img, cx + 2, top + 32 + tby, cx + 7, top + 38 + tby, rock_lo, 2)
    # moss patches
    for (mx, my) in [(cx - 11, top + 19 + tby), (cx + 8, top + 26 + tby), (cx - 4, top + 37 + tby)]:
        rect(img, mx, my, 3, 2, moss)
        P(img, mx + 1, my - 1, moss)
    # glowing furnace core — the only high-contrast element, so it pulses
    ellipse(img, cx, top + 29 + tby, 7, 8, dark)
    pulse = [4, 5, 6, 5][phase]
    ellipse(img, cx, top + 29 + tby, pulse, pulse + 1, core)
    P(img, cx - 1, top + 28 + tby, (0xff, 0xff, 0xff, 255))
    P(img, cx, top + 32 + tby, (0xff, 0xd7, 0x7f, 255))

    # arms: huge slabs — one raises per frame so the cycle reads
    # arm raise offsets (side, phase) — one slab swings up per frame
    arm_lift = [[0, 0, -4, -1], [0, -4, 0, -1]]
    for side in (-1, 1):
        idx = 0 if side < 0 else 1
        ay = top + 18 + tby + arm_lift[idx][phase]
        rect(img, cx + side * 18 - 4, ay, 8, 24, rock)
        rect(img, cx + side * 18 - 5, ay, 9, 3, rock_hi)
        rect(img, cx + side * 18 - 6, ay + 21, 10, 6, rock_lo)  # fist
        P(img, cx + side * 18 - 2, ay + 4, rock_lo)

    # head: single glowing slit in a helmet slab (tracks the torso bob)
    rect(img, cx - 9, top + 2 + tby, 18, 15, rock)
    rect(img, cx - 9, top + 2 + tby, 18, 3, rock_hi)
    rect(img, cx - 6, top + 9 + tby, 12, 3, dark)
    for ex in (-4, -2, 1, 3):
        P(img, cx + ex, top + 10 + tby, eye)


# ============================ 3. FERRYMAN (fast flanker) =====================
def draw_ferryman(img, ox, oy, phase):
    cloak = (0x2c, 0x3e, 0x58, 255)
    cloak_hi = shade(cloak, 1.45)
    cloak_lo = shade(cloak, 0.55)
    bone = (0xdd, 0xe3, 0xe8, 255)
    coin = (0xf1, 0xc4, 0x0f, 255)
    cyan = (0x67, 0xe8, 0xf9, 255)
    dark = (0x0b, 0x0d, 0x13, 255)

    lean = [0, 2, 1, -1][phase]
    cx = ox + 32 + lean
    top = oy + 16

    ellipse(img, cx, oy + 59, 12, 4, (0, 0, 0, 70))

    # tattered cloak trailing — the silhouette cue
    for i, dy in enumerate(range(34)):
        w = 13 - i * 0.22
        col = cloak if i % 4 else cloak_lo
        rect(img, int(cx - w / 2), top + dy, int(w), 1, col)
    for i in range(5):
        rect(img, cx - 11 + i * 5, top + 35, 2, 4 + (i % 2), cloak_lo)

    # legs (thin, mid-stride)
    leg_y = top + 34
    lx = cx + [-6, 5, 0, 7][phase]
    line(img, cx - 2, leg_y - 6, lx, leg_y + 6, cloak_lo, 3)
    line(img, cx + 2, leg_y - 6, lx - 4, leg_y + 5, cloak_lo, 3)
    rect(img, lx - 2, leg_y + 6, 5, 2, bone)
    rect(img, lx - 6, leg_y + 5, 5, 2, bone)

    # torso
    rect(img, cx - 8, top + 14, 16, 16, cloak)
    rect(img, cx - 8, top + 14, 3, 16, cloak_hi)
    rect(img, cx + 4, top + 14, 3, 16, cloak_lo)
    # rope sash
    for i in range(9, 16, 4):
        rect(img, cx - 8, top + i, 16, 1, (0x6b, 0x4f, 0x2a, 255))

    # skull head with coin over one eye
    ellipse(img, cx, top + 8, 7, 8, bone)
    rect(img, cx - 4, top + 5, 3, 3, dark)
    rect(img, cx + 1, top + 5, 3, 3, dark)
    rect(img, cx - 2, top + 12, 4, 2, dark)
    # coin in eye socket, glints on phase 2
    ellipse(img, cx + 2, top + 6, 2, 2, coin)
    if phase == 2:
        P(img, cx + 1, top + 5, (0xff, 0xff, 0xff, 255))

    # scythe swing: back(-6) -> up(0) -> forward(+7) -> settle(+2).
    # The 4-angle sweep loops without a pop because frame 4 is mid-swing,
    # not a teleport back to frame 1.
    swing = [[-7, -9], [-1, -13], [8, -3], [4, -8]][phase]
    hx = cx + 6
    hy = top + 20
    tx = cx + 6 + swing[0]
    ty = top + 6 + swing[1]
    # shaft
    line(img, hx, hy, tx, ty, (0x8a, 0x6a, 0x3a, 255), 2)
    # curved blade extending from the tip
    line(img, tx, ty, tx + 5, ty - 6, cyan, 2)
    line(img, tx + 3, ty - 6, tx + 7, ty - 9, cyan, 1)
    P(img, tx + 6, ty - 9, (0xff, 0xff, 0xff, 255))
    line(img, tx + 5, ty - 6, tx + 3, ty - 3, cyan, 1)


def build(name, draw_fn):
    img = new_sheet()
    for row in range(ROWS):
        for col in range(COLS):
            # rows: 0 idle, 1 walk, 2 attack, 3 hit/death-ish
            if row == 0:
                draw_fn(img, col * FRAME, row * FRAME, col % 4)
            elif row == 1:
                draw_fn(img, col * FRAME, row * FRAME, (col + 2) % 4)
            elif row == 2:
                draw_fn(img, col * FRAME, row * FRAME, 2 if col < 4 else 3)
            else:
                draw_fn(img, col * FRAME, row * FRAME, col % 2)
    path = f"{OUT}/{name}.png"
    img.save(path)
    print("wrote", path, img.size)


build("enemies-summoner", draw_acolyte)
build("enemies-heavy", draw_golem)
build("enemies-flanker", draw_ferryman)
