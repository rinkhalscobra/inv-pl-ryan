/*
  One idempotent onboarding path for direct signups, CRM-created accounts and
  imported leads. Storage folders are virtual in Supabase, so client_folders is
  the durable manifest and every object remains under <auth-user-id>/.
*/

CREATE SCHEMA IF NOT EXISTS crm_private;

CREATE TABLE IF NOT EXISTS crm_private.country_calling_codes (
  dial_code text PRIMARY KEY CHECK (dial_code ~ '^[0-9]{1,4}$'),
  country text,
  iso_code text,
  reliable boolean NOT NULL DEFAULT true
);

INSERT INTO crm_private.country_calling_codes (dial_code, country, iso_code, reliable) VALUES
  ('1', NULL, NULL, false), ('7', NULL, NULL, false),
  ('20', 'Egypt', 'EG', true), ('27', 'South Africa', 'ZA', true),
  ('30', 'Greece', 'GR', true), ('31', 'Netherlands', 'NL', true),
  ('32', 'Belgium', 'BE', true), ('33', 'France', 'FR', true),
  ('34', 'Spain', 'ES', true), ('36', 'Hungary', 'HU', true),
  ('39', 'Italy', 'IT', true), ('40', 'Romania', 'RO', true),
  ('41', 'Switzerland', 'CH', true), ('43', 'Austria', 'AT', true),
  ('44', 'United Kingdom', 'GB', true), ('45', 'Denmark', 'DK', true),
  ('46', 'Sweden', 'SE', true), ('47', 'Norway', 'NO', true),
  ('48', 'Poland', 'PL', true), ('49', 'Germany', 'DE', true),
  ('51', 'Peru', 'PE', true), ('52', 'Mexico', 'MX', true),
  ('54', 'Argentina', 'AR', true), ('55', 'Brazil', 'BR', true),
  ('56', 'Chile', 'CL', true), ('57', 'Colombia', 'CO', true),
  ('60', 'Malaysia', 'MY', true), ('61', 'Australia', 'AU', true),
  ('62', 'Indonesia', 'ID', true), ('63', 'Philippines', 'PH', true),
  ('64', 'New Zealand', 'NZ', true), ('65', 'Singapore', 'SG', true),
  ('66', 'Thailand', 'TH', true), ('81', 'Japan', 'JP', true),
  ('82', 'South Korea', 'KR', true), ('84', 'Vietnam', 'VN', true),
  ('86', 'China', 'CN', true), ('90', 'Turkey', 'TR', true),
  ('91', 'India', 'IN', true), ('92', 'Pakistan', 'PK', true),
  ('234', 'Nigeria', 'NG', true), ('351', 'Portugal', 'PT', true),
  ('358', 'Finland', 'FI', true), ('380', 'Ukraine', 'UA', true),
  ('420', 'Czech Republic', 'CZ', true), ('852', 'Hong Kong', 'HK', true),
  ('880', 'Bangladesh', 'BD', true), ('966', 'Saudi Arabia', 'SA', true),
  ('971', 'United Arab Emirates', 'AE', true), ('972', 'Israel', 'IL', true)
ON CONFLICT (dial_code) DO UPDATE SET
  country = EXCLUDED.country, iso_code = EXCLUDED.iso_code, reliable = EXCLUDED.reliable;

