import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getUserCfdTier } from '../constants/tradingTiers';

interface UserLeverageSettings {
  maxForex: number;
  minForex: number;
  maxCommodities: number;
  minCommodities: number;
  maxStocks: number;
  minStocks: number;
  maxFutures: number;
  minFutures: number;
}

const DEFAULT_MAX_FUTURES = 100;
const DEFAULT_MIN_LEVERAGE = 1;

export const useUserLeverage = (userId: string | undefined, portfolioValue: number): UserLeverageSettings => {
  const [leverageSettings, setLeverageSettings] = useState<UserLeverageSettings>(() => {
    const defaultTier = getUserCfdTier(portfolioValue);
    return {
      maxForex: defaultTier.maxForex,
      minForex: DEFAULT_MIN_LEVERAGE,
      maxCommodities: defaultTier.maxCommodities,
      minCommodities: DEFAULT_MIN_LEVERAGE,
      maxStocks: defaultTier.maxStocks,
      minStocks: DEFAULT_MIN_LEVERAGE,
      maxFutures: DEFAULT_MAX_FUTURES,
      minFutures: DEFAULT_MIN_LEVERAGE,
    };
  });

  useEffect(() => {
    const fetchCustomLeverage = async () => {
      if (!userId) {
        const defaultTier = getUserCfdTier(portfolioValue);
        setLeverageSettings({
          maxForex: defaultTier.maxForex,
          minForex: DEFAULT_MIN_LEVERAGE,
          maxCommodities: defaultTier.maxCommodities,
          minCommodities: DEFAULT_MIN_LEVERAGE,
          maxStocks: defaultTier.maxStocks,
          minStocks: DEFAULT_MIN_LEVERAGE,
          maxFutures: DEFAULT_MAX_FUTURES,
          minFutures: DEFAULT_MIN_LEVERAGE,
        });
        return;
      }

      try {
        const { data, error } = await supabase
          .from('users')
          .select('max_leverage_forex, max_leverage_commodities, max_leverage_stocks, min_leverage_forex, min_leverage_commodities, min_leverage_stocks, max_leverage_futures, min_leverage_futures')
          .eq('id', userId)
          .maybeSingle();

        if (error) {
          console.error('Error fetching custom leverage:', error);
          const defaultTier = getUserCfdTier(portfolioValue);
          setLeverageSettings({
            maxForex: defaultTier.maxForex,
            minForex: DEFAULT_MIN_LEVERAGE,
            maxCommodities: defaultTier.maxCommodities,
            minCommodities: DEFAULT_MIN_LEVERAGE,
            maxStocks: defaultTier.maxStocks,
            minStocks: DEFAULT_MIN_LEVERAGE,
            maxFutures: DEFAULT_MAX_FUTURES,
            minFutures: DEFAULT_MIN_LEVERAGE,
          });
          return;
        }

        const defaultTier = getUserCfdTier(portfolioValue);

        const maxForex = data?.max_leverage_forex ?? defaultTier.maxForex;
        const minForex = data?.min_leverage_forex ?? DEFAULT_MIN_LEVERAGE;
        const maxCommodities = data?.max_leverage_commodities ?? defaultTier.maxCommodities;
        const minCommodities = data?.min_leverage_commodities ?? DEFAULT_MIN_LEVERAGE;
        const maxStocks = data?.max_leverage_stocks ?? defaultTier.maxStocks;
        const minStocks = data?.min_leverage_stocks ?? DEFAULT_MIN_LEVERAGE;
        const maxFutures = data?.max_leverage_futures ?? DEFAULT_MAX_FUTURES;
        const minFutures = data?.min_leverage_futures ?? DEFAULT_MIN_LEVERAGE;

        setLeverageSettings({
          maxForex: Math.max(maxForex, minForex),
          minForex: Math.min(minForex, maxForex),
          maxCommodities: Math.max(maxCommodities, minCommodities),
          minCommodities: Math.min(minCommodities, maxCommodities),
          maxStocks: Math.max(maxStocks, minStocks),
          minStocks: Math.min(minStocks, maxStocks),
          maxFutures: Math.max(maxFutures, minFutures),
          minFutures: Math.min(minFutures, maxFutures),
        });
      } catch (err) {
        console.error('Error in fetchCustomLeverage:', err);
        const defaultTier = getUserCfdTier(portfolioValue);
        setLeverageSettings({
          maxForex: defaultTier.maxForex,
          minForex: DEFAULT_MIN_LEVERAGE,
          maxCommodities: defaultTier.maxCommodities,
          minCommodities: DEFAULT_MIN_LEVERAGE,
          maxStocks: defaultTier.maxStocks,
          minStocks: DEFAULT_MIN_LEVERAGE,
          maxFutures: DEFAULT_MAX_FUTURES,
          minFutures: DEFAULT_MIN_LEVERAGE,
        });
      }
    };

    fetchCustomLeverage();
  }, [userId, portfolioValue]);

  return leverageSettings;
};
