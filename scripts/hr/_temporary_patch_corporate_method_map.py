from pathlib import Path

path = Path('frontend/analytics/dashboards/hr-analytics-full-set/hr-public-en-visible.js')
text = path.read_text(encoding='utf-8')
anchor = "    'Maksimum': 'Maximum',\n"
if text.count(anchor) != 1:
    raise SystemExit(f'expected one insertion anchor, found {text.count(anchor)}')
entries = """    \"İşaretli KPI'lar toplanır, dönem hedefleri orantılanır ve yıl sonuna projekte edilir.\": 'Selected KPIs are summed, period targets are prorated, and results are projected to year-end.',
    'Eşik hedefe karşılık gelir. Bu seviyenin altı “Eşik Altı” kabul edilir.': 'Corresponds to the threshold target. Values below this level are considered Below Threshold.',
    'Yıllık hedefe karşılık gelir. Hedef ile maksimum arasında puan doğrusal artar.': 'Corresponds to the annual target. The score increases linearly between the target and maximum.',
    'Maksimum hedefe karşılık gelir. Daha iyi sonuçlar da 120 puanda sınırlandırılır.': 'Corresponds to the maximum target. Better results are also capped at 120 points.',
    \"Pozitif KPI'da yüksek, negatif KPI'da düşük gerçekleşme daha iyidir. Ara değerlerde parçalı doğrusal interpolasyon uygulanır.\": 'Higher actuals are better for positive KPIs and lower actuals are better for negative KPIs. Piecewise linear interpolation is applied between reference values.',
    'Q1, Q2, Q3 ve Q4 artık bağımsız çeyrek değerleridir; kaynak değerler değiştirilmeden saklanır.': 'Q1, Q2, Q3 and Q4 are independent quarterly values; source values are preserved unchanged.',
    \"“1 Ocak–...” biçimindeki eski kümülatif sütunlar algılanırsa toplanacak KPI'lar önce bağımsız çeyreklere ayrılır; böylece geçmiş dosyalar iki kez toplanmaz.\": 'If legacy cumulative columns in the “1 January–...” format are detected, summable KPIs are first separated into independent quarters so historical files are not double-counted.',
    \"İşaretli KPI'larda dolu çeyrekler toplanır. 80/100/120 dönem hedefleri yıllık hedef ÷ 4 × dolu çeyrek sayısı olarak hesaplanır.\": 'For selected KPIs, populated quarters are summed. Period targets at 80/100/120 are calculated as annual target ÷ 4 × populated-quarter count.',
    \"İşaretli olmayan oran, skor ve anlık durum KPI'larında değerler toplanmaz; seçili dönemdeki son dolu çeyrek kullanılır.\": 'For unselected ratio, score and point-in-time KPIs, values are not summed; the latest populated quarter in the selected period is used.',
    \"Toplanan KPI'da kümülatif gerçekleşen ÷ dolu çeyrek × 4; diğer KPI'da son dolu çeyrek değeridir.\": 'For summed KPIs, the year-end projection is cumulative actual ÷ populated quarters × 4; for other KPIs, it is the latest populated-quarter value.',
    'Pazar payı, marka performansı, brüt marj, genel gider oranı, NPS, yeni müşteri, Arvato OTIF, stok devir hızı ve ÇBA skorları son dönem kuralıyla başlar.': 'Market share, brand performance, gross margin, overhead ratio, NPS, new-customer, Arvato OTIF, inventory-turnover and CBA scores default to the latest-period rule.',
    'KPI Ayarları ekranındaki seçimler bu tarayıcıda saklanır ve tüm özetler, puanlar, projeksiyonlar ile CSV çıktısına anında uygulanır.': 'Selections in KPI Settings are stored in this browser and immediately applied to all summaries, scores, projections and CSV output.',
    'Hesaplama yöntemi ve veri sözleşmesi': 'Calculation Method and Data Contract',
    '80 puan': '80 points',
    '100 puan': '100 points',
    '120 puan': '120 points',
    'Yıl sonu projeksiyonu': 'Year-End Projection',
"""
path.write_text(text.replace(anchor, entries + anchor, 1), encoding='utf-8')
print('Added exact Corporate Goals method/help translations.')