CREATE OR REPLACE FUNCTION crm_private.country_from_phone(p_phone text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH normalized AS (
    SELECT CASE
      WHEN btrim(COALESCE(p_phone, '')) LIKE '+%' THEN regexp_replace(btrim(p_phone), '[^0-9]', '', 'g')
      WHEN btrim(COALESCE(p_phone, '')) LIKE '00%' THEN substring(regexp_replace(btrim(p_phone), '[^0-9]', '', 'g') FROM 3)
      ELSE NULL
    END AS digits
  )
  SELECT c.country
  FROM normalized n
  JOIN crm_private.country_calling_codes c
    ON n.digits LIKE c.dial_code || '%' AND c.reliable AND c.country IS NOT NULL
  ORDER BY length(c.dial_code) DESC
  LIMIT 1
$$;

CREATE TABLE IF NOT EXISTS public.client_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  client_id text NOT NULL UNIQUE,
  username text NOT NULL UNIQUE,
  onboarding_status text NOT NULL DEFAULT 'active' CHECK (onboarding_status IN ('active', 'attention_required')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trade_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  account_number text NOT NULL UNIQUE,
  account_type text NOT NULL DEFAULT 'standard',
  base_currency text NOT NULL DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_folders (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  storage_bucket text NOT NULL DEFAULT 'kyc-documents',
  storage_prefix text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (storage_prefix = user_id::text || '/')
);

CREATE TABLE IF NOT EXISTS public.client_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('identity', 'selfie', 'other')),
  storage_bucket text NOT NULL,
  object_path text NOT NULL,
  original_filename text,
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'pending_review', 'verified', 'rejected')),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_bucket, object_path),
  CHECK (object_path LIKE user_id::text || '/%')
);

CREATE TABLE IF NOT EXISTS public.client_onboarding_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auth_user_id uuid NOT NULL,
  email text,
  source text NOT NULL,
  status text NOT NULL CHECK (status IN ('completed', 'failed')),
  failed_step text,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS registration_error text,
  ADD COLUMN IF NOT EXISTS last_registration_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS client_documents_user_created_idx
  ON public.client_documents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_onboarding_events_user_created_idx
  ON public.client_onboarding_events(auth_user_id, created_at DESC);

ALTER TABLE public.client_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_onboarding_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.client_profiles, public.trade_accounts, public.client_folders,
  public.client_documents, public.client_onboarding_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.client_profiles, public.trade_accounts, public.client_folders, public.client_documents TO authenticated;
GRANT ALL ON public.client_profiles, public.trade_accounts, public.client_folders,
  public.client_documents, public.client_onboarding_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.client_onboarding_events_id_seq TO service_role;

DROP POLICY IF EXISTS client_profiles_read_own_or_admin ON public.client_profiles;
CREATE POLICY client_profiles_read_own_or_admin ON public.client_profiles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.check_admin_role(auth.uid()));
DROP POLICY IF EXISTS trade_accounts_read_own_or_admin ON public.trade_accounts;
CREATE POLICY trade_accounts_read_own_or_admin ON public.trade_accounts FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.check_admin_role(auth.uid()));
DROP POLICY IF EXISTS client_folders_read_own_or_admin ON public.client_folders;
CREATE POLICY client_folders_read_own_or_admin ON public.client_folders FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.check_admin_role(auth.uid()));
DROP POLICY IF EXISTS client_documents_read_own_or_admin ON public.client_documents;
CREATE POLICY client_documents_read_own_or_admin ON public.client_documents FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.check_admin_role(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_country_from_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_country text;
BEGIN
  IF NEW.phone_number IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.phone_number IS DISTINCT FROM OLD.phone_number) THEN
    v_country := crm_private.country_from_phone(NEW.phone_number);
    NEW.country := v_country;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_user_country_from_phone ON public.users;
CREATE TRIGGER set_user_country_from_phone
BEFORE INSERT OR UPDATE OF phone_number ON public.users
FOR EACH ROW EXECUTE FUNCTION public.set_country_from_phone();

