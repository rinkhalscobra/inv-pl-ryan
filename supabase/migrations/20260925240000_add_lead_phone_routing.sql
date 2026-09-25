/* Validate incoming international phone numbers and route leads through the
   existing company -> Office -> Desk Manager hierarchy. */
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS phone_country_code text,
  ADD COLUMN IF NOT EXISTS phone_calling_code text,
  ADD COLUMN IF NOT EXISTS phone_validation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS phone_validation_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone_routing_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS phone_routed_at timestamptz;

ALTER TABLE public.crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_phone_validation_status_check,
  ADD CONSTRAINT crm_leads_phone_validation_status_check
    CHECK (phone_validation_status IN ('pending','valid','invalid','unsupported','missing')),
  DROP CONSTRAINT IF EXISTS crm_leads_phone_routing_status_check,
  ADD CONSTRAINT crm_leads_phone_routing_status_check
    CHECK (phone_routing_status IN ('pending','routed','no_office','no_desk_manager','invalid','manual')),
  DROP CONSTRAINT IF EXISTS crm_leads_phone_country_code_check,
  ADD CONSTRAINT crm_leads_phone_country_code_check
    CHECK (phone_country_code IS NULL OR phone_country_code ~ '^[A-Z]{2}$'),
  DROP CONSTRAINT IF EXISTS crm_leads_phone_calling_code_check,
  ADD CONSTRAINT crm_leads_phone_calling_code_check
    CHECK (phone_calling_code IS NULL OR phone_calling_code ~ '^[0-9]{1,3}$');

CREATE INDEX IF NOT EXISTS crm_leads_company_phone_validation_idx
  ON public.crm_leads(company_id, phone_validation_status, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_leads_company_phone_routing_idx
  ON public.crm_leads(company_id, phone_routing_status, created_at DESC);

/* Desk Managers receive the raw leads routed to their own Office. Workflow
   Managers retain workspace-wide access, and selected Agents must always be in
   the same company and Office as the lead. */
CREATE OR REPLACE FUNCTION public.crm_actor_can_manage_lead(
  p_actor_id uuid,
  p_lead_id uuid,
  p_agent_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_role text := crm_private.actor_role_for(p_actor_id);
  v_actor_company uuid;
  v_actor_office uuid;
  v_lead_company uuid;
  v_lead_office uuid;
BEGIN
  SELECT company_id, office_id INTO v_actor_company, v_actor_office
  FROM public.users WHERE id=p_actor_id;
  SELECT company_id, office_id INTO v_lead_company, v_lead_office
  FROM public.crm_leads WHERE id=p_lead_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_role='admin' THEN RETURN true; END IF;
  IF v_actor_company IS DISTINCT FROM v_lead_company THEN RETURN false; END IF;
  IF v_role='desk_manager' AND (v_actor_office IS NULL OR v_actor_office IS DISTINCT FROM v_lead_office) THEN
    RETURN false;
  END IF;
  IF v_role NOT IN ('workflow_manager','desk_manager') THEN RETURN false; END IF;
  IF p_agent_id IS NULL THEN RETURN true; END IF;

  RETURN EXISTS(
    SELECT 1
    FROM public.users u
    WHERE u.id=p_agent_id
      AND u.company_id=v_lead_company
      AND u.office_id IS NOT DISTINCT FROM v_lead_office
      AND crm_private.actor_role_for(u.id)='agent'
  );
END;
$$;

/* A manual Office correction remains explicit and is not overwritten until an
   administrator intentionally runs phone reprocessing. */
CREATE OR REPLACE FUNCTION public.crm_set_lead_office_for_actor(
  p_actor_id uuid,
  p_lead_id uuid,
  p_office_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_role text := crm_private.actor_role_for(p_actor_id);
  v_current uuid;
  v_company uuid;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF v_role NOT IN ('admin','workflow_manager') THEN RAISE EXCEPTION 'Lead management access required'; END IF;
  SELECT company_id INTO v_company FROM public.crm_leads WHERE id=p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select a valid lead'; END IF;
  IF p_office_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.crm_offices
    WHERE id=p_office_id AND company_id=v_company AND status='active'
  ) THEN RAISE EXCEPTION 'Select an active Office in the lead company'; END IF;
  SELECT office_id INTO v_current FROM public.crm_leads WHERE id=p_lead_id AND status='new' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select a new lead'; END IF;

  UPDATE public.crm_leads
  SET office_id=p_office_id,
      phone_routing_status='manual',
      phone_routed_at=now()
  WHERE id=p_lead_id;
  INSERT INTO public.admin_action_logs(admin_user_id,action,before_data,after_data,reason)
  VALUES(
    p_actor_id,
    'crm_lead_office_changed',
    jsonb_build_object('lead_id',p_lead_id,'office_id',v_current),
    jsonb_build_object('lead_id',p_lead_id,'office_id',p_office_id,'routing','manual'),
    'CRM lead Office classification'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_actor_can_manage_lead(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.crm_set_lead_office_for_actor(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_actor_can_manage_lead(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_set_lead_office_for_actor(uuid,uuid,uuid) TO service_role;

NOTIFY pgrst,'reload schema';
