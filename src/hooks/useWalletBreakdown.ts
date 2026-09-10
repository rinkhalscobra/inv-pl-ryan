import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './useAuth';

export interface WalletBreakdown {
  totalBalance: number;
  usedMargin: number;
  futuresUsedMargin: number;
  futuresOrdersReserved: number;
  unrealizedPnl: number;
  availableBalance: number;
  robotAllocatedBalance: number;
  stakedAmount: number;
  loading: boolean;
  error: string | null;
}

export const useWalletBreakdown = (
  usdtBalanceProp?: number,
  btcBalanceProp?: number,
  btcPriceProp?: number,
  getPriceFn?: (symbol: string) => number
) => {
  const { user } = useAuth();
  const getPriceFnRef = useRef(getPriceFn);
  getPriceFnRef.current = getPriceFn;

  const hasLoadedRef = useRef(false);

  const [breakdown, setBreakdown] = useState<WalletBreakdown>({
    totalBalance: 0,
    usedMargin: 0,
    futuresUsedMargin: 0,
    futuresOrdersReserved: 0,
    unrealizedPnl: 0,
    availableBalance: 0,
    robotAllocatedBalance: 0,
    stakedAmount: 0,
    loading: true,
    error: null
  });

  const lookupPrice = useCallback(async (symbol: string): Promise<number> => {
    if (getPriceFnRef.current) {
      const wsPrice = getPriceFnRef.current(symbol);
      if (wsPrice > 0) return wsPrice;
    }

    const { data, error } = await supabase
      .from('market_data')
      .select('price')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return 0;
    return parseFloat(data.price?.toString() || '0') || 0;
  }, []);

  const calculateBreakdown = useCallback(async () => {
    if (!user) {
      setBreakdown(prev => ({ ...prev, loading: false }));
      return;
    }

    try {
      if (!hasLoadedRef.current) {
        setBreakdown(prev => ({ ...prev, loading: true, error: null }));
      }

      let usdtBalance = usdtBalanceProp;
      let btcBalance = btcBalanceProp;

      if (usdtBalance === undefined || btcBalance === undefined) {
        const { data: balanceData, error: balanceError } = await supabase
          .from('balances')
          .select('usdt_balance, btc_balance')
          .eq('user_id', user.id)
          .single();

        if (balanceError) throw balanceError;

        usdtBalance = parseFloat(balanceData?.usdt_balance?.toString() || '0') || 0;
        btcBalance = parseFloat(balanceData?.btc_balance?.toString() || '0') || 0;
      }

      let currentBtcPrice = btcPriceProp || 0;
      if (!currentBtcPrice || currentBtcPrice <= 0) {
        currentBtcPrice = await lookupPrice('BTCUSDT');
      }

      let totalBalance = usdtBalance + (btcBalance * currentBtcPrice);

      const { data: userAssets, error: assetsError } = await supabase
        .from('user_assets')
        .select('asset_symbol, balance')
        .eq('user_id', user.id);

      if (!assetsError && userAssets && userAssets.length > 0) {
        for (const asset of userAssets) {
          if (asset.asset_symbol === 'USDT' || asset.asset_symbol === 'BTC') continue;

          const balance = parseFloat(asset.balance?.toString() || '0') || 0;
          if (balance <= 0) continue;

          const price = await lookupPrice(`${asset.asset_symbol}USDT`);
          if (price > 0) {
            totalBalance += balance * price;
          }
        }
      }

      const [
        { data: futuresPositions, error: futuresError },
        { data: futuresOrders, error: futuresOrdersError },
        { data: robotState, error: robotError },
        { data: userStakes, error: stakesError }
      ] = await Promise.all([
        supabase.from('futures_positions').select('margin, unrealized_pnl').eq('user_id', user.id).eq('is_open', true),
        supabase.from('futures_orders').select('reserved_margin').eq('user_id', user.id).eq('status', 'open'),
        supabase.from('robot_states').select('allocated_balance').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_stakes').select('asset_symbol, staked_amount').eq('user_id', user.id).eq('status', 'active')
      ]);

      if (futuresError) throw futuresError;
      if (futuresOrdersError) throw futuresOrdersError;
      if (robotError) throw robotError;
      if (stakesError) throw stakesError;

      const futuresUsedMargin = futuresPositions?.reduce((sum, pos) => {
        return sum + (parseFloat(pos.margin?.toString() || '0') || 0);
      }, 0) || 0;

      const futuresOrdersReserved = futuresOrders?.reduce((sum, order) => {
        return sum + (parseFloat(order.reserved_margin?.toString() || '0') || 0);
      }, 0) || 0;

      const usedMargin = futuresUsedMargin + futuresOrdersReserved;

      const futuresUnrealizedPnl = futuresPositions?.reduce((sum, pos) => {
        return sum + (parseFloat(pos.unrealized_pnl?.toString() || '0') || 0);
      }, 0) || 0;

      const unrealizedPnl = futuresUnrealizedPnl;
      const robotAllocatedBalance = parseFloat(robotState?.allocated_balance?.toString() || '0') || 0;
      totalBalance += robotAllocatedBalance;

      let totalStakedValue = 0;
      if (userStakes && userStakes.length > 0) {
        for (const stake of userStakes) {
          const stakedAmount = parseFloat(stake.staked_amount?.toString() || '0') || 0;
          if (stakedAmount <= 0) continue;

          if (stake.asset_symbol === 'USDT') {
            totalStakedValue += stakedAmount;
          } else if (stake.asset_symbol === 'BTC') {
            totalStakedValue += stakedAmount * currentBtcPrice;
          } else {
            const price = await lookupPrice(`${stake.asset_symbol}USDT`);
            if (price > 0) {
              totalStakedValue += stakedAmount * price;
            }
          }
        }
      }

      const availableBalance = Math.max(0, totalBalance + unrealizedPnl - usedMargin - robotAllocatedBalance - totalStakedValue);

      hasLoadedRef.current = true;

      setBreakdown({
        totalBalance,
        usedMargin,
        futuresUsedMargin,
        futuresOrdersReserved,
        unrealizedPnl,
        availableBalance,
        robotAllocatedBalance,
        stakedAmount: totalStakedValue,
        loading: false,
        error: null
      });

    } catch (error: any) {
      console.error('Error calculating wallet breakdown:', error);
      setBreakdown(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to calculate wallet breakdown'
      }));
    }
  }, [user, usdtBalanceProp, btcBalanceProp, btcPriceProp, lookupPrice]);

  useEffect(() => {
    calculateBreakdown();
  }, [calculateBreakdown]);

  const refreshBreakdown = useCallback(() => {
    calculateBreakdown();
  }, [calculateBreakdown]);

  return {
    ...breakdown,
    refreshBreakdown
  };
};
