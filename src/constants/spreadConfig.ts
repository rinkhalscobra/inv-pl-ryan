export interface SpreadConfig {
  symbol: string;
  instrumentType: 'crypto' | 'forex' | 'commodity' | 'stock' | 'index';
  spreadPercentage: number;
  minSpread: number;
  maxSpread: number;
  description?: string;
}

export const SPREAD_RANGES = {
  crypto: {
    description: 'Crypto Futures - Best ECN Conditions',
    range: '0.005-0.02%',
    typical: '0.5-2 USDT'
  },
  forexMajors: {
    description: 'Forex Majors - Tightest Spreads',
    range: '0.006-0.009%',
    typical: '0.6-0.9 pips'
  },
  forexMinors: {
    description: 'Forex Cross Pairs',
    range: '0.009-0.015%',
    typical: '0.9-1.5 pips'
  },
  forexExotics: {
    description: 'Forex Exotic Pairs',
    range: '0.05-0.3%',
    typical: '5-30 pips'
  },
  commodities: {
    description: 'Commodities CFDs',
    range: '0.015-0.05%',
    typical: 'Variable by instrument'
  },
  indices: {
    description: 'Indices CFDs',
    range: '0.01-0.02%',
    typical: '0.4-1.0 points'
  },
  stocks: {
    description: 'Stock CFDs',
    range: '0.01-0.015%',
    typical: '$0.01-$0.03'
  }
};

