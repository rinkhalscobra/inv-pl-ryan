/*
  Keep derivative valuation, swap accrual, and settlement on one USD-ledger model.
  The UI converts that ledger value to EUR for display.
*/

ALTER TABLE public.futures_positions
  ADD COLUMN IF NOT EXISTS swap_accrued_at timestamptz;

UPDATE public.futures_positions
SET swap_accrued_at = CASE
  WHEN last_swap_charge_date IS NOT NULL THEN last_swap_charge_date::timestamptz
  ELSE created_at
END
WHERE swap_accrued_at IS NULL;

ALTER TABLE public.futures_positions
  ALTER COLUMN swap_accrued_at SET DEFAULT now();

CREATE OR REPLACE FUNCTION public.derivative_swap_rate(p_symbol text)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_symbol text := upper(p_symbol);
  v_type text;
BEGIN
  IF v_symbol LIKE '%USDT' THEN RETURN 0.0003; END IF;
  IF v_symbol IN ('XAU/USD', 'XAUUSD', 'XAG/USD', 'NATGAS/USD', 'BCO/USD', 'WTICO/USD',
                  'XPT/USD', 'XPD/USD', 'CORN/USD', 'WHEAT/USD', 'SUGAR/USD') THEN
    RETURN 0.0002;
  END IF;
  IF v_symbol IN ('CAC', 'ASX', 'SPY', 'QQQ', 'DIA', 'IWM', 'VTI', 'ARKK', 'XLK', 'XLF',
                  'XLE', 'XLY', 'XLP', 'XLV', 'XLI', 'XLB', 'XLU', 'IYR', 'SMH', 'SOXX',
                  'TLT', 'HYG', 'GLD', 'SLV', 'BITO', 'SPYD', 'JEPI', 'VOO', 'NI225',
                  'STOXX50', 'KOSPI') THEN
    RETURN 0.0001;
  END IF;
  IF v_symbol ~ '^[A-Z]{3}/[A-Z]{3}$' THEN
    IF v_symbol IN ('USD/TRY', 'EUR/TRY', 'USD/ZAR', 'USD/HKD', 'USD/SGD', 'USD/DKK',
                    'USD/NOK', 'USD/SEK', 'USD/PLN', 'USD/HUF', 'USD/CZK', 'USD/MXN',
                    'USD/BRL', 'USD/CNH', 'USD/THB', 'USD/IDR', 'USD/TWD', 'USD/KRW',
                    'USD/INR', 'USD/PHP', 'USD/MYR', 'USD/SAR', 'USD/AED', 'USD/QAR',
                    'USD/ILS', 'EUR/ILS', 'USD/CLP', 'USD/COP', 'USD/PEN', 'EUR/ZAR',
                    'GBP/ZAR', 'AUD/ZAR') THEN
      RETURN 0.0001;
    END IF;
    RETURN 0.00002;
  END IF;

  SELECT lower(s.instrument_type) INTO v_type
  FROM public.instrument_spreads s
  WHERE upper(s.symbol) = v_symbol AND s.is_active = true
  LIMIT 1;

  RETURN CASE v_type
    WHEN 'commodity' THEN 0.0002
    WHEN 'index' THEN 0.0001
    WHEN 'stock' THEN 0.00015
    ELSE 0.00015
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.derivative_usd_per_currency(p_currency text)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_currency text := upper(p_currency);
  v_rate numeric;
