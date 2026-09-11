import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useDatabase } from './useDatabase';
import { useAuth } from './useAuth';
import { calculateSpreadCost, calculateSpreadCostFromNotional, getSpreadForSymbol } from '../constants/spreadConfig';
import { useMarketData } from '../contexts/MarketDataContext';
import { calculateDerivativeNotionalUsd } from '../utils/derivativeCalculations';

export interface FuturesOrderParams {
  symbol: string;
  side: 'long' | 'short';
  amount: number;
  leverage: number;
  marginType: 'isolated' | 'cross';
  orderType: 'market' | 'limit';
  price: number; // Make price mandatory, it should always be provided by the caller (App.tsx)
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
  accumulatedSwapCost?: number;
  lastSwapChargeDate?: string | null;
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
  accumulatedSwapCost?: number;
  totalSwapDays?: number;
}

export const useFuturesTrading = () => {
  const { balances, updateBalances } = useDatabase();
  const { user } = useAuth();
  const { getPriceBySymbol: getCfdPrice } = useMarketData();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positionHistory, setPositionHistory] = useState<PositionHistoryEntry[]>([]);
  const [activePositions, setActivePositions] = useState<FuturesPosition[]>([]);
  const [openOrders, setOpenOrders] = useState<FuturesOrder[]>([]);

  // Calculate liquidation price
  const calculateLiquidationPrice = (
    side: 'long' | 'short',
    entryPrice: number,
    leverage: number,
    marginType: 'isolated' | 'cross' = 'isolated',
    amount: number = 0,
    totalBalance: number = 0
  ): number => {
    // For isolated margin, use the standard formula
    if (marginType === 'isolated') {
      const maintenanceMarginRatio = 0.05; // 5% maintenance margin
      const liquidationThreshold = (1 / leverage) * (1 - maintenanceMarginRatio);
      
      if (side === 'long') {
        return entryPrice * (1 - liquidationThreshold);
      } else {
        return entryPrice * (1 + liquidationThreshold);
      }
    } 
    // For cross margin, calculate based on total account balance
    else {
      // If amount is too small or balance is too large, use a more reasonable calculation
      if (amount <= 0.0001 || totalBalance <= 0 || amount * entryPrice * leverage < totalBalance * 0.01) {
        // Fall back to a more conservative liquidation price (similar to isolated but with more buffer)
        const maintenanceMarginRatio = 0.05;
        const liquidationThreshold = (1 / leverage) * (1 - maintenanceMarginRatio) * 0.9; // 90% of isolated threshold
        
        if (side === 'long') {
          return entryPrice * (1 - liquidationThreshold);
        } else {
          return entryPrice * (1 + liquidationThreshold);
        }
      }
      
      // For cross margin, liquidation happens when total account equity reaches zero
      let newLiquidationPrice;
      if (side === 'long') {
        // For long positions, price needs to drop enough to wipe out the entire account balance
        // Formula: liquidationPrice = entryPrice - (totalBalance / (amount * leverage))
        const priceDropNeeded = (totalBalance / (amount * leverage));
        newLiquidationPrice = entryPrice - priceDropNeeded;
        
        // Ensure liquidation price is not less than a small positive value
        // and not unrealistically far from entry price
        const minLiqPrice = Math.max(0.01, entryPrice * 0.1); // At least 10% of entry price
        return Math.max(minLiqPrice, newLiquidationPrice);
      } else {
        // For short positions, price needs to rise enough to wipe out the entire account balance
        // Formula: liquidationPrice = entryPrice + (totalBalance / (amount * leverage))
        const priceRiseNeeded = (totalBalance / (amount * leverage));
        newLiquidationPrice = entryPrice + priceRiseNeeded;
        
        // Cap extremely high liquidation prices to a reasonable multiple of entry price
        const maxLiqPrice = entryPrice * 10; // At most 10x entry price
        return Math.min(newLiquidationPrice, maxLiqPrice);
      }
    }
  };

  // Fetch active positions
  const fetchActivePositions = useCallback(async (): Promise<FuturesPosition[]> => {
    setLoading(true);
    setError(null);
    
    try {
      if (!user) {
        setActivePositions([]);
        return [];
      }
      
      const { data, error: orderError } = await supabase
        .from('futures_positions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_open', true)
        .order('created_at', { ascending: false });
        
      if (orderError) {
        throw orderError;
      }
      
      const formattedPositions: FuturesPosition[] = data.map(pos => ({
        id: pos.id,
        symbol: pos.symbol,
        side: pos.side,
        entryPrice: parseFloat(pos.entry_price) || 0,
        currentPrice: parseFloat(pos.current_price) || 0,
        amount: parseFloat(pos.amount) || 0,
        leverage: pos.leverage || 1,
        marginType: pos.margin_type,
        liquidationPrice: parseFloat(pos.liquidation_price) || 0,
        unrealizedPnl: parseFloat(pos.unrealized_pnl) || 0,
        margin: parseFloat(pos.margin) || 0,
        roi: parseFloat(pos.roi) || 0,
        stopLoss: pos.sl_price ? parseFloat(pos.sl_price) : undefined,
        takeProfit: pos.tp_price ? parseFloat(pos.tp_price) : undefined,
        createdAt: pos.created_at,
        accumulatedSwapCost: pos.accumulated_swap_cost ? parseFloat(pos.accumulated_swap_cost) : 0,
        lastSwapChargeDate: pos.last_swap_charge_date,
        swapAccruedAt: pos.swap_accrued_at || null
      }));
      
      setActivePositions(formattedPositions);
      return formattedPositions;
    } catch (err: any) {
      console.error('Error fetching active positions:', err);
      setError(err.message || 'Failed to fetch active positions');
      return [];
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch open orders
  const fetchOpenOrders = useCallback(async (): Promise<FuturesOrder[]> => {
    setLoading(true);
    setError(null);
    
    try {
      if (!user) {
        setOpenOrders([]);
        return [];
      }
      
      const { data, error: ordersError } = await supabase
        .from('futures_orders')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
        
      if (ordersError) {
        throw ordersError;
      }
      
      const formattedOrders: FuturesOrder[] = data.map(order => ({
        id: order.id,
        symbol: order.symbol,
        type: order.type,
        side: order.side,
        price: order.price,
        amount: parseFloat(order.amount),
        leverage: order.leverage,
        marginType: order.margin_type,
        status: order.status,
        createdAt: order.created_at,
        filledAt: order.filled_at,
        positionId: order.position_id,
        stopLoss: order.sl_price,
        takeProfit: order.tp_price
      }));
      
      setOpenOrders(formattedOrders);
      return formattedOrders;
    } catch (err: any) {
      console.error('Error fetching open orders:', err);
      setError(err.message || 'Failed to fetch open orders');
      return [];
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Open a futures position
  const openPosition = useCallback(async (params: FuturesOrderParams): Promise<string | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const { symbol, side, amount, leverage, marginType, orderType, price, stopLoss, takeProfit, contractSize = 1 } = params; // price is now mandatory
      
      // Calculate effective amount early so it's available in all code paths
      const effectiveAmount = amount * contractSize;
      
      // Get current user
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
      if (userError || !currentUser) {
        throw new Error('User not authenticated');
      }
      
      // Use the price parameter directly - it comes from the frontend with live data
      const entryPrice = price;
      console.log(`Using entry price from frontend: ${entryPrice} for ${symbol}`);
      
      // Check for existing position for this symbol
      const { data: existingPositions, error: existingError } = await supabase
        .from('futures_positions')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('symbol', symbol)
        .eq('is_open', true);
        
      if (existingError) {
        throw existingError;
      }
      
      const existingPosition = existingPositions && existingPositions.length > 0 ? existingPositions[0] : null;
      
      // For CFD trading, always create new positions (skip merging logic)
      const isCFDInstrument = !symbol.endsWith('USDT') && !symbol.endsWith('BTC') && !symbol.endsWith('ETH');
      
      if (isCFDInstrument) {
        console.log(`CFD instrument detected (${symbol}), creating new position without merging`);
        
        // Create new CFD position directly
        const positionSize = calculateDerivativeNotionalUsd(symbol, effectiveAmount, entryPrice, getCfdPrice);
        if (positionSize <= 0) throw new Error(`Unable to value ${symbol} in USD`);
        const requiredMargin = positionSize / leverage;

        // Calculate spread cost for this position
        const spreadConfig = getSpreadForSymbol(symbol);
        const spreadCost = calculateSpreadCostFromNotional(symbol, positionSize);
        const spreadPercentage = spreadConfig?.spreadPercentage || 0.0001;

        // Calculate liquidation price based on margin type
        const liquidationPrice = calculateLiquidationPrice(
          side,
          entryPrice,
          leverage,
          marginType,
          effectiveAmount,
          balances.usdt_balance
        );

        // Create the CFD position
        const { data: cfdPosition, error: cfdPositionError } = await supabase
          .from('futures_positions')
          .insert([{
            user_id: currentUser.id,
            symbol,
            side,
            entry_price: entryPrice,
            current_price: entryPrice,
            amount: effectiveAmount,
            leverage,
            margin_type: marginType,
            liquidation_price: liquidationPrice,
            unrealized_pnl: 0,
            margin: requiredMargin,
            roi: 0,
            is_open: true,
            position_size: positionSize,
            tp_price: takeProfit || null,
            sl_price: stopLoss || null,
            spread_cost: spreadCost,
            spread_percentage: spreadPercentage
          }])
          .select()
          .single();
          
        if (cfdPositionError) {
          throw cfdPositionError;
        }
        
        console.log(`Successfully created CFD position for ${symbol}:`, cfdPosition);
        
        // Refresh active positions
        await fetchActivePositions();
        
        return cfdPosition?.id || null;
      } else {
      // For limit orders, create a futures_orders entry instead of immediately opening a position
      if (orderType === 'limit') {
        const notionalValue = effectiveAmount * entryPrice;
        const requiredMargin = notionalValue / leverage;
        
        // Note: We no longer deduct margin from balance for limit orders
        // The margin will be reserved when the order is placed
        
        // Create a limit order
        const { data: order, error: orderError } = await supabase
          .from('futures_orders')
          .insert([{
            user_id: currentUser.id,
            symbol,
            type: orderType,
            side: side === 'long' ? 'buy' : 'sell', // Order side is buy/sell
            price,
            amount: effectiveAmount,
            leverage,
            margin_type: marginType,
            status: 'open',
            tp_price: takeProfit || null,
            sl_price: stopLoss || null,
            reserved_margin: requiredMargin
          }])
          .select()
          .single();
          
        if (orderError) {
          throw orderError;
        }
        
        // Refresh open orders
        await fetchOpenOrders();
        
        return order?.id || null;
      } else { // Market orders - handle position logic
        
        // If there's an existing position AND it's not a CFD instrument, handle merging/closing logic
        // Keep each market execution as its own position. The old client-side
        // netting path silently discarded PnL on partial closes.
        const shouldNetClientSide = false;
        if (shouldNetClientSide && existingPosition && !isCFDInstrument) {
          const existingSide = existingPosition.side;
          const existingAmount = parseFloat(existingPosition.amount);
          const existingEntryPrice = parseFloat(existingPosition.entry_price);
          const existingMargin = parseFloat(existingPosition.margin);
          
          if (existingSide === side) {
            // Same direction: Merge positions
            console.log(`Merging ${side} position for ${symbol}`);
            
            const newTotalAmount = existingAmount + effectiveAmount;
            const weightedAveragePrice = (existingAmount * existingEntryPrice + effectiveAmount * entryPrice) / newTotalAmount;
            
            // Calculate additional margin needed
            const newNotionalValue = newTotalAmount * weightedAveragePrice;
            const newTotalMargin = newNotionalValue / leverage;
            const additionalMargin = newTotalMargin - existingMargin;
            
            // Note: We no longer deduct additional margin from balance
            // The margin is tracked in the position but not deducted from total balance
            
            // Calculate new liquidation price
            const newLiquidationPrice = calculateLiquidationPrice(
              side,
              weightedAveragePrice,
              leverage,
              marginType,
              newTotalAmount,
              balances.usdt_balance
            );
            
            // Update existing position
            const { error: updateError } = await supabase
              .from('futures_positions')
              .update({
                amount: newTotalAmount,
                entry_price: weightedAveragePrice,
                current_price: entryPrice,
                margin: newTotalMargin,
                liquidation_price: newLiquidationPrice,
                unrealized_pnl: 0, // Reset PnL after merge
                roi: 0,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingPosition.id);
              
            if (updateError) {
              throw updateError;
            }
            
            // Refresh active positions
            await fetchActivePositions();
            
            return existingPosition.id;
            
          } else {
            // Opposite direction: Partial close, full close, or flip
            console.log(`Handling opposite direction trade for ${symbol}: existing ${existingSide}, new ${side}`);
            
            if (effectiveAmount < existingAmount) {
              // Partial close
              console.log(`Partial close: reducing ${existingSide} position`);
              
              const remainingAmount = existingAmount - effectiveAmount;
              const realizedPnl = existingSide === 'long' 
                ? (entryPrice - existingEntryPrice) * effectiveAmount * leverage
                : (existingEntryPrice - entryPrice) * effectiveAmount * leverage;
              
              // Calculate margin to return (proportional to closed amount)
              const marginToReturn = (effectiveAmount / existingAmount) * existingMargin;
              
              // Note: We no longer return margin to balance
              // The margin remains tracked in the position
              
              // Update position with remaining amount
              const { error: updateError } = await supabase
                .from('futures_positions')
                .update({
                  amount: remainingAmount,
                  current_price: entryPrice,
                  margin: existingMargin - marginToReturn,
                  unrealized_pnl: 0, // Reset unrealized PnL
                  roi: 0,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingPosition.id);
                
              if (updateError) {
                throw updateError;
              }
              
              // Add realized PnL transaction
              // Note: We no longer add transaction logs for margin operations
              // Only the final PnL is handled by the close_futures_position RPC function
              
              // Refresh active positions
              await fetchActivePositions();
              
              return existingPosition.id;
              
            } else if (effectiveAmount === existingAmount) {
              // Full close
              console.log(`Full close: closing ${existingSide} position completely`);
              
              const realizedPnl = existingSide === 'long'
                ? (entryPrice - existingEntryPrice) * existingAmount * leverage
                : (existingEntryPrice - entryPrice) * existingAmount * leverage;
              
              // Note: We no longer return margin to balance
              // The position will be closed and margin will no longer be "used"
              
              // Close the position by calling the close function
              const { error: closeError } = await supabase.rpc('close_futures_position', {
                position_id: existingPosition.id,
                exit_price: entryPrice
              });
              
              if (closeError) {
                throw closeError;
              }
              
              // Refresh active positions
              await fetchActivePositions();
              
              return existingPosition.id;
              
            } else {
              // Full close and flip
              console.log(`Full close and flip: closing ${existingSide} and opening ${side}`);
              
              const realizedPnl = existingSide === 'long'
                ? (entryPrice - existingEntryPrice) * existingAmount * leverage
                : (existingEntryPrice - entryPrice) * existingAmount * leverage;
              
              // Note: We no longer return margin to balance
              // The old position will be closed and new position will track its own margin
              
              // Close the existing position
              const { error: closeError } = await supabase.rpc('close_futures_position', {
                position_id: existingPosition.id,
                exit_price: entryPrice
              });
              
              if (closeError) {
                throw closeError;
              }
              
              // Calculate new position size (remaining after close)
              const newPositionAmount = effectiveAmount - existingAmount;
              const newPositionSize = newPositionAmount * entryPrice;
              const newRequiredMargin = newPositionSize / leverage;
              
              // Note: We no longer check balance for margin
              // The margin is tracked but not deducted from total balance
              
              // Calculate liquidation price for new position
              const newLiquidationPrice = calculateLiquidationPrice(
                side,
                entryPrice,
                leverage,
                marginType,
                newPositionAmount,
                balances.usdt_balance
              );
              
              // Note: We no longer deduct margin from balance
              
              // Calculate spread cost for new position
              const newSpreadConfig = getSpreadForSymbol(symbol);
              const newSpreadCost = calculateSpreadCost(symbol, entryPrice, newPositionAmount, 1);
              const newSpreadPercentage = newSpreadConfig?.spreadPercentage || 0.0001;

              // Create new position in opposite direction
              const { data: newPosition, error: newPositionError } = await supabase
                .from('futures_positions')
                .insert([{
                  user_id: currentUser.id,
                  symbol,
                  side,
                  entry_price: entryPrice,
                  current_price: entryPrice,
                  amount: newPositionAmount,
                  leverage,
                  margin_type: marginType,
                  liquidation_price: newLiquidationPrice,
                  unrealized_pnl: 0,
                  margin: newRequiredMargin,
                  roi: 0,
                  is_open: true,
                  position_size: newPositionSize,
                  tp_price: takeProfit || null,
                  sl_price: stopLoss || null,
                  spread_cost: newSpreadCost,
                  spread_percentage: newSpreadPercentage
                }])
                .select()
                .single();
                
              if (newPositionError) {
                throw newPositionError;
              }
              
              // Refresh active positions
              await fetchActivePositions();
              
              return newPosition?.id || null;
            }
          }
        }
      }
        
        // Check for recent similar positions to prevent duplicates
        const tenSecondsAgo = new Date();
        tenSecondsAgo.setSeconds(tenSecondsAgo.getSeconds() - 10);
        
        const { data: recentPositions, error: recentError } = await supabase
          .from('futures_positions')
          .select('id, created_at')
          .eq('user_id', currentUser.id)
          .eq('symbol', symbol)
          .eq('side', side)
          .eq('is_open', true)
          .gt('created_at', tenSecondsAgo.toISOString())
          .order('created_at', { ascending: false });
          
        if (recentError) {
          console.warn('Error checking for recent positions:', recentError);
          // Continue anyway, as this is just a duplicate prevention check
        }
        
        // If a recent similar position exists, return its ID instead of creating a new one
        if (recentPositions && recentPositions.length > 0) {
          console.log('Found recent similar position, preventing duplicate:', recentPositions[0]);
          
          // Refresh active positions to ensure UI is up to date
          await fetchActivePositions();
          
          return recentPositions[0].id;
        }
        
        const positionSize = effectiveAmount * entryPrice;
        const requiredMargin = positionSize / leverage;

        // Calculate spread cost for this position
        const spreadConfig = getSpreadForSymbol(symbol);
        const spreadCost = calculateSpreadCost(symbol, entryPrice, effectiveAmount, 1);
        const spreadPercentage = spreadConfig?.spreadPercentage || 0.0001;

        // Note: We no longer check balance for margin
        // The margin is tracked but not deducted from total balance

        // Calculate liquidation price based on margin type
        const liquidationPrice = calculateLiquidationPrice(
          side,
          entryPrice,
          leverage,
          marginType,
          effectiveAmount,
          balances.usdt_balance
        );

        // Note: We no longer deduct margin from balance

        // Create the position
        const { data: position, error: positionError } = await supabase
          .from('futures_positions')
          .insert([{
            user_id: currentUser.id,
            symbol,
            side,
            entry_price: entryPrice,
            current_price: entryPrice,
            amount: effectiveAmount,
            leverage,
            margin_type: marginType,
            liquidation_price: liquidationPrice,
            unrealized_pnl: 0,
            margin: requiredMargin,
            roi: 0,
            is_open: true,
            position_size: positionSize,
            tp_price: takeProfit || null,
            sl_price: stopLoss || null,
            spread_cost: spreadCost,
            spread_percentage: spreadPercentage
          }])
          .select()
          .single();
          
        if (positionError) {
          throw positionError;
        }
        
        // Refresh active positions
        await fetchActivePositions();
        
        return position?.id || null;
      }
    } catch (err: any) {
      console.error('Error opening futures position:', err);
      setError(err.message || 'Failed to open position');
      return null;
    } finally {
      setLoading(false);
    }
  }, [balances, updateBalances, calculateLiquidationPrice, fetchActivePositions, fetchOpenOrders, getCfdPrice]);

  // Close a futures position
  // liveExitPrice: optional live price from WebSocket to use instead of database price
  const closePosition = useCallback(async (positionId: string, liveExitPrice?: number): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      // Get position details first
      const { data: position } = await supabase
        .from('futures_positions')
        .select('symbol, current_price')
        .eq('id', positionId)
        .single();

      if (!position) {
        throw new Error('Position not found');
      }

      // Use live price if provided, otherwise fall back to database price
      let exitPrice: number;
      if (liveExitPrice && liveExitPrice > 0) {
        exitPrice = liveExitPrice;
        console.log(`Using live WebSocket price for ${position.symbol}: ${exitPrice}`);
      } else {
        exitPrice = parseFloat(position.current_price) || 0;
        console.log(`Using database price for ${position.symbol}: ${exitPrice} (no live price provided)`);
      }

      if (exitPrice <= 0) {
        throw new Error(`Invalid exit price for ${position.symbol}: ${exitPrice}`);
      }

      // Position prices are NUMERIC(20,8); keep FX and low-price crypto precision.
      const clampedExitPrice = Math.max(
        0.00000001,
        Math.min(Number.MAX_SAFE_INTEGER, Math.round(exitPrice * 1e8) / 1e8)
      );

      console.log(`Closing position ${positionId} for ${position.symbol} at price ${clampedExitPrice}`);

      // Call the close_futures_position function
      const { error: rpcError } = await supabase.rpc('close_futures_position', {
        position_id: positionId,
        exit_price: clampedExitPrice
      });

      if (rpcError) {
        throw rpcError;
      }

      // Refresh active positions
      await fetchActivePositions();

      // Note: The close_futures_position RPC function handles:
      // 1. Calculating final PnL
      // 2. Returning margin + PnL to user's balance
      // 3. Moving position to history
      // 4. Updating position status
      // The parent component should call fetchBalances() to refresh the UI balance

      return true;
    } catch (err: any) {
      console.error('Error closing futures position:', err);
      setError(err.message || 'Failed to close position');
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchActivePositions]);

  // Update a position's entry price (for manual adjustments)
  const updateEntryPrice = useCallback(async (positionId: string, newEntryPrice: number): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      const { error: rpcError } = await supabase.rpc('update_position_entry_price', {
        position_id: positionId,
        new_entry_price: newEntryPrice
      });
        
      if (rpcError) {
        throw rpcError;
      }
      
      // Refresh active positions
      await fetchActivePositions();
      
      return true;
    } catch (err: any) {
      console.error('Error updating entry price:', err);
      setError(err.message || 'Failed to update entry price');
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchActivePositions]);

  // Update stop loss or take profit
  const updateStopLossTakeProfit = useCallback(async (
    positionId: string, 
    updates: { stopLoss?: number; takeProfit?: number }
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      const updateData: any = {};
      
      if (updates.stopLoss !== undefined) {
        updateData.sl_price = updates.stopLoss;
      }
      
      if (updates.takeProfit !== undefined) {
        updateData.tp_price = updates.takeProfit;
      }
      
      const { error: updateError } = await supabase
        .from('futures_positions')
        .update(updateData)
        .eq('id', positionId);
        
      if (updateError) {
        throw updateError;
      }
      
      // Refresh active positions
      await fetchActivePositions();
      
      return true;
    } catch (err: any) {
      console.error('Error updating SL/TP:', err);
      setError(err.message || 'Failed to update stop loss/take profit');
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchActivePositions]);

  // Load position history
  const loadPositionHistory = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await supabase
        .from('futures_position_history')
        .select('*')
        .order('close_time', { ascending: false });
        
      if (fetchError) {
        throw fetchError;
      }
      
      if (data) {
        setPositionHistory(data.map(item => ({
          id: item.id,
          symbol: item.symbol,
          side: item.side,
          entryPrice: parseFloat(item.entry_price),
          exitPrice: parseFloat(item.exit_price),
          amount: parseFloat(item.amount),
          leverage: item.leverage,
          margin: parseFloat(item.margin),
          pnl: parseFloat(item.pnl),
          roi: parseFloat(item.roi),
          openTime: item.open_time,
          closeTime: item.close_time,
          durationSeconds: item.duration_seconds,
          accumulatedSwapCost: item.accumulated_swap_cost ? parseFloat(item.accumulated_swap_cost) : 0,
          totalSwapDays: item.total_swap_days || 0
        })));
      }
    } catch (err: any) {
      console.error('Error loading position history:', err);
      setError(err.message || 'Failed to load position history');
    } finally {
      setLoading(false);
    }
  }, []);

  // Cancel all open orders
  const cancelAllOpenOrders = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      // Get current user
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
      if (userError || !currentUser) {
        throw new Error('User not authenticated');
      }
      
      // Get all open orders for the user
      const { data: openOrders, error: ordersError } = await supabase
        .from('futures_orders')
        .select('*')
        .eq('status', 'open')
        .eq('user_id', currentUser.id);
        
      if (ordersError) {
        throw ordersError;
      }
      
      if (!openOrders || openOrders.length === 0) {
        return true; // No orders to cancel
      }
      
      // Note: We no longer refund margin to balance
      // The reserved margin will simply be released when orders are cancelled
      
      // Update all orders to cancelled status
      const { error: updateError } = await supabase
        .from('futures_orders')
        .update({ status: 'cancelled' })
        .eq('status', 'open')
        .eq('user_id', currentUser.id);
        
      if (updateError) {
        throw updateError;
      }
      
      // Note: We no longer refund margin to balance
      
      // Refresh open orders
      await fetchOpenOrders();
      
      return true;
    } catch (err: any) {
      console.error('Error cancelling open orders:', err);
      setError(err.message || 'Failed to cancel open orders');
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchOpenOrders]);

  // Cancel a specific order
  const cancelOrder = useCallback(async (orderId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      // Get the order details
      const { data: order, error: orderError } = await supabase
        .from('futures_orders')
        .select('*')
        .eq('id', orderId)
        .single();
        
      if (orderError) {
        throw orderError;
      }
      
      // Note: We no longer refund margin to balance
      // The reserved margin will simply be released when the order is cancelled
      
      // Update order status to cancelled
      const { error: updateError } = await supabase
        .from('futures_orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId);
        
      if (updateError) {
        throw updateError;
      }
      
      // Note: We no longer refund margin to balance
      
      // Refresh open orders
      await fetchOpenOrders();
      
      return true;
    } catch (err: any) {
      console.error('Error cancelling order:', err);
      setError(err.message || 'Failed to cancel order');
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchOpenOrders]);

  return {
    openPosition,
    closePosition,
    updateEntryPrice,
    updateStopLossTakeProfit,
    loadPositionHistory,
    fetchActivePositions,
    fetchOpenOrders,
    cancelAllOpenOrders,
    cancelOrder,
    positionHistory,
    activePositions,
    openOrders,
    loading,
    error,
    calculateLiquidationPrice
  };
};
