"""Ham veri denetimi: yedek vs guncel BUILDINGS x/w/z oranlari."""
import re

BASE = "C:/Users/husey/aizanoi-analytics"


def raw_xyz(path, section="BUILDINGS"):
    t = open(path, encoding="utf-8").read()
    m = re.search(section + r"\s*=\s*\[", t)
    seg = t[m.start(): m.start() + 80000]
    end = seg.find("\n];")
    seg = seg[:end] if end > 0 else seg
    out = {}
    for mm in re.finditer(r"id:\s*'([^']+)'", seg):
        bid = mm.group(1)
        chunk = seg[mm.start(): mm.start() + 900]
        vals = {}
        for key in ("x", "w", "z", "d"):
            f = re.search(r"(?<![\w])" + key + r":\s*(-?[\d.]+)", chunk)
            vals[key] = float(f.group(1)) if f else None
        out[bid] = vals
    return out


def ratio(a, b):
    if a is None or b is None or a == 0:
        return "-"
    return f"{b / a:.2f}"


for world, sec in [
    ("aizanoi-225", "BUILDINGS"),
    ("rome-410-476", "BUILDINGS"),
    ("athens-450-430", "BUILDINGS"),
    ("iga-airport", "BUILDINGS"),
]:
    f = "airport-data.js" if world == "iga-airport" else "city-data.js"
    old = raw_xyz(f"{BASE}/gelistirmeler/2026-09-16-harita-revizyonu/yedek/{world}/{f}", sec)
    new = raw_xyz(f"{BASE}/frontend/worlds/{world}/js/{f}", sec)
    print(f"===== {world} ({len(old)} -> {len(new)} kayit)")
    for k in list(old)[:4]:
        o, n = old[k], new.get(k, {})
        print(
            f"  {k}: x {o['x']}->{n.get('x')} ({ratio(o['x'], n.get('x'))}) "
            f"w {o['w']}->{n.get('w')} ({ratio(o['w'], n.get('w'))}) "
            f"z {o['z']}->{n.get('z')} ({ratio(o['z'], n.get('z'))})"
        )
