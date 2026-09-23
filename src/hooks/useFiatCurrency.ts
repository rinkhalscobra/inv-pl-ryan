import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useMarketData } from '../contexts/MarketDataContext';

const EUR_USD_CACHE_KEY = 'invest-platform:eur-usd-rate';
const DISPLAY_CURRENCY_KEY = 'atlas:portfolio-currency';
const DISPLAY_CURRENCY_EVENT = 'atlas:display-currency-change';
export type DisplayCurrency = 'EUR' | 'USD';

const readDisplayCurrency = (): DisplayCurrency => {
  if (typeof window === 'undefined') return 'EUR';
  try {
    return window.localStorage.getItem(DISPLAY_CURRENCY_KEY) === 'USD' ? 'USD' : 'EUR';
  } catch {
    return 'EUR';
  }
};

const subscribeToDisplayCurrency = (onChange: () => void) => {
  if (typeof window === 'undefined') return () => undefined;
  const handleStorage = (event: StorageEvent) => {
    if (event.key === DISPLAY_CURRENCY_KEY) onChange();
  };
  window.addEventListener(DISPLAY_CURRENCY_EVENT, onChange);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(DISPLAY_CURRENCY_EVENT, onChange);
    window.removeEventListener('storage', handleStorage);
  };
};
const readCachedRate = () => {
  if (typeof window === 'undefined') return 0;
  try {
    const cachedRate = Number(window.localStorage.getItem(EUR_USD_CACHE_KEY));
    return Number.isFinite(cachedRate) && cachedRate > 0 ? cachedRate : 0;
  } catch {
    return 0;
  }
};

export const useFiatCurrency = () => {
  const { getPriceBySymbol, getSnapshotPriceBySymbol } = useMarketData();
  const liveRate = getPriceBySymbol('EUR/USD') || getSnapshotPriceBySymbol('EUR/USD');
  const [cachedRate, setCachedRate] = useState(readCachedRate);
  const code = useSyncExternalStore(subscribeToDisplayCurrency, readDisplayCurrency, () => 'EUR' as DisplayCurrency);
  // A previously observed market rate may bridge a reconnect, but never invent a rate.
  const eurUsdRate = liveRate > 0 ? liveRate : cachedRate;

  useEffect(() => {
    if (liveRate <= 0) return;
    setCachedRate(liveRate);
    try {
      window.localStorage.setItem(EUR_USD_CACHE_KEY, String(liveRate));
    } catch {
      // The live rate still works when browser storage is unavailable.
    }
  }, [liveRate]);

  const convertUsdToEur = useCallback((amount: number) => {
    if (!Number.isFinite(amount) || eurUsdRate <= 0) return 0;
    return amount / eurUsdRate;
  }, [eurUsdRate]);

  const convertEurToUsd = useCallback((amount: number) => {
    if (!Number.isFinite(amount)) return 0;
    return amount * eurUsdRate;
  }, [eurUsdRate]);

  const eurFormatter = useMemo(() => new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }), []);

  const displayFormatter = useMemo(() => new Intl.NumberFormat(code === 'EUR' ? 'en-IE' : 'en-US', {
    style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }), [code]);

  const compactFormatter = useMemo(() => new Intl.NumberFormat(code === 'EUR' ? 'en-IE' : 'en-US', {
    style: 'currency',
    currency: code,
    notation: 'compact',
    maximumFractionDigits: 1,
  }), [code]);

  const wholeFormatter = useMemo(() => new Intl.NumberFormat(code === 'EUR' ? 'en-IE' : 'en-US', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 0,
  }), [code]);

  const convertUsdToDisplay = useCallback((amount: number) => code === 'EUR' ? convertUsdToEur(amount) : amount, [code, convertUsdToEur]);
  const convertDisplayToUsd = useCallback((amount: number) => code === 'EUR' ? convertEurToUsd(amount) : amount, [code, convertEurToUsd]);

  const setCurrency = useCallback((next: DisplayCurrency) => {
    try {
      window.localStorage.setItem(DISPLAY_CURRENCY_KEY, next);
    } catch {
      // Keep the active page usable when browser storage is unavailable.
    }
    window.dispatchEvent(new Event(DISPLAY_CURRENCY_EVENT));
  }, []);

  const formatFiat = useCallback((usdAmount: number) => (
    displayFormatter.format(convertUsdToDisplay(usdAmount))
  ), [convertUsdToDisplay, displayFormatter]);

  const formatEur = useCallback((eurAmount: number) => (
    eurFormatter.format(Number.isFinite(eurAmount) ? eurAmount : 0)
  ), [eurFormatter]);

  const formatUsd = useCallback((usdAmount: number) => (
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(usdAmount) ? usdAmount : 0)
  ), []);

  const formatFiatCompact = useCallback((usdAmount: number) => (
    compactFormatter.format(convertUsdToDisplay(usdAmount))
  ), [compactFormatter, convertUsdToDisplay]);

  const formatFiatWhole = useCallback((usdAmount: number) => (
    wholeFormatter.format(convertUsdToDisplay(usdAmount))
  ), [convertUsdToDisplay, wholeFormatter]);

  const formatFiatNumber = useCallback((usdAmount: number, digits = 2) => (
    convertUsdToDisplay(usdAmount).toLocaleString(code === 'EUR' ? 'en-IE' : 'en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  ), [code, convertUsdToDisplay]);

  const formatFiatPrice = useCallback((usdAmount: number, digits = 2) => (
    `${code === 'EUR' ? '€' : '$'}${formatFiatNumber(usdAmount, digits)}`
  ), [code, formatFiatNumber]);

  const formatTradingPair = useCallback((marketSymbol: string) => {
    if (marketSymbol.endsWith('USDT')) {
      return `${marketSymbol.slice(0, -4)}/${code}`;
    }
    return marketSymbol;
  }, [code]);

  return {
    code,
    symbol: code === 'EUR' ? '€' : '$',
    setCurrency,
    eurUsdRate,
    convertUsdToEur,
    convertEurToUsd,
    convertUsdToDisplay,
    convertDisplayToUsd,
    formatFiat,
    formatEur,
    formatUsd,
    formatFiatCompact,
    formatFiatWhole,
    formatFiatNumber,
    formatFiatPrice,
    formatTradingPair,
  };
};
