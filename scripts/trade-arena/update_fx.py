#!/usr/bin/env python3
"""Derive the small, Git-reviewed ECB USD/TRY artifact; never alters owner bars.

python3 scripts/trade-arena/update_fx.py --zip /path/to/eurofxref-hist.zip
Omit --zip to retrieve a new official snapshot. Review/commit/deploy normally.
"""
import argparse
import csv
from datetime import date, datetime, timedelta, timezone
import hashlib
import io
import json
import math
from pathlib import Path
import urllib.request
import zipfile

URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.zip'
OUT = Path(__file__).resolve().parents[2] / 'frontend/arcade/trade-arena/data/fx-usdtry.json'


def derive(blob):
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        text = archive.read('eurofxref-hist.csv').decode('utf-8-sig')
    rows = {}
    for row in csv.DictReader(io.StringIO(text)):
        fixing = date.fromisoformat(row['Date'])
        if fixing < date(2005, 1, 1):
            continue  # modern TRY only, not the redenominated TRL series
        if row['USD'] == 'N/A' or row['TRY'] == 'N/A':
            continue
        usd, tr = float(row['USD']), float(row['TRY'])
        if not all(math.isfinite(v) and v > 0 for v in (usd, tr)):
            raise ValueError('Invalid ECB rate')
        if fixing in rows:
            raise ValueError('Duplicate ECB fixing')
        rows[fixing] = tr / usd
    if not rows:
        raise ValueError('No modern USD/TRY fixings')
    dates = sorted(rows)
    return {
        'version': 1,
        'source': {
            'publisher': 'European Central Bank', 'url': URL,
            'archiveSha256': hashlib.sha256(blob).hexdigest(),
            'formula': 'TRY per EUR / USD per EUR',
            'units': 'TRY per USD', 'firstFixing': dates[0].isoformat(),
            'lastFixing': dates[-1].isoformat(), 'rows': len(dates),
            'availability': 'Following calendar day at 00:00 UTC; held for that entire UTC day; maximum age 7 days',
            'notice': 'ECB reference rates are for information, not transaction quotes. Derived cross-rate; not an official ECB USD/TRY quote.',
            'reuse': 'https://www.ecb.europa.eu/services/disclaimer/html/index.en.html',
        },
        'available': [int(datetime.combine(d + timedelta(days=1), datetime.min.time(), timezone.utc).timestamp() * 1000) for d in dates],
        'tryPerUsd': [rows[d] for d in dates],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--zip', type=Path)
    parser.add_argument('--out', type=Path, default=OUT)
    args = parser.parse_args()
    if args.zip:
        blob = args.zip.read_bytes()
    else:
        with urllib.request.urlopen(URL, timeout=60) as response:
            blob = response.read()
    artifact = derive(blob)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(artifact, separators=(',', ':'), allow_nan=False) + '\n')
    print(f"{artifact['source']['rows']} fixings through {artifact['source']['lastFixing']} -> {args.out}")


if __name__ == '__main__':
    main()
