/* Make the company code the authoritative tenant selector for public client
   registration. Company registration links may prefill the code, but the
   database still validates both values and rejects mismatches. */

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
  v_code text := upper(btrim(COALESCE(p_company_code, '')));
  v_key_text text := lower(btrim(COALESCE(p_registration_key, '')));
  v_code_company public.crm_companies%ROWTYPE;
  v_key_company public.crm_companies%ROWTYPE;
  v_company public.crm_companies%ROWTYPE;
BEGIN
  IF v_code <> '' THEN
    IF v_code !~ '^[A-Z0-9_-]{2,24}$' THEN
      RAISE EXCEPTION 'Use a valid 2-24 character company code';
    END IF;

    SELECT c.* INTO v_code_company
    FROM public.crm_companies c
    WHERE c.code = v_code
      AND c.status = 'active';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Company code is invalid or inactive';
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
    RAISE EXCEPTION 'Company code does not match this registration link';
  END IF;

  v_company := COALESCE(v_code_company, v_key_company);
  IF v_company.id IS NULL THEN
    RAISE EXCEPTION 'Enter the company code provided by your company';
  END IF;

  RETURN jsonb_build_object('name', v_company.name, 'code', v_company.code);
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
  v_code text;
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

  v_code := upper(btrim(COALESCE(v_meta ->> 'crm_company_code', '')));
  v_key_text := lower(btrim(COALESCE(v_meta ->> 'crm_company_key', '')));

  IF v_code <> '' THEN
    IF v_code !~ '^[A-Z0-9_-]{2,24}$' THEN
      RAISE EXCEPTION 'Invalid company code';
    END IF;

    SELECT c.id INTO v_code_company_id
    FROM public.crm_companies c
    WHERE c.code = v_code
      AND c.status = 'active';

    IF v_code_company_id IS NULL THEN
      RAISE EXCEPTION 'Company code is invalid or inactive';
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
    RAISE EXCEPTION 'Company code does not match this registration link';
  END IF;

  IF v_code_company_id IS NOT NULL THEN
    NEW.company_id := v_code_company_id;
  ELSIF auth.role() = 'service_role' AND v_key_company_id IS NOT NULL THEN
    /* CRM-created accounts use a service-role request and remain compatible. */
    NEW.company_id := v_key_company_id;
  ELSE
    RAISE EXCEPTION 'A valid company code is required to create an account';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_resolve_registration_company(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_resolve_registration_company(text, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION crm_private.assign_new_user_company() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