CREATE OR REPLACE FUNCTION crm_private.ensure_client_onboarding(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth auth.users%ROWTYPE;
  v_metadata jsonb;
  v_phone text;
  v_country text;
  v_referral_code text;
  v_referrer_id uuid;
  v_new_referral boolean := false;
  v_step text := 'auth account';
BEGIN
  SELECT * INTO v_auth FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Authentication account not found'; END IF;
  v_metadata := COALESCE(v_auth.raw_user_meta_data, '{}'::jsonb);
  v_phone := NULLIF(btrim(v_metadata->>'phone_number'), '');
  v_country := CASE
    WHEN v_phone IS NOT NULL THEN crm_private.country_from_phone(v_phone)
    ELSE NULLIF(btrim(v_metadata->>'country'), '')
  END;

  v_step := 'client profile';
  LOOP
    v_referral_code := upper(substring(replace(gen_random_uuid()::text, '-', '') FROM 1 FOR 10));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE referral_code = v_referral_code);
  END LOOP;

  INSERT INTO public.users (
    id, email, first_name, last_name, phone_number, country, kyc_status, referral_code, is_admin
  ) VALUES (
    v_auth.id, v_auth.email,
    NULLIF(btrim(v_metadata->>'first_name'), ''),
    NULLIF(btrim(v_metadata->>'last_name'), ''),
    v_phone, v_country, 'not_verified', v_referral_code, false
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = COALESCE(EXCLUDED.first_name, public.users.first_name),
    last_name = COALESCE(EXCLUDED.last_name, public.users.last_name),
    phone_number = COALESCE(EXCLUDED.phone_number, public.users.phone_number),
    country = CASE WHEN EXCLUDED.phone_number IS NOT NULL THEN EXCLUDED.country ELSE COALESCE(EXCLUDED.country, public.users.country) END,
    updated_at = now();

  v_step := 'client identifier';
  INSERT INTO public.client_profiles (user_id, client_id, username, onboarding_status)
  VALUES (p_user_id, 'CL-' || upper(replace(p_user_id::text, '-', '')), lower(v_auth.email), 'active')
  ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username, onboarding_status = 'active', updated_at = now();

  v_step := 'wallet';
  INSERT INTO public.balances (user_id, usdt_balance, btc_balance)
  VALUES (p_user_id, 0, 0) ON CONFLICT (user_id) DO NOTHING;

  v_step := 'trade account';
  INSERT INTO public.trade_accounts (user_id, account_number, account_type, base_currency, status)
  VALUES (p_user_id, 'TR-' || upper(replace(p_user_id::text, '-', '')), 'standard', 'EUR', 'active')
  ON CONFLICT (user_id) DO UPDATE SET status = CASE WHEN public.trade_accounts.status = 'closed' THEN 'closed' ELSE 'active' END, updated_at = now();

  v_step := 'asset ledgers';
  INSERT INTO public.user_assets (user_id, asset_symbol, balance)
  VALUES (p_user_id, 'USDT', 0), (p_user_id, 'BTC', 0)
  ON CONFLICT (user_id, asset_symbol) DO NOTHING;

  v_step := 'robot account';
  INSERT INTO public.robot_states (
    user_id, is_active, strategy, min_profit_threshold, max_trade_amount,
    allocated_balance, todays_profit, total_trades, successful_trades,
    active_challenge_id, challenge_account_balance, challenge_profit_target,
    challenge_max_drawdown, challenge_time_limit
  ) VALUES (p_user_id, false, 'triangular', 0.5, 1000, 0, 0, 0, 0, NULL, 0, 0, 0, 30)
  ON CONFLICT (user_id) DO NOTHING;

  v_step := 'portfolio snapshot';
  INSERT INTO public.portfolio_snapshots (
    user_id, snapshot_date, total_value, usdt_balance, btc_balance, btc_price
  ) VALUES (
    p_user_id, CURRENT_DATE, 0, 0, 0,
    COALESCE((SELECT price FROM public.market_data WHERE symbol = 'BTCUSDT' ORDER BY timestamp DESC LIMIT 1), 0)
  ) ON CONFLICT (user_id, snapshot_date) DO NOTHING;

  v_step := 'document folder';
  INSERT INTO public.client_folders (user_id, storage_bucket, storage_prefix)
  VALUES (p_user_id, 'kyc-documents', p_user_id::text || '/')
  ON CONFLICT (user_id) DO NOTHING;

  v_step := 'referral relationship';
  IF NULLIF(btrim(v_metadata->>'referral_code'), '') IS NOT NULL THEN
    SELECT id INTO v_referrer_id FROM public.users
    WHERE referral_code = upper(btrim(v_metadata->>'referral_code')) AND id <> p_user_id;
    IF v_referrer_id IS NOT NULL THEN
      UPDATE public.users SET referred_by = v_referrer_id
      WHERE id = p_user_id AND referred_by IS NULL
      RETURNING true INTO v_new_referral;
      IF COALESCE(v_new_referral, false) THEN
        UPDATE public.users SET referral_count = COALESCE(referral_count, 0) + 1 WHERE id = v_referrer_id;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.client_onboarding_events(auth_user_id, email, source, status, message)
  VALUES (p_user_id, v_auth.email, COALESCE(NULLIF(v_metadata->>'onboarding_source', ''), 'auth'), 'completed', 'Client onboarding complete');

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'client_id', 'CL-' || upper(replace(p_user_id::text, '-', '')),
    'trade_account', 'TR-' || upper(replace(p_user_id::text, '-', '')),
    'country', v_country
  );
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Client onboarding failed at %: %', v_step, SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_my_client_onboarding()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_message text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  BEGIN
    RETURN crm_private.ensure_client_onboarding(v_user_id);
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
    INSERT INTO public.client_onboarding_events(auth_user_id, email, source, status, failed_step, message)
    VALUES (v_user_id, v_email, 'website_retry', 'failed', split_part(v_message, ':', 1), left(v_message, 1000));
    RETURN jsonb_build_object('success', false, 'error', v_message);
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_ensure_client_onboarding(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  RETURN crm_private.ensure_client_onboarding(p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    PERFORM crm_private.ensure_client_onboarding(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
    INSERT INTO public.client_onboarding_events(auth_user_id, email, source, status, failed_step, message)
    VALUES (NEW.id, NEW.email, 'auth_trigger', 'failed', split_part(v_message, ':', 1), left(v_message, 1000));
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

UPDATE public.users
SET country = crm_private.country_from_phone(phone_number), updated_at = now()
WHERE phone_number IS NOT NULL
  AND crm_private.country_from_phone(phone_number) IS NOT NULL
  AND country IS DISTINCT FROM crm_private.country_from_phone(phone_number);

CREATE OR REPLACE FUNCTION public.submit_kyc_application(
  p_tax_id text,
  p_id_path text,
  p_selfie_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tax_id text := btrim(COALESCE(p_tax_id, ''));
  v_user_status text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF length(v_tax_id) NOT BETWEEN 4 AND 64 OR v_tax_id ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Enter a valid Tax ID (4 to 64 characters)';
  END IF;
  IF p_id_path IS NULL OR p_selfie_path IS NULL
     OR left(p_id_path, length(v_user_id::text) + 1) <> v_user_id::text || '/'
     OR left(p_selfie_path, length(v_user_id::text) + 1) <> v_user_id::text || '/'
     OR p_id_path = p_selfie_path THEN
    RAISE EXCEPTION 'Invalid identity document paths';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'kyc-documents' AND name = p_id_path)
     OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'kyc-documents' AND name = p_selfie_path) THEN
    RAISE EXCEPTION 'Upload both identity documents before submitting';
  END IF;

  SELECT kyc_status INTO v_user_status FROM public.users WHERE id = v_user_id FOR UPDATE;
  IF v_user_status IS NULL THEN RAISE EXCEPTION 'User profile not found'; END IF;
  IF v_user_status = 'verified' THEN RAISE EXCEPTION 'Verified accounts cannot resubmit KYC'; END IF;
  IF v_user_status = 'pending'
     AND EXISTS (SELECT 1 FROM public.kyc_tax_id_submissions WHERE user_id = v_user_id AND status = 'pending') THEN
    RAISE EXCEPTION 'Your KYC application is already pending review';
  END IF;

  INSERT INTO public.client_folders(user_id, storage_bucket, storage_prefix)
  VALUES (v_user_id, 'kyc-documents', v_user_id::text || '/')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.kyc_tax_id_submissions (user_id, tax_id, status, submitted_at)
  VALUES (v_user_id, v_tax_id, 'pending', now())
  ON CONFLICT (user_id) DO UPDATE SET
    tax_id = EXCLUDED.tax_id, status = 'pending', submitted_at = now(),
    reviewed_at = NULL, reviewed_by = NULL, review_reason = NULL;

  INSERT INTO public.client_documents(
    user_id, document_type, storage_bucket, object_path, original_filename,
    mime_type, size_bytes, status, uploaded_at
  )
  SELECT v_user_id, d.document_type, o.bucket_id, o.name,
    regexp_replace(o.name, '^.*/', ''), o.metadata->>'mimetype',
    CASE WHEN COALESCE(o.metadata->>'size', '') ~ '^[0-9]+$' THEN (o.metadata->>'size')::bigint ELSE NULL END,
    'pending_review', COALESCE(o.created_at, now())
  FROM (VALUES (p_id_path, 'identity'), (p_selfie_path, 'selfie')) AS d(path, document_type)
  JOIN storage.objects o ON o.bucket_id = 'kyc-documents' AND o.name = d.path
  ON CONFLICT (storage_bucket, object_path) DO UPDATE SET
    document_type = EXCLUDED.document_type,
    original_filename = EXCLUDED.original_filename,
    mime_type = EXCLUDED.mime_type,
    size_bytes = EXCLUDED.size_bytes,
    status = 'pending_review';

  UPDATE public.users SET
    document_id_path = p_id_path,
    document_selfie_path = p_selfie_path,
    document_id_url = NULL,
    document_selfie_url = NULL,
    kyc_status = 'pending',
    updated_at = now()
  WHERE id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_client_onboarding()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'profile', COALESCE((SELECT to_jsonb(p) FROM public.client_profiles p WHERE p.user_id = auth.uid()), '{}'::jsonb),
    'trade_account', COALESCE((SELECT to_jsonb(t) FROM public.trade_accounts t WHERE t.user_id = auth.uid()), '{}'::jsonb),
    'folder', COALESCE((SELECT to_jsonb(f) FROM public.client_folders f WHERE f.user_id = auth.uid()), '{}'::jsonb),
    'documents', COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC) FROM public.client_documents d WHERE d.user_id = auth.uid()), '[]'::jsonb)
  )
