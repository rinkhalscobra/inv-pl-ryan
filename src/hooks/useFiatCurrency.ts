import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMarketData } from '../contexts/MarketDataContext';

const EUR_USD_CACHE_KEY = 'invest-platform:eur-usd-rate';
const readCachedRate = () => {
  if (typeof window === 'undefined') return 0;
  const cachedRate = Number(window.localStorage.getItem(EUR_USD_CACHE_KEY));
  return Number.isFinite(cachedRate) && cachedRate > 0 ? cachedRate : 0;
};

export const useFiatCurrency = () => {
  const { getPriceBySymbol, getSnapshotPriceBySymbol } = useMarketData();
  const liveRate = getPriceBySymbol('EUR/USD') || getSnapshotPriceBySymbol('EUR/USD');
  const [cachedRate, setCachedRate] = useState(readCachedRate);
  // A previously observed market rate may bridge a reconnect, but never invent a rate.
  const eurUsdRate = liveRate > 0 ? liveRate : cachedRate;

  useEffect(() => {
    if (liveRate <= 0) return;
    setCachedRate(liveRate);
    window.localStorage.setItem(EUR_USD_CACHE_KEY, String(liveRate));
  }, [liveRate]);

  const convertUsdToEur = useCallback((amount: number) => {
    if (!Number.isFinite(amount) || eurUsdRate <= 0) return 0;
    return amount / eurUsdRate;
  }, [eurUsdRate]);

  const convertEurToUsd = useCallback((amount: number) => {
    if (!Number.isFinite(amount)) return 0;
    return amount * eurUsdRate;
  }, [eurUsdRate]);

  const formatter = useMemo(() => new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }), []);

  const compactFormatter = useMemo(() => new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }), []);

  const wholeFormatter = useMemo(() => new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }), []);

  const formatFiat = useCallback((usdAmount: number) => (
    formatter.format(convertUsdToEur(usdAmount))
  ), [convertUsdToEur, formatter]);

  const formatEur = useCallback((eurAmount: number) => (
    formatter.format(Number.isFinite(eurAmount) ? eurAmount : 0)
  ), [formatter]);

  const formatFiatCompact = useCallback((usdAmount: number) => (
    compactFormatter.format(convertUsdToEur(usdAmount))
  ), [compactFormatter, convertUsdToEur]);

  const formatFiatWhole = useCallback((usdAmount: number) => (
    wholeFormatter.format(convertUsdToEur(usdAmount))
  ), [convertUsdToEur, wholeFormatter]);

  const formatFiatNumber = useCallback((usdAmount: number, digits = 2) => (
    convertUsdToEur(usdAmount).toLocaleString('en-IE', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  ), [convertUsdToEur]);

  const formatFiatPrice = useCallback((usdAmount: number, digits = 2) => (
    `€${formatFiatNumber(usdAmount, digits)}`
  ), [formatFiatNumber]);

  const formatTradingPair = useCallback((marketSymbol: string) => {
    if (marketSymbol.endsWith('USDT')) {
      return `${marketSymbol.slice(0, -4)}/EUR`;
    }
    return marketSymbol;
  }, []);

  return {
    code: 'EUR' as const,
    symbol: '€',
    eurUsdRate,
    convertUsdToEur,
    convertEurToUsd,
    formatFiat,
    formatEur,
    formatFiatCompact,
    formatFiatWhole,
    formatFiatNumber,
    formatFiatPrice,
    formatTradingPair,
  };
};
