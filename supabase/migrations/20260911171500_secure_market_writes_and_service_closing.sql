/* Keep settlement prices server-owned and allow trusted automation to close positions. */

DROP POLICY IF EXISTS "Authenticated users can insert market data" ON public.market_data;
DROP POLICY IF EXISTS "Authenticated users can update market data" ON public.market_data;

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
  v_position public.futures_positions%ROWTYPE;
  v_market_price numeric;
  v_market_updated_at timestamptz;
  v_tolerance numeric;
  v_notional numeric;
  v_pending_swap numeric;
  v_total_swap numeric;
  v_total_spread numeric;
  v_gross_pnl numeric;
  v_net_pnl numeric;
  v_roi numeric;
  v_duration integer;
  v_referrer_id uuid;
  v_commission_rate numeric;
  v_commission_amount numeric;
BEGIN
  IF v_caller_id IS NULL AND NOT v_service THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF exit_price IS NULL OR exit_price <= 0 THEN RAISE EXCEPTION 'Invalid exit price'; END IF;

  SELECT * INTO v_position
  FROM public.futures_positions fp
  WHERE fp.id = position_id
    AND fp.is_open = true
    AND (v_service OR fp.user_id = v_caller_id)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Open position not found'; END IF;

  SELECT md.price, COALESCE(md.updated_at, md.timestamp)
  INTO v_market_price, v_market_updated_at
  FROM public.market_data md
  WHERE md.symbol = v_position.symbol
  ORDER BY md.updated_at DESC NULLS LAST, md.timestamp DESC
  LIMIT 1;

  IF v_market_price IS NULL OR v_market_updated_at IS NULL OR v_market_updated_at < now() - interval '2 minutes' THEN
    RAISE EXCEPTION 'A fresh market quote is required to close this position';
  END IF;
  v_tolerance := CASE WHEN v_position.symbol LIKE '%USDT' THEN 0.02 ELSE 0.005 END;
  IF abs(exit_price - v_market_price) / v_market_price > v_tolerance THEN
    RAISE EXCEPTION 'Exit quote is outside the current market tolerance';
  END IF;

  v_notional := public.calculate_derivative_notional_usd(v_position.symbol, v_position.amount, exit_price);
  v_pending_swap := v_notional * public.derivative_swap_rate(v_position.symbol)
    * GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(v_position.swap_accrued_at, v_position.created_at))), 0) / 86400;
  v_total_swap := COALESCE(v_position.accumulated_swap_cost, 0) + v_pending_swap;
  v_total_spread := COALESCE(v_position.spread_cost, 0)
    + public.calculate_derivative_spread_cost_usd(v_position.symbol, v_notional);
  v_gross_pnl := public.calculate_derivative_pnl_usd(
    v_position.symbol, v_position.side, v_position.entry_price, exit_price, v_position.amount
  );
  v_net_pnl := GREATEST(v_gross_pnl - v_total_spread - v_total_swap, -v_position.margin);
  v_roi := CASE WHEN v_position.margin > 0 THEN v_net_pnl / v_position.margin * 100 ELSE 0 END;
  v_duration := GREATEST(EXTRACT(EPOCH FROM (now() - v_position.created_at))::integer, 0);

  UPDATE public.balances
  SET usdt_balance = usdt_balance + v_net_pnl, updated_at = now()
  WHERE user_id = v_position.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet balance not found'; END IF;

  SELECT u.referred_by INTO v_referrer_id
  FROM public.users u
  WHERE u.id = v_position.user_id;

  IF v_referrer_id IS NOT NULL AND v_net_pnl > 0 THEN
    SELECT CASE
      WHEN u.total_referred_users >= 100 THEN 0.25
      WHEN u.total_referred_users >= 50 THEN 0.20
      WHEN u.total_referred_users >= 20 THEN 0.15
      WHEN u.total_referred_users >= 10 THEN 0.10
      ELSE 0.05
    END INTO v_commission_rate
    FROM public.users u
    WHERE u.id = v_referrer_id;

    IF v_commission_rate IS NOT NULL THEN
      v_commission_amount := v_net_pnl * v_commission_rate;
      INSERT INTO public.referral_earnings(
        referrer_id, referred_user_id, earning_type, amount,
        commission_rate, source_transaction_id, created_at
      ) VALUES (
        v_referrer_id, v_position.user_id, 'futures_trading', v_commission_amount,
        v_commission_rate, position_id, now()
      );
      UPDATE public.balances
      SET usdt_balance = usdt_balance + v_commission_amount, updated_at = now()
      WHERE user_id = v_referrer_id;
    END IF;
  END IF;

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
  );

  UPDATE public.futures_positions
  SET is_open = false, current_price = exit_price, unrealized_pnl = v_net_pnl,
      roi = v_roi, accumulated_swap_cost = v_total_swap, swap_accrued_at = now(),
      updated_at = now()
  WHERE id = position_id;

  RETURN v_net_pnl;
END;
$$;

REVOKE ALL ON FUNCTION public.close_futures_position(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_futures_position(uuid, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_position_current_price(
  p_symbol text,
  p_current_price numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_market_price numeric;
  v_market_time timestamptz;
  v_tolerance numeric;
BEGIN
  IF p_current_price IS NULL OR p_current_price <= 0 THEN RAISE EXCEPTION 'Invalid market price'; END IF;
  IF v_user_id IS NULL AND NOT v_service THEN RAISE EXCEPTION 'Authentication required'; END IF;

  IF NOT v_service THEN
    SELECT md.price, COALESCE(md.updated_at, md.timestamp)
    INTO v_market_price, v_market_time
    FROM public.market_data md WHERE md.symbol = p_symbol
    ORDER BY md.updated_at DESC NULLS LAST, md.timestamp DESC LIMIT 1;
    IF v_market_price IS NULL OR v_market_time IS NULL OR v_market_time < now() - interval '2 minutes' THEN
      RAISE EXCEPTION 'A fresh market quote is required';
    END IF;
    v_tolerance := CASE WHEN p_symbol LIKE '%USDT' THEN 0.02 ELSE 0.005 END;
    IF abs(p_current_price - v_market_price) / v_market_price > v_tolerance THEN
      RAISE EXCEPTION 'Market quote is outside the allowed tolerance';
    END IF;
  END IF;

  UPDATE public.futures_positions fp
  SET current_price = p_current_price,
      unrealized_pnl = public.calculate_derivative_pnl_usd(fp.symbol, fp.side, fp.entry_price, p_current_price, fp.amount)
        - COALESCE(fp.accumulated_swap_cost, 0)
        - (public.calculate_derivative_notional_usd(fp.symbol, fp.amount, p_current_price)
           * public.derivative_swap_rate(fp.symbol)
           * GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(fp.swap_accrued_at, fp.created_at))), 0) / 86400),
      roi = CASE WHEN fp.margin > 0 THEN (
        public.calculate_derivative_pnl_usd(fp.symbol, fp.side, fp.entry_price, p_current_price, fp.amount)
        - COALESCE(fp.accumulated_swap_cost, 0)
        - (public.calculate_derivative_notional_usd(fp.symbol, fp.amount, p_current_price)
           * public.derivative_swap_rate(fp.symbol)
           * GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(fp.swap_accrued_at, fp.created_at))), 0) / 86400)
      ) / fp.margin * 100 ELSE 0 END,
      updated_at = now()
  WHERE fp.symbol = p_symbol AND fp.is_open = true
    AND (v_service OR fp.user_id = v_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_position_current_price(text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_position_current_price(text, numeric) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
