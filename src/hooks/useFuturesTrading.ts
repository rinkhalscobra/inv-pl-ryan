import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './useAuth';

export interface FuturesOrderParams {
  symbol: string;
  side: 'long' | 'short';
  amount: number;
  leverage: number;
  marginType: 'isolated' | 'cross';
  orderType: 'market' | 'limit';
  price: number;
  stopLoss?: number;
  takeProfit?: number;
  contractSize?: number;
}

export interface FuturesPosition {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  amount: number;
  entryPrice: number;
  currentPrice: number;
  leverage: number;
  marginType: 'isolated' | 'cross';
  margin: number;
  liquidationPrice: number;
  unrealizedPnl: number;
  roi: number;
  stopLoss?: number;
  takeProfit?: number;
  createdAt: string;
  accumulatedSwapCost: number;
  spreadCost: number;
  spreadPercentage: number;
  maintenanceMarginRate: number;
  swapAccruedAt?: string | null;
}

export interface FuturesOrder {
  id: string;
  symbol: string;
  type: 'limit' | 'market' | 'stop';
  side: 'buy' | 'sell';
  price: number | null;
  amount: number;
  leverage: number;
  marginType: 'isolated' | 'cross';
  status: 'open' | 'filled' | 'cancelled';
  createdAt: string;
  filledAt: string | null;
  positionId: string | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  reservedMargin: number;
}

export interface PositionHistoryEntry {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  amount: number;
  leverage: number;
  margin: number;
  pnl: number;
  roi: number;
  openTime: string;
  closeTime: string;
  durationSeconds: number;
  accumulatedSwapCost: number;
  totalSwapDays: number;
}

const numberValue = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const edgeError = (error: unknown, data: unknown, fallback: string): Error => {
  const response = data as { error?: string } | null;
  const message = response?.error || (error instanceof Error ? error.message : fallback);
  return new Error(message);
};

