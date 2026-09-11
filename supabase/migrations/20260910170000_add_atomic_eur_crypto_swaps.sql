/* Settle EUR/crypto and crypto/crypto swaps atomically with server-side prices. */

CREATE OR REPLACE FUNCTION public.execute_asset_swap(
  p_from_symbol text,
  p_to_symbol text,
  p_from_amount numeric,
  p_expected_to_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_from_symbol text := upper(btrim(p_from_symbol));
  v_to_symbol text := upper(btrim(p_to_symbol));
  v_allowed_symbols constant text[] := ARRAY[
    'EUR', 'BTC', 'ETH', 'USDC', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE',
    'AVAX', 'MATIC', 'TRX', 'DOT', 'SHIB', 'TON', 'APT', 'ARB', 'OP',
    'LTC', 'PEPE'
  ];
  v_from_price numeric;
  v_to_price numeric;
  v_from_balance numeric;
  v_to_amount numeric;
  v_from_value_usd numeric;
  v_eur_usd_rate numeric;
  v_fee_rate constant numeric := 0.001;
  v_fiat_balance_usd numeric;
  v_btc_balance numeric;
  v_transaction_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_from_symbol = v_to_symbol THEN RAISE EXCEPTION 'Cannot swap an asset to itself'; END IF;
  IF v_from_symbol <> ALL(v_allowed_symbols) OR v_to_symbol <> ALL(v_allowed_symbols) THEN
    RAISE EXCEPTION 'Unsupported swap asset';
  END IF;
  IF p_from_amount IS NULL OR p_from_amount <= 0 THEN RAISE EXCEPTION 'Swap amount must be greater than zero'; END IF;

  SELECT md.price INTO v_eur_usd_rate
  FROM public.market_data md
  WHERE replace(replace(upper(md.symbol), '/', ''), '=X', '') = 'EURUSD'
  ORDER BY md.timestamp DESC NULLS LAST LIMIT 1;
  v_eur_usd_rate := COALESCE(NULLIF(v_eur_usd_rate, 0), 1.10);

  IF v_from_symbol = 'EUR' THEN
    v_from_price := v_eur_usd_rate;
  ELSIF v_from_symbol = 'USDC' THEN
    v_from_price := 1;
  ELSE
    SELECT md.price INTO v_from_price
    FROM public.market_data md
    WHERE replace(upper(md.symbol), '/', '') = v_from_symbol || 'USDT'
    ORDER BY md.timestamp DESC NULLS LAST LIMIT 1;
  END IF;

  IF v_to_symbol = 'EUR' THEN
    v_to_price := v_eur_usd_rate;
  ELSIF v_to_symbol = 'USDC' THEN
    v_to_price := 1;
  ELSE
    SELECT md.price INTO v_to_price
    FROM public.market_data md
    WHERE replace(upper(md.symbol), '/', '') = v_to_symbol || 'USDT'
    ORDER BY md.timestamp DESC NULLS LAST LIMIT 1;
  END IF;

  IF COALESCE(v_from_price, 0) <= 0 OR COALESCE(v_to_price, 0) <= 0 THEN
    RAISE EXCEPTION 'A current market price is unavailable for this swap';
  END IF;

  v_from_value_usd := p_from_amount * v_from_price;
  IF v_from_value_usd / v_eur_usd_rate < 0.01 THEN RAISE EXCEPTION 'Minimum swap value is EUR 0.01'; END IF;
  IF v_from_value_usd / v_eur_usd_rate > 1000000 THEN RAISE EXCEPTION 'Maximum swap value is EUR 1,000,000'; END IF;

  v_to_amount := trunc((v_from_value_usd / v_to_price) * (1 - v_fee_rate), 8);
  IF v_to_amount <= 0 THEN RAISE EXCEPTION 'Calculated output amount is too small'; END IF;
  IF p_expected_to_amount IS NOT NULL AND p_expected_to_amount > 0
     AND abs(v_to_amount - p_expected_to_amount) / v_to_amount > 0.05 THEN
    RAISE EXCEPTION 'The quote changed by more than 5%%. Refresh and try again';
  END IF;

  SELECT b.usdt_balance, b.btc_balance
  INTO v_fiat_balance_usd, v_btc_balance
  FROM public.balances b
  WHERE b.user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet balance not found'; END IF;

  IF v_from_symbol = 'EUR' THEN
    v_from_balance := v_fiat_balance_usd / v_from_price;
    IF p_from_amount > v_from_balance THEN RAISE EXCEPTION 'Insufficient EUR balance'; END IF;
    UPDATE public.balances
    SET usdt_balance = usdt_balance - v_from_value_usd, updated_at = now()
    WHERE user_id = v_user_id;
  ELSIF v_from_symbol = 'BTC' THEN
    IF p_from_amount > v_btc_balance THEN RAISE EXCEPTION 'Insufficient BTC balance'; END IF;
    UPDATE public.balances
    SET btc_balance = btc_balance - p_from_amount, updated_at = now()
    WHERE user_id = v_user_id;
  ELSE
    SELECT ua.balance INTO v_from_balance
    FROM public.user_assets ua
    WHERE ua.user_id = v_user_id AND ua.asset_symbol = v_from_symbol
    FOR UPDATE;
    IF COALESCE(v_from_balance, 0) < p_from_amount THEN
      RAISE EXCEPTION 'Insufficient % balance', v_from_symbol;
    END IF;
    UPDATE public.user_assets
    SET balance = balance - p_from_amount, updated_at = now()
    WHERE user_id = v_user_id AND asset_symbol = v_from_symbol;
  END IF;

  IF v_to_symbol = 'EUR' THEN
    UPDATE public.balances
    SET usdt_balance = usdt_balance + (v_to_amount * v_to_price), updated_at = now()
    WHERE user_id = v_user_id;
  ELSIF v_to_symbol = 'BTC' THEN
    UPDATE public.balances
    SET btc_balance = btc_balance + v_to_amount, updated_at = now()
    WHERE user_id = v_user_id;
  ELSE
    INSERT INTO public.user_assets(user_id, asset_symbol, balance)
    VALUES (v_user_id, v_to_symbol, v_to_amount)
    ON CONFLICT (user_id, asset_symbol) DO UPDATE
      SET balance = public.user_assets.balance + EXCLUDED.balance, updated_at = now();
  END IF;

  INSERT INTO public.transactions(user_id, type, amount, currency, description, status)
  VALUES (
    v_user_id,
    'trade',
    -(v_from_value_usd / v_eur_usd_rate),
    'EUR',
    'Swapped ' || trim(to_char(p_from_amount, 'FM999999999999990.99999999')) || ' ' || v_from_symbol ||
      ' to ' || trim(to_char(v_to_amount, 'FM999999999999990.99999999')) || ' ' || v_to_symbol || ' (0.1% fee)',
    'completed'
  )
  RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'from_symbol', v_from_symbol,
    'to_symbol', v_to_symbol,
    'from_amount', p_from_amount,
    'to_amount', v_to_amount,
    'from_price_usd', v_from_price,
    'to_price_usd', v_to_price,
    'fee_rate', v_fee_rate
  );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_asset_swap(text, text, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_asset_swap(text, text, numeric, numeric) TO authenticated;
