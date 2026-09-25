/* Company.code is an internal CRM identifier. Give every company a separate,
   short random code used only to securely route public client registration. */

ALTER TABLE public.crm_companies
  ADD COLUMN client_registration_code text;

UPDATE public.crm_companies
SET client_registration_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

ALTER TABLE public.crm_companies
  ALTER COLUMN client_registration_code SET DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  ALTER COLUMN client_registration_code SET NOT NULL,
  ADD CONSTRAINT crm_companies_client_registration_code_format
    CHECK (client_registration_code ~ '^[A-F0-9]{10}$'),
  ADD CONSTRAINT crm_companies_client_registration_code_key
    UNIQUE (client_registration_code);

/* Keep the existing RPC parameter/response names briefly compatible with an
   already-open registration page, but resolve the random security code. */
CREATE OR REPLACE FUNCTION public.crm_resolve_registration_company(
  p_company_code text DEFAULT NULL,
  p_registration_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_security_code text := upper(btrim(COALESCE(p_company_code, '')));
  v_key_text text := lower(btrim(COALESCE(p_registration_key, '')));
  v_code_company public.crm_companies%ROWTYPE;
  v_key_company public.crm_companies%ROWTYPE;
  v_company public.crm_companies%ROWTYPE;
BEGIN
  IF v_security_code <> '' THEN
    IF v_security_code !~ '^[A-F0-9]{10}$' THEN
      RAISE EXCEPTION 'Enter a valid 10-character registration security code';
    END IF;

    SELECT c.* INTO v_code_company
    FROM public.crm_companies c
    WHERE c.client_registration_code = v_security_code
      AND c.status = 'active';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Registration security code is invalid or inactive';
    END IF;
  END IF;

  IF v_key_text <> '' THEN
    IF v_key_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      SELECT c.* INTO v_key_company
      FROM public.crm_companies c
      WHERE c.registration_key = v_key_text::uuid
        AND c.status = 'active';
    ELSIF v_key_text ~ '^[a-z0-9]{12}$' THEN
      SELECT c.* INTO v_key_company
      FROM public.crm_companies c
      WHERE c.registration_slug = v_key_text
        AND c.status = 'active';
    ELSE
      RAISE EXCEPTION 'Company registration link is invalid';
    END IF;

    IF v_key_company.id IS NULL THEN
      RAISE EXCEPTION 'Company registration link is invalid or inactive';
    END IF;
  END IF;

  IF v_code_company.id IS NOT NULL AND v_key_company.id IS NOT NULL
     AND v_code_company.id <> v_key_company.id THEN
    RAISE EXCEPTION 'Security code does not match this registration link';
  END IF;

  v_company := COALESCE(v_code_company, v_key_company);
  IF v_company.id IS NULL THEN
    RAISE EXCEPTION 'Enter the registration security code provided by your company';
  END IF;

  RETURN jsonb_build_object(
    'name', v_company.name,
    'code', v_company.client_registration_code,
    'security_code', v_company.client_registration_code
  );
END;
$$;

CREATE OR REPLACE FUNCTION crm_private.assign_new_user_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_meta jsonb;
  v_security_code text;
  v_key_text text;
  v_key uuid;
  v_code_company_id uuid;
  v_key_company_id uuid;
BEGIN
  IF NEW.company_id IS NOT NULL OR NEW.is_admin THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(a.raw_user_meta_data, '{}'::jsonb)
  INTO v_meta
  FROM auth.users a
  WHERE a.id = NEW.id;

  v_security_code := upper(btrim(COALESCE(
    v_meta ->> 'crm_registration_code',
    v_meta ->> 'crm_company_code',
    ''
  )));
  v_key_text := lower(btrim(COALESCE(v_meta ->> 'crm_company_key', '')));

  IF v_security_code <> '' THEN
    IF v_security_code !~ '^[A-F0-9]{10}$' THEN
      RAISE EXCEPTION 'Invalid registration security code';
    END IF;

    SELECT c.id INTO v_code_company_id
    FROM public.crm_companies c
    WHERE c.client_registration_code = v_security_code
      AND c.status = 'active';

    IF v_code_company_id IS NULL THEN
      RAISE EXCEPTION 'Registration security code is invalid or inactive';
    END IF;
  END IF;

  IF v_key_text <> '' THEN
    IF v_key_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      v_key := v_key_text::uuid;
      SELECT c.id INTO v_key_company_id
      FROM public.crm_companies c
      WHERE c.registration_key = v_key
        AND c.status = 'active';
    ELSIF v_key_text ~ '^[a-z0-9]{12}$' THEN
      SELECT c.id INTO v_key_company_id
      FROM public.crm_companies c
      WHERE c.registration_slug = v_key_text
        AND c.status = 'active';
    ELSE
      RAISE EXCEPTION 'Invalid company registration link';
    END IF;

    IF v_key_company_id IS NULL THEN
      RAISE EXCEPTION 'Company registration link is invalid or inactive';
    END IF;
  END IF;

  IF v_code_company_id IS NOT NULL AND v_key_company_id IS NOT NULL
     AND v_code_company_id <> v_key_company_id THEN
    RAISE EXCEPTION 'Security code does not match this registration link';
  END IF;

  IF v_code_company_id IS NOT NULL THEN
    NEW.company_id := v_code_company_id;
  ELSIF auth.role() = 'service_role' AND v_key_company_id IS NOT NULL THEN
    NEW.company_id := v_key_company_id;
  ELSE
    RAISE EXCEPTION 'A valid registration security code is required to create an account';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_admin_list_companies()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_scope text;
  v_company uuid;
BEGIN
  PERFORM public.require_admin();
  SELECT n.access_scope, n.company_id
  INTO v_scope, v_company
  FROM crm_private.request_network_context() n;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'code', c.code,
      'client_registration_code', c.client_registration_code,
      'status', c.status,
      'registration_key', c.registration_key,
      'registration_slug', c.registration_slug,
      'registration_path', CASE
        WHEN c.is_default_registration THEN '/register'
        ELSE '/signup/' || c.registration_slug
      END,
      'user_count', (SELECT count(*) FROM public.users u WHERE u.company_id = c.id),
      'lead_count', (SELECT count(*) FROM public.crm_leads l WHERE l.company_id = c.id),
      'office_count', (SELECT count(*) FROM public.crm_offices o WHERE o.company_id = c.id)
    ) ORDER BY c.created_at)
    FROM public.crm_companies c
    WHERE v_scope = 'platform' OR c.id = v_company
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.crm_resolve_registration_company(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_resolve_registration_company(text, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION crm_private.assign_new_user_company() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_admin_list_companies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_admin_list_companies() TO authenticated;

NOTIFY pgrst, 'reload schema';