export const useFuturesTrading = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positionHistory, setPositionHistory] = useState<PositionHistoryEntry[]>([]);
  const [activePositions, setActivePositions] = useState<FuturesPosition[]>([]);
  const [openOrders, setOpenOrders] = useState<FuturesOrder[]>([]);

  const calculateLiquidationPrice = useCallback((
    side: 'long' | 'short',
    entryPrice: number,
    leverage: number,
    marginType: 'isolated' | 'cross' = 'isolated',
    amount = 0,
    crossCollateral = 0,
  ): number => {
    const maintenanceRate = 0.005;
    if (!(entryPrice > 0) || !(leverage > 0)) return 0;
    if (marginType === 'cross' && amount > 0 && crossCollateral > 0) {
      const denominator = amount * (side === 'long' ? 1 - maintenanceRate : 1 + maintenanceRate);
      const numerator = entryPrice * amount + (side === 'long' ? -crossCollateral : crossCollateral);
      return Math.max(numerator / denominator, 0.00000001);
    }
    const price = side === 'long'
      ? entryPrice * (1 - 1 / leverage) / (1 - maintenanceRate)
      : entryPrice * (1 + 1 / leverage) / (1 + maintenanceRate);
    return Math.max(price, 0.00000001);
  }, []);

  const fetchActivePositions = useCallback(async (): Promise<FuturesPosition[]> => {
    if (!user) {
      setActivePositions([]);
      return [];
    }
    try {
      const { data, error: fetchError } = await supabase.from('futures_positions')
        .select('*').eq('user_id', user.id).eq('is_open', true)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      const positions: FuturesPosition[] = (data || []).map((position) => ({
        id: position.id,
        symbol: position.symbol,
        side: position.side,
        amount: numberValue(position.amount),
        entryPrice: numberValue(position.entry_price),
        currentPrice: numberValue(position.current_price),
        leverage: numberValue(position.leverage) || 1,
        marginType: position.margin_type || 'isolated',
        margin: numberValue(position.margin),
        liquidationPrice: numberValue(position.liquidation_price),
        unrealizedPnl: numberValue(position.unrealized_pnl),
        roi: numberValue(position.roi),
        stopLoss: position.sl_price == null ? undefined : numberValue(position.sl_price),
        takeProfit: position.tp_price == null ? undefined : numberValue(position.tp_price),
        createdAt: position.created_at,
        accumulatedSwapCost: numberValue(position.accumulated_swap_cost),
        spreadCost: numberValue(position.spread_cost),
        spreadPercentage: numberValue(position.spread_percentage),
        maintenanceMarginRate: numberValue(position.maintenance_margin_rate) || 0.005,
        swapAccruedAt: position.swap_accrued_at,
      }));
      setActivePositions(positions);
      return positions;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load positions');
      return [];
    }
  }, [user]);

  const fetchOpenOrders = useCallback(async (): Promise<FuturesOrder[]> => {
    if (!user) {
      setOpenOrders([]);
      return [];
    }
    try {
      const { data, error: fetchError } = await supabase.from('futures_orders')
        .select('*').eq('user_id', user.id).eq('status', 'open')
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      const orders: FuturesOrder[] = (data || []).map((order) => ({
        id: order.id,
        symbol: order.symbol,
        type: order.type,
        side: order.side,
        price: order.price == null ? null : numberValue(order.price),
        amount: numberValue(order.amount),
        leverage: numberValue(order.leverage) || 1,
        marginType: order.margin_type || 'isolated',
        status: order.status,
        createdAt: order.created_at,
        filledAt: order.filled_at,
        positionId: order.position_id,
        stopLoss: order.sl_price == null ? null : numberValue(order.sl_price),
        takeProfit: order.tp_price == null ? null : numberValue(order.tp_price),
        reservedMargin: numberValue(order.reserved_margin),
      }));
      setOpenOrders(orders);
      return orders;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load orders');
      return [];
    }
  }, [user]);

  const openPosition = useCallback(async (params: FuturesOrderParams): Promise<string | null> => {
    setLoading(true);
    setError(null);
    try {
      if (!user) throw new Error('Authentication required');
      const effectiveAmount = params.amount * (params.contractSize || 1);
      const { data, error: invokeError } = await supabase.functions.invoke('futures-engine', {
        body: {
          action: 'place', symbol: params.symbol, side: params.side,
          amount: effectiveAmount, leverage: params.leverage, marginType: params.marginType,
          orderType: params.orderType, limitPrice: params.orderType === 'limit' ? params.price : null,
          stopLoss: params.stopLoss ?? null, takeProfit: params.takeProfit ?? null,
        },
      });
      if (invokeError || !data?.success) throw edgeError(invokeError, data, 'Order placement failed');
      await Promise.all([fetchActivePositions(), fetchOpenOrders()]);
      return data.result?.id || null;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Order placement failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchActivePositions, fetchOpenOrders, user]);

  const closePosition = useCallback(async (positionId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('futures-engine', {
        body: { action: 'close', positionId },
      });
      if (invokeError || !data?.success) throw edgeError(invokeError, data, 'Position close failed');
      await fetchActivePositions();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Position close failed');
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchActivePositions]);

  const updateStopLossTakeProfit = useCallback(async (
    positionId: string,
    updates: { stopLoss?: number | null; takeProfit?: number | null },
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('update_futures_risk', {
        p_position_id: positionId,
        p_stop_loss: updates.stopLoss ?? null,
        p_take_profit: updates.takeProfit ?? null,
        p_update_stop_loss: Object.prototype.hasOwnProperty.call(updates, 'stopLoss'),
        p_update_take_profit: Object.prototype.hasOwnProperty.call(updates, 'takeProfit'),
      });
      if (rpcError || data !== true) throw rpcError || new Error('Risk update was not applied');
      await fetchActivePositions();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Risk update failed');
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchActivePositions]);

  const loadPositionHistory = useCallback(async (): Promise<void> => {
    if (!user) {
      setPositionHistory([]);
      return;
    }
    try {
      const { data, error: fetchError } = await supabase.from('futures_position_history')
        .select('*').eq('user_id', user.id).order('close_time', { ascending: false });
      if (fetchError) throw fetchError;
      setPositionHistory((data || []).map((item) => ({
        id: item.id, symbol: item.symbol, side: item.side,
        entryPrice: numberValue(item.entry_price), exitPrice: numberValue(item.exit_price),
        amount: numberValue(item.amount), leverage: numberValue(item.leverage),
        margin: numberValue(item.margin), pnl: numberValue(item.pnl), roi: numberValue(item.roi),
        openTime: item.open_time, closeTime: item.close_time,
        durationSeconds: numberValue(item.duration_seconds),
        accumulatedSwapCost: numberValue(item.accumulated_swap_cost),
        totalSwapDays: numberValue(item.total_swap_days),
      })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load history');
    }
  }, [user]);

  const cancelOrder = useCallback(async (orderId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('cancel_futures_order', { p_order_id: orderId });
      if (rpcError || data !== true) throw rpcError || new Error('Order is no longer open');
      await fetchOpenOrders();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Order cancellation failed');
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchOpenOrders]);

  const cancelAllOpenOrders = useCallback(async (symbol?: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('cancel_all_futures_orders', {
        p_symbol: symbol || null,
      });
      if (rpcError) throw rpcError;
      await fetchOpenOrders();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Order cancellation failed');
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchOpenOrders]);

  return {
    openPosition, closePosition, updateStopLossTakeProfit, loadPositionHistory,
    fetchActivePositions, fetchOpenOrders, cancelAllOpenOrders, cancelOrder,
    positionHistory, activePositions, openOrders, loading, error,
    calculateLiquidationPrice,
  };
};
