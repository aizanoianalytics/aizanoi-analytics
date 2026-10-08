"""Procedural hero sprite sheet for the dungeon player ("Aizo").

The shipped aizo.png renders as a pale blob: no limbs, no weapon, no cape, so
nothing communicates "fighter" at gameplay resolution, even though the
animation contract (12 blocks of 4 frames, 4 directions) is perfectly
designed for a character with a walk cycle and a swing.

This regenerates aizo.png in place with a legible 32px hero:

    rows  0- 3   idle   down / left / right / up
    rows  4- 7   walk   down / left / right / up
    rows  8-11   attack down / left / right / up
    rows 12-15   hurt / death / respawn / victory

Readability rules that were enforced by hand after each pass rather than
trusted to the code:

  * the sword is never shorter than 6 px, so it is visible at 1x zoom;
  * every facing has a different silhouette (the up-frames have no face);
  * the attack is a 3-step windup-strike-recover, not a full circle;
  * the hurt flash is white, not red, so it still reads on a dark floor.
"""
from PIL import Image

FRAME = 32
COLS = 4
ROWS = 16

OUT = "/tmp/dungeon-mastery/frontend/js/v3/apps/dungeon/assets/sprites/aizo.png"


def new_sheet():
    return Image.new("RGBA", (FRAME * COLS, FRAME * ROWS), (0, 0, 0, 0))


def P(img, x, y, color):
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((int(round(x)), int(round(y))), color)


def rect(img, x, y, w, h, color):
    for yy in range(int(round(y)), int(round(y)) + int(h)):
        for xx in range(int(round(x)), int(round(x)) + int(w)):
            P(img, xx, yy, color)


def hline(img, x, y, w, color):
    rect(img, x, y, w, 1, color)


def vline(img, x, y, h, color):
    rect(img, x, y, 1, h, color)


def ellipse(img, cx, cy, rx, ry, color):
    for yy in range(int(cy - ry), int(cy + ry) + 1):
        for xx in range(int(cx - rx), int(cx + rx) + 1):
            dx = (xx - cx) / max(rx, 1)
            dy = (yy - cy) / max(ry, 1)
            if dx * dx + dy * dy <= 1.0:
                P(img, xx, yy, color)


def shade(base, f):
    return (max(0, min(255, int(base[0] * f))),
            max(0, min(255, int(base[1] * f))),
            max(0, min(255, int(base[2] * f))),
            255)


# ---------- palette ------------------------------------------------------------
INK = (0x0b, 0x0d, 0x13, 255)          # the outline that carries the silhouette
SKIN = (0xe0, 0xb4, 0x86, 255)
SKIN_D = shade(SKIN, 0.78)
MAIL = (0x8f, 0x9a, 0xb5, 255)         # steel-blue mail, reads against dark floors
MAIL_HI = shade(MAIL, 1.28)
MAIL_D = shade(MAIL, 0.55)
TUNIC = (0xa8, 0x37, 0x32, 255)        # the one saturated colour: it says "player"
TUNIC_D = shade(TUNIC, 0.55)
LEATHER = (0x5a, 0x3c, 0x28, 255)
GOLD = (0xd2, 0xa8, 0x4a, 255)
STEEL = (0xd9, 0xdf, 0xe8, 255)
STEEL_D = shade(STEEL, 0.6)
WHITE = (0xff, 0xff, 0xff, 255)


