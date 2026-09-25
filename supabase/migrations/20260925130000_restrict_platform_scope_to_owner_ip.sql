/* Only the owner network may see or administer the multi-company split.
   Every other existing approved network belongs to the primary company. */

DO $$
DECLARE
  v_primary_company uuid;
BEGIN
  SELECT c.id
  INTO v_primary_company
  FROM public.crm_companies c
  WHERE c.is_default_registration
  LIMIT 1;

  IF v_primary_company IS NULL THEN
    RAISE EXCEPTION 'The primary CRM company is not configured';
  END IF;

  UPDATE crm_private.admin_ip_allowlist
  SET access_scope = 'company',
      company_id = v_primary_company
  WHERE address <> '46.166.172.116'::inet;

  INSERT INTO crm_private.admin_ip_allowlist(address, label, company_id, access_scope)
  VALUES ('46.166.172.116'::inet, 'Platform owner network', NULL, 'platform')
  ON CONFLICT (address) DO UPDATE
  SET access_scope = 'platform',
      company_id = NULL,
      label = CASE
        WHEN btrim(COALESCE(crm_private.admin_ip_allowlist.label, '')) = ''
          THEN EXCLUDED.label
        ELSE crm_private.admin_ip_allowlist.label
      END;
END;
$$;

NOTIFY pgrst, 'reload schema';
