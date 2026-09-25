/* Short, opaque registration paths for every existing and future company.
   Legacy UUID registration links remain valid for compatibility. */

ALTER TABLE public.crm_companies
  ADD COLUMN registration_slug text;

UPDATE public.crm_companies
SET registration_slug = lower(substr(replace(registration_key::text, '-', ''), 1, 12));

ALTER TABLE public.crm_companies
  ALTER COLUMN registration_slug SET DEFAULT lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  ALTER COLUMN registration_slug SET NOT NULL,
  ADD CONSTRAINT crm_companies_registration_slug_format CHECK (registration_slug ~ '^[a-z0-9]{12}$'),
  ADD CONSTRAINT crm_companies_registration_slug_key UNIQUE (registration_slug);

CREATE OR REPLACE FUNCTION crm_private.assign_new_user_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_meta jsonb;
  v_key_text text;
  v_key uuid;
  v_ref text;
BEGIN
  IF NEW.company_id IS NOT NULL OR NEW.is_admin THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(raw_user_meta_data, '{}'::jsonb)
  INTO v_meta
  FROM auth.users
  WHERE id = NEW.id;

  v_key_text := lower(btrim(COALESCE(v_meta ->> 'crm_company_key', '')));
  v_ref := upper(btrim(COALESCE(v_meta ->> 'referral_code', '')));

  IF v_key_text <> '' THEN
    IF v_key_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      v_key := v_key_text::uuid;
      SELECT c.id INTO NEW.company_id
      FROM public.crm_companies c
      WHERE c.registration_key = v_key
        AND c.status = 'active';
    ELSIF v_key_text ~ '^[a-z0-9]{12}$' THEN
      SELECT c.id INTO NEW.company_id
      FROM public.crm_companies c
      WHERE c.registration_slug = v_key_text
        AND c.status = 'active';
    ELSE
      RAISE EXCEPTION 'Invalid company registration link';
    END IF;

    IF NEW.company_id IS NULL THEN
      RAISE EXCEPTION 'Company registration link is invalid or inactive';
    END IF;
  ELSIF v_ref <> '' THEN
    SELECT u.company_id INTO NEW.company_id
    FROM public.users u
    WHERE u.referral_code = v_ref
    LIMIT 1;
  END IF;

  IF NEW.company_id IS NULL THEN
    SELECT c.id INTO NEW.company_id
    FROM public.crm_companies c
    WHERE c.is_default_registration
      AND c.status = 'active';
  END IF;

  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'No active registration company is configured';
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

CREATE OR REPLACE FUNCTION public.crm_admin_create_company(
  p_name text,
  p_code text,
  p_primary_ip text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company public.crm_companies%ROWTYPE;
  v_ip inet;
BEGIN
  PERFORM public.require_admin();
  IF NOT crm_private.is_platform_request() THEN RAISE EXCEPTION 'Platform network required to create a company'; END IF;
  IF length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Enter a company name'; END IF;
  IF upper(btrim(COALESCE(p_code, ''))) !~ '^[A-Z0-9_-]{2,24}$' THEN RAISE EXCEPTION 'Use a 2-24 character company code'; END IF;
  BEGIN v_ip := btrim(p_primary_ip)::inet; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Enter a valid primary IP address'; END;

  INSERT INTO public.crm_companies(name, code, created_by)
  VALUES (btrim(p_name), upper(btrim(p_code)), auth.uid())
  RETURNING * INTO v_company;

  INSERT INTO crm_private.admin_ip_allowlist(address, label, created_by, company_id, access_scope)
  VALUES (v_ip, v_company.name || ' primary network', auth.uid(), v_company.id, 'company');

  INSERT INTO public.admin_action_logs(admin_user_id, company_id, action, after_data, reason)
  VALUES (auth.uid(), v_company.id, 'crm_company_created',
    jsonb_build_object('company_id', v_company.id, 'code', v_company.code, 'primary_ip', host(v_ip)),
    'CRM company administration');

  RETURN jsonb_build_object(
    'id', v_company.id,
    'name', v_company.name,
    'code', v_company.code,
    'registration_key', v_company.registration_key,
    'registration_slug', v_company.registration_slug,
    'registration_path', '/signup/' || v_company.registration_slug
  );
END;
$$;

REVOKE ALL ON FUNCTION crm_private.assign_new_user_company() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_admin_list_companies() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_admin_create_company(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_admin_list_companies(), public.crm_admin_create_company(text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
