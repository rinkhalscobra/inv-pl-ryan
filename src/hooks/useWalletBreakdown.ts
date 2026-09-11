import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './useAuth';

export interface WalletBreakdown {
  totalBalance: number;
  liquidBalance: number;
  usedMargin: number;
  futuresUsedMargin: number;
  futuresOrdersReserved: number;
  unrealizedPnl: number;
  availableBalance: number;
  fiatAvailableBalance: number;
  btcAvailableBalance: number;
  robotAllocatedBalance: number;
  stakedAmount: number;
  loading: boolean;
  error: string | null;
}

interface WalletSources {
  usdtBalance: number;
  btcBalance: number;
  assets: Array<{ asset_symbol: string; balance: number }>;
  positions: Array<{ margin: number; unrealized_pnl: number }>;
  orders: Array<{ reserved_margin: number }>;
  robotAllocatedBalance: number;
  stakes: Array<{ asset_symbol: string; staked_amount: number }>;
}

const emptySources: WalletSources = {
  usdtBalance: 0,
  btcBalance: 0,
  assets: [],
  positions: [],
  orders: [],
  robotAllocatedBalance: 0,
  stakes: [],
};

const asNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const useWalletBreakdown = (
  usdtBalanceProp?: number,
  btcBalanceProp?: number,
  btcPriceProp?: number,
  getPriceFn?: (symbol: string) => number
) => {
  const { user } = useAuth();
  const [sources, setSources] = useState<WalletSources>(emptySources);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const fetchSources = useCallback(async () => {
    if (!user) {
      setSources(emptySources);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      const [balancesResult, assetsResult, positionsResult, ordersResult, robotResult, stakesResult] = await Promise.all([
        supabase.from('balances').select('usdt_balance, btc_balance').eq('user_id', user.id).single(),
        supabase.from('user_assets').select('asset_symbol, balance').eq('user_id', user.id),
        supabase.from('futures_positions').select('margin, unrealized_pnl').eq('user_id', user.id).eq('is_open', true),
        supabase.from('futures_orders').select('reserved_margin').eq('user_id', user.id).eq('status', 'open'),
        supabase.from('robot_states').select('allocated_balance').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_stakes').select('asset_symbol, staked_amount').eq('user_id', user.id).eq('status', 'active'),
      ]);

      const firstError = [balancesResult, assetsResult, positionsResult, ordersResult, robotResult, stakesResult]
        .find(result => result.error)?.error;
      if (firstError) throw firstError;

      setSources({
        usdtBalance: asNumber(balancesResult.data?.usdt_balance),
        btcBalance: asNumber(balancesResult.data?.btc_balance),
        assets: (assetsResult.data || []).map(asset => ({
          asset_symbol: String(asset.asset_symbol).toUpperCase(),
          balance: asNumber(asset.balance),
        })),
        positions: (positionsResult.data || []).map(position => ({
          margin: asNumber(position.margin),
          unrealized_pnl: asNumber(position.unrealized_pnl),
        })),
        orders: (ordersResult.data || []).map(order => ({ reserved_margin: asNumber(order.reserved_margin) })),
        robotAllocatedBalance: asNumber(robotResult.data?.allocated_balance),
        stakes: (stakesResult.data || []).map(stake => ({
          asset_symbol: String(stake.asset_symbol).toUpperCase(),
          staked_amount: asNumber(stake.staked_amount),
        })),
      });
      setError(null);
    } catch (fetchError) {
      console.error('Error loading wallet breakdown:', fetchError);
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load wallet breakdown');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    void fetchSources();
  }, [fetchSources]);

  useEffect(() => {
    if (!user) return;

    const queueRefresh = () => {
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => void fetchSources(), 120);
    };
    const channel = supabase
      .channel(`wallet-breakdown-${user.id}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'balances', filter: `user_id=eq.${user.id}` }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_assets', filter: `user_id=eq.${user.id}` }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'futures_positions', filter: `user_id=eq.${user.id}` }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'futures_orders', filter: `user_id=eq.${user.id}` }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'robot_states', filter: `user_id=eq.${user.id}` }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_stakes', filter: `user_id=eq.${user.id}` }, queueRefresh)
      .subscribe();

    return () => {
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [fetchSources, user]);

  const breakdown = useMemo<WalletBreakdown>(() => {
    const usdtBalance = usdtBalanceProp ?? sources.usdtBalance;
    const btcBalance = btcBalanceProp ?? sources.btcBalance;
    const getPrice = (symbol: string) => {
      const price = getPriceFn?.(symbol) || 0;
      return Number.isFinite(price) && price > 0 ? price : 0;
    };
    const btcPrice = btcPriceProp && btcPriceProp > 0 ? btcPriceProp : getPrice('BTCUSDT');
    const missingPrices = new Set<string>();
    if (btcBalance > 0 && btcPrice <= 0) missingPrices.add('BTC');

    let liquidBalance = usdtBalance + btcBalance * btcPrice;
    for (const asset of sources.assets) {
      if (asset.balance <= 0 || asset.asset_symbol === 'USDT' || asset.asset_symbol === 'BTC') continue;
      const price = getPrice(`${asset.asset_symbol}USDT`);
      if (price <= 0) missingPrices.add(asset.asset_symbol);
      liquidBalance += asset.balance * price;
    }

    const futuresUsedMargin = sources.positions.reduce((sum, position) => sum + position.margin, 0);
    const futuresOrdersReserved = sources.orders.reduce((sum, order) => sum + order.reserved_margin, 0);
    const usedMargin = futuresUsedMargin + futuresOrdersReserved;
    const unrealizedPnl = sources.positions.reduce((sum, position) => sum + position.unrealized_pnl, 0);

    let stakedAmount = 0;
    for (const stake of sources.stakes) {
      if (stake.staked_amount <= 0) continue;
      if (stake.asset_symbol === 'USDT') stakedAmount += stake.staked_amount;
      else if (stake.asset_symbol === 'BTC') stakedAmount += stake.staked_amount * btcPrice;
      else {
        const price = getPrice(`${stake.asset_symbol}USDT`);
        if (price <= 0) missingPrices.add(stake.asset_symbol);
        stakedAmount += stake.staked_amount * price;
      }
    }

    const totalBalance = liquidBalance + sources.robotAllocatedBalance + stakedAmount;
    const availableBalance = Math.max(0, liquidBalance + unrealizedPnl - usedMargin);
    const fiatAvailableBalance = Math.max(0, usdtBalance - usedMargin);

    return {
      totalBalance,
      liquidBalance,
      usedMargin,
      futuresUsedMargin,
      futuresOrdersReserved,
      unrealizedPnl,
      availableBalance,
      fiatAvailableBalance,
      btcAvailableBalance: Math.max(0, btcBalance),
      robotAllocatedBalance: sources.robotAllocatedBalance,
      stakedAmount,
      loading,
      error: error || (missingPrices.size > 0
        ? `Live price unavailable for: ${Array.from(missingPrices).join(', ')}`
        : null),
    };
  }, [btcBalanceProp, btcPriceProp, error, getPriceFn, loading, sources, usdtBalanceProp]);

  return {
    ...breakdown,
    refreshBreakdown: fetchSources,
  };
};