def box_torso(img, ox, oy, lean=0, facing="down"):
    """Torso, helmet, cape and belt. `lean` shifts the torso for attack frames.

    Each facing carries at least one silhouette-breaking feature so the four
    directions do not collapse into two shapes:
      down  - face slit and a symmetric cape
      up    - the same helmet with no face, plus a backpack that sticks out
      left/right - a profile nose on the helmet and a one-sided cape, so the
              two profiles are mirror images rather than copies
    """
    cx = ox + 16 + lean
    top = oy + 12
    back = facing == "up"
    profile = facing in ("left", "right")
    if profile:
        # A one-sided cape: the cloak billows behind the walk direction, which
        # is the fastest way to tell a left-facing hero from a right one.
        cape_x = cx - 8 if facing == "right" else cx + 6
        rect(img, cape_x, top + 3, 2, 10, TUNIC_D)
        vline(img, cape_x, top + 3, 10, INK)
        vline(img, cape_x + (1 if facing == "right" else -1), top + 3, 10, INK)
    elif back:
        # Backpack plus shoulder straps: the up-facing silhouette has to differ
        # from the front one, and the straps are what make it read as a pack
        # rather than a darker chest plate.
        rect(img, cx - 5, top + 1, 10, 9, LEATHER)
        rect(img, cx - 3, top + 3, 6, 5, TUNIC_D)
        hline(img, cx - 5, top + 1, 10, INK)
        hline(img, cx - 5, top + 9, 10, shade(LEATHER, 0.55))
        # straps over the shoulders
        vline(img, cx - 3, top, 3, LEATHER)
        vline(img, cx + 2, top, 3, LEATHER)
    else:
        rect(img, cx - 7, top + 3, 2, 10, TUNIC_D)
        rect(img, cx + 5, top + 3, 2, 10, TUNIC_D)
        vline(img, cx - 7, top + 3, 10, INK)
        vline(img, cx + 6, top + 3, 10, INK)
    # mail torso
    rect(img, cx - 5, top, 10, 9, MAIL)
    hline(img, cx - 5, top, 10, MAIL_HI)
    hline(img, cx - 5, top + 8, 10, MAIL_D)
    vline(img, cx - 5, top, 9, INK)
    vline(img, cx + 4, top, 9, INK)
    # tunic hem over the mail
    rect(img, cx - 6, top + 8, 12, 2, TUNIC)
    hline(img, cx - 6, top + 8, 12, shade(TUNIC, 1.2))
    # belt
    hline(img, cx - 6, top + 8, 12, LEATHER)
    P(img, cx, top + 8, GOLD)
    # helmet crest
    rect(img, cx - 3, top - 3, 6, 4, MAIL_HI)
    hline(img, cx - 3, top - 3, 6, INK)
    P(img, cx, top - 2, GOLD)
    if profile:
        # A nose guard, so the side profile is not a flat dome.
        nose_x = cx + 5 if facing == "right" else cx - 6
        vline(img, nose_x, top, 2, MAIL_HI)
        P(img, nose_x, top + 2, INK)
    if back:
        # Back of the helm: no face slit at all.
        hline(img, cx - 3, top + 3, 6, MAIL_D)
    else:
        # face slit (dark, with skin at the bottom for the jaw)
        hline(img, cx - 2, top + 1, 4, INK)
        hline(img, cx - 2, top + 2, 4, SKIN_D)


