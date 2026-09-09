-- Fix futures position current price update
-- This migration improves the run_background_processes function to ensure
-- futures positions always use the latest market price data

-- Create or replace the run_background_processes function with improved price updates
CREATE OR REPLACE FUNCTION run_background_processes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Sync prices between tables to ensure consistency
  INSERT INTO price_data (symbol, price, timestamp)
  SELECT symbol, price, timestamp
  FROM market_data
  WHERE timestamp > (NOW() - INTERVAL '1 minute')
  ON CONFLICT DO NOTHING;

  -- Update futures positions with current market prices
  -- This query has been improved to always use the most recent price data
  -- by using a subquery to get the latest price for each symbol
  UPDATE futures_positions fp
  SET 
    current_price = latest_prices.price,
    unrealized_pnl = CASE 
      WHEN fp.side = 'long' THEN (latest_prices.price - fp.entry_price) * fp.amount * fp.leverage
      WHEN fp.side = 'short' THEN (fp.entry_price - latest_prices.price) * fp.amount * fp.leverage
      ELSE 0
    END,
    roi = CASE 
      WHEN fp.margin > 0 THEN 
        CASE 
          WHEN fp.side = 'long' THEN ((latest_prices.price - fp.entry_price) * fp.amount * fp.leverage) / fp.margin * 100
          WHEN fp.side = 'short' THEN ((fp.entry_price - latest_prices.price) * fp.amount * fp.leverage) / fp.margin * 100
          ELSE 0
        END
      ELSE 0
    END,
    updated_at = now()
  FROM (
    -- Subquery to get the latest price for each symbol
    SELECT md.symbol, md.price
    FROM market_data md
    INNER JOIN (
      SELECT symbol, MAX(timestamp) as max_timestamp
      FROM market_data
      GROUP BY symbol
    ) latest ON md.symbol = latest.symbol AND md.timestamp = latest.max_timestamp
  ) latest_prices
  WHERE fp.symbol = latest_prices.symbol 
    AND fp.is_open = true;

  -- Check for liquidations
  UPDATE futures_positions fp
  SET is_open = false, updated_at = now()
  WHERE fp.is_open = true
    AND (
      (fp.side = 'long' AND fp.current_price <= fp.liquidation_price) OR
      (fp.side = 'short' AND fp.current_price >= fp.liquidation_price)
    );

  -- Process pending orders in order book
  WITH matched_orders AS (
    SELECT 
      buy_order.id as buy_id,
      sell_order.id as sell_id,
      LEAST(buy_order.remaining_amount, sell_order.remaining_amount) as match_amount,
      CASE 
        WHEN buy_order.order_type = 'market' THEN sell_order.price
        WHEN sell_order.order_type = 'market' THEN buy_order.price
        ELSE GREATEST(buy_order.price, sell_order.price)
      END as match_price
    FROM order_book buy_order
    JOIN order_book sell_order ON buy_order.pair = sell_order.pair
    WHERE buy_order.side = 'buy' 
      AND sell_order.side = 'sell'
      AND buy_order.status = 'pending'
      AND sell_order.status = 'pending'
      AND buy_order.remaining_amount > 0
      AND sell_order.remaining_amount > 0
      AND (
        (buy_order.order_type = 'market') OR
        (sell_order.order_type = 'market') OR
        (buy_order.price >= sell_order.price)
      )
    ORDER BY 
      CASE WHEN buy_order.order_type = 'market' THEN 0 ELSE 1 END,
      CASE WHEN sell_order.order_type = 'market' THEN 0 ELSE 1 END,
      buy_order.created_at,
      sell_order.created_at
    LIMIT 100
  )
  UPDATE order_book
  SET 
    filled_amount = filled_amount + mo.match_amount,
    remaining_amount = remaining_amount - mo.match_amount,
    status = CASE 
      WHEN remaining_amount - mo.match_amount <= 0 THEN 'filled'
      ELSE 'partial'
    END,
    filled_at = CASE 
      WHEN remaining_amount - mo.match_amount <= 0 THEN now()
      ELSE filled_at
    END,
    updated_at = now()
  FROM matched_orders mo
  WHERE order_book.id IN (mo.buy_id, mo.sell_id);

  -- Check and trigger stop orders
  UPDATE stop_orders so
  SET 
    status = 'triggered',
    triggered_at = now(),
    updated_at = now()
  FROM (
    -- Get latest price for each symbol
    SELECT md.symbol, md.price
    FROM market_data md
    INNER JOIN (
      SELECT symbol, MAX(timestamp) as max_timestamp
      FROM market_data
      GROUP BY symbol
    ) latest ON md.symbol = latest.symbol AND md.timestamp = latest.max_timestamp
  ) latest_prices
  WHERE REPLACE(latest_prices.symbol, 'USDT', '/USDT') = so.pair
    AND so.status = 'active'
    AND (
      (so.stop_type = 'stop_loss' AND latest_prices.price <= so.trigger_price) OR
      (so.stop_type = 'take_profit' AND latest_prices.price >= so.trigger_price)
    );

  -- Process futures orders
  PERFORM process_futures_orders();
