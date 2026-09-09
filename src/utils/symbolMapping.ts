const COMMODITY_PREFIXES = ['XAU', 'XAG', 'XPT', 'XPD'];
const SPECIAL_COMMODITIES: Record<string, string> = {
  'WTICOUSD': 'WTICO/USD',
  'NATGASUSD': 'NATGAS/USD',
  'BCOUSD': 'BCO/USD',
  'CORNUSD': 'CORN/USD',
  'WHEATUSD': 'WHEAT/USD',
  'SUGARUSD': 'SUGAR/USD',
};

const SPECIAL_COMMODITIES_REVERSE: Record<string, string> = {
  'WTICO/USD': 'WTICOUSD',
  'NATGAS/USD': 'NATGASUSD',
  'BCO/USD': 'BCOUSD',
  'CORN/USD': 'CORNUSD',
  'WHEAT/USD': 'WHEATUSD',
  'SUGAR/USD': 'SUGARUSD',
};

const FOREX_CURRENCIES = [
  'EUR', 'USD', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF',
  'TRY', 'ZAR', 'HKD', 'SGD', 'DKK', 'NOK', 'SEK', 'PLN',
  'HUF', 'CZK', 'MXN', 'BRL', 'CNH', 'THB', 'IDR', 'TWD',
  'KRW', 'INR', 'PHP', 'MYR', 'SAR', 'AED', 'QAR', 'ILS',
  'CLP', 'COP', 'PEN'
];

export function wsSymbolToAppSymbol(wsSymbol: string): string {
  if (!wsSymbol) return wsSymbol;

  const upper = wsSymbol.toUpperCase();

  if (SPECIAL_COMMODITIES[upper]) {
    return SPECIAL_COMMODITIES[upper];
  }

  for (const prefix of COMMODITY_PREFIXES) {
    if (upper.startsWith(prefix) && upper.endsWith('USD')) {
      return `${prefix}/USD`;
    }
  }

  if (upper.length === 6) {
    const base = upper.slice(0, 3);
    const quote = upper.slice(3);

    if (FOREX_CURRENCIES.includes(base) && FOREX_CURRENCIES.includes(quote)) {
      return `${base}/${quote}`;
    }
  }

  return wsSymbol;
}

export function appSymbolToWsSymbol(appSymbol: string): string {
  if (!appSymbol) return appSymbol;

  const upper = appSymbol.toUpperCase();

  if (SPECIAL_COMMODITIES_REVERSE[upper]) {
    return SPECIAL_COMMODITIES_REVERSE[upper];
  }

  if (upper.includes('/')) {
    return upper.replace('/', '');
  }

  return appSymbol;
}

export function normalizeSymbolForLookup(symbol: string): string {
  if (!symbol) return symbol;
  return symbol.toUpperCase().replace('/', '');
}
