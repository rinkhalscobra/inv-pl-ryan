export interface SwapConfig {
  instrumentType: 'crypto' | 'forex' | 'commodity' | 'stock' | 'index';
  dailySwapRate: number;
  annualizedRate: number;
  description: string;
  notes?: string;
}

export const SWAP_RATES_BY_TYPE: Record<string, SwapConfig> = {
  crypto: {
    instrumentType: 'crypto',
    dailySwapRate: 0.0003,
    annualizedRate: 0.1095,
    description: 'Crypto Futures Funding (3x daily)',
    notes: 'Applied every 8 hours (0.01% per funding period = 0.03% daily)'
  },
  forexMajors: {
    instrumentType: 'forex',
    dailySwapRate: 0.00002,
    annualizedRate: 0.0073,
    description: 'Forex Major Pairs',
    notes: 'EUR/USD, GBP/USD, USD/JPY, AUD/USD (0.002% daily)'
  },
  forexMinors: {
    instrumentType: 'forex',
    dailySwapRate: 0.00002,
    annualizedRate: 0.0073,
    description: 'Forex Cross Pairs',
    notes: 'EUR/GBP, GBP/JPY, etc. (0.002% daily)'
  },
  forexExotics: {
    instrumentType: 'forex',
    dailySwapRate: 0.0001,
    annualizedRate: 0.0365,
    description: 'Forex Exotic Pairs',
    notes: 'USD/TRY, USD/ZAR, etc. (0.01% daily)'
  },
  commodities: {
    instrumentType: 'commodity',
    dailySwapRate: 0.0002,
    annualizedRate: 0.073,
    description: 'Commodities CFDs',
    notes: 'Gold, Silver, Oil (0.02% daily minimum)'
  },
  indices: {
    instrumentType: 'index',
    dailySwapRate: 0.0001,
    annualizedRate: 0.0365,
    description: 'Indices CFDs',
    notes: 'S&P 500, NASDAQ, etc. (0.01% daily)'
  },
  stocks: {
    instrumentType: 'stock',
    dailySwapRate: 0.00015,
    annualizedRate: 0.05475,
    description: 'Stock CFDs',
    notes: 'Individual stocks (0.015% daily)'
  }
};

