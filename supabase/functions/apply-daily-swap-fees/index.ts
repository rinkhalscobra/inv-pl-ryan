import { createClient } from 'npm:@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface SwapConfig {
  instrumentType: 'crypto' | 'forex' | 'commodity' | 'stock' | 'index';
  dailySwapRate: number;
  annualizedRate: number;
  description: string;
}

const SWAP_RATES_BY_TYPE: Record<string, SwapConfig> = {
  crypto: {
    instrumentType: 'crypto',
    dailySwapRate: 0.0003,
    annualizedRate: 0.1095,
    description: 'Crypto Futures Funding'
  },
  forexMajors: {
    instrumentType: 'forex',
    dailySwapRate: 0.00002,
    annualizedRate: 0.0073,
    description: 'Forex Major Pairs'
  },
  forexMinors: {
    instrumentType: 'forex',
    dailySwapRate: 0.00002,
    annualizedRate: 0.0073,
    description: 'Forex Cross Pairs'
  },
  forexExotics: {
    instrumentType: 'forex',
    dailySwapRate: 0.0001,
    annualizedRate: 0.0365,
    description: 'Forex Exotic Pairs'
  },
  commodities: {
    instrumentType: 'commodity',
    dailySwapRate: 0.0002,
    annualizedRate: 0.073,
    description: 'Commodities CFDs'
  },
  indices: {
    instrumentType: 'index',
    dailySwapRate: 0.0001,
    annualizedRate: 0.0365,
    description: 'Indices CFDs'
  },
  stocks: {
    instrumentType: 'stock',
    dailySwapRate: 0.00015,
    annualizedRate: 0.05475,
    description: 'Stock CFDs'
  }
};

const SYMBOL_SWAP_MAPPING: Record<string, keyof typeof SWAP_RATES_BY_TYPE> = {
  'BTCUSDT': 'crypto', 'ETHUSDT': 'crypto', 'BNBUSDT': 'crypto', 'SOLUSDT': 'crypto',
  'EUR/USD': 'forexMajors', 'GBP/USD': 'forexMajors', 'USD/JPY': 'forexMajors',
  'XAU/USD': 'commodities', 'XAUUSD': 'commodities', 'XAG/USD': 'commodities',
  'SPY': 'indices', 'QQQ': 'indices', 'DIA': 'indices',
  'AAPL': 'stocks', 'MSFT': 'stocks', 'TSLA': 'stocks'
};

function getSwapConfigForSymbol(symbol: string): SwapConfig | null {
  const swapCategory = SYMBOL_SWAP_MAPPING[symbol];
  if (!swapCategory) {
    const isCrypto = symbol.endsWith('USDT');
    if (isCrypto) return SWAP_RATES_BY_TYPE.crypto;
    
    const isForex = symbol.includes('/');
    if (isForex) {
      const majors = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF', 'USD/CAD', 'NZD/USD'];
      if (majors.includes(symbol)) return SWAP_RATES_BY_TYPE.forexMajors;
      
      const exotics = ['USD/TRY', 'USD/ZAR', 'USD/MXN', 'USD/BRL'];
      if (exotics.includes(symbol)) return SWAP_RATES_BY_TYPE.forexExotics;
      
      return SWAP_RATES_BY_TYPE.forexMinors;
    }
    
    return null;
  }
  return SWAP_RATES_BY_TYPE[swapCategory];
}

function calculateDailySwapCost(
  symbol: string,
  positionSize: number,
  leverage: number
): number {
  const swapConfig = getSwapConfigForSymbol(symbol);
  if (!swapConfig) return 0;

  return positionSize * swapConfig.dailySwapRate;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting daily swap fee application...');

    const today = new Date();
    const todayDateString = today.toISOString().split('T')[0];

    const { data: openPositions, error: fetchError } = await supabase
      .from('futures_positions')
      .select('*')
      .eq('is_open', true);

    if (fetchError) {
      console.error('Error fetching open positions:', fetchError);
      throw fetchError;
    }

    if (!openPositions || openPositions.length === 0) {
      console.log('No open positions found.');
      return new Response(
        JSON.stringify({ message: 'No open positions to charge swap fees', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${openPositions.length} open positions`);

    let processedCount = 0;
    let totalSwapCharged = 0;
    const errors = [];

    for (const position of openPositions) {
      try {
        const createdDate = new Date(position.created_at);
        const createdDateOnly = new Date(
          createdDate.getFullYear(),
          createdDate.getMonth(),
          createdDate.getDate()
        );

        const todayOnly = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate()
        );

        const daysSinceCreation = Math.floor(
          (todayOnly.getTime() - createdDateOnly.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysSinceCreation === 0) {
          console.log(`Position ${position.id} created today, skipping swap charge`);
          continue;
        }

        if (position.last_swap_charge_date === todayDateString) {
          console.log(`Position ${position.id} already charged today, skipping`);
          continue;
        }

        const positionSize = parseFloat(position.amount) * parseFloat(position.current_price);
        const leverage = position.leverage || 1;
        const dailySwapCost = calculateDailySwapCost(position.symbol, positionSize, leverage);

        if (dailySwapCost === 0) {
          console.log(`No swap config for ${position.symbol}, skipping`);
          continue;
        }

        const swapConfig = getSwapConfigForSymbol(position.symbol);
        const swapRate = swapConfig?.dailySwapRate || 0;

        const { error: chargeInsertError } = await supabase
          .from('position_swap_charges')
          .insert({
            position_id: position.id,
            user_id: position.user_id,
            symbol: position.symbol,
            swap_amount: dailySwapCost,
            position_size: positionSize,
            leverage: leverage,
            swap_rate: swapRate,
            charge_date: todayDateString
          });

        if (chargeInsertError) {
          console.error(`Error inserting swap charge for position ${position.id}:`, chargeInsertError);
          errors.push({ positionId: position.id, error: chargeInsertError.message });
          continue;
        }

        const newAccumulatedSwap = (parseFloat(position.accumulated_swap_cost) || 0) + dailySwapCost;

        const { error: updateError } = await supabase
          .from('futures_positions')
          .update({
            accumulated_swap_cost: newAccumulatedSwap,
            last_swap_charge_date: todayDateString,
            updated_at: new Date().toISOString()
          })
          .eq('id', position.id);

        if (updateError) {
          console.error(`Error updating position ${position.id}:`, updateError);
          errors.push({ positionId: position.id, error: updateError.message });
          continue;
        }

        console.log(`Applied swap fee of ${dailySwapCost} to position ${position.id}`);
        processedCount++;
        totalSwapCharged += dailySwapCost;
      } catch (positionError) {
        console.error(`Error processing position ${position.id}:`, positionError);
        errors.push({ positionId: position.id, error: String(positionError) });
      }
    }

    const result = {
      message: 'Daily swap fees applied successfully',
      date: todayDateString,
      totalPositions: openPositions.length,
      processedCount,
      totalSwapCharged: totalSwapCharged.toFixed(8),
      errors: errors.length > 0 ? errors : undefined
    };

    console.log('Swap fee application completed:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in apply-daily-swap-fees:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});