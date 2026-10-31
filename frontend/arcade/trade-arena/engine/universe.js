// Arena universe: the 35 crypto assets of the Aizanoi Markets tab (scripts/markets/crypto-universe.json)
// plus 30 hand-picked US stocks across sectors and daily macro context series.
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
  }
 ]
};
