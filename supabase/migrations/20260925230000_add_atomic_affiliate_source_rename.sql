/* Rename an Affiliate API connection and keep its denormalized Lead Inbox
   source labels consistent. The API key, status, and client accounts are not
   changed. */

CREATE OR REPLACE FUNCTION public.crm_rename_affiliate_source(
  p_actor_id uuid,
  p_company_id uuid,
  p_source_id uuid,
  p_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source public.crm_lead_sources%ROWTYPE;
  v_name text := btrim(COALESCE(p_name, ''));
  v_updated_leads integer := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF p_actor_id IS NULL OR p_company_id IS NULL OR p_source_id IS NULL THEN
    RAISE EXCEPTION 'Affiliate rename context is incomplete';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Enter an affiliate name up to 100 characters';
  END IF;

  SELECT s.* INTO v_source
  FROM public.crm_lead_sources s
  WHERE s.id = p_source_id
    AND s.company_id = p_company_id
    AND s.kind = 'affiliate_api'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Affiliate connection not found';
  END IF;

  IF v_source.name = v_name THEN
    RETURN jsonb_build_object(
      'source_id', v_source.id,
      'old_name', v_source.name,
      'name', v_source.name,
      'updated_leads', 0,
      'changed', false
    );
  END IF;

  UPDATE public.crm_lead_sources s
  SET name = v_name
  WHERE s.id = v_source.id
    AND s.company_id = p_company_id;

  UPDATE public.crm_leads l
  SET source_name = v_name
  WHERE l.company_id = p_company_id
    AND l.source_id = v_source.id;
  GET DIAGNOSTICS v_updated_leads = ROW_COUNT;

  INSERT INTO public.admin_action_logs(
    admin_user_id,
    company_id,
    action,
    before_data,
    after_data,
    reason
  ) VALUES (
    p_actor_id,
    p_company_id,
    'crm_affiliate_renamed',
    jsonb_build_object('source_id', v_source.id, 'name', v_source.name),
    jsonb_build_object('source_id', v_source.id, 'name', v_name, 'updated_leads', v_updated_leads),
    'Renamed Affiliate API connection'
  );

  RETURN jsonb_build_object(
    'source_id', v_source.id,
    'old_name', v_source.name,
    'name', v_name,
    'updated_leads', v_updated_leads,
    'changed', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_rename_affiliate_source(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_rename_affiliate_source(uuid, uuid, uuid, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
