import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Enhanced validation with better error messages
if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'your_supabase_url_here' || supabaseAnonKey === 'your_supabase_anon_key_here') {
  console.error('Supabase configuration missing. Please set up your Supabase project and update the .env file with your actual credentials.');
  console.error('Current VITE_SUPABASE_URL:', supabaseUrl);
  console.error('Current VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '[REDACTED]' : 'undefined');
  throw new Error('Missing or invalid Supabase environment variables. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
}

// Validate URL format
try {
  const url = new URL(supabaseUrl);
  // Ensure it's not a localhost URL in production
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    console.warn('Warning: Using localhost Supabase URL. This may not work in all environments.');
  }
} catch (error) {
  console.error('Invalid Supabase URL format:', supabaseUrl);
  throw new Error('VITE_SUPABASE_URL must be a valid URL format (e.g., https://your-project.supabase.co)');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    headers: {
      'X-Client-Info': 'trading-app'
    }
  },
  db: {
    schema: 'public',
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    },
    heartbeatIntervalMs: 30000,
    timeout: 30000
  }
});

// Enhanced test connection function with better error handling
export const testSupabaseConnection = async () => {
  try {
    console.log('Testing Supabase connection to:', supabaseUrl);
    
    // Use a simple query that should work even with minimal permissions
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1)
      .abortSignal(AbortSignal.timeout(10000)); // 10 second timeout

    if (error) {
      console.error('Supabase connection test failed:', error);
      return false;
    }
    
    console.log('Supabase connection test successful');
    return true;
  } catch (error) {
    console.error('Supabase connection test error:', error);
    
    // Check if it's a network error
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error('Network error: Unable to reach Supabase. Check your internet connection and Supabase URL.');
    }
    
    return false;
  }
};

// Helper function to check if we're in a development environment
export const isDevelopment = () => {
  return import.meta.env.DEV || import.meta.env.MODE === 'development';
};

