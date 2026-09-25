/* Sales dispositions are deliberately separate from the technical account
   lifecycle (new/inviting/registered/existing). */
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS disposition_status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS disposition_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS disposition_changed_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_disposition_status_check,
  ADD CONSTRAINT crm_leads_disposition_status_check CHECK (
    disposition_status IN ('new','no_answer','call_back','low_potential','no_money','wrong_number','ftd')
  );

CREATE INDEX IF NOT EXISTS crm_leads_company_disposition_created_idx
  ON public.crm_leads(company_id, disposition_status, created_at DESC);

CREATE OR REPLACE FUNCTION public.crm_set_lead_disposition_for_actor(
  p_actor_id uuid,
  p_lead_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_previous text;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_status NOT IN ('new','no_answer','call_back','low_potential','no_money','wrong_number','ftd') THEN
    RAISE EXCEPTION 'Select a valid lead status';
  END IF;
  IF NOT public.crm_actor_can_manage_lead(p_actor_id,p_lead_id,NULL) THEN
    RAISE EXCEPTION 'This lead is outside your CRM scope';
  END IF;

  SELECT disposition_status INTO v_previous
  FROM public.crm_leads WHERE id=p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select a valid lead'; END IF;

  UPDATE public.crm_leads
  SET disposition_status=p_status,
      disposition_changed_at=now(),
      disposition_changed_by=p_actor_id
  WHERE id=p_lead_id;

  IF v_previous IS DISTINCT FROM p_status THEN
    INSERT INTO public.admin_action_logs(admin_user_id,action,before_data,after_data,reason)
    VALUES(
      p_actor_id,
      'crm_lead_disposition_changed',
      jsonb_build_object('lead_id',p_lead_id,'status',v_previous),
      jsonb_build_object('lead_id',p_lead_id,'status',p_status),
      'Updated CRM lead sales status'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_set_lead_disposition_for_actor(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_set_lead_disposition_for_actor(uuid,uuid,text) TO service_role;

NOTIFY pgrst,'reload schema';
