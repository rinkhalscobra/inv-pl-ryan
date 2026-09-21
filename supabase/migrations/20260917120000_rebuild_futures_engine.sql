/*
  Rebuild derivative execution around one reservation-based accounting model.

  Wallet balance remains account cash/equity. Open-position margin and open-order
  margin are reservations. Settlement applies only net PnL to wallet balance.
  All financial writes are performed by validated RPCs or service-role workers.
*/

ALTER TABLE public.futures_positions
  ADD COLUMN IF NOT EXISTS maintenance_margin_rate numeric NOT NULL DEFAULT 0.005,
  ADD COLUMN IF NOT EXISTS close_reason text;

ALTER TABLE public.futures_orders
  ADD COLUMN IF NOT EXISTS margin_type text NOT NULL DEFAULT 'isolated',
  ADD COLUMN IF NOT EXISTS reserved_margin numeric(20,8) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.futures_liquidation_price(
  p_side text,
  p_entry_price numeric,
  p_amount numeric,
  p_leverage integer,
  p_margin_type text,
  p_cross_collateral numeric DEFAULT 0,
  p_maintenance_rate numeric DEFAULT 0.005
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_price numeric;
  v_collateral numeric;
BEGIN
  IF p_side NOT IN ('long', 'short') OR p_entry_price <= 0 OR p_amount <= 0 OR p_leverage <= 0 THEN
    RAISE EXCEPTION 'Invalid liquidation inputs';
  END IF;

  IF p_margin_type = 'cross' AND COALESCE(p_cross_collateral, 0) > 0 THEN
    v_collateral := p_cross_collateral;
    IF p_side = 'long' THEN
      v_price := ((p_entry_price * p_amount) - v_collateral)
        / NULLIF(p_amount * (1 - p_maintenance_rate), 0);
    ELSE
      v_price := ((p_entry_price * p_amount) + v_collateral)
        / NULLIF(p_amount * (1 + p_maintenance_rate), 0);
    END IF;
  ELSIF p_side = 'long' THEN
    v_price := p_entry_price * (1 - (1.0 / p_leverage)) / (1 - p_maintenance_rate);
  ELSE
    v_price := p_entry_price * (1 + (1.0 / p_leverage)) / (1 + p_maintenance_rate);
  END IF;

  RETURN round(GREATEST(v_price, 0.00000001), 8);
END;
$$;

CREATE OR REPLACE FUNCTION public.place_derivative_order(
  p_user_id uuid,
  p_symbol text,
  p_side text,
  p_amount numeric,
  p_leverage integer,
  p_margin_type text,
  p_order_type text,
  p_market_price numeric,
  p_limit_price numeric DEFAULT NULL,
  p_stop_loss numeric DEFAULT NULL,
  p_take_profit numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_symbol text := upper(btrim(p_symbol));
  v_entry_price numeric;
  v_notional numeric;
  v_margin numeric;
  v_balance numeric;
  v_used_margin numeric;
  v_available numeric;
  v_min_leverage integer := 1;
  v_max_leverage integer := 100;
  v_instrument_type text;
  v_liquidation numeric;
  v_spread numeric;
  v_spread_percentage numeric;
  v_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'User is required'; END IF;
  IF v_symbol = '' OR p_side NOT IN ('long', 'short') THEN RAISE EXCEPTION 'Invalid market or side'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000000 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF p_margin_type NOT IN ('isolated', 'cross') THEN RAISE EXCEPTION 'Invalid margin mode'; END IF;
  IF p_order_type NOT IN ('market', 'limit') THEN RAISE EXCEPTION 'Invalid order type'; END IF;
  IF p_market_price IS NULL OR p_market_price <= 0 THEN RAISE EXCEPTION 'A verified market price is required'; END IF;

  SELECT lower(s.instrument_type) INTO v_instrument_type
  FROM public.instrument_spreads s
  WHERE upper(s.symbol) = v_symbol AND s.is_active = true
  LIMIT 1;

  SELECT
    CASE
      WHEN v_symbol LIKE '%USDT' THEN COALESCE(u.min_leverage_futures, 1)
      WHEN v_symbol ~ '^[A-Z]{3}/[A-Z]{3}$' THEN COALESCE(u.min_leverage_forex, 1)
      WHEN v_instrument_type = 'commodity' THEN COALESCE(u.min_leverage_commodities, 1)
      WHEN v_instrument_type = 'stock' THEN COALESCE(u.min_leverage_stocks, 1)
      ELSE 1
    END,
    CASE
      WHEN v_symbol LIKE '%USDT' THEN COALESCE(u.max_leverage_futures, 100)
      WHEN v_symbol ~ '^[A-Z]{3}/[A-Z]{3}$' THEN COALESCE(u.max_leverage_forex, 100)
      WHEN v_instrument_type = 'commodity' THEN COALESCE(u.max_leverage_commodities, 100)
      WHEN v_instrument_type = 'stock' THEN COALESCE(u.max_leverage_stocks, 100)
      ELSE 100
    END
  INTO v_min_leverage, v_max_leverage
  FROM public.users u
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  IF p_leverage < v_min_leverage OR p_leverage > v_max_leverage THEN
    RAISE EXCEPTION 'Leverage must be between %x and %x', v_min_leverage, v_max_leverage;
  END IF;

  v_entry_price := CASE WHEN p_order_type = 'limit' THEN p_limit_price ELSE p_market_price END;
  IF v_entry_price IS NULL OR v_entry_price <= 0 THEN RAISE EXCEPTION 'A valid limit price is required'; END IF;

  IF p_take_profit IS NOT NULL AND (
    (p_side = 'long' AND p_take_profit <= v_entry_price) OR
    (p_side = 'short' AND p_take_profit >= v_entry_price)
  ) THEN RAISE EXCEPTION 'Take-profit price is invalid for this side'; END IF;
  IF p_stop_loss IS NOT NULL AND (
    (p_side = 'long' AND p_stop_loss >= v_entry_price) OR
    (p_side = 'short' AND p_stop_loss <= v_entry_price)
  ) THEN RAISE EXCEPTION 'Stop-loss price is invalid for this side'; END IF;

  v_notional := public.calculate_derivative_notional_usd(v_symbol, p_amount, v_entry_price);
  IF v_notional < 1 THEN RAISE EXCEPTION 'Order notional must be at least 1 USD'; END IF;
  v_margin := round(v_notional / p_leverage, 8);

  SELECT b.usdt_balance INTO v_balance
  FROM public.balances b WHERE b.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet balance not found'; END IF;

  SELECT
    COALESCE((SELECT sum(fp.margin) FROM public.futures_positions fp
      WHERE fp.user_id = p_user_id AND fp.is_open = true), 0) +
    COALESCE((SELECT sum(fo.reserved_margin) FROM public.futures_orders fo
      WHERE fo.user_id = p_user_id AND fo.status = 'open'), 0)
  INTO v_used_margin;
  v_available := GREATEST(v_balance - v_used_margin, 0);
  IF v_margin > v_available THEN
    RAISE EXCEPTION 'Insufficient available margin. Required: %, Available: %', v_margin, v_available;
  END IF;

  IF p_order_type = 'limit' THEN
    INSERT INTO public.futures_orders(
      user_id, symbol, type, side, price, amount, leverage, margin_type,
      status, tp_price, sl_price, reserved_margin
    ) VALUES (
      p_user_id, v_symbol, 'limit', CASE WHEN p_side = 'long' THEN 'buy' ELSE 'sell' END,
      v_entry_price, p_amount, p_leverage, p_margin_type, 'open', p_take_profit,
      p_stop_loss, v_margin
    ) RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'kind', 'order', 'id', v_id, 'reserved_margin', v_margin);
  END IF;

  v_spread := public.calculate_derivative_spread_cost_usd(v_symbol, v_notional);
  SELECT COALESCE(s.spread_percentage, 0.0001) INTO v_spread_percentage
  FROM public.instrument_spreads s WHERE upper(s.symbol) = v_symbol AND s.is_active = true LIMIT 1;
  v_spread_percentage := COALESCE(v_spread_percentage, 0.0001);
  v_liquidation := public.futures_liquidation_price(
    p_side, v_entry_price, p_amount, p_leverage, p_margin_type,
    CASE WHEN p_margin_type = 'cross' THEN v_available ELSE v_margin END,
    0.005
  );

  INSERT INTO public.futures_positions(
    user_id, symbol, side, entry_price, current_price, amount, leverage,
    margin_type, liquidation_price, unrealized_pnl, margin, roi, is_open,
    position_size, tp_price, sl_price, spread_cost, spread_percentage,
    maintenance_margin_rate, swap_accrued_at
  ) VALUES (
    p_user_id, v_symbol, p_side, v_entry_price, p_market_price, p_amount,
    p_leverage, p_margin_type, v_liquidation, -v_spread, v_margin,
    CASE WHEN v_margin > 0 THEN (-v_spread / v_margin) * 100 ELSE 0 END,
    true, v_notional, p_take_profit, p_stop_loss, v_spread,
    v_spread_percentage, 0.005, now()
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'kind', 'position', 'id', v_id, 'margin', v_margin);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_futures_order(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.futures_orders
  SET status = 'cancelled'
  WHERE id = p_order_id AND user_id = v_user_id AND status = 'open';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_all_futures_orders(p_symbol text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.futures_orders
  SET status = 'cancelled'
  WHERE user_id = v_user_id AND status = 'open'
    AND (p_symbol IS NULL OR symbol = upper(p_symbol));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_futures_risk(
  p_position_id uuid,
  p_stop_loss numeric DEFAULT NULL,
  p_take_profit numeric DEFAULT NULL,
  p_update_stop_loss boolean DEFAULT false,
  p_update_take_profit boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_position public.futures_positions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_position FROM public.futures_positions
  WHERE id = p_position_id AND user_id = v_user_id AND is_open = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Open position not found'; END IF;

  IF p_update_take_profit AND p_take_profit IS NOT NULL AND (
    (v_position.side = 'long' AND p_take_profit <= v_position.entry_price) OR
    (v_position.side = 'short' AND p_take_profit >= v_position.entry_price)
  ) THEN RAISE EXCEPTION 'Take-profit price is invalid for this position'; END IF;
  IF p_update_stop_loss AND p_stop_loss IS NOT NULL AND (
    (v_position.side = 'long' AND p_stop_loss >= v_position.entry_price) OR
    (v_position.side = 'short' AND p_stop_loss <= v_position.entry_price)
  ) THEN RAISE EXCEPTION 'Stop-loss price is invalid for this position'; END IF;

  UPDATE public.futures_positions
  SET sl_price = CASE WHEN p_update_stop_loss THEN p_stop_loss ELSE sl_price END,
      tp_price = CASE WHEN p_update_take_profit THEN p_take_profit ELSE tp_price END,
      updated_at = now()
  WHERE id = p_position_id;
  RETURN true;
END;
$$;

/* Settlement is idempotent through the open-row lock. Entry and exit spread,
   continuously accrued swap, and raw price PnL are all included exactly once. */
DROP FUNCTION IF EXISTS public.close_futures_position(uuid, numeric);
CREATE FUNCTION public.close_futures_position(position_id uuid, exit_price numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_engine boolean := COALESCE(current_setting('app.futures_engine', true), '') = 'on';
  v_position public.futures_positions%ROWTYPE;
  v_market_price numeric;
  v_market_time timestamptz;
  v_tolerance numeric;
  v_notional numeric;
  v_pending_swap numeric;
  v_total_swap numeric;
  v_exit_spread numeric;
  v_total_spread numeric;
  v_gross_pnl numeric;
  v_net_pnl numeric;
  v_roi numeric;
  v_duration integer;
  v_referrer_id uuid;
  v_commission_rate numeric;
  v_commission_amount numeric;
  v_wallet_balance numeric;
BEGIN
  IF v_caller_id IS NULL AND NOT v_service AND NOT v_engine THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF exit_price IS NULL OR exit_price <= 0 THEN RAISE EXCEPTION 'Invalid exit price'; END IF;

  SELECT * INTO v_position FROM public.futures_positions fp
  WHERE fp.id = position_id AND fp.is_open = true
    AND (v_service OR v_engine OR fp.user_id = v_caller_id)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Open position not found'; END IF;

  SELECT md.price, md.timestamp
  INTO v_market_price, v_market_time
  FROM public.market_data md WHERE md.symbol = v_position.symbol
  ORDER BY md.updated_at DESC NULLS LAST, md.timestamp DESC LIMIT 1;
  IF v_market_price IS NULL OR v_market_time IS NULL
    OR v_market_time < now() - interval '2 minutes'
    OR v_market_time > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'A fresh server market quote is required';
  END IF;
  v_tolerance := CASE WHEN v_position.symbol LIKE '%USDT' THEN 0.005 ELSE 0.003 END;
  IF abs(exit_price - v_market_price) / v_market_price > v_tolerance THEN
    RAISE EXCEPTION 'Exit quote is outside the current market tolerance';
  END IF;

  v_notional := public.calculate_derivative_notional_usd(v_position.symbol, v_position.amount, exit_price);
  v_pending_swap := v_notional * public.derivative_swap_rate(v_position.symbol)
    * GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(v_position.swap_accrued_at, v_position.created_at))), 0) / 86400;
  v_total_swap := COALESCE(v_position.accumulated_swap_cost, 0) + v_pending_swap;
  v_exit_spread := public.calculate_derivative_spread_cost_usd(v_position.symbol, v_notional);
  v_total_spread := COALESCE(v_position.spread_cost, 0) + v_exit_spread;
  v_gross_pnl := public.calculate_derivative_pnl_usd(
    v_position.symbol, v_position.side, v_position.entry_price, exit_price, v_position.amount
  );
  SELECT b.usdt_balance INTO v_wallet_balance
  FROM public.balances b WHERE b.user_id = v_position.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet balance not found'; END IF;

  /* Isolated loss is capped by isolated collateral. Cross margin can consume
     account collateral, but never make the cash ledger negative. */
  v_net_pnl := GREATEST(
    v_gross_pnl - v_total_spread - v_total_swap,
    CASE WHEN v_position.margin_type = 'cross' THEN -v_wallet_balance ELSE -v_position.margin END
  );
  v_roi := CASE WHEN v_position.margin > 0 THEN v_net_pnl / v_position.margin * 100 ELSE 0 END;
  v_duration := GREATEST(EXTRACT(EPOCH FROM (now() - v_position.created_at))::integer, 0);

  UPDATE public.balances
  SET usdt_balance = GREATEST(usdt_balance + v_net_pnl, 0), updated_at = now()
  WHERE user_id = v_position.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet balance not found'; END IF;

  INSERT INTO public.futures_position_history(
    id, user_id, symbol, side, entry_price, exit_price, amount, leverage, margin,
    pnl, roi, open_time, close_time, duration_seconds, spread_cost,
    spread_percentage, accumulated_swap_cost, total_swap_days
  ) VALUES (
    v_position.id, v_position.user_id, v_position.symbol, v_position.side,
    v_position.entry_price, exit_price, v_position.amount, v_position.leverage,
    v_position.margin, v_net_pnl, v_roi, v_position.created_at, now(), v_duration,
    v_total_spread, v_position.spread_percentage, v_total_swap,
    floor(v_duration / 86400.0)::integer
  ) ON CONFLICT (id) DO NOTHING;

  UPDATE public.futures_positions
  SET is_open = false, current_price = exit_price, unrealized_pnl = v_net_pnl,
      roi = v_roi, accumulated_swap_cost = v_total_swap, swap_accrued_at = now(),
      updated_at = now()
  WHERE id = position_id;

  SELECT u.referred_by INTO v_referrer_id FROM public.users u WHERE u.id = v_position.user_id;
  IF v_referrer_id IS NOT NULL AND v_net_pnl > 0 THEN
    SELECT CASE WHEN u.total_referred_users >= 100 THEN 0.25
      WHEN u.total_referred_users >= 50 THEN 0.20 WHEN u.total_referred_users >= 20 THEN 0.15
      WHEN u.total_referred_users >= 10 THEN 0.10 ELSE 0.05 END
    INTO v_commission_rate FROM public.users u WHERE u.id = v_referrer_id;
    v_commission_amount := v_net_pnl * COALESCE(v_commission_rate, 0);
    IF v_commission_amount > 0 AND NOT EXISTS (
      SELECT 1 FROM public.referral_earnings re WHERE re.source_transaction_id = position_id
    ) THEN
      INSERT INTO public.referral_earnings(
        referrer_id, referred_user_id, earning_type, amount, commission_rate,
        source_transaction_id, created_at
      ) VALUES (
        v_referrer_id, v_position.user_id, 'futures_trading', v_commission_amount,
        v_commission_rate, position_id, now()
      );
      UPDATE public.balances SET usdt_balance = usdt_balance + v_commission_amount, updated_at = now()
      WHERE user_id = v_referrer_id;
    END IF;
  END IF;

  RETURN v_net_pnl;
END;
$$;

/* Execute pending limits, mark live PnL using the same settlement formula, then
   process TP/SL and maintenance-margin liquidations. Stale quotes are ignored. */
CREATE OR REPLACE FUNCTION public.process_futures_engine()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.futures_orders%ROWTYPE;
  v_position public.futures_positions%ROWTYPE;
  v_cross record;
  v_price numeric;
  v_price_time timestamptz;
  v_notional numeric;
  v_margin numeric;
  v_balance numeric;
  v_other_reserved numeric;
  v_spread numeric;
  v_spread_percentage numeric;
  v_liquidation numeric;
  v_position_id uuid;
  v_filled integer := 0;
  v_closed integer := 0;
BEGIN
  /* Lets the scheduled SECURITY DEFINER worker use the same audited settlement
     path without making that path callable anonymously. Transaction-local. */
  PERFORM set_config('app.futures_engine', 'on', true);

  FOR v_order IN
    SELECT * FROM public.futures_orders
    WHERE status = 'open' AND type = 'limit'
    ORDER BY created_at FOR UPDATE SKIP LOCKED
  LOOP
    SELECT md.price, md.timestamp INTO v_price, v_price_time
    FROM public.market_data md WHERE md.symbol = v_order.symbol
    ORDER BY md.updated_at DESC NULLS LAST, md.timestamp DESC LIMIT 1;
    IF v_price IS NULL OR v_price_time IS NULL
      OR v_price_time < now() - interval '2 minutes'
      OR v_price_time > now() + interval '1 minute' THEN CONTINUE; END IF;
    IF NOT ((v_order.side = 'buy' AND v_price <= v_order.price) OR
            (v_order.side = 'sell' AND v_price >= v_order.price)) THEN CONTINUE; END IF;

    SELECT b.usdt_balance INTO v_balance FROM public.balances b
    WHERE b.user_id = v_order.user_id FOR UPDATE;
    SELECT
      COALESCE((SELECT sum(fp.margin) FROM public.futures_positions fp
        WHERE fp.user_id = v_order.user_id AND fp.is_open = true), 0) +
      COALESCE((SELECT sum(fo.reserved_margin) FROM public.futures_orders fo
        WHERE fo.user_id = v_order.user_id AND fo.status = 'open' AND fo.id <> v_order.id), 0)
    INTO v_other_reserved;
    v_margin := v_order.reserved_margin;
    IF v_margin <= 0 THEN
      v_margin := public.calculate_derivative_notional_usd(v_order.symbol, v_order.amount, v_order.price) / v_order.leverage;
    END IF;
    IF v_balance - v_other_reserved < v_margin THEN
      UPDATE public.futures_orders SET status = 'cancelled' WHERE id = v_order.id;
      CONTINUE;
    END IF;

    v_notional := public.calculate_derivative_notional_usd(v_order.symbol, v_order.amount, v_order.price);
    v_spread := public.calculate_derivative_spread_cost_usd(v_order.symbol, v_notional);
    SELECT COALESCE(s.spread_percentage, 0.0001) INTO v_spread_percentage
    FROM public.instrument_spreads s WHERE upper(s.symbol) = upper(v_order.symbol) AND s.is_active = true LIMIT 1;
    v_spread_percentage := COALESCE(v_spread_percentage, 0.0001);
    v_liquidation := public.futures_liquidation_price(
      CASE WHEN v_order.side = 'buy' THEN 'long' ELSE 'short' END,
      v_order.price, v_order.amount, v_order.leverage, v_order.margin_type,
      CASE WHEN v_order.margin_type = 'cross' THEN GREATEST(v_balance - v_other_reserved, v_margin) ELSE v_margin END,
      0.005
    );

    INSERT INTO public.futures_positions(
      user_id, symbol, side, entry_price, current_price, amount, leverage,
      margin_type, liquidation_price, unrealized_pnl, margin, roi, is_open,
      position_size, tp_price, sl_price, spread_cost, spread_percentage,
      maintenance_margin_rate, swap_accrued_at
    ) VALUES (
      v_order.user_id, v_order.symbol,
      CASE WHEN v_order.side = 'buy' THEN 'long' ELSE 'short' END,
      v_order.price, v_price, v_order.amount, v_order.leverage, v_order.margin_type,
      v_liquidation, -v_spread, v_margin,
      CASE WHEN v_margin > 0 THEN (-v_spread / v_margin) * 100 ELSE 0 END,
      true, v_notional, v_order.tp_price, v_order.sl_price, v_spread,
      v_spread_percentage, 0.005, now()
    ) RETURNING id INTO v_position_id;
    UPDATE public.futures_orders SET status = 'filled', filled_at = now(), position_id = v_position_id
    WHERE id = v_order.id AND status = 'open';
    v_filled := v_filled + 1;
  END LOOP;

  UPDATE public.futures_positions fp
  SET current_price = md.price,
      unrealized_pnl = GREATEST(
        public.calculate_derivative_pnl_usd(fp.symbol, fp.side, fp.entry_price, md.price, fp.amount)
        - COALESCE(fp.spread_cost, 0)
        - public.calculate_derivative_spread_cost_usd(
            fp.symbol, public.calculate_derivative_notional_usd(fp.symbol, fp.amount, md.price))
        - COALESCE(fp.accumulated_swap_cost, 0)
        - (public.calculate_derivative_notional_usd(fp.symbol, fp.amount, md.price)
          * public.derivative_swap_rate(fp.symbol)
          * GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(fp.swap_accrued_at, fp.created_at))), 0) / 86400),
        -fp.margin
      ),
      roi = CASE WHEN fp.margin > 0 THEN GREATEST(
        public.calculate_derivative_pnl_usd(fp.symbol, fp.side, fp.entry_price, md.price, fp.amount)
        - COALESCE(fp.spread_cost, 0)
        - public.calculate_derivative_spread_cost_usd(
            fp.symbol, public.calculate_derivative_notional_usd(fp.symbol, fp.amount, md.price))
        - COALESCE(fp.accumulated_swap_cost, 0)
        - (public.calculate_derivative_notional_usd(fp.symbol, fp.amount, md.price)
          * public.derivative_swap_rate(fp.symbol)
          * GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(fp.swap_accrued_at, fp.created_at))), 0) / 86400),
        -fp.margin
      ) / fp.margin * 100 ELSE 0 END,
      updated_at = now()
  FROM public.market_data md
  WHERE fp.symbol = md.symbol AND fp.is_open = true
    AND md.timestamp BETWEEN now() - interval '2 minutes' AND now() + interval '1 minute';

  FOR v_position IN
    SELECT * FROM public.futures_positions WHERE is_open = true FOR UPDATE SKIP LOCKED
  LOOP
    SELECT md.price, md.timestamp INTO v_price, v_price_time
    FROM public.market_data md WHERE md.symbol = v_position.symbol
    ORDER BY md.updated_at DESC NULLS LAST, md.timestamp DESC LIMIT 1;
    IF v_price IS NULL OR v_price_time IS NULL
      OR v_price_time < now() - interval '2 minutes'
      OR v_price_time > now() + interval '1 minute' THEN CONTINUE; END IF;

    IF (v_position.tp_price IS NOT NULL AND (
          (v_position.side = 'long' AND v_price >= v_position.tp_price) OR
          (v_position.side = 'short' AND v_price <= v_position.tp_price)))
       OR (v_position.sl_price IS NOT NULL AND (
          (v_position.side = 'long' AND v_price <= v_position.sl_price) OR
          (v_position.side = 'short' AND v_price >= v_position.sl_price)))
       OR (v_position.margin_type = 'isolated' AND v_position.unrealized_pnl <= -v_position.margin)
    THEN
      PERFORM public.close_futures_position(v_position.id, v_price);
      v_closed := v_closed + 1;
    END IF;
  END LOOP;

  /* Cross positions liquidate together when account equity falls below total
     maintenance margin. */
  FOR v_cross IN
    SELECT fp.user_id AS id,
      b.usdt_balance + sum(fp.unrealized_pnl) AS entry_price,
      sum(public.calculate_derivative_notional_usd(fp.symbol, fp.amount, fp.current_price)
        * COALESCE(fp.maintenance_margin_rate, 0.005)) AS current_price
    FROM public.futures_positions fp
    JOIN public.balances b ON b.user_id = fp.user_id
    WHERE fp.is_open = true AND fp.margin_type = 'cross'
    GROUP BY fp.user_id, b.usdt_balance
  LOOP
    IF v_cross.entry_price <= v_cross.current_price THEN
      FOR v_position_id IN
        SELECT fp.id FROM public.futures_positions fp
        WHERE fp.user_id = v_cross.id AND fp.is_open = true AND fp.margin_type = 'cross'
        FOR UPDATE SKIP LOCKED
      LOOP
        SELECT fp.current_price INTO v_price FROM public.futures_positions fp WHERE fp.id = v_position_id;
        PERFORM public.close_futures_position(v_position_id, v_price);
        v_closed := v_closed + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'filled', v_filled, 'closed', v_closed, 'processed_at', now());
