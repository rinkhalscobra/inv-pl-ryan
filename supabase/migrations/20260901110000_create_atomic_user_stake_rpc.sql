/* Create stakes and reserve their funds in one authenticated transaction. */

CREATE OR REPLACE FUNCTION public.create_user_stake(
  p_asset_symbol text,
  p_amount numeric,
  p_duration_days integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_asset_symbol text := upper(trim(p_asset_symbol));
  v_apy_rate numeric(10,4);
  v_minimum numeric(20,8);
  v_available numeric(20,8);
  v_stake_id uuid;
  v_end_date timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_duration_days NOT IN (30, 60, 90, 180, 365) THEN
    RAISE EXCEPTION 'Invalid staking period';
  END IF;

  CASE v_asset_symbol
    WHEN 'BTC' THEN
      v_apy_rate := 5.5;
      v_minimum := 0.001;
    WHEN 'USDT' THEN
      v_apy_rate := 12.0;
      v_minimum := 100;
    ELSE
      RAISE EXCEPTION 'Staking is not available for this asset';
  END CASE;

  IF p_amount IS NULL OR p_amount < v_minimum THEN
    RAISE EXCEPTION 'Minimum stake amount is % %', v_minimum, v_asset_symbol;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_stakes AS us
    WHERE us.user_id = v_user_id
      AND us.asset_symbol = v_asset_symbol
      AND us.status = 'active'
  ) THEN
    RAISE EXCEPTION 'An active stake already exists for %', v_asset_symbol;
  END IF;

  IF v_asset_symbol = 'USDT' THEN
    SELECT b.usdt_balance INTO v_available
    FROM public.balances AS b
    WHERE b.user_id = v_user_id
    FOR UPDATE;
  ELSE
    SELECT b.btc_balance INTO v_available
    FROM public.balances AS b
    WHERE b.user_id = v_user_id
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Balance account not found';
  END IF;

  IF v_available < p_amount THEN
    RAISE EXCEPTION 'Insufficient % balance', v_asset_symbol;
  END IF;

  IF v_asset_symbol = 'USDT' THEN
    UPDATE public.balances
    SET usdt_balance = usdt_balance - p_amount,
        updated_at = now()
    WHERE user_id = v_user_id;
  ELSE
    UPDATE public.balances
    SET btc_balance = btc_balance - p_amount,
        updated_at = now()
    WHERE user_id = v_user_id;
  END IF;

  v_end_date := now() + make_interval(days => p_duration_days);

  INSERT INTO public.user_stakes (
    user_id,
    asset_symbol,
    staked_amount,
    apy_rate,
    start_date,
    end_date,
    earned_amount,
    status
  ) VALUES (
    v_user_id,
    v_asset_symbol,
    p_amount,
    v_apy_rate,
    now(),
    v_end_date,
    0,
    'active'
  )
  RETURNING id INTO v_stake_id;

  INSERT INTO public.transactions (user_id, type, amount, description, status)
  VALUES (
    v_user_id,
    'stake',
    -p_amount,
    'Staked ' || p_amount || ' ' || v_asset_symbol || ' for ' || p_duration_days || ' days',
    'completed'
  );

  RETURN jsonb_build_object(
    'stake_id', v_stake_id,
    'asset_symbol', v_asset_symbol,
    'staked_amount', p_amount,
    'apy_rate', v_apy_rate,
    'end_date', v_end_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_user_stake(text, numeric, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_user_stake(text, numeric, integer) TO authenticated;