$$;

CREATE OR REPLACE FUNCTION public.admin_get_client_onboarding(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN jsonb_build_object(
    'profile', COALESCE((SELECT to_jsonb(p) FROM public.client_profiles p WHERE p.user_id = p_target_user_id), '{}'::jsonb),
    'trade_account', COALESCE((SELECT to_jsonb(t) FROM public.trade_accounts t WHERE t.user_id = p_target_user_id), '{}'::jsonb),
    'folder', COALESCE((SELECT to_jsonb(f) FROM public.client_folders f WHERE f.user_id = p_target_user_id), '{}'::jsonb),
    'documents', COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC) FROM public.client_documents d WHERE d.user_id = p_target_user_id), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION crm_private.country_from_phone(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION crm_private.ensure_client_onboarding(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_my_client_onboarding() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_ensure_client_onboarding(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_client_onboarding() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_client_onboarding(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_client_onboarding() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ensure_client_onboarding(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_client_onboarding() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_client_onboarding(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_kyc_application(text, text, text) TO authenticated;

DO $$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN SELECT id, email FROM auth.users LOOP
    BEGIN
      PERFORM crm_private.ensure_client_onboarding(v_user.id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.client_onboarding_events(auth_user_id, email, source, status, failed_step, message)
      VALUES (v_user.id, v_user.email, 'migration_backfill', 'failed', split_part(SQLERRM, ':', 1), left(SQLERRM, 1000));
    END;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
