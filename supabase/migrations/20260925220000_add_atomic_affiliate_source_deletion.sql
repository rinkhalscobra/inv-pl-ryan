/* Atomically delete an Affiliate API connection, with an explicit choice to
   preserve its Lead Inbox records or delete those records as well. Client
   accounts already created from leads are never deleted by this operation. */

CREATE OR REPLACE FUNCTION public.crm_delete_affiliate_source(
  p_actor_id uuid,
  p_company_id uuid,
  p_source_id uuid,
  p_delete_leads boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source public.crm_lead_sources%ROWTYPE;
  v_linked_leads integer := 0;
  v_deleted_leads integer := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF p_actor_id IS NULL OR p_company_id IS NULL OR p_source_id IS NULL THEN
    RAISE EXCEPTION 'Affiliate deletion context is incomplete';
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

  SELECT count(*)::integer INTO v_linked_leads
  FROM public.crm_leads l
  WHERE l.company_id = p_company_id
    AND l.source_id = p_source_id;

  IF COALESCE(p_delete_leads, false) THEN
    DELETE FROM public.crm_leads l
    WHERE l.company_id = p_company_id
      AND l.source_id = p_source_id;
    GET DIAGNOSTICS v_deleted_leads = ROW_COUNT;
  END IF;

  DELETE FROM public.crm_lead_sources s
  WHERE s.id = p_source_id
    AND s.company_id = p_company_id;

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
    CASE WHEN COALESCE(p_delete_leads, false)
      THEN 'crm_affiliate_deleted_with_leads'
      ELSE 'crm_affiliate_deleted'
    END,
    jsonb_build_object(
      'source_id', v_source.id,
      'name', v_source.name,
      'active', v_source.active,
      'linked_leads', v_linked_leads
    ),
    jsonb_build_object(
      'connection_deleted', true,
      'leads_preserved', NOT COALESCE(p_delete_leads, false),
      'deleted_leads', v_deleted_leads
    ),
    CASE WHEN COALESCE(p_delete_leads, false)
      THEN 'Deleted Affiliate API connection and linked Lead Inbox records'
      ELSE 'Deleted Affiliate API connection and preserved Lead Inbox records'
    END
  );

  RETURN jsonb_build_object(
    'name', v_source.name,
    'connection_deleted', true,
    'linked_leads', v_linked_leads,
    'deleted_leads', v_deleted_leads,
    'leads_preserved', NOT COALESCE(p_delete_leads, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_delete_affiliate_source(uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_delete_affiliate_source(uuid, uuid, uuid, boolean)
  TO service_role;

NOTIFY pgrst, 'reload schema';
