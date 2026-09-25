/* One-domain client registration routing.
   Primary uses /register. Every external company uses /signup/<opaque key>.
   The key is validated in the database and company assignment is immutable. */

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

  v_key_text := btrim(COALESCE(v_meta ->> 'crm_company_key', ''));
  v_ref := upper(btrim(COALESCE(v_meta ->> 'referral_code', '')));

  IF v_key_text <> '' THEN
    BEGIN
      v_key := v_key_text::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid company registration link';
    END;

    SELECT c.id INTO NEW.company_id
    FROM public.crm_companies c
    WHERE c.registration_key = v_key
      AND c.status = 'active';

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
      'registration_path', CASE
        WHEN c.is_default_registration THEN '/register'
        ELSE '/signup/' || c.registration_key::text
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
  IF NOT crm_private.is_platform_request() THEN
    RAISE EXCEPTION 'Platform network required to create a company';
  END IF;
  IF length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Enter a company name';
  END IF;
  IF upper(btrim(COALESCE(p_code, ''))) !~ '^[A-Z0-9_-]{2,24}$' THEN
    RAISE EXCEPTION 'Use a 2-24 character company code';
  END IF;
  BEGIN
    v_ip := btrim(p_primary_ip)::inet;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Enter a valid primary IP address';
  END;

  INSERT INTO public.crm_companies(name, code, created_by)
  VALUES (btrim(p_name), upper(btrim(p_code)), auth.uid())
  RETURNING * INTO v_company;

  INSERT INTO crm_private.admin_ip_allowlist(address, label, created_by, company_id, access_scope)
  VALUES (v_ip, v_company.name || ' primary network', auth.uid(), v_company.id, 'company');

  INSERT INTO public.admin_action_logs(admin_user_id, company_id, action, after_data, reason)
  VALUES (
    auth.uid(),
    v_company.id,
    'crm_company_created',
    jsonb_build_object('company_id', v_company.id, 'code', v_company.code, 'primary_ip', host(v_ip)),
    'CRM company administration'
  );

  RETURN jsonb_build_object(
    'id', v_company.id,
    'name', v_company.name,
    'code', v_company.code,
    'registration_key', v_company.registration_key,
    'registration_path', '/signup/' || v_company.registration_key::text
  );
END;
$$;

REVOKE ALL ON FUNCTION crm_private.assign_new_user_company() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_admin_list_companies() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_admin_create_company(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_admin_list_companies(), public.crm_admin_create_company(text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
