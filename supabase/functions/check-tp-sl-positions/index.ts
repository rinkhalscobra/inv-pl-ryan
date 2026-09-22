import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Position {
  id: string;
  user_id: string;
  symbol: string;
  side: 'long' | 'short';
  entry_price: number;
  amount: number;
  leverage: number;
  tp_price: number | null;
  sl_price: number | null;
  positionType: 'futures' | 'prop';
  challenge_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const { createClient } = await import("npm:@supabase/supabase-js@2.39.0");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting TP/SL monitoring check...");

    const positionsToClose: string[] = [];
    const reasons: Record<string, string> = {};
    const positionTypes: Record<string, 'futures' | 'prop'> = {};

    const { data: futuresPositions, error: futuresError } = await supabase
      .from('futures_positions')
      .select('id, user_id, symbol, side, entry_price, amount, leverage, tp_price, sl_price')
      .eq('is_open', true)
      .or('tp_price.not.is.null,sl_price.not.is.null');

    if (futuresError) {
      throw new Error(`Failed to fetch futures positions: ${futuresError.message}`);
    }

    const { data: propPositions, error: propError } = await supabase
      .from('prop_positions')
      .select('id, user_id, symbol, side, entry_price, amount, leverage, tp_price, sl_price, challenge_id')
      .eq('is_open', true)
      .or('tp_price.not.is.null,sl_price.not.is.null');

    if (propError) {
      throw new Error(`Failed to fetch prop positions: ${propError.message}`);
    }

    const positions = [
      ...(futuresPositions || []).map(p => ({ ...p, positionType: 'futures' as const })),
      ...(propPositions || []).map(p => ({ ...p, positionType: 'prop' as const }))
    ];

    if (!positions || positions.length === 0) {
      console.log("No positions with TP/SL found");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No positions with TP/SL to check",
          checked: 0,
          closed: 0,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log(`Found ${positions.length} positions with TP/SL to check (${futuresPositions?.length || 0} futures, ${propPositions?.length || 0} prop)`);

    const uniqueSymbols = [...new Set(positions.map(p => p.symbol))];
    const priceMap: Record<string, number> = {};

    for (const symbol of uniqueSymbols) {
      const table = symbol.endsWith('USDT') ? 'crypto_market_quotes' : 'cfd_market_quotes';
      const { data: quote, error: priceError } = await supabase
        .from(table).select('price,timestamp').eq('symbol', symbol).maybeSingle();
      if (priceError || !quote) continue;
      const sourceAge = Date.now() - Date.parse(quote.timestamp);
      if (sourceAge >= 0 && sourceAge <= 5 * 60_000 && Number(quote.price) > 0) {
        priceMap[symbol] = Number(quote.price);
      }
    }

    console.log(`Total prices available: ${Object.keys(priceMap).length} for ${uniqueSymbols.length} symbols`);

    for (const position of positions as Position[]) {
      const currentPrice = priceMap[position.symbol];

      if (!currentPrice || currentPrice <= 0) {
        console.log(`No price data for ${position.symbol}, skipping position ${position.id}`);
        continue;
      }

      let shouldClose = false;
      let reason = '';

      if (position.tp_price && position.tp_price > 0) {
        if (position.side === 'long' && currentPrice >= position.tp_price) {
          shouldClose = true;
          reason = 'Take Profit triggered';
        } else if (position.side === 'short' && currentPrice <= position.tp_price) {
          shouldClose = true;
          reason = 'Take Profit triggered';
        }
      }

      if (!shouldClose && position.sl_price && position.sl_price > 0) {
        if (position.side === 'long' && currentPrice <= position.sl_price) {
          shouldClose = true;
          reason = 'Stop Loss triggered';
        } else if (position.side === 'short' && currentPrice >= position.sl_price) {
          shouldClose = true;
          reason = 'Stop Loss triggered';
        }
      }

      if (shouldClose) {
        console.log(`${reason} for ${position.positionType} position ${position.id} (${position.symbol}) at price ${currentPrice}`);
        positionsToClose.push(position.id);
        reasons[position.id] = reason;
        positionTypes[position.id] = position.positionType;
      }
    }

    const closedPositions = [];
    const errors = [];

    for (const positionId of positionsToClose) {
      try {
        const positionType = positionTypes[positionId];
        const rpcFunction = positionType === 'prop' ? 'close_prop_position' : 'close_futures_position';

        const position = positions.find(p => p.id === positionId);
        const exitPrice = position ? priceMap[position.symbol] : null;

        const { data, error } = await supabase.rpc(rpcFunction, {
          position_id: positionId,
          exit_price: exitPrice
        });

        if (error) {
          console.error(`Failed to close ${positionType} position ${positionId}: ${error.message}`);
          errors.push({ positionId, positionType, error: error.message });
        } else {
          console.log(`Successfully closed ${positionType} position ${positionId}: ${reasons[positionId]}`);
          closedPositions.push({ positionId, positionType, reason: reasons[positionId], pnl: data });
        }
      } catch (err) {
        console.error(`Exception closing position ${positionId}:`, err);
        errors.push({ positionId, error: err.message });
      }
    }

    const result = {
      success: true,
      message: `Checked ${positions.length} positions, closed ${closedPositions.length}`,
      checked: positions.length,
      closed: closedPositions.length,
      closedPositions,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    };

    console.log("TP/SL check completed:", result);

    return new Response(
      JSON.stringify(result),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in check-tp-sl-positions:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 500,
      }
    );
  }
});
