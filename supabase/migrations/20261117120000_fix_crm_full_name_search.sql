/* Add full-name matching inside the existing search predicate. Company,
   assignment, account-role and KYC filters remain in their original positions. */
DO $migration$
DECLARE v_signature text; v_alias text; v_needle text; v_definition text; v_full_name text;
BEGIN
  FOR v_signature,v_alias,v_needle IN SELECT * FROM (VALUES
    ('admin_get_users(text,integer,integer,text,uuid)','u',
      'OR COALESCE(u.first_name,'''') ILIKE ''%''||btrim(p_search)||''%'''),
    ('crm_staff_get_scope(text)','client',
      'OR COALESCE(client.first_name, '''') ILIKE ''%'' || btrim(p_search) || ''%'''),
    ('crm_staff_get_scope_unscoped(text)','u',
      'OR COALESCE(u.first_name,'''') ILIKE ''%''||btrim(p_search)||''%''')
  ) AS targets(signature,alias,needle)
  LOOP
    SELECT pg_get_functiondef(('public.'||v_signature)::regprocedure) INTO v_definition;
    IF position(v_needle IN v_definition)=0 THEN
      RAISE EXCEPTION 'Unexpected CRM search predicate: %',v_signature;
    END IF;
    v_full_name:=format($clause$
        OR regexp_replace(btrim(concat_ws(' ',%1$s.first_name,%1$s.last_name)), '[[:space:]]+', ' ', 'g')
          ILIKE '%%'||regexp_replace(btrim(p_search), '[[:space:]]+', ' ', 'g')||'%%'
        OR regexp_replace(btrim(concat_ws(' ',%1$s.last_name,%1$s.first_name)), '[[:space:]]+', ' ', 'g')
          ILIKE '%%'||regexp_replace(btrim(p_search), '[[:space:]]+', ' ', 'g')||'%%'
    $clause$,v_alias);
    EXECUTE replace(v_definition,v_needle,v_needle||v_full_name);
  END LOOP;
END;
$migration$;