END;
$$;

/* Browser users may read their rows, but cannot manufacture financial rows. */
DROP POLICY IF EXISTS "Users can manage own futures positions" ON public.futures_positions;
DROP POLICY IF EXISTS "Users can view own futures positions" ON public.futures_positions;
CREATE POLICY "Users can view own futures positions"
  ON public.futures_positions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own futures orders" ON public.futures_orders;
DROP POLICY IF EXISTS "Users can view own futures orders" ON public.futures_orders;
CREATE POLICY "Users can view own futures orders"
  ON public.futures_orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON FUNCTION public.place_derivative_order(uuid,text,text,numeric,integer,text,text,numeric,numeric,numeric,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_derivative_order(uuid,text,text,numeric,integer,text,text,numeric,numeric,numeric,numeric) TO service_role;
REVOKE ALL ON FUNCTION public.process_futures_engine() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_futures_engine() TO service_role;
REVOKE ALL ON FUNCTION public.cancel_futures_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_futures_order(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_all_futures_orders(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_all_futures_orders(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_futures_risk(uuid,numeric,numeric,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_futures_risk(uuid,numeric,numeric,boolean,boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.close_futures_position(uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_futures_position(uuid,numeric) TO authenticated, service_role;

/* Database processing is inexpensive and makes fills/risk checks independent
   from an open browser. Quote synchronization remains one centralized Edge job. */
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
DO $$
DECLARE v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'process-futures-engine';
  IF v_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_job_id); END IF;
END;
$$;
SELECT cron.schedule(
  'process-futures-engine',
  '* * * * *',
  'SELECT public.process_futures_engine();'
);

NOTIFY pgrst, 'reload schema';
