#!/usr/bin/env python3
"""Reject synthetic historical HR events dated after the reporting reference date."""
from datetime import datetime
from pathlib import Path
import re
import openpyxl

REPO = Path(__file__).resolve().parents[1]
ROOT = REPO / 'analytics/dashboards/hr-analytics-full-set/production-pipeline'
PUBLIC = REPO / 'frontend/analytics/dashboards/hr-analytics-full-set'
LIMIT = datetime(2026, 8, 31)
CHECKS = (
    ('cezalar.xlsx', 'sheet_1', 'TARIH'),
    ('Ayrilanlar_Listesi.xlsx', 'Sayfa1', 'Çıkış Tarihi'),
    ('cikis_sebepleri.xlsx', 'Sheet1', 'Çıkış Tarihi'),
    ('performans_magaza_verileri.xlsx', 'Sheet1', 'donem'),
    ('ise_alma_suresi.xlsx', 'Sayfa1', 'İşe Giriş Tarihi'),
)

for filename, sheet, column in CHECKS:
    workbook = openpyxl.load_workbook(ROOT / filename, data_only=True, read_only=True)
    worksheet = workbook[sheet]
    rows = worksheet.iter_rows(values_only=True)
    headers = list(next(rows))
    index = headers.index(column)
    future = [row[index] for row in rows if isinstance(row[index], datetime) and row[index] > LIMIT]
    if future:
        raise SystemExit(f'{filename}:{column} contains future historical events: {future[:5]}')

symptom = re.compile(r'(?:ceza|disciplin)[^<]{0,180}-\d+\s*(?:day|gün)', re.I)
for page in PUBLIC.glob('*/index.html'):
    if symptom.search(page.read_text(encoding='utf-8')):
        raise SystemExit(f'negative days-since-discipline symptom in {page}')
print('HR synthetic historical-event dates: OK')
