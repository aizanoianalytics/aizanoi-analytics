# Trade Arena live tails

Scope: private top-up of the Trade Arena market archive for `/arcade/trade-arena/`.

The archive under `frontend/arcade/trade-arena/data/raw/` is fixed release content. `update_live.py`
writes only the closed bars that came **after** each archive file ends, so races, the Basket page and the
Basket advisor can run to the latest closed day without rewriting the 250 MB archive.

## Sources (public, no account or API key)

| market | source | notes |
|---|---|---|
| crypto 1d / 4h / 1h | Binance public market data `data-api.binance.vision` | closed klines only |
| crypto funding | Binance USD-M `fapi.binance.com` | optional; a failure leaves funding stale |
| US stocks, ETFs | Yahoo chart API (what `yfinance` uses), fallback Fintable daily | Fintable volume (IEX) is rescaled to the archive level |
| VIX, 10Y, DXY | Yahoo only | |
| Borsa Istanbul (30 stocks, BIST 100) | Yahoo `<TICKER>.IS`, `XU100.IS` | TRY, nominal |

Tails are re-anchored to the archive's last close, so dividend re-adjustments never create a jump.
Daily stock bars are published only after the session closed (16:15 New York, 18:30 Istanbul).
Stock 1h/4h tails are not produced because stock intraday races are disabled.

## Output

```
/var/lib/aizanoi-trade-arena/live/manifest.json            written last, atomically
/var/lib/aizanoi-trade-arena/live/raw/<market>/<tf>/<SYM>.json
```

Nginx serves the directory at `/arcade/trade-arena/live/` (see `infra/nginx`). The browser loads the manifest;
when it is missing, or any needed tail fails, the race runs on the archive alone (never a mix).

## Run

```
python3 scripts/trade-arena/update_live.py --out /var/lib/aizanoi-trade-arena/live --allow-partial -v
python3 scripts/trade-arena/update_live.py --out ... --only crypto/1d bist/1d   # partial refresh
python3 scripts/trade-arena/update_live.py --out ... --no-yahoo                  # Fintable for US stocks
```

Schedule with `infra/systemd/aizanoi-trade-arena-live.{service,timer}.example` (hourly at :12).
Python 3.10+ standard library only.
