-- The legacy 2FA setting was removed in 20260901133000, but a later CRM
-- function reintroduced a reference to its dropped column. Keep the profile
-- controls aligned with the current users table.
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
  IF btrim(COALESCE(p_reason, '')) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p_changes ? 'two_factor_required' THEN RAISE EXCEPTION 'The legacy two-factor requirement is no longer available'; END IF;

  SELECT to_jsonb(u) INTO v_before FROM public.users u WHERE u.id = p_target_user_id FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  IF p_changes ? 'kyc_status' THEN
    v_kyc := p_changes->>'kyc_status';
    IF v_kyc NOT IN ('not_verified', 'pending', 'verified') THEN RAISE EXCEPTION 'Invalid KYC status'; END IF;
  END IF;
  IF p_changes ? 'is_admin'
     AND p_target_user_id = auth.uid()
     AND (p_changes->>'is_admin')::boolean IS DISTINCT FROM (v_before->>'is_admin')::boolean THEN
    RAISE EXCEPTION 'You cannot change your own administrator status';
  END IF;
  IF COALESCE(NULLIF(p_changes->>'referral_count', '')::integer, 0) < 0 THEN RAISE EXCEPTION 'Referral count cannot be negative'; END IF;
  IF COALESCE(NULLIF(p_changes->>'referral_commission_rate', '')::numeric, 0) NOT BETWEEN 0 AND 1 THEN RAISE EXCEPTION 'Referral commission rate must be between 0 and 1'; END IF;

  UPDATE public.users
  SET first_name = CASE WHEN p_changes ? 'first_name' THEN NULLIF(btrim(p_changes->>'first_name'), '') ELSE first_name END,
      last_name = CASE WHEN p_changes ? 'last_name' THEN NULLIF(btrim(p_changes->>'last_name'), '') ELSE last_name END,
      country = CASE WHEN p_changes ? 'country' THEN NULLIF(btrim(p_changes->>'country'), '') ELSE country END,
      phone_number = CASE WHEN p_changes ? 'phone_number' THEN NULLIF(btrim(p_changes->>'phone_number'), '') ELSE phone_number END,
      kyc_status = CASE WHEN p_changes ? 'kyc_status' THEN p_changes->>'kyc_status' ELSE kyc_status END,
      is_admin = CASE WHEN p_changes ? 'is_admin' THEN (p_changes->>'is_admin')::boolean ELSE is_admin END,
      document_id_url = CASE WHEN p_changes ? 'document_id_url' THEN NULLIF(btrim(p_changes->>'document_id_url'), '') ELSE document_id_url END,
      document_selfie_url = CASE WHEN p_changes ? 'document_selfie_url' THEN NULLIF(btrim(p_changes->>'document_selfie_url'), '') ELSE document_selfie_url END,
      referral_code = CASE WHEN p_changes ? 'referral_code' THEN NULLIF(upper(btrim(p_changes->>'referral_code')), '') ELSE referral_code END,
      referred_by = CASE WHEN p_changes ? 'referred_by' THEN NULLIF(p_changes->>'referred_by', '')::uuid ELSE referred_by END,
      referral_count = CASE WHEN p_changes ? 'referral_count' THEN COALESCE(NULLIF(p_changes->>'referral_count', '')::integer, 0) ELSE referral_count END,
      total_referral_earnings = CASE WHEN p_changes ? 'total_referral_earnings' THEN COALESCE(NULLIF(p_changes->>'total_referral_earnings', '')::numeric, 0) ELSE total_referral_earnings END,
      referral_commission_rate = CASE WHEN p_changes ? 'referral_commission_rate' THEN COALESCE(NULLIF(p_changes->>'referral_commission_rate', '')::numeric, 0) ELSE referral_commission_rate END,
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

NOTIFY pgrst, 'reload schema';
