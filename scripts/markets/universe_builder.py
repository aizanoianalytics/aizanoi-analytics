"""Focused US Universe Builder for Aizanoi Markets.

Unions S&P 500, Nasdaq-100, NYSE U.S. 100, DJIA, and Aizanoi Extra into a
canonical, deduplicated, multi-membership focused equity universe (~500–700 securities).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

# Canonical core constituents of Dow Jones Industrial Average (30)
DJIA_TICKERS = {
    "AAPL", "AMGN", "AMZN", "AXP", "BA", "CAT", "CRM", "CSCO", "CVX", "DIS", "GS",
    "HD", "HON", "IBM", "JNJ", "JPM", "KO", "MCD", "MMM", "MRK",
    "MSFT", "NKE", "NVDA", "PG", "SHW", "TRV", "UNH", "V", "VZ", "WMT"
}

# Canonical constituents of Nasdaq-100 (~100)
NASDAQ100_TICKERS = {
    "AAPL", "ABNB", "ADBE", "ADI", "ADP", "ADSK", "AEP", "AMAT", "AMD", "AMGN",
    "AMZN", "ANSS", "APP", "ARM", "ASML", "AVGO", "AXON", "BIIB", "BKNG", "BKR",
    "CCEP", "CDNS", "CDW", "CEG", "CHTR", "CMCSA", "COST", "CPRT", "CRWD", "CSCO",
    "CSX", "CTAS", "CTSH", "DASH", "DDOG", "DLTR", "DXCM", "EA", "EXC", "FANG",
    "FAST", "FTNT", "GEHC", "GFS", "GILD", "GOOG", "GOOGL", "HON", "IDXX", "INTC",
    "INTU", "ISRG", "KDP", "KHC", "KLAC", "LIN", "LRCX", "LULU", "MAR", "MCHP",
    "MCO", "MDLZ", "MELI", "META", "MNST", "MRNA", "MRVL", "MSFT", "MSTR", "MU",
    "NFLX", "NVDA", "NXPI", "ODFL", "ON", "ORLY", "PANW", "PAYX", "PCAR", "PDD",
    "PEP", "PLTR", "PYPL", "QCOM", "REGN", "ROST", "SBUX", "SNPS", "TEAM", "TMUS",
    "TSLA", "TTD", "TXN", "VRSK", "VRTX", "WBD", "WDAY", "XEL", "ZS"
}

# Canonical top ~100 NYSE U.S. 100 blue chips
NYSE_US100_TICKERS = {
    "ABBV", "ABT", "ACN", "AIG", "ALL", "AMH", "AMP", "AON", "APD", "APH",
    "AXP", "BA", "BAC", "BDX", "BK", "BLK", "BMY", "BSX", "C", "CAT",
    "CB", "CI", "CL", "CME", "COF", "COP", "CRM", "CVS", "CVX", "D",
    "DE", "DHR", "DIS", "DUK", "ECL", "ELV", "EMR", "EOG", "ETN", "FCX",
    "FDX", "FMC", "GD", "GE", "GM", "GS", "HCA", "HD", "HES", "HLT",
    "HUM", "IBM", "ICE", "ITW", "JNJ", "JPM", "KO", "KR", "LIN", "LLY",
    "LMT", "LOW", "MA", "MCD", "MCK", "MDT", "MET", "MMC", "MMM", "MO",
    "MRK", "MS", "NEE", "NEM", "NKE", "NOC", "ORCL", "PFE", "PG", "PGR",
    "PH", "PLD", "PM", "PNC", "PRU", "RTX", "SCHW", "SHW", "SLB", "SO",
    "SPG", "SPGI", "SYK", "T", "TJX", "TMO", "TRV", "UNH", "UNP", "UPS",
    "USB", "V", "VZ", "WFC", "WMB", "WMT", "XOM"
}

# Major S&P 500 constituents covering all 11 GICS sectors
SP500_CORE_TICKERS = {
    "A", "AAL", "AAPL", "ABBV", "ABNB", "ABT", "ACGL", "ACN", "ADBE", "ADI",
    "ADM", "ADP", "ADSK", "AEE", "AEP", "AES", "AFL", "AIG", "AIZ", "AJG",
    "AKAM", "ALB", "ALGN", "ALL", "ALLE", "AMAT", "AMCR", "AMD", "AME", "AMGN",
    "AMP", "AMT", "AMZN", "ANET", "ANSS", "AON", "AOS", "APA", "APD", "APH",
    "APTV", "ARE", "ATO", "AVB", "AVGO", "AVY", "AWK", "AXON", "AXP", "AZO",
    "BA", "BAC", "BALL", "BAX", "BBWI", "BBY", "BDX", "BEN", "BF.B", "BG",
    "BIIB", "BK", "BKNG", "BKR", "BLDR", "BLK", "BMY", "BR", "BRK.B", "BRO",
    "BSX", "BWA", "BX", "BXP", "C", "CAG", "CAH", "CARR", "CAT", "CB",
    "CBOE", "CBRE", "CCI", "CCL", "CDNS", "CDW", "CE", "CEG", "CF", "CFG",
    "CHD", "CHRW", "CHTR", "CI", "CINF", "CL", "CLX", "CMA", "CMCSA", "CME",
    "CMG", "CMI", "CMS", "CNC", "CNP", "COF", "COO", "COP", "COR", "COST",
    "CPAY", "CPB", "CPRT", "CPT", "CRL", "CRM", "CRWD", "CSCO", "CSGP", "CSX",
    "CTAS", "CTLT", "CTRA", "CTSH", "CTVA", "CVS", "CVX", "CZR", "D", "DAL",
    "DAY", "DD", "DE", "DECK", "DELL", "DFS", "DG", "DGX", "DHI", "DHR",
    "DIS", "DLR", "DLTR", "DOC", "DOV", "DOW", "DPZ", "DRI", "DTE", "DUK",
    "DVA", "DVN", "DXCM", "EA", "EBAY", "ECL", "ED", "EFX", "EG", "EIX",
    "EL", "ELV", "EMN", "EMR", "ENPH", "EOG", "EPAM", "EQIX", "EQR", "EQT",
    "ERIE", "ES", "ESS", "ETN", "ETR", "EVRG", "EW", "EXC", "EXPD", "EXPE",
    "EXR", "F", "FANG", "FAST", "FCX", "FDS", "FDX", "FE", "FFIV", "FI",
    "FICO", "FIS", "FITB", "FLT", "FMC", "FOX", "FOXA", "FRT", "FSLR", "FTNT",
    "FTV", "GD", "GDDY", "GE", "GEHC", "GEN", "GEV", "GILD", "GIS", "GL",
    "GLW", "GM", "GNRC", "GOOG", "GOOGL", "GPC", "GPN", "GRMN", "GS", "GWW",
    "HAL", "HAS", "HBAN", "HCA", "HD", "HES", "HIG", "HII", "HLT", "HOLX",
    "HON", "HPE", "HPQ", "HRL", "HSIC", "HST", "HSY", "HUBB", "HUM", "HWM",
    "IBM", "ICE", "IDXX", "IEX", "IFF", "INCY", "INTC", "INTU", "INVH", "IP",
    "IPG", "IQV", "IR", "IRM", "ISRG", "IT", "ITW", "IVZ", "J", "JBHT",
    "JBL", "JCI", "JKHY", "JNJ", "JNPR", "JPM", "K", "KDP", "KEY", "KEYS",
    "KHC", "KIM", "KLAC", "KMB", "KMI", "KMX", "KO", "KR", "KVUE", "L",
    "LDOS", "LEN", "LH", "LHX", "LIN", "LKQ", "LLY", "LMT", "LNT", "LOW",
    "LRCX", "LULU", "LUV", "LVS", "LW", "LYB", "LYV", "MA", "MAA", "MAR",
    "MAS", "MCD", "MCHP", "MCK", "MCO", "MDLZ", "MDT", "MET", "META", "MGM",
    "MHK", "MKC", "MKTX", "MLM", "MMC", "MMM", "MNST", "MO", "MOH", "MOS",
    "MPC", "MPWR", "MRK", "MRNA", "MS", "MSCI", "MSFT", "MSI", "MTB", "MTCH",
    "MTD", "MU", "NCLH", "NDAQ", "NDSN", "NEE", "NEM", "NFLX", "NI", "NKE",
    "NOC", "NOW", "NRG", "NSC", "NTAP", "NTRS", "NUE", "NVDA", "NVR", "NWS",
    "NWSA", "NXPI", "O", "ODFL", "OKE", "OMC", "ON", "ORCL", "ORLY", "OTIS",
    "OXY", "PANW", "PARA", "PAYC", "PAYX", "PCAR", "PCG", "PEG", "PEP", "PFE",
    "PFG", "PG", "PGR", "PH", "PHM", "PKG", "PLD", "PLTR", "PM", "PNC",
    "PNR", "PNW", "PODD", "POOL", "PPG", "PPL", "PRU", "PSA", "PSX", "PTC",
    "PWR", "PYPL", "QCOM", "QRVO", "RCL", "REG", "REGN", "RF", "RHI", "RJF",
    "RL", "RMD", "ROK", "ROL", "ROP", "ROST", "RSG", "RTX", "RVTY", "SBAC",
    "SBUX", "SCHW", "SHW", "SJM", "SLB", "SMCI", "SNA", "SNPS", "SO", "SPG",
    "SPGI", "SRE", "STE", "STLD", "STT", "STX", "STZ", "SWK", "SWKS", "SYF",
    "SYK", "SYY", "T", "TAP", "TDG", "TDY", "TECH", "TEL", "TER", "TFC",
    "TFX", "TGT", "TJX", "TMO", "TMUS", "TPR", "TRGP", "TRMB", "TROW", "TRV",
    "TSCO", "TSLA", "TSN", "TT", "TTWO", "TXN", "TXT", "TYL", "UAL", "UBER",
    "UDR", "UHS", "ULTA", "UNH", "UNP", "UPS", "URI", "USB", "V", "VICI",
    "VLO", "VLTO", "VMC", "VNO", "VRSK", "VRSN", "VRTX", "VST", "VTR", "VTRS",
    "VZ", "WAB", "WAT", "WBA", "WBD", "WDC", "WEC", "WELL", "WFC", "WM",
    "WMB", "WMT", "WRB", "WST", "WTW", "WY", "WYNN", "XEL", "XOM", "XYL",
    "YUM", "ZBH", "ZBRA", "ZTS"
}

NAME_OVERRIDES: dict[str, tuple[str, str]] = {
    "AAPL": ("Apple Inc.", "NASDAQ"),
    "MSFT": ("Microsoft Corporation", "NASDAQ"),
    "NVDA": ("NVIDIA Corporation", "NASDAQ"),
    "AMZN": ("Amazon.com, Inc.", "NASDAQ"),
    "GOOGL": ("Alphabet Inc. (Class A)", "NASDAQ"),
    "GOOG": ("Alphabet Inc. (Class C)", "NASDAQ"),
    "META": ("Meta Platforms, Inc.", "NASDAQ"),
    "TSLA": ("Tesla, Inc.", "NASDAQ"),
    "BRK.B": ("Berkshire Hathaway Inc.", "NYSE"),
    "LLY": ("Eli Lilly and Company", "NYSE"),
    "AVGO": ("Broadcom Inc.", "NASDAQ"),
    "JPM": ("JPMorgan Chase & Co.", "NYSE"),
    "V": ("Visa Inc.", "NYSE"),
    "UNH": ("UnitedHealth Group Incorporated", "NYSE"),
    "XOM": ("Exxon Mobil Corporation", "NYSE"),
    "MA": ("Mastercard Incorporated", "NYSE"),
    "JNJ": ("Johnson & Johnson", "NYSE"),
    "PG": ("The Procter & Gamble Company", "NYSE"),
    "HD": ("The Home Depot, Inc.", "NYSE"),
    "COST": ("Costco Wholesale Corporation", "NASDAQ"),
    "ABBV": ("AbbVie Inc.", "NYSE"),
    "MRK": ("Merck & Co., Inc.", "NYSE"),
    "WMT": ("Walmart Inc.", "NYSE"),
    "BAC": ("Bank of America Corporation", "NYSE"),
    "CVX": ("Chevron Corporation", "NYSE"),
    "NFLX": ("Netflix, Inc.", "NASDAQ"),
    "CRM": ("Salesforce, Inc.", "NYSE"),
    "KO": ("The Coca-Cola Company", "NYSE"),
    "AMD": ("Advanced Micro Devices, Inc.", "NASDAQ"),
    "PEP": ("PepsiCo, Inc.", "NASDAQ"),
    "PLTR": ("Palantir Technologies Inc.", "NYSE"),
    "COIN": ("Coinbase Global, Inc.", "NASDAQ"),
    "HOOD": ("Robinhood Markets, Inc.", "NASDAQ"),
    "RDDT": ("Reddit, Inc.", "NYSE"),
    "ARM": ("Arm Holdings plc", "NASDAQ"),
    "MSTR": ("MicroStrategy Incorporated", "NASDAQ"),
}


def slugify(symbol: str) -> str:
    return symbol.lower().replace(".", "-")


def build_focused_us_universe(
    extra_path: Path | None = None,
) -> list[dict[str, Any]]:
    """Build union of S&P 500, Nasdaq-100, NYSE U.S. 100, DJIA, and Extra."""
    extra_items: list[dict[str, str]] = []
    if extra_path and extra_path.exists():
        try:
            extra_items = json.loads(extra_path.read_text(encoding="utf-8"))
        except Exception:
            extra_items = []

    extra_map = {item["ticker"]: item for item in extra_items if "ticker" in item}

    all_tickers = sorted(SP500_CORE_TICKERS | NASDAQ100_TICKERS | NYSE_US100_TICKERS | DJIA_TICKERS | set(extra_map.keys()))

    universe: list[dict[str, Any]] = []
    for ticker in all_tickers:
        memberships: list[str] = []
        if ticker in SP500_CORE_TICKERS:
            memberships.append("sp500")
        if ticker in NASDAQ100_TICKERS:
            memberships.append("nasdaq100")
        if ticker in NYSE_US100_TICKERS:
            memberships.append("nyse_us100")
        if ticker in DJIA_TICKERS:
            memberships.append("djia")
        if ticker in extra_map:
            memberships.append("extra")

        name, exchange = NAME_OVERRIDES.get(ticker, (f"{ticker} Inc.", "NYSE" if ticker in NYSE_US100_TICKERS else "NASDAQ"))
        if ticker in extra_map:
            name = extra_map[ticker].get("name", name)
            exchange = extra_map[ticker].get("exchange", exchange)

        provider_symbol = ticker.replace(".", "-")
        universe.append({
            "market": "us",
            "ticker": ticker,
            "name": name,
            "exchange": exchange,
            "slug": slugify(ticker),
            "providerSymbol": provider_symbol,
            "yahooSymbol": provider_symbol,
            "memberships": memberships,
        })

    return universe


def validate_universe_transition(
    old_universe: list[dict[str, Any]],
    new_universe: list[dict[str, Any]],
    min_count: int = 400,
    max_count: int = 800,
) -> bool:
    """Validate that universe size is healthy and not an accidental shrink or explosion."""
    count = len(new_universe)
    if count < min_count or count > max_count:
        return False
    if old_universe:
        old_count = len(old_universe)
        # Check for suspicious shrink (> 35% drop) or suspicious expansion (> 50% jump)
        if count < old_count * 0.65 or count > old_count * 1.50:
            return False
    return True
