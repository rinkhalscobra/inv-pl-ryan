/* Secure, audited backend API for the integrated administrator CRM. */

-- Harden the legacy helper so callers cannot impersonate an administrator by
-- supplying somebody else's UUID to older admin functions.
CREATE OR REPLACE FUNCTION public.check_admin_role(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE(auth.role() = 'service_role', false)
    OR (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.users AS u
        WHERE u.id = auth.uid() AND u.is_admin = true
      )
    );
$$;

-- Bootstrap the administrator account shown in the application. This only
-- affects an existing account; it does not grant privileges to future signups.
UPDATE public.users
SET is_admin = true, updated_at = now()
WHERE lower(email) = 'admin@gmail.com';

CREATE OR REPLACE FUNCTION public.protect_user_admin_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_admin, false)
       AND COALESCE(auth.role(), '') <> 'service_role'
       AND NOT public.check_admin_role(auth.uid()) THEN
      RAISE EXCEPTION 'Only an administrator may grant administrator access';
    END IF;
  ELSIF OLD.is_admin IS DISTINCT FROM NEW.is_admin
        AND COALESCE(auth.role(), '') <> 'service_role'
        AND NOT public.check_admin_role(auth.uid()) THEN
      RAISE EXCEPTION 'Only an administrator may change administrator access';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_user_admin_status ON public.users;
CREATE TRIGGER protect_user_admin_status
BEFORE UPDATE OF is_admin ON public.users
FOR EACH ROW EXECUTE FUNCTION public.protect_user_admin_status();

DROP TRIGGER IF EXISTS protect_user_admin_insert ON public.users;
CREATE TRIGGER protect_user_admin_insert
BEFORE INSERT ON public.users
FOR EACH ROW EXECUTE FUNCTION public.protect_user_admin_status();

CREATE TABLE IF NOT EXISTS public.admin_action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_action_logs_target_created
  ON public.admin_action_logs(target_user_id, created_at DESC);

ALTER TABLE public.admin_action_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view CRM audit logs" ON public.admin_action_logs;
CREATE POLICY "Admins can view CRM audit logs"
  ON public.admin_action_logs FOR SELECT TO authenticated
  USING (public.check_admin_role(auth.uid()));

