-- Create function to ensure price consistency across tables
CREATE OR REPLACE FUNCTION sync_price_data_to_market_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Update market_data with the new price
  UPDATE market_data
  SET 
    price = NEW.price,
    timestamp = NEW.timestamp,
    updated_at = now()
  WHERE symbol = NEW.symbol;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to sync price_data to market_data
DROP TRIGGER IF EXISTS sync_price_on_insert ON price_data;
CREATE TRIGGER sync_price_on_insert
AFTER INSERT ON price_data
FOR EACH ROW
EXECUTE FUNCTION sync_price_data_to_market_data();

-- Create function to ensure market_data updates price_data
CREATE OR REPLACE FUNCTION sync_market_data_to_price_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert into price_data with the new price
  INSERT INTO price_data (symbol, price, timestamp)
  VALUES (NEW.symbol, NEW.price, NEW.timestamp)
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to sync market_data to price_data
DROP TRIGGER IF EXISTS sync_market_price_on_update ON market_data;
CREATE TRIGGER sync_market_price_on_update
AFTER UPDATE OF price ON market_data
FOR EACH ROW
WHEN (NEW.price IS DISTINCT FROM OLD.price)
EXECUTE FUNCTION sync_market_data_to_price_data();

-- Update run_background_processes to ensure consistent price updates
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
  UPDATE futures_positions fp
  SET 
    current_price = md.price,
    unrealized_pnl = CASE 
      WHEN fp.side = 'long' THEN (md.price - fp.entry_price) * fp.amount * fp.leverage
      WHEN fp.side = 'short' THEN (fp.entry_price - md.price) * fp.amount * fp.leverage
      ELSE 0
    END,
    roi = CASE 
      WHEN fp.margin > 0 THEN 
        CASE 
          WHEN fp.side = 'long' THEN ((md.price - fp.entry_price) * fp.amount * fp.leverage) / fp.margin * 100
          WHEN fp.side = 'short' THEN ((fp.entry_price - md.price) * fp.amount * fp.leverage) / fp.margin * 100
          ELSE 0
        END
      ELSE 0
    END,
    updated_at = now()
  FROM market_data md
  WHERE fp.symbol = md.symbol 
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
  FROM market_data md
  WHERE so.pair = REPLACE(md.symbol, 'USDT', '/USDT')
    AND so.status = 'active'
    AND (
      (so.stop_type = 'stop_loss' AND md.price <= so.trigger_price) OR
      (so.stop_type = 'take_profit' AND md.price >= so.trigger_price)
    );

  -- Process futures orders
  PERFORM process_futures_orders();
END;
$$;