BEGIN
  IF v_currency IN ('USD', 'USDT') THEN RETURN 1; END IF;

  SELECT md.price INTO v_rate
  FROM public.market_data md
  WHERE md.symbol = v_currency || '/USD' AND md.price > 0
  ORDER BY md.updated_at DESC NULLS LAST, md.timestamp DESC
  LIMIT 1;
  IF v_rate > 0 THEN RETURN v_rate; END IF;

  SELECT md.price INTO v_rate
  FROM public.market_data md
  WHERE md.symbol = 'USD/' || v_currency AND md.price > 0
  ORDER BY md.updated_at DESC NULLS LAST, md.timestamp DESC
  LIMIT 1;
  IF v_rate > 0 THEN RETURN 1 / v_rate; END IF;

  RAISE EXCEPTION 'No USD conversion quote is available for %', v_currency;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_derivative_notional_usd(
  p_symbol text,
  p_amount numeric,
  p_price numeric
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_base text;
  v_quote text;
BEGIN
  IF p_amount <= 0 OR p_price <= 0 THEN RETURN 0; END IF;
  IF upper(p_symbol) !~ '^[A-Z]{3}/[A-Z]{3}$' OR upper(p_symbol) IN ('XAU/USD', 'XAG/USD', 'XPT/USD', 'XPD/USD') THEN
    RETURN p_amount * p_price;
  END IF;

  v_base := split_part(upper(p_symbol), '/', 1);
  v_quote := split_part(upper(p_symbol), '/', 2);
  IF v_base = 'USD' THEN RETURN p_amount; END IF;
  IF v_quote = 'USD' THEN RETURN p_amount * p_price; END IF;
  RETURN p_amount * p_price * public.derivative_usd_per_currency(v_quote);
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_derivative_pnl_usd(
  p_symbol text,
  p_side text,
  p_entry_price numeric,
  p_current_price numeric,
  p_amount numeric
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pnl numeric;
  v_quote text;
BEGIN
  IF p_side NOT IN ('long', 'short') THEN RAISE EXCEPTION 'Invalid position side'; END IF;
  v_pnl := CASE WHEN p_side = 'long'
    THEN (p_current_price - p_entry_price) * p_amount
    ELSE (p_entry_price - p_current_price) * p_amount
  END;

  IF upper(p_symbol) ~ '^[A-Z]{3}/[A-Z]{3}$' AND upper(p_symbol) NOT IN ('XAU/USD', 'XAG/USD', 'XPT/USD', 'XPD/USD') THEN
    v_quote := split_part(upper(p_symbol), '/', 2);
    IF v_quote <> 'USD' THEN
      v_pnl := v_pnl * public.derivative_usd_per_currency(v_quote);
    END IF;
  END IF;
  RETURN v_pnl;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_derivative_spread_cost_usd(
  p_symbol text,
  p_notional_usd numeric
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_percentage numeric;
  v_min numeric;
  v_max numeric;
BEGIN
  SELECT s.spread_percentage, s.min_spread_value, s.max_spread_value
  INTO v_percentage, v_min, v_max
  FROM public.instrument_spreads s
  WHERE s.symbol = p_symbol AND s.is_active = true
  LIMIT 1;

  v_percentage := COALESCE(v_percentage, 0.0001);
  v_min := COALESCE(v_min, 0.00000001);
  v_max := COALESCE(v_max, 999999.99999999);
  RETURN LEAST(GREATEST(p_notional_usd * v_percentage, v_min), v_max);
END;
$$;

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
    SELECT md.price, COALESCE(md.timestamp, md.updated_at)
    INTO v_market_price, v_market_time
    FROM public.market_data md WHERE md.symbol = p_symbol
    ORDER BY md.timestamp DESC NULLS LAST, md.updated_at DESC LIMIT 1;
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

CREATE OR REPLACE FUNCTION public.accrue_position_swap(p_position_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_position public.futures_positions%ROWTYPE;
  v_charge numeric;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  SELECT * INTO v_position FROM public.futures_positions
  WHERE id = p_position_id AND is_open = true FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;

  v_charge := public.calculate_derivative_notional_usd(v_position.symbol, v_position.amount, v_position.current_price)
    * public.derivative_swap_rate(v_position.symbol)
    * GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(v_position.swap_accrued_at, v_position.created_at))), 0) / 86400;

  UPDATE public.futures_positions
  SET accumulated_swap_cost = COALESCE(accumulated_swap_cost, 0) + v_charge,
      swap_accrued_at = now(), last_swap_charge_date = current_date, updated_at = now()
  WHERE id = p_position_id;
  RETURN v_charge;
END;
$$;

DROP FUNCTION IF EXISTS public.close_futures_position(uuid, numeric);
CREATE FUNCTION public.close_futures_position(position_id uuid, exit_price numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
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
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF exit_price IS NULL OR exit_price <= 0 THEN RAISE EXCEPTION 'Invalid exit price'; END IF;

  SELECT * INTO v_position FROM public.futures_positions
  WHERE id = position_id AND user_id = v_user_id AND is_open = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Open position not found'; END IF;

  SELECT md.price, COALESCE(md.timestamp, md.updated_at)
  INTO v_market_price, v_market_updated_at
  FROM public.market_data md WHERE md.symbol = v_position.symbol
  ORDER BY md.updated_at DESC NULLS LAST, md.timestamp DESC LIMIT 1;

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
  WHERE user_id = v_user_id;
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
  );

  UPDATE public.futures_positions
  SET is_open = false, current_price = exit_price, unrealized_pnl = v_net_pnl,
      roi = v_roi, accumulated_swap_cost = v_total_swap, swap_accrued_at = now(),
      updated_at = now()
  WHERE id = position_id;

  RETURN v_net_pnl;
END;
$$;

REVOKE ALL ON FUNCTION public.derivative_swap_rate(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.derivative_usd_per_currency(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.calculate_derivative_notional_usd(text, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.calculate_derivative_pnl_usd(text, text, numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.calculate_derivative_spread_cost_usd(text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_position_current_price(text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accrue_position_swap(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_futures_position(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.derivative_swap_rate(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.derivative_usd_per_currency(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_derivative_notional_usd(text, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_derivative_pnl_usd(text, text, numeric, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_derivative_spread_cost_usd(text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_position_current_price(text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accrue_position_swap(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.close_futures_position(uuid, numeric) TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'market_data'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.market_data;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