export const SYMBOL_SWAP_MAPPING: Record<string, keyof typeof SWAP_RATES_BY_TYPE> = {
  'BTCUSDT': 'crypto',
  'ETHUSDT': 'crypto',
  'BNBUSDT': 'crypto',
  'SOLUSDT': 'crypto',
  'USDCUSDT': 'crypto',
  'XRPUSDT': 'crypto',
  'DOGEUSDT': 'crypto',
  'TONUSDT': 'crypto',
  'ADAUSDT': 'crypto',
  'SHIBUSDT': 'crypto',
  'AVAXUSDT': 'crypto',
  'TRXUSDT': 'crypto',
  'LINKUSDT': 'crypto',
  'DOTUSDT': 'crypto',
  'BCHUSDT': 'crypto',
  'NEARUSDT': 'crypto',
  'MATICUSDT': 'crypto',
  'UNIUSDT': 'crypto',
  'LTCUSDT': 'crypto',
  'ETCUSDT': 'crypto',
  'APTUSDT': 'crypto',
  'HBARUSDT': 'crypto',
  'FILUSDT': 'crypto',
  'ATOMUSDT': 'crypto',
  'XLMUSDT': 'crypto',
  'VETUSDT': 'crypto',
  'MKRUSDT': 'crypto',
  'INJUSDT': 'crypto',
  'SUIUSDT': 'crypto',
  'AAVEUSDT': 'crypto',
  'GRTUSDT': 'crypto',
  'OPUSDT': 'crypto',
  'ARBUSDT': 'crypto',
  'THETAUSDT': 'crypto',
  'ALGOUSDT': 'crypto',
  'FLOWUSDT': 'crypto',
  'SANDUSDT': 'crypto',
  'MANAUSDT': 'crypto',
  'QNTUSDT': 'crypto',
  'AXSUSDT': 'crypto',
  'CHZUSDT': 'crypto',
  'GALAUSDT': 'crypto',
  'ENJUSDT': 'crypto',
  'XTZUSDT': 'crypto',
  'NEOUSDT': 'crypto',
  'IOTAUSDT': 'crypto',

  'EUR/USD': 'forexMajors',
  'GBP/USD': 'forexMajors',
  'AUD/USD': 'forexMajors',
  'NZD/USD': 'forexMajors',
  'USD/JPY': 'forexMajors',
  'USD/CHF': 'forexMajors',
  'USD/CAD': 'forexMajors',

  'EUR/JPY': 'forexMinors',
  'EUR/GBP': 'forexMinors',
  'EUR/AUD': 'forexMinors',
  'EUR/CHF': 'forexMinors',
  'EUR/CAD': 'forexMinors',
  'EUR/NZD': 'forexMinors',
  'GBP/JPY': 'forexMinors',
  'GBP/AUD': 'forexMinors',
  'GBP/CHF': 'forexMinors',
  'GBP/CAD': 'forexMinors',
  'GBP/NZD': 'forexMinors',
  'AUD/CAD': 'forexMinors',
  'AUD/CHF': 'forexMinors',
  'AUD/JPY': 'forexMinors',
  'AUD/NZD': 'forexMinors',
  'NZD/JPY': 'forexMinors',
  'NZD/CHF': 'forexMinors',
  'NZD/CAD': 'forexMinors',
  'CAD/JPY': 'forexMinors',
  'CAD/CHF': 'forexMinors',
  'CHF/JPY': 'forexMinors',
  'EUR/SEK': 'forexMinors',
  'EUR/NOK': 'forexMinors',
  'EUR/DKK': 'forexMinors',
  'EUR/PLN': 'forexMinors',
  'EUR/HUF': 'forexMinors',
  'EUR/CZK': 'forexMinors',
  'AUD/SGD': 'forexMinors',
  'AUD/HKD': 'forexMinors',
  'NZD/SGD': 'forexMinors',
  'SGD/JPY': 'forexMinors',
  'HKD/JPY': 'forexMinors',

  'USD/TRY': 'forexExotics',
  'EUR/TRY': 'forexExotics',
  'USD/ZAR': 'forexExotics',
  'USD/HKD': 'forexExotics',
  'USD/SGD': 'forexExotics',
  'USD/DKK': 'forexExotics',
  'USD/NOK': 'forexExotics',
  'USD/SEK': 'forexExotics',
  'USD/PLN': 'forexExotics',
  'USD/HUF': 'forexExotics',
  'USD/CZK': 'forexExotics',
  'USD/MXN': 'forexExotics',
  'USD/BRL': 'forexExotics',
  'USD/CNH': 'forexExotics',
  'USD/THB': 'forexExotics',
  'USD/IDR': 'forexExotics',
  'USD/TWD': 'forexExotics',
  'USD/KRW': 'forexExotics',
  'USD/INR': 'forexExotics',
  'USD/PHP': 'forexExotics',
  'USD/MYR': 'forexExotics',
  'USD/SAR': 'forexExotics',
  'USD/AED': 'forexExotics',
  'USD/QAR': 'forexExotics',
  'USD/ILS': 'forexExotics',
  'EUR/ILS': 'forexExotics',
  'USD/CLP': 'forexExotics',
  'USD/COP': 'forexExotics',
  'USD/PEN': 'forexExotics',
  'EUR/ZAR': 'forexExotics',
  'GBP/ZAR': 'forexExotics',
  'AUD/ZAR': 'forexExotics',

  'XAG/USD': 'commodities',
  'NATGAS/USD': 'commodities',
  'BCO/USD': 'commodities',
  'WTICO/USD': 'commodities',
  'XPT/USD': 'commodities',
  'XAU/USD': 'commodities',
  'XAUUSD': 'commodities',
  'XPD/USD': 'commodities',
  'CORN/USD': 'commodities',
  'WHEAT/USD': 'commodities',
  'SUGAR/USD': 'commodities',

  'CAC': 'indices',
  'ASX': 'indices',
  'SPY': 'indices',
  'QQQ': 'indices',
  'DIA': 'indices',
  'IWM': 'indices',
  'VTI': 'indices',
  'ARKK': 'indices',
  'XLK': 'indices',
  'XLF': 'indices',
  'XLE': 'indices',
  'XLY': 'indices',
  'XLP': 'indices',
  'XLV': 'indices',
  'XLI': 'indices',
  'XLB': 'indices',
  'XLU': 'indices',
  'IYR': 'indices',
  'SMH': 'indices',
  'SOXX': 'indices',
  'TLT': 'indices',
  'HYG': 'indices',
  'GLD': 'indices',
  'SLV': 'indices',
  'BITO': 'indices',
  'SPYD': 'indices',
  'JEPI': 'indices',
  'VOO': 'indices',

  'AAPL': 'stocks',
  'MSFT': 'stocks',
  'GOOGL': 'stocks',
  'AMZN': 'stocks',
  'TSLA': 'stocks',
  'META': 'stocks',
  'NFLX': 'stocks',
  'NVDA': 'stocks',
  'BA': 'stocks',
  'JPM': 'stocks',
  'GS': 'stocks',
  'BAC': 'stocks',
  'WMT': 'stocks',
  'DIS': 'stocks',
  'CVX': 'stocks',
  'AMD': 'stocks',
  'INTC': 'stocks',
  'ORCL': 'stocks',
  'IBM': 'stocks',
  'ADBE': 'stocks',
  'PYPL': 'stocks',
  'UBER': 'stocks',
  'LYFT': 'stocks',
  'PFE': 'stocks',
  'MRNA': 'stocks',
  'KO': 'stocks',
  'PEP': 'stocks',
  'XOM': 'stocks',
  'T': 'stocks',
  'V': 'stocks',
  'MA': 'stocks',
  'CSCO': 'stocks',
  'CRM': 'stocks',
  'COST': 'stocks',
  'AVGO': 'stocks',
  'TXN': 'stocks',
  'QCOM': 'stocks',
  'AMAT': 'stocks',
  'INTU': 'stocks',
  'SBUX': 'stocks',
  'MCD': 'stocks',
  'LOW': 'stocks',
  'HD': 'stocks',
  'CAT': 'stocks',
  'HON': 'stocks',
  'AMGN': 'stocks',
  'LLY': 'stocks',
  'UNH': 'stocks',
  'ABT': 'stocks',
  'CVS': 'stocks',
  'WFC': 'stocks',
  'MS': 'stocks',
  'AXP': 'stocks',
  'BLK': 'stocks',
  'C': 'stocks',
  'BK': 'stocks',
  'TGT': 'stocks',
  'NKE': 'stocks',
  'SHOP': 'stocks',
  'SNOW': 'stocks',
  'PLTR': 'stocks'
};

