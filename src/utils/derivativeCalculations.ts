export type MarketPriceLookup = (symbol: string) => number;

const FOREX_SYMBOL = /^[A-Z]{3}\/[A-Z]{3}$/;

export const isForexSymbol = (symbol: string): boolean => FOREX_SYMBOL.test(symbol);

export const getUsdValueOfCurrency = (
  currency: string,
  getPrice: MarketPriceLookup
): number => {
  if (currency === 'USD' || currency === 'USDT') return 1;

  const directPrice = getPrice(`${currency}/USD`);
  if (directPrice > 0) return directPrice;

  const inversePrice = getPrice(`USD/${currency}`);
  if (inversePrice > 0) return 1 / inversePrice;

  return 0;
};

export const calculateDerivativeNotionalUsd = (
  symbol: string,
  amount: number,
  price: number,
  getPrice: MarketPriceLookup
): number => {
  if (!Number.isFinite(amount) || !Number.isFinite(price) || amount <= 0 || price <= 0) return 0;
  if (!isForexSymbol(symbol)) return amount * price;

  const [baseCurrency, quoteCurrency] = symbol.split('/');
  if (baseCurrency === 'USD') return amount;
  if (quoteCurrency === 'USD') return amount * price;

  const quoteUsdRate = getUsdValueOfCurrency(quoteCurrency, getPrice);
  if (quoteUsdRate > 0) return amount * price * quoteUsdRate;

  const baseUsdRate = getUsdValueOfCurrency(baseCurrency, getPrice);
  return baseUsdRate > 0 ? amount * baseUsdRate : 0;
};

export const calculateDerivativePnlUsd = (
  symbol: string,
  side: 'long' | 'short',
  entryPrice: number,
  currentPrice: number,
  amount: number,
  getPrice: MarketPriceLookup
): number => {
  if (![entryPrice, currentPrice, amount].every(Number.isFinite) || entryPrice <= 0 || currentPrice <= 0 || amount <= 0) {
    return 0;
  }

  const priceDifference = side === 'long'
    ? currentPrice - entryPrice
    : entryPrice - currentPrice;
  const pnlInQuoteCurrency = priceDifference * amount;

  if (!isForexSymbol(symbol)) return pnlInQuoteCurrency;

  const quoteCurrency = symbol.split('/')[1];
  const quoteUsdRate = quoteCurrency === 'USD'
    ? 1
    : getUsdValueOfCurrency(quoteCurrency, getPrice);

  return quoteUsdRate > 0 ? pnlInQuoteCurrency * quoteUsdRate : 0;
};

export const calculateLiveSwapCost = (
  dailySwapCost: number,
  accumulatedSwapCost: number,
  createdAt: string | undefined,
  lastSwapChargeDate: string | null | undefined,
  swapAccruedAt: string | null | undefined,
  nowMs: number
): number => {
  const storedCost = Number.isFinite(accumulatedSwapCost) ? Math.max(accumulatedSwapCost, 0) : 0;
  if (!Number.isFinite(dailySwapCost) || dailySwapCost <= 0) return storedCost;

  const fallbackStart = lastSwapChargeDate
    ? `${lastSwapChargeDate.slice(0, 10)}T00:00:00.000Z`
    : createdAt;
  const accrualStartMs = Date.parse(swapAccruedAt || fallbackStart || '');
  if (!Number.isFinite(accrualStartMs) || accrualStartMs >= nowMs) return storedCost;

  const elapsedDays = (nowMs - accrualStartMs) / 86_400_000;
  return storedCost + (dailySwapCost * elapsedDays);
};
