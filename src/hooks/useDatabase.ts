import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './useAuth';
import { TOP_CRYPTO_PAIRS, CFD_INSTRUMENTS } from '../constants/tradingPairs';

export interface MarketData {
  id?: string;
  symbol: string;
  price: number;
  volume_24h?: number;
  change_24h?: number;
  timestamp: string;
  high_price_24h?: number;
  low_price_24h?: number;
  market_cap?: number;
  funding_rate?: number;
  open_interest?: number;
  bid_price?: number;
  ask_price?: number;
  isLive?: boolean;
}

export interface DatabaseOrderBook {
  id: string;
  user_id: string;
  pair: string;
  side: 'buy' | 'sell';
  order_type: 'market' | 'limit';
  amount: number;
  price: number | null;
  filled_amount: number;
  remaining_amount: number;
  status: 'pending' | 'partial' | 'filled' | 'cancelled';
  created_at: string;
  updated_at: string;
  filled_at: string | null;
}

export interface DatabaseStopOrder {
  id: string;
  user_id: string;
  parent_order_id: string | null;
  position_id: string | null;
  pair: string;
  stop_type: 'stop_loss' | 'take_profit';
  trigger_price: number;
  execution_type: 'market' | 'limit';
  execution_price: number | null;
  amount: number;
  amount_type: 'absolute' | 'percentage';
  status: 'active' | 'triggered' | 'cancelled';
  created_at: string;
  updated_at: string;
  triggered_at: string | null;
}

export interface DatabaseFuturesPosition {
  id: string;
  user_id: string;
  symbol: string;
  entry_price: number;
  current_price: number;
  amount: number;
  leverage: number;
  margin_type: 'isolated' | 'cross';
  side: 'long' | 'short';
  liquidation_price: number;
  unrealized_pnl: number;
  margin: number;
  roi: number;
  created_at: string;
  updated_at: string;
  is_open: boolean;
  position_size: number;
  tp_price: number | null;
  sl_price: number | null;
}

export interface DatabaseRobotState {
  id: string;
  user_id: string;
  is_active: boolean;
  strategy: string;
  min_profit_threshold: number;
  max_trade_amount: number;
  allocated_balance: number;
  todays_profit: number;
  total_trades: number;
  successful_trades: number;
  custom_daily_profit_percentage: number | null;
  last_profit_timestamp: string | null;
  created_at: string;
  updated_at: string;
  active_challenge_id: string | null;
  challenge_account_balance: number;
  challenge_profit_target: number;
  challenge_max_drawdown: number;
  challenge_time_limit: number;
  challenge_initial_balance: number;
  challenge_start_date: string | null;
  challenge_status: 'active' | 'won' | 'lost' | 'expired' | 'cancelled';
}

export interface DatabaseTransaction {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  currency?: string;
  description: string;
  status: 'completed' | 'pending' | 'failed';
  created_at: string;
  updated_at: string;
  withdrawal_details?: Record<string, unknown>;
}

export interface DatabaseUserStake {
  id: string;
  user_id: string;
  asset_symbol: string;
  staked_amount: number;
  apy_rate: number;
  start_date: string;
  end_date: string;
  earned_amount: number;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  published_at: string;
  url: string;
  category: 'crypto' | 'markets' | 'economy' | 'technology' | 'general';
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortfolioSnapshot {
  id: string;
  user_id: string;
  snapshot_date: string;
  total_value: number;
  usdt_balance: number;
  btc_balance: number;
  btc_price: number;
  created_at: string;
}

export interface DatabaseUserAsset {
  id: string;
  user_id: string;
  asset_symbol: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

export interface CoinGeckoToken {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  price_change_percentage_24h: number;
}

export const useDatabase = () => {
  const { user, loading: authLoading } = useAuth();
  const [balances, setBalances] = useState({ usdt_balance: 0, btc_balance: 0 });
  const [robotState, setRobotState] = useState<DatabaseRobotState | null>(null);
  const [transactions, setTransactions] = useState<DatabaseTransaction[]>([]);
  const [userStakes, setUserStakes] = useState<DatabaseUserStake[]>([]);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [portfolioSnapshots, setPortfolioSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<'not_verified' | 'pending' | 'verified'>('not_verified');
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState(0);
  const [referredUsers, setReferredUsers] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // Fetch user balances
  const fetchBalances = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('balances')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;

      if (data) {
        setBalances({
          usdt_balance: parseFloat(data.usdt_balance),
          btc_balance: parseFloat(data.btc_balance)
        });
      }
    } catch (error) {
      console.error('Error fetching balances:', error);
    }
  }, [user]);