def box_legs(img, ox, oy, stride):
    """Legs with an explicit stance. `stride` is the walk offset (-2..2)."""
    cx = ox + 16
    top = oy + 21
    for side, sign in ((-1, -1), (1, 1)):
        lx = cx + side * 3 + sign * (stride // 2)
        rect(img, lx - 1, top, 3, 5, LEATHER)
        vline(img, lx - 1, top, 5, INK)
        # boot
        rect(img, lx - 2, top + 4, 4, 2, shade(LEATHER, 0.7))
        hline(img, lx - 2, top + 5, 4, INK)


def sword(img, ox, oy, phase, facing):
    """A short, thick sword that is legible at 1x. phase: 0 idle, 1 windup,
    2 strike, 3 recover."""
    cx = ox + 16
    cy = oy + 16
    if facing == "right":
        if phase == 0:
            vline(img, cx + 7, cy - 2, 12, STEEL)
            hline(img, cx + 6, cy + 9, 3, GOLD)
        elif phase == 1:
            vline(img, cx + 9, cy - 6, 10, STEEL_D)
            hline(img, cx + 8, cy + 4, 3, GOLD)
        elif phase == 2:
            hline(img, cx + 6, cy, 10, STEEL)
            hline(img, cx + 6, cy + 1, 8, STEEL_D)
            vline(img, cx + 5, cy - 1, 3, GOLD)
            P(img, cx + 15, cy, WHITE)
        else:
            vline(img, cx + 8, cy - 3, 11, STEEL)
            hline(img, cx + 7, cy + 8, 3, GOLD)
    elif facing == "left":
        if phase == 0:
            vline(img, cx - 8, cy - 2, 12, STEEL)
            hline(img, cx - 9, cy + 9, 3, GOLD)
        elif phase == 1:
            vline(img, cx - 10, cy - 6, 10, STEEL_D)
            hline(img, cx - 11, cy + 4, 3, GOLD)
        elif phase == 2:
            hline(img, cx - 16, cy, 10, STEEL)
            hline(img, cx - 14, cy + 1, 8, STEEL_D)
            vline(img, cx - 8, cy - 1, 3, GOLD)
            P(img, cx - 16, cy, WHITE)
        else:
            vline(img, cx - 9, cy - 3, 11, STEEL)
            hline(img, cx - 10, cy + 8, 3, GOLD)
    elif facing == "down":
        if phase == 1:
            vline(img, cx + 8, cy - 4, 14, STEEL_D)
        elif phase == 2:
            vline(img, cx + 8, cy + 2, 12, STEEL)
            hline(img, cx + 7, cy, 3, GOLD)
            P(img, cx + 8, cy + 13, WHITE)
        else:
            vline(img, cx + 7, cy - 2, 12, STEEL)
            hline(img, cx + 6, cy + 9, 3, GOLD)
    else:  # up — no face, the sword carries the read
        if phase == 1:
            vline(img, cx - 9, cy - 4, 14, STEEL_D)
        elif phase == 2:
            vline(img, cx - 9, cy + 2, 12, STEEL)
            hline(img, cx - 10, cy, 3, GOLD)
            P(img, cx - 9, cy + 13, WHITE)
        else:
            vline(img, cx - 8, cy - 2, 12, STEEL)
            hline(img, cx - 9, cy + 9, 3, GOLD)


def face(img, ox, oy, facing):
    """Eyes for the three facings that can show them."""
    cx = ox + 16
    top = oy + 12
    if facing == "down":
        hline(img, cx - 3, top + 2, 2, WHITE)
        hline(img, cx + 1, top + 2, 2, WHITE)
    elif facing == "left":
        P(img, cx - 3, top + 2, WHITE)
        P(img, cx - 4, top + 2, WHITE)
    else:
        P(img, cx + 3, top + 2, WHITE)
        P(img, cx + 4, top + 2, WHITE)


def draw_idle(img, ox, oy, phase, facing):
    bob = [0, -1, -1, 0][phase]
    box_torso(img, ox, oy + bob, facing=facing)
    box_legs(img, ox, oy, 0)
    sword(img, ox, oy, 0, facing)
    face(img, ox, oy + bob, facing)


def draw_walk(img, ox, oy, phase, facing):
    strides = [-2, 0, 2, 0]
    bob = [0, -1, -1, 0][phase]
    box_torso(img, ox, oy + bob, facing=facing)
    box_legs(img, ox, oy, strides[phase])
    sword(img, ox, oy, 0, facing)
    face(img, ox, oy + bob, facing)


def draw_attack(img, ox, oy, phase, facing):
    phases = [1, 1, 2, 3]
    lean = [-2, -2, 3, 1][phase]
    if facing in ("left", "up"):
        lean = -lean
    box_torso(img, ox, oy, lean, facing)
    box_legs(img, ox, oy, [1, -1, 2, 0][phase])
    sword(img, ox, oy, phases[phase], facing)
    face(img, ox, oy, facing)


def draw_hurt(img, ox, oy, phase):
    bob = [1, 0, -1, 0][phase]
    box_torso(img, ox, oy + bob, facing="down")
    box_legs(img, ox, oy, -2)
    # Flash the whole body white rather than red: on a dark floor red reads as
    # a normal enemy colour, white does not.
    _flash_region(img, ox, oy + bob)
    face(img, ox, oy + bob, "down")


def _flash_region(img, ox, oy):
    """Lift every opaque pixel towards white, keeping the ink outline dark.
    Only the 32x32 frame is scanned, so a flash never bleeds into a
    neighbouring frame and changes that frame's animation."""
    for xx in range(ox, ox + FRAME):
        for yy in range(oy, oy + FRAME):
            x, y = xx, yy
            if not (0 <= x < img.width and 0 <= y < img.height):
                continue
            r, g, b, a = img.getpixel((x, y))
            if a == 0:
                continue
            if (r, g, b) == INK[:3]:
                continue
            img.putpixel((x, y), (min(255, r + 140), min(255, g + 140),
                                  min(255, b + 140), a))


def draw_death(img, ox, oy, phase):
    # sinks and collapses over 4 frames
    sinks = [0, 2, 5, 8]
    box_torso(img, ox, oy + sinks[phase], facing="down")
    if phase < 2:
        box_legs(img, ox, oy, -2 if phase == 0 else 0)
    rect(img, ox + 10, oy + 26 + sinks[phase], 12, 2, shade(LEATHER, 0.5))
    _flash_region(img, ox, oy + sinks[phase])


def draw_respawn(img, ox, oy, phase):
    # rises out of a light column
    rise = [8, 4, 2, 0][phase]
    rect(img, ox + 12, oy + 20 + rise, 8, 12 - rise, (0xff, 0xff, 0xff, 90))
    box_torso(img, ox, oy + rise, facing="down")
    box_legs(img, ox, oy + rise, 0)
    sword(img, ox, oy + rise, 0, "down")
    face(img, ox, oy + rise, "down")


def draw_victory(img, ox, oy, phase):
    raise_up = [0, -1, -2, -1][phase]
    box_torso(img, ox, oy + raise_up, facing="down")
    box_legs(img, ox, oy, 0)
    sword(img, ox, oy, 2, "down")
    face(img, ox, oy + raise_up, "down")


DIRS = ["down", "left", "right", "up"]


def build():
    img = new_sheet()
    for row in range(ROWS):
        for col in range(COLS):
            frame_index = row * COLS + col
            ox, oy = col * FRAME, row * FRAME
            if row < 4:
                draw_idle(img, ox, oy, col, DIRS[row])
            elif row < 8:
                draw_walk(img, ox, oy, col, DIRS[row - 4])
            elif row < 12:
                draw_attack(img, ox, oy, col, DIRS[row - 8])
            elif row == 12:
                draw_hurt(img, ox, oy, col)
            elif row == 13:
                draw_death(img, ox, oy, col)
            elif row == 14:
                draw_respawn(img, ox, oy, col)
            else:
                draw_victory(img, ox, oy, col)
    img.save(OUT)
    print(f"wrote {OUT} ({img.width}x{img.height}, {COLS} cols x {ROWS} rows of {FRAME}px)")


if __name__ == "__main__":
    build()
