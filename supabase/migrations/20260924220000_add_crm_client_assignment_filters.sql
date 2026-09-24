/* Expose authoritative registration-source metadata for CRM hierarchy filters.
   Imported clients prefer their linked Lead Inbox source; direct/manual clients
   fall back to the completed onboarding event that created their account. */
CREATE OR REPLACE FUNCTION public.crm_admin_get_hierarchy()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN jsonb_build_object(
    'offices',COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.name) FROM public.crm_offices o),'[]'::jsonb),
    'people',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',u.id,'email',u.email,'first_name',u.first_name,'last_name',u.last_name,'created_at',u.created_at,
      'is_promoted',u.is_promoted,'office_id',u.office_id,'office_name',o.name,'office_code',o.code,
      'registration_source_key',CASE
        WHEN lead.source_id IS NOT NULL THEN 'lead:'||lead.source_id::text
        WHEN lead.source_name IS NOT NULL THEN 'lead-name:'||lead.source_name
        WHEN onboarding.source IS NOT NULL THEN 'onboarding:'||onboarding.source
        ELSE 'unknown' END,
      'registration_source_name',COALESCE(NULLIF(lead.source_name,''),CASE onboarding.source
        WHEN 'website_signup' THEN 'Website signup'
        WHEN 'crm_create_user' THEN 'CRM manual'
        WHEN 'lead_inbox' THEN 'Lead Inbox'
        WHEN 'auth' THEN 'Direct signup'
        ELSE initcap(replace(COALESCE(onboarding.source,'Unknown'),'_',' ')) END),
      'registration_source_kind',COALESCE(lead.source_kind,onboarding.source,'unknown'),
      'role',CASE WHEN u.is_admin THEN 'admin' ELSE COALESCE(s.role,'client') END
    ) ORDER BY u.created_at DESC)
      FROM public.users u
      LEFT JOIN public.crm_staff_roles s ON s.user_id=u.id
      LEFT JOIN public.crm_offices o ON o.id=u.office_id
      LEFT JOIN LATERAL (
        SELECT l.source_id,l.source_name,l.source_kind
        FROM public.crm_leads l
        WHERE l.registered_user_id=u.id
        ORDER BY l.invited_at DESC NULLS LAST,l.created_at DESC
        LIMIT 1
      ) lead ON true
      LEFT JOIN LATERAL (
        SELECT e.source
        FROM public.client_onboarding_events e
        WHERE e.auth_user_id=u.id AND e.status='completed'
        ORDER BY e.created_at DESC
        LIMIT 1
      ) onboarding ON true
    ),'[]'::jsonb),
    'workflow_desk_assignments',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.crm_workflow_desk_assignments x),'[]'::jsonb),
    'agent_desk_assignments',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.crm_agent_desk_assignments x),'[]'::jsonb),
    'retention_assignments',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.crm_retention_manager_assignments x),'[]'::jsonb),
    'client_assignments',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.crm_client_agent_assignments x),'[]'::jsonb),
    'retention_client_assignments',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.crm_client_retention_assignments x),'[]'::jsonb));
END;
$$;

NOTIFY pgrst,'reload schema';