  // Fetch robot state
  const fetchRobotState = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('robot_states')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching robot state:', error);
        return;
      }

      // Check if we got any data
      if (data && data.length > 0) {
        setRobotState(data[0]);
      } else {
        // Create a default robot state if none exists
        const { data: newRobotState, error: createError } = await supabase
          .from('robot_states')
          .upsert([{
            user_id: user.id,
            is_active: false,
            strategy: 'triangular',
            min_profit_threshold: 0.5,
            max_trade_amount: 1000,
            allocated_balance: 0,
            todays_profit: 0,
            total_trades: 0,
            successful_trades: 0
          }], {
            onConflict: 'user_id'
          })
          .select()
          .single();
          
        if (createError) {
          console.error('Error creating robot state:', createError);
        } else if (newRobotState) {
          setRobotState(newRobotState);
        }
      }
    } catch (error) {
      console.error('Error fetching robot state:', error);
    }
  }, [user]);

  // Fetch transactions
  const fetchTransactions = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        setTransactions(data);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  }, [user]);

  // Fetch user stakes
  const fetchUserStakes = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_stakes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        setUserStakes(data);
      }
    } catch (error) {
      console.error('Error fetching user stakes:', error);
    }
  }, [user]);

  // Fetch news items
  const fetchNewsItems = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('news_items')
        .select('*')
        .order('published_at', { ascending: false });

      if (error) throw error;

      if (data) {
        setNewsItems(data);
      }
    } catch (error) {
      console.error('Error fetching news items:', error);
    }
  }, []);

  // Fetch portfolio snapshots
  const fetchPortfolioSnapshots = useCallback(async (days: number = 30) => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('portfolio_snapshots')
        .select('*')
        .eq('user_id', user.id)
        .order('snapshot_date', { ascending: true });

      if (error) throw error;

      if (data) {
        setPortfolioSnapshots(data);
      }
    } catch (error) {
      console.error('Error fetching portfolio snapshots:', error);
    }
  }, [user]);


  // Fetch user profile data
  const fetchUserProfile = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('users')
        .select('kyc_status, referral_code, referral_count, is_admin')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      if (data) {
        setKycStatus(data.kyc_status || 'not_verified');
        setReferralCode(data.referral_code);
        setReferralCount(data.referral_count || 0);
        setIsAdmin(data.is_admin || false);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  }, [user]);

  // Fetch referred users
  const fetchReferredUsers = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, created_at')
        .eq('referred_by', user.id);

      if (error) throw error;

      if (data) {
        setReferredUsers(data);
      }
    } catch (error) {
      console.error('Error fetching referred users:', error);
    }
  }, [user]);

  // Initialize data
  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (user) {
      setLoading(true);
      setIsAdmin(false);
      const initializeData = async () => {
        try {
          // Fetch critical data first and await it
          await fetchBalances();
          
          // Then fetch other data in parallel
          await Promise.all([
            fetchRobotState(),
            fetchTransactions(),
            fetchUserStakes(),
            fetchNewsItems(),
            fetchUserProfile(),
            fetchReferredUsers()
          ]);
        } catch (error) {
          console.error('Error initializing data:', error);
        } finally {
          setLoading(false);
        }
      };
      
      initializeData();
    } else {
      setIsAdmin(false);
      setLoading(false);
    }
  }, [
    authLoading,
    user,
    fetchBalances,
    fetchRobotState,
    fetchTransactions,
    fetchUserStakes,
    fetchNewsItems,
    fetchUserProfile,
    fetchReferredUsers
  ]);

  // Keep wallet-facing state synchronized with Supabase changes from RPCs, CRM,
  // provider callbacks, and other open sessions.
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`account-live-${user.id}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'balances', filter: `user_id=eq.${user.id}` }, () => void fetchBalances())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${user.id}` }, () => void fetchTransactions())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_stakes', filter: `user_id=eq.${user.id}` }, () => void fetchUserStakes())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'robot_states', filter: `user_id=eq.${user.id}` }, () => void fetchRobotState())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchBalances, fetchRobotState, fetchTransactions, fetchUserStakes, user]);

  // Update balances
  const updateBalances = useCallback(async (updates: { usdt_balance?: number, btc_balance?: number }) => {
    if (!user) throw new Error('No user found');

    const { error } = await supabase
      .from('balances')
      .update(updates)
      .eq('user_id', user.id);

    if (error) throw error;

    setBalances(prev => ({
      usdt_balance: updates.usdt_balance !== undefined ? updates.usdt_balance : prev.usdt_balance,
      btc_balance: updates.btc_balance !== undefined ? updates.btc_balance : prev.btc_balance
    }));
  }, [user]);

  // Update robot state
  const updateRobotState = useCallback(async (updates: Partial<DatabaseRobotState>) => {
    if (!user) throw new Error('No user found');

    const { error } = await supabase
      .from('robot_states')
      .update(updates)
      .eq('user_id', user.id);

    if (error) throw error;

    setRobotState(prev => prev ? { ...prev, ...updates } : null);
  }, [user]);

  // Add transaction
  const addTransaction = useCallback(async (transaction: {
    type: 'deposit' | 'withdrawal' | 'trade' | 'robot_profit' | 'binary_trade' | 'stake' | 'staking_profit' | 'staking_return' | 'challenge_fee' | 'challenge_reward' | 'giveaway_prize' | 'robot_allocation' | 'robot_withdrawal';
    amount: number;
    description: string;
    status?: 'completed' | 'pending' | 'failed';
  }) => {
    if (!user) return { data: null, error: new Error('No user found') };

    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert([{
          user_id: user.id,
          type: transaction.type,
          amount: transaction.amount,
          description: transaction.description,
          status: transaction.status || 'completed'
        }])
        .select();

      if (error) throw error;

      // Update local state
      if (data) {
        setTransactions(prev => [data[0], ...prev]);
      }

      // Fetch updated transactions
      fetchTransactions();

      return { data: data?.[0], error: null };
    } catch (error) {
      console.error('Error adding transaction:', error);
      return { data: null, error };
    }
  }, [user, fetchTransactions]);

  // Add user stake
  const addUserStake = useCallback(async (
    asset: string,
    amount: number,
    durationDays: number
  ) => {
    if (!user) return false;

    try {
      const { error } = await supabase.rpc('create_user_stake', {
        p_asset_symbol: asset,
        p_amount: amount,
        p_duration_days: durationDays
      });

      if (error) throw error;

      // Fetch updated stakes
      await Promise.all([fetchUserStakes(), fetchBalances()]);

      return true;
    } catch (error) {
      console.error('Error adding user stake:', error);
      return false;
    }
  }, [user, fetchUserStakes, fetchBalances]);

  // Calculate current earnings for a stake
  const calculateCurrentEarnings = useCallback((stake: DatabaseUserStake) => {
    const startDate = new Date(stake.start_date);
    const endDate = new Date(stake.end_date);
    const now = new Date();
    
    // If stake is completed, return the earned amount
    if (stake.status === 'completed') {
      return stake.earned_amount;
    }
    
    // If stake is cancelled, return 0
    if (stake.status === 'cancelled') {
      return 0;
    }
    
    // If current time is past end date, return full earnings
    if (now > endDate) {
      // Calculate full earnings based on APY and duration
      const durationDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      const dailyRate = stake.apy_rate / 365 / 100;
      return stake.staked_amount * dailyRate * durationDays;
    }
    
    // Calculate partial earnings based on time elapsed
    const elapsedDays = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const dailyRate = stake.apy_rate / 365 / 100;
    return stake.staked_amount * dailyRate * elapsedDays;
  }, []);

  // Cancel user stake
  const cancelUserStake = useCallback(async (stakeId: string) => {
    if (!user) return false;

    try {
      // Find the stake
      const stake = userStakes.find(s => s.id === stakeId);
      if (!stake) {
        throw new Error('Stake not found');
      }

      // Calculate earned amount based on time elapsed
      const startDate = new Date(stake.start_date);
      const now = new Date();
      const elapsedDays = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      const dailyRate = stake.apy_rate / 365 / 100;
      const earnedAmount = stake.staked_amount * dailyRate * elapsedDays;

      // Update stake status
      const { error: updateError } = await supabase
        .from('user_stakes')
        .update({
          status: 'cancelled',
          earned_amount: earnedAmount,
          updated_at: new Date().toISOString()
        })
        .eq('id', stakeId)
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      // Return staked amount and earnings to user
      if (stake.asset_symbol === 'USDT') {
        await updateBalances({
          usdt_balance: balances.usdt_balance + stake.staked_amount + earnedAmount
        });
      } else if (stake.asset_symbol === 'BTC') {
        await updateBalances({
          btc_balance: balances.btc_balance + stake.staked_amount + earnedAmount
        });
      }

      // Add transaction records
      await addTransaction({
        type: 'staking_profit',
        amount: earnedAmount,
        description: `Staking profit for cancelled ${stake.asset_symbol} stake (${stake.apy_rate}% APY)`
      });

      await addTransaction({
        type: 'staking_return',
        amount: stake.staked_amount,
        description: `Returned staked ${stake.asset_symbol} (cancelled)`
      });

      // Fetch updated stakes
      fetchUserStakes();

      return true;
    } catch (error) {
      console.error('Error cancelling user stake:', error);
      return false;
    }
  }, [user, userStakes, balances, updateBalances, addTransaction, fetchUserStakes]);

  // Claim user stake
  const claimUserStake = useCallback(async (stakeId: string) => {
    if (!user) return false;

    try {
      // Call the process_stake_claim RPC function
      const { data, error } = await supabase.rpc('process_stake_claim', {
        p_stake_id: stakeId
      });

      if (error) throw error;

      // Refresh user stakes and balances
      await fetchUserStakes();
      await fetchBalances();

      return true;
    } catch (error) {
      console.error('Error claiming user stake:', error);
      return false;
    }
  }, [user, fetchUserStakes, fetchBalances]);

  // Create portfolio snapshot
  const createPortfolioSnapshot = useCallback(async (
    totalValue: number,
    usdtBalance: number,
    btcBalance: number,
    btcPrice: number
  ) => {
    if (!user) return false;

    try {
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('portfolio_snapshots')
        .upsert([{
          user_id: user.id,
          snapshot_date: today,
          total_value: totalValue,
          usdt_balance: usdtBalance,
          btc_balance: btcBalance,
          btc_price: btcPrice
        }], {
          onConflict: 'user_id,snapshot_date'
        })
        .select();

      if (error) throw error;

      // Update local state
      if (data) {
        setPortfolioSnapshots(prev => {
          const existingIndex = prev.findIndex(s => s.snapshot_date === today);
          if (existingIndex >= 0) {
            const newSnapshots = [...prev];
            newSnapshots[existingIndex] = data[0];
            return newSnapshots;
          } else {
            return [...prev, data[0]];
          }
        });
      }

      return true;
    } catch (error) {
      console.error('Error creating portfolio snapshot:', error);
      return false;
    }
  }, [user]);

  // Update KYC status
  const updateKycStatus = useCallback(async (status: 'not_verified' | 'pending' | 'verified') => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('users')
        .update({ kyc_status: status })
        .eq('id', user.id);

      if (error) throw error;

      // Update local state
      setKycStatus(status);

      return true;
    } catch (error) {
      console.error('Error updating KYC status:', error);
      return false;
    }
  }, [user]);

  return {
    balances,
    fetchBalances,
    robotState,
    transactions,
    userStakes,
    newsItems,
    portfolioSnapshots,
    loading,
    error,
    kycStatus,
    referralCode,
    referralCount,
    referredUsers,
    isAdmin,
    fetchRobotState,
    fetchTransactions,
    fetchUserStakes,
    fetchNewsItems,
    fetchPortfolioSnapshots,
    updateBalances,
    updateRobotState,
    addTransaction,
    addUserStake,
    calculateCurrentEarnings,
    cancelUserStake,
    claimUserStake,
    createPortfolioSnapshot,
    updateKycStatus
  };
};