export function getSwapConfigForSymbol(symbol: string): SwapConfig | null {
  const swapCategory = SYMBOL_SWAP_MAPPING[symbol];
  if (!swapCategory) {
    return null;
  }
  return SWAP_RATES_BY_TYPE[swapCategory];
}

export function calculateDailySwapCost(
  symbol: string,
  positionSize: number,
  leverage: number = 1
): number {
  const swapConfig = getSwapConfigForSymbol(symbol);

  if (!swapConfig) {
    return 0;
  }

  // positionSize is already the leveraged market notional. Applying leverage
  // again made the browser estimate disagree with settlement.
  void leverage;
  return positionSize * swapConfig.dailySwapRate;
}

export function calculateSwapCostForDuration(
  symbol: string,
  positionSize: number,
  leverage: number = 1,
  durationDays: number = 1
): number {
  const dailySwapCost = calculateDailySwapCost(symbol, positionSize, leverage);
  return dailySwapCost * durationDays;
}

export function formatSwapRate(swapRate: number): string {
  return `${(swapRate * 100).toFixed(4)}%`;
}

export function getSwapRateDescription(symbol: string): string {
  const swapConfig = getSwapConfigForSymbol(symbol);

  if (!swapConfig) {
    return 'No swap information available';
  }

  return `${swapConfig.description} - ${formatSwapRate(swapConfig.dailySwapRate)} daily`;
}

export function estimateMonthlySwapCost(
  symbol: string,
  positionSize: number,
  leverage: number = 1
): number {
  return calculateSwapCostForDuration(symbol, positionSize, leverage, 30);
}

export function estimateYearlySwapCost(
  symbol: string,
  positionSize: number,
  leverage: number = 1
): number {
  return calculateSwapCostForDuration(symbol, positionSize, leverage, 365);
}