export const DEFAULT_SPREADS: Record<string, SpreadConfig> = {
  'BTCUSDT': { symbol: 'BTCUSDT', instrumentType: 'crypto', spreadPercentage: 0.00005, minSpread: 0.5, maxSpread: 2.0 },
  'ETHUSDT': { symbol: 'ETHUSDT', instrumentType: 'crypto', spreadPercentage: 0.00008, minSpread: 0.02, maxSpread: 0.5 },
  'BNBUSDT': { symbol: 'BNBUSDT', instrumentType: 'crypto', spreadPercentage: 0.0001, minSpread: 0.005, maxSpread: 0.1 },
  'SOLUSDT': { symbol: 'SOLUSDT', instrumentType: 'crypto', spreadPercentage: 0.0001, minSpread: 0.002, maxSpread: 0.05 },
  'XRPUSDT': { symbol: 'XRPUSDT', instrumentType: 'crypto', spreadPercentage: 0.00015, minSpread: 0.00005, maxSpread: 0.0005 },

  'EUR/USD': { symbol: 'EUR/USD', instrumentType: 'forex', spreadPercentage: 0.00006, minSpread: 0.00006, maxSpread: 0.0001, description: '0.6 pips' },
  'GBP/USD': { symbol: 'GBP/USD', instrumentType: 'forex', spreadPercentage: 0.00008, minSpread: 0.00008, maxSpread: 0.00012, description: '0.8 pips' },
  'USD/JPY': { symbol: 'USD/JPY', instrumentType: 'forex', spreadPercentage: 0.00007, minSpread: 0.007, maxSpread: 0.01, description: '0.7 pips' },
  'AUD/USD': { symbol: 'AUD/USD', instrumentType: 'forex', spreadPercentage: 0.00007, minSpread: 0.00007, maxSpread: 0.0001, description: '0.7 pips' },
  'USD/CHF': { symbol: 'USD/CHF', instrumentType: 'forex', spreadPercentage: 0.00009, minSpread: 0.00009, maxSpread: 0.00012, description: '0.9 pips' },
  'EUR/GBP': { symbol: 'EUR/GBP', instrumentType: 'forex', spreadPercentage: 0.00009, minSpread: 0.00009, maxSpread: 0.00012, description: '0.9 pips' },

  'XAU/USD': { symbol: 'XAU/USD', instrumentType: 'commodity', spreadPercentage: 0.00015, minSpread: 0.20, maxSpread: 0.50, description: '$0.20' },
  'XAUUSD': { symbol: 'XAUUSD', instrumentType: 'commodity', spreadPercentage: 0.00015, minSpread: 0.20, maxSpread: 0.50, description: '$0.20' },
  'XAG/USD': { symbol: 'XAG/USD', instrumentType: 'commodity', spreadPercentage: 0.0005, minSpread: 0.02, maxSpread: 0.05, description: '$0.02' },
  'WTICO/USD': { symbol: 'WTICO/USD', instrumentType: 'commodity', spreadPercentage: 0.0003, minSpread: 0.03, maxSpread: 0.05, description: '$0.03' },
  'BCO/USD': { symbol: 'BCO/USD', instrumentType: 'commodity', spreadPercentage: 0.0004, minSpread: 0.04, maxSpread: 0.06, description: '$0.04' },
  'NATGAS/USD': { symbol: 'NATGAS/USD', instrumentType: 'commodity', spreadPercentage: 0.0005, minSpread: 0.005, maxSpread: 0.01, description: '$0.005' },
  'XPT/USD': { symbol: 'XPT/USD', instrumentType: 'commodity', spreadPercentage: 0.0004, minSpread: 0.40, maxSpread: 0.80, description: '$0.40' },

  'SPY': { symbol: 'SPY', instrumentType: 'index', spreadPercentage: 0.0001, minSpread: 0.40, maxSpread: 1.0, description: '0.4 pts' },
  'QQQ': { symbol: 'QQQ', instrumentType: 'index', spreadPercentage: 0.00012, minSpread: 1.0, maxSpread: 2.0, description: '1.0 pts' },
  'DIA': { symbol: 'DIA', instrumentType: 'index', spreadPercentage: 0.0001, minSpread: 1.0, maxSpread: 2.0, description: '1.0 pts' },

  'AAPL': { symbol: 'AAPL', instrumentType: 'stock', spreadPercentage: 0.0001, minSpread: 0.01, maxSpread: 0.03, description: '$0.01' },
  'MSFT': { symbol: 'MSFT', instrumentType: 'stock', spreadPercentage: 0.0001, minSpread: 0.01, maxSpread: 0.03, description: '$0.01' },
  'TSLA': { symbol: 'TSLA', instrumentType: 'stock', spreadPercentage: 0.00015, minSpread: 0.03, maxSpread: 0.06, description: '$0.03' },
  'AMZN': { symbol: 'AMZN', instrumentType: 'stock', spreadPercentage: 0.00012, minSpread: 0.02, maxSpread: 0.04, description: '$0.02' },
  'META': { symbol: 'META', instrumentType: 'stock', spreadPercentage: 0.00012, minSpread: 0.02, maxSpread: 0.04, description: '$0.02' },
  'NVDA': { symbol: 'NVDA', instrumentType: 'stock', spreadPercentage: 0.00012, minSpread: 0.03, maxSpread: 0.06, description: '$0.03' },
};

export function getSpreadForSymbol(symbol: string): SpreadConfig | null {
  return DEFAULT_SPREADS[symbol] || null;
}

export function calculateSpreadCost(
  symbol: string,
  entryPrice: number,
  amount: number,
  lotSize: number = 1
): number {
  const spreadConfig = getSpreadForSymbol(symbol);

  if (!spreadConfig) {
    return entryPrice * amount * lotSize * 0.0001;
  }

  const positionValue = entryPrice * amount * lotSize;
  const calculatedSpread = positionValue * spreadConfig.spreadPercentage;

  const boundedSpread = Math.max(
    spreadConfig.minSpread,
    Math.min(calculatedSpread, spreadConfig.maxSpread)
  );

  return boundedSpread;
}

export function formatSpreadDisplay(
  symbol: string,
  entryPrice: number,
  amount: number,
  lotSize: number = 1
): { cost: string; percentage: string; description: string } {
  const spreadConfig = getSpreadForSymbol(symbol);
  const spreadCost = calculateSpreadCost(symbol, entryPrice, amount, lotSize);

  const spreadPercentage = spreadConfig
    ? (spreadConfig.spreadPercentage * 100).toFixed(4)
    : '0.0100';

  const description = spreadConfig?.description || 'Standard spread';

  return {
    cost: spreadCost.toFixed(8),
    percentage: `${spreadPercentage}%`,
    description
  };
}
