// Arena universe: the 35 crypto assets of the Aizanoi Markets tab (scripts/markets/crypto-universe.json)
// plus 30 hand-picked US stocks across sectors, 30 Borsa Istanbul stocks (TRY, Yahoo .IS) and daily macro context series.
export const UNIVERSE = {
 "crypto": [
  {
   "ticker": "AAVE",
   "name": "Aave",
   "providerSymbol": "AAVEUSDT"
  },
  {
   "ticker": "ADA",
   "name": "Cardano",
   "providerSymbol": "ADAUSDT"
  },
  {
   "ticker": "APT",
   "name": "Aptos",
   "providerSymbol": "APTUSDT"
  },
  {
   "ticker": "ARB",
   "name": "Arbitrum",
   "providerSymbol": "ARBUSDT"
  },
  {
   "ticker": "ATOM",
   "name": "Cosmos",
   "providerSymbol": "ATOMUSDT"
  },
  {
   "ticker": "AVAX",
   "name": "Avalanche",
   "providerSymbol": "AVAXUSDT"
  },
  {
   "ticker": "BCH",
   "name": "Bitcoin Cash",
   "providerSymbol": "BCHUSDT"
  },
  {
   "ticker": "BTC",
   "name": "Bitcoin",
   "providerSymbol": "BTCUSDT"
  },
  {
   "ticker": "DOGE",
   "name": "Dogecoin",
   "providerSymbol": "DOGEUSDT"
  },
  {
   "ticker": "DOT",
   "name": "Polkadot",
   "providerSymbol": "DOTUSDT"
  },
  {
   "ticker": "ETC",
   "name": "Ethereum Classic",
   "providerSymbol": "ETCUSDT"
  },
  {
   "ticker": "ETH",
   "name": "Ethereum",
   "providerSymbol": "ETHUSDT"
  },
  {
   "ticker": "FIL",
   "name": "Filecoin",
   "providerSymbol": "FILUSDT"
  },
  {
   "ticker": "GRAM",
   "name": "Gram",
   "providerSymbol": "GRAMUSDT"
  },
  {
   "ticker": "HBAR",
   "name": "Hedera",
   "providerSymbol": "HBARUSDT"
  },
  {
   "ticker": "INJ",
   "name": "Injective",
   "providerSymbol": "INJUSDT"
  },
  {
   "ticker": "LINK",
   "name": "Chainlink",
   "providerSymbol": "LINKUSDT"
  },
  {
   "ticker": "LTC",
   "name": "Litecoin",
   "providerSymbol": "LTCUSDT"
  },
  {
   "ticker": "NEAR",
   "name": "NEAR Protocol",
   "providerSymbol": "NEARUSDT"
  },
  {
   "ticker": "ONDO",
   "name": "Ondo",
   "providerSymbol": "ONDOUSDT"
  },
  {
   "ticker": "OP",
   "name": "Optimism",
   "providerSymbol": "OPUSDT"
  },
  {
   "ticker": "POL",
   "name": "Polygon",
   "providerSymbol": "POLUSDT"
  },
  {
   "ticker": "RENDER",
   "name": "Render",
   "providerSymbol": "RENDERUSDT"
  },
  {
   "ticker": "RUNE",
   "name": "THORChain",
   "providerSymbol": "RUNEUSDT"
  },
  {
   "ticker": "S",
   "name": "Sonic",
   "providerSymbol": "SUSDT"
  },
  {
   "ticker": "SAND",
   "name": "The Sandbox",
   "providerSymbol": "SANDUSDT"
  },
  {
   "ticker": "SOL",
   "name": "Solana",
   "providerSymbol": "SOLUSDT"
  },
  {
   "ticker": "SUI",
   "name": "Sui",
   "providerSymbol": "SUIUSDT"
  },
  {
   "ticker": "TAO",
   "name": "Bittensor",
   "providerSymbol": "TAOUSDT"
  },
  {
   "ticker": "THETA",
   "name": "Theta Network",
   "providerSymbol": "THETAUSDT"
  },
  {
   "ticker": "UNI",
   "name": "Uniswap",
   "providerSymbol": "UNIUSDT"
  },
  {
   "ticker": "VIRTUAL",
   "name": "Virtuals Protocol",
   "providerSymbol": "VIRTUALUSDT"
  },
  {
   "ticker": "XLM",
   "name": "Stellar",
   "providerSymbol": "XLMUSDT"
  },
  {
   "ticker": "XRP",
   "name": "XRP",
   "providerSymbol": "XRPUSDT"
  },
  {
   "ticker": "ZEC",
   "name": "Zcash",
   "providerSymbol": "ZECUSDT"
  }
 ],
 "stocks": [
  {
   "ticker": "AAPL",
   "name": "Apple",
   "sector": "Technology",
   "yahoo": "AAPL"
  },
  {
   "ticker": "MSFT",
   "name": "Microsoft",
   "sector": "Technology",
   "yahoo": "MSFT"
  },
  {
   "ticker": "NVDA",
   "name": "NVIDIA",
   "sector": "Semiconductors",
   "yahoo": "NVDA"
  },
  {
   "ticker": "GOOGL",
   "name": "Alphabet",
   "sector": "Communication",
   "yahoo": "GOOGL"
  },
  {
   "ticker": "AMZN",
   "name": "Amazon",
   "sector": "Consumer",
   "yahoo": "AMZN"
  },
  {
   "ticker": "META",
   "name": "Meta Platforms",
   "sector": "Communication",
   "yahoo": "META"
  },
  {
   "ticker": "TSLA",
   "name": "Tesla",
   "sector": "Consumer",
   "yahoo": "TSLA"
  },
  {
   "ticker": "AVGO",
   "name": "Broadcom",
   "sector": "Semiconductors",
   "yahoo": "AVGO"
  },
  {
   "ticker": "AMD",
   "name": "Advanced Micro Devices",
   "sector": "Semiconductors",
   "yahoo": "AMD"
  },
  {
   "ticker": "INTC",
   "name": "Intel",
   "sector": "Semiconductors",
   "yahoo": "INTC"
  },
  {
   "ticker": "ORCL",
   "name": "Oracle",
   "sector": "Technology",
   "yahoo": "ORCL"
  },
  {
   "ticker": "CRM",
   "name": "Salesforce",
   "sector": "Technology",
   "yahoo": "CRM"
  },
  {
   "ticker": "NFLX",
   "name": "Netflix",
   "sector": "Communication",
   "yahoo": "NFLX"
  },
  {
   "ticker": "PLTR",
   "name": "Palantir",
   "sector": "Technology",
   "yahoo": "PLTR"
  },
  {
   "ticker": "UBER",
   "name": "Uber",
   "sector": "Technology",
   "yahoo": "UBER"
  },
  {
   "ticker": "JPM",
   "name": "JP Morgan Chase &",
   "sector": "Financials",
   "yahoo": "JPM"
  },
  {
   "ticker": "GS",
   "name": "Goldman Sachs",
   "sector": "Financials",
   "yahoo": "GS"
  },
  {
   "ticker": "V",
   "name": "Visa",
   "sector": "Financials",
   "yahoo": "V"
  },
  {
   "ticker": "BRK.B",
   "name": "Berkshire Hathaway",
   "sector": "Financials",
   "yahoo": "BRK-B"
  },
  {
   "ticker": "COIN",
   "name": "Coinbase",
   "sector": "Crypto-linked",
   "yahoo": "COIN"
  },
  {
   "ticker": "MSTR",
   "name": "Strategy (MicroStrategy)",
   "sector": "Crypto-linked",
   "yahoo": "MSTR"
  },
  {
   "ticker": "XOM",
   "name": "ExxonMobil",
   "sector": "Energy",
   "yahoo": "XOM"
  },
  {
   "ticker": "LLY",
   "name": "Eli Lilly",
   "sector": "Healthcare",
   "yahoo": "LLY"
  },
  {
   "ticker": "UNH",
   "name": "UnitedHealth",
   "sector": "Healthcare",
   "yahoo": "UNH"
  },
  {
   "ticker": "COST",
   "name": "Costco",
   "sector": "Consumer",
   "yahoo": "COST"
  },
  {
   "ticker": "WMT",
   "name": "Walmart",
   "sector": "Consumer",
   "yahoo": "WMT"
  },
  {
   "ticker": "KO",
   "name": "Coca-Cola",
   "sector": "Staples",
   "yahoo": "KO"
  },
  {
   "ticker": "DIS",
   "name": "Disney",
   "sector": "Communication",
   "yahoo": "DIS"
  },
  {
   "ticker": "BA",
   "name": "Boeing",
   "sector": "Industrials",
   "yahoo": "BA"
  },
  {
   "ticker": "CAT",
   "name": "Caterpillar",
   "sector": "Industrials",
   "yahoo": "CAT"
  }
 ],
 "bist": [
  {
   "ticker": "THYAO",
   "name": "Turkish Airlines",
   "sector": "Transport",
   "yahoo": "THYAO.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "PGSUS",
   "name": "Pegasus Airlines",
   "sector": "Transport",
   "yahoo": "PGSUS.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "TAVHL",
   "name": "TAV Airports",
   "sector": "Transport",
   "yahoo": "TAVHL.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "ASELS",
   "name": "Aselsan",
   "sector": "Defense",
   "yahoo": "ASELS.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "GARAN",
   "name": "Garanti BBVA",
   "sector": "Banks",
   "yahoo": "GARAN.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "AKBNK",
   "name": "Akbank",
   "sector": "Banks",
   "yahoo": "AKBNK.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "ISCTR",
   "name": "Is Bankasi (C)",
   "sector": "Banks",
   "yahoo": "ISCTR.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "YKBNK",
   "name": "Yapi Kredi",
   "sector": "Banks",
   "yahoo": "YKBNK.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "VAKBN",
   "name": "VakifBank",
   "sector": "Banks",
   "yahoo": "VAKBN.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "KCHOL",
   "name": "Koc Holding",
   "sector": "Holdings",
   "yahoo": "KCHOL.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "SAHOL",
   "name": "Sabanci Holding",
   "sector": "Holdings",
   "yahoo": "SAHOL.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "ENKAI",
   "name": "Enka Insaat",
   "sector": "Holdings",
   "yahoo": "ENKAI.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "BIMAS",
   "name": "BIM Magazalar",
   "sector": "Retail",
   "yahoo": "BIMAS.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "MGROS",
   "name": "Migros",
   "sector": "Retail",
   "yahoo": "MGROS.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "TUPRS",
   "name": "Tupras",
   "sector": "Energy",
   "yahoo": "TUPRS.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "ASTOR",
   "name": "Astor Enerji",
   "sector": "Energy",
   "yahoo": "ASTOR.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "EREGL",
   "name": "Erdemir",
   "sector": "Materials",
   "yahoo": "EREGL.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "SISE",
   "name": "Sisecam",
   "sector": "Materials",
   "yahoo": "SISE.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "PETKM",
   "name": "Petkim",
   "sector": "Materials",
   "yahoo": "PETKM.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "SASA",
   "name": "Sasa Polyester",
   "sector": "Materials",
   "yahoo": "SASA.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "TRALT",
   "name": "Turk Altin (ex-Koza Altin)",
   "sector": "Materials",
   "yahoo": "TRALT.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "FROTO",
   "name": "Ford Otosan",
   "sector": "Autos",
   "yahoo": "FROTO.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "TOASO",
   "name": "Tofas",
   "sector": "Autos",
   "yahoo": "TOASO.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "ARCLK",
   "name": "Arcelik",
   "sector": "Consumer",
   "yahoo": "ARCLK.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "ULKER",
   "name": "Ulker",
   "sector": "Staples",
   "yahoo": "ULKER.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "AEFES",
   "name": "Anadolu Efes",
   "sector": "Staples",
   "yahoo": "AEFES.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "CCOLA",
   "name": "Coca-Cola Icecek",
   "sector": "Staples",
   "yahoo": "CCOLA.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "TCELL",
   "name": "Turkcell",
   "sector": "Telecom",
   "yahoo": "TCELL.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "TTKOM",
   "name": "Turk Telekom",
   "sector": "Telecom",
   "yahoo": "TTKOM.IS",
   "exchange": "BIST",
   "currency": "TRY"
  },
  {
   "ticker": "EKGYO",
   "name": "Emlak Konut REIT",
   "sector": "Real estate",
   "yahoo": "EKGYO.IS",
   "exchange": "BIST",
   "currency": "TRY"
  }
 ],
 "context": [
  {
   "ticker": "SPY",
   "yahoo": "SPY",
   "name": "S&P 500 ETF"
  },
  {
   "ticker": "QQQ",
   "yahoo": "QQQ",
   "name": "Nasdaq-100 ETF"
  },
  {
   "ticker": "VIX",
   "yahoo": "^VIX",
   "name": "CBOE Volatility Index"
  },
  {
   "ticker": "GLD",
   "yahoo": "GLD",
   "name": "Gold ETF"
  },
  {
   "ticker": "TLT",
   "yahoo": "TLT",
   "name": "20Y+ Treasury ETF"
  },
  {
   "ticker": "TNX",
   "yahoo": "^TNX",
   "name": "US 10Y yield x10"
  },
  {
   "ticker": "DXY",
   "yahoo": "DX-Y.NYB",
   "name": "US Dollar Index"
  },
  {
   "ticker": "XU100",
   "yahoo": "XU100.IS",
   "name": "BIST 100 index"
  }
 ]
};

// Fail-closed payload validation for downloaded history. A 200 response with a
// null, truncated or mistyped body must abort the race, never silently drop
// the asset and persist an ordinary result.
export function requireSeries(url, cols) {
  if (!cols || typeof cols !== 'object' || !Array.isArray(cols.t) || cols.t.length === 0)
    throw new Error(`Required historical file ${url}: missing or malformed payload`);
  return cols;
}

export function requireFunding(url, funding) {
  if (!funding || typeof funding !== 'object' || !Array.isArray(funding.t) || !Array.isArray(funding.rate))
    throw new Error(`Required historical file ${url}: missing or malformed payload`);
  return funding;
}
