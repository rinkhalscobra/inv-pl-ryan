import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './useAuth';

export interface PropOrderParams {
  challengeId: string;
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  leverage: number;
  marginType: 'isolated' | 'cross';
  orderType: 'market' | 'limit' | 'stop';
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface PropPosition {
  id: string;
  challengeId: string;
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
}

export interface PropPositionHistoryEntry {
  id: string;
  challengeId: string;
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
}

export interface PropChallengeAccount {
  id: string;
  challengeId: string;
  startingBalance: number;
  currentBalance: number;
  maxBalance: number;
  maxDrawdown: number;
  maxDrawdownReached: number;
  targetProfit: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'completed' | 'failed';
}

export const usePropFirmTrading = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [propPositions, setPropPositions] = useState<PropPosition[]>([]);
  const [propOrders, setPropOrders] = useState<any[]>([]);
  const [propPositionHistory, setPropPositionHistory] = useState<PropPositionHistoryEntry[]>([]);
  const [propChallengeAccount, setPropChallengeAccount] = useState<PropChallengeAccount | null>(null);

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

  // Fetch prop positions for a specific challenge
  const fetchPropPositions = useCallback(async (challengeId: string) => {
    if (!user) return [];
    
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Fetching prop positions for challenge ${challengeId}...`);
      
      const { data, error: positionError } = await supabase
        .from('prop_positions')
        .select('*')
        .eq('user_id', user.id)
        .eq('challenge_id', challengeId)
        .eq('is_open', true)
        .order('created_at', { ascending: false });
        
      if (positionError) {
        throw positionError;
      }
      
      console.log(`Found ${data?.length || 0} prop positions for challenge ${challengeId}`);
      
      const formattedPositions: PropPosition[] = data.map(pos => ({
        id: pos.id,
        challengeId: pos.challenge_id,
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
        createdAt: pos.created_at
      }));
      
      setPropPositions(formattedPositions);
      return formattedPositions;
    } catch (err: any) {
      console.error('Error fetching prop positions:', err);
      setError(err.message || 'Failed to fetch prop positions');
      return [];
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch prop orders for a specific challenge
  const fetchPropOrders = useCallback(async (challengeId: string) => {
    if (!user) return [];
    
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Fetching prop orders for challenge ${challengeId}...`);
      
      const { data, error: ordersError } = await supabase
        .from('prop_orders')
        .select('*')
        .eq('user_id', user.id)
        .eq('challenge_id', challengeId)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
        
      if (ordersError) {
        throw ordersError;
      }
      
      console.log(`Found ${data?.length || 0} open prop orders for challenge ${challengeId}`);
      
      setPropOrders(data);
      return data;
    } catch (err: any) {
      console.error('Error fetching prop orders:', err);
      setError(err.message || 'Failed to fetch prop orders');
      return [];
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch prop position history for a specific challenge
  const fetchPropPositionHistory = useCallback(async (challengeId: string) => {
    if (!user) return [];
    
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Fetching prop position history for challenge ${challengeId}...`);
      
      const { data, error: historyError } = await supabase
        .from('prop_position_history')
        .select('*')
        .eq('user_id', user.id)
        .eq('challenge_id', challengeId)
        .order('close_time', { ascending: false });
        
      if (historyError) {
        throw historyError;
      }
      
      console.log(`Found ${data?.length || 0} prop position history entries for challenge ${challengeId}`);
      
      const formattedHistory: PropPositionHistoryEntry[] = data.map(pos => ({
        id: pos.id,
        challengeId: pos.challenge_id,
        symbol: pos.symbol,
        side: pos.side,
        entryPrice: parseFloat(pos.entry_price),
        exitPrice: parseFloat(pos.exit_price),
        amount: parseFloat(pos.amount),
        leverage: pos.leverage,
        margin: parseFloat(pos.margin),
        pnl: parseFloat(pos.pnl),
        roi: parseFloat(pos.roi),
        openTime: pos.open_time,
        closeTime: pos.close_time,
        durationSeconds: pos.duration_seconds
      }));
      
      setPropPositionHistory(formattedHistory);
      return formattedHistory;
    } catch (err: any) {
      console.error('Error fetching prop position history:', err);
      setError(err.message || 'Failed to fetch prop position history');
      return [];
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch prop challenge account for a specific challenge
  const fetchPropChallengeAccount = useCallback(async (challengeId: string) => {
    if (!user) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Fetching prop challenge account for challenge ${challengeId}...`, user.id);
      
      // First try to get from prop_account_balances
      let data;
      let accountError;
      
      try {
        const result = await supabase
          .from('prop_account_balances')
          .select('*')
          .eq('user_id', user.id)
          .eq('challenge_id', challengeId)
          .eq('status', 'active')
          .maybeSingle();
          
        data = result.data;
        accountError = result.error;
      } catch (err) {
        console.error('Error fetching from prop_account_balances:', err);
        accountError = err;
      }
        
      if (accountError) {
        console.warn(`Error fetching from prop_account_balances: ${accountError.message}`);
        // Don't throw, try the robot_states table instead
      }
      
      if (!data) {
        // Try a more general query without the challenge_id to see if any active challenges exist
        try {
          const { data: robotState, error: robotStateError } = await supabase
            .from('robot_states')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();
          
          if (robotStateError) {
            console.error(`Error checking robot state:`, robotStateError);
          } else if (robotState && robotState.active_challenge_id) {
            console.log(`Found active challenge in robot state: ${robotState.active_challenge_id}`);
            
            // Create a synthetic account from robot state data
            data = {
              id: `synthetic-${robotState.id}`,
              challengeId: robotState.active_challenge_id,
              startingBalance: robotState.challenge_initial_balance || 0,
              currentBalance: robotState.challenge_account_balance || 0,
              maxBalance: robotState.challenge_account_balance || 0, // Use current as max if not available
              maxDrawdown: robotState.challenge_max_drawdown || 0,
              maxDrawdownReached: 0,
              targetProfit: robotState.challenge_profit_target || 0,
              startDate: robotState.challenge_start_date || new Date().toISOString(),
              endDate: null,
              status: robotState.challenge_status || 'active'
            };
          }
        } catch (robotError) {
          console.error('Error fetching from robot_states:', robotError);
        }
        
        if (!data) {
          console.log(`No active challenges found for user ${user.id}`);
          setPropChallengeAccount(null);
          return null;
        }
      }
          
      const formattedAccount: PropChallengeAccount = {
        id: data.id,
        challengeId: data.challenge_id || data.challengeId,
        startingBalance: parseFloat(data.starting_balance || data.startingBalance || 0),
        currentBalance: parseFloat(data.current_balance || data.currentBalance || 0),
        maxBalance: parseFloat(data.max_balance || data.maxBalance || 0),
        maxDrawdown: parseFloat(data.max_drawdown || data.maxDrawdown || 0),
        maxDrawdownReached: parseFloat(data.max_drawdown_reached || data.maxDrawdownReached || 0),
        targetProfit: parseFloat(data.target_profit || data.targetProfit || 0),
        startDate: data.start_date || data.startDate || new Date().toISOString(),
        endDate: data.end_date || data.endDate || null,
        status: data.status || 'active'
      };
      
      console.log(`Found prop challenge account:`, formattedAccount);
      setPropChallengeAccount(formattedAccount);
      return formattedAccount;
    } catch (err: any) {
      console.error('Error fetching prop challenge account:', err);
      setError(err.message || 'Failed to fetch prop challenge account');
      setPropChallengeAccount(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initialize a new prop challenge
  const initializeChallenge = useCallback(async (challengeId: string) => {
    if (!user) {
      setError('User not authenticated');
      return false;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Initializing prop challenge ${challengeId}...`);
      
      // Challenge pricing and account parameters are resolved server-side and
      // committed together with the entry fee in one database transaction.
      const { data, error: rpcError } = await supabase.rpc('start_prop_challenge', {
        p_challenge_id: challengeId
      });
      
      if (rpcError) {
        throw rpcError;
      }
      
      console.log(`Successfully initialized challenge ${challengeId}`);
      
      // Fetch the updated challenge account
      await fetchPropChallengeAccount(challengeId);
      
      return true;
    } catch (err: any) {
      console.error('Error initializing prop challenge:', err);
      setError(err.message || 'Failed to initialize prop challenge');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user, fetchPropChallengeAccount]);

  // Place a prop order
  const placePropOrder = useCallback(async (params: PropOrderParams) => {
    if (!user) {
      setError('User not authenticated');
      return false;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('placePropOrder called with params:', params);
      console.log('orderType:', params.orderType);
      console.log('challengeId:', params.challengeId);
      
      // For market orders, directly create a position instead of an order
      if (params.orderType === 'market') {
        console.log('Market order detected, creating position directly');
        
        // Get current price for the symbol
        let currentPrice;
        try {
          const { data: marketData, error: marketError } = await supabase
            .from('market_data')
            .select('price')
            .eq('symbol', params.symbol)
            .order('timestamp', { ascending: false })
            .limit(1)
            .maybeSingle();
            
          if (marketError || !marketData) {
            console.error('Error fetching current price:', marketError);
            // Use a fallback price if market data is not available
            currentPrice = 65000; // Default BTC price as fallback
            console.log(`Using fallback price: ${currentPrice}`);
          } else {
            currentPrice = marketData.price;
            console.log(`Current price for ${params.symbol}: ${currentPrice}`);
          }
        } catch (priceError) {
          console.error('Exception fetching price:', priceError);
          currentPrice = 65000; // Default BTC price as fallback
          console.log(`Using fallback price after error: ${currentPrice}`);
        }
        
        // Get account balance from robot state
        const { data: robotState, error: robotStateError } = await supabase
          .from('robot_states')
          .select('challenge_account_balance')
          .eq('user_id', user.id)
          .maybeSingle();
          
        if (robotStateError || !robotState) {
          console.error('Error fetching robot state:', robotStateError);
          throw new Error('Could not retrieve challenge account balance');
        }
        
        const accountBalance = robotState.challenge_account_balance || 0;
        console.log(`Using challenge balance from robot state: ${accountBalance}`);
        
        // Calculate position details
        const notionalValue = params.amount * currentPrice;
        const margin = notionalValue / params.leverage;
        
        // Note: We no longer check balance for margin in prop firm
        // The margin is tracked but not deducted from challenge balance
        
        // Convert buy/sell to long/short
        const side = params.side === 'buy' ? 'long' : 'short';
        
        // Calculate liquidation price
        const liquidationPrice = calculateLiquidationPrice(
          side,
          currentPrice,
          params.leverage,
          params.marginType,
          params.amount,
          accountBalance
        );
        
        console.log(`Creating position with side: ${side}, entry price: ${currentPrice}, liquidation price: ${liquidationPrice}`);
        
        // Insert position directly into prop_positions table
        const { data: positionData, error: positionError } = await supabase
          .from('prop_positions')
          .insert([{
            user_id: user.id,
            challenge_id: params.challengeId,
            symbol: params.symbol,
            side: side,
            entry_price: currentPrice,
            current_price: currentPrice,
            amount: params.amount,
            leverage: params.leverage,
            margin_type: params.marginType,
            liquidation_price: liquidationPrice,
            margin: margin,
            unrealized_pnl: 0,
            roi: 0,
            sl_price: params.stopLoss || null,
            tp_price: params.takeProfit || null,
            is_open: true
          }])
          .select();
        
        if (positionError) {
          console.error('Error creating prop position:', positionError);
          throw positionError;
        }
        
        // Note: We no longer deduct margin from challenge balance
        // The margin is tracked in the position but not deducted
        
        console.log('Position created successfully:', positionData);
        
        // Refresh positions and account data
        await fetchPropPositions(params.challengeId);
        await fetchPropChallengeAccount(params.challengeId);
        
        return true;
      }
      
      // For limit and stop orders, continue with the existing flow
      // Calculate required margin for the order
      const notionalValue = params.amount * (params.price || 0);
      const requiredMargin = notionalValue / params.leverage;
      
      // Insert the order into the prop_orders table
      const { data, error } = await supabase
        .from('prop_orders')
        .insert([{
          user_id: user.id,
          challenge_id: params.challengeId,
          symbol: params.symbol,
          type: params.orderType,
          side: params.side,
          price: params.price,
          amount: params.amount,
          leverage: params.leverage,
          margin_type: params.marginType,
          tp_price: params.takeProfit,
          sl_price: params.stopLoss,
          reserved_margin: requiredMargin
        }])
        .select();
        
      if (error) {
        console.error('Error inserting prop order:', error);
        throw error;
      }
      
      console.log('Prop order inserted successfully:', data);
      
      // If it's a market order, trigger immediate processing
      if (data && data.length > 0) {
        // For limit orders, try to process the specific order
        try {
          await triggerImmediateOrderProcessing(data[0].id);
        } catch (processingError) {
          console.warn('Error triggering immediate order processing:', processingError);
        }
      }
      
      return true;
    } catch (err: any) {
      console.error('Error in placePropOrder:', err);
      setError(err.message || 'Failed to place prop order');
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, fetchPropPositions, fetchPropOrders, fetchPropChallengeAccount]);

  // Close a prop position
  // liveExitPrice: optional live price from WebSocket to use instead of database price
  const closePropPosition = useCallback(async (positionId: string, challengeId: string, liveExitPrice?: number) => {
    if (!user) {
      setError('User not authenticated');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      console.log(`Closing prop position ${positionId} for challenge ${challengeId}...`);

      // Get the current price for the position's symbol
      const { data: positionData, error: positionError } = await supabase
        .from('prop_positions')
        .select('symbol, current_price')
        .eq('id', positionId)
        .single();

      if (positionError) {
        console.error('Error fetching position data:', positionError);
        throw positionError;
      }

      if (!positionData) {
        throw new Error('Position not found');
      }

      console.log(`Position data for ${positionId}:`, positionData);

      // Use live price if provided, otherwise fall back to database price
      let exitPrice: number;
      if (liveExitPrice && liveExitPrice > 0) {
        exitPrice = liveExitPrice;
        console.log(`Using live WebSocket price for ${positionData.symbol}: ${exitPrice}`);
      } else {
        exitPrice = parseFloat(positionData.current_price) || 0;
        console.log(`Using database price for ${positionData.symbol}: ${exitPrice} (no live price provided)`);
      }

      const { data: rpcResult, error } = await supabase.rpc('close_prop_position', {
        position_id: positionId,
        exit_price: exitPrice
      });

      if (error) {
        console.error('Error closing prop position:', error);
        throw error;
      }

      if (rpcResult === false) {
        throw new Error('Database function failed to close position');
      }

      console.log(`Successfully closed position ${positionId}`);

      // Refresh positions, history, and account balance
      await fetchPropPositions(challengeId);
      await fetchPropPositionHistory(challengeId);
      await fetchPropChallengeAccount(challengeId);

      return true;
    } catch (err: any) {
      console.error('Error closing prop position:', err);
      setError(err.message || 'Failed to close prop position');
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, fetchPropPositions, fetchPropPositionHistory, fetchPropChallengeAccount]);

  // Cancel a prop order
  const cancelPropOrder = useCallback(async (orderId: string, challengeId: string) => {
    if (!user) {
      setError('User not authenticated');
      return false;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Cancelling prop order ${orderId} for challenge ${challengeId}...`);
      
      // Update the order status to cancelled
      const { error } = await supabase
        .from('prop_orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId)
        .eq('user_id', user.id);
        
      if (error) {
        console.error('Error cancelling prop order:', error);
        throw error;
      }
      
      console.log(`Successfully cancelled order ${orderId}`);
      
      // Refresh orders
      await fetchPropOrders(challengeId);
      
      return true;
    } catch (err: any) {
      console.error('Error canceling prop order:', err);
      setError(err.message || 'Failed to cancel prop order');
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, fetchPropOrders]);

  // Cancel all prop orders for a challenge
  const cancelAllPropOrders = useCallback(async (challengeId: string) => {
    if (!user) {
      setError('User not authenticated');
      return false;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Cancelling all prop orders for challenge ${challengeId}...`);
      
      // Update all open orders to cancelled
      const { error } = await supabase
        .from('prop_orders')
        .update({ status: 'cancelled' })
        .eq('user_id', user.id)
        .eq('challenge_id', challengeId)
        .eq('status', 'open');
        
      if (error) {
        console.error('Error cancelling all prop orders:', error);
        throw error;
      }
      
      console.log(`Successfully cancelled all orders for challenge ${challengeId}`);
      
      // Note: We no longer refund margin to balance
      // The reserved margin will simply be released when orders are cancelled
      
      // Refresh orders
      await fetchPropOrders(challengeId);
      
      return true;
    } catch (err: any) {
      console.error('Error canceling all prop orders:', err);
      setError(err.message || 'Failed to cancel all prop orders');
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, fetchPropOrders]);

  // Close all prop positions for a challenge
  const closeAllPropPositions = useCallback(async (challengeId: string) => {
    if (!user) {
      setError('User not authenticated');
      return false;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Closing all prop positions for challenge ${challengeId}...`);
      
      // Get all open positions
      const { data: positions, error: positionsError } = await supabase
        .from('prop_positions')
        .select('id, current_price')
        .eq('user_id', user.id)
        .eq('challenge_id', challengeId)
        .eq('is_open', true);
        
      if (positionsError) {
        console.error('Error fetching open positions:', positionsError);
        throw positionsError;
      }
      
      console.log(`Found ${positions?.length || 0} open positions to close`);
      // Note: We no longer refund margin to balance
      // The reserved margin will simply be released when the order is cancelled
      
      
      // Close each position
      for (const position of positions) {
        console.log(`Closing position ${position.id} at price ${position.current_price}`);
        
        const { error } = await supabase.rpc('close_prop_position', {
          position_id: position.id,
          exit_price: position.current_price
        });
        
        if (error) {
          console.error(`Error closing position ${position.id}:`, error);
          // Continue with other positions even if one fails
        } else {
          console.log(`Successfully closed position ${position.id}`);
        }
      }
      
      // Refresh positions, history, and account balance
      await fetchPropPositions(challengeId);
      await fetchPropPositionHistory(challengeId);
      await fetchPropChallengeAccount(challengeId);
      
      return true;
    } catch (err: any) {
      console.error('Error closing all prop positions:', err);
      setError(err.message || 'Failed to close all prop positions');
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, fetchPropPositions, fetchPropPositionHistory, fetchPropChallengeAccount]);

  // Cancel a prop challenge
  const cancelChallenge = useCallback(async (challengeId: string) => {
    if (!user) {
      setError('User not authenticated');
      return false;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Cancelling prop challenge ${challengeId} - STARTING CANCELLATION PROCESS`);
      
      // First, get the robot state to check if there's an active challenge
      const { data: robotState, error: robotStateError } = await supabase
        .from('robot_states')
        .select('*')
        .eq('user_id', user.id)
        .single();
        
      if (robotStateError) {
        throw robotStateError;
      }
      
      if (!robotState || robotState.active_challenge_id !== challengeId) {
        throw new Error(`No active challenge found with ID ${challengeId}`);
      }
      
      console.log(`Found active challenge ${challengeId} - Current state:`, {
        active_challenge_id: robotState.active_challenge_id,
        challenge_account_balance: robotState.challenge_account_balance,
        challenge_initial_balance: robotState.challenge_initial_balance,
        challenge_status: robotState.challenge_status
      });
      
      // IMPORTANT: We need to prevent any balance transfer when cancelling a challenge
      // Step 1: Add a special log entry to indicate this is a user-initiated cancellation with NO BALANCE TRANSFER
      await supabase
        .from('prop_logs')
        .insert({
          user_id: user.id,
          challenge_id: challengeId,
          action: 'challenge_cancellation_requested',
          details: {
            requested_at: new Date().toISOString(),
            prevent_balance_transfer: true,
            current_balance: robotState.challenge_account_balance
          }
        });
      
      console.log(`Step 1: Added special log entry to prevent balance transfer`);
      
      // Step 2: Close all positions for this challenge
      console.log(`Step 2: Closing all positions for challenge ${challengeId}`);
      await closeAllPropPositions(challengeId);
      
      // Step 3: Cancel all orders for this challenge
      console.log(`Step 3: Cancelling all orders for challenge ${challengeId}`);
      await cancelAllPropOrders(challengeId);
      
      console.log(`Step 4: All positions closed and orders cancelled for challenge ${challengeId}`);
      
      // Call the Edge Function to handle position history deletion and challenge cancellation
      console.log(`Step 4.5: Calling cancel-challenge-without-transfer Edge Function to delete ALL position history and cancel challenge`);
      
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase environment variables not configured');
      }
      
      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/cancel-challenge-without-transfer`;
      
      console.log(`Calling Edge Function: ${edgeFunctionUrl}`);
      console.log(`Payload: user_id=${user.id}, challenge_id=${challengeId}`);
      
      const edgeFunctionResponse = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          user_id: user.id,
          challenge_id: challengeId
        })
      });
      
      if (!edgeFunctionResponse.ok) {
        const errorText = await edgeFunctionResponse.text();
        console.error('Edge Function call failed:', errorText);
        throw new Error(`Edge Function failed: ${errorText}`);
      }
      
      const edgeFunctionResult = await edgeFunctionResponse.json();
      console.log('Edge Function response:', edgeFunctionResult);
      
      if (!edgeFunctionResult.success) {
        throw new Error(`Edge Function error: ${edgeFunctionResult.error}`);
      }
      
      console.log(`Step 5: Edge Function completed successfully`);
      console.log(`Position history deletion status: ${edgeFunctionResult.position_history_deleted ? 'SUCCESS' : 'FAILED'}`);
      console.log(`Remaining history count: ${edgeFunctionResult.remaining_history_count || 0}`);
      
      console.log(`Step 6: Challenge cancellation and history deletion completed successfully`);
      
      // Clear the challenge account
      setPropChallengeAccount(null);
      setPropPositionHistory([]);
      
      return true;
    } catch (err: any) {
      console.error('Error canceling prop challenge:', err);
      setError(err.message || 'Failed to cancel prop challenge');
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, closeAllPropPositions, cancelAllPropOrders]);

  // Trigger manual processing of all prop orders
  const triggerPropOrderProcessing = useCallback(async () => {
    try {
      console.log('Manually triggering prop order processing');
      
      // First try the Edge Function
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase environment variables not configured');
      }
      
      // Create AbortController with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        const supabaseFunctionsUrl = `${supabaseUrl}/functions/v1/process-prop-orders`;
        
        const response = await fetch(supabaseFunctionsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.warn(`Failed to process prop orders via Edge Function: ${response.status} - ${errorText}`);
          throw new Error(`Failed to process prop orders: ${errorText}`);
        }

        const result = await response.json();
        console.log('Prop order processing result:', result);
        return result;
      } catch (edgeFunctionError) {
        clearTimeout(timeoutId);
        
        // If Edge Function fails, fall back to direct RPC call
        console.warn('Edge Function failed, falling back to RPC call:', edgeFunctionError);
        
        const { error: rpcError } = await supabase.rpc('run_prop_background_processes');
        
        if (rpcError) {
          console.error('Error running prop background processes via RPC:', rpcError);
          throw rpcError;
        }
        
        console.log('Prop background processes executed successfully via RPC');
        return { success: true, message: 'Executed via RPC fallback' };
      }
    } catch (error) {
      console.error('Error triggering prop order processing:', error);
      throw error;
    }
  }, []);

  // Trigger immediate processing of a specific order
  const triggerImmediateOrderProcessing = useCallback(async (orderId: string) => {
    try {
      console.log('Triggering immediate processing for order:', orderId);
      
      // First try the Edge Function
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase environment variables not configured');
      }
      
      // Create AbortController with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        const supabaseFunctionsUrl = `${supabaseUrl}/functions/v1/check-specific-order`;
        
        const response = await fetch(supabaseFunctionsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({ order_id: orderId }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.warn(`Failed to process order ${orderId} via Edge Function: ${response.status} - ${errorText}`);
          throw new Error(`Failed to process order: ${errorText}`);
        }

        const result = await response.json();
        console.log('Order processing result:', result);
        return result.executed || false;
      } catch (edgeFunctionError) {
        clearTimeout(timeoutId);
        
        // If Edge Function fails, fall back to direct RPC call
        console.warn('Edge Function failed, falling back to RPC call:', edgeFunctionError);
        
        const { error: rpcError } = await supabase.rpc('check_and_execute_prop_order', { order_id: orderId });
        
        if (rpcError) {
          console.error('Error processing specific order via RPC:', rpcError);
          throw rpcError;
        }
        
        console.log('Order processed successfully via RPC fallback');
        return true;
      }
    } catch (error) {
      console.error('Error triggering immediate order processing:', error);
      return false;
    }
  }, []);

  return {
    propPositions,
    propOrders,
    propPositionHistory,
    propChallengeAccount,
    loading,
    error,
    fetchPropPositions,
    fetchPropOrders,
    fetchPropPositionHistory,
    fetchPropChallengeAccount,
    initializeChallenge,
    cancelChallenge,
    placePropOrder,
    closePropPosition,
    cancelPropOrder,
    cancelAllPropOrders,
    closeAllPropPositions,
    calculateLiquidationPrice,
    triggerPropOrderProcessing,
    triggerImmediateOrderProcessing
  };
};
