"""Yedek vs guncel fark ozeti (satir bazinda, kisa)."""
import difflib

BASE = "C:/Users/husey/aizanoi-analytics"
YEDEK = BASE + "/gelistirmeler/2026-09-16-harita-revizyonu/yedek"
LIVE = BASE + "/frontend/worlds"

JOBS = [
    ("rome-410-476", "main.js"),
    ("athens-450-430", "main.js"),
    ("iga-airport", "main.js"),
    ("iga-airport", "aircraft.js"),
    ("iga-airport", "airport-data.js"),
]

for world, fn in JOBS:
    a = open(f"{YEDEK}/{world}/{fn}", encoding="utf-8").read().splitlines()
    b = open(f"{LIVE}/{world}/js/{fn}", encoding="utf-8").read().splitlines()
    sm = difflib.SequenceMatcher(None, a, b)
    n_add = n_del = 0
    hunks = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        n_del += i2 - i1
        n_add += j2 - j1
        hunks.append((a[i1] if i1 < i2 else "", b[j1] if j1 < j2 else ""))
    print(f"===== {world}/{fn}: -{n_del} +{n_add} satir")
    for old_l, new_l in hunks[:60]:
        o = (old_l.strip()[:100] + " | ") if old_l else ""
        print(f"  - {o}-> {(new_l.strip()[:100])}")
    if len(hunks) > 60:
        print(f"  ... +{len(hunks) - 60} hunk daha")