// Helper function to safely make Supabase requests with retry logic
export const safeSupabaseRequest = async <T>(
  requestFn: () => Promise<{ data: T | null; error: any }>,
  fallbackData: T | null = null,
  maxRetries: number = 2
): Promise<{ data: T | null; error: any }> => {
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await requestFn();
      
      if (!result.error) {
        return result;
      }
      
      lastError = result.error;
      
      // If it's a network error and we have more attempts, wait and retry
      if (attempt < maxRetries && (
        result.error?.message?.includes('fetch') ||
        result.error?.message?.includes('network') ||
        result.error?.code === 'PGRST301'
      )) {
        console.warn(`Supabase request failed (attempt ${attempt}), retrying...`, result.error);
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        continue;
      }
      
      // If it's not a retryable error, return immediately
      return result;
      
    } catch (error) {
      lastError = error;
      console.warn(`Supabase request error (attempt ${attempt}):`, error);
      
      // If it's the last attempt, break
      if (attempt === maxRetries) {
        break;
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  
  // All attempts failed, return fallback data
  console.warn('All Supabase request attempts failed, using fallback data:', lastError);
  return { data: fallbackData, error: lastError };
};

// Database types for TypeScript
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          created_at: string;
          updated_at: string;
          kyc_status: 'not_verified' | 'pending' | 'verified';
        };
        Insert: {
          id?: string;
          email: string;
          created_at?: string;
          updated_at?: string;
          kyc_status?: 'not_verified' | 'pending' | 'verified';
        };
        Update: {
          id?: string;
          email?: string;
          created_at?: string;
          updated_at?: string;
          kyc_status?: 'not_verified' | 'pending' | 'verified';
        };
      };
      balances: {
        Row: {
          id: string;
          user_id: string;
          usdt_balance: number;
          btc_balance: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          usdt_balance?: number;
          btc_balance?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          usdt_balance?: number;
          btc_balance?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      spot_orders: {
        Row: {
          id: string;
          user_id: string;
          pair: string;
          side: 'buy' | 'sell';
          amount: number;
          rate: number;
          total: number;
          filled: number;
          status: 'completed' | 'partial' | 'cancelled';
          created_at: string;
          updated_at: string;
          order_type: 'market' | 'limit';
          remaining_amount: number;
          stop_loss_price: number | null;
          take_profit_price: number | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          pair: string;
          side: 'buy' | 'sell';
          amount: number;
          rate: number;
          total: number;
          filled: number;
          status: 'completed' | 'partial' | 'cancelled';
          created_at?: string;
          updated_at?: string;
          order_type?: 'market' | 'limit';
          remaining_amount?: number;
          stop_loss_price?: number | null;
          take_profit_price?: number | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          pair?: string;
          side?: 'buy' | 'sell';
          amount?: number;
          rate?: number;
          total?: number;
          filled?: number;
          status?: 'completed' | 'partial' | 'cancelled';
          created_at?: string;
          updated_at?: string;
          order_type?: 'market' | 'limit';
          remaining_amount?: number;
          stop_loss_price?: number | null;
          take_profit_price?: number | null;
        };
      };
      order_book: {
        Row: {
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
        };
        Insert: {
          id?: string;
          user_id: string;
          pair?: string;
          side: 'buy' | 'sell';
          order_type: 'market' | 'limit';
          amount: number;
          price?: number | null;
          filled_amount?: number;
          remaining_amount: number;
          status?: 'pending' | 'partial' | 'filled' | 'cancelled';
          created_at?: string;
          updated_at?: string;
          filled_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          pair?: string;
          side?: 'buy' | 'sell';
          order_type?: 'market' | 'limit';
          amount?: number;
          price?: number | null;
          filled_amount?: number;
          remaining_amount?: number;
          status?: 'pending' | 'partial' | 'filled' | 'cancelled';
          created_at?: string;
          updated_at?: string;
          filled_at?: string | null;
        };
      };
      stop_orders: {
        Row: {
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
        };
        Insert: {
          id?: string;
          user_id: string;
          parent_order_id?: string | null;
          position_id?: string | null;
          pair?: string;
          stop_type: 'stop_loss' | 'take_profit';
          trigger_price: number;
          execution_type: 'market' | 'limit';
          execution_price?: number | null;
          amount: number;
          amount_type?: 'absolute' | 'percentage';
          status?: 'active' | 'triggered' | 'cancelled';
          created_at?: string;
          updated_at?: string;
          triggered_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          parent_order_id?: string | null;
          position_id?: string | null;
          pair?: string;
          stop_type?: 'stop_loss' | 'take_profit';
          trigger_price?: number;
          execution_type?: 'market' | 'limit';
          execution_price?: number | null;
          amount?: number;
          amount_type?: 'absolute' | 'percentage';
          status?: 'active' | 'triggered' | 'cancelled';
          created_at?: string;
          updated_at?: string;
          triggered_at?: string | null;
        };
      };
      order_fills: {
        Row: {
          id: string;
          order_id: string;
          user_id: string;
          pair: string;
          side: 'buy' | 'sell';
          amount: number;
          price: number;
          fee: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          user_id: string;
          pair: string;
          side: 'buy' | 'sell';
          amount: number;
          price: number;
          fee?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          user_id?: string;
          pair?: string;
          side?: 'buy' | 'sell';
          amount?: number;
          price?: number;
          fee?: number;
          created_at?: string;
        };
      };
      futures_positions: {
        Row: {
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
        };
        Insert: {
          id?: string;
          user_id: string;
          symbol: string;
          entry_price: number;
          current_price: number;
          amount: number;
          leverage: number;
          margin_type: 'isolated' | 'cross';
          side: 'long' | 'short';
          liquidation_price: number;
          unrealized_pnl?: number;
          margin: number;
          roi?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          symbol?: string;
          entry_price?: number;
          current_price?: number;
          amount?: number;
          leverage?: number;
          margin_type?: 'isolated' | 'cross';
          side?: 'long' | 'short';
          liquidation_price?: number;
          unrealized_pnl?: number;
          margin?: number;
          roi?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      futures_orders: {
        Row: {
          id: string;
          user_id: string;
          symbol: string;
          type: 'limit' | 'market' | 'stop';
          side: 'buy' | 'sell';
          price: number | null;
          amount: number;
          leverage: number;
          margin_type: 'isolated' | 'cross';
          status: 'open' | 'filled' | 'cancelled';
          tp_price: number | null;
          sl_price: number | null;
          created_at: string;
          filled_at: string | null;
          position_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          symbol?: string;
          type: 'limit' | 'market' | 'stop';
          side: 'buy' | 'sell';
          price?: number | null;
          amount: number;
          leverage?: number;
          margin_type?: 'isolated' | 'cross';
          status?: 'open' | 'filled' | 'cancelled';
          tp_price?: number | null;
          sl_price?: number | null;
          created_at?: string;
          filled_at?: string | null;
          position_id?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          symbol?: string;
          type?: 'limit' | 'market' | 'stop';
          side?: 'buy' | 'sell';
          price?: number | null;
          amount?: number;
          leverage?: number;
          margin_type?: 'isolated' | 'cross';
          status?: 'open' | 'filled' | 'cancelled';
          tp_price?: number | null;
          sl_price?: number | null;
          created_at?: string;
          filled_at?: string | null;
          position_id?: string | null;
        };
      };
      binary_trades: {
        Row: {
          id: string;
          user_id: string;
          pair: string;
          direction: 'higher' | 'lower';
          amount: number;
          entry_price: number;
          settlement_price: number;
          duration: string;
          outcome: 'win' | 'loss';
          pnl: number;
          profit_percentage: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          pair: string;
          direction: 'higher' | 'lower';
          amount: number;
          entry_price: number;
          settlement_price: number;
          duration: string;
          outcome: 'win' | 'loss';
          pnl: number;
          profit_percentage: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          pair?: string;
          direction?: 'higher' | 'lower';
          amount?: number;
          entry_price?: number;
          settlement_price?: number;
          duration?: string;
          outcome?: 'win' | 'loss';
          pnl?: number;
          profit_percentage?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      robot_states: {
        Row: {
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
        };
        Insert: {
          id?: string;
          user_id: string;
          is_active?: boolean;
          strategy?: string;
          min_profit_threshold?: number;
          max_trade_amount?: number;
          allocated_balance?: number;
          todays_profit?: number;
          total_trades?: number;
          successful_trades?: number;
          custom_daily_profit_percentage?: number | null;
          last_profit_timestamp?: string | null;
          created_at?: string;
          updated_at?: string;
          active_challenge_id?: string | null;
          challenge_account_balance?: number;
          challenge_profit_target?: number;
          challenge_max_drawdown?: number;
          challenge_time_limit?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          is_active?: boolean;
          strategy?: string;
          min_profit_threshold?: number;
          max_trade_amount?: number;
          allocated_balance?: number;
          todays_profit?: number;
          total_trades?: number;
          successful_trades?: number;
          custom_daily_profit_percentage?: number | null;
          last_profit_timestamp?: string | null;
          created_at?: string;
          updated_at?: string;
          active_challenge_id?: string | null;
          challenge_account_balance?: number;
          challenge_profit_target?: number;
          challenge_max_drawdown?: number;
          challenge_time_limit?: number;
        };
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          type: 'deposit' | 'withdrawal' | 'trade' | 'robot_profit' | 'binary_trade';
          amount: number;
          description: string;
          status: 'completed' | 'pending' | 'failed';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: 'deposit' | 'withdrawal' | 'trade' | 'robot_profit' | 'binary_trade';
          amount: number;
          description: string;
          status?: 'completed' | 'pending' | 'failed';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: 'deposit' | 'withdrawal' | 'trade' | 'robot_profit' | 'binary_trade';
          amount?: number;
          description?: string;
          status?: 'completed' | 'pending' | 'failed';
          created_at?: string;
          updated_at?: string;
        };
      };
      price_data: {
        Row: {
          id: string;
          symbol: string;
          price: number;
          timestamp: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          symbol: string;
          price: number;
          timestamp?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          symbol?: string;
          price?: number;
          timestamp?: string;
          created_at?: string;
        };
      };
      market_data: {
        Row: {
          id: string;
          symbol: string;
          price: number;
          volume_24h: number;
          change_24h: number;
          timestamp: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          symbol: string;
          price: number;
          volume_24h?: number;
          change_24h?: number;
          timestamp?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          symbol?: string;
          price?: number;
          volume_24h?: number;
          change_24h?: number;
          timestamp?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