END;
$$;

-- Also update the update_futures_positions function to use the latest price data
CREATE OR REPLACE FUNCTION update_futures_positions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update all futures positions with current market prices
  UPDATE futures_positions fp
  SET 
    current_price = latest_prices.price,
    unrealized_pnl = CASE 
      WHEN fp.side = 'long' THEN (latest_prices.price - fp.entry_price) * fp.amount * fp.leverage
      WHEN fp.side = 'short' THEN (fp.entry_price - latest_prices.price) * fp.amount * fp.leverage
      ELSE 0
    END,
    roi = CASE 
      WHEN fp.margin > 0 THEN 
        CASE 
          WHEN fp.side = 'long' THEN ((latest_prices.price - fp.entry_price) * fp.amount * fp.leverage) / fp.margin * 100
          WHEN fp.side = 'short' THEN ((fp.entry_price - latest_prices.price) * fp.amount * fp.leverage) / fp.margin * 100
          ELSE 0
        END
      ELSE 0
    END,
    updated_at = now()
  FROM (
    -- Subquery to get the latest price for each symbol
    SELECT md.symbol, md.price
    FROM market_data md
    INNER JOIN (
      SELECT symbol, MAX(timestamp) as max_timestamp
      FROM market_data
      GROUP BY symbol
    ) latest ON md.symbol = latest.symbol AND md.timestamp = latest.max_timestamp
  ) latest_prices
  WHERE fp.symbol = latest_prices.symbol 
    AND fp.is_open = true;
END;
$$;

-- Update check_futures_liquidations to use the latest price data
CREATE OR REPLACE FUNCTION check_futures_liquidations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check all open futures positions for liquidation
  WITH liquidated_positions AS (
    SELECT fp.id, fp.user_id, fp.symbol, fp.side, fp.entry_price, latest_prices.price as current_price,
           fp.amount, fp.leverage, fp.margin, fp.created_at
    FROM futures_positions fp
    JOIN (
      -- Get latest price for each symbol
      SELECT md.symbol, md.price
      FROM market_data md
      INNER JOIN (
        SELECT symbol, MAX(timestamp) as max_timestamp
        FROM market_data
        GROUP BY symbol
      ) latest ON md.symbol = latest.symbol AND md.timestamp = latest.max_timestamp
    ) latest_prices ON fp.symbol = latest_prices.symbol
    WHERE fp.is_open = true
      AND (
        (fp.side = 'long' AND latest_prices.price <= fp.liquidation_price) OR
        (fp.side = 'short' AND latest_prices.price >= fp.liquidation_price)
      )
  )
  INSERT INTO futures_position_history (
    user_id,
    symbol,
    side,
    entry_price,
    exit_price,
    amount,
    leverage,
    margin,
    pnl,
    roi,
    open_time,
    close_time,
    duration_seconds
  )
  SELECT 
    lp.user_id,
    lp.symbol,
    lp.side,
    lp.entry_price,
    lp.current_price,
    lp.amount,
    lp.leverage,
    lp.margin,
    -lp.margin, -- Full loss on liquidation
    -100, -- -100% ROI
    lp.created_at,
    now(),
    EXTRACT(EPOCH FROM (now() - lp.created_at))::integer
  FROM liquidated_positions lp;

  -- Delete liquidated positions
  DELETE FROM futures_positions fp
  USING (
    SELECT md.symbol, md.price
    FROM market_data md
    INNER JOIN (
      SELECT symbol, MAX(timestamp) as max_timestamp
      FROM market_data
      GROUP BY symbol
    ) latest ON md.symbol = latest.symbol AND md.timestamp = latest.max_timestamp
  ) latest_prices
  WHERE fp.symbol = latest_prices.symbol
    AND fp.is_open = true
    AND (
      (fp.side = 'long' AND latest_prices.price <= fp.liquidation_price) OR
      (fp.side = 'short' AND latest_prices.price >= fp.liquidation_price)
    );
END;
$$;