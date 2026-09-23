-- CRM client access authenticates through auth.users. Legacy/imported profiles can
-- occasionally share an email with a different auth user, leaving the wallet on
-- an orphan public.users id. Merge only an orphan profile into an inactive auth
-- profile so every client-facing query continues to use auth.uid() safely.
CREATE OR REPLACE FUNCTION public.crm_merge_orphan_client_identity(
  p_source_user_id uuid,
  p_auth_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source public.users%ROWTYPE;
  v_auth_email text;
  v_fk record;
  v_target_exists boolean;
  v_target_balance public.balances%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  IF p_source_user_id IS NULL OR p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Both client identities are required';
  END IF;

  IF p_source_user_id = p_auth_user_id THEN
    RETURN jsonb_build_object('success', true, 'merged', false, 'user_id', p_auth_user_id);
  END IF;

  SELECT * INTO v_source FROM public.users WHERE id = p_source_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The CRM client profile no longer exists';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE id = p_source_user_id) THEN
    RAISE EXCEPTION 'The selected CRM profile already has its own authentication account';
  END IF;

  SELECT lower(email) INTO v_auth_email FROM auth.users WHERE id = p_auth_user_id;
  IF v_auth_email IS NULL THEN
    RAISE EXCEPTION 'The authentication account does not exist';
  END IF;
  IF lower(v_source.email) IS DISTINCT FROM v_auth_email THEN
    RAISE EXCEPTION 'The CRM profile and authentication email do not match';
  END IF;

  IF v_source.document_id_path IS NOT NULL
     OR v_source.document_selfie_path IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.client_documents WHERE user_id = p_source_user_id) THEN
    RAISE EXCEPTION 'The orphan client has stored documents and requires manual identity review';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = p_auth_user_id) INTO v_target_exists;
  IF v_target_exists THEN
    SELECT * INTO v_target_balance FROM public.balances WHERE user_id = p_auth_user_id;
    IF COALESCE(v_target_balance.usdt_balance, 0) <> 0
       OR COALESCE(v_target_balance.usd_balance, 0) <> 0
       OR COALESCE(v_target_balance.btc_balance, 0) <> 0
       OR EXISTS (SELECT 1 FROM public.transactions WHERE user_id = p_auth_user_id)
       OR EXISTS (SELECT 1 FROM public.futures_positions WHERE user_id = p_auth_user_id)
       OR EXISTS (SELECT 1 FROM public.user_stakes WHERE user_id = p_auth_user_id)
       OR EXISTS (SELECT 1 FROM public.robot_states WHERE user_id = p_auth_user_id AND (allocated_balance <> 0 OR is_active)) THEN
      RAISE EXCEPTION 'The matching authentication account already contains financial activity and requires manual review';
    END IF;
  ELSE
    INSERT INTO public.users (id, email, kyc_status, referral_code, is_admin)
    VALUES (
      p_auth_user_id,
      v_source.email,
      'not_verified',
      upper(substring(replace(p_auth_user_id::text, '-', '') FROM 1 FOR 10)),
      false
    );
  END IF;

  -- This table enforces storage_prefix = user_id || '/'. Move both values in
  -- one statement so its integrity check remains valid.
  IF EXISTS (SELECT 1 FROM public.client_folders WHERE user_id = p_source_user_id) THEN
    DELETE FROM public.client_folders WHERE user_id = p_auth_user_id;
    UPDATE public.client_folders
    SET user_id = p_auth_user_id, storage_prefix = p_auth_user_id::text || '/'
    WHERE user_id = p_source_user_id;
  END IF;

  -- Move every direct foreign key to the real auth identity. When an onboarding
  -- placeholder already occupies a unique user slot, discard that empty target
  -- row and retain the selected CRM client's row.
  FOR v_fk IN
    SELECT
      child_ns.nspname AS child_schema,
      child.relname AS child_table,
      child_col.attname AS child_column
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class child ON child.oid = con.conrelid
    JOIN pg_catalog.pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_catalog.pg_class parent ON parent.oid = con.confrelid
    JOIN pg_catalog.pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
    JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS fk(attnum, ord) ON fk.ord = ck.ord
    JOIN pg_catalog.pg_attribute child_col ON child_col.attrelid = child.oid AND child_col.attnum = ck.attnum
    JOIN pg_catalog.pg_attribute parent_col ON parent_col.attrelid = parent.oid AND parent_col.attnum = fk.attnum
    WHERE con.contype = 'f'
      AND parent_ns.nspname = 'public'
      AND parent.relname = 'users'
      AND parent_col.attname = 'id'
      AND NOT (child_ns.nspname = 'public' AND child.relname = 'users' AND child_col.attname = 'id')
      AND NOT (child_ns.nspname = 'public' AND child.relname IN ('client_folders', 'client_documents'))
  LOOP
    BEGIN
      EXECUTE format(
        'UPDATE %I.%I SET %I = $1 WHERE %I = $2',
        v_fk.child_schema, v_fk.child_table, v_fk.child_column, v_fk.child_column
      ) USING p_auth_user_id, p_source_user_id;
    EXCEPTION WHEN unique_violation THEN
      EXECUTE format(
        'DELETE FROM %I.%I WHERE %I = $1',
        v_fk.child_schema, v_fk.child_table, v_fk.child_column
      ) USING p_auth_user_id;
      EXECUTE format(
        'UPDATE %I.%I SET %I = $1 WHERE %I = $2',
        v_fk.child_schema, v_fk.child_table, v_fk.child_column, v_fk.child_column
      ) USING p_auth_user_id, p_source_user_id;
    END;
  END LOOP;

  DELETE FROM public.users WHERE id = p_source_user_id;

  UPDATE public.users SET
    email = v_source.email,
    created_at = v_source.created_at,
    updated_at = now(),
    kyc_status = v_source.kyc_status,
    referral_code = v_source.referral_code,
    referral_count = v_source.referral_count,
    referred_by = CASE WHEN v_source.referred_by = p_source_user_id THEN p_auth_user_id ELSE v_source.referred_by END,
    first_name = v_source.first_name,
    last_name = v_source.last_name,
    country = v_source.country,
    document_id_url = v_source.document_id_url,
    document_selfie_url = v_source.document_selfie_url,
    is_admin = v_source.is_admin,
    phone_number = v_source.phone_number,
    max_leverage_forex = v_source.max_leverage_forex,
    max_leverage_commodities = v_source.max_leverage_commodities,
    max_leverage_stocks = v_source.max_leverage_stocks,
    total_referral_earnings = v_source.total_referral_earnings,
    referral_commission_rate = v_source.referral_commission_rate,
    min_leverage_forex = v_source.min_leverage_forex,
    min_leverage_commodities = v_source.min_leverage_commodities,
    min_leverage_stocks = v_source.min_leverage_stocks,
    max_leverage_futures = v_source.max_leverage_futures,
    min_leverage_futures = v_source.min_leverage_futures,
    document_id_path = v_source.document_id_path,
    document_selfie_path = v_source.document_selfie_path
  WHERE id = p_auth_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'merged', true,
    'source_user_id', p_source_user_id,
    'user_id', p_auth_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_merge_orphan_client_identity(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_merge_orphan_client_identity(uuid, uuid) TO service_role;