CREATE TABLE IF NOT EXISTS public.user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  note text NOT NULL CHECK (length(btrim(note)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notes_user_created
  ON public.user_notes(user_id, created_at DESC);

ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage CRM user notes" ON public.user_notes;
CREATE POLICY "Admins can manage CRM user notes"
  ON public.user_notes FOR ALL TO authenticated
  USING (public.check_admin_role(auth.uid()))
  WITH CHECK (public.check_admin_role(auth.uid()));

CREATE OR REPLACE FUNCTION public.require_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.check_admin_role(auth.uid()) THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_users(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.require_admin();

  WITH filtered AS (
    SELECT u.*
    FROM public.users AS u
    WHERE p_search IS NULL
       OR btrim(p_search) = ''
       OR u.email ILIKE '%' || btrim(p_search) || '%'
       OR COALESCE(u.first_name, '') ILIKE '%' || btrim(p_search) || '%'
       OR COALESCE(u.last_name, '') ILIKE '%' || btrim(p_search) || '%'
       OR u.id::text ILIKE '%' || btrim(p_search) || '%'
  ), page AS (
    SELECT f.*
    FROM filtered AS f
    ORDER BY f.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 250)
    OFFSET GREATEST(p_offset, 0)
  )
  SELECT jsonb_build_object(
    'users', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(p)
        || jsonb_build_object(
          'usdt_balance', COALESCE(b.usdt_balance, 0),
          'btc_balance', COALESCE(b.btc_balance, 0),
          'robot_allocated_balance', COALESCE(r.allocated_balance, 0),
          'robot_active', COALESCE(r.is_active, false)
        )
        ORDER BY p.created_at DESC
      )
      FROM page AS p
      LEFT JOIN public.balances AS b ON b.user_id = p.id
      LEFT JOIN public.robot_states AS r ON r.user_id = p.id
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered),
    'stats', jsonb_build_object(
      'total_users', (SELECT count(*) FROM public.users),
      'pending_kyc', (SELECT count(*) FROM public.users WHERE kyc_status = 'pending'),
      'active_robots', (SELECT count(*) FROM public.robot_states WHERE is_active = true),
      'total_usdt', (SELECT COALESCE(sum(usdt_balance), 0) FROM public.balances),
      'total_robot_allocated', (SELECT COALESCE(sum(allocated_balance), 0) FROM public.robot_states)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_user_workspace(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile jsonb;
BEGIN
  PERFORM public.require_admin();

  SELECT to_jsonb(u) INTO v_profile
  FROM public.users AS u
  WHERE u.id = p_target_user_id;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN jsonb_build_object(
    'profile', v_profile,
    'balance', COALESCE((SELECT to_jsonb(b) FROM public.balances b WHERE b.user_id = p_target_user_id), '{}'::jsonb),
    'robot', COALESCE((SELECT to_jsonb(r) FROM public.robot_states r WHERE r.user_id = p_target_user_id), '{}'::jsonb),
    'assets', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.asset_symbol) FROM public.user_assets x WHERE x.user_id = p_target_user_id), '[]'::jsonb),
    'transactions', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.transactions WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 100) x), '[]'::jsonb),
    'futures_positions', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.futures_positions WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 100) x), '[]'::jsonb),
    'futures_orders', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.futures_orders WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 100) x), '[]'::jsonb),
    'spot_orders', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.spot_orders WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 100) x), '[]'::jsonb),
    'binary_trades', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.binary_trades WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 100) x), '[]'::jsonb),
    'stakes', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.user_stakes WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 100) x), '[]'::jsonb),
    'event_bets', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.event_bets WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 100) x), '[]'::jsonb),
    'prop_positions', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.prop_positions WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 100) x), '[]'::jsonb),
    'prop_orders', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.prop_orders WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 100) x), '[]'::jsonb),
    'prop_accounts', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM public.prop_account_balances x WHERE x.user_id = p_target_user_id), '[]'::jsonb),
    'deposits', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.crypto_deposits WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 100) x), '[]'::jsonb),
    'payment_requests', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.crypto_payment_requests WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 100) x), '[]'::jsonb),
    'notifications', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.notifications WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 100) x), '[]'::jsonb),
    'notes', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM public.user_notes x WHERE x.user_id = p_target_user_id), '[]'::jsonb),
    'audit_logs', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.admin_action_logs WHERE target_user_id = p_target_user_id ORDER BY created_at DESC LIMIT 100) x), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_profile(
  p_target_user_id uuid,
  p_changes jsonb,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_kyc text;
BEGIN
  PERFORM public.require_admin();
  SELECT to_jsonb(u) INTO v_before FROM public.users u WHERE u.id = p_target_user_id FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  IF p_changes ? 'kyc_status' THEN
    v_kyc := p_changes->>'kyc_status';
    IF v_kyc NOT IN ('not_verified', 'pending', 'verified') THEN
      RAISE EXCEPTION 'Invalid KYC status';
    END IF;
  END IF;

  IF p_changes ? 'is_admin'
     AND p_target_user_id = auth.uid()
     AND (p_changes->>'is_admin')::boolean IS DISTINCT FROM (v_before->>'is_admin')::boolean THEN
    RAISE EXCEPTION 'You cannot change your own administrator status';
  END IF;

  UPDATE public.users
  SET first_name = CASE WHEN p_changes ? 'first_name' THEN NULLIF(btrim(p_changes->>'first_name'), '') ELSE first_name END,
      last_name = CASE WHEN p_changes ? 'last_name' THEN NULLIF(btrim(p_changes->>'last_name'), '') ELSE last_name END,
      country = CASE WHEN p_changes ? 'country' THEN NULLIF(btrim(p_changes->>'country'), '') ELSE country END,
      phone_number = CASE WHEN p_changes ? 'phone_number' THEN NULLIF(btrim(p_changes->>'phone_number'), '') ELSE phone_number END,
      kyc_status = CASE WHEN p_changes ? 'kyc_status' THEN p_changes->>'kyc_status' ELSE kyc_status END,
      is_demo = CASE WHEN p_changes ? 'is_demo' THEN (p_changes->>'is_demo')::boolean ELSE is_demo END,
      is_admin = CASE WHEN p_changes ? 'is_admin' THEN (p_changes->>'is_admin')::boolean ELSE is_admin END,
      max_leverage_forex = CASE WHEN p_changes ? 'max_leverage_forex' THEN NULLIF(p_changes->>'max_leverage_forex', '')::integer ELSE max_leverage_forex END,
      min_leverage_forex = CASE WHEN p_changes ? 'min_leverage_forex' THEN NULLIF(p_changes->>'min_leverage_forex', '')::integer ELSE min_leverage_forex END,
      max_leverage_commodities = CASE WHEN p_changes ? 'max_leverage_commodities' THEN NULLIF(p_changes->>'max_leverage_commodities', '')::integer ELSE max_leverage_commodities END,
      min_leverage_commodities = CASE WHEN p_changes ? 'min_leverage_commodities' THEN NULLIF(p_changes->>'min_leverage_commodities', '')::integer ELSE min_leverage_commodities END,
      max_leverage_stocks = CASE WHEN p_changes ? 'max_leverage_stocks' THEN NULLIF(p_changes->>'max_leverage_stocks', '')::integer ELSE max_leverage_stocks END,
      min_leverage_stocks = CASE WHEN p_changes ? 'min_leverage_stocks' THEN NULLIF(p_changes->>'min_leverage_stocks', '')::integer ELSE min_leverage_stocks END,
      max_leverage_futures = CASE WHEN p_changes ? 'max_leverage_futures' THEN NULLIF(p_changes->>'max_leverage_futures', '')::integer ELSE max_leverage_futures END,
      min_leverage_futures = CASE WHEN p_changes ? 'min_leverage_futures' THEN NULLIF(p_changes->>'min_leverage_futures', '')::integer ELSE min_leverage_futures END,
      updated_at = now()
  WHERE id = p_target_user_id
  RETURNING to_jsonb(users.*) INTO v_after;

  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, before_data, after_data, reason)
  VALUES (auth.uid(), p_target_user_id, 'update_profile', v_before, v_after, p_reason);
  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_balances(
  p_target_user_id uuid,
  p_usdt_balance numeric,
  p_btc_balance numeric,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_old_usdt numeric;
  v_old_btc numeric;
BEGIN
  PERFORM public.require_admin();
  IF p_usdt_balance < 0 OR p_btc_balance < 0 THEN RAISE EXCEPTION 'Balances cannot be negative'; END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;

  SELECT to_jsonb(b), b.usdt_balance, b.btc_balance
  INTO v_before, v_old_usdt, v_old_btc
  FROM public.balances b WHERE b.user_id = p_target_user_id FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Balance account not found'; END IF;

  UPDATE public.balances
  SET usdt_balance = p_usdt_balance, btc_balance = p_btc_balance, updated_at = now()
  WHERE user_id = p_target_user_id
  RETURNING to_jsonb(balances.*) INTO v_after;

  IF p_usdt_balance IS DISTINCT FROM v_old_usdt THEN
    INSERT INTO public.transactions(user_id, type, amount, description, status)
    VALUES (p_target_user_id, CASE WHEN p_usdt_balance > v_old_usdt THEN 'deposit' ELSE 'withdrawal' END,
      p_usdt_balance - v_old_usdt, 'CRM balance adjustment: ' || p_reason, 'completed');
  END IF;
  IF p_btc_balance IS DISTINCT FROM v_old_btc THEN
    INSERT INTO public.transactions(user_id, type, amount, description, status)
    VALUES (p_target_user_id, CASE WHEN p_btc_balance > v_old_btc THEN 'deposit' ELSE 'withdrawal' END,
      p_btc_balance - v_old_btc, 'CRM BTC balance adjustment: ' || p_reason, 'completed');
  END IF;

  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, before_data, after_data, reason)
  VALUES (auth.uid(), p_target_user_id, 'set_balances', v_before, v_after, p_reason);
  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_robot_state(
  p_target_user_id uuid,
  p_changes jsonb,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
BEGIN
  PERFORM public.require_admin();
  SELECT to_jsonb(r) INTO v_before FROM public.robot_states r WHERE r.user_id = p_target_user_id FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Robot state not found'; END IF;

  UPDATE public.robot_states
  SET is_active = CASE WHEN p_changes ? 'is_active' THEN (p_changes->>'is_active')::boolean ELSE is_active END,
      strategy = CASE WHEN p_changes ? 'strategy' THEN p_changes->>'strategy' ELSE strategy END,
      min_profit_threshold = CASE WHEN p_changes ? 'min_profit_threshold' THEN (p_changes->>'min_profit_threshold')::numeric ELSE min_profit_threshold END,
      max_trade_amount = CASE WHEN p_changes ? 'max_trade_amount' THEN (p_changes->>'max_trade_amount')::numeric ELSE max_trade_amount END,
      allocated_balance = CASE WHEN p_changes ? 'allocated_balance' THEN (p_changes->>'allocated_balance')::numeric ELSE allocated_balance END,
      todays_profit = CASE WHEN p_changes ? 'todays_profit' THEN (p_changes->>'todays_profit')::numeric ELSE todays_profit END,
      custom_daily_profit_percentage = CASE WHEN p_changes ? 'custom_daily_profit_percentage' THEN NULLIF(p_changes->>'custom_daily_profit_percentage', '')::numeric ELSE custom_daily_profit_percentage END,
      updated_at = now()
  WHERE user_id = p_target_user_id
  RETURNING to_jsonb(robot_states.*) INTO v_after;

  IF (v_after->>'allocated_balance')::numeric < 0 THEN RAISE EXCEPTION 'Allocated balance cannot be negative'; END IF;
  IF NULLIF(v_after->>'custom_daily_profit_percentage', '')::numeric < 0 THEN RAISE EXCEPTION 'Daily profit percentage cannot be negative'; END IF;

  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, before_data, after_data, reason)
  VALUES (auth.uid(), p_target_user_id, 'update_robot', v_before, v_after, p_reason);
  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_credit_robot_profit(
  p_target_user_id uuid,
  p_amount numeric,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
BEGIN
  PERFORM public.require_admin();
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Profit amount must be greater than zero'; END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;

  SELECT to_jsonb(r) INTO v_before FROM public.robot_states r WHERE r.user_id = p_target_user_id FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Robot state not found'; END IF;

  UPDATE public.robot_states
  SET allocated_balance = allocated_balance + p_amount,
      todays_profit = CASE
        WHEN last_profit_timestamp IS NOT NULL
          AND (last_profit_timestamp AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date
        THEN todays_profit + p_amount ELSE p_amount END,
      total_trades = COALESCE(total_trades, 0) + 1,
      successful_trades = COALESCE(successful_trades, 0) + 1,
      last_profit_timestamp = now(), updated_at = now()
  WHERE user_id = p_target_user_id
  RETURNING to_jsonb(robot_states.*) INTO v_after;

  INSERT INTO public.transactions(user_id, type, amount, description, status)
  VALUES (p_target_user_id, 'robot_profit', p_amount, 'CRM robot profit: ' || p_reason, 'completed');
  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, before_data, after_data, reason)
  VALUES (auth.uid(), p_target_user_id, 'credit_robot_profit', v_before, v_after, p_reason);
  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_asset_balance(
  p_target_user_id uuid,
  p_asset_symbol text,
  p_balance numeric,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_symbol text := upper(btrim(p_asset_symbol));
BEGIN
  PERFORM public.require_admin();
  IF v_symbol !~ '^[A-Z0-9]{2,15}$' THEN RAISE EXCEPTION 'Invalid asset symbol'; END IF;
  IF v_symbol IN ('USDT', 'BTC') THEN RAISE EXCEPTION 'Use primary balances for USDT and BTC'; END IF;
  IF p_balance < 0 THEN RAISE EXCEPTION 'Asset balance cannot be negative'; END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;

  SELECT to_jsonb(a) INTO v_before FROM public.user_assets a
  WHERE a.user_id = p_target_user_id AND a.asset_symbol = v_symbol FOR UPDATE;

  INSERT INTO public.user_assets(user_id, asset_symbol, balance)
  VALUES (p_target_user_id, v_symbol, p_balance)
  ON CONFLICT (user_id, asset_symbol) DO UPDATE SET balance = EXCLUDED.balance, updated_at = now()
  RETURNING to_jsonb(user_assets.*) INTO v_after;

  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, before_data, after_data, reason)
  VALUES (auth.uid(), p_target_user_id, 'set_asset_balance', v_before, v_after, p_reason);
  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_user_note(p_target_user_id uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_note public.user_notes%ROWTYPE;
BEGIN
  PERFORM public.require_admin();
  INSERT INTO public.user_notes(user_id, admin_id, note)
  VALUES (p_target_user_id, auth.uid(), btrim(p_note)) RETURNING * INTO v_note;
  RETURN to_jsonb(v_note);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_send_notification(
  p_target_user_id uuid,
  p_message text,
  p_type text DEFAULT 'admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_notification public.notifications%ROWTYPE;
BEGIN
  PERFORM public.require_admin();
  IF btrim(COALESCE(p_message, '')) = '' THEN RAISE EXCEPTION 'Message is required'; END IF;
  INSERT INTO public.notifications(user_id, type, message, data)
  VALUES (p_target_user_id, COALESCE(NULLIF(btrim(p_type), ''), 'admin'), btrim(p_message), jsonb_build_object('sent_by_admin', auth.uid()))
  RETURNING * INTO v_notification;
  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, after_data)
  VALUES (auth.uid(), p_target_user_id, 'send_notification', to_jsonb(v_notification));
  RETURN to_jsonb(v_notification);
END;
$$;

REVOKE ALL ON FUNCTION public.require_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_users(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_user_workspace(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_user_profile(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_balances(uuid, numeric, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_robot_state(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_credit_robot_profit(uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_asset_balance(uuid, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_add_user_note(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_send_notification(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_get_users(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_workspace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_profile(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_balances(uuid, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_robot_state(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_credit_robot_profit(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_asset_balance(uuid, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_user_note(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_send_notification(uuid, text, text) TO authenticated;
