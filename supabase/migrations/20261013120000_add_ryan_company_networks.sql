/* Add Ryan's additional administrator networks without granting platform or
   cross-company access. Resolve the tenant from Ryan's existing primary IP so
   this remains correct if the company display name changes. */

DO $$
DECLARE
  v_ryan_company_id uuid;
  v_conflicting_ips text;
BEGIN
  SELECT a.company_id
  INTO v_ryan_company_id
  FROM crm_private.admin_ip_allowlist a
  WHERE a.address = '176.65.136.41'::inet
    AND a.access_scope = 'company';

  IF v_ryan_company_id IS NULL THEN
    RAISE EXCEPTION 'Ryan company could not be resolved from primary IP 176.65.136.41';
  END IF;

  SELECT string_agg(host(a.address), ', ' ORDER BY a.address)
  INTO v_conflicting_ips
  FROM crm_private.admin_ip_allowlist a
  WHERE a.address = ANY (ARRAY[
      '85.206.173.103'::inet,
      '85.206.173.105'::inet,
      '85.206.173.107'::inet,
      '85.206.173.114'::inet,
      '85.206.173.115'::inet
    ]::inet[])
    AND (
      a.access_scope <> 'company'
      OR a.company_id IS DISTINCT FROM v_ryan_company_id
    );

  IF v_conflicting_ips IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing to reassign IP(s) already owned by another scope/company: %', v_conflicting_ips;
  END IF;

  INSERT INTO crm_private.admin_ip_allowlist (
    address,
    label,
    company_id,
    access_scope
  )
  SELECT
    address,
    'Ryan company network',
    v_ryan_company_id,
    'company'
  FROM unnest(ARRAY[
    '85.206.173.103'::inet,
    '85.206.173.105'::inet,
    '85.206.173.107'::inet,
    '85.206.173.114'::inet,
    '85.206.173.115'::inet
  ]::inet[]) AS requested(address)
  ON CONFLICT (address) DO NOTHING;

  IF (
    SELECT count(*)
    FROM crm_private.admin_ip_allowlist a
    WHERE a.address = ANY (ARRAY[
        '85.206.173.103'::inet,
        '85.206.173.105'::inet,
        '85.206.173.107'::inet,
        '85.206.173.114'::inet,
        '85.206.173.115'::inet
      ]::inet[])
      AND a.access_scope = 'company'
      AND a.company_id = v_ryan_company_id
  ) <> 5 THEN
    RAISE EXCEPTION 'Ryan network allowlist verification failed';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
